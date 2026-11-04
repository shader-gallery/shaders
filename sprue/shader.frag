// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Sprue - a foundry hall at night. A crane ladle hangs from a gantry on the
// left third and pours a molten stream into a basin; the metal runs down a
// winding sand runner toward the viewer past iron-framed moulds, while a tapped
// furnace feeds a second channel along the far floor. Slack chains sag from
// the gantry, sparks rise and cool from the pour, heat glow climbs the brick
// walls and cold shafts slant through the smoke from high arched windows.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;    // speed of the metal running down the channels (default 0.6)
uniform float u_sparks;  // density and brightness of the rising sparks (default 1.0)
uniform float u_heat;    // brightness of the molten metal and the glow it throws (default 1.0)
uniform float u_shafts;  // strength of the cold window shafts through the smoke (default 0.8)

const float TAU = 6.2831853;
const float HZ = -0.02;    // eye-level horizon on screen
const float CAMH = 0.32;   // camera height above the floor
const float ZW = 8.0;      // depth of the far wall
const float ZL = 2.9;      // depth where the pour lands

vec3 c0, c1, c2, c3;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.73, 167.29))) * 6211.57);
}

float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = p * 2.07 + vec2(3.7, 11.2);
    a *= 0.5;
  }
  return s * 1.07;
}

// main runner centreline, world x by depth
float runX(float z) {
  return 0.55 - (z - 0.8) * 0.62 + 0.07 * sin(z * 2.3 + 0.6);
}

// far channel from the furnace tap, depth by world x
float farZ(float x, float fx) {
  return mix(ZW - 0.15, 5.2, smoothstep(fx, fx + 6.0, x)) + 0.18 * sin(x * 1.3 + 0.4);
}

// molten metal by position across the channel (0 centre, 1 bank) and along the flow
vec3 metal(float across, float s, float heat) {
  float a = clamp(across, 0.0, 1.0);
  float n = fbm(vec2(a * 1.3 + 2.0, s));
  float n2 = vn(vec2(a * 4.0 - 1.0, s * 2.7 + 5.0));
  float crust = smoothstep(0.6, 0.74, n + 0.3 * a * a);
  float crack = crust * (1.0 - smoothstep(0.0, 0.08, abs(n2 - 0.5)));
  float core = 1.0 - a * a * a;
  float vein = smoothstep(0.5, 0.9, n2) * core;
  vec3 hot = mix(c1, vec3(1.0), 0.15 + 0.35 * vein);
  vec3 m = mix(c0 * 0.9, hot, core * (0.6 + 0.4 * n2)) * 1.25;
  m = m * mix(1.0, 0.08, crust) + mix(c0, c1, 0.6) * crack * 0.7;
  return m * heat;
}

// an iron-framed sand mould: front plate, the side facing the runner and a
// sand top with a glowing sprue cup and a crusted riser
vec4 flask(vec2 uv, vec4 box, float hb, float seed, float T, float heat, float px, float glowL, float glowR) {
  vec3 c = vec3(0.0);
  float a = 0.0;
  float W = box.y - box.x;

  // front plate at depth box.z
  float fx0 = box.x / box.z, fx1 = box.y / box.z;
  float fy0 = HZ - CAMH / box.z, fy1 = HZ - (CAMH - hb) / box.z;
  float inF = smoothstep(fx0 - px, fx0 + px, uv.x) * smoothstep(fx1 + px, fx1 - px, uv.x)
            * smoothstep(fy0 - px, fy0 + px, uv.y) * smoothstep(fy1 + px, fy1 - px, uv.y);
  if (inF > 0.0) {
    vec2 lf = vec2((uv.x - fx0) / (fx1 - fx0), (uv.y - fy0) / (fy1 - fy0));
    float wear = fbm(vec2(lf.x * W * 26.0, lf.y * hb * 26.0) + seed);
    float ribX = lf.x * W * 7.0 + 0.3 * sin(seed * 3.0) + 0.15 * sin(lf.x * 9.0 + seed);
    float rib = smoothstep(0.36, 0.46, abs(fract(ribX) - 0.5));
    float flange = smoothstep(0.07, 0.02, abs(lf.y - 0.5));
    float lip = smoothstep(0.86, 0.94, lf.y) + smoothstep(0.1, 0.03, lf.y);
    float bolt = flange * smoothstep(0.12, 0.05, abs(fract(lf.x * W * 14.0 + seed) - 0.5));
    float lit = glowL * exp(-lf.x * 2.5) + glowR * exp(-(1.0 - lf.x) * 2.5) + 0.35 * exp(-lf.y * 2.0);
    // lifting lugs near the ends of the mid flange
    vec2 lg = vec2(abs(lf.x - 0.5) * W - (W * 0.5 - 0.05), (lf.y - 0.5) * hb);
    float lug = smoothstep(0.012, 0.009, length(lg * vec2(1.0, 1.4)));
    vec3 fc = c3 * (0.025 + 0.04 * wear);
    fc += mix(c3, c0, 0.7) * (0.06 + 0.45 * rib + 0.6 * flange + 0.45 * lip + 0.9 * bolt + 0.7 * lug) * (0.2 + 0.8 * wear) * lit * 0.45 * heat;
    c = fc;
    a = inF;
  }

  // the side plate facing the runner, if the camera can see it
  float sgn = box.x > 0.0 ? 1.0 : (box.y < 0.0 ? -1.0 : 0.0);
  if (sgn != 0.0 && uv.x * sgn > 1e-3) {
    float xs = sgn > 0.0 ? box.x : box.y;
    float zs = xs / uv.x;
    float ez = zs * zs / abs(xs) * px * 1.5;
    float sy0 = HZ - CAMH / zs, sy1 = HZ - (CAMH - hb) / zs;
    float inS = smoothstep(box.z - ez, box.z + ez, zs) * smoothstep(box.w + ez, box.w - ez, zs)
              * smoothstep(sy0 - px, sy0 + px, uv.y) * smoothstep(sy1 + px, sy1 - px, uv.y);
    if (inS > 0.0) {
      float v = (uv.y - sy0) / (sy1 - sy0);
      float u = (zs - box.z) / (box.w - box.z);
      float wear = fbm(vec2(u * 9.0, v * 4.0) + seed + 4.0);
      float rib = smoothstep(0.36, 0.46, abs(fract(u * 3.0 + 0.5) - 0.5));
      float flange = smoothstep(0.08, 0.02, abs(v - 0.5));
      float lit = (sgn > 0.0 ? glowL : glowR) * (0.6 + 0.8 * exp(-v * 2.0)) * (1.2 - 0.6 * u);
      vec3 sc = c3 * 0.05 + mix(c0, c1, 0.3 * wear) * (0.18 + 0.35 * rib + 0.5 * flange) * (0.3 + 0.7 * wear) * lit * 0.5 * heat;
      c = mix(c, sc, inS);
      a = max(a, inS);
    }
  }

  // sand top at height hb
  float dyT = HZ - uv.y;
  if (dyT > 1e-3) {
    float zt = (CAMH - hb) / dyT;
    float xt = uv.x * zt;
    float ez = zt * zt / (CAMH - hb) * px * 1.5;
    float ex = zt * px * 1.5;
    float inT = smoothstep(box.z - ez, box.z + ez, zt) * smoothstep(box.w + ez, box.w - ez, zt)
              * smoothstep(box.x - ex, box.x + ex, xt) * smoothstep(box.y + ex, box.y - ex, xt);
    if (inT > 0.0) {
      float g = fbm(vec2(xt, zt) * 16.0 + seed);
      float gr = vn(vec2(xt, zt) * 160.0 + seed);
      float edge = min(min(xt - box.x, box.y - xt), min(zt - box.z, box.w - zt) * 0.6);
      float rim = smoothstep(0.022, 0.008, edge);
      float lit = glowL * exp(-(xt - box.x) * 4.0) + glowR * exp(-(box.y - xt) * 4.0) + 0.25;
      // rammed sand, pale where the glow rakes across it
      vec3 tc = c3 * (0.04 + 0.05 * g) + mix(c3, c0, 0.5) * (0.3 + 0.5 * g) * (0.75 + 0.25 * gr) * lit * 0.14 * heat;
      tc = mix(tc, c3 * 0.03 + mix(c3, c0, 0.7) * (0.2 + 0.5 * g) * lit * 0.4 * heat, rim);
      // the sprue cup, brimming
      vec2 sp = vec2(box.x + W * (0.25 + 0.1 * hs(vec2(seed, 1.0))), mix(box.z, box.w, 0.5));
      float rs = length(vec2(xt - sp.x, (zt - sp.y) * 0.8));
      float r0 = 0.028;
      vec3 mc = metal(rs / r0, atan(zt - sp.y, xt - sp.x) * 0.6 + T * 0.05 + seed, heat);
      tc = mix(tc, mc, smoothstep(r0 + ex, r0 - ex, rs));
      tc += mix(c0, c1, 0.5) * exp(-max(rs - r0, 0.0) * 40.0) * 0.35 * heat;
      // a riser, crusted over with a glowing seam
      vec2 rp = vec2(box.x + W * (0.68 + 0.12 * hs(vec2(seed, 7.0))), mix(box.z, box.w, 0.45));
      float rr = length(vec2(xt - rp.x, (zt - rp.y) * 0.8));
      float r1 = 0.022 + 0.008 * hs(vec2(seed, 3.0));
      float crustN = fbm(vec2(xt, zt) * 60.0 + seed);
      vec3 rc = c3 * 0.08 + mix(c0, c1, 0.5) * smoothstep(0.03, 0.0, abs(crustN - 0.5)) * 0.6 * heat;
      rc += c0 * smoothstep(r1, r1 * 0.85, rr) * smoothstep(r1 * 0.6, r1, rr) * 0.6 * heat;
      tc = mix(tc, rc, smoothstep(r1 + ex, r1 - ex, rr));
      c = mix(c, tc, inT);
      a = max(a, inT);
    }
  }
  return vec4(c, a);
}

// a chain hanging in a shallow sag between two hangers, links alternating face-on and edge-on
vec3 chain(vec2 p, float x0, float x1, float top, float sag, float link, float px, float lit) {
  float m = 0.5 * (x0 + x1);
  float hw = 0.5 * (x1 - x0);
  float t = (p.x - m) / hw;
  if (abs(t) > 1.0) return vec3(0.0);
  float y = top - sag * (1.0 - t * t);
  float slope = 2.0 * sag * t / hw;
  float k = inversesqrt(1.0 + slope * slope);
  float dn = (p.y - y) * k;
  float s = (p.x - x0) / k;
  float li = floor(s / link);
  float ls = fract(s / link) - 0.5;
  float face = mod(li, 2.0);
  vec2 q = vec2(ls * link, dn);
  float ring = abs(length(vec2(q.x * 0.62, q.y)) - link * 0.28) - px * 0.9;
  float bar = max(abs(q.x) - link * 0.55, abs(q.y) - px * 1.1);
  float d = face < 0.5 ? ring : bar;
  float on = smoothstep(px, -px, d);
  float under = 0.5 + 0.5 * smoothstep(0.0, -link * 0.3, q.y);
  return vec3(on * (0.25 + 0.75 * under) * lit);
}

// rising sparks: short streaks that cool from violet-white to deep violet as they climb
vec3 sparks(vec2 p, float cell, float rise, float seed, vec2 src, vec2 src2, float dens, float T) {
  vec2 q = p / cell - vec2(0.0, rise);
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hs(id + seed);
  vec2 cp = (id + 0.5 + vec2(0.0, rise)) * cell;
  float above = max(cp.y - src.y, 0.0);
  float d1 = length((cp - src) * vec2(2.2, 0.9));
  float d2 = length((cp - src2) * vec2(2.6, 1.0));
  float pd = (exp(-d1 * 4.5) + 0.5 * exp(-d2 * 5.5) + 0.004) * dens;
  float on = step(h, pd);
  vec2 o = vec2(hs(id + seed + 3.1), hs(id + seed + 7.7)) - 0.5;
  o.x += 0.25 * sin(rise * 0.7 + h * TAU);
  float r = mix(0.06, 0.13, hs(id + seed + 1.9));
  vec2 dv = f - o * 0.6;
  dv.x += dv.y * 0.4 * sin(h * 9.0);
  // a hot head with a fading tail trailing below it
  float tail = clamp(-dv.y / 0.35, 0.0, 1.0);
  float sd = length(vec2(dv.x, max(dv.y, 0.0) + max(-dv.y - 0.35, 0.0)));
  float head = smoothstep(r, 0.0, length(dv));
  float m = on * max(head, smoothstep(r * 0.6, 0.0, abs(dv.x)) * step(sd, r) * (1.0 - tail) * 0.5);
  float cool = clamp(above * 2.2 + 0.3 * hs(id + seed + 5.3), 0.0, 1.0);
  vec3 tint = mix(mix(vec3(1.0), c1, 0.7), mix(c0, c3, 0.5), cool);
  float tw = 0.8 + 0.2 * sin(T * 2.3 + h * 40.0);
  return tint * m * tw * (1.5 - 1.2 * cool);
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution.xy;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float T = u_time;
  float flow = clamp(u_flow, 0.0, 2.0);
  float spk = clamp(u_sparks, 0.0, 2.0);
  float heat = clamp(u_heat, 0.0, 2.0);
  float shafts = clamp(u_shafts, 0.0, 2.0);
  float px = 1.0 / res.y;
  float WB = HZ - CAMH / ZW;                     // where the far wall meets the floor
  float fl = 0.88 + 0.12 * sin(T * 1.1) * sin(T * 0.63 + 1.0);   // breathing of the pour light
  vec2 L = vec2(runX(ZL) / ZL, HZ - CAMH / ZL);  // where the stream lands
  vec2 F = vec2(-0.60, WB);                      // foot of the furnace mouth

  // ---- far wall: soot-dark brick, lit from below by the heat ----
  vec2 pw = uv;
  float hy = pw.y - WB;
  float heatW = exp(-hy * 4.0) * (0.12 + 1.2 * exp(-abs(pw.x - F.x) * 3.5) + 0.9 * exp(-abs(pw.x - L.x) * 3.0));
  heatW += 0.6 * exp(-length(pw - vec2(L.x - 0.1, 0.06)) * 4.5);
  heatW *= heat * fl;
  float bh = 0.026;
  float row = floor(hy / bh);
  float bx = pw.x / 0.074 + 0.5 * mod(row, 2.0) + 0.17 * hs(vec2(row, 3.0));
  float bid = floor(bx);
  vec2 bf = vec2(fract(bx), fract(hy / bh));
  float bv = hs(vec2(bid, row));
  float wear = fbm(pw * 38.0 + 3.0);
  float mx = min(bf.x, 1.0 - bf.x) * 0.074 / bh;
  float my = min(bf.y, 1.0 - bf.y);
  float mort = smoothstep(0.03, 0.12 + 0.12 * wear, min(mx, my));
  float soot = mix(1.0, 0.3, smoothstep(0.05, 0.5, hy)) * (0.7 + 0.3 * fbm(pw * vec2(3.0, 1.2) + 9.0));
  vec3 brick = mix(c3, c0, 0.2 + 0.6 * bv) * (0.35 + 0.65 * wear) * mix(0.55, 1.0, mort);
  vec3 col = c3 * 0.02 + brick * (0.022 * soot + 0.6 * heatW);
  col += mix(c0, c1, 0.4) * heatW * smoothstep(0.3, 0.0, bf.y) * mort * 0.08;

  // high arched windows on the right, cold light through grimy leaded panes
  float shaftAir = 0.0;
  vec2 sdir = normalize(vec2(-0.42, -1.0));
  vec2 sper = vec2(-sdir.y, sdir.x);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 wc = vec2(0.18 + 0.24 * fi, 0.17 + 0.01 * fi);
    float hw = 0.062;
    vec2 d = pw - wc;
    float topY = d.y - 0.12;
    float r = topY > 0.0 ? length(vec2(d.x, topY)) - hw : max(abs(d.x) - hw, -0.13 - d.y);
    float inW = smoothstep(px * 1.5, -px * 1.5, r);
    float frame = smoothstep(px * 1.5, -px * 1.5, abs(r + 0.004) - 0.006);
    vec2 pq = vec2(d.x / (hw * 0.5), (d.y + 0.13) / 0.042);
    vec2 pid = floor(pq);
    vec2 pf = abs(fract(pq) - 0.5);
    float lead = smoothstep(0.40, 0.47, max(pf.x * 1.0, pf.y));
    float grime = fbm(pw * vec2(18.0, 10.0) + fi * 5.0);
    float pane = hs(pid + fi * 13.0);
    float broken = step(0.9, pane);
    vec3 glass = c2 * (0.08 + 0.22 * grime) * (0.6 + 0.6 * pane) + mix(c2, c1, 0.5) * broken * 0.25;
    glass *= (1.0 - lead * 0.85);
    col = mix(col, glass, inW);
    col = mix(col, c3 * 0.08 + c0 * heatW * 0.15, frame);
    // its shaft, falling down-left through the smoke
    vec2 sd = pw - wc;
    float along = dot(sd, sdir);
    float acr = dot(sd, sper);
    float wid = hw * (0.8 + along * 0.35);
    float beam = smoothstep(wid, wid * 0.3, abs(acr)) * smoothstep(-0.05, 0.12, along) * exp(-along * 0.9);
    beam *= 0.6 + 0.4 * vn(vec2(acr * 60.0 + fi * 7.0, T * 0.08));
    shaftAir += beam;
  }

  // the furnace: a brick breast on the left with an arched mouth full of flame
  {
    vec2 d = pw - F;
    float mw = 0.055;
    float topM = d.y - 0.075;
    float rm = topM > 0.0 ? length(vec2(d.x, topM)) - mw : max(abs(d.x) - mw, -d.y);
    float inM = smoothstep(px * 1.5, -px * 1.5, rm);
    float flame = fbm(vec2(d.x * 30.0, d.y * 14.0 - T * 0.9));
    float tongue = smoothstep(0.35, 0.8, flame - d.y * 3.0 + 0.25);
    float hotM = clamp(1.0 - d.y / 0.13, 0.0, 1.0);
    vec3 fire = c3 * 0.1 + mix(c0 * 0.7, mix(c1, vec3(1.0), 0.3 * hotM), tongue) * (0.2 + tongue) * 0.8 * heat * fl;
    // a glowing charge heaped at the back of the hearth
    fire += mix(c1, vec3(1.0), 0.25) * smoothstep(0.03, 0.0, d.y - 0.02 * vn(vec2(d.x * 60.0, T * 0.2))) * 0.6 * heat * fl;
    col = mix(col, fire, inM);
    // arch voussoirs catch the fire
    float ring = smoothstep(0.018, 0.0, abs(rm - 0.012)) * step(-0.01, d.y);
    float vs = smoothstep(0.3, 0.45, abs(fract(atan(topM, d.x) * 4.0) - 0.5));
    col += mix(c0, c1, 0.5) * ring * (0.4 + 0.6 * (1.0 - vs)) * 0.5 * heat * fl;
    col += mix(c1, c0, 0.5) * exp(-max(rm, 0.0) * 22.0) * (1.0 - inM) * 0.25 * heat * fl;
  }

  // ---- foundry floor: dark packed sand in perspective ----
  if (uv.y < WB + px * 2.0) {
    float dy = max(HZ - uv.y, 1e-3);
    float z = CAMH / dy;
    float wx = uv.x * z;
    float pxx = z * px * 1.5;
    float pxz = z * z / CAMH * px * 1.5;
    float g = fbm(vec2(wx * 4.0, z * 4.0));
    float g2 = vn(vec2(wx * 30.0, z * 30.0));
    vec3 fc = c3 * (0.03 + 0.04 * g + 0.03 * g2 * exp(-z * 0.6));

    // main runner from the basin toward the viewer
    float rx = runX(z);
    float wR = 0.05 + 0.008 * sin(z * 4.0 + 1.0);
    float dR = abs(wx - rx) * 0.85;
    float onR = smoothstep(ZL + 0.02, ZL - 0.08, z);
    vec2 bc = vec2(runX(ZL), ZL);
    float rB = 0.13;
    float dB = length(vec2(wx - bc.x, z - bc.y)) - rB;
    // far channel fed by the furnace tap
    float fxw = F.x * ZW;
    float fz = farZ(wx, fxw);
    float wF = 0.11;
    float dF = abs(z - fz);
    float onF = smoothstep(fxw - 0.1, fxw + 0.2, wx);

    float lightR = exp(-max(dR - wR, 0.0) * 7.0) * onR + 1.4 * exp(-max(dB, 0.0) * 5.0) + 0.7 * exp(-max(dF - wF, 0.0) * 2.0) * onF;

    // three branches feeding moulds
    float zb0 = 1.12, zb1 = 1.66, zb2 = 2.28;
    float brM = 0.0;
    vec3 brC = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float zk = fk < 0.5 ? zb0 : (fk < 1.5 ? zb1 : (fk < 2.5 ? zb2 : 1.05));
      float dir = fk > 2.5 ? -1.0 : 1.0;
      float x0 = runX(zk);
      float x1 = dir > 0.0 ? x0 + 0.2 : -0.1;
      float t = (wx - x0) * dir;
      float len = abs(x1 - x0);
      float wb = 0.028;
      float dzb = abs(z - zk - 0.02 * sin(wx * 8.0 + fk));
      float inX = smoothstep(-0.01, 0.03, t) * smoothstep(len + 0.02, len - 0.02, t);
      lightR += exp(-max(dzb - wb, 0.0) * 9.0) * inX * 0.6;
      float mk = smoothstep(wb + pxz, wb - pxz, dzb) * inX;
      if (mk > 0.0) {
        brC += metal(dzb / wb, wx * 3.0 * dir - T * flow * 0.7 + fk * 3.0, heat) * mk;
        brM += mk;
      }
    }

    // raked sand furrows and old splashes of cold metal scattered over the bed
    float rake = 0.5 + 0.5 * sin(wx * 26.0 + 2.0 * g);
    float splat = smoothstep(0.8, 0.86, vn(vec2(wx * 24.0, z * 24.0) + 17.0)) * exp(-z * 0.5) * 0.6;
    fc *= 0.8 + 0.4 * rake * exp(-z * 0.4);
    float pool = exp(-length(vec2(wx - runX(ZL), (z - ZL) * 0.7)) * 1.6);
    lightR += 1.2 * pool;
    fc += mix(c3, c0, 0.65) * lightR * (0.26 + 0.12 * rake) * heat * fl;
    fc += mix(c0, c1, 0.5) * splat * lightR * 0.35 * heat;
    // sand banks beside the runner catch the glow
    float bank = smoothstep(wR * 1.7, wR * 1.05, dR) * smoothstep(wR * 0.95, wR * 1.15, dR) * onR;
    fc += mix(c0, c1, 0.4) * bank * (0.2 + 0.3 * g) * heat * fl;

    float mR = smoothstep(wR + pxx, wR - pxx, dR) * onR;
    if (mR > 0.0) fc = mix(fc, metal(dR / wR, z * 4.5 + T * flow * 1.6, heat), mR);
    float mF = smoothstep(wF + pxz, wF - pxz, dF) * onF;
    if (mF > 0.0) fc = mix(fc, metal(dF / wF, wx * 1.2 - T * flow * 0.9, heat) * 0.9, mF);
    if (brM > 0.0) fc = mix(fc, brC / brM, clamp(brM, 0.0, 1.0));
    // the pouring basin: a swirling pool inside a raised refractory rim
    float mB = smoothstep(pxx, -pxx, dB);
    if (mB > 0.0) {
      vec2 bq = vec2(wx - bc.x, z - bc.y);
      float ang = atan(bq.y, bq.x);
      fc = mix(fc, metal((dB + rB) / rB, ang * 0.8 + length(bq) * 9.0 - T * flow * 1.5, heat * 1.1), mB);
    }
    float rimB = smoothstep(0.035, 0.0, abs(dB - 0.018)) * (0.6 + 0.4 * g);
    fc += mix(c0, c1, 0.5) * rimB * 0.45 * heat * fl;

    // haze toward the far wall
    fc = mix(fc, col, smoothstep(6.5, ZW, z) * 0.6);
    col = mix(col, fc, smoothstep(WB + px, WB - px, uv.y));
  }

  // ---- moulds, far to near ----
  {
    float x0 = runX(2.28), x1 = runX(1.66), x2 = runX(1.12);
    vec4 m;
    m = flask(uv, vec4(x0 + 0.2, x0 + 0.62, 2.16, 2.42), 0.085, 2.0, T, heat, px, 1.0, 0.1);
    col = mix(col, m.rgb, m.a);
    m = flask(uv, vec4(x1 + 0.2, x1 + 0.56, 1.55, 1.80), 0.075, 5.0, T, heat, px, 1.0, 0.1);
    col = mix(col, m.rgb, m.a);
    m = flask(uv, vec4(x2 + 0.2, x2 + 0.66, 1.00, 1.26), 0.095, 9.0, T, heat, px, 1.1, 0.1);
    col = mix(col, m.rgb, m.a);
    m = flask(uv, vec4(-0.78, -0.10, 0.90, 1.20), 0.11, 13.0, T, heat, px, 0.15, 1.2);
    col = mix(col, m.rgb, m.a);
  }

  // ---- the ladle and its pour ----
  float tilt = 0.55 + 0.05 * sin(T * 0.21);
  vec2 C = vec2(-0.37, 0.085) + vec2(0.006 * sin(T * 0.17), 0.0);
  float ct = cos(tilt), st = sin(tilt);
  vec2 hook = C + vec2(0.0, 0.15);
  {
    vec2 d = uv - C;
    vec2 q = vec2(ct * d.x - st * d.y, st * d.x + ct * d.y);
    // a bellied bucket: widest below the rim, rounded into the base
    float vy = clamp((0.06 - q.y) / 0.135, 0.0, 1.0);
    float hwq = 0.066 + 0.006 * sin(vy * 3.1) - 0.016 * vy * vy;
    float nb = fbm(q * 70.0);
    vec2 rq = vec2(abs(q.x) - hwq + 0.028, max(-0.075 + 0.028 - q.y, 0.0));
    float sdBase = length(max(rq, 0.0)) - 0.028;
    float sdB = max(max(abs(q.x) - hwq, q.y - 0.06), sdBase) + 0.0015 * (nb - 0.5);
    float inB = smoothstep(px * 1.5, -px * 1.5, sdB);
    float nx = clamp(q.x / hwq, -1.0, 1.0);
    float cyl = sqrt(1.0 - nx * nx);
    // light from the stream and basin below-right
    float litL = 0.35 + 0.9 * smoothstep(-0.6, 1.0, nx) * smoothstep(0.06, -0.07, q.y);
    float hoop = smoothstep(0.006, 0.0, abs(q.y + 0.045)) + smoothstep(0.006, 0.0, abs(q.y - 0.022));
    float rivet = hoop * smoothstep(0.3, 0.1, abs(fract(q.x / 0.018) - 0.5));
    float lipR = smoothstep(0.012, 0.0, abs(q.y - 0.056));
    vec3 lc = c3 * (0.06 + 0.06 * nb) * (0.5 + 0.5 * cyl);
    lc += mix(c3, c0, 0.6) * (0.12 + 0.35 * hoop + 0.4 * rivet) * cyl * litL * 0.6 * heat * fl;
    // glowing drips of spilled metal down the pouring side
    float drip = smoothstep(0.75, 1.0, nx) * smoothstep(0.35, 0.9, vn(vec2(q.x * 120.0, 3.0))) * smoothstep(-0.07, 0.05, q.y);
    lc += mix(c0, c1, 0.5) * drip * 0.5 * heat * fl;
    lc += mix(c1, vec3(1.0), 0.3) * lipR * (0.25 + 0.75 * smoothstep(0.0, 1.0, nx)) * 0.7 * heat * fl;
    col = mix(col, lc, inB);
    // bail from the trunnions up to the hook
    vec2 trL = C + vec2(-ct * 0.072, st * 0.072);
    vec2 trR = C + vec2(ct * 0.072, -st * 0.072);
    for (int s = 0; s < 2; s++) {
      vec2 a0 = s == 0 ? trL : trR;
      vec2 ab = hook - a0;
      float hproj = clamp(dot(uv - a0, ab) / dot(ab, ab), 0.0, 1.0);
      float db = length(uv - a0 - ab * hproj) - 0.0035;
      float inBail = smoothstep(px, -px, db);
      col = mix(col, c3 * 0.06 + c0 * 0.25 * heat * fl * (1.0 - hproj), inBail);
      float tr = smoothstep(0.009 + px, 0.009 - px, length(uv - a0));
      col = mix(col, c3 * 0.1 + c0 * 0.35 * heat * fl, tr);
    }
  }
  // the stream: a thinning parabola from the lip into the basin
  vec2 P0 = C + vec2(ct * 0.068 + st * 0.058, -st * 0.068 + ct * 0.058);
  {
    float span = max(P0.y - L.y, 1e-3);
    float t = (P0.y - uv.y) / span;
    if (t > -0.02 && t < 1.02) {
      float tc = clamp(t, 0.0, 1.0);
      float sx = P0.x + (L.x - P0.x) * sqrt(tc + 0.002);
      float slope = (L.x - P0.x) * 0.5 / sqrt(tc + 0.01) / span;
      float w = (0.010 - 0.004 * tc) * sqrt(1.0 + slope * slope);
      w *= 1.0 + 0.15 * sin(uv.y * 90.0 + T * flow * 6.0);
      float ac = abs(uv.x - sx - 0.002 * sin(uv.y * 40.0 - T * 2.0)) / w;
      float inS = smoothstep(1.0 + px / w, 1.0 - px / w, ac) * smoothstep(-0.02, 0.01, t) * smoothstep(1.02, 0.98, t);
      if (inS > 0.0) col = mix(col, metal(ac * 0.8, uv.y * 25.0 + T * flow * 4.0, heat * 1.15), inS);
      col += mix(c0, c1, 0.5) * exp(-max(ac - 1.0, 0.0) * w * 60.0) * 0.12 * heat * fl * step(0.0, t) * step(t, 1.0);
    }
    // splash at the landing
    float sl = length((uv - L - vec2(0.0, 0.006)) * vec2(1.0, 1.6));
    col += mix(c1, vec3(1.0), 0.4) * exp(-sl * sl * 3500.0) * 0.7 * heat * fl;
    col += mix(c0, c1, 0.4) * exp(-sl * 14.0) * 0.18 * heat * fl;
  }

  // ---- gantry: an I-beam across the top with slack chains sagging below ----
  float BY = 0.37;
  {
    float heatB = heat * fl * (0.25 + 0.9 * exp(-abs(uv.x - C.x) * 3.0) + 0.4 * exp(-abs(uv.x - F.x) * 3.0));
    float lower = smoothstep(BY - px, BY + px, uv.y) * smoothstep(BY + 0.016 + px, BY + 0.016 - px, uv.y);
    float web = smoothstep(BY + 0.014, BY + 0.016, uv.y) * smoothstep(BY + 0.05 + px, BY + 0.05 - px, uv.y);
    float upper = smoothstep(BY + 0.048, BY + 0.05, uv.y) * smoothstep(BY + 0.062 + px, BY + 0.062 - px, uv.y);
    float beam = max(max(lower, web), upper);
    float stiff = smoothstep(0.42, 0.48, abs(fract(uv.x / 0.11 + 0.3) - 0.5)) * web;
    float rv = smoothstep(0.003, 0.0015, length(vec2(fract(uv.x / 0.022) - 0.5, 0.0) * 0.022 + vec2(0.0, uv.y - BY - 0.008)));
    float bn = fbm(vec2(uv.x * 30.0, uv.y * 80.0));
    vec3 bcol = c3 * (0.03 + 0.03 * bn);
    bcol += mix(c3, c0, 0.6) * (lower * (0.4 + 0.6 * smoothstep(BY + 0.012, BY, uv.y)) + stiff * 0.5 + upper * 0.12 + rv * 0.8) * heatB * 0.35;
    col = mix(col, bcol, beam);
    // underside glow line where the heat licks the flange
    col += mix(c0, c1, 0.4) * exp(-(uv.y - BY) * (uv.y - BY) * 60000.0) * heatB * 0.18;
    // trolley over the ladle and the chain down to the hook
    vec2 tq = uv - vec2(hook.x, BY);
    float trol = smoothstep(px, -px, max(abs(tq.x) - 0.035, abs(tq.y + 0.012) - 0.012));
    col = mix(col, c3 * 0.05 + c0 * 0.3 * heatB * smoothstep(0.0, -0.024, tq.y), trol);
    float lk = 0.013;
    float cy = (uv.y - hook.y) / lk;
    float cf = mod(floor(cy), 2.0);
    vec2 cq = vec2(uv.x - hook.x, (fract(cy) - 0.5) * lk);
    float ringD = abs(length(vec2(cq.x, cq.y * 0.62)) - lk * 0.28) - px * 0.9;
    float barD = max(abs(cq.y) - lk * 0.55, abs(cq.x) - px * 1.1);
    float onC = smoothstep(px, -px, cf < 0.5 ? ringD : barD) * step(hook.y, uv.y) * step(uv.y, BY - 0.024);
    col = mix(col, c3 * 0.06 + mix(c0, c1, 0.3) * 0.45 * heatB, onC);
    // slack chains between hangers, sagging like swags
    vec3 ch = vec3(0.0);
    ch += chain(uv, -0.78, -0.52, BY, 0.11, 0.012, px, 1.0);
    ch += chain(uv, -0.06, 0.26, BY, 0.075, 0.011, px, 0.8);
    ch += chain(uv, 0.38, 0.79, BY, 0.13, 0.012, px, 0.7);
    ch += chain(uv, 0.08, 0.52, BY, 0.2, 0.012, px, 0.6);
    float chm = clamp(ch.x * 1.5, 0.0, 1.0);
    col = mix(col, c3 * 0.05 + mix(c0, c1, 0.35) * ch.x * 0.9 * (heatB + 0.15), chm);
  }

  // ---- smoke lit by the heat and the cold shafts ----
  float smoke = fbm(vec2(uv.x * 2.2, uv.y * 3.0 - T * 0.05) + vec2(0.3 * sin(T * 0.03), 0.0));
  float heatAir = exp(-length((uv - vec2(L.x, 0.0)) * vec2(1.6, 1.0)) * 2.0) + 0.5 * exp(-length(uv - F - vec2(0.0, 0.2)) * 3.0);
  col += mix(c3, c0, 0.5) * smoke * smoke * heatAir * 0.10 * heat * fl;
  col += c2 * shaftAir * (0.35 + 0.65 * smoke) * 0.10 * shafts;

  // ---- sparks at three depths ----
  vec2 src2 = F + vec2(0.0, 0.06);
  col += sparks(uv, 0.030, T * 0.28, 1.0, L, src2, 0.9 * spk, T) * 1.0 * spk;
  col += sparks(uv, 0.048, T * 0.36, 9.0, L, src2, 0.7 * spk, T) * 1.2 * spk;
  col += sparks(uv, 0.075, T * 0.46, 17.0, L + vec2(0.04, 0.0), src2, 0.5 * spk, T) * 1.4 * spk;

  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
