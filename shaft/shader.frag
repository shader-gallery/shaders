// shaft (Shoal) — a fan of slanted volumetric light beams enters from just
// outside the upper-left corner and crosses the frame diagonally. In the
// fan's rotated/polar frame, beam intensity is 1D value-noise over the
// across-beam (angular) axis raised to a power: a few soft-edged bright
// shafts separated by dark gaps. Intensity falls off with distance from the
// source corner into a faint directional haze; each beam takes a subtly
// different palette tint. No particles — only empty luminous volume over a
// near-black base. Each beam blooms and dies on its own slow hash-seeded
// sinusoidal phase, the whole fan swings a few degrees over about a minute
// via a slow sine on the rotation angle, and the noise domain drifts
// unboundedly — nothing ever snaps back.
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

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU       = 6.28318530718;
const float SWING_PER = 57.0;  // seconds per full fan swing (~a minute)
const float FAN_SOFT  = 0.40;  // fan angular envelope: fade starts (rad)
const float FAN_HW    = 0.70;  // fan angular envelope: fully dark (rad)
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
// renormalised so each beam commits to (mostly) one palette colour rather
// than a desaturating half-and-half blend
vec3 latticeCol(float i, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float h  = hash11(i + 23.7) * 4.0;
  float w0 = wheelW(h, 0.0), w1 = wheelW(h, 1.0);
  float w2 = wheelW(h, 2.0), w3 = wheelW(h, 3.0);
  w0 *= w0; w1 *= w1; w2 *= w2; w3 *= w3;
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3)
       / max(w0 + w1 + w2 + w3, 1e-4);
}

// time-varying lattice value: each beam blooms and dies on its own slow
// hash-seeded sinusoidal phase. Phases are golden-ratio staggered across
// neighbouring beams (and rate jitter kept mild so the stagger persists),
// so the fan never blooms or dies all at once — even when only two broad
// columns fit the frame, one of them is alive.
float beamVal(float i, float spd, float t) {
  float h1 = fract(i * 0.61803 + hash11(i + 3.17) * 0.30); // staggered phase
  float h2 = hash11(i + 17.73);  // mild rate jitter
  float h3 = hash11(i + 9.31);   // standing gain
  float e  = 0.5 + 0.5 * sin(t * spd * (0.85 + 0.30 * h2) + h1 * TAU);
  e = e * e * (3.0 - 2.0 * e);   // dwell at full bloom / full dark
  return (0.25 + 0.75 * e) * (0.50 + 0.50 * h3);
}

// static 1D value noise (striation / volume texture)
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float fs = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i + 51.3), hash11(i + 52.3), fs);
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

  // light source just outside the upper-left corner
  vec2  S   = vec2(0.0, res.y) + vec2(-0.07, 0.07) * mn;
  vec2  v   = fc - S;
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);            // frame pixels sit in (-pi/2, 0)

  // fan aim: the angular midpoint of the frame as seen from the source,
  // rocking a few degrees on a slow sine
  vec2  cd    = 0.5 * res - S;
  float Rref  = max(length(cd), 1.0);
  vec2  vLo   = -S;                      // toward lower-left frame corner
  vec2  vHi   = res - S;                 // toward upper-right frame corner
  float aim   = 0.5 * (atan(vLo.y, vLo.x) + atan(vHi.y, vHi.x));
  float swing = radians(clamp(u_swing, 0.0, 24.0));
  float a0    = aim + swing * sin(u_time * TAU / SWING_PER);
  float da    = ang - a0;                // signed across-fan angle

  // across-beam axis in lattice cells (one cell = one beam + one gap),
  // normalised so a shaft is ~u_beam css px wide at mid-frame distance
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float pitch = max(u_beam, 8.0) * refScale * pr * PITCH;
  float u     = da * Rref / pitch + DRIFT * u_time;

  // 1D value noise over the across-beam axis, raised to a power:
  // a few soft-edged bright shafts separated by dark gaps
  float spd = max(u_fadeSpeed, 0.0);
  float i0  = floor(u);
  float f   = fract(u);
  float fs  = f * f * (3.0 - 2.0 * f);
  float n    = mix(beamVal(i0, spd, u_time), beamVal(i0 + 1.0, spd, u_time), fs);
  float n2   = n * n;
  // value-noise ^ 4 carves bright shafts and dark gaps; the small linear
  // term is a ghost of the full fan so a dying beam fades to a faint trace
  float beam = n2 * n2 * 1.9 + n * 0.06;

  // internal striation + a slow slosh of volume travelling along the beams
  beam *= 0.72 + 0.42 * vnoise(u * 4.3 + 31.0);
  beam *= 0.78 + 0.38 * vnoise(r / (0.20 * Rref) - u_time * 0.12 + 7.0);

  float rn       = r / Rref;
  float fanEnv   = 1.0 - smoothstep(FAN_SOFT, FAN_HW, abs(da));
  float hazeEnv  = 1.0 - smoothstep(0.12, FAN_HW + 0.28, abs(da));
  float distFall = exp(-rn * 0.5);             // fall-off away from the source
  float nearCalm = smoothstep(0.035, 0.22, rn); // beams converge offscreen calmly

  // per-beam tint: a shared key light pulled subtly toward each beam's colour
  vec3 beamCol = mix(latticeCol(i0, c0, c1, c2, c3),
                     latticeCol(i0 + 1.0, c0, c1, c2, c3), fs);
  vec3 keyCol  = mix(c0, c2, 0.5);
  vec3 tint    = mix(keyCol, beamCol, 0.62);

  vec3 acc = tint * (beam * fanEnv * distFall * nearCalm);

  // faint directional haze filling the fan, and a soft glow at the source
  acc += keyCol * hazeEnv * exp(-rn * 1.3) * 0.06;
  acc += mix(keyCol, tint, 0.5) * hazeEnv * exp(-rn * 3.2) * 0.40;

  // gentle vignette; soft-knee tone map keeps shaft cores from blowing out
  vec2  uv  = (fc - 0.5 * res) / mn;
  float vig = 1.0 - 0.30 * smoothstep(0.50, 1.05, length(uv));
  vec3  col = BG + (1.0 - exp(-acc * 1.5)) * vig;

  // ~1-LSB hash dither breaks 8-bit banding in the broad soft gradients
  col += (hash12(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
