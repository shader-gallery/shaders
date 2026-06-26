// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// braid (Current) — a wall of vertical plaits. Within each column several thick
// luminous cords weave over and under in a repeating sinusoidal interlace: each
// strand swings side to side a quarter-phase apart from its neighbours, and the
// one whose cosine is nearest the viewer rides in FRONT (brighter, fatter),
// the others passing behind it. The whole plait travels slowly downward, so the
// over-under crossings march down the frame and loop seamlessly. Columns of
// braid tile edge to edge to fill the field; each strand takes one palette hue.
// Bold, woven, high-contrast — the heavy COMBINE base for the family.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four cord colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_columns;  // braid columns across the frame, css-relative (default 6)
uniform float u_twist;    // vertical twists per frame height (plait tightness) (default 5)
uniform float u_weave;    // how far strands swing across the column (0..1)      (default 0.7)
uniform float u_width;    // cord half-width in CSS px                          (default 6)
uniform float u_flow;     // downward travel speed of the plait                 (default 0.10)
uniform float u_glow;     // overall cord emission                              (default 1.0)
uniform float u_depth;    // front/back contrast between crossing strands       (default 0.8)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU = 6.2831853;
const int   STRANDS = 4;   // cords per plait (const — GLSL loop bound)

// smooth cyclic colour from the 4-stop palette (no hard seam at the wrap)
vec3 wheel(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = max(0.0, 1.0 - min(abs(s - 0.0), 4.0 - abs(s - 0.0)));
  float w1 = max(0.0, 1.0 - min(abs(s - 1.0), 4.0 - abs(s - 1.0)));
  float w2 = max(0.0, 1.0 - min(abs(s - 2.0), 4.0 - abs(s - 2.0)));
  float w3 = max(0.0, 1.0 - min(abs(s - 3.0), 4.0 - abs(s - 3.0)));
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  // P0-C reference scale: keep feature COUNT constant tile -> fullsize
  float refScale = min(res.x, res.y) / (pr * 400.0);

  // palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // column layout: how many plaits across the short axis, frame-relative.
  float cols    = max(u_columns, 1.0);
  float colW    = res.x / cols;             // device px per braid column
  float colF    = fc.x / colW;              // continuous column coordinate
  float colId   = floor(colF);
  float colCtr  = (colId + 0.5) * colW;
  float jitter  = hash11(colId * 1.7 + 0.3);

  // vertical phase: a downward-travelling twist (periodic -> seamless loop)
  float twist = max(u_twist, 0.25);
  float theta = (fc.y / res.y) * twist * TAU - u_time * u_flow * TAU
              + jitter * TAU;             // stagger columns so they do not pulse together

  float swing = colW * 0.5 * clamp(u_weave, 0.0, 1.0); // half a column of travel
  float halfW = max(u_width, 0.5) * refScale * pr;
  float glow  = max(u_glow, 0.0);
  float dep   = clamp(u_depth, 0.0, 1.0);

  vec3 col = BG;

  // draw the strands back-to-front by accumulating with a depth-weighted core.
  for (int k = 0; k < STRANDS; k++) {
    float fk    = float(k);
    float phase = theta + fk * (TAU / float(STRANDS));
    float sx    = colCtr + sin(phase) * swing;     // this strand centre x
    float front = cos(phase);                      // +1 nearest viewer, -1 behind

    // depth shaping: front strands fatter + brighter, back strands recede.
    // square the nearness so only the truly-front cord blooms (over/under reads).
    float near  = front * 0.5 + 0.5;               // 0..1
    float nsq   = near * near;
    float wk    = halfW * (1.0 - dep * 0.5 * (1.0 - near));
    float d     = abs(fc.x - sx);

    // luminous core + halo
    float core  = 1.0 - smoothstep(wk, wk + 2.0 * pr, d);
    float halo  = exp(-d / (9.0 * pr));

    // a depth-keyed brightness so crossings read as over/under, not a flat tangle
    float bright = mix(1.0 - dep * 0.85, 1.0, nsq);

    // each strand a distinct palette hue; whole column rotated by its id so
    // neighbouring plaits are not identical
    float hue = (fk / float(STRANDS)) + colId * 0.13;
    vec3  tint = wheel(c0, c1, c2, c3, hue);

    col += tint * core * (0.55 * bright) * glow;
    col += tint * halo * (0.11 * bright) * glow;
  }

  // faint cord-following wash so the gaps inside a plait are not dead-black:
  // a dim braid-coloured fill keyed to the column, lifted toward the centre.
  float midcol = 1.0 - abs(fract(colF) - 0.5) * 2.0;  // 1 at column centre, 0 at seam
  vec3  washHue = wheel(c0, c1, c2, c3, colId * 0.13 + 0.5);
  col += washHue * (0.020 + 0.045 * midcol) * glow;

  // filmic shoulder keeps bright over-strands from clipping flat (gentle, so the
  // palette hues survive instead of washing to white)
  col = col / (col + vec3(0.85)) * 1.45;

  // gentle vertical falloff so top and bottom edges settle darker
  float vy = smoothstep(0.0, 0.18, fc.y / res.y) * smoothstep(0.0, 0.18, 1.0 - fc.y / res.y);
  col *= 0.7 + 0.3 * vy;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
