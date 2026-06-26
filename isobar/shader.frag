// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// isobar (Strata) — a satellite night-pass over a stormy sea. Two or three
// spiral storm systems hang on the near-black chart, each a pinwheel of soft
// luminous rain bands: log-spiral streaks winding into a small dark calm eye.
// Band brightness peaks at mid-radius and falls toward both the eye and the
// open dark; hue blends through the four palette colours by radius so each
// storm carries the restrained rainbow from core to fringe. No isolines — the
// chart is all soft coiled streaks. Each pinwheel revolves about its own eye;
// the systems drift bodily across the chart on smooth noise paths and breathe
// (deepen and fill) on long offset phases. All phase-continuous — storms never
// pop in or reset.
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
uniform float u_spin;     // angular speed of each pinwheel about its eye  (default 0.25)
uniform float u_drift;    // speed storms travel bodily across the chart   (default 0.3)
uniform float u_winding;  // how tightly the rain bands coil into the eye  (default 5)
uniform float u_eye;      // dark calm eye diameter in CSS px              (default 60)

const vec3  BG       = vec3(0.030, 0.031, 0.040); // near-black chart base
const float NBANDS   = 5.0;   // number of bright rain bands per pinwheel arm wheel
const float TWO_PI   = 6.2831853;

// smooth value noise (for drift paths) -------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// one storm system: accumulate its luminous spiral contribution into col.
// p   = fragment position relative to chart centre, in CSS-px-ish units
// id  = storm index (seeds phase/path)
// pr  = pixelRatio
// c0..c3 = palette
vec3 storm(vec2 p, float id, float pr, vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t) {
  // --- bodily drift on smooth noise paths (phase-continuous) ---
  float dt = t * u_drift;
  float seed = id * 7.31;
  vec2 path = vec2(
    vnoise(vec2(dt * 0.07 + seed, seed * 1.7)) - 0.5,
    vnoise(vec2(seed * 2.3, dt * 0.06 + seed * 1.1)) - 0.5
  );
  // home position for this storm, spread across the chart, plus a slow wander
  float ang0 = id * 2.3994; // golden-ish angular spread of homes
  vec2 home = vec2(cos(ang0), sin(ang0)) * (170.0 + id * 18.0);
  vec2 ctr  = home + path * (240.0 * u_drift + 8.0);
  ctr *= pr;

  vec2 q = p - ctr;
  float r = length(q) / pr;          // radius in CSS px
  float a = atan(q.y, q.x);          // angle

  // --- breathing: long, offset phases. peak => arms brighter, eye tighter ---
  float breath = 0.5 + 0.5 * sin(t * 0.10 + id * 2.1);
  float eyeR   = max(u_eye, 6.0) * 0.5 * mix(1.15, 0.72, breath); // eye radius CSS px
  float peakR  = eyeR + 80.0 + id * 10.0;   // radius of brightest bands
  float outerR = peakR + 115.0;             // fade into open dark by here

  // --- rotation about this eye (phase-continuous) + log-spiral winding ---
  float spinPh = t * u_spin + id * 1.7;
  // log spiral: phase = winding * log(r) - angle - spin. constant-phase loci
  // are equiangular spirals coiling into the eye.
  float lr = log(max(r, eyeR * 0.5) / eyeR);
  float phase = u_winding * lr - a - spinPh;

  // soft rain bands: NBANDS bright streaks around the wheel, smooth (gauzy)
  float bands = 0.5 + 0.5 * sin(phase * NBANDS);
  bands = pow(bands, 2.4);          // sharpen the bright streaks, keep gaps dark
  bands = smoothstep(0.04, 0.9, bands); // floor the gaps to true dark

  // radial envelope: brightness peaks at mid-radius, falls toward eye + dark.
  // smooth ramp up out of the eye, smooth fall into the open sea.
  float inner = smoothstep(eyeR * 0.85, peakR, r);          // 0 in eye -> 1 at peak
  float outer = 1.0 - smoothstep(peakR * 0.95, outerR, r);  // 1 at peak -> 0 far out
  float env   = inner * outer;
  env = pow(env, 1.3);              // tighten the bright annulus toward mid-radius
  // deep dark calm eye: hard suppression inside eyeR
  float eyeMask = smoothstep(eyeR * 0.55, eyeR * 1.05, r);
  env *= eyeMask;

  // breathing fills the arms: brighter at peak
  float fill = mix(0.42, 1.0, breath);

  float bright = bands * env * fill;

  // hue blends through the four palette colours by radius (core -> fringe)
  float radN = clamp((r - eyeR) / (outerR - eyeR), 0.0, 1.0);
  float s  = radN * 3.0; // span colours 0..3 across the storm radius
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3 hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // a faint inner halo just outside the eye so the calm centre reads as a hole
  float rim = exp(-pow((r - eyeR * 1.1) / (eyeR * 0.6 + 1.0), 2.0)) * 0.18 * eyeMask;

  return hue * (bright * 0.85 + rim);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // chart-centred coordinates (y up), in device px
  vec2 p = fc - ctr;

  // palette + house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 col = BG;

  // three storm systems; outer arms shear faintly into one another across gaps.
  col += storm(p, 0.0, pr, c0, c1, c2, c3, t);
  col += storm(p, 1.0, pr, c0, c1, c2, c3, t);
  col += storm(p, 2.0, pr, c0, c1, c2, c3, t);

  // a very faint large-scale chart grain so the open dark isn't a flat void
  float grain = vnoise(fc / (60.0 * pr) + t * 0.01) * 0.012;
  col += grain;

  // gentle vignette: keep the chart edges deep and the body luminous
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.78, 1.0, vign);

  // soft tonemap so overlapping arms don't blow out to flat white
  col = col / (1.0 + col * 0.65);

  gl_FragColor = vec4(col, 1.0);
}
