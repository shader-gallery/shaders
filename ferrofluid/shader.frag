// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// ferrofluid (Vitrine) - a pool of magnetic fluid in a shallow dark dish on a
// dark studio floor, drawn up into a crown of sharp spikes by a magnet that
// circles unseen under the dish. Where the magnet passes the spikes stand
// tall and lean toward it; behind it they settle back to little bumps, so the
// crown walks round the pool and never holds a shape. The fluid is near-black
// and glossy, a dark mirror of the studio, and the theme colours catch only
// along the edges of the spikes, brightest on the tallest.
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
uniform float u_pull;           // how strongly the magnet raises spikes    (default 1.0)
uniform float u_orbit;          // how fast the magnet circles underneath   (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;
// what a mirror sees from here, linear: the setting defines it
vec3 env(vec3 r);

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.34, 0.5, 0.34);

const float DISH = 0.06;    // the dish height; the fluid sits in it
const float POOL = 0.27;    // the radius of the fluid
const float DOME = 0.06;    // how high the fluid mounds in the middle
const float RING = 0.052;   // the spacing of the rings of spikes

float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// the magnet, under the dish, on a slow circle
vec3 magnet() {
  float a = u_time * u_orbit * 0.25;
  return vec3(0.09 * cos(a), -0.06, 0.09 * sin(a * 1.3 + 0.7));
}
// the height of the mound of fluid at radius r
float mound(float r) { float x = clamp(r / POOL, 0.0, 1.0); return DISH - 0.012 + DOME * (1.0 - x * x); }

// One spike: a cone standing on the mound at c, its height from how close
// the magnet is, leaning toward it. Field lines crowd near the magnet, so the
// spikes there stand tallest and the far ones settle to little bumps.
float spike(vec3 p, vec2 at, vec3 m) {
  vec3 c = vec3(at.x, mound(length(at)) - 0.01, at.y);
  vec2 off = m.xz - at;
  float pull = u_pull / (1.0 + 70.0 * dot(off, off));
  float H = 0.01 + 0.19 * pull;
  float B = 0.016 + 0.006 * pull;
  vec3 dir = normalize(vec3(off.x * 0.9, 1.0, off.y * 0.9));
  vec3 q = p - c;
  float h = dot(q, dir);
  float rad = length(q - dir * h);
  float side = (rad - B * (1.0 - clamp(h / H, 0.0, 1.0))) * H / sqrt(H * H + B * B);
  return max(side, max(-h, h - H));
}

vec2 map(vec3 p) {
  vec3 m = magnet();
  // the fluid: a flattened mound in the dish
  float r = length(p.xz);
  float d = max(p.y - mound(r), r - POOL);
  // the spikes, ring by ring round the middle; each ring finds the one
  // spike nearest this point, turned a little against the ring inside it
  float sp = spike(p, vec2(0.0), m);
  for (int k = 1; k < 5; k++) {
    float n = 6.0 * float(k);
    float rk = RING * float(k);
    float a = atan(p.z, p.x) + 0.3 * float(k);
    float a0 = floor(a / TAU * n + 0.5) * TAU / n - 0.3 * float(k);
    sp = min(sp, spike(p, rk * vec2(cos(a0), sin(a0)), m));
  }
  d = smin(d, sp, 0.012);
  // the dish: a low dark disc with a shallow bowl in its top
  vec2 w = vec2(r - 0.32, abs(p.y - DISH * 0.5) - DISH * 0.5);
  float dish = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.006;
  dish = max(dish, -(length(p - vec3(0.0, 1.025, 0.0)) - 1.0));
  return d < dish ? vec2(d * 0.8, 1.0) : vec2(dish, 2.0);
}

vec3 shade(float id, vec3 p, vec3 n, vec3 rd) {
  vec3 r = reflect(rd, n);
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  if (id > 1.5) return lin(vec3(0.05, 0.05, 0.055)) * (0.4 + 0.9 * max(dot(n, L), 0.0)) + env(r) * 0.06;
  // ferrofluid: near-black and glossy, a dark mirror; the theme catches only
  // along the edges of the spikes, brighter the taller they stand
  float fr = 1.0 - max(dot(n, -rd), 0.0);
  float fr2 = fr * fr;
  float fres = 0.04 + 0.5 * fr2 * fr2 * fr;
  float spec = pow(max(dot(n, normalize(L - rd)), 0.0), 120.0);
  float lift = smoothstep(mound(length(p.xz)), mound(length(p.xz)) + 0.08, p.y);
  vec3 edge = mix(lin(c0), lin(c2), lift) * fr2 * fr2 * (0.05 + 2.4 * lift);
  return env(r) * fres + spec * 1.4 + edge;
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
