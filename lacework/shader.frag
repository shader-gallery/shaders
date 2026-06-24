// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// lacework (Loom) — a dark field of dots that morph into crosses as radial waves
// pass through them, a crisp halftone lace. Four optional drifting glow blobs can
// backlight the field; the dots themselves carry the crisp colour. The grid can be
// rotated and warped, the ripples re-counted / re-amplified / re-centred, and the
// dot/cross shapes resized and biased.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spacing;     // px between dots
uniform float u_wavelength;  // radial wavelength, css px
uniform float u_waveSpeed;   // wave travel speed
uniform float u_glow;        // dot/lace brightness
uniform float u_backlight;   // drifting glow-blob backlight (the bg fill)
uniform float u_dotSize;     // resting dot radius scale
uniform float u_crossSize;   // cross arm/thickness scale
uniform float u_rippleAmp;   // morph (ripple) depth
uniform float u_ripples;     // ripple count (frequency multiplier)
uniform float u_originX;     // wave origin offset x (-1..1 of half-width)
uniform float u_originY;     // wave origin offset y
uniform float u_morphBias;   // resting bias dot(-)..cross(+)
uniform float u_crisp;       // edge sharpness of the dots
uniform float u_rotate;      // grid rotation (degrees)
uniform float u_distort;     // sine-warp distortion of the grid
uniform float u_points;      // number of ripple emitters (1..4)
uniform float u_splash;      // reach of each localized splash (frac of screen)
uniform float u_random;      // jitter of the splash origins
uniform float u_rndSeed;     // which random arrangement
uniform float u_overlay;     // visible ripple-ring overlay strength
uniform float u_ringWidth;   // thickness of the ripple-ring band
uniform float u_ringSpacing; // spacing between the visible ripple rings
uniform float u_crossLength; // cross arm length (independent of thickness)
uniform float u_crossThick;  // cross arm thickness (independent of length)

const float BG        = 0.039;   // #0A -> ~0.04
const float DOT_CSS   = 2.2;     // dot radius
const float ARM_CSS   = 5.2;     // cross arm length at full morph
const float THICK_CSS = 1.6;     // cross thickness at full morph

float sdCircle(vec2 p, float r) { return length(p) - r; }

float hash11(float p) { p = fract(p * 0.2317); p *= p + 23.19; p *= p + p; return fract(p); }

// spread positions for the extra ripple emitters (fractions of half-extent),
// shifted as a group by the Origin params. Emitter 0 sits at the origin itself.
vec2 emitOffset(int i) {
  if (i == 0) return vec2(0.0, 0.0);
  if (i == 1) return vec2(-0.55, 0.5);
  if (i == 2) return vec2(0.6, -0.42);
  return vec2(-0.48, -0.55);
}

vec3 paletteRamp(float h) {
  vec3 c = mix(u_palette[0], u_palette[1], smoothstep(0.00, 0.34, h));
  c = mix(c, u_palette[2], smoothstep(0.33, 0.67, h));
  c = mix(c, u_palette[3], smoothstep(0.66, 1.00, h));
  return c;
}

// cyclic palette wheel: p0->p1->p2->p3->p0 with triangular weights, so a hue that
// wraps around (fract 0/1) blends seamlessly instead of jumping p3->p0 like the
// linear paletteRamp does (that jump showed as a hard colour seam in the overlay).
float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float h) {
  float s = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (u_palette[0] * w0 + u_palette[1] * w1 + u_palette[2] * w2 + u_palette[3] * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// thin plus/cross: union of a horizontal and a vertical bar
float sdCross(vec2 p, float arm, float th) {
  p = abs(p);
  float horiz = max(p.x - arm, p.y - th);
  float vert  = max(p.y - arm, p.x - th);
  return min(horiz, vert);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = vec3(BG, BG, 0.047);

  // --- four drifting radial glow blobs (optional backlight / bg fill) ---
  vec2 p0 = vec2(res.x * (0.30 + 0.20 * sin(t * 0.7)), res.y * (0.35 + 0.15 * cos(t * 0.5)));
  vec2 p1 = vec2(res.x * (0.70 + 0.15 * cos(t * 0.6)), res.y * (0.50 + 0.15 * sin(t * 0.8)));
  vec2 p2 = vec2(res.x * (0.20 + 0.15 * sin(t * 0.4)), res.y * (0.70 + 0.10 * cos(t * 0.9)));
  vec2 p3 = vec2(res.x * (0.75 + 0.10 * sin(t * 0.5)), res.y * (0.20 + 0.10 * cos(t * 0.7)));
  float R = max(res.x, res.y);
  col += u_palette[0] * (0.30 * u_backlight) * smoothstep(R * 0.60, 0.0, distance(fc, p0));
  col += u_palette[1] * (0.25 * u_backlight) * smoothstep(R * 0.55, 0.0, distance(fc, p1));
  col += u_palette[2] * (0.20 * u_backlight) * smoothstep(R * 0.45, 0.0, distance(fc, p2));
  col += u_palette[3] * (0.16 * u_backlight) * smoothstep(R * 0.35, 0.0, distance(fc, p3));

  // --- grid transform: rotate + sine-warp distortion (defaults = identity) ---
  vec2 q = fc - ctr;
  float ca = cos(radians(u_rotate)), sa = sin(radians(u_rotate));
  q = mat2(ca, -sa, sa, ca) * q;
  q += vec2(sin(q.y * 0.012 + t * 0.3), sin(q.x * 0.012 - t * 0.25)) * (u_distort * 42.0 * pr);
  vec2 pf = q + ctr;

  // wave origin (re-centrable)
  vec2 worigin = ctr + vec2(u_originX, u_originY) * (res * 0.5);

  // --- dot grid, in device pixels ---
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  vec2  cellId  = floor(pf / spacing);
  vec2  dotCtr  = (cellId + 0.5) * spacing;
  vec2  local   = pf - dotCtr;

  // radial wave -> morph amount m in 0..1. Several emitters can radiate ripples
  // at once; their wave phases sum and interfere into a richer morph field.
  float dCtr = distance(dotCtr, worigin);   // primary origin: drives hue + opacity
  // Each ripple point is a LOCALIZED splash: concentric rings travel outward but
  // their strength fades past the splash reach, so several distinct raindrop
  // sources read on the field (combined by max) instead of one uniform texture.
  float nPts = max(floor(u_points + 0.5), 1.0);
  float splashR = max(u_splash, 0.05) * max(res.x, res.y);
  float coreGlow = 0.0;
  float wv = 0.0;
  float crestSum = 0.0;   // visible ripple-ring overlay, accumulated per splash
  for (int i = 0; i < 4; i++) {
    if (float(i) >= nPts) break;
    // splash origin: preset spread + Origin shift + optional random jitter
    vec2 jit = (vec2(hash11(float(i) + u_rndSeed * 7.13), hash11(float(i) + 41.0 + u_rndSeed * 7.13)) - 0.5) * u_random * 1.4;
    vec2 emit = ctr + (emitOffset(i) + vec2(u_originX, u_originY) + jit) * (res * 0.5);
    float phase = float(i) * 1.7;
    // dot/cross morph sampled at the cell centre
    float dd = distance(dotCtr, emit);
    float ring = max(0.0, sin((dd / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed + phase));
    float fdot = smoothstep(splashR, 0.0, dd);
    wv = max(wv, ring * fdot);
    // continuous ring overlay sampled per-fragment so the rings read between dots.
    // The overlay has its own spacing (u_ringSpacing) and band width (u_ringWidth),
    // independent of the dot/cross morph wavelength.
    float dp = distance(pf, emit);
    float ringFreq = max(u_ripples, 0.1) / max(u_ringSpacing, 0.1);
    float wp = sin((dp / (u_wavelength * pr)) * 6.2831853 * ringFreq - t * u_waveSpeed + phase);
    float lo = mix(0.85, -0.25, clamp(u_ringWidth, 0.0, 1.0));
    crestSum += smoothstep(lo, 1.0, wp) * smoothstep(splashR, 0.0, dp);
    coreGlow = max(coreGlow, smoothstep(splashR * 0.10, 0.0, dp));
  }
  float m = clamp(wv * u_rippleAmp, 0.0, 1.0);
  // resting bias: shift the whole field toward dot (-) or cross (+)
  float mEff = clamp(m + u_morphBias, 0.0, 1.0);

  // shape morph: shrinking dot blended into a growing cross. Sizes scale with
  // refScale (same as spacing) so the dot/cross-to-cell ratio is constant across
  // resolutions - the small poster and the fullscreen view now match.
  float ss    = pr * refScale;
  // floor the thinnest features to ~0.7px so the smallest dot/cross settings draw
  // as a crisp sub-px line rather than a washed-out sub-pixel blur. The dot floor
  // fades with the morph so the dot can still vanish into the cross.
  float minPx = 0.7 * pr;
  float dotR  = max(mix(DOT_CSS * u_dotSize, 0.0, mEff) * ss, minPx * (1.0 - mEff));
  float arm   = max(mix(DOT_CSS * u_dotSize, ARM_CSS * u_crossSize * u_crossLength, mEff) * ss, minPx);
  float thick = max(mix(DOT_CSS * u_dotSize, THICK_CSS * u_crossSize * u_crossThick, mEff) * ss, minPx);
  float dDot   = sdCircle(local, dotR);
  float dCross = sdCross(local, arm, thick);
  float shape  = mix(dDot, dCross, smoothstep(0.15, 0.85, mEff));
  // AA is a fixed ~1px screen-space edge (NOT scaled by refScale); scaling it with
  // refScale widened the edge at high res and blurred the small marks.
  float aa     = mix(1.4, 0.3, clamp(u_crisp, 0.0, 1.0)) * pr;   // lower = crisper
  float mask   = 1.0 - smoothstep(-aa, aa, shape);

  // rainbow tint by angle from the wave origin, slowly rotating, blended with the
  // palette ramp so themes read on the lace itself (not just the blobs)
  vec2  d       = dotCtr - worigin;
  float hue     = fract((atan(d.y, d.x) + 3.14159265) / 6.2831853 + t * 0.015);
  vec3  rainbow = 0.55 + 0.45 * cos(6.2831853 * hue + vec3(0.0, 2.094, 4.188));
  vec3  dotCol  = mix(rainbow, paletteRamp(hue), 0.45);
  float radial  = 0.60 - (dCtr / length(ctr)) * 0.08;
  float opacity = clamp(radial + m * 0.40, 0.0, 1.0);

  col += dotCol * mask * opacity * (1.05 + 0.6 * m) * u_glow;

  // a soft bright bloom right at each splash centre so the ripple source reads
  col += wheelCol(u_time * 0.05) * coreGlow * 0.20 * u_glow;

  // visible ripple-ring overlay: each splash draws its own expanding rings that
  // fade into each other where they overlap, so the water-ripple read is explicit
  // (not just the dot/cross morph). u_overlay sets how strongly the rings show.
  // NB: tint with a CONTINUOUS per-fragment hue (from pf, not the quantised cell
  // centre dotCtr) - using the cell hue here painted the overlay in flat per-cell
  // colour blocks, which read as square artifacts in the smooth ring blend.
  vec2  dpx   = pf - worigin;
  float huePx = fract((atan(dpx.y, dpx.x) + 3.14159265) / 6.2831853 + t * 0.015);
  col += wheelCol(huePx + 0.5) * crestSum * u_overlay * 0.16 * u_glow;

  // pre-quantisation dither: the smooth backlight/ripple colour blends band into
  // blocky steps when written to the renderer 8-bit offscreen buffer (the post
  // dither runs too late to help, and bloom resamples the banded buffer). Break
  // it here with ~1 LSB of interleaved-gradient noise before the colour is stored.
  float ign = fract(52.9829189 * fract(dot(fc + t * 1.7, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
