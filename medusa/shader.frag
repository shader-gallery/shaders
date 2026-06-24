// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// medusa (Bloom) — drifting sea-nettle jellyfish. Each is a translucent domed
// bell marked with radial stripes and a dark scalloped margin, a frilly ruffled
// column of oral arms, and a long curtain of fine tentacles streaming below and
// swaying on a slow continuous current. There is NO contraction pulse — the
// jellies simply sink and drift, trailing their arms, looping with no reset.
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
uniform float u_driftSpeed;    // drift + sway speed                (default 0.6)
uniform float u_bellSize;      // bell radius in CSS px             (default 150)
uniform float u_count;         // how many jellyfish, 1..6          (default 3)
uniform float u_brightness;    // overall emission                  (default 1.3)
uniform float u_tentacleFlow;  // tentacle / oral-arm sway amount   (default 0.6)
uniform float u_glow;          // colored water atmosphere fill     (default 0.8)
uniform float u_colorSpread;   // jelly-to-jelly hue variety        (default 0.85)
uniform float u_saturation;    // jelly colour vividness            (default 1.2)
uniform float u_stripes;       // radial bell-stripe density        (default 14)
uniform float u_tentacles;     // tentacle curtain density          (default 16)
uniform float u_bubbles;       // microbubble amount, 0 = off       (default 0.8)
uniform float u_bubbleSize;    // microbubble size                  (default 1.0)
uniform float u_bubbleSpeed;   // microbubble rise speed            (default 1.0)

const vec3  BG  = vec3(0.02, 0.03, 0.06); // deep-water base
const int   NJ  = 8;                       // max jellies (count-gated)
const float PI  = 3.14159265;

vec3 P0, P1, P2, P3;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(11.0, 7.0); a *= 0.5; }
  return s;
}
// microbubbles: three parallax depth layers of tiny rising motes. Each layer is
// a hash grid (one mote per cell, jittered + wobbling, rising with wrap), far
// layers smaller/dimmer/slower, near layers bigger/brighter/faster.
float bubbles(vec2 fc, vec2 res, float pr, float tb) {
  float acc = 0.0;
  for (int L = 0; L < 3; L++) {
    float lf  = float(L) / 2.0;                       // 0 far .. 1 near
    float spd = mix(0.015, 0.05, lf) * max(u_bubbleSpeed, 0.0);
    float cellPx = (res.y * mix(0.05, 0.12, lf)) / clamp(u_bubbles, 0.3, 3.0);
    vec2  cell = vec2(cellPx);
    vec2  id   = floor(fc / cell);
    float fL   = float(L) * 13.0;
    float h1 = hash21(id + 0.5 + fL);
    float h2 = hash21(id + 3.7 + fL);
    float h3 = hash21(id + 7.1 + fL);
    float by = fract(h2 - tb * spd);                  // rises, wraps inside the cell
    vec2  bp = (id + vec2(h1, by)) * cell;
    bp.x += sin(tb * 0.4 + h3 * 6.2831) * cell.x * 0.18;  // gentle wobble
    float size = (1.2 + 2.0 * h3) * pr * mix(0.6, 1.7, lf) * max(u_bubbleSize, 0.05);
    float d = length(fc - bp);
    // fade each mote in at the start of its rise and out at the end so it never
    // pops in/out at the wrap point.
    float life = smoothstep(0.0, 0.14, by) * smoothstep(1.0, 0.86, by);
    acc += exp(-(d * d) / (size * size)) * mix(0.35, 1.0, lf) * life;
  }
  return acc;
}

// blend two adjacent palette entries on a 0..4 wheel
vec3 paletteMix(float s) {
  s = fract(s) * 4.0;
  float i = floor(s), f = s - i;
  vec3 a = P0, b = P1;
  if (i > 2.5)      { a = P3; b = P0; }
  else if (i > 1.5) { a = P2; b = P3; }
  else if (i > 0.5) { a = P1; b = P2; }
  return mix(a, b, f);
}

void main() {
  float pr = u_pixelRatio;
  vec2  fc = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t  = u_time * max(u_driftSpeed, 0.0);
  float vy = fc.y / max(res.y, 1.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  P0 = c0; P1 = c1; P2 = c2; P3 = c3;

  // --- deep water + slow drifting colored atmosphere (brighter near surface) ---
  vec3 col = BG;
  vec3 atm = mix(P0, P2, 0.5 + 0.4 * sin(fc.x / res.x * 2.4 + t * 0.12));
  float colm = 0.5 + 0.5 * sin(fc.x / res.x * 7.0 + t * 0.1);   // god-ray banding
  col += atm * u_glow * (0.06 + 0.05 * colm) * (0.3 + 0.85 * vy);

  float bellR   = max(u_bellSize, 1.0) * pr;   // constant physical size
  float stripeN = max(u_stripes, 1.0);
  float tentN   = max(u_tentacles, 3.0);

  for (int i = 0; i < NJ; i++) {
    float fi = float(i);
    if (fi > u_count - 0.5) continue;

    float depth  = fract(fi * 0.2637 + 0.15);
    float phase  = fi * 2.3993;
    float laneX  = mix(0.14, 0.86, fract(fi * 0.4115 + 0.13));
    float laneY  = mix(0.40, 0.72, fract(fi * 0.5300 + 0.27));

    // per-jelly randomization so no two read the same: size, bell width, stripe
    // count, opening depth, tentacle density + length, and sway rate all vary.
    float r1 = hash21(vec2(fi, 1.70));
    float r2 = hash21(vec2(fi, 9.20));
    float r3 = hash21(vec2(fi, 4.50));
    float r4 = hash21(vec2(fi, 7.10));
    float rad     = bellR * mix(0.62, 1.12, depth) * mix(0.82, 1.20, r1);
    float bellW   = 1.04 + 0.32 * r2;                       // bell width
    float stripeJ = max(floor(stripeN + (r3 - 0.5) * 8.0), 5.0);
    float ohJ     = 0.12 + 0.10 * r4;                       // opening depth
    float tentJ   = max(floor(tentN + (r2 - 0.5) * 6.0), 4.0);
    float lenSc   = 0.80 + 0.45 * r3;                       // tentacle length scale
    float swayR   = 0.80 + 0.50 * r4;                       // sway rate
    // per-jelly lean (tilt) + slow rock so they aren't all dead level. Force a
    // definite direction + minimum magnitude so every jelly visibly leans.
    float tdir    = (r3 < 0.5) ? -1.0 : 1.0;
    float tilt    = tdir * (0.18 + 0.22 * r1) + sin(t * (0.18 + 0.12 * r2) + phase) * 0.10;
    float ca = cos(tilt), sa = sin(tilt);
    float tiltT = tilt * 0.15;                              // tentacles hang near-vertical (gravity)
    float caT = cos(tiltT), saT = sin(tiltT);

    // calm continuous motion: the jellies stay in frame, gently bobbing and
    // drifting sideways on the current (no pulse, no sink-through).
    float cx     = laneX * res.x + sin(t * (0.07 + 0.04 * r1) + phase) * rad * 0.7;
    float cy     = laneY * res.y + sin(t * (0.13 + 0.06 * r4) + phase * 1.3) * rad * 0.45;
    float vfade  = 1.0;

    // cheap cull: a column from bell-top to tentacle-tips. Must contain the tilt
    // lean of the long tentacles plus sway, or they get sliced as they animate.
    float reachX = rad * (bellW * 1.3 + 11.0 * abs(sin(tiltT)) + 0.8 * u_tentacleFlow + 0.5);
    if (abs(fc.x - cx) > reachX) continue;
    if (fc.y > cy + rad * 1.5) continue;
    if (fc.y < cy - rad * 10.0) continue;

    vec2 b0 = (fc - vec2(cx, cy)) / rad;    // bell radii; b.y up, apex at +1
    vec2 b  = mat2(ca, sa, -sa, ca) * b0;   // bell + arms: full lean
    vec2 bT = mat2(caT, saT, -saT, caT) * b0; // tentacles: droop back toward vertical

    // per-jelly colour
    float hbase = fract(fi * 0.9 + depth * 0.3);
    float hue   = 0.5 + (hbase - 0.5) * u_colorSpread + t * 0.01;
    vec3  tint  = paletteMix(hue);
    float blum  = dot(tint, vec3(0.299, 0.587, 0.114));
    tint = clamp(mix(vec3(blum), tint, u_saturation), 0.0, 1.0);
    float em = mix(0.85, 1.2, depth) * clamp(u_brightness, 0.0, 3.0) * vfade;

    vec3 jc = vec3(0.0);

    // ---- BELL: a 3D dome (radial-gradient oval) with a TWO-ARCH opening rim --
    float ny = b.y;                                   // 0 at margin .. 1 at apex
    float xn = b.x / bellW;                            // -1..1 across the dome
    float ev = sqrt(max(1.0 - xn * xn, 0.0));         // ellipse factor (1 centre, 0 sides)
    float hw = bellW * sqrt(max(1.0 - ny * ny, 0.0)); // dome half-width at height ny
    // dome cap: fills from the rim up to the apex
    float dome = smoothstep(0.05, -0.02, abs(b.x) - hw)
               * smoothstep(1.04, 0.97, ny)
               * smoothstep(-0.02, 0.07, ny);
    // oval radial gradient -> rounded 3D body (bright centre, limb-dark rim)
    vec2  ec = vec2(xn, (ny - 0.42) / 0.58);
    float body3d = smoothstep(1.05, 0.0, length(ec)); // 1 centre .. 0 edge
    // meridian stripes, subtle so the 3D gradient stays the dominant read
    float phi = atan(b.x, max(ny, 0.02));
    float stripe = 0.5 + 0.5 * sin(phi * stripeJ);
    vec3  domeCol = tint * (0.16 + 0.95 * body3d) * (0.78 + 0.34 * stripe);
    // glossy top highlight sells the dome curvature
    float hil = smoothstep(0.55, 0.0, length(vec2(xn * 1.2, (ny - 0.72) / 0.32)));
    jc += domeCol * dome * 0.82;
    jc += mix(tint, vec3(1.0), 0.5) * hil * dome * 0.45;          // top gloss

    // opening rim as TWO arches the SAME WIDTH as the dome: a bright wavy FRONT
    // lip (near, dips down) and a fainter BACK lip (far, arcs up) seen through the
    // translucent bell -> a 3D bowl with a dark mouth the arms emerge from.
    float oh   = ohJ;                                  // opening half-height (per jelly)
    float scal = 0.04 * sin(xn * PI * stripeJ * 0.5);  // scallop the front lip
    float inW  = smoothstep(1.02, 0.96, abs(xn));
    float frontRim = exp(-pow((ny - (-oh * ev + scal)) / 0.05, 2.0)) * inW;
    float backRim  = exp(-pow((ny - ( oh * ev)) / 0.055, 2.0)) * inW;
    jc += mix(tint, vec3(1.0), 0.32) * frontRim * 0.60;          // near lip (bright)
    jc += mix(tint, vec3(1.0), 0.18) * backRim  * 0.30;          // far lip (faint, behind)
    float rr = length(vec2(xn, ny));
    jc += tint * exp(-rr * rr * 1.3) * 0.10 * smoothstep(-0.3, 0.1, ny);   // halo

    // ---- ORAL ARMS: frilly ruffled pale column hanging below the bell --------
    float armY = -b.y;                                 // 0 at margin, grows downward
    if (armY > -0.05 && armY < 2.3) {
      float aw  = max(0.92 * smoothstep(2.3, 0.0, armY) * (0.55 + 0.45 * sin(armY * 4.0 - t * 0.5)), 0.05);
      float ruf = fbm(vec2(b.x * 3.5 + sin(armY * 5.0 + t * 0.4) * 0.3, armY * 3.2 - t * 0.25));
      float arm = smoothstep(aw, aw * 0.1, abs(b.x))
                * smoothstep(2.3, 0.1, armY) * smoothstep(-0.05, 0.30, armY);
      arm *= 0.35 + 1.0 * ruf;                         // lacy texture
      jc += mix(tint, vec3(1.0), 0.55) * arm * 0.42;
    }

    // ---- TENTACLES: long fine curtain streaming below, swaying continuously --
    float td = -bT.y;                                  // depth below margin (down +)
    if (td > 0.0 && td < 9.0) {
      float spacing = 2.0 * bellW / tentJ;
      // tentacles hang as a curtain DIRECTLY under the bell (no fan-out) so they
      // stay within the body; only a gentle sway moves them.
      float strand  = floor(bT.x / spacing + 0.5);
      float sx      = strand * spacing + (hash21(vec2(strand, fi)) - 0.5) * spacing * 0.25;
      // roots well INSIDE the bell so the curtain stays within the dome's width
      if (abs(sx) < bellW * 0.74) {
        float h    = hash21(vec2(strand + 7.0, fi));
        float len  = (5.0 + 3.5 * h) * lenSc;          // per-strand length (radii)
        float swayAmp = u_tentacleFlow * (0.04 + 0.02 * td); // bounded so tips stay under the dome
        float cxs  = sx
                   + sin(td * 0.9 - t * 1.1 * swayR + strand * 0.7 + phase) * swayAmp;
        float dxt  = bT.x - cxs;
        // cohesive ribbon: a soft-edged tapering shape, not a hairline
        float wTen = max(spacing * (0.34 + 0.16 * h) * smoothstep(len, 0.0, td), spacing * 0.08);
        float ribbon = smoothstep(wTen, wTen * 0.35, abs(dxt));
        float taper  = smoothstep(len, len * 0.15, td) * smoothstep(0.0, 0.22, td);
        // soft inner shading so each ribbon reads as a rounded translucent body
        float shade  = 0.6 + 0.4 * (1.0 - abs(dxt) / max(wTen, 1e-3));
        jc += tint * ribbon * taper * shade * 0.4;
      }
    }

    // fade the jelly out near the very bottom edge so trailing tentacles taper
    // away instead of being hard-cropped by the frame.
    float botFade = smoothstep(0.0, 0.12, fc.y / max(res.y, 1.0));
    col += jc * em * botFade;
  }

  // microbubbles drifting up through the water at different depths
  if (u_bubbles > 0.001) {
    vec3 bubCol = mix(mix(P0, P2, 0.5), vec3(1.0), 0.6);
    col += bubCol * bubbles(fc, res, pr, u_time) * u_bubbles * 0.5;
  }

  // vignette + soft tonemap
  vec2 uv = (fc - res * 0.5) / res;
  col *= mix(0.78, 1.0, 1.0 - smoothstep(0.45, 0.95, length(uv)));
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
