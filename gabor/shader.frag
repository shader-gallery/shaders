// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// gabor (Strand) - directional Gabor noise rendered as a dark satin surface.
// Gabor noise is a sparse convolution: random impulses scattered through a
// grid of cells, each carrying a Gabor kernel, a Gaussian window times a
// cosine wave of one frequency and one orientation. Summing the kernels that
// reach a pixel gives a band-limited field whose look is set entirely by the
// kernel: a tight angular spread makes long parallel streaks that break and
// re-phase where kernels overlap, a wide spread relaxes toward an isotropic
// ripple. Two octaves of the convolution are summed, a coarse structural one
// and a fine grain at the same orientation, and because every kernel is
// analytic its gradient comes for free, so the field is shaded as a relief
// under a raking key light with a Kajiya-Kay anisotropic sheen running across
// the fibre direction. The dominant orientation turns slowly, the impulse
// phases creep so streaks slide along themselves, and a low frequency swirl
// bends the fibre direction across the frame so the surface reads as combed,
// not ruled. Dark ground, palette as crest light and sheen.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;      // kernel cells across the frame height   (default 8)
uniform float u_frequency;  // stripe cycles per kernel cell          (default 4.0)
uniform float u_spread;     // angular spread, 0 combed to 1 isotropic (default 0.12)
uniform float u_rotate;     // orientation turn speed                 (default 0.3)
uniform float u_relief;     // raking light and sheen strength        (default 1.0)

const float TAU = 6.28318530718;
const float PI  = 3.14159265359;
const int   NIMP = 3;          // impulses per cell
const float BW   = 1.45;       // Gaussian bandwidth in cell units

vec4 hash42(vec2 p) {
  vec4 q = vec4(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)),
                dot(p, vec2(419.2, 371.9)), dot(p, vec2(213.7, 157.3)));
  return fract(sin(q) * 43758.5453123);
}

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// One octave of Gabor noise at cell coordinates p. theta is the dominant
// orientation, spread the half-width of the random angle jitter (radians),
// F0 the stripe frequency in cycles per cell. Returns the field value and
// writes its analytic gradient (per cell unit) to g. The 3x3 cell walk here
// is a convolution sum: every kernel in reach is added, nothing is picked.
float gabor(vec2 p, float theta, float spread, float F0, float t, float seed, out vec2 g) {
  vec2 cell = floor(p);
  vec2 f    = fract(p);
  float sum = 0.0;
  g = vec2(0.0);
  float a2 = BW * BW;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 off = vec2(float(i), float(j));
      vec2 id  = cell + off;
      for (int k = 0; k < NIMP; k++) {
        vec4 h = hash42(id * 1.37 + vec2(float(k) * 17.11 + seed, float(k) * 9.73 - seed));
        vec2 d  = f - (off + h.xy);          // pixel relative to the impulse
        float r2 = dot(d, d);
        // Gaussian window; beyond one cell it is below 1e-3 and left out
        float w = exp(-PI * a2 * r2) * (h.w - 0.5) * 2.0;
        float ang = theta + (h.z - 0.5) * 2.0 * spread;
        vec2 dir = vec2(cos(ang), sin(ang));
        // phase creeps at a per-impulse rate so streaks slide along themselves
        float ph = TAU * F0 * dot(dir, d) + h.x * TAU + t * (0.35 + 0.5 * h.y);
        float c = cos(ph), s = sin(ph);
        sum += w * c;
        g   += -2.0 * PI * a2 * d * w * c - w * s * TAU * F0 * dir;
      }
    }
  }
  float norm = 1.05 / sqrt(float(NIMP));
  g *= norm;
  return sum * norm;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  fp     = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);   // frame units, height 1
  float t      = u_time;
  float scl    = max(u_scale, 1.0);
  float F0     = max(u_frequency, 0.5);
  float spread = clamp(u_spread, 0.0, 1.0) * PI * 0.5;
  float relief = clamp(u_relief, 0.0, 2.0);

  // ---- dominant orientation: a slow global turn plus a low frequency swirl
  // that bends the comb direction across the frame
  float theta0 = 0.55 + t * 0.12 * u_rotate;
  float swirl  = (vnoise(fp * 1.6 + vec2(3.1, 7.7) + t * 0.015) - 0.5) * 0.55
               + (vnoise(fp * 0.7 + vec2(11.0, 2.0) - t * 0.01) - 0.5) * 0.45;
  float theta  = theta0 + swirl;
  vec2  fibre  = vec2(cos(theta), sin(theta));

  // ---- two octaves of the convolution: coarse structure, fine grain
  vec2  gA, gB;
  float sA = scl;
  float sB = scl * 2.6;
  float vA = gabor(fp * sA, theta, spread, F0, t, 0.0, gA);
  float vB = gabor(fp * sB + vec2(4.3, 1.9), theta, spread * 1.3, F0 * 0.9, t * 1.3, 5.0, gB);
  float h  = vA + 0.42 * vB;
  // gradient in frame units (each octave scaled by its own cell size)
  vec2  gh = gA * sA + 0.42 * gB * sB;

  // ---- relief shading: the field as a low embossed height under a key light
  float hs = 0.013 * relief;
  vec3  n  = normalize(vec3(-gh * hs, 1.0));
  // key light hangs above the upper left; the view is a wide lens over the
  // sheet, so the anisotropic sheen forms a band that crosses the frame
  vec3  L  = normalize(vec3(-0.9, 0.7, 0.9) - vec3(fp, 0.0));
  vec3  V  = normalize(vec3(-fp * 0.9, 1.0));
  vec3  H  = normalize(L + V);
  float diff = clamp(dot(n, L), 0.0, 1.0);
  // Kajiya-Kay: the sheen lives across the fibre direction, so it sweeps as
  // the orientation turns. It is taken on a flattened normal so it reads as a
  // broad satin band, not an outline of every crest
  vec3  nf  = normalize(mix(n, vec3(0.0, 0.0, 1.0), 0.75));
  vec3  T   = normalize(vec3(fibre, 0.0) - nf * dot(nf, vec3(fibre, 0.0)));
  float th  = dot(T, H);
  float sinTH = sqrt(max(1.0 - th * th, 0.0));
  float sheen = sinTH; sheen *= sheen; sheen *= sheen; sheen *= sheen; sheen *= sheen;
  sheen *= sheen;                                     // ~32nd power
  float tl  = dot(T, L);
  float wrap = sqrt(max(1.0 - tl * tl, 0.0));        // fibre diffuse term

  // ---- colour. Ground: a near-black desaturated read of the deep pole.
  float lum3 = luma(c3);
  vec3  ground = mix(vec3(lum3), c3, 0.45) * 0.10 + c0 * 0.015;
  // hue drifts slowly across the frame between the first two poles
  float hueF = vnoise(fp * 0.9 + vec2(21.0, 5.0) + t * 0.008);
  vec3  crestCol = mix(c0, c1, smoothstep(0.30, 0.70, hueF));
  // push the crest tint a little past the swatch so it survives the sheen
  crestCol = clamp(mix(vec3(luma(crestCol)), crestCol, 1.3), 0.0, 1.0);
  // crest light: positive lobes of the field glow, troughs sink into ground
  float crest = smoothstep(-0.15, 0.75, h);
  float trough = smoothstep(0.0, -0.8, h);
  vec3  fibreCol = mix(ground * 2.0, crestCol * 0.95, crest);
  fibreCol = mix(fibreCol, ground * 0.5, trough * 0.7);
  // fine grain glint: the high octave sparkles along the crest tops
  float glint = smoothstep(0.2, 0.7, vB) * crest;

  vec3 col = fibreCol * (0.55 + 0.35 * wrap + 0.28 * diff * relief);
  // crest glow: the streak itself is the light source, palette coloured
  col += crestCol * crest * crest * 0.45;
  col += mix(crestCol, c2, 0.5) * glint * 0.25;
  col += mix(c2, vec3(1.0), 0.45) * sheen * (0.25 + 0.30 * relief) * (0.25 + 0.75 * crest);
  col += ground * 0.9;

  // seat the surface: soft vignette toward the corners
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.30 * smoothstep(0.30, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
