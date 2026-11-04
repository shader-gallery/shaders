// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A straight desert highway at night running to a glowing town on the horizon.
// Lamp posts on the left and timber telephone poles on the right recede to the
// vanishing point, eroded mesas and hoodoo spires stand in two layers against
// a peach and pink sky, and the far asphalt still breathes heat: a rising
// refraction field bends the distant lamps, headlights and mountains, and a
// mirage pool on the far road mirrors them upside down. Cars come and go.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_shimmer;  // strength of the heat shimmer bending the far road (default 1.0)
uniform float u_mirage;   // strength of the mirage pool mirroring lights on the far road (default 1.0)
uniform float u_traffic;  // speed of the cars along the road (default 1.0)
uniform float u_lamps;    // brightness of the roadside lamps and their pools (default 1.0)

const vec3  RO  = vec3(1.75, 1.3, 0.0); // eye, standing in the right lane
const float FOC = 1.7;                  // focal length
const float LZ0 = 9.0;                  // first lamp post
const float LDZ = 27.0;                 // lamp spacing
const float RW  = 3.75;                 // half width of the road

vec3 FW; vec3 RT; vec3 UP;
vec3 C0; vec3 C1; vec3 C2; vec3 C3;
float TT;

float hh(vec2 p) {
  p = fract(p * vec2(0.2731, 0.6163));
  p += dot(p, p + vec2(17.83, 41.29));
  return fract(p.x * p.y);
}

float sq(float x) { return x * x; }

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), u.x),
             mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.11 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s * 1.07;
}

vec3 proj(vec3 p) {
  vec3 q = p - RO;
  float z = dot(q, FW);
  return vec3(FOC * vec2(dot(q, RT), dot(q, UP)) / max(z, 0.01), z);
}

// one lamp post: z, brightness (0 when dead), tint
vec3 lampK(float k) {
  float a = hh(vec2(k, 2.7)), b = hh(vec2(k, 6.1));
  float z = LZ0 + LDZ * k + 5.0 * (a - 0.5);
  float on = k < 2.5 ? 1.0 : step(0.1, b);
  float fl = 1.0;
  if (b > 0.9) fl = 0.55 + 0.45 * smoothstep(0.2, 0.6, vn(vec2(TT * 3.0, k)));
  return vec3(z, on * fl * (0.75 + 0.5 * a), b);
}
vec3 lampHead(float z) { return vec3(-2.2, 6.9, z); }
vec3 lampCol(float b) { return mix(mix(C0, C0 * C0, 0.6), mix(C0, C1 * C1, 0.6), smoothstep(0.3, 0.8, b)); }

// cars: x=lane, z, fade
vec3 carK(float i) {
  float sp = 15.0 * clamp(u_traffic, 0.0, 2.0);
  float ph = hh(vec2(i, 9.4));
  float z;
  float x;
  if (i < 2.5) { z = 20.0 + 480.0 * fract(ph + i * 0.33 - TT * sp / 480.0); x = -1.85; }
  else { z = 20.0 + 480.0 * fract(ph + i * 0.37 + TT * sp * 0.8 / 480.0); x = 1.8; }
  float fade = smoothstep(20.0, 45.0, z) * smoothstep(500.0, 380.0, z);
  return vec3(x, z, fade);
}

// a cliff-sided mesa with a talus skirt, height in elevation units
float mesa(float az, float a, float w, float h, float seed) {
  float d = abs(az - a);
  float er = 0.03 * (fbm(vec2(az * 60.0 + seed, seed)) - 0.5);
  float gul = 0.014 * smoothstep(0.55, 0.9, vn(vec2(az * 80.0, seed + 2.0)));
  // caprock cliff, a ledge of softer rock below, then the talus skirt
  float top = h * (1.0 + 0.08 * (fbm(vec2(az * 30.0, seed)) - 0.5));
  float y = min(top, (w + er - d) * 4.0);
  float lv = hh(vec2(seed, 5.5));
  y = max(y, min(h * (0.5 + 0.25 * lv) - gul, (w + 0.02 + 0.03 * lv + er - d) * (1.6 + 1.2 * lv)));
  y = max(y, min(h * 0.38 - gul * 0.5, (w + 0.06 + er * 0.6 - d) * 0.6));
  y = max(y, (w + 0.18 - d) * 0.07);
  return max(y, 0.0);
}
// a hoodoo: a necked, bulging pillar of soft rock under a hard caprock.
// returns a horizontal signed distance, negative inside
float hoodoo(float az, float e, float a, float w, float h, float seed) {
  float y = e / h;
  if (y > 1.12) return 1.0;
  float d = abs(az - a);
  float wy = w * (1.0 - 0.45 * y) * (1.0 + 0.2 * sin(y * 12.0 + seed) + 0.08 * sin(y * 29.0 + seed * 2.0));
  wy *= 1.0 - 0.4 * smoothstep(0.72, 0.86, y) * smoothstep(0.98, 0.88, y);
  wy *= 1.0 + 0.9 * smoothstep(0.2, 0.0, y);
  wy += w * 0.08 * (vn(vec2(e * 600.0, seed)) - 0.5);
  float body = y < 0.93 ? d - wy : 1.0;
  float cap = (length(vec2(d / (w * 0.75), (y - 0.98) / 0.1)) - 1.0) * w * 0.5;
  cap += w * 0.06 * (vn(vec2(az * 500.0, seed)) - 0.5);
  return min(body, cap);
}
float farRidge(float az) {
  float y = 0.004 + 0.006 * fbm(vec2(az * 9.0, 1.0));
  y = max(y, mesa(az, 0.17, 0.06, 0.026, 3.0));
  y = max(y, mesa(az, 0.33, 0.035, 0.019, 5.0));
  y = max(y, mesa(az, -0.17, 0.08, 0.022, 7.0));
  y = max(y, mesa(az, 0.62, 0.12, 0.032, 11.0));
  return y;
}
float nearRidge(float az) {
  float y = 0.002 + 0.005 * fbm(vec2(az * 14.0, 4.0));
  y = max(y, mesa(az, 0.47, 0.06, 0.07, 13.0));
  y = max(y, mesa(az, 0.64, 0.025, 0.046, 31.0));
  y = max(y, mesa(az, -0.45, 0.05, 0.028, 29.0));
  return y;
}
float hoodoos(float az, float e) {
  float d = hoodoo(az, e, -0.31, 0.02, 0.085, 1.0);
  d = min(d, hoodoo(az, e, -0.262, 0.013, 0.058, 4.0));
  d = min(d, hoodoo(az, e, -0.355, 0.015, 0.046, 7.0));
  d = min(d, hoodoo(az, e, -0.39, 0.01, 0.03, 9.0));
  return d;
}

// night sky over the desert, with the two ridge layers
vec3 backdrop(vec3 rd) {
  float e = rd.y;
  float az = rd.x / max(rd.z, 0.05);
  // deep teal zenith, a pink middle sky, a peach band on the horizon
  vec3 top = C2 * C2 * C2 * 0.05 + vec3(0.0, 0.002, 0.006);
  vec3 mid = C1 * C1 * C1 * 0.05 + C2 * C2 * C2 * 0.06;
  vec3 low = C0 * C0 * 0.2 + C1 * C1 * 0.05;
  vec3 col = mix(low, mid, smoothstep(0.0, 0.07, e));
  col = mix(col, top, smoothstep(0.06, 0.32, e));
  float gx = az * az;
  col += (C0 * C0 * 0.3 + C1 * C1 * 0.12) * exp(-gx * 6.0) * exp(-max(e, 0.0) * 18.0);
  col += mix(C0, vec3(1.0), 0.3) * 0.5 * exp(-gx * 120.0) * exp(-max(e, 0.0) * 80.0);
  float cl = fbm(vec2(az * 1.4 + TT * 0.02, e * 9.0 + 2.0 - TT * 0.004));
  float cl2 = fbm(vec2(az * 3.0 - TT * 0.012, e * 22.0 + 7.0));
  float band = smoothstep(0.48, 0.85, cl) * smoothstep(0.03, 0.1, e) * (1.0 - smoothstep(0.2, 0.45, e));
  band *= 0.6 + 0.6 * cl2;
  col += (C1 * C1 * 0.14 + C0 * C0 * 0.05) * band * (0.35 + 1.4 * exp(-gx * 3.0));
  col += C2 * C2 * C2 * 0.12 * band * smoothstep(0.08, 0.3, e);
  vec2 sp = vec2(az, e) * 120.0;
  vec2 cell = floor(sp);
  float sh = hh(cell);
  vec2 f = fract(sp) - 0.5 - (vec2(hh(cell + 3.1), hh(cell + 7.7)) - 0.5) * 0.6;
  float st = smoothstep(0.13, 0.0, length(f)) * step(0.94, sh) * smoothstep(0.07, 0.2, e) * (1.0 - band);
  col += mix(C2, vec3(1.0), 0.5) * st * (0.25 + 0.6 * fract(sh * 17.0)) * (0.75 + 0.25 * sin(TT * 1.3 + sh * 40.0));

  // far mesas in pink haze, soft strata catching the town glow
  float glowW = exp(-gx * 2.5);
  float hf = farRidge(az);
  if (e < hf) {
    float strata = 0.8 + 0.2 * sin(e * 700.0 + 5.0 * fbm(vec2(az * 30.0, 2.0)));
    vec3 fc = (C1 * C1 * 0.08 + C0 * C0 * 0.07) * (0.45 + 0.55 * glowW) * strata;
    fc += C0 * 0.10 * glowW * exp(-(hf - e) * 160.0);
    col = mix(col, fc, smoothstep(0.0, 0.0015, hf - e));
  }
  // near butte, spires and hoodoos, darker, rim lit from the glow
  float hn = nearRidge(az);
  float hd = hoodoos(az, e);
  float aa = 0.0012;
  float inN = max(smoothstep(0.0, aa, hn - e), smoothstep(aa * 0.5, -aa * 0.5, hd));
  if (inN > 0.0) {
    float edgeD = min(max(hn - e, 0.0), hd < 0.0 ? -hd : 1.0);
    float strata = 0.6 + 0.4 * smoothstep(0.3, 0.7, fbm(vec2(az * 14.0, e * 180.0)));
    vec3 nc = (C2 * C2 * 0.012 + C1 * C1 * 0.02) * strata;
    nc += C0 * C0 * 0.035 * smoothstep(0.0, 0.9, sin(e * 480.0 + 6.0 * fbm(vec2(az * 25.0, 5.0)))) * glowW;
    nc += (C0 * 0.12 + C1 * 0.06) * (0.35 + 0.65 * glowW) * exp(-edgeD * 300.0);
    nc += C1 * C1 * 0.02 * smoothstep(0.012, 0.0, e);
    col = mix(col, nc, inN);
  }
  return col;
}

// light falling on a ground point from lamps and cars
vec3 groundLight(vec3 p, vec3 n, vec3 rd, float sheen) {
  vec3 acc = vec3(0.0);
  float k0 = floor((p.z - LZ0) / LDZ);
  float lk = clamp(u_lamps, 0.0, 2.5);
  for (int j = -1; j < 3; j++) {
    float k = k0 + float(j);
    if (k < 0.0 || k > 11.0) continue;
    vec3 lm = lampK(k);
    vec3 L = lampHead(lm.x) - p;
    float d2 = dot(L, L);
    float cosD = L.y * inversesqrt(d2);
    float I = lm.y * lk * 260.0 * max(L.y, 0.0) / (d2 * sqrt(d2)) * (0.12 + 0.88 * smoothstep(0.45, 0.8, cosD));
    vec3 Ln = L * inversesqrt(d2);
    float sp = pow(max(dot(reflect(rd, n), Ln), 0.0), 24.0) * sheen * 6.0;
    acc += lampCol(lm.z) * I * (max(dot(n, Ln), 0.0) + sp);
  }
  for (int i = 0; i < 3; i++) {
    vec3 c = carK(float(i));
    float dz = c.y - p.z;
    float dx = p.x - c.x;
    float beam = smoothstep(0.0, 4.0, dz) * exp(-dz * 0.03) * exp(-dx * dx / (0.5 + dz * dz * 0.025));
    acc += mix(C2, vec3(1.0), 0.5) * beam * c.z * (1.1 + sheen * 2.0);
  }
  return acc;
}

// coverage of a tapered screen segment
float seg(vec2 uv, vec2 a, vec2 b, float wa, float wb, float px) {
  vec2 pa = uv - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float w = mix(wa, wb, h);
  float d = length(pa - ba * h);
  float we = max(w, px * 0.5);
  return clamp((we - d) / px + 0.5, 0.0, 1.0) * min(w / (px * 0.5), 1.0);
}

vec3 glow(vec2 uv, vec3 P, float rad, float px, float squash) {
  vec3 q = proj(P);
  if (q.z < 1.0) return vec3(0.0, 0.0, 1e5);
  float rr = rad * FOC / q.z;
  float r = max(rr, px);
  vec2 d = uv - q.xy;
  d.y *= squash;
  float dd = dot(d, d);
  float core = exp(-dd / (r * r));
  float halo = (r * r * 9.0) / (dd + r * r * 9.0);
  float far = sqrt(clamp(rr / r, 0.15, 1.0));
  return vec3(core, halo * 0.22, q.z) * far;
}

void main() {
  C0 = u_palette[0]; C1 = u_palette[1]; C2 = u_palette[2]; C3 = u_palette[3];
  if (dot(C0,C0)+dot(C1,C1)+dot(C2,C2)+dot(C3,C3) < 1e-5) {
    C0 = vec3(0.231,0.510,0.965); C1 = vec3(0.659,0.333,0.969);
    C2 = vec3(0.133,0.827,0.933); C3 = vec3(0.957,0.247,0.369);
  }
  TT = u_time;
  vec2 res = max(u_resolution, vec2(1.0));
  float mn = min(res.x, res.y);
  float pr = max(u_pixelRatio, 1.0);
  vec2 uv0 = (gl_FragCoord.xy - 0.5 * res) / mn;
  float px = 1.0 / mn;

  FW = normalize(vec3(0.12, -0.075, 1.0));
  RT = normalize(cross(vec3(0.0, 1.0, 0.0), FW));
  UP = cross(FW, RT);
  vec2 vp = proj(RO + vec3(0.0, 0.0, 5000.0)).xy;

  // rising heat: a refraction offset field strongest just over the far road
  float shK = clamp(u_shimmer, 0.0, 2.0);
  float dy = uv0.y - vp.y;
  float bandW = dy > 0.0 ? exp(-dy * 22.0) : exp(dy * 7.0);
  float roadW = 0.45 + 0.55 * exp(-sq((uv0.x - vp.x) * 2.2));
  float amp = 0.006 * shK * bandW * roadW;
  vec2 off;
  off.x = vn(vec2(uv0.x * 50.0, uv0.y * 150.0 - TT * 2.4)) - 0.5;
  off.x += 0.6 * (vn(vec2(uv0.x * 110.0 + 3.0, uv0.y * 300.0 - TT * 4.1)) - 0.5);
  off.y = vn(vec2(uv0.x * 38.0 + 7.0, uv0.y * 120.0 - TT * 1.9)) - 0.5;
  vec2 uv = uv0 + amp * vec2(off.x * 1.6, off.y * 0.9);

  vec3 rd = normalize(FW * FOC + RT * uv.x + UP * uv.y);
  float mirK = clamp(u_mirage, 0.0, 1.5);
  vec3 col;
  float depth = 1e5;

  if (rd.y < -1e-4) {
    float t = min(-RO.y / rd.y, 3000.0);
    depth = t;
    vec3 p = RO + rd * t;
    float pw = t * px / FOC;           // world size of a pixel across
    float pz = pw * t / RO.y;          // and along the road
    float ax = abs(p.x);
    float edge = RW + 0.1 * (vn(vec2(p.z * 0.7, 1.0)) - 0.5);
    float road = smoothstep(edge + pw, edge - pw, ax);
    float det = 1.0 - smoothstep(0.015, 0.06, pw);

    // asphalt: patched, aggregate grain, polished tyre lanes, tar seams
    float patchN = fbm(p.xz * vec2(0.5, 0.12));
    float alb = 0.06 + 0.05 * patchN;
    alb += (vn(p.xz * 26.0) - 0.5) * 0.07 * det + (vn(p.xz * 61.0 + 4.0) - 0.5) * 0.04 * det;
    float lane = ax - 1.8;
    float wear = exp(-sq((abs(lane) - 0.85) * 3.0));
    float seamN = fbm(p.xz * vec2(0.6, 0.07) + 8.0);
    float seam = smoothstep(0.006 + pw, 0.0, abs(seamN - 0.5)) * det * smoothstep(0.4, 0.7, vn(p.xz * vec2(0.3, 0.05)));
    alb = mix(alb, 0.03, seam * 0.7);
    float sheen = (0.25 + 0.6 * wear + 0.8 * seam) * road;

    // paint: dashed centre line, worn edge lines
    float dashL = 12.0;
    float fz = fract(p.z / dashL);
    float dw = pz / dashL;
    float dash = smoothstep(0.28 + dw, 0.28 - dw, fz) * smoothstep(-dw, dw, fz);
    dash = mix(dash, 0.28, smoothstep(0.08, 0.3, dw));
    float cl = smoothstep(0.075 + pw, 0.075 - pw, abs(p.x)) * min(0.075 / pw, 1.0) * dash;
    float el = smoothstep(0.08 + pw, 0.08 - pw, abs(ax - 3.5)) * min(0.08 / pw, 1.0);
    float paint = clamp(cl + el, 0.0, 1.0) * (0.55 + 0.45 * smoothstep(0.2, 0.6, fbm(p.xz * vec2(3.0, 0.4))));

    // shoulder gravel, then desert sand with dark creosote clumps
    float sand = 0.12 + 0.07 * fbm(p.xz * vec2(0.3, 0.1)) + (hh(floor(p.xz * 18.0)) - 0.5) * 0.05 * det;
    vec2 sc = p.xz * vec2(0.45, 0.3);
    vec2 sci = floor(sc);
    vec2 scf = fract(sc) - 0.5 - (vec2(hh(sci + 1.3), hh(sci + 4.9)) - 0.5) * 0.5;
    float bush = smoothstep(0.12 + 0.18 * hh(sci + 2.6), 0.05, length(scf) + 0.15 * (vn(p.xz * 3.0) - 0.5)) * step(0.35, hh(sci + 8.2));
    sand = mix(sand, 0.035, bush * smoothstep(5.5, 6.5, ax) * det);
    vec3 albC = mix(vec3(sand) * mix(vec3(1.0), C1 * C1, 0.35), vec3(alb) * mix(vec3(1.0), C2 * C2, 0.25), road);
    albC = mix(albC, mix(C3 * C3, vec3(1.0), 0.15) * 0.7, paint * road);

    vec2 bn = vec2(vn(p.xz * 7.0), vn(p.xz * 7.0 + 13.0)) - 0.5;
    vec3 n = normalize(vec3(bn.x * 0.25 * det, 1.0, bn.y * 0.25 * det));
    vec3 amb = C1 * C1 * 0.02 + C2 * C2 * 0.012;
    // open sand catches the sky glow; creosote clumps stay dark with lit crowns
    float ripple = 0.75 + 0.25 * sin(p.x * 2.1 + p.z * 0.7 + 2.0 * fbm(p.xz * 0.2)) * det;
    amb += (C1 * C1 * C1 * 0.06 + C2 * C2 * C2 * 0.03) * (1.0 - road) * ripple * (1.0 - bush * 0.8);
    amb += C2 * C2 * 0.05 * bush * smoothstep(0.08, 0.2, length(scf)) * (1.0 - road) * det;
    amb += (C0 * C0 * 0.08 + C1 * C1 * 0.05) * exp(-sq(p.x / max(t * 0.6, 1.0))) * smoothstep(40.0, 600.0, t);
    col = albC * (amb + groundLight(p, n, rd, sheen + paint * 0.5));

    // polished asphalt picks up the glow of the sky at a grazing angle
    vec3 rdm = vec3(rd.x, -rd.y, rd.z);
    float fres = 0.04 + 0.96 * exp(-(-rd.y) * 14.0);
    col += backdrop(rdm) * fres * (sheen * 0.5 + paint * 0.2) * smoothstep(3.0, 20.0, t);

    // mirage pool: the hot far road mirrors the sky, ridges and lights
    float pool = smoothstep(0.35, 0.65, fbm(vec2(p.x * 0.05, p.z * 0.004 + 3.0)));
    float mw = mirK * smoothstep(70.0, 260.0, t) * (0.55 + 0.45 * pool) * mix(0.35, 1.0, road);
    col = mix(col, backdrop(rdm) * 0.85, clamp(mw * 0.8, 0.0, 1.0));

    // distance haze into the glow on the horizon
    vec3 hz = backdrop(normalize(vec3(rd.x, 0.0005, rd.z)));
    col = mix(col, hz, (1.0 - exp(-t * 0.0045)) * 0.85);
  } else {
    col = backdrop(rd);
  }

  // lamp posts on the left, far to near
  float lk = clamp(u_lamps, 0.0, 2.5);
  for (int i = 11; i >= 0; i--) {
    float k = float(i);
    vec3 lm = lampK(k);
    vec3 B = vec3(-4.7, 0.0, lm.x);
    vec3 T = vec3(-4.7, 6.95, lm.x);
    vec3 H = lampHead(lm.x);
    vec3 pb = proj(B), pt = proj(T), ph = proj(H);
    if (pb.z < 1.0 || pb.z > depth + 1.0) continue;
    float w = 0.09 * FOC / pb.z;
    float cv = seg(uv, pb.xy, pt.xy, w, w * 0.65, px);
    cv = max(cv, seg(uv, pt.xy, ph.xy, w * 0.5, w * 0.45, px));
    float hy = clamp((uv.y - pb.y) / max(pt.y - pb.y, 1e-4), 0.0, 1.0);
    vec3 pc = C2 * C2 * C2 * 0.01 + lampCol(lm.z) * lm.y * lk * 0.025 * hy * hy;
    pc += C1 * C1 * 0.02 * smoothstep(0.4, 0.0, hy) * lm.y * lk;
    col = mix(col, pc, cv * smoothstep(900.0, 300.0, pb.z));
  }

  // timber telephone poles on the right with sagging wires
  for (int i = 8; i >= 0; i--) {
    float k = float(i);
    float a = hh(vec2(k, 31.0));
    float z0 = 9.0 + 36.0 * k + 6.0 * (a - 0.5);
    float z1 = 9.0 + 36.0 * (k + 1.0) + 6.0 * (hh(vec2(k + 1.0, 31.0)) - 0.5);
    float lean = 0.25 * (a - 0.5);
    float ht = 8.2 + 1.2 * a;
    vec3 B = vec3(6.6, -0.2, z0);
    vec3 T = vec3(6.6 + lean, ht, z0);
    vec3 pb = proj(B), pt = proj(T);
    if (pb.z < 1.0) continue;
    float w = 0.13 * FOC / pb.z;
    float cv = seg(uv, pb.xy, pt.xy, w, w * 0.7, px);
    vec3 ca = proj(T + vec3(-1.25, -0.45, 0.0)), cb = proj(T + vec3(1.25, -0.45, 0.0));
    cv = max(cv, seg(uv, ca.xy, cb.xy, w * 0.6, w * 0.6, px));
    float grain = 0.7 + 0.3 * vn(vec2(uv.x * 900.0, uv.y * 40.0));
    vec3 pc = (C2 * C2 * 0.01 + C1 * C1 * 0.012) * grain;
    col = mix(col, pc, cv);
    // three wires to the next pole
    for (int j = 0; j < 3; j++) {
      float ox = -1.1 + 1.1 * float(j);
      vec3 qa = proj(vec3(6.6 + lean + ox, ht - 0.3, z0));
      float lean1 = 0.25 * (hh(vec2(k + 1.0, 31.0)) - 0.5);
      float ht1 = 8.2 + 1.2 * hh(vec2(k + 1.0, 31.0));
      vec3 qb = proj(vec3(6.6 + lean1 + ox, ht1 - 0.3, z1));
      float s = (uv.x - qa.x) / (qb.x - qa.x);
      if (s > 0.0 && s < 1.0) {
        float zm = mix(qa.z, qb.z, s);
        float yy = mix(qa.y, qb.y, s) - 4.0 * s * (1.0 - s) * 1.1 * FOC / zm;
        float slope = (qb.y - qa.y) / (qb.x - qa.x);
        float d = abs(uv.y - yy) / sqrt(1.0 + slope * slope);
        float ww = max(0.02 * FOC / zm, px * 0.4 * pr);
        float wc = clamp((ww - d) / px + 0.5, 0.0, 1.0) * min(0.02 * FOC / zm / (px * 0.4), 1.0) * 0.8;
        col = mix(col, C2 * C2 * 0.01, wc);
        col += C1 * C1 * 0.05 * wc * exp(-sq((uv.x - vp.x) * 3.0));
      }
    }
  }

  // lights: lamp heads with their scattered cones, mirrored in the mirage
  vec3 rdS = normalize(FW * FOC + RT * uv.x + UP * uv.y);
  float minPx = 1.3 * pr * px;
  for (int i = 0; i < 12; i++) {
    float k = float(i);
    vec3 lm = lampK(k);
    vec3 H = lampHead(lm.x) - vec3(0.0, 0.15, 0.0);
    vec3 lc = lampCol(lm.z) * lm.y * lk;
    vec3 g = glow(uv, H, 0.22, minPx, 1.6);
    if (g.z < depth + 5.0) col += lc * (g.x * 2.2 + g.y);
    vec3 rel = H - RO;
    float b = dot(rel, rdS);
    float hd = max(length(rel - rdS * b), 0.05);
    float tend = min(depth, 4000.0);
    float sc = (atan((tend - b) / hd) + atan(b / hd)) / hd;
    float cone = smoothstep(0.2, -2.0, RO.y + rdS.y * b - H.y);
    col += lc * C0 * sc * cone * 0.035;
    vec3 gm = glow(uv, vec3(H.x, -H.y, H.z), 0.3, minPx, 0.7);
    float mwz = mirK * smoothstep(70.0, 260.0, gm.z);
    col += lc * (gm.x * 1.3 + gm.y * 0.6) * mwz;
  }

  // cars: oncoming headlights and receding tail lights
  for (int i = 0; i < 5; i++) {
    vec3 c = carK(float(i));
    bool oncoming = i < 3;
    vec3 lcol = oncoming ? mix(C2, vec3(1.0), 0.55) * 1.6 : C1 * C1 * C1 * 1.8;
    float hy = oncoming ? 0.7 : 0.9;
    float sep = oncoming ? 0.75 : 0.7;
    float tw = 0.75 + 0.25 * vn(vec2(TT * 6.0, float(i) * 3.0)) * smoothstep(80.0, 250.0, c.y);
    for (int j = 0; j < 2; j++) {
      vec3 P = vec3(c.x + (float(j) * 2.0 - 1.0) * sep, hy, c.y);
      vec3 g = glow(uv, P, oncoming ? 0.2 : 0.12, minPx, 1.0);
      col += lcol * (g.x * 2.0 + g.y * (oncoming ? 1.4 : 0.8)) * c.z * tw;
      vec3 gm = glow(uv, vec3(P.x, -P.y, P.z), 0.25, minPx, 0.6);
      col += lcol * (gm.x + gm.y * 0.5) * c.z * mirK * smoothstep(70.0, 260.0, gm.z) * 0.8;
    }
  }

  // roadside reflector posts both sides, lime and aqua
  for (int i = 0; i < 10; i++) {
    float z = 22.0 + 42.0 * float(i);
    vec3 gl = glow(uv, vec3(-4.2, 1.0, z), 0.06, minPx * 0.8, 1.0);
    vec3 gr = glow(uv, vec3(4.2, 1.0, z + 21.0), 0.06, minPx * 0.8, 1.0);
    col += C3 * (gl.x + gl.y * 0.4) * 0.35 + C2 * (gr.x + gr.y * 0.4) * 0.3;
  }

  // lit heat veils rising off the far road
  float veil = smoothstep(0.55, 0.85, fbm(vec2((uv.x - vp.x) * 16.0, uv.y * 5.0 - TT * 0.35)));
  float vb = exp(-abs(uv.y - vp.y - 0.01) * 40.0) * exp(-sq((uv.x - vp.x) * 2.5));
  col += (C0 * C0 * 0.10 + C1 * C1 * 0.06) * veil * vb * (0.3 + 0.7 * shK);

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
