// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// sampler (Loom) — a cross-stitch sampler: a lattice of little X marks (saltires),
// not the upright plus of lacework. A slow weave distortion bows the rows like
// hand-stitched cloth, and radial waves lengthen and brighten the stitches along
// each wavefront. The marks never collapse to dots — this is the crosshairs
// register, an all-over stitched X lattice.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_spacing;     // px between stitches
uniform float u_armLen;      // stitch arm length
uniform float u_armThick;    // stitch arm thickness
uniform float u_stretch;     // how much a wavefront stretches the stitch arms
uniform float u_wavelength;  // radial wavelength
uniform float u_waveSpeed;   // wave travel speed
uniform float u_ripples;     // ripple count
uniform float u_glow;        // stitch brightness
uniform float u_backlight;   // soft drifting backlight
uniform float u_crisp;       // edge sharpness
uniform float u_weave;       // sine-warp weave distortion
uniform float u_originX;     // wave origin offset x
uniform float u_originY;     // wave origin offset y
uniform float u_rotate;      // lattice rotation (degrees)

const float BG = 0.039;

vec3 paletteRamp(float h) {
  vec3 c = mix(u_palette[0], u_palette[1], smoothstep(0.00, 0.34, h));
  c = mix(c, u_palette[2], smoothstep(0.33, 0.67, h));
  c = mix(c, u_palette[3], smoothstep(0.66, 1.00, h));
  return c;
}

// X-shaped saltire: a plus SDF evaluated in a 45-degree-rotated frame
float sdSaltire(vec2 p, float arm, float th) {
  float r = 0.70710678;
  p = abs(mat2(r, -r, r, r) * p);
  float a = max(p.x - arm, p.y - th);
  float b = max(p.y - arm, p.x - th);
  return min(a, b);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = vec3(BG, BG, 0.047);

  vec2 b0 = vec2(res.x * (0.30 + 0.18 * sin(t * 0.55)), res.y * (0.40 + 0.14 * cos(t * 0.6)));
  vec2 b1 = vec2(res.x * (0.72 + 0.14 * cos(t * 0.7)), res.y * (0.58 + 0.14 * sin(t * 0.5)));
  float R = max(res.x, res.y);
  col += u_palette[0] * (0.18 * u_backlight) * smoothstep(R * 0.55, 0.0, distance(fc, b0));
  col += u_palette[2] * (0.15 * u_backlight) * smoothstep(R * 0.45, 0.0, distance(fc, b1));

  // grid transform: rotation + a gentle woven sine warp
  vec2 q = fc - ctr;
  float ca = cos(radians(u_rotate)), sa = sin(radians(u_rotate));
  q = mat2(ca, -sa, sa, ca) * q;
  q += vec2(sin(q.y * 0.012 + t * 0.3), sin(q.x * 0.012 - t * 0.25)) * (u_weave * 30.0 * pr);
  vec2 pf = q + ctr;

  vec2 worigin = ctr + vec2(u_originX, u_originY) * (res * 0.5);

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  vec2  cellId  = floor(pf / spacing);
  vec2  stitchC = (cellId + 0.5) * spacing;
  vec2  local   = pf - stitchC;

  float dCtr = distance(stitchC, worigin);
  float ph   = (dCtr / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed;
  float m    = max(0.0, sin(ph));

  // stitch: an X whose arms lengthen on a wavefront, never collapsing to a dot
  float ss    = pr * refScale;
  float minPx = 0.7 * pr;
  float arm   = max((4.6 * u_armLen) * (1.0 + u_stretch * m) * ss, minPx);
  float thick = max((1.5 * u_armThick) * ss, minPx);
  float dX    = sdSaltire(local, arm, thick);
  float aa    = mix(1.4, 0.3, clamp(u_crisp, 0.0, 1.0)) * pr;
  float mask  = 1.0 - smoothstep(-aa, aa, dX);

  vec2  d       = stitchC - worigin;
  float hue     = fract((atan(d.y, d.x) + 3.14159265) / 6.2831853 + t * 0.012);
  vec3  rainbow = 0.55 + 0.45 * cos(6.2831853 * hue + vec3(0.0, 2.094, 4.188));
  vec3  stCol   = mix(rainbow, paletteRamp(hue), 0.5);
  float radial  = 0.58 - (dCtr / length(ctr)) * 0.08;
  float opacity = clamp(radial + m * 0.45, 0.0, 1.0);

  col += stCol * mask * opacity * (1.0 + 0.7 * m) * u_glow;

  float ign = fract(52.9829189 * fract(dot(fc + t * 1.7, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
