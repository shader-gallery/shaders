// anemone (Bloom) — a single sea-anemone-like organism anchored off-centre,
// about a third in from one corner. A ring of soft tentacle lobes built from
// polar petal SDFs is rim-lit against near-black, with a dim warm core glow at
// the ring's heart. Lobe colour blends around the ring through all four palette
// colours, desaturating toward the tips so it reads as one body. The whole ring
// flexes open and closed on a long eased breath, each lobe phase-offset so the
// contraction ripples around the organism like a slow wave; tips sway on a
// gentler secondary sine. All motion is sinusoidal — it loops with no reset.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_breathSpeed;  // rate of the open/close easing cycle  (default 0.6)
uniform float u_ringRadius;   // lobe-ring radius in css px           (default 180)
uniform float u_lobeCount;    // tentacle lobe count, floored         (default 14)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TWO_PI   = 6.28318530718;

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

  vec3 col = BG;

  // --- palette with midnight fallback (headless can leave the array zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // organism anchored off-centre, ~a third in from the lower-left corner
  vec2  organ = vec2(0.36, 0.40) * res;
  vec2  p     = fc - organ;

  // polar coords around the organism's heart
  float ang   = atan(p.y, p.x);          // -PI..PI
  float r     = length(p);

  // lobe count: floored param, guarded so a 0-fed uniform can't divide by zero
  float lobes = max(floor(u_lobeCount + 0.5), 3.0);

  // eased breath: a long sinusoidal open/close cycle. 0 = contracted, 1 = open.
  float breath = 0.5 - 0.5 * cos(t * u_breathSpeed * 0.55);
  // ease it so the organism dwells at the extremes (smoothstep-style ease)
  breath = breath * breath * (3.0 - 2.0 * breath);

  // continuous lobe index/phase around the ring (no dynamic array indexing)
  float a01   = ang / TWO_PI + 0.5;       // 0..1 around the ring
  float lobePos = a01 * lobes;            // which lobe + fractional position
  float lobeId  = floor(lobePos);
  float lobeF   = fract(lobePos);         // 0..1 across one lobe

  // ripple: each lobe contracts slightly out of phase, so the breath travels
  // around the organism like a slow wave instead of pulsing all at once
  float ripplePh = lobeId / lobes * TWO_PI;
  float ripple   = 0.5 - 0.5 * cos(t * u_breathSpeed * 0.55 - ripplePh);
  ripple = ripple * ripple * (3.0 - 2.0 * ripple);
  // blend the global breath with the per-lobe rippled breath
  float open = mix(breath, ripple, 0.55);

  // ring geometry in device px; tips reach further out as the organism opens
  float ringR  = u_ringRadius * pr;
  float reach  = ringR * mix(0.42, 1.0, open);     // tentacle length swells/shrinks
  float lobeHalf = (TWO_PI / lobes) * 0.5;          // angular half-width of a lobe

  // gentler secondary sway: tips wag side to side on a slower private sine
  float sway = sin(t * u_breathSpeed * 0.32 + lobeId * 1.7) * lobeHalf * 0.35;

  // petal SDF in polar space: angular distance from this lobe's centre line,
  // shaped into a soft tapering tentacle that's fat at the base, thin at the tip
  float lobeC   = (lobeId + 0.5) / lobes;           // lobe centre in 0..1
  float dAng    = (a01 - lobeC);
  dAng -= floor(dAng + 0.5);                          // wrap to nearest [-0.5,0.5]
  dAng = dAng * TWO_PI + sway;                        // radians from lobe axis

  // radial profile: 0 at heart, 1 at the tentacle tip
  float rN = r / max(reach, 1.0);

  // perpendicular distance from the lobe's centre axis, in device px. Working in
  // real px (not angle) keeps the AA stroke a constant thickness everywhere and
  // stops far-out regions collapsing into needle-thin spokes.
  float perp = abs(sin(dAng)) * r;

  // hard radial envelope: clamp the whole organism inside its current reach so
  // no on-axis sliver can trail out to the frame edge as a thin spoke
  float reachM = 1.0 - smoothstep(0.90, 1.04, rN);

  // tentacle half-width profile (px): swells from the base, fattest at mid-body,
  // then closes to a rounded point at the tip — a plump lobe, never a needle.
  // Scales with the angular gap between lobes so neighbours nearly touch.
  float gapPx   = lobeHalf * reach;                  // ~half spacing at the tip
  float fat     = sin(clamp(rN, 0.0, 1.0) * 3.14159265); // 0 at base/tip, 1 mid
  float widthPx = gapPx * (0.16 + 0.80 * fat);        // closes at the tip
  float aa      = 2.0 * pr;                           // constant-width edge AA

  // body masks: within the lobe wall, within reach, hollow heart at the centre
  float sideM = (1.0 - smoothstep(widthPx - aa, widthPx + aa, perp)) * reachM;
  float baseM = smoothstep(0.06, 0.20, rN);          // hollow ring centre
  float tipM  = reachM;                               // alias: soft rounded tip
  float body  = sideM * baseM;

  // normalised across-the-lobe coord for rim/colour shaping (0 axis, 1 edge)
  float across = perp / max(widthPx, 1e-3);

  // rim light: brighten the silhouette walls and the rounded tip
  float rim = smoothstep(0.45, 0.98, across) * sideM
            + smoothstep(0.74, 1.0, rN) * tipM * sideM;

  // colour blends around the ring through all four palette entries; desaturate
  // toward the tips so the whole organism reads as one body, not a colour wheel
  float s   = fract(lobeC + t * 0.01) * 4.0;
  float w0  = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
  float lum = dot(hue, vec3(0.299, 0.587, 0.114));
  vec3  tipCol = mix(hue, vec3(lum), 0.72);          // desaturated pale tip
  vec3  lobeCol = mix(hue, tipCol, smoothstep(0.15, 1.0, rN));

  // brightness swells as a lobe opens; soft interior fill + bright rim
  float swell = mix(0.45, 1.0, open);
  col += lobeCol * body * 0.45 * swell;
  col += lobeCol * rim  * 0.85 * swell;

  // soft outer bloom hugging each tentacle so edges glow rather than hard-cut,
  // contained within the lobe's reach so it doesn't trail off as a long streamer
  float bloom = tipM * (1.0 - smoothstep(0.10, 1.0, rN))
              * exp(-(perp * perp) / (widthPx * widthPx * 1.8 + 1.0));
  col += lobeCol * bloom * 0.22 * swell;

  // dim warm core glow at the ring's heart, breathing with the organism
  vec3  warm  = normalize(c0 + c3 * 1.4 + vec3(0.25, 0.12, 0.04)) * 1.2;
  float core  = exp(-r * r / (ringR * ringR * 0.10));
  col += warm * core * mix(0.10, 0.30, breath);

  // gentle vignette keeps the corners dark and the body luminous
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - res * 0.5) / res));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
