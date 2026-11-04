// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// slotlight (Aura) - a low view up a sandstone slot canyon. Two curved walls
// lean and wander around a meandering centreline, scalloped into flutes and
// cut by flowing strata that bend with the rock. Far above, the walls almost
// close into a thin bright slit of sky. Light enters only there: it bounces
// down the walls, hot and pale near the rim, deepening through coral to wine,
// until the floor sits in a cold blue-black shade. Shafts of sun fall straight
// down through the slit like the blades of a slow gobo wheel, swaying as the
// sun turns, lit by drifting dust, and pool on the rippled sand floor. The
// viewer creeps slowly forward along the canyon.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;   // forward creep and shaft sway rate        (default 0.35)
uniform float u_strata;  // density of the sandstone strata          (default 1.0)
uniform float u_haze;    // dust lit inside the sun shafts           (default 0.8)
uniform float u_bounce;  // how far the bounce light reaches down    (default 1.0)

const float TAU = 6.28318530718;
const float RIM = 5.2;      // height of the canyon rim
const float SHAFT_P = 5.0;  // spacing of shaft cells along the canyon

float hash21(vec2 p) {
  p = fract(p * vec2(271.83, 419.57));
  p += dot(p, p.yx + 27.91);
  return fract((p.x + p.y) * p.x);
}
float hash11(float n) { return fract(sin(n * 91.37 + 17.21) * 51731.163); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 RM = mat2(0.78, 0.62, -0.62, 0.78);
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = RM * p * 2.07 + vec2(5.3, 9.1);
    a *= 0.5;
  }
  return s;
}

// canyon centreline: wanders with depth and leans with height
float cline(float y, float z) {
  return 0.95 * sin(z * 0.21 + 0.6)
       + 0.42 * sin(z * 0.47 + y * 0.31 + 1.7)
       + 0.16 * sin(y * 0.85 + z * 0.73);
}

// half width of the air gap: narrows toward the rim, scalloped into flutes
float hwid(float y, float z) {
  float w = 1.15 - y * 0.175 + 0.18 * sin(z * 0.37 + 2.0);
  w += 0.13 * sin(y * 1.55 + z * 0.83 + 0.9 * sin(z * 0.29));
  w += 0.05 * sin(y * 3.9 - z * 1.7);
  return max(w, 0.07);
}

// strata phase: bands that flow and bend with the rock
float strataPh(vec3 p, float dens) {
  return (p.y * 2.3 + 0.55 * sin(p.z * 0.42 + p.y * 0.35)
        + 0.25 * sin(p.z * 1.3 - p.x * 0.8)) * dens;
}

float wallD(vec3 p, float dens) {
  float c = cline(p.y, p.z);
  float w = hwid(p.y, p.z);
  float ph = strataPh(p, dens);
  // harder beds stand proud as thin ledges
  float ledge = 0.045 * smoothstep(0.18, 0.5, abs(fract(ph) - 0.5));
  return max(w - ledge - abs(p.x - c), p.y - RIM);
}

float floorD(vec3 p) {
  return p.y + 0.025 * sin(p.z * 6.0 + 1.6 * sin(p.x * 2.3 + p.z * 0.4));
}

float map(vec3 p, float dens) { return min(wallD(p, dens), floorD(p)); }

vec3 calcN(vec3 p, float dens) {
  vec2 e = vec2(0.012, 0.0);
  return normalize(vec3(
    map(p + e.xyy, dens) - map(p - e.xyy, dens),
    map(p + e.yxy, dens) - map(p - e.yxy, dens),
    map(p + e.yyx, dens) - map(p - e.yyx, dens)));
}

// vertical sun shafts dropping from the slit, one per cell along the canyon
float shafts(vec3 p, float sway) {
  float cell = floor(p.z / SHAFT_P);
  float acc = 0.0;
  for (int k = -1; k <= 1; k++) {
    float id = cell + float(k);
    float h = hash11(id);
    float on = 0.25 + 0.75 * smoothstep(0.2, 0.6, h);
    float sz = (id + 0.3 + 0.4 * hash11(id + 7.0)) * SHAFT_P;
    float sx = cline(p.y, sz);
    // the sun sweeps slowly, so every shaft leans and swings
    float lean = (RIM - p.y) * (0.06 * sin(sway + h * 4.0) + 0.03);
    vec2 d = vec2(p.x - sx - lean, (p.z - sz) * 0.8);
    float r = 0.14 + 0.16 * hash11(id + 3.0);
    acc += on * exp(-dot(d, d) / (r * r));
  }
  // shafts brighten toward the slit
  return acc * (0.35 + 0.65 * smoothstep(0.0, RIM, p.y));
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr   = max(u_pixelRatio, 0.5);
  vec2  res  = u_resolution;
  vec2  p2   = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec2  q    = gl_FragCoord.xy / pr;
  float spd  = clamp(u_speed, 0.0, 1.0);
  float t    = u_time * spd;
  float dens = clamp(u_strata, 0.4, 2.5);
  float haze = clamp(u_haze, 0.0, 1.5);
  float reach = clamp(u_bounce, 0.3, 2.0);

  // cold shade of the opposite warmth: blue-black under the warm rock
  vec3 coldDeep = vec3(0.010, 0.018, 0.045);
  vec3 coldMid  = vec3(0.045, 0.075, 0.150);

  // camera: low on the floor, creeping forward, looking up-canyon
  float cz = t * 0.55;
  vec3 ro = vec3(cline(0.55, cz), 0.55, cz);
  vec3 ta = vec3(cline(2.4, cz + 6.0), 2.4, cz + 6.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec2 sp = p2 + vec2(-0.08, 0.10);   // put the vanishing depth on a third
  vec3 rd = normalize(fw * 0.78 + rt * sp.x + up * sp.y);

  float sway = u_time * spd * 0.35;
  float tt = 0.05, hitT = -1.0;
  float beam = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * tt;
    float d = map(p, dens);
    if (d < 0.0015 * tt) { hitT = tt; break; }
    float stp = min(d * 0.7, 0.22 + tt * 0.045);
    // dust inside the shafts
    float dust = 0.45 + 0.9 * vnoise(vec2(p.x * 2.0 + p.z * 1.3, p.y * 2.6 - u_time * 0.25));
    beam += shafts(p, sway) * stp * mix(1.0, dust, haze * 0.6);
    tt += stp;
    if (tt > 34.0) break;
  }

  vec3 col;
  vec3 sky = mix(c2, vec3(1.0, 0.97, 0.95), 0.55);
  vec3 pEnd = ro + rd * tt;
  if (hitT < 0.0 && pEnd.y > RIM - 0.2) {
    // through the slit: pale near-white sky, hot where the sun sits
    float lift = smoothstep(0.1, 0.8, rd.y);
    col = mix(c1 * 0.9, sky, lift) * 1.2;
  } else if (hitT < 0.0) {
    // the canyon runs on out of sight into warm dust
    float hy = smoothstep(-0.05, 0.45, rd.y);
    float mist = fbm(vec2(rd.x * 9.0 + cz * 0.4, rd.y * 14.0 - u_time * 0.05));
    col = mix(coldDeep * 1.5, mix(c3 * 0.30, c0 * 0.55, hy), smoothstep(-0.12, 0.25, rd.y));
    col *= 0.75 + 0.5 * mist;
  } else {
    vec3 p = ro + rd * hitT;
    vec3 n = calcN(p, dens);
    bool isFloor = floorD(p) < wallD(p, dens);
    // bounce light: strong near the rim, decaying down the walls
    float L = exp(-(RIM - p.y) * 0.42 / reach);
    vec3 warm = mix(c3 * 0.18, c0, smoothstep(0.10, 0.40, L));
    warm = mix(warm, c1, smoothstep(0.30, 0.65, L));
    warm = mix(warm, c2, smoothstep(0.60, 0.95, L));
    if (isFloor) {
      // rippled sand in cold shade, with pools where the shafts land
      float rip = 0.5 + 0.5 * sin(p.z * 6.0 + 1.6 * sin(p.x * 2.3 + p.z * 0.4));
      float grit = vnoise(p.xz * 22.0);
      vec3 sand = mix(coldDeep, coldMid, 0.35 + 0.4 * rip) * (0.8 + 0.4 * grit);
      sand += c3 * 0.10 * rip;
      float pool = shafts(vec3(p.x, 0.0, p.z), sway);
      sand += pool * mix(c1, c2, 0.6) * (0.9 + 0.3 * rip) * 1.3;
      // warm spill from the lit walls
      sand += c0 * 0.05 * (1.0 - smoothstep(0.0, 0.8, abs(p.x - cline(0.0, p.z)) - hwid(0.0, p.z) + 0.8));
      col = sand;
    } else {
      float ph = strataPh(p, dens);
      float band = fract(ph);
      float fine = vnoise(vec2(ph * 7.0, p.z * 0.6 + p.x * 0.6));
      float grain = fbm(vec2(p.z * 3.0 + p.x * 2.0, p.y * 9.0));
      // alternating pale and wine beds, with fine laminae and grit
      float bedTone = 0.55 + 0.45 * sin(ph * TAU);
      vec3 rock = warm * bedTone * (0.75 + 0.35 * fine) * (0.8 + 0.4 * grain);
      rock = mix(rock, warm * c3 * 1.4, 0.35 * smoothstep(0.75, 0.95, band));
      rock *= 1.0 - 0.35 * smoothstep(0.90, 0.98, fract(ph * 3.0)) * (0.5 + fine);
      // up-facing ledges catch the falling light, under-sides fall into shade
      float upF = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
      float shade = 0.45 + 0.75 * upF;
      // facing across the slot: bounce from the opposite lit wall
      float across = clamp(-n.x * sign(p.x - cline(p.y, p.z)), 0.0, 1.0);
      col = rock * (L * 2.1 + 0.03) * shade * (0.75 + 0.5 * across);
      // cold ambient fills the deep shade without greying the rock
      col += mix(coldDeep, coldMid, upF) * (1.0 - L) * 0.9;
      // rim of the slit glows almost white
      col += sky * smoothstep(RIM - 0.6, RIM, p.y) * 0.6;
    }
    // atmosphere: distant canyon sinks into a warm dusty glow
    float fog = 1.0 - exp(-hitT * 0.075);
    vec3 fogC = mix(coldMid * 1.4, c0 * 0.55, smoothstep(0.0, 4.0, p.y) * 0.8);
    col = mix(col, fogC, fog * 0.75);
  }

  // the shafts themselves, glowing dust from pale sun to coral
  vec3 beamC = mix(c1, c2, 0.55) * 0.95;
  col += beamC * beam * (1.0 + 2.0 * haze);

  // sun fan: the slit throws blades of light down through the dusty air,
  // cut like a slow gobo wheel that swings as the sun moves
  vec2 src = vec2(0.03, 0.62);
  vec2 dv = p2 - src;
  float rr = length(dv);
  float ang = atan(dv.x, -dv.y) + 0.10 * sin(sway * 1.3);
  float sct = ang / TAU * 26.0;
  float sid = floor(sct), sfr = sct - sid;
  float bw = hash11(sid * 3.7 + 5.0);
  bw = smoothstep(0.45, 0.95, bw);
  float blade = bw * smoothstep(0.0, 0.18, sfr) * smoothstep(1.0, 0.55, sfr);
  float cone = smoothstep(0.75, 0.15, abs(ang));
  float air = hitT < 0.0 ? 1.0 : 1.0 - exp(-hitT * 0.18);
  float fdust = 0.5 + 0.8 * fbm(vec2(p2.x * 5.0 + u_time * 0.04, p2.y * 3.0 - u_time * 0.07));
  float fan = blade * cone * air * fdust * exp(-rr * 1.1) * smoothstep(0.02, 0.2, rr);
  col += mix(c1, c2, 0.7) * fan * (0.12 + 0.30 * haze);

  // fine sand grit in the image
  col *= 0.96 + 0.08 * hash21(q);
  col = 1.0 - exp(-col * 1.25);
  gl_FragColor = vec4(col, 1.0);
}
