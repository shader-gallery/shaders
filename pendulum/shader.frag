// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// pendulum (Trace) — a row of pendulums hangs from an implied rail across the
// upper screen. Each is a hair-thin faint filament ending in a small glowing
// bob, trailing a dim arc of phosphor smear that hints at its recent swing.
// Lengths are graded left to right so periods follow the classic pendulum-wave
// series (N, N+1, ... cycles per common interval), so the row of bobs
// continuously reorganises: a clean travelling sine, then braided double-helix
// crossings, then apparent disorder, then back to unison — one long, seamless
// order/chaos/order loop. Bob colours blend across the row from one palette
// colour to the next, so the wave patterns read as a slow colour ribbon.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cycleSpeed;  // scales all pendulum periods together   (default 0.7)
uniform float u_spacing;     // px between pendulums, css-px            (default 70)
uniform float u_swing;       // full lateral bob travel, css-px         (default 200)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float NPEND     = 13.0;   // number of pendulums in the row (loop bound)
const float BASE_CYC  = 18.0;   // slowest pendulum: cycles per common interval
const float CYCLE_LEN = 45.0;   // seconds for one full order/chaos/order loop
const float RAIL_CSS  = 56.0;   // y of the implied rail from the top, css-px
const float BOB_CSS   = 5.5;    // bob core radius, css-px
const float FIL_CSS   = 0.9;    // filament half-thickness, css-px
const float PI        = 3.14159265;
const float TAU       = 6.28318531;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// distance from point p to segment a-b
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  vec2 ap = p - a;
  float h = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(ap - ab * h);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // Palette with midnight fallback for headless/zeroed contexts.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // sizes in device px (css * pixelRatio), guarded so params=0 never NaN
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 1.0) * refScale * pr;
  float swing   = max(u_swing, 0.0) * pr * 0.5;   // amplitude = half of full travel
  float railY   = res.y - RAIL_CSS * pr;          // rail near the top
  float bobR    = BOB_CSS * pr;
  float fil     = FIL_CSS * pr;

  // phase of the long master cycle; the periods are integer cycles-per-interval
  // so the whole ensemble returns to unison exactly once per CYCLE_LEN.
  float cyc   = max(u_cycleSpeed, 0.05);
  float phase = TAU * t * cyc / CYCLE_LEN;

  // centre the row of NPEND pendulums horizontally
  float rowW  = (NPEND - 1.0) * spacing;
  float x0    = res.x * 0.5 - rowW * 0.5;

  // accumulate bob glow, trail smear and filaments across the fixed row
  vec3  bobCol  = vec3(0.0);
  float bobGlow = 0.0;
  float trail   = 0.0;
  vec3  trailCol = vec3(0.0);
  float filament = 0.0;

  for (float i = 0.0; i < NPEND; i += 1.0) {
    float fi = i / max(NPEND - 1.0, 1.0);      // 0..1 across the row

    // this pendulum's swing frequency (radians/sec of the master phase).
    // cycles-per-interval = BASE_CYC + i, the pendulum-wave construction.
    float cycles = BASE_CYC + i;
    float ang    = swing == 0.0 ? 0.0 : sin(phase * cycles);

    // pivot at the rail, bob hangs below and swings laterally
    float px    = x0 + i * spacing;
    // length graded so longer (slower visually) pendulums hang lower; keep
    // bobs comfortably on-screen
    float len   = (0.30 + 0.16 * fi) * res.y;
    vec2  pivot = vec2(px, railY);
    vec2  bob   = vec2(px + ang * swing, railY - len);

    // colour blends across the row: hue position 0..4 with a slow time drift so
    // the ribbon breathes without a visible reset (no dynamic array indexing).
    float s  = fract(fi * 0.92 + t * 0.01) * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

    // --- filament: thin faint line from pivot to bob ---
    float dseg = segDist(fc, pivot, bob);
    float fl   = 1.0 - smoothstep(fil, fil + 1.6 * pr, dseg);
    filament  += fl;

    // --- phosphor smear: a short dim arc of the bob's recent positions ---
    // sample a few lagged angles; nearer-in-time samples are brighter (decay).
    float sm = 0.0;
    for (float k = 1.0; k <= 6.0; k += 1.0) {
      float lag   = k * 0.05;                       // seconds of lookback
      float la    = sin((phase - TAU * cyc / CYCLE_LEN * lag) * cycles);
      vec2  bp    = vec2(px + la * swing, railY - len);
      float d     = length(fc - bp);
      float decay = exp(-k * 0.55);                 // phosphor fade with age
      sm += decay * exp(-d * d / (bobR * bobR * 3.2));
    }
    trail    += sm;
    trailCol += hue * sm;

    // --- bob: small glowing core + soft halo ---
    float d2   = length(fc - bob);
    float core = smoothstep(bobR, bobR - 1.4 * pr, d2);          // crisp disc
    float halo = exp(-d2 * d2 / (bobR * bobR * 6.0));            // soft glow
    float g    = core * 1.0 + halo * 0.85;
    bobGlow   += g;
    bobCol    += hue * g;
  }

  // implied rail: a very faint horizontal phosphor line across the top
  float railD  = abs(fc.y - railY);
  float rail   = (1.0 - smoothstep(0.0, 1.4 * pr, railD)) * 0.10;
  // fade the rail toward the screen edges
  rail        *= smoothstep(0.0, res.x * 0.12, fc.x) * smoothstep(0.0, res.x * 0.12, res.x - fc.x);

  // compose: dark base + filaments (dim) + phosphor smear + bobs (brightest)
  vec3 filCol = mix(c2, c0, 0.5);
  col += filCol * filament * 0.06;
  col += trailCol * 0.16;
  col += bobCol * 0.9;
  col += vec3(0.6, 0.7, 0.85) * rail;

  // gentle radial vignette so the frame stays composed and edges fall to black
  vec2  uv   = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.30, 0.95, length(uv));
  col = mix(BG, col, 0.30 + 0.70 * vign);

  // soft tone curve to tame the hottest cores without a hard clip
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
