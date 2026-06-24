// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// gimbal (Trace) — three nested gyroscope rings tumbling in implied 3D at the
// centre of the frame. Each ring is a circle rotating about its own axis, drawn
// as the projected ellipse it casts: a thin luminous phosphor band whose near
// side renders brighter and slightly thicker than its far side to sell depth.
// Where two ring projections cross, a small glint blooms — brighter when the
// rings pass close in depth — so the instrument sparkles at its intersections.
// The rings tumble at three rational rates that close seamlessly over ~90s.
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
uniform float u_tumbleSpeed; // scales all three ring rotation rates (default 0.5)
uniform float u_radius;      // outer ring radius, css px       (default 320)
uniform float u_glint;       // intersection bloom brightness    (default 1)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU      = 6.2831853;
const int   SAMPLES  = 220;   // points sampled along each ring circle
const float BAND_CSS = 1.9;   // phosphor band half-thickness, css px

// rotate a 3D point by Euler-ish angles (about X then Y then Z)
vec3 rot3(vec3 p, vec3 a) {
  float cx = cos(a.x), sx = sin(a.x);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  float cy = cos(a.y), sy = sin(a.y);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  float cz = cos(a.z), sz = sin(a.z);
  p = vec3(cz * p.x - sz * p.y, sz * p.x + cz * p.y, p.z);
  return p;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // tumble phase: base angular rate scaled by the speed param. Rational ratios
  // (1 : 0.6 : 1.4 etc.) keep the dance closing over a long shared period.
  float spd = max(u_tumbleSpeed, 0.0);
  float ph  = t * spd * 0.18;

  // outer radius in device px; inner rings nest at 0.70 and 0.40 of it.
  // 0.62 keeps the default 320css ring comfortably within an 800px-tall frame
  // once perspective scale-up is applied.
  float R0 = max(u_radius, 1.0) * pr * 0.62;

  // Palette with house fallback (headless can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // pixel relative to centre
  vec2 p = fc - ctr;

  // perspective projection: a 3D point (x,y,z) maps to screen by 1/(1 - z/D)
  float D = R0 * 4.6; // camera distance (in px units) for gentle perspective

  // per-ring accumulators: total glow, and a "depth at nearest sample" buffer
  // recorded per ring so we can detect when two rings cross close in depth.
  vec3  col = BG;
  float band = BAND_CSS * pr;

  // we accumulate each ring's contribution; also track, for the glint pass, the
  // signed depth (z) of whichever sample of each ring lands nearest this pixel.
  float zNear0 = -1e3, wNear0 = 0.0;
  float zNear1 = -1e3, wNear1 = 0.0;
  float zNear2 = -1e3, wNear2 = 0.0;

  vec3  glowSum = vec3(0.0);
  float glintAccum = 0.0;

  // unrolled-by-loop over the three rings via a constant 3-iteration loop
  for (int ring = 0; ring < 3; ring++) {
    float fr = float(ring);
    // ring radius shrinks for inner rings
    float Rr = R0 * (1.0 - 0.30 * fr);
    // each ring tumbles about its own axis at a distinct rational rate
    float r1 = 1.0 + 0.4 * fr;          // 1.0, 1.4, 1.8
    float r2 = 0.6 + 0.5 * fr;          // 0.6, 1.1, 1.6
    float r3 = 0.8 - 0.25 * fr;         // 0.8, 0.55, 0.30
    vec3 ang = vec3(ph * r1 + fr * 1.7,
                    ph * r2 + fr * 0.9,
                    ph * r3 + fr * 2.3);

    // ring colour: one palette entry per ring (4th reserved for glints)
    vec3 ringCol = (ring == 0) ? c0 : (ring == 1) ? c1 : c2;

    float nearestD = 1e9;  // nearest screen distance to this ring's band
    float nearestZ = 0.0;  // depth (z, +near/−far after projection sign) there
    float ringGlow = 0.0;

    // sample the circle, project, find min screen distance & its depth
    for (int i = 0; i < SAMPLES; i++) {
      float u = (float(i) + 0.5) / float(SAMPLES) * TAU;
      vec3 q = rot3(vec3(cos(u) * Rr, sin(u) * Rr, 0.0), ang);
      // perspective: nearer (q.z>0) points scale up
      float persp = D / max(D - q.z, 1.0);
      vec2 sp = q.xy * persp;
      float d = length(p - sp);
      if (d < nearestD) { nearestD = d; nearestZ = q.z; }
      // soft phosphor band from this sample (accumulate so the band is smooth)
      float near = 0.5 + 0.5 * (q.z / Rr); // 0 far .. 1 near
      float thick = band * (0.85 + 0.55 * near);
      float seg = exp(-d * d / (thick * thick * 2.2));
      ringGlow += seg * (0.42 + 0.85 * near);
    }

    // normalise the sampled band so it doesn't depend on SAMPLES density
    ringGlow *= 0.085;
    ringGlow = min(ringGlow, 1.6);

    glowSum += ringCol * ringGlow;

    // record nearest depth for the glint pass (weighted by how close the band is)
    float prox = exp(-nearestD * nearestD / (band * band * 60.0));
    if (ring == 0) { zNear0 = nearestZ; wNear0 = prox; }
    else if (ring == 1) { zNear1 = nearestZ; wNear1 = prox; }
    else { zNear2 = nearestZ; wNear2 = prox; }
  }

  // --- glint pass: where two rings' bands overlap at this pixel, bloom. The
  // glint is brighter when the two rings pass close in depth (small |dz|). ---
  float g01 = wNear0 * wNear1 * exp(-abs(zNear0 - zNear1) / (R0 * 0.55 + 1.0));
  float g02 = wNear0 * wNear2 * exp(-abs(zNear0 - zNear2) / (R0 * 0.55 + 1.0));
  float g12 = wNear1 * wNear2 * exp(-abs(zNear1 - zNear2) / (R0 * 0.55 + 1.0));
  glintAccum = (g01 + g02 + g12);

  // 4th palette colour reserved for the glints
  vec3 glintCol = c3;

  col += glowSum;
  // glint core + soft bloom
  col += glintCol * glintAccum * (2.1 * u_glint);
  col += glintCol * pow(glintAccum, 0.45) * (0.85 * u_glint);

  // gentle radial vignette to compose the framing and keep edges dark
  float vign = 1.0 - smoothstep(0.55, 1.15, length(p / res));
  col *= mix(0.82, 1.0, vign);

  // subtle phosphor lift on the whole instrument so the dark base glows faintly
  col += glowSum * 0.06;

  gl_FragColor = vec4(col, 1.0);
}
