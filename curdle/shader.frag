// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// curdle (Gyre) — a pale drop falls into dark tea: a bright blob blooms at a
// hashed position, its crisp boundary progressively stretched and folded by
// accumulating curl-noise warp as it ages, winding into high-contrast filament
// tendrils that coil back into themselves, then dissolving to a ghost of
// palette-tinted threads on near-black before its hash repositions it. Two drops
// run on staggered half-cycle phases so the frame is never empty. Everything
// obeys one slow shared current (the curl field), media folding into themselves.
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
uniform float u_dropPeriod;  // seconds per drop life cycle   (default 16)
uniform float u_fold;        // accumulated warp strength      (default 1.1)
uniform float u_dropSize;    // fresh-drop radius, css px      (default 180)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU         = 6.2831853;

// --- value-noise scaffolding (no textures; constant loop bounds) -------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + 19.19));
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fractal noise as a scalar potential field
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(7.1, 3.3);
    a *= 0.5;
  }
  return s;
}

// curl of the fbm potential → divergence-free flow that swirls without sinks,
// so media fold into themselves rotating locally while going nowhere globally
vec2 curl(vec2 p) {
  float e = 0.18;
  float n1 = fbm(p + vec2(0.0, e));
  float n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0));
  float n4 = fbm(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

// One drop: given a normalized phase (0..1 over its own cycle) and a cycle index
// (selects the hashed bloom position), returns ink density + a tint coordinate.
// Accumulates curl warp so early motion is fast, late motion glacial.
vec3 dropLayer(vec2 uv, float phase, float cyc, float fold, float radius) {
  // hashed bloom centre for this cycle, kept inside a TIGHT composed safe frame
  // so a drop never drifts so far off-axis that its luminous body leaves frame —
  // both staggered drops stay near the middle band, keeping the composition
  // balanced and avoiding large flat-black swaths.
  vec2 h = hash22(vec2(cyc * 1.7 + 0.5, cyc * 0.9 + 2.3));
  vec2 centre = (h - 0.5) * vec2(0.70, 0.48);

  // life envelopes over the cycle: bloom in, then dim/dissolve to black.
  // grow: drop expands & sharpens early.  fade: thins to a ghost, gone by ~0.97
  float grow = smoothstep(0.0, 0.10, phase);
  float fade = 1.0 - smoothstep(0.62, 0.99, phase);
  float life = grow * fade;
  if (life <= 0.0) return vec3(0.0);

  // warp accumulation: integral-like ramp that is steep early and flattens late
  // (sqrt-ish), so a drop winds fast at first then crawls — "glacial" old age.
  // A floor keeps even low-fold drops visibly winding (not a colourless wobble),
  // so the "restrained rainbow" still reads at the bottom of the fold slider.
  float accum = (0.45 + fold) * (1.0 - pow(1.0 - phase, 1.8)) * 2.6;

  // advect the sample point backward through the shared slow current, in two
  // folding passes so tendrils coil back into themselves (domain-warped twice)
  vec2 p = uv - centre;
  float fieldScale = 2.3;
  vec2 q = p;
  q += accum * 0.55 * curl(p * fieldScale + vec2(cyc * 3.1, 0.0));
  q += accum * 0.42 * curl(q * fieldScale * 1.7 + vec2(0.0, cyc * 2.2 + 11.0));
  q += accum * 0.22 * curl(q * fieldScale * 3.0 - vec2(cyc * 1.5, 4.0));

  // crisp drop boundary in warped space: a tight smoothstep edge keeps folds
  // sharp.  As phase advances the edge softens slightly & the interior dims so
  // thinning tendrils blur toward the background.
  float r = length(q);
  float rad = radius;
  // edge tightness: very crisp while young, a touch softer as it dissolves
  float edge = mix(0.012, 0.085, smoothstep(0.2, 0.95, phase));
  float core = 1.0 - smoothstep(rad - edge, rad + edge, r);

  // filament structure: the folded field carries thin high-contrast threads.
  // sample a second warped scalar so interiors show winding striations, not a
  // flat disc, once the drop starts stretching.
  float fil = fbm(q * 4.5 + vec2(cyc * 5.0, 3.0));
  float threads = smoothstep(0.46, 0.64, fil);          // crisp thread cores
  float stretch = smoothstep(0.05, 0.45, phase);        // threads emerge as it ages
  // interiors blur and dim toward the background as the tendrils thin, but keep
  // a higher floor so a dissolving drop stays a visibly palette-tinted ghost
  // rather than collapsing to grey near-black mid-life.
  float interiorDim = mix(0.90, 0.34, stretch);

  // density = solid young blob → high-contrast winding threads. The thread term
  // is boosted (and its weight grows with stretch) so mid/late life reads as
  // luminous tinted filaments, not a murky smudge.
  float density = core * interiorDim + core * threads * stretch * 1.7;

  // a hair of glow just outside the crisp edge so folds catch light
  float halo = (1.0 - smoothstep(rad, rad + edge * 3.0, r)) * 0.22;
  density += halo * core;

  density *= life;

  // tint coordinate winds along the tendril (uses warped angle + thread value)
  float tintc = fract(atan(q.y, q.x) / TAU + fil * 0.5 + cyc * 0.37);

  return vec3(density, tintc, life);
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

  // aspect-correct uv centred at 0, ~[-1,1] on the short axis
  float minDim = min(res.x, res.y);
  vec2  uv = (fc - ctr) / (minDim * 0.5);

  // drop radius in uv units from css px. The 0.62 keeps a default ~220css drop a
  // generous-but-composed fraction of the frame (luminous body, not a full-field
  // wash) while preserving the css-px scaling so the param reads proportionally
  // across the range.
  float radius = clamp(u_dropSize, 30.0, 480.0) * pr * 0.62 / (minDim * 0.5);
  float fold   = max(u_fold, 0.0);

  // drop period in seconds (guard against 0)
  float period = max(u_dropPeriod, 1.0);

  // two drops staggered by half a cycle. Each gets its own running phase and a
  // cycle index that advances every period → re-hashes the bloom position only
  // after the previous drop has faded fully to black (overlap hides any reset).
  float gp0 = t / period;            // global progress, drop A
  float gp1 = gp0 + 0.5;             // drop B, half-cycle ahead
  float cyc0 = floor(gp0);
  float cyc1 = floor(gp1);
  float ph0  = fract(gp0);
  float ph1  = fract(gp1);

  vec3 dA = dropLayer(uv, ph0, cyc0,        fold, radius);
  vec3 dB = dropLayer(uv, ph1, cyc1 + 17.0, fold, radius * 0.94);

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  // faint ambient fluid medium (the dark tea the drops fall into) so the void reads
  // as slowly-swirling tinted liquid, not flat black — in-shader fill replacing the
  // old gradient backdrop, built from the same curl/fbm current the drops obey.
  vec2  mq   = uv * 1.4 + 0.30 * curl(uv * 1.1 + vec2(t * 0.03, 0.0));
  float md   = fbm(mq + vec2(t * 0.02, -t * 0.015)) * 0.6
             + fbm(mq * 2.1 + 7.0 - vec2(0.0, t * 0.025)) * 0.4;
  float ms   = md * 4.0;
  vec3  medCol = (c0 * wheelW(ms,0.0) + c1 * wheelW(ms,1.0)
                + c2 * wheelW(ms,2.0) + c3 * wheelW(ms,3.0))
               / max(wheelW(ms,0.0)+wheelW(ms,1.0)+wheelW(ms,2.0)+wheelW(ms,3.0), 0.001);
  col += medCol * (0.045 + 0.075 * md);

  // composite each drop: bright pale core blended toward palette tint along the
  // tendrils, dimming with the drop's life so it ends as ghost threads.
  for (int i = 0; i < 2; i++) {
    vec3 d = (i == 0) ? dA : dB;
    float density = d.x;
    if (density <= 0.0) continue;
    float tintc = d.y;
    float life  = d.z;

    // palette colour winding along the tendril (no dynamic array indexing).
    // boost saturation of the wheel-blended tint so the restrained rainbow still
    // sings at low fold / small drop, instead of reading as a grey wash.
    float s  = tintc * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
    float tlum = dot(tint, vec3(0.299, 0.587, 0.114));
    tint = clamp(mix(vec3(tlum), tint, 1.35), 0.0, 1.0); // push chroma

    // young drop is pale/bright (a drop of cream) only at its very peak; the pale
    // wash is kept restrained so palette colour is always legible, and as the
    // drop ages it leans fully into saturated tint rather than dimming to grey.
    float paleAmt = clamp(life, 0.0, 1.0);
    vec3 pale = mix(tint, vec3(0.82, 0.88, 1.0), 0.32 * paleAmt);
    vec3 ink  = mix(tint, pale, paleAmt);

    // contrast curve: crisp folds read as high-contrast filaments. The overall
    // brightness floor is raised and the life-dependent term widened so mid/late
    // tendrils keep visible luminous palette tint, not a near-black smudge.
    float v = clamp(density, 0.0, 1.5);
    col += ink * v * (0.62 + 0.46 * life);
  }

  // gentle radial vignette keeps the frame composed and edges dark
  float vign = 1.0 - smoothstep(0.45, 1.2, length((fc - ctr) / res));
  col *= mix(0.65, 1.0, vign);

  // soft tonemap so bright cores bloom without blowing out to flat white
  col = col / (1.0 + col * 0.85);

  gl_FragColor = vec4(col, 1.0);
}
