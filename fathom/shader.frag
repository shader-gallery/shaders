// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Fathom --- a bathymetric survey rendered as soundings, not lines (family: Strata)
//
// A regular survey grid of small glowing depth dots covers the frame. Each
// dot size and brightness falls with the water depth beneath it, so the
// chart reads as a calm stipple field being swallowed by one dominant abyssal
// void and a couple of lesser dark deeps. Dot hue slides through the palette
// with depth --- shallow dots clear and bright, the last sparks at the trench
// lip barely above black. The space between dots stays the near-black base,
// darkening toward each deep like the water column itself.
//
// Motion: the trench migrates across the chart on a smooth noise path taking
// minutes to cross, dots dimming and shrinking as the void slides under them
// and re-kindling in its wake; the deepest surviving dots shimmer on long
// offset phases, like something breathing down there. The GRID never moves ---
// all motion lives in the hidden depth field. Paths and shimmer are
// phase-continuous (drift is unbounded time, shimmer is pure sine): no reset.

precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // unused --- shader is fully presentable without it
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_trenchDrift; // speed the abyssal trench migrates; 0 anchors it  (default 0.15)
uniform float u_dotSpacing;  // survey-grid spacing, css px, scaled by u_pixelRatio (default 26)
uniform float u_depthFade;   // how hard dots shrink/dim with depth; 0 = even grid (default 0.7)
uniform float u_shimmer;     // flicker rate of the deepest surviving dots; 0 = still (default 0.4)

const float DRIFT_GAIN  = 0.060;  // u_trenchDrift -> noise-path advance rate
const float DOT_FILL    = 0.32;   // dot radius as a fraction of cell, at full brightness
const float AA          = 1.1;    // dot-edge antialias half-band, device px
const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black house base

// ---- hashes + smooth 2D value noise (for the wandering depth field) -------

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.3, 289.1)));
  return fract(vec2(262144.0, 32768.0) * n);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// depth ramp: shallow (0) -> deep (1) walks the palette, then fades to black at
// the trench floor. Tent-weighted blend, no dynamic array indexing.
vec3 depthRamp(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  return a * max(0.0, 1.0 - abs(t))
       + b * max(0.0, 1.0 - abs(t - 1.0))
       + c * max(0.0, 1.0 - abs(t - 2.0))
       + d * max(0.0, 1.0 - abs(t - 3.0));
}

// smooth bowl of depth around a moving centre, in normalized (short-edge) units
float deep(vec2 uv, vec2 ctr, float radius, float strength) {
  float r = length(uv - ctr) / radius;
  return strength * exp(-r * r);          // gaussian void, 0 far away
}

void main() {
  // palette + house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr  = max(u_pixelRatio, 0.25);
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);
  vec2  fc  = gl_FragCoord.xy;

  // normalized coords for the depth field (short edge = 1 unit), centred
  vec2 uv = (fc - 0.5 * res) / mn;

  // --- the hidden depth field (continuous; the grid samples it per cell) ---
  // a slow noise path carries the dominant trench across the chart; the lesser
  // deeps ride slower offset paths so the void cluster wanders, not slides.
  float adv = u_time * u_trenchDrift * DRIFT_GAIN;

  // dominant abyssal void --- big, deep, restless
  vec2 pA = vec2(vnoise(vec2(adv,        4.3)),
                 vnoise(vec2(adv + 9.1, 21.7))) * 1.30 - 0.65;
  // two lesser deeps on slower, offset phases
  vec2 pB = vec2(vnoise(vec2(adv * 0.61 + 31.0,  2.0)),
                 vnoise(vec2(adv * 0.61 + 13.0, 47.0))) * 1.10 - 0.55;
  vec2 pC = vec2(vnoise(vec2(adv * 0.43 + 60.0, 88.0)),
                 vnoise(vec2(adv * 0.43 + 71.0, 19.0))) * 1.10 - 0.55;

  // aspect: stretch x so voids stay round on wide frames
  float asp = res.x / mn;

  // accumulate depth (0 = shallow chart, ~1 = abyssal floor). Centres in uv.
  float depth = 0.0;
  depth += deep(uv, pA * vec2(asp, 1.0), 0.42, 1.00);   // dominant void
  depth += deep(uv, pB * vec2(asp, 1.0), 0.26, 0.55);   // lesser deep
  depth += deep(uv, pC * vec2(asp, 1.0), 0.22, 0.45);   // lesser deep
  // a gentle large-scale undulation so the shallows are not perfectly flat
  depth += 0.10 * vnoise(uv * 2.1 + vec2(0.0, adv * 0.5));
  depth = clamp(depth, 0.0, 1.0);

  // --- the fixed survey grid (never moves) ---------------------------------
  float refScale = mn / (pr * 400.0);                   // P0-C: hold composition tile->fullsize
  float spacing = max(u_dotSpacing, 4.0) * refScale * pr; // css px -> device px, frame-relative
  vec2  cellId  = floor(fc / spacing);
  vec2  cellCtr = (cellId + 0.5) * spacing;
  vec2  local   = fc - cellCtr;                         // px from this dot centre

  // sample the depth field at THIS dot centre (so the dot reads one depth,
  // not a smear), and a tiny per-dot jitter of phase for organic shimmer.
  vec2  dotUV   = (cellCtr - 0.5 * res) / mn;
  float dDepth  = 0.0;
  dDepth += deep(dotUV, pA * vec2(asp, 1.0), 0.42, 1.00);
  dDepth += deep(dotUV, pB * vec2(asp, 1.0), 0.26, 0.55);
  dDepth += deep(dotUV, pC * vec2(asp, 1.0), 0.22, 0.45);
  dDepth += 0.10 * vnoise(dotUV * 2.1 + vec2(0.0, adv * 0.5));
  dDepth  = clamp(dDepth, 0.0, 1.0);

  // shallow dots clear & bright; deep dots shrink & dim, the last few near
  // black. u_depthFade scales how aggressively depth swallows the dot.
  float fade   = u_depthFade;
  float bright = 1.0 - fade * smoothstep(0.02, 0.96, dDepth);
  bright = clamp(bright, 0.0, 1.0);

  // dot radius tracks brightness so deeps both dim AND shrink
  float radius = spacing * DOT_FILL * (0.30 + 0.70 * bright);

  // shimmer: only the deepest SURVIVING dots breathe, on long offset phases.
  // a per-dot random phase + a depth gate so shallow dots never flicker.
  float ph     = hash21(cellId) * 6.2831853;
  float gate    = smoothstep(0.35, 0.75, dDepth) * (1.0 - smoothstep(0.93, 1.0, dDepth));
  float breathe = 0.5 + 0.5 * sin(u_time * (0.5 + u_shimmer) + ph);
  float shim     = 1.0 + u_shimmer * 0.6 * gate * (breathe - 0.5) * 2.0;
  shim = max(shim, 0.0);

  // the dot itself: smoothstep-antialiased disc with a soft glow halo
  float dist  = length(local);
  float disc  = 1.0 - smoothstep(radius - AA, radius + AA, dist);
  float halo  = exp(-dist / (radius * 1.6 + 2.0)) * 0.5;

  // dot hue slides through the palette with depth; clamp the deep end short of
  // pure index 3 so the last sparks read as colour, then let brightness kill it
  vec3 dotCol = depthRamp(dDepth * 0.85, c0, c1, c2, c3);

  float dotMask = clamp(disc + halo, 0.0, 1.4);
  vec3  dots    = dotCol * dotMask * bright * shim;

  // --- the water column: near-black base darkening toward each deep ---------
  // the inter-dot space stays untouched near-black, sinking slightly bluer and
  // darker over the voids (continuous `depth`, not the per-dot sample).
  vec3  deepTint = depthRamp(depth * 0.85, c0, c1, c2, c3);
  vec3  bg       = BG * (1.0 - 0.70 * depth)             // water column darkens
                 + deepTint * 0.010 * (1.0 - depth);     // faint chart tint, fades in the void

  vec3 col = bg + dots * 0.92;

  // gentle vignette holds the corners down and composes the framing
  float r   = length((fc - 0.5 * res) / (0.5 * res));
  float vig = 1.0 - 0.30 * smoothstep(0.55, 1.45, r);
  col *= vig;

  // de-banding dither so the smooth water column never posterizes
  col += (hash21(fc + u_time) - 0.5) / 255.0;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
