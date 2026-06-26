// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// undertow (Wake) — concentric ripples & interference: three drifting sources emit
// expanding rings whose phases sum into a standing wave field, rendered as glowing
// contour bands over a deep dark base, palette-tinted by phase and position. The
// sources orbit on closed loops and the wave uses periodic time, so the whole field
// drifts and breathes with no visible jump or reset.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;       // drift/tick speed multiplier      (default 1)
uniform float u_wavelength;  // ripple wavelength, css px        (default 150)
uniform float u_bands;       // contour bands per wave cycle     (default 1.6)
uniform float u_glow;        // contour-line glow multiplier     (default 1)
uniform float u_mouseInfluence; // mouse ripple strength, 0=off  (default 1)

const float BG  = 0.039;   // deep dark base ~ #0A
const float TAU = 6.2831853;

// one expanding-ring source: returns a signed wave height in -1..1
float ripple(vec2 fc, vec2 src, float wavelen, float phase, float t) {
  float d = distance(fc, src);
  // amplitude falls with distance so far sources don't wash the field
  float amp = exp(-d / (wavelen * 4.0));
  return amp * sin(d / wavelen * TAU - t + phase);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time * u_speed;
  float wl  = u_wavelength * pr;
  float R   = max(res.x, res.y);

  // --- three sources orbiting on closed loops (seamless) + a mouse nudge ---
  vec2 s0 = vec2(res.x * (0.32 + 0.10 * sin(t * 0.23)),
                 res.y * (0.40 + 0.12 * cos(t * 0.19)));
  vec2 s1 = vec2(res.x * (0.70 + 0.11 * cos(t * 0.17)),
                 res.y * (0.62 + 0.10 * sin(t * 0.27)));
  vec2 s2 = vec2(res.x * (0.55 + 0.13 * sin(t * 0.13)),
                 res.y * (0.30 + 0.11 * cos(t * 0.21)));
  // mouse drags a fourth source in when present (0,0 parks it off-field)
  vec2 sm = (u_mouse.x + u_mouse.y > 1.0) ? u_mouse : vec2(-R);

  // --- sum the ripple field, each source ticking at its own speed ---
  float h = 0.0;
  h += ripple(fc, s0, wl, 0.0,        t * 0.9);
  h += ripple(fc, s1, wl, 2.1,        t * 1.1);
  h += ripple(fc, s2, wl, 4.2,        t * 0.8);
  h += ripple(fc, sm, wl * 0.7, 1.0,  t * 1.3) * 0.8 * u_mouseInfluence;

  // contour bands: fold the summed height into repeating glowing lines
  float bandPhase = h * u_bands;
  float ridge = abs(fract(bandPhase) - 0.5) * 2.0;       // 0 between lines, 1 at line centre
  float line  = smoothstep(0.78, 1.0, ridge);            // thin bright contour, lots of gap
  // soft fill between lines keeps it from reading as bare wireframe
  float fill  = 0.5 + 0.5 * cos(bandPhase * TAU);

  // --- resolve palette (all colour comes from here when themed) ---
  // Some headless contexts can't bind a uniform array by its bare name, leaving
  // the palette at zero; fall back to the default "midnight" hues so the look
  // survives there while staying fully themeable in the browser runtime.
  vec3 pal0 = u_palette[0], pal1 = u_palette[1];
  vec3 pal2 = u_palette[2], pal3 = u_palette[3];
  if (dot(pal0 + pal1 + pal2 + pal3, vec3(1.0)) < 0.01) {
    pal0 = vec3(0.231, 0.510, 0.965);
    pal1 = vec3(0.659, 0.333, 0.969);
    pal2 = vec3(0.133, 0.827, 0.933);
    pal3 = vec3(0.957, 0.247, 0.369);
  }

  // --- palette tint by phase (which band) and by position (radial) ---
  float ph    = fract(h * 0.5 + 0.5);                    // 0..1 cycling phase
  vec3 cool   = mix(pal0, pal2, ph);                     // blue <-> cyan
  vec3 warm   = mix(pal1, pal3, ph);                     // violet <-> rose
  float radial = smoothstep(R * 0.85, 0.0, distance(fc, ctr));
  vec3 tint   = mix(cool, warm, radial * 0.6 + 0.18 * ph);

  // --- compose: dark base + faint fill glow + bright contour lines ---
  vec3 col = vec3(BG, BG, 0.047);
  col += tint * fill * 0.06;                             // restrained between-line wash
  col += tint * line * (0.65 + 0.45 * radial) * u_glow; // glowing contour bands

  // gentle source halos so the emitters read as luminous points
  col += pal0 * 0.10 * smoothstep(R * 0.30, 0.0, distance(fc, s0));
  col += pal2 * 0.09 * smoothstep(R * 0.28, 0.0, distance(fc, s1));
  col += pal1 * 0.08 * smoothstep(R * 0.26, 0.0, distance(fc, s2));

  // vignette to settle the edges into the dark
  float vig = smoothstep(1.05, 0.35, length((fc - ctr) / res));
  col *= 0.55 + 0.45 * vig;

  gl_FragColor = vec4(col, 1.0);
}
