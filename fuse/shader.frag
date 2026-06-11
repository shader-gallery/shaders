// fuse (Smolder) — two long fuse cords crossing the frame on shallow diagonals,
// each a thin noise-bent filament barely a step above the near-black ground.
// Both cords burn at once: each carries one white-hot bead chewing along its
// length at a different, hard-jittering speed (lurching through knots, racing the
// easy stretches). Each bead wears a tight palette-graded halo (hottest->coolest
// outward) and throws a hashed spray of short-lived spark flecks. Behind the bead
// the cord is spent ash-grey; ahead it waits dark and whole. The two burn windows
// overlap and crossfade so the relay never shows a reset — one-way consumption of
// a one-dimensional track.
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
uniform float u_burnSpeed;     // base fraction of a cord each bead eats per second (default 0.08)
uniform float u_haloWidth;     // halo radius in CSS px around the bead            (default 16)
uniform float u_sparkSpray;    // density of spark flecks thrown off each bead 0..1 (default 0.8)
uniform float u_cordWaviness;  // how far cords bow from straight 0..1             (default 0.5)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float CORD_CSS  = 1.6;   // cord half-thickness in CSS px
const float TWO_PI    = 6.2831853;

// --- hashes ---
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// smooth 1D value noise
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  f = f * f * (3.0 - 2.0 * f);
  return mix(a, b, f);
}

// a cord is a polyline parameterized by s in 0..1 across the frame. It runs on a
// shallow diagonal from one edge to the other, bent by layered value noise.
// Returns the cord's pixel position at parameter s (aspect-correct space px).
vec2 cordPoint(float s, vec2 res, float dir, float seed, float waviness) {
  // baseline: shallow diagonal across full width, slight vertical offset by dir
  vec2 a = vec2(-0.06 * res.x, res.y * (0.5 - dir * 0.30));
  vec2 b = vec2( 1.06 * res.x, res.y * (0.5 + dir * 0.30));
  vec2 base = mix(a, b, s);
  // bow perpendicular to the run, layered noise so it knots and eases
  vec2 tang = normalize(b - a);
  vec2 nrm  = vec2(-tang.y, tang.x);
  float amp = res.y * 0.16 * waviness;
  float n = vnoise(s * 3.0 + seed) - 0.5
          + 0.5 * (vnoise(s * 7.3 + seed * 2.0) - 0.5)
          + 0.25 * (vnoise(s * 15.0 + seed * 3.0) - 0.5);
  return base + nrm * n * amp;
}

// distance from point p to the cord, plus the nearest parameter s, by sampling.
// constant loop bounds (GLSL ES 1.00). Returns vec3(dist, sNearest, _).
vec3 cordDistance(vec2 p, vec2 res, float dir, float seed, float waviness) {
  const int N = 48;
  float best = 1e9;
  float bestS = 0.0;
  vec2 prev = cordPoint(0.0, res, dir, seed, waviness);
  for (int i = 1; i <= N; i++) {
    float s = float(i) / float(N);
    vec2 cur = cordPoint(s, res, dir, seed, waviness);
    vec2 e = cur - prev;
    vec2 w = p - prev;
    float h = clamp(dot(w, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
    vec2 proj = prev + e * h;
    float d = length(p - proj);
    if (d < best) {
      best = d;
      bestS = (float(i - 1) + h) / float(N);
    }
    prev = cur;
  }
  return vec3(best, bestS, 0.0);
}

// jittering one-way burn position in 0..1 for a bead, given a phase. The bead
// advances monotonically across its window (lurch through knots, race elsewhere)
// driven by an integral-like accumulation of a noisy speed. Phase ph in 0..1.
float beadPos(float ph, float seed) {
  // base linear sweep plus a noise warp that locally speeds/slows but stays
  // monotone overall (warp amplitude < 1 so derivative stays positive-ish)
  float warp = 0.16 * (vnoise(ph * 6.0 + seed) - 0.5)
             + 0.10 * (vnoise(ph * 13.0 + seed * 2.0) - 0.5);
  return clamp(ph + warp, 0.0, 1.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard the params so the full slider range is safe
  float burnSpeed = max(u_burnSpeed, 0.001);
  float haloW     = max(u_haloWidth, 1.0) * pr;
  float spray     = clamp(u_sparkSpray, 0.0, 1.0);
  float waviness  = clamp(u_cordWaviness, 0.0, 1.0);

  vec3 col = BG;

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float cordHalf = CORD_CSS * pr;
  float aa = pr * 1.2;

  // each cord burns one full length per (1/burnSpeed) seconds; the two beads run
  // at visibly different base speeds so the relay reads as a gaining/falling race.
  float spdA = burnSpeed;
  float spdB = burnSpeed * 1.47;
  // staggered phases (offset by half) so a finished cord reignites while the other
  // bead is still mid-cord -> burn windows overlap, no global reset visible.
  float phA = fract(t * spdA);
  float phB = fract(t * spdB + 0.5);
  float burnA = beadPos(phA, 1.7);
  float burnB = beadPos(phB, 9.3);

  // unify the two cords' contribution
  // i=0 -> cord A, i=1 -> cord B
  for (int i = 0; i < 2; i++) {
    float dir   = (i == 0) ? 1.0 : -1.0;
    float seed  = (i == 0) ? 1.7 : 9.3;
    float burn  = (i == 0) ? burnA : burnB;
    float ph    = (i == 0) ? phA : phB;

    vec3 cd = cordDistance(fc, res, dir, seed, waviness);
    float dist = cd.x;
    float s    = cd.y;

    // base cord: thin filament, barely above background, fading at the very ends
    float ends = smoothstep(0.0, 0.05, s) * smoothstep(1.0, 0.95, s);
    float cordMask = (1.0 - smoothstep(cordHalf, cordHalf + aa, dist)) * ends;

    // territory: ahead of the bead the cord is dark + whole; behind it is ash.
    // a soft boundary right at the bead so the front reads as a moving edge.
    float spent = smoothstep(burn + 0.004, burn - 0.004, s); // 1 behind bead, 0 ahead

    // intact (ahead) cord: a faint cool ember-less filament, a real step above BG
    vec3 cordCol = mix(vec3(0.060, 0.058, 0.066), c2 * 0.12, 0.35);
    // ash (behind) cord: a sagging char, DIMMER than the intact cord
    vec3 ashCol  = vec3(0.026, 0.024, 0.028);
    // the spent char also sags thinner -> slightly reduce its mask
    float filCordMask = cordMask * mix(1.0, 0.82, spent);
    vec3 filCol  = mix(cordCol, ashCol, spent);
    col += filCol * filCordMask;

    // --- the burn bead: white-hot core at parameter `burn` along the cord ---
    vec2 beadPt = cordPoint(burn, res, dir, seed, waviness);
    float bd = length(fc - beadPt); // distance to bead centre in px

    // white-hot core
    float core = exp(-bd * bd / (max(cordHalf * 2.2, 1.0) * max(cordHalf * 2.2, 1.0)));
    col += vec3(1.0, 0.96, 0.88) * core * 1.6;

    // palette-graded halo: rings hottest->coolest outward across its width.
    // map radial distance 0..haloW to a 0..1 grade, then blend palette warm->cool.
    float r = bd / haloW;
    float haloFall = exp(-r * r * 2.2); // tight halo
    // grade: near core = warmest (c0/ember orange), outer = coolest (c2 cyan-ish)
    float g = clamp(r, 0.0, 1.0);
    vec3 grad = mix(mix(vec3(1.0,0.85,0.55), c0, 0.5), c1, smoothstep(0.0, 0.45, g));
    grad = mix(grad, c3, smoothstep(0.35, 0.7, g));
    grad = mix(grad, c2, smoothstep(0.6, 1.0, g));
    col += grad * haloFall * 1.25;

    // a slim trailing afterglow just behind the bead (cooling rim) along the cord
    float behind = smoothstep(burn, burn - 0.06, s) * (1.0 - smoothstep(burn - 0.06, burn - 0.14, s));
    float trail = behind * (1.0 - smoothstep(cordHalf, cordHalf + haloW * 0.25, dist));
    col += mix(c3, c0, 0.5) * trail * 0.35;

    // --- spark flecks: short-lived hashed points thrown a few px off the bead ---
    // sample a small fixed grid of candidate sparks in a box around the bead.
    const int SP = 7;
    float sparkAccum = 0.0;
    vec3  sparkCol = vec3(0.0);
    for (int sx = 0; sx < SP; sx++) {
      for (int sy = 0; sy < SP; sy++) {
        // each spark cell gets a lifetime cycle; time quantized so flecks pop+die
        vec2 cell = vec2(float(sx), float(sy));
        float life = floor(t * 9.0) + cell.x * 3.0 + cell.y * 7.0 + float(i) * 31.0;
        float h0 = hash21(cell + float(i) * 17.0 + floor(life));
        // only some cells are active -> spray density
        if (h0 < spray) {
          float ang = hash21(cell + 3.1 + life) * TWO_PI;
          float rad = (0.35 + 1.05 * hash21(cell + 7.7 + life)) * haloW * 1.05;
          vec2 sp = beadPt + vec2(cos(ang), sin(ang)) * rad;
          float sd = length(fc - sp);
          // flicker each spark over its short life (never fully off, so a fleck
          // always paints a few pixels while alive -> spray reads in stills too)
          float fl = hash21(cell + 5.5 + life);
          float twinkle = 0.6 + 0.4 * sin(t * 40.0 + fl * TWO_PI);
          float sg = max(pr * 1.7, 1.0);
          float pt = exp(-sd * sd / (sg * sg));
          float amt = pt * twinkle * (0.7 + 0.5 * h0);
          sparkAccum += amt;
          // sparks tint warm, cooling with throw distance
          vec3 sc = mix(vec3(1.0, 0.85, 0.5), c3, clamp(rad / haloW, 0.0, 1.0));
          sparkCol += sc * amt;
        }
      }
    }
    col += sparkCol * 1.7;

    // faint ember-dust cloud: a soft warm haze the spark spray kicks up around
    // the bead. Scales with spray density (0 spray -> clean ember point, no dust)
    // and gives the spray param real pixel coverage. Stays dim so the bead reads.
    float dustR = bd / (haloW * 2.4);
    float dust = exp(-dustR * dustR * 1.3);
    col += mix(vec3(0.9, 0.55, 0.28), c0, 0.4) * dust * spray * 0.30;
  }

  // gentle vignette to keep the corners dark and the burn beads luminous
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.7, 1.0, vign);

  // soft tonemap so overlapping glow doesn't clip harshly to flat white
  col = col / (col + vec3(0.55)) * 1.55;

  gl_FragColor = vec4(col, 1.0);
}
