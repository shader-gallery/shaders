// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// timbre (Knell) — a vast tam-tam nearly filling the frame: a hammered bronze
// disc a half-step above the void. Its brightness is the analytic sum of five
// FIXED inharmonic partials — products of radial cosines at irrational
// wavenumber ratios with low-order angular factors at hashed orientations — so
// the antinode pattern is a mottled shimmer (not an orderly figure) and its
// zero web is an irregular lace of dark lines that never moves within a
// ring-down. Each partial owns a tint: the deep fundamental lays palette c1
// across broad lobes, the mid partials stipple c0 and c2 through the finer
// mottle, the sharpest partial flashes c3 only in the first second after a
// strike. Near-ratio partials beat slowly against one another, so regions wax
// and wane in counterpoise while NOTHING travels anywhere.
//
// MOTION: a strike releases the full-spectrum shimmer; the partials decay at
// different exponential rates, so the texture coarsens — fine mottle dissolving
// into the broad slow lobes of the fundamental — before near-stillness on a
// faint residual. Occasional half-strength after-touches re-excite only the
// lower partials, swelling the broad lobes without restoring the sparkle.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_strikeGap;   // mean seconds between full strikes      (default 14)
uniform float u_ringTime;    // overall sustain / ring-down constant, s (default 9)
uniform float u_shimmer;     // 0..1 level of the upper partials        (default 0.65)
uniform float u_beatRate;    // 0..1 detune between near-ratio partials  (default 0.35)

const vec3 BG = vec3(0.030, 0.028, 0.035); // near-black bronze-dark field

// Five inharmonic partials. Each is a true 2D Chladni-plate eigenmode evaluated
// in a frame ROTATED by a hashed orientation: the antinode signal is the
// classic square-plate difference of cosine products,
//   cos(kx*X)cos(ky*Y) - cos(ky*X)cos(kx*Y),
// whose zero set is an IRREGULAR LACE of dark lines (not concentric rings —
// that is sibling toll's clean-harmonic job). The (kx,ky) pairs sit at
// IRRATIONAL ratios so the laces of different partials never align, giving the
// disorderly mottled shimmer. All const — the figure stands perfectly in place
// and only its amplitude lives, beats and dies.
const vec2 K1 = vec2(2.7, 3.6);     // deep fundamental — broad lobes
const vec2 K2 = vec2(4.3, 6.1);     // low-mid (near-ratio partner of K3)
const vec2 K3 = vec2(5.2, 6.9);     // mid — beats against K2
const vec2 K4 = vec2(10.3, 13.7);   // upper — finer mottle
const vec2 K5 = vec2(16.9, 22.1);   // sharpest — the strike flash, finest grain
// hashed orientations (radians) so the laces don't share an axis
const float TH1 = 0.31;
const float TH2 = 1.97;
const float TH3 = 0.84;
const float TH4 = 2.51;
const float TH5 = 1.42;

// hash a strike index -> [0,1)
float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

// one inharmonic partial's standing pattern: a square-plate Chladni eigenmode
// in a frame rotated by th, sampled over a unit-disc coordinate q (|q|<=1).
// |chladni| gives bright antinode lobes with an irregular dark nodal lace.
// det detunes one wavenumber a touch (drives the slow beating).
float partial(vec2 q, vec2 k, float th, float det) {
  float c = cos(th), s = sin(th);
  vec2 Q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);  // rotate into mode frame
  vec2 ka = k + vec2(det, -det);
  float a = cos(ka.x * Q.x) * cos(ka.y * Q.y)
          - cos(ka.y * Q.x) * cos(ka.x * Q.y);
  return abs(a);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // normalized coords centred, isotropic on the short axis
  float minDim = min(res.x, res.y);
  vec2  p   = (fc - ctr) / (minDim * 0.5);
  float r   = length(p);
  float ang = atan(p.y, p.x);

  vec3 col = BG;

  // ---- palette with house fallback (headless can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // disc geometry: the tam-tam nearly fills the frame.
  const float DISC = 0.94;
  float aa = 2.5 / (minDim * 0.5);
  float inside = 1.0 - smoothstep(DISC - aa, DISC + aa, r);

  float rn = clamp(r / DISC, 0.0, 1.0);
  // disc-space coordinate for the Chladni modes: a wavenumber*coordinate scale
  // (the K-pairs are tuned against this) — the lace fills the whole plate.
  vec2 q = (p / DISC) * 2.2;

  // gentle radial weighting: the rim is slightly quieter than the body so the
  // plate reads as a clamped disc, but NO concentric damping (we want mottle,
  // not rings). Keep the centre from over-piling.
  float bodyW = 1.0 - 0.35 * smoothstep(0.55, 1.0, rn);

  float shimmer = clamp(u_shimmer, 0.0, 1.0);
  float beat    = clamp(u_beatRate, 0.0, 1.0);

  // ---- strike scheduler ---------------------------------------------------
  // Walk a fixed window of strike slots. Each slot is either a FULL strike or a
  // half-strength after-touch (re-excites only the lower partials). Times are
  // hash-jittered so nothing lands on a metronome. We track two envelopes that
  // decay at different rates so the texture coarsens during a ring-down:
  //   envFull  drives the upper partials (decays faster -> sparkle dies first)
  //   envLow   drives the broad fundamental lobes (decays slower -> lingers)
  // plus envFlash for the sharpest partial (very fast -> first ~second only).
  float gap   = max(u_strikeGap, 2.0);
  float ring  = max(u_ringTime, 1.0);
  float idxNow = floor(t / gap);

  float envFull  = 0.0;   // upper-partial envelope (sparkle)
  float envLow   = 0.0;   // fundamental / low-mid envelope (broad lobes)
  float envFlash = 0.0;   // sharpest partial — first second after a full strike

  for (int i = 0; i < 5; i++) {
    float k   = idxNow - float(i);
    float jit = (hash11(k) - 0.5) * gap * 0.6;
    float st  = k * gap + jit;
    float dt  = t - st;
    if (dt > 0.0) {
      float attack = smoothstep(0.0, 0.18, dt);
      // is this an after-touch? ~40% of events; half strength, lower-only
      float isAfter = step(hash11(k + 3.0), 0.4);
      float ampHash = 0.75 + 0.5 * hash11(k + 7.0);

      // full strike: both envelopes; after-touch: only the low envelope, halved
      float full = (1.0 - isAfter) * ampHash;
      float aft  = isAfter * 0.5 * ampHash;

      float decFast = exp(-dt / (ring * 0.42));   // upper partials die fast
      float decSlow = exp(-dt / ring);            // fundamental lingers
      float decFlash = exp(-dt / (ring * 0.16));  // flash: ~first second

      envFull  += attack * decFast  * full;
      envLow   += attack * decSlow  * (full + aft);   // after-touch swells lobes
      envFlash += attack * decFlash * full;
    }
  }

  // faint always-present residual figure so the disc never goes empty and the
  // plate keeps a readable, parameter-sensitive mottle even between strikes.
  float residual = 0.16 + 0.05 * sin(t * 0.37);

  // ---- slow beating between near-ratio partials --------------------------
  // A small time-varying detune applied with opposite sign to a near-ratio
  // pair (K2 vs K3) so their laces drift against each other; beat=0 stills it.
  float beatPhase = t * (0.18 + 0.55 * beat);
  float det = beat * 1.9 * sin(beatPhase);   // radial-wavenumber detune
  // counterpoise amplitude breathing: the two near-ratio partials wax and wane
  // in OPPOSITE phase, so regions of the gong trade brightness while nothing
  // travels. At beat=0 both sit at unity (no beating at all).
  float beatAmp = beat * 0.8 * sin(beatPhase * 0.83 + 1.3);
  float waxA = 1.0 + beatAmp;   // low-mid partial waxes...
  float waxB = 1.0 - beatAmp;   // ...as the mid partial wanes (counterpoise)

  // ---- five fixed inharmonic partials ------------------------------------
  // fundamental (broad lobes) — always lit by envLow + residual, tint c1
  float a1 = (envLow + residual) * bodyW;
  float w1 = partial(q, K1, TH1, 0.0);

  // low-mid — beats AGAINST the mid partial (+det), tint c0, follows envLow
  float a2 = (envLow + residual * 0.5) * bodyW * waxA;
  float w2 = partial(q, K2, TH2, +det);

  // upper partials carry a faint always-on residual term too, so SHIMMER also
  // grades the texture grain during the quiet passages (not only just after a
  // strike) while still swelling hugely under a fresh strike's envFull.
  float upper = (envFull + residual * 0.7) * bodyW * shimmer;

  // mid — beats against low-mid (-det), tint c2, the finer mottle (shimmer)
  float a3 = upper * waxB;
  float w3 = partial(q, K3, TH3, -det);

  // upper — finer mottle, tint blends c2/c0, shimmer-gated
  float a4 = upper;
  float w4 = partial(q, K4, TH4, +det * 0.5);

  // sharpest — the strike flash, tint c3, flashes only just after a full strike
  float a5 = envFlash * bodyW * shimmer;
  float w5 = partial(q, K5, TH5, 0.0);

  // sharpen antinode bands so the irregular nodal lace reads as crisp darks
  w1 = pow(w1, 1.3);
  w2 = pow(w2, 1.5);
  w3 = pow(w3, 1.7);
  w4 = pow(w4, 1.9);
  w5 = pow(w5, 2.0);

  // per-partial glow contributions
  float g1 = a1 * w1 * 0.62;
  float g2 = a2 * w2 * 0.40;
  float g3 = a3 * w3 * 0.34;
  float g4 = a4 * w4 * 0.30;
  float g5 = a5 * w5 * 0.46;

  // ---- tinted accumulation (each partial owns a hue) ----------------------
  // fundamental c1 broad lobes; mids stipple c0 & c2; sharpest flashes c3.
  vec3 glow = c1 * g1
            + c0 * g2
            + c2 * g3
            + mix(c2, c0, 0.5) * g4
            + c3 * g5;

  // a gentle radius hue drift over the whole sum keeps it from going monochrome
  // in the dark passages (warms the rim, cools the core) without moving texture.
  vec3 rimTint = mix(c2, c3, smoothstep(0.4, 1.0, rn));
  glow += rimTint * (g1 + g2) * 0.12;

  col += glow * inside;

  // ---- rim hairline of edge light, warming briefly at each full strike ----
  float rim = exp(-abs(r - DISC) / (3.5 / (minDim * 0.5)));
  float strikeWarm = clamp((envFull + envLow) * 0.6, 0.0, 1.3);
  vec3  rimCol = mix(c3, mix(c3, vec3(1.0, 0.78, 0.42), 0.6), strikeWarm);
  col += rimCol * rim * (0.30 + 0.50 * strikeWarm) * inside;

  // subtle vignette outside the disc keeps the field near-black
  float vign = 1.0 - smoothstep(0.97, 1.6, r);
  col *= vign;

  // gentle tonemap to tame the brightest antinodes without washing out
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
