// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// newton (Burnish) - thin-film interference between two sheets of glass. A
// slightly warped plate rests on a flat one and touches it at several points,
// so the air gap between them is a height field: near each contact it grows
// as a paraboloid, and the basins meet in soft ridges. Light reflected from
// the two faces of the gap interferes, and the fringes are the contour lines
// of that gap: Newton rings tightening outward from each contact, bending
// where two basins meet, with a dark spot at every contact from the half-wave
// phase flip. Colour comes from doing the interference for four wavelengths
// and letting each wavelength carry one palette pole, so the orders beat
// against each other into the shifting spectral sequence of real thin-film
// colour, and the whole thing re-themes. White light has a short coherence
// length, so the fringe contrast dies away with order and the high orders
// wash into a pale even sheen. Trapped dust motes lift the plate locally and
// wear their own tiny ring systems. The plate breathes under a slow pressure
// so the rings sweep in and out, and a faint ripple in the gap makes the
// fringes wobble like a soap film. Over it all, the top face of the glass
// carries a soft broad window reflection.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_curvature;  // plate curvature, ring density          (default 1.0)
uniform float u_coherence;  // order at which fringes wash out        (default 14)
uniform float u_flow;       // breathing and ripple speed             (default 0.3)
uniform float u_ripple;     // soap-film wobble in the gap            (default 0.5)
uniform float u_gain;       // fringe brightness                      (default 1.0)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;
const int   NCONTACT = 4;
const int   NDUST = 3;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// contact point i: where the warped plate touches the flat, its local lens
// radius (bigger is flatter, fewer rings), breathing on its own harmonic so
// the set loops together. x already scaled by aspect. Two contacts sit off
// the frame at opposite corners so their rings enter as broad arcs; the two
// in-frame contacts are tighter systems at very different scales.
void contact(int i, float a, float t, out vec2 c, out float R) {
  c = vec2(0.0); R = 1.0;
  if (i == 0) { c = vec2( 1.34 * a,  0.18); R = 0.055 * (1.0 + 0.16 * sin(t)); }
  if (i == 1) { c = vec2(-0.50 * a,  0.46); R = 0.017 * (1.0 + 0.16 * sin(t * 2.0 + 2.0)); }
  if (i == 2) { c = vec2( 0.12 * a, -0.74); R = 0.008 * (1.0 + 0.16 * sin(t * 0.5 + 4.0)); }
  if (i == 3) { c = vec2(-1.32 * a, -1.15); R = 0.045 * (1.0 + 0.16 * sin(t * 1.5 + 1.0)); }
  c += 0.02 * vec2(sin(t * 0.5 + float(i) * 2.1), cos(t * 0.5 + float(i) * 1.3));
}

// the air gap in half-wave orders at frame point p: a soft minimum of the
// paraboloid sag around every contact, so each basin is a ring system and
// the basins meet in soft ridges where the fringes bend into one another.
// The film is curved, so the whole plane is first warped by a slow smooth
// field and the rings come out as gently egged contours rather than perfect
// circles. Dust motes lift the plate locally and wear their own tiny rings.
float gap(vec2 p, float a, float t, float curv, float rip) {
  float k = 2.2;                       // join softness, in orders
  // curved film: low-frequency warp of the plane
  vec2 wp = p + (0.10 + 0.08 * rip) * (vec2(fbm(p * 0.7 + vec2(t * 0.03, 0.0)),
                                            fbm(p * 0.7 + vec2(7.3, 2.1) - vec2(0.0, t * 0.025))) - 0.5) * 2.0;
  float acc = 0.0;
  for (int i = 0; i < NCONTACT; i++) {
    vec2 c; float R;
    contact(i, a, t, c, R);
    vec2  q  = wp - c;
    float hi = dot(q, q) / (2.0 * R) * curv;     // paraboloid sag, r^2 / 2R
    acc += exp(-min(hi, 60.0) / k);
  }
  float h = -k * log(max(acc, 1e-20));
  // trapped dust: small bumps that lift the plate and wear their own rings
  for (int j = 0; j < NDUST; j++) {
    float fj = float(j);
    vec2 dc = vec2((0.02 + 0.40 * fj) * a, 0.70 - 0.70 * fj) + 0.12 * vec2(sin(fj * 4.1), cos(fj * 2.7));
    dc += 0.012 * vec2(cos(t * 0.5 + fj * 3.0), sin(t * 0.5 + fj * 1.9));
    vec2  dq = p - dc;
    float s  = 0.07 + 0.02 * fj;
    h += (5.0 + 1.5 * fj) * exp(-dot(dq, dq) / (s * s));
  }
  // soap-film ripple: a finer wobble in the gap thickness
  h += rip * 0.9 * (fbm(p * 2.1 + vec2(-t * 0.05, t * 0.04) + 40.0) - 0.5);
  // the plates never quite touch: a film of dust holds a quarter wave open,
  // so the contact eye is a dim first colour rather than a black hole
  return max(h, 0.0) + 0.25;
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
  float t      = u_time * clamp(u_flow, 0.0, 2.0);
  float curv   = max(u_curvature, 0.1);
  float coh    = max(u_coherence, 1.0);
  float rip    = clamp(u_ripple, 0.0, 2.0);
  float gain   = clamp(u_gain, 0.0, 2.0);

  // frame coords: y in -1..1, x in -aspect..aspect
  vec2  p  = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  float px = 2.0 / res.y;

  // optional pointer pressure: pressing the plate near the pointer thins the
  // gap there, zero at rest
  vec2  mres = u_mouse / res;
  vec2  mp   = vec2((mres.x - 0.5) * aspect, mres.y - 0.5) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2  mq   = p - mp;
  float press = mAmt * 2.0 * exp(-dot(mq, mq) / 0.3);

  // the gap and its pixel-footprint slope (finite differences, no derivatives)
  float d  = max(gap(p, aspect, t, curv, rip) - press, 0.0);
  float dx = max(gap(p + vec2(px, 0.0), aspect, t, curv, rip) - press, 0.0);
  float dy = max(gap(p + vec2(0.0, px), aspect, t, curv, rip) - press, 0.0);
  float fpx = length(vec2(dx - d, dy - d));   // orders per pixel

  // ---- interference. Reflection off the far face flips phase by half a
  // wave, so the contact is dark: I = sin^2(pi d / lambda). Four wavelengths
  // in the ratio of a red, an amber, a green and a blue line, each carrying
  // one palette pole. Contrast dies with order (coherence) and with fringes
  // finer than the pixel (aliasing guard), toward the mean of one half.
  float vis = exp(-(d * d) / (coh * coh));
  vis *= 1.0 - smoothstep(0.18, 0.45, fpx);
  float ph = d * TAU * 0.5;
  float i0 = 0.5 - 0.5 * cos(ph / 1.00) * vis;   // 650 nm
  float i1 = 0.5 - 0.5 * cos(ph / 0.89) * vis;   // 580 nm
  float i2 = 0.5 - 0.5 * cos(ph / 0.83) * vis;   // 540 nm
  float i3 = 0.5 - 0.5 * cos(ph / 0.72) * vis;   // 470 nm
  float l0 = luma(c0), l1 = luma(c1), l2 = luma(c2), l3 = luma(c3);
  // the incoherent mean of four poles is mud in most themes, so the fringe
  // deviation rides on a neutral desaturated sheen instead: the coloured
  // orders pop and the washed-out high orders read as pale grey glass
  vec3 avg4  = (c0 + c1 + c2 + c3) * 0.25;
  vec3 sheen = mix(vec3(luma(avg4)), avg4, 0.30);
  vec3 fr = ((i0 - 0.5) * c0 + (i1 - 0.5) * c1 + (i2 - 0.5) * c2 + (i3 - 0.5) * c3) * 0.42
          + 0.40 * sheen;
  fr = max(fr, 0.0);
  // the film only returns a fraction of the light; the source is a soft
  // broad lamp from the upper left, so the sheen has a direction
  vec2  lp = vec2(0.25 * aspect, 0.35);
  float lamp = 0.62 + 0.45 * exp(-dot(p - lp, p - lp) * 0.20);
  lamp *= 1.0 - 0.25 * smoothstep(0.5, 1.4, length(vec2(p.x / aspect, p.y)));
  // the washed-out high orders sit back in the dark; only the coherent low
  // orders glow at full strength
  vec3 fringe = fr * lamp * gain * 1.5 * (0.45 + 0.55 * vis);

  // ---- the dark contact spots go to the glass itself; deepen the very low
  // orders a touch so every ring system has a visible black eye
  float eye = smoothstep(0.55, 0.0, d);

  // ---- the glass: near-black with the palette in its depths, a slow tonal
  // drift across the plate, and a faint pale reflection of the room above
  vec3 avg = (c0 + c1 + c2 + c3) * 0.25;
  vec3 deep = mix(vec3(luma(avg)), avg, 0.6);
  vec3 glass = deep * (0.05 + 0.03 * uv.y);
  vec3 col = glass + fringe * (1.0 - 0.4 * eye);

  // window reflection on the top face: a broad soft lozenge upper left,
  // tinted by the palest pole, and a thin brighter bar inside it
  vec3 pale = c2; float lp2 = l2;
  if (l0 > lp2) { pale = c0; lp2 = l0; }
  if (l1 > lp2) { pale = c1; lp2 = l1; }
  if (l3 > lp2) { pale = c3; lp2 = l3; }
  vec2 wq = (p - vec2(-0.62 * aspect, 0.72)) * vec2(0.9, 1.8);
  float win = exp(-dot(wq, wq) * 1.1);
  float bar = exp(-dot(wq, wq) * 1.1) * smoothstep(0.05, 0.0, abs(wq.y + 0.2 * wq.x - 0.1));
  vec3 refl = mix(vec3(1.0), pale, 0.35);
  col += refl * (0.09 * win + 0.14 * bar);

  // a whisper of dust on the glass: sparse soft motes at css-pixel scale
  vec2  q  = gl_FragCoord.xy / max(u_pixelRatio, 0.5);
  vec2  qc = floor(q / 9.0);
  vec2  qf = fract(q / 9.0) - 0.5;
  float on = step(0.975, hash21(qc));
  vec2  jit = vec2(hash21(qc + 3.1), hash21(qc + 7.7)) - 0.5;
  float speck = on * exp(-dot(qf - jit * 0.5, qf - jit * 0.5) * 60.0) * 0.18;
  col += speck * refl * lamp;

  gl_FragColor = vec4(col, 1.0);
}
