// culm (Sough) — a grove of thick, round bamboo canes crossing the frame in
// three depth-layered rows that recede and haze back. Each cane is cylinder-
// shaded (lit flank, specular stripe, dark turning edges) and divided by crisp
// swollen node rings, with small leaf strokes near the tops. A calm, continuous
// wind travels through the grove as a smooth traveling wave — the canes lean and
// breathe without ever freezing — and light runs steadily UP each cane, a
// sparkle of node glints climbing joint by joint to the leafy tip.
//
// PERFORMANCE: the grove is evaluated with domain repetition, not by looping
// every cane per pixel. For each layer a fragment finds its home cane column
// from gl_FragCoord.x and only visits a small neighbourhood of columns; the
// evenly-spaced node rings are evaluated analytically (nearest ring, O(1))
// instead of with an inner per-node loop. Cost is ~LAYERS*NEIGH cane probes
// per fragment with no nested node loop.
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

const vec3  BG      = vec3(0.028, 0.030, 0.044); // near-black base
const int   LAYERS  = 3;     // depth-layered receding rows (literal loop bound)
const int   NEIGH   = 2;     // half-width of the cane-column neighbourhood
const float NODES   = 9.0;   // node rings per cane (analytic, not a loop)
// constant cross-section light dir (upper-left, toward viewer) — precomputed
const vec2  LC = vec2(-0.5524, 0.8336);

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
// ~0.34 and 1.0, never reaching zero (no dead-calm freeze).
float windEnv(float xN, float t, float sp) {
  float s = 0.5 + 0.5 * sin(t * sp * 0.4 - xN * 3.0);
  return 0.34 + 0.66 * s;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float fieldW = max(res.x, 1.0);

  float yN  = fc.y / max(res.y, 1.0);   // 0 at ground, 1 at top
  vec3  col = BG;

  // Palette with house fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 skyCol = mix(c0, c1, 0.5);

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float spacing  = max(u_spacing / max(u_crowding, 0.3), 8.0) * refScale * pr;
  float windSp   = max(u_windSpeed, 0.0001);
  float climbSpeed = 0.35 + 0.55 * windSp;

  // faint dusk sky + horizon haze behind the bed so it reads with atmosphere
  col += skyCol * smoothstep(0.0, 0.9, yN) * 0.03;

  // ---- depth-layered reed bed: receding rows, far -> near (near drawn last) --
  for (int L = 0; L < LAYERS; L++) {
    float fl  = float(L) / float(LAYERS - 1);          // 0 far .. 1 near
    float dim = mix(mix(1.0, 0.42, u_depth), 1.0, fl);
    float widthScale = mix(mix(1.0, 0.46, u_depth), 1.05, fl);
    float rootYN = mix(0.30, -0.06, fl);
    float topYN  = mix(0.66, 1.06, fl);
    float gap    = max(spacing * mix(0.62, 1.0, fl), 6.0); // cane spacing = cell size
    float haze   = (1.0 - fl) * 0.5 * u_depth;
    float spanYN = max(topYN - rootYN, 0.05);

    // along the cane is layer-invariant (0 root .. 1 tip); compute it once.
    float along = (yN - rootYN) / spanYN;
    if (along < -0.05 || along > 1.10) continue;        // outside this row

    float homeCol = floor(fc.x / gap);
    // height-aware horizontal reach (cells): bow only swings the tip, so low
    // fragments can reject far columns before any wind/sin work.
    float reach = (1.6 * along * along + 0.85) * gap;

    // visit just a small neighbourhood of cane columns around the fragment
    for (int dc = -NEIGH; dc <= NEIGH; dc++) {
      float ci = homeCol + float(dc);

      float jitter = (hash11(ci * 3.17 + 11.0 + fl * 53.0) - 0.5) * gap * 0.4;
      float caneX  = (ci + 0.5) * gap + jitter;
      if (abs(fc.x - caneX) > reach) continue;          // can't reach: skip pre-wind
      float halfW  = gap * (0.20 + 0.08 * hash11(ci * 1.7 + 4.0 + fl * 7.0))
                   * widthScale * u_thickness;

      // --- calm continuous wind ---
      float caneXN = caneX / fieldW;
      float wave   = windWave(caneXN, t, windSp);
      float env    = windEnv(caneXN, t, windSp);
      float caneSeed = hash11(ci * 2.9 + 1.0 + fl * 4.0);
      float stiff  = 0.7 + 0.6 * caneSeed;
      float exc    = clamp(0.22 + 0.7 * env * (0.5 + 0.5 * wave), 0.0, 1.2);

      // elastic lean: coherent wind push + per-cane spring overshoot
      float spring = 1.0 + 0.18 * sin(t * (2.4 + caneSeed) + ci);
      float bowAmt = wave * env * u_windStrength * stiff * spring;

      // bow grows with along^2 (stiff base, flexible top); clamped so a cane
      // never leans past the searched neighbourhood.
      float bowCells = clamp(bowAmt * along * along * 0.9, -1.6, 1.6);
      float shimmer  = u_distortion * sin(fc.y * 0.045 - t * 1.6 + caneX * 0.03)
                     * 0.10 * env;
      float cx  = caneX + (bowCells + shimmer) * gap;
      float dxc = fc.x - cx;
      if (abs(dxc) > gap * 0.80) continue;               // negligible: skip cell

      // --- cylindrical shading across the cane ---
      float u  = clamp(dxc / max(halfW, 1.0), -1.0, 1.0);
      float nz = sqrt(max(1.0 - u * u, 0.0));
      float diff = clamp(dot(vec2(u, nz), LC), 0.0, 1.0);
      float d2 = diff * diff, d4 = d2 * d2;
      float spec = d4 * d4 * diff * u_specular;           // diff^9 * spec
      float shade = 0.16 + 0.70 * diff + 0.95 * spec;

      // body mask: soft edges + tip rounding
      float edge     = smoothstep(halfW + pr * 1.4, halfW - pr * 0.6, abs(dxc));
      float tipRound = smoothstep(1.02, 0.86, along);
      float body     = edge * tipRound;

      // cane colour: adjacent palette blend; glints from the opposite pair.
      float caneHue = mod((0.5 + (hash11(ci * 4.1 + 7.0 + fl * 9.0) - 0.5) * u_hueSpread) * 4.0, 4.0);
      float aw0 = wheelW(caneHue,0.0), aw1 = wheelW(caneHue,1.0);
      float aw2 = wheelW(caneHue,2.0), aw3 = wheelW(caneHue,3.0);
      vec3  caneCol = (c0*aw0 + c1*aw1 + c2*aw2 + c3*aw3) / max(aw0+aw1+aw2+aw3, 0.001);
      float glintHue = mod(caneHue + 2.0, 4.0);
      float gw0 = wheelW(glintHue,0.0), gw1 = wheelW(glintHue,1.0);
      float gw2 = wheelW(glintHue,2.0), gw3 = wheelW(glintHue,3.0);
      vec3  glintCol = (c0*gw0 + c1*gw1 + c2*gw2 + c3*gw3) / max(gw0+gw1+gw2+gw3, 0.001);

      // lit 3D body, painted OVER farther canes (mix = occlusion, real depth)
      vec3 bodyCol = mix(caneCol, skyCol, haze) * shade * (0.85 + 0.5 * exc) * dim;
      col = mix(col, bodyCol, body * 0.92);

      // --- node ring + climbing glint, evaluated ANALYTICALLY (nearest ring) ---
      float alongN = clamp(along, 0.0, 1.0) * NODES;
      float centerK = clamp(floor(alongN), 0.0, NODES - 1.0);
      float nodeAlong = (centerK + 0.5) / NODES;          // nearest ring centre
      float dyPx  = (along - nodeAlong) * spanYN * res.y;  // screen-y dist to ring
      float ringD2 = ((0.62*dxc)*(0.62*dxc) + (2.2*dyPx)*(2.2*dyPx)) / max(halfW*halfW, 1.0);
      float ringMask = exp(-ringD2 * 3.4);
      // climbing glint lights the ring it passes (wrap-aware as climb rolls over)
      float climb  = fract(t * climbSpeed - ci * 0.13 - fl * 0.21);
      float dphase = abs(climb - nodeAlong); dphase = min(dphase, 1.0 - dphase);
      float la = dphase * 4.5;
      float lit  = exp(-la * la);
      float rest = 0.30 + 0.10 * sin(t * 0.6 + centerK * 1.3 + ci);
      float glow = ringMask * (lit * exc * u_glintClimb + rest);
      col += glintCol * glow * u_nodeGlow * (0.55 + 0.55 * u_windStrength) * dim * 1.05;

      // --- sparse leaf stroke near the top ---
      float leafSeed = hash11(ci * 6.7 + 2.0 + fl * 6.0);
      float leafYN   = rootYN + spanYN * (0.80 + 0.12 * leafSeed);
      float leafSide = (hash11(ci*8.1 + 3.0 + fl*5.0) > 0.5) ? 1.0 : -1.0;
      float lbow     = (bowCells * 0.78) * gap;
      vec2  lp       = vec2(fc.x - (caneX + lbow + leafSide * halfW * 1.6),
                            fc.y - leafYN * res.y);
      float blade    = exp(-pow((lp.x - leafSide * lp.y * 0.5) / (halfW*0.9), 2.0))
                     * exp(-pow(lp.y / (gap*0.9), 2.0));
      col += glintCol * blade * (0.06 + 0.55 * exc) * u_nodeGlow * u_leaf * dim * 0.7;
    }
  }

  // ground mist: a soft luminous haze pooling at the base of the grove
  col += skyCol * smoothstep(0.34, 0.0, yN) * u_mist * 0.10;

  // gentle vignette to keep the frame composed and edges dark
  vec2 uvc = (fc - res*0.5) / res;
  float vign = 1.0 - smoothstep(0.42, 0.95, length(uvc * vec2(1.0, 0.9)));
  col *= mix(0.72, 1.0, vign);

  // subtle ground darkening / sky-lift so the grove reads as rooted
  col *= mix(0.85, 1.06, smoothstep(0.0, 0.6, yN));

  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
