// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// ringed (Rosette) — a banded iris filling the frame: the radial fibers of the
// base iris are crossed by a set of glowing concentric annular rings, the way a
// real iris is scored by furrows and a collarette. The fibers give the fine
// radial grain; the rings are bright travelling bands that ripple slowly
// outward from the dark pupil, so the field reads as a woven radial-and-annular
// lattice rather than plain spokes. Colour blends cyclically through the palette
// by angle; the rings catch a brighter tint where they cross a fiber. The pupil
// stays a dark protagonist with a luminous rim; the lattice fills past the
// corners with a soft far-field fade.
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
uniform float u_fibers;   // number of radial fibers around the circle   (default 150)
uniform float u_rings;    // number of concentric rings across the field (default 9)
uniform float u_ripple;   // outward travel speed of the rings           (default 0.4)
uniform float u_pupil;    // pupil radius, css px (×pixelRatio)           (default 110)

const vec3  BG   = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU  = 6.28318530718;

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params against the unfed-uniform = 0.0 case so extremes/headless stay sane
  float fiberCount = max(u_fibers, 16.0);
  float ringCount  = max(u_rings, 2.0);
  float ripple     = u_ripple;
  float pupilR     = max(u_pupil, 20.0) * pr;

  // --- polar coordinates centred on the pupil ---
  vec2  d    = fc - ctr;
  float ang  = atan(d.y, d.x);          // -PI..PI
  float rad  = length(d);
  float maxR = length(res) * 0.5;       // half-diagonal: outward==1 at the corner

  // radial coordinate from the pupil edge outward, 0..1 across the half-diagonal
  float rFromPupil = rad - pupilR;
  float outward    = clamp(rFromPupil / max(maxR - pupilR, 1.0), 0.0, 1.0);

  float spin = t * 0.012;

  // ====================================================================
  // FIBER FIELD (fine radial grain — two nearest strands kept crisp)
  // ====================================================================
  float fa  = (ang / TAU + 0.5 + spin) * fiberCount;
  float fi0 = floor(fa);
  float fi1 = fi0 + 1.0;

  float fiberLum  = 0.0;
  float colAngle  = ang;
  for (int k = 0; k < 2; k++) {
    float fi  = (k == 0) ? fi0 : fi1;
    float fiw = mod(fi, fiberCount);
    float h   = hash11(fiw + 1.0);
    float wig = 0.12 * sin(rFromPupil / (pupilR * 0.9) * 2.0 + h * TAU + t * 0.18);
    float fd  = fa - (fi + 0.5 + wig);
    float strand = 1.0 - smoothstep(0.0, 0.5, abs(fd));
    float fb  = 0.5 + 0.5 * hash11(fiw + 7.0);
    float lum = strand * fb;
    if (lum > fiberLum) {
      fiberLum = lum;
      colAngle = (fiw / fiberCount - 0.5) * TAU;
    }
  }

  // ====================================================================
  // CONCENTRIC RINGS
  // Bright annular bands spaced across the field, rippling slowly outward.
  // A continuous ring phase keeps the bands crisp without a hard reset; the
  // band profile is a periodic gaussian so each ring is a thin glow.
  // ====================================================================
  float ringPhase = outward * ringCount - t * ripple; // travels outward over time
  float ringFrac  = fract(ringPhase);
  float ringD     = min(ringFrac, 1.0 - ringFrac);    // distance to nearest ring centre
  float ring      = exp(-pow(ringD / 0.085, 2.0));    // thin bright annulus
  // fade rings out toward the very far field so corners settle
  ring *= 1.0 - smoothstep(0.78, 1.0, outward);

  // ====================================================================
  // PALETTE: colour by fiber angle, blending the four hues cyclically
  // ====================================================================
  float hue = (colAngle / TAU + 0.5) + 0.12 * outward + t * 0.01;
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 irisCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // RADIAL SHADING & COMPOSE
  // ====================================================================
  float pupilMask  = smoothstep(pupilR - 2.0 * pr, pupilR + 6.0 * pr, rad);
  float farFade    = 1.0 - smoothstep(0.8, 1.0, outward);
  float radialFall = mix(1.15, 0.4, smoothstep(0.0, 0.7, outward));

  fiberLum *= pupilMask * farFade;

  vec3 col = BG;
  // fibers: the fine radial grain
  col += irisCol * fiberLum * radialFall * 0.7;
  // rings: bright annular bands, brighter where a lit fiber crosses them
  float cross = ring * pupilMask * (0.5 + 0.9 * fiberLum);
  col += irisCol * cross * radialFall * 1.0;
  // a faint diffuse wash so the lattice never reads as black gaps
  col += irisCol * pupilMask * farFade * 0.04 * (0.6 + 0.4 * radialFall);

  // ====================================================================
  // PUPIL: dark negative space with a luminous rim (the protagonist)
  // ====================================================================
  float pupilInner = 1.0 - smoothstep(pupilR - 10.0 * pr, pupilR, rad);
  col *= mix(1.0, 0.05, pupilInner);
  float rim = exp(-pow((rad - pupilR) / (6.0 * pr), 2.0));
  col += irisCol * rim * 0.5;

  // settle the very corners so framing stays composed
  float vign = 1.0 - 0.45 * smoothstep(0.55, 1.15, rad / maxR);
  col *= vign;

  // gentle tone shaping
  col = col / (1.0 + col * 0.34);

  gl_FragColor = vec4(col, 1.0);
}
