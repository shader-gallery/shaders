// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// stone — agate / malachite mineral cross-section. The same FBM field that
// drives marble is read as dense iso-bands, but here the bands stay nearly
// concentric and SETTLED: thin luminous mineral seams separate filled bands of
// deep palette colour that cycle hue band-by-band like layered geology, a slab
// of banded agate lit from within. Motion is a very slow breathing drift of the
// band phase and the warp offsets, unbounded, so the slab perpetually grows and
// re-layers with no wrap, no reset. Filled bands keep the frame from going
// black; the bright fortification seams carry the luminous-filament identity.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;       // pace of the slow settling drift (default 0.12)
uniform float u_banding;     // density of the mineral bands (default 1.0)
uniform float u_scale;       // dominant band-cluster size, css px (default 380)
uniform float u_warp;        // how irregular vs concentric the bands run (default 0.8)

const vec3  BG    = vec3(0.035, 0.035, 0.043); // house near-black
const float NBASE = 22.0;  // base count of mineral bands across the field range

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

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80); // rotate between octaves

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.032;
}

// cyclic 4-stop palette loop a->b->c->d->a, u any real (fract taken). No dynamic
// array indexing — plain ternary selects keep it GLSL ES 1.00 safe.
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
  float t        = u_time * clamp(u_drift, 0.0, 4.0);
  float warp     = max(u_warp, 0.0);
  float NB       = NBASE * (0.4 + 1.6 * clamp(u_banding, 0.05, 3.0));

  // ---- gentle, settled domain warp: one slow stage of drifting centred noise
  // (a quarter of the marble churn). The slab flexes; it does not roil.
  vec2 q = vec2(fbm(p + vec2( 0.05 * t, -0.04 * t)),
                fbm(p + vec2(4.3, 1.9) + vec2(-0.045 * t, 0.05 * t))) - 0.5;
  vec2 pw = p + warp * 1.1 * q;
  float h = fbm(pw + vec2(0.03 * t, -0.02 * t));

  // ---- dense iso-bands of the field = the agate fortification layers. Phase
  // scrolls slowly with time so the slab keeps growing inward (continuous).
  float s    = h * NB + 0.12 * t;
  float band = fract(s);
  float idx  = floor(s);
  float edge = min(band, 1.0 - band);     // 0 at a seam, 0.5 mid-band

  // bright thin fortification seam between bands (the luminous filament)
  float seam = 1.0 - smoothstep(0.0, 0.085, edge);
  seam *= seam;
  // soft bleed of the seam into the band body
  float halo = exp(-(edge * edge) / 0.02);

  // shimmer so seams read as mineral, not flat contours
  float amp = 0.66 + 0.34 * vnoise(pw * 2.6 + vec2(idx * 0.61, -idx * 0.29));

  // filled band body: hue cycles band-by-band so the layers read as geology;
  // a slow large-scale term keeps adjacent slabs from collapsing to one hue.
  float hue   = idx * 0.118 + 0.30 * h;
  vec3  layer = palLoop(hue, c0, c1, c2, c3);
  // the seam leans toward the next layer up, like a mineral vein of its own ink
  vec3  vein  = palLoop(hue + 0.5, c0, c1, c2, c3);

  // ---- compose: deep coloured slab (never black), luminous seams on top
  vec3 col = BG;
  col += layer * 0.155 * (0.6 + 0.4 * (1.0 - 2.0 * edge)); // filled mineral band body (deep colour, never black)
  col += vein  * halo * 0.34 * amp;                          // bleed around seam
  col += vein  * seam * 0.85 * amp;                          // luminous seam
  col += vec3(0.14) * seam * seam * amp;                     // white-hot seam core

  // gentle vignette to seat the slab
  vec2 vq = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.32 * smoothstep(0.35, 1.05, length(vq - 0.5) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
