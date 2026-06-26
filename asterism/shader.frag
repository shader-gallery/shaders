// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// asterism (Abyss) — a still star chart over true black. A sparse fixed scatter
// of faint hash stars holds a barely-perceptible shimmer; over it, constellations
// materialise: six-to-nine slightly brighter chart stars joined by thin glowing
// line segments that draw themselves in sequentially, segment by segment, like a
// pen tracing the figure. Each figure hashes a fresh position, layout and hue,
// draws, holds for a beat, then dissolves — while its successor is already being
// traced elsewhere, so figures overlap at opposite phases with no all-dark gap.
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
uniform float u_figurePeriod; // seconds per figure's draw-hold-fade life (default 16)
uniform float u_figureSize;   // figure radius in CSS px, scaled by u_pixelRatio (default 260)
uniform float u_lineWidth;    // connector line thickness in CSS px (default 1.25)

const vec3  BG       = vec3(0.011, 0.011, 0.016); // true-black void
const float TWO_PI   = 6.2831853;
const int   STARS    = 8;   // chart stars per figure (constant loop bound)
const int   SEGS      = 7;  // polyline segments per figure (STARS-1)
const int   BGSTARS   = 90; // background hash stars (constant loop bound)
const float RELAY     = 3.0; // overlapping figures running on offset phases

// hash helpers (no textures; integer-free value hashes)
float hash11(float n) { return fract(sin(n * 17.13) * 43758.5453123); }
vec2  hash21(float n) {
  return fract(sin(vec2(n * 17.13, n * 31.71)) * vec2(43758.5453, 22578.1459));
}

// distance from point p to segment a-b
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}
// fraction along a-b of the closest point (for sequential reveal)
float segParam(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
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

  float period = max(u_figurePeriod, 1.0);
  float figR   = max(u_figureSize, 20.0) * pr;
  float lw     = max(u_lineWidth, 0.2) * pr;
  float minRes = min(res.x, res.y);

  // palette with midnight fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 col = BG;

  // ---------------------------------------------------------------------------
  // Background chart stars: a fixed sparse scatter with a faint slow shimmer.
  // Positions are hash-fixed (no drift); only brightness breathes very slowly.
  // ---------------------------------------------------------------------------
  for (int i = 0; i < BGSTARS; i++) {
    float fi = float(i);
    vec2  sp = hash21(fi * 1.37 + 3.1);
    vec2  pos = sp * res;
    float d  = length(fc - pos);
    // per-star size + phase so the field isn't uniform
    float sz = (0.6 + 0.9 * hash11(fi * 2.7)) * pr;
    float shimmer = 0.72 + 0.28 * sin(t * (0.25 + 0.4 * hash11(fi * 5.1)) + fi);
    float core = exp(-d * d / (sz * sz * 2.0));
    float faint = 0.55 * exp(-d / (sz * 3.0));
    float bright = 0.22 + 0.30 * hash11(fi * 9.3);
    // tint background stars a cool palette mix (mostly c2/c0), kept dim
    vec3 stint = mix(c2, c0, hash11(fi * 4.2));
    col += stint * (core + faint) * bright * shimmer;
  }

  // ---------------------------------------------------------------------------
  // Constellation relay: RELAY figures on offset phases. Each figure cycle picks
  // a fresh seed (so position/layout/hue change every period), traces its
  // polyline segment-by-segment, holds, then fades. Phases are staggered so a new
  // figure is tracing while the previous one fades — they coexist, never all-dark.
  // ---------------------------------------------------------------------------
  for (int f = 0; f < 3; f++) {
    float ff = float(f);
    // staggered phase across the relay; each figure offset by period/RELAY
    float local = t / period + ff / RELAY;
    float cycle = floor(local);          // which figure this slot is showing now
    float ph    = fract(local);          // 0..1 progress through this figure's life

    // seed unique per (slot, cycle) so successive figures differ
    float seed = cycle * RELAY + ff + 7.0;

    // figure centre — hashed, kept inside frame with margin for the radius
    vec2  h  = hash21(seed * 1.91);
    float marginX = clamp(figR / max(res.x, 1.0), 0.12, 0.42);
    float marginY = clamp(figR / max(res.y, 1.0), 0.12, 0.42);
    vec2  fctr = vec2(
      mix(marginX, 1.0 - marginX, h.x),
      mix(marginY, 1.0 - marginY, h.y)) * res;

    // life envelope: draw (0..0.55) -> hold (0.55..0.75) -> fade (0.75..1.0)
    // drawn = how much of the polyline is revealed (0..1 across SEGS segments)
    float drawn = smoothstep(0.0, 0.55, ph) ;
    // overall figure opacity: rises with first stroke, holds, fades out smoothly
    float appear = smoothstep(0.0, 0.06, ph);
    float disappear = 1.0 - smoothstep(0.78, 1.0, ph);
    float figAlpha = appear * disappear;
    if (figAlpha <= 0.001) continue;

    // figure hue: one palette hue per figure, drawn from a hashed wheel position
    float hueS = fract(hash11(seed * 3.3) ) * 4.0;
    float w0 = wheelW(hueS, 0.0), w1 = wheelW(hueS, 1.0),
          w2 = wheelW(hueS, 2.0), w3 = wheelW(hueS, 3.0);
    vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) /
                max(w0 + w1 + w2 + w3, 0.001);
    // lift toward a brighter star-white so figures read as luminous, not muddy
    vec3  starCol = mix(hue, vec3(1.0), 0.35);

    // --- build star points: an irregular off-centre scatter inside radius figR
    // We compute all STARS points; store implicitly via re-hash inside loops.
    // distance fields accumulate into these:
    float lineGlow = 0.0;   // glowing connector lines
    float starGlow = 0.0;   // chart-star points
    float starHalo = 0.0;   // soft halos around stars

    // number of "active" stars 6..9 -> we always place STARS(8) but reveal order
    // is the natural index order; figure reads as 6-9 by varying segment reveal.

    // Star points form a meandering pen-walk: each star steps from the previous
    // by a hashed direction+length, so the figure is an irregular off-centre
    // polyline (a real asterism) rather than a radial/star-shaped tangle. The
    // walk is recomputed deterministically per fragment (no storage / arrays).
    vec2 prev = vec2(0.0);
    // starting point: offset from figure centre toward a hashed corner
    vec2 walkH0 = hash21(seed * 5.0 + 1.3);
    vec2 walk = (walkH0 - 0.5) * figR * 0.9; // current pen position rel. to fctr
    for (int s = 0; s < STARS; s++) {
      float fs = float(s);
      // step the pen to the next star (skip stepping for the first star)
      if (s > 0) {
        vec2  sh   = hash21(seed * 5.0 + fs * 13.7);
        float ang  = sh.x * TWO_PI;
        // step length 0.30..0.70 of figR — varied so the figure breathes
        float step = (0.30 + 0.40 * sh.y) * figR;
        walk += vec2(cos(ang), sin(ang)) * step;
        // gently pull the walk back toward centre so it stays in-frame & compact
        walk = mix(walk, walk * 0.55, 0.18 * length(walk) / max(figR, 1.0));
        // hard clamp the walk inside the figure radius
        float wl = length(walk);
        if (wl > figR) walk *= figR / wl;
      }
      vec2  pt = fctr + walk;

      // star point glow (chart stars slightly brighter than background)
      // reveal each star as the pen reaches it: star s appears at draw frac s/SEGS
      float starReveal = smoothstep(
        (fs - 1.0) / float(SEGS) - 0.02,
        (fs - 1.0) / float(SEGS) + 0.06,
        drawn);
      if (s == 0) starReveal = appear; // first star present from the start
      float dStar = length(fc - pt);
      float ssz   = 1.5 * pr;
      starGlow += exp(-dStar * dStar / (ssz * ssz * 2.0)) * starReveal;
      starHalo += exp(-dStar / (ssz * 4.5)) * starReveal;

      // polyline segment from prev->pt, drawn sequentially. Segment index = s-1.
      if (s > 0) {
        float segIdx = fs - 1.0;
        // this segment's reveal window in the global draw progress
        float a = segIdx / float(SEGS);
        float b = (segIdx + 1.0) / float(SEGS);
        // how far along THIS segment the pen has reached (0..1)
        float segDraw = clamp((drawn - a) / max(b - a, 1e-3), 0.0, 1.0);
        // distance to segment + the param of closest point along it
        float dSeg = sdSeg(fc, prev, pt);
        float u    = segParam(fc, prev, pt);
        // only light the part of the line the pen has already passed
        float revealed = step(u, segDraw + 0.001);
        // soft pen-tip leading edge so the stroke grows smoothly
        float tip = 1.0 - smoothstep(segDraw - 0.04, segDraw + 0.01, u);
        float drawnHere = max(revealed, tip * 0.0); // hard reveal w/ AA via stroke
        // anti-aliased line stroke
        float stroke = 1.0 - smoothstep(lw, lw + 1.6 * pr, dSeg);
        lineGlow += stroke * revealed;
      }
      prev = pt;
    }

    // soft bloom on the lines so the strokes glow rather than look like wires:
    // recompute a cheap nearest-segment bloom by reusing accumulated lineGlow.
    float lineBloom = lineGlow;

    // compose this figure (multiply by figAlpha for the fade life-cycle)
    col += starCol * lineGlow * 0.95 * figAlpha;
    col += hue     * lineBloom * 0.16 * figAlpha; // faint colored halo on lines
    col += starCol * starGlow * 1.25 * figAlpha;
    col += hue     * starHalo * 0.38 * figAlpha;
  }

  // gentle vignette to settle the frame and keep corners deep
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  // soft filmic-ish rolloff to tame any hot star cores
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
