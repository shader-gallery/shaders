// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// tulle (Loom) — the camera/distortion register. A fine net of lace dots is bent by
// a perspective fall-off and a soft swirl, so the marks bunch and shrink toward a
// fold the way a sheet of tulle netting hangs and recedes into depth. A radial wave
// still washes brightness through the dots. The same lace idea as lacework, seen
// draped in space rather than flat-on.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_spacing;     // px between dots (in flat space)
uniform float u_dotSize;     // dot radius
uniform float u_persp;       // perspective fall-off strength
uniform float u_foldY;       // vertical position of the fold the net recedes to
uniform float u_swirl;       // soft swirl of the sheet
uniform float u_wavelength;  // radial wavelength
uniform float u_waveSpeed;   // wave travel speed
uniform float u_ripples;     // ripple count
uniform float u_swell;       // wavefront swell of the dots
uniform float u_glow;        // dot brightness
uniform float u_backlight;   // soft drifting backlight
uniform float u_crisp;       // edge sharpness

const float BG = 0.039;

vec3 paletteRamp(float h) {
  vec3 c = mix(u_palette[0], u_palette[1], smoothstep(0.00, 0.34, h));
  c = mix(c, u_palette[2], smoothstep(0.33, 0.67, h));
  c = mix(c, u_palette[3], smoothstep(0.66, 1.00, h));
  return c;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;
  float R   = max(res.x, res.y);

  vec3 col = vec3(BG, BG, 0.047);

  vec2 b0 = vec2(res.x * (0.32 + 0.18 * sin(t * 0.55)), res.y * (0.42 + 0.14 * cos(t * 0.6)));
  vec2 b1 = vec2(res.x * (0.70 + 0.14 * cos(t * 0.7)), res.y * (0.56 + 0.14 * sin(t * 0.5)));
  col += u_palette[0] * (0.18 * u_backlight) * smoothstep(R * 0.55, 0.0, distance(fc, b0));
  col += u_palette[2] * (0.15 * u_backlight) * smoothstep(R * 0.45, 0.0, distance(fc, b1));

  // normalized coords (up = +y); fold line is the horizontal crease the net curves
  // away toward, set near the top of the frame
  vec2  c    = (fc - ctr) / R;
  float fold = u_foldY;
  // depth below the fold: 0 at the crease, growing toward the near (bottom) edge.
  // u_persp lifts the floor so the whole net stays in view even at strong perspective
  float depth = clamp((fold - c.y) + 0.12 / max(u_persp, 0.1), 0.04, 3.0);

  // soft swirl of the hanging sheet, easing out toward the edges
  float ang = u_swirl * smoothstep(1.1, 0.0, length(c)) * 0.7;
  float cs = cos(ang), sn = sin(ang);
  vec2  cw = mat2(cs, -sn, sn, cs) * c;
  float cdepth = clamp((fold - cw.y) + 0.12 / max(u_persp, 0.1), 0.04, 3.0);

  // rows BUNCH toward the fold (log compression) while columns spread gently toward
  // the near edge (mild trapezoid) - a net curving over a crease, not a vortex funnel
  vec2  warp;
  warp.y = -log(cdepth) * (0.5 + 0.5 * u_persp) * R * 0.42;
  warp.x = cw.x * (0.6 + 0.5 * u_persp * cdepth) * R;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  vec2  cellId  = floor(warp / spacing);
  vec2  dotCtr  = (cellId + 0.5) * spacing;
  vec2  local   = warp - dotCtr;

  float dCtr = length(dotCtr);
  float ph   = (dCtr / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed;
  float m    = max(0.0, sin(ph));

  // near dots are large and bright, far dots (toward the fold) shrink - the recede.
  // floor the far size so distant rows still read (the net stays a full background,
  // not an empty top half) while the near rows still swell larger for depth
  float persp = clamp(cdepth, 0.5, 1.5);
  float ss    = pr * refScale;
  float minPx = 1.0 * pr;
  float dotR  = max((2.6 * u_dotSize) * (0.7 + u_swell * m * 0.7) * persp, minPx);
  float dDot  = length(local) - dotR;
  float aa    = mix(1.5, 0.5, clamp(u_crisp, 0.0, 1.0)) * pr;
  float mask  = 1.0 - smoothstep(-aa, aa, dDot);
  // fade marks right at the fold so the bunching does not alias to a hard line
  mask *= smoothstep(0.05, 0.22, cdepth);

  float hue     = fract((atan(dotCtr.y, dotCtr.x) + 3.14159265) / 6.2831853 + t * 0.013);
  vec3  rainbow = 0.55 + 0.45 * cos(6.2831853 * hue + vec3(0.0, 2.094, 4.188));
  vec3  dotCol  = mix(rainbow, paletteRamp(hue), 0.5);
  // brightness stays mostly wave-independent so the net reads full at every phase,
  // the wave only adding a moving sheen rather than gating visibility
  float opacity = clamp(0.78 + m * 0.3, 0.0, 1.0);
  // near dots (large persp) read brighter so the front of the draped net pops
  float nearBoost = 0.9 + 0.5 * smoothstep(0.5, 1.4, persp);

  col += dotCol * mask * opacity * (1.0 + 0.45 * m) * nearBoost * u_glow;

  float ign = fract(52.9829189 * fract(dot(fc + t * 1.7, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
