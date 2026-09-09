// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// hyperspeed (Abyss) - the jump to lightspeed, seen from the cockpit. Stars
// pour out of a dim glowing core and stretch into motion-blurred streaks that
// lengthen as they reach the frame edges. The trick is the coordinate system:
// the star field is a lattice in (angle, log radius) space that scrolls
// outward in log radius at constant speed. A trail of fixed length in log
// space is a screen streak whose length is proportional to radius, so stars
// are short sparks near the core and long blades at the rim, exactly the
// perspective of moving down a tunnel of stars. Three lattices at different
// angular density, speed and width give parallax: the near layer is fast,
// fat and bright, the far layer is a dense fine drizzle. Every streak has a
// hot white head that trails off into a palette tint, its brightness tapering
// along the blur. Under the stars the haze itself is smeared: fbm sampled in
// the same (angle, log r) space and scrolled outward, so the ground is a
// tunnel of radial wisps, not a flat vignette. The core is a soft lamp, dim
// but never black, and the whole tunnel rolls slowly about its axis.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;    // warp speed, scroll rate of the lattice      (default 1.0)
uniform float u_density;  // fraction of lattice slots holding a star    (default 1.0)
uniform float u_streak;   // trail length in log-radius units            (default 1.0)
uniform float u_core;     // brightness of the core lamp and the haze    (default 0.8)
uniform float u_tint;     // how far the trails take the palette colour  (default 0.7)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;

vec3 c0, c1, c2, c3;

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

// palette pick by a hash, so each star owns one pole
vec3 pickCol(float k) {
  float x = floor(fract(k) * 4.0);
  vec3 a = c0;
  a = mix(a, c1, step(0.5, x));
  a = mix(a, c2, step(1.5, x));
  a = mix(a, c3, step(2.5, x));
  return a;
}

// one parallax lattice of streaks.
//   ang   angle of this pixel, 0..TAU (already rolled for this layer)
//   s     log radius of this pixel
//   r     radius in frame units (half height = 1)
//   M     angular slots around the ring
//   dS    radial cell height in log units
//   v     scroll speed in cells per second
//   w     streak half width in frame units at r = 1
//   len   trail length in cells
//   gain  layer brightness
vec3 lattice(float ang, float s, float r, float M, float dS, float v, float w,
             float len, float gain, float seed, float t, float dens, float tint) {
  float cellA = TAU / M;
  float ai    = floor(ang / cellA);
  float sc    = s / dS - t * v;          // scrolling cell coordinate
  float si    = floor(sc);
  vec3  acc   = vec3(0.0);
  // the head of a trail that covers us may sit in our cell or the two ahead
  for (int j = 0; j < 3; j++) {
    vec2  id = vec2(ai, si + float(j)) + seed;
    vec2  h  = hash22(id);
    float h3 = hash21(id * 1.31 + 7.7);
    float h4 = hash21(id * 0.71 + 3.1);
    float on = step(h4, dens);
    // head position in cell coords, and the trail length behind it
    float sHead = si + float(j) + h.y;
    // lengths spread wide: most trails modest, a few long blades
    float L     = len * (0.35 + 1.4 * h3 * h3);
    float back  = sHead - sc;              // how far behind the head we are
    float along = clamp(back / L, 0.0, 1.0);
    // the head is not a hard cap: it rolls off softly a little way ahead,
    // the way a blurred point does, and the tail fades to nothing
    float inTrail = smoothstep(-0.06, 0.02, back) * step(back, L);
    float taper = 1.0 - along;
    taper = taper * sqrt(taper);
    float head  = exp(-abs(back) * 22.0 / max(len, 0.2));
    // perpendicular distance in frame units: angular offset times radius
    float aStar = (ai + 0.18 + 0.64 * h.x) * cellA;
    float perp  = (ang - aStar) * r;
    float ww    = w * (0.45 + 0.9 * r) * (0.7 + 0.6 * h3);
    float q     = perp / ww;
    float line  = exp(-q * q * 2.0);
    // wider faint blur sheath around the core of the streak
    float sheath = exp(-q * q * 0.25) * 0.18;
    float I = on * inTrail * (taper * 0.7 + head * 1.4) * (line + sheath);
    // stars emerge from the core haze and are brightest near the rim
    I *= smoothstep(0.03, 0.30, r) * (0.55 + 0.45 * min(r, 1.4)) * (0.6 + 0.8 * h3);
    // colour: white-hot head, palette-tinted tail
    vec3 pole = pickCol(h3 * 3.7 + h.x);
    vec3 col  = mix(vec3(1.0), pole, tint * clamp(along * 1.3 + 0.3, 0.0, 1.0));
    acc += col * I * gain;
  }
  return acc;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float speed  = clamp(u_speed, 0.0, 4.0);
  float dens   = clamp(u_density, 0.0, 1.0) * 0.9;
  float len    = clamp(u_streak, 0.1, 3.0);
  float core   = clamp(u_core, 0.0, 2.0);
  float tint   = clamp(u_tint, 0.0, 1.0);
  float t      = u_time;

  // frame coords, half height = 1. The vanishing point sits a touch above
  // centre and leans toward the pointer when there is one (zero at rest).
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 vp = vec2(0.0, 0.06) + m * 0.18 * mAmt;
  p -= vp;

  float r   = length(p);
  float s   = log(max(r, 1e-4));
  float ang = atan(p.y, p.x);
  // slow roll of the whole tunnel about its axis
  float roll = t * 0.035 * (0.4 + 0.6 * speed);

  // ---- the ground: a deep tinted dark, lifted by radially smeared haze.
  // The haze is fbm in (angle, log r) space, stretched along log r and
  // scrolled outward, so the wisps stream with the stars.
  vec3  ground = c3 * 0.045 + c0 * 0.025;
  vec2  hz     = vec2(ang * 2.2 + roll * 2.0, s * 0.55 - t * 0.28 * speed);
  // the angle wraps at +-pi, so a second sample is taken on an angle that
  // wraps at 0 instead, and the two are cross-faded so each seam is hidden
  // under the other sample
  float ang2 = mod(ang, TAU);
  vec2  hzB  = vec2(ang2 * 2.2 + roll * 2.0, hz.y) + 13.0;
  float hz1  = fbm(hz);
  float hz2  = fbm(hzB);
  float seam = 0.5 - 0.5 * cos(ang);     // 1 at +-pi, 0 at 0
  float haze = mix(hz1, hz2, seam) - 0.28;
  haze = max(haze, 0.0);
  // haze brightens toward the core lamp and fades a little at the rim
  float hazeF = (0.45 + 0.9 * exp(-r * 1.1)) * core;
  vec3  hazeCol = mix(c0, c2, 0.5 + 0.5 * sin(ang + roll * 3.0)) * 0.6 + c1 * 0.2;
  vec3  col = ground + hazeCol * haze * hazeF;

  // ---- the core lamp: dim, warm, never black at the centre
  float lamp  = exp(-r * r * 9.0);
  float lamp2 = exp(-r * 3.2);
  vec3  lampCol = mix(c1, c0, 0.5) * 0.7 + vec3(0.22);
  col += lampCol * (lamp * 0.7 + lamp2 * 0.22) * core;

  // ---- three parallax lattices of streaks, far to near
  float a0 = mod(ang + roll * 0.8 + 0.7, TAU);
  float a1 = mod(ang + roll * 1.0 + 2.1, TAU);
  float a2 = mod(ang + roll * 1.25 + 4.4, TAU);
  col += lattice(a0, s, r, 72.0, 0.36, 0.55 * speed, 0.0018, len * 0.85, 0.55, 11.0, t, dens, tint);
  col += lattice(a1, s, r, 44.0, 0.50, 0.95 * speed, 0.0030, len * 1.20, 0.85, 23.0, t, dens, tint);
  col += lattice(a2, s, r, 26.0, 0.70, 1.55 * speed, 0.0055, len * 1.60, 1.15, 37.0, t, dens * 0.8, tint);

  // ---- rim: the tunnel walls brighten faintly at the far edges where the
  // streaks pile up, a soft blue-shifted wash from the fastest layer
  col += mix(c2, c0, 0.5) * 0.06 * smoothstep(0.6, 1.6, r) * core;

  // gentle tone roll-off so stacked streaks bloom instead of clipping
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
