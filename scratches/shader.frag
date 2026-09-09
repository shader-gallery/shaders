// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// scratches (Noir) - a worn release print running through a projector. The
// picture itself is soft and out of focus: a few big blurred light shapes in
// faded print colours drifting across a warm base tint, with the lamp hot
// spot in the middle and the corners falling off. On top of it sits the
// damage, all of it stepped at 24 frames a second so it jumps the way film
// does rather than sliding: hairline vertical scratches in three layers (one
// long tramline that wanders slowly across the gate, a few that hold for
// seconds, a scatter of one-frame flashes), each broken along its length as
// the base scratch catches and loses the light; dust and dirt specks at two
// sizes, mostly dark on the positive with the odd bright one; a curled hair
// that lands in the gate for a handful of frames and is gone; per-frame
// grain that lives in the midtones; lamp flicker; and gate weave, the whole
// picture and its damage breathing a few pixels side to side and up and
// down. A slow chemical stain blooms in from one side as the print decays.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scratches; // scratch density and strength            (default 1.0)
uniform float u_dust;      // dust, dirt and hair density              (default 1.0)
uniform float u_grain;     // film grain strength                      (default 1.0)
uniform float u_flicker;   // lamp flicker and gate weave amplitude    (default 1.0)
uniform float u_drift;     // drift speed of the soft picture behind   (default 0.3)

const float TAU = 6.28318530718;
const float FPS = 24.0;

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
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ---- one layer of vertical scratches. The x axis is cut into columns of
// width cw; each column may hold one scratch for one epoch of length life,
// after which it is redrawn (a new position, or none). Returns a signed
// intensity: positive is a bright base scratch, negative a dark emulsion one.
// px, py in frame units (frame one unit tall); wpx is the line width in
// frame units; fr is the film frame counter for the along-length breakup.
float scratchLayer(float px, float py, float cw, float life, float prob,
                   float seedBase, float t, float wpx, float fr) {
  float col0 = floor(px / cw);
  float s = 0.0;
  for (int k = -1; k <= 1; k++) {
    float ci = col0 + float(k);
    float epoch = floor(t / life + hash21(vec2(ci, seedBase)));
    vec2 sd = vec2(ci * 3.7 + seedBase, epoch * 1.31 + seedBase * 0.7);
    float h0 = hash21(sd);
    if (h0 > prob) continue;
    float h1 = hash21(sd + 1.0), h2 = hash21(sd + 2.0), h3 = hash21(sd + 3.0);
    float x = (ci + 0.08 + 0.84 * h1) * cw;
    // a per-frame sub-pixel jitter: the scratch is in the gate, not on the screen
    x += (hash21(vec2(fr, ci + seedBase)) - 0.5) * wpx * 0.6;
    // partial scratches: a y range with soft ends
    float y0 = -0.6 + 1.2 * h2 * step(0.45, h3);
    float y1 = y0 + 0.35 + 1.4 * hash21(sd + 4.0);
    float span = smoothstep(y0, y0 + 0.08, py) * smoothstep(y1, y1 - 0.08, py);
    float d = abs(px - x);
    float line = 1.0 - smoothstep(0.0, wpx, d);
    // a faint halation skirt either side of the bright line
    line += 0.18 * (1.0 - smoothstep(0.0, wpx * 4.0, d));
    // the scratch catches the light unevenly along its length and that
    // pattern rides the film, so it is fresh every frame: fine chatter
    // inside longer gaps
    float brk = vnoise(vec2(ci * 5.1 + seedBase, py * 70.0 + fr * 3.71));
    brk = smoothstep(0.28, 0.66, brk);
    brk *= smoothstep(0.25, 0.55, vnoise(vec2(ci * 2.3 + seedBase + 9.0, py * 9.0 + fr * 1.37)));
    float sgn = hash21(sd + 5.0) < 0.62 ? 1.0 : -1.0;
    float amp = 0.45 + 0.55 * hash21(sd + 6.0);
    s += sgn * line * span * brk * amp;
  }
  return s;
}

// ---- dust and dirt: one speck per occupied cell, redrawn every frame.
// Returns a signed coverage, dark negative, bright positive.
float dustLayer(vec2 q, float cell, float dens, float fr, float seedBase, float sizePx) {
  vec2 ci = floor(q / cell);
  vec2 sd = ci * 1.37 + vec2(fr * 0.913, seedBase);
  float h0 = hash21(sd);
  if (h0 > dens) return 0.0;
  vec2 h = vec2(hash21(sd + 1.0), hash21(sd + 2.0));
  vec2 c = (ci + 0.2 + 0.6 * h) * cell;
  vec2 dv = q - c;
  float rs = hash21(sd + 3.0);
  float r = sizePx * (0.35 + 1.6 * rs * rs);
  // a lumpy outline, not a disc
  float ang = atan(dv.y, dv.x);
  float l3 = hash21(sd + 5.0), l5 = hash21(sd + 6.0);
  float lump = 1.0 + 0.40 * l3 * sin(ang * 2.0 + h.x * TAU) + 0.22 * l5 * sin(ang * 3.0 + h.y * TAU)
             + 0.12 * sin(ang * 5.0 + l3 * TAU);
  float d = length(dv) - r * lump;
  float cov = 1.0 - smoothstep(-0.5, 0.9, d);
  float sgn = hash21(sd + 4.0) < 0.82 ? -1.0 : 1.0;
  return sgn * cov;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr      = max(u_pixelRatio, 0.5);
  vec2  res     = u_resolution;
  vec2  uv      = gl_FragCoord.xy / res;
  float aspect  = res.x / res.y;
  float pxUnit  = res.y / pr;              // css px per frame unit
  float t       = u_time;
  float fr      = floor(t * FPS);          // the film frame counter
  float scrA    = clamp(u_scratches, 0.0, 2.0);
  float dustA   = clamp(u_dust, 0.0, 2.0);
  float grainA  = clamp(u_grain, 0.0, 2.0);
  float flickA  = clamp(u_flicker, 0.0, 2.0);
  float drift   = clamp(u_drift, 0.0, 2.0);

  // ---- gate weave: a slow sway plus a per-frame kick, in frame units
  vec2 weave = vec2(0.0035 * sin(t * 1.7) + 0.002 * sin(t * 4.3 + 1.0),
                    0.005 * sin(t * 1.1 + 2.0) + 0.0025 * sin(t * 3.1));
  weave += (vec2(hash21(vec2(fr, 1.0)), hash21(vec2(fr, 2.0))) - 0.5) * 0.0025;
  weave *= flickA;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) + weave;
  vec2 q = p * pxUnit;                     // css px, weaving with the gate

  // ---- the picture: soft out-of-focus light shapes in faded print colours
  float td = t * drift;
  // faded print: every colour pulled toward a warm base and lifted blacks
  vec3 f0 = mix(vec3(luma(c0)), c0, 1.1), f1 = mix(vec3(luma(c1)), c1, 1.1);
  vec3 f2 = mix(vec3(luma(c2)), c2, 1.1), f3 = mix(vec3(luma(c3)), c3, 1.1);
  f0 = clamp(f0, 0.0, 1.0); f1 = clamp(f1, 0.0, 1.0); f2 = clamp(f2, 0.0, 1.0); f3 = clamp(f3, 0.0, 1.0);
  vec3 base = mix(vec3(0.085, 0.075, 0.065), f3 * 0.3, 0.4);
  vec3 pic = base;
  // the picture is a night street thrown out of focus: a dozen bokeh discs
  // of lamp light, each a soft-edged disc with the brighter rim a real lens
  // gives, at three depths of blur, drifting very slowly. A cloudy field and
  // a low diagonal glow tie them together so the black is never empty.
  float cl = fbm(p * 2.2 + vec2(td * 0.05, -td * 0.03) + 7.0);
  pic += f3 * 0.12 * (cl - 0.3);
  float by = p.y + 0.10 - 0.18 * p.x - 0.05 * sin(td * 0.21);
  pic += f2 * 0.10 * exp(-by * by * 8.0) * (0.5 + 0.7 * cl);
  for (int i = 0; i < 12; i++) {
    float k = float(i);
    vec3 h = vec3(hash21(vec2(k, 1.3)), hash21(vec2(k, 2.7)), hash21(vec2(k, 4.1)));
    // spread the lights along the frame, the far ones smaller and dimmer
    vec2 bc = vec2((h.x - 0.5) * aspect * 1.05, (h.y - 0.5) * 1.05);
    bc += 0.04 * vec2(sin(td * (0.13 + 0.1 * h.z) + k), cos(td * (0.11 + 0.08 * h.x) + k * 2.0));
    float depth = h.z;                                  // 0 near, 1 far
    float r = mix(0.16, 0.045, depth) * (0.8 + 0.4 * h.y);
    float d = length(p - bc);
    // near lights blur softer than far ones
    float soft = mix(0.68, 0.86, depth);
    float disc = 1.0 - smoothstep(r * soft, r * 1.03, d);
    float rim  = smoothstep(r * 0.5, r * 0.95, d) * disc;
    // the lamp itself is not even: the cloud field mottles the disc
    disc *= 0.82 + 0.36 * cl;
    float halo = exp(-d * d / (r * r * 3.0)) * 0.25;
    float bright = mix(0.62, 0.26, depth) * (0.75 + 0.5 * h.x);
    vec3 bcol = f0;
    if (i - (i / 4) * 4 == 1) bcol = f1;
    if (i - (i / 4) * 4 == 2) bcol = f2;
    if (i - (i / 4) * 4 == 3) bcol = mix(f1, f3, 0.5);
    // a little of the lamp colour toward white at the core, as a print does
    bcol = mix(bcol, vec3(1.0, 0.96, 0.9), 0.12 * (1.0 - depth));
    pic += bcol * bright * (disc * (0.7 + 0.45 * rim) + halo);
  }
  // a print has a shoulder: roll the overlapping lamps off instead of clipping
  pic = pic / (1.0 + max(pic - 0.80, 0.0) * 0.9);
  // the projector falloff toward the gate edge
  vec2 hp = p - vec2(0.06, -0.04);
  float rr = length(hp * vec2(0.8, 1.0));
  pic *= 1.05 - 0.45 * smoothstep(0.35, 1.05, rr);
  pic += vec3(0.04, 0.032, 0.025) * (1.0 - smoothstep(0.0, 0.6, rr));

  // ---- chemical decay: a stain blooming in from one edge, tinted by the
  // deepest print colour, its edge frilled by low noise
  float stainF = fbm(p * 1.6 + vec2(3.0, 1.0) + td * 0.02);
  float stain = smoothstep(0.55, 0.95, (0.5 - p.x / aspect) * 0.5 + (p.y + 0.5) * 0.25 + stainF * 0.7 + 0.08 * sin(td * 0.13));
  vec3 stainCol = mix(vec3(luma(f3)), f3, 0.7) * 0.7;
  pic = mix(pic, pic * 0.7 + stainCol * 0.25, stain * 0.55);

  // ---- lamp flicker: a per-frame level, a slow shutter beat, a rare dip
  float flick = 1.0 + flickA * (0.07 * (hash21(vec2(fr, 7.0)) - 0.5)
                              + 0.035 * sin(t * 6.3) * sin(t * 1.9)
                              - 0.18 * smoothstep(0.985, 1.0, hash21(vec2(floor(t * 3.0), 11.0))));
  pic *= flick;

  // ---- grain: two scales of per-frame noise, strongest in the midtones
  // silver-halide clumps: hard grains on whole device pixels at two sizes
  // (fractional block sizes beat against the pixel grid into a mesh) under
  // a soft coarse clumping
  vec2 gd = floor(gl_FragCoord.xy);
  float gr = (hash21(gd + fr * vec2(13.7, 7.3)) - 0.5) * 0.45
           + (hash21(floor(gd * 0.5 + 0.25) + fr * vec2(5.1, 9.7)) - 0.5) * 0.35
           + (vnoise(rot(0.6) * q * 0.38 + fr * 0.71 + 5.0) - 0.5) * 0.4;
  float L = luma(pic);
  float mid = 4.0 * L * (1.0 - L);
  pic += gr * grainA * (0.045 + 0.075 * clamp(mid, 0.0, 1.0));

  // ---- scratches, three layers, in frame units (x spans -aspect/2..aspect/2)
  float wA = 1.0 / pxUnit;    // a one css-pixel hairline
  float sc = 0.0;
  // the tramline: always there, wandering slowly across the gate, breaking
  // up as it goes; it is what the eye reads as the film running
  {
    float tx = (fbm(vec2(t * 0.06, 3.0)) - 0.5) * aspect * 0.9;
    tx += (hash21(vec2(fr, 5.0)) - 0.5) * wA * 0.8;
    float d = abs(p.x - tx);
    float line = 1.0 - smoothstep(0.0, wA * 1.2, d);
    float brk = smoothstep(0.22, 0.58, vnoise(vec2(1.0, p.y * 18.0 + fr * 2.93)));
    // it fades in and out over seconds as the base scratch runs through
    float presence = smoothstep(0.35, 0.6, vnoise(vec2(t * 0.35, 9.0)));
    sc += line * brk * presence * 0.9;
  }
  // scratches that hold for a couple of seconds
  sc += scratchLayer(p.x, p.y, aspect / 9.0, 2.6, 0.38 * scrA, 11.0, t, wA, fr);
  // short runs of a few frames
  sc += scratchLayer(p.x, p.y, aspect / 14.0, 0.25, 0.22 * scrA, 17.0, t, wA * 0.9, fr);
  // one-frame flashes, thin and many
  sc += scratchLayer(p.x, p.y, aspect / 22.0, 1.0 / FPS, 0.14 * scrA, 23.0, t, wA * 0.8, fr);
  sc *= scrA;

  // ---- dust and dirt, two sizes, and the odd fibre
  float du = dustLayer(q, 18.0, 0.10 * dustA, fr, 1.0, 0.9);
  du += dustLayer(q, 80.0, 0.07 * dustA, fr, 2.0, 2.4);

  // a hair: a shallow arc that lands in the gate for a few frames. One
  // candidate per 5-frame epoch, present about a fifth of the time.
  float hair = 0.0;
  {
    float ep = floor(fr / 5.0);
    float hh = hash21(vec2(ep, 25.0));
    if (hh < 0.22 * dustA) {
      vec2 hc = vec2((hash21(vec2(ep, 32.0)) - 0.5) * aspect, hash21(vec2(ep, 33.0)) - 0.5);
      float R = 0.10 + 0.25 * hash21(vec2(ep, 34.0));
      float a0 = hash21(vec2(ep, 35.0)) * TAU;
      float spanA = 0.9 + 1.8 * hash21(vec2(ep, 36.0));
      vec2 ctr = hc + R * vec2(cos(a0), sin(a0));
      vec2 dv = p - ctr;
      float ang = atan(dv.y, dv.x);
      float rel = ang - (a0 + 3.14159);
      rel = rel - TAU * floor((rel + 3.14159) / TAU);
      float inArc = smoothstep(spanA * 0.5 + 0.05, spanA * 0.5 - 0.05, abs(rel));
      // a little wiggle so it is a hair, not a compass arc
      float wig = (vnoise(vec2(ang * 9.0 + ep, 2.0)) - 0.5) * 0.012
                + (vnoise(vec2(ang * 31.0 + ep, 7.0)) - 0.5) * 0.003;
      float d = abs(length(dv) - R + wig);
      // it twitches frame to frame in the gate
      d += (hash21(vec2(fr, 41.0)) - 0.5) * wA * 0.5;
      // thinner toward the tip, and it is a hair: one pixel and a bit
      float taper = 0.55 + 0.45 * smoothstep(spanA * 0.5, 0.0, abs(rel));
      hair = (1.0 - smoothstep(wA * 0.15 * taper, wA * 0.85 * taper, d)) * inArc * 0.9;
    }
  }

  // ---- composite the damage onto the picture
  vec3 col = pic;
  // dark specks and the hair block the light; bright ones add it
  col *= 1.0 - clamp(-du, 0.0, 1.0) * 0.85;
  col += vec3(0.9, 0.88, 0.82) * clamp(du, 0.0, 1.0) * 0.7;
  col *= 1.0 - hair * 0.8;
  // bright base scratches add light, dark emulsion scratches remove it
  col += vec3(0.95, 0.93, 0.88) * clamp(sc, 0.0, 2.0) * 0.55;
  col *= 1.0 - clamp(-sc, 0.0, 1.0) * 0.6;

  // ---- projection: a warm lift on the blacks and the edge burn, with the
  // corners falling off the gate
  col = col * 0.94 + vec3(0.035, 0.03, 0.025);
  float vig = 1.0 - smoothstep(0.55, 1.25, length(hp * vec2(0.8, 1.0)) + 0.06 * stainF);
  col *= 0.35 + 0.65 * vig;

  gl_FragColor = vec4(col, 1.0);
}
