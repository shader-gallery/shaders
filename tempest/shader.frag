// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Tempest - two ranks of towering storm clouds recede over a dark sea toward
// a vanishing point in the right third, the near masses huge on the left and
// the far rank lower on the right. Each tower is raymarched cloud lit from
// inside by a slow light that climbs and sinks through it and swells and
// fades, never flashing, so lobes and anvils glow like lanterns behind wool.
// A torn overcast deck hangs above, catching the glow from below. Under every
// tower hangs a rain curtain of fine slanted threads gathered into pleats that
// breathe open and shut, and the sea mirrors the glowing bases as the eye
// drifts forward along the squall line.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // strength of the lights burning inside the clouds   (default 1.0)
uniform float u_rain;   // density and gather of the rain curtains            (default 0.8)
uniform float u_drift;  // speed of the drift forward and of the inner lights (default 0.5)

const float P    = 6.5;   // tower spacing along each rank
const float XL   = -4.2;   // left rank offset
const float XR   = 7.5;    // right rank offset
const float XM   = 1.2;    // boundary between the ranks
const float CAMY = 0.45;   // eye height above the sea
const float VPX  = 0.22;   // vanishing point, screen x
const float HZ   = -0.24;  // horizon, screen y
const mat3 RM = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

vec3 c0, c1, c2, c3;
float gT, gGlow, gRain;

float hh(float n) {
  return fract(sin(n * 12.9187 + 3.71) * 27183.417);
}

// lattice hash without large sine arguments, stable far from the origin
float h3(vec3 i) {
  vec3 q = fract(i * vec3(0.1379, 0.1627, 0.1459));
  q += dot(q, q.yzx + 23.71);
  return fract((q.x + q.y) * q.z);
}

float vn3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    s += a * vn3(p);
    p = RM * p * 2.07 + vec3(1.7, 4.3, 2.9);
    a *= 0.5;
  }
  return s / 0.9375;
}

// tower centre x, centre z, top height and a shape seed for cell k of a rank
vec4 towerInfo(float k, float side) {
  float sd = k * 7.31 + side * 19.7;
  float cx = mix(XL, XR, side) + (hh(sd) - 0.5) * 1.4 * (1.0 + side);
  float cz = (k + 0.5) * P + (hh(sd + 2.0) - 0.5) * 1.6;
  float top = mix(4.5, 10.5, hh(sd + 4.0)) * mix(1.0, 0.8, side);
  return vec4(cx, cz, top, hh(sd + 6.0));
}

// the slow light inside a tower: position and strength
vec4 towerLight(float k, float side, vec4 ti) {
  float sd = k * 3.17 + side * 11.3;
  float per = mix(10.0, 19.0, hh(sd));
  float ph = gT * 6.2831853 / per + hh(sd + 1.0) * 6.2831853;
  float y = mix(2.4, ti.z - 1.2, 0.5 + 0.5 * sin(ph));
  float yn = y / ti.z;
  float lvl = 0.2 + 0.8 * smoothstep(0.1, 0.95, 0.5 + 0.5 * sin(ph * 0.57 + hh(sd + 2.0) * 9.0));
  lvl *= mix(0.35, 1.0, step(0.22, hh(sd + 5.0)));
  return vec4(ti.x + 0.7 * sin(ph * 0.7 + 1.3) + 1.3 * yn * yn, y, ti.y + 0.5 * cos(ph), lvl * gGlow);
}

float cloudBase(vec4 ti) {
  return 1.5 + 0.6 * ti.w;
}

// signed distance to the smooth hull of a tower before erosion
float towerHull(vec3 p, vec4 ti) {
  float y0 = cloudBase(ti);
  float yn = clamp((p.y - y0) / (ti.z - y0), 0.0, 1.0);
  vec2 q = vec2(p.x - ti.x - 1.3 * yn * yn, p.z - ti.y);
  float r = 2.3 + 0.55 * sin(yn * 6.0 + ti.w * 6.0) - 0.6 * yn
          + 2.4 * smoothstep(0.76, 1.0, yn) * (0.55 + 0.45 * ti.w);
  float radial = length(q * vec2(1.0, 1.2)) - r;
  float vert = max(y0 - p.y, (p.y - ti.z) * 1.6);
  return max(radial, vert);
}

// cauliflower lobes: eroded hull with billows rolling slowly upward
float towerDens(vec3 p, vec4 ti, float hull) {
  vec3 w = p * vec3(0.62, 0.55, 0.62) + vec3(gT * 0.03, -gT * 0.06, ti.w * 9.0);
  float n = fbm3(w);
  float sdf = hull + (n - 0.5) * 2.4 - 0.15;
  return clamp(-sdf * 1.1, 0.0, 1.0);
}

// heddle gather: fine slanted threads crowded into pleats that breathe
float rainDens(vec3 p, vec4 ti, float s) {
  float y0 = cloudBase(ti);
  if (p.y > y0 + 0.5) return 0.0;
  float u = p.x - ti.x + 0.3 * (y0 - p.y);
  float v = p.z - ti.y;
  float sheet = exp(-u * u * 0.35 - v * v * 0.5);
  float g = min(gRain, 1.2);
  float ph = u * 0.5 - gT * 0.08 + 0.25 * sin(p.y * 1.3 - gT * 0.3);
  float amp = 0.85 * min(g, 1.0);
  float w = u * 7.0 + amp * (7.0 / 3.1416) * sin(6.2831853 * ph);
  float crowd = 1.0 + amp * cos(6.2831853 * ph);
  float tf = abs(fract(w) - 0.5) * 2.0;
  float thread = smoothstep(0.45, 0.0, tf);
  thread = mix(thread, 0.25, smoothstep(10.0, 30.0, s));
  float fall = 0.5 + 0.5 * vn3(vec3(floor(w) * 1.7, p.y * 2.5 + gT * 2.4, 0.0));
  float pleat = 0.2 + 1.0 * smoothstep(0.7, 1.8, crowd);
  float fade = smoothstep(y0 + 0.5, y0 - 0.2, p.y);
  return sheet * thread * fall * pleat * fade * g;
}

vec3 skyCol(vec3 rd) {
  float up = clamp(rd.y, 0.0, 1.0);
  float vpd = length(vec2(rd.x - 0.0, rd.y) * vec2(0.5, 2.4));
  vec3 base = c3 * c3 * 0.16 + c0 * c0 * 0.05;
  return base * (1.0 - 0.7 * up) + c0 * 0.08 * exp(-vpd * 3.0) + c1 * 0.04 * exp(-up * 14.0);
}

// deep blue body through teal and sea green to a pale mint core
vec3 glowRamp(float x) {
  x = clamp(x, 0.0, 1.6);
  vec3 a = mix(c3 * 0.5, c0, smoothstep(0.0, 0.45, x));
  a = mix(a, c1, smoothstep(0.4, 0.85, x));
  return mix(a, c2 * 1.1, smoothstep(0.8, 1.45, x));
}

float lightAt(vec3 q, vec4 l) {
  float d = length(q - l.xyz);
  return l.w * (exp(-d * 0.9) * 1.2 + exp(-d * 0.3) * 0.25);
}

void main() {
  vec2 res = u_resolution;
  float px = 1.0 / max(res.y, 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) * px;

  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float drift = max(u_drift, 0.0);
  gT = u_time * (0.25 + drift * 1.5) + 20.0;
  gGlow = max(u_glow, 0.0);
  gRain = max(u_rain, 0.0);

  vec3 ro = vec3(0.4 * sin(gT * 0.03), CAMY, gT * 0.4);
  vec3 rd = normalize(vec3(uv.x - VPX, uv.y - HZ, 1.2));

  vec3 col = vec3(0.0);
  float T = 1.0;
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(17.13, 91.71))) * 31517.29);
  float s = 0.1 + 0.2 * jit;
  float refl = 1.0;
  bool mirrored = false;

  for (int i = 0; i < 64; i++) {
    vec3 q = ro + rd * s;
    if (q.y < 0.0 && !mirrored) {
      // the sea: carry on along the mirrored ray, ruffled and dimmed
      float tg = ro.y / max(-rd.y, 1e-4);
      vec3 hp = ro + rd * tg;
      float rip = vn3(vec3(hp.x * 1.5, hp.z * 0.35, gT * 0.25)) - 0.5;
      ro = hp;
      rd = normalize(vec3(rd.x + rip * 0.05, -rd.y + rip * 0.03, rd.z));
      s = 0.05 + 0.2 * jit;
      refl = 0.45;
      mirrored = true;
      q = ro + rd * s;
    }
    if (s > 70.0 || T < 0.02 || q.y > 12.0) break;

    float side = step(XM, q.x);
    float k = floor(q.z / P);
    // the nearer of this cell and the neighbour so towers overlap the seams
    float kn = k + (fract(q.z / P) > 0.5 ? 1.0 : -1.0);
    vec4 ti = towerInfo(k, side);
    vec4 tj = towerInfo(kn, side);
    float hull = towerHull(q, ti);
    float hj = towerHull(q, tj);
    if (hj < hull) { hull = hj; ti = tj; k = kn; }
    float dt = min(0.16 + 0.035 * s, 1.1);

    float dc = hull < 1.4 ? towerDens(q, ti, hull) : 0.0;
    float dr = rainDens(q, ti, s);

    // torn overcast deck so the upper sky holds cloud
    float deck = 0.0;
    if (q.y > 5.0) {
      float dn = fbm3(q * vec3(0.14, 0.4, 0.11) + vec3(gT * 0.015, 0.0, 0.0));
      deck = smoothstep(0.34, 0.7, dn) * smoothstep(5.0, 7.5, q.y) * 0.7;
    }
    float dens = dc + deck;

    if (dens + dr > 0.002) {
      vec4 la = towerLight(k, side, ti);
      vec4 tb = towerInfo(k, 1.0 - side);
      vec4 lb = towerLight(k, 1.0 - side, tb);
      vec4 tn = towerInfo(k + 1.0, side);
      vec4 lc = towerLight(k + 1.0, side, tn);
      float e = lightAt(q, la) + 0.7 * lightAt(q, lb) + 0.7 * lightAt(q, lc);
      vec3 emit = glowRamp(e * 1.5) * e * 2.6;
      vec3 amb = c3 * c3 * 0.12 + c0 * c0 * 0.04;
      // the deck takes a broad wash from the fires below
      float ed = la.w * exp(-length(q - la.xyz) * 0.16) + 0.6 * lb.w * exp(-length(q - lb.xyz) * 0.16);
      vec3 deckAmb = c3 * c3 * 0.35 + c0 * c0 * 0.10 + mix(c3, c0, 0.6) * ed * 0.35;
      vec3 lit = (emit + amb) * dc + (emit + deckAmb) * deck
               + (glowRamp(e * 1.3 + 0.2) * (e * 5.0 + 0.12)) * dr;
      float fog = exp(-s * 0.02);
      col += T * lit * dt * refl * fog;
      T *= exp(-(dens * 2.0 + dr * 0.5) * dt);
    } else if (hull > 2.0 && q.y > 1.0) {
      // skip clear air between towers
      dt = max(dt, min(hull - 1.6, 2.0));
    }
    s += dt;
  }

  vec3 sky = mirrored ? skyCol(vec3(rd.x, 0.03, rd.z)) * 0.55 : skyCol(rd);
  col += T * sky;

  col = 1.0 - exp(-col * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
