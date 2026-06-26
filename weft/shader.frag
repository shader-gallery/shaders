// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// weft (Current) — a woven cloth seen close. Bright vertical warp threads and
// horizontal weft threads interlace in a plain tabby weave: at every crossing one
// rides over and the other dips under, in the checkerboard the loom makes. A soft
// sheen sweeps diagonally across the cloth so the weave catches the light and the
// raised threads glint as it passes. Threads take palette hues by position; the
// whole cloth breathes with a slow ripple. A direct sibling of warp — warp had
// only a sweeping weft glow; here the weft is real interlaced thread.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four thread colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spacing; // px between threads (warp = weft), css        (default 22)
uniform float u_thick;   // thread half-width in CSS px                   (default 3)
uniform float u_ripple;  // amplitude of the slow cloth ripple            (default 0.4)
uniform float u_sheen;   // strength of the diagonal light sheen sweep    (default 1.0)
uniform float u_sheenSpeed; // speed the sheen travels across the cloth   (default 0.4)
uniform float u_glow;    // overall thread emission                       (default 1.0)
uniform float u_relief;  // how deep the under-thread dips at crossings   (default 0.8)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU = 6.2831853;

// smooth per-thread colour from the 4-stop palette across t in 0..1
vec3 tint4(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x) {
  float s = clamp(x, 0.0, 1.0) * 3.0;
  vec3 c = c0;
  c = mix(c, c1, smoothstep(0.0, 1.0, s));
  c = mix(c, c2, smoothstep(1.0, 2.0, s));
  c = mix(c, c3, smoothstep(2.0, 3.0, s));
  return c;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  // P0-C reference scale: keep feature COUNT constant tile -> fullsize
  float refScale = min(res.x, res.y) / (pr * 400.0);
  float spacing  = max(u_spacing, 6.0) * refScale * pr;
  float thick    = max(u_thick, 0.5) * refScale * pr;

  // palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t      = u_time;
  float glow   = max(u_glow, 0.0);
  float relief = clamp(u_relief, 0.0, 1.0);

  // slow cloth ripple: displace the thread grid gently so it is never dead-still
  float amp = u_ripple * thick * 1.2;
  vec2  q   = fc;
  q.x += amp * sin(fc.y / (spacing * 3.0) + t * 0.5);
  q.y += amp * sin(fc.x / (spacing * 3.0) - t * 0.4);

  // nearest warp (vertical) and weft (horizontal) thread
  float warpX = (floor(q.x / spacing) + 0.5) * spacing;
  float weftY = (floor(q.y / spacing) + 0.5) * spacing;
  float dV = abs(q.x - warpX);    // distance to vertical warp thread
  float dH = abs(q.y - weftY);    // distance to horizontal weft thread

  // thread profiles: bright core + soft halo
  float coreV = 1.0 - smoothstep(thick, thick + 2.0 * pr, dV);
  float coreH = 1.0 - smoothstep(thick, thick + 2.0 * pr, dH);
  float haloV = exp(-dV / (7.0 * pr));
  float haloH = exp(-dH / (7.0 * pr));

  // over/under: the loom checkerboard decides which thread rides on top per cell.
  // the UNDER thread dips (dims) near the crossing where the over thread covers it.
  float cell  = mod(floor(q.x / spacing) + floor(q.y / spacing), 2.0);
  float cross = (1.0 - smoothstep(thick, spacing * 0.5, dV)) *
                (1.0 - smoothstep(thick, spacing * 0.5, dH)); // 1 at a crossing
  float warpTop = cell < 0.5 ? 1.0 : 0.0;
  float dipV = 1.0 - relief * cross * (1.0 - warpTop); // warp under -> dip
  float dipH = 1.0 - relief * cross * warpTop;          // weft under -> dip

  // diagonal sheen sweep: a soft band of extra light crossing the cloth, looping.
  // the cloth rests dim (dark + glow) and the sheen band is where it catches light.
  float sheenPhase = (fc.x + fc.y) / (res.x + res.y) - t * u_sheenSpeed * 0.25;
  float sd    = (fract(sheenPhase) - 0.5) * 3.0;   // (pow of a negative base is NaN in ANGLE)
  float sheen = exp(-sd * sd) * u_sheen;
  float lit   = 0.32 + 0.9 * sheen;

  // colours: warp tinted by its x position, weft by its y position
  vec3 warpCol = tint4(c0, c1, c2, c3, warpX / res.x);
  vec3 weftCol = tint4(c0, c1, c2, c3, weftY / res.y * 0.85 + 0.15);

  vec3 col = BG;
  col += warpCol * (coreV * 0.62 + haloV * 0.16) * dipV * lit * glow;
  col += weftCol * (coreH * 0.62 + haloH * 0.16) * dipH * lit * glow;

  // a faint cloth-coloured fill so the cells are not dead-black
  vec3 fillCol = mix(warpCol, weftCol, 0.5);
  col += fillCol * (0.02 + 0.04 * sheen) * glow;

  // filmic shoulder keeps the lit crossings from clipping flat
  col = col / (col + vec3(1.0)) * 1.4;

  // gentle vignette
  vec2 uvc = fc / res - 0.5;
  float vign = 1.0 - smoothstep(0.5, 1.05, length(uvc * vec2(1.0, 1.05)));
  col *= mix(0.78, 1.0, vign);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
