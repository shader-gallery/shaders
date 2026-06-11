// rush (Sough) — a single rank of cattail rushes along a waterline in the lower
// third: straight slender stems, each carrying one dark sausage-shaped head near
// its tip, silhouetted a hair above black against a faintly graded night sky.
// Below the waterline, still black water holds a dim, vertically-stretched mirror
// of the rank. A gust front crosses the rank stem by stem — each rush bows in
// turn, tip overshooting, root fixed at the waterline — then springs back through
// shrinking swings into a long stillness. Glow gathers on a stem's downwind edge
// and rims its head only when bent; the reflection echoes the same light a shade
// dimmer and a beat softer, wobbling as if the water answers late. Stems blend two
// cool palette colours; heads rim in a warmer third; the sky grade carries the
// fourth. Calm is the resting state; excitation is intermittent and traveling.
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
uniform float u_gustRate;   // how often gust fronts cross the bed  (default 0.4)
uniform float u_bend;       // how far rushes bow & overshoot       (default 1.0)
uniform float u_spacing;    // css-px between rushes (scaled by pr)  (default 26)
uniform float u_reflect;    // brightness of the mirrored rank       (default 0.55)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float WATER_FRAC  = 0.66;   // waterline height as fraction up from bottom
const float STEM_CSS    = 1.6;    // stem half-width in css px
const float STEMH_CSS   = 150.0;  // nominal stem height in css px
const float HEAD_CSS    = 5.5;    // cattail head half-width in css px
const float HEADLEN_CSS = 34.0;   // cattail head length in css px
const float FRONT_CSS   = 220.0;  // spatial width of one gust front in css px

// hash for per-stem jitter (height, phase)
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// bend envelope at a stem given how long ago the front reached it.
// returns a signed sway amplitude: a damped spring — quick bow, overshoot,
// shrinking swings back to zero (the long becalmed quiet between fronts).
float sway(float dt) {
  if (dt < 0.0) return 0.0;           // front hasn't arrived yet -> dead calm
  float env = exp(-dt * 2.4);          // decay quickly back to stillness
  // bow then overshoot: a quick initial bow, then shrinking spring-back swings
  float osc = sin(dt * 6.2831853 * 0.85);
  return env * osc;
}

// distance from point p to a vertical-ish capsule segment a->b, half-width r
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * hh) - r;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// Evaluate the rank silhouette + its glow at a sample point `q` (device px),
// using a bend that is sampled with an optional time-lag `lag` (for the
// reflection's late answer) and a vertical wobble already folded into `q`.
// Writes accumulated silhouette coverage into `sil` and glow colour into `glow`.
void rank(vec2 q, float pr, float spacing, float waterY, float lag,
          out float sil, out vec3 glow, vec3 c0, vec3 c1, vec3 c2) {
  sil = 0.0;
  glow = vec3(0.0);

  float stemHW  = STEM_CSS * pr;
  float headHW  = HEAD_CSS * pr;
  float headLen = HEADLEN_CSS * pr;
  float t       = u_time - lag;

  // Episodic gust fronts. A front sweeps left->right across the rank in a fixed
  // crossing time (so its travel speed reads the same at every rate), then the
  // whole field is becalmed until the next cycle begins. The cycle PERIOD shrinks
  // as the gust rate rises, so calm is the resting state and fronts are intermittent.
  float rate    = max(u_gustRate, 0.001);
  float period  = 3.6 / rate;            // seconds between successive fronts
  // crossing time, kept below the period so a long calm always follows a front
  float crossDur = min(4.2, period * 0.55);
  // phase offset so the curated/poster moments (t≈2, t≈9) each catch a front
  float te      = t + 1.0;
  float cyc     = floor(te / period);    // index of the current cycle
  float tInCyc  = te - cyc * period;     // seconds elapsed within this cycle

  float nearest = floor(q.x / spacing);

  // walk a small fixed window of stems around this fragment (const bound)
  for (int i = -3; i <= 3; i++) {
    float id   = nearest + float(i);
    float root = (id + 0.5) * spacing;             // x of the fixed root
    float hgt  = STEMH_CSS * pr * (0.82 + 0.36 * hash11(id * 1.7));
    float ph   = hash11(id * 3.1) * 0.18;          // tiny per-stem timing jitter

    // the front reaches this stem when tInCyc passes its arrival time, set by
    // the stem's position across the screen (left stems bow first, right last).
    float arrive = (root / max(u_resolution.x, 1.0)) * crossDur + ph;
    float dt = tInCyc - arrive;                    // seconds since this stem was hit
    float amp = sway(dt) * u_bend;

    vec2 base = vec2(root, waterY);                 // root pinned to waterline
    // tip displaced by amp*hgt; mid-stem bows so it reads as a bend, not a tilt
    float topx = root + amp * hgt * 0.55;
    vec2 tip  = vec2(topx, waterY + hgt);
    vec2 mid  = vec2(root + amp * hgt * 0.42, waterY + hgt * 0.55);

    // two capsule segments approximate the bowed stem (root->mid, mid->tip)
    float d1 = sdCapsule(q, base, mid, stemHW);
    float d2 = sdCapsule(q, mid,  tip, stemHW * 0.85);
    float ds = min(d1, d2);

    // cattail head: a fat sausage sitting just below the tip on the stem
    float headFrac = clamp(headLen / max(hgt, 1.0), 0.0, 0.5);
    vec2 hb = mix(mid, tip, 0.58 - headFrac * 0.5);
    vec2 ht = mix(mid, tip, 0.58 + headFrac * 0.5);
    float dh = sdCapsule(q, hb, ht, headHW);

    float aa = 1.5 * pr;
    float sStem = 1.0 - smoothstep(0.0, aa, ds);
    float sHead = 1.0 - smoothstep(0.0, aa, dh);
    sil = max(sil, max(sStem, sHead));

    // glow ONLY when bent: a thin rim hugging the silhouette's downwind edge,
    // plus a soft fill in the head. Strength scales with |amp| so the calm
    // field stays near-black between fronts.
    float lit = clamp((abs(amp) - 0.05) * 2.2, 0.0, 1.0);
    float side = sign(amp + 1e-4);
    // local stem centreline x at this height (so "downwind edge" tracks the bow)
    float cx   = root + amp * (q.y - waterY) * 0.55;
    float down = smoothstep(-stemHW * 0.5, stemHW * 1.2, side * (q.x - cx));
    // tight rim that clings to the stem edge (not a wide plume)
    float rim  = (1.0 - smoothstep(0.0, stemHW * 2.6, abs(ds))) * down;
    // a soft outer bloom just outside the rim so bent stems read luminous
    float bloom = exp(-max(ds, 0.0) / (3.0 * pr)) * down;
    float stemGlow = (rim + bloom * 0.45) * lit;
    // the head catches a soft warm rim of light on its lit flank
    float headGlow = ((1.0 - smoothstep(0.0, headHW * 1.7, abs(dh)))
                      + exp(-max(dh, 0.0) / (4.0 * pr)) * 0.5) * down * lit;

    // stem colour blends two cool palette hues along the rank
    float mixk = 0.5 + 0.5 * sin(id * 0.6);
    vec3 stemCol = mix(c0, c1, mixk);
    glow += stemCol * stemGlow * 1.1;
    glow += c2 * headGlow * 1.5;                                 // warmer head rim
  }
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float spacing = max(u_spacing * pr, 4.0);
  float waterY  = res.y * (1.0 - WATER_FRAC); // device-px y of the waterline

  // --- night sky: a faint vertical grade carrying a whisper of the 4th colour ---
  vec3 col = BG;
  float skyT = clamp((fc.y - waterY) / max(res.y - waterY, 1.0), 0.0, 1.0);
  col += c3 * (0.018 + 0.045 * skyT) * smoothstep(-0.05, 0.4, skyT);
  // soft moon-ish brightening high & slightly right
  vec2 moon = vec2(res.x * 0.62, res.y * 0.9);
  col += c3 * 0.05 * exp(-length(fc - moon) / (res.y * 0.55));

  bool above = fc.y >= waterY;

  if (above) {
    // ----- the real rank, standing above the waterline -----
    float sil; vec3 glow;
    rank(fc, pr, spacing, waterY, 0.0, sil, glow, c0, c1, c2);
    // silhouette sits a hair above black so stems read against the sky
    vec3 silCol = mix(col, BG * 0.55 + vec3(0.010, 0.012, 0.020), sil);
    col = mix(col, silCol, sil);
    col += glow * 0.9;
  } else {
    // ----- the mirror in still black water -----
    // water is darker than sky; reflect across the waterline with a vertical
    // stretch, a soft time-lag, and a faint horizontal shimmer (water answers late)
    col = BG * 0.6;
    float depth = (waterY - fc.y);                 // px below the line
    float shimmer = sin(fc.y * 0.05 / pr + t * 1.3) * 2.2 * pr * smoothstep(0.0, 60.0 * pr, depth);
    // mirror sample: stretch vertically (x1.18) so the reflection is elongated
    vec2 q = vec2(fc.x + shimmer, waterY + depth * 1.18);
    float sil; vec3 glow;
    rank(q, pr, spacing, waterY, 0.22, sil, glow, c0, c1, c2);
    float fade = exp(-depth / (res.y * 0.6));       // reflection dims with depth
    float r = clamp(u_reflect, 0.0, 1.0);
    vec3 silCol = mix(col, BG * 0.30, sil);
    col = mix(col, silCol, sil * r);
    col += glow * 1.35 * r * fade;
  }

  // crisp waterline: a thin darker seam where rank meets mirror
  float lineD = abs(fc.y - waterY);
  col = mix(col, BG * 0.4, (1.0 - smoothstep(0.0, 1.5 * pr, lineD)) * 0.7);
  // a faint glint riding the waterline picks up the warm head colour
  col += c2 * 0.04 * exp(-lineD / (3.0 * pr));

  // gentle vignette keeps the frame composed
  vec2 uv = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.35, 0.95, length(uv));
  col *= mix(0.78, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
