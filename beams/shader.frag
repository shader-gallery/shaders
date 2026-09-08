// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// beams (Aura) - wide angled light bands. Two families of broad soft-edged
// light sheets cross the frame on the diagonal, one raking down to the right,
// the other shallower and rising, so the frame becomes a loose lattice of
// overlapping translucent bands that brighten where they cross. Each band is
// a flat plateau of light with a wide feathered shoulder on both sides, a
// brighter leading edge like a sheet caught at a grazing angle, and a slow
// brightness ripple along its length. Every band carries its own palette
// stop, so overlaps blend hues instead of piling up white. The whole set
// sweeps slowly across the frame, bands drifting apart and bunching on
// unbounded sine phases. A dim tinted field under the bands keeps the gaps
// soft rather than black.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_angle;    // main band angle, degrees from horizontal (default -32)
uniform float u_cross;    // angle of the second family relative     (default 55)
uniform float u_bands;    // bands per family, 1..6                  (default 4)
uniform float u_width;    // band width, fraction of frame height    (default 0.16)
uniform float u_softness; // shoulder feathering, 0 hard .. 1 misty  (default 0.55)
uniform float u_speed;    // sweep pace                              (default 0.4)
uniform float u_glow;     // band brightness                         (default 1.1)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black base
const float TAU = 6.28318530718;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// palette stop by index 0..3, no dynamic indexing
vec3 stop(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float m = mod(k, 4.0);
  return m < 0.5 ? c0 : m < 1.5 ? c1 : m < 2.5 ? c2 : c3;
}

// one family of parallel bands at angle th. p is frame-centred, aspect
// scaled. Returns additive colour.
vec3 family(vec2 p, float th, float seed, float t, float count, float width,
            float soft, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2  dir = vec2(cos(th), sin(th));
  vec2  nrm = vec2(-dir.y, dir.x);
  float s   = dot(p, nrm);      // across the bands
  float l   = dot(p, dir);      // along the bands
  vec3  acc = vec3(0.0);
  // spread the family across the frame diagonal, then let each band sweep
  float spread = 1.5;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= count) break;
    float h0 = hash11(seed + fi * 1.7);
    float h1 = hash11(seed + fi * 3.1 + 9.0);
    float h2 = hash11(seed + fi * 5.3 + 4.0);
    float centre = spread * ((fi + 0.5) / count - 0.5);
    centre += 0.28 * sin(t * (0.10 + 0.08 * h0) + h1 * TAU);
    centre += 0.10 * sin(t * (0.23 + 0.10 * h2) + h0 * TAU);
    float w  = width * (0.6 + 0.9 * h1);
    float d  = abs(s - centre);
    // plateau with a wide soft shoulder
    float inner = w * (1.0 - 0.55 * soft);
    float outer = w * (1.0 + 1.1 * soft);
    float band  = 1.0 - smoothstep(inner, outer, d);
    // brighter leading edge, a sheet caught at a grazing angle
    float edge = smoothstep(outer, inner, d) * (1.0 - smoothstep(inner * 0.2, inner, abs(s - centre - w * 0.4)));
    // slow ripple and a soft dropout along the length
    float rip = 0.72 + 0.28 * sin(l * (1.6 + h2) + t * 0.25 + h1 * TAU);
    float dropout = 0.6 + 0.4 * fbm2(vec2(l * 0.9 + h0 * 10.0, fi * 2.0 + t * 0.03));
    float lit = (band * 0.85 + edge * 0.5) * rip * dropout;
    vec3  col = stop(fi + seed, c0, c1, c2, c3);
    col = mix(col, stop(fi + seed + 1.0, c0, c1, c2, c3), 0.5 + 0.5 * sin(l * 0.8 + h0 * TAU));
    acc += col * lit;
  }
  return acc;
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = gl_FragCoord.xy / res;
  float asp = res.x / max(res.y, 1.0);
  vec2  p   = vec2((uv.x - 0.5) * asp, uv.y - 0.5);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t     = u_time * max(u_speed, 0.0);
  float thA   = radians(u_angle);
  float thB   = thA + radians(u_cross);
  float count = clamp(floor(u_bands + 0.5), 1.0, 6.0);
  float width = max(u_width, 0.02);
  float soft  = clamp(u_softness, 0.0, 1.0);

  vec3 acc = family(p, thA, 0.0, t, count, width, soft, c0, c1, c2, c3);
  // the crossing family is one band fewer, a little wider, softer and dimmer,
  // so it reads as light crossing behind the main bands rather than a grid
  acc += 0.7 * family(p, thB, 2.0, t * 0.85, max(count - 1.0, 1.0), width * 1.25,
                      min(soft + 0.15, 1.0), c0, c1, c2, c3);

  // dim tinted field under the bands, drifting slowly, so gaps stay soft
  float fld = fbm2(p * 1.4 + vec2(t * 0.02, -t * 0.015));
  vec3  fieldCol = mix(c0, c1, fld) * 0.08 * (0.4 + fld);
  acc += fieldCol;

  vec3 col = BG + (1.0 - exp(-acc * max(u_glow, 0.0)));

  // hash dither against banding in the wide soft shoulders
  col += (hash21(gl_FragCoord.xy + fract(t)) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
