// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// radar (Trace) — a bearing/time radar WATERFALL, not a dial. The frame is the
// scope's recorded history: the newest return is written along the top edge and
// the whole record feeds slowly downward like paper through a chart recorder.
// Each row is a mostly-dark scan line salted with faint clutter and a few bright
// returns; as rows age and sink they cool through the palette and soften, so
// persistent contacts stack into wandering luminous streaks that snake down the
// frame while clutter dissolves into grain. Hair-thin vertical bearing rulings
// and a slightly brighter live writing line at the top finish the instrument.
// There is no dial, no centre, and nothing rotates.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four phosphor colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_feedSpeed;   // record scroll rate, fractions of frame/sec-ish (default 0.7)
uniform float u_persist;     // how far down streaks survive before fading       (default 0.5)
uniform float u_blip;        // contact return width in CSS px                   (default 8)
uniform float u_ruling;      // CSS px between vertical bearing rulings          (default 110)

const vec3  BG       = vec3(0.030, 0.032, 0.040); // near-black phosphor base
const float TWO_PI   = 6.28318530718;
const float NCONTACT = 7.0;   // number of tracked persistent contacts (const loop bound)

// cheap hash helpers (no textures allowed)
float hash11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.7, 289.13))) * 43758.5453); }

// cyclic triangular palette weight on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalised coords: x across bearing 0..1, y up. We INVERT y so age grows
  // downward — newest at the top edge, oldest at the bottom.
  float nx  = fc.x / max(res.x, 1.0);
  float topY = (res.y - fc.y) / max(res.y, 1.0); // 0 at very top, 1 at bottom

  // Palette with house fallback.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- chart-feed scroll -------------------------------------------------
  // A row's "age" (seconds since it was written) is its distance below the top
  // edge converted to time by the feed speed. The record height in seconds is
  // res.y / feedPxPerSec; we work in normalised topY and add a scrolling phase
  // so the pattern transports downward continuously and seamlessly.
  float feed = max(u_feedSpeed, 0.001);
  // scroll phase in "frame-heights": ~one frame height per (1/feed) seconds,
  // so feed=1 -> a full frame in ~16s region of detail; tuned for a slow feel.
  float scroll = t * feed * 0.16;
  // the world-row coordinate: increases downward, drifts upward over time so the
  // content marches down the screen. Scaled so rows are reasonably dense.
  float rowCoord = topY + scroll;     // continuous, unbounded, no seam

  vec3 col = BG;

  // --- vertical bearing rulings -----------------------------------------
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float ruleGap = max(u_ruling, 8.0) * refScale * pr;          // css px -> device px
  // distance (in device px) to the nearest ruling, for a DPR-stable hairline
  float ruleD   = abs(fract(fc.x / ruleGap + 0.5) - 0.5) * ruleGap;
  float ruleLine = 1.0 - smoothstep(0.0, 0.9 * pr, ruleD); // hair-thin, AA'd
  // a faint glow shoulder so the graticule reads even through the clutter
  float ruleHalo = exp(-ruleD * ruleD / (ruleGap * ruleGap * 0.0009));
  // rulings glow faintly and fade slightly toward the bottom (older record)
  float ruleFade = mix(1.0, 0.55, topY);
  vec3  ruleCol  = mix(c2, c0, 0.25);
  col += ruleCol * (ruleLine * 0.42 + ruleHalo * 0.08) * ruleFade;

  // --- clutter / grain salted along each row ----------------------------
  // Quantise to row "cells" that scroll downward with the record so grain
  // transports with the paper rather than shimmering in place.
  float rowH    = 0.0065;                              // row thickness in topY units
  float rowIdx  = floor(rowCoord / rowH);              // which written row
  float colCells = 150.0;
  float cx      = floor(nx * colCells);
  float cellN   = hash21(vec2(cx, rowIdx));            // static per written cell
  // faint clutter: low-amplitude speckle, denser near the write line
  float clutter = pow(cellN, 5.0);                     // mostly dark, rare sparks
  // clutter dissolves into grain with depth, but never fully vanishes so the
  // whole record carries faint texture rather than leaving a dead lower half.
  float clAge   = smoothstep(0.0, mix(0.30, 1.05, u_persist), topY); // fade w/ depth
  float clutBright = clutter * (1.0 - clAge * 0.82) * 0.30;
  // colour clutter cool-greenish from palette c2
  col += c2 * clutBright;

  // --- persistent contacts: bright returns that weave as they descend ----
  // Each contact is written continuously at the top at a slowly-drifting bearing;
  // because we evaluate its bearing at the row's AGE, older rows show where it
  // was then — producing a snaking luminous streak down the frame.
  float blipW = max(u_blip, 1.0) * pr;                 // css px -> device px
  float blipHalf = blipW * 0.5;

  float persist = clamp(u_persist, 0.05, 1.0);

  vec3 contactGlow = vec3(0.0);

  for (float i = 0.0; i < NCONTACT; i += 1.0) {
    float seed = i + 1.0;
    // base bearing for this contact, spread across the frame
    float base = hash11(seed * 3.17);
    // each contact has its own slow drift rate & phase -> weaving
    float driftAmp  = mix(0.04, 0.16, hash11(seed * 7.91));
    float driftRate = mix(0.05, 0.22, hash11(seed * 5.33));
    float driftPh   = hash11(seed * 2.13) * TWO_PI;
    // a second harmonic so the snake isn't a pure sine
    float drift2Amp = driftAmp * 0.4;
    float drift2Rate = driftRate * 2.3;

    // "absolute time" coordinate of the row this pixel belongs to: rows older
    // (further down) were written earlier. Convert topY back into a time offset.
    // Larger topY -> older -> earlier write time. rowCoord already carries the
    // scroll, so use rowCoord as a continuous time-like axis for the bearing.
    float tau = rowCoord;
    float bearing = base
      + driftAmp  * sin(tau * driftRate  * TWO_PI + driftPh)
      + drift2Amp * sin(tau * drift2Rate * TWO_PI + driftPh * 1.7);
    bearing = fract(bearing); // keep on screen, wraps seamlessly w/ palette blend

    // distance from this pixel's bearing to the contact's bearing (wrapped)
    float dxb = abs(nx - bearing);
    dxb = min(dxb, 1.0 - dxb);
    float dpx = dxb * res.x;                 // device px across

    // contact intensity: bright ridge of width blipW, soft shoulders
    float core = 1.0 - smoothstep(0.0, blipHalf, dpx);
    float halo = exp(-dpx * dpx / (blipW * blipW * 2.2));

    // some contacts are intermittent (drop in/out) so the record breathes
    float gate = 0.55 + 0.45 * sin(tau * mix(0.3, 1.1, hash11(seed*11.7)) * TWO_PI
                                   + hash11(seed*4.4) * TWO_PI);
    gate = smoothstep(0.15, 0.6, gate);

    // persistence fade with depth: bright near the write line, surviving deeper
    // as u_persist rises. At min, contacts live only near the top; at max their
    // trails reach nearly the bottom edge.
    float survive = exp(-topY / (persist * 1.05 + 0.04));
    float strength = (core * 0.9 + halo * 0.5) * gate * survive;

    // per-contact colour drawn from the palette wheel, drifting with bearing+age
    float s  = fract(base * 1.0 + bearing * 0.7 + topY * 0.5) * 4.0;
    float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
    vec3  cc = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

    contactGlow += cc * strength;
  }
  col += contactGlow * 1.15;

  // --- live writing line along the very top -----------------------------
  // a slightly brighter band at the newest edge, with a moving phosphor write
  // head sweeping across it so it reads as "currently recording".
  float writeBand = smoothstep(0.06, 0.0, topY);       // bright at the top edge
  float head = fract(nx - t * 0.18);                   // sweeping head position
  float headGlow = exp(-head * head * 60.0) + exp(-(1.0-head)*(1.0-head)*60.0);
  vec3 writeCol = mix(c2, c0, 0.4);
  col += writeCol * writeBand * 0.16;
  col += writeCol * writeBand * headGlow * 0.30;

  // a faint scanline texture on the writing edge to sell "fresh ink"
  float ink = 0.5 + 0.5 * sin(topY * res.y / pr * 0.9);
  col += writeCol * writeBand * ink * 0.03;

  // --- overall phosphor cool-down toward the bottom & side vignette ------
  // record dims as it ages downward; gentle left/right vignette frames it.
  float ageDim = mix(1.0, 0.78, smoothstep(0.0, 1.0, topY));
  col *= ageDim;
  float sideV = smoothstep(0.0, 0.12, nx) * smoothstep(0.0, 0.12, 1.0 - nx);
  col *= mix(0.7, 1.0, sideV);

  // soft phosphor bloom lift so accents glow rather than clip
  col += pow(max(col - 0.0, 0.0), vec3(1.6)) * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
