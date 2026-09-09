// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// mirrorplane (Mercury) - an infinite polished floor under a lit horizon. The
// upper part of the frame is an analytic sky: a deep zenith falling to a hot
// horizon band, a low sun sitting just above the line, and a few thin
// stratus streaks drifting across it. The lower part is a real ground plane
// hit by the view ray, with a shallow ripple height field on it: the ripple
// normal is taken by finite differences, the view ray is reflected off it,
// and the same sky function is read back along the reflected ray with a
// Fresnel weight, so the reflection stretches, wobbles and breaks up the way
// a wet floor does. The stretch is real, not painted: the sky is read at a
// short column of reflected elevations that lengthens toward the camera,
// where the floor is seen at a steeper angle. Under the reflection the slab
// itself shows through: a dark mottled stone with faint tile seams receding
// in perspective, and a distance haze that pulls the far floor up into the
// horizon glow. The ripples travel, the sun breathes, the clouds drift.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_ripple;   // ripple height on the floor            (default 0.6)
uniform float u_glow;     // strength of the horizon band and sun   (default 1.0)
uniform float u_gloss;    // polish of the floor, reflection weight (default 0.85)
uniform float u_stretch;  // vertical stretch of the reflection     (default 1.0)
uniform float u_speed;    // travel speed of ripples and clouds     (default 0.5)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

vec3 c0, c1, c2, c3;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
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

// ---- the sky, as a function of view direction. az is the horizontal angle,
// el the elevation above the horizon (0 at the line). Returns linear colour.
vec3 sky(float az, float el, float t, float glow) {
  // cool deep pole overhead, warm poles at the line
  vec3 zenith  = mix(mix(vec3(luma(c3)), c3, 0.7), c0, 0.35) * 0.16;
  vec3 horizon = mix(c1, c2, 0.4);
  horizon = clamp(mix(vec3(luma(horizon)), horizon, 1.6), 0.0, 1.0);
  vec3 sunCol  = mix(c2, vec3(1.0), 0.45);
  float e = max(el, 0.0);
  // deep sky to a warm band at the line
  vec3 col = mix(horizon * 0.55, zenith, smoothstep(0.0, 0.42, sqrt(e)));
  // the horizon band itself: a bright thin glow hugging the line, breathing
  float breathe = 0.85 + 0.15 * sin(t * 0.31);
  // the band is hottest on the sun side and cools away from it
  // the band is patchy along the line, the way breaks in a far cloud deck
  // let the afterglow through in lobes, and the lobes drift slowly
  float side  = 0.55 + 0.45 * exp(-abs(az + 0.30) * 0.9);
  float ln1 = vnoise(vec2(az * 4.0 + t * 0.05, 2.7));
  float ln2 = vnoise(vec2(az * 11.0 - t * 0.02, 9.1));
  float lobes = 0.25 + 2.2 * ln1 * ln1 * (0.6 + 0.8 * ln2);
  col += horizon * glow * breathe * side * lobes * (1.1 * exp(-e * 22.0) + 0.40 * exp(-e * 5.0));
  // the low sun: a disc plus a wide corona, sitting a little above the line
  float sunAz = -0.30, sunEl = 0.03;
  vec2  ds = vec2((az - sunAz) * 0.9, (el - sunEl) * 1.35);
  float d2 = dot(ds, ds);
  col += sunCol * glow * (0.9 * exp(-d2 * 140.0) + 0.5 * exp(-d2 * 30.0) + 0.18 * exp(-d2 * 6.0));
  // thin stratus streaks: long in azimuth, short in elevation, lit from the
  // sun side and fading out well above the horizon
  float cl = fbm(vec2(az * 4.5 + t * 0.012, e * 30.0 + 3.0));
  float streak = smoothstep(0.46, 0.72, cl) * exp(-e * 4.0) * smoothstep(0.0, 0.03, e);
  float sunSide = 0.5 + 0.5 * exp(-abs(az - sunAz) * 1.6);
  col = mix(col, mix(horizon, sunCol, 0.5 * sunSide) * (0.35 + 0.45 * glow), streak * 0.7);
  return col;
}

// ---- ripple height on the floor at plane coords q (x across, z away).
// Two travelling wave families and a wander noise; the amplitude fades with
// distance so the far floor settles to a true mirror.
float ripple(vec2 q, float t) {
  float h = 0.0;
  h += sin(q.x * 2.3 + q.y * 1.1 + t * 1.3) * 0.35;
  h += sin(q.x * -1.7 + q.y * 3.1 - t * 1.05) * 0.30;
  h += sin(q.x * 5.1 + q.y * 2.4 + t * 2.1) * 0.12;
  h += (vnoise(q * 1.6 + vec2(t * 0.25, -t * 0.15)) - 0.5) * 1.2;
  return h;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float glow   = clamp(u_glow, 0.0, 2.0);
  float gloss  = clamp(u_gloss, 0.0, 1.0);
  float rip    = clamp(u_ripple, 0.0, 2.0);
  float strAmt = clamp(u_stretch, 0.0, 2.0);

  // camera: eye height 1 above the plane, looking level. The horizon line
  // sits a little above frame centre so the floor owns most of the frame.
  float horizonY = 0.55;
  // pointer: a small tilt of the view, zero at rest
  vec2 m = (u_mouse / u_resolution - 0.5) * u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  horizonY += m.y * 0.06;
  float focal = 1.15;
  vec3 rd = normalize(vec3((uv.x - 0.5 + m.x * 0.05) * aspect, uv.y - horizonY, focal));

  // colour the sky slab with the cool pole, nudged to keep the material
  // sense across palettes: floor stone comes from the deepest pole
  vec3 stone = mix(vec3(luma(c3)), c3, 0.45) * 0.42;
  vec3 col;

  if (rd.y >= 0.0) {
    // ---- above the line: the sky itself
    float az = atan(rd.x, rd.z);
    float el = asin(clamp(rd.y, -1.0, 1.0));
    col = sky(az, el, t, glow);
  } else {
    // ---- the floor: hit the plane y = -1
    float dist = 1.0 / -rd.y;
    vec3  hit  = rd * dist;
    vec2  q    = hit.xz;

    // ripple normal by finite differences; amplitude fades with distance,
    // and the sample step grows with distance to keep the far floor calm
    float amp = rip * 0.028 / (1.0 + dist * 0.10);
    float eps = 0.015 + dist * 0.003;
    float hC = ripple(q, t);
    float hX = ripple(q + vec2(eps, 0.0), t);
    float hZ = ripple(q + vec2(0.0, eps), t);
    vec3  n  = normalize(vec3(-(hX - hC) / eps * amp, 1.0, -(hZ - hC) / eps * amp));

    // reflect the view ray and read the sky back along it
    vec3  r  = reflect(rd, n);
    float az = atan(r.x, r.z);
    float el = asin(clamp(r.y, -1.0, 1.0));

    // reflection stretch: read a short vertical column of the sky. The
    // column is longest close to the camera (steep view, long smear) and
    // collapses toward the horizon, where the reflection is crisp.
    float below = clamp((horizonY - uv.y) / horizonY, 0.0, 1.0);
    // fraction of the reflected elevation the smear reaches down through:
    // the band at the line gets dragged down the floor toward the camera
    float reach = clamp(strAmt * (0.15 + 0.75 * sqrt(below)) * (0.5 + 0.5 * min(rip, 1.0)), 0.0, 0.96);
    vec3 refl = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 7; i++) {
      float f = float(i) / 6.0;                          // 0..1 down the smear
      float w = 1.0 - 0.55 * f;                          // the crisp end weighs more
      float e2 = el * (1.0 - reach * f) + 0.004 * (1.0 - f);
      refl += sky(az, max(e2, 0.0), t, glow) * w;
      wsum += w;
    }
    refl /= wsum;

    // Fresnel: grazing angles near the horizon are near-perfect mirror, the
    // floor right under the camera shows more of the slab
    float cosT = clamp(dot(-rd, n), 0.0, 1.0);
    float fr1  = 1.0 - cosT;
    float fr2  = fr1 * fr1;
    float fres = fr2 * fr2 * fr1;
    float F0   = mix(0.12, 0.70, gloss);
    float F    = clamp(F0 + (1.0 - F0) * fres, 0.0, 1.0);

    // the slab: dark mottled stone with faint tile seams in perspective
    float mottle = fbm(q * 0.35 + 7.0);
    vec3  slab   = stone * (0.7 + 0.6 * mottle);
    // seams: distance to the nearest grid line in plane units, widened with
    // distance so they hold as thin lines instead of aliasing away
    vec2  tile   = abs(fract(q / 1.6 + 0.5) - 0.5) * 1.6;
    float seamW  = 0.025 + dist * 0.012;
    float seam   = 1.0 - smoothstep(seamW * 0.4, seamW, min(tile.x, tile.y));
    seam *= exp(-dist * 0.04);
    slab = mix(slab, slab * 0.35, seam * 0.9);
    // wet sheen on the stone: the slab itself brightens a little toward the
    // sun through the ripple crests
    slab += stone * 0.6 * max(n.x * 0.6 + n.z * 0.4, 0.0) * rip;

    col = mix(slab, refl, F * (0.55 + 0.45 * gloss));
    // the seams show through the reflection as a faint darkening too, so
    // the plane reads as a floor and not open water
    col *= 1.0 - seam * 0.5 * (1.0 - F * 0.4);

    // distance haze: the far floor lifts a little into the horizon glow
    float haze = 1.0 - exp(-dist * 0.03);
    vec3  hazeCol = mix(c1, c2, 0.3) * (0.22 + 0.30 * glow);
    col = mix(col, hazeCol, haze * 0.55);
  }

  // soft shoulder so the sun and its reflection keep detail
  col = col / (1.0 + col * 0.30);
  gl_FragColor = vec4(col, 1.0);
}
