// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// twill (Current) — a twill weave, the diagonal cloth of denim and gabardine.
// Warp threads float over two wefts then duck under one, and the float shifts by a
// thread each row, so the raised warp segments stack into bright diagonal wales
// running across the cloth. A combed sheen travels along the diagonal so the ribs
// catch the light in sequence; threads take palette hues by their diagonal band.
// A woven-flow sibling of warp-current — combed, but into ruled diagonal twill,
// not free domain-warped fibre.
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
uniform float u_spacing; // px between threads, css                       (default 16)
uniform float u_thick;   // thread half-width in CSS px                   (default 2.2)
uniform float u_steep;   // twill step: wale steepness (threads per row)  (default 1.0)
uniform float u_sheen;   // strength of the diagonal sheen sweep          (default 1.0)
uniform float u_sheenSpeed; // speed the sheen runs along the wales        (default 0.45)
uniform float u_glow;    // overall thread emission                       (default 1.0)
uniform float u_relief;  // how strongly floats outshine the under-threads(default 0.85)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU = 6.2831853;

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

  float refScale = min(res.x, res.y) / (pr * 400.0);
  float spacing  = max(u_spacing, 6.0) * refScale * pr;
  float thick    = max(u_thick, 0.5) * refScale * pr;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t      = u_time;
  float glow   = max(u_glow, 0.0);
  float relief = clamp(u_relief, 0.0, 1.0);
  float steep  = max(u_steep, 0.0);

  // DIAGONAL WALES are the defining feature of twill: the raised warp floats
  // stack into continuous diagonal ribs. rib coordinate runs perpendicular to the
  // wale; its integer lines are the rib centres.
  float ribCoord = (fc.x - steep * fc.y) / spacing;
  float dRib  = abs(fract(ribCoord) - 0.5) * 2.0;          // 0 on a rib, 1 in the valley
  float ribW  = thick / spacing * 2.0;
  float rib   = smoothstep(ribW, 0.0, dRib);
  float ribHalo = smoothstep(1.0, 0.0, dRib) * 0.4;        // soft fill between ribs

  // float texture ALONG the rib: short stitches so it reads as woven thread, not a
  // solid bar. coordinate measured along the wale direction.
  float along = (fc.x * steep + fc.y) / spacing;
  float stitch = 0.55 + 0.45 * sin(along * TAU);

  // a faint perpendicular weft grid woven through, dim cloth body
  float weftY = (floor(fc.y / spacing) + 0.5) * spacing;
  float dH = abs(fc.y - weftY);
  float weft = smoothstep(thick, 0.0, dH) * 0.4;

  // combed sheen running ALONG the wale diagonal, looping
  float sd   = (fract(ribCoord * 0.12 + along * 0.0 - t * u_sheenSpeed * 0.3) - 0.5) * 3.0;
  float sheenA = exp(-sd * sd) * u_sheen;    // (x*x, never pow of a negative)
  // a second sheen travelling along the rib length so light runs down the wales
  float sl   = (fract(along * 0.06 - t * u_sheenSpeed * 0.5) - 0.5) * 3.0;
  float sheenB = exp(-sl * sl) * u_sheen;
  float lit   = 0.45 + 0.7 * max(sheenA, sheenB);

  // colour by diagonal band so the wales progress through the palette
  float hueCoord = fract(ribCoord * 0.05 + 0.1);
  vec3 ribCol  = tint4(c0, c1, c2, c3, hueCoord);
  vec3 weftCol = tint4(c0, c1, c2, c3, fract(hueCoord + 0.45));

  vec3 col = BG;
  // bright diagonal ribs (stitched), dimmed in the valleys by relief
  float ribLit = mix(1.0 - relief * 0.5, 1.0, rib);
  col += ribCol  * (rib * 0.85 * stitch + ribHalo * 0.18) * ribLit * lit * glow;
  col += weftCol * weft * (0.5 + 0.5 * lit) * (1.0 - 0.6 * rib) * glow;

  // faint cloth fill so the valleys are not dead-black
  col += mix(ribCol, weftCol, 0.5) * (0.02 + 0.05 * max(sheenA, sheenB)) * glow;

  col = col / (col + vec3(0.95)) * 1.42;

  vec2 uvc = fc / res - 0.5;
  float vign = 1.0 - smoothstep(0.5, 1.05, length(uvc * vec2(1.0, 1.05)));
  col *= mix(0.78, 1.0, vign);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
