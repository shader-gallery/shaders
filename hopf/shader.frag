// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// hopf (Vitrine) - the Hopf fibration, held up on a post on a dark studio
// floor: every point of a sphere is a ring, and every ring links every other.
// Three latitudes of rings, fourteen to each, nest as three tori, each ring
// threaded through all the rest; the tori breathe and slide round each other
// at their own paces, and each ring takes its colour from where it sits on
// the sphere, so the theme runs round them in bands. The axis leans like a
// globe, so the turntable swings the open middle round to face you.
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
uniform float u_flow;           // how fast the tori slide round each other (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the turntable: a point or direction in the frame of the piece
vec3 turned(vec3 p) { p.xz *= rot(u_time * u_turn * TAU / 60.0); return p; }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.54, 1.14, 0.54);

const float FOOT = 0.04;
const float CY = 0.6;       // the centre of the fibration
const float SC = 0.22;      // metres to a unit of the projected 3-sphere
const float TUBE = 0.0065;  // the radius of each ring
const float TILT = 0.5;     // the axis leans this far off upright, like a globe
const int FIBRES = 11;      // rings to a torus

// The Hopf fibration: every point of the 2-sphere is a circle in the
// 3-sphere, and no two circles miss linking. Stereographic projection brings
// them to space as rings. The rings over one latitude th of the 2-sphere lie
// on one torus, each the last turned about the axis, so one ring per torus is
// worked out (through three of its points) and the rest are turns of it.
vec3 fibrePoint(float th, float t) {
  vec2 z1 = cos(th * 0.5) * vec2(cos(t), sin(t));
  vec2 z2 = sin(th * 0.5) * vec2(cos(t), sin(t));
  return vec3(z1.x, z2.x, z1.y) / (1.0 - z2.y);
}
// the ring over latitude th at longitude 0: centre (xyz) and radius (w), and
// the normal to its plane
vec4 ringOf(float th, out vec3 nrm) {
  vec3 A = fibrePoint(th, 0.0), B = fibrePoint(th, TAU / 3.0), C = fibrePoint(th, 2.0 * TAU / 3.0);
  vec3 a = A - C, b = B - C, axb = cross(a, b);
  vec3 ctr = C + cross(dot(a, a) * b - dot(b, b) * a, axb) / (2.0 * dot(axb, axb));
  nrm = normalize(axb);
  return vec4(ctr, length(A - ctr));
}
float ringDist(vec3 p, vec4 ring, vec3 nrm) {
  vec3 q = p - ring.xyz;
  float h = dot(q, nrm);
  return length(vec2(length(q - nrm * h) - ring.w, h));
}

// the three tori, their latitudes breathing a little
float latitude(int k) { return 0.45 + 0.5 * float(k) + 0.05 * sin(u_time * 0.21 + float(k) * 2.1); }
float slide(int k) { return u_time * u_flow * (0.05 - 0.035 * float(k)); }

vec2 map(vec3 q) {
  vec3 p = turned(q - vec3(0.0, CY, 0.0));
  p.yz *= rot(TILT);
  p /= SC;
  vec2 r = vec2(1e9, 0.0);
  for (int k = 0; k < 3; k++) {
    vec3 nrm;
    vec4 ring = ringOf(latitude(k), nrm);
    // a cheap reject: nothing of this torus is near
    float reach = length(ring.xyz) + ring.w;
    if (length(p) - reach > r.x / SC + 0.2) continue;
    float lon0 = slide(k);
    for (int j = 0; j < FIBRES; j++) {
      float lon = lon0 + TAU * float(j) / float(FIBRES);
      vec3 pj = p;
      pj.xz *= rot(-lon);
      float d = (ringDist(pj, ring, nrm) * SC - TUBE);
      // hue round the 2-sphere: longitude, a step per torus
      if (d < r.x) r = vec2(d, 1.0 + fract(lon / TAU + 0.17 * float(k)));
    }
  }
  // the post up to a hub at the centre, on a round foot
  float post = max(length(q.xz) - 0.009, abs(q.y - CY * 0.5) - CY * 0.5);
  post = min(post, length(q - vec3(0.0, CY, 0.0)) - 0.028);
  vec2 w = vec2(length(q.xz) - 0.15, abs(q.y - FOOT * 0.5) - FOOT * 0.5);
  float foot = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.004;
  float steel = min(post, foot);
  return steel < r.x ? vec2(steel, 3.0) : r;
}

// the four theme colours round a loop, linear
vec3 theme(float a) {
  a = fract(a) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(a));
  vec3 c = a < 1.0 ? mix(c0, c1, f) : a < 2.0 ? mix(c1, c2, f) : a < 3.0 ? mix(c2, c3, f) : mix(c3, c0, f);
  return lin(c);
}

vec3 shade(float id, vec3 q, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  float dif = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L - rd)), 0.0), 60.0);
  if (id > 2.5) return lin(vec3(0.2, 0.2, 0.22)) * (0.3 + 0.9 * dif) + spec * 0.8;
  // each ring its own colour, lit, with a glow of its own so the far side of
  // the tangle still reads; the band of light runs slowly round the sphere
  vec3 col = theme(id - 1.0 + u_time * 0.01);
  float rim = 1.0 - abs(dot(n, rd));
  rim *= rim;
  return col * (0.18 + 0.85 * dif) + col * 0.22 + col * rim * 0.5 + spec * 0.35;
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
