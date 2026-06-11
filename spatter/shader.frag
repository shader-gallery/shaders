// spatter (Noir) — near-black wet glass, almost empty. At hash-timed instants a
// raindrop strikes the pane: a tiny asymmetric SDF splat with angular noise
// spikes flares softly in a palette hue chosen by position, then relaxes into a
// single bead that slides a short way down and fades out. Beneath it a scatter of
// faint persistent specks of old rain gives the darkness a quiet texture. No
// global pulse, no visible reset — overlapping per-cell clocks read as sparse
// percussion.
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
uniform float u_splatRate;   // avg rain-strike frequency across the pane (default 1)
uniform float u_splatSize;    // splat/bead radius in CSS px            (default 10)
uniform float u_slide;        // bead slide distance in CSS px          (default 22)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float CELL_CSS  = 120.0;  // hash-cell pitch in CSS px (one impact lives per cell at a time)
const float LIFE      = 2.0;    // seconds an impact lives (flare->bead->slide->fade)

// ---- hashes (no textures; cheap value noise) ----
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  hash22(vec2 p) {
  float n = dot(p, vec2(127.1, 311.7));
  return fract(sin(vec2(n, n + 74.7)) * 43758.5453123);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// asymmetric splat distance: a small blob whose radius wobbles with angle via
// a couple of hashed harmonics, giving angular noise spikes around the rim.
float splatDist(vec2 p, float rad, float seed) {
  float ang = atan(p.y, p.x);
  float spikes = 0.20 * sin(ang * 5.0 + seed * 6.2831853)
               + 0.13 * sin(ang * 9.0 - seed * 11.0)
               + 0.08 * sin(ang * 3.0 + seed * 3.0);
  float r = rad * (1.0 + spikes);
  return length(p) - r;
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

  float cell    = CELL_CSS * pr;
  float baseRad = max(u_splatSize, 0.5) * pr;  // guard: never 0
  float slide   = max(u_slide, 0.0) * pr;

  // ---- faint persistent specks of old rain (quiet darkness texture) ----
  // a sparse, very faint static stipple — single dim points, position-tinted.
  // Sized in CSS px and gated hard so the darkness reads textured, not dotted.
  {
    float pitch = 13.0 * pr;
    vec2 sc   = floor(fc / pitch);
    vec2 j    = hash22(sc);
    vec2 sp   = (sc + j) * pitch;
    float dsp = length(fc - sp);
    // only ~1 in 6 cells carries a speck; sub-pixel-soft point
    float on    = step(0.83, hash21(sc + 3.3));
    float speck = (1.0 - smoothstep(0.0, 1.1 * pr, dsp)) * on;
    float kk = hash21(sc) * 4.0;
    vec3 stip = (c0 * wheelW(kk,0.0) + c1 * wheelW(kk,1.0)
              +  c2 * wheelW(kk,2.0) + c3 * wheelW(kk,3.0));
    col += stip * speck * 0.10;
  }

  // ---- transient impacts: scan a 3x3 neighbourhood of hash cells ----
  // Each cell fires impacts on its own clock with a hash-randomized period, so
  // events overlap as sparse percussion with no global pulse. Neighbour scan
  // lets a splat/bead overhang into adjacent cells.
  vec2 baseCell = floor(fc / cell);
  vec3 accum = vec3(0.0);

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 cid = baseCell + vec2(float(ox), float(oy));

      // per-cell clock: period shrinks as splatRate rises so the patter thickens
      float h0   = hash21(cid);
      float h1   = hash21(cid + 17.0);
      float h2   = hash21(cid + 41.0);
      // randomized period in seconds (longer when rate is low)
      float period = mix(7.0, 1.6, clamp(u_splatRate / 3.0, 0.0, 1.0))
                   * (0.6 + 0.9 * h0);
      period = max(period, 0.35);
      float phase  = h1 * period;            // de-sync cells
      float tc     = mod(t + phase, period); // time since this cell's last strike
      // only the freshest LIFE seconds of the cycle host a visible impact
      float born   = step(tc, LIFE);
      float age    = clamp(tc / LIFE, 0.0, 1.0); // 0..1 across the impact's life

      // impact location within the cell (randomized, stable per strike index)
      float strike = floor((t + phase) / period);
      vec2  jit    = hash22(cid + strike * 7.0);
      vec2  impact = (cid + 0.2 + 0.6 * jit) * cell;

      // ---- lifecycle envelopes ----
      // flare: a fast bright spike in the first ~150ms (0.075 of a 2s life)
      float flare = exp(-age / 0.075);
      // relax: splat collapses from jagged blob toward a round bead
      float relax = smoothstep(0.0, 0.18, age);
      // slide: bead drifts down after it has formed, completing most of its
      // travel while still bright so the displacement (and tail) read clearly.
      float slideT = smoothstep(0.10, 0.42, age);
      // fade: gentle out over the back half
      float fade  = (1.0 - smoothstep(0.45, 1.0, age));

      // current centre: starts at impact, slides downward (y down on screen)
      float drop = slide * slideT;
      vec2 cen = impact - vec2(0.0, drop);
      vec2 p   = fc - cen;

      // wet running tail left behind as the bead slides: a thin vertical streak
      // from the impact point down to the bead's current centre. Length grows
      // with how far it has slid, so high slide leaves visible running tails and
      // slide=0 leaves none.
      vec2  q     = fc - impact;                       // relative to landing spot
      float along = clamp(-q.y / max(drop, 1.0), 0.0, 1.0); // 0 at impact .. 1 at bead
      float onSeg = step(0.0, -q.y) * step(-q.y, drop);     // within the streak span
      float tailW = baseRad * 0.55;
      float tail  = exp(-(q.x * q.x) / (tailW * tailW)) * onSeg
                  * (0.20 + 0.80 * along);             // brighter toward the bead

      // splat geometry: starts a bit larger & jagged, settles to a round bead.
      float rad = baseRad * mix(1.35, 0.85, relax);
      float seed = h2;
      // blend jagged splat -> clean circle as it relaxes
      float dJag = splatDist(p, rad, seed);
      float dRnd = length(p) - rad;
      float d    = mix(dJag, dRnd, relax);

      // soft anti-aliased fill + a crisper rim glow
      float aa   = 1.6 * pr;
      float body = 1.0 - smoothstep(-aa, aa, d);          // filled blob
      float rim  = exp(-abs(d) / (1.8 * pr));             // bright edge
      // tiny crescent glint near the top-left of the bead
      vec2 g     = p + vec2(rad * 0.32, rad * 0.32);
      float glint = exp(-dot(g, g) / (rad * rad * 0.10)) * relax;

      // hue chosen by impact position (so different spots flash different hues)
      float kk = (hash21(cid + 91.0)) * 4.0;
      vec3 hue = (c0 * wheelW(kk,0.0) + c1 * wheelW(kk,1.0)
               +  c2 * wheelW(kk,2.0) + c3 * wheelW(kk,3.0));

      float bright = born * fade;
      // flare dominates early (bright, soft, large halo); bead glow lingers
      float halo  = exp(-length(p) / (rad * 1.7));
      vec3 contrib = vec3(0.0);
      contrib += hue * body * 0.55 * bright;              // bead body
      contrib += hue * rim  * 0.85 * bright;              // rim
      contrib += hue * halo * (0.35 + 1.6 * flare) * bright; // flare halo
      contrib += hue * tail * 0.70 * relax * bright;      // wet running tail
      contrib += vec3(1.0)  * glint * 0.5 * bright;       // white glint

      accum += contrib;
    }
  }

  col += accum;

  // gentle vignette: keep edges calm, centre slightly more present
  float vign = 1.0 - 0.45 * smoothstep(0.35, 1.15, length((fc - ctr) / res));
  col *= vign;

  // soft filmic-ish clamp so bright flares roll off instead of hard-clipping
  col = col / (col + vec3(0.85)) * 1.85;

  gl_FragColor = vec4(col, 1.0);
}
