// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// accretion (Vitrine) - a black hole hanging over a low black puck on a dark
// studio floor, ringed by its disc. Light is bent round the hole, so the far
// side of the disc shows over the top of it and under it, and a thin ring of
// light that has gone round once or more lies close against the black. The
// disc runs fastest on the inside, shearing its streaks into spirals, and the
// side coming toward you burns brighter. Every half minute a star drifts in,
// is stretched and torn into a stream that winds down to the inner edge; the
// inner disc flares as it lands and two jets fire out along the axis. The
// axis leans and swings round once a minute, so the disc tips through every
// angle, from edge on to open.
//
// The FORM block is the sculpture itself, the same code the museum stands on a
// plinth (src/scripts/museum/sculpture.js cuts it out of this file): map(p) and
// shade(id, p, n, rd), in metres from the floor under it, y up, shade in linear
// light. The rest is the gallery stage: the camera, the march, the floor.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_mouseInfluence; // pointer orbits the camera, 0 ignores it  (default 0.0)

// ---- FORM begin ---------------------------------------------------------------
uniform float u_feed;           // how often a star falls in, 1 is every 30 s (default 1.0)
uniform float u_glow;           // how bright the disc burns               (default 1.0)
uniform float u_turn;           // precession, 1 is one turn a minute      (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;
// what a mirror sees from here, linear: the setting defines it
vec3 env(vec3 r);

// this piece is light bent round a hole: volume() below follows each ray
// as the hole bends it, and lays the disc it meets over what is behind
#define VOLUME

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.47, 1.02, 0.47);

const vec3 HOLE = vec3(0.0, 0.55, 0.0);
const float RS = 0.034;     // the horizon
const float RIN = 0.102;    // the inner edge of the disc, three horizons out
const float ROUT = 0.42;
const float REACH = 0.46;   // past this the bending is left out
const float TILT = 0.38;    // how far the axis of the disc leans
const float RD = 0.27;      // where a star that falls in is torn apart
const float PUCK = 0.04;

// the stand: a low black puck under the hole
vec2 map(vec3 p) {
  vec2 w = vec2(length(p.xz) - 0.12, abs(p.y - PUCK * 0.5) - PUCK * 0.5 + 0.008);
  return vec2(min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.008, 1.0);
}

float hash11(float x) { return fract(sin(x * 91.17) * 43758.5453); }
float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
// turn v counterclockwise by a, the way the disc goes round
vec2 spin(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// The feeding, every 30 s: a star drifts in and is stretched as it nears,
// is torn apart at RD (7 s) into a stream that winds in to the inner edge,
// the inner disc flares as the stream lands (from 11 s), and two jets fire
// out along the axis, then all settles until the next.
float cycleLen() { return 30.0 / max(u_feed, 0.05); }
float stage() { return u_feed < 0.01 ? 1e3 : mod(u_time, cycleLen()); }
float flare(float s) { return smoothstep(10.5, 12.5, s) * (1.0 - smoothstep(13.0, 22.0, s)); }
float jets(float s) { return smoothstep(11.5, 13.0, s) * (1.0 - smoothstep(18.0, 24.0, s)); }
// where in the disc this star comes in
float startAngle() { return hash11(floor(u_time / cycleLen()) + 3.0) * TAU; }
// how fast the disc goes round at r, rad/s
float omega(float r) { return 1.6 * pow(RIN / r, 1.5); }

// the axis of the disc leans and swings round; this is the frame it lies
// flat in, the hole at the origin
vec3 toDisc(vec3 v) {
  v.xz *= rot(-u_time * u_turn * TAU / 60.0);
  v.xy *= rot(TILT);
  return v;
}

// how much the disc lights what is under it now
float glowNow() { return u_glow * (1.0 + 2.0 * flare(stage())); }

vec3 shade(float id, vec3 p, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  vec3 r = reflect(rd, n);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float spec = pow(max(dot(r, L), 0.0), 80.0);
  vec3 base = lin(vec3(0.03, 0.03, 0.034)) * (0.3 + 0.7 * max(dot(n, L), 0.0));
  // the disc overhead glows on the top of the puck
  vec3 glow = lin(c0) * 0.025 * glowNow() * max(n.y, 0.0);
  return base + env(r) * fres * 0.5 + spec * 0.8 + glow;
}

// the disc streaks: noise turned round with the flow by a, so the inside
// runs ahead of the outside and drags it out into spirals
float streaks(vec2 u, float r, float a, float seed) {
  vec2 w = spin(u, a);
  return vnoise3(vec3(w * 2.5, r * 70.0 + seed)) * 0.65 + vnoise3(vec3(w * 7.0, r * 170.0 + seed + 3.0)) * 0.35;
}

// the colour of the disc by how hot it looks: the theme deep, white at the top
vec3 heat(float k) {
  vec3 a = mix(lin(c1) * 0.4, lin(c0), clamp(k * 2.0, 0.0, 1.0));
  return mix(a, vec3(1.0, 0.97, 0.92), clamp((k - 0.5) / 0.8, 0.0, 1.0));
}

// The disc where a ray heading v crosses it at x: its light and its cover.
// The side coming toward you is bluer and far brighter than the side going
// away, and the light from deep in is reddened by the climb out.
vec4 disc(vec3 x, vec3 v, float s) {
  float r = length(x.xz);
  if (r < RIN * 0.9 || r > ROUT) return vec4(0.0);
  vec2 u = x.xz / r;
  float om = omega(r);
  // two copies of the sheared streaks, each wound for 8 s and then swapped
  // for a fresh one while the other is at its strongest
  float ta = mod(u_time, 8.0), tb = mod(u_time + 4.0, 8.0);
  float wa = 1.0 - abs(ta / 4.0 - 1.0);
  float n = streaks(u, r, -om * ta, 0.0) * wa + streaks(u, r, -om * tb, 9.0) * (1.0 - wa);
  n = clamp((n - 0.5) * 1.6 + 0.5, 0.0, 1.0);

  // a star torn into a stream, winding in: the head reaches the inner edge
  // at 12 s, the tail by 17 s
  float st = 0.0;
  float T = s - 7.0;
  if (T > 0.0 && T < 12.0) {
    float head = mix(RD, RIN, smoothstep(0.0, 5.0, T));
    float tail = mix(RD + 0.035, RIN, smoothstep(1.5, 10.0, T));
    float band = smoothstep(head - 0.01, head + 0.01, r) * smoothstep(tail + 0.012, tail - 0.004, r);
    vec2 e = vec2(cos(startAngle() + 2.8 + om * T), sin(startAngle() + 2.8 + om * T));
    float d = atan(e.x * u.y - e.y * u.x, dot(e, u)) * r / (0.006 + 0.003 * T);
    st = band * exp(-d * d) * (1.0 - smoothstep(9.0, 12.0, T)) * (0.6 + 0.8 * n);
  }

  // hottest a little out from the inner edge, cooling outward
  float q = RIN / r;
  float f = q * q * (1.0 - sqrt(q)) / 0.0819;
  // its speed toward you and the climb out of the well
  float beta = sqrt(RS / (2.0 * (r - RS)));
  vec3 vd = vec3(-u.y, 0.0, u.x);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(vd, -v)) * sqrt(1.0 - RS / r);
  float fl = flare(s) * smoothstep(RIN * 2.2, RIN, r);
  float hot = f * (0.35 + 1.1 * n) * (1.0 + 3.0 * fl) + st * 1.5;
  vec3 col = heat(min(hot, 1.6) * g * 0.8) * hot * g * g * g * 2.2 * u_glow;
  float cover = smoothstep(RIN * 0.92, RIN * 1.1, r) * smoothstep(ROUT, ROUT * 0.7, r) * clamp(0.3 + 0.8 * n, 0.0, 1.0);
  return vec4(col, clamp(max(cover, st), 0.0, 0.97));
}

// the star before it is torn apart: where it is and how stretched
vec3 starAt(float s) {
  float r = mix(0.43, RD, smoothstep(0.0, 7.0, s));
  float a = startAngle() + 0.4 * s;
  return vec3(cos(a) * r, 0.07 * (1.0 - smoothstep(0.0, 7.0, s)), sin(a) * r);
}

// what glows in the open along the way, the star and the jets, at x
vec3 glowAt(vec3 x, float s) {
  vec3 c = vec3(0.0);
  if (s < 8.0) {
    vec3 sp = starAt(s);
    vec3 along = normalize(starAt(s + 0.1) - sp);
    vec3 d = x - sp;
    float da = dot(d, along);
    float stretch = smoothstep(3.5, 7.0, s);
    float sa = 0.012 * (1.0 + 3.0 * stretch), sq = 0.012 * (1.0 - 0.45 * stretch);
    float e = da * da / (sa * sa) + (dot(d, d) - da * da) / (sq * sq);
    float b = smoothstep(0.0, 1.5, s) * (1.0 - smoothstep(7.0, 8.0, s));
    c += (vec3(1.0, 0.98, 0.95) * 2.0 + lin(c2)) * exp(-e) * b * 40.0;
  }
  float j = jets(s);
  if (j > 0.0) {
    float h = abs(x.y);
    float front = (s - 11.5) * 0.16;
    float w = 0.003 + 0.035 * h;
    float perp = length(x.xz);
    float knots = 0.5 + vnoise3(vec3(x.xz * 30.0, h * 22.0 - s * 6.0 + step(0.0, x.y) * 17.0));
    float on = smoothstep(RS * 1.5, RS * 3.0, h) * smoothstep(front, front - 0.08, h) * (1.0 - smoothstep(REACH * 0.7, REACH, h));
    float core = exp(-perp * perp / (w * w));
    c += (lin(c2) * 2.0 + vec3(1.0) * core) * core * on * knots * j * 9.0 * u_glow;
  }
  return c;
}

// the step to take from x: finer near the hole, the star and the jets
float stepAt(vec3 x, float s) {
  float r = length(x);
  float dt = clamp((r - RS) * 0.12, 0.002, 0.03);
  if (s < 8.0) dt = min(dt, max(0.003, length(x - starAt(s)) * 0.5));
  if (jets(s) > 0.0) dt = min(dt, max(0.004, length(x.xz) * 0.7));
  return dt;
}

// Each ray is followed as the hole bends it: pulled toward the hole the more
// the closer it passes, it can swing round the back and come out above or
// below, so the far side of the disc shows over the top of the hole and under
// it, and close in a thin ring of light that has gone round once or more.
// A ray that falls in shows black. Premultiplied colour and coverage.
vec4 volume(vec3 ro, vec3 rd, float t0, float t1) {
  vec4 acc = vec4(0.0);
  vec3 p = toDisc(ro - HOLE);
  vec3 v = toDisc(rd);
  // where the straight ray comes within the reach of the hole
  float b = dot(p, v);
  float h = b * b - dot(p, p) + REACH * REACH;
  if (h <= 0.0) return acc;
  float tIn = max(-b - sqrt(h), t0);
  if (tIn >= t1) return acc;
  p += v * tIn;
  vec3 lv = cross(p, v);
  float h2 = dot(lv, lv);
  float s = stage();
  float dt = stepAt(p, s) * hash31(rd * 517.0 + fract(u_time));
  for (int i = 0; i < 220; i++) {
    float r = length(p);
    if (r < RS) { acc.a = 1.0; break; }
    if (r > REACH && dot(p, v) > 0.0) break;
    vec3 prev = p;
    float r2 = r * r;
    v = normalize(v - 1.5 * RS * h2 * p / (r2 * r2 * r) * dt);
    p += v * dt;
    // through the plane of the disc
    if (prev.y * p.y <= 0.0 && prev.y != p.y) {
      vec3 x = mix(prev, p, prev.y / (prev.y - p.y));
      vec4 d = disc(x, v, s);
      acc.rgb += (1.0 - acc.a) * d.rgb * d.a;
      acc.a += (1.0 - acc.a) * d.a;
    }
    vec3 g = glowAt(p, s) * dt;
    float gl = dot(g, vec3(0.3, 0.5, 0.2));
    acc.rgb += (1.0 - acc.a) * g;
    acc.a += (1.0 - acc.a) * min(gl * 0.2, 0.5);
    if (acc.a > 0.985) break;
    dt = stepAt(p, s);
  }
  // still circling the hole when the steps ran out: it would have fallen in
  if (length(p) < RS * 1.6) acc.a = 1.0;
  return acc;
}
// ---- FORM end -----------------------------------------------------------------

// ---- the stage ------------------------------------------------------------------
const vec3 SPOT = vec3(0.35, 0.9, 0.55);    // toward the light, as shade has it

// the backdrop: a dim sweep, darker overhead, a little of the theme in it
vec3 sweep(vec3 r) {
  float hz = clamp(r.y * 2.0 + 0.3, 0.0, 1.0);
  return mix(vec3(0.012, 0.012, 0.016) + lin(mix(c0, c1, 0.5)) * 0.02, vec3(0.002), hz);
}

// the stage as a mirror sees it: the floor, the sweep with the spill of the
// lights on it, two broad softboxes in the theme colours either side of the
// camera, a pale one overhead, and the spot
float strip(float az, float centre, float hw) {
  float d = abs(mod(az - centre + 3.14159265, TAU) - 3.14159265);
  return smoothstep(hw, hw * 0.5, d);
}
vec3 env(vec3 r) {
  vec3 c = mix(vec3(0.07, 0.07, 0.075), sweep(r), smoothstep(-0.25, 0.0, r.y));
  c += vec3(0.5, 0.5, 0.52) * smoothstep(-0.08, 0.12, r.y) * smoothstep(0.65, 0.2, r.y);
  float az = atan(r.x, r.z);
  float band = smoothstep(0.0, 0.1, r.y) * smoothstep(0.75, 0.5, r.y);
  c += lin(c0) * 3.0 * strip(az, 2.1, 0.45) * band;
  c += lin(c2) * 2.4 * strip(az, 0.3, 0.4) * band;
  c += vec3(1.1, 1.1, 1.15) * smoothstep(0.78, 0.92, r.y);
  float k = max(dot(r, normalize(SPOT)), 0.0);
  float k2 = k * k, k4 = k2 * k2, k16 = k4 * k4 * k4 * k4;
  return c + k16 * k16 * k16 * 6.0;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.0007, -0.0007);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

// where a ray enters and leaves the bounds box; no entry when x > y
vec2 boxSpan(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (vec3(-BOUNDS.x, 0.0, -BOUNDS.z) - ro) * inv;
  vec3 t1 = (BOUNDS - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), max(lo.z, 0.0)), min(min(hi.x, hi.y), hi.z));
}

// the march, only inside the box: distance to the hit (or -1) and its material
vec2 march(vec3 ro, vec3 rd) {
  vec2 span = boxSpan(ro, rd);
  if (span.x > span.y) return vec2(-1.0, 0.0);
  float t = span.x;
  for (int i = 0; i < 112; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < 0.0004 * t) return vec2(t, h.y);
    t += h.x;
    if (t > span.y) break;
  }
  return vec2(-1.0, 0.0);
}

// soft shadow toward the spot, which gets through wherever the piece is open
float shadowAt(vec3 ro, vec3 rd) {
  vec2 span = boxSpan(ro, rd);
  if (span.x > span.y) return 1.0;
  float res = 1.0, t = max(span.x, 0.01);
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.006, 0.06);
    if (res < 0.01 || t > span.y) break;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  vec2 res = u_resolution;
  vec2 fc  = gl_FragCoord.xy;
  float aspect = res.x / res.y;

  // ---- palette with house fallback (headless can leave the array zeroed) ----
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- camera: a three-quarter view, the spot over your left shoulder ---------
  // far enough back that the whole piece fits, on a tall frame too
  float size = max(BOUNDS.y, BOUNDS.x * 2.0);
  float dist = size * 3.0 * max(1.0, 1.0 / aspect);
  vec2 sp = (fc - res * 0.5) / res.y;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float az = 1.2 + mAmt * (u_mouse.x / res.x - 0.5) * 1.1;
  float el = 0.3 + mAmt * (u_mouse.y / res.y - 0.5) * 0.4;
  vec3 target = vec3(0.0, BOUNDS.y * 0.48, 0.0);
  vec3 ro = target + vec3(sin(az), el, cos(az)) * dist;
  vec3 fw = normalize(target - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 2.1 + rt * sp.x + up * sp.y);

  vec3 L = normalize(SPOT);
  vec3 tint = lin(mix(c0, c1, 0.5));
  vec3 col = sweep(rd);

  // ---- the floor, lit in a pool under the piece ------------------------------
  float tf = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  vec2 hit = march(ro, rd);
  if (tf < 1e8 && (hit.x < 0.0 || tf < hit.x)) {
    vec3 fp = ro + rd * tf;
    vec2 pc = (fp.xz - L.xz * 0.25 * size) / size;
    float pool = exp(-dot(pc, pc) * 2.4);
    float sh = pool > 0.01 ? shadowAt(fp + vec3(0.0, 0.001, 0.0), L) : 1.0;
    // the foot sits in its own contact shadow
    float contact = smoothstep(0.12, 0.4, length(fp.xz) / size);
    vec3 floorC = vec3(0.035, 0.035, 0.04) + tint * 0.012;
    vec3 lit = floorC * (0.12 + 2.6 * pool * sh) * mix(0.45, 1.0, contact);
    col = mix(lit, col, smoothstep(3.0, 8.0, tf / size));
  }

  // ---- the piece -----------------------------------------------------------
  if (hit.x > 0.0) {
    vec3 p = ro + rd * hit.x;
    col = shade(hit.y, p, normalAt(p), rd);
  }

#ifdef VOLUME
  // ---- a piece of smoke: laid over whatever is behind it, up to the stand
  // or the floor if the ray meets them first
  vec2 vs = boxSpan(ro, rd);
  if (vs.x < vs.y) {
    float tEnd = vs.y;
    if (hit.x > 0.0) tEnd = min(tEnd, hit.x);
    tEnd = min(tEnd, tf);
    vec4 v = volume(ro, rd, vs.x, tEnd);
    col = col * (1.0 - v.a) + v.rgb;
  }
#endif

  // ---- out: a gentle shoulder, then display space -----------------------------
  col = col / (1.0 + col * 0.25);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
