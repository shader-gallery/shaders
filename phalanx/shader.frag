// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_density;        // lattice packing   (default 0.5)
uniform float u_drift;          // flow speed        (default 0.5)
uniform float u_fog;            // depth haze        (default 0.55)
uniform float u_tilt;           // per-cell tumble   (default 0.4)
uniform float u_mouseInfluence; // pointer steer     (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float sdOcta(vec3 p, float s){
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

float gSp, gT, gTilt;

float map(vec3 p){
  p.z += gT;                        // flow toward camera
  vec3 id = floor(p / gSp + 0.5);
  vec3 c = p - gSp * id;            // local cell coords
  // per-cell jitter so the lattice reads as a swarm, not a rigid grid
  vec3 jit = (vec3(hash(id + 1.1), hash(id + 2.7), hash(id + 5.3)) - 0.5) * gSp * 0.45;
  c -= jit;
  float ang = hash(id) * 6.2831853 + gT * 0.6;
  c.xy = rot(ang * gTilt) * c.xy;
  c.yz = rot(ang * 0.7 * gTilt) * c.yz;
  float sz = mix(0.12, 0.26, hash(id + 3.3));
  return sdOcta(c, sz);
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  gSp = mix(2.6, 1.5, u_density);
  gT = u_time * u_drift * 0.9;
  gTilt = u_tilt;

  vec3 fogCol = c3 * 0.06 + c0 * 0.05;

  vec3 ro = vec3(0.0, 0.0, 4.0);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  // gentle lean so the lattice runs diagonally, plus pointer steer
  vec2 lean = vec2(0.18, 0.12) * u_tilt + mo * mAmt * 0.6;
  vec3 ta = vec3(lean, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  float tt = 0.2, hit = 0.0;
  for (int i = 0; i < 100; i++){
    vec3 p = ro + rd * tt;
    float d = map(p);
    if (d < 0.0015){ hit = 1.0; break; }
    if (tt > 16.0) break;
    tt += d * 0.85;
  }

  vec3 col = fogCol;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    vec3 L1 = normalize(vec3(0.5, 0.75, 0.45));
    vec3 L2 = normalize(vec3(-0.5, 0.2, 0.4));
    float dif = max(dot(n, L1), 0.0);
    float dif2 = max(dot(n, L2), 0.0);
    vec3 ref = reflect(rd, n);
    float spec = pow(max(dot(ref, L1), 0.0), 40.0);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);

    // colour drifts with depth so near solids read cool, far ones warm
    float depthMix = clamp(tt / 12.0, 0.0, 1.0);
    vec3 base = mix(c2, c0, depthMix) * 1.3 + 0.04;
    vec3 sc = base * (0.28 + 1.0 * dif) + c1 * 0.3 * dif2;
    sc += vec3(1.0) * spec * 0.5;
    sc += c2 * fres * 0.5;

    // depth fog
    float f = 1.0 - exp(-tt * mix(0.04, 0.28, u_fog));
    col = mix(sc, fogCol, f);
  }

  gl_FragColor = vec4(col, 1.0);
}
