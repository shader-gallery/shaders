// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// dendrite (Strand) - crystal growing across a cold dark pane. Three seeds,
// each on its own slow cycle, throw out a star of straight trunks; every
// trunk grows side branches at a fixed angle and spacing, and every side
// branch grows its own smaller branchlets by the same rule. Nothing is a
// cell: the whole structure is open segments, and a pixel measures its
// distance to a handful of them. Which handful is found by projection: the
// two trunks that bracket the pixel in angle, the three side branches whose
// roots sit just up-trunk of where a branch at that angle would have to
// start to pass under the pixel, and the two branchlets found the same way
// one level down. Growth is a law, not a picture: a branch begins only when
// its parent tip has passed its root and then lengthens at a fixed rate, so
// the fern envelope (long branches near the seed, short ones near the tip)
// simply falls out of time. The advancing tips are the growth front and glow;
// the settled crystal behind them cools to a frost white with a faint haze of
// fine ice around dense growth. Behind the glass a blurred cold light field
// fills the frame. Each seed melts back and re-forms elsewhere.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_arms;     // trunks per seed                        (default 6)
uniform float u_angle;    // side-branch angle from the trunk, deg  (default 60)
uniform float u_density;  // side-branch spacing, 1 = normal        (default 1.0)
uniform float u_growth;   // growth and cycle speed                 (default 1.0)
uniform float u_glow;     // tip glow and frost haze                (default 1.0)

const float PI  = 3.14159265359;
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
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

// ---- accumulators
float gCore = 0.0;   // settled crystal, screen-blended
float gHaze = 0.0;   // fine ice haze around growth
float gTip  = 0.0;   // growth-front glow
float gPr   = 2.0;   // device px per css px
float gPx   = 400.0; // device px per frame unit
float gT    = 0.0;
float gFade = 1.0;   // melt fade of the seed being drawn

// growth rates in frame units per second, one per level
const float V0 = 0.085;
const float V1 = 0.050;
const float V2 = 0.030;

// one crystal segment from A along unit dir, current length L of a possible
// Lmax; wpx is the root width in css px, id seeds the glitter
void seg(vec2 p, vec2 A, vec2 dir, float L, float Lmax, float wpx, float id, float tipK) {
  if (L <= 0.0005) return;
  vec2  pa = p - A;
  float h  = clamp(dot(pa, dir), 0.0, L);
  vec2  v  = pa - dir * h;
  float d  = length(v) * gPx;                 // device px off the segment
  float u  = h / max(L, 1e-4);
  float w  = max(wpx * gPr * (1.0 - 0.55 * u), 0.5);
  float core = exp(-d * d / (2.0 * w * w)) * min(1.0, wpx * gPr / 0.7);
  // ice is faceted: brightness glitters along the length, slowly shifting
  float gl = vnoise(vec2(h * gPx / (7.0 * gPr) + id * 3.0, id + gT * 0.15));
  core *= 0.55 + 0.75 * smoothstep(0.25, 0.95, gl);
  // kept tight so it dies well before the candidate-branch handover distance
  float haze = exp(-d / (4.5 * gPr)) * min(1.0, wpx);
  // the advancing tip glows while the segment is still growing
  float dt = length(pa - dir * L) * gPx;
  float growing = 1.0 - smoothstep(0.80, 1.0, L / max(Lmax, 1e-4));
  float tr = 2.2 * gPr * (0.5 + 0.5 * wpx);
  float tip = exp(-dt * dt / (2.0 * tr * tr)) * growing * tipK;
  gCore = 1.0 - (1.0 - gCore) * (1.0 - core * gFade);
  gHaze += haze * gFade;
  gTip  = max(gTip, tip * gFade);
}

// one trunk and everything that grows off it. th is the trunk angle, age the
// seconds since the seed formed, sid a per-trunk seed. ang/ca/sa are the
// side-branch angle and its cos/sin; sp1/sp2 the root spacings per level.
void trunk(vec2 p, vec2 seed, float th, float age, float sid,
           float ang, float ca, float sa, float sp1, float sp2) {
  vec2  dir = vec2(cos(th), sin(th));
  vec2  nrm = vec2(-dir.y, dir.x);
  vec2  d   = p - seed;
  float along = dot(d, dir);
  float perp  = dot(d, nrm);
  float side  = perp < 0.0 ? -1.0 : 1.0;
  float ap    = abs(perp);
  float cot   = ca / max(sa, 0.05);

  float L0max = 0.80 + 0.40 * hash21(vec2(sid, 1.7));
  float L0    = min(V0 * age, L0max);
  seg(p, seed, dir, L0, L0max, 1.25, sid, 1.0);

  // side branches on the pixel side of the trunk. Root spacing sp1, the two
  // sides staggered by a quarter step so they alternate like a fern.
  float nOff = 0.5 + 0.25 * side;
  float n0   = floor((along - ap * cot) / sp1 - nOff);
  for (int j = 0; j < 3; j++) {
    float n  = n0 + float(j) - 1.0;
    if (n < 0.0) continue;
    float hn  = hash21(vec2(n + sid * 3.1, sid + 7.3));
    float hn2 = hash21(vec2(n + sid * 5.7, sid + 2.9));
    float s1  = (n + nOff + (hn - 0.5) * 0.25) * sp1;
    if (s1 > L0) continue;                       // trunk has not reached it
    float age1 = age - s1 / V0;
    // a small angular jitter keeps the fern from looking machined
    float a1 = th + side * (ang + (hn2 - 0.5) * 0.14);
    vec2  b1 = vec2(cos(a1), sin(a1));
    vec2  P1 = seed + dir * s1;
    // branches near the root of a trunk may grow long; toward the tip they
    // get less room, and every branch has its own final size
    float L1max = (0.13 + 0.22 * hn) * (1.0 - 0.55 * s1 / L0max);
    float L1    = clamp(V1 * age1, 0.0, L1max);
    if (L1 <= 0.0) continue;
    seg(p, P1, b1, L1, L1max, 0.75, sid + n * 0.37, 0.7);

    // branchlets off this side branch, found by the same projection
    vec2  n1  = vec2(-b1.y, b1.x);
    vec2  e   = p - P1;
    float al2 = dot(e, b1);
    float pe2 = dot(e, n1);
    float sd2 = pe2 < 0.0 ? -1.0 : 1.0;
    float mOff = 0.5 + 0.25 * sd2;
    float m0  = floor((al2 - abs(pe2) * cot) / sp2 - mOff);
    for (int k = 0; k < 2; k++) {
      float m  = m0 + float(k);
      if (m < 0.0) continue;
      float hm = hash21(vec2(m + n * 1.3, sid * 2.1 + 4.4));
      float s2 = (m + mOff) * sp2;
      if (s2 > L1) continue;
      float age2 = age1 - s2 / V1;
      float a2 = a1 + sd2 * ang;
      vec2  b2 = vec2(cos(a2), sin(a2));
      float L2max = (0.03 + 0.045 * hm) * (1.0 - 0.5 * s2 / max(L1max, 1e-3));
      float L2 = clamp(V2 * age2, 0.0, L2max);
      seg(p, P1 + b1 * s2, b2, L2, L2max, 0.5, sid + n * 0.53 + m * 0.11, 0.25);
    }
  }
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  gPr = max(u_pixelRatio, 0.5);
  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  p      = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;   // y in -1..1
  gPx          = u_resolution.y * 0.5;
  float speed  = clamp(u_growth, 0.0, 3.0);
  gT           = u_time * speed;
  float M      = floor(clamp(u_arms, 3.0, 8.0));
  float sw     = TAU / M;
  float ang    = radians(clamp(u_angle, 25.0, 85.0));
  float ca = cos(ang), sa = sin(ang);
  float dens   = clamp(u_density, 0.4, 2.5);
  float sp1    = 0.085 / dens;
  float sp2    = 0.032 / dens;
  float glow   = clamp(u_glow, 0.0, 2.0);

  // ---- three seeds on staggered form / melt cycles
  const float PERIOD = 44.0;
  for (int i = 0; i < 3; i++) {
    float fi    = float(i);
    float birth = (i == 0) ? -16.0 : ((i == 1) ? -5.0 : 2.5);
    float tt    = gT - birth + PERIOD * 4.0;
    float cyc   = floor(tt / PERIOD);
    float age   = tt - cyc * PERIOD;
    gFade = 1.0 - smoothstep(PERIOD - 5.0, PERIOD - 0.5, age);
    if (gFade < 0.002) continue;
    float sd    = 2.3 + fi * 4.7 + cyc * 0.61;
    vec2 home = (i == 0) ? vec2(-0.85, 0.22) : ((i == 1) ? vec2(0.72, -0.30) : vec2(0.05, 0.62));
    home.x *= aspect / 1.6;
    vec2 jit = vec2(hash21(vec2(cyc + fi, 3.3)), hash21(vec2(cyc + fi, 9.1))) - 0.5;
    vec2 seed = home + jit * 0.45;
    float rot = hash21(vec2(sd, 0.7)) * TAU;
    vec2  dv  = p - seed;
    float phi = atan(dv.y, dv.x);
    float k0  = floor((phi - rot) / sw - 0.5);
    // the two trunks bracketing this pixel in angle
    for (int a = 0; a < 2; a++) {
      float k  = k0 + float(a);
      float km = mod(k, M);
      float th = rot + (k + 0.5) * sw;
      trunk(p, seed, th, age, sd + km * 1.31, ang, ca, sa, sp1, sp2);
    }
  }

  // ---- the pane: cold dark glass with a blurred light field behind it
  vec3  deep = mix(c3, c0, 0.4);
  float lumD = dot(deep, vec3(0.299, 0.587, 0.114));
  deep = mix(vec3(lumD), deep, 0.6);
  float lf   = fbm(p * 0.55 + vec2(3.0, 1.0) + gT * 0.012);
  float blob = smoothstep(0.42, 0.85, lf);
  float wash = fbm(p * 1.3 + vec2(7.0, 2.0) - gT * 0.008);
  // a second, softer light source low in the frame so no corner goes dead
  float lf2   = fbm(p * 0.4 + vec2(11.0, 6.0) - gT * 0.009);
  float blob2 = smoothstep(0.50, 0.90, lf2);
  vec3  glass = deep * 0.14 + vec3(0.028);
  glass += mix(c0, c1, smoothstep(-1.0, 1.0, p.y)) * (0.30 * blob);
  glass += mix(c1, c2, 0.5) * (0.16 * blob2);
  glass += mix(c2, c0, 0.5) * (0.08 * wash);
  glass *= 0.85 + 0.25 * uv.y;

  // ---- the crystal
  vec3  frost = mix(c2, vec3(1.0), 0.62);
  float haze  = clamp(gHaze, 0.0, 4.0);
  vec3  col   = glass;
  // fine ice haze around dense growth, tinted by the cool pole
  col += mix(c2, c0, 0.35) * haze * 0.07 * (0.6 + 0.4 * glow);
  // settled crystal: frost white, slightly translucent over the light field
  col = mix(col, frost * (0.72 + 0.25 * blob), gCore * 0.82);
  // the growth front
  col += mix(vec3(1.0), c1, 0.3) * gTip * 1.1 * glow;

  gl_FragColor = vec4(col, 1.0);
}
