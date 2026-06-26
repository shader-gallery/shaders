// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rings;          // ring count from centre to corner      (default 9)
uniform float u_bevel;          // bevel width on each ring               (default 0.4)
uniform float u_segments;       // arc segments per ring (0 = full rings)  (default 0.5)
uniform float u_spin;           // rotation speed of the segmentation      (default 0.3)
uniform float u_mouseInfluence; // pointer offsets the centre              (default 0.0)

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
  // centre biased off-centre (rule-of-thirds), with optional pointer offset
  vec2 ctr = vec2(-0.18, 0.10);
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ctr = mix(ctr, m, mAmt);
  vec2 d = p - ctr;
  float r = length(d);
  float ang = atan(d.y, d.x);

  float N = max(u_rings, 2.0);
  float u = r * N - t * 0.0;                 // radial ring coordinate
  float id = floor(u);
  float x = fract(u);

  // beveled ring cross-section (raised torus band: lit inner, shadowed outer)
  float bw = clamp(u_bevel, 0.05, 0.49);
  float h = smoothstep(0.0, bw, x) * smoothstep(1.0, 1.0 - bw, x);
  float slope = smoothstep(0.0, bw, x) - smoothstep(1.0 - bw, 1.0, x);
  float shade = 0.5 + 0.5 * slope;
  float bandMask = smoothstep(0.0, 0.05, x) * smoothstep(1.0, 0.95, x);

  // arc segmentation: break each ring into arcs that rotate (alternating dir)
  float segs = floor(2.0 + u_segments * 16.0);
  float dirSign = mod(id, 2.0) < 0.5 ? 1.0 : -1.0;
  float seg = fract((ang / 6.2831) * segs + dirSign * t * u_spin + id * 0.13);
  float gap = u_segments > 0.01 ? smoothstep(0.06, 0.12, seg) * smoothstep(1.0, 0.9, seg) : 1.0;
  gap = max(gap, 1.0 - step(0.01, u_segments));   // full rings when segments ~0

  float tone = fract(id * 0.21);
  vec3 ringCol = ramp(c0, c1, c2, c3, tone);
  vec3 col = ringCol * (0.42 + 0.55 * h);
  col *= (0.55 + 0.7 * shade);
  col += c2 * smoothstep(bw * 1.2, 0.0, abs(x - bw)) * 0.3;   // crest highlight

  float mask = bandMask * gap;
  col = mix(vec3(0.02, 0.02, 0.03), col, mask);

  gl_FragColor = vec4(col, 1.0);
}
