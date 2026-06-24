// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cells;          // tile count across the frame          (default 7)
uniform float u_round;          // corner rounding of the planks         (default 0.4)
uniform float u_bevel;          // bevel depth                          (default 0.5)
uniform float u_flip;           // how often tiles rotate 90deg          (default 0.5)
uniform float u_mouseInfluence; // pointer flips nearby tiles             (default 0.0)

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
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

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float t = u_time;
  float N = max(u_cells, 3.0);
  vec2 gp = p * N;
  vec2 id = floor(gp);
  vec2 gv = fract(gp) - 0.5;

  // per-tile 90° flip on its own timer → kinetic parquet
  float rnd = hash21(id);
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float mFlip = mAmt * smoothstep(0.4, 0.0, length((id + 0.5) / N - m));
  float phase = t * (0.3 + 0.6 * rnd) * u_flip + rnd * 6.2831 + mFlip * 3.0;
  float rot = floor(phase) * 1.5707963 + smoothstep(0.2, 0.8, fract(phase)) * 1.5707963;
  float ca = cos(rot), sa = sin(rot);
  vec2 lp = mat2(ca, -sa, sa, ca) * gv;

  // beveled rounded-rect plank (2:1), sized to nearly fill its cell
  vec2 b = vec2(0.47, 0.235);
  float r = clamp(u_round, 0.0, 1.0) * 0.2;
  float sd = sdRoundBox(lp, b, r);

  // bevel normal from the SDF gradient (no derivatives)
  float e = 0.004;
  float gx = sdRoundBox(lp + vec2(e, 0.0), b, r) - sdRoundBox(lp - vec2(e, 0.0), b, r);
  float gy = sdRoundBox(lp + vec2(0.0, e), b, r) - sdRoundBox(lp - vec2(0.0, e), b, r);
  vec2 nrm = normalize(vec2(gx, gy) + 1e-5);
  float bw = mix(0.02, 0.16, clamp(u_bevel, 0.0, 1.0));

  float inside = smoothstep(0.0, -0.008, sd);                 // 1 inside plank
  float bevelRamp = smoothstep(0.0, -bw, sd);                 // 0 edge .. 1 flat top
  float lightDot = dot(nrm, normalize(vec2(-0.55, 0.7)));     // -1..1
  float shade = 0.55 + 0.55 * lightDot * (1.0 - bevelRamp);   // chamfer light/shadow

  vec3 plankCol = ramp(c0, c1, c2, c3, fract(rnd * 1.7 + 0.1));
  // faint recessed tile ground so the gaps read as grout, not dead black
  vec3 col = mix(c3 * 0.10, c3 * 0.16, smoothstep(0.5, 0.0, length(gv)));
  vec3 face = plankCol * (0.5 + 0.6 * bevelRamp) * shade;
  face += c2 * smoothstep(bw, 0.0, abs(sd + bw * 0.5)) * 0.25 * max(lightDot, 0.0); // crest
  col = mix(col, face, inside);

  gl_FragColor = vec4(col, 1.0);
}
