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

const float BG        = 0.039;   // #0A -> ~0.04
const float DOT_CSS   = 2.2;     // dot radius
const float ARM_CSS   = 5.2;     // cross arm length at full morph
const float THICK_CSS = 1.6;     // cross thickness at full morph

float sdCircle(vec2 p, float r) { return length(p) - r; }

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
  for (int i = 0; i < 4; i++) {
    if (float(i) >= nPts) break;
    vec2 emit = ctr + (emitOffset(i) + vec2(u_originX, u_originY)) * (res * 0.5);
    float di = distance(dotCtr, emit);
    float ring = max(0.0, sin((di / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed + float(i) * 1.7));
    float fall = smoothstep(splashR, 0.0, di);          // 1 at the source, 0 past reach
    wv = max(wv, ring * fall);
    coreGlow = max(coreGlow, smoothstep(splashR * 0.10, 0.0, distance(fc, emit)));
  }
  float m = clamp(wv * u_rippleAmp, 0.0, 1.0);
  // resting bias: shift the whole field toward dot (-) or cross (+)
  float mEff = clamp(m + u_morphBias, 0.0, 1.0);

  // shape morph: shrinking dot blended into a growing cross
  float dotR  = mix(DOT_CSS * u_dotSize, 0.0, mEff) * pr;
  float arm   = mix(DOT_CSS * u_dotSize, ARM_CSS * u_crossSize, mEff) * pr;
  float thick = mix(DOT_CSS * u_dotSize, THICK_CSS * u_crossSize, mEff) * pr;
  float dDot   = sdCircle(local, dotR);
  float dCross = sdCross(local, arm, thick);
  float shape  = mix(dDot, dCross, smoothstep(0.15, 0.85, mEff));
  float aa     = mix(1.4, 0.32, clamp(u_crisp, 0.0, 1.0)) * pr;   // lower = crisper
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
  col += paletteRamp(fract(u_time * 0.05)) * coreGlow * 0.20 * u_glow;

  // faint smooth glow along the wavefront so the crest reads between dots
  float wavePix = sin((distance(pf, worigin) / (u_wavelength * pr)) * 6.2831853 * max(u_ripples, 0.1) - t * u_waveSpeed);
  float crest   = smoothstep(0.90, 1.0, wavePix);
  col += paletteRamp(fract(hue + 0.5)) * crest * 0.045 * u_glow;

  gl_FragColor = vec4(col, 1.0);
}
