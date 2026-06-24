// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_index;          // refractive strength   (default 0.5)
uniform float u_dispersion;     // colour split          (default 0.5)
uniform float u_clarity;        // clear vs tinted       (default 0.6)
uniform float u_spin;           // tumble speed          (default 0.4)
uniform float u_mouseInfluence; // pointer parallax      (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdOcta(vec3 p, float s){
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 q;
  if (3.0 * p.x < m) q = p.xyz;
  else if (3.0 * p.y < m) q = p.yzx;
  else if (3.0 * p.z < m) q = p.zxy;
  else return m * 0.57735027;
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}

float map(vec3 p){ return sdOcta(p, 1.05); }

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// palette environment with a couple of soft light sources to refract
vec3 env(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.12, c0 * 0.55, smoothstep(0.0, 0.65, y));
  col = mix(col, c2 * 0.9, smoothstep(0.5, 1.0, y));
  col += c2 * 1.1 * pow(smoothstep(0.55, 1.0, y), 3.0);                 // overhead softbox
  col += c1 * 0.6 * pow(max(rd.x * 0.5 + 0.5, 0.0), 5.0);              // warm side light
  col += c0 * 0.5 * pow(max(-rd.x * 0.5 + 0.5, 0.0), 5.0);            // cool side light
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.5);
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
  for (int i = 0; i < 70; i++){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    float d = map(p);
    if (d < 0.0013){ hit = 1.0; break; }
    if (tt > 8.0) break;
    tt += d * 0.85;
  }

  vec3 col;
  if (hit > 0.5){
    // work in object space (rotate ray + origin)
    vec3 rol = ro; rol.xz = rxz * rol.xz; rol.yz = ryz * rol.yz;
    vec3 rdl = rd; rdl.xz = rxz * rdl.xz; rdl.yz = ryz * rdl.yz;
    vec3 p1 = rol + rdl * tt;
    vec3 n1 = calcNormal(p1);

    float fres = pow(1.0 - max(dot(-rdl, n1), 0.0), 4.0);
    float ior = mix(1.1, 1.7, u_index);
    float disp = u_dispersion * 0.10;

    // refract into the glass (green channel sets the internal path)
    vec3 inG = refract(rdl, n1, 1.0 / ior);
    // march to the far surface from just inside
    float ti = 0.02;
    for (int j = 0; j < 28; j++){
      vec3 q = p1 + inG * ti;
      float d = map(q);
      if (d > -0.001) break;
      ti -= d * 0.9;            // d is negative inside
    }
    vec3 p2 = p1 + inG * ti;
    vec3 n2 = calcNormal(p2);  // outward normal at exit

    // per-channel exit refraction -> chromatic dispersion
    vec3 oR = refract(rdl, n1, 1.0 / (ior + disp));
    vec3 oG = inG;
    vec3 oB = refract(rdl, n1, 1.0 / (ior - disp));
    oR = refract(oR, -n2, ior + disp);
    oG = refract(oG, -n2, ior);
    oB = refract(oB, -n2, ior - disp);
    // fall back to a through-ray if total internal reflection zeroed a channel
    if (dot(oR, oR) < 0.1) oR = rdl;
    if (dot(oG, oG) < 0.1) oG = rdl;
    if (dot(oB, oB) < 0.1) oB = rdl;

    // rotate exit rays back to world space for the environment lookup
    vec3 wR = oR, wG = oG, wB = oB;
    wR.yz = rot(-a * 0.6) * wR.yz; wR.xz = rot(-a) * wR.xz;
    wG.yz = rot(-a * 0.6) * wG.yz; wG.xz = rot(-a) * wG.xz;
    wB.yz = rot(-a * 0.6) * wB.yz; wB.xz = rot(-a) * wB.xz;
    vec3 refr = vec3(env(wR).r, env(wG).g, env(wB).b);

    // a faint internal tint when Clarity is low
    float path = ti;
    vec3 tint = mix(c0, c2, 0.5);
    refr *= mix(exp(-path * (1.0 - u_clarity) * 1.2) * mix(tint, vec3(1.0), u_clarity), vec3(1.0), u_clarity);

    // fresnel reflection of the environment off the front face
    vec3 wRef = reflect(rdl, n1);
    wRef.yz = rot(-a * 0.6) * wRef.yz; wRef.xz = rot(-a) * wRef.xz;
    vec3 refl = env(wRef);

    col = mix(refr, refl, fres * 0.9);
    col += c2 * fres * 0.4;            // bright rim
  } else {
    col = env(rd);
  }

  gl_FragColor = vec4(col, 1.0);
}
