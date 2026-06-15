// niello (Burnish) — a niello panel read in negative. The ground is true to the
// craft: thousands of tiny punch marks stippled edge-to-edge into the black
// alloy, every punch a candidate micro-glint catching light for an instant in
// palette-tinted sparks, so the field scintillates like coal dust under
// lamplight. Across it runs the strapwork interlace, burnished mirror-smooth:
// it never twinkles and is legible only as a figure of perfect stillness — an
// ornament made of absence, disclosed by where the shimmer is NOT.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glint colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_twinkleRate; // frequency of the punch-mark glints   (default 1)
uniform float u_punch;       // stipple spacing in CSS px            (default 4.5)
uniform float u_figure;      // how fully the strapwork kills shimmer (default 0.8)
uniform float u_patScale;    // interlace weave frequency            (default 1.6)
uniform float u_patRot;      // interlace rotation in degrees        (default 0)
uniform float u_random;      // randomise the interlace layout       (default 0)
uniform float u_twinkleSpeed;// animation tempo of the glints        (default 1)
uniform float u_strapWidth;  // ribbon thickness of the figure       (default 0.27)
uniform float u_weaveMix;    // diagonal basket <-> orthogonal grid  (default 0.5)
uniform float u_medallion;   // strength of the medallion rings      (default 1)
uniform float u_medCount;    // how many medallions across the panel (default 3)

const vec3  BG          = vec3(0.030, 0.030, 0.038); // near-black niello alloy
const float STILL_DIM   = 0.16;  // residual stipple brightness when rate -> 0
const float STRAP_CSS   = 150.0; // strapwork interlace cell size (css px)

// --- hashes (no textures; pure arithmetic) ---
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// --- strapwork interlace field ---
// Returns a signed "band coverage": >0 inside a burnished strap, with a soft
// edge. Built from thin woven ribbons (a guilloche basket-weave) plus a
// concentric medallion, all narrow bands so the figure reads as knotwork lines
// rather than a blanket. Returns 0..1 strap coverage (1 = on a burnished strap).
float ribbon(float v, float halfWidth) {
  // v is a signed field; a strap sits where v is near zero. Narrow soft band.
  return 1.0 - smoothstep(halfWidth, halfWidth + 0.10, abs(v));
}
// a tiled field of concentric-ring medallions. count sets how many across the
// panel; ringRnd jitters each medallion's position, ring count and phase so a
// randomised value scatters a varied set of rosettes instead of one repeat.
float medallionField(vec2 uv, float count, float rnd, float ringRnd) {
  float cell = 2.4 / max(count, 0.4);
  vec2  g  = uv / cell;
  vec2  id = floor(g + 0.5);
  vec2  jit = (vec2(hash21(id + 3.1), hash21(id + 8.7)) - 0.5) * ringRnd * 0.7;
  vec2  lp = (g - id) - jit;
  float rn = length(lp) * 2.0;                  // 0 at centre .. ~1 at cell edge
  float h  = hash21(id + 31.7);
  float h2 = hash21(id + 57.3);
  float ringsN = 5.0 + h * 7.0 * ringRnd;       // randomised ring count
  float ph = rnd + h2 * 6.2831853 * ringRnd;    // randomised phase
  float rings = ribbon(sin(rn * 3.14159265 * ringsN + ph), 0.28);
  rings *= 1.0 - smoothstep(0.82, 1.0, rn);     // gate each medallion to its cell
  return rings;
}

float strapField(vec2 uv, float freq, float rnd, float hw, float weaveMix, float med, float medCount, float ringRnd) {
  float pi = 3.14159265;

  // Two families of parallel diagonal ribbons cross to make a basket weave. freq
  // sets how tight the interlace is; rnd offsets each lane family's phase so a
  // randomised value re-lays the whole knotwork into a fresh configuration.
  float a = ribbon(sin((uv.x + uv.y) * pi * freq + rnd * 2.1), hw);
  float b = ribbon(sin((uv.x - uv.y) * pi * freq + rnd * 5.3), hw);
  // an orthogonal couple makes a square grid weave instead
  float c = ribbon(sin(uv.x * pi * freq + rnd * 1.7), hw * 0.85);
  float d = ribbon(sin(uv.y * pi * freq + rnd * 3.9), hw * 0.85);
  float diagW = max(a, b);
  float gridW = max(c, d);
  // weaveMix morphs the pattern style: 0 = pure diagonal basket, 0.5 = both (the
  // classic interlace), 1 = pure orthogonal grid.
  float dW = mix(1.0, 0.08, smoothstep(0.5, 1.0, weaveMix));
  float gW = mix(0.08, 1.0, smoothstep(0.0, 0.5, weaveMix));
  float weave = max(diagW * dW, gridW * gW);

  // a field of medallions ties the panel into a composed figure
  float rings = medallionField(uv, medCount, rnd, ringRnd) * med;

  return max(weave, rings);
}

void main() {
  float pr   = u_pixelRatio;
  vec2  fc   = gl_FragCoord.xy;
  vec2  res  = u_resolution;
  vec2  ctr  = res * 0.5;
  float t    = u_time;

  // bespoke dark-metal niello plate so the panel stands on its own ground instead
  // of the gradient-mesh backdrop crutch: cool dark alloy at the rim lifting to a
  // faint lamplit warmth toward the centre, a worked-silver field, never dead-black.
  vec2  gp   = (fc - ctr) / res.y;
  float lift = 1.0 - smoothstep(0.1, 1.2, length(gp));
  vec3  col  = mix(vec3(0.020, 0.022, 0.030), vec3(0.064, 0.060, 0.080), lift);

  // ---- palette with house fallback (headless can leave the array zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ================= the strapwork figure (still, burnished) =================
  // Centre + slight aspect correction so the medallion stays round-ish.
  vec2 p = (fc - ctr) / res.y;          // y-normalised, centred
  vec2 uv = p * (res.y / (STRAP_CSS * pr)); // strap-cell coordinates
  // rotate the interlace for layout variety (still centred on the medallion)
  float prot = radians(u_patRot);
  uv = mat2(cos(prot), -sin(prot), sin(prot), cos(prot)) * uv;
  // strap coverage 0..1 (antialiased band); u_patScale sets the weave frequency
  // and u_random re-lays the knotwork into a fresh configuration.
  float strap = strapField(uv, max(u_patScale, 0.4), u_random * 6.2831853,
                           max(u_strapWidth, 0.04), clamp(u_weaveMix, 0.0, 1.0), u_medallion,
                           max(u_medCount, 0.4), clamp(u_random, 0.0, 1.0));
  // FIGURE param controls how completely the strap suppresses shimmer. The
  // suppression curve is shaped non-linearly so the param's dramatic range
  // matches the spec: near 0 the mask barely bites (twinkle leaks almost fully
  // across the figure -> it nearly dissolves into the ground); by default (0.8)
  // it already cuts a clearly legible still figure; at 1 it kills the shimmer
  // outright for a perfectly still black silhouette. The +0.18 floor at the
  // top end guarantees a crisp edge even on a busy frame.
  float fig      = clamp(u_figure, 0.0, 1.0);
  // ease the response toward the high end (pow<1) and over-drive past 1.0 so
  // FIGURE max fully extinguishes the ground inside the strap.
  float supStr   = pow(fig, 0.65) * 1.18;
  float suppress = clamp(strap * supStr, 0.0, 1.0);

  // faint burnished sheen on the strap so it reads as mirror-smooth metal, not a
  // black hole — a static, palette-tinted specular gradient (never twinkles).
  // A specular sheen sweeps across the static engraving like a coin tilted under
  // lamplight: a smooth positional gradient, fixed in time so the figure is still.
  float sheen = 0.5 + 0.5 * sin((p.x * 2.4 + p.y * 1.6) * 3.14159);
  vec3  strapTint = mix(c2, c0, 0.5 + 0.5 * p.y);
  // The strap first reads as a polished recess clearly darker than the alloy,
  // then a low burnished gradient catches lamplight so it is worked metal, not
  // a void. Still in time; the figure never twinkles. Both scale with FIGURE so
  // at 0 the figure has no burnish AND no suppression -> it dissolves into the
  // ground; at 1 it is a crisp, still, burnished silhouette. The recess darken
  // is stronger and the sheen more pronounced than before so the figure reads
  // as the subject at the shipped default without touching params.
  col -= BG * strap * 0.9 * fig;
  // burnished silver: the interlace reads as the bright worked-metal SUBJECT, a
  // strong specular gradient catching lamplight, so the figure is legible at a
  // glance rather than dissolving into the stippled ground.
  col += strapTint * strap * (0.16 + 0.58 * pow(sheen, 2.0)) * fig;
  // a crisp specular highlight running along the strapwork crests
  float strapHi = pow(sheen, 6.0) * strap;
  col += mix(strapTint, vec3(0.92, 0.94, 1.0), 0.5) * strapHi * 0.62 * fig;

  // ============== the stippled ground (scintillating punch marks) ============
  // punch grid spacing in device px (css convention)
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_punch, 1.0) * refScale * pr;
  vec2  gid  = floor(fc / spacing);          // which punch cell
  vec2  gc   = (gid + 0.5) * spacing;        // punch centre (device px)
  vec2  d    = fc - gc;
  // each punch is a tiny round dimple ~ pixel-small; pre-glint coverage
  float pr2  = 0.62 * spacing;               // dimple radius
  float dimple = 1.0 - smoothstep(pr2 * 0.5, pr2, length(d));

  // per-punch random phase + colour seed
  float seed  = hash21(gid);
  float pcol  = hash21(gid + 17.0);          // colour index seed
  // jitter the punch position slightly so the grid never reads as a lattice
  vec2  jit   = (vec2(hash21(gid + 3.7), hash21(gid + 9.1)) - 0.5) * spacing * 0.28;
  float jd    = length(fc - (gc + jit));
  float punch = 1.0 - smoothstep(pr2 * 0.45, pr2 * 0.95, jd);

  // --- twinkle: each punch flickers on its own hash-timed phase ---
  // base flicker frequency scales with TWINKLE_RATE; at 0 it freezes to a dim
  // constant stipple. A slow phase-continuous density tide modulates the gate so
  // the field never goes statistically still even at steady rate.
  float rate   = u_twinkleRate;
  // broad density tide: a few overlapping low-frequency waves in NORMALISED
  // panel coordinates (not per-cell) so whole regions of the field swell bright
  // and quiet dark together — the promised slow tides through the glitter. Wide
  // spatial scale (~half the panel per lobe) and two drifting components keep it
  // phase-continuous and non-repeating; amplitude is large so the swelling is
  // plainly visible across the loop.
  vec2  pn   = (fc - ctr) / res.y;           // y-normalised panel coords
  float tideA = sin(pn.x * 2.3 - pn.y * 1.1 + t * 0.16);
  float tideB = sin(pn.y * 2.7 + pn.x * 0.9 - t * 0.11 + 1.7);
  float tide  = 0.5 + 0.5 * (0.62 * tideA + 0.38 * tideB); // 0..1 broad swell
  // per-punch sparkle phase
  float speed  = 0.6 + 2.4 * seed;           // varied so no two match
  float phase  = seed * 6.2831 + t * speed * rate * u_twinkleSpeed;
  // sharp spark: a narrow peak of the sine, raised to a power for an instant
  // (widened a touch so more punches catch light at once → a denser coal-dust
  // glitter rather than a few lonely dots)
  float spark  = pow(max(0.0, sin(phase)), 11.0);
  // gate the spark population by the tide (rarer/denser swells) — widened range
  // so quiet regions go noticeably sparse and bright regions noticeably dense.
  float gateThr = mix(0.56, 0.05, tide);     // tide lowers threshold -> denser
  float gate   = step(gateThr, seed * 0.55 + hash11(floor(t * 0.5 + seed * 50.0)) * 0.45);
  // also dim the spark amplitude in quiet regions so the tide reads as
  // brightness swell, not just population change.
  spark *= mix(0.45, 1.0, tide);
  // when rate is near zero, fall back to a dim steady stipple (figure stays legible)
  float restless = spark * gate;
  float glintAmt = mix(STILL_DIM, restless, smoothstep(0.0, 0.25, rate));
  // a touch of always-on twinkle floor so even calmed ground breathes; raised so
  // the stipple reads as a continuous fine metal grain rather than lonely sparks
  glintAmt = max(glintAmt, STILL_DIM * 1.05 * dimple);

  // glint colour: palette wheel by per-punch seed, gently drifting in time so
  // the ground's hue distribution slowly tides (no dynamic array indexing)
  float s  = fract(pcol + t * 0.01) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // assemble the spark: bright pinpoint core (punch) + soft dimple halo
  float coreLit = punch * glintAmt;
  float haloLit = dimple * glintAmt * 0.35;
  float groundLit = (coreLit * 1.35 + haloLit);

  // suppress the ground where the burnished strap sits (the negative figure)
  groundLit *= (1.0 - suppress);

  // gentle vignette keeps the panel composed, edges quietly darker
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  groundLit *= mix(0.55, 1.0, vign);

  col += tint * groundLit;

  // a faint extra bloom on the brightest sparks for that coal-dust glitter
  col += tint * pow(coreLit, 1.5) * 0.6 * (1.0 - suppress);

  gl_FragColor = vec4(col, 1.0);
}
