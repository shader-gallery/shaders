// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// tatting (Loom) — a fine halftone field of pure round dots, like knotted tatted
// lace. Concentric ripples wash outward from one or more sources; each dot SWELLS
// and brightens on a passing wavefront and shrinks back to a pinprick between them.
// No cross morph (cf. lacework) — this is the dots-only register: a breathing
// halftone whose density carries the whole frame.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_spacing;     // px between dots
uniform float u_dotSize;     // resting dot radius scale
uniform float u_swell;       // how much a wavefront swells a dot
uniform float u_wavelength;  // radial wavelength, css px
uniform float u_waveSpeed;   // wave travel speed
uniform float u_ripples;     // ripple count (frequency multiplier)
uniform float u_glow;        // dot brightness
uniform float u_backlight;   // soft drifting glow-blob backlight
uniform float u_crisp;       // edge sharpness of the dots
uniform float u_points;      // number of ripple emitters (1..4)
uniform float u_splash;      // reach of each localized splash
uniform float u_originX;     // wave origin offset x
uniform float u_originY;     // wave origin offset y
uniform float u_rotate;      // grid rotation (degrees)

const float BG = 0.039;

float hash11(float p) { p = fract(p * 0.2317); p *= p + 23.19; p *= p + p; return fract(p); }

vec2 emitOffset(int i) {
  if (i == 0) return vec2(0.0, 0.0);
  if (i == 1) return vec2(-0.52, 0.46);
  if (i == 2) return vec2(0.58, -0.40);
  return vec2(-0.44, -0.52);
}

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

  vec3 col = vec3(BG, BG, 0.047);

  // soft drifting backlight (kept restrained — density, not a colour wash)
  vec2 b0 = vec2(res.x * (0.32 + 0.18 * sin(t * 0.6)), res.y * (0.38 + 0.14 * cos(t * 0.5)));
  vec2 b1 = vec2(res.x * (0.70 + 0.14 * cos(t * 0.7)), res.y * (0.60 + 0.14 * sin(t * 0.8)));
  float R = max(res.x, res.y);
  col += u_palette[0] * (0.20 * u_backlight) * smoothstep(R * 0.55, 0.0, distance(fc, b0));
  col += u_palette[2] * (0.16 * u_backlight) * smoothstep(R * 0.45, 0.0, distance(fc, b1));

  // grid transform: rotation only (a clean halftone weave)
  vec2 q = fc - ctr;
  float ca = cos(radians(u_rotate)), sa = sin(radians(u_rotate));
  q = mat2(ca, -sa, sa, ca) * q;
  vec2 pf = q + ctr;

  vec2 worigin = ctr + vec2(u_originX, u_originY) * (res * 0.5);

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  vec2  cellId  = floor(pf / spacing);
  vec2  dotCtr  = (cellId + 0.5) * spacing;
  vec2  local   = pf - dotCtr;

  float dCtr = distance(dotCtr, worigin);

  // accumulate the swell wave from each localized splash
  float nPts = max(floor(u_points + 0.5), 1.0);
  float splashR = max(u_splash, 0.05) * max(res.x, res.y);
  float wv = 0.0;
  float coreGlow = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= nPts) break;
    vec2 emit = ctr + (emitOffset(i) + vec2(u_originX, u_originY)) * (res * 0.5);
    float phase = float(i) * 1.7;
    float dd = distance(dotCtr, emit);
    float ring = max(0.0, sin((dd / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed + phase));
    float fdot = smoothstep(splashR, 0.0, dd);
    wv = max(wv, ring * fdot);
    float dp = distance(pf, emit);
    coreGlow = max(coreGlow, smoothstep(splashR * 0.10, 0.0, dp));
  }
  float m = clamp(wv, 0.0, 1.0);

  // pure dot: radius swells on the wavefront, never morphs to a cross
  float ss   = pr * refScale;
  float minPx = 0.7 * pr;
  float baseR = 2.2 * u_dotSize;
  float dotR  = max((baseR * (1.0 + u_swell * m)) * ss, minPx);
  float dDot  = length(local) - dotR;
  float aa    = mix(1.4, 0.3, clamp(u_crisp, 0.0, 1.0)) * pr;
  float mask  = 1.0 - smoothstep(-aa, aa, dDot);

  // per-mark hue by angle from the origin (marks are discrete, so cell hue is fine)
  vec2  d       = dotCtr - worigin;
  float hue     = fract((atan(d.y, d.x) + 3.14159265) / 6.2831853 + t * 0.015);
  vec3  rainbow = 0.55 + 0.45 * cos(6.2831853 * hue + vec3(0.0, 2.094, 4.188));
  vec3  dotCol  = mix(rainbow, paletteRamp(hue), 0.45);
  float radial  = 0.60 - (dCtr / length(ctr)) * 0.08;
  float opacity = clamp(radial + m * 0.45, 0.0, 1.0);

  col += dotCol * mask * opacity * (1.0 + 0.8 * m) * u_glow;

  // a faint bloom at each splash source so the ripple centre reads
  col += paletteRamp(fract(t * 0.05)) * coreGlow * 0.16 * u_glow;

  // pre-quantisation dither (the 8-bit FBO bands smooth blends; break it here)
  float ign = fract(52.9829189 * fract(dot(fc + t * 1.7, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
