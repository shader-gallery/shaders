// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Cloche - a greenhouse at night seen from the wet path outside. A long glass
// wall in a steel frame recedes to the right above a brick knee wall. Behind
// the fogged panes rows of grow lights hang over benches of vines, their
// leaves backlit and blurred more the deeper they stand, while warm mist
// billows in the lamp light. Beads of condensation open clear lenses in the
// fog and drops run down in jerks, leaving clear trails. Above the roof a low
// cloud deck glows from the light below, and puddles on the path mirror it all.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fog;    // how heavily the panes are fogged with condensation (default 1)
uniform float u_lamps;  // brightness of the grow lights inside           (default 1)
uniform float u_drip;   // how fast the drops run down the glass            (default 1)
uniform float u_mist;   // humid mist inside and the lit cloud above        (default 1)

const float EYE = 1.45;    // eye height above the path
const float FOC = 1.0;     // focal length in frame units
const float PITCH = 0.06;  // upward tilt
const float YAW = 0.78;    // turn along the wall
const float Z0 = 2.3;      // the glass wall plane
const float EAVE = 2.5;    // top of the side wall
const float RIDGE = 4.4;   // roof ridge height
const float RUN = 3.4;     // eave to ridge, horizontal
const float DEPTH = 7.0;   // inside width of the house
const float LAMPY = 2.22;  // height of the grow light bars
const float SILL = 0.55;   // top of the brick knee wall
const float MULL = 0.66;   // glazing bar spacing

vec3 cA, cB, cC, cD, kNight, kMoon, kHot;
float T, fogK, lampK, dripK, mistK, PXS;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(27.619, 157.31))) * 24719.37);
}

float hs3(vec3 p) {
  return fract(sin(dot(p, vec3(19.71, 113.37, 71.93))) * 31867.41);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y);
}

float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hs3(i), hs3(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hs3(i + vec3(0.0, 1.0, 0.0)), hs3(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hs3(i + vec3(0.0, 0.0, 1.0)), hs3(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hs3(i + vec3(0.0, 1.0, 1.0)), hs3(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(p.x * 1.6 - p.y * 1.2, p.x * 1.2 + p.y * 1.6) + vec2(5.3, 1.7);
    a *= 0.5;
  }
  return s;
}

// one row of grow light bars running along the house, seen along a ray
// from point P. blur spreads the light as the fog diffuses it
vec3 lampRow(vec3 P, vec3 rd, float Lz, float seed, float blur) {
  float t = (Lz - P.z) / max(rd.z, 1e-3);
  if (t < 0.0) return vec3(0.0);
  float y = P.y + rd.y * t;
  float X = P.x + rd.x * t;
  float d = abs(y - LAMPY) * rd.z / max(length(rd.yz), 1e-3);
  float sp = blur * 0.035 * (Lz - Z0) + 0.004;
  float fx = fract(X / 1.75 + seed);
  float e = 0.012 + sp * 0.35;
  float on = smoothstep(0.07 - e, 0.07 + e, fx) * smoothstep(0.93 + e, 0.93 - e, fx);
  float w = sqrt(0.00025 + sp * sp);
  float core = 0.016 / w * exp(-d * d / (w * w));
  float halo = 0.01 / (d * d + 0.01 + sp * sp);
  float wide = exp(-d * 1.6);
  vec3 c = kHot * core * on * 2.6 + mix(cB, cA, 0.4) * halo * (0.15 + 0.85 * on) * 0.5
         + mix(cA, cC, 0.5 + 0.5 * sin(X * 0.21 + seed * 6.0)) * wide * 0.1;
  return c * lampK;
}

// a row of potted vines on a bench, as a plane at a fixed depth. Leaves are
// lobed, toothed and translucent, glowing where the lamp light passes
vec4 plants(vec2 q, float seed, float aa, float lit) {
  vec3 col = vec3(0.0);
  float a = 0.0;
  float bench = 0.8;
  float lk = (0.35 + 0.65 * smoothstep(0.9, 2.1, q.y)) * lit * lampK;

  // bench skirt and the pots on it
  if (q.y < bench + 0.3) {
    float sk = smoothstep(aa, -aa, q.y - bench);
    vec3 skc = kNight * 0.8 + cD * 0.05 * (0.6 + 0.4 * vn(vec2(q.x * 3.0, q.y * 40.0)));
    skc += cB * 0.18 * lk * exp(-abs(bench - q.y) * 60.0);
    col = skc; a = sk;
    float pp = 0.31;
    float pi = floor(q.x / pp);
    for (int k = 0; k < 2; k++) {
      float id = pi + float(k);
      float ph = hs(vec2(id, seed + 1.0));
      float pc = (id + (ph - 0.5) * 0.35) * pp;
      float top = bench + 0.13 + 0.07 * hs(vec2(id, seed + 2.0));
      float yy = clamp((q.y - bench) / (top - bench), 0.0, 1.0);
      float hw = pp * (0.24 + 0.08 * ph) * (0.74 + 0.26 * yy);
      float lip = smoothstep(top - 0.025, top - 0.02, q.y);
      hw += 0.01 * lip;
      float pa = smoothstep(aa, -aa, abs(q.x - pc) - hw) * smoothstep(aa, -aa, q.y - top)
               * step(bench - 0.01, q.y);
      float side = (q.x - pc) / max(hw, 1e-3);
      vec3 pcol = cD * (0.12 + 0.08 * vn(vec2(q.x * 30.0, q.y * 9.0))) * (0.6 + 0.4 * side)
                + cB * 0.4 * lk * lip + kHot * 0.15 * lk * lip * smoothstep(0.3, 1.0, side);
      col = mix(col, pcol, pa);
      a = max(a, pa);
    }
  }

  // vines trained up strings, leaves alternating up the stem
  float P = 0.62;
  float i0 = floor(q.x / P);
  for (int k = 0; k < 3; k++) {
    float idx = i0 + float(k) - 1.0;
    float h1 = hs(vec2(idx, seed));
    float h2 = hs(vec2(idx + 7.3, seed + 2.1));
    float base = (idx + 0.5 + (h1 - 0.5) * 0.5) * P;
    float topY = 1.75 + 0.4 * h2;
    float sway = 0.012 * sin(T * 0.35 + idx * 1.7 + seed);
    float sx = base + 0.035 * sin(q.y * 3.1 + idx * 2.3) + sway * (q.y - bench);
    // the stem
    float sw = 0.014 * (1.0 - 0.4 * clamp((q.y - bench) / (topY - bench), 0.0, 1.0));
    float sa = smoothstep(aa, -aa, abs(q.x - sx) - sw) * step(bench + 0.1, q.y) * smoothstep(topY + 0.02, topY - 0.02, q.y);
    sa *= clamp(sw * 2.0 / aa, 0.0, 1.0);
    col = mix(col, cD * 0.15 + cA * 0.25 * lk, sa);
    a = max(a, sa);

    float ci = floor((q.y - 0.95) / 0.2);
    for (int j = 0; j < 4; j++) {
      float cj = ci - float(j) + 1.0;
      float hb = hs(vec2(cj * 1.31 + idx * 5.7, seed + 9.0));
      float yA = 0.95 + (cj + 0.25 * hb) * 0.2;
      if (yA > 0.95 && yA < topY && hb > 0.12) {
        vec2 A = vec2(base + 0.035 * sin(yA * 3.1 + idx * 2.3) + sway * (yA - bench), yA);
        float side = mod(cj, 2.0) < 1.0 ? 1.0 : -1.0;
        float L = 0.26 + 0.2 * fract(hb * 7.3);
        float ang = side * (0.75 + 0.5 * fract(hb * 3.9)) + 0.06 * sin(T * 0.5 + cj + idx * 3.0);
        vec2 dd = vec2(sin(ang), cos(ang));
        vec2 nn = vec2(dd.y, -dd.x);
        vec2 rel = q - A;
        float u = dot(rel, dd) / L;
        if (u > -0.05 && u < 1.08) {
          float uc = clamp(u, 0.0, 1.0);
          float v = dot(rel, nn);
          // droop: the leaf arches over and hangs at the tip
          v += side * (0.35 + 0.25 * hb) * L * uc * uc;
          float lobes = 0.62 + 0.38 * abs(sin(uc * 3.14159 * (2.5 + hb)));
          float teeth = 1.0 - 0.12 * abs(fract(uc * 14.0 + hb * 3.0) - 0.5) * 2.0;
          float w = L * (0.2 + 0.08 * hb) * pow(sin(3.14159 * min(uc * 0.92 + 0.04, 1.0)), 0.7) * lobes * teeth;
          float la = smoothstep(aa, -aa, abs(v) - w) * step(0.0, u) * step(u, 1.0);
          la *= clamp(w * 2.5 / aa, 0.0, 1.0);
          if (la > 0.0) {
            float e = clamp(v / max(w, 1e-4), -1.0, 1.0);
            float vein = smoothstep(0.12, 0.0, abs(e)) + smoothstep(0.06, 0.0, abs(fract(uc * 5.0 - abs(e) * 0.8) - 0.5)) * 0.5;
            float tissue = 0.6 + 0.6 * vn(vec2(uc * 12.0 + hb * 9.0, e * 3.0));
            float trans = lk * tissue * (1.0 - 0.55 * vein);
            float rim = smoothstep(0.65, 1.0, abs(e));
            vec3 lc = kNight * 0.6 + cD * 0.05 + mix(cC, cA, uc) * trans * 0.12 + cB * trans * trans * 0.08
                    + kHot * rim * rim * lk * 0.3;
            col = mix(col, lc, la);
            a = max(a, la);
          }
        }
      }
    }
  }
  return vec4(col, a);
}

// what lies behind the glass along a ray from P: lamp rows, vines, warm mist
vec3 inside(vec3 P, vec3 rd, float blur) {
  vec3 pr = P;
  float pxs = PXS;
  // far glass wall: night beyond, faint frame
  float tb = (Z0 + DEPTH - P.z) / max(rd.z, 1e-3);
  vec3 B = P + rd * tb;
  vec3 col = kNight * 0.7 + mix(cA, cC, smoothstep(-6.0, 12.0, B.x)) * 0.12 * exp(-abs(B.y - 1.9) * 1.4) * lampK;
  float dist = length(P);

  col += lampRow(P, rd, Z0 + 6.0, 0.37, blur);
  for (int r = 0; r < 4; r++) {
    float fr = float(r);
    float zk = r == 0 ? 5.2 : (r == 1 ? 3.55 : (r == 2 ? 1.85 : 0.45));
    float t = zk / max(rd.z, 1e-3);
    vec3 Q = P + rd * t;
    float aa = (dist + t) * pxs * 1.5 + blur * 0.035 * zk;
    vec4 pl = plants(Q.xy, 3.0 + fr * 7.0, aa, 0.55 + 0.15 * fr);
    vec3 pc = mix(pl.rgb, col, (1.0 - 0.18 * fr) * 0.45 * blur);
    col = mix(col, pc, pl.a);
    if (r < 3) {
      float lz = r == 0 ? 4.4 : (r == 1 ? 2.7 : 1.0);
      col += lampRow(P, rd, Z0 + lz, 0.11 + fr * 0.29, blur);
    }
  }

  // warm humid mist, billowing in the lamp light
  vec3 acc = vec3(0.0);
  float tr = 1.0;
  float tt = 0.15 + 0.3 * hs(gl_FragCoord.xy);
  for (int i = 0; i < 10; i++) {
    vec3 p = P + rd * tt;
    if (p.z > Z0 + DEPTH || p.y > RIDGE) break;
    vec3 wp = p * 1.2 + vec3(T * 0.07, -T * 0.025, T * 0.03);
    float n = vn3(wp) * 0.65 + vn3(wp * 2.3 + 4.0) * 0.35;
    float dens = mistK * 0.16 * smoothstep(0.35, 0.75, n) * smoothstep(0.4, 2.0, p.y);
    float li = exp(-length(vec2(p.y - LAMPY, p.z - Z0 - 1.0)) * 2.0)
             + exp(-length(vec2(p.y - LAMPY, p.z - Z0 - 2.7)) * 2.0)
             + exp(-length(vec2(p.y - LAMPY, p.z - Z0 - 4.4)) * 2.0);
    acc += tr * dens * li * mix(cA, cC, n) * 1.6 * lampK * 0.6;
    tr *= exp(-dens * 0.6);
    tt += 0.6;
  }
  return acc + tr * col;
}

// condensation on a pane: x = how clear (beads and trails), yz = lens
// normal, w = bright crescent where a bead images the lamps
vec4 condense(vec2 g, float fpw, float pB, float pT) {
  float clear = 0.0;
  vec2 nrm = vec2(0.0);
  float rim = 0.0;
  for (int k = 0; k < 2; k++) {
    float cs = k == 0 ? 0.028 : 0.07;
    float lod = smoothstep(5.0, 12.0, cs / max(fpw, 1e-5));
    vec2 c = g / cs + float(k) * 13.7;
    vec2 id = floor(c);
    vec2 f = fract(c) - 0.5;
    float h = hs(id + float(k) * 31.0);
    vec2 o = (vec2(hs(id + 3.7), hs(id + 8.1)) - 0.5) * 0.45;
    float r = (0.1 + 0.27 * hs(id + 5.3)) * step(k == 0 ? 0.45 : 0.8, h) * (k == 0 ? 1.0 : 0.8);
    vec2 dv = (f - o) * vec2(1.0, 0.85 + 0.3 * step(0.0, f.y - o.y));
    float d = length(dv) / max(r, 1e-3);
    float aa = fpw / cs / max(r, 1e-3);
    float inb = smoothstep(1.0 + aa, 1.0 - aa, d) * step(0.01, r);
    clear = max(clear, inb * lod);
    nrm += dv / max(r, 1e-3) * inb * lod;
    rim += smoothstep(0.45, 0.95, d) * inb * smoothstep(0.0, -0.4, dv.y / max(r, 1e-3)) * lod;
    clear += (1.0 - lod) * 0.08;
  }

  // running drops: each column sheds a drop now and then that slips down in
  // jerks, wiping a clear trail behind it
  float cw = 0.12;
  float colId = floor(g.x / cw);
  float hc = hs(vec2(colId, 4.4));
  float lodR = smoothstep(4.0, 10.0, cw / max(fpw, 1e-5));
  if (hc > 0.35) {
    float len = pT - pB;
    float spd = (0.05 + 0.07 * hs(vec2(colId, 6.2))) * dripK;
    float ph = T * spd / len + hc * 7.0;
    float cyc = floor(ph);
    float fr = fract(ph);
    float m = fr * 5.0;
    float pos = (floor(m) + smoothstep(0.0, 0.45, fract(m))) / 5.0;
    float headH = pT - 0.04 - pos * (len - 0.08);
    float amp = smoothstep(0.0, 0.05, fr) * smoothstep(1.0, 0.88, fr) * lodR;
    float hq = hs(vec2(colId, cyc));
    float wx = (colId + 0.3 + 0.4 * hq) * cw + 0.01 * sin(g.y * 21.0 + hq * 40.0) + 0.004 * sin(g.y * 63.0 + hq * 9.0);
    float dx = g.x - wx;
    float above = g.y - headH;
    float tw = 0.003 + 0.004 * exp(-above * 4.0);
    float trail = step(0.0, above) * step(g.y, pT) * smoothstep(tw + fpw, tw - fpw, abs(dx))
                * (0.55 + 0.45 * exp(-above * 1.2));
    vec2 hd = vec2(dx, (g.y - headH) * 0.75);
    float hr = 0.011 + 0.004 * hq;
    float dh = length(hd) / hr;
    float head = smoothstep(1.0 + fpw / hr, 1.0 - fpw / hr, dh);
    clear = max(clear, max(trail * 0.9, head) * amp);
    nrm += hd / hr * head * amp * 1.5;
    rim += smoothstep(0.4, 0.95, dh) * head * smoothstep(0.0, -0.3, hd.y / hr) * amp * 1.3;
  }
  return vec4(clamp(clear, 0.0, 1.0), nrm, clamp(rim, 0.0, 1.5));
}

// a fogged pane: the inside seen through condensation, with the fog lit
// from behind and beads catching the lamps
vec3 glass(vec3 P, vec3 rd, vec2 g, float fpw, float pB, float pT, vec3 N) {
  vec4 cd = condense(g, fpw, pB, pT);
  float pch = vn(g * 2.2 + vec2(0.0, T * 0.01)) - 0.5;
  float fogA = clamp(fogK * (0.82 + 0.35 * pch + 0.12 * smoothstep(pB + 0.3, pB, g.y)), 0.0, 1.0) * (1.0 - cd.x);
  vec3 dir = normalize(rd + vec3(cd.y, cd.z, 0.0) * 0.07);
  vec3 inC = inside(P, dir, fogA);
  float hiK = smoothstep(0.6, 2.4, P.y);
  vec3 veil = (mix(cD * 0.25, cA, hiK * hiK) * 0.09 + cB * 0.04 * (0.5 + pch) * hiK) * lampK
            + kNight * 1.5 * (1.0 - hiK);
  vec3 col = mix(inC, inC * 0.7 + veil, fogA * 0.6);
  col += kHot * cd.w * 0.35 * lampK * (0.5 + hiK);
  // the outer face reflects the cold night, more at grazing angles
  float fres = pow(1.0 - abs(dot(rd, N)), 4.0);
  col += kMoon * 0.1 * fres * (0.6 + 0.4 * fogA);
  return col;
}

// a cheap stand-in for the lit wall, for the puddle reflections
vec3 wallCheap(vec2 g) {
  if (g.y < 0.0) return kNight;
  if (g.y < SILL) return kNight * 0.8 + cD * 0.03;
  if (g.y > EAVE) return kNight * 1.5 + cA * 0.05 * mistK;
  float dm = abs(fract(g.x / MULL + 0.5) - 0.5) * MULL;
  float fr = smoothstep(0.02, 0.05, dm) * smoothstep(0.02, 0.05, abs(g.y - 1.55));
  float hiK = smoothstep(0.6, 2.4, g.y);
  vec3 c = mix(cD, cA, hiK) * 0.35 + kHot * 0.3 * exp(-(g.y - 2.1) * (g.y - 2.1) * 12.0);
  return (c * fr + kNight) * lampK;
}

vec3 sky(vec3 rd) {
  float el = max(rd.y, 0.0);
  vec3 col = kNight * (0.8 + 1.5 * exp(-el * 5.0)) + cD * 0.07 * exp(-el * 6.0) * mistK;
  vec2 cp = rd.xz / max(rd.y, 0.04) * 40.0;
  vec2 w = vec2(T * 0.5, T * 0.2);
  float n = fbm(cp * 0.02 + w * 0.02);
  float n2 = fbm(cp * 0.06 - w * 0.03 + 3.0);
  float d = smoothstep(0.32, 0.72, n + 0.3 * (n2 - 0.5)) * smoothstep(0.0, 0.08, rd.y);
  float lit = exp(-el * 3.5) * (0.55 + 0.45 * smoothstep(-0.2, 0.8, rd.x));
  vec3 under = mix(cD, cA, smoothstep(0.4, 0.9, n)) * 0.45 + cB * 0.25 * smoothstep(0.55, 0.85, n2) * smoothstep(0.5, 0.0, d);
  col = mix(col, under * lit * mistK + kNight * 0.6, d * 0.92);
  // moonlit cold tops where the cloud thins high overhead
  col += kMoon * 0.07 * d * smoothstep(0.08, 0.5, rd.y) * (0.4 + 0.6 * smoothstep(0.5, 0.8, n2));
  // a few stars in the gaps
  vec2 sg = rd.xy / max(rd.z, 0.2) * 150.0;
  vec2 si = floor(sg);
  vec2 sf = fract(sg) - 0.5;
  col += kMoon * step(0.985, hs(si + 2.0)) * exp(-dot(sf, sf) * 30.0) * 0.4 * (1.0 - d) * smoothstep(0.15, 0.45, rd.y);
  return col;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  cA = c0; cB = c1; cC = c2; cD = c3;
  kHot = mix(c1, vec3(1.0), 0.65);
  kNight = vec3(0.006, 0.014, 0.038);
  kMoon = vec3(0.25, 0.36, 0.55);

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  T = u_time;
  fogK = clamp(u_fog, 0.0, 2.0);
  lampK = clamp(u_lamps, 0.0, 2.0);
  dripK = clamp(u_drip, 0.0, 3.0);
  mistK = clamp(u_mist, 0.0, 2.0);
  PXS = 1.0 / (mn * FOC);

  vec3 rd = normalize(vec3(uv, FOC));
  float cp = cos(PITCH), sp = sin(PITCH);
  rd = vec3(rd.x, rd.y * cp + rd.z * sp, rd.z * cp - rd.y * sp);
  float cy = cos(YAW), sy = sin(YAW);
  rd = vec3(rd.x * cy + rd.z * sy, rd.y, rd.z * cy - rd.x * sy);
  vec3 ro = vec3(0.0, EYE, 0.0);

  float tw = rd.z > 1e-3 ? Z0 / rd.z : 1e5;
  vec3 Pw = ro + rd * tw;
  float tg = rd.y < -1e-4 ? EYE / (-rd.y) : 1e5;
  vec3 Nr = normalize(vec3(0.0, RUN, -(RIDGE - EAVE)));
  float tr = dot(vec3(0.0, EAVE, Z0) - ro, Nr) / min(dot(rd, Nr), -1e-4);
  vec3 Pr = ro + rd * tr;

  vec3 col;
  if (tg < tw) {
    // the wet gravel path, puddles mirroring the wall and the glow above
    vec3 G = ro + rd * tg;
    float fpg = tg * PXS / max(-rd.y, 0.05);
    float lodG = smoothstep(0.02, 0.005, fpg);
    float grav = mix(0.5, vn(G.xz * 38.0) * 0.6 + vn(G.xz * 90.0) * 0.4, lodG);
    float wet = smoothstep(0.48, 0.56, fbm(G.xz * vec2(0.9, 1.4) + 2.0));
    float near = exp(-(Z0 - G.z) * 1.1);
    float dm = abs(fract(G.x / MULL + 0.5) - 0.5) * MULL;
    float stripe = 0.55 + 0.45 * smoothstep(0.015, 0.05, dm);
    vec3 gc = kNight * (0.6 + 0.8 * grav) + (cA * 0.08 + cD * 0.05) * near * stripe * lampK * (0.5 + grav);
    vec2 rip = vec2(vn(G.xz * 6.0 + T * 0.15), vn(G.xz * 6.0 - T * 0.12 + 5.0)) - 0.5;
    vec3 rr = normalize(vec3(rd.x + rip.x * 0.008, -rd.y, rd.z + rip.y * 0.008));
    vec3 rc;
    float tz = (Z0 - G.z) / max(rr.z, 1e-3);
    vec3 R = G + rr * tz;
    if (R.y < EAVE) rc = wallCheap(R.xy);
    else rc = sky(rr);
    col = mix(gc, rc * 0.75 + kMoon * 0.015, wet);
    col += kMoon * 0.04 * wet * pow(1.0 + rd.y, 6.0);
  } else if (Pw.y < EAVE && tw < 1e4) {
    vec2 g = Pw.xy;
    float fpw = tw * PXS / max(rd.z, 0.12);
    vec3 N = vec3(0.0, 0.0, -1.0);
    if (g.y < SILL) {
      // brick knee wall in running bond, worn and damp
      vec2 b = vec2(g.x / 0.23, g.y / 0.075);
      b.x += 0.5 * mod(floor(b.y), 2.0);
      vec2 bi = floor(b);
      vec2 bf = fract(b);
      float lodB = smoothstep(4.0, 9.0, 0.075 / fpw);
      float mort = mix(1.0, smoothstep(0.0, 0.08, bf.y) * smoothstep(0.0, 0.035, min(bf.x, 1.0 - bf.x)), lodB);
      float bv = 0.6 + 0.6 * hs(bi) ;
      float wear = vn(g * 25.0);
      vec3 bc = (cD * 0.09 * bv + kNight * 0.8) * (0.6 + 0.6 * wear) * (0.35 + 0.65 * mort);
      bc += cA * 0.05 * lampK * smoothstep(SILL - 0.2, SILL, g.y) * mort;
      bc += kMoon * 0.025 * (1.0 - mort) * 0.0 + kMoon * 0.02 * wear * mort;
      // capping stone along the sill catches the glow
      float cap = smoothstep(SILL - 0.05 - fpw, SILL - 0.05, g.y);
      bc = mix(bc, kNight * 1.5 + cB * 0.2 * lampK * smoothstep(SILL - 0.05, SILL, g.y) + kMoon * 0.04, cap);
      col = bc;
    } else {
      float pB = g.y < 1.55 ? SILL : 1.55;
      float pT = g.y < 1.55 ? 1.55 : EAVE;
      col = glass(Pw, rd, g, fpw, pB, pT, N);
      // the steel frame: glazing bars, transom and eave rail
      float dm = abs(fract(g.x / MULL + 0.5) - 0.5) * MULL;
      float hwM = 0.02;
      float fa = smoothstep(hwM + fpw, hwM - fpw, dm) * clamp(hwM * 2.0 / fpw, 0.0, 1.0);
      float prof = (fract(g.x / MULL + 0.5) - 0.5) * MULL / hwM;
      float dT = abs(g.y - 1.55);
      float faT = smoothstep(0.025 + fpw, 0.025 - fpw, dT);
      float dS = g.y - SILL;
      float faS = smoothstep(0.035 + fpw, 0.035 - fpw, dS);
      float dE = EAVE - g.y;
      float faE = smoothstep(0.07 + fpw, 0.07 - fpw, dE);
      float frame = max(max(fa, faT), max(faS, faE));
      float rust = vn(g * vec2(40.0, 6.0));
      vec3 st = kNight * (1.0 + 0.6 * rust) + cD * 0.03;
      st += kMoon * 0.09 * smoothstep(-0.2, 1.0, -prof) * fa;
      st += kHot * 0.18 * lampK * smoothstep(0.6, 1.0, abs(prof)) * fa * smoothstep(0.8, 2.3, g.y);
      st += (cB * 0.2 * lampK + kMoon * 0.04) * smoothstep(0.02, 0.0, abs(dT - 0.02)) * faT;
      st += kMoon * 0.08 * smoothstep(0.06, 0.07, dE) * faE + cA * 0.12 * lampK * smoothstep(0.015, 0.0, dE) * faE;
      col = mix(col, st, frame);
    }
  } else if (tr > 0.0 && Pr.z > Z0 && Pr.z < Z0 + RUN && rd.y > 0.0) {
    // the near roof slope, glass lit from beneath
    float along = length(Pr.yz - vec2(EAVE, Z0));
    vec2 g = vec2(Pr.x, along);
    float fpw = tr * PXS / max(abs(dot(rd, Nr)), 0.12);
    col = glass(Pr, rd, g, fpw, 0.0, 3.9, -Nr);
    float dm = abs(fract(g.x / MULL + 0.5) - 0.5) * MULL;
    float fa = smoothstep(0.02 + fpw, 0.02 - fpw, dm) * clamp(0.04 / fpw, 0.0, 1.0);
    float gut = smoothstep(0.12 + fpw, 0.12 - fpw, along);
    float ridge = smoothstep(3.75 - fpw, 3.75 + fpw, along);
    vec3 st = kNight * 1.2 + cA * 0.08 * lampK * fa;
    col = mix(col, st, max(fa, max(ridge, gut)));
    col += kMoon * 0.12 * gut * smoothstep(0.1, 0.12, along) + kMoon * 0.06 * ridge;
  } else {
    col = sky(rd);
    // glow pouring up from the roof into the humid air
    col += mix(cA, cB, 0.3) * 0.16 * mistK * lampK * exp(-max(rd.y - 0.05, 0.0) * 7.0);
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
