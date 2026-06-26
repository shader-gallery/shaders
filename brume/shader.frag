// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// brume (Veil) — moonlit mist streaming through a dark colonnade. A single rank
// of broad, soft-edged near-black vertical columns stands across the frame; behind
// them a luminous FBM fog advects sideways, glowing brightest where it squeezes
// through the gaps. The mist takes its palette hue from density and height, so each
// gap frames a slightly different colour of drifting light. Dense puffs visibly
// cross gap after gap; the flow is unbounded so there is never a loop seam.
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

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spacing;   // css-px between column centres (default 200), * u_pixelRatio in code
uniform float u_flowSpeed; // horizontal streaming speed of the fog (default 0.4)
uniform float u_glow;      // brightness of the mist behind the columns (default 0.8)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float COL_FRAC    = 0.30;   // column half-width as a fraction of half-spacing
const float EDGE_CSS    = 14.0;   // soft-edge falloff width of the silhouettes (css px)

// hash + value-noise + fbm for the rolling fog field
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 5-octave fbm with a per-octave rotation to break up axis-aligned ridges
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = rot * p * 2.0;
    amp *= 0.5;
  }
  return sum;
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

  // --- column lattice (vertical silhouettes, one rank across the frame) ---
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 20.0) * refScale * pr;     // guard against 0 → div-by-zero
  float halfSp  = spacing * 0.5;
  // position within the current column cell, centred on the column axis
  float cellX   = floor(fc.x / spacing);
  float colX    = (cellX + 0.5) * spacing;
  float dx      = abs(fc.x - colX);              // horizontal dist from column centre
  float edge    = EDGE_CSS * pr;
  // occlusion: 1.0 deep inside a column (fully dark), 0.0 out in the open gap
  float colHalf = halfSp * COL_FRAC;
  float occ     = 1.0 - smoothstep(colHalf - edge, colHalf + edge, dx);

  // --- luminous fbm fog advecting horizontally, roiling on a slow time axis ---
  // small spatial scale so puffs are gap-sized; advect x with time so puffs cross
  vec2 uv   = fc / (res.y);                       // aspect-correct, ~0..1 vertically
  float flow = t * u_flowSpeed * 0.55;
  vec2  q    = vec2(uv.x * 2.6 - flow, uv.y * 2.6);
  // internal roil: warp the sample point on a slow independent axis
  vec2  warp = vec2(fbm(q * 0.7 + vec2(0.0, t * 0.05)),
                    fbm(q * 0.7 + vec2(5.2, t * 0.04 + 1.7)));
  float dens = fbm(q + (warp - 0.5) * 1.4);
  // shape the density into puffs: lift bright cores but keep a luminous haze floor
  // across the whole frame so the colonnade is silhouetted everywhere, not just left
  dens = smoothstep(0.18, 0.82, dens);
  dens = 0.18 + 0.82 * dens;

  // brightest where the fog squeezes through gaps → boost mist away from columns
  float gapBoost = 0.7 + 0.3 * (1.0 - occ);
  float mist = dens * gapBoost;

  // gentle vertical gradient: heavier/darker low, airier glow up high
  float vgrad = mix(0.7, 1.18, smoothstep(0.0, 1.0, fc.y / res.y));

  // --- palette: hue from density + height so each gap frames a different colour ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // wheel coordinate drifts with density, height, and which gap we're in, plus a
  // slow time roll so the colour palette of each gap evolves without a seam
  // continuous in x (uv.x, NOT cellX) so gaps differ in hue with no hard seam
  float k = dens * 1.5 + (fc.y / res.y) * 1.0 + (fc.x / res.x) * 0.85 + t * 0.015;
  float s = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3 tint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // radial vignette keeps the frame edges dark and composed
  float vign = 1.0 - smoothstep(0.72, 1.4, length((fc - ctr) / res));

  // compose the glowing fog, then let the dark columns occlude it
  vec3 fogCol = tint * mist * vgrad * u_glow * 1.05;
  // a soft white-hot core in the densest puffs for moonlit sheen
  fogCol += tint * 0.4 * smoothstep(0.7, 1.0, dens) * gapBoost * u_glow;

  col += fogCol * vign;

  // columns read as soft luminous DIVIDERS, not space-jail bars: they dim the fog
  // behind them rather than blacking it out, so colour still drifts through.
  col = mix(col, col * 0.60 + tint * mist * 0.08, occ);

  // a luminous rim sheen where fog brushes the soft column edges (Veil sheen)
  float rim = smoothstep(colHalf + edge, colHalf - edge * 0.2, dx)
            * smoothstep(colHalf - edge * 1.6, colHalf, dx);
  col += tint * rim * mist * 0.45 * u_glow * vign;

  gl_FragColor = vec4(col, 1.0);
}
