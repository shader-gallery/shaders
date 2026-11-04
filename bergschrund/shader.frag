// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Crevasse - looking down a narrow crack in a glacier. Two ice walls carry
// tilted annual bands and big melt scallops; they meander slowly as the view
// drifts along the crack and close to black far below. Over them runs fine,
// fast work: melt rills trickling down the walls, hoarfrost on the lips and
// snow motes sifting into the dark. Sky light enters from the slit above and
// is absorbed with depth, pale periwinkle to violet to black.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;   // speed of the view drifting along the crack (default 0.5)
uniform float u_melt;    // amount and speed of melt rills on the walls (default 1)
uniform float u_bands;   // contrast of the dust bands in the ice (default 1)
uniform float u_motes;   // amount of snow motes falling into the crack (default 1)

const float TAU = 6.2831853;

vec3 c0, c1, c2, c3;
float gT;

float hk(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1523, 0.2417, 0.1789));
  q += dot(q, q.yzx + 41.37);
  return fract((q.x + q.y) * q.z);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hk(i), hk(i + vec2(1.0, 0.0)), f.x),
             mix(hk(i + vec2(0.0, 1.0)), hk(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = vec2(0.79 * p.x - 0.61 * p.y, 0.61 * p.x + 0.79 * p.y) * 2.13 + vec2(5.3, 1.9);
    a *= 0.5;
  }
  return s;
}

// centre line of the crack, wandering along its length and with depth
float mid(vec3 p) {
  return 0.32 * sin(p.z * 0.31 + 0.4) + 0.14 * sin(p.z * 0.83 + 2.1) + 0.12 * p.y * sin(p.z * 0.23 + 1.0);
}

// half width of the gap: wide at the lip, pinching shut with depth
float wid(vec3 p) {
  return max(0.42 + 0.16 * p.y + 0.07 * sin(p.z * 0.57 + 0.8), 0.015);
}

// signed distance to the ice, negative inside it
float map(vec3 p) {
  float side = sign(p.x - mid(p));
  // big melt scallops, different on each wall
  float sc = sin(p.y * 7.0 + 1.6 * sin(p.z * 2.1 + side)) * sin(p.z * 3.3 + p.y * 1.4 + side * 2.0);
  // horizontal relief where the bands weather out
  float rl = sin(p.y * 31.0 + 3.0 * sin(p.z * 0.9));
  float g = wid(p) - abs(p.x - mid(p)) + 0.045 * sc + 0.006 * rl;
  return max(g, p.y);
}

vec3 nrm(vec3 p) {
  vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy),
                        map(p + e.yxy) - map(p - e.yxy),
                        map(p + e.yyx) - map(p - e.yyx)));
}

// absorption ramp: x is light left after the walk down, 1 at the lip
vec3 iceRamp(float x) {
  x = clamp(x, 0.0, 1.3);
  vec3 c = mix(vec3(0.0), c3 * 0.55, smoothstep(0.0, 0.18, x));
  c = mix(c, c0 * 0.9, smoothstep(0.15, 0.45, x));
  c = mix(c, c2, smoothstep(0.4, 0.8, x));
  c = mix(c, mix(c2, c1, 0.4) * 1.15, smoothstep(0.85, 1.25, x));
  return c;
}

float motes(vec2 p, float cell, float fall, float seed) {
  vec2 q = p / cell + vec2(0.0, fall);
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float on = step(0.82, hk(id + seed));
  vec2 o = vec2(hk(id + seed + 3.1), hk(id + seed + 7.7)) - 0.5;
  o.x += 0.25 * sin(fall * 0.7 + hk(id) * TAU);
  float sz = 0.08 + 0.1 * hk(id + seed + 1.3);
  return on * smoothstep(sz, 0.0, length(f - o * 0.55));
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / (0.5 * res.y);
  float t = u_time;
  gT = t;
  float drift = clamp(u_drift, 0.0, 2.0);
  float melt = clamp(u_melt, 0.0, 2.0);
  float bnd = clamp(u_bands, 0.0, 2.0);
  float mot = clamp(u_motes, 0.0, 2.0);

  // the view hangs just above the lip and drifts along the crack
  float zc = t * 0.12 * drift + 3.0;
  vec3 ro = vec3(0.0, 0.32, zc);
  ro.x = mid(vec3(0.0, -0.3, zc + 0.6)) + 0.1;
  vec3 fw = normalize(vec3(-0.1 + 0.03 * sin(t * 0.05), -0.62, 0.78));
  vec3 rg = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rg);
  vec3 rd = normalize(fw + (uv.x * rg + uv.y * up) * 0.8);

  float d = 0.0;
  float hit = 0.0;
  vec3 p = ro;
  for (int i = 0; i < 64; i++) {
    p = ro + rd * d;
    float h = map(p);
    if (abs(h) < 0.0008 + 0.0015 * d) { hit = 1.0; break; }
    d += max(abs(h) * 0.6, 0.003);
    if (d > 14.0) break;
  }
  // a ray that ran out of steps inside the gap still lands on a wall
  if (p.y < -0.02 || map(p) < 0.02) hit = 1.0;

  vec3 col;
  float depth = max(-p.y, 0.0);
  if (hit > 0.5) {
    vec3 n = nrm(p);
    // sky reaching this depth through the slit
    float sky = exp(-depth * 2.5);
    float face = 0.55 + 0.45 * n.y;
    // annual layers, tilted and warped, with dark dust seams
    float bp = p.y * 5.5 + 0.35 * sin(p.z * 0.6) + 0.4 * fbm(vec2(p.z * 0.8, p.y * 2.0));
    float layer = 0.5 + 0.5 * sin(bp * TAU * 0.5);
    float steep = 1.0 - smoothstep(0.35, 0.75, abs(n.y));
    float seam = steep * smoothstep(0.93, 0.995, 0.5 + 0.5 * sin(bp * TAU * 0.5 * 2.7 + 1.0));
    float clear = fbm(vec2(p.z * 2.4, p.y * 9.0));
    float lightLeft = sky * face * (0.75 + 0.35 * mix(0.5, layer, steep) * bnd) * (1.0 - 0.35 * seam * bnd);
    col = iceRamp(lightLeft * 0.95 + 0.1 * clear);
    // blue glow from deep inside the ice, transmitted through clear bands
    col += c2 * 0.3 * exp(-depth * 1.2) * steep * (1.0 - layer) * (0.5 + 0.5 * clear) * bnd;
    // dust seams scaled toward black
    col *= 1.0 - 0.4 * seam * min(bnd, 1.5) * smoothstep(0.0, 0.3, depth);

    // melt rills trickling down the walls, fine and fast
    float side = sign(p.x - mid(p));
    float lane = p.z * 22.0 + 1.5 * sin(p.y * 4.0 + p.z) + side * 7.0;
    float li = floor(lane);
    float lf = fract(lane) - 0.5;
    float wet = step(0.55, hk(vec2(li, side)));
    float thread = exp(-lf * lf * 90.0) * wet;
    float flow = fract(p.y * 2.2 + t * 0.5 * melt * (0.7 + 0.6 * hk(vec2(li, 3.0))) + hk(vec2(li, 9.0)));
    float bead = smoothstep(0.0, 0.08, flow) * smoothstep(0.35, 0.08, flow);
    float spec = pow(max(dot(reflect(rd, n), vec3(0.0, 1.0, 0.0)), 0.0), 6.0);
    col += mix(c2, c1, 0.3) * thread * (0.06 + 0.7 * bead) * sky * (0.4 + spec) * melt * smoothstep(0.02, 0.2, depth);
    // a wet film glazing the scallops
    col += c2 * 0.25 * spec * sky * melt * smoothstep(0.55, 0.8, clear);

    // the glacier surface and the hoarfrost along the lip
    float top = smoothstep(-0.04, -0.005, p.y);
    float snow = fbm(vec2(p.x * 6.0, p.z * 3.0));
    float sast = 0.5 + 0.5 * sin(p.z * 9.0 + p.x * 3.0 + 4.0 * snow);
    vec3 surf = mix(c3 * 0.35, c0 * 0.55, snow * sast);
    float glit = step(0.985, hk(floor(vec2(p.x, p.z) * 90.0))) * (0.5 + 0.5 * sin(t * 1.3 + p.x * 40.0));
    surf += c2 * 0.8 * glit;
    surf *= 0.7 + 0.5 * exp(-abs(p.x - mid(p)) * 2.0);
    col = mix(col, surf, top);
    float lip = smoothstep(-0.12, -0.01, p.y) * (1.0 - top);
    float frond = pow(1.0 - abs(2.0 * vn(vec2(p.z * 40.0, p.y * 25.0)) - 1.0), 6.0);
    col += mix(c1, c2, frond) * lip * (0.2 + 0.9 * frond);
    // haze along the ray, thickening deeper
    float fog = 1.0 - exp(-d * 0.12);
    col = mix(col, c3 * 0.25 * sky, fog * 0.5);
    // far glacier fading into a low violet haze
    col = mix(col, mix(c3, c0, 0.5) * 0.45, smoothstep(5.0, 13.0, d) * top);
  } else {
    // rays leaving over the glacier toward a pale sky
    float hz = clamp(rd.y * 3.0 + 0.6, 0.0, 1.0);
    col = p.y < -0.05 ? vec3(0.0) : mix(mix(c3, c0, 0.5) * 0.45, c3 * 0.3, hz);
  }

  
  // snow motes sifting down into the dark, three depths
  float m1 = motes(uv, 0.06, t * 0.20, 1.0);
  float m2 = motes(uv * 1.0 + vec2(0.3, 0.0), 0.11, t * 0.30, 9.0);
  float m3 = motes(uv + vec2(0.7, 0.0), 0.2, t * 0.42, 17.0);
  float dim = 0.5 + 0.5 * smoothstep(-1.0, 0.6, uv.y);
  col += (c0 * m1 * 0.15 + c1 * m2 * 0.22 + mix(c1, c2, 0.5) * m3 * 0.3) * mot * dim;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
