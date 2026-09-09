// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// woodgrain (Burnish) - a quartersawn oak board filling the frame, finished
// and lit. The board is cut from a real log model: growth rings are nested
// cylinders around a pith axis, and the board is the plane z = 0 laid almost
// along that axis. Where the plane runs parallel to the axis the rings cut it
// as tight parallel lines; where the axis wanders a little in depth the plane
// grazes a ring tangentially and the lines open into the nested arches of
// cathedral figure. Each ring is an asymmetric season: a wide pale earlywood
// with a band of open pores just after the winter line, then latewood that
// darkens gradually and stops hard. Quartersawn oak also shows its medullary
// rays: slanted lens-shaped flecks lying in the board face, paler and glassier
// than the grain around them, laid on a staggered grid with one fleck per
// cell and no neighbour gather. A lamp circles above the board: the grain
// carries a broad anisotropic sheen stretched along the fibres, and every
// fleck has its own tight highlight at its own slant, so flecks flash one
// after another as the light comes round. The board also creeps slowly along
// the grain, as if the eye were travelling down the plank.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rings;    // growth rings per frame-height unit      (default 14)
uniform float u_figure;   // depth of the axis wander = cathedral     (default 0.9)
uniform float u_fleck;    // ray fleck density and brightness         (default 1.0)
uniform float u_sheen;    // finish gloss                              (default 1.0)
uniform float u_drift;    // creep and lamp speed                      (default 0.3)

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + vec2(41.3, 17.9)));
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

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.14;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// a palette colour re-pitched to a fixed luminance L with saturation sat,
// so earlywood, latewood and fleck keep their tonal order in every theme
vec3 tone(vec3 c, float L, float sat) {
  float l = max(luma(c), 0.02);
  vec3  n = mix(vec3(1.0), c / l, sat);
  return clamp(n * L, 0.0, 1.0);
}

// ---- the log: where is the pith axis under board point (u, v)? Returns the
// ring radius at that point and how tangential the cut is there (0 = plane
// through the axis, quartersawn; 1 = plane grazing a ring, cathedral).
void logRadius(vec2 g, float figure, out float r, out float tang) {
  float u = g.x, v = g.y;
  // the pith runs through the lower third of the frame, wandering slightly
  float v0 = -0.38 + 0.10 * sin(u * 0.43 + 0.8) + 0.10 * (vnoise(vec2(u * 0.35, 3.0)) - 0.5);
  // and its depth below the board plane rises and falls along the length:
  // near zero the rings pass through as lines, deeper they open into arches
  float z0 = figure * (0.40 + 0.30 * sin(u * 0.52 + 4.0) + 0.30 * (vnoise(vec2(u * 0.33, 9.0)) - 0.5));
  float dv = v - v0;
  r = sqrt(dv * dv + z0 * z0);
  tang = clamp(abs(z0) / max(r, 1e-3), 0.0, 1.0);
}

// ---- one medullary ray fleck per staggered cell, lens shaped, slanted,
// with a rough edge. Returns coverage in x and the fleck slant angle in y.
vec2 fleck(vec2 g, float density) {
  vec2 cs = vec2(0.42, 0.075);
  vec2 q  = g / cs;
  q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 cell = floor(q);
  vec2 f    = fract(q) - 0.5;
  vec2 rnd  = hash22(cell + 11.0);
  vec2 rnd2 = hash22(cell + 29.0);
  float keep = step(1.0 - 0.55 * density, rnd2.x);
  float ang  = (rnd.x - 0.5) * 0.30;                   // slant, radians
  float len  = 0.10 + 0.20 * rnd.y;                     // frame units
  float hgt  = 0.014 + 0.022 * rnd2.y;
  vec2  c    = (rnd2 - 0.5) * vec2(0.30, 0.30);
  vec2  d    = (f - c) * cs;                            // back to frame units
  float ca = cos(ang), sa = sin(ang);
  vec2  e  = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  float m  = (e.x * e.x) / (len * len) + (e.y * e.y) / (hgt * hgt);
  m += 0.45 * (vnoise(g * vec2(14.0, 90.0) + cell) - 0.5);
  float cov = smoothstep(1.0, 0.45, m) * keep;
  return vec2(cov, ang);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float aspect = res.x / res.y;
  vec2  uv     = fc / res;
  float rings  = clamp(u_rings, 4.0, 40.0);
  float figure = clamp(u_figure, 0.0, 2.0);
  float flk    = clamp(u_fleck, 0.0, 2.0);
  float gloss  = clamp(u_sheen, 0.0, 2.5);
  float speed  = clamp(u_drift, 0.0, 3.0);
  float T      = u_time * speed;

  // frame coordinates, then rotate into the grain frame: u along the fibres,
  // v across them. The board runs a few degrees off horizontal.
  float scl = 2.0;
  vec2  p   = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * scl;
  float px  = scl / res.y;
  float ca = 0.9781, sa = 0.2079;                        // 12 degrees
  vec2  g  = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
  g.x += T * 0.06;                                       // creep along the plank

  // ---- rings: radius from the log model, jittered so ring widths vary and
  // the lines wave gently along the length
  float r, tang;
  logRadius(g, figure, r, tang);
  float rr = r * rings;
  // good years and lean years: nested slow sines cluster the rings into
  // tight runs and open stretches (width varies about 0.5x to 1.5x)
  rr += 1.2 * sin(rr * 0.31 + 1.0) + 0.5 * sin(rr * 0.83 + 4.0);
  rr += 0.45 * (vnoise(vec2(rr * 0.33, g.x * 0.45) + 7.0) - 0.5);
  rr += 0.08 * (vnoise(vec2(rr * 2.1, g.x * 3.0) + 31.0) - 0.5);
  float ri = floor(rr);
  float fr = fract(rr);
  float rj = hash21(vec2(ri, 3.0));

  // season profile: earlywood wide and pale, latewood darkening gradually
  // and ending hard at the next spring. Latewood share varies ring to ring.
  float lateStart = 0.74 + 0.14 * rj;
  float late = smoothstep(lateStart - 0.05, lateStart + 0.02, fr);
  late *= 0.75 + 0.35 * rj;
  // small latewood pores give the band a fine tooth
  late *= 0.86 + 0.28 * vnoise(vec2(g.x * 140.0, g.y * 420.0) + 88.0);
  // the winter line is never a clean rule: it thins and thickens along its
  // length and breaks where a vessel crosses it
  late *= 0.7 + 0.5 * vnoise(vec2(g.x * 9.0, ri * 1.7) + 61.0);
  // pixel width of a ring, for anti-aliasing the hard winter line
  float ringPx = 1.0 / max(rings * px, 1e-3);
  float aaW = clamp(1.5 / ringPx, 0.01, 0.4);
  late *= 1.0 - smoothstep(1.0 - aaW, 1.0, fr) * 0.5;

  // ring-porous earlywood: a band of open vessels right after the winter line
  vec2  pq = vec2(g.x * 34.0, g.y * 300.0);
  float poreN = vnoise(pq + 17.0) * 0.55 + vnoise(pq * vec2(2.4, 1.5) + 5.0) * 0.45;
  float pores = smoothstep(0.66, 0.76, poreN) * smoothstep(0.42, 0.06, fr) * 0.7;
  // fine fibre streaks along the grain, everywhere
  float fibre = vnoise(vec2(g.x * 4.0, g.y * 260.0) + 41.0) * 0.55
              + vnoise(vec2(g.x * 12.0, g.y * 560.0) + 3.0) * 0.30
              + vnoise(vec2(g.x * 1.6, g.y * 90.0) + 9.0) * 0.15 - 0.5;

  // ---- medullary rays: only where the cut is truly quartersawn. In the
  // tangential cathedral zones the rays are cut end-on and disappear.
  float quarter = 1.0 - smoothstep(0.25, 0.75, tang);
  vec2  fk = fleck(g, flk * (0.35 + 0.65 * quarter));
  float fcov = fk.x * min(flk, 1.0) * (0.25 + 0.75 * quarter);
  float fang = fk.y;
  // the fleck has its own glassy striations across it
  float fstr = vnoise(vec2(g.x * 90.0, g.y * 30.0) + 77.0) - 0.5;

  // ---- colour: earlywood, latewood and fleck as fixed luminances tinted by
  // the palette (pale pole for the wood, deep pole for the winter lines)
  vec3 earlyCol = tone(mix(c2, c0, 0.35), 0.50, 0.72);
  vec3 lateCol  = tone(mix(c3, c0, 0.25), 0.10, 0.7);
  vec3 fleckCol = tone(mix(c2, c1, 0.25), 0.60, 0.6);
  // slow colour mottle down the length, as the timber itself varies
  float mottle = fbm3(g * vec2(0.6, 1.4) + 23.0) - 0.5;
  earlyCol *= 1.0 + 0.22 * mottle;

  // the summer wood darkens a little as it approaches the winter line
  earlyCol *= 1.0 - 0.14 * smoothstep(0.15, lateStart, fr);
  vec3 albedo = mix(earlyCol, lateCol, late);
  albedo *= 1.0 - 0.45 * pores;
  albedo *= 1.0 + 0.26 * fibre;
  albedo = mix(albedo, fleckCol * (1.0 + 0.22 * fstr), fcov * 0.62);
  // ink-dark hairline at the winter line itself
  float winter = smoothstep(1.0 - aaW * 2.0, 1.0 - aaW * 0.5, fr) * (1.0 - fcov * 0.7);
  albedo *= 1.0 - 0.35 * winter;

  // ---- a finished board is flat: the grain shows through the sheen, not
  // through shaded steps (a bevelled winter line reads as slats, not wood)
  vec3  n = vec3(0.0, 0.0, 1.0);

  // ---- lighting: one lamp circling above the board on a 24 second loop
  float az = T * TAU / 24.0;
  vec3  lampPos = vec3(cos(az) * 1.3 * aspect * 0.55, sin(az) * 0.75, 1.5);
  vec3  toLamp = lampPos - vec3(p, 0.0);
  vec3  L = normalize(toLamp);
  float atten = 1.0 / (1.0 + 0.012 * dot(toLamp.xy, toLamp.xy));
  vec3  V = vec3(0.0, 0.0, 1.0);
  vec3  H = normalize(L + V);
  float diff = mix(1.0, clamp(dot(n, L), 0.0, 1.0) * atten, 0.35);

  // grain sheen: anisotropic, stretched along the fibres
  vec3  Tg = vec3(ca, sa, 0.0);                          // along the grain
  vec3  Bg = vec3(-sa, ca, 0.0);                         // across it
  float hT = dot(H, Tg), hB = dot(H, Bg), hN = max(H.z, 0.05);
  float wardG = exp(-(hT * hT / 1.4 + hB * hB / 0.025) / (hN * hN));
  // latewood is denser and glossier than the open earlywood
  float glossG = gloss * (0.35 + 0.45 * late) * (1.0 - 0.6 * pores);

  // fleck flash: its own tangent at its own slant, tighter and brighter
  float fca = cos(fang), fsa = sin(fang);
  vec3  Tf = vec3(ca * fca - sa * fsa, sa * fca + ca * fsa, 0.0);
  vec3  Bf = vec3(-Tf.y, Tf.x, 0.0);
  float fT = dot(H, Tf), fB = dot(H, Bf);
  float wardF = exp(-(fT * fT / 0.07 + fB * fB / 0.010) / (hN * hN));

  vec3 col = albedo * (0.78 + 0.32 * diff);
  vec3 sheenCol = mix(vec3(1.0), c2, 0.25);
  col += sheenCol * wardG * glossG * 0.42 * (1.0 - fcov);
  col += mix(sheenCol, c1, 0.2) * wardF * fcov * gloss * 0.30;
  // a whisper of the lamp on the fibre tops
  col += vec3(0.04) * max(fibre, 0.0) * diff * gloss;

  // no vignette here: the post pass adds a whisper, the board stays even

  gl_FragColor = vec4(col, 1.0);
}
