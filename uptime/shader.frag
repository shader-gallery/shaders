// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Uptime - a low eye standing in the cold aisle of a data hall at night.
// Rows of steel racks recede on both sides, each filled with servers, drive
// bays and blanking panels and pricked with thousands of status lights. Cable
// trays hang above the racks, cross aisles break the rows, the polished floor
// tiles mirror the lights, and a slow band of cold light scans away down the
// aisle through the haze while the eye drifts forward.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scan;       // brightness of the light band scanning down the aisle (default 1)
uniform float u_scanSpeed;  // travel speed of the scan band (default 1)
uniform float u_haze;       // density of the cold haze filling the hall (default 1)
uniform float u_activity;   // how busy the status lights are: blink rate and spread (default 1)

const float CAM = 1.45;   // eye height above the floor, metres
const float RH = 2.05;    // rack height
const float CEIL = 1.8;   // ceiling height above the eye
const float TY = 0.95;    // cable tray height above the eye
const float W = 1.2;      // half width of the aisle
const float CX = -0.32;   // the eye stands left of the aisle centre
const float FOC = 0.8;    // focal length in frame units
const float VX = -0.24;   // vanishing point, left of the frame centre
const float HOR = 0.04;   // horizon height in frame units
const float CW = 0.6;     // cabinet width
const float NCAB = 14.0;  // cabinets per row
const float ROWP = 9.6;   // row length plus its cross aisle
const float UH = 0.0445;  // one rack unit
const float SP = 26.0;    // spacing of the scan bands along the aisle
const float SW = 2.4;     // half thickness of a scan band
const vec3 AMBER = vec3(1.0, 0.5, 0.14);

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(27.619, 157.33))) * 43121.77);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vn(p);
    p = mat2(0.82, 0.57, -0.57, 0.82) * p * 2.07 + vec2(5.3, 1.7);
    a *= 0.5;
  }
  return s;
}

float erfa(float x) {
  return sign(x) * sqrt(1.0 - exp(-x * x * 1.2732));
}

// one point light seen through a pixel footprint fp: energy is kept as it shrinks
float led(vec2 d, vec2 fp, float r0) {
  vec2 r = max(vec2(r0), fp * 0.6);
  vec2 q = d / r;
  return (r0 * r0) / (r.x * r.y) * exp(-dot(q, q));
}

// the scan light reaching world depth z
float scanAt(float z, float t, float v) {
  float x = (fract((z - t * v) / SP + 0.5) - 0.5) * SP;
  return exp(-x * x / (SW * SW));
}

vec3 ledTint(float k, vec3 c0, vec3 c1, vec3 c2) {
  return k < 0.5 ? c1 : (k < 0.78 ? c2 * 1.1 : (k < 0.94 ? c0 : AMBER));
}

// the front of a rack row: z along the row, h height above the floor
vec3 rackFace(float z, float h, float side, vec2 fp, float t, float act, vec3 lit,
              vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 ember) {
  float rz = mod(z, ROWP);
  float row = floor(z / ROWP);
  float ci = floor(rz / CW);
  float f = rz / CW - ci;
  float cab = ci + row * 17.0 + side * 431.0;
  float cabH = hs(vec2(cab, 7.3));
  // steel frame: posts, top rail and plinth
  float fr = min(f, 1.0 - f) * CW;
  float post = 1.0 - smoothstep(0.028, 0.028 + fp.x, fr);
  float edge = exp(-abs(fr - 0.028) / max(0.004, fp.x));
  float top = smoothstep(RH - 0.09 - fp.y, RH - 0.09, h);
  float plinth = 1.0 - smoothstep(0.1, 0.1 + fp.y, h);
  float frame = max(post, max(top, plinth));
  vec3 col = ember * 0.4;
  vec3 em = vec3(0.0);
  float uy = (h - 0.12) / UH;
  float blk = floor(uy / 4.0);
  float fu = uy - blk * 4.0;
  float bh = hs(vec2(cab, blk + 0.5));
  float d = bh < 0.2 ? 4.0 : (bh < 0.5 ? 2.0 : (bh < 0.93 ? 1.0 : 0.0));
  // some cabinets are only filled part way up
  if (cabH < 0.12 && blk > 5.0 + floor(cabH * 40.0)) d = 0.0;
  if (d > 0.0) {
    float dv = floor(fu / d);
    float fy = (fu - dv * d) / d;
    vec2 did = vec2(cab * 3.1 + blk * 0.7, dv + blk * 5.0);
    float dh = hs(did);
    float dm = d * UH;
    float sy = min(fy, 1.0 - fy) * dm;
    float seam = 1.0 - smoothstep(0.0012, 0.0012 + fp.y, sy);
    float tone = 0.6 + 0.8 * dh;
    // blued steel, washed by the glow of its neighbours in the cabinet
    float wash = 0.5 + 0.5 * sin(cab * 1.7 + h * 2.3 + 0.4 * sin(t * 0.3 + cab));
    vec3 bez = ember * 0.35 * tone + mix(c3, c0, dh) * (0.05 + 0.06 * wash) * tone;
    float sheen = 0.2 + 0.25 * hs(did + 2.2);
    if (d < 1.5) {
      // vent slats across the right of a 1U face
      float sl = 0.5 + 0.5 * sin(fy * 6.2832 * 4.0);
      sl = mix(sl, 0.5, smoothstep(0.003, 0.009, fp.y));
      float ven = step(0.36, f) * step(f, 0.9);
      bez *= 1.0 - 0.55 * ven * sl;
      sheen *= 1.0 + 0.9 * ven * (1.0 - sl);
      // network ports at the right end, a link light over each
      float px = (f - 0.62) / 0.26 * 8.0;
      float pi = floor(px);
      float pf = px - pi;
      float inp = step(0.62, f) * step(f, 0.88);
      float hp = hs(did + pi * 3.17 + 4.4);
      float link = step(hp, 0.35 + 0.35 * min(act, 1.5));
      float blinkP = 0.55 + 0.45 * smoothstep(-0.3, 0.8, sin(t * (0.6 + 1.6 * hp) * act + hp * 70.0));
      vec3 pc = hp < 0.06 ? AMBER : mix(c1, c2, step(0.25, hp));
      em += pc * link * blinkP * inp * 3.0
          * led(vec2((pf - 0.5) * 0.26 * CW / 8.0, (fy - 0.78) * dm), fp, 0.0018);
      bez *= 1.0 - 0.5 * inp * smoothstep(0.35, 0.2, abs(pf - 0.5)) * smoothstep(0.7, 0.4, fy) * (1.0 - smoothstep(0.003, 0.008, fp.x));
    } else if (d < 3.0) {
      // ten drive bays, each with its own activity light
      float bx = (f - 0.2) / 0.72 * 10.0;
      float bi = floor(bx);
      float bf = bx - bi;
      float inb = step(0.2, f) * step(f, 0.92);
      float bay = 0.72 * CW / 10.0;
      float bl = 1.0 - smoothstep(0.0015, 0.0015 + fp.x, min(bf, 1.0 - bf) * bay);
      bez *= 1.0 - 0.6 * bl * inb;
      float hk = hs(did + bi * 1.37 + 0.9);
      float on = smoothstep(0.1, 0.9, sin(t * (0.5 + 1.3 * hk) * act + hk * 50.0));
      float full = step(hk, 0.55 + 0.3 * min(act, 1.0));
      em += ledTint(fract(hk * 7.3), c0, c1, c2) * on * full * inb * 3.5
          * led(vec2((bf - 0.5) * bay, (fy - 0.2) * dm), fp, 0.0022);
    } else {
      // perforated front grille of a storage shelf
      vec2 g = vec2(f * CW, fy * dm) / 0.007;
      vec2 gf = fract(g) - 0.5;
      float hole = smoothstep(0.32, 0.22, length(gf));
      hole = mix(hole, 0.3, smoothstep(0.003, 0.01, max(fp.x, fp.y)));
      float ing = step(0.18, f) * step(f, 0.93) * step(0.12, fy) * step(fy, 0.88);
      bez *= 1.0 - 0.6 * hole * ing;
      sheen *= 1.0 - 0.4 * hole * ing;
    }
    // status lights at the left of each device
    for (int k = 0; k < 3; k++) {
      float kk = float(k);
      float hk = hs(did + kk * 2.71 + 0.3);
      float ly = d < 1.5 ? 0.5 : 0.82;
      vec2 dl = vec2((f - 0.07 - 0.03 * kk) * CW, (fy - ly) * dm);
      float on = k == 0 ? 1.0 : smoothstep(-0.2, 0.7, sin(t * (0.3 + 1.0 * hk) * act + hk * 40.0));
      on *= step(hk, 0.45 + 0.4 * min(act, 1.5));
      vec3 lc = ledTint(fract(hk * 13.1 + dh), c0, c1, c2);
      em += lc * on * (5.0 * led(dl, fp, 0.0026) + 0.14 * led(dl, fp, 0.02));
    }
    bez += lit * sheen * tone * 0.75;
    col = mix(bez, ember * 0.15, seam);
  } else {
    // ribbed blanking panel
    float rib = 0.5 + 0.5 * sin(uy * 6.2832);
    rib = mix(rib, 0.5, smoothstep(0.01, 0.03, fp.y));
    col = ember * (0.25 + 0.2 * rib) + c3 * 0.012 * rib + lit * 0.1 * rib;
  }
  vec3 fc = ember * 0.3 + lit * 0.12 + (lit * 0.6 + c0 * 0.02) * edge * (1.0 - plinth);
  return mix(col + em, fc, frame);
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
  float scan = clamp(u_scan, 0.0, 3.0);
  float sv = 3.0 * clamp(u_scanSpeed, 0.0, 3.0);
  float haze = clamp(u_haze, 0.05, 3.0);
  float act = clamp(u_activity, 0.0, 3.0);
  // deep ember-dark shadow of the steel, a warm counter to the cold light
  vec3 ember = vec3(0.05, 0.013, 0.008);
  vec3 scol = mix(c2, c1, 0.3);

  float camZ = t * 0.22;
  vec2 u2 = uv - vec2(VX + 0.006 * sin(t * 0.11), HOR + 0.004 * sin(t * 0.17 + 1.0));
  vec3 rd = vec3(u2 / FOC, 1.0);
  float pa = 1.0 / (FOC * mn);
  float side = rd.x > 0.0 ? 1.0 : -1.0;
  float dx = abs(side * W - CX);

  // rack faces, or the far side of a cross aisle
  float tw = 1e5, kind = 0.0;
  float twR = 1e5;
  if (abs(rd.x) > 1e-4) {
    float tt = dx / abs(rd.x);
    float rz = mod(camZ + tt, ROWP);
    if (rz < NCAB * CW) {
      twR = tt;
      if (rd.y * tt + CAM < RH) { tw = tt; kind = 1.0; }
    } else {
      // the end panel of the next row across the cross aisle
      float te = camZ + tt - rz + ROWP - camZ;
      float xe = abs(CX + rd.x * te);
      if (xe < W + 1.1 && rd.y * te + CAM < RH) { tw = te; kind = 2.0; }
      else if (rd.y * te + CAM < RH) { tw = te + 18.0; kind = 3.0; }
    }
  }
  float tf = rd.y < -1e-4 ? CAM / (-rd.y) : 1e5;
  float tcl = rd.y > 1e-4 ? CEIL / rd.y : 1e5;
  float ttr = rd.y > 1e-4 ? TY / rd.y : 1e5;
  float xtr = abs(CX + rd.x * ttr);
  if (xtr < W - 0.28 || xtr > W + 0.4) ttr = 1e5;

  float tc = min(min(tw, tf), min(tcl, ttr));
  tc = min(tc, 140.0);
  vec3 p = rd * tc + vec3(CX, 0.0, camZ);
  vec3 lit = scol * scanAt(p.z, t, sv) * scan;
  vec3 col;
  if (tc == tf) {
    // raised floor tiles, polished, a few perforated
    vec2 fp = vec2(tc * pa, tc * tc * pa / CAM);
    vec2 g = vec2(p.x + W, p.z) / 0.6;
    vec2 id = floor(g);
    vec2 fg = fract(g);
    float th = hs(id + 3.3);
    float gr = min(min(fg.x, 1.0 - fg.x) * 0.6 / max(fp.x, 0.002), min(fg.y, 1.0 - fg.y) * 0.6 / max(fp.y, 0.002));
    float grout = 1.0 - smoothstep(0.4, 1.4, gr);
    grout *= 1.0 - smoothstep(0.02, 0.08, max(fp.x, fp.y));
    float perf = step(th, 0.3) * step(abs(p.x), W - 0.05);
    vec2 hg = fract(g * 18.0) - 0.5;
    float hole = smoothstep(0.3, 0.18, length(hg));
    hole = mix(hole, 0.3, smoothstep(0.006, 0.02, max(fp.x, fp.y))) * perf;
    float wear = 0.7 + 0.3 * vn(p.xz * 3.0) + 0.15 * th;
    col = ember * 0.4 * wear + c3 * 0.012 * wear;
    // ceiling strips pool their light down the middle
    float strip = smoothstep(0.35, 0.0, abs(fract(p.z / 3.0) - 0.3)) * exp(-p.x * p.x * 1.2);
    col += mix(c3, c0, 0.4) * 0.12 * strip;
    // spill from the lights along each rack row
    col += mix(c3, c1, 0.4) * 0.05 * exp(-(W - abs(p.x)) * 2.5);
    col += lit * 0.3 * wear;
    // the polished tiles mirror the racks
    if (twR < 1e4 && twR > tc) {
      float hr = -rd.y * (twR - tc);
      if (hr < RH) {
        vec2 rfp = vec2(twR * twR * pa / dx, twR * pa) * 3.0 + vec2(0.006 + 0.01 * vn(p.xz * 5.0));
        vec3 rl = scol * scanAt(camZ + twR, t, sv) * scan;
        vec3 rc = rackFace(camZ + twR, hr, side, rfp, t, act, rl, c0, c1, c2, c3, ember);
        float fres = 0.18 + 0.3 * smoothstep(0.0, 1.0, (twR - tc) / max(twR, 1e-3));
        col += rc * fres * 1.6 * wear * (1.0 - 0.6 * hole) * (1.0 - grout);
      }
    }
    col *= 1.0 - 0.8 * grout;
    col *= 1.0 - 0.6 * hole;
  } else if (tc == tw && kind == 1.0) {
    vec2 fp = vec2(tc * tc * pa / dx, tc * pa);
    col = rackFace(p.z, p.y + CAM, side, fp, t, act, lit, c0, c1, c2, c3, ember);
  } else if (tc == tw && kind == 2.0) {
    // end panel of the next row: plain steel with a lit edge strip
    float xe = abs(p.x) - W;
    float fpx = tc * pa;
    float seamL = 1.0 - smoothstep(0.003, 0.003 + fpx, abs(fract(xe / 0.55) - 0.5) * 0.55 - 0.27);
    col = ember * (0.5 + 0.3 * vn(vec2(xe * 6.0, p.y * 4.0)));
    col += lit * 0.3;
    float strip = exp(-abs(xe - 0.06) / max(0.008, fpx)) * step(p.y + CAM, RH - 0.1);
    col += mix(c0, c2, 0.4) * strip * 0.6;
    col *= 1.0 - 0.3 * seamL;
  } else if (tc == tw) {
    // looking along a cross aisle into the next hall
    float sp = fbm3(vec2(p.y * 6.0, uv.x * 30.0));
    col = mix(c3, c0, 0.4) * 0.12 + c1 * 0.1 * smoothstep(0.6, 0.8, sp);
  } else if (tc == ttr) {
    // cable tray: a steel ladder piled with bundles
    float xt = abs(p.x) - (W - 0.28);
    float fpz = tc * tc * pa / TY;
    float rung = 1.0 - smoothstep(0.01, 0.01 + fpz, abs(fract(p.z / 0.3) - 0.5) * 0.3 - 0.13);
    float rail = 1.0 - smoothstep(0.015, 0.03, min(xt, 0.68 - xt));
    float bund = smoothstep(0.35, 0.6, vn(vec2(xt * 9.0, p.z * 0.4))) ;
    float str = mix(0.5 + 0.5 * sin(xt * 260.0 + 3.0 * vn(vec2(xt * 20.0, p.z))), 0.5, smoothstep(0.004, 0.02, tc * pa));
    col = ember * (0.35 + 0.4 * bund * str);
    float up = 0.5 + 0.5 * sin(p.z * 0.7 + cos(p.z * 0.23) * 2.0);
    col += mix(c3, c1, 0.3) * (0.05 + 0.06 * up) * (0.4 + bund);
    col += mix(c0, c2, 0.5) * 0.12 * rail * up;
    col += lit * (0.3 + 0.5 * max(rail, rung * (1.0 - bund)));
  } else {
    // dark ceiling grid with dimmed light strips
    float fpz = tc * tc * pa / CEIL;
    vec2 cg = fract(vec2(p.x, p.z) / 1.2);
    float gl = 1.0 - smoothstep(0.004, 0.004 + fpz, min(min(cg.x, 1.0 - cg.x), min(cg.y, 1.0 - cg.y)) * 1.2);
    col = ember * 0.35 * (1.0 - 0.5 * gl) + lit * 0.12;
    float sx = smoothstep(0.09, 0.06, abs(p.x));
    float sz = smoothstep(0.35, 0.3 - min(fpz, 0.3), abs(fract(p.z / 3.0) - 0.3));
    col += mix(c0, c2, 0.6) * sx * sz * 0.9;
    // the fixtures wash the ceiling around them
    float pool = exp(-p.x * p.x * 2.5) * (0.5 + 0.5 * smoothstep(0.9, 0.0, abs(fract(p.z / 3.0) - 0.3)));
    col += mix(c3, c0, 0.5) * 0.1 * pool + c3 * 0.015;
  }

  // cold haze, thicker and bluer toward the far end
  float hn = fbm3(vec2(uv.x * 2.5 + t * 0.03, uv.y * 4.0 - t * 0.02));
  float dens = 0.03 * haze;
  float fa = 1.0 - exp(-tc * dens);
  vec3 fogc = c3 * 0.12 + mix(c0, c1, 0.4) * 0.22 * smoothstep(8.0, 70.0, tc);
  fogc *= 0.7 + 0.6 * hn;
  col = mix(col, fogc, fa);

  // the scan band lights the haze it passes through
  float acc = 0.0;
  float n0 = floor((camZ - t * sv) / SP) + 1.0;
  for (int k = -1; k < 5; k++) {
    float rel = t * sv + (n0 + float(k)) * SP - camZ;
    float seg = erfa((tc - rel) / SW) - erfa(-rel / SW);
    // the band fades as it passes the eye so it never fogs the whole frame
    acc += seg * exp(-max(rel, 0.0) * dens * 0.8) * smoothstep(130.0, 90.0, rel) * smoothstep(1.0, 12.0, rel);
  }
  col += scol * acc * 0.5 * SW * 0.886 * 0.3 * scan * haze * (0.6 + 0.8 * hn);

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.7);
  gl_FragColor = vec4(col, 1.0);
}
