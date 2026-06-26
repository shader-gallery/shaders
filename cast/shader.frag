// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_flow;           // morph speed       (default 0.5)
uniform float u_reach;          // transition overshoot (default 0.55)
uniform float u_polish;         // gloss             (default 0.6)
uniform float u_spin;           // tumble speed      (default 0.45)
uniform float u_mouseInfluence; // pointer parallax  (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdRoundBox(vec3 p, float b, float r){
  vec3 q = abs(p) - vec3(b);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdOcta(vec3 p, float s){
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}
float sdTorus(vec3 p, vec2 t){
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float gFr, gReach;
int gA, gB;

float prim(vec3 p, int idx){
  if (idx == 0) return sdSphere(p, 0.92);
  if (idx == 1) return sdRoundBox(p, 0.62, 0.16);
  if (idx == 2) return sdOcta(p, 1.12);
  return sdTorus(p, vec2(0.66, 0.30));
}

float map(vec3 p){
  float da = prim(p, gA);
  float db = prim(p, gB);
  // smooth blend, with an overshoot bulge mid-transition (Reach)
  float bulge = gReach * 0.18 * sin(gFr * 3.14159265);
  return mix(da, db, gFr) - bulge;
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0017, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

vec3 bg(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.10, c0 * 0.34, smoothstep(0.0, 0.7, y));
  col = mix(col, c2 * 0.55, smoothstep(0.55, 1.0, y));
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  float seq = u_time * u_flow * 0.18;
  float seg = floor(seq);
  gFr = smoothstep(0.0, 1.0, fract(seq));
  gA = int(mod(seg, 4.0));
  gB = int(mod(seg + 1.0, 4.0));
  gReach = u_reach;

  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.4;
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  float a = u_time * u_spin * 0.35;
  mat2 rxz = rot(a), ryz = rot(a * 0.6);

  float tt = 0.0, hit = 0.0;
  for (int i = 0; i < 96; i++){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    float d = map(p);
    if (d < 0.0012){ hit = 1.0; break; }
    if (tt > 8.0) break;
    tt += d * 0.65;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    vec3 n = calcNormal(p);
    vec3 rdl = rd; rdl.xz = rxz * rdl.xz; rdl.yz = ryz * rdl.yz;

    vec3 L1 = normalize(vec3(0.5, 0.8, 0.45));
    vec3 L2 = normalize(vec3(-0.6, 0.25, 0.5));
    float dif = max(dot(n, L1), 0.0);
    float dif2 = max(dot(n, L2), 0.0);
    vec3 ref = reflect(rdl, n);
    float shin = mix(18.0, 160.0, u_polish);
    float spec = pow(max(dot(ref, L1), 0.0), shin);
    float fres = pow(1.0 - max(dot(-rdl, n), 0.0), 4.0);

    vec3 base = mix(c0, c2, n.y * 0.5 + 0.5) * 1.5 + 0.05;
    col = base * (0.32 + 1.1 * dif) + c1 * 0.32 * dif2;
    col += vec3(1.0) * spec * (0.5 + 0.6 * u_polish);
    col += c2 * fres * 0.7;
    col *= 0.6 + 0.4 * (n.y * 0.5 + 0.5);
  } else {
    col = bg(rd);
  }

  gl_FragColor = vec4(col, 1.0);
}
