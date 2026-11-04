// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// resonance (Vitrine) - a dark steel sphere on a slim rod on a dark studio
// floor, pulled into one standing form after another, each a pattern a sphere
// can be made to hold, gathered to a symmetry: twelve round knobs on the
// corners of an icosahedron, a star of eight sharp corners, a ribbed dome
// drawn up to a tip, the knobs wound into spirals, twelve deep dimples, and
// twelve spikes. Each holds still like machined metal, then eases into the
// next. The steel mirrors the studio, and light in the theme pools faintly in
// the deepest hollows.
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
uniform float u_depth;          // how far each form stands out            (default 1.0)
uniform float u_pace;           // how fast it moves from form to form     (default 1.0)
uniform float u_turn;           // turntable speed, 1 is one turn a minute  (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the turntable: a point or direction in the frame of the piece
vec3 turned(vec3 p) { p.xz *= rot(u_time * u_turn * TAU / 60.0); return p; }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;
// what a mirror sees from here, linear: the setting defines it
vec3 env(vec3 r);

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.36, 1.12, 0.36);

const float R = 0.2;            // the sphere at rest
const vec3 C = vec3(0.0, 0.76, 0.0);
const float HOLD = 10.0;        // seconds from one form to the next
const float AMP = 0.07;         // how far a form stands out at 1

// how near u lies to one of a set of axes, sharper the larger k: 1 on an
// axis, falling away between them
float icoAxes(vec3 u, float k) {
  const float P = 1.618034;
  const float N = 0.525731;     // 1 over the length of (0, 1, P)
  return pow(abs(dot(u, vec3(0.0, 1.0, P) * N)), k) + pow(abs(dot(u, vec3(0.0, 1.0, -P) * N)), k)
       + pow(abs(dot(u, vec3(1.0, P, 0.0) * N)), k) + pow(abs(dot(u, vec3(1.0, -P, 0.0) * N)), k)
       + pow(abs(dot(u, vec3(P, 0.0, 1.0) * N)), k) + pow(abs(dot(u, vec3(-P, 0.0, 1.0) * N)), k);
}
float cubeAxes(vec3 u, float k) { vec3 a = abs(u); return pow(a.x, k) + pow(a.y, k) + pow(a.z, k); }
float octAxes(vec3 u, float k) {
  const float N = 0.57735;
  return pow(abs(dot(u, vec3(1.0, 1.0, 1.0) * N)), k) + pow(abs(dot(u, vec3(1.0, 1.0, -1.0) * N)), k)
       + pow(abs(dot(u, vec3(1.0, -1.0, 1.0) * N)), k) + pow(abs(dot(u, vec3(-1.0, 1.0, 1.0) * N)), k);
}

// The forms it is pulled into, in turn, at direction u on the sphere: how
// far out (1 is AMP) the surface stands there. Each is a standing pattern
// a sphere can be made to hold, gathered to a symmetry.
float form(vec3 u, float k) {
  // twelve round knobs on the corners of an icosahedron
  if (k < 0.5) return 1.5 * (icoAxes(u, 6.0) - 0.7556) / 0.2844 - 0.6;
  // eight sharp corners of a star, the faces between them drawn in
  if (k < 1.5) return 1.6 * octAxes(u, 14.0) - 1.1 * (cubeAxes(u, 6.0) - 0.111) / 0.889 + 0.2;
  // a dome drawn up into a tip, ribbed like a melon
  if (k < 2.5) {
    float ribs = cos(10.0 * atan(u.z, u.x)) * (1.0 - u.y * u.y);
    return 0.9 * (1.5 * u.y * u.y - 0.5) + 0.9 * pow(max(u.y, 0.0), 8.0) + 0.45 * ribs;
  }
  // the twelve knobs, wound round the axis into spirals
  if (k < 3.5) {
    vec3 w = u;
    w.xz *= rot(2.4 * u.y);
    return 2.2 * (icoAxes(w, 16.0) - 0.076) / 0.924 - 0.6;
  }
  // twelve deep dimples, with eight knobs left standing between them
  if (k < 4.5) return 1.3 * octAxes(u, 10.0) - 1.6 * (icoAxes(u, 16.0) - 0.076) / 0.924 + 0.3;
  // twelve spikes
  return 2.4 * icoAxes(u, 30.0) - 0.45;
}

// how far the surface stands out at u right now: each form held, then
// eased into the next
float swell(vec3 u) {
  float t = u_time * u_pace / HOLD;
  float k = mod(floor(t), 6.0);
  float w = smoothstep(0.55, 0.95, fract(t));
  float d = form(u, k);
  if (w > 0.0) d = mix(d, form(u, mod(k + 1.0, 6.0)), w);
  return d * u_depth;
}

float sdCyl(vec3 p, float r, float h) {
  vec2 w = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

// the stand: a round foot and a slim rod up into the sphere; on it the
// sphere, pulled into one form after another
vec2 map(vec3 p) {
  float foot = sdCyl(p - vec3(0.0, 0.015, 0.0), 0.13, 0.015) - 0.004;
  float rod = sdCyl(p - vec3(0.0, C.y * 0.5, 0.0), 0.008, C.y * 0.5);
  vec2 res = vec2(min(foot, rod), 1.0);
  vec3 q = p - C;
  float r = length(q);
  // far from it the widest any form reaches is near enough
  float ds = r - R - AMP * 2.6;
  if (ds > 0.02) return ds < res.x ? vec2(ds, 2.0) : res;
  ds = (r - R - AMP * swell(turned(q / max(r, 1e-4)))) * 0.5;
  return ds < res.x ? vec2(ds, 2.0) : res;
}

// steel, a dark mirror of the studio; light in the theme pools faintly in
// the deepest hollows of each form
vec3 shade(float id, vec3 p, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  vec3 r = reflect(rd, n);
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float spec = pow(max(dot(r, L), 0.0), 90.0);
  vec3 steel = lin(vec3(0.06, 0.06, 0.065)) * (0.3 + 0.8 * max(dot(n, L), 0.0)) + env(r) * (0.25 + 0.6 * fres) * vec3(0.8, 0.82, 0.86) + spec * 1.2;
  if (id < 1.5) return steel;
  float d = swell(turned(normalize(p - C)));
  return steel + lin(c0) * 0.5 * smoothstep(-0.35, -0.9, d);
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
