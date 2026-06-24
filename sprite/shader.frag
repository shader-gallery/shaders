// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// sprite (Omen) — upper-atmosphere red sprites over a night horizon. Clusters of
// thin wavering tendrils flash down from the top edge and branch as they fall —
// but every flash leaves a diffuse glowing HEAD that lingers and slowly fades, so
// the sky is never fully dark: a recently-fired column keeps a soft violet/rose
// plume long after its sharp filaments have gone. Several slots overlap, staggered
// in time, so at any instant something is igniting while something else cools. A
// faint banded airglow holds the rest of the frame alive. Episodic and structural
// — never the continuous rain of starfall, never horror: the occult as composure.
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
uniform float u_episodeRate; // how often clusters fire, 0.1..1     (default 0.55)
uniform float u_afterglow;   // how long/strong the fading head lingers, 0..1 (default 0.6)
uniform float u_reach;       // streamer reach down from top, css px (default 320)
uniform float u_tendrils;    // tendril count + branching, 0.2..1    (default 0.6)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float SLOTS    = 6.0;   // independent cluster slots (const loop bound)
const float PERIOD   = 7.0;   // base seconds per slot episode cycle

// cheap hash helpers -------------------------------------------------------
float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// smooth value noise on a 1D coordinate (for tendril waver) ---------------
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x in [0,aspect], y in [0,1] with y=1 at the TOP edge
  float aspect = res.x / max(res.y, 1.0);
  vec2  uv = fc / max(res.y, 1.0);          // y: 0 bottom .. 1 top
  float yTop = 1.0 - uv.y;                    // 0 at top edge .. 1 at bottom

  // --- palette fallback (headless contexts can leave the array zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // violet / rose anchors for the streamers (from the palette). c1 reads as the
  // palette's violet, c3 as its rose; c2 lends a cool top-tip shimmer.
  vec3 violet = c1;
  vec3 rose   = c3;
  vec3 tipCol = mix(c1, c2, 0.45);

  vec3 col = BG;

  // --- airglow so the black always stays alive ------------------------------
  // upper band of cool violet ionization (where sprites live) + a faint warm
  // horizon hug at the bottom, both gently shimmering. Stronger than v1 so the
  // frame reads as a luminous night sky, not a black void waiting for an event.
  float upper = exp(-yTop * 2.3);
  float shA = 0.5 + 0.5 * sin(uv.x * 1.7 + t * 0.13);
  float shB = 0.5 + 0.5 * sin(uv.x * 3.9 - t * 0.21 + 1.7);
  col += mix(violet, tipCol, 0.4) * upper * (0.055 + 0.030 * shA);
  col += mix(c2, c0, 0.5) * exp(-uv.y * 3.0) * 0.075 * (0.7 + 0.3 * shB);
  // distant storm-horizon glow band + a faint continuous ionized sky so the lower
  // two-thirds reads as luminous atmosphere rather than empty void (in-shader fill
  // replacing the backdrop).
  float horizonB = exp(-pow((uv.y - 0.11) / 0.085, 2.0));
  col += mix(rose, violet, 0.45) * horizonB * 0.060 * (0.7 + 0.3 * shA);
  col += mix(violet, c2, 0.55) * (0.016 + 0.014 * shB) * (1.0 - 0.55 * uv.y);

  // reach of streamers in normalized-y units (css px / buffer height)
  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float reachN = clamp(u_reach * pr / max(res.y, 1.0), 0.04, 1.2);

  // tendril controls: more u_tendrils -> more threads + more forking
  float fanWidth = mix(0.04, 0.17, u_tendrils);   // horizontal spread of a fan
  float threadDensity = mix(2.0, 6.0, u_tendrils); // threads packed across a fan
  float branchAmt = clamp(u_tendrils, 0.0, 1.0);   // how strong the fork is

  // afterglow strength + persistence (fraction of the cycle the head keeps glowing)
  float agAmt = clamp(u_afterglow, 0.0, 1.0);

  // accumulate streamer light over the cluster slots
  vec3 streamer = vec3(0.0);
  vec3 afterCol = vec3(0.0);

  for (float si = 0.0; si < SLOTS; si += 1.0) {
    // each slot has its own staggered cycle + horizontal home position. Slots
    // are phase-spread evenly (si/SLOTS) plus a hash jitter so coverage is even
    // and the sky always has overlapping activity, yet never reads as a pattern.
    float seed   = si + 1.0;
    float phase  = si / SLOTS + hash11(seed * 3.17) * 0.16;
    // episode rate compresses/stretches the gap between firings.
    float cycle  = PERIOD * mix(1.35, 0.6, u_episodeRate);
    float life   = mix(2.4, 3.4, hash11(seed * 7.7)); // seconds a cluster burns
    float lt     = mod(t + phase * cycle, cycle);      // local time in cycle
    // sharp-flash envelope: quick rise, hold, fade — the visible tendrils
    float flash = smoothstep(0.0, 0.35, lt) * (1.0 - smoothstep(life - 0.8, life, lt));
    // afterglow envelope: rises with the flash, then decays slowly across the
    // rest of the cycle (the diffuse head lingers). Persistence (agAmt) sets the
    // decay length so a recently-fired column never snaps to black.
    float tau   = mix(1.2, cycle * 0.85, agAmt);
    float after = exp(-max(lt - 0.5, 0.0) / max(tau, 0.2)) * smoothstep(0.0, 0.4, lt);
    // tiny re-randomization per episode so successive firings differ
    float epId = floor((t + phase * cycle) / cycle);

    // horizontal home of this cluster, re-rolled each episode
    float hx = hash21(vec2(seed, epId));
    float cx = (0.12 + 0.76 * hx) * aspect;     // keep clusters off the edges
    // this cluster's own reach + a downward elongation that grows over its life
    float grow = smoothstep(0.0, 0.7, lt / life); // elongates downward in time
    float clReach = reachN * mix(0.8, 1.1, hash11(epId + seed));

    // distance from the fan's vertical axis (with slow waver of the whole fan)
    float fanWave = (vnoise(yTop * 5.0 + epId * 2.0 + seed) - 0.5) * fanWidth * 0.9;
    float dxFan = (uv.x - (cx + fanWave * yTop));

    // ---- diffuse afterglow HEAD: a soft vertical plume centred on the column,
    // brightest near the top and dissolving downward. No sharp structure — this
    // is the lingering ionization that keeps the column lit between flashes. ----
    float headW = fanWidth * (1.3 + 0.7 * agAmt);
    float headX = exp(-(dxFan * dxFan) / (headW * headW));
    float headV = exp(-yTop / max(clReach * 0.85, 1e-3)) * smoothstep(1.1, 0.2, yTop / max(clReach, 1e-3));
    vec3 headTint = mix(violet, rose, smoothstep(0.0, 1.0, yTop / max(clReach, 1e-3)));
    afterCol += headTint * headX * headV * after * (0.5 + 0.5 * flash);

    if (flash <= 0.003) continue;

    // build a few thin tendrils across the fan. Const loop bound; threadDensity
    // gates how many actually light up so the param reads as count.
    float lum  = 0.0;
    float halo = 0.0;
    for (float ti = 0.0; ti < 6.0; ti += 1.0) {
      float on = smoothstep(threadDensity + 0.5, threadDensity - 0.5, ti);
      if (on <= 0.001) continue;
      float spread = (ti / 5.0 - 0.5) * 2.0;        // -1..1
      float baseX  = spread * fanWidth;
      // branching: as the tendril descends it forks, the offset growing with yTop
      float fork   = baseX * (1.0 + branchAmt * 1.3 * yTop);
      float wav = (vnoise(yTop * 7.0 + ti * 4.0 + epId * 3.0 + seed) - 0.5);
      float xoff = fork + wav * fanWidth * 0.6;
      // a secondary branch that splits off lower down
      float xoff2 = fork * (1.0 - 0.8 * yTop) + (wav + 0.18) * fanWidth * 0.5;

      float d1 = abs(dxFan - xoff);
      float d2 = abs(dxFan - xoff2);
      float halfw = (0.0018 + 0.0011 * yTop) * (1.0 + 0.4 / max(threadDensity, 1.0));
      float thr1 = exp(-(d1 * d1) / (halfw * halfw));
      float thr2 = branchAmt * 0.7 * exp(-(d2 * d2) / (halfw * halfw));
      lum += on * (thr1 + thr2);
      float hw = halfw * 6.5;
      halo += on * (exp(-(d1 * d1) / (hw * hw)) + thr2 * exp(-(d2 * d2) / (hw * hw)));
    }

    // vertical profile: streamers brightest at top, dissolving toward clReach.
    float depth = yTop / max(clReach, 1e-3);        // 0 top .. 1 at full reach
    float lenGate = smoothstep(grow + 0.18, grow - 0.02, depth);
    float vert = lenGate * (1.0 - smoothstep(0.0, 1.0, depth));
    vert *= vert;
    vert *= smoothstep(1.15, 0.6, depth);

    // colour blends cool tip (top) -> violet -> rose (bottom) along the strand
    vec3 strandCol = mix(tipCol, mix(violet, rose, clamp(depth * 1.3, 0.0, 1.0)),
                         smoothstep(0.0, 0.22, depth));

    streamer += strandCol * lum * vert * flash;
    streamer += mix(tipCol, strandCol, 0.5) * halo * 0.24 * vert * flash;
  }

  // composite: bright tendrils + the lingering diffuse heads
  col += streamer * 1.6;
  col += afterCol * 0.85;

  // very mild vignette to compose the framing without killing the corners
  vec2 q = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.55, 1.15, length(q) * 1.6);
  col *= mix(0.84, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
