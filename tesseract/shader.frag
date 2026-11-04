// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// tesseract (Vitrine) - a hypercube, the four-dimensional cube, as a blue
// hologram thrown up from a projector on a slim post on a dark studio floor:
// its thirty-two edges lines of light, its sixteen corners brighter points,
// seen in perspective through the fourth dimension, so it shows as a cube
// within a cube. It turns a quarter turn at a time, eased in and held:
// through w, so the inner cube flows out to become the outer one while the
// outer folds in, and then in two planes at once, twisting it through
// itself. Fine scanlines drift up it, a bright band sweeps up through it
// every few seconds, it flickers, and now and then a glitch shears it
// sideways in slices; a faint cone of light rises to it from the lens.
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
uniform float u_pace;           // how fast it steps from turn to turn     (default 1.0)
uniform float u_depth;          // how deep the fourth dimension looks     (default 1.0)
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
const vec3 BOUNDS = vec3(0.38, 1.12, 0.38);

const vec3 C = vec3(0.0, 0.72, 0.0);  // the centre of the hypercube
const float S = 0.12;           // half its edge, before the projection
const float REACH = 0.33;       // the farthest any corner gets from C
const float STEP = 7.0;         // seconds from one turn to the next

// eased: still at both ends
float ease(float x) { x = clamp(x, 0.0, 1.0); return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }

// The turns, four to a cycle, each a quarter turn eased in over half a
// step and then held: in the xw plane, the yw plane, zw with xy together,
// and xw with yz together. A quarter turn through w swaps the inner cube
// and the outer one; two planes at once twist it through itself.
vec4 turn4(vec4 v) {
  float T = u_time * u_pace / STEP;
  float n = floor(T);
  float f = ease(fract(T) * 2.0);
  float cyc = floor(n / 4.0);
  float st = mod(n, 4.0);
  float q = TAU * 0.25;
  float xw = cyc * 2.0 + (st < 0.5 ? f : 1.0) + (st > 2.5 ? f : 0.0);
  float yw = cyc + (st < 0.5 ? 0.0 : st < 1.5 ? f : 1.0);
  float zw = cyc + (st < 1.5 ? 0.0 : st < 2.5 ? f : 1.0);
  float yz = cyc + (st > 2.5 ? f : 0.0);
  v.xw *= rot(xw * q + 0.35);
  v.yw *= rot(yw * q + 0.2);
  v.zw *= rot(zw * q);
  v.xy *= rot(zw * q + 0.3);
  v.yz *= rot(yz * q + 0.15);
  return v;
}

// into three dimensions: a perspective through w, so the far cube in w is
// small and the near one large; xyz in m, and how much it was enlarged
vec4 proj(vec4 v) {
  float k = 3.0 / (3.0 - v.w * u_depth);
  return vec4(v.xyz * k * S, k);
}

float capsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdCyl(vec3 p, float r, float h) {
  vec2 w = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

float hash11(float x) { return fract(sin(x * 91.17) * 43758.5453); }

// the hypercube as light: the distance to its nearest edge (x) and its
// nearest corner (y), at q from its centre in the frame of the piece
vec2 holo(vec3 q) {
  vec4 ex = turn4(vec4(1.0, 0.0, 0.0, 0.0)), ey = turn4(vec4(0.0, 1.0, 0.0, 0.0));
  vec4 ez = turn4(vec4(0.0, 0.0, 1.0, 0.0)), ew = turn4(vec4(0.0, 0.0, 0.0, 1.0));
  float rods = 1e9, beads = 1e9;
  for (int k = 0; k < 4; k++) {
    // the edges along one axis, and the three others that place them
    vec4 a = k == 0 ? ex : k == 1 ? ey : k == 2 ? ez : ew;
    vec4 b1 = k == 0 ? ey : ex;
    vec4 b2 = k < 2 ? ez : ey;
    vec4 b3 = k < 3 ? ew : ez;
    for (int j = 0; j < 8; j++) {
      float fj = float(j);
      vec4 c = b1 * (mod(fj, 2.0) * 2.0 - 1.0) + b2 * (mod(floor(fj * 0.5), 2.0) * 2.0 - 1.0) + b3 * (floor(fj * 0.25) * 2.0 - 1.0);
      vec4 pa = proj(c - a), pb = proj(c + a);
      rods = min(rods, capsule(q, pa.xyz, pb.xyz, 0.0012 + 0.0012 * (pa.w + pb.w)));
      // every corner is the end of one edge along x
      if (k == 0) beads = min(beads, min(length(q - pa.xyz) - 0.004 * pa.w, length(q - pb.xyz) - 0.004 * pb.w));
    }
  }
  return vec2(rods, beads);
}

// this piece is a hologram: volume() below gathers its light along each ray
// and lays it over what is behind; map() is only the projector under it
#define VOLUME

const float LENS = C.y - REACH - 0.06;   // the height of the projector lens

// the stand: a round foot, a slim post and the projector head on top of it,
// its lens facing up
vec2 map(vec3 p) {
  float foot = sdCyl(p - vec3(0.0, 0.015, 0.0), 0.12, 0.015) - 0.004;
  float post = sdCyl(p - vec3(0.0, LENS * 0.5, 0.0), 0.008, LENS * 0.5);
  float head = sdCyl(p - vec3(0.0, LENS - 0.012, 0.0), 0.036, 0.012) - 0.003;
  vec2 res = vec2(min(foot, post), 1.0);
  return head < res.x ? vec2(head, 2.0) : res;
}

// the blue of the light
const vec3 HOLO = vec3(0.08, 0.36, 1.0);
// and of the glow round it
const vec3 GLOW = vec3(0.04, 0.22, 0.8);

// steel, a dark mirror of the studio; the lens on top of the head glows
vec3 shade(float id, vec3 p, vec3 n, vec3 rd) {
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  vec3 r = reflect(rd, n);
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float spec = pow(max(dot(r, L), 0.0), 90.0);
  vec3 steel = lin(vec3(0.07, 0.07, 0.075)) * (0.3 + 0.8 * max(dot(n, L), 0.0)) + env(r) * (0.3 + 0.6 * fres) * vec3(0.8, 0.82, 0.86) + spec * 1.2;
  if (id < 1.5) return steel;
  float lens = smoothstep(0.03, 0.022, length(p.xz)) * smoothstep(0.5, 0.9, n.y);
  return steel + HOLO * lens * (2.0 + 2.0 * smoothstep(0.012, 0.0, length(p.xz)));
}

// The light along the ray from t0 to t1: the edges as thin lines with a
// soft halo, the corners brighter, in fine scanlines that drift up, a
// brighter band that sweeps up through it every few seconds, a flicker,
// now and then a glitch that shears it sideways in slices, and the faint
// cone of light it is thrown from. Premultiplied, mostly added light.
vec4 volume(vec3 ro, vec3 rd, float t0, float t1) {
  // how much light of the line cores (x), the corners (y), the cone (z)
  // and the glow round them all (w)
  vec4 acc = vec4(0.0);
  if (t1 <= t0) return vec4(0.0);
  float now = u_time;
  float glitch = step(0.9, hash11(floor(now * 3.0))) * step(0.5, hash11(floor(now * 3.0) + 0.5));
  float flick = 0.88 + 0.12 * hash11(floor(now * 24.0)) - 0.35 * glitch * step(0.5, hash11(floor(now * 40.0)));
  float sweep = fract(now / 5.0) * (REACH * 2.0 + 0.4) - REACH - 0.2;
  float t = t0 + 0.004 * hash11(dot(rd, vec3(517.0, 131.0, 911.0)));
  for (int i = 0; i < 110; i++) {
    if (t > t1) break;
    vec3 p = ro + rd * t;
    vec3 q = p - C;
    // the glitch: thin slices pushed sideways for a moment
    q.x += (hash11(floor(q.y * 60.0) + floor(now * 20.0)) - 0.5) * 0.05 * glitch;
    float bnd = length(q) - REACH - 0.02;
    float dt = clamp(bnd, 0.0012, 0.03);
    float scan = 0.6 + 0.4 * sin(q.y * 1600.0 - now * 6.0);
    if (bnd < 0.05) {
      vec2 h = holo(turned(q));
      dt = clamp(min(h.x, h.y) * 0.6, 0.0008, 0.03);
      float band = 1.0 + 2.5 * exp(-(q.y - sweep) * (q.y - sweep) / 0.0008);
      // hard edged: the light is inside each line, with a thin bright skin
      // and only a trace of halo outside it
      float line = smoothstep(0.0005, -0.0004, h.x) * 1.5 + 0.4 * exp(-max(h.x, 0.0) * 900.0);
      float dotL = smoothstep(0.0005, -0.0004, h.y) * 2.0 + 0.4 * exp(-max(h.y, 0.0) * 600.0);
      float glow = 0.3 * exp(-max(h.x, 0.0) * 170.0) + 0.025 * exp(-max(h.x, 0.0) * 50.0) + 0.5 * exp(-max(h.y, 0.0) * 110.0);
      acc += vec4(line * scan * band, dotL, 0.0, glow * (0.8 + 0.2 * scan) * band) * dt * 90.0;
    }
    // the cone of light up from the lens, spreading and fading
    float up = p.y - LENS;
    if (up > 0.0) {
      float cr = 0.025 + up * 0.42;
      float cone = smoothstep(cr, cr * 0.2, length(p.xz)) * exp(-up * 5.0);
      acc.z += cone * (0.7 + 0.3 * scan) * dt * 3.0;
    }
    t += dt;
  }
  // where lines cross the light thickens but stays blue, never burning white
  acc *= flick;
  // each kept apart and capped, so the glow cannot wash the cores out
  vec3 col = HOLO * 1.25 * (1.0 - exp(-acc.x * 1.1)) + GLOW * (1.0 - exp(-acc.w * 0.7))
           + GLOW * 1.4 * (1.0 - exp(-acc.z * 0.9)) + vec3(0.3, 0.6, 1.0) * 1.3 * (1.0 - exp(-acc.y * 0.8));
  float a = clamp(dot(col, vec3(0.3, 0.5, 0.2)) * 0.45, 0.0, 0.8);
  return vec4(col, a);
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
