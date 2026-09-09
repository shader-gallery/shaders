// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// chalk (Trace) - a slate chalkboard mid-lesson. The board is the ground: a
// dark slate with cloudy mottle, a fine tooth of pits at css-pixel scale, old
// wash streaks and a soft window light from the upper left. Three working
// areas across the board each carry a set of hand-drawn geometric marks, a
// circle with a radius or a square, a triangle, a hatch bundle, a spiral or
// wave and a couple of small crosses, all
// drawn stroke by stroke with a wobbling hand, uneven pressure and a dusty
// broken chalk edge where the chalk only catches the high points of the
// slate. Each area runs its own cycle: the marks are drawn, held, then wiped
// by an eraser pass whose front travels across them, and the wipe leaves the
// classic eraser ghost, a streaky smear of dust and the pale shadow of the
// old marks, which fades as the next set is chalked up in a new place.
// Chalk is white, plus pastel sticks tinted by the palette; the slate itself
// takes a whisper of the deepest palette colour so the board re-themes.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;    // pace of the draw / wipe cycle          (default 1.0)
uniform float u_scale;    // size of the drawn marks, frame-rel     (default 1.0)
uniform float u_stroke;   // chalk stroke width                     (default 1.0)
uniform float u_dust;     // eraser ghost and dust strength         (default 1.0)
uniform float u_colour;   // coloured chalk mix, 0 is all white     (default 0.8)

const float TAU = 6.28318530718;
const float PERIOD = 24.0;   // seconds per draw / hold / wipe cycle at speed 1

vec3 c0, c1, c2, c3;

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

// a pastel chalk stick in colour c: desaturate a little, then lift toward white
vec3 chalkOf(vec3 c) {
  vec3 pastel = mix(vec3(luma(c)), c, 0.85);
  pastel = mix(pastel, vec3(1.0), 0.35);
  return clamp(pastel * 1.05, 0.0, 1.0);
}

// distance to a segment a-b, and the along-parameter 0..1 written to u
float sdSeg(vec2 p, vec2 a, vec2 b, out float u) {
  vec2 ab = b - a, ap = p - a;
  u = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(ap - ab * u);
}

// ---- the chalk stroke. d is the distance to the ideal path in frame units,
// w the stroke half-width, grain the shared slate-tooth field 0..1, press the
// hand pressure along the stroke. Chalk sits on the high points of the slate:
// dense at the core, ragged at the edge, a few stray specks just outside.
float chalk(float d, float w, float grain, float press) {
  float core = 1.0 - smoothstep(w * 0.25, w * 1.15, d);
  return smoothstep(0.62, 0.80, grain * 0.55 + 0.05 + core * (0.25 + 0.42 * press));
}

// hand pressure along a stroke: heavier at the start, lifts at the end,
// with a slow rock in between
float pressure(float u, float seed) {
  float rock = 0.5 + 0.5 * sin(u * 11.0 + seed) * sin(u * 4.7 + seed * 2.1);
  float taper = smoothstep(1.0, 0.86, u) * smoothstep(0.0, 0.04, u);
  return (0.55 + 0.45 * rock) * (0.35 + 0.65 * taper);
}

// draw-progress mask: the part of the stroke already laid down, with a soft
// leading edge so the chalk tip is never a hard cut
float drawn(float u, float prog) {
  return smoothstep(prog + 0.015, prog - 0.015, u);
}

// ---- one working area. p is the hand-wobbled frame coordinate, gc the area
// centre, seed selects the set, prog 0..1 is how far the drawing has got.
// Composites the chalk marks into col and accumulates their smear halo into
// ghost (used for the eraser ghost of the same set).
void marks(vec2 p, vec2 gc, float seed, float prog, float w, float grain,
           float amount, inout vec3 col, inout float ghost) {
  float u, d;
  float haloW = w * 5.0;

  // colour picks for the four marks: white plus palette pastels
  vec3 white = vec3(0.93, 0.92, 0.88);
  float cmix = clamp(u_colour, 0.0, 1.0);
  float pick = hash21(vec2(seed, 3.3));
  vec3 tintA = pick < 0.5 ? c0 : c2;
  vec3 tintB = pick < 0.5 ? c1 : c3;
  vec3 chalkA = mix(white, chalkOf(tintA), cmix);
  vec3 chalkB = mix(white, chalkOf(tintB), cmix);

  // -- mark 0: a circle with one radius, drawn counter-clockwise from a0,
  // or (some sets) a square drawn side by side, in white
  float p0 = clamp(prog * 4.0, 0.0, 1.0);
  {
    vec2 h = vec2(hash21(vec2(seed, 1.1)), hash21(vec2(seed, 1.7)));
    vec2 c = gc + (h - 0.5) * vec2(0.6, 1.0);
    float r = 0.20 + 0.26 * hash21(vec2(seed, 2.3));
    float a0 = h.x * TAU;
    float cov = 0.0, gh = 0.0;
    if (hash21(vec2(seed, 2.9)) < 0.62) {
      vec2 q = p - c;
      float ang = fract((atan(q.y, q.x) - a0) / TAU);
      d = abs(length(q) - r);
      // the circle takes 70% of this mark, the radius the rest
      float pc = clamp(p0 / 0.7, 0.0, 1.0);
      cov = chalk(d, w, grain, pressure(ang, seed)) * drawn(ang, pc);
      gh = (1.0 - smoothstep(0.0, haloW, d)) * drawn(ang, pc);
      float pr = clamp((p0 - 0.7) / 0.3, 0.0, 1.0);
      float ar = a0 + 0.9;
      vec2 tip = c + r * vec2(cos(ar), sin(ar));
      d = sdSeg(p, c, tip, u);
      cov = max(cov, chalk(d, w * 0.9, grain, pressure(u, seed + 1.0)) * drawn(u, pr));
      gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, pr));
    } else {
      // a square, slightly turned, four sides in order with a diagonal
      float ta = (h.y - 0.5) * 0.5;
      vec2 ex = vec2(cos(ta), sin(ta)) * r * 0.9;
      vec2 ey = vec2(-ex.y, ex.x);
      vec2 v0 = c - ex - ey, v1 = c + ex - ey, v2 = c + ex + ey, v3 = c - ex + ey;
      for (int i = 0; i < 5; i++) {
        float k = float(i);
        vec2 a = v0, b = v1;
        if (i == 1) { a = v1; b = v2; }
        if (i == 2) { a = v2; b = v3; }
        if (i == 3) { a = v3; b = v0; }
        if (i == 4) { a = v0; b = v2; }
        d = sdSeg(p, a, b, u);
        float pk = clamp(p0 * 5.0 - k, 0.0, 1.0);
        cov = max(cov, chalk(d, w, grain, pressure(u, seed + 1.0 + k)) * drawn(u, pk));
        gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, pk));
      }
    }
    col = mix(col, white, cov * amount);
    ghost = max(ghost, gh);
  }

  // -- mark 1: a triangle, three sides in order, in the first pastel
  float p1 = clamp(prog * 4.0 - 1.0, 0.0, 1.0);
  {
    vec2 h = vec2(hash21(vec2(seed, 4.1)), hash21(vec2(seed, 4.7)));
    vec2 c = gc + (h - 0.5) * vec2(0.75, 1.1) + vec2(0.0, -0.05);
    float R = 0.22 + 0.16 * hash21(vec2(seed, 5.3));
    float a0 = h.y * TAU;
    vec2 v0 = c + R * vec2(cos(a0), sin(a0));
    vec2 v1 = c + R * 1.15 * vec2(cos(a0 + 2.0), sin(a0 + 2.0));
    vec2 v2 = c + R * 0.9  * vec2(cos(a0 + 4.3), sin(a0 + 4.3));
    float cov = 0.0, gh = 0.0;
    d = sdSeg(p, v0, v1, u);
    cov = max(cov, chalk(d, w, grain, pressure(u, seed + 2.0)) * drawn(u, clamp(p1 * 3.0, 0.0, 1.0)));
    gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, clamp(p1 * 3.0, 0.0, 1.0)));
    d = sdSeg(p, v1, v2, u);
    cov = max(cov, chalk(d, w, grain, pressure(u, seed + 3.0)) * drawn(u, clamp(p1 * 3.0 - 1.0, 0.0, 1.0)));
    gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, clamp(p1 * 3.0 - 1.0, 0.0, 1.0)));
    d = sdSeg(p, v2, v0, u);
    cov = max(cov, chalk(d, w, grain, pressure(u, seed + 4.0)) * drawn(u, clamp(p1 * 3.0 - 2.0, 0.0, 1.0)));
    gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, clamp(p1 * 3.0 - 2.0, 0.0, 1.0)));
    col = mix(col, chalkA, cov * amount);
    ghost = max(ghost, gh);
  }

  // -- mark 2: a hatch bundle of four parallel strokes, white
  float p2 = clamp(prog * 4.0 - 2.0, 0.0, 1.0);
  {
    vec2 h = vec2(hash21(vec2(seed, 6.1)), hash21(vec2(seed, 6.7)));
    vec2 c = gc + (h - 0.5) * vec2(0.85, 1.2);
    float ang = h.x * 3.1 + 0.4;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 perp = vec2(-dir.y, dir.x);
    float L = 0.18 + 0.12 * h.y;
    float sp = 0.055;
    float cov = 0.0, gh = 0.0;
    for (int i = 0; i < 4; i++) {
      float k = float(i);
      vec2 o = c + perp * (k - 1.5) * sp;
      // every other stroke is pulled the other way, as a hand does
      float flip = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
      vec2 a = o - dir * L * flip * (0.95 + 0.1 * hash21(vec2(seed, 7.0 + k)));
      vec2 b = o + dir * L * flip * (0.95 + 0.1 * hash21(vec2(seed, 8.0 + k)));
      d = sdSeg(p, a, b, u);
      float pk = clamp(p2 * 4.0 - k, 0.0, 1.0);
      cov = max(cov, chalk(d, w * 0.85, grain, pressure(u, seed + 5.0 + k)) * drawn(u, pk));
      gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, pk));
    }
    col = mix(col, white, cov * amount);
    ghost = max(ghost, gh);
  }

  // -- mark 3: a spiral or a wave, in the second pastel
  float p3 = clamp(prog * 4.0 - 3.0, 0.0, 1.0);
  {
    vec2 h = vec2(hash21(vec2(seed, 9.1)), hash21(vec2(seed, 9.7)));
    vec2 c = gc + (h - 0.5) * vec2(0.8, 1.1) + vec2(0.0, 0.05);
    float cov, gh;
    if (hash21(vec2(seed, 10.3)) < 0.5) {
      // archimedean spiral, 2.5 turns, wound outward from the centre
      float b = 0.040 + 0.016 * h.x;
      float turns = 2.2;
      vec2 q = p - c;
      float r = length(q);
      float th = atan(q.y, q.x);
      // the nearest winding to this point
      float k = floor((r / b - th) / TAU + 0.5);
      float thk = th + k * TAU;
      float rk = b * thk;
      float uu = thk / (turns * TAU);
      float inside = step(0.0, thk) * step(thk, turns * TAU);
      d = mix(999.0, abs(r - rk), inside);
      // the winding just outside, for points between two arms
      float th2 = thk + TAU;
      float in2 = step(0.0, th2) * step(th2, turns * TAU);
      float d2 = mix(999.0, abs(r - b * th2), in2);
      float u2 = th2 / (turns * TAU);
      if (d2 < d) { d = d2; uu = u2; }
      cov = chalk(d, w, grain, pressure(uu, seed + 9.0)) * drawn(uu, p3);
      gh = (1.0 - smoothstep(0.0, haloW, d)) * drawn(uu, p3);
    } else {
      // a wave: y = A sin(kx) across a span, distance corrected by slope
      float ang = (h.x - 0.5) * 0.8;
      vec2 q = rot(-ang) * (p - c);
      float A = 0.06 + 0.04 * h.y;
      float kx = 14.0 + 6.0 * h.x;
      float span = 0.28 + 0.1 * h.y;
      float s = q.x;
      float sl = A * kx * cos(kx * s);
      d = abs(q.y - A * sin(kx * s)) / sqrt(1.0 + sl * sl);
      d += max(abs(s) - span, 0.0) * 4.0;
      float uu = clamp((s + span) / (2.0 * span), 0.0, 1.0);
      cov = chalk(d, w, grain, pressure(uu, seed + 9.0)) * drawn(uu, p3);
      gh = (1.0 - smoothstep(0.0, haloW, d)) * drawn(uu, p3);
    }
    col = mix(col, chalkB, cov * amount);
    ghost = max(ghost, gh);
  }

  // -- mark 4: two small crosses, the quick annotation ticks, white, laid
  // down with the last mark
  {
    float cov = 0.0, gh = 0.0;
    for (int i = 0; i < 2; i++) {
      float k = float(i);
      vec2 h = vec2(hash21(vec2(seed, 12.1 + k)), hash21(vec2(seed, 12.7 + k)));
      vec2 c = gc + (h - 0.5) * vec2(1.1, 1.3);
      float sz = 0.035 + 0.02 * h.x;
      float ta = h.y * 1.5;
      vec2 ex = vec2(cos(ta), sin(ta)) * sz;
      vec2 ey = vec2(-ex.y, ex.x);
      float pk = clamp(p3 * 2.0 - k, 0.0, 1.0);
      d = sdSeg(p, c - ex - ey, c + ex + ey, u);
      cov = max(cov, chalk(d, w * 0.8, grain, pressure(u, seed + 11.0 + k)) * drawn(u, clamp(pk * 2.0, 0.0, 1.0)));
      gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, clamp(pk * 2.0, 0.0, 1.0)));
      d = sdSeg(p, c - ex + ey, c + ex - ey, u);
      cov = max(cov, chalk(d, w * 0.8, grain, pressure(u, seed + 13.0 + k)) * drawn(u, clamp(pk * 2.0 - 1.0, 0.0, 1.0)));
      gh = max(gh, (1.0 - smoothstep(0.0, haloW, d)) * drawn(u, clamp(pk * 2.0 - 1.0, 0.0, 1.0)));
    }
    col = mix(col, white, cov * amount);
    ghost = max(ghost, gh);
  }
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  vec2  uv     = fc / res;
  float aspect = res.x / res.y;
  float t      = u_time * clamp(u_speed, 0.0, 4.0);
  float scl    = 1.0 / max(u_scale, 0.3);
  float dustA  = clamp(u_dust, 0.0, 2.0);

  // css-pixel coords for surface properties; frame coords two units tall
  vec2 q = fc / pr;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0 * scl;
  float w = 0.011 * max(u_stroke, 0.2) * scl;

  // ---- the slate. Deep grey-green with a whisper of the darkest palette pole,
  // cloudy mottle from the stone, fine tooth pits, faint old wash streaks and
  // a window light falling from the upper left.
  float lum0 = luma(c0), lum1 = luma(c1), lum2 = luma(c2), lum3 = luma(c3);
  vec3 deep = c0; float dl = lum0;
  if (lum1 < dl) { deep = c1; dl = lum1; }
  if (lum2 < dl) { deep = c2; dl = lum2; }
  if (lum3 < dl) { deep = c3; dl = lum3; }
  vec3 tint  = mix(vec3(luma(deep)), deep, 0.45);
  tint = tint / max(luma(tint), 0.05) * 0.12;
  vec3 slate = mix(vec3(0.105, 0.128, 0.118), tint, 0.40);

  float mottle = fbm(q * 0.009 + 3.0) - 0.5;
  float cloud  = fbm(p * 1.3 + 11.0) - 0.5;
  float tooth  = vnoise(q * 0.55 + 7.0) - 0.5;
  // old wash streaks: long horizontal smears from past cleanings
  float wash   = vnoise(vec2(q.x * 0.004, q.y * 0.06) + 5.0);
  wash = smoothstep(0.45, 0.85, wash) * (0.5 + 0.5 * vnoise(vec2(q.x * 0.02, q.y * 0.3) + 9.0));
  float light  = 1.0 + 0.28 * (0.6 - uv.x * 0.5 - (1.0 - uv.y) * 0.45);
  slate *= light * (1.0 + mottle * 0.5 + cloud * 0.25 + tooth * 0.22);
  float residue = smoothstep(0.35, 0.75, fbm(q * 0.006 + vec2(21.0, 8.0)));
  slate += vec3(0.85, 0.85, 0.82) * (wash * 0.035 + residue * 0.030) * dustA;

  // ---- shared slate-tooth field: where the chalk catches, at css-pixel scale
  float grain = 0.36 * vnoise(q * 0.22 + 1.0) + 0.36 * vnoise(q * 0.75 + 2.0)
              + 0.28 * vnoise(q * 2.1 + 3.0);

  // ---- the hand: a slow low-frequency wobble so no path is ruler-straight
  vec2 wob = vec2(vnoise(p * 2.6 + 4.0), vnoise(p * 2.6 + 17.0)) - 0.5;
  wob += (vec2(vnoise(p * 9.0 + 6.0), vnoise(p * 9.0 + 23.0)) - 0.5) * 0.35;

  vec3 col = slate;
  vec3 dustCol = vec3(0.88, 0.88, 0.85);
  float dust = 0.0;

  // ---- three working areas across the board, each on its own cycle
  for (int g = 0; g < 3; g++) {
    float k = float(g);
    float cyc = t / PERIOD + k * 0.3333 + 0.1;
    float ph  = fract(cyc);
    float n   = floor(cyc);
    float seedNow  = n * 17.3 + k * 5.1 + 2.7;
    float seedPrev = (n - 1.0) * 17.3 + k * 5.1 + 2.7;

    // area centre: thirds across, a little up or down per set
    float gx = (k - 1.0) * aspect * 0.64 * scl;
    // areas alternate high and low across the board so the whole height is used
    float gy = (mod(k, 2.0) - 0.5) * 0.36 * scl;
    vec2 gcNow  = vec2(gx, gy + (hash21(vec2(seedNow, 0.3)) - 0.5) * 0.3 * scl);
    vec2 gcPrev = vec2(gx, -gy + (hash21(vec2(seedPrev, 0.3)) - 0.5) * 0.3 * scl);

    // life of a set: drawn 0..0.36, held, wiped 0.78..0.9, then ghost only
    float prog  = clamp(ph / 0.36, 0.0, 1.0);
    float eph   = clamp((ph - 0.78) / 0.12, 0.0, 1.0);

    // the eraser pass for this area: a front travelling along dir, its edge
    // bowed like a hand sweep. Beyond the pass the marks are gone.
    float eang = (hash21(vec2(seedNow, 0.9)) - 0.5) * 0.7;
    vec2 dir = vec2(cos(eang), sin(eang));
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 rel = p - gcNow;
    float s = dot(rel, dir) + 0.10 * sin(dot(rel, perp) * 4.0 + seedNow);
    float R = 1.05 * scl;
    float front = mix(-R - 0.15, R + 0.15, eph);
    float erased = smoothstep(front + 0.04, front - 0.04, s) * step(0.001, eph);

    // per-area hand wobble: the shared field turned so areas do not match
    vec2 wk = rot(k * 2.1) * wob;

    // current set: chalk where not yet wiped, smear where it has been
    vec3 colNow = col;
    float ghNow = 0.0;
    marks(p + wk * 0.022 * scl, gcNow, seedNow, prog, w, grain, 1.0, colNow, ghNow);
    col = mix(col, colNow, 1.0 - erased);

    // the eraser streaks: dust dragged along the pass direction
    float streak = vnoise(vec2(dot(rel, dir) * 2.5, dot(rel, perp) * 38.0) + seedNow);
    streak = 0.45 + 0.9 * streak;
    // ghost of the current set inside the wiped zone, and the broad swath
    // of dust the felt leaves behind it
    float swath = 1.0 - smoothstep(R * 0.55, R * 1.05, length(rel * vec2(1.0, 0.72)));
    dust = max(dust, erased * (ghNow * 0.42 + swath * 0.10) * streak);

    // previous set: fully wiped, fading through the first part of this cycle
    float fade = 1.0 - smoothstep(0.05, 0.75, ph);
    vec3 dummy = col;
    float ghPrev = 0.0;
    marks(p + wk * 0.022 * scl, gcPrev, seedPrev, 1.0, w, grain, 0.0, dummy, ghPrev);
    vec2 relP = p - gcPrev;
    float swathP = 1.0 - smoothstep(R * 0.55, R * 1.05, length(relP * vec2(1.0, 0.72)));
    float streakP = 0.45 + 0.9 * vnoise(vec2(dot(relP, dir) * 2.5, dot(relP, perp) * 38.0) + seedPrev);
    float dPrev = fade * (ghPrev * 0.34 + swathP * 0.09) * streakP;
    // the ghost is laid under the fresh chalk, so blend it before the marks
    dust = max(dust, dPrev);
  }

  // dust goes under the chalk: lighten the slate, then re-lay the marks on top
  // (col already carries the marks; lift only where dust exceeds the chalk)
  float dustAmt = clamp(dust * dustA, 0.0, 0.6);
  // chalk tooth in the dust too: the smear sits in the pits as well
  dustAmt *= 0.75 + 0.5 * grain;
  vec3 lifted = mix(slate, dustCol, dustAmt);
  // where the chalk is brighter than the dust keep the chalk; where the slate
  // shows through the marks, show the dust
  col = max(col, lifted);

  // a faint airborne haze of chalk dust near the bottom, where it settles
  col += vec3(0.02, 0.02, 0.018) * dustA * (1.0 - uv.y) * (0.6 + 0.4 * vnoise(q * 0.05 + 2.0));

  gl_FragColor = vec4(col, 1.0);
}
