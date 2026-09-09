// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// boids (Shoal) - a murmuration streaming across the whole frame at dusk.
// There is no feedback buffer, so the flock is not simulated step by step;
// it is written as a closed-form motion that has the three boid rules baked
// in. Alignment: every bird shares one swarm path with an analytic velocity,
// plus coherent turning waves that roll through the flock, so neighbours
// bank together. Cohesion: a slow travelling density field decides where
// the flock is thick and where it is empty, and each bird is pulled up the
// gradient of that field, so clumps pile up and gaps open between them.
// Separation: every bird keeps its own slot in a hashed lattice with its own
// jostle, so no two ever coincide. Each bird is a small swept-wing mark
// oriented along its own finite-difference velocity, flapping on its own
// clock, dragging a fading motion trail. Three parallax layers give depth:
// far birds small, dim and fogged; near ones large and bright.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;    // flight speed of the whole swarm        (default 1.0)
uniform float u_density;  // how much of the sky the flock fills    (default 0.5)
uniform float u_trail;    // motion trail length                    (default 1.0)
uniform float u_size;     // bird size                              (default 1.0)
uniform float u_turn;     // strength of the turning waves          (default 1.0)

vec3 c0, c1, c2, c3;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) { return vec2(hash21(p), hash21(p + vec2(41.3, 17.9))); }

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

// the swarm path in frame units and its analytic velocity: a stream along
// x with slow banking S-curves, so the whole flock crosses and re-crosses
vec2 swarmPos(float t) {
  return vec2(0.30 * t + 0.45 * sin(t * 0.21),
              0.70 * sin(t * 0.17 + 1.0) + 0.25 * sin(t * 0.41));
}
vec2 swarmVel(float t) {
  return vec2(0.30 + 0.0945 * cos(t * 0.21),
              0.119 * cos(t * 0.17 + 1.0) + 0.1025 * cos(t * 0.41));
}

// cohesion field: three travelling plane waves in swarm space. Returns the
// value and its analytic gradient so birds can be pulled toward the thick.
vec3 cohesion(vec2 x, float t) {
  vec2 k1 = vec2(3.1, 1.2), k2 = vec2(-1.4, 2.7), k3 = vec2(2.0, -2.4), k4 = vec2(0.7, 0.5);
  float a1 = dot(x, k1) + t * 0.31;
  float a2 = dot(x, k2) - t * 0.23;
  float a3 = dot(x, k3) + t * 0.19 + 2.0;
  float a4 = dot(x, k4) - t * 0.11 + 1.0;      // the broad wave that opens big gaps
  float v = sin(a1) + 0.8 * sin(a2) + 0.6 * sin(a3) + 1.1 * sin(a4);
  vec2 g = k1 * cos(a1) + 0.8 * k2 * cos(a2) + 0.6 * k3 * cos(a3) + 1.1 * k4 * cos(a4);
  return vec3(v, g);
}

// per-bird displacement inside its slot at time t: cohesion pull, turning
// waves, individual jostle. In units of one cell.
vec2 jostle(vec2 wc, vec2 h, float t, float turn) {
  vec3 co = cohesion(wc, t);
  vec2 pull = co.yz / (1.0 + length(co.yz)) * 0.38;
  // coherent turning waves rolling through the flock
  float wph = dot(wc, vec2(2.6, 1.4)) - t * 1.3;
  float wph2 = dot(wc, vec2(-1.2, 2.9)) + t * 0.9;
  vec2 wave = turn * 0.12 * vec2(sin(wph) + 0.6 * cos(wph2), cos(wph) * 0.7 + 0.6 * sin(wph2));
  // the individual: a small jitter on its own clock
  vec2 jit = 0.05 * vec2(sin(t * (1.6 + 1.5 * h.x) + h.y * 6.2832),
                         cos(t * (1.3 + 1.5 * h.y) + h.x * 6.2832));
  return pull + wave + jit;
}

// one parallax layer of the flock. p frame coords, cell in frame units,
// par parallax factor, near 0 (far) .. 1 (close)
void flock(vec2 p, float cell, float par, float seed, float near, float t,
           float px, inout vec3 acc) {
  vec2 O  = swarmPos(t) * par;
  vec2 Ov = swarmVel(t) * par;
  vec2 w  = p - O;                    // swarm-space coords
  vec2 q  = w / cell;
  vec2 ci = floor(q);

  float bodyLen = (0.20 + 0.06 * (1.0 - near)) * u_size * cell;
  float trailLen = 0.55 * u_trail * cell;
  float dens = clamp(u_density, 0.0, 1.0);
  float turn = clamp(u_turn, 0.0, 2.0);
  float dt = 0.06;

  vec3 birdCol = mix(c2, c1, 0.3) * (0.6 + 0.7 * near);
  vec3 fog = mix(c3, c0, 0.4) * 0.35;
  birdCol = mix(fog + c2 * 0.15, birdCol, 0.35 + 0.65 * near);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = ci + vec2(float(x), float(y));
      vec2 h  = hash22(id + seed * 13.1);
      float h3 = hash21(id * 1.71 + seed * 3.7);
      // the slot centre in swarm space, jittered
      vec2 slot = (id + 0.5 + (h - 0.5) * 0.6) * cell;
      // cohesion decides whether this slot holds a bird
      float co = cohesion(slot, t).x;
      float density = smoothstep(0.5 - 2.0 * dens, 2.0 - 1.6 * dens, co + 0.2);
      if (h3 > density) continue;

      vec2 d0 = jostle(slot, h, t, turn);
      vec2 d1 = jostle(slot, h, t - dt, turn);
      vec2 pos = slot + d0 * cell;
      // heading: the swarm velocity plus a damped share of the local jostle,
      // so neighbours bank together instead of scattering
      vec2 vel = Ov + 0.45 * (d0 - d1) * cell / dt;
      float spd = length(vel);
      vec2 u = vel / max(spd, 1e-4);
      vec2 v = vec2(-u.y, u.x);

      vec2 r = w - pos;
      vec2 loc = vec2(dot(r, u), dot(r, v));

      // the boid glyph: a dart, nose forward, with a notched tail, the
      // classic flocking mark. The flap on this bird alone narrows and
      // widens it, so the flock shimmers instead of stamping one shape.
      float flap = sin(t * (9.0 + 4.0 * h.x) + h.y * 6.2832);
      float wid = 0.42 * (0.65 + 0.35 * abs(flap));
      vec2 ay = vec2(loc.x / bodyLen, abs(loc.y) / bodyLen);   // fold, in body units
      float taper = ay.y - wid * (0.62 - ay.x) / 1.0;           // side edge to the nose
      float notch = (-0.38 + 0.45 * ay.y) - ay.x;               // concave tail
      float nose  = ay.x - 0.62;
      float mark = max(max(taper * 0.85, notch * 0.8), nose) * bodyLen;

      // soft focus on the near layer, crisp specks far away
      float aa = px * (0.8 + 2.2 * near);
      float alpha = 1.0 - smoothstep(-aa * 0.5, aa, mark);
      // motion trail: a fading streak behind the tail, longer when faster
      float tl = trailLen * clamp(spd * 2.2, 0.6, 2.4);
      float s = clamp(-loc.x / tl, 0.0, 1.0);
      float onTrail = step(loc.x, 0.0);
      float tw = bodyLen * 0.05 * (1.0 - s) + px * 0.4;
      float trail = (1.0 - smoothstep(tw - px, tw + px * 1.5, abs(loc.y))) * onTrail
                  * (1.0 - s) * (1.0 - s) * step(-loc.x, tl) * step(bodyLen * 0.25, -loc.x);
      trail *= 0.42;

      vec3 col = birdCol * (0.85 + 0.3 * h3);
      // a faint glow around the near birds
      float glowR = max(mark, 0.0) / (bodyLen * 0.9);
      float glow = exp(-glowR * glowR * 2.0) * 0.10 * near;
      acc = mix(acc, col, max(alpha, trail));
      acc += col * glow;
    }
  }
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  float px     = 2.0 / u_resolution.y;
  float t      = u_time * clamp(u_speed, 0.0, 3.0) + 24.0;

  // ---- dusk sky: dark zenith tinted by the deep pole, a haze band low
  // down lit by the pale pole, slow cloud in between
  vec3 zenith = mix(vec3(0.02, 0.025, 0.04), c3, 0.18);
  vec3 haze   = mix(vec3(0.16, 0.15, 0.17), c2, 0.28);
  vec3 dusk   = mix(vec3(0.10, 0.08, 0.10), c1, 0.30);
  float hz = smoothstep(0.9, -0.85, uv.y * 2.0 - 1.0);
  vec3 sky = mix(zenith, dusk, hz * hz * 0.9);
  sky = mix(sky, haze, smoothstep(-0.3, -1.0, p.y) * 0.7);
  // long dusk cloud bands, stretched along the horizon, drifting slowly
  float cloud = fbm(vec2(p.x * 0.45 - u_time * 0.012, p.y * 2.6) + 3.0);
  float bands = smoothstep(0.35, 0.75, cloud);
  sky = mix(sky, sky * 0.6 + dusk * 0.25, bands * 0.55 * (0.4 + 0.6 * hz));
  sky += (cloud - 0.5) * 0.05 * mix(c1, c2, 0.5);
  // a low sun glow off to one side, mostly below the frame
  vec2 sunP = vec2(-0.9 * aspect * 0.6, -1.25);
  float sd = length((p - sunP) * vec2(0.6, 1.0));
  sky += mix(c2, c1, 0.4) * exp(-sd * sd * 0.9) * 0.28;

  vec3 acc = sky;
  // far to near: cell in frame units (height 2), parallax, seed, nearness
  flock(p, 0.075, 0.55, 1.0, 0.0, t, px, acc);
  flock(p, 0.125, 0.80, 2.0, 0.5, t, px, acc);
  flock(p, 0.230, 1.10, 3.0, 1.0, t, px, acc);

  gl_FragColor = vec4(acc, 1.0);
}
