// fringe (Knell) — two unseen exciters pinch a dark glass sheet at two points.
// The standing field is the sum of two radial cosines, cos(k*d1) + cos(k*d2),
// sharing one temporal envelope: where crests reinforce, bright lozenge fringes
// glow; where they cancel, hyperbolic nodal curves stay perfectly dark and
// pinned. Hue is keyed by path difference d1-d2 — the zero-order centre fringe
// takes palette colour 2, alternate orders step outward through 0 and 1, and
// colour 3 hugs the hot collars at each source. A hash-scheduled strike floods
// the whole figure with shimmer, then it rings down exponentially toward
// stillness. Nothing travels; only brightness lives and dies.
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
uniform float u_split;       // CSS-px distance between the two exciters (default 210), scaled by u_pixelRatio
uniform float u_wavelength;  // CSS-px wavelength of the standing field   (default 26),  scaled by u_pixelRatio
uniform float u_strikeGap;   // mean seconds between strikes               (default 12)
uniform float u_ringTime;    // exponential decay constant of the envelope (default 6)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU      = 6.2831853;
const int   STRIKES  = 14; // number of recent strike events summed (constant loop bound)

// cheap hash -> 0..1
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

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

  // --- param guards: keep the whole min..max range safe ---
  float split   = max(u_split, 1.0)      * pr;        // exciter separation in device px
  float wavelen = max(u_wavelength, 4.0)  * pr;        // standing-field wavelength
  float gap     = max(u_strikeGap, 1.0);              // mean seconds between strikes
  float ring    = max(u_ringTime, 0.5);               // decay constant

  float k = TAU / wavelen; // spatial frequency of the field

  // ---------------------------------------------------------------------------
  // Strike scheduler. Strikes happen at hash-jittered times ~gap apart. Each
  // strike floods the field (amp -> 1) and rings down as exp(-age/ring). Some
  // strikes re-place the exciter axis/centre; we crossfade placement under the
  // attack so nothing snaps. We also track a per-source flood so a strike can
  // re-hit only ONE source mid-decay (leaning the figure toward rings).
  // ---------------------------------------------------------------------------
  float idxNow = floor(t / gap); // current strike index (advances ~1 per gap)

  float env    = 0.0;            // shared amplitude envelope (sum of ring-downs)
  float envA   = 0.0;            // extra flood biased to source A
  float envB   = 0.0;            // extra flood biased to source B
  // crossfaded placement parameters (weighted by each strike's living amplitude)
  vec2  ctrAcc = vec2(0.0);      // accumulated centre offset (css px * pr)
  float angAcc = 0.0;           // accumulated axis angle (sin/cos pair below)
  vec2  dirAcc = vec2(0.0);
  float wsum   = 0.0;

  for (int i = 0; i < STRIKES; i++) {
    float idx = idxNow - float(i);
    if (idx < 0.0) continue;

    float h0 = hash11(idx * 1.000 + 7.13);
    float h1 = hash11(idx * 2.731 + 1.91);
    float h2 = hash11(idx * 3.119 + 4.27);
    float h3 = hash11(idx * 5.077 + 9.55);
    float h4 = hash11(idx * 0.913 + 2.04);

    // actual strike time: gap*idx jittered by +/- ~0.35*gap so it isn't metronomic
    float strikeT = (idx + (h0 - 0.5) * 0.7) * gap;
    float age     = t - strikeT;
    if (age < 0.0) continue;

    // attack (fast rise) * exponential ring-down
    float attack = 1.0 - exp(-age / max(ring * 0.06, 0.03));
    float decay  = exp(-age / ring);
    float a      = attack * decay;

    // "single-source re-strike" flavour: ~35% of strikes flood mostly one source
    float single = step(0.65, h3);
    float pick   = step(0.5, h4); // which source gets the lean
    env  += a;
    envA += a * single * (1.0 - pick);
    envB += a * single * pick;

    // placement for this strike (centre drift + axis angle), crossfaded by amp
    vec2  cOff = (vec2(h1, h2) - 0.5) * res * 0.34; // centre wander within frame
    float ang  = (h0 - 0.5) * TAU;                  // fringe-axis orientation
    ctrAcc += cOff * a;
    dirAcc += vec2(cos(ang), sin(ang)) * a;
    wsum   += a;
  }

  // resolve crossfaded placement (falls back to centred horizontal axis at rest)
  float wn   = max(wsum, 1e-3);
  vec2  fctr = ctr + ctrAcc / wn;
  vec2  dir  = dirAcc / wn;
  if (dot(dir, dir) < 1e-4) dir = vec2(1.0, 0.0);
  dir = normalize(dir);
  vec2  perp = vec2(-dir.y, dir.x);

  // even at rest the field keeps a standing floor so the fringes & motes stay
  // legible; a strike floods it brighter and it rings back down to this floor.
  float amp  = clamp(env, 0.0, 1.0);
  float rest = 0.42;                 // standing floor between strikes
  float A    = mix(rest, 1.0, amp);  // overall field amplitude

  // per-source amplitudes: standing floor + flood + single-source lean
  float ampA = max(rest + amp * 0.55 + envA * 0.7, rest);
  float ampB = max(rest + amp * 0.55 + envB * 0.7, rest);

  // two source points placed along the (drifting) axis about the (drifting) ctr
  vec2 sA = fctr + dir * (split * 0.5);
  vec2 sB = fctr - dir * (split * 0.5);

  float d1 = length(fc - sA);
  float d2 = length(fc - sB);

  // shimmer: a fast, spatially-incoherent tremble that lives only while struck,
  // so antinodes "tremble with glow" without the pattern ever translating.
  float shimmer = 0.85 + 0.15 * sin(t * 9.0 + (d1 + d2) * 0.012) * amp;

  // standing field = sum of two radial cosines (each weighted by its source amp)
  float f1 = cos(k * d1);
  float f2 = cos(k * d2);
  float field = ampA * f1 + ampB * f2;        // ~-1.1..1.1 at rest, more when struck

  // antinode glow: bright where |field| is large (crests reinforce), and the
  // nodal curves (field ~ 0) stay pinned dark. Square for lozenge-shaped lobes.
  float bright = field * field * 0.5;
  bright = bright * shimmer;

  // sharpen the fringes so nodal lines read crisp & black (antialiased)
  float fringe = smoothstep(0.04, 0.7, bright);

  // ---------------------------------------------------------------------------
  // Hue keyed by path difference d1 - d2 (the interference order). Zero-order
  // centre fringe -> colour 2; alternate orders step outward through 0 and 1.
  // ---------------------------------------------------------------------------
  float order = (d1 - d2) / wavelen;          // integer-ish per fringe order
  float ord   = abs(order);
  // map order 0 -> c2, 1 -> c0, 2 -> c1, 3 -> c0, ... (alternate stepping)
  // build cyclic weights on a 0..4 wheel positioned so 0 sits on slot 2.
  float s  = mod(ord * 1.0 + 2.0, 4.0);
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3b = wheelW(s, 3.0);

  // palette + headless fallback (midnight)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 fringeCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3b) / max(w0+w1+w2+w3b, 0.001);

  // ---------------------------------------------------------------------------
  // Compose
  // ---------------------------------------------------------------------------
  vec3 col = BG;

  // radial vignette keeps edges dark, centre luminous
  float vign = 1.0 - smoothstep(0.30, 1.10, length((fc - ctr) / res));

  // the glowing fringe field
  col += fringeCol * fringe * (0.42 + 0.6 * A) * vign;
  // a soft bloom of the raw field for body (no hard edges)
  col += fringeCol * bright * 0.16 * vign;

  // hot collars: colour 3 reserved for tight rings hugging each source point.
  float collarA = exp(-d1 / max(wavelen * 0.9, 1.0));
  float collarB = exp(-d2 / max(wavelen * 0.9, 1.0));
  col += c3 * collarA * (0.35 + 0.9 * ampA) * vign;
  col += c3 * collarB * (0.35 + 0.9 * ampB) * vign;

  // dim resting motes: each source is marked even at rest by a small mote
  float moteA = exp(-d1 * d1 / pow(max(6.0 * pr, 1.0), 2.0));
  float moteB = exp(-d2 * d2 / pow(max(6.0 * pr, 1.0), 2.0));
  col += c3 * (moteA + moteB) * 0.55;

  // gentle tone shaping to avoid blow-out, keep premium glow
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
