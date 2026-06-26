// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// lyre (Current) — a rack of plucked strings. Bright vertical strings are fixed
// top and bottom and vibrate in standing-wave harmonics: one hums in its
// fundamental, its neighbour in the second mode with a still node at its waist,
// the next in the third, and so on. Each string is plucked, swells and rings down,
// then is plucked again, the antinodes glowing brightest where the string swings
// widest and the nodes holding dark and still. Strings take palette hues by
// position. A warp of vertical threads given the voice of the carrier signal.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four string colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spacing; // px between strings, css                       (default 30)
uniform float u_thick;   // string half-width in CSS px                   (default 2.0)
uniform float u_amp;     // vibration amplitude (swing of the antinodes)  (default 9)
uniform float u_modes;   // highest harmonic present across the rack       (default 5)
uniform float u_pluck;   // pluck / ring-down rate                        (default 0.35)
uniform float u_glow;    // string emission                               (default 1.0)
uniform float u_node;    // brightness lift at the swinging antinodes      (default 0.7)

const vec3  BG  = vec3(0.039, 0.039, 0.047);
const float TAU = 6.2831853;
const float PI  = 3.14159265;

float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

vec3 tint4(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x) {
  float s = clamp(x, 0.0, 1.0) * 3.0;
  vec3 c = c0;
  c = mix(c, c1, smoothstep(0.0, 1.0, s));
  c = mix(c, c2, smoothstep(1.0, 2.0, s));
  c = mix(c, c3, smoothstep(2.0, 3.0, s));
  return c;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  float refScale = min(res.x, res.y) / (pr * 400.0);
  float spacing  = max(u_spacing, 10.0) * refScale * pr;
  float thick    = max(u_thick, 0.5) * refScale * pr;
  float amp      = u_amp * refScale * pr;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t     = u_time;
  float glow  = max(u_glow, 0.0);
  float yN    = fc.y / res.y;                 // 0 at bottom, 1 at top (fixed ends)
  float modes = max(u_modes, 1.0);

  vec3 col = BG;

  // accumulate the nearest few strings so anti-aliased lines overlap softly
  float cell = floor(fc.x / spacing);
  for (int k = -1; k <= 1; k++) {
    float id = cell + float(k);
    float r1 = hash11(id * 1.7 + 0.3);
    float r2 = hash11(id * 2.9 + 5.1);
    float baseX = (id + 0.5) * spacing;

    // harmonic mode for this string: 1..modes
    float n = floor(1.0 + r1 * (modes - 0.001));
    // mode shape: standing wave with (n-1) interior nodes, zero at both ends
    float shape = sin(n * PI * yN);
    // ring frequency rises with the mode (f_n ~ n); temporal vibration
    float omega = (1.4 + 0.6 * n) * TAU * 0.5;
    // pluck envelope: each string is plucked on its own clock, rings down, repeats
    float clk   = t * max(u_pluck, 0.0) * 0.5 + r2;
    float env   = exp(-fract(clk) * 3.0);      // 1 at the pluck, decays to ~0, loops
    float pluckFlash = smoothstep(0.0, 0.06, fract(clk)) * (1.0 - smoothstep(0.0, 0.12, fract(clk)));

    // horizontal displacement of the string at this height
    float disp = amp * shape * cos(omega * t) * env;
    float sx   = baseX + disp;
    float d    = abs(fc.x - sx);

    float core = 1.0 - smoothstep(thick, thick + 2.0 * pr, d);
    float halo = exp(-d / (8.0 * pr));

    // antinodes (|shape| near 1) glow brighter as they swing; nodes stay quiet
    float anti = abs(shape);
    float lift = 0.55 + u_node * anti * (0.4 + 0.6 * env) + 0.8 * pluckFlash;

    vec3 tint = tint4(c0, c1, c2, c3, baseX / res.x);
    col += tint * core * (0.8 * lift) * glow;
    col += tint * halo * (0.22 * lift) * glow;
  }

  // faint string-coloured wash keyed to height so the field is not dead-black
  vec3 washCol = tint4(c0, c1, c2, c3, fc.x / res.x);
  col += washCol * (0.025 + 0.03 * sin(yN * PI)) * glow;

  // vertical falloff so the fixed ends settle a touch darker
  float vy = smoothstep(0.0, 0.12, yN) * smoothstep(0.0, 0.12, 1.0 - yN);
  col *= 0.7 + 0.3 * vy;

  col = col / (col + vec3(0.9)) * 1.45;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
