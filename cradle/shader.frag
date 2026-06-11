// cradle (Loom) — a cats-cradle of taut glowing chords strung corner-to-corner
// across the dark. A handful of perfectly straight strings, each anchored at two
// points parameterized along the frame's perimeter, hang in mostly-empty night.
// Each chord is a thin bright core with a soft halo, tinted by blending the
// palette along its length; small glint beads slide slowly down the strings, and
// where chords cross the intersection brightens faintly. On staggered per-chord
// schedules the anchors glide (eased, over several seconds) to new hashed
// perimeter positions, so the figure forever re-strings itself one chord at a
// time — never a global reset.
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
uniform float u_morphSpeed; // cadence/glide rate of anchors trading places (default 0.4)
uniform float u_chords;     // number of strung lines, masked by count        (default 9)
uniform float u_line;       // core thickness of each chord in CSS px         (default 1.4)
uniform float u_glintSpeed; // travel speed of glint beads along the strings  (default 0.7)

const int   MAX_CHORDS = 16;
const vec3  BG         = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI         = 3.14159265;

// 1D hash -> 0..1
float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

// smooth eased crossfade weight (cubic smoothstep on its own argument)
float ease(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

// map a perimeter parameter s in 0..1 to a point on the frame rectangle,
// inset slightly so anchors hug the edge without clipping. aspect = res.
vec2 perimeter(float s, vec2 res) {
  s = fract(s) * 4.0;
  vec2 inset = res * 0.075;
  vec2 lo = inset;
  vec2 hi = res - inset;
  vec2 p;
  if (s < 1.0) {            // bottom edge, left -> right
    p = vec2(mix(lo.x, hi.x, s), lo.y);
  } else if (s < 2.0) {     // right edge, bottom -> top
    p = vec2(hi.x, mix(lo.y, hi.y, s - 1.0));
  } else if (s < 3.0) {     // top edge, right -> left
    p = vec2(mix(hi.x, lo.x, s - 2.0), hi.y);
  } else {                  // left edge, top -> bottom
    p = vec2(lo.x, mix(hi.y, lo.y, s - 3.0));
  }
  return p;
}

// eased anchor parameter for chord `id`, endpoint `e`, at time t. The anchor
// rests at a hashed perimeter position, then over a glide window slides to the
// next hashed position; staggered per chord so the figure re-strings one at a
// time. Returns a perimeter s in 0..1.
float anchorParam(float id, float e, float t) {
  // each anchor advances through integer "stations" over time; the fractional
  // part within a station is split into a hold then an eased glide.
  float seed   = id * 7.0 + e * 31.0;
  float phase  = t + hash11(seed) * 17.0;       // per-anchor time offset (stagger)
  float k      = floor(phase);                  // current station index
  float f      = phase - k;                     // 0..1 within this station
  float a      = hash11(seed + k);              // this station's perimeter pos
  float b      = hash11(seed + k + 1.0);        // next station's perimeter pos
  // hold for the first 45% of the window, glide (eased) across the rest
  float g      = ease((f - 0.45) / 0.55);
  // shortest-path interpolation around the 0..1 perimeter loop
  float d      = b - a;
  d -= floor(d + 0.5);                          // wrap to -0.5..0.5
  return a + d * g;
}

// distance from point p to segment a-b, plus the parameter h (0..1) of the
// closest point along the segment (for tinting + beads).
float segDist(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
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

  // palette with house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3  col      = BG;
  float crossAcc = 0.0;               // accumulated coverage for crossing glow

  float morphT  = t * u_morphSpeed;
  float line    = max(u_line, 0.05) * pr;   // core half-thickness
  float halo    = line * 7.0;               // soft halo radius
  float count   = clamp(u_chords, 1.0, float(MAX_CHORDS));
  float glintT  = t * u_glintSpeed;

  for (int i = 0; i < MAX_CHORDS; i++) {
    float fi = float(i);
    if (fi >= count) break;            // constant bound; mask by live count

    // two eased perimeter anchors -> a taut chord. B is biased to the far side
    // of the perimeter loop (~half a turn from A, with only a small jitter) so
    // every chord reliably spans the frame rather than collapsing into a short
    // stub on one edge.
    float sa = anchorParam(fi, 0.0, morphT) + hash11(fi * 3.0 + 1.0);
    float sb = anchorParam(fi, 1.0, morphT) * 0.45 + 0.5
               + (hash11(fi * 3.0 + 2.0) - 0.5) * 0.3;
    vec2  A  = perimeter(sa, res);
    vec2  B  = perimeter(sa + sb, res);

    // guard against degenerate (near-zero-length) chords: when both anchors
    // happen to land close together the segment collapses to a point and every
    // per-segment effect (especially the bead grid) piles up into a tight block
    // hugging the edge — the "barcode" artifact. Fade the whole chord out as its
    // span shrinks below a fraction of the frame so short stubs simply vanish.
    float segLen  = length(B - A);
    float lenMask = smoothstep(0.18, 0.34, segLen / max(length(res), 1.0));

    float h;
    float d = segDist(fc, A, B, h);

    // anti-aliased bright core + soft halo
    float core = 1.0 - smoothstep(0.0, line + pr * 1.2, d);
    float glow = exp(-d / halo) * 0.55;
    // a medium falloff used to give glint beads a visible bloom (wider than the
    // hairline core, tighter than the full halo) so they read and move.
    float beadFall = exp(-d / (line * 4.5));

    // glint beads sliding along the string: bright travelling highlights whose
    // position drifts with time. phase per chord so beads are not synced. lower
    // exponent + more cycles makes the bead a chunky moving segment, so its
    // travel is plainly visible as glint speed rises.
    float beadPhase = h * 7.0 - glintT * 1.3 - hash11(fi + 4.0) * 6.2831;
    float beads = pow(0.5 + 0.5 * cos(beadPhase * 2.0 * PI), 8.0);
    // a slow envelope so beads brighten and fade rather than blink uniformly
    beads *= 0.55 + 0.45 * sin(h * 3.0 + glintT * 0.7 + fi);
    // fade beads out toward both anchors so highlights never stack into an
    // evenly-spaced grid right at the endpoints (the edge "barcode" block).
    float endFade = smoothstep(0.0, 0.08, h) * smoothstep(0.0, 0.08, 1.0 - h);
    beads = max(beads, 0.0) * beadFall * endFade;

    // colour traces position along the chord (blend palette by h + chord id),
    // no dynamic array indexing — cyclic weights only.
    float s  = fract(h * 0.8 + fi * 0.17 + t * 0.01) * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  tint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

    float strength = (core + glow) * lenMask;
    beads *= lenMask;
    // beads add a near-white sparkle on top of the chord tint
    col      += tint * strength + mix(tint, vec3(1.0), 0.6) * beads * 2.4;
    crossAcc += core * lenMask;        // strings overlapping -> >1 here
  }

  // where chords cross, the overlap pushed crossAcc above 1; add a faint white
  // brightening at those intersections (smooth so it doesn't pop).
  float cross = smoothstep(1.2, 2.2, crossAcc);
  col += vec3(0.9, 0.92, 1.0) * cross * 0.35;

  // gentle radial vignette to keep the framing composed and edges dark
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.78, 1.0, vign);

  // subtle tone shaping to avoid harsh clipping on bright crossings
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
