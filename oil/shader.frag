// oil — iridescent oil-on-water thin film. The same drifting FBM that marbles
// ink here reads as the THICKNESS of a thin oil film on dark water; thickness is
// mapped through interference orders into soft spectral sheen, so broad
// concentric iridescent zones (teal to magenta to gold and back) drift and flex
// across the frame. Restrained rainbow: the sweep only ever cycles the four
// theme colours, never a garish full spectrum. The film fills the frame with
// deep low-key colour, brightest along the constructive-interference fringes,
// and flexes continuously as the warp offsets drift with no wrap or reset.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;         // pace of the drifting film (default 0.18)
uniform float u_scale;        // dominant sheen-zone size, css px (default 460)
uniform float u_iridescence;  // interference orders across thickness (default 1.4)
uniform float u_sheen;        // turbulence / warp of the film (default 1.0)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black water
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
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

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.032;
}

// cyclic 4-stop palette loop a->b->c->d->a. No dynamic array indexing.
vec3 palLoop(float u, vec3 a, vec3 b, vec3 c, vec3 d) {
  float x   = fract(u) * 4.0;
  float seg = floor(x);
  float f   = smoothstep(0.0, 1.0, fract(x));
  vec3 lo = seg < 0.5 ? a : seg < 1.5 ? b : seg < 2.5 ? c : d;
  vec3 hi = seg < 0.5 ? b : seg < 1.5 ? c : seg < 2.5 ? d : a;
  return mix(lo, hi, f);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr       = max(u_pixelRatio, 0.25);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float scalePx  = max(u_scale, 40.0) * refScale * pr;
  vec2  p        = gl_FragCoord.xy / scalePx;
  float t        = u_time * clamp(u_flow, 0.0, 4.0);
  float sheen    = max(u_sheen, 0.0);
  float orders   = max(u_iridescence, 0.0) * 6.0; // interference orders across the film

  // ---- thin-film thickness as a drifting, gently warped FBM. One warp stage
  // for the broad swirl plus a finer second octave for the surface ripple.
  vec2 q = vec2(fbm(p + vec2( 0.07 * t, -0.05 * t)),
                fbm(p + vec2(3.7, 8.1) + vec2(-0.06 * t, 0.07 * t))) - 0.5;
  vec2 pw = p + sheen * 1.3 * q;
  float thick = fbm(pw + vec2(0.04 * t, -0.03 * t));
  thick += 0.40 * fbm(pw * 2.4 + vec2(-0.05 * t, 0.06 * t)); // fine surface ripple
  thick *= 0.72;

  // ---- interference: thickness -> spectral order. The palette phase walks the
  // four theme hues; the constructive fringe envelope rides the same order.
  float order = thick * orders + 0.06 * t;           // interference order, continuous
  // hue advances ~3x slower than the fringe period so each successive bright
  // ring steps through the spectrum (teal->blue->purple->gold), not one locked hue
  vec3  sheenCol = palLoop(order * 0.34, c0, c1, c2, c3);
  float fringe = 0.5 + 0.5 * cos(TAU * order);       // bright/dark interference bands
  fringe = pow(fringe, 2.0);                          // fringe positive -> safe

  // brightness envelope: fills the frame with deep sheen, brightest on fringes
  float bright = mix(0.16, 0.92, fringe);

  // a faint specular glint where the film is steepest (crest of a ripple)
  float crest = smoothstep(0.55, 0.95, fringe);

  vec3 col = BG;
  col += sheenCol * bright * 0.62;          // iridescent film across the whole frame
  col += sheenCol * crest * 0.28;           // brighter fringe glow (blooms in post)
  col += vec3(0.10) * crest * crest;        // white-hot specular thread

  // gentle vignette so the slick seats into the dark water
  vec2 vq = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.30 * smoothstep(0.40, 1.08, length(vq - 0.5) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
