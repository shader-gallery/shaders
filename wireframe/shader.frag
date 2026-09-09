// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// wireframe (Strata) - a glowing wireframe terrain, the mesh draped over a
// real height field rather than laid on a flat floor. A raymarcher walks a
// noise landscape from a low camera gliding along a valley, so ridges rise on
// both sides, fold behind one another and sink to a lit horizon under a dark
// sky. The grid is drawn on the surface in world units and follows every fold:
// lines pinch together on steep faces, splay on the flats and vanish behind
// the ridges they climb, with hidden-line removal coming free from the march.
// Line weight is held to about a pixel from the ray footprint, so the far
// field stays a fine haze of lines instead of blooming solid, and a soft halo
// hugs each line. Facets between the lines are near black with a faint slope
// shade and a whisper of the horizon light on faces that turn toward it, a
// scan pulse rolls out along the grid toward the horizon, and a sparse star
// field turns slowly above. Synthwave register, but no banded sun, no chrome.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // glide speed along the valley           (default 0.6)
uniform float u_relief;    // mountain height                         (default 1.0)
uniform float u_density;   // grid lines per world unit               (default 1.0)
uniform float u_glow;      // line halo strength                      (default 1.0)
uniform float u_valley;    // width of the flat valley floor          (default 4.0)

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// the valley snakes: its centreline in x as a function of z
float valleyX(float z) {
  return 5.0 * sin(z * 0.045) + 2.5 * sin(z * 0.11 + 1.0);
}

// the landscape: ridged noise rising away from a flat valley floor along z
float terrain(vec2 q) {
  vec2 p = q * 0.11;
  float s = 0.0, a = 1.0;
  for (int i = 0; i < 4; i++) {
    float n = vnoise(p);
    // ridge the noise: fold about the midline so crests come to an edge
    n = 1.0 - abs(n * 2.0 - 1.0);
    s += a * n * n;
    p = M2 * p * 2.1 + vec2(3.7, 1.9);
    a *= 0.48;
  }
  float valley = smoothstep(0.0, 1.0, (abs(q.x - valleyX(q.y)) - max(u_valley, 0.0) * 0.5) / 9.0);
  // a gentle roll on the floor itself so the grid there is not dead flat
  float floorRoll = vnoise(q * 0.07 + 11.0) * 0.35;
  return (s * 4.4 * max(u_relief, 0.0)) * valley + floorRoll;
}

vec3 terrainNormal(vec2 q, float e) {
  float hx1 = terrain(q + vec2(e, 0.0));
  float hx0 = terrain(q - vec2(e, 0.0));
  float hz1 = terrain(q + vec2(0.0, e));
  float hz0 = terrain(q - vec2(0.0, e));
  return normalize(vec3(hx0 - hx1, 2.0 * e, hz0 - hz1));
}

// distance to the nearest grid line in one axis, world units
float lineDist(float x) {
  return abs(fract(x) - 0.5);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  sc     = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float t      = u_time * clamp(u_speed, 0.0, 3.0);
  float glowAmt = clamp(u_glow, 0.0, 3.0);
  float dens   = max(u_density, 0.1);

  // ---- palette-derived materials
  float l0 = luma(c0), l3 = luma(c3);
  vec3 lineCol  = mix(c0, vec3(1.0), 0.18);               // the near grid
  vec3 lineFar  = mix(c1, c0, 0.4);                        // the far grid
  vec3 horizCol = mix(c1, c2, 0.5);                        // horizon light
  vec3 skyTop   = mix(vec3(l3) * 0.25, c3, 0.45) * 0.42;   // deep, tinted
  vec3 skyLow   = mix(vec3(l0) * 0.35, c3, 0.55) * 0.55;
  vec3 ground   = mix(vec3(l3) * 0.15, c3, 0.40) * 0.40;   // facet fill
  vec3 pulseCol = mix(c2, vec3(1.0), 0.25);

  // ---- camera: low over the valley floor, gliding forward
  float focal = 1.35;
  float pitch = 0.26;
  float z0 = t * 2.2;
  // ride the left shoulder of the valley, not its centre, and look across it
  // toward the far bend, so the near ridge stacks up on one side while the
  // floor opens out on the other
  vec3  ro = vec3(valleyX(z0) - max(u_valley, 0.0) * 0.5 - 3.5, 0.0, z0);
  // hold height off whichever is higher, the shoulder or the floor, so a
  // rising shoulder never buries the camera in its own slope
  ro.y = max(terrain(ro.xz), terrain(vec2(valleyX(z0), z0))) + 2.0;
  vec3  fwd = normalize(vec3(valleyX(z0 + 16.0) + 3.0 - ro.x, 0.0, 16.0));
  vec3  rgt = vec3(fwd.z, 0.0, -fwd.x);
  vec3  rd  = normalize(rgt * sc.x + vec3(0.0, sc.y - pitch, 0.0) + fwd * focal);
  // world size of one device pixel at unit distance
  float pxAngle = 2.0 / (u_resolution.y * focal);

  // ---- march the height field
  // ridged fbm sums to about 1.9 at most, so this clears every summit
  float hMax = 4.4 * 1.9 * max(u_relief, 0.0) + 0.6;
  float dist = 0.0, prevD = 0.0, prevGap = 1.0;
  float hit = 0.0;
  vec3  p = ro;
  for (int i = 0; i < 80; i++) {
    p = ro + rd * dist;
    if (p.y > hMax && rd.y >= 0.0) break;
    float gap = p.y - terrain(p.xz);
    if (gap < 0.0015 * dist) {
      dist = mix(prevD, dist, clamp(prevGap / max(prevGap - gap, 1e-4), 0.0, 1.0));
      hit = 1.0;
      break;
    }
    prevD = dist; prevGap = gap;
    dist += clamp(gap * 0.5, 0.02 + 0.008 * dist, 1.4);
    if (dist > 70.0) break;
  }

  // ---- sky: dark gradient, a horizon glow band, sparse slow stars
  float up = clamp(rd.y * 2.2, 0.0, 1.0);
  vec3 sky = mix(skyLow, skyTop, sqrt(up));
  float horizonGlow = exp(-max(rd.y, 0.0) * 5.0);
  sky += horizCol * horizonGlow * 0.65;
  // a broad soft light low in the sky ahead, the glow of whatever city lies
  // beyond the ridges, offset from the valley so the frame is not symmetric
  float cityGlow = exp(-length(vec2(dot(rd, rgt) + 0.6, rd.y * 1.8)) * 2.2);
  sky += horizCol * cityGlow * 0.55;
  // stars: hash cells on the sky dome, few, faint, turning slowly
  vec2  sd = rd.xy / max(rd.z, 0.2) * 14.0 + vec2(t * 0.02, 0.0);
  vec2  sdi = floor(sd), sdf = fract(sd) - 0.5;
  float sh = hash21(sdi);
  float star = smoothstep(0.955, 1.0, sh) * smoothstep(0.07, 0.01, length(sdf - (vec2(hash21(sdi + 7.0), hash21(sdi + 3.0)) - 0.5) * 0.6));
  star *= 0.6 + 0.4 * sin(u_time * 1.7 + sh * 40.0);
  sky += vec3(0.8, 0.85, 1.0) * star * smoothstep(0.02, 0.2, rd.y) * 0.7;

  vec3 col = sky;

  if (hit > 0.5) {
    p = ro + rd * dist;
    float e = 0.02 + dist * 0.004;
    vec3  N = terrainNormal(p.xz, e);

    // grid coordinates on the surface, following the terrain
    vec2  gq = p.xz * dens;
    // ray footprint on the surface, per axis, in grid units: move the ray by
    // one pixel right and one pixel up, slide the hit along the tangent plane,
    // and measure how far the surface point travels in x and in z. This is
    // the finite-difference stand-in for screen derivatives, and it is what
    // keeps a line about one pixel wide whether it runs across a flat or
    // climbs a wall seen edge-on
    float ndr = min(dot(N, rd), -0.05);
    vec3  du = rgt * (pxAngle * dist);
    vec3  dv = vec3(0.0, pxAngle * dist, 0.0);
    du -= rd * (dot(N, du) / ndr);
    dv -= rd * (dot(N, dv) / ndr);
    float fx = min(length(vec2(du.x, dv.x)) * dens, 0.5);
    float fz = min(length(vec2(du.z, dv.z)) * dens, 0.5);
    // line core about a pixel wide, never thinner than the footprint
    float wx = fx * 0.6 + 0.002;
    float wz = fz * 0.6 + 0.002;
    float dx = lineDist(gq.x);
    float dz = lineDist(gq.y);
    float coreX = 1.0 - smoothstep(wx * 0.5, wx * 1.5, dx);
    float coreZ = 1.0 - smoothstep(wz * 0.5, wz * 1.5, dz);
    // when lines crowd closer than a couple of pixels, dissolve them into an
    // even haze instead of a solid block
    coreX = mix(coreX, 0.22, smoothstep(0.18, 0.5, fx));
    coreZ = mix(coreZ, 0.22, smoothstep(0.18, 0.5, fz));
    float core = max(coreX, coreZ);
    // halo: a soft exponential falloff around each line, measured in pixels
    float haloX = exp(-dx / max(fx, 1e-3) * 0.45);
    float haloZ = exp(-dz / max(fz, 1e-3) * 0.45);
    float halo = max(haloX, haloZ) * glowAmt * 0.22;
    // vertex points where lines cross, a touch brighter
    float vert = coreX * coreZ;

    // scan pulse: a band of light rolling away from the camera down the grid
    float pz = fract((p.z - ro.z) / 42.0 - t * 0.06);
    float pulse = exp(-pz * 14.0) * smoothstep(0.0, 0.03, pz);
    pulse += exp(-abs(pz - 0.5) * 30.0) * 0.4;

    // distance fade for the lines, and colour shift near to far
    float lineFade = exp(-dist * 0.035);
    vec3  lc = mix(lineFar, lineCol, lineFade);
    lc = mix(lc, pulseCol, pulse * 0.7);

    // facet fill: near black, a faint slope shade, horizon light on faces
    // that lean toward the horizon glow
    float slope = 1.0 - N.y;
    vec3  fill = ground * (0.7 + 0.6 * N.y) + horizCol * slope * 0.06;
    // and a faint wash of the line colour bleeding into the facet
    fill += lc * 0.05;
    // and a dim wash from the camera itself on the nearest facets
    fill += lc * 0.08 * exp(-dist * 0.12);

    vec3 lit = fill;
    lit += lc * (core * (0.9 + 0.6 * pulse) + vert * 0.5) * (0.35 + 0.65 * lineFade);
    lit += lc * halo * (0.5 + 0.5 * lineFade) * (1.0 + pulse);

    // aerial fade toward the horizon light
    float fog = 1.0 - exp(-dist * dist * 0.0011);
    vec3  fogCol = mix(sky, horizCol, 0.25);
    col = mix(lit, fogCol, fog * 0.92);
  } else {
    // just above the skyline the far ridges melt into the horizon glow
    col = sky;
  }

  // a low ground haze that sits in the valley, lit by the horizon
  float hazeY = exp(-abs(sc.y - pitch + 0.05) * 6.0);
  col += horizCol * hazeY * 0.08 * glowAmt;

  // gentle vignette in the corners keeps the eye on the horizon
  float vig = 1.0 - 0.12 * dot(sc * vec2(0.6, 1.0), sc * vec2(0.6, 1.0));
  col *= clamp(vig, 0.0, 1.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
