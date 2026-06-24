// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// warp (Loom) - a loom warp: thin bright vertical threads on a near-black
// field that ripple side-to-side as a slow sinusoidal displacement travels
// down them, with soft glow nodes blooming where a horizontal weft wave
// crosses. Threads are tinted across u_palette by their x position. Delicate,
// not neon, and periodic in time so it loops with no visible jump.
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
uniform float u_spacing;  // px between warp threads      (default 28)
uniform float u_amp;      // horizontal ripple amplitude  (default 9)
uniform float u_drift;    // ripple travel speed          (default 0.3)
uniform float u_glow;     // thread/node glow multiplier  (default 1)
uniform float u_thick;    // thread half-width in CSS px   (default 1.4)
uniform float u_weft;     // weft glow-band sweep speed    (default 0.22)
uniform float u_randomize;// per-thread jitter: x / amp / phase / width / glow (default 0)
uniform float u_tilt;     // slant the warp off-vertical (shear)              (default 0)
uniform float u_node;     // weft glow-node bloom strength                    (default 1)

const float BG          = 0.039;   // #0A -> ~0.04 near-black base
const float WAVELEN_CSS = 240.0; // vertical wavelength of the travelling ripple

const float TAU = 6.2831853;

// cheap per-thread pseudo-random scalar in 0..1
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

// smooth per-thread colour from the 4-stop palette across x in 0..1
vec3 threadTint(float x) {
  float s = clamp(x, 0.0, 1.0) * 3.0;
  vec3 tc = u_palette[0];
  tc = mix(tc, u_palette[1], smoothstep(0.0, 1.0, s));
  tc = mix(tc, u_palette[2], smoothstep(1.0, 2.0, s));
  tc = mix(tc, u_palette[3], smoothstep(2.0, 3.0, s));
  return tc;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = vec3(BG, BG, 0.047);

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  float amp     = u_amp * pr;
  float wavelen = WAVELEN_CSS * refScale * pr;
  float thick   = max(u_thick, 0.3) * refScale * pr;

  // travelling ripple phase along y (periodic in t -> seamless loop)
  float yPhase = (fc.y / wavelen) * TAU - t * u_drift * TAU;

  // weft: two soft horizontal bands sweeping up and down out of phase, looping.
  // (square via multiply, not pow() -- pow of a negative base is undefined.)
  float wA = res.y * (0.5 + 0.40 * sin(t * u_weft * TAU));
  float wB = res.y * (0.5 + 0.34 * sin(t * u_weft * TAU * 0.6 + 2.1));
  float nA = (fc.y - wA) / (res.y * 0.14);
  float nB = (fc.y - wB) / (res.y * 0.20);
  float weft = exp(-nA * nA) + 0.6 * exp(-nB * nB);

  // brighten where a weft band crosses a warp thread -> glow nodes
  float node = weft * (1.0 + 1.2 * weft);
  float rnd  = max(u_randomize, 0.0);

  // slant the whole warp off-vertical by shearing x with height (rotation)
  float sx = fc.x + (fc.y - res.y * 0.5) * u_tilt;

  // accumulate the nearest few warp threads so anti-aliased lines overlap softly
  float cell = floor(sx / spacing);
  for (int k = -1; k <= 1; k++) {
    float id    = cell + float(k);
    // per-thread random scalars (stable per thread); rnd=0 leaves the even weave
    float r1 = hash11(id * 1.7 + 0.1);
    float r2 = hash11(id * 2.3 + 5.0);
    float r3 = hash11(id * 3.1 + 9.0);
    float r4 = hash11(id * 0.7 + 13.0);
    float r5 = hash11(id * 5.0 + 21.0);
    float baseX = (id + 0.5) * spacing + (r1 - 0.5) * spacing * 0.6 * rnd;
    float xN    = baseX / res.x;                 // 0..1 across screen

    // per-thread phase offset + slight amplitude variation so the weave
    // breathes organically instead of rippling in lockstep; randomize adds more.
    float ph   = id * 1.7 + r3 * TAU * rnd;
    float aMod = amp * (0.78 + 0.22 * sin(id * 0.9 + 1.3)) * (1.0 + (r2 - 0.5) * 0.9 * rnd);
    float disp = aMod * sin(yPhase + ph) + 0.35 * aMod * sin(yPhase * 0.5 + ph);
    float threadX = baseX + disp;

    // distance from this fragment to the (rippling) thread
    float d = abs(sx - threadX);

    // per-thread width + brightness jitter (rnd=0 -> uniform)
    float thickJ = thick * (1.0 + (r5 - 0.5) * 0.7 * rnd);
    float bMod   = max(1.0 + (r4 - 0.5) * 0.8 * rnd, 0.1);

    // soft luminous core + a wide halo, both scaled by pixel ratio
    float core = 1.0 - smoothstep(thickJ, thickJ + 2.5 * pr, d);
    float halo = exp(-d / (8.0 * pr));

    vec3 tint = threadTint(xN);
    // resting glow + extra lift where a weft band crosses -> glow nodes
    float lift = (0.50 + 0.95 * node * max(u_node, 0.0)) * u_glow;
    col += tint * core * (0.80 * lift) * bMod;
    col += tint * halo * (0.26 * lift) * bMod;
  }
  // a faint overall vertical falloff so edges sit darker (vignette-ish)
  float vy = smoothstep(0.0, 0.30, fc.y / res.y) * smoothstep(0.0, 0.30, 1.0 - fc.y / res.y);
  col *= 0.55 + 0.45 * vy;

  gl_FragColor = vec4(col, 1.0);
}
