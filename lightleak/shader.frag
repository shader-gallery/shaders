// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// lightleak (Veil) - a strip of film fogged by light leaking into the camera.
// The frame is a dark emulsion base with a faint uneven fog. Light bleeds in
// from the frame edges as broad soft blooms: each leak is hottest against the
// edge it enters from, going near white there, then cools through the warm
// pole into the cool pole as it feathers out into the dark. The leak edges
// are torn and irregular from a slow domain warp, and the leaks breathe and
// slide along their edges over long periods. Across all of it lie anamorphic
// streaks: long thin horizontal flares stretched the full width of the frame,
// each with a soft bright source, a gentle vertical spread and a broken,
// flickering length. A soft halation glow sits under every bright thing, so
// nothing has a hard edge. Slow and cinematic; nothing snaps.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_leak;     // strength of the edge light leaks     (default 1.0)
uniform float u_streak;   // strength of the anamorphic streaks   (default 0.9)
uniform float u_warmth;   // hot centre push toward white         (default 0.6)
uniform float u_spread;   // how far the leaks reach into frame   (default 1.0)
uniform float u_speed;    // pace of the sweep and flicker        (default 0.3)

const float TAU = 6.28318530718;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// 1D value noise, smooth
float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  float s = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), s);
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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// one light leak entering from a frame edge. d is the distance into the frame
// from that edge (0 at the edge), s is the coordinate along the edge, both in
// frame units. cen and wid place the leak along the edge, reach says how far
// it bleeds in. Returns x: body 0..1 with a plateau and a torn boundary,
// y: normalised depth into the frame (for the colour ramp), z: a wide faint
// outer feather.
vec3 leak(float d, float s, float cen, float wid, float reach, float warp) {
  float along = (s - cen) / wid;
  float a = exp(-along * along * 1.6);
  // the boundary is pushed in and out by the warp so it tears like a real
  // leak instead of a clean gradient
  float depth = d / max(reach, 1e-3) * (1.0 + 0.7 * warp);
  // cubic falloff: a plateau against the edge, then a fairly quick die-off,
  // so the leak has a shape and the dark behind it stays dark
  float d3    = depth * depth * depth;
  float body  = exp(-d3 * 1.2) * a;
  // a hotter thin lip right at the edge
  float lip   = exp(-depth * 5.0) * a;
  // fine bands running in from the edge, the way light travelling along the
  // film strip streaks the fog; two frequencies, gentle
  float band  = 0.78 + 0.22 * vnoise1(s * 9.0 + warp * 4.0) + 0.14 * (vnoise1(s * 27.0 + 5.0) - 0.5);
  // a wider, much fainter outer feather
  float dep2  = depth * 0.5;
  float feath = exp(-dep2 * dep2 * 1.5) * exp(-along * along * 0.8);
  return vec3((body + lip * 0.6) * band, depth, feath);
}

// colour a leak from its depth: hot lip, warm body, cool at the boundary
vec3 leakRamp(float depth, vec3 hotC, vec3 warmC, vec3 coolC) {
  vec3 c = mix(hotC, warmC, smoothstep(0.0, 0.42, depth));
  return mix(c, coolC, smoothstep(0.45, 1.15, depth));
}

// one anamorphic streak: a horizontal line at height y0 with a source at x0.
// Thin gaussian across, long soft falloff along, broken by 1D noise so the
// length flickers, plus a soft round source glow.
vec2 streak(vec2 p, float y0, float x0, float len, float th, float t, float seed) {
  float dy  = (p.y - y0) / th;
  float dx  = p.x - x0;
  float acr = exp(-dy * dy * 2.0);
  float alo = exp(-abs(dx) / len) * (0.45 + 0.55 * exp(-abs(dx) / 0.18));
  // the streak is brighter on one side of the source (anamorphic flares are
  // asymmetric) and broken up along its length
  float side = 1.0 - 0.35 * step(0.0, dx * seed);
  float brk  = 0.55 + 0.45 * vnoise1(p.x * 3.0 + seed * 13.0 + t * 0.3);
  float line = acr * alo * side * brk;
  // a wider, fainter vertical spread behind the line
  float halo = exp(-dy * dy * 0.08) * alo * 0.16;
  // the source itself, a soft disc
  float src  = exp(-(dx * dx * 0.5 + (p.y - y0) * (p.y - y0)) * 900.0);
  return vec2(line + halo, src);
}

// pick the warmest and coolest poles by red minus blue, with no dynamic
// indexing, so the leaks are always warm and the streaks always cool in any
// theme that has both
void warmCool(vec3 c0, vec3 c1, vec3 c2, vec3 c3, out vec3 warm, out vec3 cool) {
  float w0 = c0.r - c0.b, w1 = c1.r - c1.b, w2 = c2.r - c2.b, w3 = c3.r - c3.b;
  warm = c0; float wb = w0;
  if (w1 > wb) { warm = c1; wb = w1; }
  if (w2 > wb) { warm = c2; wb = w2; }
  if (w3 > wb) { warm = c3; wb = w3; }
  cool = c0; float cb = w0;
  if (w1 < cb) { cool = c1; cb = w1; }
  if (w2 < cb) { cool = c2; cb = w2; }
  if (w3 < cb) { cool = c3; cb = w3; }
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float leakA  = clamp(u_leak, 0.0, 3.0);
  float strA   = clamp(u_streak, 0.0, 3.0);
  float hot    = clamp(u_warmth, 0.0, 1.0);
  float reach  = max(u_spread, 0.1);

  // ---- colours. Leaks run hot-white at the lip, through the warm pole, into
  // the cool pole at the feather. Streaks take the cool pole lifted toward
  // white. The base is a near-black emulsion with a whisper of the mid pole.
  vec3 warm, cool;
  warmCool(c0, c1, c2, c3, warm, cool);
  warm = clamp(mix(vec3(luma(warm)), warm, 1.3), 0.0, 1.0);
  vec3 mid     = mix(c1, c2, 0.5);
  vec3 hotCol  = mix(warm, vec3(1.0, 0.97, 0.9), 0.35 + 0.55 * hot);
  vec3 coolCol = cool * (0.45 / max(luma(cool), 0.05));
  vec3 strCol  = mix(cool, vec3(1.0), 0.30);
  vec3 base    = vec3(0.012, 0.012, 0.018) + mix(vec3(luma(cool)), cool, 0.6) * 0.03;

  // ---- emulsion fog: a slow, uneven lift across the whole frame so the dark
  // is never flat black, brighter toward the leaks
  float fog = fbm(p * 1.3 + vec2(0.03 * t, -0.02 * t));

  // ---- domain warp for torn leak boundaries, slow
  float warpA = fbm(p * 2.2 + vec2(0.05 * t, 0.07 * t) + 3.0) - 0.5;
  float warpB = fbm(p * 1.4 + vec2(-0.04 * t, 0.05 * t) + 9.0) - 0.5;

  // ---- the leaks. Four of them on their own long periods: a big one from
  // the right edge, one from the left, a low one along the bottom, and a thin
  // one across the top. Each breathes in intensity and slides along its edge.
  float ax = aspect * 0.5;
  // right edge, the main leak, tall and slow
  float r1c = 0.05 + 0.20 * sin(t * 0.11);
  float r1w = 0.55 + 0.10 * sin(t * 0.07 + 1.0);
  float r1b = 0.75 + 0.25 * sin(t * 0.09 + 2.0);
  vec3  L1 = leak(ax - p.x, p.y + 0.35 * warpB, r1c, r1w, 0.42 * reach, warpA);
  // left edge, smaller, lower
  float l2c = -0.15 + 0.18 * sin(t * 0.13 + 4.0);
  float l2b = 0.55 + 0.45 * sin(t * 0.08 + 0.7);
  vec3  L2 = leak(p.x + ax, p.y + 0.30 * warpA, l2c, 0.38, 0.30 * reach, warpB);
  // bottom edge, a long low wash sliding sideways
  float b3c = 0.3 * sin(t * 0.06 + 1.3);
  float b3b = 0.45 + 0.35 * sin(t * 0.10 + 3.1);
  vec3  L3 = leak(p.y + 0.5, p.x + 0.4 * warpA, b3c, 0.9, 0.16 * reach, warpB);
  // top edge, a thin sliver that comes and goes
  float t4c = 0.4 * sin(t * 0.05 + 2.6);
  float t4b = 0.35 + 0.35 * sin(t * 0.12 + 5.0);
  vec3  L4 = leak(0.5 - p.y, p.x + 0.3 * warpB, t4c, 0.6, 0.12 * reach, warpA);

  // a thin diagonal streak sweeping slowly across the whole frame, the leak
  // that enters when the camera back is opened a crack: a bright line in a
  // soft halo, warm, with torn edges
  vec2  dir  = normalize(vec2(0.55, 1.0));
  float sw   = dot(p, dir) - 0.9 * sin(t * 0.045) + 0.14 * warpA;
  float swA  = dot(p, vec2(-dir.y, dir.x));
  float swB  = (0.5 + 0.5 * sin(t * 0.07 + 1.2)) * (0.7 + 0.5 * vnoise1(swA * 4.0 + t * 0.1));
  float L5   = (exp(-sw * sw / 0.004) * 0.55 + exp(-sw * sw / 0.05) * 0.40) * swB;

  vec3 leakCol = vec3(0.0);
  leakCol += leakRamp(L1.y, hotCol, warm, coolCol) * L1.x * r1b * 1.0;
  leakCol += leakRamp(L2.y, mix(hotCol, cool, 0.3), mix(warm, cool, 0.5), coolCol) * L2.x * l2b * 0.8;
  leakCol += leakRamp(L3.y, mix(hotCol, warm, 0.5), warm, coolCol) * L3.x * b3b * 0.5;
  leakCol += leakRamp(L4.y, hotCol, mix(warm, cool, 0.5), coolCol) * L4.x * t4b * 0.5;
  float feather = L1.z * r1b * 0.9 + L2.z * l2b * 0.7 + L3.z * b3b * 0.5 + L4.z * t4b * 0.5;
  leakCol += coolCol * feather * 0.07;
  leakCol += mix(warm, hotCol, 0.55) * L5 * 0.55;
  leakCol *= leakA;
  float lk1 = L1.x * r1b, lk2 = L2.x * l2b;

  // ---- anamorphic streaks. Five horizontal flares at different heights,
  // drifting slowly up and down, sources sliding along their length.
  vec3  strSum = vec3(0.0);
  float srcSum = 0.0;
  for (int i = 0; i < 5; i++) {
    float k   = float(i);
    float y0  = -0.42 + k * 0.21 + 0.06 * sin(t * (0.10 + 0.02 * k) + k * 1.9);
    float x0  = (0.9 * hash11(k + 3.0) - 0.45) * aspect + 0.25 * sin(t * (0.05 + 0.015 * k) + k * 2.7);
    float len = 0.45 + 0.5 * hash11(k + 7.0);
    float th  = 0.006 + 0.012 * hash11(k + 11.0);
    float br  = (0.5 + 0.7 * hash11(k + 19.0)) * 2.2;
    // slow breathing per streak so they come and go
    br *= 0.55 + 0.45 * sin(t * (0.14 + 0.03 * k) + k * 4.1);
    float seed = hash11(k + 23.0) * 2.0 - 1.0;
    vec2  st  = streak(p, y0, x0, len, th, t, seed);
    // streaks take on some of whatever leak they cross
    vec3  sc  = mix(strCol, hotCol, 0.35 * clamp(lk1 + lk2, 0.0, 1.0));
    strSum += sc * st.x * br * 2.0;
    srcSum += st.y * br;
  }
  strSum *= strA;
  // the streak sources are hot little blooms
  vec3 srcCol = mix(strCol, vec3(1.0), 0.6) * srcSum * strA * 1.3;

  // ---- halation: a broad soft glow under the bright stuff, from the leaks
  // and the streak sources
  float bright = luma(leakCol) + srcSum * 0.6;
  vec3  hal    = mix(warm, cool, 0.5) * bright * bright * 0.12;

  // ---- compose
  vec3 col = base * (0.6 + 0.8 * fog);
  col += hal;
  col += leakCol;
  col += strSum;
  col += srcCol;

  // film roll-off on luminance, bleaching to white at the hottest lips
  float L  = max(luma(col), 1e-4);
  float Lc = 1.0 - exp(-L * 1.25);
  col *= Lc / L;
  col = mix(col, vec3(Lc), smoothstep(0.7, 1.0, Lc));
  // a whisper of lifted blacks, the way scanned film never quite hits zero
  col = col * 0.97 + 0.012;

  gl_FragColor = vec4(col, 1.0);
}
