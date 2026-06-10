// warp (Loom) - a loom warp: thin bright vertical threads on a near-black
// field that ripple side-to-side as a slow sinusoidal displacement travels
// down them, with soft glow nodes blooming where a horizontal weft wave
// crosses. Threads are tinted across u_palette by their x position. Delicate,
// not neon, and periodic in time so it loops with no visible jump.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four thread colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

const float BG        = 0.039;   // #0A -> ~0.04 near-black base
const float SPACING_CSS = 34.0;  // px between warp threads
const float THREAD_CSS  = 1.1;   // thread half-width
const float AMP_CSS     = 7.0;   // horizontal ripple amplitude
const float WAVELEN_CSS = 240.0; // vertical wavelength of the travelling ripple
const float DRIFT       = 0.30;  // how fast the ripple travels down (loops)
const float WEFT_SPEED  = 0.22;  // how fast the weft glow band sweeps (loops)

const float TAU = 6.2831853;

// smooth per-thread colour from the 4-stop palette across x in 0..1
vec3 threadTint(float x) {
  float s = clamp(x, 0.0, 1.0) * 3.0;
  vec3 tc = u_palette[0];
  tc = mix(tc, u_palette[1], smoothstep(0.0, 1.0, s));
  tc = mix(tc, u_palette[2], smoothstep(1.0, 2.0, s));
  tc = mix(tc, u_palette[3], smoothstep(2.0, 3.0, s));
  return tc;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = vec3(BG, BG, 0.047);

  float spacing = SPACING_CSS * pr;
  float amp     = AMP_CSS * pr;
  float wavelen = WAVELEN_CSS * pr;
  float thick   = THREAD_CSS * pr;

  // travelling ripple phase along y (periodic in t -> seamless loop)
  float yPhase = (fc.y / wavelen) * TAU - t * DRIFT * TAU;

  // weft: two soft horizontal bands sweeping up and down out of phase, looping.
  // (square via multiply, not pow() -- pow of a negative base is undefined.)
  float wA = res.y * (0.5 + 0.40 * sin(t * WEFT_SPEED * TAU));
  float wB = res.y * (0.5 + 0.34 * sin(t * WEFT_SPEED * TAU * 0.6 + 2.1));
  float nA = (fc.y - wA) / (res.y * 0.14);
  float nB = (fc.y - wB) / (res.y * 0.20);
  float weft = exp(-nA * nA) + 0.6 * exp(-nB * nB);

  // brighten where a weft band crosses a warp thread -> glow nodes
  float node = weft * (1.0 + 1.2 * weft);

  // accumulate the nearest few warp threads so anti-aliased lines overlap softly
  float cell = floor(fc.x / spacing);
  for (int k = -1; k <= 1; k++) {
    float id    = cell + float(k);
    float baseX = (id + 0.5) * spacing;
    float xN    = baseX / res.x;                 // 0..1 across screen

    // per-thread phase offset + slight amplitude variation so the weave
    // breathes organically instead of rippling in lockstep
    float ph   = id * 1.7;
    float aMod = amp * (0.78 + 0.22 * sin(id * 0.9 + 1.3));
    float disp = aMod * sin(yPhase + ph) + 0.35 * aMod * sin(yPhase * 0.5 + ph);
    float threadX = baseX + disp;

    // distance from this fragment to the (rippling) thread
    float d = abs(fc.x - threadX);

    // soft luminous core + a wide halo, both scaled by pixel ratio
    float core = 1.0 - smoothstep(thick, thick + 2.5 * pr, d);
    float halo = exp(-d / (8.0 * pr));

    vec3 tint = threadTint(xN);
    // resting glow + extra lift where a weft band crosses -> glow nodes
    float lift = 0.50 + 0.95 * node;
    col += tint * core * (0.80 * lift);
    col += tint * halo * (0.26 * lift);
  }
  // a faint overall vertical falloff so edges sit darker (vignette-ish)
  float vy = smoothstep(0.0, 0.30, fc.y / res.y) * smoothstep(0.0, 0.30, 1.0 - fc.y / res.y);
  col *= 0.55 + 0.45 * vy;

  gl_FragColor = vec4(col, 1.0);
}
