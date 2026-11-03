// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// smokering (Vitrine) - a ring of glowing smoke held over the vent it was
// blown from, on a slim post on a dark studio floor. A vortex ring turns in
// on itself: every slice through it spins about the core, so its wisps roll
// endlessly round while the ring hangs in place, riding a little up and down.
// It is the one piece here with no surface, only a density marched through
// its box and laid over the studio, glowing in the theme colours, a little
// brighter on the side toward the spot.
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
uniform float u_roll;           // how fast the ring rolls in on itself     (default 1.0)
uniform float u_density;        // how thick the smoke is                   (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;

// this piece is smoke: volume() below is marched through the box as well as
// map() for its stand, and laid over what is behind it
#define VOLUME

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.4, 0.8, 0.4);

const float FOOT = 0.04;
const float POST = 0.26;
const float VENT = 0.075;   // the radius of the vent the ring came out of
const float RR = 0.22;      // the radius of the ring
const float CORE = 0.05;    // the radius of its smoky core

// the ring rides a little up and down over the vent, as if just blown
vec3 ringCentre() { return vec3(0.0, 0.56 + 0.03 * sin(u_time * 0.31), 0.0); }

// the stand: a round foot, a slim post and the vent, a short tube open on top
vec2 map(vec3 q) {
  vec2 w = vec2(length(q.xz) - 0.15, abs(q.y - FOOT * 0.5) - FOOT * 0.5);
  float foot = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.004;
  float post = max(length(q.xz) - 0.012, abs(q.y - (FOOT + POST * 0.5)) - POST * 0.5);
  float top = FOOT + POST;
  vec2 v = vec2(abs(length(q.xz) - VENT) - 0.008, abs(q.y - top - 0.03) - 0.03);
  float vent = min(max(v.x, v.y), 0.0) + length(max(v, 0.0)) - 0.002;
  vec2 b = vec2(length(q.xz) - VENT, abs(q.y - top - 0.004) - 0.004);
  vent = min(vent, min(max(b.x, b.y), 0.0) + length(max(b, 0.0)));
  return vec2(min(foot, min(post, vent)), 2.0);
}

vec3 shade(float id, vec3 q, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  float dif = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L - rd)), 0.0), 60.0);
  return lin(vec3(0.2, 0.2, 0.22)) * (0.3 + 0.9 * dif) + spec * 0.8;
}

// the four theme colours round a loop, linear
vec3 theme(float a) {
  a = fract(a) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(a));
  vec3 c = a < 1.0 ? mix(c0, c1, f) : a < 2.0 ? mix(c1, c2, f) : a < 3.0 ? mix(c2, c3, f) : mix(c3, c0, f);
  return lin(c);
}

float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}

// The density of the smoke at p, and a shade for its colour from where p
// sits round the core and round the ring, seamless both ways.
// A vortex ring turns in on itself: each slice through the ring spins about
// its core, so the smoke is sampled from a point turned back round the core,
// and the wisps roll as the ring holds its place.
vec2 smoke(vec3 p) {
  vec3 q = p - ringCentre();
  // leaning, as a ring does on its way up
  q.xy *= rot(0.4);
  float rxz = length(q.xz);
  vec2 u = rxz > 1e-4 ? q.xz / rxz : vec2(1.0, 0.0);
  vec2 cs = vec2(rxz - RR, q.y);          // the slice through the ring
  float rho = length(cs);
  if (rho > CORE * 2.6) return vec2(0.0);
  float roll = u_time * u_roll * 0.9;
  vec2 cr = rot(roll) * cs;
  vec3 s = vec3(u.x * (RR + cr.x), cr.y, u.y * (RR + cr.x)) * 12.0;
  float n = vnoise3(s) * 0.55 + vnoise3(s * 2.1 + 7.3) * 0.3 + vnoise3(s * 4.3 + 1.7) * 0.15;
  float shell = exp(-rho * rho / (CORE * CORE * 1.6));
  float dens = max(shell * (0.15 + 1.5 * n) - 0.38, 0.0) * u_density;
  float hue = 0.22 * (cr.y / max(rho, 1e-4)) + 0.12 * u.x + 0.08 * u.y;
  return vec2(dens, hue);
}

// the smoke from t0 to t1 along the ray, glowing in the theme colours, lit a
// little from the spot; premultiplied colour and coverage
vec4 volume(vec3 ro, vec3 rd, float t0, float t1) {
  vec4 acc = vec4(0.0);
  if (t1 <= t0) return acc;
  float dt = (t1 - t0) / 56.0;
  float t = t0 + dt * 0.5;
  for (int i = 0; i < 56; i++) {
    vec3 p = ro + rd * t;
    vec2 sm = smoke(p);
    if (sm.x > 0.0) {
      vec3 c = theme(sm.y + 0.3 - u_time * 0.02);
      float a = 1.0 - exp(-sm.x * dt * 60.0);
      vec3 lit = c * (0.6 + 0.6 * smoothstep(-0.05, 0.08, p.y - ringCentre().y));
      acc.rgb += (1.0 - acc.a) * a * lit;
      acc.a += (1.0 - acc.a) * a;
      if (acc.a > 0.97) break;
    }
    t += dt;
  }
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
