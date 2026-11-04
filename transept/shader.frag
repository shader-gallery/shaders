// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Nave at low sun - tall pointed bays recede down a gothic nave toward a
// glowing triple lancet at the far end. Low light pours through the stained
// clerestory on the left and cuts coloured diagonal shafts across the nave,
// laying window-shaped pools on the polished floor and the far arcade, while
// dust drifts and motes glint where they cross the beams.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent - unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_shaft;  // strength of the sunlight through the glass (default 1)
uniform float u_dust;   // density of dust hanging in the air        (default 1)
uniform float u_drift;  // drift speed of dust, motes and cloud      (default 0.6)

const float NW = 2.0;   // half width of the nave
const float AW = 1.9;   // depth of the side aisles
const float BZ = 2.3;   // length of one bay
const float VH = 8.4;   // height of the vault crown
const float CH = 1.6;   // eye height
const float CX = 0.8;   // camera offset toward the right arcade
const float FL = 1.3;   // focal length
const float ZE = 25.0;  // far end wall of the choir
const vec2  VP = vec2(0.5, -0.12);  // vanishing point on screen

vec3 c0, c1, c2, c3;
float gT, gK, gDr;
vec3 gL;

float hs(vec2 p) {
  p = fract(p * vec2(6.173, 9.419));
  p += dot(p, p.yx + vec2(19.31, 27.07));
  return fract(p.x * p.y * 43.17);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(0.79 * p.x - 0.61 * p.y, 0.61 * p.x + 0.79 * p.y) * 2.07 + vec2(1.7, 4.3);
    a *= 0.5;
  }
  return s;
}

// pointed arch: s across the opening, y up, a half span, ys spring height
float arch(float s, float y, float a, float ys) {
  float r = 1.7 * a;
  if (y < ys) return abs(s) - a;
  return length(vec2(abs(s) + r - a, y - ys)) - r;
}

// weighted pick across the theme for one pane of glass
vec3 pane(float h) {
  vec3 a = mix(c0, c1, smoothstep(0.28, 0.36, h));
  a = mix(a, c2, smoothstep(0.6, 0.66, h));
  a = mix(a, c3 * 1.2 + c0 * 0.1, smoothstep(0.86, 0.9, h));
  return a;
}

// diamond quarry coordinates for leaded glazing
vec2 quarry(float s, float y) {
  return vec2(s * 7.0 + y * 3.2, -s * 7.0 + y * 3.2);
}

// lead came darkness between quarries
float came(float s, float y) {
  vec2 q = abs(fract(quarry(s, y)) - 0.5) * 2.0;
  return smoothstep(0.8, 0.97, max(q.x, q.y));
}

// clerestory glass in one bay: two lancets under an oculus
vec4 glassAt(float z, float y, float soft) {
  float bi = floor(z / BZ);
  float s = (fract(z / BZ) - 0.5) * BZ;
  float l = max(arch(abs(s) - 0.3, y, 0.21, 6.0), 4.6 - y);
  float o = length(vec2(s, y - 6.78)) - 0.2;
  float li = o < l ? 0.0 : sign(s);
  float d = min(l, o);
  float m = smoothstep(soft, -soft, d);
  float bh = hs(vec2(bi, li + 4.0));
  float ph = hs(floor(quarry(s, y)) + bi * 13.0);
  vec3 g = pane(fract(bh + 0.16 * ph * step(soft, 0.03)));
  return vec4(g, m);
}

// sunlight reaching a point inside the nave through the left clerestory
vec4 litAt(vec3 P, float soft) {
  float t = (P.x + NW) / gL.x;
  vec3 Q = P - gL * t;
  vec4 g = glassAt(Q.z, Q.y, soft);
  // broken cloud drifts along the windows so only some bays blaze at once
  float gate = smoothstep(0.32, 0.68, vn(vec2(Q.z * 0.33 - gT * gDr, 3.0)));
  g.a *= (0.08 + 0.92 * gate) * step(-NW - 0.01, P.x) * step(P.x, NW + 0.01);
  return g;
}

// three tall lancets in the far wall of the choir
vec4 apseAt(float x, float y, float soft) {
  float d = max(arch(x, y, 0.32, 5.4), 1.4 - y);
  d = min(d, max(arch(abs(x) - 0.85, y, 0.26, 4.6), 1.8 - y));
  vec2 rp = vec2(x, y - 6.75);
  float rose = length(rp) - 0.42;
  d = min(d, rose);
  float m = smoothstep(soft, -soft, d);
  // radial tracery spokes and a hub in the rose
  float ang = atan(rp.y, rp.x) * 12.0 / 6.2832;
  float spoke = smoothstep(0.38, 0.5, abs(fract(ang) - 0.5)) * step(0.12, length(rp));
  m *= 1.0 - 0.75 * step(rose, 0.0) * max(spoke, smoothstep(0.1, 0.13, length(rp)) * smoothstep(0.16, 0.13, length(rp)));
  float h = hs(floor(vec2(x * 7.0, y * 4.0)) + 3.0);
  vec3 g = mix(c1, c3 * 1.3, smoothstep(2.0, 5.0, y) * 0.7);
  g = mix(g, c0, step(0.82, h) * 0.8);
  g = mix(g, c2, step(rose, 0.0) * 0.5);
  return vec4(g, m);
}

// coursed ashlar grain on a wall: u along, y up
float ashlar(float u, float y, float fw) {
  float ry = y / 0.46;
  float row = floor(ry);
  float bx = u / (0.9 + 0.3 * hs(vec2(row, 2.0))) + 0.5 * mod(row, 2.0);
  float jx = abs(fract(bx) - 0.5) * 2.0;
  float jy = abs(fract(ry) - 0.5) * 2.0;
  float joint = max(smoothstep(0.93 - fw, 1.0, jx), smoothstep(0.9 - fw, 1.0, jy));
  float blk = 0.8 + 0.35 * hs(vec2(floor(bx), row));
  float grit = 0.75 + 0.5 * fbm(vec2(u * 3.0, y * 5.0));
  return blk * grit * (1.0 - 0.55 * joint * (1.0 - fw));
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res = max(u_resolution, vec2(1.0));
  vec2  p = (gl_FragCoord.xy - 0.5 * res) / (0.5 * res.y);
  float px = 2.0 / res.y;
  float pr = max(u_pixelRatio, 1.0);
  gT = u_time;
  float dr = clamp(u_drift, 0.0, 2.0);
  float dk = clamp(u_dust, 0.0, 2.0);
  // passing cloud thins the sun now and then
  float cloud = vn(vec2(gT * 0.06 * (0.3 + dr), 1.7));
  gK = clamp(u_shaft, 0.0, 2.0) * (0.72 + 0.4 * smoothstep(0.25, 0.75, cloud));
  // the sun slides slowly along the nave
  gL = normalize(vec3(0.5, -0.82, -0.36 + 0.1 * sin(gT * 0.045)));
  gDr = 0.04 * (0.3 + dr);

  vec3 ro = vec3(CX, CH, 0.0);
  vec3 rd = normalize(vec3(p - VP, FL));

  float tf = rd.y < 0.0 ? -CH / rd.y : 1e4;
  float tl = rd.x < 0.0 ? (-NW - CX) / rd.x : 1e4;
  float tr = rd.x > 0.0 ? (NW - CX) / rd.x : 1e4;
  float tc = rd.y > 0.0 ? (VH - CH) / rd.y : 1e4;
  float te = ZE / rd.z;
  float t = min(min(min(tf, tl), min(tr, tc)), te);
  vec3 P = ro + rd * t;
  float fw = clamp(t * px / FL * 6.0, 0.0, 1.0);

  vec3 amb = c3 * 0.05 + c1 * 0.008 + c0 * 0.006;
  vec3 col = vec3(0.0);

  if (t == tf) {
    // polished flagstones, offset rows, catching coloured pools of sun
    vec2 fu = P.xz / vec2(1.1, 0.95);
    float row = floor(fu.y);
    fu.x += 0.5 * mod(row, 2.0);
    vec2 ff = abs(fract(fu) - 0.5) * 2.0;
    float fz = t * t / (CH * FL) * px;
    float joint = smoothstep(0.94 - fz * 3.0, 1.0, max(ff.x, ff.y)) * (1.0 - smoothstep(0.05, 0.25, fz));
    float tex = fbm(P.xz * 1.8);
    float slab = 0.75 + 0.4 * hs(floor(fu) + 7.0);
    col = amb * slab * (0.6 + 0.6 * tex) * (1.0 - 0.6 * joint);
    vec4 g = litAt(P, 0.025);
    col += g.rgb * g.a * gK * 0.55 * (0.75 + 0.35 * tex) * (1.0 - 0.4 * joint);
    // the polish mirrors the glowing glass, broken by wear
    float fr = 0.18 + 0.5 * exp(-(-rd.y) * 6.0);
    float wear = 0.5 + 0.5 * smoothstep(0.3, 0.7, fbm(P.xz * 0.9 + 3.0));
    if (rd.x < 0.0 && tl < te) {
      vec4 gr = glassAt(rd.z * tl, -CH - rd.y * tl, 0.08);
      col += gr.rgb * gr.a * gK * 0.28 * fr * wear;
    }
    vec4 ar = apseAt(CX + rd.x * te, -CH - rd.y * te, 0.12);
    col += ar.rgb * ar.a * 0.35 * fr * wear;
  } else if (t == tc) {
    // ribbed vault: transverse, diagonal and ridge ribs over dark webbing
    float s = (fract(P.z / BZ) - 0.5) * BZ;
    float rw = 0.085 + fw * 0.25;
    float dd = abs(abs(P.x) / NW - abs(s) / (BZ * 0.5)) * 0.9;
    float tri = BZ * 0.5 - abs(s);
    float rd0 = min(min(tri, dd), abs(P.x) * 1.3);
    // each rib a rounded roll with a dark fillet either side
    float roll = sqrt(max(1.0 - rd0 * rd0 / (rw * rw), 0.0));
    float fil = smoothstep(rw, rw * 1.25, rd0) * (1.0 - smoothstep(rw * 1.4, rw * 2.2, rd0));
    // the webbing bellies up between ribs: darker in the pockets
    float pocket = clamp(min(tri, dd) / 0.6, 0.0, 1.0);
    vec3 web = amb * (0.55 - 0.35 * pocket) * (0.7 + 0.5 * fbm(P.xz * vec2(2.0, 5.0)));
    // light from the sunlit glass warms the left side of the vault
    vec3 bounce = (c0 * 0.02 + c1 * 0.018) * gK * smoothstep(NW, -NW, P.x);
    col = web * (1.0 - 0.5 * fil) + bounce * (1.0 - 0.6 * pocket);
    col += (amb * 0.6 + bounce * 1.2) * roll;
    // carved boss where the ribs cross at the crown
    float boss = length(vec2(P.x, s)) / 0.22;
    col = mix(col, (amb * 2.0 + c2 * 0.03 * gK) * (0.7 + 0.6 * vn(vec2(atan(P.x, s) * 3.0, boss * 4.0))), smoothstep(1.0, 0.85, boss));
  } else if (t == te) {
    // end wall of the choir with its glowing triple lancet
    col = amb * 0.8 * ashlar(P.x, P.y, fw);
    vec4 a = apseAt(P.x, P.y, 0.015 + fw * 0.05);
    float lead = smoothstep(0.86, 0.98, max(abs(fract(P.x * 7.0) - 0.5), abs(fract(P.y * 4.0) - 0.5)) * 2.0) * (1.0 - fw);
    col = mix(col, a.rgb * 0.9 * (1.0 - 0.6 * lead), a.a);
    col += c1 * 0.06 * exp(-abs(P.x) * 0.8) * smoothstep(8.0, 2.0, P.y);
  } else {
    // one of the side walls
    float side = t == tl ? -1.0 : 1.0;
    float s = (fract(P.z / BZ) - 0.5) * BZ;
    float ad = arch(s, P.y, 0.66, 2.6);
    if (ad < 0.0 && P.y > 0.0) {
      // through the arcade into the low side aisle
      float ta = (side * (NW + AW) - CX) / rd.x;
      float tac = rd.y > 0.0 ? (4.3 - CH) / rd.y : 1e4;
      float tt = min(min(ta, tac), min(tf, te));
      vec3 A = ro + rd * tt;
      col = amb * 0.45 * (0.7 + 0.5 * fbm(A.zy * 2.0));
      if (tt == ta) {
        float sa = (fract(A.z / BZ) - 0.5) * BZ;
        float wd = max(arch(sa, A.y, 0.36, 2.6), 1.1 - A.y);
        float wm = smoothstep(0.03, -0.03, wd);
        float ph = hs(floor(quarry(sa, A.y)) + floor(A.z / BZ) * 5.0);
        float al = came(sa, A.y);
        vec3 wg = side < 0.0 ? pane(fract(hs(vec2(floor(A.z / BZ), 9.0)) + 0.14 * ph)) * gK * 0.7 : c3 * 0.18;
        wg *= 1.0 - 0.7 * al * (1.0 - fw);
        col = mix(col * ashlar(A.z, A.y, fw), wg, wm);
        col += (side < 0.0 ? wg * 0.12 : vec3(0.0)) * smoothstep(0.6, 0.0, wd) * (1.0 - wm);
      } else if (tt == tf && side < 0.0) {
        // aisle floor lit by its own windows
        float sa = (fract(A.z / BZ) - 0.5) * BZ;
        col += pane(hs(vec2(floor(A.z / BZ), 9.0))) * gK * 0.12 * exp(-sa * sa * 3.0) * smoothstep(-NW - 0.2, -NW - AW, A.x);
      }
      col *= 0.8;
    } else {
      float dp = BZ * 0.5 - abs(s);
      col = amb * ashlar(P.z, P.y, fw);
      // engaged shafts at each pier rising to the vault springing
      float cw = 0.17;
      float cyl = sqrt(max(1.0 - (dp * dp) / (cw * cw), 0.0)) * step(dp, cw) * step(P.y, 7.2);
      col = mix(col, amb * (0.5 + 1.1 * cyl) * (0.8 + 0.3 * vn(vec2(P.y * 9.0, P.z))), step(0.001, cyl));
      // moulded orders round the arcade arch, and a carved capital band
      float mo = step(0.0, ad) * step(ad, 0.26) * step(1.6, P.y);
      float ord = 0.55 + 0.6 * smoothstep(0.0, 0.025 + fw * 0.03, abs(fract(ad / 0.087) - 0.5) - 0.2);
      col = mix(col, amb * ord * 1.2, mo);
      float cap = smoothstep(2.4, 2.45, P.y) * smoothstep(2.72, 2.67, P.y) * step(0.0, ad);
      col = mix(col, amb * (1.3 + 0.8 * vn(vec2(P.z * 14.0, P.y * 18.0))), cap);
      // string courses and the blind triforium band
      float s1 = (P.y - 3.95) / 0.05, s2 = (P.y - 4.5) / 0.05;
      float sc = exp(-s1 * s1) + exp(-s2 * s2);
      col += amb * 1.0 * sc;
      float tb = step(4.02, P.y) * step(P.y, 4.45);
      float tq = arch((fract(P.z / BZ * 4.0) - 0.5) * BZ * 0.25, P.y, 0.18, 4.25);
      col *= 1.0 - 0.7 * tb * smoothstep(0.02, -0.02, tq) * step(0.15, dp);
      // clerestory glass
      vec4 g = glassAt(P.z, P.y, 0.012 + fw * 0.05);
      float lead = came(s, P.y) * (1.0 - fw);
      if (side < 0.0) {
        vec3 gl = g.rgb * gK * 1.15 * (1.0 - 0.75 * lead);
        col = mix(col, gl, g.a);
        // embrasure glow round each window
        vec4 gs = glassAt(P.z, P.y, 0.3);
        col += gs.rgb * 0.1 * gK * gs.a * (1.0 - g.a);
      } else {
        col = mix(col, (g.rgb * 0.12 + c3 * 0.08) * (1.0 - 0.6 * lead), g.a);
        // sun pools on the far arcade
        vec4 sl = litAt(P, 0.025);
        col += sl.rgb * sl.a * gK * 0.5 * (0.6 + 0.5 * ashlar(P.z, P.y, fw));
      }
    }
  }

  // blue air thickening down the nave
  vec3 fogC = c3 * 0.05 + c1 * 0.012;
  col = mix(col, fogC, 1.0 - exp(-t * 0.04));

  // light shafts: march the view ray through the sunlit dust
  float tm = min(t, 30.0);
  float jit = hs(gl_FragCoord.xy * 0.71 + 2.3);
  vec3 vol = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    float f = (float(i) + jit) / 48.0;
    // denser samples near the eye where the beams are widest on screen
    float tt = tm * (0.25 * f + 0.75 * f * f);
    vec3 Q = ro + rd * tt;
    vec4 g = litAt(Q, 0.035);
    float d1 = vn(vec2(Q.x * 0.9 + Q.z * 0.35 - gT * 0.12 * dr, Q.y * 1.3 + Q.z * 0.5 + gT * 0.05 * dr));
    float d2 = vn(vec2(Q.z * 1.7 - Q.y * 0.6 + gT * 0.08 * dr, Q.x * 2.1 + 5.0));
    float dens = 0.15 + 1.1 * d1 * d1 + 0.35 * d2;
    vol += g.rgb * g.a * dens * (0.25 + 1.5 * f) * exp(-tt * 0.07);
  }
  col += vol * (tm / 48.0) * gK * 0.17 * (0.2 + dk * 0.8);

  // motes glinting where they drift through the beams, at three depths
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float tk = 3.0 + fk * 3.2;
    if (tk < t) {
      vec4 g = litAt(ro + rd * tk, 0.05);
      float cs = 0.085 - fk * 0.02;
      vec2 mu = p / cs + vec2(gT * 0.08 * dr * (1.0 - 0.25 * fk), gT * 0.04 * dr) + fk * 7.3;
      vec2 mc = floor(mu);
      float mh = hs(mc + fk * 3.1);
      vec2 mo = vec2(hs(mc + 1.7), hs(mc + 5.9)) - 0.5;
      mo += 0.2 * vec2(sin(gT * 0.5 * dr + mh * 30.0), cos(gT * 0.4 * dr + mh * 20.0));
      vec2 dm = (fract(mu) - 0.5 - mo * 0.6) * cs;
      float rad = (2.2 - fk * 0.5) * pr * px;
      float spark = exp(-dot(dm, dm) / (rad * rad)) * step(0.7, mh) * (0.6 + 0.4 * sin(gT * 1.3 + mh * 50.0));
      col += mix(g.rgb, vec3(1.0), 0.3) * g.a * spark * gK * (0.4 + 0.6 * dk) * 0.9;
    }
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
