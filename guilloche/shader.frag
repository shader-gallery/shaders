// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// guilloche (Burnish) — engine-turning in its linear mode: a banknote border
// band fills edge-to-edge with fine taut strands, each a sine of slightly
// different harmonic and phase about a shared horizontal band axis, interleaved
// over-under so the lines cross and recross in a continuous machined braid of
// lozenges. Strand tint steps through the four palette colours by index, and a
// small specular spark marks the over-stroke at every crossing — jeweled
// lozenges engraved on near-black steel. No rosette, no centre, no lamp.
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
uniform float u_waveSpeed;   // longitudinal phase-travel rate of the strands  (default 0.35)
uniform float u_stroke;      // strand stroke width in CSS px                  (default 1.2)
uniform float u_braidDepth;  // sine amplitude about each band axis            (default 0.55)
uniform float u_glint;       // brightness of specular sparks at crossings     (default 1)
uniform float u_random;      // scatter each strand start phase                (default 0)
uniform float u_tube;        // round strands into rotating tubes              (default 0)
uniform float u_rotate;      // rotate the whole braid in degrees              (default 0)
uniform float u_blend;       // blur overlapping strand colours together       (default 0)
uniform float u_angle;       // shear the colour seams off vertical            (default 0)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black steel base ~#09090B
const float BANDS    = 9.0;    // number of horizontal band axes (rows of strands)
const float STRANDS  = 4.0;    // strands per band (one per palette colour)
const float WAVES_CSS = 165.0; // longitudinal wavelength of each strand in CSS px

float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

vec3 paletteAt(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // rotate the whole braid about the centre; the band math below runs in this
  // pattern coordinate while the vignette stays in true screen space.
  float pa = radians(u_rotate);
  vec2  pc = mat2(cos(pa), -sin(pa), sin(pa), cos(pa)) * (fc - ctr) + ctr;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // band geometry: split the frame into BANDS horizontal rows, each row a shared
  // axis about which STRANDS strands weave. Work in CSS px so it's DPR-stable.
  // refScale holds the whole composition constant from thumbnail to fullscreen:
  // the band height already scales with res.y, so the stroke width and the
  // wavelength must scale the same way or the strands read fat in the small
  // poster and thin at fullsize. (~1.0 at the 1280x800 poster.)
  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float bandH   = res.y / BANDS;           // device px per band row
  float amp     = bandH * 0.5 * clamp(u_braidDepth, 0.0, 1.0); // sine amplitude
  float stroke  = max(u_stroke, 0.05) * refScale * pr;
  float kx      = 6.2831853 / (WAVES_CSS * refScale * pr);  // longitudinal angular freq

  // which band row are we in, and the y of its axis
  float bandId  = floor(pc.y / bandH);
  float axisY   = (bandId + 0.5) * bandH;

  // accumulate the strands of THIS band (the only ones that can reach this pixel,
  // given amp <= bandH*0.5 keeps each strand inside its own row). We resolve, per
  // pixel, the over-stroke (greatest depth) plus a proximity sum used to find the
  // crossings where two strands' centrelines pass near each other.
  float litLine   = 0.0;    // antialiased coverage of the winning (over) strand
  vec3  litCol    = vec3(0.0);
  float bestDepth = -1e9;   // larger depth = drawn on top (over-stroke)
  float prox      = 0.0;    // sum of soft proximities to every strand centreline
  float second    = 0.0;    // coverage of the 2nd-nearest strand (under-stroke)
  float litNrm    = 0.0;    // signed cross-tube coord of the over-strand (-1..1)
  vec3  colSum    = vec3(0.0); // depth-weighted colour sum (for the colour blur)
  float wSum      = 0.0;

  // colour blur: a sharp depth weighting picks a single winner (hard seams),
  // a soft one averages the overlapping strands so their colours bleed together.
  float sharp = mix(22.0, 1.6, clamp(u_blend, 0.0, 1.0));

  // a longitudinal coordinate phase so the whole braid is seamless
  for (int si = 0; si < 4; si++) {
    float fsi = float(si);
    // harmonic: each strand has a slightly different wavenumber + base phase so
    // the family is incommensurate and perpetually re-weaves
    float harm  = 1.0 + fsi * 0.12;                 // wavenumber multiplier
    // base quarter-turn offsets, plus an optional per-strand/per-band random
    // scatter so the waves no longer all start at the same point along the band.
    float rphase = hash21(vec2(fsi + 1.7, bandId + 0.3)) * 6.2831853;
    float phase = fsi * 1.5708 + bandId * 0.6 + u_random * rphase;
    // longitudinal travel: each strand drifts at its own incommensurate rate
    float travel = t * u_waveSpeed * (0.55 + fsi * 0.17);
    float ang   = pc.x * kx * harm + phase + travel;
    float sy    = axisY + amp * sin(ang);
    float dsign = pc.y - sy;
    float d     = abs(dsign);

    // over/under depth: cosine staggered per strand gives a smoothly migrating
    // over-under braid (the larger value is the strand drawn on top). u_angle adds
    // a y-dependent shear so the colour seams tilt off vertical onto a diagonal.
    float depth = cos(ang * 0.5 + fsi * 0.9 + travel * 0.5 + (pc.y / bandH) * u_angle * 3.0);

    // antialiased stroke coverage of the engraved line
    float cov = 1.0 - smoothstep(stroke, stroke + 1.3 * pr, d);

    // strand colour steps through the palette by global strand index
    vec3 sc = paletteAt(mod(fsi + bandId, 4.0), c0, c1, c2, c3);

    if (cov > 0.001) {
      if (depth > bestDepth) {
        // demote the previous winner to the under-stroke proximity
        second  = max(second, litLine);
        bestDepth = depth;
        litLine   = cov;
        litCol    = sc;
        litNrm    = dsign / max(stroke, 0.5);   // for the rotating-tube shading
      } else {
        second = max(second, cov);
      }
      // depth-weighted colour accumulation: sharp -> winner only (crisp seams),
      // soft -> the overlapping strand colours average into a smooth blur.
      float cw = cov * exp(depth * sharp);
      colSum += sc * cw;
      wSum   += cw;
    }
    // narrow proximity to this strand's centreline. Where two of these bumps
    // overlap, two strand centres are crossing → a jewel sits there. The width
    // tracks the stroke but SATURATES, so very thick strands keep tight point
    // sparks instead of flooding the gaps with false jewels.
    float sw = min(stroke, 2.5 * pr);
    float pw = sw * sw * 5.0;
    prox += exp(-d * d / pw);
  }

  // ROTATING TUBE: shade the over-strand as a rounded cylinder (dark at the rim,
  // bright along the crown) and run a helical highlight that travels around the
  // circumference over time, so the flat strand reads as a spinning tube. The
  // whole effect fades to the flat engraved line at u_tube = 0.
  float theta  = asin(clamp(litNrm, -1.0, 1.0));    // angle across the tube
  float roundv = cos(theta);                        // 1 at crown, 0 at the rim
  float bar    = 0.5 + 0.5 * sin(theta * 3.0 + pc.x * kx * 2.0 - t * (0.8 + u_waveSpeed * 1.5));
  float roll   = pow(bar, 3.0) * roundv;            // helical specular band

  // base over-strand colour, blurred toward the overlapping strands by u_blend so
  // the hard colour seams melt into smooth gradients (at 0 it is the crisp winner).
  vec3 baseCol = mix(litCol, colSum / max(wSum, 0.001), u_blend);
  vec3 overCol = mix(baseCol, baseCol * mix(0.45, 1.2, roundv), u_tube);

  // ENGRAVED STRANDS: dim, colour-tinted cuts in dark steel — light is structural,
  // so the bare strands stay restrained and the crossings carry the brightness.
  col += overCol * litLine * 0.58;
  col += baseCol * second  * 0.30;   // the under-stroke, dimmer, reads the braid
  col += mix(baseCol, vec3(1.0), 0.6) * roll * litLine * u_tube * 0.7;  // rolling highlight

  // CROSSINGS: prox exceeds ~1 only where two centrelines coincide. That excess
  // is the lozenge corner where one strand crosses over another — set a jewel.
  float crossing = smoothstep(1.4, 1.95, prox);
  // a tight specular spark, white-hot core tinted by the over-strand colour
  vec3  jewel = mix(litCol, vec3(1.0), 0.65);
  col += jewel * crossing * (0.4 + 0.6 * litLine) * u_glint * 1.5;
  // a soft halo around each spark so the jewels read as catching lamplight
  col += jewel * crossing * crossing * 0.45 * u_glint;

  // a whisper of bloom along the over-strand so the engraving glints faintly
  col += litCol * litLine * 0.10;

  // gentle vignette to frame the band and keep the rim dark
  float vign = 1.0 - smoothstep(0.6, 1.28, length((fc - ctr) / res));
  col *= mix(0.84, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
