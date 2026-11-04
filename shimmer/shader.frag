// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Shimmer - a straight desert highway at night, seen from the right lane.
// Asphalt with worn lane paint runs to a vanishing point left of centre under
// a deep teal sky and low eroded ranges. Two files of street lamps march past,
// crisp and close at the edges of the frame, shrinking to soft wavering points
// at the horizon, where rising heat bends the air, smears the far lamps and
// lays a mirage of them back onto the road. Car lights come and go far out.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_heat;   // strength of the heat shimmer and the road mirage (default 1)
uniform float u_speed;  // speed of travel down the road (default 0.5)
uniform float u_lamps;  // brightness of the street lamps and their pools (default 1)
uniform float u_haze;   // distance haze and glow along the horizon (default 1)

const float HOR = 0.10;   // horizon height in frame units
const float VX = -0.17;   // vanishing point, left of centre
const float CAM = 1.3;    // eye height above the road, metres
const float SPAC = 34.0;  // metres between lamps on one side
const float LAMPH = 8.5;  // lamp head height, metres

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 157.91))) * 24917.37);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vn(p);
    p = ROT * p * 2.03 + vec2(3.7, 8.1);
    a *= 0.5;
  }
  return s;
}

// eroded ridge line for the far ranges
float crest(float x) {
  float a = 0.5, s = 0.0, f = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = 1.0 - abs(2.0 * vn(vec2(x * f, f * 2.9)) - 1.0);
    s += a * n * n;
    f *= 2.21;
    a *= 0.47;
  }
  return s;
}

// sky, stars and the two far ranges
vec3 sky(vec2 q, float t, float haze, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float hy = max(q.y - HOR, 0.0);
  float dx = q.x - VX;
  vec3 col = c3 * (0.03 + 0.05 * exp(-hy * 4.0));
  // glow of a far town sitting on the horizon past the vanishing point
  col += mix(c0, c1, 0.4) * exp(-hy * 22.0) * exp(-dx * dx * 2.5) * 0.30 * haze;
  col += c3 * exp(-hy * 9.0) * 0.10 * haze;
  // thin high cloud catching the town glow
  float cl = fbm(vec2(q.x * 2.2 + t * 0.006, hy * 9.0 + 4.0));
  col += mix(c3, c0, 0.4) * smoothstep(0.5, 0.8, cl) * 0.06 * exp(-hy * 3.0) * haze;
  // stars
  vec2 sg = q * 34.0;
  vec2 sc = floor(sg), sf = fract(sg) - 0.5;
  float sh = hs(sc + 7.1);
  vec2 sd = sf - (vec2(hs(sc + 2.3), hs(sc + 5.9)) - 0.5) * 0.6;
  float star = step(0.93, sh) * exp(-dot(sd, sd) * 120.0) * (0.6 + 0.4 * sin(t * (0.5 + sh * 1.5) + sh * 40.0));
  col += c2 * star * 0.28 * smoothstep(0.12, 0.35, hy);
  // the galaxy rising on a slant over the right two thirds, split by dust lanes
  float gb = q.y - 0.32 - (q.x - 0.25) * 0.55;
  float gal = exp(-gb * gb * 30.0) * smoothstep(0.05, 0.3, hy);
  float dust = smoothstep(0.42, 0.68, fbm(vec2(q.x * 5.0 + gb * 3.0, gb * 14.0) + 2.0));
  float glit = fbm(q * 18.0 + 5.0);
  col += mix(c3, c1, 0.35 + 0.4 * glit) * gal * (0.5 + 0.7 * glit) * (1.0 - 0.75 * dust) * 0.09;
  vec2 fg = q * 90.0;
  vec2 fc = floor(fg);
  vec2 fo = fract(fg) - 0.5 - (vec2(hs(fc + 4.4), hs(fc + 8.8)) - 0.5) * 0.5;
  float fine = step(0.80, hs(fc + 1.9)) * exp(-dot(fo, fo) * 160.0) * gal * (1.0 - dust);
  col += c2 * fine * 0.22;
  // two ranges: the far one pale with haze, the near one dark with a lit rim
  for (int i = 0; i < 2; i++) {
    float k = float(i);
    float px = q.x * (2.4 - k * 0.9) + 17.0 + k * 9.0;
    float h = HOR + (0.012 + 0.008 * k) + (0.085 - 0.03 * k) * (crest(px) - 0.3);
    if (q.y < h) {
      float under = h - q.y;
      vec3 body = c3 * mix(0.06, 0.025, k);
      float gul = fbm(vec2(px * 7.0, q.y * 40.0));
      body *= 0.7 + 0.6 * gul;
      body += mix(c3, c0, 0.5) * exp(-under * 120.0) * (0.05 + 0.10 * exp(-dx * dx * 3.0)) * haze;
      col = mix(body, c3 * 0.09 * haze, (1.0 - k) * 0.5 * haze * exp(-under * 30.0));
    }
  }
  return col;
}

// the road plane, from screen point q
vec3 ground(vec2 q, float run, float lampk, float haze, float mn, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float dy = max(HOR - q.y, 1e-4);
  float z = CAM / dy;
  float gx = (q.x - VX) * z;
  float gz = z + run;
  float pxw = z / mn;                 // one pixel across, in metres
  float pxl = z * z / (CAM * mn);     // one pixel along, in metres
  float far = smoothstep(25.0, 140.0, z);

  // lamp pools: right lamps hang over x = 1.6, left ones over x = -5.4
  float dzr = mod(gz, SPAC) - 0.5 * SPAC;
  float dzl = mod(gz + 0.5 * SPAC, SPAC) - 0.5 * SPAC;
  float pr = exp(-((gx - 1.6) * (gx - 1.6) * 0.035 + dzr * dzr * 0.012));
  float pl = exp(-((gx + 5.4) * (gx + 5.4) * 0.035 + dzl * dzl * 0.012));
  float pool = (pr + pl) * lampk;
  pool = mix(pool, 0.25 * lampk, far * 0.8);

  vec3 col;
  float road = smoothstep(2.15 + pxw, 2.15 - pxw, gx) * smoothstep(-6.15 - pxw, -6.15 + pxw, gx);
  // asphalt: aggregate grain, tar seams and tyre polish, averaged out far away
  float grain = mix(fbm(vec2(gx * 5.0, gz * 5.0)), 0.5, far);
  float seam = mix(smoothstep(0.02, 0.0, abs(fract(gz / 9.0) - 0.5) - 0.48) * 0.6, 0.0, far);
  float tyre = exp(-(gx - 0.9) * (gx - 0.9) * 1.2) + exp(-(gx + 0.9) * (gx + 0.9) * 1.2);
  // our own low beams: a pale wedge on the lane ahead, fading out by 80 m
  float bw = 1.2 + z * 0.09;
  float bx = gx / bw;
  float beam = exp(-bx * bx * 1.5) * smoothstep(3.0, 9.0, z) * exp(-z * 0.03);
  vec3 asph = c3 * (0.010 + 0.016 * grain) * (1.0 - 0.4 * seam);
  asph += mix(c3, c0, 0.75) * pool * (0.09 + 0.14 * grain + 0.10 * tyre);
  asph += mix(c0, c2, 0.5) * beam * (0.05 + 0.08 * grain);
  // paint: dashed centre line, solid edge lines, worn along their length
  float wear = mix(0.55 + 0.45 * fbm(vec2(gx * 9.0, gz * 1.3)), 0.8, far);
  float lw = 0.07;
  float ac = max(lw, pxw);
  float cen = smoothstep(ac + pxw, ac - pxw * 0.5, abs(gx + 2.0)) * lw / ac;
  float dl = mod(gz, 12.0);
  float dash = mix(smoothstep(0.0, pxl + 0.1, dl) * smoothstep(4.0, 4.0 - pxl - 0.1, dl), 0.33, smoothstep(60.0, 160.0, z));
  float edg = smoothstep(ac + pxw, ac - pxw * 0.5, abs(gx - 1.95)) * lw / ac
            + smoothstep(ac + pxw, ac - pxw * 0.5, abs(gx + 5.95)) * lw / ac;
  float paint = (cen * dash + edg) * wear;
  asph = mix(asph, mix(c1, c2, 0.5) * (0.03 + 0.45 * pool + 0.6 * beam), clamp(paint, 0.0, 1.0));
  // desert shoulder: pale gravel verge, then sand with clumps of dry scrub
  float sc = mix(fbm(vec2(gx * 0.9, gz * 0.35)), 0.5, far);
  float grv = mix(fbm(vec2(gx * 8.0, gz * 8.0)), 0.5, far);
  float verge = smoothstep(4.5, 2.2, gx) * smoothstep(-8.5, -6.2, gx);
  vec3 dirt = c3 * (0.010 + 0.016 * grv) * (1.0 + 0.8 * verge);
  dirt += mix(c3, c0, 0.4) * (pool * 0.6 + beam * 0.3) * (0.03 + 0.06 * grv) * (0.4 + 0.6 * verge);
  // ripples in the sand, raking across the lamp spill
  float rip = 0.5 + 0.5 * sin(gz * 1.7 + gx * 0.6 + 3.0 * fbm(vec2(gx * 0.3, gz * 0.2)));
  dirt += mix(c3, c0, 0.3) * rip * rip * 0.018 * (1.0 - far) * (1.0 - verge) * (0.5 + grv);
  float bush = smoothstep(0.60, 0.70, sc) * (1.0 - far) * (1.0 - verge);
  float bedge = smoothstep(0.60, 0.64, sc) - smoothstep(0.64, 0.70, sc);
  dirt = mix(dirt, c3 * 0.005, bush * 0.85);
  dirt += mix(c0, c1, 0.5) * bedge * (1.0 - far) * (0.02 + 0.2 * pool) * grv;
  col = mix(dirt, asph, road);
  // haze over distance, toward the town glow on the horizon
  vec3 hz = c3 * 0.10 + mix(c0, c1, 0.4) * 0.16 * exp(-(q.x - VX) * (q.x - VX) * 2.5);
  col = mix(col, hz * haze, clamp((1.0 - exp(-z * 0.004)) * haze, 0.0, 0.95));
  return col;
}

// street lamps and car lights, composited over col at screen point q
vec3 lights(vec2 q, vec3 col, float run, float t, float lampk, float mn, float ghost, float heat,
            vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float ph = mod(run, SPAC);
  float base = floor(run / SPAC);
  float px1 = 1.0 / mn;
  if (ghost < 0.5) {
    // a telephone line far out on the right: timber poles with crossarms
    float tph = mod(run, 46.0);
    for (int i = 0; i < 12; i++) {
      float z = (float(i) + 0.3) * 46.0 - tph;
      if (z < 2.0) continue;
      float ix = 1.0 / z;
      float tid = floor(run / 46.0) + float(i);
      float lean = (hs(vec2(tid, 1.3)) - 0.5) * 0.25;
      float yg = HOR - CAM * ix;
      float yt = HOR + (9.6 - CAM) * ix;
      float ty = (q.y - yg) / max(yt - yg, 1e-4);
      float sx = VX + (13.0 + lean * ty) * ix;
      float pw = max(0.15 * ix * (1.0 - 0.3 * ty), px1 * 0.5);
      float m = smoothstep(pw + px1, pw - px1, abs(q.x - sx)) * step(0.0, ty) * step(ty, 1.0);
      float ya = HOR + (9.0 - CAM) * ix;
      float aw = max(0.08 * ix, px1 * 0.5);
      m = max(m, smoothstep(aw + px1, aw - px1, abs(q.y - ya)) * step(abs(q.x - VX - 13.0 * ix), 1.0 * ix));
      float fd = smoothstep(500.0, 350.0, z);
      float wgr = vn(vec2(ty * 14.0, tid * 7.0 + (q.x - sx) / max(pw, 1e-4) * 2.0));
      vec3 wood = c3 * (0.012 + 0.012 * wgr) + c3 * 0.03 * smoothstep(0.0, pw, q.x - sx);
      col = mix(col, wood, m * fd);
    }
    // the wires sag between poles; both run at x 12.2 and 13.8
    for (int w = 0; w < 2; w++) {
      float wx = 12.2 + 1.6 * float(w);
      float sxq = q.x - VX;
      if (sxq > 0.002) {
        float z = wx / sxq;
        float s = fract((z + run) / 46.0 - 0.3);
        float h = 8.95 - 1.3 * 4.0 * s * (1.0 - s);
        float sy = HOR + (h - CAM) / z;
        float ww = max(0.02 / z, px1 * 0.45);
        float wm = smoothstep(ww + px1, ww - px1 * 0.3, abs(q.y - sy)) * min(ww / (px1 * 0.45), 1.0);
        wm *= smoothstep(500.0, 300.0, z) * smoothstep(2.0, 6.0, z);
        col = mix(col, c3 * 0.11 + mix(c3, c0, 0.5) * 0.05 * exp(-z * 0.02), wm * 0.9);
      }
    }
  }
  // roadside reflector posts, glinting in our beams, every 25 m on both verges
  float dph = mod(run, 25.0);
  for (int i = 0; i < 28; i++) {
    float k = float(i);
    float side = mod(k, 2.0);
    float z = (floor(k * 0.5) + 1.0 - 0.4 * side) * 25.0 - dph;
    if (z < 2.0) continue;
    float ix = 1.0 / z;
    float dx = mix(2.75, -6.75, side);
    float sx = VX + dx * ix;
    float yg = HOR - CAM * ix;
    float yt = HOR + (1.1 - CAM) * ix;
    float pw = max(0.06 * ix, px1 * 0.4);
    float inx = smoothstep(pw + px1, pw - px1, abs(q.x - sx));
    float post = inx * step(yg, q.y) * step(q.y, yt);
    float glint = inx * smoothstep(yt - 0.22 * ix - px1, yt - 0.22 * ix, q.y) * step(q.y, yt - 0.04 * ix);
    float fd = smoothstep(14.0 * 25.0, 9.0 * 25.0, z);
    if (ghost < 0.5) col = mix(col, c3 * 0.02, post * fd);
    vec3 rc = mix(c1, c0, side);
    float rb = exp(-z * 0.012) * (1.0 - 0.6 * side);
    col += rc * glint * rb * fd * 0.9;
    vec2 gd = q - vec2(sx, yt - 0.13 * ix);
    col += rc * exp(-dot(gd, gd) / (0.00002 + 0.03 * ix * ix)) * rb * fd * 0.15;
  }
  for (int i = 0; i < 32; i++) {
    float k = float(i);
    float side = mod(k, 2.0);              // 0 right, 1 left
    float n = floor(k * 0.5);
    float z = (n + 0.5 + 0.5 * side) * SPAC - ph;
    if (z < 1.0) continue;
    float id = base + n + side * 101.0;
    float hj = hs(vec2(id, 3.1));
    float on = step(0.08, hj) * (0.75 + 0.5 * hs(vec2(id, 9.7)));
    float fade = smoothstep(16.0 * SPAC, 11.0 * SPAC, z) * smoothstep(1.0, 6.0, z);
    float pxp = mix(3.3, -7.1, side);      // pole base, metres
    float pxa = mix(1.6, -5.4, side);      // arm end over the road
    float hl = LAMPH + (hj - 0.5) * 0.6;
    float ix = 1.0 / z;
    float sxp = VX + pxp * ix;
    float sxa = VX + pxa * ix;
    float yg = HOR - CAM * ix;
    float yh = HOR + (hl - CAM) * ix;
    // pole: tapered steel post, faint lamp rim on the road-facing edge
    if (ghost < 0.5) {
      float pw = max(0.11 * ix, px1 * 0.6);
      float ty = clamp((q.y - yg) / max(yh - yg, 1e-4), 0.0, 1.0);
      float pwt = pw * (1.0 - 0.35 * ty);
      float inY = smoothstep(yg - px1, yg + px1, q.y) * smoothstep(yh + px1, yh - px1, q.y);
      float pm = smoothstep(pwt + px1, pwt - px1, abs(q.x - sxp)) * inY;
      // arm: curves out over the road and droops a little at its end
      float ax = (q.x - sxp) / (sxa - sxp);
      float ay = yh + (0.35 - 0.35 * (1.0 - ax) * (1.0 - ax)) * ix * 0.9 - 0.25 * ix;
      float aw = max(0.07 * ix, px1 * 0.5);
      float am = smoothstep(aw + px1, aw - px1, abs(q.y - ay)) * step(0.0, ax) * step(ax, 1.0);
      float m = max(pm, am) * fade;
      float rim = smoothstep(0.0, pwt, (q.x - sxp) * sign(sxa - sxp)) * on;
      vec3 steel = c3 * 0.02 + mix(c3, c0, 0.5) * rim * 0.10 * lampk;
      col = mix(col, steel, m);
      // dusty cone of light under the head
      float cy = (yh - q.y) / max(yh - yg, 1e-4);
      float cwid = (0.4 + 2.6 * cy) * ix;
      float cu = (q.x - sxa) / max(cwid, 1e-4);
      float cone = exp(-cu * cu * 2.0) * step(0.0, cy) * step(cy, 1.0) * (1.0 - cy);
      col += mix(c3, c1, 0.4) * cone * cy * 0.06 * on * lampk * fade * smoothstep(250.0, 40.0, z) * smoothstep(6.0, 24.0, z);
    }
    // lamp head: a lit lens, crisp when close, a soft wavering point far off
    // far heads ride the heat: each wavers on its own and smears upward
    float farz = smoothstep(70.0, 360.0, z);
    vec2 hp = vec2(sxa, yh - 0.12 * ix);
    hp.x += farz * 0.0035 * sin(t * (2.3 + hj * 1.7) + id * 1.9) * heat;
    vec2 d = q - hp;
    d.x *= 0.7;
    d.y *= mix(1.0, 0.45, farz * clamp(heat, 0.0, 1.5));
    float r2 = dot(d, d);
    float core = 0.32 * ix + px1 * 0.7;
    float soft = min(core * 3.0, 0.05) + 0.0018 + 0.0014 * farz;
    float lens = smoothstep(core * 1.2, core * 0.6, sqrt(r2)) * step(q.y, hp.y + 0.05 * ix);
    float halo = exp(-r2 / (soft * soft)) * 0.45 + exp(-sqrt(r2) / min(soft * 2.5, 0.05)) * 0.06 * (1.0 - 0.7 * farz);
    float atten = mix(1.0, 0.45, farz) * (0.75 + 0.25 * sin(t * 3.1 + id * 2.7) * farz * heat);
    vec3 lc = mix(c2, c0, 0.25 + 0.35 * hs(vec2(id, 5.3)));
    col += lc * (lens * 1.4 + halo) * on * fade * lampk * atten;
  }
  // ranch yards and a far pump station out on the plain, trembling in the heat
  for (int j = 0; j < 6; j++) {
    float fj = float(j);
    float zf = 160.0 + 260.0 * hs(vec2(fj, 2.2));
    float xf = mix(-90.0, 140.0, hs(vec2(fj, 6.6)));
    if (abs(xf + 2.0) < 14.0) xf += 40.0;
    float ix = 1.0 / zf;
    vec2 fp = vec2(VX + xf * ix + 0.003 * sin(t * (1.7 + fj * 0.4) + fj) * heat, HOR + (2.5 - CAM) * ix);
    vec2 d = q - fp;
    d.y *= mix(1.0, 0.5, clamp(heat, 0.0, 1.5));
    float r2 = dot(d, d);
    float tw = 0.75 + 0.25 * sin(t * (2.6 + fj * 0.9) + fj * 3.0) * clamp(heat, 0.0, 1.0);
    vec3 fc = mix(c0, c1, hs(vec2(fj, 9.1)));
    col += fc * (exp(-r2 / 0.000006) * 0.7 + exp(-sqrt(r2) / 0.006) * 0.05) * tw * (0.6 + 0.4 * hs(vec2(fj, 4.0)));
  }
  // traffic far out: one car ahead in our lane, two oncoming in the far lanes
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float zc, xc, own;
    if (j == 0) {
      zc = 260.0 + 90.0 * sin(t * 0.05);
      xc = 0.0; own = 1.0;
    } else {
      float cyc = 700.0;
      zc = cyc - mod(t * 45.0 + fj * 330.0, cyc) + 20.0;
      xc = -4.0; own = 0.0;
    }
    float ix = 1.0 / zc;
    float fadec = smoothstep(700.0, 450.0, zc) * smoothstep(20.0, 60.0, zc);
    vec3 cc = own > 0.5 ? c3 * 0.9 : mix(c2, c1, 0.4) * 0.7;
    for (int s = 0; s < 2; s++) {
      float sgn = float(s) * 2.0 - 1.0;
      vec2 cp = vec2(VX + (xc + sgn * 0.8) * ix, HOR + (0.75 - CAM) * ix);
      vec2 d = q - cp;
      float r2 = dot(d, d);
      float sz = 0.18 * ix + px1 * 0.8 + 0.003;
      col += cc * (exp(-r2 / (sz * sz)) * 0.8 + exp(-sqrt(r2) / (sz * 3.0)) * 0.08) * fadec;
    }
  }
  return col;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t = u_time;
  float heat = max(u_heat, 0.0);
  float run = t * (3.0 + 22.0 * clamp(u_speed, 0.0, 2.0));
  float lampk = max(u_lamps, 0.0);
  float haze = clamp(u_haze, 0.0, 2.0);

  // rising heat: a refraction offset field, strongest in a band on the horizon
  // the band is tall above the road and thin over the open desert
  float rd = exp(-(uv.x - VX) * (uv.x - VX) * 9.0);
  float band = exp(-abs(uv.y - HOR) * mix(26.0, 11.0, rd));
  vec2 hp = vec2(uv.x * 34.0, uv.y * 60.0 - t * 1.8);
  float h1 = vn(hp) - 0.5;
  float h2 = vn(hp * 1.9 + vec2(4.0, -t * 1.1)) - 0.5;
  vec2 off = vec2(h1 * 0.011 + h2 * 0.006, h2 * 0.005 + h1 * 0.003) * band * heat;
  vec2 q = uv + off;

  vec3 col;
  if (q.y > HOR) {
    col = sky(q, t, haze, c0, c1, c2, c3);
    col = lights(q, col, run, t, lampk, mn, 0.0, heat, c0, c1, c2, c3);
  } else {
    col = ground(q, run, lampk, haze, mn, c0, c1, c2, c3);
    // mirage: just short of the horizon the hot road mirrors the sky and lamps
    float dy = HOR - q.y;
    float mir = smoothstep(0.035, 0.004, dy) * clamp(heat, 0.0, 1.5) * (0.35 + 0.65 * rd);
    if (mir > 0.001) {
      vec2 rq = vec2(q.x + h1 * 0.006 * heat, HOR + dy * 1.5 + h2 * 0.004 * heat);
      vec3 rc = sky(rq, t, haze, c0, c1, c2, c3);
      rc = lights(rq, rc, run, t, lampk, mn, 1.0, heat, c0, c1, c2, c3);
      col = mix(col, rc * 0.75, mir * 0.8);
    }
    col = lights(q, col, run, t, lampk, mn, 0.0, heat, c0, c1, c2, c3);
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
