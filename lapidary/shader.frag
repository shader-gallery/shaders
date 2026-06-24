// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_fire;           // iridescent dispersion (default 0.55)
uniform float u_cut;            // edge sparkle          (default 0.5)
uniform float u_light;          // key strength          (default 0.6)
uniform float u_spin;           // tumble speed          (default 0.45)
uniform float u_mouseInfluence; // pointer parallax      (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

const float A = 0.57735027;
const float P = 0.93417236;
const float Q = 0.35682209;

void acc(vec3 p, vec3 n, inout float m1, inout float m2, inout vec3 bn){
  float d = dot(p, n);
  if (d > m1){ m2 = m1; m1 = d; bn = n; } else if (d > m2){ m2 = d; }
}

// icosahedron distance + flat facet normal + edge gap, in one sweep
void faceData(vec3 p, out float dist, out vec3 fn, out float gap){
  float m1 = -1e9, m2 = -1e9; vec3 bn = vec3(0.0, 1.0, 0.0);
  acc(p, vec3( A, A, A), m1, m2, bn); acc(p, vec3( A, A,-A), m1, m2, bn);
  acc(p, vec3( A,-A, A), m1, m2, bn); acc(p, vec3( A,-A,-A), m1, m2, bn);
  acc(p, vec3(-A, A, A), m1, m2, bn); acc(p, vec3(-A, A,-A), m1, m2, bn);
  acc(p, vec3(-A,-A, A), m1, m2, bn); acc(p, vec3(-A,-A,-A), m1, m2, bn);
  acc(p, vec3(0.0, Q, P), m1, m2, bn); acc(p, vec3(0.0, Q,-P), m1, m2, bn);
  acc(p, vec3(0.0,-Q, P), m1, m2, bn); acc(p, vec3(0.0,-Q,-P), m1, m2, bn);
  acc(p, vec3( P, 0.0, Q), m1, m2, bn); acc(p, vec3( P, 0.0,-Q), m1, m2, bn);
  acc(p, vec3(-P, 0.0, Q), m1, m2, bn); acc(p, vec3(-P, 0.0,-Q), m1, m2, bn);
  acc(p, vec3( Q, P, 0.0), m1, m2, bn); acc(p, vec3( Q,-P, 0.0), m1, m2, bn);
  acc(p, vec3(-Q, P, 0.0), m1, m2, bn); acc(p, vec3(-Q,-P, 0.0), m1, m2, bn);
  dist = m1 - 1.0;     // face inradius = 1.0
  fn = bn;
  gap = m1 - m2;
}

float map(vec3 p){ float d; vec3 fn; float g; faceData(p, d, fn, g); return d; }

vec3 bg(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.08, c0 * 0.30, smoothstep(0.0, 0.7, y));
  col = mix(col, c2 * 0.5, smoothstep(0.55, 1.0, y));
  return col;
}

// cheap spectral ramp through the palette for dispersion fire
vec3 fireTint(float h){
  h = fract(h);
  if (h < 0.33) return mix(c0, c1, h / 0.33);
  if (h < 0.66) return mix(c1, c2, (h - 0.33) / 0.33);
  return mix(c2, c0, (h - 0.66) / 0.34);
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.3);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.4;
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  float a = u_time * u_spin * 0.35;
  mat2 rxz = rot(a), ryz = rot(a * 0.62);

  float tt = 0.0, hit = 0.0;
  for (int i = 0; i < 80; i++){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    float d = map(p);
    if (d < 0.0012){ hit = 1.0; break; }
    if (tt > 8.0) break;
    tt += d * 0.7;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    float d; vec3 n; float gap;
    faceData(p, d, n, gap);             // n is the flat facet normal
    vec3 rdl = rd; rdl.xz = rxz * rdl.xz; rdl.yz = ryz * rdl.yz;

    vec3 L1 = normalize(vec3(0.5, 0.85, 0.4));
    float dif = max(dot(n, L1), 0.0);
    vec3 ref = reflect(rdl, n);
    float spec = pow(max(dot(ref, L1), 0.0), 60.0);
    float fres = pow(1.0 - max(dot(-rdl, n), 0.0), 4.0);

    // per-facet iridescent fire: hue driven by facet orientation + time
    float h = dot(n, vec3(1.3, 0.7, 0.4)) + u_time * 0.04;
    vec3 facetCol = mix(mix(c0, c2, dif), fireTint(h), u_fire);
    col = facetCol * (0.34 + (0.6 + 0.7 * u_light) * dif);
    col += vec3(1.0) * spec * 0.35;
    col += c1 * fres * 0.55;

    // edge sparkle where two facets meet
    float ew = mix(0.05, 0.012, u_cut);
    float edge = 1.0 - smoothstep(0.0, ew, gap);
    col += (vec3(1.0) + fireTint(h + 0.5) * 0.6) * edge * (0.4 + 1.2 * u_cut);
  } else {
    col = bg(rd);
  }

  gl_FragColor = vec4(col, 1.0);
}
