// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// dolmen (Plinth) - a single trilithon: two thick upright slabs bearing one
// massive tilted capstone (three box SDFs), standing on a low barrow mound,
// with a sparse hash scatter of smaller recumbent stones at varied depths
// behind it. Low on the horizon a broad setting glow blends palette colour 3
// into colour 1, backlighting the stones so the portal gap between the
// uprights frames the brightest patch in the frame. Ground fog in colour 0
// drifts at shin height; the capstone's edges catch a hairline rim of colour 2
// against the glow. The camera traces a very slow wide orbit at constant
// height so the portal opens, eclipses to a sliver, and opens again - a
// minutes-long eclipse cycle written purely by parallax. The stones never move.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_orbitSpeed;   // how fast the camera arcs around the dolmen   (default 0.2)
uniform float u_moonGlow;     // intensity of the warm setting light behind   (default 1.0)
uniform float u_fogDensity;   // thickness of the shin-height ground mist     (default 0.8)

const vec3  BG      = vec3(0.035, 0.035, 0.043); // house near-black base
const float FL      = 1.15;   // focal length (monumental framing)
const float CAM_H   = 2.3;    // eye height above the ground plane
const float ORBIT_R = 13.5;   // orbit radius about the monument
const float MAXDIST = 60.0;   // march far enough to reach the horizon glow
const int   STEPS   = 96;     // raymarch steps (constant loop bound)
const float SURF    = 0.004;  // hit epsilon

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// signed distance to an axis-aligned box of half-size b centred at origin
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// rotate a point about the X axis (used to tilt the capstone)
vec3 rotX(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

// The whole scene SDF. Returns distance; writes a material id into m:
//   0 = nothing, 1 = trilithon (uprights + capstone), 2 = scatter stone.
float mapScene(vec3 p, out float m) {
  m = 0.0;
  float d = MAXDIST;

  // --- the trilithon, centred at the world origin on the barrow crest ---
  // two thick upright slabs flanking a portal gap, plus a tilted capstone.
  float upH = 2.4;                       // upright half-height
  vec3  ub  = vec3(0.42, upH, 0.55);     // upright half-extents
  float gap = 1.1;                       // half the portal width
  vec3 pl = p - vec3(-gap, upH - 0.15, 0.0); // left upright (sunk slightly)
  vec3 pr = p - vec3( gap, upH - 0.15, 0.0); // right upright
  float dL = sdBox(pl, ub);
  float dR = sdBox(pr, ub);
  // massive capstone resting across the tops, tilted slightly off-level
  vec3 pc = p - vec3(0.0, 2.0 * upH - 0.15 + 0.35, 0.0);
  pc = rotX(pc, 0.10);
  float dC = sdBox(pc, vec3(gap + 0.85, 0.34, 0.78));
  float dTri = min(dL, min(dR, dC));
  if (dTri < d) { d = dTri; m = 1.0; }

  // --- sparse scatter of smaller recumbent stones behind the trilithon ---
  // tiled hash field on the ground, only behind (z far) so they layer in
  // perspective between the portal and the horizon glow. unrolled fixed grid.
  vec3 q = p;
  const float CELL = 5.5;
  for (int ix = -2; ix <= 2; ix++) {
    for (int iz = 1; iz <= 4; iz++) {
      vec2 cellId = vec2(float(ix), float(iz));
      float r = hash21(cellId * 1.7 + 3.0);
      // only ~70% of cells carry a stone
      if (r > 0.30) {
        float rx = hash21(cellId + 11.0);
        float rz = hash21(cellId + 23.0);
        float rs = hash21(cellId + 37.0);
        // push them onto the far (-Z) side so they layer between the portal
        // and the horizon glow, sliding behind the trilithon in perspective
        vec2 ctr = (cellId + vec2(rx, rz) * 0.6 - 0.3) * CELL;
        vec3 sb = vec3(0.55 + rs * 0.5, 0.32 + rs * 0.45, 0.45 + rs * 0.4);
        vec3 ps = q - vec3(ctr.x, sb.y - 0.05, -(ctr.y + 4.0));
        // small per-stone yaw so they don't all align
        float a = (rx - 0.5) * 1.6;
        float ca = cos(a), sa = sin(a);
        ps.xz = mat2(ca, -sa, sa, ca) * ps.xz;
        float ds = sdBox(ps, sb);
        if (ds < d) { d = ds; m = 2.0; }
      }
    }
  }

  return d;
}

// cheap surface normal by central differences
vec3 calcNormal(vec3 p) {
  float m;
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy, m) - mapScene(p - e.xyy, m),
    mapScene(p + e.yxy, m) - mapScene(p - e.yxy, m),
    mapScene(p + e.yyx, m) - mapScene(p - e.yyx, m)
  ));
}

void main() {
  vec2 res = u_resolution;
  vec2 fc  = gl_FragCoord.xy;
  vec2 uv  = (fc - 0.5 * res) / max(res.y, 1.0);

  // Theme colours come from u_palette. Some headless poster contexts cannot
  // bind a vec3[] uniform, leaving it all-zero; fall back to midnight hues.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float fog = max(u_fogDensity, 0.0);
  float glow = max(u_moonGlow, 0.0);

  // --- camera: a very slow wide orbit at constant height, always aimed at
  // the portal. The world holds perfectly still; only the eye moves. ---
  // The camera starts on the +Z side looking toward -Z, straight through the
  // portal at the sun; a small orbit angle swings it sideways so an upright
  // slides across and eclipses the glow, then opens again.
  float orbit = max(u_orbitSpeed, 0.0) * 0.05;
  float ang   = 0.55 * sin(orbit * u_time);    // wide arc either side of dead-on
  vec3 ro = vec3(sin(ang) * ORBIT_R, CAM_H, cos(ang) * ORBIT_R);
  // aim above the ground, level with the portal, so the capstone reads whole
  vec3 ta = vec3(0.0, 2.6, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, ri);
  vec3 rd = normalize(ri * uv.x + up * uv.y + fw * FL);

  // the broad setting glow sits low on the horizon directly beyond the portal
  // (the -Z far side), so the gap between the uprights frames the brightest
  // patch in the frame from the camera's nominal head-on position.
  vec3 sunDir = normalize(vec3(0.0, 0.06, -1.0));

  // --- the sky / horizon glow: colour 3 hot core blending out into colour 1,
  // brightest just above the horizon line where the portal frames it ---
  // glow hugs the horizon: a tight band that fades fast to near-black above
  float band   = exp(-max(rd.y, 0.0) * 11.0);            // steep vertical falloff
  float toSun  = max(dot(rd, sunDir), 0.0);
  float glowCore = pow(clamp(toSun, 0.0, 1.0), 12.0);    // tight bright disc
  float glowWide = pow(clamp(toSun, 0.0, 1.0), 4.0);     // broad horizon wash
  vec3 skyCol = BG * 0.45
              + mix(c1, c3, glowWide) * (0.20 * glowWide) * band * glow
              + c3 * glowCore * band * (0.95 * glow)
              + c1 * 0.012 * smoothstep(-0.1, 0.9, rd.y); // whisper of upper sky

  // --- raymarch the solids ---
  float t = 0.0;
  float m = 0.0;
  float hitM = 0.0;
  bool hit = false;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = mapScene(p, m);
    if (d < SURF) { hit = true; hitM = m; break; }
    t += d;
    if (t > MAXDIST) break;
  }

  // ground plane intersection (the barrow / plain) for fog + floor shading
  float tGround = (rd.y < -1e-4) ? (-ro.y / rd.y) : MAXDIST;

  vec3 col;
  if (hit && (t < tGround || tGround >= MAXDIST)) {
    // ---- a stone solid: a black mass eclipsing the distant light ----
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);

    // stones are near-black silhouettes; only their edges facing the glow
    // catch a hairline rim. Rim is strongest where the surface grazes toward
    // the sun and away from the eye (true backlight rim).
    float ndl  = max(dot(n, sunDir), 0.0);
    float rim  = pow(1.0 - max(dot(n, -rd), 0.0), 2.5); // edge-on to eye
    float back = smoothstep(0.0, 0.4, dot(n, sunDir) + 0.15);
    float rimL = rim * back;

    vec3 rimCol = (hitM > 1.5) ? c1 : c2;   // capstone/uprights: c2; scatter: c1
    vec3 surf = BG * 0.22
              + rimCol * rimL * (0.55 + 0.45 * glow)
              + c3 * ndl * 0.05 * glow;      // whisper of warm fill on lit faces

    // distance haze: stones far back dissolve into the glow behind them
    float fd  = t * (0.018 + 0.012 * fog);
    float haze = 1.0 - exp(-fd * fd);
    col = mix(surf, skyCol, haze * 0.85);
  } else if (tGround < MAXDIST) {
    // ---- the barrow / ground plain receding to the horizon ----
    vec3 gp = ro + rd * tGround;
    float dist = tGround;
    // a low barrow mound rising under the monument
    float mound = 0.6 * exp(-dot(gp.xz, gp.xz) * 0.02);
    // ground tone: dark earth catching a little of the setting light
    float gl = pow(max(dot(normalize(vec3(rd.x, 0.0, rd.z)), sunDir), 0.0), 2.0);
    vec3 surf = BG * 0.55 + c3 * 0.05 * gl * glow + mound * c3 * 0.03 * glow;

    // ---- shin-height ground fog in colour 0, drifting (breathing) ----
    float fh = clamp(1.0 - gp.y * 0.7, 0.0, 1.0);     // densest near the ground
    float drift = 0.5 + 0.5 * sin(gp.x * 0.25 + gp.z * 0.18 - u_time * 0.20)
                      * sin(gp.z * 0.31 + u_time * 0.13);
    float fogAmt = fh * (0.35 + 0.65 * drift) * fog;
    fogAmt = clamp(fogAmt * smoothstep(2.0, 22.0, dist), 0.0, 1.0);
    vec3 fogCol = BG * 0.6 + c0 * (0.14 + 0.10 * drift);
    surf = mix(surf, fogCol, fogAmt);

    // far ground melts into the horizon glow
    float fd  = dist * 0.022;
    float haze = 1.0 - exp(-fd * fd);
    col = mix(surf, skyCol, haze);
  } else {
    // ---- open sky / horizon glow ----
    col = skyCol;
    // a thin band of ground fog hanging just above the horizon line
    float band = exp(-rd.y * rd.y * 90.0) * smoothstep(0.0, 0.3, -rd.y + 0.2);
    col += c0 * band * 0.10 * fog;
  }

  // gentle vignette and a whisper of dither against banding in the glow
  col *= 1.0 - 0.32 * smoothstep(0.5, 1.15, length(uv));
  col += (hash21(fc * 0.7 + u_time) - 0.5) * 0.006;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
