// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Interchange - seen from the shoulder of a wet road at night, a stacked
// motorway interchange rises into ember sodium fog. A high deck crosses the
// road on hammerhead and twin-column piers, a curving ramp on flared octagonal
// columns sweeps up overhead to the right, and a far viaduct floats in the fog
// with traffic sliding along it. Lamps on every level throw broad fog halos,
// cars recede with rose tail lights, and the puddled road stretches every light
// into long broken reflections while the fog banks drift.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fog;      // density of the sodium fog                       (default 1.0)
uniform float u_lamps;    // brightness of the lamps, halos and pools        (default 1.0)
uniform float u_wet;      // wetness of the road and length of the streaks   (default 1.0)
uniform float u_traffic;  // how many cars run on the road and far viaduct   (default 0.7)

const vec2 DA = vec2(0.912, 0.410);   // high deck axis in plan
const vec2 NA = vec2(-0.410, 0.912);  // across the high deck
const vec2 CA = vec2(0.0, 27.0);      // where the high deck crosses the road
const vec2 RC = vec2(18.0, 8.0);      // centre of the ramp curve
const float RR = 12.5;                // ramp radius
const float ZC = 82.0;                // far viaduct
const int NL = 46;                    // light count

vec3 C0, C1, C2, C3;
float gT, gFog, gLamp, gWet, gTraf, gSig, gId;
vec3 gSpec;

float hs(vec2 p) {
  p = fract(p * vec2(0.3183, 0.6491) + vec2(0.217, 0.443));
  p += dot(p, p.yx + 41.37);
  return fract((p.x + p.y) * p.x * 23.71);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) {
    s += a * vn(p);
    p = mat2(0.82, 0.57, -0.57, 0.82) * p * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return s / 0.9375;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float rampY(float th) { return 4.6 + 1.9 * th; }
float carZ(float k) { return mod(gT * 4.5 + k * 47.0 + 14.0, 150.0) - 12.0; }
float carX(float k) { return mod(k, 2.0) < 0.5 ? 1.6 : -0.7; }
float carOn(float k) { return step((k + 0.5) / 3.0, gTraf); }

float mapS(vec3 p) {
  float d = 1e5, id = 0.0, e;
  // high deck: slab, parapets, four plate girders, lamp standards
  vec2 q = p.xz - CA;
  float u = dot(q, DA), v = dot(q, NA), av = abs(v);
  e = max(av - 6.0, abs(p.y - 8.0) - 0.4);
  e = min(e, max(abs(av - 5.85) - 0.15, abs(p.y - 8.7) - 0.3));
  float gv = abs(mod(v, 3.0) - 1.5);
  float rib = min(max(gv - 0.16, abs(p.y - 7.0) - 0.6), max(gv - 0.42, abs(p.y - 6.49) - 0.08));
  e = min(e, max(rib, av - 5.0));
  float lu2 = u - floor(u / 15.0 + 0.5) * 15.0;
  e = min(e, max(length(vec2(lu2, v + 5.55)) - 0.09, abs(p.y - 9.55) - 1.15));
  e = min(e, sdBox(vec3(lu2, p.y - 10.62, v + 5.95), vec3(0.05, 0.05, 0.42)));
  e = min(e, sdBox(vec3(lu2, p.y - 10.55, v + 6.35), vec3(0.13, 0.07, 0.26)));
  if (e < d) { d = e; id = 1.0; }

  // its piers: hammerheads or twin columns under a beam, each a little different
  float k = floor(u / 15.0);
  float lu = u - (k + 0.5) * 15.0;
  float h = hs(vec2(k, 3.7));
  float sc = 0.85 + 0.3 * hs(vec2(k, 9.1));
  if (h < 0.55) {
    e = sdBox(vec3(lu, p.y - 2.45, v), vec3(0.62 * sc, 2.45, 0.85 * sc) - 0.12) - 0.12;
    float cap = sdBox(vec3(lu, p.y - 5.45, v), vec3(0.72, 0.65, 5.3) - 0.06) - 0.06;
    cap = max(cap, (av - 0.85 * sc) * 0.349 - (p.y - 4.8) * 0.937);
    e = min(e, cap);
  } else {
    e = sdBox(vec3(lu, p.y - 2.85, av - 3.1), vec3(0.55 * sc, 2.85, 0.55 * sc) - 0.1) - 0.1;
    float cap = sdBox(vec3(lu, p.y - 5.6, v), vec3(0.7, 0.5, 5.3) - 0.05) - 0.05;
    cap = max(cap, (av - 4.1) * 0.707 - (p.y - 5.1) * 0.707);
    e = min(e, cap);
  }
  e = min(e, max(sdBox(vec3(lu, p.y - 6.25, mod(v, 3.0) - 1.5), vec3(0.32, 0.15, 0.32)), av - 5.0));
  if (e < d) { d = e; id = 2.0; }

  // the ramp: curved slab on a box spine, parapets, lamp standards
  vec2 rq = p.xz - RC;
  float rr = length(rq);
  float th = atan(rq.y, -rq.x);
  float yb = rampY(th);
  float dr = rr - RR;
  e = max(abs(dr) - 4.0, abs(p.y - yb - 0.45) - 0.45);
  e = min(e, max(abs(abs(dr) - 3.85) - 0.15, abs(p.y - yb - 1.2) - 0.35));
  e = min(e, max(abs(p.y - yb + 0.6) - 0.6, abs(dr) - 1.7 - clamp(p.y - yb + 1.2, 0.0, 1.2) * 0.8));
  float thl = (floor(th / 0.75) + 0.5) * 0.75;
  float tl = (th - thl) * rr;
  e = min(e, max(length(vec2(tl, dr - 3.55)) - 0.08, abs(p.y - yb - 2.05) - 1.15));
  e = min(e, sdBox(vec3(tl, p.y - yb - 3.12, dr - 3.95), vec3(0.12, 0.07, 0.42)));
  e = max(e * 0.85, (abs(th - 0.65) - 1.55) * rr);
  if (e < d) { d = e; id = 3.0; }

  // ramp columns: octagonal shafts that flare into a mushroom head
  float kr = clamp(floor(th / 0.75 + 0.5), 0.0, 2.0);
  float tk = (th - kr * 0.75) * rr;
  float top = rampY(kr * 0.75) - 1.2;
  float rad = 0.62 + 0.18 * hs(vec2(kr, 2.1)) + 0.55 * smoothstep(top - 1.6, top, p.y);
  float oc = max(max(abs(tk), abs(dr)), (abs(tk) + abs(dr)) * 0.7071) - rad;
  e = max(oc, abs(p.y - top * 0.5) - top * 0.5) * 0.8;
  if (e < d) { d = e; id = 4.0; }

  // far viaduct crossing the distance on tall twin columns
  float zc = p.z - ZC;
  e = max(abs(zc) - 7.0, abs(p.y - 9.0) - 0.8);
  e = min(e, max(abs(abs(zc) - 6.8) - 0.2, abs(p.y - 10.1) - 0.35));
  float lx = mod(p.x + 20.0, 22.0) - 11.0;
  e = min(e, sdBox(vec3(lx, p.y - 3.6, abs(zc) - 3.8), vec3(0.85, 3.6, 0.85)));
  e = min(e, sdBox(vec3(lx, p.y - 7.6, zc), vec3(0.95, 0.6, 6.2)));
  if (e < d) { d = e; id = 5.0; }

  // jersey barrier on the right edge
  float by = clamp(p.y / 0.85, 0.0, 1.0);
  e = max(abs(p.x - 4.2) - (0.32 - 0.2 * by), abs(p.y - 0.42) - 0.42) * 0.9;
  if (e < d) { d = e; id = 6.0; }

  // steel guardrail and the road lamp standards on the left verge
  e = max(abs(p.x + 6.2) - 0.06, abs(p.y - 0.7) - 0.16);
  e = min(e, sdBox(vec3(p.x + 6.3, p.y - 0.42, mod(p.z, 2.5) - 1.25), vec3(0.07, 0.42, 0.07)));
  float lz = mod(p.z + 8.0, 16.0) - 8.0 + step(p.z, 10.0) * 100.0;
  e = min(e, max(length(vec2(p.x + 7.0, lz)) - 0.13, abs(p.y - 3.6) - 3.6));
  e = min(e, sdBox(vec3(p.x + 6.15, p.y - 7.18, lz), vec3(0.85, 0.05, 0.05)));
  e = min(e, sdBox(vec3(p.x + 5.3, p.y - 7.08, lz), vec3(0.36, 0.08, 0.17)));
  float rz2 = (mod(p.z - 44.0 + 8.5, 17.0) - 8.5) + step(p.z, 35.0) * 100.0;
  e = min(e, max(length(vec2(p.x - 4.9, rz2)) - 0.12, abs(p.y - 3.6) - 3.6));
  e = min(e, sdBox(vec3(p.x - 4.45, p.y - 7.18, rz2), vec3(0.5, 0.05, 0.05)));
  e = min(e, sdBox(vec3(p.x - 4.0, p.y - 7.08, rz2), vec3(0.34, 0.08, 0.16)));
  if (e < d) { d = e; id = 7.0; }

  // cars pulling away up the road
  for (int i = 0; i < 3; i++) {
    float ck = float(i);
    vec3 cq = p - vec3(carX(ck), 0.0, carZ(ck));
    cq.y += 6.0 * (1.0 - carOn(ck));
    e = sdBox(cq - vec3(0.0, 0.7, 0.0), vec3(0.86, 0.3, 2.15) - 0.15) - 0.15;
    e = min(e, sdBox(cq - vec3(0.0, 1.2, -0.25), vec3(0.7 - 0.12 * clamp(cq.y - 1.0, 0.0, 1.0), 0.24, 1.1) - 0.12) - 0.12);
    e = min(e, max(length(vec2(cq.y - 0.33, abs(cq.z) - 1.35)) - 0.33, abs(abs(cq.x) - 0.74) - 0.11));
    if (e < d) { d = e; id = 8.0; }
  }
  gId = id;
  return d;
}

void lamp(int i, out vec3 L, out vec3 c, out float I) {
  float f = float(i);
  if (i < 7) {
    L = vec3(-5.3, 6.95, 16.0 + 16.0 * f);
    c = mix(C0, C2, 0.3);
    I = mix(0.55, 1.0, step(0.2, hs(vec2(f, 1.3))));
  } else if (i < 14) {
    vec2 xz = CA + DA * ((f - 10.0) * 15.0) - NA * 6.35;
    L = vec3(xz.x, 10.45, xz.y);
    c = mix(C2, C0, 0.2);
    I = 0.9 * (0.85 + 0.15 * sin(gT * 0.4 + f * 1.7));
  } else if (i < 18) {
    float th = -0.375 + 0.75 * (f - 14.0);
    float r = RR + 4.15;
    L = vec3(RC.x - r * cos(th), rampY(th) + 3.0, RC.y + r * sin(th));
    c = mix(C0, C1, 0.45);
    I = 0.8;
  } else if (i < 24) {
    L = vec3(-31.0 + 11.0 * (f - 18.0), 11.6, ZC - 7.3);
    c = mix(C0, C2, 0.5);
    I = 2.2;
  } else if (i < 28) {
    float k = f - 24.0;
    float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float x = mod(gT * 7.0 * dir + k * 37.0, 130.0) - 65.0;
    L = vec3(x, 10.7, ZC + 2.5 * dir);
    c = dir > 0.0 ? C1 : C2;
    I = 0.5 * step((k + 0.5) / 4.0, gTraf) * smoothstep(65.0, 50.0, abs(x));
  } else if (i >= 34) {
    if (i < 41) {
      vec2 xz = CA + DA * ((f - 37.0) * 15.0) - NA * 3.0;
      L = vec3(xz.x, 6.25, xz.y);
      c = mix(C0, C1, 0.15);
      I = 0.55 * mix(0.35, 1.0, step(0.25, hs(vec2(f, 4.4))));
    } else {
      L = vec3(4.0, 7.0, 44.0 + 17.0 * (f - 41.0));
      c = mix(C0, C2, 0.45);
      I = 1.0;
    }
  } else {
    float g = f - 28.0;
    float k = floor(g * 0.5);
    float sd = mod(g, 2.0) * 2.0 - 1.0;
    L = vec3(carX(k) + sd * 0.68, 0.78, carZ(k) - 2.22);
    c = mix(C1, C3, 0.25);
    I = 0.32 * carOn(k);
  }
}

// the decks shade what lies under them from lamps above
float occl(vec3 p, vec3 L) {
  float s = 1.0;
  if ((p.y - 7.9) * (L.y - 7.9) < 0.0) {
    vec2 X = mix(p.xz, L.xz, (7.9 - p.y) / (L.y - p.y));
    s *= smoothstep(5.4, 6.4, abs(dot(X - CA, NA)));
  }
  vec2 m = mix(p.xz, L.xz, 0.5) - RC;
  float y1 = rampY(atan(m.y, -m.x)) + 0.45;
  if ((p.y - y1) * (L.y - y1) < 0.0) {
    vec2 rq = mix(p.xz, L.xz, (y1 - p.y) / (L.y - p.y)) - RC;
    float th = atan(rq.y, -rq.x);
    float dr = length(rq) - RR;
    s *= 1.0 - (1.0 - smoothstep(3.6, 4.4, abs(dr))) * step(abs(th - 0.65), 1.55);
  }
  return s;
}

vec3 lightAt(vec3 p, vec3 n, vec3 rd, float shin) {
  vec3 acc = vec3(0.0);
  gSpec = vec3(0.0);
  vec3 rf = reflect(rd, n);
  for (int i = 0; i < NL; i++) {
    vec3 L, c; float I;
    lamp(i, L, c, I);
    vec3 d = L - p;
    float r2 = dot(d, d);
    vec3 l = d * inversesqrt(r2);
    float lam = max(dot(n, l), 0.0);
    float fall = I * occl(p, L) * exp(-sqrt(r2) * gSig * 0.5) / (r2 * 0.06 + 1.0);
    acc += c * fall * (0.1 + 0.9 * lam);
    gSpec += c * fall * pow(max(dot(rf, l), 0.0), shin);
  }
  gSpec *= gLamp;
  return acc * gLamp;
}

vec3 fogCol(vec3 rd) {
  float hz = exp(-abs(rd.y - 0.03) * 6.0);
  float az = rd.x / max(rd.z, 0.2);
  vec3 c = C3 * C3 * 0.04 + C3 * 0.01;
  c += mix(C3 * 0.05 + C1 * 0.03, C0 * 0.07, hz * hz) * hz;
  c += mix(C0, C2, 0.3) * 0.05 * hz * hz * exp(-abs(az - 0.25) * 2.0);
  return c * (0.55 + 0.45 * gFog);
}

float march(vec3 ro, vec3 rd, float tmax) {
  float t = 0.05;
  for (int i = 0; i < 64; i++) {
    float d = mapS(ro + rd * t);
    if (d < 0.0015 * t || t > tmax) break;
    t += d;
  }
  return t;
}

float marchR(vec3 ro, vec3 rd, float tmax) {
  float t = 0.05;
  for (int i = 0; i < 40; i++) {
    float d = mapS(ro + rd * t);
    if (d < 0.004 * t || t > tmax) break;
    t += d;
  }
  return t;
}

vec3 nrm(vec3 p, float t) {
  float e = 0.0015 * t + 0.002;
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * mapS(p + k.xyy * e) + k.yyx * mapS(p + k.yyx * e)
                 + k.yxy * mapS(p + k.yxy * e) + k.xxx * mapS(p + k.xxx * e));
}

// weathered concrete, painted steel and dark car paint under the lamps
vec3 shadeStruct(vec3 p, vec3 rd, float t) {
  vec3 n = nrm(p, t);
  float id = gId;
  mapS(p);
  id = gId;
  float ao = clamp(0.35 + 0.65 * mapS(p + n * 0.7) / 0.7, 0.0, 1.0);
  vec3 col;
  if (id < 6.5) {
    vec3 Lt = lightAt(p, n, rd, 12.0);
    vec2 tc = abs(n.y) > 0.6 ? p.xz : (abs(n.x) > abs(n.z) ? p.zy : p.xy);
    float side = step(abs(n.y), 0.6);
    float hor = abs(n.x) > abs(n.z) ? p.z : p.x;
    float a = 0.36 + 0.3 * fbm(tc * vec2(1.1, 0.7) + id * 4.0);
    a *= 1.0 - 0.22 * side * smoothstep(0.44, 0.5, abs(fract(p.y / 1.3) - 0.5));
    a *= 1.0 - 0.08 * side * smoothstep(0.4, 0.5, abs(fract(hor / 0.22) - 0.5));
    float st = vn(vec2(hor * 5.0, p.y * 0.35 + id * 3.0));
    float stain = smoothstep(0.5, 0.85, st) * (0.4 + 0.6 * vn(vec2(hor * 17.0, p.y * 0.8))) * side;
    float spall = smoothstep(0.7, 0.76, fbm(tc * 2.3 + 11.0));
    float damp = (1.0 - smoothstep(0.2, 1.2 + 0.9 * vn(vec2(hor * 2.0, id)), p.y)) * side;
    float und = step(n.y, -0.6);
    vec2 pj = abs(fract(p.xz / 2.4) - 0.5);
    a *= 1.0 - 0.25 * und * smoothstep(0.45, 0.5, max(pj.x, pj.y));
    a *= 1.0 - 0.3 * und * smoothstep(0.55, 0.8, vn(p.xz * vec2(0.6, 3.0)));
    a *= (1.0 - 0.5 * stain) * (1.0 - 0.3 * spall) * (1.0 - 0.45 * damp);
    vec3 tint = mix(vec3(1.0), C3 * 1.4, 0.45 * stain);
    col = Lt * a * tint * ao;
    col += (C3 * 0.03 + C0 * 0.025 * max(-n.y, 0.0)) * a * ao;
    col += gSpec * (0.05 + 0.4 * damp);
  } else if (id < 7.5) {
    vec3 Lt = lightAt(p, n, rd, 30.0);
    col = Lt * 0.14 * ao + gSpec * 0.5 + C3 * 0.01;
  } else {
    vec3 Lt = lightAt(p, n, rd, 50.0);
    col = Lt * 0.05 * ao + gSpec * 0.7;
    vec3 cq = p;
    for (int i = 0; i < 3; i++) {
      float ck = float(i);
      vec3 q = p - vec3(carX(ck), 0.0, carZ(ck));
      if (abs(q.z) < 2.6) cq = q;
    }
    float tail = smoothstep(-2.0, -2.25, cq.z) * smoothstep(0.12, 0.05, abs(cq.y - 0.78))
               * smoothstep(0.28, 0.2, abs(abs(cq.x) - 0.62));
    col += mix(C1, C3, 0.2) * tail * 2.5;
  }
  return col;
}

void main() {
  C0 = u_palette[0]; C1 = u_palette[1]; C2 = u_palette[2]; C3 = u_palette[3];
  if (dot(C0,C0)+dot(C1,C1)+dot(C2,C2)+dot(C3,C3) < 1e-5) {
    C0 = vec3(0.231,0.510,0.965); C1 = vec3(0.659,0.333,0.969);
    C2 = vec3(0.133,0.827,0.933); C3 = vec3(0.957,0.247,0.369);
  }
  float ry = max(u_resolution.y, 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / ry;
  gT = u_time;
  gFog = clamp(u_fog, 0.0, 3.0);
  gLamp = max(u_lamps, 0.0);
  gWet = clamp(u_wet, 0.0, 2.0);
  gTraf = clamp(u_traffic, 0.0, 1.0);

  vec3 ro = vec3(-4.6 + 0.35 * sin(gT * 0.05), 1.55, -2.0 + 2.2 * sin(gT * 0.043));
  vec3 fw = normalize(vec3(1.5, 6.3, 30.0) - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.25 * fw);

  // fog banks drift across the view
  float bank = fbm(vec2(atan(rd.x, rd.z) * 5.0 - gT * 0.035, rd.y * 9.0 + gT * 0.012));
  gSig = 0.021 * gFog * (0.7 + 0.6 * bank);

  float tg = rd.y < 0.0 ? -ro.y / rd.y : 1e5;
  float tmax = min(tg, 170.0);
  float t = march(ro, rd, tmax);
  bool hitS = t < tmax;
  float tHit = hitS ? t : tg;
  bool ground = !hitS && rd.y < 0.0 && tg < 1e4;

  vec3 col = fogCol(rd);
  vec3 pg = vec3(0.0), rd2 = vec3(0.0, 0.5, 0.866);
  float tR = 1e5, wet = 0.0, fres = 0.0;
  if (hitS) {
    vec3 p = ro + rd * t;
    col = mix(col, shadeStruct(p, rd, t), exp(-gSig * t));
  } else if (ground) {
    pg = ro + rd * tg;
    float aw = tg * 1.6 / ry;
    float puddle = smoothstep(0.45, 0.62, fbm(pg.xz * vec2(0.35, 0.15) + 3.0));
    float onRoad = smoothstep(-5.95, -5.6, pg.x) * smoothstep(3.95, 3.7, pg.x);
    wet = clamp((0.25 + 0.75 * puddle) * gWet * (0.4 + 0.6 * onRoad), 0.0, 1.0);
    float alb = 0.10 + 0.08 * fbm(pg.xz * vec2(0.5, 0.2)) + 0.05 * (vn(pg.xz * 6.0) - 0.5);
    float lines = smoothstep(0.07 + aw, 0.07 - aw, abs(pg.x + 5.35))
                + smoothstep(0.07 + aw, 0.07 - aw, abs(pg.x - 3.45))
                + smoothstep(0.07 + aw, 0.07 - aw, abs(pg.x + 1.0)) * step(fract(pg.z / 9.0), 0.36);
    alb = mix(alb, 0.5, clamp(lines, 0.0, 1.0) * (0.55 + 0.45 * vn(pg.xz * vec2(8.0, 2.0))));
    alb = mix(0.06 + 0.1 * vn(pg.xz * 4.0), alb, onRoad);
    // raindrop rings in the puddles
    vec2 cell = floor(pg.xz * 1.4);
    vec2 cf = fract(pg.xz * 1.4) - 0.5;
    float ph = fract(gT * 0.7 + hs(cell + 3.1));
    float ring = sin(length(cf - (vec2(hs(cell), hs(cell + 1.7)) - 0.5) * 0.5) * 40.0 - ph * 25.0)
               * (1.0 - ph) * puddle * smoothstep(0.5, 0.25, length(cf));
    float rough = mix(0.13, 0.025, puddle);
    vec3 ng = normalize(vec3((vn(pg.xz * vec2(26.0, 11.0)) - 0.5) * rough + ring * 0.025, 1.0,
                             (vn(pg.xz * vec2(24.0, 9.0) + 7.0) - 0.5) * rough * 1.5));
    vec3 Lt = lightAt(pg, ng, rd, mix(8.0, 40.0, wet));
    vec3 g = Lt * alb * (1.0 - 0.6 * wet) + gSpec * (0.1 + 0.6 * wet);
    g += C3 * 0.012;
    rd2 = reflect(rd, ng);
    fres = 0.25 + 0.75 * pow(1.0 - max(dot(ng, -rd), 0.0), 5.0);
    tR = marchR(pg + vec3(0.0, 0.02, 0.0), rd2, 120.0);
    vec3 refl = fogCol(rd2);
    if (tR < 120.0) {
      vec3 pr = pg + rd2 * tR;
      refl = mix(refl, shadeStruct(pr, rd2, tR + tg), exp(-gSig * tR));
    }
    g += refl * fres * wet * 0.9;
    col = mix(col, g, exp(-gSig * tg));
  }

  // fog halos round every light, and their long broken streaks on the wet road
  vec3 side = normalize(cross(rd2, vec3(0.0, 1.0, 0.0)));
  vec3 oth = cross(side, rd2);
  float str = 1.0 + 14.0 * clamp(gWet, 0.0, 1.5);
  float brk = 0.45 + 0.9 * vn(vec2(uv.x * 30.0, uv.y * 140.0 + gT * 0.8));
  vec3 glow = vec3(0.0), rglow = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec3 L, c; float I;
    lamp(i, L, c, I);
    I *= gLamp;
    vec3 d = L - ro;
    float b = dot(d, rd);
    float h = sqrt(max(dot(d, d) - b * b, 1e-5));
    float ins = (atan((tHit - b) / h) + atan(b / h)) / h;
    float ext = exp(-gSig * clamp(b, 0.0, tHit));
    vec3 far = mix(C3, C1, 0.35 + 0.3 * exp(-b * 0.03));
    glow += far * I * gSig * 0.9 * ins * ext;
    if (b > 0.0 && b < tHit + 2.0) {
      float hh = h * (0.6 + 0.4 * clamp(1.6 / gFog, 0.5, 2.0));
      glow += c * I * ext * (exp(-hh * 1.0) * 0.3 + exp(-hh * 3.5) * 0.4) * (0.4 + 0.6 * gFog);
    }
    if (b > 0.0 && b < tHit) {
      float a = h / b;
      glow += c * I * exp(-gSig * b) * (1.0 / (1.0 + a * a / 1.6e-5) * 1.5 + exp(-a * 40.0) * 0.15);
    }
    if (ground) {
      vec3 d2 = L - pg;
      float b2 = dot(d2, rd2);
      if (b2 > 0.0 && b2 < tR) {
        vec3 X = d2 - rd2 * b2;
        float hx = dot(X, side), hy = dot(X, oth) / str;
        float a = sqrt(hx * hx + hy * hy) / (tg + b2);
        rglow += c * I * exp(-gSig * (tg + b2))
               * (1.0 / (1.0 + a * a / 4e-5) * 0.8 + exp(-a * 30.0) * 0.12);
      }
    }
  }
  col += glow + rglow * brk * (0.4 + fres) * wet * 2.2;

  col = 1.0 - exp(-col * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
