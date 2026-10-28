// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Shallows - a clear sandy shallow seen from just above the bed. Wave-rippled
// sand recedes to a hazy reef line under the rolling ceiling of the surface;
// caustic filaments, refracted through the moving swell, fold and slide over
// the ripples and across worn boulders, light shafts lean in from the sun at
// the upper right and silt motes hang at three depths in the haze.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swell;     // speed of the surface swell that drives the caustics (default 0.7)
uniform float u_caustics;  // brightness of the caustic filaments (default 1.0)
uniform float u_haze;      // density of the suspended haze between depth layers (default 1.0)
uniform float u_motes;     // density and brightness of the drifting silt motes (default 1.0)

const float TAU = 6.2831853;
const float HZ = 0.15;     // horizon on screen, upper third
const float CAMH = 0.34;   // eye height above the sand
const float SURF = 0.95;   // surface height above the eye

vec3 c0, c1, c2, c3;
vec3 Ld;                   // direction toward the sun, world (x, up, z)

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(59.17, 113.83))) * 4813.29);
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
    p = p * 2.11 + vec2(5.3, 1.7);
    a *= 0.5;
  }
  return s * 1.07;
}

// one swell train: adds its curvature (xx, yy, xy) and its slope
void wv(vec2 p, float t, float a, float k, float w, float s, inout vec3 H, inout vec2 G) {
  vec2 d = vec2(cos(a), sin(a));
  float ph = k * dot(d, p) - w * t + a * 7.0;
  H += -s * sin(ph) * vec3(d.x * d.x, d.y * d.y, d.x * d.y);
  G += (s / k) * cos(ph) * d;
}

// the swell over a point of the bed, curvature already scaled by the water depth
vec3 swell(vec2 p, float t, out vec2 G) {
  vec2 w = vec2(vn(p * 1.3 + vec2(t * 0.06, 3.0)), vn(p * 1.3 + vec2(7.0, -t * 0.05))) - 0.5;
  p += w * 0.25;
  vec3 H = vec3(0.0);
  G = vec2(0.0);
  wv(p, t, 0.95, 13.0, 0.80, 1.25, H, G);
  wv(p, t, 1.30, 17.0, 0.95, 0.95, H, G);
  wv(p, t, 0.65, 22.0, 1.15, 0.70, H, G);
  wv(p, t, 1.15, 29.0, 1.40, 0.40, H, G);
  wv(p, t, 0.35, 11.0, 0.60, 0.22, H, G);
  return H;
}

// focusing of light through the swell: the inverse area of a refracted beam
float focus(vec3 H, float D, float eps) {
  float det = (1.0 + D * H.x) * (1.0 + D * H.y) - D * D * H.z * H.z;
  return 1.0 / (abs(det) + eps);
}

// caustic light in theme colours, with a small dispersion split
vec3 caustic(vec2 p, float t, float eps) {
  vec2 G;
  vec3 H = swell(p, t, G);
  float a = focus(H, 0.93, eps);
  float b = focus(H, 1.07, eps);
  float w = min(a, b);
  return c2 * a * a * 0.12 + c1 * b * b * 0.14 + vec3(0.9, 0.85, 1.0) * w * w * w * 0.012;
}

// water haze over a distance d, thickening and thinning in slow drifting banks
float hazeAmt(float d, vec2 uv, float T, float hz) {
  float bank = fbm(vec2(uv.x * 1.4 + T * 0.012, uv.y * 3.0 + d * 0.15));
  float dens = (0.05 + 0.20 * hz) * (0.6 + 0.8 * bank);
  return 1.0 - exp(-d * dens);
}

// a worn boulder sitting in the sand: x, depth, footprint radius, height
vec4 boulder(vec2 uv, vec4 r, float seed, float t, float px, vec3 fogC, float T, float hz, float cs, inout float depth) {
  float z = r.y;
  vec2 b = vec2(r.x / z, HZ - CAMH / z);
  float sr = r.z / z;
  float sh = r.w / z;
  vec2 q = vec2((uv.x - b.x) / sr, (uv.y - b.y) / sh);
  if (abs(q.x) > 1.6 || q.y > 1.6 || q.y < -1.2) return vec4(0.0);
  float ang = atan(q.y, q.x);
  float lump = fbm(vec2(ang * 1.3 + seed, seed * 0.7)) - 0.5;
  float chip = vn(vec2(ang * 6.0, seed)) - 0.5;
  float rad = 1.0 + 0.28 * lump + 0.06 * chip;
  float d = length(q) - rad;
  // the bed swallows the foot: footprint front edge comes closer to the eye
  float foot = (CAMH / z - CAMH / (z - r.z * 0.8)) / sh * sqrt(max(1.0 - q.x * q.x / (rad * rad), 0.0));
  float berm = 0.06 * sin(q.x * 9.0 + seed) + 0.05 * (vn(vec2(q.x * 14.0, seed)) - 0.5);
  float inB = smoothstep(px / sh * 1.5, -px / sh * 1.5, d * min(sr, sh) / sh) * smoothstep(foot - 0.02, foot + 0.04, q.y - berm);
  if (inB <= 0.0) return vec4(0.0);
  vec2 nq = q / rad;
  float nz = sqrt(max(1.0 - dot(nq, nq), 0.0));
  // pitted, layered stone: bump from noise, strata across the height
  float e = 0.04;
  float bn = fbm(q * 3.0 + seed);
  float bx = fbm(q * 3.0 + seed + vec2(e, 0.0));
  float by = fbm(q * 3.0 + seed + vec2(0.0, e));
  vec3 n = normalize(vec3(nq.x - (bx - bn) * 6.0, nq.y - (by - bn) * 6.0, nz + 0.2));
  float strata = 0.5 + 0.5 * sin(q.y * 11.0 + 3.0 * bn + seed);
  float pit = smoothstep(0.55, 0.75, vn(q * 12.0 + seed * 3.0));
  vec3 Lv = normalize(vec3(Ld.x, Ld.y, -Ld.z));
  float diff = max(dot(n, Lv), 0.0);
  float top = smoothstep(-0.1, 0.8, n.y);
  vec3 stone = mix(c3, c0, 0.25 + 0.3 * strata) * (0.5 + 0.5 * bn) * (1.0 - 0.5 * pit);
  vec3 col = c3 * 0.04 + stone * (0.08 + 0.5 * diff);
  // a soft fur of weed on the crown, darker and greener toward the theme blue
  float weed = smoothstep(0.35, 0.7, n.y + 0.3 * (vn(q * 22.0 + seed) - 0.5));
  col = mix(col, mix(c3, c2, 0.3) * (0.06 + 0.2 * diff) * (0.6 + 0.6 * vn(q * 40.0)), weed * 0.7);
  // caustics play over the lit crown
  vec2 wp = vec2(r.x + nq.x * r.z, z - nz * r.z * 0.7) + vec2(0.0, nq.y * 0.12);
  vec3 cl = caustic(wp * 1.9, t, 0.12);
  col += cl * 0.3 * cs * top * (0.3 + diff) * (1.0 - 0.6 * pit);
  // rim where the light grazes the edge
  float rim = smoothstep(-0.25, 0.0, d) * max(dot(normalize(q), normalize(vec2(Lv.x, Lv.y))), 0.0);
  col += mix(c1, c2, 0.4) * rim * 0.18;
  // contact darkening at the foot
  col *= 0.55 + 0.45 * smoothstep(foot, foot + 0.35, q.y - berm);
  float fa = hazeAmt(z * 1.05, uv, T, hz);
  col = mix(col, fogC, fa);
  depth = mix(depth, z, inB);
  return vec4(col, inB);
}

// a reef ledge along the far bed: silhouette from a noise profile, lit on top
vec4 ledge(vec2 uv, float z, float x0, float x1, float h, float seed, float t, float px, vec3 fogC, float T, float hz, float cs) {
  float wx = uv.x * z;
  float end = smoothstep(x0, x0 + 0.8, wx) * smoothstep(x1, x1 - 0.8, wx);
  float prof = h * end * (0.45 + 0.75 * fbm(vec2(wx * 0.9 + seed, seed)) + 0.12 * vn(vec2(wx * 6.0, seed)));
  float baseY = HZ - CAMH / z;
  float topY = baseY + prof / z;
  float inL = smoothstep(topY + px, topY - px, uv.y) * step(baseY - 0.02, uv.y) * step(0.02, prof);
  if (inL <= 0.0) return vec4(0.0);
  float v = clamp((topY - uv.y) / max(prof / z, 1e-4), 0.0, 1.0);
  float wy = (uv.y - baseY) * z;
  float g = fbm(vec2(wx * 3.0, wy * 6.0) + seed);
  float band = 0.5 + 0.5 * sin(wy * 30.0 + g * 5.0);
  vec3 col = mix(c3, c0, 0.2 + 0.25 * band) * (0.04 + 0.12 * g) * (1.0 - 0.6 * v);
  col += caustic(vec2(wx, z) * 1.9, t, 0.3) * 0.2 * cs * smoothstep(0.3, 0.0, v);
  col += mix(c1, c2, 0.5) * smoothstep(0.08, 0.0, v) * 0.3;
  col = mix(col, fogC, hazeAmt(z, uv, T, hz));
  return vec4(col, inL);
}

// silt motes: soft specks drifting in the swell, larger and blurrier when near
vec3 motes(vec2 uv, float cell, float seed, float T, float sw, float dens, float shaft, vec3 tint) {
  vec2 q = uv / cell + vec2(T * 0.03 + 0.4 * sin(T * 0.35 * sw + seed), T * 0.015 + 0.15 * sin(T * 0.21 + seed * 2.0));
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hs(id + seed);
  float on = step(h, 0.22 * dens);
  vec2 o = vec2(hs(id + seed + 3.7), hs(id + seed + 8.1)) - 0.5;
  float r = mix(0.04, 0.12, hs(id + seed + 1.3));
  float m = smoothstep(r, r * 0.2, length(f - o * 0.7));
  float tw = 0.7 + 0.3 * sin(T * 0.8 + h * 50.0);
  return tint * on * m * tw * (0.4 + 1.6 * shaft);
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
  float sw = clamp(u_swell, 0.0, 2.0);
  float cs = clamp(u_caustics, 0.0, 2.0);
  float hz = clamp(u_haze, 0.0, 2.0);
  float mo = clamp(u_motes, 0.0, 2.0);
  float px = 1.0 / res.y;
  float t = T * sw + 3.0;
  Ld = normalize(vec3(0.45, 1.0, 0.55));
  vec2 S = vec2(0.62, 0.66);                     // where the sun sits above the surface

  // water colour: deep violet low, opening toward blue under the surface and the sun
  float sunG = exp(-length((uv - S) * vec2(0.8, 1.0)) * 2.2);
  vec3 fogC = mix(c3 * 0.07, mix(c3, c2, 0.5) * 0.26, smoothstep(HZ - 0.2, HZ + 0.35, uv.y));
  fogC += mix(c3, c2, 0.6) * 0.13 * exp(-abs(uv.y - HZ) * 7.0);
  fogC += mix(c2, c1, 0.3) * sunG * 0.16;

  vec3 col = fogC;
  float depth = 12.0;

  if (uv.y > HZ) {
    // ---- the underside of the surface, a moving ceiling of facets ----
    float up = uv.y - HZ;
    float zs = SURF / max(up, 1e-3);
    vec2 sp = vec2(uv.x * zs, zs);
    vec2 G;
    vec3 H = swell(sp * 0.8, t * 0.9, G);
    float pxs = zs * zs / SURF * px;
    float sharp = exp(-pxs * 14.0);
    float facet = (G.y * 2.2 + G.x * 0.8) * 7.0;
    float glint = smoothstep(0.1, 0.9, facet) * sharp;
    float lens = focus(H * 0.3, 1.0, 0.12 + pxs * 6.0);
    // looking up steeply the facets open onto the sky, low they mirror the dark bed
    float window = smoothstep(0.05, 0.38, up);
    vec3 sc = mix(c3, c0, 0.3) * 0.08 + mix(c2, c1, clamp(0.5 + G.x * 6.0, 0.0, 1.0)) * glint * (0.12 + 0.35 * window);
    sc += mix(c2, c1, 0.6) * lens * lens * 0.035 * sharp * (0.3 + window);
    // the bright window of the sky, broken by the facets
    sc += mix(c1, vec3(1.0), 0.4) * sunG * sunG * (0.5 + 0.9 * glint) * 0.9;
    float dist = length(vec2(zs, SURF));
    col = mix(sc, fogC, hazeAmt(dist * 0.9, uv, T, hz));
    depth = dist;
  } else {
    // ---- rippled sand in perspective ----
    float dy = max(HZ - uv.y, 1e-3);
    float z = CAMH / dy;
    vec2 p = vec2(uv.x * z, z);
    float pxz = z * z / CAMH * px;
    vec2 rd = normalize(vec2(0.35, 1.0));
    float RK = 48.0;
    float warp = fbm(p * 0.9 + 2.0);
    float ph = dot(p, rd) * RK + warp * 11.0 + 1.6 * sin(p.x * 2.3 + 1.7 * fbm(p * 2.2));
    float fine = exp(-pxz * RK * 0.9);
    float rh = sin(ph) + 0.3 * sin(2.0 * ph + 1.1);
    float rs = (cos(ph) + 0.6 * cos(2.0 * ph + 1.1)) * fine * (0.3 + 1.1 * fbm(p * 1.7 + 8.0));
    vec3 n = normalize(vec3(-rs * rd.x * 0.9, 1.0, -rs * rd.y * 0.9));
    float diff = max(dot(n, Ld), 0.0);
    float g = fbm(p * 5.0);
    float grit = mix(0.5, vn(p * 140.0), exp(-pxz * 140.0 * 0.4));
    vec3 sand = mix(c3, c0, 0.35 + 0.3 * g) * (0.06 + 0.04 * grit) * (0.15 + 1.3 * diff * diff);
    // darker troughs where fine detritus collects
    sand *= 0.75 + 0.25 * smoothstep(-1.0, 0.6, rh);

    // shadows of the boulders, thrown toward the eye and left
    float shade = 1.0;
    vec2 sh = -Ld.xz / Ld.y;
    for (int k = 0; k < 5; k++) {
      float fk = float(k);
      vec4 r = fk < 0.5 ? vec4(-0.55, 0.95, 0.20, 0.14) : (fk < 1.5 ? vec4(-0.28, 1.28, 0.08, 0.05)
             : (fk < 2.5 ? vec4(0.78, 2.4, 0.32, 0.22) : (fk < 3.5 ? vec4(0.42, 2.95, 0.11, 0.07) : vec4(-1.15, 3.7, 0.38, 0.26))));
      vec2 sc = r.xy + sh * r.w * 0.55;
      float ds = length((p - sc) / vec2(r.z * 1.15, r.z * 1.0 + r.w * 0.5));
      shade *= mix(1.0, 0.25, smoothstep(1.1, 0.6, ds));
      float dc = length((p - r.xy) / r.z);
      shade *= mix(1.0, 0.6, smoothstep(1.5, 1.0, dc));
    }

    // caustics, nudged by the ripple height so they slide over the crests
    vec2 pc = p - Ld.xz / Ld.y * rh * 0.012 * fine;
    float blur = pxz * 40.0;
    vec3 cl = caustic(pc * 1.9, t, 0.06 + blur * blur * 0.8);
    float fade = 1.0 / (1.0 + blur * blur * 2.5);
    sand += cl * 0.13 * cs * (0.2 + 1.1 * diff) * shade * fade;
    // where the filaments are finer than a pixel they merge into a soft dappled sheen
    sand += mix(c2, c1, 0.5 + 0.5 * sin(p.x * 0.7 + t * 0.1)) * 0.10 * cs * (1.0 - fade) * (0.4 + 0.8 * diff) * shade;
    sand *= 0.35 + 0.65 * shade;
    // scattered shell grit catching the light
    vec2 sg = p * 9.0;
    vec2 sid = floor(sg);
    vec2 sf = fract(sg) - 0.5 - (vec2(hs(sid + 4.0), hs(sid + 9.0)) - 0.5) * 0.6;
    float shell = step(0.9, hs(sid)) * smoothstep(0.12, 0.05, length(sf * vec2(1.0, 1.8))) * exp(-pxz * 40.0);
    sand += mix(c1, c2, hs(sid + 2.0)) * shell * (0.06 + 0.25 * diff) * shade;

    col = mix(sand, fogC, hazeAmt(z, uv, T, hz));
    depth = z;
  }

  // ---- reef ledges in the haze ----
  vec4 L;
  L = ledge(uv, 9.0, -9.0, 1.5, 1.1, 3.0, t, px, fogC, T, hz, cs);
  col = mix(col, L.rgb, L.a);
  depth = mix(depth, 9.0, L.a);
  L = ledge(uv, 4.8, 1.2, 5.5, 0.75, 11.0, t, px, fogC, T, hz, cs);
  col = mix(col, L.rgb, L.a);
  depth = mix(depth, 4.8, L.a);

  // ---- boulders, far to near ----
  vec4 B;
  B = boulder(uv, vec4(-1.15, 3.7, 0.38, 0.26), 7.0, t, px, fogC, T, hz, cs, depth);
  col = mix(col, B.rgb, B.a);
  B = boulder(uv, vec4(0.42, 2.95, 0.11, 0.07), 2.0, t, px, fogC, T, hz, cs, depth);
  col = mix(col, B.rgb, B.a);
  B = boulder(uv, vec4(0.78, 2.4, 0.32, 0.22), 5.0, t, px, fogC, T, hz, cs, depth);
  col = mix(col, B.rgb, B.a);
  B = boulder(uv, vec4(-0.28, 1.28, 0.08, 0.05), 13.0, t, px, fogC, T, hz, cs, depth);
  col = mix(col, B.rgb, B.a);
  B = boulder(uv, vec4(-0.55, 0.95, 0.20, 0.14), 9.0, t, px, fogC, T, hz, cs, depth);
  col = mix(col, B.rgb, B.a);

  // ---- veils of suspended silt drifting between the depth layers ----
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float vz = 1.8 + 1.9 * fi;                  // depth of this veil
    float lay = smoothstep(vz * 0.8, vz * 1.3, depth);
    float vy = uv.y - (HZ - CAMH / vz) - 0.02;
    float sheet = fbm(vec2(uv.x * (1.6 + fi * 0.8) - T * (0.018 + 0.008 * fi) * (0.5 + sw), vy * 9.0 + fi * 4.0));
    float band = exp(-vy * vy * (50.0 + 30.0 * fi)) * smoothstep(0.35, 0.85, sheet);
    col += mix(mix(c3, c2, 0.55), c1, 0.25 * fi) * band * lay * 0.10 * hz * (0.6 + 0.6 * sunG);
  }

  // ---- light shafts leaning in from the sun, thicker over distance ----
  vec2 v = uv - S;
  float ang = atan(v.x, -v.y);
  float beam = fbm(vec2(ang * 7.0 + 0.15 * sin(t * 0.3), t * 0.04));
  beam = smoothstep(0.45, 0.95, beam) * (0.5 + 0.5 * vn(vec2(ang * 30.0, t * 0.1)));
  float vol = 1.0 - exp(-depth * 0.35);
  float shaft = beam * exp(-length(v) * 1.1) * smoothstep(0.1, -0.4, v.y + 0.1 * 0.0);
  col += mix(c2, c1, 0.4) * shaft * vol * 0.30;

  // ---- silt motes at three depths ----
  vec3 mt = mix(c2, c1, 0.5);
  col += motes(uv, 0.022, 1.0, T, sw, mo, shaft, mt * 0.25) * mo;
  col += motes(uv, 0.040, 7.0, T * 1.2, sw, mo, shaft, mt * 0.4) * mo;
  col += motes(uv, 0.075, 15.0, T * 1.5, sw, mo * 0.7, shaft, mix(mt, vec3(1.0), 0.2) * 0.35) * mo;

  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
