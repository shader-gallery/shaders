// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bars;           // bar count across the frame           (default 9)
uniform float u_speed;          // slide speed                          (default 0.35)
uniform float u_bevel;          // bevel width on the bar edges          (default 0.4)
uniform float u_angle;          // diagonal angle                       (default 0.6)
uniform float u_mouseInfluence; // pointer tilts the bars                (default 0.0)

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

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float t = u_time;
  float ang = u_angle;
  vec2 m = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ang += m.x * mAmt * 0.8;
  vec2 dir = vec2(cos(ang), sin(ang));

  float N = max(u_bars, 3.0);
  float u = dot(p, dir) * N + t * u_speed * N;
  float id = floor(u);
  float x = fract(u);                       // 0..1 across one bar

  // beveled bar cross-section: a raised ridge — flat top, chamfered sides.
  float bw = clamp(u_bevel, 0.05, 0.49);
  // height profile: 0 at edges, 1 across the flat middle
  float h = smoothstep(0.0, bw, x) * smoothstep(1.0, 1.0 - bw, x);
  // surface slope sign → bevel lighting (lit on the leading chamfer, dark trailing)
  float slope = smoothstep(0.0, bw, x) - smoothstep(1.0 - bw, 1.0, x); // +1 .. -1-ish
  float shade = 0.5 + 0.5 * slope;          // 0 dark edge .. 1 lit edge

  // groove between bars (the dark gap) at the very edges
  float bar = smoothstep(0.0, 0.04, x) * smoothstep(1.0, 0.96, x);

  // colour: each bar a step along the palette ramp, brighter on the flat top
  float tone = fract(id * 0.27);
  vec3 barCol = ramp(c0, c1, c2, c3, tone);
  vec3 col = barCol * (0.42 + 0.5 * h);     // top flat brightest
  col *= (0.55 + 0.7 * shade);              // chamfer light/shadow → 3D ridge
  // thin bright highlight line along the lit crest
  col += c2 * smoothstep(bw * 1.2, 0.0, abs(x - bw)) * 0.35;

  vec3 groove = vec3(0.02, 0.02, 0.03);
  col = mix(groove, col, bar);

  gl_FragColor = vec4(col, 1.0);
}
