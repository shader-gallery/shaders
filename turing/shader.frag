// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// turing (Strata) - a Gray-Scott style reaction-diffusion surface, the dense
// labyrinth of worm-like ridges and isolated spots that a two-chemical
// activator-inhibitor system settles into. The runtime is a single pass with no
// feedback buffer, so the LOOK is built analytically: a Turing pattern is, to a
// good approximation, band-limited noise pushed through a sharp threshold. We
// sum a ring of plane waves of one wavelength at golden-angle directions, bend
// the domain with slow FBM so the waves wander, salt in gradient noise at the
// same wavelength to break any moire, then threshold the field. The zero set of
// such a field is a maze of near-constant-width ridges that fork, merge and end
// in rounded caps, and a raised threshold breaks the maze into spots. A slow
// low-frequency bias sweeps the threshold across the frame so labyrinth and
// spot regimes coexist and drift into one another as the chemistry morphs.
// Ridges are shaded as rounded tubes from finite-difference normals, with a
// cavity floor between them, so the pattern reads as a relief, not a stencil.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // ridge wavelength, css px                (default 22)
uniform float u_drift;    // morph speed of the chemistry            (default 0.35)
uniform float u_spots;    // labyrinth (0) toward isolated spots (1) (default 0.3)
uniform float u_warp;     // how far the ridges wander from straight (default 1.0)
uniform float u_relief;   // depth of the ridge shading              (default 0.85)

const float TAU = 6.28318530718;
const int   NWAVE = 12;

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
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

// band-limited activator field in wavelength units. p is already domain-warped.
// Each plane wave carries its own slow phase noise, so the waves decorrelate
// and wander independently instead of locking into interference fringes.
float chem(vec2 p, float t) {
  float f = 0.0;
  for (int i = 0; i < NWAVE; i++) {
    float k  = float(i);
    float a  = k * 2.39996 + 0.61;                 // golden-angle directions
    vec2  d  = vec2(cos(a), sin(a));
    float ph = k * 1.7 + t * (0.09 + 0.06 * sin(k * 2.1));
    ph += 7.0 * (vnoise(p * 0.19 + vec2(k * 13.7, k * 5.3) + t * 0.01) - 0.5);
    f += cos(dot(d, p) * TAU + ph);
  }
  f *= 0.30;
  // a little gradient noise at the ridge wavelength for diffusion-like grit
  f += (vnoise(p * 1.1 + 37.0 + t * 0.03) - 0.5) * 0.5;
  return f;
}

// domain warp + field: the whole reaction surface at one point
float surface(vec2 p, float t, float warp) {
  vec2 q = vec2(fbm(p * 0.13 + vec2(t * 0.020, -t * 0.015)),
                fbm(p * 0.13 + vec2(5.1, 8.7) + vec2(-t * 0.017, t * 0.022))) - 0.5;
  return chem(p + warp * 4.0 * q, t);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr       = max(u_pixelRatio, 0.25);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float lambda   = max(u_scale, 6.0) * refScale * pr;   // device px per ridge cycle
  vec2  p        = gl_FragCoord.xy / lambda;
  float t        = u_time * clamp(u_drift, 0.0, 3.0);
  float warp     = max(u_warp, 0.0);
  float relief   = clamp(u_relief, 0.0, 1.5);

  // ---- the activator field and its finite-difference slope
  float e  = 0.06;
  float f  = surface(p, t, warp);
  float fx = surface(p + vec2(e, 0.0), t, warp);
  float fy = surface(p + vec2(0.0, e), t, warp);

  // ---- threshold bias: sweeps the regime from labyrinth toward spots. A slow
  // low-frequency field varies it across the frame so both regimes coexist.
  float regime = fbm(p * 0.05 + vec2(3.3, 1.1) + vec2(t * 0.012, t * 0.009)) - 0.5;
  float thr    = clamp(u_spots, 0.0, 1.0) * 1.0 - 0.12 + regime * 0.6;

  // ridge mask: sharp but anti-aliased threshold. The width in field units maps
  // to roughly one device pixel through the slope, so caps stay crisp.
  float slope = length(vec2(fx - f, fy - f)) / e + 1e-3;
  float aa    = clamp(slope * 1.2 / lambda, 0.02, 0.2);
  float ridge = smoothstep(thr - aa, thr + aa, f);

  // rounded tube profile across the ridge: height rises with concentration
  // above threshold and flattens at the crest
  float hgt  = clamp((f - thr) * 1.4, 0.0, 1.0);
  float tube = hgt * (2.0 - hgt);
  float hx   = clamp((fx - thr) * 1.4, 0.0, 1.0); hx = hx * (2.0 - hx);
  float hy   = clamp((fy - thr) * 1.4, 0.0, 1.0); hy = hy * (2.0 - hy);
  vec3  n    = normalize(vec3(-(hx - tube), -(hy - tube), e * (1.6 - relief * 0.9)));
  vec3  L    = normalize(vec3(-0.55, 0.65, 0.55));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3  H    = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = clamp(dot(n, H), 0.0, 1.0);
  spec = spec * spec; spec = spec * spec; spec = spec * spec * spec;

  // ---- colour: the ridge hue drifts slowly across the surface between three
  // palette poles, so the maze reads as one dyed skin, not a rainbow
  float hueF = fbm(p * 0.045 + vec2(9.1, 2.4) + vec2(-t * 0.008, t * 0.011));
  vec3  ridgeCol = mix(c0, c1, smoothstep(0.30, 0.55, hueF));
  ridgeCol = mix(ridgeCol, c2, smoothstep(0.55, 0.80, hueF));
  // crest brightening: the activator concentration peaks at the ridge core
  float core = smoothstep(0.0, 0.9, f - thr);
  ridgeCol = mix(ridgeCol * 0.72, ridgeCol * 1.05 + c2 * 0.12, core);

  // ---- cavity floor between ridges: deep tone of the fourth pole, darkened
  // where the floor runs close under a ridge wall (cheap occlusion from the
  // field: just below threshold is right at the wall)
  float wall  = smoothstep(-1.2, 0.0, f - thr);
  vec3  floorCol = mix(c3 * 0.16 + c0 * 0.03, c3 * 0.30 + c1 * 0.05, 1.0 - wall);
  floorCol *= 1.0 - 0.35 * wall;

  // ---- shade the ridges as a matte relief with a small sheen
  vec3 lit = ridgeCol * (0.45 + 0.75 * diff * relief + 0.25 * (1.0 - relief));
  lit += (0.10 + 0.14 * relief) * spec * mix(vec3(1.0), c2, 0.4);

  vec3 col = mix(floorCol, lit, ridge);

  // seat the surface: gentle vignette
  vec2 vq = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0)) - 0.5;
  col *= 1.0 - 0.28 * smoothstep(0.25, 0.95, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
