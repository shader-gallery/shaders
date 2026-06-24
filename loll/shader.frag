// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_driftSpeed;     // how fast the shadows roll           (default 0.15)
uniform float u_depth;          // how dark the rolling shadows get     (default 0.7)
uniform float u_softness;       // shadow-lobe size                     (default 1.0)
uniform float u_warp;           // organic distortion of the lobes      (default 0.6)
uniform float u_mouseInfluence; // pointer pull on the shadows          (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.55;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = rot * p * 2.03 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return s;
}
float lobe(vec2 pos, vec2 c, float r){
  vec2 d = pos - c;
  return exp(-dot(d, d) / max(r * r, 1e-3));
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 pos = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  pos += m * mAmt * 0.4;

  float t = u_time * u_driftSpeed;

  vec2 wv = vec2(fbm(pos * 1.3 + t * 0.4), fbm(pos * 1.3 + vec2(5.0, 2.0) - t * 0.3)) - 0.5;
  vec2 sp = pos + wv * (0.45 * u_warp);

  // lit warm base — a luminous gold field that stays bright across the frame
  // (so shadows, not darkness, carry the drama); brightest off-centre upper-left
  float litD = length(pos - vec2(-0.20, 0.26));
  float lit = exp(-litD * litD * 0.4);
  vec3 base = mix(c0 * 0.92, c1 * 1.05, smoothstep(0.0, 1.0, lit));
  base = mix(base, c2 * 1.12, lit * lit * 0.8);

  // big soft shadow lobes drifting across — light through moving clouds
  vec2 S0 = vec2(-0.55, 0.10) + vec2(sin(t * 0.7 + 0.0), cos(t * 0.5 + 1.0)) * 0.5;
  vec2 S1 = vec2( 0.50, 0.35) + vec2(sin(t * 0.5 + 2.0), cos(t * 0.66 + 0.4)) * 0.55;
  vec2 S2 = vec2( 0.10,-0.45) + vec2(sin(t * 0.62 + 4.0), cos(t * 0.47 + 3.0)) * 0.5;
  float r = 0.6 * max(u_softness, 0.3);
  float shadow = lobe(sp, S0, r) + lobe(sp, S1, r * 1.1) + lobe(sp, S2, r * 0.9);
  shadow = clamp(shadow, 0.0, 1.0);

  // roll the shadow over the lit base; shadowed regions also cool/deepen toward c3
  vec3 col = base * (1.0 - u_depth * shadow);
  col = mix(col, c3 * 0.5, u_depth * shadow * 0.4);

  // keep it warm and lifted, never crushed to black
  col = col * 0.94 + 0.05;

  gl_FragColor = vec4(col, 1.0);
}
