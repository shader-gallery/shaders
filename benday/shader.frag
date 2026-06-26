// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_dots;           // dot count across the frame          (default 30)
uniform float u_flow;           // drift speed of the colour field      (default 0.3)
uniform float u_size;           // dot radius (coverage)                (default 0.62)
uniform float u_ink;            // light ground (0) vs dark ground (1)   (default 0.0)
uniform float u_mouseInfluence; // pointer pushes the colour field        (default 0.0)

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

// drifting four-pole colour field, sampled per dot
vec3 field(vec2 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t){
  float w0 = exp(-dot(p - vec2(sin(t*0.5)-0.4, cos(t*0.4)-0.2), p - vec2(sin(t*0.5)-0.4, cos(t*0.4)-0.2)) * 1.4);
  float w1 = exp(-dot(p - vec2(cos(t*0.45)+0.45, sin(t*0.5)-0.3), p - vec2(cos(t*0.45)+0.45, sin(t*0.5)-0.3)) * 1.4);
  float w2 = exp(-dot(p - vec2(sin(t*0.6)+0.3, cos(t*0.5)+0.4), p - vec2(sin(t*0.6)+0.3, cos(t*0.5)+0.4)) * 1.4);
  float w3 = exp(-dot(p - vec2(cos(t*0.55)-0.4, sin(t*0.6)+0.35), p - vec2(cos(t*0.55)-0.4, sin(t*0.6)+0.35)) * 1.4);
  float s = w0 + w1 + w2 + w3 + 1e-3;
  return (w0*c0 + w1*c1 + w2*c2 + w3*c3) / s;
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

  float t = u_time * u_flow;
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  p += m * mAmt * 0.3;

  float N = max(u_dots, 6.0);
  vec2 g = fract(p * N) - 0.5;
  // sample the colour field at this cell's centre so each dot is one flat tone
  vec2 cellCentre = (floor(p * N) + 0.5) / N;
  vec3 dotCol = field(cellCentre, c0, c1, c2, c3, t);

  float d = length(g);
  float radius = u_size * 0.5;
  float aa = clamp(1.5 * N / u_resolution.y, 0.004, 0.2);
  float dotm = smoothstep(radius + aa, radius - aa, d);

  // newsprint ground: light (high-key) by default, dark if u_ink pushed up
  vec3 ground = mix(vec3(0.93, 0.92, 0.88), c3 * 0.10, clamp(u_ink, 0.0, 1.0));
  // bold pop dots; on the light ground keep them saturated
  vec3 col = mix(ground, dotCol, dotm);

  gl_FragColor = vec4(col, 1.0);
}
