// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// spatter (Noir) — thrown paint on a dark wall. A dense, clumping field of
// irregular splats lands across the frame: each is a ragged-edged blob flanked by
// a spray of small satellite droplets and trailing a thin drip that runs downward,
// in a palette hue chosen by position. Splats flare bright on impact then settle
// into a long, slowly-fading stain, so many coexist at once and the surface reads
// as built-up paint texture rather than a few lonely dots. A low-frequency density
// field makes the paint clump heavier on one side (off-centre composition), with
// thinner scatter elsewhere. Overlapping per-cell clocks read as organic spatter,
// no global pulse, no visible reset.
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
uniform float u_splatRate;   // how fast new splats land across the field (default 1.4)
uniform float u_splatSize;   // splat radius in CSS px                    (default 17)
uniform float u_slide;       // drip run distance in CSS px               (default 30)
uniform float u_coverage;    // how dense the paint clumps, 0..1          (default 0.7)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float CELL_CSS  = 70.0;   // hash-cell pitch in CSS px (one splat lives per cell)
const float LIFE      = 7.5;    // seconds a splat lives (flare -> long fading stain)

// ---- hashes (no textures; cheap value noise) ----
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  hash22(vec2 p) {
  float n = dot(p, vec2(127.1, 311.7));
  return fract(sin(vec2(n, n + 74.7)) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// ragged splat distance: a lumpy blob stretched along a throw direction, its
// radius perturbed by low harmonics with per-splat random phases so it reads as
// an irregular torn paint blot — NOT a symmetric flower/star.
float splatDist(vec2 p, float rad, float seed, vec2 tdir) {
  // stretch along the throw direction (paint flies and elongates)
  float par  = dot(p, tdir);
  vec2  perp = p - tdir * par;
  vec2  pe   = tdir * (par * 0.62) + perp * 1.12;  // longer reach along throw
  float ang  = atan(pe.y, pe.x);
  float ph   = seed * 6.2831853;
  // asymmetric lumps: low frequencies with offset phases break N-fold symmetry
  float lump = 0.30 * sin(ang * 2.0 + ph)
             + 0.20 * sin(ang * 3.0 - ph * 2.3 + 1.1)
             + 0.13 * sin(ang * 5.0 + ph * 1.7)
             + 0.08 * sin(ang * 8.0 - ph * 0.7 + 2.0);
  float r = rad * (1.0 + lump);
  return length(pe) - r;
}

vec3 paletteAt(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  return c0 * wheelW(s, 0.0) + c1 * wheelW(s, 1.0)
       + c2 * wheelW(s, 2.0) + c3 * wheelW(s, 3.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // ---- palette fallback (headless can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float cell    = CELL_CSS * refScale * pr;
  float baseRad = max(u_splatSize, 0.5) * pr;  // guard: never 0
  float slide   = max(u_slide, 0.0) * pr;
  float cover   = clamp(u_coverage, 0.0, 1.0);

  // low-frequency density field: paint clumps heavier toward one off-centre lobe
  // (rule-of-thirds), thinner elsewhere. Uses aspect-correct UV so it's stable.
  vec2 uvc = (fc - ctr) / max(res.y, 1.0);
  float clump = vnoise(uvc * 2.3 + 11.0) * 0.6
              + 0.4 * exp(-length(uvc - vec2(0.28, 0.10)) * 1.6); // lobe ~⅓ right/up
  clump = clamp(clump + 0.22, 0.16, 1.0);

  // ---- transient splats: scan a 3x3 neighbourhood of hash cells ----
  vec2 baseCell = floor(fc / cell);
  vec3 accum = vec3(0.0);

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 cid = baseCell + vec2(float(ox), float(oy));

      float h0 = hash21(cid);
      float h1 = hash21(cid + 17.0);
      float h2 = hash21(cid + 41.0);

      // per-cell density gate: clump field × coverage decides whether this cell
      // ever paints. Heavier clump + higher coverage -> denser field.
      float cellClump = clamp(clump + (vnoise(cid * 0.5) - 0.5) * 0.5, 0.0, 1.0);
      float live = step(h0, mix(0.38, 1.0, cover) * (0.5 + 0.7 * cellClump));
      if (live < 0.5) continue;

      // randomized period: splats land faster as splatRate rises
      float period = mix(9.0, 2.2, clamp(u_splatRate / 3.0, 0.0, 1.0)) * (0.6 + 0.9 * h1);
      period = max(period, 0.5);
      float phase  = h2 * period;
      float tc     = mod(t + phase, period);
      float born   = step(tc, LIFE);
      float age    = clamp(tc / LIFE, 0.0, 1.0);

      float strike = floor((t + phase) / period);
      vec2  jit    = hash22(cid + strike * 7.0);
      vec2  impact = (cid + 0.15 + 0.7 * jit) * cell;
      float seed   = hash21(cid + strike * 3.0);

      // lifecycle: fast bright flare, relax to settled stain, very slow fade so
      // many stains coexist (the "built-up paint" read).
      float flare = exp(-age / 0.05);
      float relax = smoothstep(0.0, 0.14, age);
      float slideT = smoothstep(0.06, 0.55, age);
      float fade  = (1.0 - smoothstep(0.40, 1.0, age));

      // main splat centre drips slowly downward (y up in GL → subtract)
      float drop = slide * slideT;
      vec2  cen  = impact - vec2(0.0, drop);
      vec2  p    = fc - cen;

      float rad = baseRad * (0.7 + 0.6 * seed) * mix(1.25, 0.92, relax);
      // throw direction for this splat (paint elongates the way it was flung)
      vec2  tdir = normalize(hash22(cid + strike * 13.0) - 0.5 + 1e-4);
      float dJag = splatDist(p, rad, seed, tdir);
      float aa   = 1.6 * pr;
      float body = 1.0 - smoothstep(-aa, aa, dJag);
      float rim  = exp(-abs(dJag) / (2.2 * pr));

      // hue chosen by impact position
      float kk  = hash21(cid + 91.0) + seed * 0.15;
      vec3  hue = paletteAt(kk, c0, c1, c2, c3);

      // ---- satellite droplets: a spray of small dots flung around the splat ----
      float sat = 0.0;
      for (int k = 0; k < 5; k++) {
        float fk = float(k);
        vec2  dir = hash22(cid + strike * 11.0 + fk * 5.0) - 0.5;
        // bias the spray along the throw direction; cap reach inside the scan window
        dir = normalize(dir + tdir * 0.6 + 1e-4);
        float dist = min(rad * (1.5 + 2.0 * hash11(seed + fk)), cell * 1.2);
        vec2  sp   = impact + dir * dist - vec2(0.0, drop * 0.5);
        float sr   = rad * (0.10 + 0.22 * hash11(seed * 1.7 + fk));
        float dd   = length(fc - sp);
        sat += (1.0 - smoothstep(0.0, sr + aa, dd)) * (0.5 + 0.5 * hash11(fk + seed));
      }

      // ---- drip tail: thin streak from impact down to the dripped centre ----
      vec2  q     = fc - impact;
      float along = clamp(-q.y / max(drop, 1.0), 0.0, 1.0);
      float onSeg = step(0.0, -q.y) * step(-q.y, drop);
      float tailW = rad * 0.32;
      float tail  = exp(-(q.x * q.x) / (tailW * tailW)) * onSeg * (0.25 + 0.75 * along);

      float bright = born * fade;
      vec3  contrib = vec3(0.0);
      contrib += hue * body * (0.78 + 0.45 * flare) * bright;  // splat body (matte core)
      contrib += hue * rim  * 0.5 * bright;                    // torn rim
      contrib += hue * sat  * 0.7 * bright;                    // satellite spray
      contrib += hue * tail * 0.65 * relax * bright;           // drip
      // brief bright impact halo — kept tight so it never reaches past the
      // 3x3 cell-scan window (a wide halo would clip into square artifacts).
      contrib += hue * exp(-length(p) / (rad * 0.8)) * flare * 1.3 * bright;

      accum += contrib;
    }
  }

  col += accum;

  // gentle vignette: keep edges calm
  float vign = 1.0 - 0.28 * smoothstep(0.45, 1.25, length((fc - ctr) / res));
  col *= vign;

  // soft filmic-ish clamp so dense overlaps roll off instead of hard-clipping
  col = col / (col + vec3(0.9)) * 1.85;

  gl_FragColor = vec4(col, 1.0);
}
