// char — slow fire without flame. A sheet of near-black paper with faint
// fiber grain; an irregular incandescent edge eats across it on a slow
// diagonal. The front is the level set of a static FBM field against a
// time-receding threshold, so it advances with bays and racing fingers and
// never retreats. Across the rim width the palette lies as graded bands —
// hottest at the leading edge, cooling toward the trailing side — before the
// surface drops to char a half-step darker than the unburned sheet, salted
// with brief one-shot cooling sparks. Two staggered burn sheets crossfade
// while featureless (all-char to fresh paper), so consumption never resets.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_frontSpeed;     // how fast the front eats across the sheet (default 0.3)
uniform float u_rimWidth;       // width of the graded incandescent rim, css px, scaled by u_pixelRatio (default 14)
uniform float u_sparkDensity;   // fraction of char-side cells carrying a cooling spark (default 0.45)
uniform float u_edgeRaggedness; // FBM perturbation of the front contour (default 1)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black
const float TAU = 6.28318530718;
const vec2  DIR = vec2(0.8371, 0.5470);      // unit sweep direction (slow diagonal)

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.17));
}

// smooth value noise (C1, safe to difference for gradients)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 5-octave fbm, rotated per octave; range ~[0,0.97], mean ~0.5
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.616, 1.214, -1.214, 1.616);
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = m * p + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// burn field: diagonal sweep coordinate normalised to ~[0,1] across the
// frame, perturbed by a STATIC fbm (the contour is fixed per sheet — only
// the threshold moves, so the front can only ever advance).
float field(vec2 fragPx, vec2 seed, float ragAmp) {
  float sweep = max(dot(u_resolution.xy, DIR), 1.0);
  float sl = dot(fragPx, DIR) / sweep;
  vec2 q = fragPx / (max(u_pixelRatio, 0.25) * 240.0);
  return sl + ragAmp * 2.0 * (fbm(q + seed) - 0.5);
}

// one burn sheet: paper ahead of the threshold, char behind, graded
// incandescent rim at the level set, one-shot sparks cooling in the char.
vec3 shadeLayer(vec2 fragPx, vec2 cssP, float phase, vec2 seed,
                vec3 c0, vec3 c1, vec3 c2, vec3 c3,
                float ragAmp, float pre, float T, float rimPx,
                float rate, vec3 paper, vec3 charBase, float t, float pr) {
  float c = -pre + T * phase; // receding threshold, advances at `rate` per sec

  // field + numeric gradient -> approximate signed distance in device px
  float eps = 2.0;
  float f0 = field(fragPx, seed, ragAmp);
  float fx = field(fragPx + vec2(eps, 0.0), seed, ragAmp);
  float fy = field(fragPx + vec2(0.0, eps), seed, ragAmp);
  float sweep = max(dot(u_resolution.xy, DIR), 1.0);
  float gradLen = max(length(vec2(fx - f0, fy - f0)) / eps, 0.35 / sweep);
  float sdPx = (f0 - c) / gradLen; // >0 unburned paper ahead, <0 char behind

  // seconds since the front passed this fragment (0 ahead of the front)
  float tau = max(c - f0, 0.0) / rate;

  // ---- base material: paper ahead, darker char behind (seam hides under rim)
  float bm = 1.0 - smoothstep(-rimPx * 0.5, rimPx * 0.2, sdPx);
  vec3 col = mix(paper, charBase, bm);
  // faint ember afterglow cooling off just behind the rim
  col += (c3 * 0.5 + c2 * 0.5) * 0.05 * bm * exp(-tau * 0.5);

  // ---- incandescent rim: graded bands across its width.
  // q runs 0 at the leading edge (against virgin paper) to 1 at the trailing
  // side; hottest c3 first, cooling through c1 and c0 into c2.
  float q = -sdPx / rimPx;
  float on = smoothstep(1.5 * pr, -1.5 * pr, sdPx);
  vec3 ramp = c3;
  ramp = mix(ramp, c1, smoothstep(0.06, 0.34, q));
  ramp = mix(ramp, c0, smoothstep(0.34, 0.62, q));
  ramp = mix(ramp, c2, smoothstep(0.62, 0.95, q));
  float env = on * (0.06 + 0.94 * exp(-max(q, 0.0) * 1.9))
            * (1.0 - smoothstep(0.95, 1.35, q));
  float hot = on * exp(-q * q * 70.0); // thin white-hot line at the very edge
  // slow shimmer along the front (intensity only — the contour never moves)
  float sh = 0.80 + 0.40 * vnoise(cssP / 70.0 + vec2(t * 0.7, -t * 0.4) + seed);
  // preheat glow bleeding a few px into the unburned paper
  float ah = max(sdPx, 0.0);
  float preheat = (1.0 - on) * (0.34 * exp(-ah / (rimPx * 0.33))
                              + 0.05 * exp(-ah / (rimPx * 2.2)));
  col += ramp * env * 1.05 * sh;
  col += (c3 * 0.70 + vec3(0.30, 0.27, 0.22)) * hot * 0.50 * sh;
  col += (c3 * 0.85 + c1 * 0.15) * preheat * sh;

  // ---- cooling sparks: hash-placed cells on the char side, each popping
  // once shortly after the front passes (delays biased toward the rim) and
  // guttering out — never relit.
  if (u_sparkDensity > 0.0005 && tau > 0.0) {
    float cellSz = 22.0; // css px
    vec2 gi = floor(cssP / cellSz);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 cell = gi + vec2(float(i), float(j));
        vec2 hv = hash22(cell * 1.13 + seed * 7.7);
        if (hv.x < u_sparkDensity) {
          float h3 = hash21(cell + seed * 3.1 + 9.77);
          float delay = 5.0 * h3 * h3;          // biased to pop near the rim
          float life = 1.8 + 2.8 * fract(h3 * 19.37);
          float ts = tau - delay;
          if (ts > 0.0 && ts < life) {
            float lf = ts / life;
            float amp = smoothstep(0.0, 0.10, lf) * (1.0 - lf) * (1.0 - lf);
            float flick = 0.70 + 0.30 * sin(ts * (14.0 + 10.0 * hv.y) + hv.y * TAU);
            vec2 pos = (cell + 0.12 + 0.76 * hash22(cell * 1.71 + seed + 31.7)) * cellSz;
            float dpx = length(cssP - pos) * pr;
            float r = (1.7 + 1.4 * hv.y) * pr;
            float core = exp(-dpx * dpx / (r * r));
            float halo = 0.42 * exp(-dpx / (r * 3.4));
            vec3 hotc = mix(vec3(1.0, 0.93, 0.78), c3, 0.40);
            vec3 coolc = mix(c2, c0, 0.35) * 0.55;
            vec3 scol = mix(hotc, coolc, smoothstep(0.25, 0.90, lf));
            col += scol * amp * flick * (core + halo) * 1.45;
          }
        }
      }
    }
  }
  return col;
}

// visibility weight over a sheet phase: full while its front crosses the
// frame, fading in while still virgin paper and out once fully char. The
// rise [0.345,0.405] and fall [0.845,0.905] sit exactly half a cycle apart,
// so the two staggered sheets always sum to 1 — no brightness dip at handoff.
float vis(float p) {
  return smoothstep(0.345, 0.405, p) * (1.0 - smoothstep(0.845, 0.905, p));
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr    = max(u_pixelRatio, 0.25);
  vec2 fragPx = gl_FragCoord.xy;
  vec2 cssP   = fragPx / pr;
  float t     = u_time;

  float rimPx  = max(u_rimWidth, 1.0) * pr;
  float ragAmp = clamp(u_edgeRaggedness, 0.0, 4.0) * 0.18;
  float rate   = max(u_frontSpeed, 0.001) * 0.12; // threshold speed, s-units/sec

  // sweep geometry: margins sized so each sheet is fully virgin while it
  // fades in and fully char while it fades out, for every raggedness —
  // and no tighter, so the dark beat between burns stays brief.
  float m    = ragAmp + 0.08;
  float pre  = 0.95 + 2.91 * m;
  float post = 0.37 + 1.75 * m;
  float T    = pre + 1.0 + post;

  float ph0 = fract(t * rate / T + 0.53);
  float ph1 = fract(ph0 + 0.5);
  float w0 = vis(ph0);
  float w1 = vis(ph1);

  // ---- shared materials
  // paper: faint crossed fiber grain, barely above the house black
  float fib1 = vnoise(vec2(cssP.x / 4.5, cssP.y / 46.0));
  float fib2 = vnoise(vec2(cssP.x / 52.0, cssP.y / 4.1) + 7.3);
  vec3 paper = BG * (0.95 + 0.38 * (fib1 * 0.6 + fib2 * 0.4));
  // char: a half-step darker, softly mottled ash
  float mot = vnoise(cssP / 34.0 + 3.7) * 0.6 + vnoise(cssP / 9.0 + 8.1) * 0.4;
  vec3 charBase = BG * 0.42 * (0.70 + 0.60 * mot);

  vec3 col = vec3(0.0);
  if (w0 > 0.001) {
    col += w0 * shadeLayer(fragPx, cssP, ph0, vec2(3.7, 17.3),
                           c0, c1, c2, c3, ragAmp, pre, T, rimPx,
                           rate, paper, charBase, t, pr);
  }
  if (w1 > 0.001) {
    col += w1 * shadeLayer(fragPx, cssP, ph1, vec2(-11.1, 5.9),
                           c0, c1, c2, c3, ragAmp, pre, T, rimPx,
                           rate, paper, charBase, t, pr);
  }

  // gentle vignette to seat the sheet
  vec2 uv = fragPx / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.34 * smoothstep(0.35, 1.05, length(uv - 0.5) * 1.42);

  // tiny dither to keep the long glow gradients band-free
  col += (hash21(fragPx + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
