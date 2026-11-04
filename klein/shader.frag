// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// klein (Vitrine) - a Klein bottle in clear glass, not the familiar bottle
// but its figure eight form: a glass ring standing upright over a low dark
// puck on a dark studio floor, its cross section a figure eight, two lobes
// crossing through each other, that turns three half turns as it goes round.
// After one lap it comes back turned over, so the surface has one side and
// no inside. The twist rolls slowly round the ring, so it churns through
// itself, and inside its hole a smaller one turns about the upright like the
// ring of a gyroscope, churning the other way. Ribbons of light in the theme
// run along the glass, each one band two laps long: pulses run round, come
// back on the far side of the lobe they left, and go round again.
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
uniform float u_flow;           // how fast the light runs along the rings  (default 1.0)
uniform float u_roll;           // how fast the rings churn and turn       (default 1.0)
uniform float u_glass;          // how much the glass shows               (default 1.0)
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

// this piece is glass: volume() below finds every wall a ray passes through
// and lays what each reflects over what is behind; map() is only the stand
#define VOLUME

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.47, 1.04, 0.47);

const float PUCK = 0.03;
const vec3 C = vec3(0.0, 0.57, 0.0);  // the centre of the ring, standing upright
const float RM = 0.3;           // the radius of the ring
const float A = 0.13;           // the reach of each lobe of the figure eight
const float WALL = 0.0025;      // half the thickness of the glass
const float TWIST = 1.5;        // half turns of the figure eight per lap, over two
const float RM2 = 0.11;         // the inner ring, inside the hole of the outer
const float A2 = 0.05;

// the stand: a low dark puck the ring floats over
vec2 map(vec3 p) {
  vec2 w = vec2(length(p.xz) - 0.16, abs(p.y - PUCK * 0.5) - PUCK * 0.5 + 0.006);
  return vec2(min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.006, 1.0);
}

vec3 shade(float id, vec3 p, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  vec3 r = reflect(rd, n);
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float spec = pow(max(dot(r, L), 0.0), 90.0);
  return lin(vec3(0.05, 0.05, 0.055)) * (0.3 + 0.8 * max(dot(n, L), 0.0)) + env(r) * (0.2 + 0.6 * fres) + spec;
}

// turn v counterclockwise by a
vec2 spin(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// The figure eight the ring is swept from: (A sin v, A sin v cos v), two
// lobes crossing at the middle. The distance from w to it, and where on it
// (v, 0 to TAU) the nearest point lies; found on one quarter of it, by its
// symmetry, and put back in its quarter.
vec2 eight(vec2 w, float A) {
  vec2 a = abs(w);
  float best = 1e9, vb = 0.0;
  vec2 prev = vec2(0.0);
  for (int i = 1; i <= 12; i++) {
    float v = float(i) / 12.0 * 1.5707963;
    vec2 cur = A * vec2(sin(v), sin(v) * cos(v));
    vec2 pa = a - prev, ba = cur - prev;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);
    if (d < best) { best = d; vb = (float(i) - 1.0 + h) / 12.0 * 1.5707963; }
    prev = cur;
  }
  float v = w.x >= 0.0 ? (w.y >= 0.0 ? vb : 3.14159265 - vb) : (w.y >= 0.0 ? 3.14159265 + vb : TAU - vb);
  return vec2(best, v);
}

// how far the twist has rolled round the ring
float rolled() { return u_time * u_roll * 0.25; }

// One ring at q, from its centre, lying in the xy plane: the distance to
// it (x), how far round (y, u from -PI to PI) and where on the figure eight
// (z, v). Going round the ring the figure eight turns three half turns, so
// after one lap it comes back turned over, and the surface with it: one
// side, no inside. Its twist has rolled by roll, so it churns through itself.
vec3 ring8(vec3 q, float rm, float a, float roll) {
  vec2 w = vec2(length(q.xy) - rm, q.z);
  float u = atan(q.y, q.x);
  // far off, the reach of the lobes is near enough
  float far = length(w) - a - 0.01;
  if (far > 0.02) return vec3(far, u, 0.0);
  vec2 e = eight(spin(w, -(TWIST * u + roll)), a);
  return vec3(e.x - WALL, u, e.y);
}

// The glass at q, from the centre: the outer ring standing upright, and the
// inner one inside its hole, turning slowly about the upright like the
// ring of a gyroscope, its twist rolling the other way. The distance, u, v,
// and which ring (w, 0 outer, 1 inner).
vec4 glass(vec3 q) {
  vec3 o = ring8(q, RM, A, rolled());
  vec3 qi = q;
  qi.xz = spin(q.xz, -u_time * u_roll * 0.2 - 1.5707963);
  vec3 i = ring8(qi, RM2, A2, -1.3 * rolled());
  return o.x < i.x ? vec4(o, 0.0) : vec4(i, 1.0);
}

// p in m from the floor under the piece, into the frame of the ring
vec3 ring(vec3 p) { return turned(p - C); }

float hash11(float x) { return fract(sin(x * 91.17) * 43758.5453); }

// Ribbons of light along the glass. A line round the ring at v0 on the
// figure eight comes back from a lap at -v0, the far side of the lobe it
// left, so each ribbon is one band two laps long: at v0 on its first lap,
// -v0 on its second. Pulses run along it, so you can follow one round,
// see it come back on the other side, and go round again.
float ribbon(float u, float v, float v0, float t) {
  float d1 = mod(v - v0 + 3.14159265, TAU) - 3.14159265;
  float d2 = mod(v + v0 + 3.14159265, TAU) - 3.14159265;
  // where along the two laps, 0 to 2 TAU
  float along = abs(d1) < abs(d2) ? u + 3.14159265 : u + 3.14159265 + TAU;
  float dv = min(abs(d1), abs(d2));
  float band = exp(-dv * dv / 0.012);
  float ds = mod(t - along, 2.0 * TAU);
  float pulse = exp(-ds * ds / 0.02) * 2.2 + exp(-ds / 1.4) * smoothstep(0.0, 0.1, ds) * 0.9;
  float ds2 = mod(t + TAU - along, 2.0 * TAU);
  pulse += exp(-ds2 * ds2 / 0.02) * 2.2 + exp(-ds2 / 1.4) * smoothstep(0.0, 0.1, ds2) * 0.9;
  return band * (0.25 + pulse);
}
// the light on the glass at (u, v) of a ring: two ribbons on the outer
// ring, in two theme colours, and one on the inner, running the other way
vec3 ribbons(float u, float v, float id) {
  float t = u_time * u_flow * 0.6;
  if (id > 0.5) return lin(c2) * ribbon(-u, v, 0.9, t * 1.4);
  return lin(c0) * ribbon(u, v, 0.9, t) + lin(c1) * ribbon(u, v, 0.9 + 3.14159265, t + 2.0);
}

// Each wall the ray meets reflects the room, more at a glancing angle, and
// dims what is behind it, most at its edges, where the ray runs through the
// most glass; where the light is running, the glass glows with it.
// Premultiplied colour and coverage.
vec4 volume(vec3 ro, vec3 rd, float t0, float t1) {
  vec4 acc = vec4(0.0);
  if (t1 <= t0) return acc;
  vec3 rl = turned(rd);
  float t = t0 + 0.002 * hash11(dot(rd, vec3(517.0, 131.0, 911.0)));
  for (int i = 0; i < 220; i++) {
    if (t > t1) break;
    vec3 q = ring(ro + rd * t);
    vec4 g = glass(q);
    if (g.x < 0.0005) {
      // the wall: its normal, how squarely the ray meets it
      const vec2 e = vec2(0.0006, -0.0006);
      vec3 n = normalize(e.xyy * glass(q + e.xyy).x + e.yyx * glass(q + e.yyx).x + e.yxy * glass(q + e.yxy).x + e.xxx * glass(q + e.xxx).x);
      float c = abs(dot(rl, n));
      float fres = 0.04 + 0.96 * pow(1.0 - c, 5.0);
      // into the frame of the room for what it reflects
      vec3 nw = n;
      nw.xz *= rot(-u_time * u_turn * TAU / 60.0);
      // a little smoky, so the glass shows across its faces, not only at
      // its edges, and a pale sheen where it turns away from you, so its
      // outline shows against a dark room as well as a bright one
      float gl = 1.0 - c;
      vec3 refl = env(reflect(rd, nw * sign(dot(-rd, nw)))) * (fres * 0.9 + 0.05) * u_glass;
      refl += vec3(0.32, 0.33, 0.36) * gl * gl * gl * u_glass;
      float a = clamp((0.1 + 0.55 * gl * gl) * u_glass, 0.0, 0.9);
      vec3 glow = ribbons(g.y, g.z, g.w) * 1.6 * (0.6 + 0.4 / max(c, 0.45));
      acc.rgb += (1.0 - acc.a) * (refl + glow * 0.5);
      acc.a += (1.0 - acc.a) * a;
      if (acc.a > 0.97) break;
      // on through the wall
      t += (2.0 * WALL + 0.002) / max(c, 0.25);
    } else {
      // never less than a step thinner than the wall, so none is missed
      t += max(g.x * 0.7, 0.003);
    }
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
