// culm (Sough) — a sparse grove of thick bamboo canes crossing the frame:
// broad near-vertical columns at hash-jittered spacing, divided by swollen node
// rings, with small leaf strokes near the tops. The canes stay near-black at
// rest; a gust front sweeps across the grove cane by cane, and each struck cane
// answers from the ground up — a sparkle of node glints climbs it joint by
// joint (lowest ring flaring first, the run rising to the leafy tip) while the
// stiff upper internodes bow with a quick elastic overshoot. Light travels UP
// the plant rather than across the field. Between fronts the grove is the
// stillest, darkest field in the family.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_gustRate;   // how often gust fronts cross the grove   (default 0.35)
uniform float u_bend;       // tip throw + glint-run brightness        (default 0.8)
uniform float u_spacing;    // css-px between canes (×u_pixelRatio)     (default 48)
uniform float u_nodeGlow;   // node-ring glint brightness              (default 1)

const vec3  BG          = vec3(0.028, 0.030, 0.044); // near-black base
const int   CANES       = 11;     // max canes considered per layer (literal loop bound)
const int   NODES       = 9;      // node rings per cane (literal loop bound)
const int   LAYERS      = 3;      // depth-layered receding rows (literal loop bound)

// hash helpers (no textures)
float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized vertical 0 at ground, 1 at top of frame
  float yN  = fc.y / max(res.y, 1.0);

  vec3 col = BG;

  // Palette with house fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 8.0) * refScale * pr;       // css-px cane spacing
  float gust    = max(u_gustRate, 0.0001);

  // gust front: a coherent disturbance travels horizontally across the grove.
  // frontX sweeps left->right across the field; each cane fires when the front
  // reaches its x. Long becalmed quiet between fronts (gate is sparse in time).
  float sweepDur = 3.4;                            // seconds for a front to cross
  float cycle    = sweepDur / gust;                // calm + sweep period
  float phase    = t / max(cycle, 0.001);
  float frontId  = floor(phase);                   // which gust front
  float frontF   = fract(phase);                   // 0..1 progress of this front
  // front position across the field in px; only "active" during first chunk so
  // the rest of the cycle is becalmed quiet.
  float activeFrac = sweepDur / max(cycle, 0.001); // fraction of cycle that sweeps
  float frontX = frontF / max(activeFrac, 0.001);  // 0..1 sweep coordinate (>1 = calm)

  float fieldW = res.x;
  // cross-section light direction for cylindrical shading: from the upper-left
  // and slightly toward the viewer (z = depth). Gives each cane a rounded lit
  // flank, a bright specular stripe and dark turning edges — real 3D volume.
  vec2 Lc = normalize(vec2(-0.55, 0.83));

  // faint dusk sky + horizon haze behind the bed so it reads with atmosphere
  vec3 skyCol = mix(c0, c1, 0.5);
  col += skyCol * smoothstep(0.0, 0.9, yN) * 0.03;

  // ---- depth-layered reed bed: receding rows, far -> near -------------------
  for (int L = 0; L < LAYERS; L++) {
    float fl  = float(L) / float(LAYERS - 1);          // 0 far .. 1 near
    float dim = mix(0.5, 1.0, fl);                     // far rows dimmer
    float widthScale = mix(0.5, 1.05, fl);             // far canes thinner
    float rootYN = mix(0.30, -0.06, fl);               // far rooted higher (recede)
    float topYN  = mix(0.66, 1.06, fl);                // far canes shorter
    float spacingL = max(spacing * mix(0.62, 1.0, fl), 6.0); // far rows denser
    // far rows haze toward the cool sky for aerial perspective
    float haze = (1.0 - fl) * 0.5;

    float wantN = clamp(floor(fieldW / spacingL), 6.0, float(CANES));
    float gap   = fieldW / wantN;

    for (int i = 0; i < CANES; i++) {
      float fi = float(i);
      if (fi > wantN - 0.5) continue;
      float seedBase = fi * 3.17 + 11.0 + fl * 53.0;   // layer-unique seeds
      float jitter = (hash11(seedBase) - 0.5) * gap * 0.4;
      float caneX  = (fi + 0.5) * gap + jitter;
      float halfW  = spacingL * (0.20 + 0.08 * hash11(fi * 1.7 + 4.0 + fl * 7.0)) * widthScale;

      // --- gust excitation (front sweeps across) ---
      float caneXN = caneX / max(fieldW, 1.0);
      float dx     = frontX - caneXN;
      float strike = exp(-pow(max(dx, 0.0) * 5.5, 2.0)) * step(0.0, dx) * step(frontX, 1.2);
      float lone   = step(0.90, hash11(fi * 5.3 + frontId * 1.0 + fl * 3.0))
                   * (0.5 + 0.5 * sin(t * 2.1 + fi)) * 0.18;
      float idle   = (0.5 + 0.5 * sin(t * 0.5 + fi * 1.7 + fl * 2.0)) * 0.05;
      float exc    = clamp(strike + lone + idle, 0.0, 1.2);

      // --- stiff bow ---
      float caneSeed = hash11(fi * 2.9 + 1.0 + fl * 4.0);
      float bowDir   = (caneSeed > 0.5) ? 1.0 : -1.0;
      float since    = max(dx, 0.0);
      float osc      = sin(since * 22.0) * exp(-since * 6.0);
      float bowAmt   = exc * u_bend * (0.6 + 0.4 * osc) * bowDir;

      // along the cane: 0 at root, 1 at tip (perspective-correct span)
      float spanYN = max(topYN - rootYN, 0.05);
      float along  = (yN - rootYN) / spanYN;
      float inSpan = step(0.0, along) * step(along, 1.0);

      // bow grows with along^2 (stiff base, flexible top)
      float bowPx = bowAmt * along * along * spacingL * 0.9;
      float cx  = caneX + bowPx;
      float dxc = fc.x - cx;

      // --- cylindrical shading across the cane ---
      float u  = clamp(dxc / max(halfW, 1.0), -1.0, 1.0);
      float nz = sqrt(max(1.0 - u * u, 0.0));
      vec2  Ncs = vec2(u, nz);
      float diff = clamp(dot(Ncs, Lc), 0.0, 1.0);
      float spec = pow(diff, 9.0);
      float shade = 0.16 + 0.70 * diff + 0.95 * spec;   // ambient + diffuse + spec stripe

      // body mask: soft edges + tip rounding + span clamp
      float edge   = smoothstep(halfW + pr * 1.4, halfW - pr * 0.6, abs(dxc));
      float tipRound = smoothstep(1.02, 0.86, along);
      float body   = edge * tipRound * inSpan;

      // cane colour: blend of adjacent palette colours; glints from opposite pair
      float caneHue = hash11(fi * 4.1 + 7.0 + fl * 9.0) * 4.0;
      float aw0 = wheelW(caneHue, 0.0), aw1 = wheelW(caneHue, 1.0);
      float aw2 = wheelW(caneHue, 2.0), aw3 = wheelW(caneHue, 3.0);
      vec3  caneCol = (c0*aw0 + c1*aw1 + c2*aw2 + c3*aw3) / max(aw0+aw1+aw2+aw3, 0.001);
      float glintHue = mod(caneHue + 2.0, 4.0);
      float gw0 = wheelW(glintHue, 0.0), gw1 = wheelW(glintHue, 1.0);
      float gw2 = wheelW(glintHue, 2.0), gw3 = wheelW(glintHue, 3.0);
      vec3  glintCol = (c0*gw0 + c1*gw1 + c2*gw2 + c3*gw3) / max(gw0+gw1+gw2+gw3, 0.001);

      // the lit 3D cane body — painted OVER farther canes (mix = occlusion) so the
      // bed reads with depth, not additively-transparent flat strips.
      vec3 bodyCol = mix(caneCol, skyCol, haze) * shade * (0.85 + 0.5 * exc) * dim;
      col = mix(col, bodyCol, body * 0.92);

      // --- node-ring glints climbing joint by joint (perspective-scaled) ---
      float climb = clamp(since * 3.2, 0.0, 1.3);
      float echo  = clamp((since - 0.42) * 2.6, 0.0, 1.0);
      float glow = 0.0;
      for (int n = 0; n < NODES; n++) {
        float fn  = float(n);
        float nyN = rootYN + ((fn + 0.5) / float(NODES)) * spanYN; // node height (perspective)
        if (nyN < -0.02 || nyN > 1.04) continue;
        float nbow = bowAmt * ((nyN - rootYN) / spanYN) * ((nyN - rootYN) / spanYN) * spacingL * 0.9;
        float ncx  = caneX + nbow;
        vec2  d    = vec2(fc.x - ncx, (fc.y - nyN * res.y));
        // crisp swollen ring band (sharper than before)
        float ringD = length(d * vec2(0.62, 2.2) / max(halfW, 1.0));
        float ringMask = exp(-ringD * ringD * 3.4);
        float lit  = exp(-pow((climb - (nyN - rootYN) / spanYN) * 4.5, 2.0));
        float litE = exp(-pow((echo - (1.0 - (nyN - rootYN) / spanYN)) * 4.5, 2.0)) * 0.5;
        float rest = 0.32 + 0.10 * sin(t * 0.6 + fn * 1.3 + fi);
        glow += ringMask * ((lit + litE) * exc + rest);
      }
      col += glintCol * glow * u_nodeGlow * (0.55 + 0.55 * u_bend) * dim * 1.05 * inSpan;

      // --- sparse leaf strokes near the top ---
      float leafSeed = hash11(fi * 6.7 + 2.0 + fl * 6.0);
      float leafYN   = rootYN + spanYN * (0.80 + 0.12 * leafSeed);
      float leafSide = (hash11(fi*8.1+3.0+fl*5.0) > 0.5) ? 1.0 : -1.0;
      float lbow     = bowAmt * 0.7 * spacingL * 0.9;
      vec2  lp       = vec2(fc.x - (caneX + lbow + leafSide * halfW * 1.6),
                            fc.y - leafYN * res.y);
      float blade    = exp(-pow((lp.x - leafSide * lp.y * 0.5) / (halfW*0.9), 2.0))
                     * exp(-pow(lp.y / (spacingL*0.9), 2.0));
      col += glintCol * blade * (0.06 + 0.55 * exc) * u_nodeGlow * dim * 0.7;
    }
  }

  // gentle vignette to keep the frame composed and edges dark
  vec2 uvc = (fc - res*0.5) / res;
  float vign = 1.0 - smoothstep(0.42, 0.95, length(uvc * vec2(1.0, 0.9)));
  col *= mix(0.72, 1.0, vign);

  // subtle ground darkening / sky-lift so the grove reads as rooted
  col *= mix(0.85, 1.06, smoothstep(0.0, 0.6, yN));

  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
