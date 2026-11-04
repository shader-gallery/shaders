// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Cathedral nave seen from low in the left aisle, looking up and across: the far arcade of
// compound piers and pointed arches recedes on a diagonal, paired lancet windows burn coral
// high in the clerestory and throw tinted shafts down through drifting dust onto the floor.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest (unused)
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_shafts;  // strength of the tinted light shafts in the haze (default 1.0)
uniform float u_sun;     // sun height, steeper shafts at higher values (default 1.1)
uniform float u_dust;    // amount of drifting dust motes (default 0.8)
uniform float u_drift;   // speed of the slow glide along the aisle (default 1.0)

const float BAY = 4.0;

float h21(vec2 p){ return fract(sin(dot(p, vec2(27.619, 157.43))) * 6271.873); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(19.71, 113.29, 71.37))) * 4813.517); }
float vn(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float vn3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h31(i), h31(i + vec3(1.0,0.0,0.0)), f.x), mix(h31(i + vec3(0.0,1.0,0.0)), h31(i + vec3(1.0,1.0,0.0)), f.x), f.y);
  float b = mix(mix(h31(i + vec3(0.0,0.0,1.0)), h31(i + vec3(1.0,0.0,1.0)), f.x), mix(h31(i + vec3(0.0,1.0,1.0)), h31(i + vec3(1.0,1.0,1.0)), f.x), f.y);
  return mix(a, b, f.z);
}

// pointed (two-centred) arch in its own plane: u across, v above the springing line
float archD(float u, float v, float hw){
  u = abs(u);
  float R = hw * 1.7;
  float a = length(vec2(u + R - hw, v)) - R;
  return v < 0.0 ? u - hw : a;
}

// paired lancets of one clerestory bay, zc centred on the bay
float lancets(float zc, float y){
  float w = archD(abs(zc) - 0.62, y - 11.2, 0.44);
  return max(w, 8.6 - y);
}

vec2 map(vec3 p){
  float xs = abs(p.x);
  float zc = mod(p.z, BAY) - 0.5 * BAY;
  float pz = mod(p.z + 0.5 * BAY, BAY) - 0.5 * BAY;

  vec2 r = vec2(p.y, 0.0);

  // side walls with the arcade and clerestory cut through them
  float slab = max(abs(xs - 3.4) - 0.4, p.y - 13.4);
  float arc = archD(zc, p.y - 4.4, 1.25);
  float win = lancets(zc, p.y);
  float wall = max(slab, -min(arc, win));
  if (wall < r.x) r = vec2(wall, 1.0);

  // glazing set just behind the inner face of the lancets
  float glass = max(abs(xs - 3.15) - 0.02, win);
  if (glass < r.x) r = vec2(glass, 2.0);

  // compound piers: core, four attached shafts, plinth and capital band
  vec2 c = vec2(xs - 3.0, pz);
  float pier = length(c) - 0.48;
  float sh = min(length(c - vec2(-0.5, 0.0)), length(vec2(c.x + 0.12, abs(c.y) - 0.5))) - 0.15;
  pier = max(min(pier, sh), p.y - 13.2);
  float base = max(max(abs(c.x), abs(c.y)) - 0.74, p.y - 0.5);
  base = min(base, max(length(c) - 0.66, p.y - 0.85));
  float cap = max(length(c) - 0.72 + 0.12 * smoothstep(4.2, 4.6, p.y), abs(p.y - 4.4) - 0.2);
  pier = min(pier, min(base, cap));
  if (pier < r.x) r = vec2(pier, 3.0);

  // aisle beyond the arcade: low roof and an outer wall with its own glazed lancet per bay
  float owin = max(archD(zc, p.y - 4.3, 0.55), 1.4 - p.y);
  float aisle = min(max(8.0 - xs, -owin), max(7.6 - p.y, 3.6 - xs));
  if (aisle < r.x) r = vec2(aisle, 1.0);
  float glass2 = max(abs(xs - 8.25) - 0.02, owin);
  if (glass2 < r.x) r = vec2(glass2, 2.0);

  // pointed barrel vault with transverse and diagonal ribs
  float va = archD(p.x, p.y - 13.0, 3.0);
  float vault = max(-va, 12.5 - p.y);
  if (vault < r.x) r = vec2(vault, 1.0);
  float rib = max(abs(pz) - 0.17, -(va + 0.3));
  float rib2 = max(abs(xs / 3.0 - abs(zc) / 2.0) * 1.6 - 0.12, -(va + 0.24));
  rib = max(min(rib, rib2), 12.6 - p.y);
  if (rib < r.x) r = vec2(rib, 3.0);
  return r;
}

vec3 calcN(vec3 p){
  vec2 e = vec2(0.012, -0.012);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
                   e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

// stained glass of a lancet: diamond quarries in a lead grid, colour from the theme
vec3 glassTint(float zc, float y, vec3 c0, vec3 c1, vec3 c2, vec3 c3, out float lead){
  float lz = abs(zc) - 0.62;
  vec2 g = vec2(lz * 3.2 + y * 1.6, lz * 3.2 - y * 1.6);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float hh = h21(id + sign(zc) * 7.0);
  lead = smoothstep(0.03, 0.10, e);
  float k = hh;
  vec3 col = mix(c3, c0, smoothstep(0.0, 0.4, k));
  col = mix(col, c1, smoothstep(0.4, 0.7, k));
  col = mix(col, c2, smoothstep(0.75, 1.0, k));
  float top = smoothstep(10.6, 11.9, y);
  return mix(col, vec3(1.0, 0.93, 0.86), 0.35 * top);
}

// sunlight reaching a point through the right clerestory, as a tint (zero where blocked)
vec3 sunAt(vec3 P, vec3 Ld, vec3 c0, vec3 c1, vec3 c2, vec3 c3){
  float tt = (3.15 - P.x) / max(-Ld.x, 1e-3);
  vec3 Q = P - Ld * tt;
  float zc = mod(Q.z, BAY) - 0.5 * BAY;
  float w = lancets(zc, Q.y);
  float ap = smoothstep(0.06, -0.06, w) * step(P.x, 3.0);
  float lead;
  vec3 tint = glassTint(zc, Q.y, c0, c1, c2, c3, lead);
  return tint * ap * (0.55 + 0.45 * lead);
}

vec3 stoneTex(vec3 p, vec3 n, float m){
  vec2 uv = abs(n.y) > 0.6 ? p.xz : (abs(n.x) > 0.6 ? p.zy : p.xy);
  float ch = m > 2.5 ? 0.42 : 0.55;
  float cy = uv.y / ch;
  float row = floor(cy);
  float fy = fract(cy);
  float cu = uv.x / 1.15 + row * 0.5;
  float col = floor(cu);
  float fu = fract(cu);
  float j = smoothstep(0.0, 0.06, fy) * smoothstep(1.0, 0.94, fy);
  if (m < 2.5) j *= smoothstep(0.0, 0.03, fu) * smoothstep(1.0, 0.97, fu);
  float bh = h21(vec2(col, row) + m * 3.1);
  float grain = 0.75 + 0.25 * vn(uv * 9.0) + 0.12 * vn(uv * 31.0);
  float wear = 0.8 + 0.2 * vn(uv * 1.3 + 4.0);
  return vec3((0.55 + 0.45 * j) * (0.7 + 0.4 * bh) * grain * wear);
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = u_time;

  // contrasting cool ambient: blue-black shade under warm glass light
  vec3 cold = vec3(0.008, 0.014, 0.045);
  vec3 coldMid = vec3(0.030, 0.060, 0.160);
  vec3 hot = vec3(1.0, 0.94, 0.88);

  // camera low in the left aisle, looking up and across the nave
  float zc0 = t * 0.28 * u_drift;
  vec3 ro = vec3(-1.1, 1.7 + 0.08 * sin(t * 0.13), zc0);
  vec3 ta = ro + vec3(2.3 + 0.2 * sin(t * 0.07), 1.7, 6.0);
  vec3 fw = normalize(ta - ro);
  float roll = -0.06 + 0.015 * sin(t * 0.09);
  vec3 rt = normalize(cross(vec3(sin(roll), cos(roll), 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 0.95 * fw);

  vec3 Ld = normalize(vec3(-1.0, -max(u_sun, 0.2), 0.45 + 0.05 * sin(t * 0.05)));
  vec3 Lto = -Ld;

  // march
  float tr = 0.05;
  vec2 hm = vec2(0.0, -1.0);
  for (int i = 0; i < 64; i++) {
    vec2 h = map(ro + rd * tr);
    if (h.x < 0.002 * tr) { hm = h; break; }
    tr += h.x * 0.9;
    if (tr > 60.0) break;
  }
  tr = min(tr, 60.0);

  vec3 col = coldMid * 0.4;
  if (hm.y > -0.5) {
    vec3 P = ro + rd * tr;
    vec3 n = calcN(P);
    float m = hm.y;
    if (m > 1.5 && m < 2.5) {
      // lit glass on the sun side, cool sky glass on the shade side
      float zc = mod(P.z, BAY) - 0.5 * BAY;
      float lead;
      vec3 g = glassTint(zc, P.y, c0, c1, c2, c3, lead);
      if (P.x > 0.0) {
        col = g * (1.1 + 0.5 * vn(vec2(P.z * 2.0, P.y * 2.0 + t * 0.2))) * lead;
        col = mix(col, hot, 0.25 * lead * smoothstep(9.0, 12.0, P.y));
      } else {
        col = (vec3(0.06, 0.12, 0.36) * (0.6 + 0.6 * h21(floor(vec2(zc, P.y) * 3.2))) + c3 * 0.05) * lead;
      }
    } else {
      vec3 alb = stoneTex(P, n, m);
      vec3 sun = sunAt(P + n * 0.03, Ld, c0, c1, c2, c3);
      float dif = max(dot(n, Lto), 0.0);
      vec3 lit = sun * dif * 2.6;
      // ambient: cool from above and from the shade-side glass, faint warm bounce from below
      float ao = 0.35 + 0.65 * clamp(map(P + n * 0.5).x / 0.5, 0.0, 1.0);
      float inAisle = smoothstep(3.7, 4.6, abs(P.x));
      vec3 amb = (coldMid * 1.5 * (0.55 + 0.45 * n.y) + cold) * ao * (1.0 - 0.6 * inAisle);
      amb += c0 * 0.035 * clamp(-n.y + 0.4, 0.0, 1.0);
      // the sunny aisle is washed by its own lancets, the shade aisle stays blue-black
      amb += mix(c3, c0, 0.4) * 0.16 * inAisle * step(0.0, P.x) * ao * (0.4 + 0.6 * smoothstep(8.0, 5.0, P.x));
      // lit rim on mouldings facing the right windows
      amb += c1 * 0.05 * smoothstep(0.3, 1.0, n.x) * smoothstep(6.0, 12.0, P.y);
      vec3 stoneC = mix(vec3(1.0), c2, 0.35);
      if (m < 0.5) {
        // polished floor slabs, wet sheen picks up the sun patches
        stoneC *= 0.55;
        lit *= 1.3;
      }
      col = alb * stoneC * (lit + amb);
      if (m < 0.5) {
        // sheen of the glowing clerestory in the worn floor
        vec3 rf = reflect(rd, n);
        float gl = pow(max(dot(rf, normalize(vec3(0.75, 0.6, 0.3))), 0.0), 6.0);
        col += mix(c3, c0, 0.6) * gl * 0.22 * (0.6 + 0.4 * vn(P.xz * 3.0));
      }
      // warm glow spilling from the clerestory onto the nearby wall faces
      float near = exp(-abs(P.y - 10.4) * 0.6) * smoothstep(2.4, 3.2, P.x);
      col += c0 * 0.06 * near * alb;
    }
    float fog = 1.0 - exp(-tr * 0.028);
    col = mix(col, coldMid * 0.5 + c3 * 0.03, fog * 0.7);
  }

  // volumetric shafts: tinted light through the lancets, swirled by slow haze
  float tEnd = min(tr, 40.0);
  float dt = tEnd / 24.0;
  float jit = h21(gl_FragCoord.xy + fract(t) * 13.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float ts = (float(i) + jit) * dt;
    vec3 S = ro + rd * ts;
    vec3 sun = sunAt(S, Ld, c0, c1, c2, c3);
    float dens = 0.3 + 0.7 * vn3(S * 0.45 + vec3(t * 0.04, -t * 0.03, t * 0.02));
    dens *= 0.6 + 0.4 * vn3(S * 1.3 - vec3(0.0, t * 0.05, 0.0));
    acc += sun * dens * dt * exp(-ts * 0.03);
  }
  float ph = 0.45 + 0.9 * pow(max(dot(rd, Lto), 0.0), 3.0);
  col += acc * 0.28 * u_shafts * ph;
  float shaftL = dot(acc, vec3(0.33)) * 0.28;

  // dust motes, brightest where they cross a shaft
  for (int kk = 0; kk < 3; kk++) {
    float k = float(kk);
    float sc = 10.0 + k * 8.0;
    vec2 g = uv * sc + vec2(t * (0.025 + 0.015 * k), -t * 0.03 * (1.0 + 0.5 * k));
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float ha = h21(id + k * 17.0);
    float hb = h21(id + k * 17.0 + 5.3);
    vec2 off = (vec2(ha, hb) - 0.5) * 0.6 + 0.12 * vec2(sin(t * 0.37 + ha * 6.28), cos(t * 0.29 + hb * 6.28));
    float rad = (0.035 + 0.05 * h21(id + 9.1)) * (1.0 + 0.5 * k);
    float dm = length(f - off);
    float mo = smoothstep(rad, rad * 0.15, dm);
    float tw = 0.5 + 0.5 * sin(t * (0.6 + ha) + hb * 19.0);
    float present = step(1.0 - u_dust * 0.4, h21(id + 2.7));
    col += mo * tw * present * (0.03 + 1.6 * shaftL) * mix(c2, hot, 0.5) * (1.0 - 0.25 * k);
  }

  gl_FragColor = vec4(col, 1.0);
}
