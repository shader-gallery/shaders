// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// smokering (Vitrine) - rings of smoke blown one after another from a vent on a
// slim post on a dark studio floor. Each ring rises, widens and leans as it
// goes, and turns in on itself as a vortex ring does, every slice through it
// spinning about its core, winding the smoke it carries into two arms that
// spiral in to a glowing core, streaked along the flow, its edge fraying and
// shedding in tatters until it thins away and the next comes up. No surface,
// only density: the cores glow in the theme, the smoke round them is grey,
// lit by the spot and shadowed by itself where it is thick.
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
uniform float u_roll;           // how fast each ring rolls in on itself    (default 1.0)
uniform float u_density;        // how thick the smoke is                   (default 1.0)
uniform float u_turn;           // turntable speed, 1 is one turn a minute  (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the turntable: a point or direction in the frame of the piece
vec3 turned(vec3 p) { p.xz *= rot(u_time * u_turn * TAU / 60.0); return p; }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;

// this piece is smoke: volume() below is marched through the box as well as
// map() for its stand, and laid over what is behind it
#define VOLUME

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.42, 1.12, 0.42);

const float FOOT = 0.04;
const float POST = 0.26;
const float VENT = 0.075;   // the radius of the vent the rings come out of
const float MOUTH = FOOT + POST + 0.06;  // the height of its open top
const float PERIOD = 14.0;  // seconds between rings
const float TILT = 0.5;     // how far a ring leans once it is up

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
  return lin(vec3(0.09, 0.09, 0.1)) * (0.3 + 0.9 * dif) + spec * 0.3;
}

float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}

// One ring, at age f (0 just out of the vent, 1 gone): the density of its
// glowing core (x) and of the smoke wrapped round it (y). A vortex ring turns
// in on itself, every slice through it spinning about the core, and as it
// does it winds the smoke it carries into two arms spiralling in to the core,
// streaked along the flow; its outer edge frays and sheds. It rises, widens
// and leans as it ages, and thins away at the top.
vec2 ring(vec3 p, float f, float seed) {
  float y = MOUTH + 0.04 + f * 0.6;
  float R = 0.05 + 0.18 * sqrt(f);
  float s = 0.55 + 0.45 * f;                 // the slice grows with the ring
  vec3 q = turned(p - vec3(0.0, y, 0.0));
  q.xy *= rot(TILT * smoothstep(0.0, 0.5, f) + 0.25 * seed);
  float rxz = length(q.xz);
  vec2 u = rxz > 1e-4 ? q.xz / rxz : vec2(1.0, 0.0);
  vec2 cs = vec2(rxz - R, q.y);              // the slice through the ring
  float rho = length(cs) / s;
  if (rho > 0.12) return vec2(0.0);
  float phi = atan(cs.y, cs.x) - u_time * u_roll * 1.4 - seed * 3.0;
  float core = exp(-rho * rho / (0.018 * 0.018));
  // the two arms, wound tighter toward the core
  float arms = 0.5 + 0.5 * sin(2.0 * phi + rho * 150.0);
  // streaks: fine across the flow (round the ring and out from the core),
  // coarse along it
  vec3 nq = vec3(u * R * 26.0, rho * 40.0 + 0.6 * cos(phi)) + seed * 11.0;
  float n = vnoise3(nq) * 0.6 + vnoise3(nq * 2.3 + 3.1) * 0.4;
  float band = (rho - 0.045) / 0.028;
  float sheath = smoothstep(0.45, 1.0, arms) * exp(-band * band) * (0.25 + 1.3 * n);
  // the frayed edge, shed in tatters
  float edge = (rho - 0.085) / 0.022;
  float shed = max(n - 0.55, 0.0) * 2.2 * exp(-edge * edge);
  float fade = smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.6, 1.0, f));
  return vec2(core * (1.0 - 0.6 * f), sheath + shed) * fade;
}

// two rings in the air at once, half a period apart
vec2 smoke(vec3 p) {
  float t = u_time / PERIOD;
  return ring(p, fract(t), 0.0) + ring(p, fract(t + 0.5), 1.0);
}

// the smoke from t0 to t1 along the ray: the cores glow in the theme, the
// smoke round them is grey and lit by the spot, shadowed by itself where it
// is thick; premultiplied colour and coverage
vec4 volume(vec3 ro, vec3 rd, float t0, float t1) {
  vec4 acc = vec4(0.0);
  if (t1 <= t0) return acc;
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  // light scattered toward you is brighter looking into the spot
  float phase = 0.55 + 0.45 * dot(rd, L);
  vec3 hot = lin(c0);
  float dt = (t1 - t0) / 64.0;
  float t = t0 + dt * (0.5 + 0.5 * hash31(rd * 517.0));
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * t;
    vec2 d = smoke(p) * u_density;
    if (d.x + d.y > 0.002) {
      float tau = smoke(p + L * 0.035).y * u_density;
      float lit = exp(-tau * 2.4);
      float a = 1.0 - exp(-(d.x * 0.5 + d.y) * dt * 70.0);
      vec3 grey = vec3(0.7, 0.69, 0.74) * (0.1 + 1.3 * lit * phase) + lin(c1) * 0.06;
      vec3 glow = mix(hot * 3.5, vec3(2.0), d.x * d.x * 0.3) * d.x;
      acc.rgb += (1.0 - acc.a) * (a * grey + glow * dt * 70.0);
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
