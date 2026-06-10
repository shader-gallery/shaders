// filigree (Loom) — a fine ornamental lattice: a grid of thin glowing
// rounded-diamond outlines that pulse brighter in slow waves rolling across the
// field. Lace-like and delicate; cell interiors stay near-black while the
// outlines trace palette colours by position, like etched metal catching light.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float SPACING_CSS = 46.0;   // px between lattice nodes
const float ROUND_CSS   = 4.0;    // corner rounding radius of each diamond
const float LINE_CSS    = 1.1;    // outline half-thickness
const float WAVELEN_CSS = 380.0;  // wavelength of the rolling brightness wave
const float WAVE_SPEED  = 0.45;

// rounded-diamond signed distance: an L1 (diamond) of radius rad, rounded by r
float sdRoundDiamond(vec2 p, float rad, float r) {
  p = abs(p);
  float d = (p.x + p.y - rad) * 0.70710678; // /sqrt(2): perpendicular dist to edge
  return d - r;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  float spacing = SPACING_CSS * pr;
  float round   = ROUND_CSS * pr;
  float line    = LINE_CSS  * pr;
  // diamond radius (pre-round); corners reach toward the cell edges so the
  // diamonds nearly touch and read as one continuous lace net
  float rad     = spacing * 0.5 - round - line - pr * 0.5;

  // local position within the current cell, centred on its node
  vec2 cellId = floor(fc / spacing);
  vec2 node   = (cellId + 0.5) * spacing;
  vec2 local  = fc - node;

  // signed distance to this cell's rounded diamond, then its thin outline
  float sd      = sdRoundDiamond(local, rad, round);
  // soft anti-aliased lace stroke (1.0 on the line, fading out)
  float stroke  = 1.0 - smoothstep(0.0, line + pr * 1.2, abs(sd));

  // --- slow brightness wave rolling diagonally across the field ---
  float diag  = dot(node - ctr, normalize(vec2(0.8, 0.6)));
  float wave  = 0.5 + 0.5 * sin(diag / (WAVELEN_CSS * pr) * 6.2831853 - t * WAVE_SPEED);
  // a second, slower cross-wave so the pulse never reads as a single sweep
  float wave2 = 0.5 + 0.5 * sin(length(node - ctr) / (WAVELEN_CSS * 1.7 * pr) * 6.2831853 + t * WAVE_SPEED * 0.6);
  float pulse = mix(0.22, 1.0, wave * 0.7 + wave2 * 0.3);

  // Theme colours come from u_palette. Some headless poster contexts can't bind
  // a vec3[] uniform (the active name is "u_palette[0]"), leaving it all-zero;
  // fall back to the default "midnight" hues so a poster never renders black,
  // while the live runtime drives the real, re-themeable palette.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // colour traces position: hue drifts with the node + a gentle time roll so it
  // loops without a visible reset. Blend the four entries with cyclic weights
  // (no dynamic array indexing — illegal in the GLSL ES 1.00 frag stage).
  float k  = (cellId.x * 0.11 + cellId.y * 0.07) + t * 0.012;
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  lace = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // node jewels: a faint glow dot where the diamonds meet, brightest at the wave
  float jewel = exp(-dot(local, local) / (spacing * spacing * 0.012)) * pulse;

  // radial vignette keeps the edges dark and the centre luminous
  float vign = 1.0 - smoothstep(0.25, 1.05, length((fc - ctr) / res));

  col += lace * stroke * pulse * 0.95 * vign;
  col += lace * jewel * 0.55 * vign;

  // a whisper of outline bloom so the etched metal catches light
  float bloom = exp(-abs(sd) / (line * 5.0)) * pulse;
  col += lace * bloom * 0.18 * vign;

  gl_FragColor = vec4(col, 1.0);
}
