// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A still pool deep in a limestone cave. Frosted, milky dripstones hang from
// the vault and weld into one another and into a great column, lit from below
// by a glow that breathes up out of the water. The pool mirrors them, drips
// ring its surface, mist creeps over it and bright motes rise and fade.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // strength of the light rising from the pool          (default 1.0)
uniform float u_merge;  // how far the dripstones weld into each other and roof (default 0.45)
uniform float u_drift;  // speed of the mist, motes and drips                   (default 0.5)

vec3 c0, c1, c2, c3;
float gK, gMerge, gT;

float hs(vec2 p) { return fract(sin(dot(p, vec2(41.73, 289.11))) * 35719.27); }
float hs1(float x) { return fract(sin(x * 93.17) * 17453.91); }

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y);
}

float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 o = i.xy + i.z * vec2(17.31, 41.17);
  float a = mix(mix(hs(o), hs(o + vec2(1.0, 0.0)), f.x),
                mix(hs(o + vec2(0.0, 1.0)), hs(o + vec2(1.0, 1.0)), f.x), f.y);
  o += vec2(17.31, 41.17);
  float b = mix(mix(hs(o), hs(o + vec2(1.0, 0.0)), f.x),
                mix(hs(o + vec2(0.0, 1.0)), hs(o + vec2(1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return s;
}

float smin(float a, float b, float k) {
  k = max(k, 1e-3);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// one hanging stone, tip at q.y = 0, widening upward, ringed by flowstone bands
float hang(vec3 q, float sl, float sd) {
  float h = q.y;
  vec2 a = q.xz + 0.05 * h * vec2(sin(h * 2.3 + sd * 6.0), cos(h * 1.9 + sd * 4.0));
  float r = (0.008 + sl * h + 0.03 * sqrt(max(h, 0.0))) * (1.0 + 0.2 * sin(h * 17.0 + sd * 30.0) + 0.4 * (vn(a * 14.0 + vec2(h * 6.0, sd * 9.0)) - 0.5));
  return max((length(a) - r) * 0.6, -h);
}

// height of the vault roof above x
float roofY(float x) {
  float cx = x * 0.6;
  return -0.1 + sqrt(max(2.25 - cx * cx, 0.0)) / 0.95 + 0.08;
}

float map(vec3 p) {
  float n = vn3(p * 1.1) * 0.4 + vn3(p * 3.3 + 5.0) * 0.12;
  float vault = 1.75 - length(vec2(p.x * 0.6, (p.y + 0.1) * 0.95)) - n;
  float d = min(vault, 12.0 - p.z + n);
  float roof = roofY(p.x);

  // a field of dripstones, each cell its own length, girth and lean
  const float CS = 0.75;
  vec2 cid = floor(p.xz / CS);
  vec2 lc = p.xz - (cid + 0.5) * CS;
  float h1 = hs(cid + 0.37), h2 = hs(cid + 11.3), h3 = hs(cid + 23.9);
  vec2 off = (vec2(h1, h2) - 0.5) * 0.3;
  float L = (0.12 + 1.15 * h3 * h3 * h3) * mix(0.35, 1.0, smoothstep(0.0, 2.2, (cid.y + 0.5) * CS));
  float st = hang(vec3(lc.x - off.x, p.y - roof + L, lc.y - off.y), 0.07 + 0.08 * h2, h1);
  // a thin straw beside it
  vec2 o2 = off + vec2(0.16, 0.12) * (h2 > 0.5 ? 1.0 : -1.0);
  float L2 = 0.1 + 0.3 * h1;
  st = min(st, hang(vec3(lc.x - o2.x, p.y - roof + L2, lc.y - o2.y), 0.03, h3));
  float k = 0.03 + 0.3 * gMerge;
  d = smin(d, st, k);

  // the great column, roof to water, flared at both ends and banded
  vec3 q = p - vec3(1.0, 0.0, 3.7);
  float cr = 0.12 + 0.16 * exp(-p.y * 3.5) + 0.2 * exp(-(roof - p.y) * 2.5)
           + 0.018 * sin(p.y * 23.0 + 3.0 * vn(q.xz * 6.0)) + 0.04 * vn(vec2(p.y * 4.0, atan(q.z, q.x) * 2.0));
  d = smin(d, (length(q.xz) - cr) * 0.7, k * 0.8);

  // a stalagmite rising out of the water, its tip under a long stalactite
  // and a cluster of smaller ones round the spring, unequal in height
  vec3 m = p - vec3(-0.85, 0.5, 2.6);
  float mite = hang(vec3(m.x, -m.y, m.z), 0.22, 2.7);
  m = p - vec3(-1.45, 0.26, 2.35);
  mite = smin(mite, hang(vec3(m.x, -m.y, m.z), 0.3, 5.1), 0.05);
  m = p - vec3(-0.62, 0.14, 1.75);
  mite = smin(mite, hang(vec3(m.x, -m.y, m.z), 0.38, 8.3), 0.05);
  m = p - vec3(-1.7, 0.42, 3.3);
  mite = smin(mite, hang(vec3(m.x, -m.y, m.z), 0.2, 3.9), 0.05);
  d = smin(d, mite, k * 0.5);
  return d;
}

vec3 nrm(vec3 p) {
  vec2 e = vec2(0.002, -0.002);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx)
                 + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// emissive patches in the pool, each breathing on its own phase, and a bright
// spring off to the left
float poolGlow(vec2 w) {
  float n = fbm(w * 0.7 + vec2(0.0, gT * 0.05));
  float ph = vn(w * 0.35 + 9.0);
  float pulse = 0.6 + 0.4 * sin(gT * 0.9 + 12.0 * ph);
  float spring = exp(-length((w - vec2(-1.05, 2.1)) * vec2(1.0, 0.6)) * 1.5);
  return smoothstep(0.38, 0.75, n) * pulse * 0.8 + spring * (0.8 + 0.2 * sin(gT * 0.6));
}

vec3 fogC(float y) {
  return c1 * 0.02 + c2 * (0.012 + 0.035 * smoothstep(0.4, 1.4, y)) + c0 * 0.05 * exp(-max(y, 0.0) * 3.0) * gK;
}

// frosted dripstone lit from beneath by the pool
vec3 stone(vec3 p, vec3 n, vec3 rd) {
  float up = clamp(-n.y * 0.5 + 0.5, 0.0, 1.0);
  float fall = exp(-max(p.y, 0.0) * 0.95);
  float pool = 0.5 + 0.9 * poolGlow(p.xz);
  float thick = clamp(map(p - n * 0.07) / -0.07, 0.0, 1.0);
  float trans = 1.0 - thick;
  // flowstone rings, uneven in pitch, and a fine frosted grain
  float bn = vn(p.xz * 4.0 + p.y);
  float band = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(p.y * 31.0 + 7.0 * bn));
  float grain = vn(vec2(p.x * 11.0 + p.z * 7.0, p.y * 26.0)) * 0.6 + vn(vec2(p.x * 40.0 - p.z * 31.0, p.y * 70.0)) * 0.4;
  vec3 col = vec3(0.003, 0.006, 0.012) + c1 * 0.035 * grain;
  vec3 body = mix(mix(c2 * 0.55, c0 * 1.05, band), c0 * 0.8, thick * 0.5) + c1 * 0.2;
  col += body * up * up * fall * pool * gK * (0.55 + 0.45 * grain) * 0.75;
  // milky translucence where the stone is thin, glowing teal from inside
  col += (c0 * 0.55 + c1 * 0.2) * trans * trans * fall * pool * gK * (0.7 + 0.3 * band);
  // the spring itself, a light low in the pool that falls off with distance
  vec3 Ls = vec3(-1.05, 0.08, 2.1) - p;
  float dl = length(Ls);
  float dif = max(dot(n, Ls / max(dl, 1e-3)), 0.0);
  float sp = (0.85 + 0.15 * sin(gT * 0.6)) / (1.0 + dl * dl * 1.8);
  col += (c0 * 0.9 + c3 * 0.6 * dif * dif) * dif * sp * gK * (0.6 + 0.4 * band);
  // a violet rim where the surface turns away
  float rim = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
  col += c2 * 0.5 * rim * (0.3 + 0.7 * fall) * gK;
  // broad frosted sheen: the pool seen in the surface
  vec3 rr = reflect(rd, n);
  float sh = pow(max(-rr.y, 0.0), 5.0) * fall;
  col += mix(c0, c1, 0.4) * sh * 0.25 * gK;
  // wet tips catch a warm bead of light
  float wet = trans * pow(max(-n.y, 0.0), 4.0) * exp(-max(p.y, 0.0) * 1.6);
  col += c3 * 1.1 * wet * wet * gK;
  return col;
}

float march(vec3 ro, vec3 rd, float tmax, out float t) {
  t = 0.02;
  for (int i = 0; i < 64; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0015 * t) return 1.0;
    t += min(d, 0.3);
    if (t > tmax) break;
  }
  return 0.0;
}

float march2(vec3 ro, vec3 rd, float tmax, out float t) {
  t = 0.02;
  for (int i = 0; i < 40; i++) {
    float d = map(ro + rd * t);
    if (d < 0.004 * t) return 1.0;
    t += min(d * 1.1, 0.4);
    if (t > tmax) break;
  }
  return 0.0;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  float px = 1.0 / res.y;
  float pr = max(u_pixelRatio, 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  gK = clamp(u_glow, 0.2, 2.0);
  gMerge = clamp(u_merge, 0.0, 1.0);
  float T = u_time;
  gT = T * (0.15 + clamp(u_drift, 0.0, 2.0));

  vec3 ro = vec3(-0.1 + 0.04 * sin(T * 0.05), 0.38, -0.6);
  vec3 ta = vec3(0.2, 0.62, 5.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.25 * ww);

  float tW = rd.y < 0.0 ? -ro.y / rd.y : 1e5;
  float t;
  float hit = march(ro, rd, min(tW, 16.0), t);
  vec3 col;
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    col = stone(p, nrm(p), rd);
    col = mix(col, fogC(p.y), 1.0 - exp(-t * 0.13));
  } else if (tW < 1e4) {
    vec3 w = ro + rd * tW;
    // ripples: a faint shiver plus rings spreading from falling drips
    vec2 g = 0.012 * (vec2(vn(w.xz * 5.0 + gT * 0.2), vn(w.xz * 5.0 + 3.0 - gT * 0.2)) - 0.5);
    float ringGlint = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 dp = vec2(mix(-0.9, 0.9, hs1(fi + 4.0)), 1.6 + 3.5 * hs1(fi + 9.0));
      float ph = fract(gT * 0.11 * (1.0 + 0.4 * hs1(fi)) + hs1(fi + 2.0));
      vec2 dv = w.xz - dp;
      float dist = length(dv);
      float dx = dist - ph * 1.3;
      float env = exp(-dx * dx * 120.0) * (1.0 - ph) * (1.0 - ph);
      g += dv / max(dist, 1e-3) * env * cos(dx * 55.0) * 0.12;
      ringGlint += env * max(sin(dx * 55.0), 0.0);
    }
    vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, nW), 0.0), 5.0);
    float mir = max(fres, 0.6);
    vec3 rr = reflect(rd, nW);
    float t2;
    vec3 refl;
    if (march2(w, rr, 14.0, t2) > 0.5) {
      vec3 q = w + rr * t2;
      refl = stone(q, nrm(q), rr);
      refl = mix(refl, fogC(q.y), 1.0 - exp(-(t2 + tW) * 0.13));
    } else {
      refl = fogC(0.5);
    }
    float pg = poolGlow(w.xz);
    vec3 emit = c1 * 0.04 + c2 * 0.02 + (c1 * 0.3 + c0 * 0.75 * pg + c3 * 0.3 * pg * pg) * pg * gK;
    // a warm gold core where the spring wells up
    float core = exp(-length((w.xz - vec2(-1.05, 2.1)) * vec2(1.0, 0.55)) * 4.0);
    emit += (c3 * 0.55 + c0 * 0.2) * core * (0.8 + 0.2 * sin(gT * 0.6)) * gK;
    emit *= exp(-tW * 0.06);
    col = emit * (1.0 - 0.5 * mir) + refl * mir;
    col += mix(c0, c3, 0.4) * ringGlint * 0.25 * gK * exp(-tW * 0.1);
    col = mix(col, fogC(0.0), 1.0 - exp(-tW * 0.1));

    // mist lying on the water, lit from below
    float lay = min(0.28 / max(-rd.y, 0.02), tW);
    vec3 mp = ro + rd * (tW - lay * 0.5);
    float mn = fbm(mp.xz * vec2(0.9, 0.6) + vec2(gT * 0.07, 0.0));
    float ma = smoothstep(0.48, 0.8, mn) * (1.0 - exp(-lay * 0.3));
    col = mix(col, c0 * 0.2 * (0.3 + pg) * gK + c2 * 0.04, min(ma * 0.6, 0.8));
  } else {
    col = fogC(1.0);
  }

  // a soft column of light rising off the spring through the damp air
  {
    float tEnd = hit > 0.5 ? t : min(tW, 16.0);
    vec3 S = vec3(-1.05, 0.0, 2.1);
    for (int k = 0; k < 3; k++) {
      vec3 Sk = S + vec3(0.0, 0.25 + 0.3 * float(k), 0.0);
      float ts = clamp(dot(Sk - ro, rd), 0.0, tEnd);
      vec3 cp = ro + rd * ts - Sk;
      float dd = length(cp.xz) * 1.0 + abs(cp.y) * 0.6;
      float ripple = 0.75 + 0.25 * sin(gT * 0.7 + float(k) * 2.0);
      col += mix(c0, c1, 0.25 * float(k)) * 0.05 * exp(-dd * 3.0) * ripple * gK;
    }
  }

  // motes rising off the water and fading
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float life = fract(gT * 0.08 * (0.6 + 0.8 * hs1(fi + 1.0)) + hs1(fi + 3.0));
    vec2 sp = vec2(mix(-0.75, 0.75, hs1(fi + 7.0)), -0.12 - 0.2 * hs1(fi + 9.0));
    sp += vec2(0.03 * sin(life * 9.0 + fi), life * 0.38);
    float f = sin(life * 3.14159) * (0.7 + 0.3 * sin(T * 1.7 + fi * 2.3));
    float r = length(uv - sp) / (px * pr);
    vec3 mc = mix(c0, c3, step(0.6, hs1(fi + 13.0)));
    col += mc * (exp(-r * r / 2.0) * 0.8 + exp(-r / 5.0) * 0.05) * f * gK;
  }

  gl_FragColor = vec4(col, 1.0);
}
