// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// circlet (Mercury) — five beads of mercury ride a single invisible circular
// groove. Each is a 2D metaball kernel constrained to the circle; summed and
// smooth-min iso-surfaced so closeness along the arc makes neighbours neck and
// wick into longer liquid arcs. Their angular spacing breathes on incommensurate
// offset harmonics, so partial fusions wander around the ring; once per grand
// cycle all five fuse into one unbroken glowing annulus, which trembles and
// then beads apart again, drop by drop. Interiors are dark mirror; a thin
// gradient-derived rim highlight is doubled on the ring's outer edge. Hue
// circulates by angle across palette 0..2 above a dark base, with colour 3
// sparking at each neck snap.
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
uniform float u_ringRadius;  // radius of the invisible groove, css px (default 180)
uniform float u_flowSpeed;   // circulation + annulus-cadence speed   (default 0.3)
uniform float u_beadSize;    // mercury bead radius, css px           (default 48)
uniform float u_snapGlow;    // colour-3 spark brightness at necks    (default 1)

const vec3  BG    = vec3(0.030, 0.030, 0.038); // near-black mirror base
const float TAU   = 6.28318530718;
const int   NBEAD = 5;

// polynomial smooth-min: blends two field heights, k controls neck softness
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// angular seat of bead i: even seat around the full circle + a per-bead breathing
// wobble on incommensurate offsets (so partial fusions migrate). Wobble fades to
// zero as the beads settle onto their seats for the full-annulus event.
float beadAngle(int i, float t, float flow, float fuse, float baseRot) {
  float fi   = float(i);
  float seat = fi / float(NBEAD) * TAU;
  // wobble must stay well below half the even seat gap (TAU/5 = 1.257 rad, half =
  // 0.628). Capped at 0.20 + 0.12 = 0.32 rad peak so adjacent beads can never
  // swing more than ~half a seat into each other: the pentagonal ring read stays
  // legible at all times and no bead migrates off its arc segment (no clumping,
  // no opposite-arc dead void). Incommensurate offsets still make fusions wander.
  float wob  = sin(t * flow * (0.7 + 0.13 * fi) + fi * 2.3) * 0.20
             + sin(t * flow * (0.41 + 0.09 * fi) + fi * 5.1) * 0.12;
  return baseRot + seat + wob * (1.0 - fuse);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // palette with midnight fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3  col = BG;

  float beadR = max(u_beadSize, 1.0)   * pr;   // bead radius in device px
  // groove radius (device px). Clamp so the ring + beads always stay framed and
  // centred regardless of tile aspect — the param still reads as tighter/looser.
  float minHalf = min(res.x, res.y) * 0.5;
  float ringR   = min(max(u_ringRadius, 1.0) * pr, max(minHalf - beadR * 1.15, beadR));
  float flow    = u_flowSpeed;

  vec2  p   = fc - ctr;
  float ang = atan(p.y, p.x);   // fragment polar angle, -pi..pi (continuous hue)
  float rad = length(p);

  // grand cycle: slow 0..1 phase. As it rises the five beads settle onto exact
  // even seats around the WHOLE circle and swell along the groove so neighbours
  // bridge into one unbroken annulus; as it falls they bead apart again.
  float grand   = 0.5 - 0.5 * cos(t * flow * 0.34);  // 0 beaded .. 1 annulus
  float fuse    = smoothstep(0.55, 1.0, grand);      // late, snappy fusion ramp
  float baseRot = t * flow * 0.6;                    // whole necklace circulates
  // swell the beads as fusion approaches so evenly-spaced neighbours touch.
  // even-seat gap between adjacent centres is 2*ringR*sin(pi/5); a bead must reach
  // roughly half that to bridge, so grow beadR toward ~0.62*gap at full fusion.
  float gap     = 2.0 * ringR * sin(3.14159265 / float(NBEAD));
  float beadF   = mix(beadR, max(beadR, gap * 0.60), fuse);
  float k       = beadR * 0.55 + beadF * 0.55 * fuse; // neck softness (device px)
  // inner-hole radius for the annulus: the dark centre that survives fusion so the
  // body reads as a ring with no ends, not a filled disc.
  float rHole   = max(ringR - beadF * 0.55, ringR * 0.30);

  // accumulate smooth-union field + a smooth analytic gradient (for the normal).
  // grad is the smooth-min-weighted sum of outward directions => no nearest-bead
  // seam. weight uses the same h-blend as smin so it stays continuous.
  float field   = 1e9;
  float hardMin = 1e9;
  vec2  grad    = vec2(0.0);

  for (int i = 0; i < NBEAD; i++) {
    float a    = beadAngle(i, t, flow, fuse, baseRot);
    vec2  cpos = vec2(cos(a), sin(a)) * ringR;
    vec2  toP  = p - cpos;
    float dc   = length(toP);
    float d    = dc - beadF;

    // weight: how much this bead dominates the soft surface here (continuous)
    float h    = clamp(0.5 + 0.5 * (field - d) / max(k, 1.0), 0.0, 1.0);
    grad       = mix(grad, toP / max(dc, 1e-3), h);

    field   = smin(field, d, k);
    hardMin = min(hardMin, d);
  }

  // carve the central hole during fusion: subtract the inner disc so the fused
  // body is a true annulus (ring with a dark centre), not a filled blob. Uses a
  // smooth intersection so the hole opens gently as fusion ramps. The carve only
  // bites near/inside the hole (smin keeps the outer surface untouched).
  float holeSDF = rHole - rad;                 // >0 inside the hole
  field = mix(field, -smin(-field, -holeSDF, k), fuse);

  // grad picks up the inner edge too so the rim highlight rings the hole
  if (rad < rHole + beadF) {
    vec2 inwardN = -p / max(rad, 1e-3);        // points toward centre (inner wall)
    float hg = clamp(0.5 + 0.5 * (holeSDF) / max(k, 1.0), 0.0, 1.0) * fuse;
    grad = mix(grad, inwardN, hg);
  }

  // neck heat: how far the smooth-min pulled the surface below the hard min.
  // Non-zero only in the saddle regions where two beads blend (the necks),
  // and across the whole body when fused into the annulus.
  // the smooth-min depth peaks at ~0.25*k, so scale by ~4 to reach a full 0..1.
  float neckHeat = clamp((hardMin - field) / max(k, 1.0) * 4.0, 0.0, 1.0);

  // surface masks
  float aa     = 1.5 * pr;
  float inside = 1.0 - smoothstep(-aa, aa, field);            // filled liquid body
  float rimW   = beadR * 0.26;
  float rim    = 1.0 - smoothstep(0.0, rimW, abs(field));     // thin rim band

  // gradient-derived rim highlight from an off-frame key light (up-left).
  vec2  nrm    = normalize(grad + 1e-4);
  float keyLit = 0.5 + 0.5 * dot(nrm, normalize(vec2(-0.55, 0.85)));
  // double the rim on the ring's OUTER edge (beyond the groove), as if lit from
  // somewhere outside the circle
  float outer  = smoothstep(ringR * 0.82, ringR * 1.08, rad);
  float rimHi  = rim * (0.30 + 0.70 * keyLit) * (1.0 + 0.9 * outer);

  // colour: hue circulates smoothly by FRAGMENT angle across c0->c1->c2->c0,
  // plus a slow time drift so the sweep rolls around the ring (no seam, no reset)
  float hueA = fract((ang + TAU * 0.5) / TAU + t * flow * 0.05);
  float s3   = hueA * 3.0;
  float w0   = max(0.0, 1.0 - abs(s3 - 0.0)) + max(0.0, 1.0 - abs(s3 - 3.0));
  float w1   = max(0.0, 1.0 - abs(s3 - 1.0));
  float w2   = max(0.0, 1.0 - abs(s3 - 2.0));
  vec3  hue  = (c0 * w0 + c1 * w1 + c2 * w2) / max(w0 + w1 + w2, 0.001);

  // dark mirror interior: mostly black with a faint cool hue sheen, brighter
  // where the surface catches the key light
  float sheen    = 0.10 + 0.12 * keyLit;
  vec3  interior = mix(BG, hue * 0.34, sheen);
  col = mix(col, interior, inside);

  // rim highlight: thin bright gradient-derived line, palette-tinted, AA
  col += hue * rimHi * 1.20 * inside;
  // soft bloom off the liquid edge (just outside the surface)
  float edgeGlow = exp(-abs(field) / (beadR * 0.5)) * (0.30 + 0.70 * keyLit);
  col += hue * edgeGlow * 0.22;

  // snap spark: colour 3 flares in the necks at the instant of fusion. The neck
  // saddle only counts where the body is actually filled (inside) AND the surface
  // is near the rim of that saddle — this keeps the spark on the bridging neck and
  // off the faint far-field ridges between distant beads. A soft fast pulse reads
  // as a snap, not a steady glow.
  float snapPulse = 0.55 + 0.45 * sin(t * flow * 3.5 + ang * 1.3);
  float neckCore  = smoothstep(0.30, 0.85, neckHeat);     // bright snap core
  // localise to the fused neck waist: inside the body (rejects external bisector
  // streaks) and near the iso-surface saddle (concentrates on the bridging waist).
  float onRim     = exp(-field * field / (beadR * beadR * 0.55));
  float spark     = neckCore * onRim * inside * snapPulse;
  col += c3 * spark * u_snapGlow * 1.85;
  // a wider, softer halo of the spark colour around the neck so it reads at a
  // glance, still gated inside the body
  col += c3 * neckCore * inside * snapPulse * 0.70 * u_snapGlow;
  // a whisper of near-white at the very hottest snap core, scaled by snapGlow
  col += vec3(1.0) * spark * 0.22 * u_snapGlow;

  // when fully fused the whole annulus glows a touch hotter
  float annulus = smoothstep(0.7, 1.0, grand);
  col += hue * inside * annulus * 0.18;

  // faint ghost of the invisible groove so the CENTRED RING composition holds
  // during the long beaded majority of the cycle: a thin, dim hue-tinted band on
  // the circle the beads ride, brightest where no bead currently sits (so the far
  // arc and the spaces between beads never read as a dead void). It fades out as
  // the real annulus forms (the body itself then carries the ring read) and sits
  // just above the dark base — never competing with the liquid surface.
  float ringBand = exp(-pow((rad - ringR) / max(beadR * 0.42, 1.0), 2.0));
  float ghost    = ringBand * (1.0 - inside) * (1.0 - 0.85 * fuse);
  col += hue * ghost * 0.07;

  // --- depth-of-field background: soft defocused mercury orbs of the same format
  // drift behind the ring, giving depth + filling the dark (replaces the backdrop).
  // gated behind the solid body so the subject stays crisp against the blur. ---
  vec3 dofBg = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + 1.0;
    vec2  seed = vec2(fract(sin(fi * 91.7) * 4373.0), fract(sin(fi * 47.3) * 9277.0));
    vec2  obp  = (seed - 0.5) * vec2(res.x * 0.98, res.y * 0.98);
    obp += vec2(sin(t * flow * 0.15 + fi), cos(t * flow * 0.12 + fi * 1.6)) * minHalf * 0.12;
    float orad = (0.16 + 0.22 * fract(sin(fi * 23.1) * 1731.0)) * minHalf;
    float od   = length(p - obp);
    float disc = smoothstep(orad, orad * 0.5, od);              // soft out-of-focus body
    float ring = exp(-pow((od - orad * 0.9) / (orad * 0.16), 2.0)); // bokeh rim
    vec3  oc   = mix(mix(c0, c2, fract(sin(fi * 5.5) * 331.0)), c1, 0.30);
    dofBg += oc * (disc * 0.55 + ring * 0.85);
  }
  col += dofBg * 0.060 * (1.0 - inside);

  // radial vignette keeps corners dark, ring luminous
  float vign = 1.0 - smoothstep(0.45, 1.15, length(p / res));
  col *= mix(0.82, 1.0, vign);

  // gentle tonemap to avoid blow-out at high snapGlow / annulus
  col = col / (1.0 + col * 0.45);

  gl_FragColor = vec4(col, 1.0);
}
