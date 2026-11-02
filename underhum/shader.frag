// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Underhum - a cold server aisle seen low from the floor. Racks recede on both sides to a
// vanishing point on the lower left third, their faces dotted with thousands of status lights and
// drive bays, mirrored in a perforated raised floor that leaks ember light from below. Between
// the depth layers sits a stepped haze with floor hugging banks, broad scan bands of cool light
// travelling away down the aisle, and dust motes drifting through fixed depth planes so distance reads.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scan;   // strength of the cool scan bands sweeping the aisle (default 1)
uniform float u_haze;   // density of the layered haze between racks and far end (default 1)
uniform float u_blink;  // blink rate of the status lights (default 0.6)
uniform float u_motes;  // density of drifting dust motes (default 1)

const float W     = 1.2;    // half width of the aisle
const float CH    = 3.0;    // ceiling height
const float EYE   = 0.6;    // camera height
const float RH    = 2.15;   // rack height
const float PITCH = 0.64;   // rack width along the aisle
const float UNIT  = 0.0445; // one rack unit
const float CELLW = 0.04;   // one light cell across a rack (sixteen per bay)
const float SPER  = 12.0;   // spacing of the scan bands

vec3 gC0, gC1, gC2, gC3;
float gT, gBlink;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(37.219, 91.853))) * 24137.317);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hs(i), b = hs(i + vec2(1.0, 0.0));
  float c = hs(i + vec2(0.0, 1.0)), d = hs(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// broad scan band travelling away down the aisle, periodic in depth
float scanAt(float z) {
  float d = (fract((z - gT * 1.5) / SPER) - 0.5) * SPER;
  return exp(-d * d * 0.2) + 0.08;
}

vec3 ledCol(float h) {
  vec3 c = gC2;
  c = mix(c, gC1, step(0.35, h));
  c = mix(c, gC0 * 1.3, step(0.65, h));
  c = mix(c, vec3(0.9, 0.97, 1.0), step(0.9, h));
  c = mix(c, vec3(1.0, 0.42, 0.1), step(0.955, h));
  return c;
}

float blinkAt(float h) {
  float rate = (0.2 + 1.5 * fract(h * 9.17)) * gBlink;
  float s = sin(gT * rate * 6.2832 + h * 61.0);
  float hold = step(0.5, fract(h * 4.3));
  return mix(0.25 + 0.75 * smoothstep(-0.2, 0.6, s), 1.0, hold);
}

// rack face on the wall: q = (along the aisle, height) in metres, fp = world size of a pixel
// returns emission in rgb and surface brightness in a
vec4 rackFace(vec2 q, float side, vec2 fp) {
  float fm = max(fp.x, fp.y);
  float lod = smoothstep(0.012, 0.06, fm);
  float rs = q.x / PITCH;
  float r = floor(rs);
  float u = fract(rs) * 16.0;
  float ci = floor(u);
  float cf = fract(u) - 0.5;
  float hr = hs(vec2(r, side * 5.3 + 2.1));
  float top = RH - 0.1 - step(0.62, hr) * floor(hr * 7.0) * UNIT * 2.0;
  if (q.y < 0.08) return vec4(0.0, 0.0, 0.0, 0.05 + 0.04 * vn(q * vec2(4.0, 30.0)));
  if (q.y > top) {
    float pst = step(ci, 0.5) + step(14.5, ci);
    return vec4(0.0, 0.0, 0.0, 0.015 + pst * 0.12);
  }
  if (ci < 0.5 || ci > 14.5) {
    float hole = step(abs(cf), 0.22) * step(abs(fract(q.y / (UNIT / 3.0)) - 0.5), 0.2);
    hole = mix(hole, 0.15, smoothstep(0.004, 0.012, fm));
    float lip = smoothstep(0.5, 0.3, abs(cf));
    return vec4(0.0, 0.0, 0.0, (0.2 + 0.1 * lip) * (1.0 - 0.7 * hole));
  }
  float k = floor(q.y / UNIT);
  float g4 = floor(k / 4.0);
  float hg = hs(vec2(g4 + r * 17.0, side + 5.1));
  float sz = hg < 0.45 ? 1.0 : (hg < 0.8 ? 2.0 : 4.0);
  float base = g4 * 4.0 + floor(mod(k, 4.0) / sz) * sz;
  float sid = base + mod(r, 89.0) * 64.0 + side * 31.0;
  float hv = hs(vec2(sid, 2.7));
  float mm = q.y - base * UNIT;
  float hgt = sz * UNIT;
  float seam = smoothstep(0.0, 0.0015 + fp.y, min(mm, hgt - mm));
  float hc = hs(vec2(ci * 1.37 + sid * 0.73, k + 11.0));
  float hq = fract(hc * 53.7 + 0.21);
  float isStat = step(10.5, ci) * step(ci, 13.5) * step(abs(k - base), 0.5);
  float isBay = step(1.5, ci) * step(ci, 9.5) * step(1.5, sz);
  float on = step(0.1, hv) * max(isStat * step(hc, 0.8), isBay * step(hc, 0.5));
  vec2 d = vec2(cf * CELLW, (fract(q.y / UNIT) - 0.5) * UNIT);
  float r0 = 0.0062;
  vec2 rr = max(vec2(r0), fp * 0.7);
  vec2 dq = d / rr;
  float eg = 2.8 * exp(-dot(dq, dq)) * (r0 * r0) / (rr.x * rr.y);
  vec2 d2 = d / (rr * 4.0);
  eg += 0.14 * exp(-dot(d2, d2));
  vec3 em = ledCol(hq) * blinkAt(hq) * eg * on;
  vec3 mean = ledCol(fract(hv * 13.0)) * 0.075 * step(0.1, hv) * (0.7 + 0.3 * sin(gT * gBlink * 0.8 + hv * 40.0));
  em = mix(em, mean, lod);
  float vent = mix(0.5 + 0.5 * step(0.5, fract(q.x / 0.006)), 0.75, lod);
  float bayShade = mix(1.0, mix(0.45, 1.05, smoothstep(0.5, 0.36, abs(cf))), isBay * (1.0 - lod));
  float alb = (0.07 + 0.1 * hv) * mix(0.25, 1.0, seam) * vent * bayShade;
  if (hr > 0.3 && hr < 0.4) {
    em *= 0.35;
    alb *= 0.6;
  }
  return vec4(em, alb);
}

// wall above the racks: a cable tray with rungs, rails and bundled cable
float upperWall(vec2 q, vec2 fp) {
  float inTray = step(2.36, q.y) * step(q.y, 2.54);
  float rung = step(fract(q.x / 0.3), 0.15);
  rung = mix(rung, 0.15, smoothstep(0.03, 0.15, fp.x));
  float rail = step(abs(q.y - 2.45), 0.014 + fp.y);
  float cab = 0.05 * (0.5 + vn(vec2(q.x * 0.8, q.y * 30.0)));
  float trim = step(RH, q.y) * step(q.y, RH + 0.05) * 0.18;
  return 0.025 + trim + inTray * (cab + 0.2 * max(rung * 0.8, rail * 0.7));
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  gC0 = c0; gC1 = c1; gC2 = c2; gC3 = c3;
  gT = u_time;
  gBlink = clamp(u_blink, 0.0, 2.0);
  float scanK = clamp(u_scan, 0.0, 2.0);
  float hazeK = clamp(u_haze, 0.0, 2.0);
  float moteK = clamp(u_motes, 0.0, 2.0);

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  float px = 1.0 / mn;

  vec2 vp = vec2(-0.16 * res.x / mn, -0.17);
  const float FOC = 1.1;
  vec3 ro = vec3(-0.25, EYE, gT * 0.35);
  vec3 rd = normalize(vec3(uv - vp, FOC));
  float pxT = px / FOC;

  // ember-dark room against cool lights
  vec3 amb = vec3(0.05, 0.012, 0.006);
  vec3 warm = vec3(1.0, 0.38, 0.1);
  vec3 scanC = mix(gC2, vec3(0.85, 0.93, 1.0), 0.4);
  vec3 fillC = gC0 * 0.6 + gC1 * 0.25;
  float endG = exp(-length((uv - vp) * vec2(1.0, 1.7)) * 4.0);

  float side = rd.x > 0.0 ? 1.0 : -1.0;
  float dx = abs(rd.x) < 1e-4 ? 1e-4 * side : rd.x;
  float tw = (side * W - ro.x) / dx;
  float tf = rd.y < -1e-4 ? -EYE / rd.y : 1e5;
  float tc = rd.y > 1e-4 ? (CH - EYE) / rd.y : 1e5;
  float T = min(tw, min(tf, tc));
  float Ts = min(T, 90.0);
  vec3 P = ro + rd * Ts;
  vec3 col = vec3(0.0);

  if (tf <= tw && tf <= tc) {
    // raised floor: tiles, perforated centre tiles, polished reflections
    float fpT = Ts * pxT;
    float fpz = fpT / max(-rd.y, 0.02);
    vec2 tl = fract(P.xz / 0.6);
    vec2 tile = floor(P.xz / 0.6);
    float sw = min(0.5, (0.006 + fpz) / 0.6);
    float seam = smoothstep(0.0, sw, min(min(tl.x, 1.0 - tl.x), min(tl.y, 1.0 - tl.y)));
    float ht = hs(tile + 7.7);
    float perf = step(abs(tile.x + 0.5), 1.0) * step(0.35, ht);
    vec2 g = fract(tl * 18.0) - 0.5;
    float holes = smoothstep(0.3, 0.2, length(g));
    holes = mix(holes, 0.45, smoothstep(0.008, 0.03, fpz));
    float alb = 0.1 * (0.75 + 0.5 * ht) * seam * mix(1.0, 0.45, holes * perf);
    float nearW = exp(-(W - abs(P.x)) * 2.4);
    vec3 lit = amb * 4.0 + scanC * scanK * scanAt(P.z) * 1.6 + fillC * nearW * 0.4;
    col = alb * lit;
    col += perf * holes * warm * 0.06 * exp(-Ts * 0.05);
    float tr2 = (side * W - P.x) / dx;
    float yR = -rd.y * tr2;
    if (yR < RH && Ts < 60.0) {
      float fpr = (Ts + tr2) * pxT;
      vec4 rf = rackFace(vec2(P.z + rd.z * tr2, yR), side, vec2(fpr / max(abs(rd.x), 0.05), fpr) + 0.004);
      float gloss = (0.45 + 0.55 * vn(P.xz * vec2(3.0, 0.8))) * seam * mix(1.0, 0.5, perf) * exp(-yR * 0.4);
      col += rf.rgb * 0.7 * gloss;
    }
  } else if (tc < tw) {
    // ceiling tiles with long cool fixtures
    float fpT = Ts * pxT;
    float fpz = fpT / max(rd.y, 0.02);
    vec2 tl = fract(P.xz / 0.6);
    float seam = smoothstep(0.0, min(0.5, (0.005 + fpz) / 0.6), min(min(tl.x, 1.0 - tl.x), min(tl.y, 1.0 - tl.y)));
    float alb = 0.1 * seam;
    float fz = fract(P.z / 3.6 + 0.2);
    float strip = step(abs(P.x), 0.11) * step(fz, 0.66);
    float louv = mix(0.6 + 0.4 * step(0.5, fract(P.z / 0.05)), 0.8, smoothstep(0.01, 0.05, fpz));
    col = alb * (amb * 4.0 + scanC * scanK * scanAt(P.z) * 0.8) + strip * louv * (gC2 * 0.22 + vec3(0.06, 0.08, 0.1));
  } else {
    // the racks, and the cable tray above them
    float fpT = Ts * pxT;
    vec2 fp = vec2(fpT / max(abs(rd.x), 0.04), fpT);
    float scanL = scanK * scanAt(P.z);
    vec3 lit = amb * 4.0 + scanC * scanL * (0.9 + 1.2 * smoothstep(0.0, RH, P.y));
    if (P.y < RH) {
      vec4 s = rackFace(vec2(P.z, P.y), side, fp);
      col = s.a * lit + s.rgb;
    } else {
      col = upperWall(vec2(P.z, P.y), fp) * lit;
    }
  }

  // layered haze: stepped densely near the eye, thin banks hugging the floor,
  // cool scatter from the scan bands, warming toward the far end
  float Tm = min(T, 48.0);
  float jit = 0.25 + 0.5 * hs(gl_FragCoord.xy);
  float tr = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float s = (float(i) + jit) / 16.0;
    float ti = Tm * s * s;
    float dl = Tm * 2.0 * s / 16.0;
    vec3 Q = ro + rd * ti;
    float bank = 0.35 + 0.9 * vn(vec2(Q.z * 0.2 + gT * 0.05, Q.x * 0.8 + gT * 0.03));
    float low = 0.3 + 0.7 * exp(-Q.y * 0.9);
    float sig = 0.05 * hazeK * bank * low;
    float nearW = exp(-(W - abs(Q.x)) * 2.0);
    vec3 sc = scanC * scanAt(Q.z) * scanK * (0.35 + 0.65 * smoothstep(0.0, CH, Q.y))
            + fillC * nearW * 0.18 + gC3 * 0.35
            + gC2 * 0.12 * exp(-(CH - Q.y) * 1.4) * exp(-Q.x * Q.x * 1.5)
            + warm * endG * 0.55 * smoothstep(6.0, 40.0, ti);
    float a = 1.0 - exp(-sig * dl);
    acc += tr * sc * a * 2.2;
    tr *= 1.0 - a;
  }
  col = col * tr + acc;

  // dust motes on world-fixed depth planes the camera drifts through
  vec3 mo = vec3(0.0);
  float j0 = floor(ro.z / 2.0);
  for (int i = 0; i < 8; i++) {
    float js = j0 + float(i) + 1.0;
    float zi = js * 2.0;
    float tz = (zi - ro.z) / rd.z;
    vec3 Pm = ro + rd * tz;
    float inside = step(tz, Ts) * step(abs(Pm.x), W - 0.04) * step(0.03, Pm.y) * step(Pm.y, CH - 0.05);
    vec2 cp = Pm.xy / 0.5 + vec2(gT * 0.012 * sin(js * 2.3), -gT * 0.018);
    vec2 ic = floor(cp);
    float h = hs(ic + js * 7.31);
    float pres = step(h, 0.2 * moteK);
    vec2 off = (vec2(hs(ic + js * 3.7 + 1.3), hs(ic * 1.7 + js * 5.1 + 4.4)) - 0.5) * 0.6;
    vec2 d = (fract(cp) - 0.5 - off) * 0.5;
    float rm = 0.007 + 0.01 * hs(ic + js * 1.9);
    float fpm = tz * pxT;
    float rq = max(rm, fpm * 0.9);
    float e = exp(-dot(d, d) / (rq * rq)) * min(1.0, (rm * rm) / (rq * rq));
    float twk = 0.6 + 0.4 * sin(gT * (0.4 + h * 3.0) + h * 40.0);
    vec3 lm = scanC * scanAt(Pm.z) * scanK * 1.8 + gC1 * 0.28 + warm * endG * 0.2;
    float fade = smoothstep(0.5, 2.2, tz) * exp(-tz * 0.035 * (0.3 + hazeK));
    mo += lm * e * twk * pres * inside * fade;
  }
  col += mo * 1.6;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
