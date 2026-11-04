// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// ferrofluid (Vitrine) - magnetic fluid in a shallow dark dish round a steel
// form on a dark studio floor. As the field builds, the fluid climbs the form
// in a slow pulse, coating it in rows of sharp spikes that stand out from its
// surface wherever it faces; it holds near the top, then lets go and slides
// back into the spiked pool, and with the fluid down the bare steel turns
// into the next form: a spire wound with spiral ridges, an onion bulb on a
// neck, a thick coil round a rod, a twisted three-lobed column, and round
// again. Near-black and glossy, a dark mirror of the studio, the theme
// catching only along the spike edges; above the fluid the steel is bare.
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
uniform float u_pull;           // how strongly the field raises spikes     (default 1.0)
uniform float u_pulse;          // how fast the fluid climbs and falls back (default 1.0)

#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// the theme colours (display space), set before anything is drawn
vec3 c0, c1, c2, c3;
// what a mirror sees from here, linear: the setting defines it
vec3 env(vec3 r);

// the box it is drawn in: half width, height, half depth (m)
const vec3 BOUNDS = vec3(0.34, 0.97, 0.34);

const float DISH = 0.06;    // the dish height; the pool sits in it
const float POOL = 0.27;    // the radius of the pool
const float TOP = 0.84;     // how far the forms reach above the dish
const float BASE = 0.12;    // the radius of the spike rings in the pool
const float PERIOD = 20.0;  // seconds a form stands: climbed, held, let go

float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// where the cycle is: whole numbers count the forms, the fraction is the
// pulse through the current one
float cycle() { return u_time * u_pulse / PERIOD; }

// how high the fluid has climbed: drawn up the form in a slow pulse as the
// field builds, held, then let go to slide back into the pool before the
// steel turns into the next form
float level() {
  float ph = fract(cycle());
  float up = smoothstep(0.02, 0.45, ph) * (1.0 - smoothstep(0.62, 0.84, ph));
  return DISH + 0.06 + up * (TOP - 0.1);
}

// The steel forms the fluid climbs, one at a time: 0 a spire wound with
// three spiral ridges, 1 an onion bulb on a short neck, 2 a thick coil round
// a slim rod, 3 a column of three lobes that turn as it rises. formD is the
// distance to form k, formR its girth at height y, which spaces the spikes.
float formD(float k, vec3 p) {
  float y = p.y - DISH;
  float h = clamp(y / TOP, 0.0, 1.0);
  float a = atan(p.z, p.x);
  float r = length(p.xz);
  float d;
  if (k < 0.5) {
    float ridge = 0.02 * (1.0 - h) * (0.5 + 0.5 * sin(3.0 * a - p.y * 26.0));
    d = (r - 0.12 * (1.0 - h) - 0.003 - ridge) * 0.7;
  } else if (k < 1.5) {
    float b = sin(3.14159 * clamp((h - 0.12) / 0.88, 0.0, 1.0));
    d = (r - 0.022 - 0.15 * pow(b, 1.6) * (1.0 - 0.6 * h)) * 0.6;
  } else if (k < 2.5) {
    float yy = p.y - a / TAU * 0.16;
    yy = mod(yy + 0.08, 0.16) - 0.08;
    d = min((length(vec2(r - 0.1, yy)) - 0.032) * 0.7, r - 0.012);
  } else {
    d = (r - (0.075 + 0.035 * cos(3.0 * (a - p.y * 7.0))) * (1.0 - 0.55 * h) - 0.01) * 0.6;
  }
  return max(d, max(-(y + 0.02), y - TOP));
}
float formR(float k, float y) {
  float h = clamp((y - DISH) / TOP, 0.0, 1.0);
  if (k < 0.5) return 0.12 * (1.0 - h) + 0.003;
  if (k < 1.5) return 0.022 + 0.15 * pow(sin(3.14159 * clamp((h - 0.12) / 0.88, 0.0, 1.0)), 1.6) * (1.0 - 0.6 * h);
  if (k < 2.5) return 0.132;
  return 0.075 * (1.0 - 0.55 * h) + 0.01;
}

// the form now, and the next it is turning into while the fluid is down
float formNow() { return mod(floor(cycle()), 4.0); }
float morph() { return smoothstep(0.86, 1.0, fract(cycle())); }
float steelD(vec3 p) {
  float k = formNow(), m = morph();
  float d = formD(k, p);
  if (m > 0.0) d = mix(d, formD(mod(k + 1.0, 4.0), p), m);
  return d;
}
float girth(float y) {
  float k = formNow();
  return mix(formR(k, y), formR(mod(k + 1.0, 4.0), y), morph());
}

// The fluid on the form: a coat, thick at the foot and thin at the front
// where it is still climbing, standing up in spikes. The spikes sit in rows
// up the form, each row turned half a spike against the last, as many round
// as its girth has room for, and stand out from the surface wherever it
// faces, tallest where the field is strongest, low near the front,
// rippling as the field breathes.
float coat(vec3 p, float lvl) {
  float y = p.y;
  float front = smoothstep(lvl + 0.01, lvl - 0.07, y);
  if (front <= 0.0) return 0.0;
  float r = max(length(p.xz), 0.02);
  float base = 0.008 + 0.03 * smoothstep(DISH + 0.22, DISH, y);
  float row = (y - DISH) / 0.034;
  float ri = floor(row + 0.5);
  float n = max(5.0, floor(TAU * (girth(DISH + ri * 0.034) + 0.02) / 0.034));
  float across = atan(p.z, p.x) / TAU * n + 0.5 * mod(ri, 2.0) + 0.04 * ri;
  vec2 cell = vec2((fract(across + 0.5) - 0.5) * TAU * r / n, (row - ri) * 0.034);
  float field = u_pull * (0.65 + 0.35 * sin(u_time * 1.1 - y * 9.0)) * smoothstep(lvl, lvl - 0.18, y);
  float spike = 0.045 * field * max(0.0, 1.0 - length(cell) / 0.0145);
  return (base + spike) * front;
}

// the pool round the foot, spiked in rings, the inner rings tallest
float pool(vec3 p) {
  float r = length(p.xz);
  float mound = DISH - 0.012 + 0.05 * (1.0 - clamp(r / POOL, 0.0, 1.0));
  float d = max(p.y - mound, r - POOL);
  float a = atan(p.z, p.x) / TAU;
  float ring = (r - BASE) / 0.045;
  float ri = clamp(floor(ring + 0.5), 0.0, 3.0);
  float n = 12.0 + 6.0 * ri;
  float across = a * n + 0.5 * mod(ri, 2.0);
  float rr = BASE + ri * 0.045;
  vec2 cell = vec2((fract(across + 0.5) - 0.5) * TAU * rr / n, r - rr);
  float field = u_pull * (0.7 + 0.3 * sin(u_time * 1.1 + ri * 1.7)) * (1.0 - ri * 0.2);
  float H = 0.012 + 0.085 * field;
  float h = p.y - mound;
  float spike = max(length(cell) - 0.015 * (1.0 - clamp(h / H, 0.0, 1.0)), max(-h, h - H));
  return smin(d, spike, 0.01);
}

vec2 map(vec3 p) {
  float lvl = level();
  float steel = steelD(p);
  // the fluid hugs the form up to where it has climbed, and merges with
  // the pool at the foot; the field runs it faster than true distance
  float c = coat(p, lvl);
  float fluid = smin((steel - c) * 0.45, pool(p) * 0.6, 0.03);
  // the dish: a low dark disc with a shallow bowl in its top
  vec2 w = vec2(length(p.xz) - 0.32, abs(p.y - DISH * 0.5) - DISH * 0.5);
  float dish = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.006;
  dish = max(dish, -(length(p - vec3(0.0, 1.025, 0.0)) - 1.0));
  vec2 r = fluid < dish ? vec2(fluid, 1.0) : vec2(dish, 2.0);
  // bare steel above the fluid
  return steel < r.x - 0.0004 ? vec2(steel, 3.0) : r;
}

vec3 shade(float id, vec3 p, vec3 n, vec3 rd) {
  vec3 r = reflect(rd, n);
  vec3 L = normalize(vec3(0.35, 0.9, 0.55));
  float spec = pow(max(dot(n, normalize(L - rd)), 0.0), 120.0);
  if (id > 2.5) return env(r) * vec3(0.55, 0.56, 0.6) + spec * 1.2;
  if (id > 1.5) return lin(vec3(0.05, 0.05, 0.055)) * (0.4 + 0.9 * max(dot(n, L), 0.0)) + env(r) * 0.06;
  // ferrofluid: near-black and glossy, a dark mirror; the theme catches only
  // along the edges of the spikes
  float fr = 1.0 - max(dot(n, -rd), 0.0);
  float fr2 = fr * fr;
  float fres = 0.04 + 0.5 * fr2 * fr2 * fr;
  vec3 edge = mix(lin(c0), lin(c2), smoothstep(0.1, 0.8, p.y)) * fr2 * fr2 * fr2 * 0.7;
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
