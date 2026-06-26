// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;

// louver — Umbra family. Shadow of venetian blinds on a lamp-washed wall.
// One mod() over the across-band coordinate builds the slat stack; each
// band gets a penumbra width graded by its index (implied slat-to-wall
// distance), so bottom bars cut sharp and top bars melt into grey breath.

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_slatGap;     // css-px distance between successive shadow bars (default 56)
uniform float u_tiltRange;   // slat tilt swing over a breath cycle -> band width range (default 0.55)
uniform float u_penumbra;    // how strongly edge blur grows with bar height (default 0.9)
uniform float u_driftSpeed;  // lateral lamp drift speed, shears the band diagonal (default 0.3)

const vec3 BG = vec3(0.035, 0.035, 0.043);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(17.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr  = max(u_pixelRatio, 1e-3);
  vec2  q   = gl_FragCoord.xy / pr;   // css-px coordinates
  vec2  R   = u_resolution / pr;      // css-px frame size
  float gap = max(u_slatGap, 4.0);

  // --- timelines: all phase-continuous sines, no resets ---
  float ds      = u_driftSpeed;
  float breath  = sin(u_time * 0.42);                    // one long tilt breath
  float meltPh  = sin(u_time * 0.42 + 1.9);              // penumbra melt, out of phase
  float shear   = 0.085 * sin(u_time * ds * 0.61);       // lamp drift shears the diagonal
  float stretch = 1.0 + 0.16 * sin(u_time * ds * 0.37);  // projective stretch of the stack
  float lampSw  = sin(u_time * ds * 0.50);               // lamp lateral swing

  // --- lamp wash: hot lower corner, c0 core through c1 into near-black ---
  vec2  lampPos  = vec2((0.20 + 0.16 * lampSw) * R.x, -0.22 * R.y);
  float dl       = length(q - lampPos) / max(R.y, 1.0);
  float washHot  = exp(-dl * dl * 3.4);
  float washWide = exp(-dl * 1.55);

  // --- slat band field: one mod() over the across-band coordinate ---
  float ang    = 0.14 + shear;                 // slight diagonal + drift shear
  vec2  across = vec2(sin(ang), cos(ang));
  vec2  rel    = q - vec2(0.5 * R.x, 0.0);     // pivot at bottom centre
  float gapE   = gap * stretch;
  float n      = dot(rel, across) / gapE;
  float idx    = floor(n);
  float m      = (fract(n) - 0.5) * gapE;      // signed css-px dist from band centre

  // band height up the stack = implied occluder-to-wall distance (per band)
  float hN = clamp((idx + 0.5) * gapE / (R.y * 1.05), 0.0, 1.0);

  // slat tilt -> dark band duty (all bands widen and narrow together)
  float duty = 0.22 + 0.55 * u_tiltRange * (0.5 + 0.5 * breath);
  float hw   = 0.5 * gapE * duty;

  // penumbra: blur grows with band height; razor at 0, melting at 2
  float hCurve = hN * hN * (0.4 + 1.4 * hN);   // steeper growth toward the top
  float wPen   = (0.7 + u_penumbra * (0.8 + 30.0 * hCurve)) * (1.0 + 0.35 * meltPh);

  float am     = abs(m);
  float shadow = 1.0 - smoothstep(hw - wPen, hw + wPen, am);
  float light  = 1.0 - 0.92 * shadow;

  // whisper of plaster on the lit wall so gaps never read flat
  float plaster = 0.90 + 0.20 * fbm(q * 0.045 + vec2(3.1, 7.7));

  vec3 col = BG;
  col += (c0 * washHot * 1.05 + c1 * washWide * 0.55) * light * plaster;
  col += c1 * 0.045 * light * plaster;   // faint ambient so top bands still breathe

  // c2 fringe: the extended lamp cool limb bleeding into the penumbra
  float fr = shadow * (1.0 - shadow) * 4.0;
  col += c2 * fr * (0.05 + 0.95 * washWide) * 0.30 * clamp(wPen / 7.0, 0.2, 1.0);

  // c3 hairline: light leaking along each slat string line
  float hlw = 0.9 + 0.07 * wPen;
  float hl  = exp(-(m * m) / (hlw * hlw));
  col += c3 * hl * shadow * (0.12 + 0.55 * washWide);

  // mild vignette, kept gentle so the hot corner survives
  vec2  uvn = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.35 * dot(uvn, uvn) * 2.0;

  gl_FragColor = vec4(col, 1.0);
}
