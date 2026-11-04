// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Tarmac - a straight night road running to a pre-dawn horizon. Lamp masts with ringed
// shafts and curved arms march away in alternating pairs, each hanging a cone of dusty
// light, a pool on the asphalt and a smeared glint in the wet wheel tracks. Three hill
// ridges with a few village lights sit under banded cloud lit from below. A refraction
// field of rising heat wobbles everything near the horizon while a mirage of the dawn
// glow floats on the road, and a few cars drift along the lanes.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_heat;   // strength of the rising heat refraction near the horizon (default 1)
uniform float u_drive;  // how fast the road and lamps stream toward the viewer (default 0.5)
uniform float u_lamps;  // brightness of the lamps, haze cones and road glints (default 1)
uniform float u_dawn;   // strength of the pre-dawn glow and cloud light on the horizon (default 1)

const float S  = 0.25;   // screen scale of one eye-height at depth 1
const float HZ = 0.36;   // horizon height
const float VX = 0.64;   // vanishing point, off centre
const float SP = 4.4;    // spacing of the lamp masts

vec3 gC0, gC1, gC2, gC3;
float gAsp, gT, gPx, gDawn, gLamp;

float sq(float x) { return x * x; }
float h1(float n) { return fract(sin(n * 29.173 + 2.1) * 18341.37); }
float hs(vec2 p) { return fract(sin(dot(p, vec2(19.341, 53.917))) * 24731.63); }

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vn1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h1(i), h1(i + 1.0), f);
}
float rdg(float x) {
  return 0.55 * vn1(x) + 0.30 * vn1(x * 2.3 + 11.0) + 0.15 * vn1(x * 5.1 + 4.0);
}

float segd(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * k);
}

// pre-dawn sky: glow low on the right third, banded cloud lit from below, sparse stars
vec3 sky(vec2 p) {
  float sh = max(p.y - HZ, 0.0);
  float ax = (p.x - VX) * gAsp;
  float cx = p.x * gAsp;
  float r = length(vec2(ax * 0.7, sh * 3.0));
  float core = exp(-r * 5.0);
  float wide = exp(-r * 1.7);
  vec3 col = gC3 * 0.03 * (0.4 + 0.6 * smoothstep(0.0, 0.6, sh)) + gC2 * 0.025 * exp(-sh * 4.0);
  col += (gC1 * core * 0.95 + gC0 * wide * 0.38) * gDawn;
  float dA = vn(vec2(cx * 1.5 + gT * 0.012, sh * 20.0)) * 0.6 + vn(vec2(cx * 4.0 - gT * 0.02, sh * 46.0 + 3.0)) * 0.4;
  float dB = vn(vec2(cx * 1.5 + gT * 0.012, sh * 20.0 - 0.4)) * 0.6 + vn(vec2(cx * 4.0 - gT * 0.02, sh * 46.0 + 2.2)) * 0.4;
  float cl = smoothstep(0.5, 0.78, dA);
  float clB = smoothstep(0.5, 0.78, dB);
  float rim = max(cl - clB, 0.0);
  float mask = smoothstep(0.0, 0.03, sh) * exp(-sh * 2.6);
  col *= 1.0 - 0.6 * cl * mask;
  col += mix(gC0, gC2, smoothstep(0.0, 0.25, sh)) * rim * mask * (core * 0.9 + wide * 0.6) * gDawn * 1.3;
  vec2 sg = vec2(cx, p.y) * 70.0;
  vec2 si = floor(sg);
  float hh = hs(si + 17.0);
  float st = step(0.975, hh) * (1.0 - smoothstep(0.05, 0.3, length(fract(sg) - 0.5 + (hs(si + 3.0) - 0.5) * 0.5)));
  col += st * (0.5 + 0.5 * sin(gT * 0.8 + hh * 50.0)) * smoothstep(0.1, 0.45, sh) * (1.0 - cl) * 0.5 * mix(vec3(1.0), gC1, 0.4) * (1.0 - 0.7 * wide);
  return col;
}

// a light point: hot core, soft halo, wide faint sprawl, with pixel-size floors
vec3 glowPt(vec2 q, vec2 c, float s, vec3 colr, float I) {
  float r = length(q - c);
  float rc = max(0.05 * s, 0.9 * gPx);
  float core = exp(-sq(r / rc));
  float halo = exp(-r / (0.28 * s + 2.0 * gPx));
  float spr = 1.0 / (1.0 + sq(r / (1.2 * s + 4.0 * gPx)));
  return (mix(colr, vec3(1.0, 0.95, 0.88), 0.55) * core * 1.8 + colr * (halo * 0.4 + spr * 0.045)) * I;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  gC0 = c0; gC1 = c1; gC2 = c2; gC3 = c3;
  vec2 res = u_resolution;
  gAsp = res.x / res.y;
  gT = u_time;
  gPx = max(u_pixelRatio, 1.0) / res.y;
  gDawn = clamp(u_dawn, 0.0, 2.0);
  gLamp = clamp(u_lamps, 0.0, 2.0);
  float heat = clamp(u_heat, 0.0, 2.0);
  float drive = clamp(u_drive, 0.0, 2.0);
  float t = gT;
  float aa = 1.2 / res.y;
  vec2 uv = gl_FragCoord.xy / res;

  // refraction field: heat rising off the tarmac bends everything near the horizon
  float dy = uv.y - HZ;
  float hzf = exp(-abs(dy) * 8.0);
  float nA = vn(vec2(uv.x * gAsp * 16.0 + 2.0 * sin(t * 0.11), uv.y * 30.0 - t * 0.8));
  float nB = vn(vec2(uv.x * gAsp * 4.5 - t * 0.07, uv.y * 9.0 - t * 0.4) + 9.0);
  vec2 p = uv;
  p.x += heat * hzf * (0.012 * (nA - 0.5) + 0.007 * sin(uv.y * 150.0 - t * 1.5 + nB * 8.0) * (0.3 + nB));
  p.y += heat * hzf * 0.004 * (nB - 0.5);

  vec3 hcol = sky(vec2(p.x, HZ + 0.006));
  vec3 col = sky(vec2(p.x, max(p.y, HZ)));
  float axp = (p.x - VX) * gAsp;

  // three hill ridges, far to near, hazed by the dawn, with village lights
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float amp = 0.085 - 0.027 * fk;
    float u = p.x * gAsp * (1.5 + 0.9 * fk) + fk * 7.3 + t * 0.003 * (1.0 + fk);
    float yt = HZ + amp * (0.15 + 0.85 * rdg(u));
    float ins = smoothstep(0.0, aa, yt - p.y);
    float dd = clamp((yt - p.y) / amp, 0.0, 1.0);
    float fog = (0.62 - 0.2 * fk) * (0.45 + 0.55 * dd);
    vec3 body = mix(gC3 * (0.035 - 0.008 * fk), hcol * 0.7, fog);
    float rimk = 0.35 + 0.65 * exp(-axp * axp * 1.1);
    float rim = exp(-max(yt - p.y, 0.0) * (150.0 + 60.0 * fk));
    body += (gC1 * 0.6 + gC0 * 0.4) * rim * rimk * 0.55 * gDawn;
    float nx = 80.0 + 36.0 * fk;
    vec2 g = vec2(p.x * gAsp * nx, p.y * nx);
    vec2 gi = floor(g);
    float hh = hs(gi + fk * 31.7);
    float vil = smoothstep(0.52, 0.62, vn1(u * 2.1 + fk * 5.0));
    vec2 lp = fract(g) - 0.5 - (vec2(hs(gi + 4.1), hs(gi + 8.3)) - 0.5) * 0.4;
    float dotm = (1.0 - smoothstep(0.05, 0.22, length(lp))) * step(0.82, hh) * vil;
    dotm *= step(p.y, yt - 0.003) * smoothstep(0.0, 0.2, dd);
    body += mix(gC1, gC0, clamp((hh - 0.82) * 5.5, 0.0, 1.0)) * dotm * (0.75 + 0.25 * sin(t * 1.1 + hh * 80.0)) * 1.3;
    col = mix(col, body, ins);
  }

  // road geometry in eye-height units
  float gm = 1.0 - smoothstep(HZ - aa, HZ + aa, p.y);
  float d = max(HZ - p.y, 0.002);
  float zg = S / d;
  float Xg = (p.x - VX) * gAsp / d;
  float axg = abs(Xg);
  float camz = t * drive * 3.0;
  float zw = zg + camz;
  float fadeG = smoothstep(0.08, 0.2, d);
  float gr = vn(vec2(Xg * 12.0, zw * 12.0)) * 0.6 + vn(vec2(Xg * 37.0, zw * 40.0)) * 0.4;
  float wet = smoothstep(0.25, 0.7, vn(vec2(Xg * 0.7, zw * 0.18)));
  float trk = max(exp(-sq(axg - 0.55) * 12.0), exp(-sq(axg - 1.65) * 12.0));
  float verge = smoothstep(2.5, 2.8, axg);
  float gloss = mix(0.3, 1.0, wet) * (0.55 + 0.45 * trk) * (1.0 - verge);
  float fm = smoothstep(0.03, 0.09, d);
  float wear = 0.45 + 0.55 * smoothstep(0.15, 0.6, vn(vec2(Xg * 5.0, zw * 2.5)));
  float mk = (1.0 - smoothstep(0.06, 0.1, axg)) * step(fract(zw / 7.0), 0.42);
  float el = 1.0 - smoothstep(0.05, 0.1, abs(axg - 2.3));
  float mark = max(mk, el) * wear * fm;
  vec3 aAsp = (0.1 + 0.08 * gr * fadeG) * (0.6 + 0.8 * gC3);
  vec3 aVrg = (0.07 + 0.05 * vn(vec2(Xg * 4.0, zw * 4.0)) * fadeG) * (0.7 + 0.6 * gC2);
  vec3 A = mix(aAsp, aVrg, verge);
  A = mix(A, mix(gC1, vec3(1.0), 0.5) * 0.75, mark * (1.0 - verge));
  float reed = smoothstep(0.5, 0.85, vn(vec2(Xg * 8.0, zw * 0.9) + vn(vec2(Xg * 3.0, zw * 0.3)) * 2.0));
  float reedE = mix(0.3, reed, smoothstep(0.03, 0.1, d));

  // lamp masts: front to back, occluding what lies behind them
  vec2 q = vec2((p.x - VX) * gAsp, p.y - HZ);
  vec3 acc = vec3(0.0);
  float vis = 1.0;
  vec3 poolL = vec3(0.0);
  vec3 reflL = vec3(0.0);
  float n0 = floor(camz / SP);
  float fr = camz / SP - n0;
  for (int i = 0; i < 20; i++) {
    float id = n0 + float(i);
    float hj = h1(id * 1.37);
    float hk = h1(id * 2.91 + 7.0);
    float zl = (float(i) - fr) * SP + (hj - 0.5) * 1.2;
    if (zl > 0.7) {
      float s = S / zl;
      float side = 1.0 - 2.0 * mod(id, 2.0);
      float Hh = 3.9 + 0.8 * hk;
      float Xp = side * (3.0 + 0.3 * hj);
      float bX = side * (1.45 + 0.45 * hk);
      float lampOn = 1.0 - step(0.93, h1(id * 7.7 + 1.0)) * 0.85;
      float flick = 1.0 - 0.14 * step(0.8, h1(id * 3.3)) * (0.5 + 0.5 * sin(t * 1.7 + hj * 30.0));
      float farF = 1.0 - smoothstep(55.0, 84.0, zl);
      float nearF = smoothstep(0.7, 1.6, zl);
      float I = gLamp * lampOn * farF * nearF * flick;
      vec3 lc = mix(mix(gC1, gC0, hk), gC2, step(0.82, h1(id * 5.3)));
      float Hb = Hh - 0.2;
      vec2 bulb = vec2(bX * s, Hb * s - s);

      // ringed, tapering shaft with a flared foot
      float yb = -s;
      float yTop = (Hh - 1.0) * s;
      float Yw = q.y / s + 1.0;
      float w = s * (0.075 + 0.02 * (0.5 + 0.5 * sin(Yw * 14.0 + hj * 9.0))) * mix(1.0, 0.62, clamp(Yw / Hh, 0.0, 1.0)) + 0.09 * s * exp(-Yw * 6.0);
      w *= 1.0 + 0.1 * (vn1(Yw * 9.0 + id) - 0.5);
      w = max(w, 0.3 * gPx);
      float dxp = q.x - Xp * s;
      float cvP = (1.0 - smoothstep(-aa, aa, abs(dxp) - w)) * smoothstep(yb - aa, yb + aa, q.y) * (1.0 - smoothstep(yTop - aa, yTop + aa, q.y));
      // curved arm and a lozenge luminaire head
      vec2 pa = vec2(Xp * s, (Hh - 0.12) * s - s);
      vec2 pm = vec2(mix(Xp, bX, 0.5) * s, (Hh + 0.18) * s - s);
      vec2 pb = vec2(bX * s, (Hh - 0.02) * s - s);
      float da = min(segd(q, pa, pm), segd(q, pm, pb));
      float cvA = 1.0 - smoothstep(-aa, aa, da - max(0.032 * s, 0.3 * gPx));
      vec2 hc = vec2(bX * s, (Hh - 0.07) * s - s);
      float e = length((q - hc) / vec2(0.24 * s, 0.07 * s));
      float cvH = 1.0 - smoothstep(0.8, 1.05, e);
      float cover = max(cvP, max(cvA, cvH));
      float uSide = dxp * (-side) / w;
      float lit = smoothstep(0.1, 1.0, uSide) * cvP;
      float prox = exp(-length(q - bulb) / s);
      vec3 pcol = gC3 * 0.02 + lc * (0.55 * prox * I + 0.12 * lit * exp(-zl * 0.05) * gDawn);
      acc += vis * cover * pcol;
      vis *= 1.0 - cover;

      // the lamp itself, and the dusty cone it hangs
      acc += vis * glowPt(q, bulb, s, lc, I);
      float dyc = bulb.y - q.y;
      float cone = smoothstep(0.0, 0.2 * s, dyc)
                 * (1.0 - smoothstep(0.0, 1.0, abs(q.x - bulb.x) / (0.55 * dyc + 0.08 * s)))
                 * exp(-dyc / (2.2 * s)) * (1.0 - smoothstep(0.85 * Hb * s, Hb * s, dyc));
      float dust = 0.6 + 0.8 * vn(vec2(q.x / s * 2.5 + id * 3.0, q.y / s * 3.0 - t * 0.15));
      acc += vis * lc * cone * dust * 0.09 * I;

      // light pool on the asphalt and the smeared glint in the wet track
      float pool = exp(-(sq(Xg - bX) * 0.22 + sq(zg - zl) * 0.14)) * I;
      poolL += lc * pool * 1.6;
      float uu = (-s - q.y) / (Hb * s);
      float dxs = q.x - bX * s + (vn(vec2(q.y * 140.0 + id * 3.0, t * 0.35)) - 0.5) * 0.35 * s * (0.3 + uu);
      float wx = max(s * (0.07 + 0.2 * uu), 0.5 * gPx);
      float stk = exp(-sq(dxs / wx)) * smoothstep(0.0, 0.25, uu) * (0.25 + 0.75 * smoothstep(0.3, 1.0, uu)) * (1.0 - smoothstep(1.0, 1.3, uu));
      stk *= 0.5 + 0.9 * vn(vec2(uu * 9.0 + id * 1.7, t * 0.25));
      reflL += lc * stk * I * 0.9;
    }
  }

  // a few cars: two oncoming pairs of headlights and one pair of tail lights
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float isRec = step(1.5, fj);
    float per = 46.0 + 9.0 * fj;
    float ph = fract(t / per + fj * 0.37 + 0.1);
    float fade = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.9, 1.0, ph));
    float zc = mix(mix(82.0, 6.0, ph), mix(9.0, 82.0, ph), isRec);
    float sC = S / zc;
    float X0 = mix(-1.15 + 0.15 * fj, 1.1, isRec);
    float Yc = mix(0.34, 0.42, isRec);
    vec3 lcl = mix(mix(gC1, vec3(1.0, 0.95, 0.86), 0.5), mix(gC2, vec3(1.0, 0.28, 0.3), 0.35), isRec);
    float Ic = fade * (0.45 + 0.55 * gLamp) * mix(1.0, 0.7, isRec);
    vec2 cA = vec2((X0 - 0.38) * sC, (Yc - 1.0) * sC);
    vec2 cB = vec2((X0 + 0.38) * sC, (Yc - 1.0) * sC);
    acc += vis * (glowPt(q, cA, sC, lcl, Ic) + glowPt(q, cB, sC, lcl, Ic));
    float fl = exp(-abs(q.x - X0 * sC) / (2.0 * sC + 3.0 * gPx)) * exp(-sq((q.y - cA.y) / (0.5 * gPx + 0.04 * sC)));
    acc += vis * lcl * fl * 0.35 * Ic;
    float uu = (-sC - q.y) / (Yc * sC);
    float rm = smoothstep(0.0, 0.3, uu) * (1.0 - smoothstep(1.0, 1.3, uu)) * (0.6 + 0.8 * vn(vec2(uu * 8.0 + fj * 3.0, t * 0.3)));
    float rw = sC * (0.06 + 0.15 * uu) + 0.5 * gPx;
    reflL += lcl * (exp(-sq((q.x - cA.x) / rw)) + exp(-sq((q.x - cB.x) / rw))) * rm * Ic * 0.8;
  }

  // road shading: dawn ambient, lamp pools, wet glints, mirage and haze toward the horizon
  vec3 amb = gC3 * 0.05 + hcol * 0.3 * (0.35 + 0.65 * exp(-d * 5.0));
  vec3 roadCol = A * (amb + poolL) + reflL * gloss * 0.9;
  roadCol += hcol * 0.12 * reedE * verge * exp(-d * 3.0);
  float mirage = exp(-d * 26.0) * (0.35 + 0.65 * gloss) * (0.75 + 0.25 * sin(d * 420.0 - t * 1.2 + nA * 7.0)) * 0.8;
  roadCol += hcol * mirage;
  roadCol = mix(roadCol, hcol * 0.55, exp(-d * 30.0) * 0.55);

  vec3 bg = mix(col, roadCol, gm);
  bg += (gC1 * 0.5 + 0.3) * exp(-abs(p.y - HZ) * 90.0) * 0.12 * (0.3 + 0.7 * exp(-axp * axp)) * gDawn;

  vec3 fin = acc + vis * bg;
  fin = max(fin, 0.0);
  fin = 1.0 - exp(-fin * 1.5);
  gl_FragColor = vec4(fin, 1.0);
}
