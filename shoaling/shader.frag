// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Shallow clear water over rippled sand seen at a low angle. Caustic filaments,
// focused by a slow swell overhead, fold, pinch and slide across the ripple
// crests with spectral fringes, wash over weathered algae-capped rocks, and fade
// into a deep blue haze crossed by light shafts and drifting motes.
precision highp float;

uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px (unused)
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swell;   // swell height, how hard the caustics focus     (default 1.0)
uniform float u_flow;    // travel speed of the swell overhead            (default 0.5)
uniform float u_ripple;  // height of the sand ripples                    (default 1.0)
uniform float u_glow;    // brightness of the caustic light               (default 1.0)

vec3 c0, c1, c2, c3;
float T;

float h21(vec2 p) {
  p = fract(p * vec2(123.47, 271.93));
  p += dot(p, p.yx + 37.21);
  return fract(p.x * p.y * 1.71);
}

float h31(vec3 p) {
  p = fract(p * vec3(83.17, 151.29, 47.61));
  p += dot(p, p.zxy + 29.83);
  return fract((p.x + p.z) * p.y);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

// wave-built sand ripples: gentle stoss slope, steep lee, crests that wander
// and fade in and out, over a slow undulating bed
float sand(vec2 p) {
  float base = 0.06 * vn(p * 0.3) - 0.03;
  float s = p.y + 0.22 * sin(p.x * 0.9 + 0.6 * sin(p.y * 0.5)) + 0.35 * vn(p * 0.6);
  float f = fract(s * 2.8);
  float prof = smoothstep(0.0, 0.72, f) * (1.0 - smoothstep(0.72, 1.0, f));
  float amp = 0.035 * u_ripple * (0.5 + 0.5 * vn(p * 0.9 + 7.0));
  return base + amp * prof;
}

// eroded, layered stone: a squashed ellipsoid worn by noise and banded strata
float rock(vec3 p, vec3 c, vec3 r, float seed) {
  vec3 q = (p - c) / r;
  float mr = min(r.x, min(r.y, r.z));
  float d = (length(q) - 1.0) * mr;
  if (d > 0.35) return d;
  // erosion scaled to the stone so small pebbles are as worn as boulders
  float n = vn3(q * 1.9 + seed) * 0.55 + vn3(q * 4.3 - seed) * 0.3 + vn3(q * 9.7 + seed) * 0.15;
  d += (0.5 * n - 0.25) * mr;
  // flat bedding planes cut across the stone
  float bed = sin(q.y * 9.0 + q.x * 1.5 + 3.0 * vn3(q * 1.3 + seed));
  d += 0.035 * mr * smoothstep(0.2, 0.9, bed);
  return d;
}

float rocks(vec3 p) {
  float d = rock(p, vec3(-1.3, -0.05, 4.3), vec3(0.95, 0.62, 0.8), 1.3);
  d = min(d, rock(p, vec3(1.05, -0.06, 2.35), vec3(0.34, 0.22, 0.3), 5.7));
  d = min(d, rock(p, vec3(-0.25, -0.03, 1.75), vec3(0.12, 0.07, 0.1), 9.1));
  d = min(d, rock(p, vec3(1.6, -0.1, 8.5), vec3(1.2, 0.55, 0.9), 3.4));
  return d;
}

vec2 map(vec3 p) {
  float g = (p.y - sand(p.xz)) * 0.8;
  float r = rocks(p) * 0.7;
  return r < g ? vec2(r, 1.0) : vec2(g, 0.0);
}

// one travelling swell wave adds its curvature to the surface Hessian
void wave(vec2 x, vec2 d, float k, float cv, float off, inout vec3 H) {
  float w = 0.75 * sqrt(k) * u_flow;
  float s = sin(k * dot(d, x) - w * T + off);
  H += -cv * s * vec3(d.x * d.x, d.y * d.y, d.x * d.y);
}

// caustic focus: light refracted through the surface lands on the bed through
// the map x -> x + D grad h; its brightness is the inverse area of that map.
// The swell runs mostly one way, so the focus lines stay open filaments
float caus(vec2 x, float D) {
  vec3 H = vec3(0.0);
  wave(x, vec2(0.8, 0.6), 8.7, 0.62, 0.0, H);
  wave(x, vec2(0.6, 0.8), 12.3, 0.44, 1.7, H);
  wave(x, vec2(0.92, 0.39), 15.9, 0.33, 4.1, H);
  wave(x, vec2(0.5, 0.866), 21.7, 0.24, 2.6, H);
  wave(x, vec2(0.98, -0.2), 13.1, 0.16, 5.3, H);
  float det = (1.0 + D * H.x) * (1.0 + D * H.y) - D * D * H.z * H.z;
  float I = 1.0 / (abs(det) + 0.1);
  return I * I * 0.012;
}

vec3 causLight(vec3 p) {
  vec2 x = p.xz + vec2(0.0, p.y * 0.6);
  x += 0.35 * vec2(vn(x * 0.5 + T * 0.03), vn(x * 0.5 + 11.0 - T * 0.02));
  // the bed lies past the focal depth, so the light folds into lines everywhere
  float D = 1.9 * clamp(u_swell, 0.0, 2.0) * (1.0 - p.y * 0.6);
  // dispersion: violet bends harder than cyan, green softer
  float v = caus(x, D * 1.22);
  float c = caus(x, D);
  float g = caus(x, D * 0.83);
  return c2 * v * 1.3 + c0 * c + c1 * g * 1.15;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  T = u_time;
  vec2 res = u_resolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;

  // low camera gliding slowly over the bed
  vec3 ro = vec3(0.12 * sin(T * 0.06), 1.05 + 0.03 * sin(T * 0.09), -0.4 + 0.15 * sin(T * 0.04));
  vec3 fw = normalize(vec3(0.05, -0.36, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.5 + uv.x * rt + uv.y * up);

  float t = 0.1;
  vec2 h = vec2(1.0, -1.0);
  float mat = -1.0;
  for (int i = 0; i < 64; i++) {
    h = map(ro + rd * t);
    if (h.x < 0.0015 * t) { mat = h.y; break; }
    t += h.x;
    if (t > 26.0) break;
  }

  // low sun from beyond the rocks rakes the lee faces of the ripples
  vec3 L = normalize(vec3(-0.25, 0.75, 0.8));
  vec3 fogC = c3 * 0.075 + c2 * 0.02;
  // haze brightens toward the surface overhead
  vec3 hazeC = fogC + c0 * 0.06 * smoothstep(0.0, 0.5, uv.y);
  vec3 col = hazeC;

  if (mat >= 0.0) {
    vec3 p = ro + rd * t;
    vec3 n;
    vec3 alb;
    if (mat < 0.5) {
      float e = 0.01 + 0.004 * t;
      n = normalize(vec3(sand(p.xz - vec2(e, 0.0)) - sand(p.xz + vec2(e, 0.0)), 2.0 * e,
                         sand(p.xz - vec2(0.0, e)) - sand(p.xz + vec2(0.0, e))));
      float grain = mix(0.8 + 0.4 * h21(floor(p.xz * 160.0)), 1.0, smoothstep(2.0, 6.0, t));
      float trough = smoothstep(0.004, -0.02, p.y - 0.06 * vn(p.xz * 0.3) + 0.03);
      alb = mix(c3, c2, 0.35 + 0.3 * trough) * 0.32 * grain;
    } else {
      vec2 e = vec2(0.004, 0.0);
      n = normalize(vec3(rocks(p + e.xyy) - rocks(p - e.xyy),
                         rocks(p + e.yxy) - rocks(p - e.yxy),
                         rocks(p + e.yyx) - rocks(p - e.yyx)));
      float moss = smoothstep(0.35, 0.85, n.y) * smoothstep(0.3, 0.6, vn3(p * 4.0));
      float band = 0.7 + 0.3 * sin(p.y * 46.0 + 4.0 * vn3(p * 1.7));
      alb = mix(c3 * 0.3 * band, c1 * 0.5, moss);
    }

    // soft shade cast by the rocks toward the sun
    float sh = 1.0;
    float st = 0.05;
    for (int j = 0; j < 16; j++) {
      float d = rocks(p + L * st);
      sh = min(sh, 6.0 * d / st);
      st += clamp(d, 0.04, 0.3);
    }
    sh = clamp(sh, 0.0, 1.0);

    float dif = max(dot(n, L), 0.0);
    float ao = mat < 0.5 ? smoothstep(0.0, 0.5, rocks(p)) * 0.5 + 0.5 : 1.0;
    vec3 cl = causLight(p) * clamp(u_glow, 0.0, 3.0);
    // caustics fade with distance so far crests do not alias
    cl *= 1.0 - smoothstep(6.0, 16.0, t);
    col = alb * (0.22 + 0.8 * dif * dif * sh) * ao;
    col += cl * alb * 7.0 * dif * sh * ao;
    // wet rim light along edges that face the haze
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col += c0 * 0.08 * rim * (mat > 0.5 ? 1.0 : 0.3);

    float fog = 1.0 - exp(-t * 0.13);
    col = mix(col, hazeC, fog);
  }

  // light shafts slanting down from the surface, thicker in the far haze
  float sx = uv.x + uv.y * 0.4;
  float shaft = pow(0.5 + 0.5 * sin(sx * 9.0 + 1.3 * sin(sx * 3.1 + T * 0.11) + T * 0.07), 6.0);
  shaft += 0.6 * pow(0.5 + 0.5 * sin(sx * 15.0 - T * 0.09 + 2.0), 8.0);
  col += mix(c0, c3, 0.5) * shaft * 0.12 * smoothstep(-0.4, 0.5, uv.y) * clamp(u_glow, 0.0, 3.0);

  // drifting motes at three depths, larger and softer nearer the eye
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sc = 5.0 + 4.0 * fk;
    vec2 q = uv * sc + vec2(T * (0.05 - 0.012 * fk), T * (0.018 + 0.006 * fk));
    vec2 id = floor(q);
    float hh = h21(id + fk * 17.0);
    vec2 o = vec2(h21(id + 3.1), h21(id + 7.9)) * 0.7 + 0.15;
    float r = length(fract(q) - o);
    float sz = (0.035 + 0.04 * hh) * (1.4 - 0.3 * fk);
    float m = smoothstep(sz, 0.0, r) * step(0.62, hh);
    col += mix(c0, c2, fract(hh * 5.3)) * m * (0.35 - 0.08 * fk);
  }

  gl_FragColor = vec4(col, 1.0);
}
