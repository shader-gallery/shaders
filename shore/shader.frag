// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// shore — Brink family — shader.gallery foundry
// One quadratic Julia coastline (z -> z*z + c, 40 steps, bailout |z| > 4)
// glows between two near-black domains. The seed c creeps along a slightly
// inflated Mandelbrot cardioid, so the whole frontier writhes: peninsulas
// stretch into tendrils, bays pinch shut, islands detach and rejoin.
// Nothing translates and nothing resets; the boundary as a whole simply
// becomes a different boundary.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_writheSpeed; // seed creep along the cardioid, rad per second (default 0.06)
uniform float u_zoom;        // magnification of the plane about frame centre (default 1.15)
uniform float u_glowReach;   // escape bands kept luminous near the coast (default 1.6)
uniform float u_phaseSpread; // palette cycling rate across escape bands (default 0.8)

const int   ITER  = 40;            // constant-bound escape iterations
const float NMAX  = 40.0;
const float BAIL2 = 16.0;          // bailout |z| > 4, compared on |z|^2
const float TAU   = 6.28318530718;
const float A0    = 2.2;           // cardioid phase at t = 0

// Smooth escape data for z -> z*z + c.
// Escaped: returns vec2(nu, de) with nu = n + 1 - log2(log|z|) clamped >= 0
// and de = exterior distance estimate |z| log|z| / |dz| in plane units.
// Bounded after ITER steps: returns vec2(-1 - q, 0), q from the final radius.
vec2 julia(vec2 z, vec2 c) {
  vec2  dz = vec2(1.0, 0.0);
  float m2 = dot(z, z);
  for (int i = 0; i < ITER; i++) {
    dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x);
    z  = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    m2 = dot(z, z);
    if (m2 > BAIL2) {
      float mz = sqrt(m2);
      float de = mz * log(mz) / max(length(dz), 1e-12);
      // log|z| = 0.5 * log(m2); the log2 renormalisation removes band steps
      return vec2(max(float(i) + 1.0 - log2(0.5 * log(m2)), 0.0), de);
    }
  }
  return vec2(-1.0 - clamp(m2 * 0.25, 0.0, 1.0), 0.0);
}

// Cyclic weighted-cosine blend through the four palette colours, indexed by
// the fractional escape phase. Never a hard switch.
vec3 coastGlow(float nu, float de, float wDE, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float reach = max(u_glowReach, 0.05) * 2.2;   // perceptual band reach
  float d     = NMAX - nu;                      // band distance from the coast
  // escape-band glow: luminous bands hugging the coast plus a wider halo,
  // both scaled by reach so the whole margin widens and tightens together
  float glowB = exp(-d / reach) + 0.30 * exp(-d / min(reach * 3.0, 13.0));
  // coastline ribbon: true-distance glow so the frontier itself always burns,
  // even where the boundary runs smooth and the bands compress to a hairline
  float coast = exp(-de / wDE) + 0.25 * exp(-de / (wDE * 4.0));
  float band  = 0.58 + 0.42 * cos(TAU * nu);    // soft self-similar banding
  float bandS = 0.78 + 0.22 * cos(TAU * nu);    // gentler ripple for the ribbon
  float th    = nu * u_phaseSpread;
  float w0 = 0.5 + 0.5 * cos(th);
  float w1 = 0.5 + 0.5 * cos(th - 1.5707963);
  float w2 = 0.5 + 0.5 * cos(th - 3.1415927);
  float w3 = 0.5 + 0.5 * cos(th - 4.7123890);
  w0 *= w0; w0 *= w0; w1 *= w1; w1 *= w1;   // 4th power: crisp but still
  w2 *= w2; w2 *= w2; w3 *= w3; w3 *= w3;   // seamless colour lobes
  vec3 hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3)
           / max(w0 + w1 + w2 + w3, 1e-4);
  return hue * (glowB * band * 0.8 + coast * bandS * 0.75);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 base = vec3(0.035, 0.035, 0.043);

  float mind = min(u_resolution.x, u_resolution.y);
  vec2  p    = (gl_FragCoord.xy - 0.5 * u_resolution) / mind;

  float zoom  = max(u_zoom, 0.05);
  float scale = 3.8 / zoom;          // plane units across the short axis
  float px    = scale / mind;        // plane units per device pixel

  // Seed on a slightly inflated Mandelbrot cardioid: forever on the edge
  // between connected and dust. Phase-continuous closed orbit, no resets.
  float a = A0 + u_time * u_writheSpeed;
  vec2  c = 1.02 * vec2(0.5 * cos(a) - 0.25 * cos(2.0 * a),
                        0.5 * sin(a) - 0.25 * sin(2.0 * a));

  vec2 z0 = p * scale;

  // 4-rook supersampling: the coastline is fractal, so AA carries the look
  vec2 o0 = vec2( 0.125,  0.375) * px;
  vec2 o1 = vec2( 0.375, -0.125) * px;
  vec2 o2 = vec2(-0.125, -0.375) * px;
  vec2 o3 = vec2(-0.375,  0.125) * px;

  // coastline ribbon width in plane units, zoom-invariant on screen and
  // widened or tightened along with the band reach
  float wDE = scale * 0.0055 * (max(u_glowReach, 0.05) / 1.6);

  vec3  acc   = vec3(0.0);   // exterior glow
  float inAcc = 0.0;         // filled-interior coverage

  vec2 r = julia(z0 + o0, c);
  if (r.x < -0.5) { inAcc += 0.75 + 0.25 * (-r.x - 1.0); }
  else            { acc += coastGlow(r.x, r.y, wDE, c0, c1, c2, c3); }
  r = julia(z0 + o1, c);
  if (r.x < -0.5) { inAcc += 0.75 + 0.25 * (-r.x - 1.0); }
  else            { acc += coastGlow(r.x, r.y, wDE, c0, c1, c2, c3); }
  r = julia(z0 + o2, c);
  if (r.x < -0.5) { inAcc += 0.75 + 0.25 * (-r.x - 1.0); }
  else            { acc += coastGlow(r.x, r.y, wDE, c0, c1, c2, c3); }
  r = julia(z0 + o3, c);
  if (r.x < -0.5) { inAcc += 0.75 + 0.25 * (-r.x - 1.0); }
  else            { acc += coastGlow(r.x, r.y, wDE, c0, c1, c2, c3); }

  acc   *= 0.25;
  inAcc *= 0.25;

  vec3  glowC = 1.0 - exp(-acc * 5.5);             // soft highlight rolloff
  vec3  inner = inAcc * 0.09 * mix(c1, c0, 0.6);   // interior a hair above base
  float vig   = 1.0 - 0.38 * smoothstep(0.34, 0.80, length(p));

  vec3 col = base + (glowC + inner) * vig;
  gl_FragColor = vec4(col, 1.0);
}
