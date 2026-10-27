// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Aisle - a long server aisle seen from just off its centre line. Rows of
// racks recede on both sides toward a lit doorway at the far end, every
// cabinet stacked with servers of different heights, and each server
// carries its own cluster of amber status lights blinking at its own pace.
// The glossy raised floor mirrors the racks, cable trays and light strips
// run overhead, a warm haze thickens down the aisle, and a slow plane of
// scanning light sweeps back and forth along it, catching every bezel.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent - unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scan;    // speed of the light plane sweeping the aisle  (default 0.5)
uniform float u_lights;  // share of status lights that are lit          (default 1)
uniform float u_haze;    // thickness of the warm haze down the aisle    (default 0.8)

const float AW = 1.25;   // half width of the aisle
const float FY = -1.0;   // floor height, camera at 0
const float RT = 1.3;    // top of the racks
const float CY = 1.8;    // ceiling height
const float FL = 1.7;    // focal length
const float UH = 0.052;  // one rack unit
const float ZE = 38.0;   // far end wall of the aisle
const float CAMX = 0.3;  // camera offset toward the right row

float h1(vec2 p) {
  p = fract(p * vec2(4.7213, 6.1937));
  p += dot(p, p.yx + vec2(17.53, 29.71));
  return fract(p.x * p.y * 47.381);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x),
             mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.07 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s;
}

// heat ramp across the theme: black, deep rust, orange, amber, pale gold
vec3 heat(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  x = clamp(x, 0.0, 1.25);
  vec3 c = mix(vec3(0.0), c3 * c3 * 0.8, smoothstep(0.0, 0.25, x));
  c = mix(c, c0 * 0.9, smoothstep(0.22, 0.5, x));
  c = mix(c, c1 * 1.1, smoothstep(0.48, 0.76, x));
  c = mix(c, c2 * 1.4, smoothstep(0.74, 1.1, x));
  return c;
}

// one status light: offset from its centre in world units, footprint fz fy
float lamp(float dz, float dy, float fz, float fy) {
  float r = 0.0045;
  float ez = max(r, fz * 0.7), ey = max(r, fy * 0.7);
  float e = pow(r * r / (ez * ey), 0.6);
  float core = exp(-(dz * dz / (ez * ez) + dy * dy / (ey * ey)));
  float hz = exp(-(dz * dz / (16.0 * ez * ez) + dy * dy / (16.0 * ey * ey)));
  return e * (core * 2.2 + hz * 0.22);
}

// a rack row face: z along the aisle, hy height above floor, side -1 or 1
vec3 rack(float z, float hy, float side, float fz, float fy, float t, float dens,
          float scanZ, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float H = RT - FY;
  float cw = 0.8;
  float ci = floor(z / cw);
  float cz = fract(z / cw) * cw;
  float hc = h1(vec2(ci, side * 3.7 + 11.0));

  // frame: corner posts, top cap and plinth, bevelled
  float ed = min(cz, cw - cz);
  float post = 1.0 - smoothstep(0.03 - fz, 0.03 + fz, ed);
  float cap = smoothstep(H - 0.08 - fy, H - 0.08 + fy, hy);
  float plinth = 1.0 - smoothstep(0.07 - fy, 0.07 + fy, hy);
  float frame = max(post, max(cap, plinth));
  float bevel = exp(-abs(ed - 0.03) / max(fz * 1.5, 0.004)) * post;

  // unit stack, grouped in 4U blocks split into 1U, 2U or 4U servers
  float yy = hy - 0.07;
  float blk = floor(yy / (4.0 * UH));
  float yu = fract(yy / (4.0 * UH)) * 4.0;
  float li = floor(yu);
  float hm = h1(vec2(ci * 1.3 + blk, side * 5.1 + hc * 9.0));
  float st = li, hs = 1.0;
  if (hm < 0.22) { st = 0.0; hs = 4.0; }
  else if (hm < 0.5) { st = li < 2.0 ? 0.0 : 2.0; hs = 2.0; }
  else if (hm < 0.75) { st = li < 2.0 ? li : 2.0; hs = li < 2.0 ? 1.0 : 2.0; }
  float v = (yu - st) / hs;
  float sid = h1(vec2(ci * 2.9 + blk * 1.7 + st * 0.37, side + 3.0));
  float blank = step(sid, 0.1);

  // faceplate: dark brushed metal, seams between servers, drive bay slits
  float rowVis = 1.0 - smoothstep(0.15 * UH, 0.5 * UH, fy);
  float zVis = 1.0 - smoothstep(0.004, 0.012, fz);
  float sv = min(v, 1.0 - v) * hs * UH;
  float seam = (1.0 - smoothstep(0.0, 0.004 + fy, sv)) * rowVis;
  float brush = vn(vec2(cz * 60.0, (blk * 4.0 + st) * 3.1 + hy * 4.0));
  vec3 plate = c3 * c3 * (0.05 + 0.04 * brush) * (1.0 + 0.6 * sid);
  float bay = 0.0;
  if (hs > 1.5) {
    float bz = cz - 0.32;
    float bq = fract(bz / 0.034);
    bay = step(0.0, bz) * step(bz, 0.4) * smoothstep(0.1, 0.25, bq) * smoothstep(0.9, 0.75, bq);
    bay *= smoothstep(0.08, 0.2, v) * smoothstep(0.92, 0.8, v) * zVis * rowVis;
  }
  plate *= 1.0 + 0.9 * bay;
  // fine vent lines on the 1U servers
  float vent = (hs < 1.5) ? smoothstep(0.55, 0.9, sin(cz * 700.0)) * step(0.5, cz) * zVis * 0.6 : 0.0;
  plate *= 1.0 - 0.5 * vent;
  // light from the ceiling strips falls on the upper racks
  plate *= 0.9 + 2.2 * smoothstep(0.2, 1.0, hy / H);
  // server handles: short lit ticks at both ends of each faceplate
  float hd = min(abs(cz - 0.045), abs(cz - (cw - 0.045)));
  float handle = (1.0 - smoothstep(0.003, 0.003 + fz, hd)) * smoothstep(0.2, 0.3, v) * smoothstep(0.8, 0.7, v) * rowVis;
  plate += c0 * 0.035 * handle * (1.0 - blank);
  // top edge of each server catches the light
  float lip = exp(-(1.0 - v) * hs * UH / max(0.002, fy)) * rowVis;
  plate += mix(c3, c0, 0.5) * 0.05 * lip * (1.0 - blank);
  plate *= 1.0 - 0.85 * seam;
  plate *= 1.0 - 0.75 * blank;

  vec3 col = plate;

  // status lights: a row at the left of each server, bottom unit
  float dyL = (yu - st - 0.5) * UH;
  float sp = 0.021;
  float kk = clamp(floor((cz - 0.07) / sp + 0.5), 0.0, 4.0);
  float dzL = cz - 0.07 - kk * sp;
  float lh = h1(vec2(sid * 91.0 + kk * 1.7, ci * 0.31 + side));
  float on = step(lh, 0.78 * dens) * (1.0 - blank);
  float rate = 0.4 + 2.6 * fract(lh * 17.0);
  float act = smoothstep(-0.3, 0.6, sin(t * rate + lh * 40.0));
  act = mix(act, 1.0, step(0.6, fract(lh * 5.3)));        // steady power lights
  float tone = fract(lh * 31.0);
  vec3 lc = mix(c1 * 1.2, c2 * 1.4, smoothstep(0.3, 0.8, tone));
  lc = mix(lc, c0 * 1.3, step(0.85, tone));
  lc = mix(lc, mix(c3, c0, 0.4) * 1.6, step(tone, 0.08));  // rare fault light
  col += lc * on * act * lamp(dzL, dyL, fz, fy);

  // port lights: a pair of columns near the right of each server
  float pz = cz - (cw - 0.16);
  float k2 = clamp(floor(pz / 0.026 + 0.5), 0.0, 2.0);
  float dz2 = pz - k2 * 0.026;
  float u2 = clamp(floor(yu - st), 0.0, hs - 1.0);
  float dy2 = (yu - st - u2 - 0.5) * UH;
  float ph2 = h1(vec2(sid * 13.0 + k2 * 3.1 + u2, ci + side * 7.0));
  float on2 = step(ph2, 0.55 * dens) * (1.0 - blank);
  float act2 = 0.35 + 0.65 * vn(vec2(t * (1.0 + 3.0 * ph2), ph2 * 50.0));
  col += mix(c0, c1, ph2) * on2 * act2 * lamp(dz2, dy2, fz, fy) * 0.8;

  // cabinet types: cooling units with lit louvres, mesh doors
  if (hc < 0.12) {
    float lv = smoothstep(0.2, 0.9, sin(hy * 160.0)) * rowVis;
    vec3 coolC = heat(0.35 + 0.25 * vn(vec2(hy * 3.0, ci + t * 0.2)), c0, c1, c2, c3);
    col = c3 * c3 * 0.06 * (1.0 - 0.5 * lv) + coolC * 0.12 * lv * smoothstep(0.15, 0.6, hy / H);
    float strip = exp(-abs(cz - 0.4) / max(0.01, fz)) * step(abs(hy - 1.5), 0.08);
    col += c2 * strip * 0.25;
  } else if (hc < 0.24) {
    float mz = fract(cz / 0.012), my = fract(hy / 0.012);
    float hole = smoothstep(0.5, 0.3, length(vec2(mz, my) - 0.5));
    hole = mix(hole, 0.3, 1.0 - zVis);
    col *= 0.5 + 0.5 * hole;
    col += c3 * c3 * 0.03;
  }

  // the frame over everything
  vec3 fc = c3 * c3 * 0.04 + c0 * 0.05 * bevel;
  col = mix(col, fc, frame);

  // light from the sweeping scan plane catches plates and edges
  float dzs = z - scanZ;
  float sc = exp(-dzs * dzs * 1.2);
  float line = exp(-dzs * dzs / max(0.002, fz * fz * 4.0));
  col += heat(0.62, c0, c1, c2, c3) * sc * (0.11 + 0.5 * bevel + 0.3 * bay + 0.4 * lip) * (1.0 - 0.6 * blank);
  col += heat(0.95, c0, c1, c2, c3) * line * 0.5;
  return col;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res = max(u_resolution, vec2(1.0));
  float asp = res.x / res.y;
  vec2  p = (gl_FragCoord.xy - 0.5 * res) / (0.5 * res.y);
  float px = 2.0 / res.y;
  float t = u_time;
  float scan = clamp(u_scan, 0.0, 2.0);
  float dens = clamp(u_lights, 0.0, 1.5);
  float hzK = clamp(u_haze, 0.0, 2.0);

  // vanishing point a third across, a touch above centre
  vec2 vp = vec2(-0.32 * asp, 0.08);
  vec3 q = vec3(p - vp, FL);

  // the scan plane sweeps forward and back along the aisle
  float scanZ = 2.2 + 11.0 * (0.5 - 0.5 * cos(t * scan * 0.3 - 0.4));

  // nearest surface along the ray: rack rows, floor, ceiling, end wall
  float side = q.x < 0.0 ? -1.0 : 1.0;
  float kx = side * AW - CAMX;
  float zW = abs(q.x) > 1e-5 ? kx * FL / q.x : 1e4;
  float zF = q.y < -1e-5 ? FY * FL / q.y : 1e4;
  float zC = q.y > 1e-5 ? CY * FL / q.y : 1e4;
  float z = min(min(zW, zF), min(zC, ZE));

  vec3 col = vec3(0.0);
  if (z == zW) {
    float hy = zW / FL * q.y - FY;
    float fz = zW * zW / (abs(kx) * FL) * px;
    float fy = zW / FL * px;
    if (hy < RT - FY) {
      col = rack(zW, hy, side, fz, fy, t, dens, scanZ, c0, c1, c2, c3);
    } else {
      // wall above the racks: cable drops and a dark ledge
      float cb = vn(vec2(zW * 9.0, side));
      col = c3 * c3 * (0.03 + 0.03 * cb) * smoothstep(CY - FY, RT - FY, hy);
      col += heat(0.62, c0, c1, c2, c3) * exp(-(zW - scanZ) * (zW - scanZ) * 2.5) * 0.06;
    }
  } else if (z == zF) {
    // glossy raised floor: tile seams, perforated tiles, mirrored racks
    float x = zF / FL * q.x + CAMX;
    float fx = zF / FL * px;
    float fzF = zF * zF / (abs(FY) * FL) * px;
    vec2 tc = vec2(x, zF) / 0.6;
    vec2 tf = fract(tc);
    vec2 tdd = min(tf, 1.0 - tf) * 0.6;
    float seam = max(1.0 - smoothstep(0.0, 0.004 + fx, tdd.x), 1.0 - smoothstep(0.0, 0.004 + fzF, tdd.y));
    float th = h1(floor(tc) + vec2(3.0, 1.0));
    float perf = step(th, 0.3);
    vec2 pd = fract(vec2(x, zF) / 0.03) - 0.5;
    float dots = smoothstep(0.3, 0.15, length(pd)) * (1.0 - smoothstep(0.004, 0.012, max(fx, fzF)));
    col = c3 * c3 * (0.035 + 0.02 * th);
    // pools of light under the ceiling strips
    float pz = fract((zF - 0.7) / 3.4) - 0.5;
    col += mix(c0, c1, 0.5) * 0.09 * exp(-pz * pz * 9.0 - (x + 0.05) * (x + 0.05) * 1.5);
    col += c0 * 0.035 * perf * (0.3 + dots) * (0.6 + 0.4 * vn(vec2(zF * 0.7 - t * 0.3, x * 2.0)));
    // the reflection: the same ray continued below the floor, mirrored
    if (zW < 1e3 && zW < ZE) {
      float yW = zW / FL * q.y;
      float mh = FY - yW;
      if (mh < RT - FY) {
        float fzw = zW * zW / (abs(kx) * FL) * px;
        float fyw = zW / FL * px;
        float rough = 2.5 + 3.0 * th;
        vec3 refl = rack(zW, mh, side, fzw * rough, fyw * rough * 2.0, t, dens, scanZ, c0, c1, c2, c3);
        float gloss = (0.6 - 0.25 * perf) * (1.0 - seam);
        col += refl * gloss * exp(-mh * 0.7);
      }
    } else {
      col += c1 * 0.08 * exp(-abs(x - 0.0) * 2.5) * smoothstep(ZE * 0.5, ZE, zF);
    }
    col *= 1.0 - 0.7 * seam;
    // scan line where the plane crosses the floor
    float dzs = zF - scanZ;
    col += heat(0.9, c0, c1, c2, c3) * exp(-dzs * dzs / max(0.002, fzF * fzF * 4.0)) * 0.5;
    col += heat(0.6, c0, c1, c2, c3) * exp(-dzs * dzs * 1.2) * 0.12;
  } else if (z == zC) {
    // ceiling: two ladder trays with cable bundles, a run of light strips
    float x = zC / FL * q.x + CAMX;
    float fx = zC / FL * px;
    float fzC = zC * zC / (CY * FL) * px;
    col = c3 * c3 * 0.025;
    float tx = abs(x) - 0.85;
    float tray = step(abs(tx), 0.16);
    float rail = exp(-abs(abs(tx) - 0.16) / max(fx * 1.2, 0.006));
    float rung = smoothstep(0.75, 0.95, fract(zC / 0.3)) * (1.0 - smoothstep(0.02, 0.08, fzC));
    float cab = vn(vec2(x * 40.0, zC * 0.6)) * vn(vec2(x * 13.0, zC * 0.2 + 4.0));
    // cable bundles in the trays catch light from the strips, rungs show between
    float lit = 0.5 + 0.5 * cos(6.2832 * (zC - 0.7) / 3.4);
    col += mix(c3, c0, 0.35) * 0.09 * tray * (0.3 + 1.4 * cab) * (0.5 + 0.8 * lit) * (1.0 - 0.6 * rung);
    col += c0 * 0.09 * rail * (0.6 + 0.6 * lit);
    // light fixtures: louvred diffusers in a housing, a few dimmer than the rest
    float lz = fract(zC / 3.4);
    float fid = h1(vec2(floor(zC / 3.4), 9.0));
    float fx2 = abs(x + 0.05);
    float house = smoothstep(0.13 + fx, 0.13, fx2) * smoothstep(-0.02, 0.0, lz) * smoothstep(0.46, 0.44, lz);
    float fix = smoothstep(0.09 + fx, 0.09, fx2) * smoothstep(0.0, 0.02, lz) * smoothstep(0.42, 0.40, lz);
    float louv = mix(0.55 + 0.45 * smoothstep(0.15, 0.4, abs(fract(zC / 0.11) - 0.5)), 0.8, smoothstep(0.01, 0.04, fzC));
    louv *= 0.75 + 0.25 * smoothstep(0.0, 0.03, abs(x + 0.05));
    col = mix(col, c3 * c3 * 0.08, house);
    col += mix(c1, c2, 0.7) * fix * louv * (0.55 + 0.45 * fid) * (0.85 + 0.15 * vn(vec2(zC * 12.0, x * 30.0)));
    col += c1 * 0.06 * exp(-abs(x + 0.05) * 6.0) * smoothstep(0.6, 0.2, abs(lz - 0.2));
    float dzs = zC - scanZ;
    col += heat(0.9, c0, c1, c2, c3) * exp(-dzs * dzs / max(0.0012, fzC * fzC * 4.0)) * 0.3;
  } else {
    // end wall with a lit doorway
    float x = ZE / FL * q.x + CAMX;
    float y = ZE / FL * q.y;
    col = c3 * c3 * 0.06;
    float door = smoothstep(0.5, 0.45, abs(x + 0.1)) * smoothstep(FY + 2.2, FY + 2.1, y);
    col += heat(1.0, c0, c1, c2, c3) * door * 1.4;
  }

  // warm haze down the aisle, brightest toward the doorway
  float fog = 1.0 - exp(-z * 0.055 * hzK);
  float toVP = exp(-length((p - vp) * vec2(0.8, 1.3)) * 2.2);
  float drift = fbm(vec2(p.x * 1.5 - t * 0.04, p.y * 2.5 + t * 0.02));
  vec3 hazeC = c3 * c3 * 0.12 + heat(0.4 + 0.4 * toVP, c0, c1, c2, c3) * (0.06 + 0.45 * toVP) * (0.7 + 0.5 * drift);
  col = mix(col, hazeC, fog);

  // the scan plane itself glowing in the haze where the ray passes it
  if (z > scanZ) {
    float s = scanZ / FL;
    vec2 xy = vec2(s * q.x + CAMX, s * q.y);
    float inA = smoothstep(AW, AW - 0.2, abs(xy.x)) * smoothstep(FY, FY + 0.2, xy.y) * smoothstep(CY, CY - 0.4, xy.y);
    float wisp = 0.5 + 0.8 * fbm(xy * 2.0 + vec2(t * 0.05, -t * 0.08));
    col += heat(0.75, c0, c1, c2, c3) * inA * wisp * 0.11 * (0.3 + hzK) * exp(-scanZ * 0.04);
  }

  // dust motes drifting slowly through the light
  vec2 eq = vec2(p.x * 7.0 + 0.4 * sin(p.y * 3.0 + t * 0.2), p.y * 7.0 + t * 0.12);
  vec2 ef = fract(eq) - 0.5;
  float eh = h1(floor(eq));
  vec2 eo = ef - 0.3 * vec2(eh - 0.5, fract(eh * 7.0) - 0.5);
  float mote = step(0.92, eh) * exp(-dot(eo, eo) * 300.0);
  col += heat(0.8, c0, c1, c2, c3) * mote * 0.25 * (0.5 + 0.5 * sin(t * 0.7 + eh * 30.0));

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.9);
  gl_FragColor = vec4(col, 1.0);
}
