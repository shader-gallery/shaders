// gamelan (Knell) — a rank of seven bronze bars laid side by side across the
// frame, lengths graded like a metallophone seen from above. Each bar is a
// rounded near-black slab with a faint edge sheen at rest. A struck bar rings in
// its free-bar modes: a 1D standing wave along its length whose two nodal points
// (~22% in from each end) stay dark and pinned while the centre and free ends
// tremble with glow. A fainter three-lobed second mode sparkles and dies first.
// Hue sweeps palette colour 0 -> colour 3 across the rank. Strikes are
// hash-scheduled per bar, sparse and independent, each ringing down exponentially
// at its own length-keyed rate — an ensemble breathing out of phase. Nothing
// travels; the waves stand in place and die away.
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
uniform float u_strikeGap;   // mean seconds between strikes on one bar (default 8)
uniform float u_ringTime;    // sustain scale across the rank             (default 5)
uniform float u_barWidth;    // css-px width of each bar (x u_pixelRatio)  (default 34)
uniform float u_overtone;    // level of the 3-lobed second mode 0..1      (default 0.4)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   NBARS    = 7;       // bars in the rank
const float NODE_POS = 0.2242;  // free-bar nodal fraction in from each end
const float TWO_PI   = 6.2831853;

// cheap hash 1D
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Palette with midnight fallback (headless contexts can leave the array zero).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  // Guard params so the full slider range is safe.
  float gap    = max(u_strikeGap, 0.5);            // mean seconds between strikes
  float ring   = max(u_ringTime, 0.1);             // global sustain scale
  float barW   = max(u_barWidth, 4.0) * pr;        // bar width in device px
  float over   = clamp(u_overtone, 0.0, 1.0);      // overtone level

  // The rank is centred horizontally; bars are spaced by a pitch a touch wider
  // than the bar so a thin dark channel separates them.
  float pitch  = barW * 1.34;
  float rankW  = pitch * float(NBARS);
  float x0     = res.x * 0.5 - rankW * 0.5;        // left edge of the rank

  // Vertical extent: bars run nearly the full height with margins.
  float topY   = res.y * 0.90;
  float botY   = res.y * 0.10;
  float spanY  = topY - botY;

  // Bronze sheen colour for the resting slab (warm dark metal).
  vec3 bronze  = vec3(0.090, 0.066, 0.040);

  // Accumulate every bar's contribution (constant loop bound).
  for (int i = 0; i < NBARS; i++) {
    float fi   = float(i);
    float frac = fi / float(NBARS - 1);            // 0..1 across the rank

    // Bar centre x and half-width; graded length (long at the low end -> short).
    float cx   = x0 + (fi + 0.5) * pitch;
    float halfW = barW * 0.5;

    // Length grading: bar 0 longest, bar 6 shortest (metallophone fan).
    float lenScale = mix(1.0, 0.62, frac);
    float half_h   = spanY * 0.5 * lenScale;
    float cy       = (topY + botY) * 0.5;

    // Distance from bar centre line and ends.
    float dx = fc.x - cx;
    float dy = fc.y - cy;

    // Rounded-rectangle slab mask (rounded ends), anti-aliased.
    float rr   = halfW * 0.85;                      // corner radius
    vec2  q    = vec2(abs(dx) - (halfW - rr), abs(dy) - (half_h - rr));
    float sd   = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
    float aa   = 1.5 * pr;
    float slab = 1.0 - smoothstep(-aa, aa, sd);     // 1 inside the slab

    if (slab > 0.001) {
      // Normalised position along the bar length, 0..1 from bottom to top.
      float u = clamp((fc.y - (cy - half_h)) / (2.0 * half_h), 0.0, 1.0);

      // --- Free-bar fundamental mode shape ---
      // Two nodes at NODE_POS and 1-NODE_POS stay dark; centre and free ends
      // antinodes. Approximate the free-free first mode with a cosine that has
      // its zeros at the two nodal points: argument maps node fraction to +-pi/2.
      // s in [-1,1] across the bar; nodes where |s| == nodeS.
      float s     = u * 2.0 - 1.0;                  // -1..1
      float nodeS = 1.0 - 2.0 * NODE_POS;           // node location in s
      // cos has zeros at s = +-nodeS, giving two dark nodal points with bright
      // antinode lobes at the centre and both free ends (free-free 1st mode).
      float shape1 = cos(s * (1.5707963 / max(nodeS, 0.05)));
      float amp1 = abs(shape1);

      // --- Second free-bar mode: three lobes (extra nodes), dies first ---
      float shape2 = cos(s * (1.5707963 / max(nodeS, 0.05)) * 2.6);
      float amp2 = abs(shape2);

      // --- Strike scheduling (hash, per bar, sparse, exponential ring-down) ---
      // Length-keyed: long bars (low frac) ring slow & long; short ring bright/fast.
      float decayRate = mix(0.45, 1.9, frac) / ring;   // 1/seconds
      float seedBase  = fi * 37.0;

      // Look back over a few recent strike windows so overlapping ring-downs hold.
      float env   = 0.0;     // fundamental envelope
      float env2  = 0.0;     // overtone envelope (decays faster)
      float warm  = 0.0;     // strike warmth flash
      // window index within hash schedule; each window ~ gap long, jittered.
      float nowW  = floor(t / gap);
      for (int k = 0; k < 4; k++) {
        float widx = nowW - float(k);
        float h    = hash11(seedBase + widx * 7.13);
        // Only ~62% of windows actually fire a strike (sparse, not metronomic).
        float fires = step(0.38, h);
        // Strike time jittered within its window.
        float jit   = hash11(seedBase + widx * 2.91 + 5.0);
        float tStrike = (widx + jit) * gap;
        float age   = t - tStrike;
        if (age > 0.0) {
          float e  = exp(-age * decayRate) * fires;
          float e2 = exp(-age * decayRate * 2.3) * fires;  // overtone dies first
          env  += e;
          env2 += e2;
          warm += exp(-age * decayRate * 3.0) * fires;
        }
      }
      env  = min(env, 1.0);
      env2 = min(env2, 1.0);
      warm = min(warm, 1.0);

      // Shimmer: a fast tremble on the antinodes while ringing (in-place, no travel).
      float shimmer = 0.85 + 0.15 * sin(t * mix(34.0, 70.0, frac) + fi);

      // Combined vibration amplitude across the bar length.
      float vib = amp1 * env * shimmer
                + amp2 * env2 * over * 0.9 * shimmer;
      vib = min(vib, 1.15);

      // Hue: blend colour 0 -> colour 3 across the rank by bar position. Use a
      // smooth two-stop interpolation through c1,c2 (no dynamic indexing).
      float g  = frac * 3.0;                 // 0..3
      vec3 hue;
      if (g < 1.0)      hue = mix(c0, c1, g);
      else if (g < 2.0) hue = mix(c1, c2, g - 1.0);
      else              hue = mix(c2, c3, g - 2.0);
      // Strike warms the struck bar's lobes momentarily toward c3 (warm end).
      hue = mix(hue, mix(hue, c3, 0.5), warm * 0.6);

      // Edge sheen: faint rim on the resting slab so dark bars still read.
      float edge = (1.0 - smoothstep(0.0, 2.0*pr, abs(sd))); // near border
      vec3 rest = bronze + bronze * edge * 0.6;

      // Compose this bar: resting bronze slab + glowing vibration on top.
      // Keep the glow hue-preserving even at peaks: scale a normalised hue so
      // the brightest antinodes saturate toward the colour, not toward white.
      vec3 hueN  = hue / max(max(hue.r, max(hue.g, hue.b)), 0.001);
      vec3 barCol = rest;
      barCol += hueN * vib * 1.0;
      // a small white core only at the very hottest antinodes (sheen, not wash).
      barCol += vec3(1.0) * smoothstep(1.0, 1.15, vib) * 0.45;
      // soft bloom of the glow so antinodes feel luminous, not flat.
      barCol += hueN * pow(vib, 1.7) * 0.40;

      col = mix(col, barCol, slab);
    }
  }

  // Gentle vignette to settle the framing.
  vec2 uvv = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.0, length(uvv) * 1.25);
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
