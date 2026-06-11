// sprite (Omen) — upper-atmosphere sprites over a night horizon. From the top
// edge, clusters of faint streamers descend in ghostly episodes: each cluster a
// fan of thin, slightly wavering vertical tendrils that branch once or twice as
// they fall, brightest at their tops and dissolving to nothing before mid-frame.
// The streamers blend from the palette's violet toward its rose along their
// length; between events only a whisper-faint airglow gradient keeps the black
// alive. Episodic and structural — never the continuous rain of starfall, and
// never horror: the occult as composure.
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
uniform float u_episodeRate; // how often clusters fire, 0.1..1   (default 0.3)
uniform float u_reach;       // streamer reach down from top, css px (default 300)
uniform float u_tendrils;    // tendril count + branching, 0.2..1  (default 0.6)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float SLOTS    = 4.0;   // independent cluster slots (const loop bound)
const float PERIOD   = 9.0;   // base seconds per slot episode cycle

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

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
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

  // --- faint airglow gradient so the black stays alive between events ------
  // a soft band of cool light hugging the horizon (bottom), barely there.
  float glowBand = exp(-uv.y * 2.6) * 0.06;
  float glowShimmer = 0.5 + 0.5 * sin(uv.x * 2.3 + t * 0.18);
  col += mix(c2, c0, 0.5) * glowBand * (0.7 + 0.3 * glowShimmer);
  // a whisper of upper airglow too, violet, so the top edge isn't dead
  col += violet * exp(-yTop * 5.0) * 0.025;

  // reach of streamers in normalized-y units (css px / buffer height)
  float reachN = clamp(u_reach * pr / max(res.y, 1.0), 0.04, 1.2);

  // tendril controls: more u_tendrils -> more threads + more forking
  float fanWidth = mix(0.04, 0.16, u_tendrils);   // horizontal spread of a fan
  float threadDensity = mix(2.0, 6.0, u_tendrils); // threads packed across a fan
  float branchAmt = clamp(u_tendrils, 0.0, 1.0);   // how strong the fork is

  // accumulate streamer light over the cluster slots
  vec3 streamer = vec3(0.0);

  for (float si = 0.0; si < SLOTS; si += 1.0) {
    // each slot has its own staggered cycle + horizontal home position. Slots
    // are phase-spread evenly (si/SLOTS) plus a hash jitter so coverage is even
    // and the sky is never globally empty for long, yet never reads as a pattern.
    float seed   = si + 1.0;
    float phase  = si / SLOTS + hash11(seed * 3.17) * 0.22;
    // episode rate compresses/stretches the gap between firings. At min rate the
    // duty cycle is short (long pregnant silences); at max it nearly stays lit.
    float cycle  = PERIOD * mix(1.55, 0.55, u_episodeRate);
    float life   = mix(2.8, 3.8, hash11(seed * 7.7)); // seconds a cluster burns
    float lt     = mod(t + phase * cycle, cycle);      // local time in cycle
    // episode envelope: fade-in, hold, fade-out over `life`, else dark
    float env = smoothstep(0.0, 0.55, lt) * (1.0 - smoothstep(life - 0.9, life, lt));
    // tiny re-randomization per episode so successive firings differ
    float epId = floor((t + phase * cycle) / cycle);
    if (env <= 0.001) continue;

    // horizontal home of this cluster, re-rolled each episode
    float hx = hash21(vec2(seed, epId));
    float cx = (0.12 + 0.76 * hx) * aspect;     // keep clusters off the edges
    // this cluster's own reach + a downward elongation that grows over its life
    float grow = smoothstep(0.0, 0.7, lt / life); // elongates downward in time
    float clReach = reachN * mix(0.7, 1.0, hash11(epId + seed));

    // distance from the fan's vertical axis (with slow waver of the whole fan)
    float fanWave = (vnoise(yTop * 5.0 + epId * 2.0 + seed) - 0.5) * fanWidth * 0.9;
    float dxFan = (uv.x - (cx + fanWave * yTop));

    // build a few thin tendrils across the fan. Const loop bound; threadDensity
    // gates how many actually light up so the param reads as count. `lum` is the
    // bright filament core; `halo` a soft surrounding glow (ethereal bloom).
    float lum  = 0.0;
    float halo = 0.0;
    for (float ti = 0.0; ti < 6.0; ti += 1.0) {
      // gate: only the first `threadDensity` threads contribute
      float on = smoothstep(threadDensity + 0.5, threadDensity - 0.5, ti);
      if (on <= 0.001) continue;
      // thread's base horizontal offset within the fan, fanned symmetrically
      float spread = (ti / 5.0 - 0.5) * 2.0;        // -1..1
      float baseX  = spread * fanWidth;
      // branching: as the tendril descends it forks, the offset growing with yTop
      float fork   = baseX * (1.0 + branchAmt * 1.3 * yTop);
      // per-thread wavering, evolving down the strand and pulsing along it
      float wav = (vnoise(yTop * 7.0 + ti * 4.0 + epId * 3.0 + seed) - 0.5);
      float xoff = fork + wav * fanWidth * 0.6;
      // a secondary branch that splits off lower down (adds the "branch once or
      // twice" reading) — only meaningful with branching turned up
      float xoff2 = fork * (1.0 - 0.8 * yTop) + (wav + 0.18) * fanWidth * 0.5;

      float d1 = abs(dxFan - xoff);
      float d2 = abs(dxFan - xoff2);
      float halfw = (0.0016 + 0.0010 * yTop) * (1.0 + 0.4 / max(threadDensity, 1.0));
      float thr1 = exp(-(d1 * d1) / (halfw * halfw));
      float thr2 = branchAmt * 0.7 * exp(-(d2 * d2) / (halfw * halfw));
      lum += on * (thr1 + thr2);
      // soft halo: a much wider, gentler gaussian around each filament so the
      // streamers glow into the surrounding sky rather than reading as hard wires
      float hw = halfw * 6.5;
      halo += on * (exp(-(d1 * d1) / (hw * hw)) + thr2 * exp(-(d2 * d2) / (hw * hw)));
    }

    // vertical profile: streamers live in the upper third, brightest at top,
    // dissolving toward `clReach` (and never reaching mid-frame).
    float depth = yTop / max(clReach, 1e-3);        // 0 top .. 1 at full reach
    // gate to the descended length (grows over the episode life)
    float lenGate = smoothstep(grow + 0.18, grow - 0.02, depth);
    // brightness falls off down the strand; squared for a luminous top
    float vert = lenGate * (1.0 - smoothstep(0.0, 1.0, depth));
    vert *= vert;
    // hard cap so nothing crosses into the lower frame
    vert *= smoothstep(1.05, 0.6, depth);

    // colour blends violet (top) -> rose (bottom) along the strand
    vec3 strandCol = mix(tipCol, mix(violet, rose, clamp(depth * 1.3, 0.0, 1.0)),
                         smoothstep(0.0, 0.22, depth));

    streamer += strandCol * lum * vert * env;
    // halo glows the streamers into the sky — fainter, broader, and weighted to
    // the cooler tip colour so the bloom reads as airglow around the filaments
    streamer += mix(tipCol, strandCol, 0.5) * halo * 0.21 * vert * env;
  }

  // streamers are faint + ghostly; tone the accumulation gently
  col += streamer * 1.35;

  // very mild vignette to compose the framing without killing the corners
  vec2 q = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.55, 1.15, length(q) * 1.6);
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
