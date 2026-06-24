// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pixel;          // dither cell size in css px           (default 4)
uniform float u_levels;         // quantisation levels                  (default 4)
uniform float u_flow;           // drift speed of the gradient          (default 0.3)
uniform float u_swirl;          // how much the gradient bends/folds     (default 0.5)
uniform float u_mouseInfluence; // pointer lifts the gradient toward it   (default 0.0)

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

// 2x2 ordered value, then recurse to 4x4 Bayer (no bit ops in GLSL ES 1.00)
float m2(vec2 c){
  float x = mod(c.x, 2.0), y = mod(c.y, 2.0);
  return x * (1.0 - y) * 2.0 + (1.0 - x) * y * 3.0 + x * y;
}
float bayer4(vec2 c){
  c = floor(c);
  return (4.0 * m2(floor(c / 2.0)) + m2(c)) / 16.0;
}

vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x){
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(c3, c0, smoothstep(0.0, 0.34, x));
  a = mix(a, c1, smoothstep(0.34, 0.67, x));
  a = mix(a, c2, smoothstep(0.67, 1.0, x));
  return a;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float px = max(u_pixel, 1.0) * max(u_pixelRatio, 1.0);
  vec2 pix = floor(gl_FragCoord.xy / px);          // chunky pixel coords
  vec2 uv = pix * px / u_resolution.xy;            // sample at the chunk centre
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float t = u_time * u_flow;
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // a drifting, gently folded gradient to dither across
  vec2 q = p + u_swirl * (vec2(vnoise(p * 1.4 + t), vnoise(p * 1.4 + 9.0 - t)) - 0.5);
  float g = 0.5 + 0.42 * sin(q.x * 1.7 + q.y * 0.9 + t) ;
  g = mix(g, 1.0 - length(p - m) , mAmt * 0.6);
  g = clamp(g, 0.0, 1.0);

  // ordered dither between quantisation levels
  float th = bayer4(pix);
  float L = max(u_levels, 2.0);
  float gl = g * L;
  float lo = floor(gl);
  float q01 = (lo + step(th, gl - lo)) / L;

  vec3 col = ramp(c0, c1, c2, c3, q01);

  gl_FragColor = vec4(col, 1.0);
}
