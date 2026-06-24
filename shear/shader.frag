// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// shear (Current) — stratified flow in fast and slow lanes. Stacked horizontal
// bands stream past one another at alternating speeds, and along every boundary
// where a fast lane meets a slow one the shear rolls the streamlines up into a
// marching row of cat-eye billows (the Kelvin-Helmholtz instability, drawn from
// the exact Stuart-vortex streamfunction). The straight outer streamlines are
// the lanes; the curled cores are the billows. Adjacent rows drift in opposite
// directions so the rolls turn, looping seamlessly. Fills the frame edge to edge.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four streamline colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_lanes;    // shear rows (billow boundaries) up the frame   (default 5)
uniform float u_cells;    // billows along each row                        (default 6)
uniform float u_roll;     // roll-up amount: flat lanes -> fat cat-eyes    (default 0.7)
uniform float u_shear;    // lane drift speed (the speed difference)       (default 0.4)
uniform float u_density;  // streamlines per lane                         (default 9)
uniform float u_line;     // streamline width in CSS px                    (default 1.6)
uniform float u_glow;     // overall emission                              (default 1.0)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU = 6.2831853;

// smooth cyclic colour from the 4-stop palette (no hard seam at the wrap)
vec3 wheel(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = max(0.0, 1.0 - min(abs(s - 0.0), 4.0 - abs(s - 0.0)));
  float w1 = max(0.0, 1.0 - min(abs(s - 1.0), 4.0 - abs(s - 1.0)));
  float w2 = max(0.0, 1.0 - min(abs(s - 2.0), 4.0 - abs(s - 2.0)));
  float w3 = max(0.0, 1.0 - min(abs(s - 3.0), 4.0 - abs(s - 3.0)));
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  float aspect = res.x / max(res.y, 1.0);
  vec2  uv = fc / res;

  // palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float rows   = max(u_lanes, 1.0);
  float cells  = max(u_cells, 1.0);
  float A      = clamp(u_roll, 0.0, 0.95);   // Stuart vortex parameter (<1)
  float dens   = max(u_density, 2.0);
  float glow   = max(u_glow, 0.0);
  float lineW  = max(u_line, 0.3) / 1.6;     // 1.0 at default css-px width

  // vertical: split the frame into `rows` shear-interface rows
  float Yraw   = uv.y * rows;
  float rowId  = floor(Yraw + 0.5);          // nearest interface
  float yloc   = (Yraw - rowId);             // -0.5..0.5, interface at 0
  float ys     = yloc * 4.2;                 // stretch so the billows compress to a
                                             // thin interface and the lanes open wide

  // horizontal: `cells` billows along the row, drifting; rows alternate direction.
  // stagger each row in x so the field reads as flow, not aligned wallpaper.
  float dir    = mod(rowId, 2.0) < 0.5 ? 1.0 : -1.0;     // fast vs slow lane sign
  float X      = uv.x * cells * TAU + dir * u_time * u_shear * TAU * 0.5 + rowId * 1.7;

  // Stuart-vortex streamfunction: psi = ln(cosh(ys) + A cos(X)). Its level sets
  // are the cat-eye billows (curled core) joined by the straight lane streamlines.
  // (cosh is GLSL ES 3.00+, so spell it out for WebGL1.)
  float coshYs = 0.5 * (exp(ys) + exp(-ys));
  float psi = log(coshYs + A * cos(X));

  // contour lines = the streamlines themselves
  float v    = psi * dens;
  float lf   = abs(fract(v) - 0.5) * 2.0;        // 0 on a streamline, 1 between
  float w    = 0.24 * lineW;
  float line = smoothstep(w, 0.0, lf);

  // a slow smooth brightness packet riding along the lane so the shear reads as
  // moving — kept high-floored so streamlines stay continuous (no dotting).
  float ride = 0.75 + 0.25 * sin(X * 0.5 - dir * u_time * u_shear * TAU * 0.5);
  line *= ride;

  // lane identity: fast lanes (dir +1) ride brighter than slow lanes for contrast
  float laneBright = (dir > 0.0) ? 1.0 : 0.62;

  // hue: fast lanes and slow lanes diverge across the palette; the rolled cores
  // (near the interface) pick up the brighter inner end.
  float core = exp(-ys * ys * 0.9);              // 1 at the billow row, 0 in the lane
  float hue  = 0.46 + dir * 0.22 + core * 0.30;
  vec3  tint = wheel(c0, c1, c2, c3, hue);

  vec3 col = BG;
  col += tint * line * 1.15 * laneBright * glow;

  // bespoke fill so only the rolled billow cores lift off black — the lanes
  // stay dark so the stratification reads (no flat muddy wash).
  vec3  washCol = wheel(c0, c1, c2, c3, 0.5 + dir * 0.22 + 0.25);
  col += washCol * (0.10 * core * core) * laneBright * glow;

  // filmic shoulder keeps the bright crowded billow streamlines from clipping
  col = col / (col + vec3(0.95)) * 1.4;

  // dither against banding in the smooth wash gradients
  col += (fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
