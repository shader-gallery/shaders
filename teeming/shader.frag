// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Teeming - a casting floor in a dark foundry at night. A tilted ladle hung
// from a crane bail pours a white-hot stream into a sprue basin on the sand
// floor, and runner channels carry the metal outward along the spiral arms
// of a golden-angle field of moulds, each cup filling and cooling to a crust
// in a wave that rolls outward. Sparks rise from the pour, the heat lights
// the firebrick walls from below, and cold blue night shows in the tall
// steel windows high on the far wall.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;   // speed of the metal in the runners and the fill wave (default 1.0)
uniform float u_heat;   // brightness of the molten metal and its bounce light (default 1.0)
uniform float u_sparks; // amount of sparks rising from the pour (default 1.0)
uniform float u_smoke;  // density of the hot haze hanging over the floor (default 1.0)

const float GA = 2.399963;  // golden angle, rad
const float SPC = 0.6;      // mould spacing along the spiral, m
const int NM = 60;          // moulds in the field
const float WZ = 14.0;      // far wall plane z
const float WX = 9.0;       // right wall plane x
const float FX = -3.4;      // furnace mouth position along the far wall
const vec3 BG = vec3(0.006, 0.006, 0.010);

vec3 C0; vec3 C1; vec3 C2; vec3 C3;
float T; float FLOW; float HEAT; float PX; float FL;
vec2 CEN; vec3 LAD; vec3 LIP; vec3 RO; vec3 FW; vec3 RT; vec3 UPV;
vec3 COOL;

float h11(float n) {
  return fract(sin(n * 47.193 + 1.91) * 7243.17);
}

float h21(vec2 p) {
  return fract(sin(dot(p, vec2(27.619, 61.373)) + 0.71) * 4711.29);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.11 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s / 0.9375;
}

// molten metal by temperature: 0 a black crust, 1 white heat
vec3 melt(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 a = C3 * 0.04;
  a = mix(a, C3 * 0.8, smoothstep(0.05, 0.3, x));
  a = mix(a, C0 * 1.4, smoothstep(0.3, 0.55, x));
  a = mix(a, C1 * 2.0, smoothstep(0.55, 0.8, x));
  a = mix(a, mix(C2, vec3(1.0), 0.35) * 3.0, smoothstep(0.8, 1.0, x));
  return a;
}

vec2 seedPos(float i) {
  float a = i * GA;
  return sqrt(i) * SPC * vec2(cos(a), sin(a));
}

// how molten mould i is now: a fill wave rolls outward from the sprue
float seedHeat(float i) {
  float hi = h11(i);
  float ph = T * 0.21 * FLOW - sqrt(i) * 0.95 + hi * 1.3;
  return smoothstep(-0.35, 0.95, sin(ph)) * (0.75 + 0.25 * hi);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

float box3(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

vec3 flaskSize(float i) {
  return vec3(0.55 - 0.08 * i, 0.26 + 0.05 * mod(i, 2.0), 0.42 + 0.04 * i);
}

// three flasks of different sizes set down in the near left of the floor
vec3 flaskPos(float i) {
  return vec3(-2.4 - 1.75 * i + 1.15 * i * i, 0.0, 3.2 + 3.25 * i - 1.85 * i * i)
       + vec3(0.0, flaskSize(i).y, 0.0);
}

// ladle shell, molten bath, bail and crane rope: 1 steel, 2 bath, 3 rope,
// 4 flask steel, 5 flask sand
vec2 map(vec3 p) {
  vec3 q = p - LAD;
  // tilt the ladle so its mouth leans toward the pour
  q.xy = rot(0.55) * q.xy;
  float r = 0.82 + 0.1 * q.y + 0.012 * sin(q.y * 9.0);
  float cyl = length(q.xz) - r;
  float shell = max(abs(cyl) - 0.07, abs(q.y) - 0.9);
  shell = min(shell, max(cyl, abs(q.y + 0.9) - 0.08));
  // a thick lip ring and the spout lip toward the pour
  float lip = length(vec2(cyl, q.y - 0.88)) - 0.09;
  shell = min(shell, lip);
  // reinforcing bands round the shell
  float band = max(abs(cyl) - 0.11, abs(abs(q.y + 0.1) - 0.45) - 0.05);
  shell = min(shell, band);
  // trunnion bosses on both sides
  float tr = max(length(q.xy - vec2(0.0, 0.15)) - 0.16, abs(abs(q.z) - 0.95) - 0.12);
  shell = min(shell, tr);
  // the molten bath: inside the shell, below a level surface
  vec3 w = p - LAD;
  float bath = max(cyl + 0.07, w.y - 0.42);
  bath = max(bath, abs(q.y) - 0.84);
  // the bail: a flat bar arc hanging in the plane through the trunnions
  vec3 b = p - (LAD + vec3(0.0, 0.15, 0.0));
  float arc = length(vec2(length(b.yz) - 1.12, b.x)) - 0.07;
  arc = max(arc, -b.y + 0.05 * abs(b.z));
  // crane rope rising out of frame from the bail crown, a hook block on it
  vec3 c = p - (LAD + vec3(0.0, 1.27, 0.0));
  float rope = max(length(c.xz) - 0.045, -c.y);
  float block = max(length(c.xz) - 0.22, abs(c.y - 0.75) - 0.32) - 0.03;
  rope = min(rope, block);
  // closed sand flasks waiting in the foreground, steel frames round a sand top
  float fk = 1e3;
  float fs = 1e3;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 fc = flaskPos(fi);
    vec3 fb = flaskSize(fi);
    vec3 f = p - fc;
    f.xz = rot(0.3 * fi - 0.25) * f.xz;
    float outer = box3(f, fb, 0.03);
    float inner = box3(f - vec3(0.0, 0.06, 0.0), fb - vec3(0.07, 0.0, 0.07), 0.02);
    float frame = max(outer, -inner);
    // ribs round the frame and lifting pins on the ends
    frame = min(frame, box3(f - vec3(0.0, -0.02, 0.0), fb + vec3(0.025, -fb.y + 0.03, 0.025), 0.01));
    frame = min(frame, max(length(f.yz - vec2(0.0, 0.0)) - 0.05, abs(f.x) - fb.x - 0.12));
    fk = min(fk, frame);
    fs = min(fs, max(inner, f.y - fb.y + 0.05 + 0.015 * vnoise(f.xz * 14.0)));
  }
  vec2 res = vec2(shell, 1.0);
  if (arc < res.x) res = vec2(arc, 1.0);
  if (bath < res.x) res = vec2(bath, 2.0);
  if (rope < res.x) res = vec2(rope, 3.0);
  if (fk < res.x) res = vec2(fk, 4.0);
  if (fs < res.x) res = vec2(fs, 5.0);
  return res;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.004, -0.004);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x
                 + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

// warm light thrown up by the pour and the pool of moulds, falling off
vec3 heatLight(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
  vec3 d = vec3(CEN.x, 0.35, CEN.y) - p;
  float dd = dot(d, d);
  float fl = 0.9 + 0.1 * sin(T * 3.1) * sin(T * 1.7 + 1.0);
  acc += mix(C1, C2, 0.4) * max(dot(n, d * inversesqrt(dd)), 0.0) * 34.0 * fl / (dd + 0.5);
  // the moulds as a broad low source spread over the field
  d = vec3(CEN.x - 0.6, 0.2, CEN.y + 0.6) - p;
  dd = dot(d, d);
  acc += C0 * max(dot(n, d * inversesqrt(dd)) * 0.7 + 0.3, 0.0) * 40.0 / (dd + 9.0);
  // the stream itself lights things at mid height
  d = vec3(CEN.x, 1.3, CEN.y) - p;
  dd = dot(d, d);
  acc += C1 * max(dot(n, d * inversesqrt(dd)), 0.0) * 10.0 / (dd + 0.4);
  // the open furnace mouth in the far wall, a deeper redder source
  d = vec3(FX, 1.1, WZ - 0.6) - p;
  dd = dot(d, d);
  float ff = 0.85 + 0.15 * sin(T * 1.3 + sin(T * 0.7));
  acc += mix(C3, C0, 0.6) * max(dot(n, d * inversesqrt(dd)), 0.0) * 30.0 * ff / (dd + 1.0);
  return acc * HEAT;
}

// the sand floor with its spiral of moulds and runner channels
vec3 floorShade(vec3 p, float t, vec3 rd) {
  vec2 v = p.xz - CEN;
  float foot = t * PX / FL / max(abs(rd.y), 0.15);
  float aa = max(foot, 0.004);
  float wob = (vnoise(p.xz * 11.0) - 0.5) * 0.045;

  float dM = 1e3; float hM = 0.0; float iM = 0.0;
  float dL = 1e3; float hL = 0.0;
  vec2 sh = rd.xz / max(-rd.y, 0.2) * 0.07;
  float dC = 1e3; float hC = 0.0; float uC = 0.0; float lC = 1.0; float iC = 0.0;
  float bounce = 0.0;
  for (int k = 0; k < NM; k++) {
    float fi = float(k) + 4.0;
    vec2 s = seedPos(fi);
    float hi = h11(fi);
    float heat = seedHeat(fi);
    float r = SPC * (0.27 + 0.14 * hi);
    vec2 o = v - s;
    float d = length(o);
    bounce += heat * r * r / (d * d + 0.05);
    float dm = d - r + wob;
    if (dm < dM) { dM = dm; hM = heat; iM = fi; }
    // the metal sits below the floor, so the cup shows its inner wall
    float dl = length(v + sh - s) - r * 0.93 + wob;
    if (dl < dL) { dL = dl; hL = heat; }
    // runner from the mould one parastichy inward (13 seeds back)
    float fj = fi - 13.0;
    vec2 sj = fj < 4.0 ? vec2(0.0) : seedPos(fj);
    float hj = fj < 4.0 ? 1.0 : seedHeat(fj);
    vec2 ba = s - sj;
    vec2 pa = v - sj;
    float u = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float dc = length(pa - ba * u);
    if (dc < dC) { dC = dc; uC = u; lC = length(ba); hC = mix(hj, heat, u); iC = fi; }
  }

  // sand: dark tamped moulding sand, finer grit near the camera
  float fine = 1.0 - smoothstep(0.01, 0.05, foot);
  float sand = 0.06 * (0.55 + 0.9 * fbm(p.xz * 2.3)) * (0.75 + 0.5 * mix(0.5, vnoise(p.xz * 38.0), fine));
  // trodden paths and a darker burnt ring round the sprue
  sand *= 0.7 + 0.3 * smoothstep(0.6, 3.0, length(v));
  vec3 base = vec3(1.0, 0.92, 0.84) * sand;

  // light on the sand: the field glow, the sprue, a cool spill from the windows
  float lv = length(v);
  float sprueHot = 0.9 + 0.1 * sin(T * 2.3);
  vec3 lit = mix(C0, C3, 0.35) * bounce * 0.55 * HEAT;
  lit += heatLight(p, vec3(0.0, 1.0, 0.0));
  lit += COOL * 4.0 * (0.5 + 0.5 * fbm(p.xz * 0.3 + 4.0));
  vec3 col = base * lit;

  // raised sand lips round each cup and along each runner catch the glow
  float lipM = smoothstep(0.07, 0.0, dM) * smoothstep(-0.02, 0.01, dM);
  col += melt(0.45) * lipM * hM * 0.25 * HEAT;
  float wC = 0.05 + 0.012 * sin(uC * 9.0 + iC);
  float lipC = smoothstep(wC + 0.05, wC, dC) * smoothstep(wC - 0.01, wC + 0.01, dC);
  col += melt(0.45) * lipC * hC * 0.2 * HEAT;

  // metal in the cups: a bright bath with drifting skin, crusting at the walls
  float skin = fbm(v * 5.0 + vec2(iM * 1.7, T * 0.07 * FLOW));
  float tm = hM * (0.82 + 0.3 * skin) - 0.25 * smoothstep(-0.07, 0.0, dM);
  tm -= (1.0 - hM) * 0.25 * smoothstep(0.45, 0.6, skin);
  vec3 mc = melt(tm) * HEAT;
  // inner wall of the cup: dark sand washed by the glow of the metal below
  vec3 wallC = base * 0.6 * lit + melt(0.4) * hM * 0.35 * HEAT;
  vec3 cup = mix(wallC, mc, smoothstep(aa, -aa, dL));
  col = mix(col, cup, smoothstep(aa, -aa, dM));

  // metal running in the runners, streaming outward
  float stream = vnoise(vec2(uC * lC * 4.0 - T * 1.4 * FLOW, iC * 3.1));
  float tc = hC * (0.7 + 0.4 * stream) - 0.2 * smoothstep(wC * 0.4, wC, dC);
  col = mix(col, melt(tc) * HEAT, smoothstep(wC + aa, wC - aa, dC) * step(dM, 0.4) + 0.0 * dM);

  // the sprue basin under the stream, white hot with rings spreading out
  float rB = 0.62 + wob;
  float ring = 0.5 + 0.5 * sin(lv * 34.0 - T * 6.0);
  float tb = 0.88 + 0.12 * ring * smoothstep(0.6, 0.1, lv) - 0.35 * smoothstep(0.3, 0.62, lv) * skin;
  col = mix(col, melt(tb) * HEAT * sprueHot, smoothstep(rB + aa, rB - aa, lv));
  col += melt(0.6) * smoothstep(rB + 0.2, rB, lv) * smoothstep(rB - 0.02, rB + 0.03, lv) * 0.4 * HEAT;
  return col;
}

// firebrick walls lit from below by the floor, cold windows high up
vec3 wallShade(vec3 p, vec3 n, float u, float t) {
  float foot = t * PX / FL;
  float bh = 0.3;
  float bw = 0.7;
  float row = floor(p.y / bh);
  float bu = u / bw + 0.5 * mod(row, 2.0);
  vec2 f = vec2(fract(bu), fract(p.y / bh));
  float mt = max(foot * 1.5 / bh, 0.04);
  float mort = smoothstep(0.0, mt, f.y) * smoothstep(0.0, mt * bh / bw, f.x);
  mort = mix(mort, 0.8, smoothstep(0.03, 0.08, foot));
  float bid = h21(vec2(floor(bu), row));
  float alb = 0.16 * (0.55 + 0.6 * bid) * (0.65 + 0.35 * mort) * (0.7 + 0.6 * fbm(vec2(u, p.y) * 1.7));
  // soot climbing the wall, heavier high up
  float soot = smoothstep(1.0, 6.0, p.y) * (0.4 + 0.6 * fbm(vec2(u * 0.4, p.y * 0.2 - T * 0.01)));
  alb *= 1.0 - 0.7 * soot;
  vec3 a = vec3(1.0, 0.8, 0.68) * alb;
  vec3 col = a * (heatLight(p, n) + COOL * 3.0);

  // tall steel-framed windows on the far wall, night outside
  if (n.z < -0.5) {
    float wu = u / 4.2 + 0.5;
    float wi = floor(wu);
    float wx = (fract(wu) - 0.5) * 4.2;
    float wy = p.y - 6.2;
    float win = step(abs(wx), 1.2) * step(abs(wy), 2.6);
    if (win > 0.5) {
      vec2 g = vec2(wx / 0.4, wy / 0.52);
      vec2 gf = abs(fract(g) - 0.5);
      float bar = smoothstep(0.44, 0.47, max(gf.x, gf.y));
      bar = mix(bar, 0.3, smoothstep(0.02, 0.05, foot));
      vec2 gi = floor(g);
      float pane = h21(gi + wi * 13.0);
      vec3 night = COOL * (6.0 + 5.0 * smoothstep(-2.6, 2.6, wy)) * (0.75 + 0.5 * pane);
      // grime on the glass, a few panes knocked out darker
      night *= 0.6 + 0.4 * fbm(vec2(wx, wy) * 2.0 + wi);
      night *= pane < 0.12 ? 0.35 : 1.0;
      // the glow from the floor catches the lower panes
      night += C0 * 0.04 * smoothstep(0.5, -2.6, wy) * HEAT;
      col = mix(night, col * 0.6, bar);
    }
    // the sill and frame edge
    float frame = step(abs(wx), 1.32) * step(abs(wy), 2.72) * (1.0 - win);
    col *= 1.0 - 0.5 * frame;

    // an arched furnace mouth at floor level, fire inside, a scorched surround
    vec2 fq = vec2(p.x - FX, p.y);
    float arch = fq.y < 1.5 ? abs(fq.x) - 0.85 : length(fq - vec2(0.0, 1.5)) - 0.85;
    arch = max(arch, -fq.y);
    float aaw = max(foot * 2.0, 0.01);
    float scorch = exp(-max(arch, 0.0) * 1.6) * smoothstep(-0.2, 2.5, fq.y + 0.5);
    col *= 1.0 - 0.6 * scorch * smoothstep(0.0, 0.4, arch);
    col += melt(0.45) * exp(-max(arch, 0.0) * 9.0) * 0.25 * HEAT;
    float fire = fbm(vec2(fq.x * 1.6, fq.y * 1.1 - T * 0.6));
    float depth = smoothstep(0.85, 0.0, abs(fq.x)) * smoothstep(2.4, 0.2, fq.y);
    vec3 inner = melt(0.35 + 0.45 * depth + 0.3 * (fire - 0.5)) * HEAT;
    col = mix(col, inner, smoothstep(aaw, -aaw, arch));
  }
  return col;
}

void main() {
  C0 = u_palette[0]; C1 = u_palette[1]; C2 = u_palette[2]; C3 = u_palette[3];
  if (dot(C0,C0)+dot(C1,C1)+dot(C2,C2)+dot(C3,C3) < 1e-5) {
    C0 = vec3(0.231,0.510,0.965); C1 = vec3(0.659,0.333,0.969);
    C2 = vec3(0.133,0.827,0.933); C3 = vec3(0.957,0.247,0.369);
  }
  T = u_time;
  FLOW = max(u_flow, 0.0);
  HEAT = max(u_heat, 0.0);
  float SPK = max(u_sparks, 0.0);
  float SMK = max(u_smoke, 0.0);
  COOL = vec3(0.006, 0.014, 0.04);

  vec2 res = u_resolution;
  float mn = min(res.x, res.y);
  PX = 1.0 / mn;
  vec2 sp = (gl_FragCoord.xy - 0.5 * res) / mn;

  CEN = vec2(2.2, 6.0);
  // the ladle mouth sits right over the sprue
  LAD = vec3(CEN.x - 1.25, 2.35, CEN.y);
  LIP = vec3(CEN.x, 2.62, CEN.y);

  // camera standing back on the floor, drifting slowly along the field
  float sway = sin(T * 0.045) * 0.9 + sin(T * 0.017 + 1.0) * 0.5;
  RO = vec3(-1.6 + sway, 3.7, -2.6 + 0.4 * cos(T * 0.031));
  vec3 tgt = vec3(0.8 + 0.3 * sway, 1.1, 6.5);
  FW = normalize(tgt - RO);
  RT = normalize(cross(vec3(0.0, 1.0, 0.0), FW));
  UPV = cross(FW, RT);
  FL = 1.3;
  vec3 rd = normalize(FW * FL + RT * sp.x + UPV * sp.y);

  // planes: floor, far wall, right wall
  float tF = rd.y < -1e-4 ? -RO.y / rd.y : 1e4;
  float tW = rd.z > 1e-4 ? (WZ - RO.z) / rd.z : 1e4;
  float tX = rd.x > 1e-4 ? (WX - RO.x) / rd.x : 1e4;
  float tP = min(tF, min(tW, tX));

  // march the ladle and its rigging
  float t = 0.5;
  float m = -1.0;
  for (int i = 0; i < 56; i++) {
    vec2 h = map(RO + rd * t);
    if (h.x < 0.001 * t) { m = h.y; break; }
    t += h.x * 0.9;
    if (t > tP) break;
  }

  vec3 col;
  float tt;
  if (m > 0.0 && t < tP) {
    tt = t;
    vec3 p = RO + rd * t;
    vec3 n = normalAt(p);
    if (m < 1.5) {
      // riveted steel crusted with splash, lit from the pour below
      vec3 q = p - LAD;
      float splash = smoothstep(0.5, 0.8, fbm(vec2(atan(q.z, q.x) * 3.0, q.y * 4.0)));
      float alb = 0.11 * (0.6 + 0.6 * vnoise(p.xy * 9.0 + p.z * 3.0)) * (1.0 - 0.5 * splash);
      col = vec3(alb) * (heatLight(p, n) * 1.3 + COOL * 3.0);
      // a hot rim of skulled metal and slag around the mouth
      vec3 ql = q;
      ql.xy = rot(0.55) * ql.xy;
      float rim = smoothstep(0.7, 0.92, ql.y) * smoothstep(-0.2, 0.8, ql.x);
      float drip = smoothstep(0.45, 0.8, vnoise(vec2(atan(ql.z, ql.x) * 6.0, ql.y * 2.5 + T * 0.05)));
      // slag runs down the outside under the spout
      float run = smoothstep(0.75, 1.0, ql.x / max(length(ql.xz), 1e-3)) * smoothstep(-0.3, 0.8, ql.y)
                * smoothstep(0.5, 0.8, vnoise(vec2(atan(ql.z, ql.x) * 14.0, 0.5)));
      col += melt(0.45 + 0.35 * drip) * (rim * (0.35 + 0.65 * drip) + run * 0.5) * 1.3 * HEAT;
    } else if (m < 2.5) {
      float sk = fbm(p.xz * 4.0 + vec2(T * 0.08, 0.0));
      col = melt(0.84 + 0.18 * sk - 0.3 * smoothstep(0.6, 0.85, sk)) * HEAT;
    } else if (m < 3.5) {
      col = vec3(0.05) * (heatLight(p, n) + COOL * 3.0);
    } else if (m < 4.5) {
      // flask steel, scaled and scorched, edges worn bright
      float wear = smoothstep(0.55, 0.85, vnoise(p.xz * 7.0 + p.y * 5.0));
      float alb = 0.07 * (0.6 + 0.8 * vnoise(p.xy * 13.0 + p.z * 7.0)) + 0.1 * wear;
      col = vec3(alb, alb * 0.95, alb * 0.9) * (heatLight(p, n) * 1.2 + COOL * 4.0);
    } else {
      // rammed sand tops with a pouring cup and risers still hot from the pour
      float alb = 0.07 * (0.6 + 0.8 * fbm(p.xz * 6.0));
      col = vec3(1.0, 0.9, 0.8) * alb * (heatLight(p, n) + COOL * 4.0);
      float best = 1e3;
      float bi = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec3 f = p - flaskPos(fi);
        f.xz = rot(0.3 * fi - 0.25) * f.xz;
        float dc = length(f.xz - vec2(0.18 - 0.1 * fi, 0.05));
        float dr = length(f.xz - vec2(-0.25 + 0.05 * fi, -0.12));
        float d = min(dc - 0.07, dr - 0.045);
        if (d < best) { best = d; bi = fi; }
      }
      float cool = 0.45 + 0.25 * sin(T * 0.13 * FLOW + bi * 2.1);
      col = mix(col, melt(cool + 0.15 * fbm(p.xz * 20.0)) * HEAT, smoothstep(0.01, -0.01, best));
      col += melt(0.35) * smoothstep(0.04, 0.0, best) * smoothstep(-0.01, 0.01, best) * 0.4 * HEAT;
    }
  } else if (tP == tF) {
    tt = tF;
    col = floorShade(RO + rd * tF, tF, rd);
  } else if (tP == tW) {
    tt = tW;
    vec3 p = RO + rd * tW;
    col = wallShade(p, vec3(0.0, 0.0, -1.0), p.x, tW);
  } else {
    tt = tX;
    vec3 p = RO + rd * tX;
    col = wallShade(p, vec3(-1.0, 0.0, 0.0), -p.z, tX);
  }

  // the pour stream from the ladle lip down into the sprue
  {
    vec2 w = RO.xz - CEN;
    vec2 d2 = rd.xz;
    float tc = -dot(w, d2) / max(dot(d2, d2), 1e-5);
    float y = RO.y + rd.y * tc;
    float yy = clamp(y, 0.0, LIP.y);
    vec2 off = vec2(0.03 * sin(yy * 3.0 - T * 5.0) + 0.12 * smoothstep(1.6, LIP.y, yy) * smoothstep(1.6, LIP.y, yy), 0.0);
    float dx = length(w + d2 * tc - off);
    float rS = 0.06 + 0.02 * smoothstep(0.6, 0.0, yy);
    float inY = smoothstep(-0.05, 0.05, y) * smoothstep(LIP.y + 0.05, LIP.y - 0.05, y);
    float front = step(tc, tt + 0.1);
    float flick = 0.75 + 0.25 * vnoise(vec2(y * 5.0 + T * 9.0 * max(FLOW, 0.2), 1.0));
    float core = smoothstep(rS + 0.02, rS - 0.02, dx) * inY * front;
    col = mix(col, melt(0.95 * flick + 0.05) * HEAT * 1.2, core);
    col += melt(0.7) * exp(-dx * dx / 0.06) * inY * 0.35 * HEAT * front;
    // fume rising off the pour, widening as it climbs, lit from beneath
    float yp = max(y, 0.0);
    float wdt = 0.25 + 0.35 * yp;
    float sx = (w + d2 * tc).x * RT.x + (w + d2 * tc).y * RT.z;
    float wisp = fbm(vec2(sx * 1.4 / wdt + 0.3 * sin(T * 0.2), yp * 0.9 - T * 0.35));
    float plume = exp(-dx * dx / (wdt * wdt)) * smoothstep(-0.2, 0.3, y) * exp(-yp * 0.22)
                * smoothstep(0.3, 0.8, wisp) * step(tc, tt + 0.5);
    col += mix(C0, C3, smoothstep(0.5, 5.0, yp)) * plume * exp(-yp * 0.35) * 0.28 * SMK * HEAT;
    col += COOL * plume * 2.0 * SMK;
  }

  // haze: cold air high, hot smoke glowing over the pour
  vec3 hp = RO + rd * min(tt, 12.0);
  float dens = (0.015 + 0.03 * SMK) * (0.5 + fbm(vec2(hp.x * 0.25 + T * 0.03, hp.y * 0.35 - T * 0.06)));
  float tr = exp(-tt * dens);
  col = col * tr + COOL * 1.5 * (1.0 - tr);
  // in-scattered glow round the pour point, analytic along the ray
  {
    vec3 v = vec3(CEN.x, 1.0, CEN.y) - RO;
    float b = dot(v, rd);
    vec3 cp = v - rd * b;
    float h = max(length(cp), 0.15);
    float a = atan((tt - b) / h) - atan(-b / h);
    col += mix(C0, C3, 0.3) * a / h * (0.05 + 0.12 * SMK) * HEAT;
  }

  // sparks thrown up from the pour, three depths of streaks
  vec2 S;
  {
    vec3 v = vec3(CEN.x, 0.3, CEN.y) - RO;
    float z = dot(v, FW);
    S = vec2(dot(v, RT), dot(v, UPV)) / z * FL;
  }
  vec3 spk = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float sc = 14.0 + 10.0 * fl;
    vec2 rel = sp - S;
    vec2 g = rel * sc;
    g.y -= T * (1.6 - 0.35 * fl) * (0.4 + 0.6 * FLOW) * 2.0;
    g.x += 0.6 * sin(g.y * 0.35 + fl * 2.0 + T * 0.2);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = h21(id + fl * 19.7);
    vec2 o = vec2(h21(id + 3.3) - 0.5, h21(id + 7.9) - 0.5) * 0.6;
    vec2 dd = (f - o) * vec2(1.0, 0.28);
    float s = exp(-dot(dd, dd) / (0.004 - 0.001 * fl));
    // a fan opening upward from the pour, thinning with height
    float up = max(rel.y + 0.02, 0.0);
    float fan = exp(-rel.x * rel.x / (0.003 + 0.12 * up)) * exp(-up * (2.2 + fl));
    float live = step(1.0 - 0.45 * min(SPK, 2.0), r);
    spk += melt(0.65 + 0.35 * fract(r * 7.1) - up * 0.6) * s * fan * live * (1.2 - 0.3 * fl);
  }
  col += spk * HEAT * 1.4;

  col = vec3(1.0) - exp(-col * 1.25);
  gl_FragColor = vec4(BG + col, 1.0);
}
