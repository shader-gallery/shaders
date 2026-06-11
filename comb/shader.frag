// comb (Mosaic) — a strict honeycomb of flat hexagonal cells, each filled with
// warm light sampled from a slow-drifting FBM field: bright clusters of lit
// comb shade off into dim neighbours, ramped through the four palette colours
// from ember-warm down to near-black. Thin dark wax walls separate the cells,
// and a few hash-chosen cells sit fully dark like vacated chambers, fading out
// and re-lighting over long hash-offset periods. The field translates in one
// slow direction forever — light seeps cell to cell with no wrap or reset.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_hex;        // width of one hexagon, css px (default 56)
uniform float u_flowSpeed;  // drift rate of the light field (default 0.15)
uniform float u_vacancy;    // fraction of cells gone dark, 0..0.5 (default 0.15)

const vec3  BG         = vec3(0.035, 0.035, 0.043); // house near-black floor
const vec3  WAX        = vec3(0.016, 0.015, 0.021); // seam colour, under any fill
const vec3  VACANT     = vec3(0.011, 0.010, 0.014); // vacated-chamber darkness
const float WALL_CSS   = 1.7;    // wall half-thickness per cell side, css px
const float FIELD_CSS  = 160.0;  // light-field feature size, css px
const float DRIFT_CSS  = 240.0;  // css px/s of field drift at u_flowSpeed = 1
const float VAC_PERIOD = 55.0;   // seconds for one vacancy cycle (mean)
const float VAC_FADE   = 0.05;   // fade width as a fraction of the cycle
const float TAU        = 6.2831853;

// hex lattice basis: pointy-top hexes, flat-to-flat width 1.0 in x
const vec2 HEXR = vec2(1.0, 1.7320508);

float hexDist(vec2 p) {            // 0 at centre, 0.5 on the wall
  p = abs(p);
  return max(dot(p, vec2(0.5, 0.8660254)), p.x);
}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8) * 2.02;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = rot * p + vec2(17.7, 9.2);
    amp *= 0.5;
  }
  return v;  // ~0..0.94, centred near 0.47
}

// brightness ramp through the four palette colours: near-black -> dim ember ->
// mid glow -> hot core (constant indices only; GLSL ES 1.00 can't index by var)
vec3 fillRamp(float h, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 c = c3 * 0.45;
  c = mix(c, c1 * 0.85, smoothstep(0.16, 0.46, h));
  c = mix(c, c0,        smoothstep(0.44, 0.74, h));
  c = mix(c, c2 * 0.90 + vec3(0.22), smoothstep(0.72, 0.98, h));
  return c;
}

void main() {
  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  fc     = gl_FragCoord.xy;
  vec2  res    = u_resolution;
  float t      = u_time;
  float hexCss = max(u_hex, 4.0);          // guard: never divide by 0
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float hexPx = hexCss * refScale * pr;

  // --- strict hex tiling (offset-grid nearest-centre trick) ---
  vec2 uv = fc / hexPx;
  vec2 a  = mod(uv, HEXR) - HEXR * 0.5;
  vec2 b  = mod(uv - HEXR * 0.5, HEXR) - HEXR * 0.5;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;  // offset from this cell's centre
  vec2 id = uv - gv;                        // this cell's centre, hex units
  // snap to the exact integer lattice so per-cell hashes are pixel-stable
  vec2 idn = floor(vec2(id.x * 2.0, id.y * 1.1547005) + 0.5);

  float h1 = hash21(idn);
  float h2 = hash21(idn + 71.3);
  float h3 = hash21(idn + 193.7);

  // --- per-cell brightness: FBM sampled at the cell centre (flat fill),
  //     field anchored in css space so cell size re-tessellates the same light
  vec2  ctrCss = id * hexCss;
  vec2  dir    = vec2(0.9325, 0.3612);      // one slow direction, forever
  vec2  fp     = (ctrCss + dir * (t * u_flowSpeed * DRIFT_CSS)) / FIELD_CSS;
  // steep contrast map: most of the comb sits ember-dim, cluster cores reach
  // the hot top of the ramp (fbm rarely exceeds ~0.72, so 0.70 is attainable)
  float lum    = pow(smoothstep(0.46, 0.72, fbm(fp + vec2(3.1, 7.7))), 1.8);
  lum *= 0.95 + 0.05 * sin(t * 0.35 + h1 * TAU);  // imperceptible cell breathing

  // --- vacancy: a per-cell sawtooth phase q in 0..1; the cell goes dark while
  //     q crosses a window of width u_vacancy, with slow smoothstep fades.
  //     Window sits mid-cycle so the saw's wrap never lands inside a fade.
  float rate = (0.65 + 0.70 * h3) / VAC_PERIOD;   // hash-offset long periods
  float dq   = fract(h2 + t * rate) - 0.25;
  float vac  = clamp(smoothstep(0.0, VAC_FADE, dq)
                   - smoothstep(u_vacancy, u_vacancy + VAC_FADE, dq), 0.0, 1.0);

  float lit  = lum * (1.0 - vac);

  // --- flat cell fill + thin dark wax walls ---
  vec3  ramp     = fillRamp(lit, c0, c1, c2, c3);
  vec3  fill     = BG + ramp * (0.07 + 1.10 * pow(lit, 1.4));
  fill           = mix(fill, VACANT, vac);
  float edgePx   = (0.5 - hexDist(gv)) * hexPx;   // device px from the wall
  float wallPx   = WALL_CSS * pr;
  float aa       = 0.8 * pr;
  float fillMask = smoothstep(wallPx - aa, wallPx + aa, edgePx);
  vec3  wax      = WAX + ramp * lit * 0.07;       // faint leak into the seams
  vec3  col      = mix(wax, fill, fillMask);

  // gentle vignette to keep the comb composed against page edges
  vec2 vq = (fc - 0.5 * res) / min(res.x, res.y);
  col *= 1.0 - 0.30 * smoothstep(0.38, 1.05, length(vq));

  gl_FragColor = vec4(col, 1.0);
}
