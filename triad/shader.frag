// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// triad (Knell) — three standing plane-wave trains cross the frame at 120° and
// sum into a honeycomb of glowing antinode cells, a Faraday-wave hexagon lattice
// on a vibrating bronze pan. Nodal lines stay perfectly dark and fixed; antinode
// regions tremble with glow. A hash-scheduled strike floods all three trains;
// they ring down at clearly different rates, so the crisp hexagons melt through
// stripe-dominant interludes — when one train outlives the others the cells
// stretch into glowing rows — before settling to a faint residual lattice.
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
uniform float u_cellSize;    // CSS-px scale of the hexagonal cells   (default 48)
uniform float u_strikeGap;   // mean seconds between strikes          (default 11)
uniform float u_ringTime;    // seconds the trains take to ring down   (default 7)
uniform float u_skew;        // detune of one train -> moire drift     (default 0.04)

const vec3  BG    = vec3(0.035, 0.035, 0.043); // near-black bronze-dark base
const float TAU   = 6.2831853;
const float NSTR  = 12.0; // strikes we look back over (constant loop bound)

// small deterministic hash -> 0..1
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

// hash a strike index to a single shared 2D lattice shift (0..1 turns per axis).
// One shift for all three trains translates the WHOLE honeycomb rigidly, so the
// three antinode grids always co-register into a clean hexagonal lattice instead
// of beating against one another (the source of the vertical banding artifact).
vec2 strikeShift(float k) {
  return vec2(hash11(k + 1.7), hash11(k + 33.1));
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
  float gap    = max(u_strikeGap, 1.0);         // mean seconds between strikes
  float ring   = max(u_ringTime, 0.5);          // ring-down time constant

  // spatial frequency of each plane-wave train (radians per px)
  float kf = TAU / cell;

  // three unit directions 120° apart for the three trains, rotated ~15° off the
  // axes so the honeycomb's rows are not pixel-column-aligned. With the coherent
  // shared-shift lattice this is a clean rigid rotation (no inter-train beat),
  // and it keeps any faint residual structure from ever reading as vertical
  // banding against the frame.
  const float cR = 0.9659258, sR = 0.2588190;     // cos/sin(15°)
  vec2 d0 = vec2( cR, sR);
  vec2 d1 = vec2(-0.5 * cR - 0.8660254 * sR, -0.5 * sR + 0.8660254 * cR);
  vec2 d2 = vec2(-0.5 * cR + 0.8660254 * sR, -0.5 * sR - 0.8660254 * cR);

  // SKEW detunes train 0's wavelength, drifting the lattice into a slow moire
  // superlattice; at zero the three trains lock to a perfect honeycomb.
  float kf0 = kf * (1.0 + u_skew);

  // --- accumulate ring-down amplitude per train over recent strikes ---
  // A strike at index k happens at a hash-jittered time near k*gap. Each strike
  // floods all three trains; they decay exp(-dt*rate) with clearly different
  // rates so the hexagons melt mid-decay through stripe-dominant phases.
  float now  = t / gap;
  float base = floor(now);

  // per-train running amplitude, plus a single shared lattice-shift the whole
  // honeycomb currently rides (accumulated as a circular/complex mean per axis
  // so crossfading strikes reseat the lattice smoothly without snapping)
  vec3  amp   = vec3(0.0);
  vec2  shR   = vec2(0.0);   // amplitude-weighted shared shift (real, per axis)
  vec2  shI   = vec2(0.0);   // amplitude-weighted shared shift (imag, per axis)
  float hotAmp = 0.0;        // recency of the most recent strike, for c3 tint

  for (float i = 0.0; i < NSTR; i += 1.0) {
    float k    = base - i + 1.0;            // strike index (most recent first-ish)
    float jit  = (hash11(k + 5.0) - 0.5) * 0.7; // hash-jitter the strike time
    float tk   = (k + 0.5 + jit) * gap;     // absolute strike time in seconds
    float dt   = t - tk;                    // time since this strike
    if (dt < 0.0) continue;                 // strike is in the future

    // three clearly separated decay rates -> the fast train dies first, then the
    // middle, leaving the slow train ringing alone. A lone surviving train is a
    // single cos^2 => parallel glowing rows, so the honeycomb visibly melts into
    // stripes mid-decay before the slow train also fades to the residual.
    vec3 rate = vec3(0.40, 1.05, 2.40) / ring;
    vec3 env  = exp(-dt * rate);

    // sharp attack so each strike floods in over ~0.18s (crossfade-in)
    float att = smoothstep(0.0, 0.18, dt);
    env *= att;

    vec2 sh = strikeShift(k);

    // accumulate amplitude (per train, for differential decay) and the shared
    // lattice shift as a unit vector per axis. The shift weight uses the total
    // strike amplitude so the lattice reseats as one coherent honeycomb.
    amp  += env;
    float wt = env.x + env.y + env.z;
    shR  += wt * cos(sh * TAU);
    shI  += wt * sin(sh * TAU);

    // hottest just after the most recent struck moment
    hotAmp = max(hotAmp, exp(-dt * 3.5 / ring) * att);
  }

  // faint residual lattice so the pan stays readable at rest. Kept small so a
  // single surviving train can dominate mid-decay and render true stripes; the
  // residual only reasserts the balanced honeycomb once all trains have died.
  float residual = 0.045;
  vec3  ampR = amp + residual;
  // resolved shared lattice shift (radians) from the weighted unit-vector mean.
  // The same shift drives all three trains, so the honeycomb stays coherent.
  vec2 shift = atan(shI, shR + 1e-4);

  // overall ring-down energy: the pan glows brightest just after a strike and
  // sinks toward the dim residual between blows, so the whole frame breathes
  float norm   = ampR.x + ampR.y + ampR.z;
  float energy = clamp(norm * 0.55, 0.0, 1.0);

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // ---- supersampled standing-wave field -------------------------------------
  // The three trains' summed cos^2 carries low spatial-frequency beats (the
  // doubled wavevectors 2k, -k, -k along x differ, producing a real difference
  // frequency that read as vertical banding when sampled one-tap-per-pixel).
  // We average the field over a rotated 4-tap sub-pixel kernel: this anti-
  // aliases the cos terms so the beat no longer aliases into hard bright/dim
  // columns, and softens the dark nodal web from a mechanical grille into a
  // luminous trembling mesh. The per-train weights (for hue) are accumulated
  // the same way so colour stays consistent with the averaged field.
  vec2 c = fc - ctr;

  // rotated-grid 4-tap offsets in px (≈0.375 px) — kills the column moire
  vec2 o0 = vec2( 0.140,  0.347);
  vec2 o1 = vec2( 0.347, -0.140);
  vec2 o2 = vec2(-0.140, -0.347);
  vec2 o3 = vec2(-0.347,  0.140);

  vec3 wAccum = vec3(0.0);   // accumulated per-train cos^2 (for hue weighting)
  float fAccum = 0.0;        // accumulated normalised honeycomb field

  // unrolled 4-tap supersample (constant count, no dynamic indexing)
  for (float s = 0.0; s < 4.0; s += 1.0) {
    vec2 off = (s < 0.5)  ? o0 :
               (s < 1.5)  ? o1 :
               (s < 2.5)  ? o2 : o3;
    vec2 p = c + off;

    // ONE shared shift projected onto each train direction => the whole lattice
    // translates rigidly, antinode grids stay co-registered (no inter-train beat)
    float w0 = cos(dot(p, d0) * kf0 + dot(shift, d0));
    float w1 = cos(dot(p, d1) * kf  + dot(shift, d1));
    float w2 = cos(dot(p, d2) * kf  + dot(shift, d2));

    // square -> antinodes (|cos|=1) glow, nodes (cos=0) stay dark and fixed
    float a0 = ampR.x * w0 * w0;
    float a1 = ampR.y * w1 * w1;
    float a2 = ampR.z * w2 * w2;

    wAccum += vec3(a0, a1, a2);
    fAccum += (a0 + a1 + a2) / max(norm, 0.001);
  }
  wAccum *= 0.25;
  float field = fAccum * 0.25;                   // 0..1-ish, anti-aliased

  // sharpen the lattice but with generously soft edges so cells read as
  // luminous trembling glow rather than a crisp perforated grille
  float cellGlow = smoothstep(0.40, 0.96, field);
  float web      = smoothstep(0.12, 0.58, field); // soft fill between cells

  // hue blends the three trains by their LOCAL instantaneous contribution: each
  // train owns one palette colour, so stripe-dominant phases tint toward that
  // train's hue while balanced hexagons read as a blend. The per-train weight is
  // gamma-boosted so a momentarily dominant train clearly claims its colour
  // rather than everything averaging to a neutral wash.
  float b0 = max(wAccum.x, 0.0), b1 = max(wAccum.y, 0.0), b2 = max(wAccum.z, 0.0);
  b0 *= b0; b1 *= b1; b2 *= b2;
  float bn = b0 + b1 + b2 + 1e-4;
  vec3 hue = (c0 * b0 + c1 * b1 + c2 * b2) / bn;

  // colour 3 appears only as a hot tint in the first moments after a strike
  hue = mix(hue, c3, clamp(hotAmp * 0.65, 0.0, 0.7));

  // compose: dark base + glowing antinode cells + a soft inter-cell fill so the
  // lattice never reads as isolated dots. Brightness tracks ring-down energy so
  // the lattice flares on a strike and recedes to a faint residual between blows.
  float drive = mix(0.22, 1.0, energy);
  vec3 col = BG;
  col += hue * cellGlow * 0.72 * drive;
  col += hue * web * 0.16 * drive;

  // bloom on the brightest cores for a soft struck-metal shimmer; wider, gentler
  // falloff so glow bleeds organically across the dark web instead of stamping
  // hard-edged dots
  float bloom = smoothstep(0.58, 1.0, field);
  col += hue * bloom * bloom * 0.42 * energy;

  // radial vignette: keep the rim dark, the struck centre luminous
  float vign = 1.0 - smoothstep(0.18, 1.02, length((fc - ctr) / res));
  col *= mix(0.32, 1.0, vign);

  // optional pointer warmth is intentionally omitted (no mouse param needed);
  // keep u_mouse referenced so the contract's no-pointer face is the only face
  col += 0.0 * (u_mouse.x);

  gl_FragColor = vec4(col, 1.0);
}
