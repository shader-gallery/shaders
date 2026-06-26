// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Contour --- a topographic map of terrain that does not exist (family: Strata)
//
// A slow FBM heightfield seen in plan view, rendered purely as thin glowing
// isolines on the near-black house base. Every fifth line --- the index
// contours --- draws brighter and roughly twice as wide. Line hue blends
// through the four palette colours by elevation, so valley floors and
// ridgetops sit at opposite ends of the restrained rainbow; steep slopes
// read as tight bunches of line, plateaus as open dark water.
//
// Motion: the heightfield morphs through a third noise dimension at
// geological patience, while a slow phase drift on the contour threshold
// makes every line creep uphill in place --- lines crawl, pinch, merge and
// split. Both motions are phase-continuous offsets: no wrap, no reset.

precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // unused --- shader is fully presentable without it
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_morphSpeed;  // terrain deformation rate; 0 freezes the land   (default 0.3)
uniform float u_density;     // contour levels across the height range          (default 12)
uniform float u_lineWidth;   // ordinary isoline width, css px, scaled by u_pixelRatio (default 1.2)

const float SCALE      = 2.3;    // noise cells across the short edge
const float PHASE_RATE = 0.05;   // contour-threshold drift, cycles per second
const float MORPH_GAIN = 0.12;   // u_morphSpeed -> z-drift rate
const float AA         = 0.75;   // stroke antialias half-band, device px

// ---- 3D value noise + fbm -----------------------------------------------

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

const mat2 ROT2 = mat2(0.80, 0.60, -0.60, 0.80);

// 5-octave fbm, normalized to ~[0,1]. The z axis is the morph dimension;
// it scales gently per octave so fine detail deforms calmly, not jittery.
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = vec3(ROT2 * p.xy * 2.02, p.z * 1.30 + 9.7);
    a *= 0.5;
  }
  return s * 1.0322581; // / 0.96875
}

// elevation -> palette ramp (tent-weighted blend, no dynamic indexing)
vec3 ramp(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  return a * max(0.0, 1.0 - abs(t))
       + b * max(0.0, 1.0 - abs(t - 1.0))
       + c * max(0.0, 1.0 - abs(t - 2.0))
       + d * max(0.0, 1.0 - abs(t - 3.0));
}

// fbm rarely hits 0 or 1 --- stretch the realized band across the full ramp
float elevT(float h) { return clamp((h - 0.25) * 2.0, 0.0, 1.0); }

void main() {
  // palette + house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr = max(u_pixelRatio, 0.25);
  float D  = max(u_density, 0.5);

  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / mn;

  float e = SCALE / mn;                              // one device px in noise units
  float z = 1.73 + u_time * u_morphSpeed * MORPH_GAIN;
  vec3  q = vec3(uv * SCALE + vec2(3.1, 7.7), z);

  // heightfield + screen-space gradient (finite differences, one pixel)
  float hN  = fbm(q);
  float hNx = fbm(q + vec3(e, 0.0, 0.0));
  float hNy = fbm(q + vec3(0.0, e, 0.0));
  float slopePx = length(vec2(hNx - hN, hNy - hN));  // dh per device pixel

  // contour field: integer crossings of f are the level lines. The phase
  // drift slides every threshold downward through f, so each line creeps
  // uphill --- continuous, never wrapping.
  float phase = u_time * PHASE_RATE;
  float f     = hN * D - phase;
  float lf    = floor(f);
  float dfpx  = max(D * slopePx, 1e-5);              // contour cycles per device px

  float p0 = (f - lf) / dfpx;                        // px to the level below
  float p1 = (lf + 1.0 - f) / dfpx;                  // px to the level above

  float idx0 = step(mod(lf, 5.0), 0.5);              // every fifth = index contour
  float idx1 = step(mod(lf + 1.0, 5.0), 0.5);

  float wBase = max(u_lineWidth, 0.05) * pr;         // ordinary full width, device px
  float half0 = 0.5 * wBase * (1.0 + idx0);          // index contours ~2x wide
  float half1 = 0.5 * wBase * (1.0 + idx1);

  float a0 = (1.0 - smoothstep(half0 - AA, half0 + AA, p0)) * mix(0.55, 1.0, idx0);
  float a1 = (1.0 - smoothstep(half1 - AA, half1 + AA, p1)) * mix(0.55, 1.0, idx1);

  // soft halo hugging each stroke, a touch stronger on index contours
  float g0 = exp(-p0 / (half0 * 3.0 + 2.5)) * mix(0.05, 0.14, idx0);
  float g1 = exp(-p1 / (half1 * 3.0 + 2.5)) * mix(0.05, 0.14, idx1);

  // line colour from the elevation of its own level (lf <-> hN at the line)
  vec3 col0 = ramp(elevT((lf + phase) / D),       c0, c1, c2, c3);
  vec3 col1 = ramp(elevT((lf + 1.0 + phase) / D), c0, c1, c2, c3);
  vec3 lines = col0 * (a0 + g0) + col1 * (a1 + g1);

  // where bunches over-tighten past pixel resolution, fade strokes into the
  // mean coverage tone instead of letting them moire
  float resv    = 1.0 - smoothstep(0.18, 0.45, dfpx);
  float avgTone = clamp(wBase * dfpx * 0.8, 0.0, 0.6);
  vec3  fragHue = ramp(elevT(hN), c0, c1, c2, c3);
  vec3  lineCol = mix(fragHue * avgTone, lines, resv);

  // near-black base with the faintest elevation tint, so plateaus read as
  // deep dark water rather than dead pixels
  float eF = elevT(hN);
  vec3  bg = vec3(0.035, 0.035, 0.043) + fragHue * (0.010 + 0.020 * eF);

  // gentle vignette holding the corners down
  float r   = length((gl_FragCoord.xy - 0.5 * res) / (0.5 * res));
  float vig = 1.0 - 0.34 * smoothstep(0.55, 1.45, r);

  vec3 col = (bg + lineCol) * vig;
  col += (hash3(vec3(gl_FragCoord.xy, 0.5)) - 0.5) / 255.0;  // de-banding dither
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
