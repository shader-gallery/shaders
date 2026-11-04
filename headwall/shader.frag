// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A curving subway tube at night, seen from the track. Cast iron segment
// rings, sagging cable runs and wall lamps slide past overhead, red and amber
// signals glow low on the wall, the rails and wet ballast between them carry
// the lamp light ahead, and the bore bends away into violet haze.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // travel speed along the track (default 0.5)
uniform float u_lamps;     // brightness of the wall lamps and signals (default 1.0)
uniform float u_haze;      // dust haze hanging in the bore (default 1.0)
uniform float u_bend;      // how hard the tunnel curves away (default 1.0)

const float R = 2.0;       // bore radius
const float FLOOR = -1.3;  // trackbed height below the bore axis
const float SP = 1.5;      // segment ring spacing
const float LS = 6.0;      // wall lamp spacing
const float SG = 18.0;     // signal spacing
const vec3 EMBER = vec3(1.0, 0.34, 0.08);

vec3 c0, c1, c2, c3;
float gT, gBend, gLamp, gHaze;

float hs(float n) {
  return fract(sin(n * 91.73 + 7.1) * 4157.29);
}

float hs2(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 173.11))) * 6151.93);
}

float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs2(i), hs2(i + vec2(1.0, 0.0)), f.x),
             mix(hs2(i + vec2(0.0, 1.0)), hs2(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(1.62, 1.17, -1.17, 1.62) * p + vec2(3.7, 8.1);
    a *= 0.5;
  }
  return s;
}

float box3(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float box2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// centre line of the bore: two slow bends, scaled by the bend param
vec2 ctr(float z) {
  return vec2(3.4 * sin(z * 0.052) + 1.1 * sin(z * 0.113 + 1.3),
              0.22 * sin(z * 0.061 + 0.5)) * gBend;
}

vec3 lampPos(float k) {
  float z = k * LS;
  float sd = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
  return vec3(ctr(z) + vec2(1.56 * sd, 0.92), z);
}

vec3 lampCol(float k) {
  return mix(c1, c2, step(0.55, hs(k * 1.7 + 2.0)));
}

float lampI(float k) {
  return (0.75 + 0.5 * hs(k + 9.0)) * (0.85 + 0.15 * sin(gT * 0.5 + k * 2.3)) * gLamp;
}

vec3 sigPos(float k) {
  float z = k * SG + 5.0;
  return vec3(ctr(z) + vec2(1.74, -0.42), z);
}

// red most of the time, every third signal amber
vec3 sigCol(float k) {
  return mix(vec3(1.0, 0.12, 0.06), EMBER * vec3(1.0, 1.5, 1.0), step(0.66, hs(k + 31.0)));
}

// one cable at angle a on the lining, hanging down by sg between rings
float cable(vec2 q, float a, float rad, float sg, float th) {
  vec2 cp = vec2(cos(a), sin(a)) * rad - vec2(0.0, sg);
  return length(q - cp) - th;
}

float map(vec3 p, out float mat) {
  vec2 q = p.xy - ctr(p.z);
  float r = length(q);
  float ang = atan(q.y, q.x);
  // the lining: slightly spalled, joined by flanged segment rings
  float d = R - r - 0.02 * vn(vec2(ang * 5.0, p.z * 1.3));
  mat = 0.0;
  float id = floor(p.z / SP + 0.5);
  float zz = p.z - id * SP;
  float dep = 0.09 + 0.05 * hs(id) + 0.08 * step(0.8, hs(id + 11.0));
  dep += 0.025 * (vn(vec2(ang * 7.0, id * 3.1)) - 0.5);
  float wid = 0.055 + 0.03 * hs(id + 3.0);
  float rib = max(abs(zz) - wid, R - dep - r) - 0.012;
  if (rib < d) { d = rib; mat = 1.0; }
  // ballast bed
  float fy = q.y - FLOOR;
  float fl = fy - 0.035 * vn(p.xz * 6.0);
  if (fl < d) { d = fl; mat = 2.0; }
  // sleepers, each a little skewed and worn
  float sid = floor(p.z / 0.7 + 0.5);
  float sl = box3(vec3(q.x + 0.05 * (hs(sid) - 0.5), fy - 0.04, p.z - sid * 0.7),
                  vec3(1.0, 0.05, 0.09 + 0.025 * hs(sid + 5.0))) - 0.012;
  if (sl < d) { d = sl; mat = 3.0; }
  // running rails: head over a thin web
  vec2 rq = vec2(abs(q.x) - 0.72, fy - 0.15);
  float rl = min(box2(rq - vec2(0.0, 0.045), vec2(0.034, 0.02)), box2(rq, vec2(0.011, 0.06))) - 0.006;
  if (rl < d) { d = rl; mat = 4.0; }
  // covered third rail on the right
  float tr = box2(vec2(q.x - 1.24, fy - 0.13), vec2(0.06, 0.025)) - 0.01;
  if (tr < d) { d = tr; mat = 5.0; }
  // cable runs: sag between the rings that hold them
  float s = fract(p.z / SP);
  float sag = 4.0 * s * (1.0 - s);
  float cb = cable(q, 2.50, 1.87, sag * 0.040, 0.026);
  cb = min(cb, cable(q, 2.63, 1.86, sag * 0.062, 0.020));
  cb = min(cb, cable(q, 2.73, 1.85, sag * 0.084, 0.031));
  cb = min(cb, cable(q, 2.88, 1.83, sag * 0.106, 0.022));
  cb = min(cb, cable(q, 2.97, 1.82, sag * 0.128, 0.027));
  cb = min(cb, cable(q, 0.05, 1.86, sag * 0.050, 0.030));
  cb = min(cb, cable(q, 0.21, 1.86, sag * 0.090, 0.020));
  if (cb < d) { d = cb; mat = 6.0; }
  // the nearest wall lamp housing
  float k = floor(p.z / LS + 0.5);
  vec3 lp = lampPos(k);
  vec3 lq = p - lp;
  float lh = max(box3(lq, vec3(0.07, 0.05, 0.32)) - 0.02, -box3(lq - vec3(0.0, -0.07, 0.0), vec3(0.05, 0.04, 0.28)));
  lh = min(lh, box3(lq - vec3(0.0, -0.035, 0.0), vec3(0.035, 0.012, 0.27)) - 0.01);
  if (lh < d) { d = lh; mat = 7.0; }
  // the nearest signal head
  float g = floor((p.z - 5.0) / SG + 0.5);
  vec3 sp = sigPos(g);
  float sh = box3(p - sp, vec3(0.07, 0.2, 0.08)) - 0.02;
  if (sh < d) { d = sh; mat = 8.0; }
  return d;
}

float mapD(vec3 p) {
  float m;
  return map(p, m);
}

vec3 nrm(vec3 p) {
  vec2 e = vec2(0.004, -0.004);
  return normalize(e.xyy * mapD(p + e.xyy) + e.yyx * mapD(p + e.yyx)
                 + e.yxy * mapD(p + e.yxy) + e.xxx * mapD(p + e.xxx));
}

// light from the two nearest lamps and the nearest signal
vec3 lightAt(vec3 p, vec3 n, vec3 rd, float shin, float ks) {
  vec3 l = vec3(0.0);
  float k0 = floor(p.z / LS);
  for (int j = 0; j < 3; j++) {
    float k = k0 + float(j) - 1.0;
    vec3 lp = lampPos(k) + vec3(0.0, -0.1, 0.0);
    vec3 L = lp - p;
    float d2 = dot(L, L);
    L *= inversesqrt(d2);
    float att = lampI(k) * 4.2 / (1.0 + d2 * 0.42);
    float df = max(dot(n, L), 0.0);
    float sp = pow(max(dot(reflect(rd, n), L), 0.0), shin) * ks;
    vec3 lc = lampCol(k);
    l += att * (lc * df + mix(lc, vec3(1.0), 0.5) * sp);
  }
  float g = floor((p.z - 5.0) / SG + 0.5);
  vec3 S = sigPos(g) + vec3(-0.09, 0.0, -0.1) - p;
  float s2 = dot(S, S);
  S *= inversesqrt(s2);
  float sa = gLamp * 1.6 / (1.0 + s2 * 1.4);
  l += sigCol(g) * sa * (max(dot(n, S), 0.0) + pow(max(dot(reflect(rd, n), S), 0.0), shin) * ks);
  return l;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float mat, float t) {
  vec2 q = p.xy - ctr(p.z);
  float ang = atan(q.y, q.x);
  float fine = exp(-t * 0.08);
  vec3 alb = vec3(0.3);
  float shin = 8.0;
  float ks = 0.1;
  vec3 em = vec3(0.0);
  if (mat < 0.5) {
    // grimy lining with soot streaks running down from the crown
    float gr = fbm(vec2(ang * 3.0, p.z * 0.9));
    float soot = vn(vec2(ang * 26.0, p.z * 0.25));
    alb = vec3(0.32) * (0.45 + 0.7 * gr) * (1.0 - 0.45 * smoothstep(0.4, 0.8, soot) * smoothstep(0.0, 1.2, q.y));
    ks = 0.05;
  } else if (mat < 1.5) {
    // cast iron flange with a row of bolt heads
    vec2 q2 = p.xy - ctr(p.z);
    float rr = length(q2);
    float bid = floor(p.z / SP + 0.5);
    float rw = R - 0.05 - 0.02 * hs(bid);
    float b = smoothstep(0.022, 0.01, length(vec2((fract(ang * 9.55) - 0.5) * 0.21, rr - rw))) * smoothstep(0.4, 0.8, abs(n.z));
    alb = vec3(0.2) * (0.6 + 0.6 * fbm(vec2(ang * 9.0, p.z * 4.0)));
    alb += 0.12 * b * fine;
    shin = 18.0;
    ks = 0.25 + 0.3 * b;
  } else if (mat < 2.5) {
    // ballast: grains of stone, wet in pools between the rails
    float gs = vn(p.xz * 22.0) * fine + 0.5 * (1.0 - fine);
    alb = vec3(0.16) * (0.4 + 0.9 * gs);
    shin = 30.0;
    ks = 0.3;
  } else if (mat < 3.5) {
    alb = vec3(0.1) * (0.6 + 0.6 * vn(vec2(p.x * 12.0, p.z * 2.0)));
  } else if (mat < 4.5) {
    // polished rail head, rusty web
    float top = smoothstep(0.4, 0.9, n.y);
    alb = mix(vec3(0.12, 0.07, 0.05), vec3(0.4), top);
    shin = 60.0;
    ks = 0.4 + 1.6 * top;
  } else if (mat < 5.5) {
    alb = vec3(0.22) * (0.7 + 0.4 * vn(p.xz * vec2(3.0, 0.5)));
    ks = 0.15;
  } else if (mat < 6.5) {
    alb = vec3(0.06);
    shin = 24.0;
    ks = 0.35;
  } else if (mat < 7.5) {
    // lamp housing: a frosted lens facing the track glows
    float k = floor(p.z / LS + 0.5);
    alb = vec3(0.08);
    float face = smoothstep(0.3, 0.8, -n.y + 0.5 * abs(n.x));
    vec3 lq = p - lampPos(k);
    float tube = smoothstep(0.03, 0.0, abs(lq.y + 0.035) - 0.012) * smoothstep(0.3, 0.26, abs(lq.z));
    float cage = 1.0 - 0.6 * smoothstep(0.35, 0.5, abs(fract(lq.z * 12.0) - 0.5) * 2.0);
    em = mix(lampCol(k), vec3(1.0), 0.4) * lampI(k) * 3.0 * tube * cage * (0.4 + 0.6 * face);
  } else {
    // signal head: two lenses, the lit one on top
    float g = floor((p.z - 5.0) / SG + 0.5);
    vec3 lp = p - sigPos(g);
    alb = vec3(0.05);
    float lens = smoothstep(0.075, 0.04, length(lp.yz - vec2(0.09, -0.03)));
    float lens2 = smoothstep(0.075, 0.04, length(lp.yz - vec2(-0.09, -0.03)));
    float fc = smoothstep(0.0, 0.5, -n.x);
    em = (sigCol(g) * 5.0 * lens + vec3(0.05, 0.25, 0.12) * 0.2 * lens2) * fc * gLamp;
  }
  vec3 li = lightAt(p, n, rd, shin, ks);
  // ember-dark ambient from the far end and the bed, blue-black from above
  vec3 amb = EMBER * 0.03 * (0.6 - 0.4 * n.y) + c3 * 0.025 * (0.5 + 0.5 * n.y);
  return alb * (li + amb) + em;
}

float march(vec3 ro, vec3 rd, out float mat, out vec3 glow, float tmax, float jit) {
  float t = 0.05 + 0.05 * jit;
  mat = -1.0;
  glow = vec3(0.0);
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * t;
    float m;
    float d = map(p, m);
    // lamp halos and light scattered by the haze along the ray
    float k = floor(p.z / LS + 0.5);
    vec3 lp = lampPos(k);
    float dl = length(p - lp);
    float stp = clamp(d * 0.8, 0.02, 1.2);
    glow += lampCol(k) * lampI(k) * stp * (0.22 * exp(-dl * dl * 7.0) + gHaze * 0.03 / (1.0 + dl * dl * 0.5));
    float g = floor((p.z - 5.0) / SG + 0.5);
    float ds = length(p - sigPos(g) + vec3(0.1, 0.0, 0.0));
    glow += sigCol(g) * gLamp * stp * (0.6 * exp(-ds * ds * 40.0) + gHaze * 0.02 / (1.0 + ds * ds * 2.0));
    if (d < 0.0015 * t + 0.0008) { mat = m; break; }
    t += d * 0.8;
    if (t > tmax) break;
  }
  return t;
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
  gBend = clamp(u_bend, 0.0, 2.0);
  gLamp = clamp(u_lamps, 0.0, 2.0);
  gHaze = clamp(u_haze, 0.0, 2.0);
  float spd = clamp(u_speed, 0.0, 2.0);

  // the eye rides low over the left rail and looks along the bend
  float zc = T * spd * 2.2 + 3.0;
  vec3 ro = vec3(ctr(zc) + vec2(-0.45, -0.25), zc);
  vec3 ta = vec3(ctr(zc + 2.5) + vec2(-0.8, -0.34), zc + 2.5);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.05 * fw);

  float jit = hs2(floor(gl_FragCoord.xy));
  float mat;
  vec3 glow;
  float t = march(ro, rd, mat, glow, 70.0, jit);
  vec3 fogc = c3 * 0.09 + c0 * 0.02 + EMBER * 0.02;
  vec3 col = fogc;
  if (mat > -0.5) {
    vec3 p = ro + rd * t;
    vec3 n = nrm(p);
    col = shade(p, n, rd, mat, t);
    // rail heads and the wet ballast mirror what lies ahead
    vec2 q = p.xy - ctr(p.z);
    float wet = 0.0;
    if (mat > 3.5 && mat < 4.5) wet = smoothstep(0.5, 0.9, n.y) * 0.8;
    if (mat > 1.5 && mat < 2.5) wet = smoothstep(0.5, 0.68, fbm(p.xz * vec2(1.4, 0.35))) * smoothstep(0.75, 0.4, abs(q.x)) * 0.55;
    if (wet > 0.01) {
      vec3 rr = reflect(rd, n);
      float m2;
      vec3 g2;
      float t2 = march(p + n * 0.02, rr, m2, g2, 30.0, jit);
      vec3 rc = fogc;
      if (m2 > -0.5) {
        vec3 p2 = p + n * 0.02 + rr * t2;
        rc = shade(p2, nrm(p2), rr, m2, t + t2);
      }
      rc = mix(fogc, rc, exp(-t2 * 0.05)) + g2;
      float fr = 0.25 + 0.75 * pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
      col = mix(col, rc, wet * fr);
    }
  }
  float fo = 1.0 - exp(-t * (0.03 + 0.02 * gHaze));
  col = mix(col, fogc, fo) + glow;

  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
