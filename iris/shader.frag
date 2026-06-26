// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// iris (Rosette) — a giant eye iris filling the frame: hundreds of fine radial
// fibers run from a dark central pupil out past the corners, each wiggling
// slightly off a true radius via a per-fiber hash phase. Fiber colour blends
// through the 4-colour palette by angle, with a brighter collarette ring partway
// out and a soft limbal darkening toward the far field, so the frame is iris
// everywhere — no dead sclera. The pupil dilates and contracts on a long
// sinusoidal breath; fibers stretch radially to follow the moving pupil edge.
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
uniform float u_fibers;      // number of radial fibers around the circle (default 180)
uniform float u_breathSpeed; // pupil dilation cycle rate                 (default 0.07)
uniform float u_wiggle;      // per-fiber sideways waviness amplitude      (default 0.35)
uniform float u_pupil;       // mean pupil radius, css px (×pixelRatio)    (default 120)

const vec3  BG    = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU   = 6.28318530718;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// cheap per-fiber hash → 0..1 (stable per integer fiber index)
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
  float fiberCount = max(u_fibers, 8.0);
  float wiggle     = clamp(u_wiggle, 0.0, 1.0);
  float pupilMean  = max(u_pupil, 10.0) * pr;
  float breathRate = max(u_breathSpeed, 0.0);

  // --- polar coordinates centred on the eye ---
  vec2  d   = fc - ctr;
  float ang = atan(d.y, d.x);          // -PI..PI
  float rad = length(d);
  // normalise radius against the half-diagonal so framing is resolution-stable
  float maxR = length(res) * 0.5;

  // --- the breathing pupil: long sinusoidal dilation, phase-continuous ---
  // amplitude is a fraction of the mean so the aperture never collapses or floods
  float breath  = sin(t * breathRate * TAU);
  float pupilR  = pupilMean * (1.0 + 0.42 * breath);

  vec3 col = BG;

  // ====================================================================
  // FIBER FIELD
  // The fiber index is a continuous function of angle: f = (ang/TAU)*N.
  // Each fiber has a hashed phase; the fiber's *angular centre* wiggles
  // sideways off its true radius, growing with radius (silky strands).
  // We evaluate the two nearest integer fibers and take the stronger so
  // strands stay crisp and anti-aliased without dynamic array indexing.
  // ====================================================================
  float fa     = (ang / TAU + 0.5) * fiberCount; // 0..N continuous fiber coordinate
  float fi0    = floor(fa);
  float fi1    = fi0 + 1.0;

  // radial coordinate measured from the pupil edge outward, 0 at the rim
  float rFromPupil = rad - pupilR;
  // a 0..1 outward progress used for wiggle growth, colour and limbus
  float outward = clamp(rFromPupil / max(maxR - pupilR, 1.0), 0.0, 1.0);

  // slow creeping phase shared by all fibers (unbounded → no reset)
  float creep = t * 0.18;

  float fiberLum = 0.0;
  float colAngle = 0.0; // angle used to pick palette colour (wiggled)

  // evaluate the two neighbouring fibers
  for (int k = 0; k < 2; k++) {
    float fi   = (k == 0) ? fi0 : fi1;
    // wrap fiber index into 0..N so hashes match across the -PI/PI seam
    float fiw  = mod(fi, fiberCount);
    float h    = hash11(fiw + 1.0);

    // this fiber's true angular centre (in fiber units)
    // sideways wiggle: a per-fiber sinusoid in radius, growing outward,
    // creeping in phase over time → fibers look like loose silk strands
    float wphase = h * TAU + creep + h * 3.0;
    float wig    = wiggle * (0.35 + 0.65 * outward)
                 * sin(rFromPupil / (pupilMean * 0.9) * 2.4 + wphase);
    // wiggle expressed in fiber-coordinate units (fraction of one fiber spacing)
    float fcenter = fi + 0.5 + wig * 0.85;

    // distance from this pixel's fiber-coordinate to the wiggled fiber centre
    float fd = fa - fcenter;

    // crisp strand profile across the fiber, anti-aliased
    float halfw = 0.5; // half a fiber spacing
    float strand = 1.0 - smoothstep(0.0, halfw, abs(fd));
    // a hashed brightness so fibers vary in intensity (silken grain)
    float fb = 0.55 + 0.45 * hash11(fiw + 7.0);

    float lum = strand * fb;
    if (lum > fiberLum) {
      fiberLum = lum;
      // colour follows the wiggled fiber centre angle for a coherent wash
      colAngle = (fcenter / fiberCount - 0.5) * TAU;
    }
  }

  // fibers only exist outside the pupil; fade in sharply at the rim
  float pupilMask = smoothstep(pupilR - 2.0 * pr, pupilR + 6.0 * pr, rad);
  // fade fibers out at the very far field so corners darken into limbus
  float farFade = 1.0 - smoothstep(0.82, 1.0, outward);
  fiberLum *= pupilMask * farFade;

  // ====================================================================
  // PALETTE: colour the iris by angle, blending the four hues cyclically.
  // A slow angular drift keeps it loosely rotating (felt, not seen).
  // ====================================================================
  float hue = (colAngle / TAU + 0.5) + t * 0.01; // 0..1 around the ring + slow roll
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 fiberCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // RADIAL SHADING of the fiber field
  // - brighter near the pupil rim (inner iris catches light)
  // - a collarette ring partway out: a soft brighter band
  // - limbal darkening toward the far field
  // ====================================================================
  // base radial falloff: bright at the rim, easing outward
  float radialFall = mix(1.15, 0.45, smoothstep(0.0, 0.7, outward));

  // collarette: a brighter ring ~32% of the way out, tracking the breathing rim
  float collPos = 0.30 + 0.04 * breath;
  float coll    = exp(-pow((outward - collPos) / 0.085, 2.0));
  // limbal darkening: dim the outermost band
  float limbus  = 1.0 - 0.55 * smoothstep(0.6, 1.0, outward);

  float shade = radialFall * limbus + coll * 0.55;

  // ====================================================================
  // COMPOSE
  // ====================================================================
  // main fiber contribution
  col += fiberCol * fiberLum * shade * 1.05;

  // a soft diffuse iris wash between fibers so there are no black gaps
  // (very low level, keeps the field reading as continuous iris tissue)
  float wash = pupilMask * farFade * (0.06 + 0.10 * coll) * (0.6 + 0.4 * radialFall);
  col += fiberCol * wash;

  // collarette glow ring, themed, independent of individual fibers
  col += fiberCol * coll * pupilMask * 0.18;

  // ====================================================================
  // PUPIL: dark negative space at the centre, with a faint luminous rim
  // ====================================================================
  // soft inner shadow inside the pupil keeps it a true dark protagonist
  float pupilInner = 1.0 - smoothstep(pupilR - 10.0 * pr, pupilR, rad);
  col *= mix(1.0, 0.04, pupilInner); // crush iris content inside the pupil

  // luminous pupil rim catches the breath — brightest hue at the aperture edge
  float rim = exp(-pow((rad - pupilR) / (6.0 * pr), 2.0));
  col += fiberCol * rim * 0.55 * (0.7 + 0.3 * (0.5 + 0.5 * breath));

  // ====================================================================
  // VIGNETTE: settle the very corners so framing stays composed
  // ====================================================================
  float vign = 1.0 - 0.5 * smoothstep(0.55, 1.15, length(d) / maxR);
  col *= vign;

  // gentle tone shaping to avoid blow-out while keeping luminous accents
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
