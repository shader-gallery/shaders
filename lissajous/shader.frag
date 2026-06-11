// lissajous (Trace) — a single bright phosphor dot traces a Lissajous figure on a
// near-black oscilloscope screen, its tail a chain of samples taken backward along
// the parametric curve, each dimmer and slightly wider than the last. The frequency
// ratio drifts on a slow ~60s super-cycle (glide → lock → hold → glide), smearing the
// curve into a woven knot, then snapping into a simple resonance (1:2, 2:3, 3:4) where
// the figure holds legible and steady before drifting on. Palette colours blend along
// the tail by phase age — live dot hottest, oldest trail sinking toward the darkest.
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
uniform float u_traceSpeed;  // dot travel speed around the figure   (default 1)
uniform float u_persist;     // how far back the tail samples reach  (default 0.5)
uniform float u_figure;      // half-extent of figure, css px        (default 520)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TWO_PI   = 6.2831853072;
const float ORBIT_HZ = 0.85;   // base orbits-per-second of the dot (× u_traceSpeed)
const float SUPER_S  = 60.0;   // length of the ratio super-cycle (seamless loop)
const int   TAIL_N   = 220;    // tail sample count (constant — GLSL ES 1.00)

// the live frequency ratio fy/fx as a function of time. Glides between resonances
// and dwells (locks) on each, all built from one period-SUPER_S sine so the schedule
// repeats seamlessly. Returns the y-frequency (x-frequency fixed at 2.0).
float ratioY(float phase) {
  // phase in 0..1 over the super-cycle. A smooth-stepped staircase that rests on
  // simple integer-ish resonances and slides (drifts) between them.
  // resonance targets paired with x=2: 2:3 -> 3, 2:4(1:2) -> 4, 2:6(1:3) -> 6, back.
  float s = phase * 4.0;            // four stations per super-cycle
  float st = floor(s);
  float fr = fract(s);
  // dwell on the station for the first ~55%, glide for the rest (lock-hold-glide)
  float g = smoothstep(0.55, 1.0, fr);
  // station targets (resonant), cyclic
  float t0 = 3.0, t1 = 4.0, t2 = 6.0, t3 = 5.0;
  // pick current & next station target with cyclic weights (no array indexing)
  float m0 = (st == 0.0) ? 1.0 : 0.0;
  float m1 = (st == 1.0) ? 1.0 : 0.0;
  float m2 = (st == 2.0) ? 1.0 : 0.0;
  float m3 = (st == 3.0) ? 1.0 : 0.0;
  float cur  = t0*m0 + t1*m1 + t2*m2 + t3*m3;
  float nxt  = t1*m0 + t2*m1 + t3*m2 + t0*m3;
  // during the drift, add a small extra wobble so the knot looks woven, not a clean lerp
  float wob = sin(fr * TWO_PI * 3.0) * 0.45 * g * (1.0 - g) * 4.0;
  return mix(cur, nxt, g) + wob;
}

// parametric point on the figure for a given orbit phase th (radians) and ratio
vec2 figurePt(float th, float fy, float dphi) {
  // x at fixed freq 2, y at drifting freq fy, with a slowly-rolling phase offset dphi
  return vec2(sin(2.0 * th + 1.5708), sin(fy * th + dphi));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // --- palette with house fallback ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // figure half-extent in device px (FIGURE_CSS -> u_figure, css-px × pixelRatio).
  // u_figure is the css bounding-box half-extent; clamp so the figure stays inside
  // the tile (the curve spans ±1 in normalized units = 2·ext px) even at max.
  float ext = max(u_figure, 1.0) * 0.5 * pr;
  ext = min(ext, min(res.x, res.y) * 0.46);

  // super-cycle phase (seamless: ratioY is periodic in this), and a slow phase roll
  float sphase = fract(t / SUPER_S);
  float fy     = ratioY(sphase);
  float dphi   = t * 0.05; // gentle phase drift so even a locked figure breathes

  // the dot's current orbit phase. traceSpeed multiplies orbit rate (guarded >0).
  float speed = max(u_traceSpeed, 0.0);
  float orbit = t * ORBIT_HZ * TWO_PI * speed;

  // pixel position in figure-normalized space ([-1,1]-ish), centred
  vec2 p = (fc - ctr) / ext;

  // how far back the tail reaches, as a fraction of one full orbit. PERSIST scales it:
  // short comet at min, nearly the whole closed figure at max.
  float persist = clamp(u_persist, 0.0, 1.0);
  float tailSpan = mix(0.18, 1.0, persist) * TWO_PI; // radians of orbit traced behind

  // walk backward along the curve, accumulating glow additively. Many densely-spaced
  // samples merge into a continuous drawn stroke; each is dimmer & wider as it ages
  // (phosphor decay). Constant loop bound; the step is scaled by tailSpan.
  vec3  acc = vec3(0.0);  // accumulated coloured glow (premultiplied)
  for (int i = 0; i < TAIL_N; i++) {
    float fi  = float(i) / float(TAIL_N - 1); // 0 at live dot .. 1 at oldest tail
    float th  = orbit - fi * tailSpan;
    vec2  q   = figurePt(th, fy, dphi);
    float d   = length(p - q);                // distance in normalized units

    // sample radius grows with age (wider tail), in normalized units
    float rad = 0.0075 + fi * 0.018;
    // age fade: bright head, exponential decay back along the tail
    float age = exp(-fi * 3.0);
    // soft round phosphor sample (gaussian core + a wider, fainter glow halo so the
    // trace reads as luminous coverage, not a hairline) — antialiased, overlapping
    float spark = exp(-d * d / (rad * rad));
    float halo  = exp(-d * d / (rad * rad * 9.0)) * 0.35;

    float amp = (spark + halo) * age;

    // colour by phase age: head hottest (c3 -> c2), tail sinking to darkest (c0)
    float s  = fi * 3.0;               // 0..3 across the four colours
    float w3 = max(0.0, 1.0 - abs(s - 0.0));
    float w2 = max(0.0, 1.0 - abs(s - 1.0));
    float w1 = max(0.0, 1.0 - abs(s - 2.0));
    float w0 = max(0.0, 1.0 - abs(s - 3.0));
    vec3  cc = (c3*w3 + c2*w2 + c1*w1 + c0*w0) / max(w0+w1+w2+w3, 0.001);

    acc += cc * amp;
  }

  // tone-map the accumulated glow so dense overlap stays bright but never blows out
  float lum  = max(max(acc.r, acc.g), acc.b);
  vec3  trace = acc / max(lum, 1e-4);          // hue from the accumulation
  float toned = 1.0 - exp(-lum * 1.3);         // soft saturation curve

  // the very live dot gets a white-hot core for that fresh-phosphor pop
  float headD = length(p - figurePt(orbit, fy, dphi));
  float core  = exp(-headD * headD / 0.0008);  // tight bright nucleus
  float bloom = exp(-headD * headD / 0.02) * 0.5; // soft bloom around the live dot

  col += trace * toned * 1.9;
  col += mix(trace, vec3(1.0), 0.7) * core * 1.7;
  col += mix(trace, vec3(1.0), 0.4) * bloom;

  // faint screen vignette + curvature darkening for the oscilloscope feel
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res) * 1.4);
  col *= mix(0.65, 1.0, vign);

  // a barely-there phosphor green-grey ambient on the glass so pure black reads as
  // a screen, not a void — extremely subtle, stays in the dark-base band
  col += BG * 0.0;

  gl_FragColor = vec4(col, 1.0);
}
