// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bands;          // chevron band count                   (default 11)
uniform float u_zig;            // zigzag width (peaks across frame)      (default 3)
uniform float u_depth;          // how sharp the V points                (default 1.0)
uniform float u_speed;          // scroll speed                         (default 0.4)
uniform float u_mouseInfluence; // pointer scrolls the bands              (default 0.0)

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
  vec2 m = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // triangle wave across x → the chevron V; add to y to make the zigzag bands
  float tri = abs(fract(p.x * max(u_zig, 0.5)) - 0.5) * 2.0;     // 0..1
  float u = p.y * max(u_bands, 3.0) + tri * u_depth * 2.0
          - (t * u_speed * max(u_bands, 3.0)) - mAmt * m.y * 8.0;

  float id = floor(u);
  float x = fract(u);

  // beveled band cross-section (lit crest, shaded edges → 3D chevron ribbon)
  float bw = 0.34;
  float h = smoothstep(0.0, bw, x) * smoothstep(1.0, 1.0 - bw, x);
  float slope = smoothstep(0.0, bw, x) - smoothstep(1.0 - bw, 1.0, x);
  float shade = 0.5 + 0.5 * slope;
  float bar = smoothstep(0.0, 0.05, x) * smoothstep(1.0, 0.95, x);

  float tone = fract(id * 0.31);
  vec3 bandCol = ramp(c0, c1, c2, c3, tone);
  vec3 col = bandCol * (0.42 + 0.5 * h);
  col *= (0.55 + 0.7 * shade);
  col += c2 * smoothstep(bw * 1.2, 0.0, abs(x - bw)) * 0.3;     // crest highlight

  col = mix(vec3(0.02, 0.02, 0.03), col, bar);

  gl_FragColor = vec4(col, 1.0);
}
