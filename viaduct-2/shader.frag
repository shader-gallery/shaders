// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Underpass road in fog - a concrete viaduct runs overhead along the road,
// its bents of square piers and heavy cross beams receding into fog toward a
// vanishing point on the left third. Sodium lamps on the piers and on tall
// poles along the open left verge hang in wide halos, and the wet asphalt
// below drags their light toward the viewer in long broken streaks. The cold
// blue-black fog rolls in slow banks while the view creeps forward and a car
// pulls away ahead.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fog;    // density of the fog and size of the halos (default 1)
uniform float u_wet;    // wetness of the road and length of the streaks (default 1)
uniform float u_drift;  // speed of the slow creep under the viaduct (default 1)

const float S   = 24.0;  // bent spacing along the viaduct, metres
const float PS  = 29.0;  // lamp pole spacing on the open verge
const float EYE = 1.45;  // camera height
const float FOC = 1.25;  // focal length
const float CX  = -4.6;  // camera sits in the left lane
const float HD  = 9.0;   // height of the deck soffit
const float XD0 = -3.0;  // deck edge over the road
const float XA  = 7.6;   // near pier row
const float XB  = 15.5;  // far pier row

vec3 gC0, gC1, gC2, gC3, gAmb, gS0, gS1, gS3;
float gT, gFog, gWet, gCamZ, gPx;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.317, 289.71))) * 21734.613);
}
float hs1(float x) {
  return fract(sin(x * 73.519 + 2.83) * 46021.37);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = p * 2.07 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s;
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 proj(vec3 w) {
  vec3 d = w - vec3(CX, EYE, gCamZ);
  return d.xy / max(d.z, 0.1) * FOC;
}

// nearest entry of a ray into an axis box, with the face normal
float boxHit(vec3 ro, vec3 rd, vec3 c, vec3 h, out vec3 nor) {
  vec3 m = 1.0 / rd;
  vec3 n = m * (ro - c);
  vec3 k = abs(m) * h;
  vec3 t1 = -n - k, t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  nor = vec3(0.0);
  if (tN > tF || tF < 0.0 || tN < 0.0) return -1.0;
  nor = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  return tN;
}

// pier n of the near row: half sizes vary a little bent to bent
vec3 pierHalf(float n) {
  return vec3(0.75 + 0.2 * hs1(n * 3.1), (HD - 1.6) * 0.5, 0.8 + 0.2 * hs1(n * 5.7));
}

// sodium lamp on the road face of pier n, and one on pole n of the verge
vec3 pierLamp(float n) {
  return vec3(XA - pierHalf(n).x - 0.3, 5.6, n * S);
}
vec3 poleLamp(float n) {
  return vec3(-8.9, 8.3 + 0.5 * hs1(n * 2.2), n * PS + 9.0 + 5.0 * hs1(n * 6.6));
}
float lampPow(float n, float k) {
  float h = hs1(n * 1.91 + k * 7.0);
  float p = 0.8 + 0.35 * hs1(n * 2.47 + k);
  p *= h < 0.08 ? 0.05 : 1.0;
  p *= h > 0.9 ? 0.55 + 0.45 * sin(gT * (0.7 + h) + n) : 1.0;
  return p;
}
// lamp k = 0 on the piers, 1 on the verge poles, 2 hung under the cross beams
vec3 farLamp(float n) {
  return vec3(XB - pierHalf(n).x * 1.1 - 0.3, 4.8, n * S);
}
vec3 capLamp(float n) {
  return vec3(1.2 + 0.6 * hs1(n * 8.8), HD - 1.75, n * S + 0.4);
}
vec3 lampCol(float n, float k) {
  return mix(gS1, mix(gC2, vec3(1.0, 0.93, 0.85), 0.3), 0.3 + 0.5 * hs1(n * 4.3 + k * 3.0));
}

// the cold fog itself, warmed toward the far end of the road
vec3 hazeCol(vec2 q) {
  float gx = q.x - 0.02;
  float w = exp(-abs(q.y) * 6.0) * exp(-gx * gx * 5.0);
  // blue-black away from the lamps, giving way to sodium near the road end
  vec3 c = gAmb * (1.5 - 0.7 * smoothstep(0.0, 0.6, q.y)) * (1.0 - 0.8 * w);
  c += (gS0 * 0.2 + gS3 * 0.16) * w;
  c += gS1 * 0.2 * exp(-abs(q.y) * 22.0) * exp(-gx * gx * 30.0);
  return c;
}

float fogAt(float t, vec3 P) {
  float bank = 0.55 + 0.9 * vn(vec2(P.x * 0.05 + gT * 0.07, P.z * 0.02 - gT * 0.03));
  return 1.0 - exp(-t * 0.016 * gFog * bank);
}

// light from the nearby lamps on a surface point
vec3 lightAt(vec3 P, vec3 N) {
  vec3 acc = vec3(0.0);
  float b = floor(P.z / S + 0.5);
  for (int i = 0; i < 4; i++) {
    float n = b - 1.0 + float(i);
    vec3 d = pierLamp(n) - P;
    float d2 = max(dot(d, d), 0.6);
    vec3 l = d * inversesqrt(d2);
    float dirw = 0.15 + 0.85 * smoothstep(-0.2, 0.6, l.x);
    float face = max(dot(N, l), 0.0) * 0.85 + 0.15;
    acc += lampCol(n, 0.0) * lampPow(n, 0.0) * face * dirw * 90.0 / d2 * exp(-sqrt(d2) * 0.012 * gFog);
    d = capLamp(n) - P;
    d2 = max(dot(d, d), 0.6);
    l = d * inversesqrt(d2);
    face = max(dot(N, l), 0.0) * 0.85 + 0.15;
    acc += lampCol(n, 2.0) * lampPow(n, 2.0) * face * max(l.y, 0.1) * 130.0 / d2 * exp(-sqrt(d2) * 0.012 * gFog);
    d = farLamp(n) - P;
    d2 = max(dot(d, d), 0.6);
    l = d * inversesqrt(d2);
    face = max(dot(N, l), 0.0) * 0.85 + 0.15;
    acc += lampCol(n, 3.0) * lampPow(n, 3.0) * face * (0.15 + 0.85 * smoothstep(-0.2, 0.6, l.x)) * 70.0 / d2 * exp(-sqrt(d2) * 0.012 * gFog);
  }
  float pb = floor((P.z - 9.0) / PS + 0.5);
  for (int i = 0; i < 3; i++) {
    float n = pb - 1.0 + float(i);
    vec3 d = poleLamp(n) - P;
    float d2 = max(dot(d, d), 0.6);
    vec3 l = d * inversesqrt(d2);
    float dirw = max(l.y, 0.0);
    float face = max(dot(N, l), 0.0) * 0.85 + 0.15;
    acc += lampCol(n, 1.0) * lampPow(n, 1.0) * face * dirw * dirw * 160.0 / d2 * exp(-sqrt(d2) * 0.012 * gFog);
  }
  return acc;
}

// distance in a box face to its nearest edge, for the chamfer and grime
float edgeDist(vec3 lp, vec3 h, vec3 nor) {
  vec3 e = h - abs(lp);
  e += abs(nor) * 1e3;
  return min(min(e.x, e.y), e.z);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  gC0 = c0; gC1 = c1; gC2 = c2; gC3 = c3;
  // squared slots: the same hues pushed toward saturated sodium light
  gS0 = mix(c0, c0 * c0, 0.6); gS1 = mix(c1, c1 * c1, 0.5); gS3 = c3 * c3;
  gT = u_time;
  gFog = clamp(u_fog, 0.0, 2.0);
  gWet = clamp(u_wet, 0.0, 1.5);
  gCamZ = gT * 1.6 * clamp(u_drift, 0.0, 2.0) + 30.0;
  // blue-black of the fog against the sodium light
  gAmb = vec3(0.008, 0.016, 0.045);

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  gPx = 1.0 / mn;
  vec2 vp = vec2(-res.x / mn / 6.0, 0.02);
  vec2 q = uv - vp;

  vec3 ro = vec3(CX, EYE, gCamZ);
  vec3 rd = normalize(vec3(q, FOC));
  vec3 rs = rd;
  rs.x = abs(rs.x) < 1e-5 ? 1e-5 : rs.x;
  rs.y = abs(rs.y) < 1e-5 ? 1e-5 : rs.y;

  // nearest surface: 1 ground, 2 soffit, 3 fascia, 4 pier, 5 cross beam
  float tH = 1e5;
  float mat = 0.0;
  vec3 N = vec3(0.0);
  vec3 lp = vec3(0.0), bh = vec3(1.0);
  float id = 0.0;
  if (rd.y < 0.0) {
    tH = -EYE / rs.y; mat = 1.0; N = vec3(0.0, 1.0, 0.0);
  } else {
    float t = (HD - EYE) / rs.y;
    if (ro.x + rd.x * t > XD0) { tH = t; mat = 2.0; N = vec3(0.0, -1.0, 0.0); }
  }
  if (rd.x > 0.0) {
    float t = (XD0 - ro.x) / rs.x;
    float y = ro.y + rd.y * t;
    if (y > HD - 0.6 && y < HD + 1.5 && t < tH) { tH = t; mat = 3.0; N = vec3(-1.0, 0.0, 0.0); }
  }
  float base = floor(gCamZ / S);
  for (int i = 0; i < 12; i++) {
    float n = base + float(i);
    float zk = n * S;
    vec3 nr;
    vec3 ha = pierHalf(n);
    vec3 ca = vec3(XA, ha.y, zk);
    float t = boxHit(ro, rs, ca, ha, nr);
    if (t > 0.0 && t < tH) { tH = t; mat = 4.0; N = nr; lp = ro + rd * t - ca; bh = ha; id = n; }
    vec3 hb = vec3(ha.x * 1.1, ha.y, ha.z);
    vec3 cb = vec3(XB, ha.y, zk);
    t = boxHit(ro, rs, cb, hb, nr);
    if (t > 0.0 && t < tH) { tH = t; mat = 4.0; N = nr; lp = ro + rd * t - cb; bh = hb; id = n + 0.5; }
    vec3 hc = vec3(7.6, 0.8, 1.05);
    vec3 cc = vec3(9.0, HD - 0.8, zk);
    t = boxHit(ro, rs, cc, hc, nr);
    if (t > 0.0 && t < tH) { tH = t; mat = 5.0; N = nr; lp = ro + rd * t - cc; bh = hc; id = n; }
  }

  vec3 P = ro + rd * tH;
  float dz = tH * rd.z;
  vec3 col;
  bool ground = mat == 1.0;
  float wetK = 0.0;

  if (mat == 0.0) {
    col = hazeCol(q);
  } else if (mat == 1.0) {
    float fpx = dz * gPx / FOC;
    float ax = P.x;
    float onRoad = smoothstep(-7.6 - fpx, -7.4 + fpx, ax) * smoothstep(4.6 + fpx, 4.4 - fpx, ax);
    float fine = mix(vn(P.xz * 60.0), 0.5, smoothstep(0.004, 0.02, fpx));
    float mid = fbm(P.xz * vec2(0.8, 0.3));
    float alb = 0.05 + 0.025 * fine + 0.02 * mid;
    // paint: edge lines and a dashed centre line, worn
    float wear = 0.4 + 0.6 * vn(P.xz * vec2(2.5, 0.6));
    float edge = smoothstep(0.08 + fpx, 0.08 - fpx, abs(ax + 7.25)) + smoothstep(0.08 + fpx, 0.08 - fpx, abs(ax - 4.25));
    float dashU = fract(P.z / 9.0);
    float fpz = fpx * dz / EYE;
    float dw = min(fpz / 9.0, 0.5);
    float dash = smoothstep(0.0, dw + 0.01, dashU) * smoothstep(0.4 + dw, 0.4 - dw, dashU);
    dash = mix(dash, 0.4, smoothstep(0.2, 0.5, fpz / 9.0));
    float centre = smoothstep(0.07 + fpx, 0.07 - fpx, abs(ax + 1.5)) * dash;
    float paint = max(edge, centre) * wear * onRoad;
    // verges: gravel under the viaduct, dark grass on the open side
    float off = 0.025 + 0.025 * fbm(P.xz * 0.7);
    alb = mix(off, alb, onRoad);
    alb = mix(alb, 0.32, paint);
    // standing water: puddles in the ruts and along the kerbs
    float pud = smoothstep(0.42, 0.6, fbm(P.xz * vec2(0.22, 0.08) + 4.0));
    float r1 = (ax + 4.6) / 0.6 - 1.4, r2 = (ax + 4.6) / 0.6 + 1.4;
    float rut = exp(-r1 * r1) + exp(-r2 * r2);
    wetK = clamp(gWet * (0.35 + 0.65 * max(pud, rut * 0.6)) * mix(0.5, 1.0, onRoad), 0.0, 1.5);
    alb *= 1.0 - 0.45 * min(wetK, 1.0);
    col = alb * (gAmb * 2.5 + lightAt(P + vec3(0.0, 0.05, 0.0), N));
    // the wet road mirrors the fog above it
    float fres = 0.25 + 0.75 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0);
    col += hazeCol(vec2(q.x, -q.y)) * 0.5 * fres * min(wetK, 1.0);
  } else if (mat == 2.0) {
    // soffit: girders run along the deck, stained by seeping joints
    float u = fract((P.x - XD0) / 3.6);
    float gird = smoothstep(0.0, 0.04, u) * smoothstep(0.34, 0.3, u);
    float stain = fbm(vec2(P.x * 0.6, P.z * 0.08));
    float alb = (0.12 + 0.1 * gird + 0.06 * stain) * (0.85 + 0.15 * vn(P.xz * 6.0));
    float joint = smoothstep(0.12, 0.0, abs(fract(P.z / S + 0.5) - 0.5) * S - 1.2);
    alb *= 1.0 - 0.5 * joint * stain;
    col = alb * (gAmb * 3.0 + lightAt(P, N) * (0.7 + 0.5 * gird));
  } else if (mat == 3.0) {
    // fascia: a long precast edge beam with drip streaks from the drains
    float yy = P.y - HD;
    float drain = fract(P.z / 6.0);
    float dr = (drain - 0.5) * 9.0;
    float streak = exp(-dr * dr) * smoothstep(1.4, -0.4, yy) * (0.5 + 0.5 * vn(vec2(P.z * 3.0, yy * 2.0)));
    float lip = smoothstep(0.05, 0.0, abs(yy - 1.2));
    float alb = (0.2 + 0.08 * vn(vec2(P.z * 1.5, yy * 8.0))) * (1.0 - 0.55 * streak) + 0.1 * lip;
    col = alb * (gAmb * 3.0 + lightAt(P, N));
  } else {
    // concrete piers and cross beams: board-marked, chamfered, weathered
    float ed = edgeDist(lp, bh, N);
    float vert = mat == 4.0 ? lp.y + bh.y : 0.0;
    vec2 fc = abs(N.x) > 0.5 ? vec2(lp.z, lp.y) : (abs(N.z) > 0.5 ? vec2(lp.x, lp.y) : lp.xz);
    float board = smoothstep(0.03, 0.0, abs(fract(fc.y / 0.6) - 0.5) - 0.47);
    float grain = vn(fc * vec2(3.0, 18.0) + id * 7.0);
    float alb = 0.2 + 0.06 * grain - 0.05 * board;
    // rust and water runs under the cross beam, grime splashed at the foot
    float runs = smoothstep(0.55, 0.85, vn(vec2(fc.x * 4.0 + id * 3.0, 0.5))) * smoothstep(bh.y * 0.2, bh.y * 1.6, vert);
    float splash = smoothstep(1.6, 0.0, vert) * (0.6 + 0.4 * vn(fc * 5.0));
    // spalled concrete only near the arrises, where the cover is thin
    float spall = smoothstep(0.7, 0.78, vn(fc * 4.0 + id * 11.0)) * smoothstep(0.35, 0.1, ed);
    alb *= 1.0 - 0.5 * runs - 0.45 * splash * (mat == 4.0 ? 1.0 : 0.0);
    alb = mix(alb, 0.12, spall * 0.7);
    float chamfer = smoothstep(0.09, 0.03, ed);
    vec3 lit = lightAt(P + N * 0.05, N);
    col = alb * (gAmb * 3.0 + lit) + lit * 0.035 * chamfer;
  }

  // fog over every surface
  if (mat > 0.0) {
    float f = fogAt(tH, P);
    col = mix(col, hazeCol(q), f);
  } else {
    // drifting wisps in the open air, lit warm low down
    float w = fbm(vec2(q.x * 3.0 + gT * 0.04, q.y * 6.0 - gT * 0.02));
    col += (gS3 * 0.12 + gS0 * 0.08) * w * exp(-max(q.y, 0.0) * 3.0) * gFog;
  }

  // lamp poles on the open verge
  float pb = floor((gCamZ - 9.0) / PS);
  for (int i = 0; i < 10; i++) {
    float n = pb + 9.0 - float(i);
    vec3 L = poleLamp(n);
    float lz = L.z - gCamZ;
    if (lz < 2.0 || lz > dz) continue;
    vec2 a = proj(vec3(-10.2, 0.0, L.z));
    vec2 b = proj(vec3(-10.2, L.y + 0.6, L.z));
    vec2 e = proj(vec3(-9.0, L.y + 0.25, L.z));
    float wd = 0.11 * FOC / lz;
    float d = sdSeg(q, a, b) - wd;
    d = min(d, sdSeg(q, b, e) - wd * 0.55);
    float cov = smoothstep(gPx, -gPx, d);
    vec3 pc = gAmb * 0.8 + lampCol(n, 1.0) * 0.03 * lampPow(n, 1.0);
    col = mix(col, mix(pc, hazeCol(q), 1.0 - exp(-lz * 0.016 * gFog)), cov);
  }

  // lamps: cores, halos in the fog, and their streaks on the wet road
  float halos = 0.0;
  for (int k = 0; k < 4; k++) {
    for (int i = 0; i < 10; i++) {
      float n, kk = float(k);
      vec3 L;
      if (k == 0) { n = base + 9.0 - float(i); L = pierLamp(n); }
      else if (k == 1) { n = pb + 9.0 - float(i); L = poleLamp(n); }
      else if (k == 2) { n = base + 9.0 - float(i); L = capLamp(n); }
      else { n = base + 9.0 - float(i); L = farLamp(n); }
      float lz = L.z - gCamZ;
      if (lz < 1.0) continue;
      float pw = lampPow(n, kk);
      vec3 lc = lampCol(n, kk);
      float att = exp(-lz * 0.009 * gFog);
      vec2 s = proj(L);
      vec2 dl = q - s;
      float r = max(0.22 * FOC / lz, gPx * 1.3);
      float vis = lz < dz + 0.5 ? 1.0 : 0.25;
      float core = exp(-dot(dl, dl) / (r * r)) * vis;
      float hr = (2.5 + 2.5 * gFog) * FOC / lz + 0.004;
      float halo = 1.0 / (1.0 + dot(dl, dl) / (hr * hr * 0.06)) * 0.16 * (0.2 + gFog) * mix(0.5, 1.0, vis);
      float glare = exp(-dot(dl, dl) / (r * r * 12.0)) * 0.35 + exp(-dot(dl, dl) / (r * r * 60.0)) * 0.12 * (0.3 + gFog);
      col += pw * att * (lc * (core * 2.8 + glare) + mix(gS0, gS1, 0.5) * halo);
      halos += pw * att * halo;
      if (ground) {
        vec2 m = proj(vec3(L.x, -L.y, L.z));
        float dy = q.y - m.y;
        float wob = (vn(vec2(q.y * 160.0 - gT * 0.8, n * 3.0 + kk)) - 0.5) * r * 1.2;
        float dx = q.x - m.x + wob;
        float wx = max(r * 1.3, gPx * 1.5);
        float wy = (0.02 + 2.2 * FOC / lz) * (0.4 + 0.6 * gWet) * (dy < 0.0 ? 1.8 : 0.6);
        float brk = 0.3 + 0.7 * smoothstep(0.35, 0.65, vn(vec2(q.x * 20.0, q.y * 220.0 / (0.3 + gWet) + gT * 0.5 + n)));
        float st = exp(-dx * dx / (wx * wx)) * exp(-dy * dy / (wy * wy)) * brk * min(wetK, 1.2);
        col += lc * pw * att * st * 1.1;
      }
    }
  }

  // a car pulling away ahead and one coming the other way under the deck
  for (int c = 0; c < 2; c++) {
    float fc = float(c);
    float cz = c == 0 ? 40.0 + mod(gT * 2.2 + 30.0, 220.0) : 260.0 - mod(gT * 9.0 + 90.0, 250.0);
    float fade = smoothstep(12.0, 30.0, cz) * smoothstep(255.0, 200.0, cz) * exp(-cz * 0.008 * gFog);
    vec3 w = c == 0 ? vec3(-4.3, 0.8, gCamZ + cz) : vec3(1.4, 0.7, gCamZ + cz);
    vec3 lcol = c == 0 ? gC3 * 1.5 + gC0 * 0.3 : mix(gC2, vec3(1.0), 0.55);
    float r = max(0.13 * FOC / cz, gPx * 1.2);
    for (int s = 0; s < 2; s++) {
      vec3 Lw = w + vec3(float(s) * 1.5 - 0.75, 0.0, 0.0);
      vec2 lp2 = proj(Lw);
      vec2 dl = q - lp2;
      float hr = 1.5 * FOC / cz + 0.003;
      col += lcol * fade * (exp(-dot(dl, dl) / (r * r)) * 2.2 + 0.05 * (0.3 + gFog) / (1.0 + dot(dl, dl) / (hr * hr * 0.05)));
      if (ground) {
        vec2 m = proj(vec3(Lw.x, -Lw.y, Lw.z));
        float dy = q.y - m.y;
        float dx = q.x - m.x + (vn(vec2(q.y * 90.0 - gT, fc * 9.0)) - 0.5) * r * 2.0;
        float wy = (0.015 + 1.5 * FOC / cz) * (0.4 + 0.6 * gWet) * (dy < 0.0 ? 2.5 : 0.5);
        col += lcol * fade * exp(-dx * dx / (r * r * 1.6)) * exp(-dy * dy / (wy * wy)) * min(wetK, 1.2) * 0.9;
      }
    }
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.9);
  gl_FragColor = vec4(col, 1.0);
}
