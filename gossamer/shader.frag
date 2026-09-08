// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// gossamer (Veil) - aurora curtains. Several translucent sheets of light hang
// in a dark sky at different depths. Each sheet is a hem curve, a low
// frequency noise line that folds and drifts sideways, with light rising from
// it: brightest along a soft lower hem, fading diffusely upward, and combed
// into fine vertical striations that lean with the folds. Where a fold turns
// the sheet edge-on the striations bunch and brighten, so the curtain reads
// as a pleated surface seen from below rather than a flat wash. Sheets
// farther back sit higher, dimmer and drift slower; the nearest is tall,
// bright and quick. Colour climbs the palette with height, the hem in the
// first two stops and the diffuse top in the last two. The sky beneath keeps
// a faint horizon glow, a dim scatter of the upper palette and a sparse dust
// of stars, so the frame never falls to flat black.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // drift speed multiplier            (default 1.0)
uniform float u_gap;       // how much of each sheet is missing  (default 0.35)
uniform float u_glow;      // curtain brightness                 (default 1.3)
uniform float u_haze;      // sky glow and horizon haze          (default 0.12)
uniform float u_sheets;    // number of curtain layers, 1..4     (default 4)
uniform float u_striation; // fineness and contrast of the rays  (default 1.0)
uniform float u_height;    // how tall the curtains rise         (default 1.0)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black sky
const float TAU = 6.28318530718;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  float s = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), s);
}

// 1D fbm over x, three octaves
float fbm1(float x) {
  return 0.55 * vnoise1(x) + 0.30 * vnoise1(x * 2.13 + 7.7) + 0.15 * vnoise1(x * 4.71 + 19.3);
}

float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// one curtain sheet. x is the aspect-scaled horizontal coordinate, y is 0..1
// up the frame. Returns additive colour.
vec3 curtain(float x, float y, float fl, float t, float gap, float stri,
             float tall, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float seed  = fl * 37.1;
  float depth = fl / 3.0;                         // 0 nearest .. 1 farthest
  // farther sheets sit higher, drift slower, fold on a finer scale
  float base  = 0.12 + 0.46 * depth;
  float drift = t * (0.06 - 0.03 * depth) * (1.0 + 0.4 * fl);
  float xs    = x * (1.0 + 0.35 * depth) + drift + seed;

  // hem: a slow folding line, plus a finer ripple that travels the other way
  float hemN = fbm1(xs * 0.9 + seed) - 0.5;
  hemN += 0.35 * (fbm1(xs * 2.6 - t * 0.05 + seed * 1.7) - 0.5);
  hemN += 0.05 * sin(xs * 9.0 + t * 0.3 + seed);
  float hem = base + hemN * 0.22;

  // folds: where the hem line turns steeply the sheet is seen edge-on and
  // brightens; approximate the slope with a short finite difference
  float hemB = fbm1((xs + 0.02) * 0.9 + seed) - 0.5;
  float slope = abs(hemB - (fbm1(xs * 0.9 + seed) - 0.5)) * 50.0;
  float fold  = 0.55 + 0.9 * smoothstep(0.1, 0.9, slope);

  // presence: broad noise gates where the sheet exists along x, gap-controlled
  float pres = fbm2(vec2(xs * 0.55, seed + t * 0.02));
  pres = smoothstep(gap * 0.75, gap * 0.75 + 0.35, pres);

  // vertical profile: soft lower hem, tall diffuse upper fade
  float height = (0.42 - 0.06 * fl) * tall;
  float v  = y - hem;
  float up = max(v, 0.0) / height;
  float profile = smoothstep(-0.05, 0.015, v) * exp(-up * 1.7) * (1.0 - smoothstep(1.4, 2.6, up));
  // hot band just above the hem, the classic bright lower edge
  float hemBand = smoothstep(-0.03, 0.0, v) * (1.0 - smoothstep(0.0, 0.10, v));

  // striations: fine vertical rays that lean with the local fold and bunch
  // where the sheet is edge-on
  float lean = (fbm1(xs * 1.5 + seed + 3.0) - 0.5) * 0.9;
  float rx   = xs + v * lean;
  float dens = 42.0 * stri * (1.0 + 0.5 * fold);
  float rays = vnoise1(rx * dens + seed);
  rays = mix(1.0, rays * rays * 1.1 + 0.42, clamp(stri, 0.0, 1.0));
  rays *= 0.6 + 0.4 * vnoise1(rx * dens * 0.19 + seed + 5.0);
  rays *= 0.75 + 0.25 * vnoise1(rx * dens * 0.05 + seed + 9.0);
  // rays flicker upward as slow pulses climbing the sheet
  rays *= 0.8 + 0.2 * sin(up * 6.0 - t * 0.9 + rx * 3.0);

  float dim   = 1.0 - 0.28 * depth;
  float light = pres * profile * fold * rays * dim;
  light += pres * hemBand * fold * 0.5 * dim;

  // colour climbs the palette with height and each sheet starts one stop
  // further round, so the stack shows all four theme colours
  vec3 lowCol = fl < 0.5 ? c0 : fl < 1.5 ? c1 : fl < 2.5 ? c2 : c3;
  vec3 midCol = fl < 0.5 ? c1 : fl < 1.5 ? c2 : fl < 2.5 ? c3 : c0;
  vec3 hiCol  = fl < 0.5 ? c2 : fl < 1.5 ? c3 : fl < 2.5 ? c0 : c1;
  vec3 col    = mix(lowCol, midCol, smoothstep(0.0, 0.7, up));
  col = mix(col, hiCol, smoothstep(0.6, 1.6, up));
  col = mix(col, lowCol, 0.35 * hemBand);
  return col * light;
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = gl_FragCoord.xy / res;
  float asp = res.x / max(res.y, 1.0);
  float x   = uv.x * asp;
  float y   = uv.y;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t     = u_time * max(u_speed, 0.0);
  float gap   = clamp(u_gap, 0.0, 1.0);
  float stri  = max(u_striation, 0.0);
  float tall  = max(u_height, 0.2);
  float nSh   = clamp(u_sheets, 1.0, 4.0);

  // sky: faint horizon glow, a dim scatter of the upper palette, sparse stars
  vec3 col = BG;
  float hz  = max(u_haze, 0.0);
  float skyN = fbm2(vec2(x * 1.2, y * 2.0) + vec2(t * 0.01, 0.0));
  col += mix(c3, c0, 0.5) * hz * (1.0 - smoothstep(0.0, 0.5, y)) * (0.6 + 0.4 * skyN);
  col += mix(c2, c3, skyN) * hz * 0.9 * skyN * smoothstep(0.2, 1.0, y);
  col += mix(c3, c2, 0.5) * hz * 0.25 * smoothstep(0.5, 1.0, y);
  vec2  sp = gl_FragCoord.xy / max(u_pixelRatio, 0.5) * 0.5;
  float sh = hash21(floor(sp));
  float star = smoothstep(0.985, 1.0, sh) * (0.5 + 0.5 * sin(t * 2.0 + sh * 90.0));
  col += vec3(0.55, 0.6, 0.7) * star * 0.35 * smoothstep(0.15, 0.6, y);

  // sheets back to front so the near one lands on top
  vec3 acc = vec3(0.0);
  if (nSh > 3.5) acc += curtain(x, y, 3.0, t, gap, stri, tall, c0, c1, c2, c3);
  if (nSh > 2.5) acc += curtain(x, y, 2.0, t, gap, stri, tall, c0, c1, c2, c3);
  if (nSh > 1.5) acc += curtain(x, y, 1.0, t, gap, stri, tall, c0, c1, c2, c3);
  acc += curtain(x, y, 0.0, t, gap, stri, tall, c0, c1, c2, c3);
  col += acc * max(u_glow, 0.0);

  // soft shoulder so overlapping sheets glow rather than clip
  col = col / (1.0 + col * 0.35);

  // hash dither against banding in the broad fades
  col += (hash21(gl_FragCoord.xy + fract(t)) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
