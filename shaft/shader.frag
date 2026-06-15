// shaft (Shoal) — one to three fans of slanted volumetric light beams enter from
// chosen points around the frame and cross it diagonally — crepuscular rays that
// come in bunches. In each fan's rotated/polar frame, beam intensity is 1D
// value-noise over the across-beam (angular) axis raised to a power: a few
// soft-edged bright shafts separated by dark gaps. Intensity falls off with
// distance from the source into a faint directional haze; each beam takes a
// subtly different palette tint. No particles — only empty luminous volume over
// a near-black base. Each beam blooms and dies on its own slow hash-seeded
// sinusoidal phase, every fan swings a few degrees over about a minute, and the
// noise domain drifts unboundedly — nothing ever snaps back.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swing;     // fan rocking amplitude, degrees              (default 4)
uniform float u_fadeSpeed; // per-beam bloom/fade speed                   (default 0.3)
uniform float u_beam;      // typical shaft width, css px (x u_pixelRatio) (default 130)
uniform float u_sources;   // number of light sources, 1..3               (default 2)
uniform float u_sourceX;   // primary source x, fraction of width         (default -0.05)
uniform float u_sourceY;   // primary source y, fraction of height (up)   (default 1.05)
uniform float u_intensity; // overall beam brightness                     (default 1.0)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU       = 6.28318530718;
const float SWING_PER = 57.0;  // seconds per full fan swing (~a minute)
const float FAN_SOFT  = 0.40;  // fan angular envelope: fade starts (rad)
const float FAN_HW    = 0.72;  // fan angular envelope: fully dark (rad)
const float DRIFT     = 0.012; // unbounded across-axis noise-domain drift, cells/s
const float PITCH     = 1.0;   // noise lattice cells per beam width

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// stable palette tint for one beam lattice index; weights are squared and
// renormalised so each beam commits to (mostly) one palette colour.
vec3 latticeCol(float i, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float h  = hash11(i + 23.7) * 4.0;
  float w0 = wheelW(h, 0.0), w1 = wheelW(h, 1.0);
  float w2 = wheelW(h, 2.0), w3 = wheelW(h, 3.0);
  w0 *= w0; w1 *= w1; w2 *= w2; w3 *= w3;
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3)
       / max(w0 + w1 + w2 + w3, 1e-4);
}

// time-varying lattice value: each beam blooms and dies on its own slow
// hash-seeded sinusoidal phase, golden-ratio staggered so a fan never blooms
// or dies all at once.
float beamVal(float i, float spd, float t) {
  float h1 = fract(i * 0.61803 + hash11(i + 3.17) * 0.30);
  float h2 = hash11(i + 17.73);
  float h3 = hash11(i + 9.31);
  float e  = 0.5 + 0.5 * sin(t * spd * (0.85 + 0.30 * h2) + h1 * TAU);
  e = e * e * (3.0 - 2.0 * e);
  return (0.25 + 0.75 * e) * (0.50 + 0.50 * h3);
}

// static 1D value noise (striation / volume texture)
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float fs = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i + 51.3), hash11(i + 52.3), fs);
}

// One fan of light from source S. `seed` shifts the across-beam pattern so each
// source carries a different bunch of shafts. Returns additive linear colour.
vec3 shaftFan(vec2 fc, vec2 res, vec2 S, float seed,
              vec3 c0, vec3 c1, vec3 c2, vec3 c3,
              float swingAmt, float spd, float pitch, float t) {
  vec2  v   = fc - S;
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);

  vec2  cd   = 0.5 * res - S;
  float Rref = max(length(cd), 1.0);
  vec2  vLo  = -S;
  vec2  vHi  = res - S;
  float aim  = 0.5 * (atan(vLo.y, vLo.x) + atan(vHi.y, vHi.x));
  float a0   = aim + swingAmt * sin(t * TAU / SWING_PER + seed * 1.7);
  float da   = ang - a0;

  // across-beam axis in lattice cells; seed offsets the pattern per source
  float u  = da * Rref / pitch + DRIFT * t + seed * 13.0;
  float i0 = floor(u);
  float f  = fract(u);
  float fs = f * f * (3.0 - 2.0 * f);
  float n  = mix(beamVal(i0, spd, t), beamVal(i0 + 1.0, spd, t), fs);
  // value-noise raised to a power carves bright shafts and dark gaps; a higher
  // power + gain raises contrast so the beams read crisp, not a soft wash.
  float beam = n * n * n * n * 3.1 + n * 0.08;

  // internal striation + a slow slosh of volume travelling along the beams
  beam *= 0.70 + 0.46 * vnoise(u * 4.3 + 31.0 + seed * 5.0);
  beam *= 0.76 + 0.40 * vnoise(r / (0.20 * Rref) - t * 0.12 + 7.0 + seed * 3.0);

  float rn       = r / Rref;
  float fanEnv   = 1.0 - smoothstep(FAN_SOFT, FAN_HW, abs(da));
  float hazeEnv  = 1.0 - smoothstep(0.12, FAN_HW + 0.30, abs(da));
  float distFall = exp(-rn * 0.45);
  float nearCalm = smoothstep(0.035, 0.22, rn);

  vec3 beamCol = mix(latticeCol(i0, c0, c1, c2, c3),
                     latticeCol(i0 + 1.0, c0, c1, c2, c3), fs);
  vec3 keyCol  = mix(c0, c2, 0.5);
  vec3 tint    = mix(keyCol, beamCol, 0.62);

  vec3 acc = tint * (beam * fanEnv * distFall * nearCalm);
  acc += keyCol * hazeEnv * exp(-rn * 1.3) * 0.10;
  acc += mix(keyCol, tint, 0.5) * hazeEnv * exp(-rn * 3.2) * 0.40;
  return acc;
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);

  // theme palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float swingAmt = radians(clamp(u_swing, 0.0, 24.0));
  float spd      = max(u_fadeSpeed, 0.0);
  float refScale = mn / (max(u_pixelRatio, 1.0) * 400.0);
  float pitch    = max(u_beam, 8.0) * refScale * pr * PITCH;

  // primary source position (fraction of the frame; can sit just outside it)
  vec2 S0 = vec2(u_sourceX * res.x, u_sourceY * res.y);
  // secondary sources fill the opposite/other corners so crepuscular rays come
  // in bunches and the dark corners light up. Mirror across X for #2, top-centre
  // high for #3 — each seeded so its shafts differ.
  vec2 S1 = vec2((1.0 - u_sourceX) * res.x, u_sourceY * res.y);
  vec2 S2 = vec2(0.5 * res.x, (u_sourceY + 0.10) * res.y);

  float nSrc = clamp(u_sources, 1.0, 3.0);

  vec3 acc = shaftFan(fc, res, S0, 0.0, c0, c1, c2, c3, swingAmt, spd, pitch, u_time);
  if (nSrc > 1.5)
    acc += shaftFan(fc, res, S1, 4.7, c0, c1, c2, c3, swingAmt, spd, pitch, u_time);
  if (nSrc > 2.5)
    acc += shaftFan(fc, res, S2, 9.3, c0, c1, c2, c3, swingAmt, spd, pitch, u_time);

  // gentle vignette; soft-knee tone map keeps shaft cores from blowing out
  vec2  uv  = (fc - 0.5 * res) / mn;
  float vig = 1.0 - 0.28 * smoothstep(0.50, 1.05, length(uv));
  vec3  col = BG + (1.0 - exp(-acc * 3.1 * max(u_intensity, 0.0))) * vig;

  // ~1-LSB hash dither breaks 8-bit banding in the broad soft gradients
  col += (hash12(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
