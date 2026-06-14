// throat (Delve) — an ice-cave throat swallowing the view. Concentric shelves of
// translucent ice whose boundaries are not circles but organic angular contours,
// each ring radius displaced by frozen angular FBM so the walls undulate like
// melt-sculpted glass. The log-radius axis is sliced into shelves; each boundary
// carries a cold rim light pooling in the bays of the undulation, shelf interiors
// hold a faint blue-leaning translucency, and an exponential gullet of true black
// waits at center. Shelf tint slides through the four palette colours by depth
// phase while rim highlights borrow the next colour inward. Nothing rotates or
// translates — the only verb is scale-travel: shelves and their frozen wobble
// descend the scale axis together, the wrap hidden by self-similar crossfade.
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
uniform float u_descentSpeed;  // scale-octaves/sec the shelves are swallowed (default 0.1)
uniform float u_wobble;        // organic contour displacement amplitude 0..1 (default 0.7)
uniform float u_shelfDensity;  // ice shelves per scale octave              (default 4)
uniform float u_iceGlow;       // cold rim light brightness                 (default 1.0)
uniform float u_centerX;       // focal-point x offset, short-axis units    (default 0)
uniform float u_centerY;       // focal-point y offset, short-axis units    (default 0)
uniform float u_mouseShift;    // focal glides toward the pointer            (default 0.35)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TWO_PI   = 6.2831853;
const float LOG2     = 0.6931472;
const float ANG_CELLS = 7.0;                      // lobes around the throat == angular noise period

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// blend the four palette entries by a 0..4 wheel position (no dynamic indexing)
vec3 wheel(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float s) {
  s = mod(s, 4.0);
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// smooth 1-D value noise on a cyclic angular axis (period built by the caller via
// integer cells); hash is the classic sin-fract, stable under headless-gl.
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float pvnoise(float x, float period) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i,        period);              // wrap the cell index...
  float i1 = mod(i + 1.0,  period);              // ...and its neighbour, so it tiles
  return mix(hash1(i0), hash1(i1), u);
}

// Angular FBM frozen in (angle, log-depth) space. `a` is the seamless angular
// coordinate (cells per turn baked in by caller), `z` shifts the noise field per
// shelf so adjacent shelves don't share an identical contour. Returns ~ -1..1.
float angFBM(float a, float z) {
  float v = 0.0;
  v += 0.55 * pvnoise(a + z,                    ANG_CELLS);
  v += 0.27 * pvnoise(a * 2.0 + z * 1.7 + 11.3, ANG_CELLS * 2.0);
  v += 0.13 * pvnoise(a * 4.0 + z * 2.3 + 23.1, ANG_CELLS * 4.0);
  v += 0.05 * pvnoise(a * 8.0 + z * 3.1 + 47.7, ANG_CELLS * 8.0);
  return (v / 0.55) * 2.0 - 2.0; // normalize ~0..1 range then map toward -1..1
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // aspect-correct centred coordinates, normalized to the short dimension so the
  // throat reads as a circle regardless of tile shape
  float minDim = min(res.x, res.y);
  // static movable focal (deliberate recenter), then a real DEPTH parallax from the mouse:
  // outer (near) shelves slide toward the pointer while the deep centre holds.
  vec2  mraw = u_mouse;
  if (dot(mraw, mraw) < 1.0) mraw = ctr;
  vec2  mN    = (mraw - ctr) / (minDim * 0.5);
  vec2  p0  = (fc - ctr) / (minDim * 0.5) - vec2(u_centerX, u_centerY);
  float r0  = length(p0);
  vec2  parallax = mN * (0.18 * max(u_mouseShift, 0.0));
  vec2  p   = p0 - parallax * smoothstep(0.0, 0.85, r0);
  float ang = atan(p.y, p.x);            // -PI..PI
  float r   = length(p);

  // --- palette (house fallback block) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // log-radius axis: small r -> very negative; this is the scale coordinate.
  // guard against r==0 (the focal singularity) so logRad never goes to -inf.
  float rg     = max(r, 1e-4);
  float logRad = log(rg) / LOG2;          // log2(radius): one unit per octave

  // seamless angular coordinate. We want the FBM to wrap exactly once per turn:
  // map angle to 0..1, scale by an integer cell count so floor()-cell hashing is
  // periodic, and add the matching wrap so vnoise reads identically at +/-PI.
  float ua = (ang / TWO_PI) + 0.5;        // 0..1
  float aSeam = ua * ANG_CELLS;           // 0..ANG_CELLS, integer-periodic

  // shelves per octave; guard the divide for the param's full range
  float dens   = max(u_shelfDensity, 0.5);
  // descent: shelves + frozen wobble travel inward along the scale axis with time.
  // Phase is tied to (log-depth) minus (time in octaves) so the wrap is
  // perfectly phase-continuous and self-similar across each octave.
  float travel = t * u_descentSpeed;      // octaves swallowed so far
  float depth  = logRad + travel;         // co-moving log-depth (decreases inward)
  float shelfPos = depth * dens;          // shelf coordinate; integer = a boundary

  // frozen wobble field sampled in (angle, log-depth). Tying the noise z-shift to
  // floor(shelfPos) freezes a distinct contour into each shelf; because depth
  // carries +travel, the whole field rides inward rigidly with the descent.
  float shelfId  = floor(shelfPos);
  float wob      = angFBM(aSeam, shelfId * 0.91); // ~ -1..1

  // displace the shelf boundary by the wobble. amplitude capped so shelves never
  // self-intersect (|disp| < 0.5 of a shelf even at WOBBLE=1). WOBBLE=0 -> clean
  // circular rings.
  float amp      = clamp(u_wobble, 0.0, 1.0) * 0.42;
  float disp     = wob * amp;
  float local    = fract(shelfPos) - 0.5; // -0.5..0.5 within the shelf
  float edge     = local - disp;          // signed distance (in shelf-units) to wall

  // --- cold rim light along each shelf boundary ---
  // the boundary sits where edge crosses 0 (and at +/-0.5 between shelves). a thin
  // anti-aliased rim, its brightness modulated by the SAME wobble so the glow
  // pools in the bays (where the contour bulges inward, wob<0 -> brighter rim).
  // analytic edge softness (no derivative extension): shelfPos changes by
  // dens/(ln2*r) per unit radius, and one device pixel spans ~2/minDim in r, so
  // one pixel ~ dens*2/(ln2*r*minDim) shelf-units. Widen toward the rim so the
  // outermost coarse shelves stay smooth and the inner fine ones don't dissolve.
  float pxR   = 2.0 / minDim;                  // radius covered by one screen px
  float aaw   = dens * pxR / (LOG2 * rg) * 1.6 + 0.012; // screen-space edge softness
  float rimD  = abs(edge);
  float rim   = 1.0 - smoothstep(0.0, 0.10 + aaw, rimD);
  // a second rim at the half-shelf seam keeps boundaries dense without aliasing
  float seamD = abs(fract(shelfPos + 0.5) - 0.5 - disp);
  rim         = max(rim, (1.0 - smoothstep(0.0, 0.08 + aaw, seamD)) * 0.6);
  // pooling: bays (wob<0) glow brighter, crests dimmer
  float pool  = 0.55 + 0.45 * (0.5 - 0.5 * wob);
  rim        *= pool;

  // --- faint blue-leaning translucency of the shelf interior ---
  float interior = 1.0 - smoothstep(0.05, 0.5, rimD); // soft fill away from rim
  interior      *= 0.18;

  // --- colour by depth phase: shelf tint slides through the palette by depth ---
  // use the moving co-moving depth so the hue scrolls inward with the ice. rim
  // highlights borrow the NEXT colour inward (one wheel step ahead).
  float hueSpeed = 0.7;
  float phase    = depth * hueSpeed;
  vec3  shelfTint = wheel(c0, c1, c2, c3, phase);
  vec3  rimTint   = wheel(c0, c1, c2, c3, phase + 1.0);

  // blue-lean the interior translucency a touch toward c2 (the cyan/cold hue)
  vec3 fillCol = mix(shelfTint, c2, 0.35);

  vec3 col = BG;
  col += fillCol * interior;
  col += rimTint * rim * (0.9 * u_iceGlow);

  // soft bloom around each rim so the ice catches light
  float bloom = exp(-rimD * 7.0);
  col += rimTint * bloom * (0.22 * u_iceGlow) * pool;

  // --- exponential gullet of true black waits at center ---
  // crush everything to black as r -> 0; smooth so there is no hard disc edge.
  float gullet = smoothstep(0.0, 0.16, r);
  col *= gullet;

  // edge of frame: gentle fade so the outermost newborn shelf doesn't pop in at
  // the tile border (self-similar crossfade with the gullet on the far side).
  float frameFade = 1.0 - smoothstep(0.92, 1.25, r);
  col *= frameFade;

  // overall depth dimming: far (large r) shelves a touch dimmer so the eye is
  // drawn inward toward the focal depth
  float depthDim = mix(1.0, 0.7, smoothstep(0.1, 1.1, r));
  col *= depthDim;

  gl_FragColor = vec4(col, 1.0);
}
