// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Plenum - a low view down a server aisle. Rows of racks recede on both sides
// toward a vanishing point on the lower left third, every server face dotted
// with blinking status lights and drive bays. A raised floor of perforated
// tiles mirrors the lights, ladder cable trays run overhead, and slow bands of
// scanning light sweep down the aisle through a warm haze over blue-black shade.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scan;   // strength of the scanning light bands sweeping the aisle (default 1)
uniform float u_haze;   // density of the haze down the aisle (default 1)
uniform float u_blink;  // blink rate of the status lights (default 0.6)

const float W     = 1.2;    // half width of the aisle at the rack frames
const float REC   = 0.03;   // server faces sit this far behind the frame
const float RH    = 2.1;    // rack height
const float CH    = 3.0;    // ceiling height
const float TY    = 2.42;   // cable tray height
const float EYE   = 0.55;   // camera height
const float PITCH = 0.64;   // rack width along the aisle
const float UH    = 0.0445; // one rack unit
const float PW    = 0.024;  // half width of a frame post
const float SPER  = 13.0;   // spacing of the scan bands

vec3 gC0, gC1, gC2, gC3;
float gT, gBlink;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.13))) * 35917.27);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

// a scan band travelling away down the aisle, periodic in depth
float scanAt(float z) {
  float d = (fract((z - gT * 1.6) / SPER) - 0.5) * SPER;
  return exp(-d * d * 0.9);
}

vec3 ledCol(float h) {
  vec3 c = gC2;
  c = mix(c, gC1, step(0.3, h));
  c = mix(c, gC0, step(0.6, h));
  c = mix(c, gC3 * 1.5, step(0.85, h));
  return c;
}

float blinkAt(float h) {
  float rate = (0.15 + 1.6 * fract(h * 7.3)) * gBlink;
  float s = sin(gT * rate * 6.2832 + h * 50.0);
  float steady = step(0.55, fract(h * 3.1));
  return mix(0.3 + 0.7 * smoothstep(-0.3, 0.5, s), 1.0, steady);
}

// one row of n status lights spaced sp apart from a0 at height b0,
// m in metres on the server face, fp the world size of a pixel
vec3 ledRow(vec2 m, float a0, float b0, float sp, float n, float id, vec2 fp) {
  float j = clamp(floor((m.x - a0) / sp + 0.5), 0.0, n - 1.0);
  vec2 d = m - vec2(a0 + j * sp, b0);
  float r = 0.0028;
  vec2 rr = max(vec2(r), fp * 0.7);
  vec2 q = d / rr;
  float e = 2.6 * exp(-dot(q, q)) * (r * r) / (rr.x * rr.y);
  vec2 q2 = d / (rr * 4.0);
  e += 0.16 * exp(-dot(q2, q2));
  float h = hs(vec2(id, j * 1.7 + 0.3));
  return ledCol(h) * blinkAt(h) * e;
}

// server faces behind the frame, q = (along the aisle, height) in metres;
// rgb is emission, a is surface brightness
vec4 servers(vec2 q, float side, vec2 fp) {
  float rs = q.x / PITCH;
  float r = floor(rs);
  float uM = fract(rs) * PITCH;
  float hr = hs(vec2(r, side * 3.7 + 1.3));
  float y = q.y - 0.07;
  // some racks are not full and show bare rails at the top
  float top = RH - 0.16 - floor(hr * 9.0) * UH * 2.0 * step(0.6, hr);
  if (y < 0.0 || y > top) return vec4(0.0, 0.0, 0.0, 0.05 + 0.04 * vn(q * vec2(9.0, 60.0)));
  float k = floor(y / UH);
  float g4 = floor(k / 4.0);
  float hg = hs(vec2(g4 + r * 17.0, side + 5.1));
  float sz = hg < 0.45 ? 1.0 : (hg < 0.8 ? 2.0 : 4.0);
  float base = g4 * 4.0 + floor(mod(k, 4.0) / sz) * sz;
  float sid = base + mod(r, 97.0) * 64.0 + side * 37.0;
  float hv = hs(vec2(sid, 2.7));
  float hgt = sz * UH;
  vec2 m = vec2(uM, y - base * UH);
  float lodU = smoothstep(0.003, 0.012, fp.x);
  // seam between servers, vented metal body, brighter ears at both ends
  float seam = smoothstep(0.0, 0.0015 + fp.y, min(m.y, hgt - m.y));
  float ear = step(m.x, 0.035) + step(PITCH - 0.035, m.x);
  float vent = mix(0.45 + 0.55 * step(0.5, fract(m.x / 0.006)), 0.72, lodU);
  float alb = mix(0.1 + 0.12 * hv, 0.32, ear) * mix(1.0, vent, 1.0 - ear) * mix(0.25, 1.0, seam);
  vec3 e = vec3(0.0);
  if (hv > 0.08) {
    e += ledRow(m, PITCH - 0.09, hgt * 0.5, 0.012, 4.0, sid, fp);
    e += 0.7 * ledRow(m, 0.045, hgt * 0.5, 0.01, 2.0, sid + 0.25, fp);
    if (sz > 1.5) {
      // drive bays across the face, each with its activity light
      float bw = sz > 3.0 ? 0.036 : 0.05;
      float nb = floor(0.42 / bw);
      e += 0.8 * ledRow(m, 0.065, min(0.011, hgt * 0.3), bw, nb, sid + 0.5, fp);
      float inB = step(0.04, m.x) * step(m.x, 0.04 + nb * bw);
      float bay = smoothstep(0.0, 0.0012 + fp.x, abs(fract((m.x - 0.04) / bw) - 0.5) * bw - 0.0015);
      alb *= mix(1.0, mix(0.4, 1.15, bay), (1.0 - lodU) * inB);
    }
  }
  // far away the lights merge into a glow that keeps each server tint
  float lod = smoothstep(0.012, 0.06, max(fp.x, fp.y));
  vec3 mean = ledCol(hv) * 0.07 * step(0.08, hv) * (0.75 + 0.25 * sin(gT * gBlink + hv * 30.0));
  e = mix(e, mean, lod);
  // some racks wear a perforated mesh door that veils their lights
  if (hr > 0.3 && hr < 0.42) {
    vec2 g = fract(q * vec2(1.0 / 0.007, 1.0 / 0.007)) - 0.5;
    float mesh = smoothstep(0.22, 0.32, length(g));
    mesh = mix(mesh, 0.55, smoothstep(0.002, 0.008, max(fp.x, fp.y)));
    e *= 1.0 - 0.6 * mesh;
    alb = mix(alb, 0.2, mesh * 0.7);
  }
  return vec4(e, alb);
}

// rack frame on the aisle plane: posts with mounting holes, a top cap and a
// plinth; returns surface brightness, or -1 where the ray passes inside
float frame(vec2 q, vec2 fp) {
  float uM = fract(q.x / PITCH) * PITCH;
  float dP = min(uM, PITCH - uM);
  float cap = step(RH - 0.09, q.y) + step(q.y, 0.07);
  if (dP > PW && cap < 0.5) return -1.0;
  if (cap > 0.5) {
    // top cap with a vent slot band, plinth with scuffs
    float slot = step(0.5, fract(q.x / 0.02)) * step(RH - 0.06, q.y) * step(q.y, RH - 0.035);
    float b = 0.22 - 0.12 * mix(slot, 0.5 * step(RH - 0.06, q.y) * step(q.y, RH - 0.035), smoothstep(0.004, 0.012, fp.x));
    return b * (0.8 + 0.4 * vn(q * vec2(3.0, 40.0)));
  }
  // square holes every third of a unit, an inner edge catching light
  float hole = step(abs(dP - PW * 0.5), 0.0035) * step(abs(fract(q.y / (UH / 3.0)) - 0.5), 0.18);
  hole = mix(hole, 0.1, smoothstep(0.003, 0.01, max(fp.x, fp.y)));
  float edge = smoothstep(PW - 0.004 - fp.x, PW, dP);
  return (0.16 + 0.3 * edge) * (1.0 - 0.75 * hole);
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

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  float px = 1.0 / mn;

  // shifted lens: vanishing point on the lower third, a third across
  vec2 vp = vec2(-0.16 * res.x / mn, -0.17);
  const float FOC = 1.1;
  vec3 ro = vec3(-0.28, EYE, gT * 0.3);
  vec3 rd = normalize(vec3(uv - vp, FOC));
  float pxT = px / FOC;

  // the cool shade of the room against the warm lights
  vec3 amb = vec3(0.008, 0.024, 0.075);
  vec3 scanC = gC1 * 0.85 + gC0 * 0.35;
  vec3 fillC = gC0 * 0.5 + gC1 * 0.3;

  float side = rd.x > 0.0 ? 1.0 : -1.0;
  float dx = abs(rd.x) < 1e-4 ? 1e-4 * side : rd.x;
  float tw = (side * W - ro.x) / dx;
  float tf = rd.y < 0.0 ? -EYE / rd.y : 1e5;
  float tc = rd.y > 0.0 ? (CH - EYE) / rd.y : 1e5;
  float tt = rd.y > 0.0 ? (TY - EYE) / rd.y : 1e5;
  float yW = EYE + rd.y * tw;

  vec3 col = vec3(0.0);
  float T;
  if (tf < tw) {
    // raised floor of tiles, the centre ones perforated, glossy underfoot
    T = tf;
    vec3 P = ro + rd * T;
    float fpT = T * pxT;
    float fpz = fpT / max(-rd.y, 0.02);
    vec2 tl = fract(P.xz / 0.6);
    vec2 tile = floor(P.xz / 0.6);
    float sw = (0.006 + 0.6 * max(fpT, fpz)) / 0.6;
    float seam = smoothstep(0.0, sw, min(min(tl.x, 1.0 - tl.x), min(tl.y, 1.0 - tl.y)));
    float ht = hs(tile + 7.7);
    float perf = step(abs(tile.x + 0.5), 1.0) * step(0.35, ht);
    vec2 g = fract(tl * 18.0) - 0.5;
    float holes = smoothstep(0.3, 0.2, length(g));
    holes = mix(holes, 0.45, smoothstep(0.008, 0.03, fpz));
    float alb = 0.12 * (0.75 + 0.5 * ht) * seam * mix(1.0, 0.45, holes * perf);
    float scanL = scanK * scanAt(P.z);
    float nearW = exp(-(W - abs(P.x)) * 2.4);
    vec3 lit = amb * 5.0 + scanC * scanL * 1.8 + fillC * nearW * 0.5;
    col = alb * lit;
    // reflection of the rack lights in the polished tiles
    float tr = (side * W - P.x) / dx;
    float yR = -rd.y * tr;
    if (yR < RH) {
      vec2 qR = vec2(P.z + rd.z * tr, yR);
      float gloss = (0.5 + 0.5 * vn(P.xz * vec2(3.0, 0.8))) * seam * mix(1.0, 0.5, perf);
      // sharp light points close by, soft vertical streaks further off
      vec3 rf = servers(qR, side, vec2(fpT / max(abs(rd.x), 0.05), fpT) + 0.004).rgb;
      vec3 streak = mix(gC1, gC2, vn(vec2(qR.x * 1.5, side))) * 0.1
                  * (0.3 + 0.7 * vn(vec2(qR.x * 7.0, side + 3.0)));
      rf = mix(rf, streak, smoothstep(0.4, 1.6, tr));
      col += rf * 0.8 * gloss * exp(-yR * 0.5);
    }
  } else if (rd.y > 0.0 && abs(ro.x + rd.x * tt) > W - 0.2 && abs(ro.x + rd.x * tt) < W + 0.4 && (yW > RH || tt < tw)) {
    // ladder cable tray seen from below: rails, rungs and bundled cables
    T = tt;
    vec3 P = ro + rd * T;
    float fpT = T * pxT;
    float fpz = fpT / max(rd.y, 0.02);
    float a = (abs(P.x) - (W - 0.2)) / 0.6;
    float rail = step(a, 0.05) + step(0.95, a);
    float rung = smoothstep(0.1 + fpz / 0.3, 0.06, fract(P.z / 0.3));
    rung = mix(rung, 0.12, smoothstep(0.02, 0.08, fpz));
    float cab = 0.06 * (0.5 + vn(vec2(P.x * 120.0, P.z * 0.4)));
    float alb = max(max(rail * 0.4, rung * 0.3), cab);
    float scanL = scanK * scanAt(P.z);
    col = alb * (amb * 5.0 + scanC * scanL * 1.3 + fillC * 0.15);
  } else if (yW < RH) {
    // the racks: frame on the aisle plane, servers just behind it
    T = tw;
    vec3 P = ro + rd * T;
    float fpT = T * pxT;
    vec2 fp = vec2(fpT / max(abs(rd.x), 0.03), fpT);
    float scanL = scanK * scanAt(P.z);
    vec3 lit = amb * 5.0 + scanC * scanL * (1.2 + 1.3 * smoothstep(0.0, RH, P.y));
    float fr = frame(P.zy, fp);
    if (fr >= 0.0) {
      col = fr * lit;
    } else {
      float t2 = (side * (W + REC) - ro.x) / dx;
      vec3 P2 = ro + rd * t2;
      float u2 = fract(P2.z / PITCH) * PITCH;
      vec4 s = servers(P2.zy, side, fp);
      if (min(u2, PITCH - u2) < PW) {
        // the inner side of a post, lit by the lights beside it
        col = 0.12 * lit + fillC * 0.05 * (0.5 + 0.5 * vn(P2.zy * 6.0));
      } else {
        col = s.a * lit + s.rgb;
      }
    }
  } else {
    // ceiling: tiles over the aisle with long fixtures, dark void above the racks
    T = tc;
    vec3 P = ro + rd * T;
    float fpT = T * pxT;
    float fpz = fpT / max(rd.y, 0.02);
    vec2 tl = fract(P.xz / 0.6);
    float seam = smoothstep(0.0, (0.004 + fpz) / 0.6, min(min(tl.x, 1.0 - tl.x), min(tl.y, 1.0 - tl.y)));
    float above = step(W, abs(P.x));
    float alb = mix(0.12 * seam, 0.03, above);
    float fz = fract(P.z / 3.6 + 0.2);
    float fix = step(abs(P.x - 0.1), 0.12) * step(fz, 0.33);
    float louv = mix(0.6 + 0.4 * step(0.5, fract(P.z / 0.05)), 0.8, smoothstep(0.01, 0.04, fpz));
    col = alb * (amb * 5.0 + scanC * scanK * scanAt(P.z) * 0.6) + fix * louv * (gC1 * 0.2 + gC2 * 0.08);
  }

  // haze down the aisle with the scan bands glowing in it
  float fogK = 0.045 * hazeK;
  float Tm = min(T, 40.0);
  vec3 vol = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float ti = (float(i) + 0.5) / 12.0 * Tm;
    vec3 Q = ro + rd * ti;
    float hgt = exp(-(CH - Q.y) * 0.8);
    float nearW = exp(-(W - abs(Q.x)) * 2.0);
    vol += (scanC * scanAt(Q.z) * scanK * (0.3 + 0.7 * hgt) + fillC * nearW * 0.15) * exp(-ti * fogK);
  }
  vol *= Tm / 12.0 * 0.05 * hazeK;
  float drift = vn(vec2(uv.x * 2.5 + gT * 0.04, uv.y * 6.0 - gT * 0.02));
  float fog = 1.0 - exp(-T * fogK * (0.75 + 0.5 * drift));
  // the haze is blue-black in the room and glows warm toward the lit far end
  float endG = exp(-length((uv - vp) * vec2(1.0, 1.6)) * 4.5);
  vec3 hazeC = mix(amb * 1.6, gC0 * 0.42 + gC2 * 0.12, endG);
  col = mix(col, hazeC, fog) + vol;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
