// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// anvil (Bloom) - a night storm line over a flooded plain. A tall cumulonimbus
// with a sheared anvil stands left, a second tower and a low cell stand deeper
// right, and a far bank lies on the horizon. Lights climb and wander inside the
// cells, handing their glow from cell to cell so the storm never goes dark.
// Ragged scud races across in front, rain curtains sway under the bases, and the
// flood water in the lower third mirrors the lit towers through a wind chop.
// A reed bank in the near left corner stands black against the reflections.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // brightness of the lights inside the cells (default 1.0)
uniform float u_drift;  // pace of the boiling cloud, scud and wandering lights (default 1.0)
uniform float u_rain;   // density of the rain curtains under the cells (default 0.7)
uniform float u_chop;   // wind chop breaking up the reflections on the flood (default 1.0)

const float WATER_Y = -4.6;

vec3 c0, c1, c2, c3;

float hh2(vec2 p) {
  p = fract(p * vec2(271.37, 193.71));
  p += dot(p, p.yx + 27.53);
  return fract(p.x * p.y * 2.317);
}
float hh3(vec3 p) {
  p = fract(p * vec3(0.6217, 0.4391, 0.8153));
  p += dot(p, p.zxy + vec3(17.23, 9.41, 3.67));
  return fract((p.x + p.y) * p.z * 3.71);
}
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hh3(i);
  float b = hh3(i + vec3(1.0, 0.0, 0.0));
  float c = hh3(i + vec3(0.0, 1.0, 0.0));
  float d = hh3(i + vec3(1.0, 1.0, 0.0));
  float e = hh3(i + vec3(0.0, 0.0, 1.0));
  float g = hh3(i + vec3(1.0, 0.0, 1.0));
  float h = hh3(i + vec3(0.0, 1.0, 1.0));
  float k = hh3(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
             mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float vn1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hh2(vec2(i, 7.1)), hh2(vec2(i + 1.0, 7.1)), f);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// a convective column: swells with height in tiers and rounds at the crown
float column(vec3 p, vec2 c, float yb, float yt, float rb, float rt) {
  float h = clamp((p.y - yb) / (yt - yb), 0.0, 1.0);
  float r = mix(rb, rt, h) * (0.92 + 0.08 * sin(h * 7.0 + c.x));
  float dr = length(p.xz - c) - r;
  float dy = max(yb - p.y, p.y - yt);
  return max(dr, dy);
}
float blob(vec3 p, vec3 c, vec3 r) {
  vec3 q = (p - c) / r;
  return (length(q) - 1.0) * min(r.x, min(r.y, r.z));
}

// the storm line: anvil cell left, second tower and low cell right, far bank
float stormSdf(vec3 p) {
  float d = column(p, vec2(-4.4, 11.0), -2.3, 6.4, 3.4, 2.4);
  d = smin(d, blob(p, vec3(-0.2, 7.7, 11.8), vec3(10.5, 0.8, 4.6)), 1.6);
  d = smin(d, blob(p, vec3(-6.8, 3.0, 10.6), vec3(2.2, 2.6, 2.0)), 1.0);
  d = smin(d, column(p, vec2(4.8, 17.0), -2.2, 4.8, 3.0, 2.0), 0.8);
  d = smin(d, blob(p, vec3(7.8, 5.3, 17.4), vec3(4.8, 0.7, 2.6)), 1.1);
  d = min(d, column(p, vec2(12.6, 13.4), -2.5, 1.8, 2.8, 1.8));
  d = smin(d, blob(p, vec3(11.4, 1.0, 13.0), vec3(2.0, 1.6, 1.8)), 0.8);
  d = min(d, blob(p, vec3(0.0, -1.4, 38.0), vec3(30.0, 1.7, 4.0)));
  d = min(d, blob(p, vec3(4.0, 12.6, 26.0), vec3(32.0, 1.4, 12.0)));
  return d;
}

// cloud density: the outline eroded by four octaves of boiling, rising billows
float cloudDens(vec3 p, float tm, out float sd) {
  sd = stormSdf(p);
  if (sd > 2.6) return 0.0;
  vec3 off = vec3(tm * 0.05, -tm * 0.11, tm * 0.02);
  float lobe = vn3(p * 0.28 + off * 0.4 + vec3(4.2, 0.0, 1.7));
  vec3 q = p * 0.62 + off;
  float n = 0.5 * vn3(q);
  q = q * 2.03 + vec3(3.1, 1.7, 7.3) + off * 0.9;
  n += 0.25 * vn3(q);
  q = q * 2.11 + vec3(5.9, 2.3, 1.1) - off * 0.5;
  n += 0.15 * vn3(q);
  q = q * 1.97 + vec3(1.3, 8.1, 4.7);
  n += 0.10 * vn3(q);
  // billows: big lobes carve the outline, fine octaves fray the rims
  float d = sd - (n - 0.5) * 3.0 - (lobe - 0.5) * 2.2;
  return smoothstep(0.0, 0.45, -d);
}

// scud: a ragged low band in front of the storm that races left to right
float scudDens(vec3 p, float tm) {
  float slab = exp(-(p.y + 2.5) * (p.y + 2.5) * 6.0)
             * smoothstep(2.0, 4.0, p.z) * smoothstep(10.0, 7.0, p.z);
  if (slab < 0.01) return 0.0;
  vec3 q = vec3(p.x * 0.55 - tm * 0.16, p.y * 1.4, p.z * 0.7);
  float n = 0.6 * vn3(q) + 0.4 * vn3(q * 2.3 + vec3(1.7, 4.1, tm * 0.03));
  return slab * smoothstep(0.52, 0.78, n) * 0.9;
}

// rain curtains: swaying streaked veils between the cell bases and the flood
float rainDens(vec3 p, float tm) {
  float sw = sin(tm * 0.07) * 0.6;
  vec2 xz = p.xz - vec2(sw * (p.y + 2.0) * 0.4, 0.0);
  float a = smoothstep(2.7, 0.6, length(xz - vec2(-4.0, 11.0)));
  float b = smoothstep(2.2, 0.5, length(xz - vec2(5.0, 17.0))) * 0.8;
  float c = smoothstep(1.8, 0.4, length(xz - vec2(12.4, 13.4))) * 0.6;
  float m = (a + b + c) * smoothstep(-1.5, -2.5, p.y) * smoothstep(-4.8, -3.8, p.y);
  if (m < 0.001) return 0.0;
  float s = vn3(vec3(xz.x * 2.8, p.y * 0.2 + tm * 0.9, xz.y * 2.8));
  s *= 0.4 + vn3(vec3(xz.x * 0.6 + tm * 0.05, tm * 0.04, xz.y * 0.6));
  return m * s;
}

// slow cyclic blend through the four theme colours
vec3 pal(float h) {
  h = fract(h) * 4.0;
  float w0 = max(0.0, 1.0 - abs(h)) + max(0.0, 1.0 - abs(h - 4.0));
  float w1 = max(0.0, 1.0 - abs(h - 1.0));
  float w2 = max(0.0, 1.0 - abs(h - 2.0));
  float w3 = max(0.0, 1.0 - abs(h - 3.0));
  return c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3;
}

// a wandering interior light: climbs and drifts along its cell
vec3 lightPos(vec3 base, vec3 span, float k, float tm) {
  return base + span * vec3(sin(tm * 0.071 + k * 5.1),
                            sin(tm * 0.093 + k * 2.7),
                            cos(tm * 0.057 + k * 3.9));
}
// its swell: staggered phases so the glow passes between cells, never all dark
vec3 lightCol(float k, float hue, float tm) {
  float sw = 0.5 + 0.5 * sin(tm * (0.21 + 0.06 * fract(k * 7.3)) + k * 6.283);
  sw = sw * sw * (3.0 - 2.0 * sw);
  return pal(hue + 0.05 * sin(tm * 0.02 + k * 9.0) + tm * 0.004) * (0.5 + 0.8 * sw);
}
vec3 lightAt(vec3 p, vec3 lp, vec3 lc, float fall) {
  vec3 d = p - lp;
  return lc / (1.0 + dot(d, d) * fall);
}

// wind chop height on the flood, stretched along the wind
float chopH(vec2 w, float tm) {
  float n = vn3(vec3(w.x * 1.3 - tm * 0.35, w.y * 3.2, tm * 0.25));
  n += 0.5 * vn3(vec3(w.x * 3.1 + tm * 0.2, w.y * 7.0 - tm * 0.3, 5.0));
  return n;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float pr  = max(u_pixelRatio, 0.5);
  float aspect = res.x / res.y;
  float refScale = min(res.x, res.y) / (pr * 400.0);
  vec2  uv  = fc / res;
  vec2  q   = (2.0 * fc - res) / res.y;

  float tm    = u_time * clamp(u_drift, 0.0, 3.0) + 40.0;
  float glow  = clamp(u_glow, 0.0, 2.5);
  float rainK = clamp(u_rain, 0.0, 1.5);
  float chop  = clamp(u_chop, 0.0, 2.0);

  // camera low over the flood, looking slightly up at the storm line
  float foc = 1.5 * clamp(aspect / 1.6, 0.65, 1.0);
  vec3 ro = vec3(sin(u_time * 0.02) * 0.8 + 1.2, -3.2, -4.0);
  vec3 rd = normalize(vec3(q.x, q.y + 0.4, foc));

  // interior lights: three in the anvil cell, one per other cell, one far off
  vec3 p0 = lightPos(vec3(-4.4, 0.8, 11.0), vec3(1.2, 2.6, 0.9), 0.13, tm);
  vec3 p1 = lightPos(vec3(-1.4, 6.9, 11.5), vec3(4.4, 0.4, 1.2), 0.61, tm);
  vec3 p2 = lightPos(vec3(4.8, 1.4, 17.0), vec3(1.3, 2.2, 1.0), 0.37, tm);
  vec3 p3 = lightPos(vec3(12.5, -0.4, 13.4), vec3(1.0, 1.1, 0.8), 0.84, tm);
  vec3 p4 = lightPos(vec3(-3.0, -1.0, 37.0), vec3(12.0, 0.3, 1.0), 0.52, tm);
  vec3 p5 = lightPos(vec3(-6.2, 3.4, 10.6), vec3(0.9, 1.4, 0.8), 0.29, tm);
  vec3 l0 = lightCol(0.13, 0.0, tm) * 2.4 * glow;
  vec3 l1 = lightCol(0.61, 0.5, tm) * 2.2 * glow;
  vec3 l2 = lightCol(0.37, 0.25, tm) * 2.2 * glow;
  vec3 l3 = lightCol(0.84, 0.75, tm) * 1.9 * glow;
  vec3 l4 = lightCol(0.52, 0.6, tm) * 3.0 * glow;
  vec3 l5 = lightCol(0.29, 0.85, tm) * 1.8 * glow;

  vec3  ldir = normalize(vec3(-0.4, 0.9, 0.3));   // faint skylight from above
  vec3  o = ro, d = rd;
  float tg = d.y < 0.0 ? (WATER_Y - o.y) / d.y : 1e5;
  bool  refl = false, land = false;
  vec3  gHit = vec3(0.0);
  float path0 = 0.0;
  vec3  col = vec3(0.0);
  float T = 1.0;
  float tt = 4.0 + hh2(fc) * 0.3;

  for (int i = 0; i < 64; i++) {
    if (!refl && tt > tg) {
      vec3 g = o + d * tg;
      float shore = 16.0 + 7.0 * vn1(g.x * 0.13 + 3.0);
      if (g.z < shore) {
        // the flood: reflect the ray through the chop and keep marching
        float amp = chop * 0.09 / (1.0 + tg * 0.08);
        float e = 0.06;
        float h0 = chopH(g.xz, tm);
        float hx = chopH(g.xz + vec2(e, 0.0), tm);
        float hz = chopH(g.xz + vec2(0.0, e), tm);
        vec3 n = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
        float ci = clamp(-dot(d, n), 0.0, 1.0);
        float fr = 0.3 + 0.6 * pow(1.0 - ci, 3.0);
        col += T * c0 * 0.006;
        T *= fr;
        d = reflect(d, n);
        d.y = abs(d.y);
        o = g;
        path0 = tg;
        tt = 0.05;
        refl = true;
        tg = 1e5;
      } else {
        land = true;
        gHit = g;
        break;
      }
    }
    if (tt > 52.0) break;
    float dt = 0.3 + tt * 0.024;
    vec3 p = o + d * tt;
    float sd;
    float dens = cloudDens(p, tm, sd) + scudDens(p, tm);
    float rn = rainK * 0.9 * rainDens(p, tm);
    float tot = dens + rn;
    if (tot > 0.004) {
      vec3 L = lightAt(p, p0, l0, 0.42) + lightAt(p, p1, l1, 0.4)
             + lightAt(p, p2, l2, 0.42) + lightAt(p, p3, l3, 0.5)
             + lightAt(p, p4, l4, 0.07) + lightAt(p, p5, l5, 0.5);
      L *= 1.6;
      float sd2;
      float up = cloudDens(p + ldir * 0.8, tm, sd2);
      float lit = 1.0 - 0.8 * up;
      float core = smoothstep(1.4, -1.6, sd);
      float hgt = clamp((p.y + 3.0) / 9.0, 0.0, 1.0);
      vec3 amb = mix(c0 * 0.03, c0 * 0.07 + c1 * 0.01, hgt) * (0.2 + 0.8 * lit * lit);
      float rim = dens * (1.0 - dens) * 4.0;
      vec3 emit = amb + L * (0.25 + 0.75 * core) * (0.55 + 0.45 * lit) + L * rim * 0.35;
      emit = (emit * dens + (L * 0.7 + amb) * rn) / max(tot, 1e-3);
      float fog = mix(1.0, 0.5, smoothstep(14.0, 44.0, tt + path0));
      float a = 1.0 - exp(-(dens * 1.7 + rn) * dt);
      col += T * a * emit * fog;
      T *= 1.0 - a;
    }
    vec3 Lair = lightAt(p, p0, l0, 0.5) + lightAt(p, p2, l2, 0.5) + lightAt(p, p3, l3, 0.6);
    col += T * Lair * 0.006 * dt * exp(-max(sd, 0.0) * 0.6);
    if (T < 0.02) break;
    tt += dt;
  }

  // night sky: deep blue ground, a faint low airglow, stars in the clear gaps
  vec3 sky = c0 * 0.035 * (0.35 + 0.9 * clamp(d.y + 0.4, 0.0, 1.0));
  sky += c1 * 0.022 * exp(-max(d.y, 0.0) * 9.0);
  if (!refl) {
    vec2  sp = fc / (22.0 * refScale * pr);
    vec2  si = floor(sp);
    float sh = hh2(si + 3.7);
    vec2  so = (vec2(hh2(si + 1.9), hh2(si + 6.3)) - 0.5) * 0.5;
    float sdd = length(fract(sp) - 0.5 - so);
    float star = step(0.985, sh) * smoothstep(0.11, 0.0, sdd)
               * (0.65 + 0.35 * sin(u_time * 0.4 + sh * 70.0));
    sky += mix(c0, vec3(1.0), 0.7) * star * 0.45 * smoothstep(0.3, 0.7, uv.y);
  }

  // far land beyond the flood: dark fields lit in pools, a line of town lights
  if (land) {
    vec3 g = gHit;
    float field = 0.6 + 0.4 * vn3(vec3(g.xz * vec2(0.35, 0.9), 1.0));
    vec3 gl = lightAt(g, p0, l0, 0.14) + lightAt(g, p2, l2, 0.14)
            + lightAt(g, p3, l3, 0.18) + lightAt(g, p4, l4, 0.05);
    sky = c0 * 0.008 + gl * 0.2 * field;
    float row = smoothstep(24.0, 32.0, g.z) * (1.0 - smoothstep(46.0, 60.0, g.z));
    vec2 tc = g.xz * vec2(1.4, 0.35);
    vec2 ti = floor(tc);
    float th = hh2(ti + 11.0);
    float td = length((fract(tc) - 0.5) * vec2(1.0, 4.0));
    float town = step(0.86, th) * smoothstep(0.35, 0.0, td) * row;
    sky += mix(c2, vec3(1.0), 0.3) * town * 0.7;
  }
  col += sky * T;

  // near reed bank in the lower left: a black mud spit with swaying stalks
  vec3 avgL = (l0 + l1 + l2 + l3 + l5) * 0.2;
  float x = uv.x * aspect;
  float reach = smoothstep(0.42, 0.04, uv.x);
  float bankTop = (0.05 + 0.06 * vn1(x * 6.0) + 0.02 * vn1(x * 23.0)) * reach - 0.012;
  float aa = 1.5 / res.y;
  float bank = smoothstep(bankTop + aa, bankTop - aa, uv.y);
  float tuft = smoothstep(0.35, 0.7, vn1(x * 9.0 + 2.0));   // reeds grow in clumps
  float reed = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float dens = 55.0 + fk * 31.0;
    float cell = floor(x * dens + fk * 0.37);
    float hr = hh2(vec2(cell, fk * 13.1));
    float present = step(0.58 - 0.3 * tuft, hr) * step(0.0, bankTop);
    float len = (0.06 + 0.22 * hh2(vec2(cell, 4.7 + fk)) * (0.5 + 0.5 * tuft))
              * (1.0 - 0.3 * fk) * reach;
    float h = (uv.y - bankTop) / max(len, 1e-3);
    float lean = (hh2(vec2(cell, 9.3 + fk)) - 0.4) * 0.5;
    float sway = sin(u_time * 0.9 * clamp(u_drift, 0.3, 3.0) + cell * 0.71 + x * 2.0) * 0.32
               + 0.18 * sin(u_time * 0.37 + cell * 1.9);
    float fx = fract(x * dens + fk * 0.37) - 0.5 - (hr - 0.5) * 0.4 - (sway + lean) * h * h;
    float wpx = (2.0 * (1.0 - h) + 0.6) * pr;
    float head = smoothstep(0.78, 0.86, h) * smoothstep(1.0, 0.92, h) * step(0.7, hr) * 1.8 * pr;
    float dxp = abs(fx) * res.y / dens;
    float m = smoothstep(wpx + head + 0.8 * pr, wpx + head - 0.8 * pr, dxp);
    m *= step(0.0, h) * smoothstep(1.0, 0.97, h) * present;
    reed = max(reed, m * (1.0 - 0.25 * fk));
  }
  float occ = max(bank, reed);
  vec3 rimC = avgL * 0.05 * (0.5 + 0.5 * smoothstep(bankTop - 0.02, bankTop, uv.y));
  col = mix(col, c0 * 0.004 + rimC, occ);

  col = col / (1.0 + col * 0.4);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
