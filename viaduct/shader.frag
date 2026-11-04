// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A wet road runs under a long concrete viaduct into night fog. Portal frames of piers and
// hanging girders recede toward a vanishing point on the left third, each with a pair of
// lamps wrapped in halos and rings. The road below carries the lamps as long broken
// streaks. The camera drifts forward slowly, fog banks roll across, and now and then a
// pair of headlights approaches out of the haze, washing piers, deck and road in turn.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drive;  // forward drift speed of the camera along the road, world units per second (default 0.6)
uniform float u_fog;    // fog density, thicker fog swallows depth and widens halos (default 1.0)
uniform float u_glow;   // brightness of lamps, halos and the passing headlights (default 1.0)
uniform float u_wet;    // length and strength of the reflection streaks on the road (default 1.0)

const float HY = 0.12;    // horizon height on screen
const float VX = -0.13;   // vanishing point x
const float CAM = 1.2;    // eye height over the road
const float DECK = 5.0;   // underside of the viaduct deck
const float GIRD = 4.2;   // bottom of the cross girders
const float DW = 12.0;    // half width of the deck
const float SP = 4.4;     // spacing of portal frames
const float FD = 1.1;     // depth of a portal frame
const float PX = 5.3;     // inner face of the piers
const float RW = 4.6;     // half width of the carriageway

vec3 c0, c1, c2, c3;
vec3 lampC, coreC, haloC, headC;
float gPx = 800.0;
float gAdv = 0.0;
float gCz = 30.0;
float gEnv = 0.0;
float gCx = -1.15;

float hq(vec2 p) {
  return fract(sin(dot(p, vec2(47.31, 193.77))) * 15731.37);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hq(i), hq(i + vec2(1.0, 0.0)), f.x),
             mix(hq(i + vec2(0.0, 1.0)), hq(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.05 + vec2(3.7, 8.3);
    a *= 0.5;
  }
  return s;
}

// light pooled under each lamp station along the road
float lampPool(float wz) {
  float d = abs(fract((wz - 1.7) / SP + 0.5) - 0.5) * SP;
  return exp(-d * d * 0.22);
}

// wash from the approaching headlights, lying between the car and the eye
float carWash(float zz) {
  float d = gCz - zz - 3.0;
  return gEnv * exp(-d * d / 18.0);
}

// fog colour: blue-black air, a cooler horizon, and the far lamps glowing wine
vec3 fogCol(vec2 q) {
  float h = exp(-abs(q.y) * 4.5);
  vec3 f = vec3(0.010, 0.026, 0.046) + vec3(0.018, 0.056, 0.086) * h;
  vec2 g = vec2(q.x * 0.9, q.y * 1.7);
  f += c0 * 0.2 * exp(-dot(g, g) * 4.0);
  f += c2 * 0.045 * exp(-abs(q.y) * 6.0);
  return f;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec2 res = max(u_resolution, vec2(1.0));
  gPx = res.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec2 q = p - vec2(VX, HY);
  float T = u_time;
  float fogK = clamp(u_fog, 0.3, 2.5);
  float gain = clamp(u_glow, 0.2, 2.0);
  float wetP = clamp(u_wet, 0.1, 2.0);
  float dens = 0.085 * fogK;
  gAdv = T * clamp(u_drive, 0.0, 2.0);
  float cph = fract(T / 32.0 + 0.15);
  gCz = mix(38.0, 3.0, cph);
  gEnv = smoothstep(0.0, 0.1, cph) * (1.0 - smoothstep(0.78, 0.98, cph));
  lampC = mix(c1, vec3(1.0, 0.8, 0.78), 0.3);
  coreC = mix(vec3(1.0, 0.9, 0.86), c1, 0.3);
  haloC = mix(c1, c0, 0.25);
  headC = mix(c1, vec3(1.0, 0.93, 0.9), 0.6);

  vec3 fcol = fogCol(q);
  float bank = fbm(vec2(p.x * 1.3 - T * 0.03, p.y * 2.2 + 1.7));
  float fm = 0.65 + 0.9 * bank;

  vec3 col;
  float gRoad = 0.0;
  float puddleV = 0.5;

  if (q.y < 0.0) {
    // wet carriageway, kerbs and verge
    float dpp = max(-q.y, 1e-4);
    float zg = CAM / dpp;
    float X = q.x * zg;
    float ax = abs(X);
    float wz = zg + gAdv;
    float dxw = zg / gPx;
    float dzw = zg * zg / (CAM * gPx);
    float pool = lampPool(wz);
    float lampX = exp(-(ax - 3.1) * (ax - 3.1) * 0.12);
    float roadL = pool * lampX;
    float dc = zg - gCz + 4.0;
    float carR = gEnv * exp(-dc * dc / 18.0) * exp(-(X - gCx) * (X - gCx) * 0.2);
    float gt = mix(0.5, vn(vec2(X * 5.0, wz * 5.0)), exp(-zg * 0.09));
    float pud = smoothstep(0.42, 0.68, fbm(vec2(X * 0.32 + 4.0, wz * 0.11)));
    puddleV = pud;
    float onRoad = 1.0 - smoothstep(RW - dxw, RW + dxw, ax);
    float kerb = (1.0 - onRoad) * (1.0 - smoothstep(PX - dxw, PX + dxw, ax));
    vec3 asph = (vec3(0.006, 0.014, 0.024) + c3 * 0.05) * (0.7 + 0.7 * gt);
    vec3 verge = vec3(0.004, 0.010, 0.018) + c3 * 0.025;
    vec3 kerbC = vec3(0.010, 0.020, 0.030) + c3 * 0.12;
    vec3 rc = mix(verge, kerbC, kerb);
    rc = mix(rc, asph, onRoad);
    rc += lampC * (roadL * 0.22 * (0.4 + 0.9 * gt)) * (0.35 + 0.65 * onRoad);
    rc += headC * carR * 0.3 * (0.5 + 0.5 * onRoad);
    // wet sheen mirrors the bright air near the horizon
    rc += fcol * (0.45 + 0.55 * pud) * onRoad * 0.7 * exp(-dpp * 5.0) * (0.5 + 0.5 * wetP);
    // lane paint: dashed lane lines, solid edges, a double centre line
    float mph = mod(wz, 3.8);
    float dashM = smoothstep(0.0, dzw + 0.03, mph) * (1.0 - smoothstep(1.9, 1.9 + dzw + 0.03, mph));
    float l1 = (1.0 - smoothstep(0.075, 0.075 + dxw * 1.5, abs(ax - 2.3))) * dashM;
    float l2 = 1.0 - smoothstep(0.09, 0.09 + dxw * 1.5, abs(ax - 4.15));
    float l3 = 1.0 - smoothstep(0.04, 0.04 + dxw * 1.5, abs(ax - 0.12));
    float mk = clamp(l1 + l2 + l3, 0.0, 1.0) * onRoad * (0.5 + 0.7 * gt);
    vec3 markC = mix(c1, vec3(1.0, 0.9, 0.88), 0.55);
    rc += markC * mk * (0.04 + 0.9 * (roadL + 0.8 * carR));
    col = mix(fcol, rc, exp(-zg * dens * fm));
    gRoad = 1.0 - smoothstep(4.9, 5.6, ax);
  } else {
    // underside of the deck: ribs, joints and lamp light
    float zc = (DECK - CAM) / max(q.y, 1e-4);
    float X = q.x * zc;
    float ax = abs(X);
    float dxw = zc / gPx;
    float dzw = zc * zc / ((DECK - CAM) * gPx);
    float under = 1.0 - smoothstep(DW - dxw * 1.5, DW + dxw * 1.5, ax);
    float wz = zc + gAdv;
    float pool = lampPool(wz);
    float lampX = exp(-(ax - 3.1) * (ax - 3.1) * 0.35);
    float lightC = pool * lampX * 0.9 + carWash(zc) * exp(-(X - gCx) * (X - gCx) * 0.06) * 0.6;
    float rx = abs(fract(X / 3.0 + 0.5) - 0.5) * 3.0;
    float rib = 1.0 - smoothstep(0.09, 0.11 + dxw * 1.5, rx);
    float jz = abs(fract(wz / 2.2 + 0.5) - 0.5) * 2.2;
    float jnt = 1.0 - smoothstep(0.035, 0.04 + dzw * 1.5, jz);
    float tx = mix(0.5, vn(vec2(X * 3.0, wz * 3.0)), exp(-zc * 0.08));
    vec3 dk = (vec3(0.008, 0.016, 0.026) + c3 * 0.08) * (0.6 + 0.8 * tx) * (1.0 - 0.6 * rib - 0.5 * jnt);
    dk += lampC * lightC * 0.35 * (0.5 + 0.5 * tx) * (1.0 - 0.5 * jnt);
    dk += lampC * rib * lightC * 0.2;
    dk = mix(fcol, dk, exp(-zc * dens * fm));
    col = mix(fcol, dk, under);
  }
  col += fcol * max(bank - 0.45, 0.0) * 1.2;

  // portal frames, far to near
  float fr = mod(gAdv, SP);
  float n0 = floor(gAdv / SP);
  for (int j = 0; j < 7; j++) {
    float fj = float(j);
    float z = 2.0 + SP * (7.0 - fj) - fr;
    float id = n0 + 7.0 - fj;
    float fade = (1.0 - smoothstep(25.0, 32.0, z)) * smoothstep(2.0, 3.2, z);
    if (fade > 0.002) {
      float h1 = hq(vec2(id, 1.7));
      float h2 = hq(vec2(id, 5.3));
      float h3 = hq(vec2(id, 9.1));
      float Tz = exp(-z * dens * fm);
      float aa = 1.2 * z / gPx;
      float X = q.x * z;
      float Y = CAM + q.y * z;
      float ax = abs(X);
      float GY = GIRD + 0.2 * (h1 - 0.5);
      float pw = 1.2 + 0.7 * h2;
      float lv = 0.6 + 0.6 * h3;
      // light on this frame from the lamps one bay nearer, and from the headlights
      float lampLit = exp(-(ax - 3.1) * (ax - 3.1) * 0.14) * exp(-(Y - 3.7) * (Y - 3.7) * 0.3) * lv
                    + carWash(z) * 0.5 * exp(-(X - gCx) * (X - gCx) * 0.08) * exp(-(Y - 0.8) * (Y - 0.8) * 0.2);
      float tex = mix(0.5, vn(vec2(X * 4.0, Y * 0.7 + id * 1.3)), exp(-z * 0.07));
      float stain = smoothstep(0.5, 0.85, vn(vec2(X * 1.7 + id, Y * 0.12)));
      vec3 conc = (vec3(0.012, 0.022, 0.034) + c3 * 0.16) * (0.65 + 0.7 * tex) * (1.0 - 0.45 * stain);

      // cross girder, front face
      float cg = smoothstep(GY - aa, GY + aa, Y) * (1.0 - smoothstep(DECK - aa, DECK + aa, Y)) * (1.0 - smoothstep(DW - aa, DW + aa, ax));
      if (cg > 0.002) {
        vec3 gcol = conc + lampC * lampLit * 0.3 * (0.6 + 0.6 * tex);
        float eG = exp(-(Y - GY) * (Y - GY) / (3.0 * aa * aa));
        gcol += lampC * eG * lampLit * 0.5 + vec3(0.0, 0.02, 0.04) * eG;
        col = mix(col, mix(fcol, gcol, Tz), cg * fade);
      }

      // underside of the girder, seen from the road
      if (q.y > 0.0) {
        float zq = (GY - CAM) / q.y;
        float ez = min(1.2 * zq * zq / ((GY - CAM) * gPx), 0.3);
        float cu = smoothstep(z - ez, z + ez, zq) * (1.0 - smoothstep(z + FD - ez, z + FD + ez, zq));
        float Xq = q.x * zq;
        cu *= 1.0 - smoothstep(DW - 0.05, DW + 0.05, abs(Xq));
        if (cu > 0.002) {
          float tq = vn(vec2(Xq * 3.0, zq * 3.0 + id));
          float lampU = exp(-(abs(Xq) - 3.1) * (abs(Xq) - 3.1) * 0.5) * (0.5 + 0.8 * exp(-(zq - z) * 1.3)) * lv;
          vec3 uc = (vec3(0.010, 0.018, 0.028) + c3 * 0.10) * (0.6 + 0.8 * tq) + lampC * lampU * 0.3;
          uc = mix(fcol, uc, exp(-zq * dens * fm));
          col = mix(col, uc, cu * fade);
        }
      }

      // pier, front face with chamfered edges and formwork joints
      float cpf = smoothstep(PX - aa, PX + aa, ax) * (1.0 - smoothstep(PX + pw - aa, PX + pw + aa, ax))
                * smoothstep(-aa, aa, Y) * (1.0 - smoothstep(DECK - aa, DECK + aa, Y));
      if (cpf > 0.002) {
        float ex = min(ax - PX, PX + pw - ax);
        float bev = smoothstep(0.0, 0.16, ex);
        float jy = abs(fract(Y / 1.25 + h2 + 0.5) - 0.5) * 1.25;
        float joint = 1.0 - smoothstep(0.015, 0.015 + aa * 1.2, jy);
        vec3 pcol = conc * (1.0 - 0.5 * joint) * (0.5 + 0.5 * bev) * (0.5 + 0.5 * smoothstep(0.0, 1.2, Y));
        pcol += lampC * lampLit * 0.35 * bev * (0.6 + 0.6 * tex) + lampC * (1.0 - bev) * lampLit * 0.25;
        col = mix(col, mix(fcol, pcol, Tz), cpf * fade);
      }

      // pier, inner side face receding from the road
      float axs = abs(q.x);
      float zz = PX / max(axs, 1e-3);
      float ae = 1.2 / gPx;
      float lo = PX / (z + FD);
      float hi = PX / z;
      float cx2 = smoothstep(lo - ae, lo + ae, axs) * (1.0 - smoothstep(hi - ae, hi + ae, axs));
      if (cx2 > 0.002) {
        float Yp = CAM + q.y * zz;
        float ey = 1.2 * zz / gPx;
        float cy2 = smoothstep(-ey, ey, Yp) * (1.0 - smoothstep(GY - ey, GY + ey, Yp));
        float dzl = zz - z + 0.3;
        float sl = exp(-dzl * dzl * 0.5) * exp(-(Yp - 3.7) * (Yp - 3.7) * 0.15) * lv * 0.55
                 + carWash(zz) * 0.6 * exp(-(Yp - 0.8) * (Yp - 0.8) * 0.25);
        float t2 = vn(vec2(zz * 3.0 + id, Yp * 0.6));
        vec3 scol = conc * 0.6 * (0.7 + 0.6 * t2) + lampC * sl * 0.5 * (0.6 + 0.6 * t2);
        col = mix(col, mix(fcol, scol, exp(-zz * dens * fm)), cx2 * cy2 * fade);
      }

      // lamps on this frame, with halos, rings and wet-road streaks
      float rip = vn(vec2(p.y * 30.0 + id, T * 0.1));
      for (int s = 0; s < 2; s++) {
        float sg = float(s) * 2.0 - 1.0;
        float Xl = sg * (2.9 + 0.45 * hq(vec2(id, 3.3 + sg)));
        float Yl = 3.55 + 0.3 * hq(vec2(id, 7.7 + sg));
        float zl = z - 0.3;
        vec2 lp = vec2(VX + Xl / zl, HY + (Yl - CAM) / zl);
        float inten = (0.7 + 0.5 * hq(vec2(id, sg * 2.1))) * (0.92 + 0.08 * sin(T * 0.8 + id * 4.0 + sg));
        inten *= 1.0 - 0.55 * step(0.84, hq(vec2(id, sg * 6.1 + 1.0)));
        float att = exp(-zl * dens * 0.3) * fade * gain * inten;
        vec2 dd = p - lp;
        vec2 dcore = dd * vec2(1.0, 2.4);
        float sL = 0.22 / zl + 0.002;
        float core = exp(-dot(dcore, dcore) / (sL * sL));
        float rh = (0.5 + 0.5 * fogK) / zl + 0.004;
        float halo = 1.0 / (1.0 + dot(dd, dd) / (rh * rh));
        halo *= halo;
        float rg = (length(dd) - 1.35 * rh) / (0.22 * rh);
        float ring = exp(-rg * rg);
        col += (coreC * core * 1.1 + haloC * halo * 0.3 + c2 * ring * 0.06 * (0.3 + fogK)) * att;
        if (gRoad > 0.001) {
          float ry = HY - (Yl + CAM) / zl;
          float gy = HY - CAM / zl;
          float sY = (Yl / zl) * 0.3 * wetP + 0.012;
          float dyr = p.y - ry;
          float sx = 0.2 / zl + 0.003;
          float dxr = dd.x + (rip - 0.5) * sx * 1.6;
          float brk = 0.55 + 0.9 * vn(vec2(p.y * 60.0 + id * 7.0, T * 0.15 + sg * 3.0));
          float stk = exp(-dyr * dyr / (2.0 * sY * sY)) * exp(-dxr * dxr / (2.0 * sx * sx)) * brk;
          stk += 0.25 * exp(-dyr * dyr / (5.0 * sY * sY)) * exp(-dxr * dxr / (18.0 * sx * sx));
          stk *= gRoad * (1.0 - smoothstep(gy - 0.012, gy + 0.004, p.y)) * (0.5 + 0.5 * puddleV + 0.2);
          col += lampC * stk * 0.7 * att * (0.5 + 0.5 * wetP);
        }
      }
    }
  }

  // approaching headlights: soft dark body, twin cores, halos, road reflection
  if (gEnv > 0.003) {
    float zc = gCz;
    float Tc = exp(-zc * dens * fm);
    vec2 cc = vec2(VX + gCx / zc, HY + (0.75 - CAM) / zc);
    float lx = (p.x - cc.x) * zc;
    float ly = (p.y - cc.y) * zc;
    float roof = smoothstep(0.1, 0.65, ly);
    float bwid = mix(0.95, 0.62, roof);
    vec2 qd = vec2(abs(lx) - bwid + 0.25, abs(ly) - 0.65 + 0.25);
    float sd = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0) - 0.25;
    float soft = 0.12 + 0.03 * zc * dens;
    float cover = 1.0 - smoothstep(-soft, soft, sd);
    col = mix(col, col * 0.2 + vec3(0.0, 0.004, 0.008), cover * gEnv * Tc * 0.9);
    float att0 = exp(-zc * dens * 0.25) * gEnv * gain;
    for (int s = 0; s < 2; s++) {
      float sg = float(s) * 2.0 - 1.0;
      vec2 hp = vec2(VX + (gCx + sg * 0.62) / zc, HY + (0.72 - CAM) / zc);
      vec2 dd = p - hp;
      float sL = 0.13 / zc + 0.0015;
      float core = exp(-dot(dd, dd) / (sL * sL));
      float rh = (0.35 + 0.35 * fogK) / zc + 0.004;
      float halo = 1.0 / (1.0 + dot(dd, dd) / (rh * rh));
      halo *= halo;
      col += (headC * core * 1.4 + haloC * halo * 0.45) * att0;
      if (gRoad > 0.001) {
        float ry = HY - (0.72 + CAM) / zc;
        float gy = HY - CAM / zc;
        float sY = (0.72 / zc) * 0.5 * wetP + 0.012;
        float dyr = p.y - ry;
        float sx = 0.14 / zc + 0.003;
        float dxr = dd.x + (vn(vec2(p.y * 34.0, T * 0.1 + sg)) - 0.5) * sx * 1.6;
        float brk = 0.55 + 0.9 * vn(vec2(p.y * 60.0 + 3.0, T * 0.2 + sg * 5.0));
        float stk = exp(-dyr * dyr / (2.0 * sY * sY)) * exp(-dxr * dxr / (2.0 * sx * sx)) * brk;
        stk *= gRoad * (1.0 - smoothstep(gy - 0.012, gy + 0.004, p.y));
        col += headC * stk * 0.8 * att0 * (0.5 + 0.5 * wetP);
      }
    }
    vec2 dm = (p - vec2(VX + gCx / zc, HY + (0.9 - CAM) / zc)) * vec2(0.7, 1.0);
    float rb = (2.0 + 1.2 * fogK) / zc;
    float big = 1.0 / (1.0 + dot(dm, dm) / (rb * rb));
    col += mix(c1, c0, 0.4) * big * big * 0.2 * att0;
  }

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
