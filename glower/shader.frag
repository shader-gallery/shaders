// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Glower - a line of storm towers at night over a dark plain, receding to
// the right from a big cumulonimbus at the left third. Slow glows wander
// inside the cloud masses and swell and fade over many seconds, never a
// flash: the billows nearest a glow turn pale and the deep cloud around it
// holds the violet. The bases take the warm sodium light of a town on the
// plain, rain hangs in grey curtains under the far towers, and a flooded
// field in front mirrors the glows above a dark ridge.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // strength of the glows inside the clouds (default 1.0)
uniform float u_churn;  // how fast the towers boil and the glows wander (default 1.0)
uniform float u_town;   // warm town light on the cloud bases and plain (default 1.0)

const float BASE = 1.7;    // cloud base height above the eye
const float GND = -0.6;    // the plain, below the eye
const float HOR = -0.28;   // screen height of the horizon

vec3 C0; vec3 C1; vec3 C2; vec3 C3;
vec3 V0; vec3 V3;
float T; float TT; float GLOW; float TOWN; float PX;
vec3 L0; vec3 L1; vec3 L2; vec3 L3;
vec4 K0; vec4 K1; vec4 K2; vec4 K3;
vec3 WARM;

float hv(vec3 p) {
  return fract(sin(dot(p, vec3(17.137, 53.291, 91.417)) + 1.37) * 6263.71);
}

float hp(vec2 p) {
  return fract(sin(dot(p, vec2(38.711, 72.153)) + 0.83) * 8173.29);
}

float nz3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hv(i), hv(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hv(i + vec3(0.0, 1.0, 0.0)), hv(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hv(i + vec3(0.0, 0.0, 1.0)), hv(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hv(i + vec3(0.0, 1.0, 1.0)), hv(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float nz2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hp(i), hp(i + vec2(1.0, 0.0)), f.x),
             mix(hp(i + vec2(0.0, 1.0)), hp(i + vec2(1.0, 1.0)), f.x), f.y);
}

// billow noise: rounded heads from folded octaves
float billow(vec3 p) {
  float s = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    s += a * (1.0 - abs(2.0 * nz3(p) - 1.0));
    p = vec3(p.y * 0.8 + p.z * 0.6, p.z * 0.8 - p.y * 0.6, p.x) * 2.11 + vec3(4.7, 1.3, 2.9);
    a *= 0.48;
  }
  return s;
}

float ridgeN(float x) {
  return 0.6 * nz2(vec2(x, 0.5)) + 0.3 * nz2(vec2(x * 2.3, 4.1)) + 0.1 * nz2(vec2(x * 9.0, 7.7));
}

// a saturated shade of a pastel theme colour, scaled to peak 1
vec3 vivid(vec3 c) {
  float lo = 0.85 * min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  return clamp((c - lo) / max(hi - lo, 1e-3), 0.0, 1.0);
}

// one storm tower: centre on the plain, radius, top height. Positive inside.
float tower(vec3 q, vec2 c, float r, float top, float lean) {
  float h = clamp((q.y - BASE) / (top - BASE), 0.0, 1.0);
  vec2 d = q.xz - c;
  d.x -= lean * r * smoothstep(0.5, 1.0, h);
  // broad base, a waist, then the anvil; lumpy flanks so no side runs straight
  float R = r * (1.05 - 0.3 * smoothstep(0.0, 0.55, h) + 1.25 * smoothstep(0.74, 1.0, h));
  R *= 0.75 + 0.5 * nz3(vec3(d * 0.35, q.y * 0.3) + c.x);
  float side = 1.0 - length(d * vec2(1.0, 0.8)) / R;
  float bot = (q.y - BASE + 0.6 * nz2(q.xz * 0.4 + c.y)) / 1.4;
  float cap = (top - q.y) / (1.2 + 1.8 * smoothstep(0.7, 1.0, h));
  return min(side, min(bot, cap));
}

float field(vec3 q) {
  float f = tower(q, vec2(-8.0, 25.0), 5.6, 17.5, 0.8);
  f = max(f, tower(q, vec2(-1.2, 30.0), 3.4, 9.0, 0.3));
  f = max(f, tower(q, vec2(7.5, 36.0), 4.6, 13.5, 0.7));
  f = max(f, tower(q, vec2(19.0, 47.0), 6.0, 11.0, 0.6));
  f = max(f, tower(q, vec2(-24.0, 52.0), 7.0, 8.0, 0.4));
  // low ragged scud along the bases in the distance
  float shelf = min((q.y - BASE + 0.1) / 0.4, (BASE + 0.7 - q.y) / 0.5) - 0.45;
  shelf -= 0.6 * smoothstep(40.0, 30.0, q.z);
  return max(f, shelf);
}

// rain falling from the bases of the middle and far towers
float rain(vec3 q) {
  if (q.y > BASE + 0.3) return 0.0;
  float drop = BASE - q.y;
  vec2 d1 = q.xz - vec2(8.0 + 0.35 * drop, 36.0);
  vec2 d2 = q.xz - vec2(19.5 + 0.3 * drop, 47.0);
  float m = max(1.0 - length(d1) / 3.2, 1.0 - length(d2) / 4.5);
  m = clamp(m * 2.0, 0.0, 1.0);
  if (m <= 0.0) return 0.0;
  float st = nz2(vec2((q.x - 0.35 * q.y) * 2.6 + q.z, q.y * 0.25 + TT * 0.9));
  st = st * 0.6 + 0.4 * nz2(vec2(q.x * 0.6 + q.z * 0.3, TT * 0.05));
  return 0.4 * m * smoothstep(0.35, 0.75, st) * smoothstep(GND - 0.2, BASE - 0.3, q.y + 0.6);
}

// cloud density, and in BH the billow height used to shade heads and creases
float BH;
float density(vec3 q) {
  BH = 0.5;
  float f = field(q);
  float r = rain(q);
  if (f < -0.6) return r;
  vec3 w = q * 0.3 + vec3(TT * 0.02, -TT * 0.04, TT * 0.015);
  float b = billow(w);
  BH = b;
  float d = f * 2.2 + (b - 0.62) * 2.6;
  return clamp(d, 0.0, 1.0) + r;
}

// light from one interior glow reaching point q through cloud of density den
vec3 lamp(vec3 q, vec3 L, vec4 K, float den) {
  vec3 v = L - q;
  float d = length(v);
  float a = exp(-d * (0.13 + 0.25 * den)) / (1.0 + 0.03 * d * d) + 1.5 / (1.0 + d * d * 0.6);
  vec3 c = mix(V0 * 0.8, K.rgb, exp(-d * 0.35));
  return c * a * K.w;
}

vec3 lights(vec3 q, float den) {
  return lamp(q, L0, K0, den) + lamp(q, L1, K1, den) + lamp(q, L2, K2, den) + lamp(q, L3, K3, den);
}

vec3 lightPos(vec3 c, vec3 amp, float ph) {
  return c + amp * vec3(sin(TT * 0.13 + ph), sin(TT * 0.09 + ph * 1.7), cos(TT * 0.11 + ph * 0.6));
}

float swell(float ph, float rate) {
  float s = 0.5 + 0.5 * sin(TT * rate + ph);
  return 0.35 + 1.5 * s * s * s;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  float mn = min(res.x, res.y);
  PX = max(u_pixelRatio, 1.0) / mn;
  T = u_time;
  TT = T * clamp(u_churn, 0.0, 3.0);
  GLOW = max(u_glow, 0.0);
  TOWN = max(u_town, 0.0);

  C0 = u_palette[0]; C1 = u_palette[1]; C2 = u_palette[2]; C3 = u_palette[3];
  if (dot(C0,C0)+dot(C1,C1)+dot(C2,C2)+dot(C3,C3) < 1e-5) {
    C0 = vec3(0.231,0.510,0.965); C1 = vec3(0.659,0.333,0.969);
    C2 = vec3(0.133,0.827,0.933); C3 = vec3(0.957,0.247,0.369);
  }
  V0 = vivid(C0);
  V3 = vivid(C3);
  // sodium town light, the warm counterweight to the theme
  WARM = vec3(1.0, 0.46, 0.14);

  L0 = lightPos(vec3(-8.0, 9.5, 25.0), vec3(2.4, 3.0, 2.0), 0.0);
  L1 = lightPos(vec3(-1.2, 4.2, 30.0), vec3(1.4, 1.2, 1.2), 2.1);
  L2 = lightPos(vec3(7.6, 7.0, 36.0), vec3(2.2, 2.4, 1.8), 4.0);
  L3 = lightPos(vec3(18.5, 5.0, 47.0), vec3(3.0, 1.6, 2.4), 5.3);
  K0 = vec4(mix(C2, vec3(1.0), 0.45), GLOW * 1.6 * swell(0.0, 0.29));
  K1 = vec4(mix(C1, C2, 0.5), GLOW * 1.1 * swell(2.4, 0.23));
  K2 = vec4(mix(C2, vec3(1.0), 0.3), GLOW * 1.7 * swell(4.1, 0.19));
  K3 = vec4(C1, GLOW * 2.2 * swell(1.3, 0.26));

  vec2 p = (gl_FragCoord.xy - 0.5 * res) / mn;
  vec3 rd = normalize(vec3(p.x, p.y - HOR, 1.0));

  // march the cloud volume front to back
  float tmax = rd.y < 0.0 ? min(-GND / -rd.y, 74.0) : 74.0;
  const float DT = 1.1;
  float t = 16.0 + DT * hp(gl_FragCoord.xy);
  float tr = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 54; i++) {
    if (t > tmax || tr < 0.02) break;
    vec3 q = rd * t;
    float den = density(q);
    float form = clamp(BH - 0.3, 0.0, 1.0);
    vec3 li = lights(q, den);
    // humid air between the towers glows faintly around each light
    acc += tr * li * 0.006 * DT;
    if (den > 0.002) {
      // self shade: how much cloud lies between this point and the nearest glow
      vec3 toL = L0 - q;
      vec3 tl = L1 - q; if (dot(tl, tl) < dot(toL, toL)) toL = tl;
      tl = L2 - q; if (dot(tl, tl) < dot(toL, toL)) toL = tl;
      tl = L3 - q; if (dot(tl, tl) < dot(toL, toL)) toL = tl;
      float sh = density(q + normalize(toL) * 0.9);
      float occ = exp(-sh * 1.6);
      // town light from below on the bases, cool night from above on the crowns
      float under = exp(-max(q.y - BASE, 0.0) * 1.6);
      float crown = smoothstep(BASE + 2.0, 15.0, q.y);
      vec3 amb = WARM * 0.5 * TOWN * under * (0.3 + form)
               + mix(V3 * 0.04, C0 * 0.16, crown) * (0.2 + 1.3 * form);
      vec3 e = li * (0.25 + 0.95 * occ) * (0.5 + form) + amb;
      float a = den * DT * 1.2;
      acc += tr * e * a;
      tr *= exp(-a * 1.7);
    }
    t += DT;
  }

  vec3 bg;
  if (rd.y >= 0.0) {
    // night sky: deep indigo, a warm skyglow at the horizon, a few stars
    float e = p.y - HOR;
    bg = V3 * mix(0.022, 0.008, smoothstep(0.0, 0.7, e));
    bg += WARM * 0.06 * TOWN * exp(-e / 0.05);
    vec2 sq = p * 90.0;
    vec2 si = floor(sq);
    float sh = hp(si + 3.1);
    vec2 so = fract(sq) - 0.5 - (vec2(hp(si + 7.3), hp(si + 1.9)) - 0.5) * 0.6;
    float star = step(0.93, sh) * exp(-dot(so, so) * 40.0) * smoothstep(0.1, 0.4, e);
    bg += mix(C2, vec3(1.0), 0.5) * star * 0.5 * (0.6 + 0.4 * sin(T * 1.3 + sh * 50.0));
  } else {
    // the plain: dark fields, a flooded stretch that mirrors the sky, town lights
    float tg = -GND / -rd.y;
    vec2 g = rd.xz * tg;
    bg = V3 * 0.008 + WARM * 0.004 * TOWN;
    float fieldTex = nz2(g * vec2(0.6, 0.15));
    bg *= 0.6 + 0.8 * fieldTex;
    float wet = smoothstep(0.36, 0.46, nz2(g * vec2(0.12, 0.3) + vec2(3.0, 1.0))) * smoothstep(30.0, 6.0, g.y);
    if (wet > 0.0) {
      float rip = nz2(vec2(g.x * 3.0, g.y * 9.0 - T * 0.6)) - 0.5;
      vec3 rr = normalize(vec3(rd.x + rip * 0.01, -rd.y + rip * 0.03, rd.z));
      vec3 rf = vec3(0.0);
      rf += K0.rgb * K0.w * exp(-(1.0 - dot(rr, normalize(L0))) * 220.0);
      rf += K1.rgb * K1.w * exp(-(1.0 - dot(rr, normalize(L1))) * 260.0);
      rf += K2.rgb * K2.w * exp(-(1.0 - dot(rr, normalize(L2))) * 300.0);
      rf += K3.rgb * K3.w * exp(-(1.0 - dot(rr, normalize(L3))) * 340.0);
      rf *= 0.3;
      rf += V0 * 0.05 * GLOW * smoothstep(0.0, 0.15, rr.y) + WARM * 0.12 * TOWN * exp(-rr.y / 0.03);
      bg = mix(bg, rf, wet * 0.85);
    }
    // sodium lights of a town strung along the far plain
    if (g.y > 18.0) {
      vec2 cq = g / vec2(0.7, 0.9);
      vec2 ci = floor(cq);
      float h = hp(ci + 11.0);
      float town = smoothstep(0.45, 0.7, nz2(ci * vec2(0.09, 0.11) + 5.0));
      if (h < 0.55 * town) {
        vec2 lo = (vec2(hp(ci + 2.0), hp(ci + 5.0)) - 0.5) * 0.7;
        vec2 dw = (fract(cq) - 0.5 - lo) * vec2(0.7, 0.9);
        vec2 ds = vec2(dw.x / tg, dw.y * -GND / (tg * tg));
        float r = PX * (0.8 + 1.2 * hp(ci + 8.0));
        float lg = exp(-dot(ds, ds) / (r * r));
        vec3 lc = mix(WARM, vec3(1.0, 0.82, 0.55), hp(ci + 4.0) * 0.7);
        bg += lc * lg * TOWN * 1.4;
      }
      bg += WARM * 0.05 * TOWN * smoothstep(18.0, 40.0, g.y) * smoothstep(0.4, 0.75, nz2(g * vec2(0.06, 0.08) + 5.0));
    }
  }

  vec3 col = acc + tr * bg;

  // a dark wooded ridge in the foreground, rising toward the right
  float ry = HOR - 0.24 + 0.2 * smoothstep(0.0, 0.9, p.x) + 0.05 * ridgeN(p.x * 3.0 + 2.0);
  ry += 0.012 * nz2(vec2(p.x * 80.0, 1.0)) * smoothstep(-0.1, 0.4, p.x);
  float rm = smoothstep(ry + PX * 1.5, ry - PX * 1.5, p.y);
  if (rm > 0.0) {
    float below = ry - p.y;
    vec3 rc = V3 * 0.006 * (0.6 + 0.8 * nz2(p * 30.0));
    // rim of glow along the crest
    rc += mix(V0, C2, 0.4) * 0.06 * GLOW * exp(-below / (3.0 * PX + 0.004));
    col = mix(col, rc, rm);
  }

  col = vec3(1.0) - exp(-col * 1.25);
  gl_FragColor = vec4(col + vec3(0.006, 0.005, 0.01), 1.0);
}
