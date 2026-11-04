// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Looking down the long bay of a night foundry shed. A banded brick cupola
// at the far end taps a falling stream of molten metal into a runner cut in
// the sand floor, and the metal winds toward the viewer, branching off into
// iron-banded moulding flasks that glow and crust over in turn and into a
// pig bed of short ingot channels. Heat light climbs the sooty brick piers
// and the fibrous timber trusses, a crane hook hangs over the bay, cold
// moonlight lays window squares on the sand, smoke hangs lit from below,
// and sparks drift up out of the pour.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_heat;    // heat of the pour, brightness of metal and glow (default 1.0)
uniform float u_flow;    // speed of the metal running down the channels (default 0.5)
uniform float u_sparks;  // density of sparks rising from the pour (default 1.0)
uniform float u_smoke;   // smoke hanging in the shed, lit by the heat (default 0.7)

const float W  = 4.2;    // half width of the shed
const float B  = 4.0;    // length of one bay
const float HW = 6.4;    // eaves height
const float ZE = 25.6;   // far end wall
const vec2  FC = vec2(-1.35, 23.5); // cupola centre in x and z
const float ZH = 21.6;   // where the stream lands, head of the runner

float h21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1379, 0.2087, 0.1733));
  q += dot(q, q.yzx + 27.13);
  return fract((q.x + q.y) * q.z);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y) * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return s * 1.07;
}

// centre line of the main runner, winding from the cupola toward the viewer
float runX(float z) {
  float base = mix(0.85, FC.x, smoothstep(3.0, ZH, z));
  return base + 0.55 * sin(z * 0.43 + 0.6) * smoothstep(ZH + 0.5, ZH - 5.0, z);
}

// flask of bay k: centre, half size, and how hot its pool is
void flask(float k, out vec3 c, out vec3 hs, out float side) {
  side = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
  float a = h21(vec2(k, 3.7)), b = h21(vec2(k, 8.1)), d = h21(vec2(k, 1.3));
  hs = vec3(0.5 + 0.3 * a, 0.26 + 0.16 * b, 0.55 + 0.45 * d);
  c = vec3(side * (2.75 + 0.25 * b), hs.y, (k + 0.5) * B + (a - 0.5) * 0.6);
}

float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// distance to the nearest molten channel in the floor, and its width
vec2 channel(vec2 xz) {
  float dm = xz.y < ZH ? abs(xz.x - runX(xz.y)) - 0.2 : 9.0;
  dm = min(dm, length(xz - vec2(FC.x, ZH)) - 0.42);
  float k = floor(xz.y / B);
  if (k >= 0.0 && k <= 4.0) {
    vec3 c, hs; float side;
    flask(k, c, hs, side);
    float db = segD(xz, vec2(runX(c.z), c.z), vec2(c.x - side * hs.x, c.z)) - 0.13;
    dm = min(dm, db);
  }
  float heat = 1.0;
  // pig bed on the left: a sow channel fed from the runner, short pigs off it
  float sow = segD(xz, vec2(-2.35, 1.4), vec2(-2.35, 4.55)) - 0.1;
  sow = min(sow, segD(xz, vec2(-2.35, 4.55), vec2(runX(4.55), 4.55)) - 0.1);
  float pz = floor(xz.y / 0.55);
  float pl = 0.55 + 0.4 * h21(vec2(pz, 4.4));
  float pg = segD(vec2(xz.x, mod(xz.y, 0.55) - 0.275), vec2(-2.3, 0.0), vec2(-2.35 + pl, 0.0)) - 0.07;
  pg = pz >= 3.0 && pz <= 7.0 ? pg : 9.0;
  float bed = min(sow, pg);
  if (bed < dm) { dm = bed; heat = pg < sow ? 0.7 + 0.35 * h21(vec2(pz, 9.2)) : 0.9; }
  return vec2(dm, heat);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float arch(vec2 p, float w, float hs, float r) {
  if (p.y < hs) return abs(p.x) - w;
  return length(vec2(abs(p.x) + r - w, p.y - hs)) - r;
}

// distance with the part hit: 0 brick, 1 timber, 2 sand, 3 flask, 4 cupola, 5 stream
vec2 scene(vec3 p) {
  float ax = abs(p.x);
  float zl = mod(p.z, B) - 0.5 * B;
  float zp = abs(mod(p.z + 0.5 * B, B) - 0.5 * B);

  // sand floor with raised lips along the channels
  float dc = channel(p.xz).x;
  float lip = 0.07 * exp(-(dc - 0.08) * (dc - 0.08) / 0.004);
  float fh = dc < 0.0 ? -0.025 : lip;
  float d = (p.y - fh) * 0.8;
  float part = 2.0;

  // brick side walls, piers at every bay, arched windows high up
  float wl = W - ax;
  float win = max(arch(vec2(zl, p.y), 0.85, 4.9, 1.0), 3.5 - p.y);
  wl = max(wl, -max(win, ax - W - 0.7));
  float pr = max(W - 0.42 - ax, zp - 0.34);
  pr = max(pr, p.y - HW);
  wl = min(wl, pr);
  wl = min(wl, ZE - p.z);
  if (wl < d) { d = wl; part = 0.0; }

  // roof boards and timber trusses
  float yr = HW + (W - ax) * 0.42;
  float rf = (yr - p.y) * 0.92;
  float tb = max(abs(p.y - HW + 0.15) - 0.14, zp - 0.13);
  float rt = max(abs(p.y - yr + 0.2) * 0.92 - 0.13, zp - 0.13);
  float kp = max(max(ax - 0.11, zp - 0.11), HW - p.y);
  float st = max(abs(p.y - HW - (ax - 0.15) * 0.7) * 0.82 - 0.09, zp - 0.1);
  st = max(st, max(ax - 2.2, HW - p.y));
  float tm = min(min(tb, rt), min(kp, st));
  tm = max(tm, ax - W + 0.3);
  rf = min(rf, tm);
  if (rf < d) { d = rf; part = tm < rf + 0.001 ? 1.0 : 1.5; }

  // overhead crane girder across the bay, a chain and hook hanging from it
  vec3 gq = p - vec3(0.0, 5.55, 9.3);
  float gd = min(sdBox(gq, vec3(W, 0.04, 0.22)), sdBox(gq - vec3(0.0, -0.42, 0.0), vec3(W, 0.04, 0.22)));
  gd = min(gd, sdBox(gq - vec3(0.0, -0.21, 0.0), vec3(W, 0.2, 0.035)));
  vec3 hq = p - vec3(1.35, 0.0, 9.3);
  float lk = abs(fract(p.y * 4.0) - 0.5);
  float ch = length(hq.xz) - 0.035 - 0.025 * smoothstep(0.25, 0.1, lk);
  ch = max(ch, max(p.y - 5.2, 2.75 - p.y));
  float hk = abs(length(vec2(hq.x - 0.12, p.y - 2.55)) - 0.17) - 0.04;
  hk = max(max(hk, abs(hq.z) - 0.05), p.y - 2.6);
  ch = min(ch, min(hk, sdBox(hq - vec3(0.0, 2.85, 0.0), vec3(0.12, 0.12, 0.08)) - 0.02));
  gd = min(gd, ch);
  if (gd < d) { d = gd; part = 1.1; }

  // moulding flasks along the bays
  float k = floor(p.z / B);
  if (k >= 0.0 && k <= 4.0) {
    vec3 c, hs; float side;
    flask(k, c, hs, side);
    vec3 q = p - c;
    float fb = sdBox(q, hs - 0.03) - 0.03;
    fb = max(fb, -sdBox(q - vec3(0.0, hs.y, 0.0), vec3(hs.x - 0.1, 0.06, hs.z - 0.1)));
    if (fb < d) { d = fb; part = 3.0; }
  }

  // banded brick cupola with its tapping spout
  vec2 cq = p.xz - FC;
  float band = smoothstep(0.1, 0.0, abs(fract(p.y * 0.55) - 0.5) - 0.38);
  float cu = length(cq) - 1.15 + 0.012 * sin(atan(cq.y, cq.x) * 20.0) - 0.05 * band;
  cu -= 0.25 * smoothstep(0.6, 0.0, p.y);
  float sp = sdBox(vec3(p.x - FC.x, p.y - 1.05 - (p.z - FC.y + 1.1) * 0.12, p.z - FC.y + 1.45), vec3(0.17, 0.05, 0.42));
  cu = min(cu, sp);
  if (cu < d) { d = cu; part = 4.0; }

  // falling stream of metal from spout to runner head
  float sy = clamp(p.y, 0.0, 1.0);
  float wob = 0.02 * sin(p.y * 9.0 - u_time * 6.0);
  float sm = length(vec2(p.x - FC.x - wob, p.z - ZH + 0.25 * (1.0 - sy) * (1.0 - sy) - 0.05)) - 0.085 - 0.04 * (1.0 - sy);
  sm = max(sm, max(p.y - 1.0, -p.y - 0.1));
  if (sm < d) { d = sm; part = 5.0; }
  return vec2(d, part);
}

// colour of metal at temperature T: blood red crust to white core
vec3 molten(float T, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 m = mix(c3 * c3 * 0.5, c3 * c3 * 1.6, smoothstep(0.0, 0.25, T));
  m = mix(m, c0 * c0 * 1.6, smoothstep(0.2, 0.5, T));
  m = mix(m, c0 * 1.5, smoothstep(0.45, 0.7, T));
  m = mix(m, c1 * 1.8, smoothstep(0.65, 0.85, T));
  m = mix(m, mix(c2, vec3(1.0), 0.5) * 2.6, smoothstep(0.85, 1.0, T));
  return m * (0.3 + 1.1 * T);
}

// cold moonlight reaching p through the right windows
const vec3 LM = vec3(0.74, 0.62, -0.26);
float moonVis(vec3 p) {
  if (p.x > W - 0.05) return 0.0;
  float tt = (W - p.x) / LM.x;
  vec3 q = p + LM * tt;
  float zl = mod(q.z, B) - 0.5 * B;
  float w = max(arch(vec2(zl, q.y), 0.85, 4.9, 1.0), 3.5 - q.y);
  float sf = 0.03 + tt * 0.01;
  float bars = smoothstep(0.0, 0.04, abs(fract(q.y * 1.4) - 0.5) - 0.04)
             * smoothstep(0.0, 0.03, abs(zl) - 0.035);
  return smoothstep(sf, -sf, w) * (0.3 + 0.7 * bars);
}

// the warm light thrown by the pour onto a point, with its glow tint weight
vec4 heatLight(vec3 p, vec3 n, float heatK, float t) {
  float fl = 0.85 + 0.15 * vn(vec2(t * 1.7, 2.0)) + 0.06 * sin(t * 5.3);
  // the runner below
  float cx = runX(min(p.z, ZH));
  vec3 v = vec3(cx - p.x, 0.05 - p.y, 0.0);
  float d2 = dot(v, v);
  float wr = clamp(dot(n, v * inversesqrt(d2 + 1e-4)) * 0.6 + 0.4, 0.0, 1.0);
  float runI = 1.4 / (1.0 + d2 * 0.55) * wr * smoothstep(ZH + 3.0, ZH - 1.0, p.z);
  // the tap and stream at the cupola
  vec3 lf = vec3(FC.x, 0.6, ZH) - p;
  float df = dot(lf, lf);
  float wf = clamp(dot(n, lf * inversesqrt(df + 1e-4)) * 0.7 + 0.3, 0.0, 1.0);
  float tapI = 6.0 / (1.0 + df * 0.25) * wf * fl;
  // the nearest flask pool
  float k = clamp(floor(p.z / B), 0.0, 4.0);
  vec3 c, hs; float side;
  flask(k, c, hs, side);
  vec3 lm = c + vec3(0.0, hs.y + 0.15, 0.0) - p;
  float dm = dot(lm, lm);
  float pool = 0.5 + 0.5 * sin(t * 0.09 + k * 1.9);
  float mI = 0.9 * pool / (1.0 + dm * 0.9) * clamp(dot(n, lm * inversesqrt(dm + 1e-4)) * 0.6 + 0.4, 0.0, 1.0);
  // the pig bed glowing on the left
  vec3 lb = vec3(-1.95, 0.05, clamp(p.z, 1.6, 4.5)) - p;
  float db = dot(lb, lb);
  float bI = 0.8 / (1.0 + db * 0.3) * clamp(dot(n, lb * inversesqrt(db + 1e-4)) * 0.6 + 0.4, 0.0, 1.0);
  float tot = (runI + tapI + mI + bI) * heatK;
  return vec4(tot, tapI / max(runI + tapI + mI + bI, 1e-3), d2, df);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  float mn = min(res.x, res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t = u_time;
  float heatK = clamp(u_heat, 0.0, 2.0);
  float flowT = t * max(u_flow, 0.0);
  float sparkK = clamp(u_sparks, 0.0, 2.5);
  float smokeK = clamp(u_smoke, 0.0, 2.0);

  // camera low in the shed, left of the runner, looking down the bay
  vec3 ro = vec3(-1.1 + 0.08 * sin(t * 0.05), 1.85, -1.2);
  vec3 fw = normalize(vec3(0.05, -0.14, 1.0));
  vec3 rtv = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 upv = cross(fw, rtv);
  vec3 rd = normalize(fw * 0.82 + rtv * uv.x + upv * uv.y);

  float tr = 0.0;
  vec2 h = vec2(1.0, 0.0);
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * tr;
    h = scene(p);
    if (h.x < 0.0015 * tr) { hit = true; break; }
    if (abs(p.x) > W + 0.75) break;
    tr += h.x * 0.9;
    if (tr > 45.0) break;
  }
  tr = min(tr, 45.0);
  vec3 p = ro + rd * tr;

  // blue-black night for shadow, the theme for heat
  vec3 shade = vec3(0.010, 0.016, 0.040);
  vec3 coolAmb = vec3(0.030, 0.055, 0.140);
  vec3 white = vec3(1.0, 0.96, 0.9);
  vec3 moonC = vec3(0.16, 0.30, 0.70);

  vec3 col = vec3(0.0);
  if (hit && h.y > 4.5) {
    // the falling stream: white hot at the core
    float n = vn(vec2(p.y * 6.0 + t * 8.0, p.x * 20.0));
    col = mix(c1 * 2.0, white * 3.0, 0.5 + 0.5 * n) * heatK;
  } else if (hit) {
    vec2 e = vec2(0.003, -0.003);
    vec3 nr = normalize(e.xyy * scene(p + e.xyy).x + e.yyx * scene(p + e.yyx).x
                      + e.yxy * scene(p + e.yxy).x + e.xxx * scene(p + e.xxx).x);
    float alb;
    vec3 emit = vec3(0.0);
    if (h.y < 0.5) {
      // sooty coursed brick, darker as it climbs
      float along = abs(nr.x) > 0.5 ? p.z : p.x;
      float course = floor(p.y / 0.2);
      float bk = along / 0.46 + 0.5 * mod(course, 2.0);
      float mortar = smoothstep(0.0, 0.02, abs(fract(p.y / 0.2) - 0.5) * 0.2 - 0.085)
                   * smoothstep(0.0, 0.02, abs(fract(bk) - 0.5) * 0.46 - 0.2);
      alb = (0.5 + 0.35 * fbm(vec2(along * 3.0, p.y * 5.0)) + 0.25 * (h21(vec2(floor(bk), course)) - 0.5));
      alb *= 0.45 + 0.55 * mortar;
      alb *= mix(1.0, 0.45, smoothstep(2.0, 6.0, p.y) * fbm(vec2(along * 0.6, p.y * 0.8)));
    } else if (h.y < 1.25) {
      // timber: long fibres along the beam, checks and knots
      vec2 g = abs(nr.y) > 0.5 ? vec2(p.x, p.z) : vec2(p.x + p.y * 0.3, p.z);
      float fib = fbm(vec2(g.x * 1.2, g.y * 26.0 + p.y * 18.0));
      alb = 0.35 + 0.4 * fib + 0.12 * sin(g.x * 9.0 + fib * 6.0);
      alb *= 0.8;
      // the crane and chain are scaled black iron
      if (h.y > 1.05) alb = 0.22 + 0.25 * fbm(vec2(p.x * 3.0 + p.y * 2.0, p.z * 7.0));
    } else if (h.y < 1.75) {
      // roof boards
      float bd = smoothstep(0.0, 0.03, abs(fract(p.z * 3.2) - 0.5) - 0.04);
      alb = (0.25 + 0.3 * fbm(vec2(p.x * 0.8, p.z * 12.0))) * (0.5 + 0.5 * bd);
    } else if (h.y < 2.5) {
      // moulding sand, fine grain, with molten metal in the channels
      float gr = h21(floor(p.xz * 140.0)) * 0.35 + fbm(p.xz * 2.4) * 0.65;
      alb = 0.28 + 0.4 * gr;
      vec2 ch = channel(p.xz);
      float inC = smoothstep(0.015, -0.015, ch.x);
      if (inC > 0.0) {
        float along = p.z + flowT * 1.6;
        float cr = fbm(vec2(p.x * 5.0 + 0.6 * sin(along * 0.7), along * 2.2));
        float crust = smoothstep(0.5, 0.8, cr);
        float core = smoothstep(0.0, 0.14, -ch.x);
        float T = (0.45 + 0.55 * core) * (1.0 - 0.65 * crust) * mix(0.8, 1.0, smoothstep(0.0, ZH, p.z));
        T *= ch.y;
        T = clamp(T * (0.55 + 0.45 * heatK), 0.0, 1.0);
        emit = molten(T, c0, c1, c2, c3) * heatK * inC;
      }
    } else if (h.y < 3.5) {
      // iron-banded wooden flask, with a crusting pool on top
      float k = clamp(floor(p.z / B), 0.0, 4.0);
      vec3 c, hs; float side;
      flask(k, c, hs, side);
      vec3 q = p - c;
      float bandI = smoothstep(0.02, 0.0, abs(abs(q.y) - hs.y * 0.6) - 0.03);
      alb = 0.3 + 0.3 * fbm(vec2((q.x + q.z) * 1.0, q.y * 30.0));
      alb = mix(alb, 0.15, bandI);
      float inP = step(abs(q.x), hs.x - 0.1) * step(abs(q.z), hs.z - 0.1) * step(hs.y - 0.08, q.y);
      if (inP > 0.0) {
        float pool = 0.5 + 0.5 * sin(t * 0.09 + k * 1.9);
        float cr = fbm(q.xz * 4.0 + vec2(k * 3.1, t * 0.05));
        float T = clamp((0.25 + 0.6 * pool) * (1.0 - 0.75 * smoothstep(0.3 + 0.3 * pool, 0.75, cr)), 0.0, 1.0);
        T *= 0.5 + 0.4 * heatK;
        emit = molten(T * 0.9, c0, c1, c2, c3) * heatK;
        alb = 0.1;
      }
    } else {
      // cupola: brick under iron hoops, tap hole glowing
      float a = atan(p.z - FC.y, p.x - FC.x);
      float course = floor(p.y / 0.2);
      float bk = a * 6.0 + 0.5 * mod(course, 2.0);
      float mortar = smoothstep(0.0, 0.02, abs(fract(p.y / 0.2) - 0.5) * 0.2 - 0.085)
                   * smoothstep(0.0, 0.05, abs(fract(bk) - 0.5) - 0.42);
      float band = smoothstep(0.1, 0.0, abs(fract(p.y * 0.55) - 0.5) - 0.38);
      alb = (0.45 + 0.3 * fbm(vec2(a * 4.0, p.y * 4.0))) * (0.45 + 0.55 * mortar);
      alb = mix(alb, 0.07, band);
      float tap = smoothstep(0.32, 0.12, length(vec2(p.x - FC.x, (p.y - 1.15) * 1.3))) * step(p.z, FC.y - 0.9);
      float door = smoothstep(0.1, 0.0, max(abs(p.x - FC.x - 0.1) - 0.38, abs(p.y - 3.9) - 0.5)) * step(p.z, FC.y - 0.8);
      float fl = 0.8 + 0.2 * vn(vec2(t * 2.1, 5.0));
      emit = (mix(c1, white, 0.6) * 2.4 * tap + mix(c0, c1, vn(vec2(p.x * 8.0, p.y * 6.0 - t * 1.5))) * 2.2 * door * fl) * heatK;
    }

    vec4 hl = heatLight(p, nr, heatK, t);
    vec3 warmC = mix(c3 * c3 * 1.4, mix(c0 * c0 * 1.3, c1, hl.y), smoothstep(0.0, 1.0, hl.x));
    float mv = moonVis(p + nr * 0.03) * max(dot(nr, LM), 0.0);
    vec3 lit = shade + coolAmb * (0.35 + 0.65 * smoothstep(-1.0, 1.0, nr.y)) * smoothstep(-1.0, 9.0, p.y)
             + moonC * mv * 1.15
             + warmC * hl.x * 0.9 + c2 * hl.x * hl.x * 0.1;
    col = alb * lit + emit;
  } else if (abs(p.x) > W) {
    // night sky through the windows, deep blue with a little cloud
    float cl = fbm(vec2(p.z * 0.15 + t * 0.01, p.y * 0.3));
    col = moonC * (0.5 + 0.7 * cl) * (p.x > 0.0 ? 1.2 : 0.6);
    float bar = smoothstep(0.03, 0.0, abs(fract(p.y * 1.4) - 0.5) - 0.44)
              + smoothstep(0.03, 0.0, abs(mod(p.z, B) - 0.5 * B) - 0.03);
    col *= 1.0 - 0.8 * clamp(bar, 0.0, 1.0);
  }

  // haze over distance into a deep blue night
  float fog = 1.0 - exp(-tr * 0.025);
  col = mix(col, coolAmb * 0.35, fog * 0.6);

  // smoke lit from below by the pour, cool above
  float acc = 0.0, accC = 0.0;
  float tm = min(tr, 30.0);
  float dt = tm / 24.0;
  float jit = h21(gl_FragCoord.xy + fract(t) * 17.0);
  for (int i = 0; i < 24; i++) {
    float s = (float(i) + jit) * dt;
    vec3 q = ro + rd * s;
    float sm = fbm(vec2(q.x * 0.35 + q.y * 0.25, q.z * 0.25 - q.y * 0.3) + vec2(0.0, -t * 0.04) + vec2(t * 0.02, 0.0));
    sm = smoothstep(0.3, 0.9, sm) * (0.4 + 0.6 * smoothstep(0.0, 4.0, q.y));
    vec4 hl = heatLight(q, vec3(0.0, -1.0, 0.0), heatK, t);
    acc += sm * hl.x * dt;
    accC += (0.35 + sm) * moonVis(q) * dt;
  }
  col += mix(c3 * c3 * 1.5, c0, clamp(acc * 0.3, 0.0, 1.0)) * acc * 0.1 * smokeK;
  col += moonC * accC * 0.05 * (0.4 + 0.6 * smokeK);

  // sparks drifting up from the pour at three depths
  vec2 tap = vec2(-0.05, 0.08);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 11.0 + fi * 7.0;
    float sp = 0.18 + 0.08 * fi;
    vec2 mq = uv * sc;
    mq.x += 0.35 * sin(uv.y * 5.0 + t * 0.4 + fi * 2.0);
    mq.y -= t * sp * sc * 0.25;
    vec2 cell = floor(mq);
    float sh = h21(cell + fi * 31.0);
    vec2 so = vec2(h21(cell + 5.1), h21(cell + 9.3)) - 0.5;
    vec2 f = fract(mq) - 0.5 - so * 0.6;
    float len = 0.1 + 0.25 * fract(sh * 7.0);
    float dsp = length(vec2(f.x, max(abs(f.y + len * 0.5) - len * 0.5, 0.0)));
    float r = (0.025 + 0.02 * fract(sh * 13.0)) * (1.0 + 0.3 * fi);
    float m = smoothstep(r, 0.0, dsp) + 0.25 * smoothstep(r * 4.0, 0.0, dsp);
    m *= step(1.0 - 0.2 * sparkK, sh);
    float tail = smoothstep(-len, 0.0, f.y);
    // sparks gather above the tap and the runner and die out with height
    float dr = segD(uv, tap, vec2(0.72, -0.5));
    float near = exp(-dr * dr * 30.0) + 1.5 * exp(-dot(uv - tap, uv - tap) * 25.0);
    float live = smoothstep(0.5, -0.2, uv.y - tap.y) * near;
    float tw = 0.55 + 0.45 * sin(t * (2.0 + 3.0 * sh) + sh * 50.0);
    vec3 sc3 = mix(c0 * c0 * 1.5, mix(c2, white, 0.5) * 1.8, tail * fract(sh * 3.0 + 0.3));
    col += sc3 * m * tail * tw * live * heatK * (1.6 - fi * 0.35);
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.7);
  gl_FragColor = vec4(col, 1.0);
}
