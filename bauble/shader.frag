// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swirl;          // speed of the interior smoke          (default 0.5)
uniform float u_density;        // thickness of the interior swirl       (default 0.7)
uniform float u_polish;         // surface gloss / specular sharpness    (default 0.7)
uniform float u_size;           // how much of the frame the orb fills   (default 1.0)
uniform float u_mouseInfluence; // pointer parallax                      (default 0.0)

vec3 c0, c1, c2, c3;
float gTime, gDensity;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n0 = mix(mix(hash(i.xy + i.z * 37.0), hash(i.xy + vec2(1.0,0.0) + i.z*37.0), f.x),
                 mix(hash(i.xy + vec2(0.0,1.0) + i.z*37.0), hash(i.xy + vec2(1.0,1.0) + i.z*37.0), f.x), f.y);
  float n1 = mix(mix(hash(i.xy + (i.z+1.0)*37.0), hash(i.xy + vec2(1.0,0.0) + (i.z+1.0)*37.0), f.x),
                 mix(hash(i.xy + vec2(0.0,1.0) + (i.z+1.0)*37.0), hash(i.xy + vec2(1.0,1.0) + (i.z+1.0)*37.0), f.x), f.y);
  return mix(n0, n1, f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.02 + vec3(7.0, 3.0, 11.0); a *= 0.5; }
  return s;
}

// procedural environment, palette-tinted — refracted + reflected by the glass
vec3 env(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.35, c0 * 1.05, smoothstep(0.0, 0.62, y));
  col = mix(col, c2 * 1.3, smoothstep(0.55, 1.0, y));
  col += c1 * 0.5 * pow(smoothstep(0.6, 1.0, y), 2.0);
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  gTime = u_time; gDensity = u_density;

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 0.8;
  vec3 ww = normalize(vec3(0.0) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // analytic ray-sphere intersection (one big orb, fills the frame)
  float R = 1.35 * clamp(u_size, 0.5, 1.4);
  float b = dot(ro, rd);
  float cc = dot(ro, ro) - R * R;
  float disc = b * b - cc;

  vec3 col;
  if (disc > 0.0){
    float tHit = -b - sqrt(disc);
    vec3 p = ro + rd * tHit;
    vec3 n = p / R;
    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);

    // refract into the glass and read the environment (inverted/bent)
    vec3 rdir = refract(rd, n, 0.66);
    vec3 transm = env(rdir);

    // interior "smoke": swirling 3d fbm sampled along the refracted ray inside
    // the orb — gives the crystal ball its wispy palette-tinted heart
    vec3 ip = p + rdir * 0.9;
    float smoke = fbm3(ip * 2.4 + vec3(0.0, 0.0, gTime * u_swirl));
    smoke = smoothstep(0.35, 0.85, smoke) * gDensity;
    vec3 heart = mix(transm, c1 * 1.2 + c2 * 0.3, smoke);

    // surface reflection of the environment + crisp studio specular
    vec3 refl = env(reflect(rd, n));
    vec3 L = normalize(vec3(-0.5, 0.8, 0.5));
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), mix(30.0, 240.0, u_polish));

    col = mix(heart, refl, fres * 0.6);
    col += vec3(1.0) * spec * (0.5 + 0.5 * u_polish);
    // a faint bright rim where fresnel peaks (the glass edge catching light)
    col += c2 * fres * 0.4;
  } else {
    // background behind the orb — same env so the frame is filled, darker so
    // the orb reads as the subject
    col = env(rd) * 0.55;
  }

  gl_FragColor = vec4(col, 1.0);
}
