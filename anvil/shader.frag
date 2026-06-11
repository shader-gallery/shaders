// anvil (Knell) — a square steel plate fills the frame inside a thin dark
// bevel, near-black at rest under the faintest brushed bronze sheen. Its
// displacement is a weighted sum of four fixed Chladni plate modes:
// cos(m*pi*x)*cos(n*pi*y) plus-or-minus the (n,m) twin, for the pairs
// (2,0) and (3,5). Each hammer blow lands at a hashed point on the plate,
// marked by a brief soft impact glint; every mode rings with a weight equal
// to its own shape sampled at the strike point, so the same plate sounds a
// different nodal figure out of every blow. Within a ring-down the zero-set
// nodal curves stay perfectly dark and fixed while the antinode lobes glow,
// each lobe tinted by the palette colour of the mode that dominates it. The
// four modes decay at different exponential rates, so the hybrid figure
// melts mid-decay toward the slowest simple cross, then fades into a faint
// residual that persists until the next blow crossfades its figure in.
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
uniform float u_strikeGap;   // mean seconds between hammer blows   (default 10)
uniform float u_ringTime;    // seconds a figure takes to decay     (default 5.5)
uniform float u_figureScale; // scales the mode wavenumbers         (default 1)
uniform float u_glint;       // impact flash brightness, 0..1       (default 0.55)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black field
const float PI       = 3.14159265359;
const float RESID    = 0.052;  // residual figure floor between blows
const float ATTACK   = 0.45;   // strike crossfade-in, seconds
const float JIT_OFF  = 0.13;   // schedule hash phase (tunes where blows land in time)

float hashk(float k, float s) {
  return fract(sin(k * 12.9898 + s) * 43758.5453);
}

// hashed irregular strike schedule: one blow per epoch of length T,
// jittered across the middle of the epoch so gaps stay irregular
float strikeTime(float k, float T) {
  float j = 0.12 + 0.80 * fract(hashk(k, 7.13) + JIT_OFF);
  return (k + j) * T;
}

// hashed strike point, kept inside the plate interior
vec2 strikePos(float k) {
  return vec2(hashk(k, 1.97), hashk(k, 4.31)) * 1.44 - 0.72;
}

// the four fixed Chladni modes of the plate, q in [-1,1] plate coords:
//   x = (2,0) minus twin -> corner-to-corner X cross   (slowest decay)
//   y = (2,0) plus twin  -> diamond through edge midpoints
//   z = (3,5) plus twin  -> broad curved cymatic lattice
//   w = (3,5) minus twin -> finer counter-lattice      (fastest decay)
vec4 plateModes(vec2 q, float ka, float k1, float k2) {
  float ax  = cos(ka * q.x), ay  = cos(ka * q.y);
  float b1x = cos(k1 * q.x), b1y = cos(k1 * q.y);
  float b2x = cos(k2 * q.x), b2y = cos(k2 * q.y);
  return vec4(ax - ay, ax + ay, b1x * b2y + b2x * b1y, b1x * b2y - b2x * b1y);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  res = u_resolution;
  vec2  fc  = gl_FragCoord.xy;
  vec2  rel = fc - 0.5 * res;

  // theme palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // guarded params (entire slider range must stay safe)
  float T  = max(u_strikeGap, 1.0);
  float rt = max(u_ringTime, 0.3);
  float sc = clamp(u_figureScale, 0.05, 4.0);
  float gn = clamp(u_glint, 0.0, 1.5);

  // plate geometry: centered square, ~92% of the short frame side
  float S   = 0.46 * min(res.x, res.y);
  vec2  p   = rel / max(S, 1.0);              // plate coords, face is |p|<=1
  float b   = max(abs(p.x), abs(p.y));
  float aaU = 1.5 * pr / max(S, 1.0);
  float bwU = 9.0 * pr / max(S, 1.0);         // bevel width, ~9 css px
  float face  = 1.0 - smoothstep(1.0 - aaU, 1.0 + aaU, b);
  float bevel = smoothstep(1.0 - aaU, 1.0 + aaU, b)
              * (1.0 - smoothstep(1.0 + bwU - aaU, 1.0 + bwU + aaU, b));
  float outer = smoothstep(1.0 + bwU - aaU, 1.0 + bwU + aaU, b);

  // ---- strike schedule: most recent blow + the one before it ----
  float e0  = floor(u_time / T);
  float s0  = strikeTime(e0, T);
  float kC  = (u_time >= s0) ? e0 : e0 - 1.0;
  float sC  = (u_time >= s0) ? s0 : strikeTime(e0 - 1.0, T);
  float kP  = kC - 1.0;
  float sP  = strikeTime(kP, T);
  float ageC = u_time - sC;
  float ageP = u_time - sP;

  // mode wavenumbers, scaled continuously by the figure-scale param
  float ka = PI * sc;
  float k1 = 1.5 * PI * sc;
  float k2 = 2.5 * PI * sc;

  vec4 M = plateModes(p, ka, k1, k2);

  // every mode weight = that mode shape sampled at the strike point,
  // normalized so each blow rings at comparable loudness
  vec2 pc = strikePos(kC);
  vec2 pp = strikePos(kP);
  vec4 WC = plateModes(pc, ka, k1, k2);
  vec4 WP = plateModes(pp, ka, k1, k2);
  WC /= max(length(WC), 0.35);
  WP /= max(length(WP), 0.35);

  // per-mode exponential ring-down, slowest first; floor = residual figure
  vec4 tw   = rt * vec4(0.42, 0.30, 0.22, 0.15);
  vec4 envC = exp(-vec4(ageC) / tw) + RESID;
  vec4 envP = exp(-vec4(ageP) / tw) + RESID;

  // soft attack: the new figure crossfades in over the previous residual
  float atk = smoothstep(0.0, ATTACK, ageC);
  vec4  C   = mix(WP * envP, WC * envC, atk);

  // standing-wave field: nodal zero-set stays dark and fixed within a decay.
  // shape is normalized by the live amplitude so nodal contrast never washes
  // out as the ring decays — overall loudness is reapplied as brightness.
  vec4  cm  = C * M;
  float z   = cm.x + cm.y + cm.z + cm.w;
  float A   = max(length(C), 1e-4);
  float amp = abs(z) / A;                     // normalized field, ~0..2.6
  vec4  em  = abs(cm);
  float esum = em.x + em.y + em.z + em.w + 1e-4;
  vec3  figCol = (c0 * em.x + c1 * em.y + c2 * em.z + c3 * em.w) / esum;

  // plump lobes with a crisp dark carve right at the nodal zero-set
  float lobe = smoothstep(0.10, 1.05, amp) * smoothstep(0.03, 0.12, amp);
  figCol = mix(figCol, vec3(1.0), 0.20 * smoothstep(1.4, 2.3, amp));

  // loudness envelope: fresh blow rings bright, residual stays faint
  float E     = length(C);
  float Emap  = pow(min(E, 1.15), 0.75);

  // antinode tremble: multiplicative shimmer, so nodal lines never lift
  float tremble = 0.88 + 0.12 * sin(u_time * 5.3 + z * 4.0);
  float glow = lobe * Emap * tremble;

  // ---- brushed steel base: faint bronze-dark sheen, static at rest ----
  float yl    = p.y * S / pr;                 // css px from plate center
  float brush = 0.5 + 0.5 * (sin(yl * 0.83 + 2.0 * sin(yl * 0.117 + p.x * 1.7)) * 0.62
                           + sin(yl * 0.41 + 0.8 * sin(yl * 0.193)) * 0.38);
  float grad  = 0.55 + 0.45 * sin(p.x * 1.2 - p.y * 0.8 + 0.6);
  vec3  plateBase = BG + vec3(1.0, 0.93, 0.80) * (0.005 + 0.011 * brush * grad);

  float vig = 1.0 - 0.28 * smoothstep(0.4, 1.35, length(p));

  // ---- impact glint: brief soft flash at the strike point ----
  vec2  gRel = rel - pc * S;
  float dpx  = length(gRel) / pr;             // css px from the strike point
  float genv = smoothstep(0.0, 0.05, ageC)
             * (exp(-3.0 * ageC) + 0.5 * exp(-1.1 * ageC));
  float core = exp(-dpx * dpx / (2.0 * 16.0 * 16.0));
  float halo = exp(-dpx * dpx / (2.0 * 85.0 * 85.0));
  vec4  awc  = abs(WC);
  float asum = awc.x + awc.y + awc.z + awc.w + 1e-4;
  vec3  scol = (c0 * awc.x + c1 * awc.y + c2 * awc.z + c3 * awc.w) / asum;
  vec3  gcol = mix(vec3(1.0, 0.96, 0.88), scol, 0.40);
  float glintAdd = gn * genv * (1.3 * core + 0.45 * halo);
  float lift     = gn * 0.05 * exp(-2.2 * ageC);  // blow lights the whole plate

  // ---- compose: face, bevel, surround ----
  vec3 faceCol = plateBase + figCol * glow * vig * 0.85 + gcol * glintAdd + scol * lift;

  vec2  nrm   = abs(p.x) > abs(p.y) ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y));
  float edgeL = dot(nrm, normalize(vec2(-0.55, 0.85)));
  vec3 bevelCol = vec3(0.016, 0.016, 0.021)
                + vec3(0.050, 0.046, 0.038) * max(edgeL, 0.0)
                + vec3(0.010) * max(-edgeL, 0.0);

  float ovig = 1.0 - 0.45 * smoothstep(0.9, 1.7, length(rel) / max(S, 1.0));
  vec3 outerCol = vec3(0.019, 0.019, 0.025) * ovig;

  vec3 col = faceCol * face + bevelCol * bevel + outerCol * outer;

  // gentle knee so the hammer spark clips softly instead of hard white
  col = col / (1.0 + 0.10 * max(col - vec3(0.85), 0.0));

  gl_FragColor = vec4(col, 1.0);
}
