// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// toll (Knell) — a great bronze drumhead seen dead-on. One circular disc nearly
// fills the frame over a near-black field, its rim a hairline of edge light. The
// vibration is an analytic sum of three concentric radial partials (radially
// chirped cosines damped by 1/sqrt(r)) plus a faint cos(2*theta) diametral
// partial riding the highest one. Fixed nodal circles stay perfectly dark while
// the annular antinode zones tremble with glow, hue keyed by radius across the
// palette. A hash-scheduled strike floods all partials at once and they ring
// down exponentially — the diametral partial dies first, melting a quartered
// shimmer into clean breathing rings and finally the slow fundamental, never
// letting the disc go empty (a faint residual figure always remains).
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
uniform float u_strikeGap;     // mean seconds between hash-scheduled strikes (default 11)
uniform float u_ringTime;      // exponential ring-down decay constant, seconds (default 6.5)
uniform float u_modeRichness;  // 0..1 fade-in of the upper partials       (default 0.7)

const vec3  BG        = vec3(0.030, 0.028, 0.035); // near-black bronze-dark field
// three radial partials' base wavenumbers (nodal-circle frequencies) and the
// radial chirp that bends each set of nodal rings outward; all const so the
// figure stands perfectly in place and only its brightness lives.
const float K1 = 6.2831853;   // fundamental: a few broad rings
const float K2 = 13.5;        // mid partial
const float K3 = 22.5;        // high partial (carries the diametral rider)
const float CHIRP = 1.6;      // radial chirp (rings crowd toward the rim)

// hash a strike index -> [0,1)
float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // normalized coords centred, isotropic on the short axis; disc radius ~0.92
  float minDim = min(res.x, res.y);
  vec2  p   = (fc - ctr) / (minDim * 0.5);
  float r   = length(p);       // 0 at centre, ~1 near the short-axis edge
  float ang = atan(p.y, p.x);

  vec3 col = BG;

  // ---- palette with house fallback (headless can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // disc geometry: rim hairline + soft mask. The drumhead radius in p-space.
  const float DISC = 0.92;
  float aa = 2.5 / (minDim * 0.5);           // ~2.5px antialias in p-space
  float inside = 1.0 - smoothstep(DISC - aa, DISC + aa, r);

  // radius normalized to the disc (0 centre .. 1 rim), used for partials & hue
  float rn = clamp(r / DISC, 0.0, 1.0);
  // chirped radial phase argument shared shape: base * rn + chirp * rn^2
  float chirpR = rn + CHIRP * rn * rn;

  // damping: antinode amplitude falls as 1/sqrt(radius), guarded near zero so
  // the centre never blows up.
  float damp = 1.0 / sqrt(max(rn, 0.06));
  damp = min(damp, 4.0);

  // ---- strike scheduler: exponential ring-down, hash-jittered start times ----
  // Walk a small fixed set of recent/upcoming strike "slots". Each slot k has a
  // jittered time so no two ring-downs land on a beat. We accumulate the live
  // envelope for the three partials plus a 0.25s soft attack.
  float gap   = max(u_strikeGap, 1.0);
  float ring  = max(u_ringTime, 0.5);
  float idxNow = floor(t / gap);

  float env = 0.0;   // overall ring-down envelope (drives all partials)
  // iterate a constant window of strike slots around now
  for (int i = 0; i < 4; i++) {
    float k  = idxNow - float(i);
    float jit = (hash11(k) - 0.5) * gap * 0.7;     // jitter strike within its slot
    float st  = k * gap + jit;                      // actual strike time
    float dt  = t - st;
    if (dt > 0.0) {
      float attack = smoothstep(0.0, 0.25, dt);     // soft quarter-second attack
      float decay  = exp(-dt / ring);               // exponential ring-down
      // per-strike loudness varies a touch by hash so strikes aren't identical
      float amp    = 0.7 + 0.6 * hash11(k + 7.0);
      env += attack * decay * amp;
    }
  }
  // residual figure: a faint always-present breathing so the disc stays readable
  float residual = 0.10 + 0.05 * sin(t * 0.5);

  // The diametral (high) partial dies first: it rings down on a SHORTER constant
  // so the quartered shimmer melts into clean rings, then into the fundamental.
  float envFast = 0.0;
  for (int j = 0; j < 4; j++) {
    float k  = idxNow - float(j);
    float jit = (hash11(k) - 0.5) * gap * 0.7;
    float st  = k * gap + jit;
    float dt  = t - st;
    if (dt > 0.0) {
      float attack = smoothstep(0.0, 0.25, dt);
      float decay  = exp(-dt / (ring * 0.40));      // faster decay
      float amp    = 0.7 + 0.6 * hash11(k + 7.0);
      envFast += attack * decay * amp;
    }
  }

  // ---- standing-wave partials (radially chirped cosines) ----
  // Each is a fixed spatial pattern; |cos| gives bright antinode bands with
  // perfectly dark nodal circles between them. amplitude = envelope * damping.
  float rich = clamp(u_modeRichness, 0.0, 1.0);

  // fundamental: always present (env + residual), broad breathing rings
  float a1 = (env + residual) * damp;
  float w1 = abs(cos(K1 * chirpR));

  // mid + high partials fade in with MODE_RICHNESS
  float a2 = env * damp * rich;
  float w2 = abs(cos(K2 * chirpR));

  float a3 = env * damp * rich;
  float w3 = abs(cos(K3 * chirpR));

  // faint cos(2*theta) diametral partial riding the highest radial partial;
  // it uses the fast envelope so it dies first (quartered -> rings). The
  // angular term is squared so the figure genuinely quarters — bright lobes on
  // one axis, dark on the orthogonal axis — rather than just brightening evenly.
  float diametral = cos(2.0 * ang);
  diametral = diametral * diametral;            // 0..1, sharp dark cross
  float aD = envFast * damp * rich * 0.85;
  float wD = abs(cos(K3 * chirpR)) * diametral;

  // sharpen antinode bands a bit so nodal lines read as crisp darks
  w1 = pow(w1, 1.6);
  w2 = pow(w2, 1.8);
  w3 = pow(w3, 1.8);
  wD = pow(wD, 1.6);

  // The diametral rider modulates the whole high-partial region (not just its
  // own bands) so the quartered dark cross is plainly visible while it lives.
  float quarter = mix(1.0, diametral, clamp(aD, 0.0, 1.0));
  float glow = a1 * w1 * 0.55
             + (a2 * w2 * 0.42 + a3 * w3 * 0.40) * quarter
             + aD * wD * 0.30;

  // ---- hue keyed by radius across the palette ----
  // innermost antinode -> c0, blending out through c1, c2 toward c3 at the rim.
  vec3 hue;
  if (rn < 0.3333) {
    hue = mix(c0, c1, rn / 0.3333);
  } else if (rn < 0.6667) {
    hue = mix(c1, c2, (rn - 0.3333) / 0.3334);
  } else {
    hue = mix(c2, c3, (rn - 0.6667) / 0.3333);
  }

  // compose the trembling antinode glow inside the disc
  col += hue * glow * inside;

  // ---- rim hairline of edge light, warming briefly at each strike ----
  float rim = exp(-abs(r - DISC) / (3.5 / (minDim * 0.5)));
  float strikeWarm = clamp(env * 0.9, 0.0, 1.4);
  vec3  rimCol = mix(c3, mix(c3, vec3(1.0, 0.78, 0.42), 0.6), strikeWarm); // warms on strike
  col += rimCol * rim * (0.35 + 0.55 * strikeWarm);

  // subtle radial vignette outside the disc keeps the field near-black
  float vign = 1.0 - smoothstep(0.95, 1.6, r);
  col *= vign;

  // gentle tonemap to tame the brightest antinodes without washing out
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
