// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Nave - looking down the long nave of a stone cathedral. Clustered piers
// and pointed arcade arches recede bay after bay toward a warm haze, a ribbed
// pointed vault closes overhead, and paired lancet windows line the
// clerestory. Low sun pours through the windows on the right and cuts
// slanted shafts down across the nave onto the far piers and the flagstone
// floor. The sun slowly climbs and sinks so the shafts sweep, clouds drift
// past the windows and dim them one after another, and dust turns in the
// light while the view creeps forward down the aisle.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sun;     // strength of the sunlight through the windows (default 1.1)
uniform float u_cloud;   // speed of clouds passing the windows (default 0.6)
uniform float u_dust;    // density of dust hanging in the shafts (default 0.8)
uniform float u_glide;   // slow walk of the view down the nave (default 0.35)

const float W  = 3.2;    // half width of the nave
const float T  = 0.9;    // thickness of the arcade wall
const float B  = 3.0;    // length of one bay
const float HS = 10.5;   // springing height of the vault
const float RV = 5.0;    // radius of the vault arcs
const float WS = 8.9;    // springing height of the lancets
const float WB = 7.3;    // sill height of the lancets

float h21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1291, 0.2213, 0.1657));
  q += dot(q, q.zxy + 31.61);
  return fract((q.x + q.z) * q.y);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.03 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s * 1.07;
}

// pointed arch opening of half width w springing at hs: negative inside
float arch(vec2 p, float w, float hs, float r) {
  if (p.y < hs) return abs(p.x) - w;
  return length(vec2(abs(p.x) + r - w, p.y - hs)) - r;
}

// the lancet pair of one bay in wall coordinates (z along the wall, y up)
float lancets(float z, float y) {
  float zc = mod(z, B) - 0.5 * B;
  float lz = abs(zc) - 0.62;
  float l = max(arch(vec2(lz, y), 0.3, WS, 0.52), WB - y);
  // a small pointed quatrefoil light above the pair
  float o = length(vec2(zc, y - 10.0)) - 0.2;
  return min(l, o);
}

// distance to stone, with the part hit: 0 wall, 1 pier, 2 rib, 3 floor
vec2 scene(vec3 p) {
  float ax = abs(p.x);
  float zc = mod(p.z, B) - 0.5 * B;
  float zp = 0.5 * B - abs(zc);

  float nv = arch(vec2(p.x, p.y), W, HS, RV);
  float sp = max(nv, -p.y);
  // arcade openings into the aisles
  float o = max(max(arch(vec2(zc, p.y), 1.02, 4.3, 1.75), -p.y), ax - W - T - 0.5);
  // the low dark aisles beyond
  float a = max(max(abs(ax - (W + T + 1.8)) - 1.8, p.y - 6.4), -p.y);
  // lancets through the clerestory wall to the sky
  float l = max(lancets(p.z, p.y), W - 0.2 - ax);
  // tall lancets in the outer aisle walls, seen through the arcades
  float aw = max(max(arch(vec2(zc, p.y), 0.42, 4.4, 0.7), 1.9 - p.y), W + T + 3.4 - ax);
  sp = min(min(sp, o), min(min(a, aw), l));
  float d = -sp;
  float part = p.y < 0.02 ? 3.0 : 0.0;

  // clustered piers: a core column ringed by thinner shafts
  float px = ax - W;
  float c = length(vec2(px, zp)) - 0.36 - 0.012 * sin(atan(zp, px) * 12.0);
  c = min(c, length(vec2(px + 0.36, zp)) - 0.12);
  c = min(c, length(vec2(px + 0.2, zp - 0.36)) - 0.11);
  c = min(c, length(vec2(px + 0.2, zp + 0.36)) - 0.11);
  c -= 0.1 * smoothstep(0.7, 0.4, p.y) + 0.05 * smoothstep(0.35, 0.3, abs(p.y - 4.3) * 3.0);
  c = max(c, p.y - HS);
  if (c < d) { d = c; part = 1.0; }

  // transverse ribs over each pier and a string course under the clerestory
  float rb = max(max(zp - 0.2, -(nv + 0.38)), HS - 0.3 - p.y);
  // diagonal ribs crossing each bay of the vault
  float dg = abs(ax * 0.5 * B - abs(zc) * W) / length(vec2(0.5 * B, W));
  rb = min(rb, max(max(dg - 0.13, -(nv + 0.3)), HS - 0.3 - p.y));
  float sc = max(abs(p.y - 6.7) - 0.11, W - 0.16 - ax);
  sc = max(sc, -l);
  rb = min(rb, sc);
  if (rb < d) { d = rb; part = 2.0; }
  return vec2(d, part);
}

// sun reaching point p through the right clerestory, dimmed by clouds
float sunVis(vec3 p, vec3 L, float cl) {
  if (p.x > W + 0.3) return 0.0;
  float tt = (W + 0.5 * T - p.x) / L.x;
  vec3 q = p + L * tt;
  float sf = 0.025 + tt * 0.012;
  float w = lancets(q.z, q.y);
  // leaded mullion bars cast thin dark lines in the light
  float bars = smoothstep(0.0, 0.05, abs(fract(q.y * 1.2) - 0.5) * 0.6);
  float v = smoothstep(sf, -sf, w) * (0.85 + 0.15 * bars);
  float cloud = smoothstep(0.35, 0.75, fbm(vec2(q.z * 0.07 - cl, q.y * 0.05 + cl * 0.3)));
  return v * (0.12 + 0.88 * cloud);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  float mn = min(res.x, res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t = u_time;
  float sunK = clamp(u_sun, 0.0, 2.0);
  float cl = t * 0.08 * max(u_cloud, 0.0);
  float dustK = clamp(u_dust, 0.0, 2.0);

  // the sun slowly climbs and sinks, sweeping the shafts across the far side
  float el = 1.25 + 0.3 * sin(t * 0.045 + 0.6);
  vec3 L = normalize(vec3(1.0, el, 0.38));

  // camera low in the nave, a little right of centre, looking up the aisle
  vec3 ro = vec3(-2.0, 1.7, t * max(u_glide, 0.0) * 0.35);
  vec3 fw = normalize(vec3(0.22, 0.42, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 upv = cross(fw, rt);
  vec3 rd = normalize(fw * 0.78 + rt * uv.x + upv * uv.y);

  float tr = 0.0;
  vec2 h = vec2(1.0, 0.0);
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * tr;
    h = scene(p);
    if (h.x < 0.0015 * tr) { hit = true; break; }
    if ((abs(p.x) > W + T + 0.2 && p.y > WB) || abs(p.x) > W + T + 3.7) break;
    tr += h.x * 0.85;
    if (tr > 70.0) break;
  }
  tr = min(tr, 70.0);
  vec3 p = ro + rd * tr;

  // shadow is blue-black, sun is the theme
  vec3 shade = vec3(0.016, 0.026, 0.065);
  vec3 coolAmb = vec3(0.040, 0.070, 0.170);
  vec3 warmB = c3 * c3;
  vec3 sunC = mix(c1, c2, 0.5);

  vec3 col;
  if (hit) {
    vec2 e = vec2(0.004, -0.004);
    vec3 n = normalize(e.xyy * scene(p + e.xyy).x + e.yyx * scene(p + e.yyx).x
                     + e.yxy * scene(p + e.yxy).x + e.xxx * scene(p + e.xxx).x);
    // stone: coursed blocks with weathered faces
    float along = abs(n.x) > 0.5 ? p.z : p.x;
    float course = floor(p.y / 0.42);
    float bk = along / 0.75 + 0.5 * mod(course, 2.0);
    float mortar = smoothstep(0.0, 0.035, abs(fract(p.y / 0.42) - 0.5) * 0.42 - 0.18)
                 * smoothstep(0.0, 0.03, abs(fract(bk) - 0.5) * 0.75 - 0.35);
    float stone = 0.6 + 0.4 * fbm(vec2(along * 2.3, p.y * 3.1)) + 0.15 * (h21(vec2(floor(bk), course)) - 0.5);
    if (h.y > 2.5) {
      // flagstones, worn smooth down the middle of the nave
      vec2 f = p.xz / 1.3;
      float g = smoothstep(0.0, 0.04, min(abs(fract(f.x) - 0.5), abs(fract(f.y + 0.5 * floor(f.x))) - 0.0));
      g = smoothstep(0.0, 0.03, 0.5 - max(abs(fract(f.x) - 0.5), abs(fract(f.y + 0.5 * floor(f.x)) - 0.5)));
      mortar = g;
      stone = 0.55 + 0.45 * fbm(p.xz * 1.7) + 0.2 * (h21(floor(vec2(f.x, f.y + 0.5 * floor(f.x)))) - 0.5);
    }
    if (h.y > 0.5 && h.y < 1.5) stone *= 0.9 + 0.1 * sin(p.y * 2.0 + p.z);
    stone *= 0.55 + 0.45 * mortar;

    float sv = sunVis(p + n * 0.04, L, cl);
    float dif = max(dot(n, L), 0.0);
    // floor glow bounces warm light up into the lower stone
    float bounce = smoothstep(6.0, 0.0, p.y) * (0.5 + 0.5 * n.y);
    vec3 lit = sunC * dif * sv * 4.5 * sunK + c2 * sv * dif * dif * 0.9 * sunK;
    col = stone * (shade + coolAmb * (0.4 + 0.6 * max(n.y, 0.0)) * smoothstep(-2.0, 12.0, p.y)
                 + warmB * (0.22 * bounce + 0.10) * sunK + lit
                 + c1 * 0.11 * smoothstep(2.0, 14.0, p.y) * sunK + c0 * 0.10 * max(-n.y, 0.0) * sunK);
    // wet-looking polish on the floor catches the sun patch
    if (h.y > 2.5) col += c0 * 0.08 * sv * sunK * smoothstep(1.2, 0.0, abs(p.x - 0.4));
  } else if (abs(p.x) > W) {
    // the sky beyond the glass: blazing on the sun side, pale on the other
    float cloud = smoothstep(0.3, 0.8, fbm(vec2(p.z * 0.07 - cl, p.y * 0.05 + cl * 0.3)));
    float sideK = p.x > 0.0 ? 1.0 : 0.45;
    float lead = smoothstep(0.0, 0.04, abs(fract(p.y * 1.6) - 0.5) * 0.6)
               * smoothstep(0.0, 0.03, abs(fract(p.z * 2.4) - 0.5) * 0.42);
    col = mix(c1, vec3(1.0, 0.97, 0.92), 0.5 * cloud * sideK) * (0.5 + 1.6 * cloud) * sideK * sunK * (0.25 + 0.75 * lead);
  } else {
    col = warmB * 0.05;
  }

  // atmospheric depth: far bays sink into a deep warm haze over cool shadow
  float fog = 1.0 - exp(-tr * 0.035);
  vec3 hz = mix(coolAmb * 0.6, c3 * 0.30, smoothstep(10.0, 60.0, tr)) + c0 * 0.10 * smoothstep(30.0, 70.0, tr);
  col = mix(col, hz, fog);

  // volumetric shafts: march the view ray through the sunlit dust
  float acc = 0.0;
  float tm = min(tr, 40.0);
  float dt = tm / 40.0;
  float jit = h21(gl_FragCoord.xy);
  for (int i = 0; i < 40; i++) {
    float s = (float(i) + jit) * dt;
    vec3 q = ro + rd * s;
    float sv = sunVis(q, L, cl);
    if (sv > 0.0) {
      float dz = 0.45 + 0.75 * vn(vec2(q.x * 0.6 + q.y * 0.4 - t * 0.05, q.z * 0.5 + t * 0.03))
                      * vn(vec2(q.y * 1.3 + t * 0.04, q.z * 1.1 - q.x * 0.5));
      acc += sv * dz * dt * exp(-s * 0.03) * smoothstep(1.0, 5.0, s);
    }
  }
  float beam = acc * 0.30 * sunK * (0.35 + 0.65 * dustK);
  col += mix(c0, c2, clamp(beam * 1.5, 0.0, 1.0)) * beam;

  // motes turning in the light at three depths
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 26.0 + fi * 22.0;
    vec2 mq = uv * sc + vec2(t * (0.06 + 0.04 * fi), -t * (0.08 + 0.05 * fi) + fi * 4.7);
    mq.x += 0.5 * sin(mq.y * 0.4 + t * 0.3 + fi);
    vec2 cell = floor(mq);
    float mh = h21(cell + fi * 19.0);
    vec2 mo = vec2(h21(cell + 4.3), h21(cell + 7.9)) - 0.5;
    float r = 0.05 + 0.09 * fract(mh * 11.0);
    float m = step(0.8, mh) * smoothstep(r, 0.0, length(fract(mq) - 0.5 - mo * 0.6));
    float tw = 0.6 + 0.4 * sin(t * (0.7 + mh) + mh * 40.0);
    col += mix(c1, c2, fract(mh * 5.0)) * m * tw * clamp(beam * 3.0, 0.0, 1.5) * dustK * (1.0 - fi * 0.2);
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 2.0);
  gl_FragColor = vec4(col, 1.0);
}
