// mandala (Rosette) — a single centred mandala built from nested polar rings of
// petal outlines. Petal counts grow with radius so the figure stays evenly
// ornamented out to the frame edges with no dead corners. Each ring's petal SDF
// is a smooth blend among four archetypes — teardrop, almond, trefoil lobe, and
// thorn — and continuously metamorphoses from one toward the next on an unbounded
// per-ring noise phase. Ring radii breathe a few pixels on long offset sines.
// The figure neither rotates nor hosts a travelling light: the ornament itself
// remolds in place, always mid-transformation, never repeating.
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
uniform float u_morphSpeed;  // rate of petal metamorphosis       (default 0.1)
uniform float u_petals;      // petal count of the innermost ring (default 8)
uniform float u_spacing;     // radial ring spacing, css px       (default 88)
uniform float u_breath;      // radial breathing amplitude 0..1   (default 0.3)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265359;
const float TAU      = 6.28318530718;
const float NRINGS   = 7.0;   // literal loop bound (rings drawn outward)
const float LINE_CSS = 1.6;   // stroke half-thickness in css px

// hash + smooth value noise in 1D for the per-ring metamorphosis phase
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), f);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// --- four petal-radius archetypes ---------------------------------------
// each returns a positive radial profile in 0..~1.3 as a function of the
// within-petal angle a (-PI/n .. PI/n folded), normalised arg phi in -1..1.
// teardrop: fat base, pinched tip
float archTeardrop(float phi) {
  float c = cos(phi * PI * 0.5);
  return 0.35 + 0.95 * pow(max(c, 0.0), 1.8);
}
// almond: symmetric lens, gentle
float archAlmond(float phi) {
  float c = cos(phi * PI * 0.5);
  return 0.45 + 0.80 * pow(max(c, 0.0), 0.9);
}
// trefoil lobe: a central bump flanked by two smaller side lobes
float archTrefoil(float phi) {
  float c  = cos(phi * PI * 0.5);
  float s3 = cos(phi * PI * 1.5);
  return 0.40 + 0.55 * max(c, 0.0) + 0.35 * max(s3, 0.0);
}
// thorn: spiky, narrow, long reach
float archThorn(float phi) {
  float c = cos(phi * PI * 0.5);
  return 0.25 + 1.15 * pow(max(c, 0.0), 4.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // guard params against catastrophic zeros at slider extremes
  float morphSpeed = max(u_morphSpeed, 0.0);
  float petals0    = max(u_petals, 3.0);
  float spacing    = max(u_spacing, 8.0) * pr; // css px → device px
  float breath     = clamp(u_breath, 0.0, 1.0);

  // polar coords about centre
  vec2  d   = fc - ctr;
  float rad = length(d);
  float ang = atan(d.y, d.x);

  float line = LINE_CSS * pr;
  float aa   = line + pr * 1.4; // anti-alias falloff width

  // palette with the house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // accumulate stroke glow across the nested rings
  float glow = 0.0;
  vec3  tint = vec3(0.0);

  for (float ri = 0.0; ri < NRINGS; ri += 1.0) {
    // base radius of this ring; +0.62 so the innermost ring has a real hole.
    // 0.86 packs rings a touch tighter than their nominal spacing so the
    // figure reaches the corners with no dead band between rings.
    float baseR = (ri * 0.86 + 0.62) * spacing;

    // radii breathe a few px on long offset sines (no traveling light) ---
    float breMag = breath * spacing * 0.16;
    float breathe = sin(t * 0.18 + ri * 1.7) * breMag
                  + sin(t * 0.11 + ri * 0.9) * breMag * 0.6;
    float ringR = baseR + breathe;

    // petal count grows with radius so the figure stays evenly ornamented
    float n = petals0 + floor(ri) * 4.0;

    // fold angle into one petal sector, phi in -1..1 across the petal
    float sector = TAU / n;
    float fa = ang / sector;
    float phi = (fract(fa) - 0.5) * 2.0; // -1..1 within the petal

    // per-ring metamorphosis: an unbounded noise phase selects a position on
    // the archetype cycle teardrop→almond→trefoil→thorn→teardrop. Using
    // vnoise of an ever-increasing argument means no cycle boundary / reset.
    float mphase = vnoise(t * morphSpeed * 0.6 + ri * 13.31) * 4.0 + ri * 0.37;
    float ms = fract(mphase * 0.25) * 4.0; // 0..4 morph wheel position
    float mw0 = wheelW(ms, 0.0), mw1 = wheelW(ms, 1.0);
    float mw2 = wheelW(ms, 2.0), mw3 = wheelW(ms, 3.0);
    float mwsum = max(mw0 + mw1 + mw2 + mw3, 0.001);

    float prof = ( archTeardrop(phi) * mw0
                 + archAlmond(phi)   * mw1
                 + archTrefoil(phi)  * mw2
                 + archThorn(phi)    * mw3 ) / mwsum;

    // petal outline radius for this ring: profile rides outward from ringR.
    // amplitude scales with spacing so petals nearly bridge to the next ring.
    float amp   = spacing * 0.46;
    float petalR = ringR + (prof - 0.6) * amp;

    // signed radial distance from the fragment to this petal contour
    float sd = abs(rad - petalR);
    float stroke = 1.0 - smoothstep(0.0, aa, sd);

    // a soft bloom hugging the stroke so it reads as luminous, not flat
    float bloom = exp(-sd / (line * 6.0));

    // ring colour from the palette, blended by ring index + slow morph drift
    float k  = ri * 0.62 + mphase * 0.09 + t * 0.01;
    float s  = fract(k) * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  rc = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

    // outer rings get a mild boost so they read with the same presence as the
    // bright inner rings despite their larger circumference and the vignette
    float ringBoost = 1.0 + ri * 0.10;

    // only contribute where the contour exists (sd small enough to matter)
    float contrib = (stroke + bloom * 0.30) * ringBoost;
    glow += contrib;
    tint += rc * contrib;
  }

  // normalise tint by accumulated weight so colour stays true where rings overlap
  vec3 ink = tint / max(glow, 0.001);

  // central jewel: a faint glow seed at the very centre so the hole isn't a void
  float core = exp(-rad * rad / (spacing * spacing * 0.20));
  glow += core * 0.6;
  ink  = mix(ink, (c0 + c2) * 0.5, core * 0.5);

  // radial vignette keeps the corners quiet and the figure composed; reaches
  // past the half-height so the outermost rings survive into the corners
  float vign = 1.0 - smoothstep(0.85, 1.55, rad / (res.y * 0.5));

  col += ink * glow * 0.95 * vign;

  // gentle filmic-ish soft clamp to avoid blown-out cores where strokes stack
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
