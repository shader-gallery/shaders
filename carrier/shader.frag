// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// carrier (Trace) — a monitoring rack of horizontal waveform traces, each a thin
// bright phosphor line with a soft glow halo, displaced vertically by exact sums
// of sinusoids. Channels scroll laterally at a steady reading pace while slow
// exact modulations evolve: an amplitude envelope swells on one, a frequency
// glide compresses another, a beat pattern walks a third — patient radio traffic
// after midnight. The modulation breathes on its own clock (u_modSpeed) so the
// traces swell and bend in place. Each channel takes one palette colour; its
// halo blends toward the neighbour hue.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four phosphor colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rowGap;       // px between channel baselines, css  (default 110)
uniform float u_signalSpeed;  // scroll + modulation clock scale     (default 0.08)
uniform float u_modDepth;     // envelope/glide intensity 0..1       (default 0.6)
uniform float u_lines;        // number of channel traces drawn      (default 14)
uniform float u_distort;      // inharmonic distortion / signal grit  (default 0.03)
uniform float u_modSpeed;     // how fast the modulation breathes     (default 0.35)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float LINE_CSS  = 1.15;   // trace half-thickness in css px
const float TAU       = 6.2831853;

// blend a palette colour from a continuous index on a 0..4 wheel (cyclic
// triangular weights — no dynamic array indexing, illegal in GLSL ES 1.00 frag)
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
vec3 wheel(vec3 a, vec3 b, vec3 cc, vec3 d, float s) {
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0);
  float w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (a*w0 + b*w1 + cc*w2 + d*w3) / max(w0+w1+w2+w3, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // palette with midnight fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- rack geometry ----------------------------------------------------------
  // ROW_GAP is a css-px distance; guard against 0 so we never divide by zero.
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float rowGap = max(u_rowGap, 1.0) * refScale * pr;
  float line   = LINE_CSS * pr;
  float depth  = clamp(u_modDepth, 0.0, 1.0);
  float spd    = u_signalSpeed;

  // horizontal phase: pixels → a normalized x in "wave units", plus a steady
  // lateral scroll. x in 0..1 across the frame maps to several wavelengths.
  float xn = fc.x / res.x;                 // 0..1 across the frame
  float scroll = t * spd;                  // steady reading-pace travel

  // We loop a fixed MAX of channels (constant loop bound, GLSL ES 1.00) but only
  // draw the first u_lines of them, fading the last one in smoothly as the count
  // rises so the slider never pops. The drawn stack is centred on u_lines.
  const int N = 14;
  float activeN = clamp(u_lines, 1.0, float(N));
  float fN = activeN;
  float distort = clamp(u_distort, 0.0, 1.0);
  float midY = res.y * 0.5;
  // total stack height of the ACTIVE channels, centre it
  float stackTop = midY + (activeN - 1.0) * 0.5 * rowGap;

  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // how much this channel counts: 1 below the cutoff, fading the partial top one,
    // 0 beyond u_lines (keeps the count slider continuous).
    float keep = clamp(activeN - fi, 0.0, 1.0);
    float baseY = stackTop - fi * rowGap;   // this channel's baseline

    // --- per-channel modulation, on its OWN breathing clock ------------------
    // the modulation (envelope / glide / beat) animates on u_modSpeed, decoupled
    // from the slow lateral scroll, so the waves visibly breathe in place rather
    // than only streaming sideways. each channel gets a distinct character via its
    // index; phases are offset so the stack never modulates in lockstep.
    float ph = fi * 1.7;                     // static per-channel phase offset
    float mt = t * max(u_modSpeed, 0.0);     // modulation breathing phase

    // amplitude envelope: swells and recedes
    float envMult = 1.0 + mod(fi, 3.0);      // 1,2,3,1,2,3 → varied rates
    float env = 1.0 + depth * 0.85 * sin(mt * envMult + ph);

    // frequency glide: base spatial frequency compresses and relaxes
    float glideMult = 1.0 + mod(fi + 1.0, 2.0); // alternate 1,2
    float glide = 1.0 + depth * 0.45 * sin(mt * glideMult * 0.8 + ph * 0.6);
    float f1 = (3.0 + fi * 0.6) * glide;     // primary frequency (varies per row)
    float f2 = f1 * 2.0;                      // exact harmonic
    float f3 = f1 * 0.5;                      // exact sub-harmonic

    // beat pattern: a slow second tone walks along the wave (amplitude beating)
    float beatMult = 1.0 + mod(fi + 2.0, 3.0);
    float beat = 0.5 + 0.5 * sin(mt * beatMult * 1.2 + ph * 1.3);

    // --- the waveform: exact sum of sinusoids, scrolling laterally -----------
    float u = (xn * f1 - scroll * (0.6 + fi * 0.07)) * TAU;
    float wave =
        0.60 * sin(u)
      + 0.28 * sin(u * (f2 / f1) + ph)              * mix(0.4, 1.0, beat)
      + 0.16 * sin(u * (f3 / f1) - scroll * 0.3 + ph);
    // distortion: inharmonic high-frequency content roughens the otherwise-clean
    // signal into a gritty, unstable trace (0 = the pristine ruled waveform).
    wave += distort * (
        0.30 * sin(u * 5.3  + ph * 2.0)
      + 0.22 * sin(u * 8.7  - scroll * 0.5 + ph)
      + 0.16 * sin(u * 13.1 + scroll * 1.3));
    // envelope shapes amplitude; amplitude in px is a fraction of the row gap so
    // traces stay within their lane and don't collide.
    float amp = rowGap * 0.34 * env;
    float y   = baseY + wave * amp;

    // --- render the trace as a thin antialiased line + glow halo -------------
    float dist = abs(fc.y - y);              // vertical distance to the trace
    // crisp core line (smoothstep AA)
    float core = 1.0 - smoothstep(line, line + 1.6 * pr, dist);
    // soft phosphor halo, width tied to rowGap so packing stays balanced
    float halo = exp(-dist * dist / (rowGap * rowGap * 0.018));

    // this channel's colour from the wheel; halo blends toward the neighbour hue
    float s  = mod(fi, fN) / fN * 4.0;       // channel hue index on 0..4 wheel
    float sN = mod(fi + 1.0, fN) / fN * 4.0; // neighbour hue index
    vec3 ccol = wheel(c0, c1, c2, c3, s);
    vec3 ncol = wheel(c0, c1, c2, c3, sN);

    // gentle brightness breathing tied to the envelope so swelling channels glow
    float glow = 0.6 + 0.4 * (env - 1.0 + 1.0) * 0.5 + 0.3 * beat;

    col += ccol * core * 1.15 * keep;                       // bright phosphor core
    col += mix(ccol, ncol, 0.5) * halo * 0.42 * glow * keep; // halo toward neighbour hue
  }

  // faint horizontal rule lines (baselines) for the monitoring-rack feel — very
  // dim so they read as etched guides, never competing with the traces.
  // (computed once from the nearest baseline)
  // radial vignette keeps frame edges dark
  vec2 ctr = res * 0.5;
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.78, 1.0, vign);

  // subtle scanline-free phosphor lift at the very dark end so blacks aren't dead
  col = max(col, BG);

  gl_FragColor = vec4(col, 1.0);
}
