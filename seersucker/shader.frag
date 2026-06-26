// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// seersucker (Loom) — the ripples register, where interference is the hero. Several
// travelling wave sources radiate at once and their phases SUM (not max), so the
// field puckers into shifting standing-wave bands like crinkled seersucker cloth.
// A fine dot grid samples that interference: dots brighten and swell on the crests
// and sink to near-nothing in the troughs, so the woven pucker reads across the frame.
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
uniform float u_dotSize;     // resting dot radius
uniform float u_swell;       // crest swell of the dots
uniform float u_wavelength;  // wave wavelength
uniform float u_waveSpeed;   // wave travel speed
uniform float u_sources;     // number of interfering sources (2..5)
uniform float u_spread;      // how far the sources sit from centre
uniform float u_fieldGlow;   // continuous interference backlight
uniform float u_glow;        // dot brightness
uniform float u_crisp;       // edge sharpness
uniform float u_contrast;    // interference contrast (crest vs trough)
uniform float u_rotate;      // grid rotation (degrees)

const float BG = 0.039;

vec3 paletteRamp(float h) {
  vec3 c = mix(u_palette[0], u_palette[1], smoothstep(0.00, 0.34, h));
  c = mix(c, u_palette[2], smoothstep(0.33, 0.67, h));
  c = mix(c, u_palette[3], smoothstep(0.66, 1.00, h));
  return c;
}

// evenly-spaced source positions on a ring around centre, drifting slowly
vec2 srcPos(int i, float n, vec2 ctr, float radius, float t) {
  float a = (float(i) / n) * 6.2831853 + t * 0.08 + float(i) * 0.6;
  return ctr + vec2(cos(a), sin(a)) * radius;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = vec3(BG, BG, 0.047);

  vec2 q = fc - ctr;
  float ca = cos(radians(u_rotate)), sa = sin(radians(u_rotate));
  q = mat2(ca, -sa, sa, ca) * q;
  vec2 pf = q + ctr;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  vec2  cellId  = floor(pf / spacing);
  vec2  dotCtr  = (cellId + 0.5) * spacing;
  vec2  local   = pf - dotCtr;

  float nSrc   = max(floor(u_sources + 0.5), 2.0);
  float radius = u_spread * max(res.x, res.y);
  float wl     = max(u_wavelength, 20.0) * pr;

  // sum the travelling waves at the cell centre (drives the dot) and per-fragment
  // (drives a soft continuous interference backlight)
  float sumCell = 0.0;
  float sumPix  = 0.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= nSrc) break;
    vec2 s = srcPos(i, nSrc, ctr, radius, t);
    sumCell += sin((distance(dotCtr, s) / wl) * 6.2831853 - t * u_waveSpeed);
    sumPix  += sin((distance(pf, s)     / wl) * 6.2831853 - t * u_waveSpeed);
  }
  // normalise to 0..1 and push contrast so crests pucker proud of the troughs
  float mCell = clamp(0.5 + 0.5 * (sumCell / nSrc) * u_contrast, 0.0, 1.0);
  float mPix  = clamp(0.5 + 0.5 * (sumPix  / nSrc) * u_contrast, 0.0, 1.0);

  // soft continuous interference backlight (per-pixel hue, never per-cell)
  float huePix = fract((atan(pf.y - ctr.y, pf.x - ctr.x) + 3.14159265) / 6.2831853 + t * 0.012);
  col += paletteRamp(huePix) * mPix * mPix * (0.22 * u_fieldGlow);

  // dot grid: radius and brightness ride the interference crest
  float ss    = pr * refScale;
  float minPx = 0.7 * pr;
  float dotR  = max((2.0 * u_dotSize) * (0.4 + u_swell * mCell) * ss, minPx);
  float dDot  = length(local) - dotR;
  float aa    = mix(1.4, 0.3, clamp(u_crisp, 0.0, 1.0)) * pr;
  float mask  = 1.0 - smoothstep(-aa, aa, dDot);

  vec2  d      = dotCtr - ctr;
  float hue    = fract((atan(d.y, d.x) + 3.14159265) / 6.2831853 + t * 0.012);
  vec3 rainbow = 0.55 + 0.45 * cos(6.2831853 * hue + vec3(0.0, 2.094, 4.188));
  vec3 dotCol  = mix(rainbow, paletteRamp(hue), 0.5);

  col += dotCol * mask * (0.35 + 1.0 * mCell) * u_glow;

  float ign = fract(52.9829189 * fract(dot(fc + t * 1.7, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
