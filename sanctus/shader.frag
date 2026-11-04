// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Sanctus - looking down a gothic nave of pointed bays. Low sun pours through
// the stained clerestory lancets on the south wall and cuts tinted diagonal shafts
// across the nave, laying coloured window patches on the piers and the paving.
// Dust drifts through the beams; the far bays and the east window sink into a
// blue-black haze.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_shafts;    // brightness of the light shafts in the air      (default 1.2)
uniform float u_dust;      // density of drifting dust and motes             (default 1.0)
uniform float u_sunHeight; // how steeply the sun falls through the windows  (default 1.0)

const float W = 2.2;     // nave half width
const float B = 2.4;     // bay length
const float ZEND = 21.6; // east wall
const float YS = 7.8;    // vault springing

vec3 gL;
vec3 gc0; vec3 gc1; vec3 gc2; vec3 gc3; vec3 gHot;

float h21(vec2 p) { return fract(sin(dot(p, vec2(27.619, 57.583))) * 43191.73); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(17.13, 61.71, 37.97))) * 24917.31); }

float vn2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float vn3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vn2(p);
    p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.07 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return v / 0.9375;
}

// pointed arch opening in 2D, negative inside: half width w, springing h, bottom b
float archO(vec2 q, float w, float h, float k, float b) {
  float a = w * k;
  float R = w + a;
  float d = q.y < h ? abs(q.x) - w
                    : max(length(q - vec2(a, h)), length(q - vec2(-a, h))) - R;
  return max(d, b - q.y);
}

// clerestory window shape in its wall plane: two lancets and a foiled oculus
float winD(float zb, float y) {
  float lan = archO(vec2(abs(zb) - 0.4, y), 0.27, 6.5, 0.8, 5.0);
  vec2 o = vec2(zb, y - 7.42);
  float an = atan(o.y, o.x);
  float ocu = length(o) - 0.2 - 0.035 * cos(an * 4.0);
  return min(lan, ocu);
}

// stained glass quarries: colour of the pane at a point on the window plane
vec3 pane(vec2 g, float bay, float leadK) {
  vec2 r = vec2(g.x + g.y, g.x - g.y) * 5.5;
  vec2 id = floor(r);
  vec2 f = fract(r);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float lead = smoothstep(0.1, 0.03, e);
  float h = h21(id + bay * 7.13);
  vec3 c = h < 0.34 ? gc1 : (h < 0.6 ? gc0 : (h < 0.8 ? gc2 : gHot));
  return c * (0.65 + 0.6 * h21(id + 3.7)) * (1.0 - leadK * lead);
}

// sunlight arriving at a point inside the nave through the south clerestory
vec3 sunAt(vec3 q, float soft, float leadK) {
  float s = (q.x + W + 0.3) / max(-gL.x, 0.05);
  vec3 w = q + gL * s;
  if (w.z < -4.0 || w.z > ZEND - 0.2) return vec3(0.0);
  float bay = floor(w.z / B);
  float zb = w.z - (bay + 0.5) * B;
  float m = smoothstep(soft, -soft, winD(zb, w.y));
  if (m <= 0.0) return vec3(0.0);
  return pane(vec2(zb, w.y), bay, leadK) * m;
}

float map(vec3 p) {
  float ax = abs(p.x);
  float zb = mod(p.z, B) - 0.5 * B;
  float dp = abs(abs(zb) - 0.5 * B);
  // main vessel with a pointed vault
  float a = 1.0;
  float R = W + a;
  float nave = p.y < YS ? ax - W
             : max(length(vec2(p.x - a, p.y - YS)), length(vec2(p.x + a, p.y - YS))) - R;
  // transverse ribs and wall shafts on every pier line
  nave += 0.16 * (1.0 - smoothstep(0.05, 0.17, dp));
  // arcade into the aisles
  float arc = max(archO(vec2(zb, p.y), 0.5 * B - 0.38, 2.7, 0.55, -1.0), ax - (W + 0.75));
  float aisle = max(abs(ax - (W + 1.9)) - 1.3, p.y - 4.3);
  // triforium recesses
  float tu = mod(zb + 0.5 * B, B / 3.0) - B / 6.0;
  float tri = max(archO(vec2(tu, p.y), B / 6.0 - 0.1, 4.55, 0.5, 3.95), ax - (W + 0.28));
  // clerestory recess, glazed at mid wall
  float win = max(winD(zb, p.y), ax - (W + 0.3));
  float air = min(min(nave, arc), min(aisle, min(tri, win)));
  // east window: three lancets, the centre one taller
  float u = abs(p.x);
  float u2 = u < 0.5 ? u : u - 1.0;
  float eh = u < 0.5 ? 7.4 : 6.4;
  float ew = max(archO(vec2(u2, p.y), 0.34, eh, 0.9, 3.0), p.z - (ZEND + 0.3));
  air = max(air, p.z - ZEND);
  air = min(air, ew);
  air = max(air, -p.z - 4.0);
  float s = min(-air, p.y);
  // clustered piers with capitals and plinths
  float pid = floor(p.z / B + 0.5);
  float rv = 0.02 * h21(vec2(pid, sign(p.x)));
  float g = 0.08 * (1.0 - smoothstep(0.28, 0.42, p.y)) + 0.07 * smoothstep(2.45, 2.6, p.y);
  float core = length(vec2(ax - (W - 0.02), dp)) - 0.29 - rv - g;
  float s1 = length(vec2(ax - (W - 0.02), dp - 0.31)) - 0.1 - g;
  float s2 = length(vec2(ax - (W - 0.32), dp)) - 0.1 - g;
  // the core stops at the capital, the slender shafts run on up to the vault
  float pier = min(max(core, p.y - 2.78), max(min(s1, s2), p.y - YS));
  return min(s, pier);
}

vec3 nrm(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) +
                   k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

void main() {
  vec2 res = u_resolution;
  float mn = min(res.x, res.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  gc0 = c0; gc1 = c1; gc2 = c2; gc3 = c3;
  gHot = mix(c1, vec3(1.0, 0.95, 0.92), 0.7);
  float shK = max(u_shafts, 0.0);
  float duK = max(u_dust, 0.0);
  float sunH = clamp(u_sunHeight, 0.5, 2.0);

  // the low sun swings slowly along the south wall
  gL = normalize(vec3(-0.8, 0.9 * sunH, 0.32 + 0.1 * sin(t * 0.045)));

  // camera right of the aisle line, looking east and a little up into the vault
  vec3 ro = vec3(0.55 + 0.05 * sin(t * 0.06), 1.7, -3.6 + 0.35 * sin(t * 0.035));
  vec3 fw = normalize(vec3(-0.13, 0.24, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw + (p.x * rt + p.y * up) * 0.78);

  // march
  float tt = 0.05;
  for (int i = 0; i < 64; i++) {
    float d = map(ro + rd * tt);
    if (d < 0.0015 * tt) break;
    tt += 0.9 * d;
    if (tt > 34.0) break;
  }
  tt = min(tt, 34.0);
  vec3 pos = ro + rd * tt;
  vec3 n = nrm(pos, 0.002 + 0.0015 * tt);

  float ao = 1.0;
  for (int j = 1; j < 4; j++) {
    float hj = 0.12 * float(j);
    ao -= (hj - map(pos + n * hj)) * (0.9 / float(j));
  }
  ao = clamp(ao, 0.15, 1.0);

  // cool blue-black ambient against the warm stained sunlight
  vec3 amb = vec3(0.04, 0.075, 0.22);
  vec3 col;
  float ax = abs(pos.x);
  float bay = floor(pos.z / B);
  bool sideGlass = ax > W + 0.26 && pos.y > 4.97 && pos.y < 7.8;
  bool endGlass = pos.z > ZEND + 0.26;
  if (sideGlass) {
    float zb = pos.z - (bay + 0.5) * B;
    vec3 gcol = pane(vec2(zb, pos.y), bay, 0.9);
    if (pos.x < 0.0) col = gcol * 3.2;
    else col = mix(vec3(0.06, 0.1, 0.32), gcol * 0.4, 0.4);
  } else if (endGlass) {
    col = pane(vec2(pos.x * 0.8, pos.y * 0.8), 31.0, 0.9) * mix(vec3(0.5, 0.6, 1.0), vec3(1.0), 0.5) * 1.8;
  } else {
    vec3 alb;
    col = vec3(0.0);
    if (pos.y < 0.01) {
      // paving slabs, worn and polished
      vec2 sg = pos.xz / 1.1;
      vec2 sid = floor(sg);
      vec2 sf = abs(fract(sg) - 0.5);
      float joint = smoothstep(0.47, 0.495, max(sf.x, sf.y));
      float tone = h21(sid);
      alb = mix(vec3(0.42, 0.38, 0.4), vec3(0.75, 0.7, 0.68), tone) * (0.8 + 0.35 * fbm(pos.xz * 3.0));
      alb *= 1.0 - 0.6 * joint;
      // polished slabs pick up a cold sheen from the vault and the north glass
      float fres = pow(1.0 - max(-rd.y, 0.0), 4.0);
      col += vec3(0.03, 0.055, 0.16) * fres * (1.0 - joint) * (0.6 + 0.4 * tone);
    } else {
      // ashlar courses with offset joints and weathering
      float cy = pos.y / 0.42;
      float row = floor(cy);
      float run = (pos.z + pos.x) / 0.9 + 0.5 * mod(row, 2.0);
      float jy = abs(fract(cy) - 0.5);
      float jx = abs(fract(run) - 0.5);
      float joint = max(smoothstep(0.44, 0.49, jy), smoothstep(0.46, 0.495, jx));
      float wv = fbm(vec2(pos.z + pos.x, pos.y) * 2.5);
      alb = vec3(0.82, 0.76, 0.74) * (0.7 + 0.45 * wv) * (0.9 + 0.2 * h21(vec2(row, floor(run))));
      alb *= 1.0 - 0.45 * joint;
    }
    // projected glass reads as soft coloured blotches on the stone
    vec3 sun = sunAt(pos, 0.07, 0.3) * max(dot(n, gL), 0.0);
    sun = mix(vec3(dot(sun, vec3(0.33))) * mix(c1, gHot, 0.5) * 1.3, sun, 0.55);
    if (pos.x < -W + 0.05 || pos.y > YS + 2.5) sun *= 0.0;
    // cool light from the clerestory reaches the upper walls, the aisles stay dark
    float ambK = (0.7 + 0.45 * smoothstep(1.0, 9.0, pos.y)) * (ax > W + 0.4 ? 0.3 : 1.0);
    col += alb * (sun * 1.9 + amb * (0.55 + 0.45 * n.y) * ao * ambK);
    // cold fill from the unlit north glass across the nave
    vec3 Lc = normalize(vec3(1.0, 0.55, -0.15));
    col += alb * vec3(0.05, 0.1, 0.32) * max(dot(n, Lc), 0.0) * ao * (ax > W + 0.4 ? 0.25 : 1.0) * (0.4 + 0.6 * smoothstep(0.0, 7.0, pos.y));
    // warm bounce off the sunlit paving onto the lower piers
    col += alb * c3 * 0.22 * exp(-pos.y * 0.45) * ao * (1.0 - 0.6 * max(n.y, 0.0));
    // warm spill from the lit south glass on the upper walls and vault
    float spill = exp(-abs(pos.x + W) * 0.6) * smoothstep(3.5, 7.0, pos.y);
    col += alb * mix(c3, c0, 0.4) * 0.35 * spill * ao;
    // blue spill around the north clerestory
    float nspill = exp(-abs(pos.x - W) * 0.7) * smoothstep(3.0, 7.0, pos.y) * (1.0 - smoothstep(9.0, 11.0, pos.y));
    col += alb * vec3(0.04, 0.08, 0.3) * nspill * ao;
  }

  // haze: far bays dissolve into blue-black with a wine undertone
  vec3 fogC = vec3(0.018, 0.028, 0.075) + c3 * 0.06;
  col = mix(col, fogC, 1.0 - exp(-tt * 0.06));

  // volumetric shafts through drifting dust
  float jit = h21(gl_FragCoord.xy + fract(t * 0.37) * 17.0);
  float mlen = min(tt, 26.0);
  vec3 scat = vec3(0.0);
  for (int k = 0; k < 32; k++) {
    float s = (float(k) + jit) / 32.0 * mlen;
    vec3 q = ro + rd * s;
    if (abs(q.x) < W && q.y < YS + 2.0) {
      vec3 li = sunAt(q, 0.06, 0.3);
      vec3 dq = q * 0.7 + vec3(0.06 * t, -0.03 * t, 0.04 * t);
      float wv = vn3(dq) * 0.65 + vn3(dq * 2.3 + 4.0) * 0.35;
      float den = 0.18 + duK * 1.6 * wv * wv;
      scat += li * den * exp(-s * 0.035) * smoothstep(1.0, 5.0, s);
    }
  }
  col += scat * (mlen / 32.0) * 0.14 * shK;

  // motes at four depths: crisp near, soft and small far away
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float dk = 2.2 + fk * fk * 2.0 + fk * 1.2;
    if (dk < tt) {
      float sc = 5.0 + fk * 4.0;
      vec2 uv = p * sc + vec2(0.04 * t + 0.3 * sin(t * 0.1 + fk), -0.06 * t) + fk * 13.7;
      vec2 ci = floor(uv);
      vec2 cf = fract(uv) - 0.5 - (vec2(h21(ci + fk), h21(ci + 4.1 + fk)) - 0.5) * 0.7;
      float sz = (0.02 + 0.03 * h21(ci + 8.3)) * (1.0 - fk * 0.15);
      float r = length(cf);
      float crisp = smoothstep(sz, sz * 0.6, r);
      float softm = exp(-r * r / (sz * sz * 1.8));
      float m = mix(crisp, softm, fk / 3.0) * step(1.0 - 0.35 * duK, h21(ci + 2.2 + fk));
      vec3 mq = ro + rd * dk;
      vec3 li = sunAt(mq, 0.25, 0.0);
      col += (li * 1.4 + amb * 0.6) * m * (1.0 - fk * 0.18);
    }
  }

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
