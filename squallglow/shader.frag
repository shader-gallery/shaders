// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Squallglow - a night storm seen from a low wet plain. Towering storm cells
// stand at several distances, their anvils leaning downwind, and slow cold
// glows wander inside them, swelling and fading without ever flashing. Rain
// shafts hang under the cloud bases, haze lies between the layers, a distant
// town warms the cloud bottoms with ember light, and the flooded fields in the
// foreground mirror the glows.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // strength of the glows inside the clouds (default 1)
uniform float u_drift;  // how fast the glows wander and the clouds churn (default 1)
uniform float u_haze;   // density of the haze between the storm cells (default 1)
uniform float u_rain;   // density of the rain shafts under the cloud bases (default 1)

const float EYE = 1.2;     // eye height above the plain
const float FOC = 1.05;    // focal length in frame units
const float PITCH = 0.27;  // upward tilt of the view
const float TMAX = 115.0;  // far end of the march
const vec3 TOWN = vec3(1.0, 0.43, 0.13);

float h1(vec3 p) {
  return fract(sin(dot(p, vec3(41.37, 289.11, 97.53))) * 51731.29);
}

float h2(vec2 p) {
  return fract(sin(dot(p, vec2(63.71, 211.47))) * 39187.13);
}

float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(h1(i), h1(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(h1(i + vec3(0.0, 1.0, 0.0)), h1(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(h1(i + vec3(0.0, 0.0, 1.0)), h1(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(h1(i + vec3(0.0, 1.0, 1.0)), h1(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float n1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h2(vec2(i, 3.7)), h2(vec2(i + 1.0, 3.7)), f);
}

// billowed fbm: rounded lumps like the cauliflower tops of a storm cell
float billow(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    float v = n3(p);
    s += a * (1.0 - abs(2.0 * v - 1.0));
    p = vec3(p.y * 0.8 + p.z * 0.6, p.x, p.z * 0.8 - p.y * 0.6) * 2.11 + vec3(3.1, 7.7, 1.3);
    a *= 0.5;
  }
  return s;
}

// two octaves only, for the probe toward the glow
float billow2(vec3 p) {
  float v = n3(p);
  float s = 0.5 * (1.0 - abs(2.0 * v - 1.0));
  p = vec3(p.y * 0.8 + p.z * 0.6, p.x, p.z * 0.8 - p.y * 0.6) * 2.11 + vec3(3.1, 7.7, 1.3);
  v = n3(p);
  return s + 0.25 * (1.0 - abs(2.0 * v - 1.0)) + 0.17;
}

// one storm cell: a column that swells upward into a leaning anvil
float cell(vec3 p, vec3 c, float r, float h, float lean) {
  vec3 q = p - c;
  float y = q.y / h;
  float ry = r * (0.62 + 0.38 * smoothstep(0.0, 0.3, y) - 0.12 * smoothstep(0.45, 0.7, y)
                  + 1.7 * smoothstep(0.7, 0.95, y));
  vec2 off = vec2(lean * h * smoothstep(0.55, 1.0, y), 0.0);
  float rad = length((q.xz - off) * vec2(1.0, 1.25)) / ry;
  return min(1.0 - rad, min(y * 7.0, (1.0 - y) * 9.0));
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
  float glow = clamp(u_glow, 0.0, 3.0);
  float dr = clamp(u_drift, 0.0, 3.0);
  float haze = clamp(u_haze, 0.0, 3.0);
  float rain = clamp(u_rain, 0.0, 3.0);
  float t = u_time;
  float td = t * dr;

  // view ray, tilted up toward the towers, swaying a little
  float cp = cos(PITCH), sp = sin(PITCH);
  vec3 rd = normalize(vec3(uv.x + 0.01 * sin(t * 0.07), uv.y, FOC));
  rd = vec3(rd.x, rd.y * cp + rd.z * sp, rd.z * cp - rd.y * sp);
  vec3 ro = vec3(0.0, EYE, 0.0);

  // storm cells at several depths: centre of the base, radius, height, anvil lean
  vec3 pA = vec3(-9.5, 4.2, 33.0);
  vec3 pB = vec3(12.0, 3.6, 50.0);
  vec3 pC = vec3(-30.0, 3.2, 74.0);
  vec3 pD = vec3(34.0, 3.0, 92.0);

  // the wandering glows inside them
  vec3 L0 = pA + vec3(2.8 * sin(td * 0.09), 3.8 + 2.4 * sin(td * 0.061 + 1.0), 1.5 * cos(td * 0.08));
  vec3 L1 = pA + vec3(4.0 + 3.0 * sin(td * 0.05 + 2.0), 13.5 + 1.0 * sin(td * 0.07), 1.0 * sin(td * 0.11));
  vec3 L2 = pB + vec3(2.5 * cos(td * 0.07 + 0.5), 6.0 + 3.0 * sin(td * 0.045 + 3.0), 2.0 * sin(td * 0.06));
  vec3 L3 = pC + vec3(3.0 * sin(td * 0.04 + 4.0), 5.0 + 1.5 * cos(td * 0.05), 0.0);
  // slow swells, each on its own breath
  float I0 = 0.35 + 0.95 * pow(0.5 + 0.5 * sin(td * 0.31), 2.5);
  float I1 = 0.3 + 0.8 * pow(0.5 + 0.5 * sin(td * 0.23 + 2.1), 3.0);
  float I2 = 0.2 + 0.9 * pow(0.5 + 0.5 * sin(td * 0.27 + 4.0), 2.5);
  float w3 = 0.5 + 0.5 * sin(td * 0.19 + 1.3);
  float I3 = 0.2 + 0.8 * w3 * w3;

  float tg = rd.y < -1e-4 ? EYE / (-rd.y) : 1e5;
  float tEnd = min(tg, TMAX);

  vec3 col = vec3(0.0);
  float T = 1.0;
  float tt = 1.5 + 0.6 * h2(gl_FragCoord.xy);
  vec3 wind = vec3(-td * 0.06, -td * 0.09, td * 0.03);
  for (int i = 0; i < 64; i++) {
    if (tt > tEnd || T < 0.02) break;
    float dt = 0.4 + 0.036 * tt;
    vec3 p = ro + rd * tt;

    float s = max(max(cell(p, pA, 5.2, 17.0, 0.32), cell(p, pB, 6.5, 15.5, 0.38)),
                  max(cell(p, pC, 8.0, 13.0, 0.35), cell(p, pD, 9.0, 11.0, 0.3)));
    float dc = 0.0;
    if (s > -0.45) {
      float b = billow(p * 0.36 + wind);
      dc = clamp((s * 0.85 + (b - 0.52) * 1.25) * 4.0, 0.0, 1.0);
    }
    // rain shafts hang under the cloud bases, leaning with the wind
    float dr2 = 0.0;
    float base = 4.0;
    if (p.y < base) {
      vec3 pr = p + vec3((base - p.y) * 0.35, 0.0, 0.0);
      vec3 pa = vec3(pr.x, pA.y + 1.0, pr.z);
      float sh = max(max(cell(pa, pA, 3.8, 17.0, 0.0), cell(pa, pB, 5.0, 15.5, 0.0)), cell(pa, pC, 6.5, 13.0, 0.0));
      if (sh > -0.2) {
        float st = n3(vec3(pr.x * 2.6, pr.y * 0.1 + td * 0.5, pr.z * 2.6));
        st = st * st;
        dr2 = smoothstep(-0.2, 0.4, sh) * (0.35 + 0.65 * st) * smoothstep(0.0, 1.2, base - p.y + 0.6);
        dr2 *= 0.2 * rain;
      }
    }
    // haze lying between the layers, thicker near the ground
    float hn = n3(p * 0.09 + vec3(td * 0.02, 0.0, 0.0));
    float dh = haze * (0.004 + 0.016 * exp(-p.y * 0.35)) * (0.5 + hn);

    vec3 Lc = vec3(0.0);
    vec3 d0 = L0 - p, d1 = L1 - p, d2 = L2 - p, d3 = L3 - p;
    float e0 = I0 * exp(-length(d0) * 0.33);
    float e1 = I1 * exp(-length(d1) * 0.36);
    float e2 = I2 * exp(-length(d2) * 0.3);
    float e3 = I3 * exp(-length(d3) * 0.26);
    Lc += mix(c0, c2, smoothstep(0.1, 0.6, e0)) * e0;
    Lc += mix(c1, c2, smoothstep(0.1, 0.6, e1)) * e1;
    Lc += mix(c0, c2, smoothstep(0.1, 0.6, e2)) * e2;
    Lc += mix(c1, c0, 0.5) * e3;
    Lc *= 3.3 * glow;
    if (dc > 0.04) {
      vec3 dk = e0 * d0 + e1 * d1 + e2 * d2 + e3 * d3;
      vec3 pq = p + normalize(dk + vec3(0.0, 1e-3, 0.0)) * 1.3;
      float sq = max(max(cell(pq, pA, 5.2, 17.0, 0.32), cell(pq, pB, 6.5, 15.5, 0.38)),
                     max(cell(pq, pC, 8.0, 13.0, 0.35), cell(pq, pD, 9.0, 11.0, 0.3)));
      float dq = clamp((sq * 0.85 + (billow2(pq * 0.36 + wind) - 0.52) * 1.25) * 4.0, 0.0, 1.0);
      Lc *= 0.3 + 0.7 * exp(-dq * 1.6);
    }

    // the town glow warms the cloud bottoms, cold sky light grazes the tops
    vec3 warm = TOWN * 0.11 * exp(-max(p.y - 3.0, 0.0) * 0.3) * smoothstep(-40.0, 20.0, p.x);
    vec3 cold = mix(c3, c0, 0.3) * 0.07 * smoothstep(5.0, 21.0, p.y) * (0.5 + dc);
    float core = 1.25 - 0.75 * dc;
    vec3 emC = dc * (Lc * core + warm + cold);
    vec3 emR = dr2 * (Lc * 1.6 + warm * 2.0 + c3 * 0.05);
    vec3 emH = dh * (Lc * 2.5 + warm * 3.0 + c3 * 0.08);
    float sig = dc * 0.85 + dr2 + dh;
    col += T * (emC + emR + emH) * dt;
    T *= exp(-sig * dt);
    tt += dt;
  }

  // behind everything: the night sky, a warm horizon, far low hills
  vec3 bg;
  float hill = 0.012 + 0.02 * n1(rd.x * 9.0 + 3.0) + 0.01 * n1(rd.x * 31.0);
  if (rd.y > 0.0) {
    bg = c3 * 0.06 * exp(-rd.y * 4.0) + vec3(0.004, 0.006, 0.014);
    // stars in the clear gaps
    vec2 sg = rd.xy / max(rd.z, 0.2) * 180.0;
    vec2 si = floor(sg);
    float sh = h2(si);
    vec2 sf = fract(sg) - 0.5 - 0.3 * vec2(h2(si + 1.3) - 0.5, h2(si + 2.1) - 0.5);
    bg += mix(c2, c1, h2(si + 4.0)) * step(0.985, sh) * exp(-dot(sf, sf) * 40.0) * 0.5 * smoothstep(0.1, 0.4, rd.y);
    bg += TOWN * 0.09 * exp(-rd.y * 22.0) * smoothstep(-0.9, 0.4, rd.x);
    if (rd.y < hill) {
      bg = TOWN * 0.012 + c3 * 0.01;
      // the town itself: scattered sodium points along the foot of the hills
      float tx = rd.x * 400.0;
      float ti = floor(tx);
      float on = step(0.72, h2(vec2(ti, 9.0))) * smoothstep(-0.5, 0.2, rd.x) * smoothstep(0.75, 0.3, rd.x);
      float ly = 0.003 + 0.006 * h2(vec2(ti, 2.0));
      bg += TOWN * on * exp(-(fract(tx) - 0.5) * (fract(tx) - 0.5) * 9.0) * exp(-abs(rd.y - ly) * 900.0) * 0.8;
    }
  } else {
    bg = vec3(0.0);
  }

  // the flooded plain: dark water between grass, mirroring the glows
  if (tg < TMAX) {
    vec3 pg = ro + rd * tg;
    float wet = smoothstep(0.42, 0.62, n3(vec3(pg.x * 0.25, 0.0, pg.z * 0.18)) + 0.2 * n3(vec3(pg.xz, 1.0).xzy * 1.3));
    vec3 rr = vec3(rd.x, -rd.y, rd.z);
    vec3 refl = vec3(0.0);
    // reflected glows, smeared down the water by ripples
    float rip = 0.6 + 0.4 * n3(vec3(pg.x * 2.0, td * 0.6, pg.z * 0.6));
    vec3 q0 = normalize(L0 - vec3(0.0, EYE, 0.0));
    vec3 q1 = normalize(L1 - vec3(0.0, EYE, 0.0));
    vec3 q2 = normalize(L2 - vec3(0.0, EYE, 0.0));
    vec3 q3 = normalize(L3 - vec3(0.0, EYE, 0.0));
    vec2 a0 = (rr.xy / rr.z - q0.xy / q0.z) * vec2(9.0, 2.2);
    vec2 a1 = (rr.xy / rr.z - q1.xy / q1.z) * vec2(9.0, 2.2);
    vec2 a2 = (rr.xy / rr.z - q2.xy / q2.z) * vec2(9.0, 2.2);
    vec2 a3 = (rr.xy / rr.z - q3.xy / q3.z) * vec2(9.0, 2.2);
    refl += mix(c0, c2, 0.4) * I0 * exp(-dot(a0, a0) * 3.0);
    refl += c1 * I1 * exp(-dot(a1, a1) * 3.0) * 0.6;
    refl += mix(c0, c2, 0.3) * I2 * exp(-dot(a2, a2) * 4.0);
    refl += c0 * I3 * exp(-dot(a3, a3) * 5.0) * 0.6;
    refl *= 0.5 * glow * rip;
    vec2 b0 = a0 * vec2(0.25, 0.5), b2 = a2 * vec2(0.25, 0.5);
    refl += (mix(c3, c0, 0.5) * I0 * exp(-dot(b0, b0)) + mix(c3, c0, 0.5) * I2 * exp(-dot(b2, b2))) * 0.12 * glow;
    refl += TOWN * 0.05 * exp(-abs(rd.y) * 25.0) * smoothstep(-0.9, 0.4, rd.x);
    vec3 grass = vec3(0.02, 0.007, 0.004) * (0.6 + 0.8 * n3(vec3(pg.xz * 3.0, 0.0).xzy));
    bg = mix(grass, refl + c3 * 0.012, wet);
  }

  col += T * bg;
  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
