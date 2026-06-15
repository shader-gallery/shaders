// culm (Sough) — a grove of thick, round bamboo canes crossing the frame in
// three depth-layered rows that recede and haze back. Each cane is cylinder-
// shaded (lit flank, specular stripe, dark turning edges) and divided by crisp
// swollen node rings, with small leaf strokes near the tops. A calm, continuous
// wind travels through the grove as a smooth traveling wave — the canes lean and
// breathe without ever freezing — and light runs steadily UP each cane, a
// sparkle of node glints climbing joint by joint to the leafy tip. The grove is
// the family's darkest, stillest field, but it is never dead: the wind only ever
// swells and eases.
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
uniform float u_windSpeed;    // how fast the wind wave travels        (default 0.45)
uniform float u_windStrength; // how far the canes lean & sway         (default 0.7)
uniform float u_spacing;      // css-px between canes (nearest row)     (default 42)
uniform float u_crowding;     // density bias (>1 packs canes tighter)  (default 1.0)
uniform float u_thickness;    // cane width multiplier                  (default 1.0)
uniform float u_nodeGlow;     // node-ring glint brightness             (default 1.0)
uniform float u_glintClimb;   // brightness of the climbing glint run   (default 1.0)
uniform float u_depth;        // receding dim/thin/haze (depth of field)(default 1.0)
uniform float u_hueSpread;    // cane-to-cane colour variation          (default 1.0)
uniform float u_specular;     // cylindrical sheen intensity            (default 1.0)
uniform float u_leaf;         // leaf-stroke amount near the tops       (default 1.0)
uniform float u_mist;         // ground mist / atmosphere               (default 0.5)
uniform float u_distortion;   // wind shimmer ripple on the canes       (default 0.2)

const vec3  BG          = vec3(0.028, 0.030, 0.044); // near-black base
const int   CANES       = 12;     // max canes considered per layer (literal loop bound)
const int   NODES       = 9;      // node rings per cane (literal loop bound)
const int   LAYERS      = 3;      // depth-layered receding rows (literal loop bound)

// hash helpers (no textures)
float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// smooth traveling wind across the grove: two low-frequency components so it
// never repeats too cleanly; values in roughly -1..1.
float windWave(float xN, float t, float sp) {
  float a = sin(xN * 6.2831 * 1.4 - t * sp * 1.6);
  float b = sin(xN * 6.2831 * 0.7 - t * sp * 0.9 + 1.7);
  return 0.62 * a + 0.38 * b;
}

// slow gust-breathing envelope on amplitude/brightness: swells and eases between
// ~0.3 and 1.0, never reaching zero (no dead-calm freeze).
float windEnv(float xN, float t, float sp) {
  float s = 0.5 + 0.5 * sin(t * sp * 0.4 - xN * 3.0);
  return 0.34 + 0.66 * s;
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
  float spacing = max(u_spacing / max(u_crowding, 0.3), 8.0) * refScale * pr; // css-px cane spacing
  float windSp  = max(u_windSpeed, 0.0001);

  float fieldW = res.x;
  // cross-section light direction for cylindrical shading: from the upper-left
  // and slightly toward the viewer. Gives each cane a rounded lit flank, a bright
  // specular stripe and dark turning edges — real 3D volume.
  vec2 Lc = normalize(vec2(-0.55, 0.83));

  // faint dusk sky + horizon haze behind the bed so it reads with atmosphere
  vec3 skyCol = mix(c0, c1, 0.5);
  col += skyCol * smoothstep(0.0, 0.9, yN) * 0.03;

  // ---- depth-layered reed bed: receding rows, far -> near -------------------
  for (int L = 0; L < LAYERS; L++) {
    float fl  = float(L) / float(LAYERS - 1);          // 0 far .. 1 near
    float dim = mix(mix(1.0, 0.42, u_depth), 1.0, fl); // far rows dimmer (depth)
    float widthScale = mix(mix(1.0, 0.46, u_depth), 1.05, fl); // far canes thinner
    float rootYN = mix(0.30, -0.06, fl);               // far rooted higher (recede)
    float topYN  = mix(0.66, 1.06, fl);                // far canes shorter
    float spacingL = max(spacing * mix(0.62, 1.0, fl), 6.0); // far rows denser
    // far rows haze toward the cool sky for aerial perspective
    float haze = (1.0 - fl) * 0.5 * u_depth;

    float wantN = clamp(floor(fieldW / spacingL), 6.0, float(CANES));
    float gap   = fieldW / wantN;

    for (int i = 0; i < CANES; i++) {
      float fi = float(i);
      if (fi > wantN - 0.5) continue;
      float seedBase = fi * 3.17 + 11.0 + fl * 53.0;   // layer-unique seeds
      float jitter = (hash11(seedBase) - 0.5) * gap * 0.4;
      float caneX  = (fi + 0.5) * gap + jitter;
      float halfW  = spacingL * (0.20 + 0.08 * hash11(fi * 1.7 + 4.0 + fl * 7.0))
                   * widthScale * u_thickness;

      // --- calm continuous wind excitation ---
      float caneXN = caneX / max(fieldW, 1.0);
      float wave   = windWave(caneXN, t, windSp);
      float env    = windEnv(caneXN, t, windSp);
      float caneSeed = hash11(fi * 2.9 + 1.0 + fl * 4.0);
      float stiff  = 0.7 + 0.6 * caneSeed;             // per-cane wind response
      // excitation drives glow brightness; stays alive (floor 0.22), brightens on
      // wind crests — continuous swell, never a freeze.
      float exc    = clamp(0.22 + 0.7 * env * (0.5 + 0.5 * wave), 0.0, 1.2);

      // --- elastic lean: coherent wind push + per-cane spring overshoot ---
      float spring = 1.0 + 0.18 * sin(t * (2.4 + caneSeed) + fi);
      float bowAmt = wave * env * u_windStrength * stiff * spring;

      // along the cane: 0 at root, 1 at tip (perspective-correct span)
      float spanYN = max(topYN - rootYN, 0.05);
      float along  = (yN - rootYN) / spanYN;
      float inSpan = step(0.0, along) * step(along, 1.0);

      // bow grows with along^2 (stiff base, flexible top)
      float bowPx = bowAmt * along * along * spacingL * 0.9;
      // wind shimmer: a subtle vertical ripple on the cane column
      float shimmer = u_distortion * sin(fc.y * 0.045 - t * 1.6 + caneX * 0.03)
                    * spacingL * 0.10 * env;
      float cx  = caneX + bowPx + shimmer;
      float dxc = fc.x - cx;

      // --- cylindrical shading across the cane ---
      float u  = clamp(dxc / max(halfW, 1.0), -1.0, 1.0);
      float nz = sqrt(max(1.0 - u * u, 0.0));
      vec2  Ncs = vec2(u, nz);
      float diff = clamp(dot(Ncs, Lc), 0.0, 1.0);
      float spec = pow(diff, 9.0) * u_specular;
      float shade = 0.16 + 0.70 * diff + 0.95 * spec;   // ambient + diffuse + spec stripe

      // body mask: soft edges + tip rounding + span clamp
      float edge   = smoothstep(halfW + pr * 1.4, halfW - pr * 0.6, abs(dxc));
      float tipRound = smoothstep(1.02, 0.86, along);
      float body   = edge * tipRound * inSpan;

      // cane colour: blend of adjacent palette colours; glints from opposite pair.
      // hueSpread widens (or narrows toward 0) the cane-to-cane colour variation.
      float caneHue = (0.5 + (hash11(fi * 4.1 + 7.0 + fl * 9.0) - 0.5) * u_hueSpread) * 4.0;
      caneHue = mod(caneHue, 4.0);
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

      // --- node-ring glints: light runs continuously UP the cane joint by joint.
      // climb is a repeating rising phase (per-cane offset), brightened on wind
      // crests but with a steady rest floor so it never goes dark.
      float climbSpeed = 0.35 + 0.55 * windSp;
      float climb = fract(t * climbSpeed - fi * 0.13 - fl * 0.21);  // 0..1 rising glint
      float glow = 0.0;
      for (int n = 0; n < NODES; n++) {
        float fn  = float(n);
        float nodeAlong = (fn + 0.5) / float(NODES);
        float nyN = rootYN + nodeAlong * spanYN; // node height (perspective)
        if (nyN < -0.02 || nyN > 1.04) continue;
        float nbow = bowAmt * nodeAlong * nodeAlong * spacingL * 0.9;
        float nshim = u_distortion * sin(nyN * res.y * 0.045 - t * 1.6 + caneX * 0.03)
                    * spacingL * 0.10 * env;
        float ncx  = caneX + nbow + nshim;
        vec2  d    = vec2(fc.x - ncx, (fc.y - nyN * res.y));
        // crisp swollen ring band
        float ringD = length(d * vec2(0.62, 2.2) / max(halfW, 1.0));
        float ringMask = exp(-ringD * ringD * 3.4);
        // the climbing glint lights the ring it passes; wrap-aware so the run is
        // seamless as climb rolls over 1->0.
        float dphase = abs(climb - nodeAlong);
        dphase = min(dphase, 1.0 - dphase);
        float lit  = exp(-pow(dphase * 4.5, 2.0));
        float rest = 0.30 + 0.10 * sin(t * 0.6 + fn * 1.3 + fi);
        glow += ringMask * (lit * exc * u_glintClimb + rest);
      }
      col += glintCol * glow * u_nodeGlow * (0.55 + 0.55 * u_windStrength) * dim * 1.05 * inSpan;

      // --- sparse leaf strokes near the top ---
      float leafSeed = hash11(fi * 6.7 + 2.0 + fl * 6.0);
      float leafYN   = rootYN + spanYN * (0.80 + 0.12 * leafSeed);
      float leafSide = (hash11(fi*8.1+3.0+fl*5.0) > 0.5) ? 1.0 : -1.0;
      float lbow     = bowAmt * 0.7 * spacingL * 0.9;
      vec2  lp       = vec2(fc.x - (caneX + lbow + leafSide * halfW * 1.6),
                            fc.y - leafYN * res.y);
      float blade    = exp(-pow((lp.x - leafSide * lp.y * 0.5) / (halfW*0.9), 2.0))
                     * exp(-pow(lp.y / (spacingL*0.9), 2.0));
      col += glintCol * blade * (0.06 + 0.55 * exc) * u_nodeGlow * u_leaf * dim * 0.7;
    }
  }

  // ground mist: a soft luminous haze pooling at the base of the grove
  float mistBand = smoothstep(0.34, 0.0, yN);
  col += skyCol * mistBand * u_mist * 0.10;

  // gentle vignette to keep the frame composed and edges dark
  vec2 uvc = (fc - res*0.5) / res;
  float vign = 1.0 - smoothstep(0.42, 0.95, length(uvc * vec2(1.0, 0.9)));
  col *= mix(0.72, 1.0, vign);

  // subtle ground darkening / sky-lift so the grove reads as rooted
  col *= mix(0.85, 1.06, smoothstep(0.0, 0.6, yN));

  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
