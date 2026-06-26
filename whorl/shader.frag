// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// whorl (Rosette) — a phyllotaxis bloom: two hundred glowing motes placed by
// the golden-angle spiral (dot k at angle k·137.5°, radius ∝ sqrt of its age),
// the seed-head order of a sunflower drawn in light on the near-black base.
// Each mote is a soft additive disc coloured by its age through the palette —
// newborns ignite at the centre, brighten through mid-life, and dim out as
// they reach the rim. Every age advances continuously, so the population
// streams outward along the spiral at a felt-not-seen pace; dots are born and
// die at zero brightness, hiding the index wrap completely. The whole head
// also rotates imperceptibly slowly, and a radial phase wave breathes through
// the rings. Deterministic indices only — no hashing anywhere in placement.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bloomSpeed; // how fast each dot ages / streams outward (default 0.2)
uniform float u_dot;        // glowing mote radius, css px (default 4)
uniform float u_spread;     // phyllotaxis radial constant, css px per sqrt-index (default 15)

const int   DOTN  = 200;            // living dots (constant loop bound)
const float FN    = 200.0;
const float GA    = 2.3999632297;   // golden angle, radians (137.50776°)
const float WRAPN = 2584.0;         // Fibonacci wrap: 2584·GA ≡ ~0.001 rad (mod 2π),
                                    // so the angle index can wrap with no visible seam
const float AGE_RATE = 0.02;        // dot ages per second at u_bloomSpeed = 1
const float ROT      = 0.008;       // whole-head rotation, rad/s — felt, not seen
const float WAVE_RT  = 0.5;         // radial breathing wave phase speed, rad/s
const float TAU      = 6.2831853;
const vec3  BG       = vec3(0.035, 0.035, 0.043);  // house near-black floor

// age -> colour: ignite cool, brighten through the mid palette, ember out
vec3 ageRamp(float u, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 c = mix(c2, c0, smoothstep(0.04, 0.30, u));
  c = mix(c, c1, smoothstep(0.32, 0.62, u));
  c = mix(c, c3, smoothstep(0.62, 0.94, u));
  return c;
}

void main() {
  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr       = max(u_pixelRatio, 0.5);
  float t        = u_time;
  float dotPx    = max(u_dot, 0.5) * pr;     // css -> device px (guard 0)
  float spreadPx = max(u_spread, 1.0) * pr;  // css -> device px (guard 0)
  float rimPx    = spreadPx * sqrt(FN);      // radius where dots die
  vec2  p        = gl_FragCoord.xy - 0.5 * u_resolution;

  // continuous birth counter: dot n is born when T crosses n, lives N counts.
  // age u = (T - n)/N advances smoothly; the slot relabel at integer T only
  // swaps a zero-brightness corpse for a zero-brightness newborn.
  float T   = t * u_bloomSpeed * AGE_RATE * FN;
  float fT  = fract(T);
  float Tf  = floor(T);
  float rot = t * ROT;

  float haloPx = dotPx * 2.6 + 1.6 * pr;     // soft additive halo radius
  float invH2  = 1.0 / (haloPx * haloPx);
  float cull   = haloPx * 3.0;               // beyond this a dot contributes ~0

  vec3 glow = vec3(0.0);
  for (int i = 0; i < DOTN; i++) {
    float fi = float(i);
    float u  = (fT + fi) / FN;               // age 0..1, continuous in t
    // life-cycle envelope: quick ignition right at the centre, brightening
    // through mid-life, then a long dim-out as the dot approaches the rim
    float env = smoothstep(0.0, 0.05, u)
              * (0.38 + 0.62 * smoothstep(0.08, 0.42, u))
              * (1.0 - smoothstep(0.52, 0.98, u));
    if (env < 0.004) continue;
    float n   = mod(Tf - fi, WRAPN);         // birth index (angle only)
    float ang = n * GA + rot;
    float rad = rimPx * sqrt(u);             // sqrt-age radius = even packing
    vec2  dp  = p - rad * vec2(cos(ang), sin(ang));
    if (abs(dp.x) > cull || abs(dp.y) > cull) continue;
    float d2   = dot(dp, dp);
    float d    = sqrt(d2);
    // newborn motes swell to full size as they ignite
    float sz   = dotPx * (0.55 + 0.45 * smoothstep(0.0, 0.22, u));
    float core = smoothstep(sz, sz * 0.25, d);         // soft-edged disc
    float halo = exp(-d2 * invH2);
    // radial phase wave breathing through the rings of the seed head
    float wave = 0.85 + 0.15 * sin(u * TAU * 2.5 - t * WAVE_RT);
    float b    = env * wave;
    vec3  dc   = ageRamp(u, c0, c1, c2, c3);
    glow += mix(dc, vec3(1.0), 0.20 * env) * (core * b) + dc * (halo * 0.30 * b);
  }
  // soft-knee compress so overlapping discs bloom instead of clipping
  glow = 1.0 - exp(-glow * 1.45);

  // faint ambient pool of light under the bloom to anchor the composition
  float q   = length(p) / max(rimPx, 1.0);
  vec3  amb = mix(c0, c1, 0.55) * (0.05 * exp(-q * q * 1.6));

  vec3 col = BG + amb + glow;

  // gentle vignette keeps the head composed against the page edges
  vec2 vq = p / min(u_resolution.x, u_resolution.y);
  col *= 1.0 - 0.30 * smoothstep(0.45, 1.0, length(vq));

  // hair of dither to keep the ambient falloff band-free in 8-bit
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
