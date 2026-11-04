// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// a still pool in a limestone cave. A vault of calcite hangs over black
// water: clustered stalactites of every length, a banded drapery along the
// right wall and a column where a stalactite met its stalagmite. A spring at
// the left glows up through the pool, lighting the stone from below and
// shining through the thin calcite in peach and rose. The pool mirrors the
// whole vault; drips ring the water, small laps circle the stalagmites and
// vapour rises off the surface into the dark.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // light rising from the pool and through the calcite (default 1.0)
uniform float u_drip;   // how often drips fall and ring the water (default 1.0)
uniform float u_mist;   // vapour rising off the water (default 0.7)

const float PI = 3.14159265;
const vec3 SPRING = vec3(-2.7, -0.5, 8.5);

vec3 C0, C1, C2, C3;
float T, GLOW, DRIP, MIST;

float h21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.3183, 0.4127, 0.2251));
  q += dot(q, q.zxy + 19.37);
  return fract((q.x + q.z) * q.y);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) {
    s += a * vn(p);
    p = mat2(1.58, 1.21, -1.21, 1.58) * p + vec2(2.9, 4.3);
    a *= 0.5;
  }
  return s / 0.875;
}

// the saturated hue under a pastel theme colour, so shades scale to black
vec3 pure(vec3 c) {
  float lo = 0.85 * min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  return clamp((c - lo) / max(hi - lo, 1e-3), 0.0, 1.0);
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// the vault: rises from the near wall, lowers to an arch at the back where the
// pool runs on under the rock, and curves down into the side walls
float ceilY(vec2 xz) {
  float z = xz.y;
  float y = 2.1 + 1.3 * smoothstep(-1.0, 6.0, z) - 2.6 * smoothstep(9.0, 16.0, z);
  y -= 0.07 * xz.x * xz.x;
  y += 0.7 * (vn(xz * 0.45) - 0.5) + 0.25 * (vn(xz * 1.3 + 7.0) - 0.5);
  return y;
}

// one stalactite per cell, jittered, clustered by a slow noise, banded by
// growth rings and frayed so no two read alike
float stalac(vec3 p) {
  const float CS = 0.85;
  vec2 cid = floor(p.xz / CS);
  float hA = h21(cid), hB = h21(cid + 17.3), hC = h21(cid + 41.9);
  vec2 base = (cid + 0.5) * CS + (vec2(hB, hC) - 0.5) * 0.26;
  float top = ceilY(base) + 0.2;
  float cluster = vn(cid * 0.35 + 3.0);
  float L = (0.12 + 1.8 * hA * hA) * (0.25 + 1.4 * cluster);
  L *= hA < 0.25 ? 0.25 : 1.0;
  L = min(L, top - 1.3);
  vec3 q = p - vec3(base.x, top, base.y);
  float hh = clamp(-q.y / max(L, 0.05), 0.0, 1.0);
  q.xz += 0.035 * vec2(sin(q.y * 4.0 + hB * 9.0), cos(q.y * 3.3 + hC * 7.0));
  float R = (0.05 + 0.13 * hB) * (0.6 + 0.6 * cluster);
  float r = R * pow(1.0 - hh, 1.6) + 0.01;
  r *= 1.0 + 0.13 * sin(q.y * 26.0 + hC * 20.0) * (1.0 - hh);
  vec2 dir = q.xz / max(length(q.xz), 1e-3);
  r += 0.3 * R * (1.0 - hh) * (vn(dir * 1.7 + vec2(q.y * 5.0, hA * 13.0)) - 0.5);
  float d = length(q.xz) - r;
  d = max(d, -q.y - L);
  d = max(d, q.y - 0.6);
  return d * 0.7;
}

// a stalagmite standing in the water, ringed and lumpy
float mound(vec3 p, vec3 c, float hgt, float rad, float k) {
  vec3 q = p - c;
  float hh = clamp(q.y / hgt, 0.0, 1.0);
  float r = rad * pow(1.0 - hh, 1.3) + 0.02;
  r *= 1.0 + 0.1 * sin(q.y * 20.0 + k) + 0.25 * (vn(vec2(q.x + q.z, q.y) * 4.0 + k) - 0.5);
  float d = length(q.xz) - r;
  return max(max(d, q.y - hgt), -q.y - 1.0) * 0.7;
}
float mounds(vec3 p) {
  float d = mound(p, vec3(1.3, -0.3, 4.2), 0.75, 0.3, 1.0);
  d = min(d, mound(p, vec3(1.75, -0.3, 4.6), 0.45, 0.2, 5.0));
  d = min(d, mound(p, vec3(-1.6, -0.3, 3.4), 0.4, 0.22, 9.0));
  d = min(d, mound(p, vec3(0.2, -0.3, 10.5), 0.9, 0.35, 3.0));
  return d;
}

// a column where a stalactite met its stalagmite, waisted and ringed
float column(vec3 p) {
  vec3 q = p - vec3(2.3, 0.0, 6.8);
  float H = 3.3;
  float s = clamp(q.y / H, 0.0, 1.0);
  float r = 0.12 + 0.55 * (pow(1.0 - s, 3.0) + pow(s, 3.0));
  r *= 1.0 + 0.04 * sin(q.y * 17.0 + 2.0 * vn(q.xz * 3.0)) + 0.3 * (vn(vec2(q.x - q.z, q.y * 1.4) * 3.0) - 0.5)
     + 0.12 * (vn(vec2(q.x + q.z, q.y) * 8.0) - 0.5);
  return (length(q.xz + 0.06 * vec2(sin(q.y * 2.0), cos(q.y * 1.7))) - r) * 0.6;
}

// a calcite drapery hanging from the right side of the vault: folded like
// cloth, thickest at the root, with a scalloped hem
float curtain(vec3 p) {
  float z = p.z;
  float fx = 3.0 + 0.2 * sin(z * 0.9) + 0.16 * sin(z * 5.1 + 0.9 * sin(z * 1.7))
           + 0.06 * sin(z * 11.7 + 2.0);
  float top = ceilY(vec2(fx, z)) + 0.2;
  float drop = 0.8 + 0.35 * sin(z * 2.3 + 1.0) + 0.3 * vn(vec2(z * 4.0, 1.0));
  float bot = top - drop;
  float th = 0.018 + 0.03 * clamp(p.y - bot, 0.0, 1.0);
  float d = abs(p.x - fx) - th;
  d = max(d, bot - p.y);
  d = max(d, abs(z - 4.6) - 2.4);
  return d * 0.5;
}

float caveD(vec3 p) {
  float c = ceilY(p.xz) - p.y;
  float w = 4.6 + 0.8 * vn(p.yz * 0.7) - abs(p.x - 0.6 * sin(p.z * 0.22));
  float b = 18.0 - p.z;
  return smin(smin(c, w, 1.0), b, 1.5) * 0.7;
}

float mapS(vec3 p) {
  float d = smin(caveD(p), stalac(p), 0.3);
  d = smin(d, curtain(p), 0.2);
  d = min(d, mounds(p));
  d = smin(d, column(p), 0.4);
  return d;
}

vec3 normS(vec3 p) {
  vec2 e = vec2(0.006, -0.006);
  return normalize(e.xyy * mapS(p + e.xyy) + e.yyx * mapS(p + e.yyx)
                 + e.yxy * mapS(p + e.yxy) + e.xxx * mapS(p + e.xxx));
}

// a slow net of bright threads, as light bends through the moving surface
float caustic(vec2 w) {
  vec2 wp = w * 0.9 + vec2(0.0, T * 0.03);
  float n1 = vn(wp + 2.4 * vec2(vn(w * 0.5 - T * 0.04), vn(w * 0.5 + 5.0 + T * 0.03)));
  float n2 = vn(wp * 2.1 + 9.0 - 1.5 * n1 + T * 0.05);
  return pow(1.0 - abs(2.0 * n1 - 1.0), 6.0) * 0.7 + pow(1.0 - abs(2.0 * n2 - 1.0), 8.0) * 0.5;
}

// the colour of the light the pool gives: lime over the spring, aqua beyond
vec3 springHue(vec2 xz) {
  vec2 d = xz - SPRING.xz;
  return mix(pure(C2), pure(C3), exp(-dot(d, d) * 0.08));
}

// calcite lit from below by the pool and the spring, glowing where thin;
// the vault above the water carries the moving caustics thrown up off it
vec3 shade(vec3 p, vec3 rd) {
  vec3 n = normS(p);
  float bands = 0.5 + 0.5 * sin(p.y * 11.0 + 4.0 * vn(p.xz * 1.3 + p.y * 0.5));
  float tone = clamp(bands * 0.6 + 0.6 * vn(p.xz * 0.8 + p.y) - 0.15, 0.0, 1.0);
  vec3 stoneA = mix(pure(C0), C0, 0.35);
  vec3 stoneB = mix(pure(C1), C1, 0.25);
  vec3 alb = mix(stoneA, stoneB, tone);
  vec3 Lp = SPRING - p;
  float ld2 = dot(Lp, Lp);
  vec3 L = Lp * inversesqrt(ld2);
  float att = 8.0 / (1.0 + ld2 * 0.25);
  float dif = max(dot(n, L), 0.0);
  float down = clamp(0.5 - 0.5 * n.y, 0.0, 1.0);
  float up = down * exp(-max(p.y, 0.0) * 0.35);
  vec3 wc = springHue(p.xz);
  // light from the water: green-blue on the faces turned to it
  vec3 col = wc * (dif * att * 0.45 + up * 0.1) * (0.5 + 0.5 * tone) * GLOW * 0.5;
  // caustic threads on the underside of the vault
  float cau = caustic(p.xz * 0.8 + p.y * 0.2);
  col += mix(wc, C2, 0.3) * cau * down * down * (0.12 + att * 0.15) * GLOW * 0.55;
  // light through thin calcite, in the dye of the stone
  float thin = clamp(1.0 + mapS(p - n * 0.12) / 0.08, 0.0, 1.0);
  float stripe = smoothstep(0.25, 0.75, bands);
  vec3 dyeT = mix(mix(pure(C0), C0, 0.2), pure(C1), stripe);
  col += dyeT * thin * (0.55 + 0.45 * stripe) * (0.04 + att * 0.35 + up * 0.5) * GLOW * 0.6;
  // wet sheen catching the pool
  float fr = pow(1.0 - clamp(-dot(rd, n), 0.0, 1.0), 4.0);
  col += wc * fr * (0.3 + cau) * (up * 0.5 + att * 0.2) * 0.12 * GLOW;
  col += pure(C1) * 0.005;
  return col;
}

// surface of the pool: a faint swell, drips ringing out and laps at the stone
float waterH(vec2 w) {
  float h = 0.003 * (vn(w * 2.0 + T * 0.1) - 0.5);
  float on = min(DRIP * 3.0, 1.0);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float ph = T * DRIP * (0.21 + 0.06 * fk) + h21(vec2(fk, 3.1));
    float cyc = floor(ph);
    float age = fract(ph);
    vec2 site = vec2(-2.0 + fk * 1.3, 2.5 + 2.2 * h21(vec2(fk, 7.7)))
              + (vec2(h21(vec2(cyc, fk)), h21(vec2(fk, cyc + 4.0))) - 0.5) * 1.6;
    float dist = length(w - site);
    float rr = age * 2.2;
    float x = dist - rr;
    h += 0.012 * sin(x * 28.0) * exp(-x * x * 18.0) * (1.0 - age) * (1.0 - age) * on;
  }
  vec2 m1 = w - vec2(1.4, 4.3);
  vec2 m2 = w - vec2(-1.6, 3.4);
  vec2 m3 = w - vec2(0.2, 10.5);
  vec2 m4 = w - vec2(2.3, 6.8);
  float l1 = length(m1), l2 = length(m2), l3 = length(m3), l4 = length(m4);
  h += 0.004 * sin(l1 * 18.0 - T * 1.7) * exp(-l1 * 1.4);
  h += 0.004 * sin(l2 * 20.0 - T * 1.9) * exp(-l2 * 1.8);
  h += 0.004 * sin(l3 * 16.0 - T * 1.5) * exp(-l3 * 1.4);
  h += 0.004 * sin(l4 * 17.0 - T * 1.6) * exp(-l4 * 1.2);
  return h;
}

// light inside the water: the spring, a wide glow, and a moving net of caustics
vec3 waterGlow(vec2 w) {
  vec2 d = w - SPRING.xz;
  float r2 = dot(d, d);
  float spring = exp(-r2 * 0.15);
  float cau = caustic(w);
  float pool = 0.12 + 3.0 * spring + 0.4 * exp(-r2 * 0.025);
  vec3 hue = mix(pure(C2), pure(C3), clamp(spring * 0.9 + 0.3 * cau, 0.0, 1.0));
  return hue * pool * (0.25 + cau) * GLOW * 0.5;
}

// march the cave from ro along rd; returns distance or -1
float marchS(vec3 ro, vec3 rd, float tmax, float t0) {
  float t = t0;
  for (int i = 0; i < 64; i++) {
    float d = mapS(ro + rd * t);
    if (d < 0.0015 * t) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.0;
}
float marchR(vec3 ro, vec3 rd, float tmax) {
  float t = 0.05;
  for (int i = 0; i < 40; i++) {
    float d = mapS(ro + rd * t);
    if (d < 0.003 * t) return t;
    t += d * 1.1;
    if (t > tmax) break;
  }
  return -1.0;
}

// vapour off the water, lit by the pool below it
vec3 vapour(vec3 ro, vec3 rd, float tend, float jit) {
  vec3 acc = vec3(0.0);
  float span = min(tend, 18.0);
  for (int k = 0; k < 6; k++) {
    float t = span * (float(k) + jit) / 6.0;
    vec3 p = ro + rd * t;
    float hy = max(p.y, 0.0);
    float w = fbm3(vec2(p.x * 0.7 + p.z * 0.35 + T * 0.05, hy * 1.8 - T * 0.14));
    float dens = exp(-hy / 0.45) * smoothstep(0.35, 0.8, w);
    vec2 sd = p.xz - SPRING.xz;
    float lit = 0.25 + 1.5 * exp(-dot(sd, sd) * 0.1);
    acc += springHue(p.xz) * dens * lit;
  }
  return acc * span / 6.0 * MIST * GLOW * 0.06;
}

void main() {
  C0 = u_palette[0]; C1 = u_palette[1]; C2 = u_palette[2]; C3 = u_palette[3];
  if (dot(C0,C0)+dot(C1,C1)+dot(C2,C2)+dot(C3,C3) < 1e-5) {
    C0 = vec3(0.231,0.510,0.965); C1 = vec3(0.659,0.333,0.969);
    C2 = vec3(0.133,0.827,0.933); C3 = vec3(0.957,0.247,0.369);
  }
  T = u_time;
  GLOW = clamp(u_glow, 0.0, 2.5);
  DRIP = clamp(u_drip, 0.0, 3.0);
  MIST = clamp(u_mist, 0.0, 2.0);

  vec2 res = u_resolution;
  vec2 q = (2.0 * gl_FragCoord.xy - res) / res.y;
  float jit = h21(gl_FragCoord.xy + 0.71);

  vec3 ro = vec3(0.3, 0.5, -0.5);
  vec3 rd = normalize(vec3(q.x, q.y + 0.18, 1.5));
  float yw = -0.08;
  rd.xz = mat2(cos(yw), sin(yw), -sin(yw), cos(yw)) * rd.xz;

  float tw = rd.y < -1e-4 ? ro.y / -rd.y : 1e3;
  float th = marchS(ro, rd, min(tw, 30.0), 0.1);
  vec3 ground = pure(C1) * 0.008 + pure(C2) * 0.006;
  vec3 col;
  float tEnd;
  if (th > 0.0) {
    vec3 p = ro + rd * th;
    col = shade(p, rd);
    col = mix(col, ground, 1.0 - exp(-th * 0.06));
    tEnd = th;
  } else if (tw < 1e3) {
    vec3 p = ro + rd * tw;
    vec2 w = p.xz;
    float e = 0.015;
    float h0 = waterH(w);
    vec3 n = normalize(vec3(-(waterH(w + vec2(e, 0.0)) - h0) / e, 1.0, -(waterH(w + vec2(0.0, e)) - h0) / e));
    vec3 rr = reflect(rd, n);
    float tr = marchR(vec3(w.x, 0.002, w.y), rr, 25.0);
    vec3 rc = ground;
    if (tr > 0.0) {
      vec3 pr = vec3(w.x, 0.002, w.y) + rr * tr;
      rc = shade(pr, rr);
      rc = mix(rc, ground, 1.0 - exp(-(tr + tw) * 0.06));
    }
    float F = 0.02 + 0.98 * pow(1.0 - clamp(-dot(rd, n), 0.0, 1.0), 5.0);
    col = rc * mix(0.55, 1.0, F) + waterGlow(w) * (1.0 - F) * exp(-tw * 0.04);
    tEnd = tw;
  } else {
    col = ground;
    tEnd = 30.0;
  }
  col += vapour(ro, rd, tEnd, jit);

  col = vec3(1.0) - exp(-col * 1.25);
  gl_FragColor = vec4(col + pure(C1) * 0.008, 1.0);
}
