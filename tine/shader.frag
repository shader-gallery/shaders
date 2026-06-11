// tine (Knell) — a single tuning fork standing centered on a near-black field,
// drawn as the long-exposure envelope of its own vibration. Each slender tine
// glows WIDER where its swing is largest — blooming at the free tips, needle-
// sharp at the yoke — so amplitude is rendered as blur width along an analytic
// 1D cantilever-mode profile. Between the tines hangs a faint ladder of fixed
// horizontal interference fringes whose brightness follows the same envelope.
// Hash-spaced strikes throw the envelope wide and flood the ladder, then both
// narrow exponentially toward a hairline as the note rings down — sometimes a
// softer mid-decay touch re-widens it part way before the final settling. The
// fork itself never moves; only the width and glow of its envelope breathe.
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
uniform float u_gap;        // css-px spacing between the two tines (also the   (default 56)
                            //   spacing of the interference ladder between them); *u_pixelRatio
uniform float u_swing;      // css-px peak blur width at the tine tips just      (default 12)
                            //   after a strike (tight hum -> wide bloom); *u_pixelRatio
uniform float u_strikeGap;  // mean seconds between strikes & mid-decay touches  (default 10)
uniform float u_ringTime;   // seconds: how slowly the envelope narrows back     (default 7)
                            //   toward a hairline after each strike

const vec3  BG         = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TINE_LEN   = 0.74;   // tine length as fraction of min(res) (yoke->tip)
const float YOKE_Y     = -0.34;  // y of the yoke (fork bottom of the U) in norm space
const float STEM_LEN   = 0.20;   // stem drop below the yoke, norm space
const float HAIR_CSS   = 1.6;    // hairline (fully-settled) half-width of a tine
const float MODE_K     = 1.875;  // 1st cantilever-mode eigenvalue (clamped beam)
const float SWING_BOOST = 2.4;   // visual amplification of swing blur reach

// --- small hash for irregular, non-metronomic strike scheduling ---
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// hyperbolic helpers (GLSL ES 1.00 has no cosh/sinh)
float coshf(float x) { return 0.5 * (exp(x) + exp(-x)); }
float sinhf(float x) { return 0.5 * (exp(x) - exp(-x)); }

// cantilever 1st-mode shape phi(x), x in 0..1 from clamped yoke to free tip.
// Normalised so phi(0)=0 (node at yoke) and phi(1)=1 (max swing at tip).
float modeShape(float x) {
  float kx = MODE_K * x;
  // classic clamped-free beam mode: cosh-cos - sigma*(sinh-sin)
  float sigma = 0.7341;
  float s = (coshf(kx) - cos(kx)) - sigma * (sinhf(kx) - sin(kx));
  // value at tip (x=1) for normalisation
  float k = MODE_K;
  float sT = (coshf(k) - cos(k)) - sigma * (sinhf(k) - sin(k));
  return s / sT;
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
  float mn  = min(res.x, res.y);

  // centered, aspect-correct coordinates; +y up. 1 unit = min(res) (full height-ish)
  vec2  p   = (fc - 0.5 * res) / mn;

  vec3 col = BG;

  // ---- palette w/ midnight fallback (headless can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- geometry in norm space ----
  float gap    = (u_gap   * pr) / mn;          // tine center-to-center spacing
  float swing  = (u_swing * pr) / mn;          // peak tip blur (envelope half-width)
  float hair   = (HAIR_CSS * pr) / mn;         // settled hairline half-width
  float halfGap = gap * 0.5;
  float yoke   = YOKE_Y;
  float tipY   = yoke + TINE_LEN;

  // ---- strike envelope: hash-scheduled impulse-and-decay, never on a beat ----
  // Each "epoch" of mean length u_strikeGap fires one strike at a hashed offset,
  // ringing down over u_ringTime. We sum the current + previous epoch so a fresh
  // strike can arrive while the last is still ringing (mid-decay re-widen).
  float meanGap = max(u_strikeGap, 0.5);
  float ring    = max(u_ringTime, 0.4);
  float env = 0.0;          // overall amplitude envelope, 0..~1
  float flare = 0.0;        // impact flare brightness for the freshest strike
  float flareSign = 1.0;    // which tine got struck (-1 left / +1 right)
  float flareAge = 1e3;
  for (int i = -1; i <= 1; i++) {
    float epoch  = floor(t / meanGap) + float(i);
    float jitter = (hash11(epoch * 1.7 + 3.1) - 0.5) * 0.7; // +/-0.35 epoch
    float strikeT = (epoch + 0.5 + jitter) * meanGap;       // absolute strike time
    float age    = t - strikeT;                             // seconds since strike
    if (age >= 0.0) {
      // amplitude: some strikes are firm, some are soft mid-decay touches
      float amp = mix(0.45, 1.0, hash11(epoch * 2.3 + 7.7));
      float decay = exp(-age / ring);
      env += amp * decay;
      // freshest strike controls the impact flare + which tine
      if (age < flareAge) {
        flareAge  = age;
        flare     = amp * exp(-age / (ring * 0.18));   // flare dies faster
        flareSign = (hash11(epoch * 5.1 + 1.3) < 0.5) ? -1.0 : 1.0;
      }
    }
  }
  // a faint ever-present hum so the antinodes always tremble a little (the fork
  // is never perfectly dead); strikes ride on top of this floor.
  float hum = 0.06 + 0.04 * sin(t * 1.7) * sin(t * 0.93 + 1.1);
  env = clamp(env + hum, 0.0, 1.4);

  // ---------------------------------------------------------------
  // TWO TINES — vertical glowing bars whose half-width = envelope blur
  // profile along the cantilever mode (sharp at yoke, wide at tip).
  // ---------------------------------------------------------------
  float tineGlow = 0.0;
  vec3  tineCol  = vec3(0.0);
  // along-tine parameter (0 at yoke, 1 at tip), clamped to the bar extent
  float yspan = tipY - yoke;
  float xn = clamp((p.y - yoke) / max(yspan, 1e-3), 0.0, 1.0);
  // soft caps top & bottom so the bar has rounded ends, not a hard cut
  float endMask = smoothstep(0.0, 0.04, p.y - (yoke - 0.01)) *
                  (1.0 - smoothstep(tipY - 0.01, tipY + 0.05, p.y));
  if (endMask > 0.0) {
    float shape = modeShape(xn);                 // 0..1 swing profile
    // half-width: hairline core + envelope * swing * mode shape (wide at tip).
    // shape^1.3 sharpens the contrast so the needle yoke clearly blooms at tips.
    float prof = pow(shape, 1.3);
    float w = hair + env * swing * SWING_BOOST * prof;
    for (int s = 0; s < 2; s++) {
      float sgn  = (s == 0) ? -1.0 : 1.0;
      float cx   = sgn * halfGap;                // this tine's rest x
      float dx   = abs(p.x - cx);
      // long-exposure blur: a sharp needle core plus a soft swing halo whose
      // reach is the mode-scaled envelope width -> "amplitude as blur width".
      // halo brightness scales with profile so tips read brighter+wider.
      float core = exp(-(dx*dx) / max(hair*hair*2.5, 1e-6));
      float halo = exp(-(dx*dx) / max(w*w*0.85, 1e-6));
      float g    = (core * 0.85 + halo * (0.30 + 0.70 * env) * (0.35 + 0.65 * prof)) * endMask;
      tineGlow  += g;
      // hue keyed by along-tine position & which tine, swept across palette
      float k  = xn * 0.55 + (sgn * 0.5 + 0.5) * 0.12 + t * 0.01;
      float sw = fract(k) * 4.0;
      float w0 = wheelW(sw,0.0), w1 = wheelW(sw,1.0), w2 = wheelW(sw,2.0), w3 = wheelW(sw,3.0);
      vec3 base = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
      // dominant body colour 0, with a colour-2 edge light at the halo rim
      float rim = smoothstep(w*0.25, w*1.0, dx) * (1.0 - smoothstep(w*1.0, w*1.6, dx));
      vec3 tc = mix(c0 * (0.55 + 0.45*base.r + 0.0*base), c2, rim * 0.7);
      tc = mix(tc, base, 0.35);
      tineCol += tc * g;
    }
  }
  tineCol = tineCol / max(tineGlow, 1e-4);

  // ---------------------------------------------------------------
  // INTERFERENCE LADDER — faint fixed horizontal standing bands hung
  // between the tines. Bright where antinode, dark fixed gaps; brightness
  // follows the strike envelope. Colour 1.
  // ---------------------------------------------------------------
  float ladder = 0.0;
  // only between the tines, vertically spanning the lower-mid tine region
  float ladTop = yoke + TINE_LEN * 0.78;
  float ladBot = yoke + TINE_LEN * 0.08;
  float between = (1.0 - smoothstep(halfGap*0.62, halfGap*0.92, abs(p.x)));
  float vrange  = smoothstep(ladBot - 0.02, ladBot + 0.03, p.y) *
                  (1.0 - smoothstep(ladTop - 0.03, ladTop + 0.02, p.y));
  if (between > 0.0 && vrange > 0.0) {
    // band spacing scales with the gap (re-spaced ladder), fixed in place.
    // Finer bands read as a ladder of standing fringes rather than blocks.
    float bandN = 6.2831853 / max(gap * 0.62, 1e-3);
    float bands = 0.5 + 0.5 * cos(p.y * bandN);
    bands = pow(bands, 4.0);                       // tighten antinodes, dark gaps stay dark
    // soft horizontal edge so the fringe doesn't read as a hard rectangle
    float taper = smoothstep(halfGap*0.92, halfGap*0.45, abs(p.x));
    ladder = bands * taper * vrange * (0.10 + 0.9 * env);
  }

  // ---------------------------------------------------------------
  // STEM + YOKE — bare near-black outline (almost invisible). Yoke is a
  // thin U arc joining the tine bases; stem drops from yoke center.
  // ---------------------------------------------------------------
  float frame = 0.0;
  // yoke: horizontal bar at y=yoke spanning the two tines
  float yokeBar = (1.0 - smoothstep(0.004, 0.012, abs(p.y - yoke))) *
                  (1.0 - smoothstep(halfGap, halfGap + 0.02, abs(p.x)));
  // rounded outer corners of the U
  float corner = (1.0 - smoothstep(0.0, 0.03, abs(length(vec2(abs(p.x)-halfGap, p.y-yoke)) - 0.0)));
  // stem: vertical bar below yoke at x=0
  float stem = (1.0 - smoothstep(0.004, 0.012, abs(p.x))) *
               smoothstep(yoke - STEM_LEN - 0.02, yoke - STEM_LEN, p.y) *
               (1.0 - smoothstep(yoke - 0.005, yoke + 0.005, p.y));
  frame = max(yokeBar, stem);

  // ---------------------------------------------------------------
  // IMPACT FLARE — small colour-3 bloom at the strike point on one tine's
  // flank, near the tip, dying faster than the ring.
  // ---------------------------------------------------------------
  // sit on the struck tine's outer flank, up near the tip where swing is largest
  vec2 flarePos = vec2(flareSign * (halfGap + (swing * 0.5 + hair * 2.0)),
                       yoke + TINE_LEN * 0.80);
  float fd = length(p - flarePos);
  float flareGlow = flare * exp(-(fd*fd) / max(0.0016 * (1.0 + swing*6.0), 1e-5));

  // ---------------------------------------------------------------
  // COMPOSITE
  // ---------------------------------------------------------------
  // tines (body colour 0 + edge light colour 2)
  col += tineCol * tineGlow * 1.45;
  // a touch of additive bloom around the tips so wide swings read as light
  col += tineCol * tineGlow * tineGlow * 0.14;
  // RINGING AURA — a broad soft halo over the upper fork that floods when struck
  // and shrinks back as the note rings down. Its REACH grows with swing and its
  // brightness tracks the envelope, so a strike visibly radiates light into the
  // surrounding field (this is the long-exposure "shimmer" of the vibration).
  vec2  aCtr  = vec2(0.0, yoke + TINE_LEN * 0.66);
  vec2  aD    = (p - aCtr) / vec2(halfGap * 2.2 + swing * 3.0 + 0.08,
                                  TINE_LEN * 0.62 + swing * 2.0);
  float aura  = exp(-dot(aD, aD)) * env * (0.18 + 0.7 * env);
  vec3  auraC = mix(c0, c2, 0.4);
  col += auraC * aura * 0.85;
  // interference ladder, colour 1
  col += c1 * ladder * 0.85;
  // impact flare, colour 3
  col += c3 * flareGlow * 2.2;
  // stem + yoke: barely-there cool outline so the silhouette reads
  col += mix(c2, c0, 0.5) * frame * 0.06;

  // gentle radial vignette to keep the corners dark and frame the fork
  vec2 q = (fc - 0.5 * res) / res;
  float vign = 1.0 - smoothstep(0.45, 0.95, length(q * vec2(1.1, 1.0)));
  col *= mix(0.55, 1.0, vign);

  // subtle filmic-ish soft clip so bright tips bloom without harsh white
  col = col / (1.0 + col * 0.45);

  gl_FragColor = vec4(col, 1.0);
}
