// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Conduit - inside a lava tube, walking downstream. Ribbed basalt arches close
// over a floor of crusted flow; molten seams glow between ropy crust plates
// that fold and drift toward the viewer. The seams light the tube from below:
// glazed walls and old flow-line shelves catch the cool glow, the vault stays
// in an ember-dark shade, sparks lift off the hot channel and the far bend of
// the tube fades into luminous haze.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;    // speed of the crust flow and the walk downstream (default 0.5)
uniform float u_heat;    // glow of the molten seams and the light they throw (default 1)
uniform float u_sparks;  // amount of sparks rising off the flow (default 1)
uniform float u_haze;    // fume and haze filling the tube (default 1)

const float FLR = -0.9;   // flow surface height
const float CY = 0.25;    // tube axis height

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(27.619, 113.73))) * 38517.91);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.82, 0.57, -0.57, 0.82);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vn(p);
    p = ROT * p * 2.07 + vec2(5.3, 1.7);
    a *= 0.5;
  }
  return s;
}

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vn(p);
    p = ROT * p * 2.07 + vec2(5.3, 1.7);
    a *= 0.5;
  }
  return s / 0.875;
}

// the tube winds gently
float pathX(float z) {
  return 1.1 * sin(z * 0.045) + 0.45 * sin(z * 0.11 + 1.0);
}

// how hot the flow runs at depth z: breakouts every few tens of metres
float hotAt(float z) {
  return 0.55 + 0.9 * smoothstep(0.4, 0.85, vn(vec2(z * 0.06, 3.0)));
}

float tubeD(vec3 p) {
  vec2 c = vec2(p.x - pathX(p.z), p.y - CY);
  // arched ribs, warped so no two match
  float rz = p.z + 0.6 * sin(c.x * 1.3 + p.z * 0.13) + 0.5 * vn(vec2(c.y * 1.5, p.z * 0.2));
  float rk = floor(rz / 3.3);
  float rc = 0.5 + 0.5 * cos(rz * 6.2832 / 3.3);
  float brk = smoothstep(0.25, 0.7, vn(vec2(c.x * 1.1 + c.y * 0.9, rk * 3.7)));
  float rib = rc * rc * rc * (0.08 + 0.24 * hs(vec2(rk, 1.7))) * (0.35 + 0.65 * brk);
  float rock = 0.5 * (fbm3(vec2(c.x * 1.4 + p.z * 0.2, p.z * 0.8)) + fbm3(vec2(c.y * 1.4, p.z * 0.8 + 5.0)));
  float lump = vn(vec2(c.x * 4.1 + c.y * 3.3, p.z * 3.6)) + 0.5 * vn(vec2(c.y * 9.0 - c.x * 5.0, p.z * 8.0));
  float r = 2.0 - rib + (rock - 0.5) * 0.5 + (lump - 0.75) * 0.09;
  // a bench of old flow along each wall: the wall below it bulges inward
  float lh = FLR + 0.42 + 0.12 * (vn(vec2(p.z * 0.3, step(0.0, c.x) * 7.0)) - 0.5);
  r -= 0.22 * smoothstep(lh + 0.04, lh - 0.04, p.y) * (0.5 + 0.5 * vn(vec2(p.z * 0.8, c.x)));
  // drips of glaze hanging from the vault
  float vault = smoothstep(0.9, 1.5, c.y);
  float dz = vn(vec2(c.x * 7.0, p.z * 7.0));
  r -= vault * 0.14 * dz * dz * dz * dz;
  return (r - length(c * vec2(0.85, 1.12))) * 0.75;
}

// crust field in flow coordinates: x across the channel, y downstream
// returns the seam field value n and the warp
vec3 crust(vec2 g, float drift) {
  vec2 f = vec2(g.x - pathX(g.y), g.y + drift);
  vec2 w = vec2(fbm3(f * vec2(0.6, 0.3)), fbm3(f * vec2(0.6, 0.3) + vec2(5.2, 1.3)));
  float bow = f.x * f.x * 0.22;
  float n = fbm(vec2(f.x * 0.9, (f.y + bow) * 0.5) + w * 2.4);
  float rope = sin((f.y + bow) * 6.5 + w.x * 7.0);
  return vec3(n, rope, w.x);
}

float floorD(vec3 p, float drift) {
  vec2 f = vec2(p.x - pathX(p.z), p.z + drift);
  float h = fbm3(f * vec2(0.9, 0.45));
  return p.y - FLR - 0.12 * h;
}

float mapD(vec3 p, float drift) {
  return min(tubeD(p), floorD(p, drift));
}

vec3 tubeN(vec3 p) {
  vec2 e = vec2(0.02, -0.02);
  return normalize(e.xyy * tubeD(p + e.xyy) + e.yyx * tubeD(p + e.yyx)
                 + e.yxy * tubeD(p + e.yxy) + e.xxx * tubeD(p + e.xxx));
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t = u_time;
  float flow = clamp(u_flow, 0.0, 2.0);
  float heat = clamp(u_heat, 0.0, 2.5);
  float haze = clamp(u_haze, 0.0, 2.0);
  float walk = t * (0.15 + 0.9 * flow);
  float drift = t * (0.08 + 0.5 * flow);

  // ember-dark ambient of the rock, the warm counter to the cool melt
  vec3 emb = vec3(0.07, 0.010, 0.008);

  // rising heat over the flow bends the view a little
  vec2 hq = vec2(uv.x * 22.0, uv.y * 40.0 - t * 1.4);
  float hb = smoothstep(0.1, -0.35, uv.y);
  uv += vec2(vn(hq) - 0.5, vn(hq * 1.7 + 3.0) - 0.5) * 0.006 * hb * heat;

  // camera: walking the axis, the tube vanishing toward the left third
  float cz = walk;
  vec3 ro = vec3(pathX(cz) + 0.35, 0.05, cz);
  vec3 ta = vec3(pathX(cz + 7.0), -0.05, cz + 7.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec2 sp = uv + vec2(0.2, 0.06);
  vec3 rd = normalize(fw * 1.25 + rt * sp.x + up * sp.y);

  float d = 0.05;
  float hit = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * d;
    float s = mapD(p, drift);
    if (s < 0.002 * d) { hit = 1.0; break; }
    d += s;
    if (d > 45.0) break;
  }
  d = min(d, 45.0);
  vec3 p = ro + rd * d;

  vec3 col;
  float isFloor = step(floorD(p, drift), tubeD(p));
  float hot = hotAt(p.z) * heat;
  if (isFloor > 0.5) {
    // crusted flow: dark plates, ropy folds, molten seams
    vec3 cr = crust(p.xz, drift);
    float sw = 0.010 + d * 0.0016;
    float e1 = abs(cr.x - 0.5);
    float e2 = abs(cr.x - 0.64);
    // fine cracks crazing the crust, from a second warped field
    float lx = p.x - pathX(p.z);
    vec2 fl2 = vec2(lx, p.z + drift);
    float ck = abs(fbm(fl2 * vec2(2.2, 1.4) + cr.z * 3.0) - 0.5);
    // a hot open channel down the middle where the crust breaks up most
    float chan = exp(-lx * lx * 0.9);
    float fz = smoothstep(6.0, 30.0, d);
    float core = smoothstep(sw, 0.0, e1) + 0.55 * smoothstep(sw * 0.7, 0.0, e2)
               + 0.3 * smoothstep(sw * 0.5, 0.0, ck) * (1.0 - fz);
    float white = smoothstep(sw * 0.45, 0.0, e1) * (0.4 + 0.6 * chan);
    float near = exp(-e1 * 30.0) + 0.5 * exp(-e2 * 36.0);
    float grain = fbm(fl2 * 9.0);
    float rope = 0.5 + 0.5 * cr.y;
    // plates rise away from the seams and wrinkle into ropes
    float lift = smoothstep(0.0, 0.09, min(e1, e2 + 0.03));
    vec3 plate = emb * (0.25 + 0.9 * grain) * (0.5 + 0.6 * lift);
    plate += mix(c3, c0, 0.3) * pow(rope, 5.0) * lift * 0.05 * hot * (1.0 - fz) * (0.4 + grain);
    plate += mix(c3, c0, 0.5) * near * (1.0 - 0.6 * lift) * 0.16 * hot;
    vec3 melt = mix(c3, c0, 0.55 + 0.45 * chan);
    float glow = core * (0.5 + 0.8 * chan) * hot * mix(1.0, 0.6, fz);
    col = plate + melt * glow * 0.9 + mix(c1, c2, 0.6) * white * hot * 0.9 * (1.0 - fz * 0.5);
    // far crust averages to a glowing sheet
    col = mix(col, mix(c3, c0, 0.5) * 0.18 * hot + emb * 0.3, fz * 0.6);
  } else {
    // basalt walls lit from below by the flow
    vec3 n = tubeN(p);
    vec2 c = vec2(p.x - pathX(p.z), p.y - CY);
    float rk = fbm(vec2(c.x * 2.6 + c.y * 1.9 + p.z * 0.5, p.z * 2.2 + c.y * 3.0));
    float hgt = max(p.y - FLR, 0.0);
    float fl = hot * (0.8 * exp(-hgt * 0.8) + 0.2);
    float face = clamp(0.55 - 0.45 * n.y, 0.0, 1.0);
    vec3 alb = vec3(0.4 + 1.0 * rk * rk);
    // the vault sinks into ember-dark shade, the walls take the cool melt light
    col = emb * alb * (0.5 + 0.6 * face) * mix(1.0, 0.45, smoothstep(0.5, 2.0, hgt));
    col += mix(c3, c0, 0.45) * alb * fl * face * 0.15 * (1.0 - 0.6 * smoothstep(0.5, 0.95, n.y));
    // glossy glaze patches catch the melt below
    float glz = smoothstep(0.5, 0.68, fbm(vec2(c.x * 1.2 + c.y * 1.1, p.z * 0.9 + 7.0)));
    vec3 rf = reflect(rd, n);
    float sh = pow(max(-rf.y, 0.0), 6.0);
    col += mix(c0, c1, 0.5) * sh * glz * fl * 0.5;
    // the bench lip catches the melt light along its edge
    float lip = smoothstep(0.15, 0.5, n.y) * smoothstep(0.95, 0.6, n.y) * smoothstep(FLR + 0.7, FLR + 0.3, p.y);
    col += mix(c1, c2, 0.3) * lip * fl * 0.14 * (0.5 + rk);
    // grazing edges of ribs and boulders pick up a cool rim from the melt
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * smoothstep(0.3, -0.6, n.y);
    col += mix(c3, c1, 0.4 + 0.4 * rk) * rim * fl * 0.35 * smoothstep(30.0, 4.0, d);
    // the hanging drips glint at their tips
    float tip = smoothstep(-0.6, -0.95, n.y) * smoothstep(1.0, 1.6, c.y) * smoothstep(0.6, 0.9, rk);
    col += c1 * tip * hot * 0.05;
    // where the wall meets the flow it glows hot
    col += mix(c0, c2, 0.4) * exp(-hgt * 9.0) * hot * 0.35;
    // dribbles of glaze down the lower wall
    float dr = smoothstep(0.82, 0.95, vn(vec2((c.x + c.y * 0.15) * 9.0 + p.z * 4.0, hgt * 0.8)));
    col += c0 * dr * exp(-hgt * 2.2) * hot * 0.25;
  }

  // fume lit by the flow, thickening toward the far bend
  // the fume is lit only by the melt: bright low and far, dark under the vault
  float fogk = 1.0 - exp(-d * 0.05 * (0.4 + haze));
  float low = smoothstep(0.3, -0.25, rd.y);
  vec3 fogc = mix(c3, c0, 0.35) * (0.12 + 0.08 * haze) * hotAt(ro.z + 25.0) * heat * (0.35 + 0.65 * low);
  fogc += mix(c0, c1, 0.5) * low * 0.05 * heat;
  col = col * (1.0 - fogk) + fogc * fogk;
  // a breathing glow from the hidden breakout beyond the bend
  vec2 vp = uv - vec2(-0.2, -0.04);
  col += mix(c1, c2, 0.4) * exp(-dot(vp, vp) * 28.0) * 0.10 * haze * heat * (0.85 + 0.15 * sin(t * 0.4));

  // sparks lifting off the flow, near layers larger and quicker
  float spk = max(u_sparks, 0.0);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float sc = 7.0 + fk * 5.0;
    vec2 g = uv * sc + vec2(t * 0.15 * (1.0 + fk * 0.3), -t * (0.6 - fk * 0.1) * (0.4 + flow));
    g.x += 0.4 * sin(g.y * 0.7 + fk * 2.0 + t * 0.3);
    vec2 cell = floor(g);
    vec2 cf = fract(g) - 0.5;
    float h = hs(cell + fk * 17.0);
    vec2 o = vec2(hs(cell + 3.3), hs(cell + 8.1)) - 0.5;
    vec2 dd = cf - o * 0.6;
    float sz = 0.025 + 0.03 * hs(cell + 1.1);
    float life = 0.5 + 0.5 * sin(t * (0.8 + h * 1.3) + h * 30.0);
    float pt = step(0.86, h) * exp(-dot(dd, dd) / (sz * sz)) * life;
    float lowk = smoothstep(0.45, -0.25, uv.y);
    col += mix(c1, c2, h) * pt * lowk * spk * 0.55 * (1.0 - fk * 0.18) * heat;
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
