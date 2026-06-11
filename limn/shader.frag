// limn (Brink) — the coastline of a Julia set drawn as a single line of light and
// nothing else. We iterate z -> z*z + c for 40 steps while tracking the
// derivative dz -> 2*z*dz, then form the exterior distance estimate
// |z|*log(|z|)/|dz| — the true screen distance to the Julia boundary — and shape
// it with two smoothsteps into a crisp core stroke plus a faint halo. Both
// domains the line separates stay equally near-black; only the boundary glows.
// As a hidden seed c orbits (Writhe), the whole line continuously re-poses:
// tendrils extend, bays close, islands pinch off and rejoin — the figure never
// travels, it becomes a different figure.
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
uniform float u_lineWidth;   // core stroke width, css px        (default 1.2)
uniform float u_haloReach;   // glow skirt width, css px         (default 20)
uniform float u_writheSpeed; // hidden-seed orbit speed          (default 0.05)
uniform float u_zoom;        // magnification about frame centre (default 1.1)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   ITER     = 40;     // constant iteration bound (escape-time loop)
const float ESCAPE   = 4.0;    // |z|^2 escape radius squared
const float VIEW_CSS = 1.85;   // half-height of the complex view at zoom 1

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;
  float pr  = u_pixelRatio;

  // --- map pixel to complex plane (aspect-correct, centred, zoomed) ---
  float zoom = max(u_zoom, 0.05);
  float scale = VIEW_CSS / zoom;                 // half-height in complex units
  vec2  uv = (fc - ctr) / res.y;                 // y in [-0.5,0.5], aspect-safe
  vec2  z  = uv * (2.0 * scale);                 // point in the complex plane

  // how many complex units a single device pixel spans — needed to convert the
  // distance estimate into a screen-pixel measure for a resolution-stable stroke
  float pxPerUnit = res.y / (2.0 * scale);
  float unitPerPx = 1.0 / pxPerUnit;

  // --- hidden seed c orbits slowly: this is the whole motion (Writhe) ---
  float ph = t * u_writheSpeed;
  // a gentle compound orbit through interesting, filamentary Julia regions near
  // the boundary of the Mandelbrot set (so the coastline is always intricate)
  vec2 c = vec2(-0.78, 0.12)
         + vec2(cos(ph), sin(ph)) * 0.16
         + vec2(cos(ph * 0.47 + 1.3), sin(ph * 0.61 + 0.5)) * 0.05;

  // --- escape-time iteration with derivative tracking ---
  vec2  dz = vec2(1.0, 0.0);   // dz/dz0
  float r2 = dot(z, z);
  bool  escaped = false;
  for (int i = 0; i < ITER; i++) {
    // dz = 2*z*dz  (complex multiply)
    dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x);
    // z = z*z + c
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    r2 = dot(z, z);
    if (r2 > ESCAPE) { escaped = true; break; }
  }

  // exterior distance estimate: |z| * log(|z|) / |dz|  (in complex units)
  float modz  = sqrt(max(r2, 1e-12));
  float moddz = max(length(dz), 1e-6);
  float distU = modz * log(max(modz, 1.001)) / moddz; // units
  // interior points (never escaped) have an undefined/zero DE — push them far so
  // they read as the dark "land" domain, never lit.
  if (!escaped) distU = 1e9;

  float distPx = distU * pxPerUnit;   // screen distance to the boundary, in px

  // --- shape distance into a core stroke + a wide faint halo ---
  float core = max(u_lineWidth, 0.05) * pr;            // half-width-ish, css px
  float halo = max(u_haloReach, core + 0.5) * pr;      // glow reach, css px
  float aa   = pr;                                     // ~1px anti-alias band

  // crisp anti-aliased core line about a CSS pixel wide
  float lineCore = 1.0 - smoothstep(core, core + aa, distPx);
  // much fainter, much wider halo skirt hugging the same contour
  float lineHalo = 1.0 - smoothstep(core, halo, distPx);
  lineHalo *= lineHalo * lineHalo; // cubic falloff: a soft skirt, brightest at the core

  // --- hue pours around the coastline by angle about the set centroid ---
  // centroid ~ origin of the orbiting figure; use the pixel's complex position
  float ang   = atan(uv.y, uv.x);                 // angle of pixel about centre
  float phase = ang / 6.2831853 + 0.5;            // 0..1 around the figure
  float s     = fract(phase + t * 0.03) * 4.0;    // slow global hue drift
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  // palette with midnight fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // gentle radial vignette keeps the frame edges calm and the centre luminous
  float vign = 1.0 - 0.55 * smoothstep(0.35, 1.1, length((fc - ctr) / res));

  // compose: dark base, then the single luminous contour (core bright, halo faint)
  vec3 col = BG;
  col += hue * lineHalo * 0.40 * vign;          // misty corona
  col += hue * lineCore * 1.15 * vign;          // the drawn line of light
  // a touch of additive white in the very brightest core so it reads as light
  col += vec3(1.0) * lineCore * lineCore * 0.18 * vign;

  gl_FragColor = vec4(col, 1.0);
}
