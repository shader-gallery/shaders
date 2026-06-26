// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// eyelet (Loom) — a field of hollow ring marks, like the punched eyelet holes of
// broderie-anglaise lace. Each cell holds an open circle (a stroke, not a filled
// dot and not a closed cell), and a radial wave pumps the ring radius so the
// eyelets breathe open and closed as the wavefront passes. The rings/o register.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_spacing;     // px between eyelets
uniform float u_ringSize;    // resting ring radius
uniform float u_ringThick;   // ring stroke thickness
uniform float u_breathe;     // wavefront radius pump
uniform float u_wavelength;  // radial wavelength
uniform float u_waveSpeed;   // wave travel speed
uniform float u_ripples;     // ripple count
uniform float u_glow;        // ring brightness
uniform float u_backlight;   // soft drifting backlight
uniform float u_crisp;       // edge sharpness
uniform float u_points;      // number of ripple emitters (1..4)
uniform float u_splash;      // reach of each splash
uniform float u_originX;     // wave origin offset x
uniform float u_originY;     // wave origin offset y

const float BG = 0.039;

vec2 emitOffset(int i) {
  if (i == 0) return vec2(0.0, 0.0);
  if (i == 1) return vec2(-0.5, 0.48);
  if (i == 2) return vec2(0.56, -0.44);
  return vec2(-0.46, -0.5);
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

  vec2 b0 = vec2(res.x * (0.34 + 0.18 * sin(t * 0.6)), res.y * (0.42 + 0.14 * cos(t * 0.5)));
  vec2 b1 = vec2(res.x * (0.68 + 0.14 * cos(t * 0.7)), res.y * (0.58 + 0.14 * sin(t * 0.8)));
  float R = max(res.x, res.y);
  col += u_palette[0] * (0.18 * u_backlight) * smoothstep(R * 0.55, 0.0, distance(fc, b0));
  col += u_palette[1] * (0.15 * u_backlight) * smoothstep(R * 0.45, 0.0, distance(fc, b1));

  vec2 pf = fc;
  vec2 worigin = ctr + vec2(u_originX, u_originY) * (res * 0.5);

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  vec2  cellId  = floor(pf / spacing);
  vec2  ringC   = (cellId + 0.5) * spacing;
  vec2  local   = pf - ringC;

  float dCtr = distance(ringC, worigin);

  // accumulate the breathing wave from each localized splash
  float nPts = max(floor(u_points + 0.5), 1.0);
  float splashR = max(u_splash, 0.05) * max(res.x, res.y);
  float wv = 0.0;
  float coreGlow = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= nPts) break;
    vec2 emit = ctr + (emitOffset(i) + vec2(u_originX, u_originY)) * (res * 0.5);
    float phase = float(i) * 1.7;
    float dd = distance(ringC, emit);
    float ring = sin((dd / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed + phase);
    float fdot = smoothstep(splashR, 0.0, dd);
    wv = max(wv, max(0.0, ring) * fdot);
    coreGlow = max(coreGlow, smoothstep(splashR * 0.10, 0.0, distance(pf, emit)));
  }
  float m = clamp(wv, 0.0, 1.0);

  // hollow ring: annulus SDF, radius pumped by the wave, stroke stays a stroke
  float ss    = pr * refScale;
  float minPx = 0.7 * pr;
  float ringR = max((3.0 * u_ringSize) * (0.55 + u_breathe * m) * ss, minPx);
  float thick = max((0.9 * u_ringThick) * ss, minPx);
  float dRing = abs(length(local) - ringR) - thick;
  float aa    = mix(1.4, 0.3, clamp(u_crisp, 0.0, 1.0)) * pr;
  float mask  = 1.0 - smoothstep(-aa, aa, dRing);

  vec2  d       = ringC - worigin;
  float hue     = fract((atan(d.y, d.x) + 3.14159265) / 6.2831853 + t * 0.013);
  vec3  rainbow = 0.55 + 0.45 * cos(6.2831853 * hue + vec3(0.0, 2.094, 4.188));
  vec3  ringCol = mix(rainbow, paletteRamp(hue), 0.48);
  float radial  = 0.58 - (dCtr / length(ctr)) * 0.08;
  float opacity = clamp(radial + m * 0.45, 0.0, 1.0);

  col += ringCol * mask * opacity * (1.0 + 0.7 * m) * u_glow;
  col += paletteRamp(fract(t * 0.05)) * coreGlow * 0.16 * u_glow;

  float ign = fract(52.9829189 * fract(dot(fc + t * 1.7, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
