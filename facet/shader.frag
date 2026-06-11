// facet (Rosette) — a kaleidoscope jewel. The angle around screen centre is
// mirror-folded into N wedges and a slowly drifting two-to-three-octave FBM glow
// field is sampled in the folded space, so soft luminous lobes repeat with
// perfect n-fold symmetry. Brightest where mirrored features kiss along the fold
// seams, fading into a near-black base toward the corners via a gentle vignette.
// The source field drifts on an unbounded straight path (FBM never wraps), so the
// symmetric blooms continuously merge, split, and bloom along the seams with no
// cycle and no possible reset frame; the fold frame itself also turns imperceptibly.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_folds;    // number of mirror wedges in the kaleidoscope (default 8)
uniform float u_drift;    // speed the source glow field slides beneath the folds (default 0.22)
uniform float u_feature;  // characteristic FBM blob size in CSS px (default 320)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU         = 6.2831853;
const float FRAME_SPIN  = 0.015;  // imperceptibly slow turn of the fold frame (rad/s)

// --- value-noise + FBM (no textures; hash-based) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// three-octave FBM with a small rotation between octaves to avoid axis artefacts
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = rot * p * 2.02 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // centred coords, normalised so the shorter screen axis is the jewel diameter
  float minDim = min(res.x, res.y);
  vec2  p      = (fc - ctr) / minDim;   // ~[-0.5..0.5] on the short axis
  float r      = length(p);
  float ang    = atan(p.y, p.x);

  // --- mirror-fold the angle into N wedges (kaleidoscope) ---
  // guard folds so the slider's whole range is safe (never 0 -> div-by-zero)
  float folds  = max(u_folds, 1.0);
  float wedge  = TAU / folds;
  // slow turn of the fold frame, felt rather than seen
  float fang   = ang + t * FRAME_SPIN;
  // fold to [0, wedge] then mirror about its centre -> seam at the wedge edges
  float a      = mod(fang, wedge);
  a            = abs(a - wedge * 0.5);

  // rebuild a folded position; sample the FBM in this folded space so the field
  // repeats with perfect n-fold symmetry and mirror seams. Bias the radius up a
  // touch so the very centre still has structure (folded p never collapses to 0).
  vec2 fp = vec2(cos(a), sin(a)) * (r + 0.08);

  // FBM feature size in CSS px -> field frequency. Larger feature = lower freq.
  // guard against 0 so min-end of the slider can't blow up the frequency.
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float featurePx = max(u_feature, 1.0) * refScale * pr;
  float freq      = (minDim * 1.9) / featurePx;  // cycles across the jewel diameter
  // FLOOR the frequency so the broad-lobe end never collapses into a single
  // featureless blob: the folded radius spans ~0..0.58, so keep >= ~3.0 cycles
  // there (~1.5 across the visible radius) to preserve faint mirrored structure.
  freq = max(freq, 5.2);

  // unbounded straight drift path: FBM input slides forever, never wraps -> no
  // possible reset frame. Two slightly different drift vectors layer the motion.
  vec2 drift1 = vec2(0.137, 0.071) * (t * u_drift);
  vec2 drift2 = vec2(-0.061, 0.119) * (t * u_drift);

  float f1 = fbm(fp * freq + drift1);
  float f2 = fbm(fp * freq * 1.61 + drift2 + 19.3);
  float field = f1 * 0.65 + f2 * 0.35;

  // shape the field into luminous lobes: lift contrast so most stays dark and
  // only the crests glow, with smoothstep edges for clean anti-aliasing
  float glow = smoothstep(0.44, 0.78, field);
  glow = glow * glow;

  // seam kiss: brighten right at the mirror seam (a near 0 and near wedge*0.5)
  float seam = 1.0 - smoothstep(0.0, wedge * 0.22, a);
  float kiss = seam * smoothstep(0.36, 0.72, field);

  // Theme colours from u_palette with the house fallback (headless contexts can
  // leave the vec3[] zeroed; fall back to midnight so a poster never renders black).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // colour blends by field value and radius (no dynamic array indexing). The
  // wheel position rolls slowly with the field and radius so hues vary across the
  // rings and drift gently without a visible loop.
  float k  = field * 1.4 + r * 1.7 + t * 0.01;
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  jewel = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // gentle radial vignette: luminous centre fading into near-black corners. Wide
  // and soft so the jewel fills the frame and only the extreme corners go dark.
  float vign = 1.0 - smoothstep(0.46, 1.02, r);

  // lift the outer rings: without this the brightness piles up in the small
  // central disc and the spokes fade out fast. A radial gain that grows with r
  // (then tapers under the vignette) pushes the ornament out toward a 16:9 hero.
  float outerGain = 1.0 + 1.2 * smoothstep(0.10, 0.55, r);

  // compose: the soft symmetric lobes, plus a brighter kiss along the seams
  col += jewel * glow * 2.4 * vign * outerGain;
  col += jewel * kiss * 1.1 * vign * outerGain;

  // a faint central bloom so the jewel core reads as the brightest point
  float core = exp(-r * r * 7.0) * (0.30 + 0.60 * smoothstep(0.3, 0.9, field));
  col += jewel * core * 0.7;

  gl_FragColor = vec4(col, 1.0);
}
