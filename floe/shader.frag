// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// floe (Mosaic) — pack ice seen straight down: large pale moonlit blue-grey
// plates, held just a few shades above the void, separated by channels of
// black water. The leads carry a faint bioluminescent glow in the palette's
// coolest hue, brightest at mid-channel where the water runs deepest; the
// other palette colours tint subtle pressure ridges across the ice. Plates
// drift on slow per-seed sinusoidal wander (no net displacement, so the loop
// is seamless) and the leads breathe open and closed while light pulses
// travel along them on long hash-offset phases.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_plate;       // average floe diameter, css px (default 240)
uniform float u_driftSpeed;  // plate wander / breathing rate (default 0.12)
uniform float u_leadGlow;    // lead bioluminescence strength (default 0.8)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black ~#09090B
const float TAU = 6.2831853;

const float JITTER     = 0.56;   // static seed scatter inside each cell
const float WANDER     = 0.13;   // sinusoidal drift amplitude, cell units
const float GAP_BASE   = 0.046;  // lead half-width, cell units
const float GAP_BREATH = 0.024;  // breathing amplitude of the lead half-width
const float RIDGE_COUNT = 3.0;   // pressure ridges per cell unit
const float RIDGE_W_CSS = 7.0;   // ridge half-width, css px

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// seed position inside cell `id`: static jitter + slow sinusoidal wander.
// Pure sines around a fixed base => zero net displacement, no reset ever.
vec2 seedOff(vec2 id, float t) {
  float h1 = hash21(id);
  float h2 = hash21(id + 91.7);
  vec2  base = vec2(0.5) + (vec2(h1, h2) - 0.5) * JITTER;
  float w = t * u_driftSpeed * TAU;
  vec2  wob = vec2(sin(w * 0.31 + h1 * TAU * 3.0),
                   sin(w * 0.23 + h2 * TAU * 3.0));
  return base + wob * WANDER;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Theme colours come from u_palette. Headless poster contexts can leave the
  // vec3[] zeroed; fall back to the midnight hues so a poster never renders
  // black, while the live runtime drives the real, re-themeable palette.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float plateDev = max(u_plate, 40.0) * refScale * pr;  // device px per voronoi cell
  vec2  p = fc / plateDev;
  vec2  n = floor(p);
  vec2  f = fract(p);

  // ---- pass 1: nearest plate seed (3x3) ----
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + seedOff(n + g, t) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }

  // ---- pass 2: leads (5x5 around the owner) ----
  // For each neighbour, the signed "openness" of the lead between the two
  // plates = (breathing half-width of that lead) - (distance to the exact
  // perpendicular bisector). Water where the max openness > 0; its value is
  // the water depth, greatest at mid-channel.
  float bestOpen = -8.0, bestGap = GAP_BASE, bestEh = 0.0;
  vec2  bestDir = vec2(1.0, 0.0);
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + seedOff(n + g, t) - f;
    vec2 dr = r - mr;
    float dd = dot(dr, dr);
    if (dd > 1e-5) {
      vec2  nrm = dr / sqrt(dd);
      float d   = dot(0.5 * (mr + r), nrm);          // dist to the bisector
      float eh  = hash21((n + mg) + (n + g) + 31.3); // symmetric edge hash
      float gap = GAP_BASE + GAP_BREATH *
                  sin(t * u_driftSpeed * TAU * 0.37 + eh * TAU * 2.0);
      float open = gap - d;
      if (open > bestOpen) {
        bestOpen = open; bestGap = gap; bestEh = eh;
        bestDir = vec2(-nrm.y, nrm.x);               // along-lead direction
      }
    }
  }
  // canonical orientation so the pulse phase matches on both banks
  if (abs(bestDir.y) < 1e-4) { if (bestDir.x < 0.0) bestDir = -bestDir; }
  else if (bestDir.y < 0.0)  { bestDir = -bestDir; }

  float aaC   = 1.5 / plateDev;                       // ~1.5 device px AA
  float water = smoothstep(-aaC, aaC, bestOpen);      // 1 in the lead
  float inIce = max(-bestOpen, 0.0);                  // depth into the plate
  float depth = clamp(bestOpen / max(bestGap, 1e-4), 0.0, 1.0); // mid-lead=1

  // ---- bioluminescence in the leads ----
  // long hash-offset pulses travelling along each lead; wider (deeper) leads
  // glow more, pinched ones go dark.
  float along  = dot(p, bestDir) * 1.9;
  float pulse  = 0.55 + 0.45 * sin(bestEh * TAU * 4.0 + t * 0.32 + along);
  float widthW = smoothstep(0.020, 0.060, bestGap);
  // a tight luminous vein at mid-channel + a faint haze filling the water,
  // so the lead reads as recessed black water with light deep inside it
  float core   = pow(depth, 3.0);
  float glow   = (core + depth * depth * 0.10) * widthW * pulse * u_leadGlow;
  glow = glow / (1.0 + 0.35 * glow);                  // soft shoulder
  vec3  glowCol = mix(c2, c0, 0.45);                  // coolest palette pair
  vec3  waterCol = vec3(0.005, 0.009, 0.016) + c1 * 0.010
                 + glowCol * glow * 0.85;

  // ---- the ice plates ----
  vec2  pid  = n + mg;
  float ph1 = hash21(pid + 3.1), ph2 = hash21(pid + 17.7);
  float ph3 = hash21(pid + 57.3), ph4 = hash21(pid + 71.9);
  vec2  prel = -mr;                       // position on the plate (drifts with it)

  float pv    = 0.82 + 0.36 * ph1;        // per-plate value variation
  float shade = 1.0 + 0.42 * dot(prel, vec2(0.6, 0.8)); // moonlit grade across the plate

  // PALE moonlit ice body — floe is the BRIGHT member of the plate pair (vs
  // shale's dark matte stone). A luminous blue-white plate with a cool
  // subsurface gradient, lit well above the void so the ice reads translucent.
  vec3 tint = c0 * 0.55 + c2 * 0.45;
  tint /= max(max(tint.r, max(tint.g, tint.b)), 1e-3);
  vec3 iceCol = BG + (vec3(0.62) + tint * 0.55) * (0.30 * pv * shade);
  // subsurface scatter: a soft cool glow pooling toward the plate interior, as
  // if moonlight is diffusing through the ice rather than sitting on a surface
  float subs = smoothstep(0.0, 0.30, inIce);
  iceCol += mix(c2, vec3(0.85, 0.92, 1.0), 0.4) * subs * 0.12 * pv;

  // subtle pressure ridges, tinted by the other palette colours: thin raised
  // lines crossing each plate in its own direction, broken along their length
  float ang   = ph2 * TAU;
  vec2  rdir  = vec2(cos(ang), sin(ang));
  float rc    = dot(prel, rdir) * RIDGE_COUNT + ph3;
  float rdist = (abs(fract(rc) - 0.5) / RIDGE_COUNT) * plateDev; // device px
  float line  = 1.0 - smoothstep(0.0, RIDGE_W_CSS * pr, rdist);
  line *= line;
  float band2 = 0.5 + 0.5 * sin(dot(prel, vec2(-rdir.y, rdir.x)) * 9.0 + ph4 * TAU);
  float ridge = line * (0.30 + 0.70 * band2);
  float interior = smoothstep(0.012, 0.13, inIce);
  iceCol += (mix(c1, c3, ph4) * 0.7 + vec3(0.3)) * ridge * 0.105 * interior;

  // wet, darker rim where the plate meets the water...
  iceCol *= 1.0 - 0.34 * smoothstep(0.07, 0.004, inIce);
  // ...lifted by bioluminescent spill from the lead
  float spill = exp(-inIce * 20.0) * (0.45 + 0.55 * pulse) * widthW * u_leadGlow;
  iceCol += glowCol * spill * 0.06;

  vec3 col = mix(iceCol, waterCol, water);

  // gentle vignette + dither (kills banding on the big flat plates)
  float vign = 1.0 - 0.45 * smoothstep(0.35, 1.05, length((fc - res * 0.5) / res.y));
  col *= vign;
  col += (hash21(fc) - 0.5) * (1.5 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
