// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Night storm over a flooded salt flat - towering thunderheads stand on the
// horizon, lit from inside by slow wandering glows that swell and fade without
// ever flashing. Rain curtains hang from their bases, a far town smoulders
// ember-dark under the cloud deck, and the water film mirrors it all, broken
// by gusts into streaks around low islands of crust.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;      // strength of the glows inside the clouds (default 1.0)
uniform float u_cover;     // height and spread of the storm cells (default 1.0)
uniform float u_rain;      // density of the rain curtains under the bases (default 1.0)
uniform float u_wind;      // gusts that ripple the water film (default 0.7)

const float HZ = -0.17;    // horizon on screen, lower third
const float CAMH = 0.35;   // eye height above the film
const vec3 WARM = vec3(1.0, 0.36, 0.10);

vec3 c0, c1, c2, c3;
float gT, gCov, gRain, gGlow;
vec3 L1, L2, L3, L4;
float I1, I2, I3, I4;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(37.91, 151.37))) * 5381.17);
}

float h3(vec3 p) {
  return fract(sin(dot(p, vec3(27.17, 113.51, 61.93))) * 4783.31);
}

float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y);
}

float vn3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vn(p);
    p = mat2(1.58, 1.22, -1.22, 1.58) * p + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s;
}

// billowed 3D noise: folded octaves give the cauliflower turrets of a cell
float billow(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * (1.0 - abs(2.0 * vn3(p) - 1.0));
    p = p * 2.07 + vec3(1.7, -3.1, 2.3);
    a *= 0.5;
  }
  return s;
}

// two octaves of the same billow, for the cheap shadow probe
float billowLo(vec3 p) {
  float s = 0.5 * (1.0 - abs(2.0 * vn3(p) - 1.0));
  p = p * 2.07 + vec3(1.7, -3.1, 2.3);
  s += 0.25 * (1.0 - abs(2.0 * vn3(p) - 1.0));
  return s + 0.11;
}

// one storm cell: a leaning column that flares into an anvil near its top
float cell(vec3 p, vec2 c, float top, float rad, float shear, out float foot) {
  float y = p.y;
  float anv = smoothstep(top - 2.8, top - 0.2, y);
  vec2 d = p.xz - c;
  d.x -= (y - 1.0) * 0.18 + anv * shear;
  float r = rad * (0.75 + 0.35 * smoothstep(1.0, top * 0.6, y)) + anv * rad * 1.7;
  d.y *= 1.0 + anv * 0.8;
  float m = exp(-dot(d, d) / (r * r));
  vec2 db = p.xz - c;
  foot = exp(-dot(db, db) / (rad * rad * 0.6));
  return m * smoothstep(top + 0.4, top - 1.2, y);
}

// the storm field: four cells of different size and age plus a ragged deck
float field(vec3 p, out float fall) {
  float tc = gCov;
  float f1, f2, f3, f4;
  float s = 0.0;
  s = max(s, cell(p, vec2(-6.5, 19.0), 7.5 + 4.0 * tc, 3.6, 2.2, f1));
  s = max(s, cell(p, vec2(5.0, 31.0), 7.0 + 4.5 * tc, 4.6, 7.0, f2));
  s = max(s, cell(p, vec2(15.0, 22.0), 3.5 + 2.5 * tc, 2.8, 1.0, f3));
  s = max(s, cell(p, vec2(-18.0, 36.0), 5.0 + 3.0 * tc, 4.2, 3.0, f4));
  // a ragged shelf deck joins the cells low over the horizon, torn in places
  float tear = smoothstep(0.3, 0.7, vn(p.xz * vec2(0.16, 0.3) + 4.0));
  float deck = exp(-(p.y - 1.9) * (p.y - 1.9) * 2.4) * (0.22 + 0.22 * tc) * tear;
  fall = max(max(f1, f2 * 0.8), max(f3 * 0.9, f4 * 0.7));
  return max(s, deck) * smoothstep(1.2, 1.9, p.y);
}

vec3 drift(vec3 p) {
  return p * 0.52 + vec3(-gT * 0.035, -gT * 0.05, gT * 0.01);
}

float density(vec3 p, out float rainD) {
  float fall;
  float s = field(p, fall);
  float n = billow(drift(p));
  float d = clamp((s * 1.25 + n * 0.95 - 1.15) * 3.2, 0.0, 1.0) * step(0.01, s);
  // rain: falling streaks under the cell bases, finest at the near cells
  float st = vn3(vec3(p.x * 4.0 + p.y * 0.25, p.y * 0.35 + gT * 1.6, p.z * 4.0));
  float sheet = smoothstep(0.35, 0.75, vn(p.xz * 0.45 + vec2(gT * 0.02, 0.0)));
  rainD = fall * smoothstep(1.9, 1.1, p.y) * smoothstep(0.0, 0.4, p.y) * (0.4 + 0.6 * st) * (0.3 + 0.7 * sheet) * gRain * 0.8;
  return d;
}

vec3 lightAt(vec3 p) {
  vec3 l = vec3(0.0);
  float d1 = length(p - L1);
  float d2 = length(p - L2);
  float d3 = length(p - L3);
  float d4 = length(p - L4);
  // each glow has a pale core and a violet to blue falloff through the body
  l += I1 * (mix(c1, vec3(1.0, 0.93, 1.0), exp(-d1 * 0.75)) * exp(-d1 * 0.36));
  l += I2 * (mix(c2, vec3(0.9, 0.95, 1.0), exp(-d2 * 0.75)) * exp(-d2 * 0.33));
  l += I3 * (mix(c0, vec3(1.0, 0.9, 1.0), exp(-d3 * 0.75)) * exp(-d3 * 0.40));
  l += I4 * (mix(c1 * 0.8 + c2 * 0.2, vec3(1.0), exp(-d4 * 0.75)) * exp(-d4 * 0.33));
  return l * gGlow * 3.0;
}

vec3 backSky(vec3 rd) {
  float e = max(rd.y, 0.0);
  vec3 col = mix(c3 * 0.10, c3 * 0.035 + c2 * 0.01, smoothstep(0.0, 0.35, e));
  // the far town under the deck: an ember band hugging the horizon, right third
  float tw = exp(-(rd.x - 0.42) * (rd.x - 0.42) * 6.0);
  col += WARM * (0.10 + 0.22 * tw) * exp(-e * 22.0);
  // stars in the clear air between cells
  vec2 sg = vec2(rd.x, e) * 110.0;
  vec2 id = floor(sg);
  vec2 f = fract(sg) - 0.5 - (vec2(hs(id + 3.1), hs(id + 7.7)) - 0.5) * 0.7;
  float s = step(0.94, hs(id)) * smoothstep(0.07, 0.0, length(f)) * (0.6 + 0.4 * sin(gT * 1.1 + hs(id) * 70.0));
  col += mix(c2, vec3(1.0), 0.6) * s * smoothstep(0.08, 0.3, e) * 0.5;
  return col;
}

vec3 march(vec3 ro, vec3 rd, float jit) {
  vec3 col = vec3(0.0);
  float tr = 1.0;
  float ry = max(rd.y, 0.004);
  float t0 = max(11.0 / rd.z, (0.0 - ro.y) / ry);
  float t1 = min(46.0 / rd.z, (15.0 - ro.y) / ry);
  t0 = max(t0, 0.0);
  if (t1 > t0) {
    float dt = (t1 - t0) / 48.0;
    float t = t0 + dt * jit;
    for (int i = 0; i < 48; i++) {
      vec3 p = ro + rd * t;
      float rainD;
      float d = density(p, rainD);
      float a = d + rainD;
      if (a > 0.002) {
        vec3 li = lightAt(p);
        // one probe toward the strongest glow: turrets facing it light up,
        // the far flanks fall into their own shade
        vec3 ld = (L1 - p) * I1 / (dot(L1 - p, L1 - p) + 4.0) + (L2 - p) * I2 / (dot(L2 - p, L2 - p) + 4.0)
                + (L3 - p) * I3 / (dot(L3 - p, L3 - p) + 4.0) + (L4 - p) * I4 / (dot(L4 - p, L4 - p) + 4.0)
                + vec3(0.0, 0.004, 0.0);
        vec3 pp = p + normalize(ld) * 0.7;
        float fq;
        float sq = field(pp, fq);
        float pd = clamp((sq * 1.25 + billowLo(drift(pp)) * 0.95 - 1.15) * 3.2, 0.0, 1.0);
        li *= 0.25 + 1.1 * exp(-pd * 2.4);
        // ambient: blue-black from the night above, ember from the town below
        float tw = exp(-(p.x - 16.0) * (p.x - 16.0) / 200.0);
        vec3 amb = (c3 * 0.22 + c0 * 0.06) * smoothstep(1.5, 12.0, p.y) + c2 * 0.03;
        amb += WARM * (0.08 + 0.32 * tw) * exp(-(p.y - 1.2) * 0.9) * (0.4 + 0.6 * smoothstep(0.0, 1.5, p.y));
        // dense cores swallow their own light, thin skins let it out
        vec3 em = (li * (0.55 + 0.45 * (1.0 - d)) + amb) * d + (li * 1.3 + amb * 0.8) * rainD;
        float k = exp(-a * dt * 1.7);
        col += tr * em * (1.0 - k) / max(a * 1.7, 1e-3);
        tr *= k;
        if (tr < 0.02) break;
      }
      t += dt;
    }
  }
  return col + tr * backSky(rd);
}

// slope of the water film: slow swell plus capillary ripples in moving gusts
vec2 ripple(vec2 p, float T, float wd, float fine, out float gust) {
  vec2 g = vec2(0.0);
  g += 0.008 * vec2(0.2, 1.0) * cos(p.y * 3.0 + p.x * 0.7 - T * 0.4);
  g += 0.006 * vec2(-0.5, 1.0) * cos(p.y * 5.0 - p.x * 1.6 - T * 0.55 + 1.7);
  gust = smoothstep(0.42, 0.8, fbm(p * vec2(0.3, 0.55) + vec2(-T * 0.06, T * 0.03)));
  gust = (0.15 + 0.85 * gust) * wd;
  vec2 w = vec2(vn(p * 10.0 + T * 0.3), vn(p * 10.0 + 9.0 - T * 0.3)) - 0.5;
  vec2 q = p + w * 0.12;
  vec2 cap = vec2(0.0);
  cap += vec2(0.35, 1.0) * cos(dot(q, vec2(24.0, 80.0)) - T * 5.0);
  cap += vec2(-0.6, 1.0) * cos(dot(q, vec2(-50.0, 97.0)) - T * 6.3 + 2.0) * 0.7;
  cap += vec2(0.9, 0.6) * cos(dot(q, vec2(110.0, 70.0)) - T * 7.7 + 4.0) * 0.45;
  g += cap * 0.03 * gust * fine;
  return g;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution.xy;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float T = u_time;
  gT = T;
  gCov = clamp(u_cover, 0.0, 2.0);
  gRain = clamp(u_rain, 0.0, 2.0);
  gGlow = clamp(u_glow, 0.0, 2.0);
  float wd = clamp(u_wind, 0.0, 2.0);
  float px = 1.0 / res.y;

  // the inner glows wander slowly through their cells and swell, never flash
  L1 = vec3(-6.0 + 1.2 * sin(T * 0.071), 4.0 + 2.2 * gCov * (0.5 + 0.5 * sin(T * 0.093)), 17.6 + 1.0 * cos(T * 0.05));
  L2 = vec3(5.5 + 1.6 * sin(T * 0.058 + 2.0), 3.5 + 2.0 * gCov * (0.5 + 0.5 * sin(T * 0.081 + 1.0)), 28.5);
  L3 = vec3(15.0 + 0.8 * sin(T * 0.09 + 4.0), 2.6 + 1.0 * gCov * (0.5 + 0.5 * sin(T * 0.12)), 22.0);
  L4 = vec3(-18.0 + 1.5 * sin(T * 0.05 + 1.0), 3.5 + 1.5 * gCov * (0.5 + 0.5 * sin(T * 0.07 + 3.0)), 36.0);
  float s1 = 0.5 + 0.5 * sin(T * 0.21);
  float s2 = 0.5 + 0.5 * sin(T * 0.17 + 2.1);
  float s3 = 0.5 + 0.5 * sin(T * 0.26 + 4.0);
  float s4 = 0.5 + 0.5 * sin(T * 0.15 + 5.3);
  I1 = 0.25 + 1.6 * s1 * s1 * s1;
  I2 = 0.20 + 1.9 * s2 * s2 * s2;
  I3 = 0.15 + 1.2 * s3 * s3 * s3;
  I4 = 0.15 + 1.5 * s4 * s4 * s4;

  float jit = hs(floor(gl_FragCoord.xy));
  vec3 col;
  if (uv.y >= HZ) {
    vec3 rd = normalize(vec3(uv.x, uv.y - HZ, 1.0));
    col = march(vec3(0.0, CAMH, 0.0), rd, jit);
  } else {
    float dy = max(HZ - uv.y, 1e-4);
    float z = CAMH / dy;
    vec2 p = vec2(uv.x * z, z);
    float pxz = z * z / CAMH * px;
    float fine = exp(-pxz * 30.0);
    float gust;
    vec2 g = ripple(p, T, wd, fine, gust);
    // mirror ray, shoved by the film slope; fixed jitter keeps the mirror calm
    vec3 rd = normalize(vec3(uv.x + g.x * 0.8, dy + g.y * 1.4 * (0.3 + 0.7 * smoothstep(0.0, 0.08, dy)), 1.0));
    vec3 refl = march(vec3(0.0, -CAMH, 0.0), rd, jit);
    refl *= 1.0 - 0.25 * gust * fine;
    float R = 0.55 + 0.4 * exp(-dy * 7.0);
    vec3 bed = mix(c3, c0, 0.3 + 0.3 * fbm(p * vec2(2.0, 1.3))) * 0.025;
    vec3 water = refl * R + bed;

    // low islands of salt crust, dark and wet, rims catching the storm glow
    vec2 ip = p * vec2(0.45, 0.75) + vec2(2.0, 0.0);
    float isl = fbm(ip) + 0.06 * (vn(p * 9.0) - 0.5) - 0.12 * smoothstep(2.0, 12.0, z);
    isl += 0.05 * (fbm(p * 30.0) - 0.5) * exp(-pxz * 20.0);
    float thr = 0.61;
    float aa = 0.01 + pxz * 0.5;
    float m = smoothstep(thr, thr + aa, isl);
    float collar = smoothstep(thr - 0.05, thr, isl) * (1.0 - m);
    float lip = smoothstep(thr + aa * 6.0 + 0.03, thr + aa, isl) * m;
    vec2 kp = p * vec2(9.0, 12.0);
    float rn = fbm(kp + 5.0);
    float ridge = 1.0 - abs(2.0 * rn - 1.0);
    float rf = exp(-pxz * 12.0);
    float rdg = smoothstep(0.7, 0.97, ridge) * rf;
    // the crust is lit by the sum of the cell glows seen low on the horizon
    float a1 = uv.x + 0.32, a2 = uv.x - 0.18, a3 = uv.x - 0.68, a4 = uv.x + 0.5;
    vec3 hzl = (I1 * c1 * exp(-a1 * a1 * 6.0) + I2 * c2 * exp(-a2 * a2 * 6.0)
              + I3 * c0 * exp(-a3 * a3 * 6.0) + I4 * c1 * exp(-a4 * a4 * 6.0)) * gGlow * 0.35;
    hzl += WARM * 0.12 * exp(-a3 * a3 * 3.0);
    vec3 salt = (c3 * 0.04 + c2 * 0.01) * (0.6 + 0.6 * vn(p * 40.0));
    salt += hzl * (0.10 + 0.35 * rdg + 0.4 * lip);
    salt = mix(salt, water * 0.8, smoothstep(2.0, 10.0, z));
    water *= 1.0 - 0.5 * collar;
    col = mix(water, salt, m);
  }

  col = 1.0 - exp(-col * 1.3);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
