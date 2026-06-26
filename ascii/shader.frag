// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cols;           // grid columns                        (default 26)
uniform float u_sweep;          // readout scan speed                  (default 0.4)
uniform float u_flicker;        // how fast cell values change          (default 6)
uniform float u_density;        // fraction of cells lit                (default 0.5)
uniform float u_mouseInfluence; // pointer lights a region              (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;

  float NX = max(u_cols, 6.0);
  float NY = floor(NX / aspect);
  vec2 cellId = floor(uv * vec2(NX, NY));
  vec2 cuv = fract(uv * vec2(NX, NY));

  // glyph: a 3x5 on/off matrix per cell, re-rolling on a per-cell timer
  float gframe = floor(t * u_flicker + hash(cellId) * 12.0);
  vec2 sub = floor(cuv * vec2(3.0, 5.0));
  float glyph = step(0.45, hash(sub + cellId * 2.3 + gframe));
  float margin = step(0.08, cuv.x) * step(cuv.x, 0.92) * step(0.06, cuv.y) * step(cuv.y, 0.94);
  glyph *= margin;

  // which cells are "on" at all (a sparse live subset that re-rolls)
  float liveRoll = floor(t * 0.7 + hash(cellId + 5.0) * 4.0);
  float live = step(1.0 - clamp(u_density, 0.0, 1.0), hash(cellId + liveRoll * 1.3));

  // a diagonal read-out sweep lighting cells as it crosses, with afterglow
  float diag = (cellId.x / NX + cellId.y / NY) * 0.5;
  float sweep = fract(t * u_sweep);
  float behind = fract(sweep - diag);
  float scan = smoothstep(0.25, 0.0, behind);          // bright at the front, fading behind

  vec2 m = uv;
  m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float mGlow = mAmt * smoothstep(0.3, 0.0, length(uv - m));

  // ambient dim + lit; the sweep promotes cells to bright readout
  float amb = 0.16 + 0.5 * live;
  float bright = amb + scan * (0.4 + 0.8 * live) + mGlow;
  bright = clamp(bright, 0.0, 1.6);

  vec3 dim = mix(c3 * 0.5, c0, 0.4);
  vec3 lo = mix(dim, c0, bright);
  vec3 col = mix(lo, c2 * 1.2, smoothstep(0.7, 1.3, bright)) * bright * glyph;
  col = max(col, c3 * 0.04);   // faint panel base

  gl_FragColor = vec4(col, 1.0);
}
