// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// conic (Aura) - three angular sweeps of coloured light, each a conic
// gradient thrown from its own centre: one sits just off the lower-left
// corner, one hangs above the top edge, one drifts inside the frame on the
// right. Every sweep is cut into sectors like a gobo wheel: within a sector
// the light ramps from one palette pole to another and dims toward its
// trailing edge, then jumps hard to the next sector. The three wheels turn
// at different rates and in different directions and their light adds up
// in a dusty room, so the frame is carved into shifting quadrilaterals of
// mixed colour where sectors cross, with a thin bright seam wherever a
// blade edge catches the haze. A cool dark ground, hazy texture and fine
// grain keep it from reading as a flat vector fill.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sectors;   // sectors on the primary wheel            (default 7)
uniform float u_speed;     // rotation rate of the wheels             (default 0.12)
uniform float u_hardness;  // sector edge hardness, 0 soft to 1 crisp (default 0.85)
uniform float u_haze;      // dust and haze texture in the light      (default 0.7)
uniform float u_reach;     // how far each sweep carries              (default 1.0)

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float hash11(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// pick one of the four poles by a continuous index in 0..4
vec3 pole(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 lo = mix(c0, c1, step(1.0, k));
  vec3 hi = mix(c2, c3, step(3.0, k));
  return mix(lo, hi, step(2.0, k));
}

// colour and weight of sector id on wheel seed, at fraction sf across it.
// A sector is a true conic gradient: pole A at its leading edge fading into
// pole B, and brightness falling toward the trailing edge, then a hard stop.
vec4 sector(float id, float sf, float seed, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float hA = hash11(id * 3.1 + seed);
  float hB = hash11(id * 7.7 + seed + 19.0);
  float hW = hash11(id * 5.3 + seed + 41.0);
  vec3 A = pole(hA * 4.0, c0, c1, c2, c3);
  vec3 B = pole(hB * 4.0, c0, c1, c2, c3);
  vec3 col = mix(A, B, sf);
  col = clamp(mix(vec3(luma(col)), col, 1.3), 0.0, 1.0);   // light is purer than pigment
  // some sectors are near-dark blades so the wheel has real contrast
  float w = 0.06 + 0.94 * hW * hW * hW;
  float ramp = mix(1.0, 0.12, sf * sf);
  return vec4(col, w * ramp);
}

// one sweep centre: returns light rgb at p. n sectors, rotation rot, seed.
// px is one device pixel in frame units, used for angular anti-aliasing.
vec3 sweep(vec2 p, vec2 c, float n, float rot, float seed, float px,
           float hard, float reach, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2 d = p - c;
  float r = max(length(d), 1e-4);
  float ang = atan(d.y, d.x) + rot;
  float s = ang / TAU * n;
  float si = floor(s), sf = s - si;
  float id = mod(si, n);
  float idPrev = mod(si - 1.0, n);
  // angular width of one pixel in sector units at this radius
  float wpx = px * n / (TAU * r);
  // soft edges widen the blend well beyond a pixel
  float edgeW = wpx * 1.5 + (1.0 - hard) * 0.35;
  vec4 cur = sector(id, sf, seed, c0, c1, c2, c3);
  vec4 prv = sector(idPrev, 1.0, seed, c0, c1, c2, c3);
  float blend = smoothstep(0.0, edgeW, sf);
  vec3 lit = mix(prv.rgb * prv.a, cur.rgb * cur.a, blend);
  // the blade edge catches the haze: a thin bright seam at every hard stop
  float e = min(sf, 1.0 - sf);
  float seamW = wpx * 2.5 + 0.004;
  float seam = exp(-(e * e) / (seamW * seamW)) * hard;
  lit += seam * 0.55 * mix(cur.rgb, vec3(1.0), 0.35) * (0.4 + 0.6 * cur.a);
  // distance falloff: a bright core that carries far
  float fall = reach / (reach + r * r * 4.5);
  fall += 0.6 * exp(-r * r * 30.0);
  return lit * fall;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  uv     = gl_FragCoord.xy / res;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2  q      = gl_FragCoord.xy / pr;             // css px for grain
  float px     = 1.0 / res.y;                      // one device px, frame units
  float t      = u_time * clamp(u_speed, 0.0, 1.0);
  float hard   = clamp(u_hardness, 0.0, 1.0);
  float haze   = clamp(u_haze, 0.0, 1.5);
  float reach  = max(u_reach, 0.15);
  float nA     = floor(clamp(u_sectors, 3.0, 16.0) + 0.5);
  float nB     = floor(nA * 0.72 + 1.5);
  float nC     = floor(nA * 1.30 + 0.5);

  // ---- the three wheel centres: two outside the frame, one drifting inside
  vec2 cA = vec2(-0.86 * aspect * 0.62, -0.58);                 // off lower-left
  vec2 cB = vec2( 0.30 * aspect,        0.60);                  // above top edge
  vec2 cC = vec2( 0.24 * aspect, -0.06)
          + 0.05 * vec2(cos(t * 1.1 + 1.0), sin(t * 1.4));      // inside, right

  vec3 light = vec3(0.0);
  light += sweep(p, cA, nA,  t * 1.00 + 0.7, 3.0, px, hard, reach, c0, c1, c2, c3);
  light += sweep(p, cB, nB, -t * 0.68 + 2.1, 11.0, px, hard, reach * 0.8, c0, c1, c2, c3) * 0.85;
  light += sweep(p, cC, nC,  t * 1.37 + 4.0, 23.0, px, hard, reach * 0.45, c0, c1, c2, c3) * 0.75;

  // ---- the room: dust and haze modulate the light, coarse and fine
  float dust  = fbm(p * 3.2 + vec2(t * 0.35, -t * 0.22));
  float wisps = fbm(p * 9.0 - vec2(t * 0.6, t * 0.4) + 7.0);
  float hz = 1.0 - haze * 0.62 + haze * (0.80 * dust + 0.44 * wisps);
  hz *= 1.0 + haze * 0.16 * (hash21(q) - 0.5);       // fine grain in the light
  light *= max(hz, 0.0);

  // ---- ground: a cool near-black built from the darkest pole
  float lum = luma(c0 + c1 + c2 + c3) * 0.25;
  vec3 ground = mix(vec3(lum), c3, 0.55) * 0.05 + vec3(0.008);
  ground += 0.02 * c2 * (dust - 0.4);

  vec3 col = ground + light * 1.35;
  // soft shoulder so three summed sweeps roll off instead of clipping
  col = 1.0 - exp(-col * 1.5);

  gl_FragColor = vec4(col, 1.0);
}
