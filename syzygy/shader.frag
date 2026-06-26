// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// syzygy (Mercury) — three quicksilver pools in a strict 3:2:1 radius grading
// hang far apart across a wide, slowly shearing triangle. Built as a summed 2D
// metaball field iso-surfaced through smooth-min so bodies bulge toward each
// other, neck, fuse, and pinch apart. Each pool owns one palette colour carried
// in its rim hue; where two fuse the rim blends between owners. Pairwise fusions
// arrive as brief excursions on long offset periods; once per grand cycle all
// three thread into a single elongated body — the full syzygy — then pinch back
// to three in two staggered snaps. Colour 3 lives only in the fusion flashes and
// a barely-there diagonal backdrop gradient that keeps the void from reading flat.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spread;        // triangle scale, css px        (default 340)
uniform float u_tempo;         // pairwise + syzygy cycle speed  (default 0.4)
uniform float u_rimWidth;      // rim highlight width, css px    (default 2)
uniform float u_flashStrength; // colour-3 snap brightness       (default 1.1)

const vec3  BG       = vec3(0.030, 0.030, 0.040); // near-black base
// iso-surface threshold chosen so a lone pool's contour lands near 0.9 of its
// kernel radius (the visible disc edge = the rim), not deep inside it.
const float ISO      = 0.040;   // iso-surface threshold of the summed field
const float K_SMIN   = 0.030;   // smooth-min blend radius (field units)

// soft metaball kernel: 1 at centre, smoothly to 0 at radius r (in px)
// returns a finite, monotonic field; r guarded against zero.
float kernel(vec2 p, vec2 c, float r) {
  r = max(r, 1.0);
  float d2 = dot(p - c, p - c) / (r * r);
  // (1 - d2)^2 clamped — compact support, smooth, cheap; iso-surface ~ d2=const
  float f = max(0.0, 1.0 - d2);
  return f * f;
}

// polynomial smooth-max of two scalars (so bodies bulge together near the iso)
float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // Palette with house fallback (headless can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float spread = u_spread * pr;            // triangle scale in device px
  float rim    = max(u_rimWidth, 0.001) * pr;
  float tempo  = max(u_tempo, 0.001);

  // ---- pool radii: strict 3:2:1 grading, scaled off the spread ----
  float rUnit = spread * 0.135;
  float rA = rUnit * 3.0;  // large  (owns colour 0)
  float rB = rUnit * 2.0;  // middle (owns colour 1)
  float rC = rUnit * 1.0;  // small  (owns colour 2)

  // ---- center paths -------------------------------------------------------
  // Resting triangle: three corners, wide spread. Each pool drifts on its own
  // slow cycle so the triangle continuously shears; the relative phases are
  // chosen incommensurate so pairwise closings + the rare triple alignment
  // emerge from one continuous set of paths (no cuts).
  float w  = tempo * 0.10;                 // base angular rate
  // grand syzygy gate: a slow 0..1..0 that peaks once per long cycle and pulls
  // all three toward the frame centre at the same instant.
  float syz = 0.5 + 0.5 * sin(t * w * 0.5 - 1.5707963);
  syz = smoothstep(0.55, 1.0, syz);        // mostly 0; brief held peak

  // base resting corners (unit triangle, wide), then per-pool slow orbits.
  // kept inside the frame at the default spread so no body clips an edge.
  vec2 baseA = vec2(-0.50, -0.12);
  vec2 baseB = vec2( 0.54, -0.20);
  vec2 baseC = vec2( 0.06,  0.46);

  // each pool sweeps a small ellipse at its own rate/phase -> shearing triangle
  vec2 orbA = vec2(cos(t * w * 1.00 + 0.0), sin(t * w * 0.83 + 0.0)) * 0.20;
  vec2 orbB = vec2(cos(t * w * 0.71 + 2.1), sin(t * w * 1.13 + 2.1)) * 0.22;
  vec2 orbC = vec2(cos(t * w * 1.37 + 4.2), sin(t * w * 0.61 + 4.2)) * 0.26;

  // toward-center pull during the grand syzygy (assembled by the same paths)
  vec2 pA = mix(baseA + orbA, vec2(-0.16, 0.0), syz);
  vec2 pB = mix(baseB + orbB, vec2( 0.18, 0.0), syz);
  vec2 pC = mix(baseC + orbC, vec2( 0.01, 0.0), syz);

  vec2 cA = ctr + pA * spread;
  vec2 cB = ctr + pB * spread;
  vec2 cC = ctr + pC * spread;

  // ---- field ---------------------------------------------------------------
  float fA = kernel(fc, cA, rA);
  float fB = kernel(fc, cB, rB);
  float fC = kernel(fc, cC, rC);

  // smooth-max union: bodies neck/bulge toward each other near the iso surface
  float kk    = K_SMIN;
  float field = smax(smax(fA, fB, kk), fC, kk);

  // iso surface + soft anti-aliased fill mask. The dark mirror body fills the
  // whole disc out to the iso contour; the bright rim straddles that contour.
  float aa   = 2.2 / spread + 0.0020;      // edge softness in field units
  float fill = smoothstep(ISO - aa, ISO + aa, field);

  // rim: a thin band straddling the iso contour (bright mirror edge)
  float rimBand = max(0.0, 1.0 - abs(field - ISO) / (aa + rim / spread * 1.4));
  rimBand = rimBand * rimBand;

  // ---- per-pool ownership weighting (for rim hue + interior sheen) --------
  // weight each pool by its own kernel contribution at this pixel; where two
  // pools overlap the weights mix, so the rim hue blends between owners.
  float wsum = fA + fB + fC + 1e-4;
  float owA = fA / wsum, owB = fB / wsum, owC = fC / wsum;
  vec3  poolCol = c0 * owA + c1 * owB + c2 * owC;

  // ---- fusion detection: how close is each pair to necking together? -------
  // pair "fusion energy" rises sharply as centers approach within touch range.
  float dAB = distance(cA, cB) / (rA + rB);
  float dBC = distance(cB, cC) / (rB + rC);
  float dCA = distance(cC, cA) / (rC + rA);
  // 1 when overlapping/touching, fading out as they separate
  float fuAB = smoothstep(1.15, 0.85, dAB);
  float fuBC = smoothstep(1.15, 0.85, dBC);
  float fuCA = smoothstep(1.15, 0.85, dCA);
  float fuseAny = max(max(fuAB, fuBC), fuCA);

  // a quick bright SNAP at the instant of fusion: derivative-like spike that
  // peaks while a pair is mid-transition (near the touch threshold), not while
  // fully merged or fully apart -> reads as the bright snap + pinch flash.
  float snapAB = fuAB * (1.0 - fuAB) * 4.0;
  float snapBC = fuBC * (1.0 - fuBC) * 4.0;
  float snapCA = fuCA * (1.0 - fuCA) * 4.0;
  float snap   = max(max(snapAB, snapBC), snapCA);
  // amplify during the grand syzygy assembly/disassembly
  snap = max(snap, syz * (1.0 - syz) * 4.0 * 0.9);

  // ---- shading -------------------------------------------------------------
  vec3 col = BG;

  // barely-there diagonal backdrop gradient (colour 3) so the void isn't flat
  float diag = dot((fc - ctr) / res, normalize(vec2(0.7, 0.5))) + 0.5;
  col += c3 * (0.020 + 0.020 * diag) * 0.5;

  // dark liquid-mirror interior: very dark mirror body, with a faint cool
  // interior sheen that brightens toward the iso edge (curved-mirror read).
  float interior = smoothstep(ISO + aa, ISO * 1.55, field); // 0 at edge -> 1 deep
  float sheen    = (1.0 - interior);                        // bright near rim
  vec3  bodyCol  = mix(poolCol * 0.06, poolCol * 0.30, sheen);
  col = mix(col, BG * 0.35 + bodyCol, fill);

  // bright rim highlight (gradient-derived band), palette-hued per owner
  vec3 rimCol = poolCol * 1.35 + vec3(0.12);
  col += rimCol * rimBand * 1.55;

  // a soft outer halo just outside the surface — kept tight so the dark mirror
  // body stays the dominant shape, not a big translucent disc.
  float halo = smoothstep(ISO, ISO * 0.55, field) * (1.0 - fill);
  col += poolCol * halo * 0.16;

  // ---- fusion flash: colour 3, only at snaps, scaled by FLASH_STRENGTH -----
  // concentrate the flash tightly on the rim/neck contour of merging bodies so
  // the void stays dark — the snap reads as a bright edge pulse, not a flood.
  float flashMask = rimBand + halo * 0.06;
  col += c3 * snap * flashMask * u_flashStrength * 1.3;
  // a faint full-body brighten at the snap so the merge "pops"
  col += poolCol * snap * fill * u_flashStrength * 0.20;

  // --- depth-of-field background: soft defocused blobs of the same liquid format
  // drift behind the subject for depth + to fill the dark (replaces the backdrop),
  // gated behind the solid body so the subject stays crisp against the blur. ---
  vec3 dofBg = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + 1.0;
    vec2  seed = vec2(fract(sin(fi * 91.7) * 4373.0), fract(sin(fi * 47.3) * 9277.0));
    vec2  obp  = (seed - 0.5) * res * 0.98;
    obp += vec2(sin(t * 0.15 + fi), cos(t * 0.12 + fi * 1.6)) * (0.5 * min(res.x, res.y)) * 0.12;
    float orad = (0.16 + 0.22 * fract(sin(fi * 23.1) * 1731.0)) * (0.5 * min(res.x, res.y));
    float od   = length((fc - ctr) - obp);
    float disc = smoothstep(orad, orad * 0.5, od);
    float ring = exp(-pow((od - orad * 0.9) / (orad * 0.16), 2.0));
    vec3  oc   = mix(mix(c0, c2, fract(sin(fi * 5.5) * 331.0)), c1, 0.30);
    dofBg += oc * (disc * 0.55 + ring * 0.85);
  }
  col += dofBg * 0.060 * (1.0 - fill);

  // gentle vignette to compose the framing
  float vign = 1.0 - smoothstep(0.45, 1.15, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
