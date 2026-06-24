// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// quintet (Veil) — a five-voice sibling of Triad. Where Triad crosses three
// standing plane-wave trains at 120 degrees into a hexagonal honeycomb, Quintet
// crosses FIVE trains at 72 degrees. Five-fold symmetry cannot tile the plane,
// so the summed antinodes settle into a decagonal QUASICRYSTAL: ten-pointed
// star rosettes nested at every scale, a pattern that never quite repeats.
// Hash-scheduled strikes flood all five trains; they ring down at five separate
// rates, so the crisp stars melt through partial five-, four- and two-fold
// phases as voices drop out, before sinking to a faint residual lattice.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cellSize;    // CSS-px scale of the quasicrystal cells (default 52)
uniform float u_strikeGap;   // mean seconds between strikes           (default 11)
uniform float u_ringTime;    // seconds the trains take to ring down    (default 7)
uniform float u_skew;        // detune of two trains -> breathing drift  (default 0.03)

const vec3  BG    = vec3(0.035, 0.035, 0.043); // near-black bronze-dark base
const float TAU   = 6.2831853;
const float NSTR  = 12.0; // strikes we look back over (constant loop bound)

// small deterministic hash -> 0..1
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

// hash a strike index to a single shared 2D lattice shift (0..1 turns per axis).
// One shift translates the WHOLE quasicrystal rigidly so the five antinode grids
// stay co-registered into one coherent decagonal lattice rather than beating.
vec2 strikeShift(float k) {
  return vec2(hash11(k + 1.7), hash11(k + 33.1));
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

  // guard params so the full slider range is safe
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = max(u_cellSize, 8.0) * refScale * pr;     // antinode cell scale in px
  float gap  = max(u_strikeGap, 1.0);                    // mean seconds between strikes
  float ring = max(u_ringTime, 0.5);                     // ring-down time constant

  // spatial frequency of each plane-wave train (radians per px)
  float kf = TAU / cell;

  // five unit directions 72 degrees apart, rotated 6 degrees off the axes so the
  // decagon rows are not pixel-column aligned. Five-fold cannot tessellate, so
  // the summed field is a genuine quasicrystal (Penrose-class), not a grid.
  const float A0 = 0.10471976; // base 6 deg in radians
  const float STEP = 1.25663706; // 72 deg in radians
  vec2 d0 = vec2(cos(A0 + 0.0 * STEP), sin(A0 + 0.0 * STEP));
  vec2 d1 = vec2(cos(A0 + 1.0 * STEP), sin(A0 + 1.0 * STEP));
  vec2 d2 = vec2(cos(A0 + 2.0 * STEP), sin(A0 + 2.0 * STEP));
  vec2 d3 = vec2(cos(A0 + 3.0 * STEP), sin(A0 + 3.0 * STEP));
  vec2 d4 = vec2(cos(A0 + 4.0 * STEP), sin(A0 + 4.0 * STEP));

  // SKEW gives each voice a slow, independent PHASE drift (not a frequency
  // detune — detuning would stretch the lattice and break the five-fold
  // isotropy into directional banding). Equal frequencies keep the quasicrystal
  // perfectly decagonal while the wandering phases make it breathe and morph
  // through its inflation symmetry; at zero the pattern locks static.
  float drift = u_skew * 9.0;
  float dph0 = sin(t * 0.037 + 0.0) * drift;
  float dph1 = sin(t * 0.041 + 1.3) * drift;
  float dph2 = sin(t * 0.034 + 2.6) * drift;
  float dph3 = sin(t * 0.043 + 3.9) * drift;
  float dph4 = sin(t * 0.039 + 5.2) * drift;

  // --- accumulate ring-down amplitude per train over recent strikes ---
  // A strike at index k happens at a hash-jittered time near k*gap. Each strike
  // floods all five trains; they decay at five separated rates so the stars melt
  // mid-decay through lower-order symmetric phases as voices fade unevenly.
  float now  = t / gap;
  float base = floor(now);

  // per-train running amplitude (a0..a4), plus a single shared lattice shift the
  // whole quasicrystal currently rides (accumulated as a circular mean per axis
  // so crossfading strikes reseat the lattice smoothly without snapping)
  float a0 = 0.0, a1 = 0.0, a2 = 0.0, a3 = 0.0, a4 = 0.0;
  vec2  shR = vec2(0.0);   // amplitude-weighted shared shift (real, per axis)
  vec2  shI = vec2(0.0);   // amplitude-weighted shared shift (imag, per axis)
  float hotAmp = 0.0;      // recency of the most recent strike, for c3 tint

  for (float i = 0.0; i < NSTR; i += 1.0) {
    float k    = base - i + 1.0;            // strike index (most recent first-ish)
    float jit  = (hash11(k + 5.0) - 0.5) * 0.7; // hash-jitter the strike time
    float tk   = (k + 0.5 + jit) * gap;     // absolute strike time in seconds
    float dt   = t - tk;                    // time since this strike
    if (dt < 0.0) continue;                 // strike is in the future

    // five clearly separated decay rates: fastest voices die first, leaving the
    // slow voices ringing. As trains drop the five-fold rosette decomposes into
    // simpler few-train interference before the residual restores the quasicrystal.
    float att = smoothstep(0.0, 0.18, dt);  // sharp attack ~0.18s (crossfade-in)
    float e0 = exp(-dt * (0.40 / ring)) * att;
    float e1 = exp(-dt * (0.78 / ring)) * att;
    float e2 = exp(-dt * (1.25 / ring)) * att;
    float e3 = exp(-dt * (1.85 / ring)) * att;
    float e4 = exp(-dt * (2.60 / ring)) * att;

    a0 += e0; a1 += e1; a2 += e2; a3 += e3; a4 += e4;

    vec2 sh = strikeShift(k);
    float wt = e0 + e1 + e2 + e3 + e4;      // total strike amplitude (shift weight)
    shR += wt * cos(sh * TAU);
    shI += wt * sin(sh * TAU);

    hotAmp = max(hotAmp, exp(-dt * 3.5 / ring) * att);
  }

  // faint residual lattice so the pan stays readable at rest. Small enough that a
  // few surviving trains can dominate mid-decay and show partial symmetry; the
  // residual only restores the balanced quasicrystal once all trains have died.
  float residual = 0.040;
  a0 += residual; a1 += residual; a2 += residual; a3 += residual; a4 += residual;

  // resolved shared lattice shift (radians) from the weighted unit-vector mean.
  vec2 shift = atan(shI, shR + 1e-4);

  // overall ring-down energy: the pan glows brightest just after a strike and
  // sinks toward the dim residual between blows, so the whole frame breathes
  float norm   = a0 + a1 + a2 + a3 + a4;
  float energy = clamp(norm * 0.34, 0.0, 1.0);

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // each train owns a colour spread around the 0..4 palette wheel, so a phase
  // where one voice rings alone tints toward that voice. Precompute the five.
  vec3 tc0 = (c0*wheelW(0.0,0.0) + c1*wheelW(0.0,1.0) + c2*wheelW(0.0,2.0) + c3*wheelW(0.0,3.0));
  vec3 tc1 = (c0*wheelW(0.8,0.0) + c1*wheelW(0.8,1.0) + c2*wheelW(0.8,2.0) + c3*wheelW(0.8,3.0));
  vec3 tc2 = (c0*wheelW(1.6,0.0) + c1*wheelW(1.6,1.0) + c2*wheelW(1.6,2.0) + c3*wheelW(1.6,3.0));
  vec3 tc3 = (c0*wheelW(2.4,0.0) + c1*wheelW(2.4,1.0) + c2*wheelW(2.4,2.0) + c3*wheelW(2.4,3.0));
  vec3 tc4 = (c0*wheelW(3.2,0.0) + c1*wheelW(3.2,1.0) + c2*wheelW(3.2,2.0) + c3*wheelW(3.2,3.0));

  // ---- supersampled quasicrystal field --------------------------------------
  // The decagonal pattern is the SUM of the five raw cosines (not each squared):
  // antinode stars sit where all five voices crest constructively at once, the
  // self-similar ten-fold rosette centres of a Penrose-class quasicrystal. We
  // average over a rotated 4-tap sub-pixel kernel to anti-alias the fine fringes
  // into a luminous mesh instead of a moire grille.
  vec2 c = fc - ctr;

  vec2 o0 = vec2( 0.140,  0.347);
  vec2 o1 = vec2( 0.347, -0.140);
  vec2 o2 = vec2(-0.140, -0.347);
  vec2 o3 = vec2(-0.347,  0.140);

  // accumulated per-train crest weight (for hue) and the normalised sum field
  float bb0 = 0.0, bb1 = 0.0, bb2 = 0.0, bb3 = 0.0, bb4 = 0.0;
  float fAccum = 0.0;

  for (float s = 0.0; s < 4.0; s += 1.0) {
    vec2 off = (s < 0.5)  ? o0 :
               (s < 1.5)  ? o1 :
               (s < 2.5)  ? o2 : o3;
    vec2 p = c + off;

    // ONE shared shift projected onto each train so the lattice translates
    // rigidly; the per-voice phase drift (dph*) morphs it without detuning.
    float w0 = cos(dot(p, d0) * kf + dot(shift, d0) + dph0);
    float w1 = cos(dot(p, d1) * kf + dot(shift, d1) + dph1);
    float w2 = cos(dot(p, d2) * kf + dot(shift, d2) + dph2);
    float w3 = cos(dot(p, d3) * kf + dot(shift, d3) + dph3);
    float w4 = cos(dot(p, d4) * kf + dot(shift, d4) + dph4);

    // amplitude-weighted SUM: peaks where the loud voices crest together. Divided
    // by the running amplitude so the field stays in -1..1 as voices decay.
    float sumW = a0*w0 + a1*w1 + a2*w2 + a3*w3 + a4*w4;
    fAccum += sumW / max(norm, 0.001);

    // crest weighting per voice (rectified) so hue follows the constructive trains
    bb0 += a0 * max(w0, 0.0); bb1 += a1 * max(w1, 0.0); bb2 += a2 * max(w2, 0.0);
    bb3 += a3 * max(w3, 0.0); bb4 += a4 * max(w4, 0.0);
  }
  bb0 *= 0.25; bb1 *= 0.25; bb2 *= 0.25; bb3 *= 0.25; bb4 *= 0.25;

  // field is the anti-aliased mean of the five cosines, remapped to 0..1. The
  // QUASICRYSTAL reads when this field is shown as direct tone: bright plateaus
  // are constructive PENTAGONS, dark hollows the ten-pointed STARS between them,
  // interlocking into self-similar rosettes a hexagon or grid can never make.
  float field = fAccum * 0.25 * 0.5 + 0.5;       // 0..1, anti-aliased

  // CONTOUR-LINE rendering. Glowing the antinode cells gives a soft dot field
  // (the gallery has too many). Instead we draw the field's iso-contours: nested
  // rings around every extremum that interlock into the pentagon and ten-pointed
  // star TILING of the quasicrystal — luminous thread, not beads. Many thin
  // levels keep the lines crisp and the five-fold read unmistakable.
  float NLEV = 9.0;                                  // contour levels across 0..1
  float lev  = field * NLEV;
  float fr   = fract(lev);
  float dist = min(fr, 1.0 - fr);                    // 0 exactly on a contour line
  float lines = 1.0 - smoothstep(0.0, 0.22, dist);   // glowing iso-line thread
  lines = pow(lines, 0.7);                           // fatten and lift the thread
  // a faint plateau glow on the bright (constructive) side so the pentagons read
  // as lit tiles behind the thread instead of pure black
  float plateau  = smoothstep(0.58, 0.95, field);
  float peakSide = smoothstep(0.46, 0.54, field);    // 0 = hollow, 1 = antinode peak
  float arms = lines;                                // alias for compose below
  float cellGlow = plateau;
  float web  = lines;

  // hue blends the five trains by their LOCAL instantaneous contribution, gamma-
  // boosted so a momentarily dominant voice claims its colour clearly.
  float g0 = bb0*bb0, g1 = bb1*bb1, g2 = bb2*bb2, g3 = bb3*bb3, g4 = bb4*bb4;
  float gn = g0 + g1 + g2 + g3 + g4 + 1e-4;
  vec3 hue = (tc0*g0 + tc1*g1 + tc2*g2 + tc3*g3 + tc4*g4) / gn;

  // colour 3 appears only as a hot tint in the first moments after a strike
  hue = mix(hue, c3, clamp(hotAmp * 0.6, 0.0, 0.65));

  // the contour thread cycles continuously through the palette by FIELD LEVEL, so
  // each nested ring shimmers a different hue and the inflation of the tiling is
  // legible as a colour gradient; the per-voice blend warms the constructive side.
  float sLev = fract(field * 1.5) * 4.0;
  float lw0 = wheelW(sLev, 0.0), lw1 = wheelW(sLev, 1.0), lw2 = wheelW(sLev, 2.0), lw3 = wheelW(sLev, 3.0);
  vec3 levHue = (c0*lw0 + c1*lw1 + c2*lw2 + c3*lw3) / max(lw0+lw1+lw2+lw3, 0.001);
  vec3 cellHue = mix(levHue, hue, 0.4 * peakSide);

  // compose: dark base + the glowing decagonal contour thread, with a faint lit
  // plateau on the constructive tiles. Brightness tracks ring-down energy.
  float drive = mix(0.22, 1.0, energy);
  vec3 col = BG;
  col += cellHue * arms * 1.05 * drive;      // glowing pentagon/star thread
  col += hue * cellGlow * 0.30 * drive;      // faint lit constructive tiles

  // bloom on the brightest thread for a soft struck-metal shimmer
  float bloom = smoothstep(0.5, 1.0, lines * drive);
  col += cellHue * bloom * bloom * 0.40 * energy;

  // radial vignette: keep the rim dark, the struck centre luminous
  float vign = 1.0 - smoothstep(0.18, 1.02, length((fc - ctr) / res));
  col *= mix(0.32, 1.0, vign);

  // keep u_mouse referenced so the no-pointer face is the only face
  col += 0.0 * (u_mouse.x);

  gl_FragColor = vec4(col, 1.0);
}
