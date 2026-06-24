// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// ziggurat (Plinth) — one colossal stepped pyramid stands alone on a dark plain,
// a terraced mass quantized from a tapered box SDF into a fixed number of square
// tiers. The camera rides a slow level orbit at a fixed respectful radius, so
// near terrace corners slide across far ones in continuous parallax. Ground haze
// tinted with palette 0 pools at the base and thins with altitude into a faint
// palette-1 sky; terrace edges facing the dim sky-glow take a knife-thin rim of
// palette 2, and a small steady beacon of palette 3 burns at the summit, bleeding
// a soft halo into the haze. Ancient, mute, stationary — only the eye moves.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_orbitSpeed;  // camera orbit speed around pyramid (default 0.25)
uniform float u_hazeDepth;   // how high ground haze pools up the tiers (default 0.9)
uniform float u_beaconGlow;  // brightness of warm summit light + halo (default 0.7)
uniform float u_rimGlow;     // strength of thin lit terrace-edge lines (default 1)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   STEPS    = 96;     // raymarch iterations (constant bound)
const float TIERS    = 7.0;    // number of stepped terraces
const float PYR_H    = 1.6;    // total pyramid height (world units)
const float PYR_BASE = 1.15;   // half-width of the base tier
const float ORBIT_R  = 4.3;    // camera radius from the central mass

// signed distance to an axis-aligned box of half-extents b
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// one terrace tier as a true box SDF: a stacked slab of half-height hy centred at
// cy, with square half-width hw. Returned distances are exact (Lipschitz-1) so
// the marcher never overshoots the setback corners (no jagged silhouettes).
float sdTier(vec3 p, float i) {
  float frac = i / TIERS;                          // 0 at base, →1 at summit
  float hw   = mix(PYR_BASE, PYR_BASE * 0.14, frac);
  float y0   = i / TIERS * PYR_H;
  float y1   = (i + 1.0) / TIERS * PYR_H;
  float cy   = (y0 + y1) * 0.5;
  float hy   = (y1 - y0) * 0.5;
  return sdBox(vec3(p.x, p.y - cy, p.z), vec3(hw, hy, hw));
}

// the stepped pyramid: a union (min) of a CONSTANT number of nested box tiers,
// each setback narrower than the one below. A real SDF union, so the silhouette
// stays crisp and the setbacks read as hard stacked shadows.
float sdZiggurat(vec3 p) {
  float d = sdTier(p, 0.0);
  d = min(d, sdTier(p, 1.0));
  d = min(d, sdTier(p, 2.0));
  d = min(d, sdTier(p, 3.0));
  d = min(d, sdTier(p, 4.0));
  d = min(d, sdTier(p, 5.0));
  d = min(d, sdTier(p, 6.0));
  return d;
}

// soft min for unioning the ground plane into the field without a hard crease
float opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// full scene distance: pyramid plus a flat dark plain at y=0
float mapScene(vec3 p) {
  float zig = sdZiggurat(p);
  float ground = p.y + 0.001; // plane at y=0
  return opSmoothUnion(zig, ground, 0.04);
}

// just the pyramid (for material/rim discrimination from the ground)
float mapZig(vec3 p) {
  return sdZiggurat(p);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy) - mapScene(p - e.xyy),
    mapScene(p + e.yxy) - mapScene(p - e.yxy),
    mapScene(p + e.yyx) - mapScene(p - e.yyx)
  ));
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t   = u_time;

  // palette with the house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // --- camera: slow level orbit at a fixed respectful radius ---
  float ang = t * u_orbitSpeed * 0.35;
  vec3 ro = vec3(sin(ang) * ORBIT_R, 1.35, cos(ang) * ORBIT_R);
  vec3 ta = vec3(0.0, 0.78, 0.0);            // aim at the pyramid's mid-mass
  vec3 fwd = normalize(ta - ro);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up  = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x * rgt + uv.y * up + 1.5 * fwd);

  // direction of the faint sky-glow the terrace edges catch their rim from
  vec3 skyDir = normalize(vec3(0.35, 0.85, 0.2));

  // --- raymarch with constant bounds ---
  float dist = 0.0;
  float hit  = 0.0;
  vec3  pos  = ro;
  for (int i = 0; i < STEPS; i++) {
    pos = ro + rd * dist;
    float d = mapScene(pos);
    if (d < 0.0008) { hit = 1.0; break; }
    dist += d;
    if (dist > 14.0) break;
  }

  // --- sky gradient: empty, starless, faint palette-1 toward the horizon ---
  float horizon = clamp(rd.y * 1.6 + 0.15, 0.0, 1.0);
  vec3 sky = mix(c1 * 0.085, BG * 0.6, horizon);
  sky = mix(sky, BG, 0.45);

  vec3 col = sky;

  if (hit > 0.5) {
    vec3 n = calcNormal(pos);
    // is this surface the pyramid mass or the surrounding plain?
    float zigD = mapZig(pos);
    float onZig = 1.0 - smoothstep(0.01, 0.12, zigD);

    // near-black mass: only faint ambient sky bounce so the solid stays dark
    float amb = 0.04 + 0.06 * clamp(n.y, 0.0, 1.0);
    vec3 mass = mix(c0, c1, 0.5) * amb;
    // the plain reads slightly cooler and darker than the monument
    vec3 plain = c0 * (0.03 + 0.02 * clamp(n.y, 0.0, 1.0));
    col = mix(plain, mass, onZig);

    // --- knife-thin rim where mass faces the dim sky-glow ---
    // grazing term: bright only where the normal turns toward skyDir at a
    // shallow angle, so it traces the horizontal terrace lips, not whole faces.
    float facing = clamp(dot(n, skyDir), 0.0, 1.0);
    float graze  = pow(facing, 3.0);
    // emphasize horizontal lips: normals with a strong vertical component
    float lip = smoothstep(0.25, 0.9, abs(n.y)) * smoothstep(0.0, 0.35, facing);
    float rim = (graze * 0.4 + lip) * onZig;
    // fade rim with distance so far terraces don't out-shout near ones
    float depthFade = exp(-dist * 0.16);
    col += c2 * rim * 0.9 * u_rimGlow * depthFade;

    // a whisper of the warm beacon licking the upper tiers
    float upLit = smoothstep(0.6, PYR_H, pos.y) * onZig;
    col += c3 * upLit * 0.09 * u_beaconGlow;
  }

  // --- summit beacon: small steady warm point at the apex ---
  vec3 beaconPos = vec3(0.0, PYR_H + 0.04, 0.0);
  // project the beacon: distance from the ray to the beacon point
  vec3 toB = beaconPos - ro;
  float tB = dot(toB, rd);
  // beacon waxes faintly in counter-phase to the haze breathing cycle
  float breathe = 0.5 + 0.5 * sin(t * 0.22);
  float beaconWax = 0.7 + 0.3 * (1.0 - breathe);
  if (tB > 0.0) {
    vec3 closest = ro + rd * tB;
    float r = length(closest - beaconPos);
    // only draw the halo if the beacon isn't occluded by nearer mass
    float occl = step(tB, dist + 0.05) ; // 1 when beacon is in front of the hit
    if (hit < 0.5) occl = 1.0;
    // sharp core + soft wide halo bleeding into the haze
    float core = exp(-r * r / 0.0009);
    float halo = exp(-r * r / 0.06);
    float bloom = exp(-r * r / 0.22);
    float beacon = (core * 1.4 + halo * 0.6 + bloom * 0.28) * beaconWax * u_beaconGlow * occl;
    col += c3 * beacon;
  }

  // --- ground haze: pools at the base, thins with altitude, breathes ---
  // estimate the world-space height the ray is passing through near the base.
  // sample altitude at the hit (or far) point and build a fog band low down.
  float sampleY = hit > 0.5 ? pos.y : (ro.y + rd.y * min(dist, 12.0));
  float hazeTop = u_hazeDepth * PYR_H * (0.55 + 0.45 * breathe); // breathing lid
  float hazeAmt = 1.0 - smoothstep(0.0, max(hazeTop, 0.05), max(sampleY, 0.0));
  // distance-accumulated fog density so far mass dissolves into the murk
  float fogDist = 1.0 - exp(-dist * 0.10);
  float haze = clamp(hazeAmt * (0.45 + 0.55 * fogDist), 0.0, 1.0);
  vec3 hazeCol = mix(c0 * 0.18, c1 * 0.10, 0.4);
  col = mix(col, hazeCol, haze * 0.85);

  // --- composition: gentle vignette keeps corners dark and centre luminous ---
  float vign = 1.0 - smoothstep(0.55, 1.25, length(uv));
  col *= mix(0.72, 1.0, vign);

  // subtle filmic-ish lift on the darks, tone down highlights, no banding
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
