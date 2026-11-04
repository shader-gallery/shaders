// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A deep-level tube tunnel seen from the cab of a slow train, headlights on.
// The bore curves away right toward a pale far bend. The track is built as
// solid geometry: concrete sleepers set in matte ballast, running rails with
// foot, web and polished head on baseplates, and conductor rails riding on
// ribbed ceramic insulators. Chipped rib arches, sagging cable runs and caged
// bulkheads line the walls while two-aspect signal heads slide past and
// light the track from the side.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // travel speed of the train along the tunnel (default 0.5)
uniform float u_bend;      // how hard the tunnel curves away to the right (default 0.85)
uniform float u_lamps;     // brightness of the signal and bulkhead lamps (default 1.0)
uniform float u_headlight; // strength of the train headlights on the track (default 1.0)

const float PI = 3.14159265359;
const float FLOORY = -0.62;
const float TOPY = -0.545;
const float GAUGE = 0.36;
const float SLP = 0.62;
const float RIBGAP = 1.7;
const float LAMPGAP = 3.4;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(57.13, 211.79))) * 31871.53);
}
float hs1(float n) {
  return fract(sin(n * 91.417 + 2.3) * 17423.61);
}
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hs(i);
  float b = hs(i + vec2(1.0, 0.0));
  float c = hs(i + vec2(0.0, 1.0));
  float d = hs(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vn(p);
    p = p * 2.11 + vec2(4.3, 8.9);
    a *= 0.5;
  }
  return v / 0.9375;
}
float box2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float box3(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
float lines(float u, float gap, float wf, float aa) {
  float dd = abs(fract(u / gap + 0.5) - 0.5) * gap;
  float hw = wf * gap * 0.5;
  return (1.0 - smoothstep(hw - aa, hw + aa, dd)) * smoothstep(0.0, 0.05, wf);
}

// rail section: foot, web and rounded head, origin at the rail seat
float railSec(vec2 r) {
  float foot = box2(r - vec2(0.0, 0.008), vec2(0.048, 0.007)) - 0.002;
  float web = box2(r - vec2(0.0, 0.045), vec2(0.010, 0.034));
  float head = box2(r - vec2(0.0, 0.088), vec2(0.020, 0.011)) - 0.007;
  return min(min(foot, web), head);
}

// track bed in (x, y, s): returns distance and material id
// 0 ballast, 1 sleeper, 2 rail body, 3 rail head, 4 baseplate, 5 conductor, 6 insulator
vec2 track(vec3 q) {
  float g = vn(q.xz * vec2(11.0, 9.0)) * 0.6 + vn(q.xz * 27.0 + 7.0) * 0.4;
  float crown = 0.03 * smoothstep(0.82, 0.5, abs(q.x));
  vec2 r = vec2((q.y - FLOORY - crown - 0.032 * g) * 0.6, 0.0);

  float id = floor(q.z / SLP + 0.5);
  float sz = q.z - id * SLP - (hs1(id) - 0.5) * 0.05;
  sz += q.x * (hs1(id + 9.0) - 0.5) * 0.05;
  vec3 sq = vec3(q.x + (hs1(id + 3.0) - 0.5) * 0.04, q.y - (FLOORY + 0.045), sz);
  float chip = vn(vec2(q.x * 14.0, id * 7.3 + sz * 30.0));
  float dS = box3(sq, vec3(0.74, 0.026 - 0.004 * chip, 0.088)) - 0.012;
  if (dS < r.x) r = vec2(dS, 1.0);

  vec2 rp = vec2(abs(q.x) - GAUGE, q.y - TOPY);
  float dR = railSec(rp);
  if (dR < r.x) r = vec2(dR, 2.0 + step(0.07, rp.y));

  vec3 bq = vec3(abs(q.x) - GAUGE, q.y - TOPY + 0.002, sz);
  float dP = box3(bq, vec3(0.085, 0.010, 0.062)) - 0.004;
  // spring clips bowing over the rail foot
  vec3 cq = vec3(abs(abs(q.x) - GAUGE) - 0.06, q.y - TOPY - 0.018, sz);
  float dC = length(vec2(length(cq.xy) - 0.016, cq.z)) - 0.006;
  dP = min(dP, max(dC, -cq.y - 0.004));
  if (dP < r.x) r = vec2(dP, 4.0);

  // conductor rails: one outside on the right, one between the running rails
  float cx = abs(q.x - 0.33) - 0.33;
  vec2 tp = vec2(cx, q.y - TOPY - 0.07);
  float dT = box2(tp, vec2(0.03, 0.017)) - 0.006;
  if (dT < r.x) r = vec2(dT, 5.0);
  float pid = floor(q.z / (SLP * 2.0) + 0.5);
  float pz = q.z - pid * SLP * 2.0 - (hs1(pid + 4.0) - 0.5) * 0.04;
  vec3 iq = vec3(cx, q.y - TOPY - 0.02, pz);
  float rib = 0.004 * sin(iq.y * 260.0);
  float dI = max(length(iq.xz) - 0.026 - rib, abs(iq.y) - 0.034);
  if (dI < r.x) r = vec2(dI, 6.0);
  return r;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  float scale = min(res.x, res.y) * 0.62;
  float t = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float speed = max(u_speed, 0.0);
  float k = clamp(u_bend, 0.0, 1.5) * 0.05;
  float lampI = max(u_lamps, 0.0);
  float headI = max(u_headlight, 0.0);
  float travel = t * speed * 2.0;

  vec2 vp = res * vec2(0.5, 0.6)
          + vec2(sin(t * 0.37), sin(t * 0.53 + 1.0)) * 0.004 * scale;
  vec2 uv = (gl_FragCoord.xy - vp) / scale;
  float px = 1.0 / scale;

  // ---- wall: first depth where the ray leaves the curving bore ----
  float zlo = 0.05;
  float zhi = 60.0;
  float zprev = 0.05;
  float hit = 0.0;
  for (int i = 0; i < 36; i++) {
    float z = 0.08 * pow(1.2, float(i));
    float f = length(uv * z - vec2(k * z * z, 0.0)) - 1.0;
    if (hit < 0.5 && f > 0.0) {
      zlo = zprev;
      zhi = z;
      hit = 1.0;
    }
    zprev = z;
  }
  for (int i = 0; i < 8; i++) {
    float zm = 0.5 * (zlo + zhi);
    float f = length(uv * zm - vec2(k * zm * zm, 0.0)) - 1.0;
    if (f > 0.0) zhi = zm; else zlo = zm;
  }
  float zw = mix(60.0, zhi, hit);

  // ---- track: march the bent ray through the solid track bed ----
  float zt = zw + 1.0;
  float mat = 0.0;
  if (uv.y < -1e-4) {
    float zz = max((TOPY + 0.13) / uv.y, 0.05);
    for (int i = 0; i < 56; i++) {
      if (zz < zw && zt > zw) {
        vec3 q = vec3(uv.x * zz - k * zz * zz, uv.y * zz, zz + travel);
        vec2 h = track(q);
        if (h.x < 0.0012 * zz) {
          zt = zz;
          mat = h.y;
        } else {
          float jl = length(vec3(uv.x - 2.0 * k * zz, uv.y, 1.0));
          zz += max(h.x / jl, 0.011 * zz);
        }
      }
    }
    float zf = FLOORY / uv.y;
    if (zt > zw && zf < zw) { zt = zf; mat = 0.0; }
  }
  float isFloor = step(zt, zw);
  float z = min(zw, zt);
  vec3 P = vec3(uv.x * z - k * z * z, uv.y * z, z);
  float s = z + travel;
  float pw = z * px;
  float aa = pw * 1.2;

  vec3 N = vec3(-P.xy / max(length(P.xy), 1e-3), 0.0);
  float occ = 1.0;
  if (isFloor > 0.5) {
    vec3 q = vec3(P.x, P.y, s);
    float e = max(0.0015, pw * 0.5);
    vec2 kk = vec2(1.0, -1.0);
    N = normalize(kk.xyy * track(q + kk.xyy * e).x + kk.yyx * track(q + kk.yyx * e).x
                + kk.yxy * track(q + kk.yxy * e).x + kk.xxx * track(q + kk.xxx * e).x);
    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(0.02, 0.06, pw)));
    float a1 = track(q + N * 0.025).x / 0.025;
    float a2 = track(q + N * 0.07).x / 0.07;
    occ = clamp(0.25 + 0.4 * a1 + 0.35 * a2, 0.2, 1.0);
  }
  vec3 V = normalize(-P);
  float gloss = (mat > 2.5 && mat < 3.5) || (mat > 4.5 && mat < 5.5) ? 1.0 : 0.0;

  // ---- light: headlights, caged bulkheads and sliding signal lamps ----
  vec3 light = c3 * 0.20 + c0 * 0.03 + mix(c0, c2, 0.3) * 0.10 * smoothstep(4.0, 30.0, z);
  vec3 specL = vec3(0.0);
  vec3 glare = vec3(0.0);
  float plate = 0.0;

  // twin headlights low on the cab, throwing a cone down the track
  for (int i = 0; i < 2; i++) {
    vec3 Hp = vec3(float(i) * 0.9 - 0.45, -0.36, -0.25);
    vec3 D = Hp - P;
    float d2 = dot(D, D);
    vec3 L = D * inversesqrt(d2 + 1e-4);
    float cone = smoothstep(0.45, 0.92, -L.z);
    vec3 hc = mix(c2, vec3(1.0), 0.2) * headI * 0.9 * cone
             * mix(0.35 * smoothstep(-0.1, -0.7, P.y), 1.0, isFloor);
    light += hc * max(dot(N, L), 0.0) / (1.0 + d2 * 0.05);
    vec3 Hh = normalize(L + V);
    specL += hc * pow(max(dot(N, Hh), 0.0), 60.0) * 2.0 / (1.0 + d2 * 0.05);
  }

  float n0 = floor(travel / LAMPGAP) - 1.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float bulk = step(6.5, fi);
    float n = n0 + fi - 7.0 * bulk;
    float h = hs1(n + 31.0 * bulk);
    float side = mix(step(0.45, hs1(n + 17.0)), 0.0, bulk);
    float th = mix(mix(PI + 0.48, -0.48, side), PI - 0.80, bulk);
    float rr = mix(0.90, 0.95, bulk);
    float zl = n * LAMPGAP + mix(h * 2.0, 1.6, bulk) - travel;
    vec3 Lp = vec3(cos(th) * rr, sin(th) * rr, zl);
    float hc = hs1(n + 5.3);
    vec3 lc = hc < 0.55 ? c1 * 1.2 : (hc < 0.8 ? c2 : c3 * 2.2);
    lc = mix(lc, mix(c2, vec3(1.0), 0.25) * 0.85, bulk);
    lc *= lampI * smoothstep(-0.6, 0.3, zl) * (0.85 + 0.15 * sin(t * (1.1 - 0.6 * bulk) + h * 9.0));
    vec3 D = Lp - P;
    float d2 = dot(D, D);
    vec3 L = D * inversesqrt(d2 + 1e-4);
    float att = 1.0 / (1.0 + d2 * 0.9);
    light += lc * max(dot(N, L), 0.0) * att * mix(0.95, 0.7, bulk);
    vec3 Hh = normalize(L + V);
    specL += lc * pow(max(dot(N, Hh), 0.0), 40.0) * 3.0 / (1.0 + d2 * 0.3);
    if (zl > 0.12) {
      vec2 uvL = (Lp.xy + vec2(k * zl * zl, 0.0)) / zl;
      float dpx = length(uv - uvL) / px;
      float rpx = max(0.065 / zl / px, 2.0);
      float vis = smoothstep(z + 0.6, z - 0.1, zl);
      float core = 1.0 - smoothstep(rpx * 0.7, rpx, dpx);
      glare += lc * (core * 2.2 + exp(-dpx / (rpx * 1.6)) * 0.6 + exp(-dpx / (rpx * 7.0)) * 0.12) * vis;
      // signal head: a dark hooded backplate with a second, unlit aspect below
      vec2 dq = (uv - uvL) / px;
      vec2 dh = vec2(dq.x, max(abs(dq.y + rpx * 1.3) - rpx * 1.3, 0.0));
      float head = (1.0 - smoothstep(rpx * 1.6, rpx * 1.9, length(dh))) * vis * (1.0 - bulk);
      float lens2 = (1.0 - smoothstep(rpx * 0.55, rpx * 0.8, length(dq + vec2(0.0, rpx * 2.6)))) * head;
      plate = max(plate, head * (1.0 - core));
      float rim = head * smoothstep(rpx * 1.3, rpx * 1.8, length(dh));
      glare += c3 * lens2 * 0.6 + c0 * rim * 0.35;
      // bulkhead cage bars across the glass
      float cage = bulk * core * smoothstep(0.25, 0.1, abs(fract(dq.x / rpx * 1.5) - 0.5)) * step(2.0, rpx);
      glare -= lc * cage * 1.6;
    }
  }

  vec3 col;
  if (isFloor > 0.5) {
    float lx = P.x;
    float far = smoothstep(0.012, 0.04, pw);
    vec3 alb;
    if (mat < 0.5) {
      // matte ballast: angular stones with dark gaps
      float st = vn(vec2(lx, s) * 52.0);
      float st2 = vn(vec2(lx, s) * 21.0 + 3.0);
      float gap = smoothstep(0.25, 0.5, st);
      alb = mix(c3 * 0.32, mix(c3, c0, 0.35) * 0.5, st2) * mix(0.45, 1.0, mix(gap, 0.75, far));
    } else if (mat < 1.5) {
      // cast concrete sleeper, worn and stained
      float sid = floor(s / SLP + 0.5);
      vec2 sp = mix(vec2(lx, s), vec2(lx, P.y), smoothstep(0.4, 0.8, abs(N.z)));
      float wr = fbm(vec2(sp.x * 5.0, sid * 4.1 + sp.y * 6.0));
      float pit = smoothstep(0.7, 0.85, vn(sp * 70.0 + sid));
      alb = mix(mix(c3, c2, 0.2) * 0.55, mix(c2, c0, 0.35) * 0.6, smoothstep(0.3, 0.75, wr)) * (1.0 - 0.3 * pit * (1.0 - far));
      alb *= 0.6 + 0.6 * smoothstep(0.5, 0.9, N.y);
    } else if (mat < 2.5) {
      alb = c3 * 0.22 + c0 * 0.03;
    } else if (mat < 3.5) {
      alb = mix(c3, c0, 0.4) * 0.3;
    } else if (mat < 4.5) {
      alb = c3 * 0.18 + c1 * 0.06;
    } else if (mat < 5.5) {
      alb = mix(c3 * 0.25, mix(c3, c1, 0.4) * 0.35, smoothstep(0.5, 0.9, N.y));
      gloss = 0.35;
    } else {
      // glazed ceramic insulator
      alb = mix(c2, vec3(1.0), 0.15) * 0.8;
      gloss = 0.8;
    }
    col = alb * light * 1.9 * occ;
    col += specL * gloss * occ;
    // the polished running surface carries the far glow along each rail
    float topR = (mat > 2.5 && mat < 3.5) ? smoothstep(0.85, 0.98, N.y) : 0.0;
    col += mix(c0, c2, 0.6) * topR * 0.35 * smoothstep(2.0, 18.0, z);
  } else {
    // ---- the lining: segments, eroded ribs, engraved strokes, cables ----
    float th = atan(P.y, P.x);
    float ribN = floor(s / RIBGAP + 0.5);
    float sr = (fract(s / RIBGAP + 0.5) - 0.5) * RIBGAP;
    float wR = 0.09 + 0.04 * vn(vec2(th * 6.0, ribN * 3.1));
    float chip = smoothstep(0.62, 0.8, vn(vec2(th * 22.0, ribN * 7.7)));
    wR *= 1.0 - 0.45 * chip;
    float rib = 1.0 - smoothstep(wR - aa, wR + aa, abs(sr));
    float nearFace = rib * smoothstep(wR * 0.35, wR, -sr);
    float ao = mix(0.45, 1.0, smoothstep(wR, wR + 0.35, abs(sr)));

    float grime = fbm(vec2(th * 3.0, s * 0.8));
    vec3 alb = mix(c3 * 0.40, mix(c3, c0, 0.5) * 0.22, grime);
    float segS = abs(fract(s / (RIBGAP / 3.0)) - 0.5) * (RIBGAP / 3.0);
    float segT = abs(fract(th / 0.45) - 0.5) * 0.45;
    float seam = max(1.0 - smoothstep(0.004, 0.004 + aa, abs(segS - RIBGAP / 6.0)),
                     1.0 - smoothstep(0.004, 0.004 + aa, abs(segT - 0.225)));
    float lum = dot(light, vec3(0.33));
    float fadeS = smoothstep(2.0, 6.0, 0.07 / pw);
    float fadeT = smoothstep(2.0, 6.0, 0.085 / pw);
    float wf1 = clamp(lum * 1.4, 0.0, 1.0) * 0.5;
    float wf2 = smoothstep(0.25, 0.9, lum) * 0.35;
    float hA = lines(s + 0.01 * sin(th * 9.0), 0.07, wf1, aa) * fadeS;
    float hB = lines(th, 0.085, wf2, aa) * fadeT;
    float strokes = 1.0 - (1.0 - hA) * (1.0 - hB * (1.0 - rib));
    vec3 inkCol = mix(mix(c3 * 1.6, c0, smoothstep(0.15, 0.6, lum)), c1, smoothstep(0.55, 1.2, lum) * grime);
    col = alb * light * ao * (1.0 - 0.6 * seam);
    col += inkCol * light * strokes * 0.8 * ao * (1.0 - seam);
    col += c1 * light * 0.15 * (1.0 - fadeS);
    vec3 ribAlb = mix(c3 * 0.5, c0 * 0.35, vn(vec2(th * 30.0, s * 30.0)));
    float rLines = lines(th * 3.0, 0.11, 0.25, aa * 3.0) * fadeT;
    vec3 ribCol = ribAlb * light * 1.3 + c2 * nearFace * light * 0.5 + c1 * rLines * light * 0.3;
    col = mix(col, ribCol, rib);

    // cable trays: sagging cables on brackets, two runs
    for (int j = 0; j < 10; j++) {
      float fj = float(j);
      float tray = step(4.5, fj);
      float jj = fj - 5.0 * tray;
      float base = mix(PI - 0.30, 0.30, tray);
      float dir = mix(1.0, -1.0, tray);
      float hj = hs1(fj + 3.0);
      float thc = base + (jj - 2.0) * 0.042 + 0.008 * (hj - 0.5);
      float rc = 0.008 + 0.009 * hs1(fj + 11.0);
      float u = fract(s / 1.2 + hj * 0.25);
      float sag = 0.055 * 4.0 * u * (1.0 - u) * (0.5 + 0.8 * hs1(fj + 19.0));
      float dth = th - (thc + dir * sag);
      float cov = 1.0 - smoothstep(rc - aa, rc + aa, abs(dth));
      float x = clamp(dth / rc, -1.0, 1.0);
      float cyl = sqrt(max(1.0 - x * x, 0.0));
      float spec = exp(-(x + 0.35) * (x + 0.35) * 14.0);
      float hk = hs1(fj + 23.0);
      vec3 jac = (hk < 0.4 ? c3 : (hk < 0.75 ? c0 * 0.8 : c1 * 0.7)) * 0.4;
      vec3 cc = jac * light * (0.4 + 0.9 * cyl) + mix(c1, c2, 0.5) * spec * light * 0.8;
      col = mix(col, cc, cov * smoothstep(0.0, 1.0, rc / pw * 2.0 + 0.3));
    }
    float bu = abs(fract(s / 1.2) - 0.5) * 1.2;
    float brk = smoothstep(0.57 - aa, 0.57, bu)
              * max(1.0 - smoothstep(0.13, 0.13 + aa, abs(th - (PI - 0.30))),
                    1.0 - smoothstep(0.13, 0.13 + aa, abs(th - 0.30)));
    col = mix(col, c3 * 0.15 + c0 * light * 0.4, brk * 0.85);
    col *= 1.0 - 0.8 * plate;
    col += glare;
  }

  // haze down the bore toward the pale far bend
  float fogA = 1.0 - exp(-z * 0.05);
  vec3 fogC = mix(c3 * 0.32, mix(c0, c2, 0.45), smoothstep(6.0, 36.0, z));
  float drift = fbm(uv * 2.5 + vec2(t * 0.04, -t * 0.02));
  fogC *= 0.75 + 0.5 * drift;
  col = mix(col, fogC, fogA);
  col += glare * isFloor * 0.25;
  col += mix(c0, c2, 0.75) * 0.42 * smoothstep(14.0, 40.0, z) * (0.8 + 0.3 * drift);
  col += c1 * 0.05 * smoothstep(8.0, 22.0, z) * (1.0 - smoothstep(30.0, 50.0, z));

  col = col / (1.0 + 0.25 * col);
  gl_FragColor = vec4(col, 1.0);
}
