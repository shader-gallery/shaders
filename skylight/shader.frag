// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Skylight - a low eye inside a lava tube where the roof has fallen in.
// A ragged collapse in the upper left opens on a cold night sky and drops a
// shaft of pale light, full of rising steam, onto the crusted flow. Folding
// crust plates drift toward the eye between molten seams, the tube bends right
// and its far reach is lost in glowing fume behind the inner wall.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // heat of the molten seams and the light they throw on the rock (default 1)
uniform float u_melt;   // how molten the floor is: width of the seams between crust plates (default 1)
uniform float u_flow;   // speed of the crust plates drifting toward the eye (default 0.5)
uniform float u_shaft;  // strength of the daylight shaft and steam under the collapse (default 1)

const float HOR = -0.17;  // horizon height in frame units
const float VX = -0.1;    // straight-ahead point, left of centre
const float CAM = 1.4;    // eye height above the flow, metres
const float FOC = 0.9;    // focal length in frame units
const float R0 = 4.4;     // mean tube radius, metres
const float CY = 0.6;     // tube axis height above the eye
const float AX = 1.5;     // sideways stretch of the cross-section
const float BY = 0.78;    // vertical squash of the cross-section
const float BEND = 0.006; // how hard the tube swings right with distance
const vec2 HC = vec2(-2.4, 9.0);  // collapse centre, x and z on the roof
const float HR = 2.6;     // collapse radius, metres
const float YR = 3.7;     // roof height at the collapse
const vec3 LD = vec3(0.35, -1.0, -0.25);  // direction the daylight travels

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.61))) * 24719.83);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vn(p);
    p = ROT * p * 2.03 + vec2(3.7, 1.9);
    a *= 0.5;
  }
  return s;
}

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vn(p);
    p = ROT * p * 2.03 + vec2(3.7, 1.9);
    a *= 0.5;
  }
  return s;
}

float axisX(float z) {
  return 0.3 + BEND * z * z;
}

float radiusAt(float z) {
  return R0 + 0.28 * sin(z * 0.55 + 1.1 * sin(z * 0.13)) + 0.5 * (vn(vec2(z * 0.06, 3.0)) - 0.5);
}

// signed: below zero inside the tube
float tubeF(vec3 p) {
  vec2 d = vec2((p.x - axisX(p.z)) / AX, (p.y - CY) / BY);
  return length(d) - radiusAt(p.z);
}

// ragged edge of the roof collapse: below zero inside the hole
float holeD(vec2 xz) {
  vec2 q = vec2(xz.x - HC.x, (xz.y - HC.y) * 0.8);
  float a = atan(q.y, q.x);
  float rag = 0.45 * (vn(vec2(a * 2.2 + 4.0, 1.3)) - 0.5) + 0.25 * (vn(vec2(a * 6.0, 7.7)) - 0.5);
  return length(q) - HR * (1.0 + rag);
}

// daylight reaching a point: trace back up along the light to the roof plane
float daylight(vec3 p) {
  vec3 l = normalize(LD);
  float k = (YR - p.y) / max(-l.y, 1e-3);
  vec3 q = p - l * k;
  return smoothstep(0.5, -0.6, holeD(q.xz)) * step(p.y, YR);
}

vec3 sky(vec2 u, float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float h = clamp(u.y * 2.2 + 0.45, 0.0, 1.0);
  vec3 col = mix(c2 * 0.4 + c0 * 0.2, c3 * 0.22, h);
  // the last of the day lies low on one side
  col += c2 * 0.18 * exp(-(u.x - 0.18) * (u.x - 0.18) * 20.0) * (1.0 - h);
  // thin high cloud dragging across, lit pale from a low moon
  vec2 cp = vec2(u.x * 3.0 + t * 0.04, u.y * 6.0);
  float cl = smoothstep(0.45, 0.8, fbm3(cp + vec2(0.0, fbm3(cp * 0.7) * 1.5)));
  col += mix(c1, c2, 0.6) * cl * 0.16;
  // stars
  vec2 g = u * 70.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (vec2(hs(id), hs(id + 3.1)) - 0.5) * 0.6;
  float st = step(0.82, hs(id + 7.7)) * exp(-dot(f, f) * 160.0);
  st *= 0.6 + 0.4 * sin(t * (1.0 + hs(id) * 2.0) + hs(id + 1.0) * 20.0);
  col += mix(c2, vec3(1.0), 0.3) * st * (1.0 - cl) * 0.6 * h;
  return col;
}

vec3 floorCol(float x, float z, float t, float glow, float melt, float flow,
              vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 ember) {
  float far = smoothstep(25.0, 75.0, z);
  float xr = x - axisX(z);
  // crust banks near the walls are solid and cooled
  float bank = smoothstep(2.0, 3.4, abs(xr) + 0.6 * (vn(vec2(z * 0.4, 2.0)) - 0.5));
  vec2 p = vec2(xr * 1.05, (z + t * flow) * 0.6);
  // the plates fold and slide as they ride the flow
  vec2 w = vec2(fbm3(p * 0.7 + vec2(1.3, t * 0.03)), fbm3(p * 0.7 + vec2(6.1, 3.0 - t * 0.025))) - 0.5;
  vec2 q = p + w * 2.2;
  float n = fbm(q * 1.15);
  // a second, broader family of rifts crosses the first and closes the plates
  float nb = fbm3(q * 0.5 + vec2(11.0, 4.0));
  float dn = min(abs(n - 0.5), abs(nb - 0.5) * 1.3);
  float ws = 0.02 * melt * (1.0 + far * 2.0) * (1.0 - 0.8 * bank);
  float core = exp(-dn * dn / (ws * ws));
  float halo = exp(-dn / (ws * 3.0));
  // hairline cracks and pinholes inside the plates
  float n2 = fbm3(q * 3.9 + vec2(2.3, -t * 0.04));
  float d2 = abs(n2 - 0.46);
  float crack = exp(-d2 * d2 / 0.0006) * smoothstep(0.03, 0.18, dn) * 0.35 * (1.0 - bank);
  float breathe = 0.8 + 0.2 * sin(t * 0.6 + n * 15.0 + q.y * 0.9);
  float hot = mix(core + crack, 0.12 * melt, far) * breathe;
  float lit = mix(halo, 0.25 * melt, far) * (1.0 - 0.7 * bank);
  // crust: ropy folds, pitted grain, raised rims beside each seam
  float g = vn(q * 12.0) * 0.6 + vn(q * 31.0) * 0.4;
  float rope = 0.5 + 0.5 * sin(q.y * 8.0 + 6.0 * w.x + 2.5 * w.y + n * 4.0);
  float crust = (0.35 + 0.65 * mix(g, 0.5, far)) * (0.5 + 0.5 * mix(rope, 0.5, far));
  float rim = smoothstep(0.02, 0.05, dn) * smoothstep(0.1, 0.05, dn) * (1.0 - far);
  vec3 col = ember * (0.4 + crust);
  col += mix(c3, c0, 0.4) * lit * crust * 0.3 * glow;
  col += mix(c0, c1, 0.5) * rim * crust * 0.35 * glow * (1.0 - bank);
  vec3 seam = mix(c0, c1, smoothstep(0.0, 0.5, core));
  seam = mix(seam, c2 * 1.25, smoothstep(0.6, 1.0, core));
  col += seam * hot * 1.9 * glow;
  return col;
}

vec3 wallCol(vec3 p, float t, float glow, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 ember, float sh) {
  float far = smoothstep(30.0, 80.0, p.z);
  vec2 d = vec2((p.x - axisX(p.z)) / AX, (p.y - CY) / BY);
  float up = clamp(d.y / max(length(d), 1e-3), -1.0, 1.0);
  float roof = smoothstep(0.45, 0.8, up);
  float side = sign(d.x);
  float lv = p.y + CAM;
  // layered rock: flow banding along the wall, broken by fbm
  float nA = fbm(vec2(p.z * 0.28, lv * 0.5 + side * 5.0));
  float g = vn(vec2(p.z * 2.4, lv * 2.6)) * 0.5 + vn(vec2(p.z * 7.0, lv * 6.5 + p.x)) * 0.5;
  float rock = mix(0.25 + 0.75 * nA, 0.5, far) * (0.65 + 0.35 * mix(g, 0.5, far));
  // floor glow climbs the wall and fades toward the roof
  float fgl = 0.6 + 0.4 * sin(p.z * 0.21 + t * 0.45 + 3.0 * vn(vec2(p.z * 0.1, 1.0)));
  float fl = exp(-max(lv, 0.0) * 0.7) * fgl;
  vec3 col = ember * (0.3 + rock * 1.2);
  col += mix(c3, c0, 0.5) * fl * rock * rock * 0.6 * glow;
  // the old flow levels left shelves along the wall, their lips catch the glow
  float band = sin(lv * 2.1 + 2.5 * nA + 0.3 * sin(p.z * 0.2));
  float ledge = smoothstep(0.86, 1.0, band) * (1.0 - far) * (1.0 - roof);
  col *= 1.0 - 0.35 * smoothstep(0.2, -0.6, band) * (1.0 - roof);
  col += mix(c0, c1, 0.5) * ledge * fl * rock * 0.35 * glow;
  // molten cracks low on the wall
  float nc = fbm3(vec2(p.z * 0.4 + 5.0 + side * 9.0, lv * 0.65));
  float dc = abs(nc - 0.45);
  float wc = exp(-dc * dc / 0.00012) * smoothstep(1.6, 0.2, lv) * (1.0 - far);
  wc *= 0.7 + 0.3 * sin(t * 0.4 + p.z * 0.3);
  col += mix(c1, c2, wc) * wc * 0.7 * glow;
  // the roof: a glazed crust with lavacicles, and the collapse
  if (roof > 0.01) {
    float hd = holeD(p.xz);
    vec2 gp = vec2(p.x * 1.3, p.z * 1.1);
    vec2 id = floor(gp);
    vec2 f = fract(gp) - 0.5;
    vec2 o = (vec2(hs(id + 4.1), hs(id + 9.7)) - 0.5) * 0.6;
    float r = length((f - o) * vec2(1.0, 0.8));
    float has = step(0.4, hs(id + 2.2)) * (1.0 - far);
    float sz = 0.08 + 0.3 * hs(id + 6.6) * hs(id + 1.9);
    float drip = smoothstep(sz, sz * 0.2, r) * has * roof;
    col *= 1.0 - 0.55 * drip;
    col += mix(c0, c2, 0.4) * smoothstep(sz * 0.5, 0.0, r) * has * roof * 0.12 * glow * (0.4 + fgl);
    // the broken lip of the collapse catches the daylight
    float lip = smoothstep(0.9, 0.0, hd) * step(0.0, hd);
    float lipg = 0.3 + 0.7 * vn(p.xz * 4.0);
    col += mix(c2, c0, 0.35) * lip * lip * lipg * 0.3 * sh;
    col += c0 * smoothstep(4.0, 0.0, hd) * rock * rock * 0.06 * sh;
    // glazed drip ripples on the roof catch the cold fume light
    float rip = 0.5 + 0.5 * sin(p.x * 3.0 + 4.0 * nA + p.z * 0.4);
    col += mix(c3, c0, 0.5) * smoothstep(0.75, 1.0, rip) * rock * roof * 0.09 * glow * (1.0 - far);
  }
  // the inner side under the collapse is washed by bounced daylight
  float bounce = exp(-length(vec2(p.x - HC.x - 1.0, p.z - HC.y + 1.0)) * 0.35) * (1.0 - roof) * smoothstep(0.0, 3.0, lv);
  col += mix(c0, c2, 0.3) * bounce * rock * 0.18 * sh;
  return col;
}

vec3 motes(vec2 uv, float t, vec3 c1, vec3 c2) {
  vec3 m = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    float s = 8.0 + 6.0 * k;
    vec2 g = vec2(uv.x * s + k * 2.9, uv.y * s - t * (0.12 + 0.05 * k));
    g.x += 0.35 * sin(t * 0.37 + k * 1.7 + g.y * 0.6);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5 - (vec2(hs(id + k * 5.3), hs(id + 4.4 + k)) - 0.5) * 0.5;
    float pres = step(0.88, hs(id + k * 11.9));
    float hh = hs(id + 2.1);
    float blink = 0.5 + 0.5 * sin(t * (0.7 + hh * 1.4) + hh * 25.0);
    m += mix(c1, c2, hh) * pres * exp(-dot(f, f) * mix(100.0, 280.0, k * 0.5)) * blink * 0.3;
  }
  return m * smoothstep(0.5, -0.2, uv.y);
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
  float glow = clamp(u_glow, 0.0, 3.0);
  float melt = clamp(u_melt, 0.1, 3.0);
  float flow = clamp(u_flow, 0.0, 3.0);
  float sh = clamp(u_shaft, 0.0, 3.0);
  // deep ember-dark shadow of the rock, a warm counter to the cold light
  vec3 ember = vec3(0.07, 0.01, 0.006);

  vec2 u2 = uv - vec2(VX + 0.012 * sin(t * 0.13), HOR + 0.005 * sin(t * 0.19 + 1.0));
  vec3 rd = vec3(u2 / FOC, 1.0);

  // march the bent, ribbed tube with growing steps, then refine
  float s0 = 0.0, s1 = 0.0;
  float sc = 0.4;
  float tw = 120.0;
  for (int i = 0; i < 48; i++) {
    s1 = sc;
    if (tubeF(rd * s1) > 0.0) { tw = s1; break; }
    s0 = s1;
    sc *= 1.13;
  }
  if (tw < 120.0) {
    float lo = s0, hi = s1;
    for (int i = 0; i < 6; i++) {
      float mid = 0.5 * (lo + hi);
      if (tubeF(rd * mid) > 0.0) hi = mid; else lo = mid;
    }
    tw = hi;
  }
  float tf = rd.y < -1e-4 ? CAM / (-rd.y) : 1e5;

  vec3 col;
  float tc;
  bool isSky = false;
  if (tf < tw) {
    tc = tf;
    vec3 p = rd * tf;
    col = floorCol(p.x, p.z, t, glow, melt, flow, c0, c1, c2, c3, ember);
    // the cold pool where the shaft lands, steam-dappled
    float dl = daylight(p);
    col += mix(c2, c0, 0.3) * dl * (0.35 + 0.65 * fbm3(p.xz * 1.4 + vec2(t * 0.1, 0.0))) * 0.6 * sh;
  } else {
    tc = tw;
    vec3 p = rd * tw;
    vec2 d = vec2((p.x - axisX(p.z)) / AX, (p.y - CY) / BY);
    float up = d.y / max(length(d), 1e-3);
    float hd = holeD(p.xz);
    if (up > 0.4 && hd < 0.0) {
      isSky = true;
      col = sky(uv - vec2(-0.34, 0.2), t, c0, c1, c2, c3) * (0.6 + 0.4 * sh);
      // the broken thickness of the roof, seen up the far side of the opening,
      // is daylit rock; it thins out toward the near side
      float ang = atan(p.z - HC.y, p.x - HC.x);
      float farSide = clamp((p.z - HC.y) / HR + 0.3, 0.0, 1.0);
      float thick = (0.02 + 1.3 * farSide * farSide) * (0.5 + 1.0 * vn(vec2(ang * 3.0, 5.0)));
      float wallIn = smoothstep(-thick - 0.06, -thick, hd);
      float strata = 0.5 + 0.5 * sin(hd * 14.0 + 3.0 * vn(vec2(ang * 9.0, hd * 2.0)));
      float gr = vn(vec2(ang * 40.0, hd * 9.0));
      vec3 lipCol = ember * 0.8 + mix(c0, c2, 0.3 + 0.4 * farSide) * (0.08 + 0.22 * strata * gr) * (0.4 + 0.6 * sh);
      col = mix(col, lipCol, wallIn);
    } else {
      col = wallCol(p, t, glow, c0, c1, c2, c3, ember, sh);
    }
  }

  // fume thickening toward the bend, lit by the hidden lava beyond it
  float fa = 1.0 - exp(-tc * 0.022);
  vec3 fogc = c3 * 0.05 + mix(c0, c1, 0.55) * 0.5 * smoothstep(18.0, 70.0, tc) * glow;
  if (!isSky) col = mix(col, fogc, fa);

  // the daylight shaft: steam rising through it scatters the cold light
  float sMax = min(tc, 30.0);
  float acc = 0.0;
  for (int i = 0; i < 16; i++) {
    float s = (float(i) + 0.5 + 0.5 * hs(gl_FragCoord.xy + float(i))) / 16.0 * sMax;
    vec3 p = rd * s;
    float dl = daylight(p);
    if (dl > 0.0) {
      float steam = fbm3(vec2(p.x * 0.7 + p.z * 0.3, p.y * 0.5 - t * 0.35) + vec2(0.0, p.z * 0.4));
      float st = smoothstep(0.3, 0.7, steam);
      acc += dl * (0.15 + 1.2 * st) * smoothstep(-CAM, -CAM + 1.0, p.y);
    }
  }
  acc *= sMax / 16.0;
  col += mix(c2, c0, 0.45) * acc * 0.055 * sh;

  // sparks rising on the hot air
  col += motes(uv, t, c1, c2);

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
