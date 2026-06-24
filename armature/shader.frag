// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_cage;           // wire vs solid balance (default 0.5)
uniform float u_gauge;          // cage tube thickness   (default 0.4)
uniform float u_glow;           // cage brightness       (default 0.7)
uniform float u_spin;           // counter-rotation      (default 0.45)
uniform float u_mouseInfluence; // pointer parallax      (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

const float PHI = 1.618033988749895;
const float A = 0.57735027;
const float P = 0.93417236;
const float Q = 0.35682209;

// inner core: dodecahedron
float sdDodeca(vec3 p, float r){
  p = abs(p);
  vec3 n = normalize(vec3(0.0, 1.0, PHI));
  float d = dot(p, n);
  d = max(d, dot(p, vec3(n.y, n.z, n.x)));
  d = max(d, dot(p, vec3(n.z, n.x, n.y)));
  return d - r;
}

float gCoreR;
float mapCore(vec3 p){ return sdDodeca(p, gCoreR); }

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0016, 0.0);
  return normalize(vec3(
    mapCore(p + e.xyy) - mapCore(p - e.xyy),
    mapCore(p + e.yxy) - mapCore(p - e.yxy),
    mapCore(p + e.yyx) - mapCore(p - e.yyx)));
}

// cage: icosahedron edges via top-two face dots
void acc(vec3 p, vec3 n, inout float m1, inout float m2){
  float d = dot(p, n);
  if (d > m1){ m2 = m1; m1 = d; } else if (d > m2){ m2 = d; }
}
vec2 faceTop2(vec3 p){
  float m1 = -1e9, m2 = -1e9;
  acc(p, vec3( A, A, A), m1, m2); acc(p, vec3( A, A,-A), m1, m2);
  acc(p, vec3( A,-A, A), m1, m2); acc(p, vec3( A,-A,-A), m1, m2);
  acc(p, vec3(-A, A, A), m1, m2); acc(p, vec3(-A, A,-A), m1, m2);
  acc(p, vec3(-A,-A, A), m1, m2); acc(p, vec3(-A,-A,-A), m1, m2);
  acc(p, vec3(0.0, Q, P), m1, m2); acc(p, vec3(0.0, Q,-P), m1, m2);
  acc(p, vec3(0.0,-Q, P), m1, m2); acc(p, vec3(0.0,-Q,-P), m1, m2);
  acc(p, vec3( P, 0.0, Q), m1, m2); acc(p, vec3( P, 0.0,-Q), m1, m2);
  acc(p, vec3(-P, 0.0, Q), m1, m2); acc(p, vec3(-P, 0.0,-Q), m1, m2);
  acc(p, vec3( Q, P, 0.0), m1, m2); acc(p, vec3( Q,-P, 0.0), m1, m2);
  acc(p, vec3(-Q, P, 0.0), m1, m2); acc(p, vec3(-Q,-P, 0.0), m1, m2);
  return vec2(m1, m2);
}

vec3 bg(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  return mix(c3 * 0.05, c0 * 0.16, smoothstep(0.0, 0.8, y)) + c3 * 0.03;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  gCoreR = 0.78;
  float cageR = 1.32;          // face inradius the cage sits on

  vec3 ro = vec3(0.0, 0.0, 3.6);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.4;
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  float a = u_time * u_spin * 0.35;
  mat2 crxz = rot(a),  cryz = rot(a * 0.7);        // core spin
  mat2 grxz = rot(-a * 0.8), gryz = rot(-a * 0.55); // cage counter-spin

  // 1) march the inner solid
  float tt = 0.0, hit = 0.0;
  for (int i = 0; i < 80; i++){
    vec3 p = ro + rd * tt;
    p.xz = crxz * p.xz; p.yz = cryz * p.yz;
    float d = mapCore(p);
    if (d < 0.0014){ hit = 1.0; break; }
    if (tt > 7.0) break;
    tt += d * 0.7;
  }
  float tSolid = hit > 0.5 ? tt : 1e9;

  vec3 col = bg(rd);
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    p.xz = crxz * p.xz; p.yz = cryz * p.yz;
    vec3 n = calcNormal(p);
    vec3 rdl = rd; rdl.xz = crxz * rdl.xz; rdl.yz = cryz * rdl.yz;
    vec3 L1 = normalize(vec3(0.5, 0.8, 0.45));
    float dif = max(dot(n, L1), 0.0);
    vec3 ref = reflect(rdl, n);
    float spec = pow(max(dot(ref, L1), 0.0), 50.0);
    float fres = pow(1.0 - max(dot(-rdl, n), 0.0), 4.0);
    vec3 base = mix(c0, c2, n.y * 0.5 + 0.5) * 1.3 + 0.04;
    col = base * (0.3 + 1.0 * dif) * (1.0 - 0.4 * u_cage);
    col += vec3(1.0) * spec * 0.5;
    col += c2 * fres * 0.6;
  }

  // 2) accumulate the cage glow in front of the core
  const float R = 1.75;
  float bq = dot(ro, rd);
  float cq = dot(ro, ro) - R * R;
  float hq = bq * bq - cq;
  if (hq > 0.0){
    hq = sqrt(hq);
    float t0 = max(-bq - hq, 0.0);
    float t1 = min(-bq + hq, tSolid);   // occluded behind the solid
    if (t1 > t0){
      float edgeK = mix(110.0, 28.0, u_gauge);
      vec3 glow = vec3(0.0);
      for (int i = 0; i < 64; i++){
        float f = (float(i) + 0.5) / 64.0;
        float t = mix(t0, t1, f);
        vec3 p = ro + rd * t;
        p.xz = grxz * p.xz; p.yz = gryz * p.yz;
        vec2 m = faceTop2(p);
        float shell = exp(-pow((m.x - cageR) * 13.0, 2.0));
        float edge = exp(-(m.x - m.y) * edgeK);
        vec3 ec = mix(c2, c1, f) + c0 * 0.2;
        glow += shell * edge * ec;
      }
      col += glow * ((t1 - t0) / 64.0) * (1.4 + 2.6 * u_glow) * (0.4 + 0.9 * u_cage);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
