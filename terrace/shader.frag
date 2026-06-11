// Terrace (Strata) --- rice paddies at dusk seen from straight above.
//
// The same invisible FBM terrain as Contour, but posterized into filled
// stepped bands. Each terrace is a flat fill in a slightly different
// near-dark shade --- the four palette colours interpolated across the
// height range at very low brightness, so adjacent steps differ subtly in
// hue. Every step boundary carries a hairline-bright anti-aliased edge that
// does the glowing. The composition reads as broad calm plates separated by
// luminous threads.
//
// Motion: the heightfield drifts through a third noise dimension at
// geological patience, so terrace boundaries creep continuously and whole
// terraces flood or drain as the field crosses thresholds --- appearing and
// dissolving with no visible reset. Edge glow shimmers faintly where bands
// pinch tight.

precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // unused --- shader is fully presentable without it
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bands;      // number of posterized elevation steps         (default 7)
uniform float u_morphSpeed; // terrain deformation rate; 0 freezes the land (default 0.25)
uniform float u_edgeGlow;   // brightness of the hairline step boundaries   (default 0.8)

const float SCALE      = 2.3;    // noise cells across the short edge
const float PHASE_RATE = 0.035;  // band-threshold drift, cycles per second
const float MORPH_GAIN = 0.12;   // u_morphSpeed -> z-drift rate
const float AA         = 0.85;   // edge antialias half-band, device px
const float FILL_LO    = 0.055;  // dimmest terrace fill brightness
const float FILL_HI    = 0.235;  // brightest terrace fill brightness

// ---- 3D value noise + fbm -----------------------------------------------

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

const mat2 ROT2 = mat2(0.80, 0.60, -0.60, 0.80);

// 4-octave fbm, normalized to ~[0,1]. The z axis is the morph dimension;
// it scales gently per octave so fine detail deforms calmly, not jittery.
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = vec3(ROT2 * p.xy * 2.02, p.z * 1.30 + 9.7);
    a *= 0.5;
  }
  return s * 1.0666667; // / 0.9375
}

// elevation -> palette ramp (tent-weighted blend, no dynamic indexing)
vec3 ramp(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  return a * max(0.0, 1.0 - abs(t))
       + b * max(0.0, 1.0 - abs(t - 1.0))
       + c * max(0.0, 1.0 - abs(t - 2.0))
       + d * max(0.0, 1.0 - abs(t - 3.0));
}

// fbm rarely hits 0 or 1 --- stretch the realized band across the full ramp
float elevT(float h) { return clamp((h - 0.25) * 2.0, 0.0, 1.0); }

void main() {
  // palette + house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr = max(u_pixelRatio, 0.25);
  float B  = clamp(u_bands, 1.0, 12.0);   // posterization steps

  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / mn;

  float e = SCALE / mn;                              // one device px in noise units
  float z = 1.73 + u_time * u_morphSpeed * MORPH_GAIN;
  vec3  q = vec3(uv * SCALE + vec2(3.1, 7.7), z);

  // heightfield + screen-space gradient (finite differences, one pixel)
  float hN  = fbm(q);
  float hNx = fbm(q + vec3(e, 0.0, 0.0));
  float hNy = fbm(q + vec3(0.0, e, 0.0));
  float slopePx = length(vec2(hNx - hN, hNy - hN));  // dh per device pixel

  // posterization field: integer crossings of f are the terrace boundaries.
  // The phase drift slides every threshold through f, so terraces creep and
  // flood/drain continuously --- never wrapping.
  float phase = u_time * PHASE_RATE;
  float f     = hN * B - phase;
  float lf    = floor(f);                            // index of this terrace
  float frac  = f - lf;                              // 0..1 within the terrace
  float dfpx  = max(B * slopePx, 1e-5);              // terrace cycles per device px

  // --- filled terrace shade -------------------------------------------------
  // each terrace is a flat fill; its tone is set by the elevation at the
  // middle of its own step, so adjacent terraces differ subtly in hue.
  float bandElev = (lf + 0.5 + phase) / B;           // elevation of this step
  vec3  bandHue  = ramp(elevT(bandElev), c0, c1, c2, c3);
  // brightness climbs with elevation, plus a faint odd/even stagger so two
  // adjacent terraces always read as distinct flat plates, never a smooth ramp
  float stagger  = 0.10 * (mod(lf, 2.0) - 0.5);      // +-0.05 alternating
  float bandLum  = clamp(mix(FILL_LO, FILL_HI, clamp(bandElev, 0.0, 1.0)) + stagger, 0.02, FILL_HI);
  vec3  fill     = bandHue * bandLum;

  // --- hairline-bright boundary edges --------------------------------------
  // distance (in device px) to the nearest terrace boundary, above or below.
  float pBelow = frac / dfpx;                        // px down to the level below
  float pAbove = (1.0 - frac) / dfpx;                // px up to the level above
  float pEdge  = min(pBelow, pAbove);

  float hw   = 0.65 * pr;                            // edge half-thickness, device px
  float edge = 1.0 - smoothstep(hw - AA, hw + AA, pEdge);

  // edge hue: blend the two terraces it separates, kept luminous
  float loElev = (lf + phase) / B;
  float hiElev = (lf + 1.0 + phase) / B;
  vec3  edgeHue = ramp(elevT(mix(loElev, hiElev, step(pAbove, pBelow))), c0, c1, c2, c3);
  edgeHue = mix(edgeHue, vec3(1.0), 0.30);           // pull toward white for a hot thread

  // soft halo hugging each thread; shimmers brighter where bands pinch tight
  float pinch = 1.0 + 1.6 * smoothstep(0.18, 0.55, dfpx);
  float halo  = exp(-pEdge / (3.5 * pr)) * 0.22;

  // where bunches over-tighten past pixel resolution, fade the hot edge into
  // the band fill instead of letting it moire into a solid wash
  float resv  = 1.0 - smoothstep(0.30, 0.62, dfpx);
  float edgeA = (edge + halo) * pinch * resv;

  // --- compose -------------------------------------------------------------
  vec3 base = vec3(0.030, 0.030, 0.038);             // near-black house base
  vec3 col  = base + fill;
  col += edgeHue * edgeA * (0.55 + 0.85 * u_edgeGlow);

  // gentle vignette holding the corners down
  float r   = length((gl_FragCoord.xy - 0.5 * res) / (0.5 * res));
  float vig = 1.0 - 0.32 * smoothstep(0.55, 1.45, r);
  col *= vig;

  col += (hash3(vec3(gl_FragCoord.xy, 0.5)) - 0.5) / 255.0;  // de-banding dither
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
