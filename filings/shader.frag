// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// filings (Shoal) - iron filings on a dark card, standing up along the field
// of three magnet poles that wander slowly under the card. The field is the
// 2D field of point poles with integer charges (+2, -1, -1), so its stream
// function is a sum of angles and fract(m * psi / 2pi) is continuous: that
// gives the chains. Real filings do not scatter evenly, they link nose to
// tail into threads that run pole to pole and crowd together where the
// field is strong, so needle placement is gated by both field strength and
// nearness to one of those stream lines. Each needle is a short steel rod
// drawn from a jittered grid (3x3 gather of segment SDFs, two grids: a coarse
// scatter across the whole card and a fine grid that only fills near the
// poles, where the filings pile up). Rods are lit as cylinders: a rod glints
// when its axis lies across the light, and sits dull when it points into it,
// so the sheen sweeps around the poles. The poles themselves glow through the
// card in two palette colours and tint the steel nearby; a pile shadow
// darkens the card under the dense crowds.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;    // how fast the poles wander           (default 0.25)
uniform float u_needle;   // needle length, css px                (default 11)
uniform float u_density;  // how many filings are on the card     (default 1.0)
uniform float u_ground;   // card tone: 0 dark slate, 1 white card (default 0.12)
uniform float u_glow;     // pole glow strength through the card  (default 0.8)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;
const float CHAINS = 18.0;   // stream lines per unit charge

vec3 c0, c1, c2, c3;
vec2 P0, P1, P2;             // pole positions, frame units
const float Q0 = 2.0, Q1 = -1.0, Q2 = -1.0;

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

// field of the three poles at frame point p, plus its magnitude
vec2 field(vec2 p) {
  vec2 d0 = p - P0, d1 = p - P1, d2 = p - P2;
  return Q0 * d0 / max(dot(d0, d0), 1e-4)
       + Q1 * d1 / max(dot(d1, d1), 1e-4)
       + Q2 * d2 / max(dot(d2, d2), 1e-4);
}

// stream function: sum of charge-weighted angles. With integer charges the
// 2pi branch jumps are integer multiples of 2pi, so any integer harmonic
// of psi is continuous everywhere except at the poles themselves.
float stream(vec2 p) {
  vec2 d0 = p - P0, d1 = p - P1, d2 = p - P2;
  return Q0 * atan(d0.y, d0.x) + Q1 * atan(d1.y, d1.x) + Q2 * atan(d2.y, d2.x);
}

// distance from point q to segment a-b
float segDist(vec2 q, vec2 a, vec2 b) {
  vec2 ab = b - a, aq = q - a;
  float h = clamp(dot(aq, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(aq - ab * h);
}

// One needle grid. fc is the fragment in css px, cell the grid pitch in css
// px, len the needle length in css px, toFrame converts css px to frame units.
// dens0 is the density floor everywhere, densK scales density with field
// strength. Returns coverage in .x, cylinder shade in .y, glow tint in .z.
vec3 needles(vec2 fc, float cell, float len, float wid, vec2 toFrame, vec2 org,
             float dens0, float densK, float snapAmt, float seed, float t, vec2 lightDir) {
  vec2 g  = fc / cell;
  vec2 gi = floor(g);
  float cov = 0.0, shade = 0.0, tint = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = gi + vec2(float(x), float(y));
      vec2 h  = hash22(id * 1.13 + seed);
      float h3 = hash21(id * 0.71 + seed * 3.1);
      float h4 = hash21(id * 2.31 + seed * 7.7);
      // needle centre in css px, jittered inside its slot
      vec2 ctr = (id + 0.5 + (h - 0.5) * 0.9) * cell;
      vec2 pf  = org + ctr * toFrame;
      vec2 B   = field(pf);
      float mag = length(B);
      // chains: the stream function counts lines, and since |grad psi| = |B|
      // the across-field distance to the nearest line is the fractional part
      // over the field strength. Slide the needle onto that line (capped to
      // its own slot) so neighbours link nose to tail into threads.
      float ps    = stream(pf) * CHAINS / TAU;
      float fracL = fract(ps + 0.5) - 0.5;
      vec2  nrm0  = vec2(-B.y, B.x) / max(mag, 1e-5);
      float snapF = -fracL * (TAU / CHAINS) / max(mag, 1e-3);   // frame units
      float snapPx = clamp(snapF / toFrame.y, -cell * 0.7, cell * 0.7);
      float lineNear = 1.0 - smoothstep(0.0, cell * 0.9, abs(snapF / toFrame.y));
      ctr += nrm0 * snapPx * snapAmt;
      pf   = org + ctr * toFrame;
      B    = field(pf);
      mag  = length(B);
      vec2 dir = B / max(mag, 1e-5);
      // field strength: compressive so it only saturates right at a pole
      float sm  = mag * densK;
      float str = sm / (1.0 + sm);
      // a slot fills if it sits on a line or the field is strong enough to
      // crowd it anyway; the open card between lines stays mostly bare
      float prob = clamp(dens0 * (0.10 + 0.90 * lineNear) + smoothstep(0.15, 0.75, str) * 1.5, 0.0, 1.0);
      if (h4 > prob) continue;
      // loose filings wobble off the line a little where the field is weak,
      // and tremble as the poles move
      float dev = (h3 - 0.5) * 0.9 * (1.0 - str) + 0.05 * sin(t * 3.0 + h3 * 20.0) * (1.0 - str * 0.7);
      float ca = cos(dev), sa = sin(dev);
      vec2 nd = vec2(ca * dir.x - sa * dir.y, sa * dir.x + ca * dir.y);
      float l = len * (0.8 + 0.7 * h.x);
      vec2 a = ctr - nd * l * 0.5, b = ctr + nd * l * 0.5;
      float d = segDist(fc, a, b);
      float w = wid * (0.7 + 0.6 * h.y);
      float c = 1.0 - smoothstep(w - 0.7, w + 0.7, d);
      if (c <= 0.0) continue;
      // cylinder shading: across-axis position from the segment normal
      vec2 nrm = vec2(-nd.y, nd.x);
      float across = clamp(dot(fc - ctr, nrm) / max(w, 0.5), -1.0, 1.0);
      float nz = sqrt(max(1.0 - across * across, 0.0));
      // glint: a rod lights when its axis lies across the light direction
      float axisLit = abs(dot(nrm, lightDir));
      float cyl = 0.12 + 0.50 * nz * (0.25 + 0.75 * axisLit)
                + 1.1 * axisLit * axisLit * smoothstep(0.50, 0.95, nz * (0.6 + 0.4 * across * lightDir.x));
      cyl *= 0.75 + 0.5 * h3;
      // front-most needle wins where they cross: take the strongest coverage
      float take = step(cov, c);
      shade = mix(shade, cyl, take * c);
      tint  = mix(tint, str, take * c);
      cov = max(cov, c);
    }
  }
  return vec3(cov, shade, tint);
}

const vec3 lum3 = vec3(0.299, 0.587, 0.114);

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  fc     = gl_FragCoord.xy / pr;             // css px
  vec2  cssRes = res / pr;
  // frame units: height = 2, centred, x scaled by aspect
  vec2  toFrame = vec2(2.0 / cssRes.y);
  vec2  org     = vec2(-aspect, -1.0);
  vec2  p       = org + fc * toFrame;
  float t       = u_time * clamp(u_speed, 0.0, 2.0);
  float ground  = clamp(u_ground, 0.0, 1.0);
  float glow    = clamp(u_glow, 0.0, 2.0);
  float dens    = clamp(u_density, 0.0, 2.0);
  float len     = max(u_needle, 3.0);

  // ---- the poles wander on slow incommensurate orbits under the card
  P0 = vec2(0.60 * aspect * sin(t * 0.31 + 0.4), 0.50 * cos(t * 0.23 + 1.9));
  P1 = vec2(0.66 * aspect * cos(t * 0.19 + 2.3), 0.55 * sin(t * 0.29 + 4.1));
  P2 = vec2(0.62 * aspect * sin(t * 0.26 + 3.6), 0.52 * cos(t * 0.17 + 0.2));
  // keep the two south poles from sitting on the north one
  P1 += normalize(P1 - P0 + vec2(1e-3, 0.0)) * 0.35 * smoothstep(0.7, 0.0, length(P1 - P0));
  P2 += normalize(P2 - P0 + vec2(0.0, 1e-3)) * 0.35 * smoothstep(0.7, 0.0, length(P2 - P0));
  // and the two south poles off each other
  vec2 ss = normalize(P2 - P1 + vec2(1e-3, 1e-3)) * 0.22 * smoothstep(0.6, 0.0, length(P2 - P1));
  P1 -= ss; P2 += ss;

  // optional pointer: a fourth weak pole under the finger, zero at rest
  vec2 m = org + (u_mouse / pr) * toFrame;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  vec2  B   = field(p);
  float mag = length(B);
  float sm  = mag * 0.08;
  float str = sm / (1.0 + sm);
  float ps  = stream(p) * CHAINS / TAU;
  float chainHere = 0.5 + 0.5 * cos(ps * TAU);

  // ---- the card: dark slate or white stock, tinted by the deepest pole
  vec3 slate  = mix(vec3(0.075, 0.078, 0.085), mix(vec3(dot(c3, lum3)), c3, 0.45) * 0.22, 0.30);
  vec3 stock  = mix(vec3(0.90, 0.89, 0.86), c2, 0.10);
  vec3 card   = mix(slate, stock, ground);
  // paper tooth and a soft cloud in the stock
  float tooth = vnoise(fc * 0.9 + 7.0) - 0.5;
  float cloud = vnoise(fc * 0.02 + 3.0) - 0.5;
  card *= 1.0 + tooth * 0.06 + cloud * 0.10;
  // raking light across the card from the upper left: the same lamp that
  // glints the needles, so the card falls off toward the lower right
  vec2  uvc  = gl_FragCoord.xy / max(res, vec2(1.0));
  float rake = dot(uvc - 0.5, vec2(-0.82, 0.57));
  card *= 0.50 + 1.05 * smoothstep(-0.8, 0.8, rake) + 0.10 * (1.0 - ground);
  // faint ghost of the stream lines, as if the card remembers the field
  float ghost = smoothstep(0.55, 1.0, chainHere) * str * 0.5;
  card = mix(card, mix(card, vec3(dot(card, lum3)) + 0.06, 0.5), ghost * (1.0 - ground) * 0.6);

  // ---- pole glow through the card: north warm in c3, south cool in c0
  float r0 = length(p - P0), r1 = length(p - P1), r2 = length(p - P2);
  float g0 = exp(-r0 * r0 * 11.0) + 0.18 * exp(-r0 * 2.8);
  float g1 = exp(-r1 * r1 * 14.0) + 0.14 * exp(-r1 * 3.2);
  float g2 = exp(-r2 * r2 * 14.0) + 0.14 * exp(-r2 * 3.2);
  vec3 poleN = mix(c3, c1, 0.25);
  vec3 poleS = mix(c2, c0, 0.25);
  // normalise the two glows so dark palettes still light the card
  poleN *= clamp(0.55 / max(dot(poleN, lum3), 0.05), 1.0, 3.0);
  poleS *= clamp(0.55 / max(dot(poleS, lum3), 0.05), 1.0, 3.0);
  vec3 glowCol = poleN * g0 * 1.1 + poleS * (g1 + g2) * 0.9;
  float glowSum = g0 + g1 + g2;
  // on the dark card the glow adds; on white stock it stains
  vec3 col = card + glowCol * glow * 0.75 * (1.0 - ground * 0.6);
  col = mix(col, col * mix(vec3(1.0), glowCol / max(glowSum, 1e-3), 0.5), ground * glow * clamp(glowSum, 0.0, 1.0) * 0.5);

  // ---- pile shadow: the crowd of filings near a pole shades the card
  float pile = smoothstep(0.30, 0.85, str);
  col *= 1.0 - pile * (0.28 + 0.25 * ground);

  // ---- the needles: light comes from the upper left of the card
  vec2 lightDir = normalize(vec2(-0.82, 0.57));
  float cellA = len * 1.0;
  vec3 nA = needles(fc, cellA, len, 0.75 + 0.15 * len / 11.0, toFrame, org,
                    0.95 * dens, 0.08 * dens, 0.85, 1.0, t, lightDir);
  // the pile grid: small needles, only where the field is strong
  float cellB = len * 0.62;
  vec3 nB = needles(fc, cellB, len * 0.6, 0.6 + 0.1 * len / 11.0, toFrame, org,
                    0.0, 0.17 * dens, 0.5, 2.0, t, lightDir);
  // pointer flourish: needles near the finger brighten as if a probe stirred them
  float stir = mAmt * exp(-dot(p - m, p - m) * 6.0);

  // ---- steel: neutral grey, picking up the pole colour where it is close
  vec3 steelDark = mix(vec3(0.10, 0.10, 0.11), vec3(0.03), ground);
  vec3 steelLit  = mix(vec3(0.80, 0.81, 0.84), vec3(0.40, 0.41, 0.43), ground);
  vec3 localGlow = glowCol / max(glowSum, 1e-3);

  // fine pile needles first (they sit under the coarse ones)
  vec3 rodB = mix(steelDark, steelLit, clamp(nB.y, 0.0, 1.4));
  rodB = mix(rodB, rodB * (0.6 + 0.9 * localGlow), (0.35 + 0.35 * glow) * nB.z);
  rodB += localGlow * 0.10 * glow * nB.z * nB.y;
  col = mix(col, rodB, nB.x * 0.9);

  vec3 rodA = mix(steelDark, steelLit, clamp(nA.y, 0.0, 1.4));
  rodA = mix(rodA, rodA * (0.6 + 0.9 * localGlow), (0.35 + 0.35 * glow) * nA.z);
  rodA += localGlow * 0.12 * glow * nA.z * nA.y;
  rodA += vec3(0.35) * stir;
  // a rod casts a thin contact shadow on the card just below it
  col *= 1.0 - 0.25 * nA.x * (1.0 - nA.x) * (0.5 + ground);
  col = mix(col, rodA, nA.x);

  // ---- seat the card: soft vignette
  vec2 vq = gl_FragCoord.xy / max(res, vec2(1.0)) - 0.5;
  col *= 1.0 - 0.18 * smoothstep(0.35, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
