// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Dripstone - a low view across a still underground pool. Ragged rock arches
// recede down a winding cave, each hung with ringed, fluted stalactites of
// every length, stalagmites and columns rising from the shallows by the walls.
// Black water mirrors it all and glows warm from patches deep below, lighting
// the stone from underneath. Wet tips swell with bright drops that fall and
// spread slow rings, and a thin mist lifts off the pool into blue-black shade.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glow;   // strength of the light rising from the pool (default 1)
uniform float u_mist;   // density of the mist lifting off the water (default 1)
uniform float u_drip;   // how often drops fall and ring the water (default 0.7)

const float DZ  = 0.62;  // spacing of the rock arches down the cave
const float CW  = 0.42;  // width of one stalactite cell along an arch
const float EYE = 0.32;  // camera height over the water
const float FOC = 1.05;  // focal length

vec3 gC0, gC1, gC2, gC3, gAmb;
float gT, gGlow, gDrip, gPx, gLaneX;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(17.917, 241.33))) * 52183.71);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

// the cave winds: centre line and half width along z
float wallX(float z) { return 0.8 * sin(z * 0.11) + 0.45 * sin(z * 0.27 + 1.3); }
float wallW(float z) { return 2.4 + 0.9 * vn(vec2(z * 0.35, 3.1)); }

// light welling up from the pool floor, in slowly drifting patches
float poolGlow(vec2 xz) {
  float n = 0.62 * vn(xz * 0.42 + vec2(gT * 0.03, -gT * 0.02))
          + 0.38 * vn(xz * 1.3 + vec2(-gT * 0.05, gT * 0.04) + 7.0);
  return 0.2 + smoothstep(0.38, 0.85, n);
}

// height of the vault on arch k at x: high over the pool, down to the
// waterline at the walls, with a ragged broken lip
float vault(float x, float k, float cx, float hw, float hc) {
  float a = clamp(abs(x - cx) / hw, 0.0, 1.3);
  float rough = 0.2 * vn(vec2(x * 2.3, k * 1.7)) + 0.07 * vn(vec2(x * 8.0, k * 2.9));
  return hc * (1.0 - a * a * a) + rough - 0.1;
}

// a stalactite cell: x centre, tip height, top radius, existence
vec4 stalCell(float id, float k, float cx, float hw, float hc, float cw, float lk) {
  float h = hs(vec2(id, k + lk * 17.0));
  float h2 = hs(vec2(id + 0.37, k * 1.3 + 9.0));
  float x = (id + 0.5) * cw + (h2 - 0.5) * cw * 0.3;
  float top = vault(x, k, cx, hw, hc) + 0.1;
  float side = smoothstep(0.15, 0.85, abs(x - cx) / hw);
  float L = lk * (0.12 + 1.6 * h2 * h2 * h) * (0.6 + 0.7 * side);
  // keep the stretch of water before the camera open
  float lane = smoothstep(0.5, 1.1, abs(x - cx - 0.2));
  float tip = max(top - L, mix(1.0, 0.12, lane));
  // a few reach the water and become columns
  tip = mix(tip, -0.1, step(0.955, h) * lane * step(0.3, side) * step(0.9, lk));
  return vec4(x, tip, cw * (0.09 + 0.17 * h), step(0.16, h) * step(tip, top - 0.05));
}

// drip cycle of a tip: x is ring age in seconds, y the ring fade
vec2 dripOf(float id, float k) {
  float h3 = hs(vec2(id * 1.9 + 5.0, k + 55.1));
  float rate = gDrip * (0.1 + 0.2 * h3);
  float ph = gT * rate + h3 * 13.0;
  float age = fract(ph) / max(rate, 1e-3);
  return vec2(age, (1.0 - fract(ph)) * exp(-age * 0.3));
}

vec3 lightStone(vec3 p, vec3 n, vec3 rd, float alb) {
  float g = poolGlow(p.xz) * gGlow;
  float rise = exp(-max(p.y, 0.0) * 0.38);
  float under = 0.3 + 0.7 * max(-n.y, 0.0) + 0.2 * max(0.0, -n.z);
  float lit = g * rise * under;
  // deep clay in the low light, the paler tones where it falls strongest
  vec3 warm = mix(gC3, gC0, smoothstep(0.1, 0.7, lit));
  warm = mix(warm, gC1, smoothstep(0.7, 1.4, lit));
  vec3 col = alb * (gAmb * (3.0 + 3.0 * max(n.y, 0.0)) + warm * lit * 3.2);
  vec3 rf = reflect(rd, n);
  col += gC2 * pow(max(-rf.y, 0.0), 8.0) * g * rise * alb * 2.5;
  return col;
}

vec3 gBead;

// one stalactite cell of width cw on arch k: ringed, fluted, tapering to a
// wet tip; returns colour and cover, and adds the tip drop to gBead
vec4 stalactite(vec3 P, vec3 rd, float k, float cx, float hw, float hc, float yc,
                float fp, float cw, float lk) {
  float id = floor(P.x / cw);
  vec4 sc = stalCell(id, k, cx, hw, hc, cw, lk);
  float top = yc + 0.15;
  float s = clamp((P.y - sc.y) / max(top - sc.y, 0.05), 0.0, 1.0);
  float hS = hs(vec2(id, k + lk * 17.0));
  float r = sc.z * s * (0.2 + 0.8 * s) + 0.0035;
  float ringF = 34.0 / lk;
  r *= 1.0 + 0.12 * sin(P.y * ringF + hS * 40.0) * s
       + 0.35 * (vn(vec2(P.x * 30.0 / lk, P.y * 4.0 + k)) - 0.5);
  float dx = P.x - sc.x;
  float dS = abs(dx) - r;
  if (P.y < sc.y) dS = length(vec2(dx, P.y - sc.y)) - 0.0035;
  float a = smoothstep(fp, -fp, dS) * sc.w;
  float nx = clamp(dx / max(r, 1e-3), -1.0, 1.0);
  vec3 n = normalize(vec3(nx, -0.35, -sqrt(max(1.0 - nx * nx, 0.0))));
  float ring = 0.5 + 0.5 * sin(P.y * ringF + hS * 40.0);
  float alb = 0.2 + 0.2 * ring * (0.5 + 0.5 * vn(vec2(nx * 3.0, P.y * 60.0)))
            + 0.12 * (1.0 - s);
  vec3 col = lightStone(P, n, rd, alb);
  if (lk > 0.9) {
    vec2 dr = dripOf(id, k);
    float swell = 1.0 - clamp(dr.y * 1.6, 0.0, 1.0);
    float dt = length(vec2(dx, P.y - sc.y + 0.008 + 0.01 * swell));
    float bead = exp(-dt * dt / (0.00012 + fp * fp)) * step(sc.y, 1.2) * sc.w;
    gBead += mix(gC2, vec3(1.0, 0.96, 0.92), 0.35) * bead * (0.5 + 1.1 * swell) * (0.3 + 0.7 * gGlow);
  }
  return vec4(col, a);
}

// one rock arch on the plane z = k * DZ: returns colour and cover
vec4 arch(vec3 ro, vec3 rd, float k, out float tHit) {
  gBead = vec3(0.0);
  float z = (k + (hs(vec2(k, 3.1)) - 0.5) * 0.4) * DZ;
  float t = (z - ro.z) / rd.z;
  tHit = t;
  if (t < 0.03) return vec4(0.0);
  vec3 P = ro + rd * t;
  float fp = max(t * gPx, 0.0015);
  float cx = wallX(z);
  float hw = wallW(z);
  float hc = 1.75 + 0.7 * vn(vec2(k * 0.41, 1.7));

  // the vault lip: rock above the line
  float yc = vault(P.x, k, cx, hw, hc);
  float eR = P.y - yc;
  float aR = smoothstep(-fp, fp, eR);
  float dyc = (vault(P.x + 0.02, k, cx, hw, hc) - yc) / 0.02;
  float lip = exp(-max(eR, 0.0) * 2.2);
  vec3 nR = normalize(vec3(-dyc * lip, -lip - 0.25, -1.0 + lip * 0.8));
  // flowstone: draped vertical runnels crossed by fine mineral bands
  float runnel = vn(vec2(P.x * 11.0 + k * 3.0, P.y * 0.8));
  float bandR = 0.5 + 0.5 * sin(P.y * 30.0 + 5.0 * vn(vec2(P.x * 2.0, k)));
  float albR = (0.14 + 0.12 * bandR * runnel + 0.1 * runnel * runnel) * (0.55 + 0.45 * lip);
  vec3 cR = lightStone(P, nR, rd, albR);

  // stalactites: a row of thick ones and a finer row of straws between
  vec4 sA = stalactite(P, rd, k, cx, hw, hc, yc, fp, CW, 1.0);
  vec4 sB = stalactite(P, rd, k, cx, hw, hc, yc, fp, CW * 0.45, 0.5);
  float aS = max(sA.a, sB.a);
  vec3 cS = sA.a >= sB.a ? sA.rgb : sB.rgb;
  // the wet tips gather a bright drop that swells before it falls
  vec3 beadC = gBead;

  // stalagmites and broken boulders in the shallows by the walls
  float id2 = floor(P.x / (CW * 1.3));
  float hM = hs(vec2(id2 + 3.3, k * 1.7));
  float xm = (id2 + 0.5) * CW * 1.3 + (hs(vec2(id2, k + 8.0)) - 0.5) * CW * 0.35;
  float near = smoothstep(hw * 0.45, hw * 0.85, abs(xm - cx)) * step(0.7, abs(xm - cx - 0.2));
  float H = (0.06 + 0.9 * hM * hM) * near;
  float sm = clamp(1.0 - P.y / max(H, 0.01), 0.0, 1.0);
  float rM = CW * 1.3 * (0.12 + 0.2 * hM) * sm * (0.45 + 0.55 * sm) + 0.01;
  // lumpy, dripped-on surface flaring into a rimstone foot at the water
  rM *= 1.0 + 0.07 * sin(P.y * 48.0 + hM * 30.0) * sm + 0.45 * (vn(vec2(P.x * 18.0, P.y * 7.0 + k)) - 0.5)
      + 0.8 * exp(-P.y * 14.0);
  float dxm = P.x - xm;
  float dM = P.y > H ? length(vec2(dxm, P.y - H)) - 0.01 : abs(dxm) - rM;
  float aM = smoothstep(fp, -fp, dM) * step(0.35, hM) * step(0.02, near);
  float nxm = clamp(dxm / max(rM, 1e-3), -1.0, 1.0);
  vec3 nM = normalize(vec3(nxm, 0.3, -sqrt(max(1.0 - nxm * nxm, 0.0))));
  vec3 cM = lightStone(P, nM, rd, 0.24 + 0.1 * vn(vec2(P.x * 20.0, P.y * 40.0)));

  // nearest layer wins: stalactite in front of the lip
  vec3 col = cR * aR;
  float a = aR;
  col = mix(col, cS, aS); a = max(a, aS);
  col = mix(col, cM, aM); a = max(a, aM);
  col += beadC * (1.0 - aR);
  return vec4(col, a * step(0.0, P.y + 0.15));
}

// march the arches front to back; returns colour and cover
vec4 cave(vec3 ro, vec3 rd, float tMax) {
  vec3 col = vec3(0.0);
  float A = 0.0;
  float k0 = floor(ro.z / DZ);
  for (int i = 0; i < 22; i++) {
    float k = k0 + float(i);
    float tH;
    vec4 c = arch(ro, rd, k, tH);
    if (tH > tMax) break;
    float fog = exp(-max(tH, 0.0) * 0.16);
    vec3 farC = gAmb * 1.3;
    col += (1.0 - A) * c.a * mix(farC, c.rgb, fog);
    A += (1.0 - A) * c.a;
    if (A > 0.985) break;
  }
  return vec4(col, A);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  gC0 = c0; gC1 = c1; gC2 = c2; gC3 = c3;
  gT = u_time;
  gGlow = clamp(u_glow, 0.0, 2.0);
  gDrip = clamp(u_drip, 0.0, 2.0);
  float mistK = clamp(u_mist, 0.0, 2.0);
  // blue-black shade of the cave against the warm pool light
  gAmb = vec3(0.006, 0.016, 0.052);

  vec2 res = u_resolution;
  float mn = max(min(res.x, res.y), 1.0);
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / mn;
  gPx = 1.0 / (mn * FOC);

  // low camera gliding slowly up the pool, horizon on the lower third
  float z0 = gT * 0.09;
  gLaneX = wallX(z0) + 0.2;
  vec3 ro = vec3(gLaneX, EYE, z0);
  vec2 sh = uv - vec2(0.12 * res.x / mn, -0.17);
  vec3 rd = normalize(vec3(sh, FOC));

  float tw = rd.y < 0.0 ? -ro.y / rd.y : 1e5;
  vec4 sc = cave(ro, rd, tw);
  // far down the cave the dark opens onto a warm glow on the water
  vec3 farC = gAmb * 1.3 + (gC1 * 0.3 + gC0 * 0.2) * gGlow * exp(-abs(rd.y) * 16.0)
            + gC3 * 0.08 * gGlow * exp(-abs(rd.y) * 5.0);
  vec3 col = sc.rgb;
  float T = 14.0;
  if (tw < 1e4 && sc.a < 0.985) {
    // still water: rings from falling drops, then a mirror of the vault
    vec3 P = ro + rd * tw;
    T = tw;
    vec2 gsum = vec2(0.0);
    float ringHi = 0.0;
    float kc = floor(P.z / DZ + 0.5);
    float ic = floor(P.x / CW);
    for (int j = 0; j < 9; j++) {
      float k = kc + mod(float(j), 3.0) - 1.0;
      float id = ic + floor(float(j) / 3.0) - 1.0;
      float z = (k + (hs(vec2(k, 3.1)) - 0.5) * 0.4) * DZ;
      float hc = 1.75 + 0.7 * vn(vec2(k * 0.41, 1.7));
      vec4 cl = stalCell(id, k, wallX(z), wallW(z), hc, CW, 1.0);
      vec2 dr = dripOf(id, k);
      vec2 dv = P.xz - vec2(cl.x, z);
      float r = length(dv) + 1e-4;
      float x = r - dr.x * 0.3;
      float env = dr.y * cl.w * step(cl.y, 0.95) * smoothstep(0.0, 0.3, dr.x) / (1.0 + r * 4.0);
      float e = exp(-x * x * 50.0);
      gsum += dv / r * (45.0 * cos(x * 45.0) - 100.0 * x * sin(x * 45.0)) * e * env * 0.003;
      ringHi += e * env * (0.5 + 0.5 * sin(x * 45.0));
    }
    // a barely moving surface sheen
    gsum += 0.01 * (vec2(vn(P.xz * 3.0 + gT * 0.1), vn(P.zx * 3.0 - gT * 0.08)) - 0.5);
    float fpz = tw * gPx / max(-rd.y, 0.02);
    gsum *= 1.0 - smoothstep(0.02, 0.08, fpz);
    vec3 n = normalize(vec3(-gsum.x, 1.0, -gsum.y));
    vec3 rr = reflect(rd, n);
    rr.y = max(rr.y, 0.005);
    vec4 rc = cave(P, rr, 40.0);
    vec3 rfar = gAmb * 1.3 + (gC1 * 0.3 + gC0 * 0.2) * gGlow * exp(-rr.y * 16.0)
              + gC3 * 0.08 * gGlow * exp(-rr.y * 5.0);
    vec3 refl = rc.rgb + (1.0 - rc.a) * rfar;
    float fres = 0.45 + 0.55 * pow(1.0 - max(-rd.y, 0.0), 5.0);
    float g = poolGlow(P.xz) * gGlow;
    vec3 deep = mix(gC3 * 0.3, gC0 * 0.55, smoothstep(0.3, 1.0, g)) * g;
    deep += gC2 * 0.3 * smoothstep(0.9, 1.2, g) * gGlow;
    vec3 wc = refl * fres + deep * 0.32 * exp(-tw * 0.08) + gC2 * ringHi * 0.3 * (0.4 + 0.6 * gGlow);
    wc = mix(wc, farC, 1.0 - exp(-tw * 0.1));
    col += (1.0 - sc.a) * wc;
  } else {
    col += (1.0 - sc.a) * farC;
  }

  // mist lifting off the pool, lit from below
  vec3 mist = vec3(0.0);
  float Tm = min(T, 12.0);
  for (int i = 0; i < 8; i++) {
    float ti = (float(i) + 0.5) / 8.0 * Tm;
    vec3 Q = ro + rd * ti;
    float dens = exp(-max(Q.y, 0.0) * 2.6)
               * smoothstep(0.25, 0.9, vn(vec2(Q.x * 1.1 + Q.z * 0.3, Q.y * 1.6 - gT * 0.12) + Q.z * 0.25));
    mist += mix(gC0, gC1, dens) * dens * poolGlow(Q.xz) * gGlow;
  }
  col += mist * Tm / 8.0 * 0.05 * mistK;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
