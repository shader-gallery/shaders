// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// opart (Manifold) - an op-art band illusion in the Bridget Riley and Vasarely
// register. A field of hard black bands on near-white paper is pushed through
// a set of invisible lenses: six domes and dents of different sizes, one huge
// and mostly off the frame. Each lens magnifies the bands at its centre and
// crushes them at its rim, and because the band phase depends on the lensed x
// alone, a straight band bows outward around a dome and pinches into a dent,
// which the eye reads as a solid form pressing through the print. The lenses
// are applied one after another as radial maps, so the sheet never folds
// back on itself where two lenses meet. The bands also carry a shading trick
// borrowed from engraving: their black weight thickens on the side of each
// dome that faces away from an implied upper-left lamp and thins on the lit
// side, so the false relief gets a false light as well. Where a rim crushes
// the bands finer than a pixel they resolve to flat grey, the way the eye
// loses a Riley print at its tightest folds. The domes breathe and drift
// slowly and a long slow wave travels through the field, so the print never
// sits still but never jumps. Palette is a tint only: a whisper of the pale
// pole in the paper and the dark pole in the ink.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_density;  // band pairs across the frame width     (default 44)
uniform float u_bulge;    // lens strength, the depth of the relief (default 1.0)
uniform float u_breath;   // breathing and drift speed              (default 0.3)
uniform float u_tilt;     // band tilt in degrees                   (default 8)
uniform float u_tint;     // palette tint on paper and ink          (default 0.35)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const int NLENS = 6;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// lens i: centre (frame units, x already scaled by aspect), radius, strength.
// Strength breathes on its own harmonic of the base clock so the whole set
// loops together; positive is a dome, negative a dent.
void lens(int i, float a, float t, out vec2 c, out float R, out float m) {
  c = vec2(0.0); R = 1.0; m = 0.0;
  if (i == 0) { c = vec2(-0.32 * a,  0.08); R = 0.74; m =  0.95 * (0.85 + 0.15 * sin(t)); }
  if (i == 1) { c = vec2( 0.50 * a, -0.38); R = 0.46; m = -0.60 * (0.85 + 0.15 * sin(t * 0.5 + 2.1)); }
  if (i == 2) { c = vec2( 0.56 * a,  0.60); R = 0.28; m =  0.90 * (0.85 + 0.15 * sin(t * 2.0 + 1.0)); }
  if (i == 3) { c = vec2(-0.74 * a, -0.68); R = 0.30; m =  0.85 * (0.85 + 0.15 * sin(t * 1.5 + 4.2)); }
  if (i == 4) { c = vec2( 0.02 * a, -1.02); R = 0.52; m = -0.55 * (0.85 + 0.15 * sin(t * 1.0 + 3.3)); }
  if (i == 5) { c = vec2( 1.00 * a,  1.20); R = 1.90; m =  0.70 * (0.85 + 0.15 * sin(t * 0.5 + 5.0)); }
  // slow drift of each centre, small so the composition holds
  c += 0.03 * vec2(sin(t * 0.5 + float(i) * 1.7), cos(t * 0.5 + float(i) * 2.3));
}

// dome map: bands laid on a hemisphere and seen from above. Arc length on
// the sphere is asin(r), so equal bands spread widest at the pole and crush
// toward the limb without limit; m blends from flat sheet (0) to full sphere
// (1). Returns the new radius for a point at normalised radius r inside 1.
float domeMap(float r, float m) {
  float s = asin(min(r, 1.0)) * 0.63662;   // 2/pi: continuous with the flat sheet at r = 1
  return mix(r, s, m);
}

// swell map: a broad soft lens with no rim, C1 at the edge, for the huge
// off-frame lens that bends the whole field without cutting a silhouette
float swellMap(float r, float m) {
  float s = max(1.0 - r * r, 0.0);
  return r * (1.0 - m * s * s);
}

// dent map: the sheet sucked toward a point, bands crowd at the centre and
// relax toward the rim. Monotonic for m below about 0.8.
float dentMap(float r, float m) {
  float s = max(1.0 - r * r, 0.0);
  return r * (1.0 + m * s * s);
}

// push frame point p through every lens in turn. Returns the lensed point
// (its x drives the band phase) and the false-light shade in -1..1, built
// from each lens as a sphere normal against the lamp.
vec2 warpField(vec2 p, float a, float t, float strength, out float shade) {
  vec2  L = normalize(vec2(-0.7, 0.6));
  shade = 0.0;
  for (int i = 0; i < NLENS; i++) {
    vec2 c; float R; float m;
    lens(i, a, t, c, R, m);
    vec2  q  = p - c;
    float r  = length(q) / R;
    float mm = min(abs(m) * strength, 0.98);
    float rn = (m > 0.0) ? domeMap(r, mm) : dentMap(r, mm * 0.8);
    if (i == NLENS - 1) rn = swellMap(r, mm * 0.7);
    rn = (r < 1.0) ? rn : r;
    p = c + q * (rn / max(r, 1e-4));
    // sphere shading: the lit flank faces the lamp, dents run the other way
    float cov = (r < 1.0) ? sqrt(max(1.0 - r * r, 0.0)) * 0.35 + 0.65 : 0.0;
    shade += sign(m) * min(mm * 1.4, 1.0) * cov * dot(q / R, L);
  }
  // optional pointer dome, zero at rest
  vec2 mres = u_mouse / u_resolution;
  vec2 mp = vec2((mres.x - 0.5) * a, mres.y - 0.5) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2  mq  = p - mp;
  float mr  = length(mq) / 0.4;
  float mrn = (mr < 1.0) ? domeMap(mr, 0.6 * mAmt) : mr;
  p = mp + mq * (mrn / max(mr, 1e-4));
  shade += mAmt * ((mr < 1.0) ? 0.8 : 0.0) * dot(mq / 0.4, L);
  return p;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  uv     = gl_FragCoord.xy / res;
  float t      = u_time * clamp(u_breath, 0.0, 2.0);
  float dens   = max(u_density, 4.0);
  float str    = clamp(u_bulge, 0.0, 2.0);
  float tint   = clamp(u_tint, 0.0, 1.0);

  // frame coords: y in -1..1, x in -aspect..aspect
  vec2 p0 = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  float px = 2.0 / res.y;                 // one device pixel in frame units

  // lens the sheet at this pixel and one pixel over in x and y (finite
  // differences for the filter footprint, no derivative extension needed)
  float shade, shX, shY;
  vec2 w0 = warpField(p0,                   aspect, t, str, shade);
  vec2 wX = warpField(p0 + vec2(px, 0.0),   aspect, t, str, shX);
  vec2 wY = warpField(p0 + vec2(0.0, px),   aspect, t, str, shY);

  // tilt the band field on the lensed sheet, then let a long slow wave
  // travel through it
  float ang = radians(u_tilt);
  mat2  rotM = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2  p  = rotM * w0;
  vec2  pX = rotM * wX;
  vec2  pY = rotM * wY;
  float xw  = p.x  + 0.03 * sin(p.y  * 1.3 - t * 0.5);
  float xwX = pX.x + 0.03 * sin(pX.y * 1.3 - t * 0.5);
  float xwY = pY.x + 0.03 * sin(pY.y * 1.3 - t * 0.5);

  // band phase in cycles, and how many cycles this pixel spans
  float k    = dens / (2.0 * aspect);
  float phi  = xw * k;
  float fpx  = length(vec2(xwX - xw, xwY - xw)) * k;

  // false light sets the ink weight: the lit flank thins to fine lines, the
  // far flank thickens toward solid black
  shade = clamp(shade, -1.0, 1.0);
  float duty = 0.5 - 0.32 * shade;        // fraction of the cycle that is ink

  // the band: a triangle wave thresholded at the duty, filtered by pixel
  // footprint so sub-pixel bands resolve to their mean grey instead of moire
  float tri = abs(fract(phi) - 0.5) * 2.0;
  float w   = max(fpx * 1.6, 0.015);
  float ink = 1.0 - smoothstep(duty - w, duty + w, tri);
  float fine = smoothstep(0.35, 0.8, fpx);
  ink = mix(ink, duty, fine);

  // ---- paper and ink, tinted by palette luminance mixes
  vec3 pale = c2; float lp = luma(c2);
  if (luma(c1) > lp) { pale = c1; lp = luma(c1); }
  if (luma(c0) > lp) { pale = c0; lp = luma(c0); }
  if (luma(c3) > lp) { pale = c3; lp = luma(c3); }
  vec3 dark = c3; float ld = luma(c3);
  if (luma(c0) < ld) { dark = c0; ld = luma(c0); }
  if (luma(c1) < ld) { dark = c1; ld = luma(c1); }
  if (luma(c2) < ld) { dark = c2; ld = luma(c2); }
  vec3 paleTint = pale / max(lp, 0.05) * 0.92;
  vec3 darkTint = dark / max(ld, 0.05) * 0.10;
  vec3 paper = mix(vec3(0.94), clamp(paleTint, 0.0, 1.0), tint * 0.45);
  vec3 inkC  = mix(vec3(0.045), clamp(darkTint, 0.0, 1.0), tint * 0.7);

  // a very faint sheet: tooth speckle at css-pixel scale, and a soft top-lit
  // gradient across the paper so the print reads as a lit object
  vec2  q     = gl_FragCoord.xy / max(u_pixelRatio, 0.5);
  float tooth = (hash21(floor(q * 0.7)) - 0.5) * 0.03;
  float sheet = 1.0 + tooth + 0.03 * (uv.y - 0.5);
  paper *= sheet;

  vec3 col = mix(paper, inkC, ink);

  // the lit flanks also catch a breath of light on the paper itself
  col *= 1.0 + 0.05 * shade;

  gl_FragColor = vec4(col, 1.0);
}
