// lure (Bloom) — a rare-event piece. Near-total darkness: a faint deep-water
// gradient and sparse marine snow sinking straight down (indifferent to
// everything). On a long event cycle a whale-scale deep-sea silhouette reveals
// itself — drawn only by rows of photophores. The anglerfish lure bulb at the
// head ignites first, then ignition spreads tail-ward along the dotted rows
// until a frame-wide outlined body reads as one creature; it glides a quarter
// of the frame as shimmer ripples roll along the rows, then extinguishes
// tail-to-nose and sinks back into black. Every phase is a function of one
// wrapped event time, so it loops phase-continuously.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_eventPeriod;  // seconds of the full dark-to-dark cycle (default 60)
uniform float u_bodySpan;     // nose-to-tail silhouette length, css px   (default 700)
uniform float u_shimmer;      // twinkle amplitude of the lit rows        (default 0.8)

const vec3  BG     = vec3(0.035, 0.035, 0.043);  // near-black base ~#09090B
const float PI     = 3.14159265;
const float TAU    = 6.28318531;
const int   NDOTS  = 130;   // photophores tracing the outline (const loop bound)

// hash helpers (no textures available)
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec2  h21(float n) {
  return fract(sin(vec2(n * 127.1, n * 311.7)) * 43758.5453);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// smooth pulse that rises then falls, peaking near x=1, zero outside [0,2]
float bump(float x) {
  return smoothstep(0.0, 1.0, x) * smoothstep(2.0, 1.0, x);
}

void main() {
  float pr  = max(u_pixelRatio, 0.001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: y up, centred, scaled so 1.0 ~ half-height (keep aspect)
  vec2  uv  = (fc - 0.5 * res) / res.y;

  // ---- palette + fallback (headless can leave the array zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // cool palette blues/teals lead for the photophores
  vec3 coolA = c0;            // blue
  vec3 coolB = c2;            // teal
  vec3 lureHue = mix(c2, c3, 0.35); // lure bulb a touch warmer/distinct

  // ---- faint deep-water vertical gradient base ----
  vec3 col = BG;
  float depth = clamp(0.5 - uv.y * 0.5, 0.0, 1.0);           // darker toward bottom
  col += mix(vec3(0.010,0.018,0.030), vec3(0.0), depth) * 0.9;
  // a barely-there volumetric glow drift so the empty water isn't a flat panel
  float haze = 0.5 + 0.5 * sin(uv.x * 1.7 + t * 0.05) * cos(uv.y * 1.3 - t * 0.037);
  col += coolA * 0.010 * haze;

  // ---- marine snow: sparse motes sinking straight down, react to nothing ----
  // layered cells; each cell carries one mote falling at constant speed.
  for (int i = 0; i < 3; i++) {
    float fi    = float(i);
    float cols  = 7.0 + fi * 3.0;            // density per layer
    float speed = (0.018 + fi * 0.010);      // sink speed (screen units / s)
    float sz    = (1.1 + fi * 0.6) * pr;     // mote radius in px
    // map uv.x into column lanes
    float lane  = uv.x * cols;
    float li    = floor(lane);
    float lx    = fract(lane) - 0.5;
    float seed  = li * 13.0 + fi * 71.0;
    vec2  rnd   = h21(seed);
    // vertical position wraps; straight-down only
    float fall  = fract(rnd.y + t * speed * (0.7 + rnd.x * 0.6));
    float py    = 0.6 - fall * 1.2;           // travels top->bottom
    float jitterx = (rnd.x - 0.5) * 0.7 / cols;
    vec2  mp    = vec2(lx / cols + jitterx, uv.y - py);
    float d     = length(mp * res.y);         // back to px
    float mote  = exp(-d * d / (sz * sz * 1.6));
    float tw    = 0.6 + 0.4 * sin(seed + t * 0.9);
    col += vec3(0.42, 0.50, 0.58) * mote * 0.10 * tw;
  }

  // ================= the deep-sea creature (rare event) =================
  // One wrapped event time in [0,1). All phases are functions of `ev`.
  float period = max(u_eventPeriod, 1.0);
  float ev = fract(t / period);

  // body half-length in screen units (px / res.y). The outline x spans
  // roughly [-1,1] in body-units, so halfLen is the nose-to-centre reach.
  // Scaled down so the default (700css) reads as "spans more than half the
  // frame" without spilling off every edge; clamped so extremes stay framed.
  float halfLen = clamp((u_bodySpan * pr) / res.y * 0.30, 0.10, 0.62);

  // The body glides slowly across ~a quarter of the frame during the lit
  // window; gentle vertical bob. Centred so the whole creature stays framed.
  float glide = (ev - 0.5) * 0.42;            // ~quarter-frame horizontal sweep
  vec2  bodyC = vec2(glide, 0.04 + 0.03 * sin(ev * TAU));

  // Ignition front: a value in [0,1] sweeping nose(0)->tail(1) then back.
  // Lit window occupies the middle of the event; dark phase at the ends.
  // riseFront: 0 at ev=IGN_START climbing to 1 (full body lit)
  const float IGN_START = 0.06;   // bulb lights
  const float IGN_FULL  = 0.34;   // whole outline lit
  const float EXT_START = 0.64;   // begins extinguishing
  const float EXT_FULL  = 0.92;   // back to black
  float riseFront = clamp((ev - IGN_START) / (IGN_FULL - IGN_START), 0.0, 1.0);
  float fallFront = clamp((ev - EXT_START) / (EXT_FULL - EXT_START), 0.0, 1.0);

  // overall presence envelope (fade the whole apparition in/out softly)
  float presence = smoothstep(IGN_START, IGN_START + 0.05, ev)
                 * smoothstep(EXT_FULL, EXT_FULL - 0.05, ev);

  // accumulate photophore contribution
  vec3  body = vec3(0.0);

  for (int i = 0; i < NDOTS; i++) {
    float fi = float(i);
    float u  = fi / float(NDOTS);   // 0..1 around the outline path

    // ---- whale-scale deep-sea fish silhouette traced by photophores ----
    // The body points LEFT: nose/head at x=-1 (the lure), tail fluke at x=+1.
    // We build several dotted rows, each a function of an along-body coord
    // `ax` in roughly [-1, 1.25]. `prof(ax)` is the half-height of the body:
    //   bulbous head near the nose, tapering to a thin caudal peduncle, then
    //   the tail fluke flares out. Rows: back, belly, a jaw line, a dorsal
    //   fin arc, and the tail fluke — all reading as one outlined creature.
    float branch = h11(fi * 1.7);
    vec2 p;

    if (branch < 0.30) {
      // ---- top flank (back contour), nose -> tail ----
      float ax = mix(-1.0, 1.0, u);
      float prof = (1.0 - ax * ax) * 0.34 + 0.05;          // fish-body half-height
      prof *= (ax < 0.0) ? (0.55 + 0.45 * (1.0 + ax)) : 1.0; // round the head
      p = vec2(ax, prof);
    } else if (branch < 0.60) {
      // ---- bottom flank (belly contour), nose -> tail ----
      float ax = mix(-1.0, 1.0, u);
      float prof = (1.0 - ax * ax) * 0.30 + 0.04;
      prof *= (ax < 0.0) ? (0.55 + 0.45 * (1.0 + ax)) : 1.0;
      p = vec2(ax, -prof * 0.92);
    } else if (branch < 0.74) {
      // ---- jaw / mouth line near the head (lower, short) ----
      float ju = u;
      p = vec2(-0.92 + ju * 0.55, -0.02 - sin(ju * PI) * 0.20);
    } else if (branch < 0.90) {
      // ---- dorsal fin: a raised arc on the mid-back ----
      float fu = u;
      float base = -0.10 + fu * 0.55;
      float prof = (1.0 - base * base) * 0.34 + 0.05;
      p = vec2(base, prof + sin(fu * PI) * 0.22);
    } else {
      // ---- tail fluke: two prongs flaring out past the peduncle ----
      float fu = fract(u * 2.3);
      float sgn = (h11(fi * 3.7) < 0.5) ? 1.0 : -1.0;
      p = vec2(0.92 + fu * 0.32, sgn * (0.04 + fu * 0.34));
    }

    // along-body fraction (0 at nose .. 1 at tail) for sequential ignition
    float tailFrac = clamp((p.x + 1.0) / 2.25, 0.0, 1.0);

    // scale body-units to screen (x by halfLen, y a touch compressed), glide
    vec2 dp = vec2(p.x * halfLen, p.y * halfLen * 0.92) + bodyC;

    // ---- ignition gate: lit only once the rising front passes this dot,
    //      and extinguished once the falling front (nose->tail again) passes ----
    float onEdge  = smoothstep(tailFrac - 0.10, tailFrac + 0.02, riseFront);
    float offEdge = 1.0 - smoothstep(tailFrac - 0.10, tailFrac + 0.02, fallFront);
    float lit = onEdge * offEdge;

    // dot geometry: head dots a bit larger than tail dots
    float dotSz = (2.0 + 1.6 * (1.0 - tailFrac)) * pr;
    // the lure bulb: the dot sitting closest to the nose tip (x = -1),
    // brighter and haloed — it is the first photophore to ignite.
    float isBulb = smoothstep(0.10, 0.0, abs(p.x + 1.0) + abs(p.y) * 0.6);
    dotSz *= mix(1.0, 2.3, isBulb);

    vec2  q = (uv - dp) * res.y;                          // to px space
    float d = length(q);
    float core = exp(-d * d / (dotSz * dotSz));
    float halo = exp(-d / (dotSz * 3.2)) * 0.32;

    // shimmer: rolling brightness wave running along the body (tail-ward) plus
    // a per-dot twinkle. At u_shimmer=0 every dot holds steady (shim=1); higher
    // values swing brightness up AND down so rolling waves crest along the rows.
    float roll = sin(tailFrac * 11.0 - t * 1.9 + fi * 0.12);
    float twk  = sin(t * 2.6 + fi * 2.7);
    float shim = 1.0 + u_shimmer * (0.80 * roll + 0.40 * twk);
    shim = clamp(shim, 0.0, 2.6);

    // colour: cool blues/teals tracing the flank; bulb a distinct hue
    float cmix = 0.5 + 0.5 * sin(tailFrac * 4.0 + fi * 0.3);
    vec3  hue  = mix(coolA, coolB, cmix);
    hue = mix(hue, lureHue, isBulb);

    float bright = (core + halo) * lit * shim;
    body += hue * bright;
  }

  // bulb pre-glow: a soft warm bloom at the head before/while it ignites,
  // so the lure "fades on for a beat" before the rows spread.
  {
    vec2 bp = vec2(-1.0 * halfLen, bodyC.y * 0.0) + bodyC;   // at the nose tip
    float d = length((uv - bp) * res.y);
    // bright for a beat as it ignites, then settle once the rows take over
    float bulbOn = smoothstep(IGN_START, IGN_START + 0.04, ev)
                 * smoothstep(IGN_FULL + 0.14, IGN_FULL - 0.04, ev);
    float halo = exp(-d / (24.0 * pr)) * 0.55
               + exp(-(d * d) / ((80.0 * pr) * (80.0 * pr))) * 0.5;
    body += lureHue * halo * bulbOn * 0.7;
  }

  col += body * presence * 1.15;

  // gentle vignette to settle the frame edges into black
  float vign = 1.0 - smoothstep(0.55, 1.15, length(uv * vec2(res.x/res.y, 1.0)) );
  col *= mix(0.82, 1.0, vign);

  // soft filmic-ish clamp to avoid blown highlights on the brightest dots
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
