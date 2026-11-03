// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// armillary (Vitrine) - four rings nested in a gimbal round a small burning
// core, held up on a post on a dark studio floor. Each ring pivots inside the
// one outside it, on pins across the axis the last one turned on, at its own
// slow pace, so they fall into line and out again and never repeat. The rings
// are dark steel, each with a line of light round its inside in a theme
// colour; the core lights the steel that faces it. One spot from the upper
// left pools on the floor and throws the shadow of the rings across it.
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
uniform float u_turn;           // turntable speed, 1 is one turn a minute  (default 1.0)
uniform float u_gimbal;         // how fast the rings turn in their gimbal  (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the turntable: a point or direction in the frame of the piece
vec3 turned(vec3 p) { p.xz *= rot(u_time * u_turn * TAU / 60.0); return p; }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.56, 1.32, 0.56);

const float FOOT = 0.05;
const float POST = 0.16;
const float RO = 0.5;       // the outer ring radius
const float CY = FOOT + POST + RO + 0.03;  // the centre of the gimbal

// a ring in its frame xy plane, radius r, w wide and d deep
float ring(vec3 p, float r, float w, float d) {
  vec2 q = abs(vec2(length(p.xy) - r, p.z)) - vec2(w, d);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.003;
}
float pin(vec2 p, float r) { return length(p) - r; }
float box(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }

// each ring frame: turned on y, then x, then y, then x, inside the last
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void frames(vec3 p, out vec3 f[4]) {
  float t = u_time * u_gimbal;
  f[0] = rotY(t * 0.105) * p;
  f[1] = rotX(t * 0.17 + 1.0) * f[0];
  f[2] = rotY(t * 0.23 + 2.0) * f[1];
  f[3] = rotX(t * 0.31 + 3.0) * f[2];
}

// distance, material (1 a ring, 2 the steel, 3 the core), and which ring
vec3 parts(vec3 q) {
  vec3 p = q - vec3(0.0, CY, 0.0);
  vec3 f[4];
  frames(p, f);
  vec3 r = vec3(1e9, 0.0, 0.0);
  for (int i = 0; i < 4; i++) {
    float d = ring(f[i], RO - 0.085 * float(i), 0.012, 0.02 - 0.003 * float(i));
    if (d < r.x) r = vec3(d, 1.0, float(i));
  }
  // the pins each ring turns on, short stubs across the gap to the one
  // outside it (for the outer ring, out to the post and a cap above)
  float pins = max(pin(f[0].xz, 0.006), abs(abs(f[0].y) - RO - 0.01) - 0.03);
  pins = min(pins, max(pin(f[1].yz, 0.005), abs(abs(f[1].x) - RO + 0.0425) - 0.045));
  pins = min(pins, max(pin(f[2].xz, 0.005), abs(abs(f[2].y) - RO + 0.1275) - 0.045));
  pins = min(pins, max(pin(f[3].yz, 0.004), abs(abs(f[3].x) - RO + 0.2125) - 0.045));
  // the post and the foot
  float post = max(pin(q.xz, 0.014), abs(q.y - (FOOT + POST * 0.5)) - POST * 0.5 - 0.02);
  float foot = box(q - vec3(0.0, FOOT * 0.5, 0.0), vec3(0.2, FOOT * 0.5, 0.2)) - 0.004;
  float steel = min(pins, min(post, foot));
  if (steel < r.x) r = vec3(steel, 2.0, 0.0);
  float core = length(p) - 0.06 - 0.006 * sin(u_time * 1.7);
  if (core < r.x) r = vec3(core, 3.0, 0.0);
  return r;
}

vec2 map(vec3 q) { vec3 r = parts(q); return vec2(r.x, r.y + r.z * 10.0); }

// ring i takes theme colour i, linear
vec3 ringColour(int i) { return lin(i == 0 ? c0 : i == 1 ? c1 : i == 2 ? c2 : c3); }

vec3 shade(float id, vec3 q, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  float dif = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L - rd)), 0.0), 70.0);
  vec3 steel = lin(vec3(0.2, 0.2, 0.22)) * (0.3 + 0.9 * dif) + spec * 0.9;
  vec3 p = q - vec3(0.0, CY, 0.0);
  // the light of the core on whatever faces it
  float toward = max(dot(n, -normalize(p)), 0.0) / (1.0 + dot(p, p) * 12.0);
  vec3 coreC = vec3(1.0, 0.86, 0.7);
  float m = mod(id, 10.0);
  if (m > 2.5) return coreC * (1.6 + 0.3 * sin(u_time * 1.7));
  if (m > 1.5) return steel + coreC * toward * 0.4;
  int i = int(id / 10.0);
  vec3 f[4];
  frames(p, f);
  vec3 fr = i == 0 ? f[0] : i == 1 ? f[1] : i == 2 ? f[2] : f[3];
  // the line of light round the inside face of the ring
  float r0 = RO - 0.085 * float(i);
  float inner = smoothstep(0.004, 0.0, length(fr.xy) - (r0 - 0.012)) * smoothstep(0.012, 0.004, abs(fr.z));
  return steel + coreC * toward * 0.5 + ringColour(i) * (inner * 2.2 + 0.08);
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
  vec3 c = mix(vec3(0.04, 0.04, 0.045), sweep(r), smoothstep(-0.25, 0.0, r.y));
  c += vec3(0.16, 0.16, 0.17) * smoothstep(-0.05, 0.1, r.y) * smoothstep(0.6, 0.15, r.y);
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

  // ---- out: a gentle shoulder, then display space -----------------------------
  col = col / (1.0 + col * 0.25);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
