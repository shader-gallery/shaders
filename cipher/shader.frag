// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cols;           // number of glyph columns              (default 30)
uniform float u_speed;          // fall speed                           (default 0.7)
uniform float u_trail;          // trail length (cells)                 (default 0.45)
uniform float u_flicker;        // how fast glyphs change               (default 8)
uniform float u_mouseInfluence; // pointer brightens nearby columns       (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash1(float n){ return fract(sin(n * 78.233) * 43758.5453); }

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
  float colId = floor(uv.x * NX);
  float NY = floor(NX / aspect * 1.6);     // squarish-tall glyph cells

  // per-column fall: scroll the column content downward over time
  float speed = u_speed * (0.5 + hash1(colId) * 1.2);
  float v = uv.y + t * speed + hash1(colId) * 20.0;     // increases downward
  float cellY = floor(v * NY);

  // head + fading trail: brightness ramps along a repeating drop of length trail
  float tl = max(u_trail, 0.05);
  float drop = fract((v) / (tl * 6.0));     // 0 tail .. 1 head within one drop
  float bright = pow(drop, 1.6);
  float head = smoothstep(0.86, 1.0, drop);

  // per-cell glyph: a sub-grid of on/off segments that re-roll over time
  vec2 cellUV = fract(vec2(uv.x * NX, v * NY));
  float gframe = floor(t * u_flicker + hash(vec2(colId, cellY)) * 10.0);
  vec2 sub = floor(cellUV * vec2(3.0, 5.0));
  float glyph = step(0.42, hash(sub + vec2(colId, cellY) * 1.7 + gframe));
  // cell margin so glyphs read as separate characters
  float margin = step(0.06, cellUV.x) * step(cellUV.x, 0.94)
               * step(0.04, cellUV.y) * step(cellUV.y, 0.96);
  glyph *= margin;

  vec2 m = uv;
  m.x = u_mouse.x / u_resolution.x;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  bright += mAmt * smoothstep(1.5 / NX, 0.0, abs(uv.x - m.x)) * 0.5;

  // colour: trail in mid palette green-ish, head near-white-bright
  vec3 trailCol = mix(c3, c0, bright);
  trailCol = mix(trailCol, c2, head * 0.6);
  vec3 col = trailCol * bright * glyph;
  col += (c2 * 0.6 + vec3(0.5)) * head * glyph;     // bright leading glyph

  // faint column rule + dark base so empty cells aren't pure black
  col = max(col, c3 * 0.045);

  gl_FragColor = vec4(col, 1.0);
}
