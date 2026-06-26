// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_dots;           // dot count across the frame          (default 38)
uniform float u_flow;           // drift speed of the tone field        (default 0.3)
uniform float u_contrast;       // how hard the dots clip on/off         (default 0.6)
uniform float u_angle;          // screen rotation (print angle)         (default 0.4)
uniform float u_mouseInfluence; // pointer lifts the tone toward it      (default 0.0)

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

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // tone field — a drifting large-scale gradient that the dot size encodes
  float t = u_time * u_flow;
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float tone = 0.5 + 0.36 * sin(p.x * 1.6 + t) + 0.30 * vnoise(p * 1.3 + t * 0.4);
  tone += mAmt * exp(-dot(p - m, p - m) * 2.0) * 0.6;
  tone = clamp(tone, 0.0, 1.0);

  // rotated halftone screen (print angle)
  float ca = cos(u_angle), sa = sin(u_angle);
  vec2 sp = mat2(ca, -sa, sa, ca) * p;
  float N = max(u_dots, 4.0);
  vec2 cell = fract(sp * N) - 0.5;
  float d = length(cell);

  // dot radius grows with local tone; crisp AA sized from the cell pixel span
  float radius = (0.05 + 0.62 * tone) * 0.5;
  float aa = clamp(1.5 * N / u_resolution.y, 0.004, 0.2);
  float dotm = smoothstep(radius + aa, radius - aa, d);
  // contrast hardens the on/off transition
  dotm = mix(dotm, step(d, radius), clamp(u_contrast, 0.0, 1.0));

  // colour: a dark base, dots tinted by position across the palette
  vec3 ink = mix(c0, c2, smoothstep(-0.4, 0.4, p.x));
  ink = mix(ink, c1, smoothstep(0.0, 0.5, tone) * 0.5);
  vec3 bg = c3 * 0.10;
  vec3 col = mix(bg, ink * (0.8 + 0.5 * tone), dotm);

  gl_FragColor = vec4(col, 1.0);
}
