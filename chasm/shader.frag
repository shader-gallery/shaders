// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Chasm -standing at the lip of a glacier, looking down a winding crevasse
// cut through white wind-carved snow. Its walls are banded white, clear and
// dusty ice scalloped by melt, snow bridges hang across the gap at several
// depths, and the sky light is swallowed by the ice until the slot goes
// ember-black. Further crevasses score the snowfield toward a far ridge under
// a pale sky, and a low warm sun grazes the drifts. The view creeps along.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_walk;   // speed of the creep along the crevasse (default 0.3)
uniform float u_bands;  // how many ice strata are stacked down the walls (default 3.2)
uniform float u_sun;    // strength of the low warm sun on drifts and walls (default 1)
uniform float u_depth;  // how fast the ice swallows light going down (default 1)

const float YR = 1.5;    // snow surface height, the lip of the crevasse
const float FAR = 40.0;
const float FOCAL = 0.95;
const float GAP = 3.4;   // spacing of snow bridges along the crack

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.13))) * 24071.53);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
    a *= 0.5;
  }
  return s;
}

// centre line of the crack and its half width
float cx(float z) { return 1.3 * sin(z * 0.21) + 0.45 * sin(z * 0.47 + 1.3); }
float wid(float y, float z) {
  float w = 0.32 + 0.16 * smoothstep(-4.0, 1.0, y) + 0.08 * sin(z * 0.5 + 0.4);
  return w + 0.16 * smoothstep(1.15, 1.55, y);
}

// stratum coordinate: gently folded layers of ice
float strat(vec3 p) {
  float b = max(u_bands, 0.5);
  return (p.y + 0.2 * sin(p.z * 0.3) + 0.3 * vn(vec2(p.z * 0.22, 3.0))) * b * 0.9;
}

// wind-carved sastrugi on the snowfield
float drift(vec2 xz) {
  vec2 r = mat2(0.8, 0.6, -0.6, 0.8) * xz;
  float ridge = 1.0 - abs(sin(r.x * 3.1 + 2.2 * vn(r * 0.6)));
  ridge *= ridge;
  return 0.07 * fbm(xz * 0.5) + 0.05 * ridge * smoothstep(0.25, 0.7, vn(r * vec2(0.45, 1.6)));
}

float crackD(vec3 p) {
  float c = cx(p.z);
  float sv = strat(p);
  float rec = hs(vec2(floor(sv), 7.0));
  float ledge = 0.05 * rec * smoothstep(0.1, 0.9, fract(sv));
  float rip = 0.07 * (vn(vec2(p.z * 3.0, p.y * 2.0 + p.z * 0.7)) - 0.5)
            + 0.03 * (vn(vec2(p.z * 8.0 + p.y * 1.5, p.y * 5.0)) - 0.5);
  return wid(p.y, p.z) - ledge + rip - abs(p.x - c);
}

// empty space is the crack or the air above the snow
float map(vec3 p) {
  float air = p.y - YR - drift(p.xz);
  return max(crackD(p), air);
}

vec3 nrmAt(vec3 p) {
  vec2 e = vec2(0.008, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy),
                        map(p + e.yxy) - map(p - e.yxy),
                        map(p + e.yyx) - map(p - e.yyx)));
}

// does the low sun reach q inside the crack: it must leave through the slit
float sunVis(vec3 q, vec3 ls) {
  if (q.y > YR - 0.02) return 1.0;
  float h = (YR - q.y) / max(ls.y, 0.05);
  vec3 r = q + ls * h;
  float off = abs(r.x - cx(r.z));
  float ow = wid(YR - 0.1, r.z);
  return smoothstep(ow, ow - 0.08, off);
}

// other crevasses scoring the field: thin dark lines across the far snow
float farCracks(vec2 xz) {
  float m = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float off = 3.2 + fi * 2.7 + 0.8 * hs(vec2(fi, 1.0));
    float sgn = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float lx = cx(xz.y * 0.8 + fi * 7.0) * 0.8 + sgn * off;
    float w = 0.05 + 0.06 * vn(vec2(xz.y * 0.3, fi));
    float gate = smoothstep(0.3, 0.55, vn(vec2(xz.y * 0.12, fi * 3.0)));
    m = max(m, gate * smoothstep(w, w * 0.4, abs(xz.x - lx)));
  }
  return m;
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
  float sunK = clamp(u_sun, 0.0, 2.0);
  float absK = clamp(u_depth, 0.3, 2.5);

  // ice white lifted from the palest theme colour, ember-black of the depths,
  // and a low warm sun kept apart from the theme
  vec3 white = mix(c2, vec3(1.0), 0.6);
  vec3 emb = vec3(0.075, 0.012, 0.022);
  vec3 amb = vec3(1.0, 0.62, 0.36);

  vec3 ls = normalize(vec3(-0.75 + 0.12 * sin(t * 0.05), 0.2, 0.6));

  // camera stands at the lip, looking along and down into the crevasse
  float z0 = t * clamp(u_walk, 0.0, 1.5) * 0.6 + 4.0;
  vec3 ro = vec3(cx(z0) + 0.32, YR + 0.5, z0);
  float zt = z0 + 3.0;
  vec3 ta = vec3(cx(zt) + 0.85, YR - 0.75, zt);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + FOCAL * fw);

  // twilight sky: pale band on the horizon, deep orchid then near-black overhead,
  // warm where the sun sits low
  float sy = max(rd.y, 0.0);
  vec3 skyc = mix(mix(c2, white, 0.4) * 0.85, c0 * 0.35, smoothstep(0.0, 0.08, sy));
  skyc = mix(skyc, c3 * 0.1, smoothstep(0.06, 0.22, sy));
  skyc += amb * pow(max(dot(rd, ls), 0.0), 5.0) * 0.4 * sunK * exp(-sy * 4.0);

  float s = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 q = ro + rd * s;
    float d = map(q);
    if (d < 0.0015 * s + 0.0008) { hit = 1.0; break; }
    s += max(d * 0.8, 0.008 + 0.004 * s);
    if (s > FAR || q.y > YR + 1.2) break;
  }
  if (hit < 0.5) s = FAR;
  vec3 p = ro + rd * s;
  float pf = s / (FOCAL * mn);
  float det = 1.0 - smoothstep(0.003, 0.012, pf);
  float det2 = 1.0 - smoothstep(0.01, 0.03, pf);

  vec3 col;
  // far ridge silhouette on the horizon, hazed
  float az = atan(rd.x, rd.z);
  float rn = fbm(vec2(az * 4.0 + 4.0, 1.0));
  float ridgeH = 0.02 + 0.11 * rn * rn + 0.025 * vn(vec2(az * 18.0, 2.0));
  float onRidge = smoothstep(ridgeH + 0.003, ridgeH - 0.003, rd.y);
  float face = vn(vec2(az * 30.0, rd.y * 60.0));
  vec3 ridgeC = c3 * 0.22 + mix(c1, white, 0.4) * 0.55 * smoothstep(ridgeH - 0.025, ridgeH, rd.y) * smoothstep(0.35, 0.7, face);
  ridgeC = mix(ridgeC, skyc * 0.8, 0.35);
  col = mix(skyc, ridgeC, onRidge);
  // rays that fall into the slot without meeting a wall end in the dark
  // rays that run out of steps over the far field meet the snow plane in haze
  if (hit < 0.5 && rd.y < 0.0) {
    float sp = (YR - ro.y) / rd.y;
    vec3 pp = ro + rd * sp;
    float field = step(crackD(pp), 0.0);
    float fd = 1.0 - exp(-sp * 0.035);
    vec3 farSnow = mix(c3 * 0.25 + white * 0.25 * min(sunK, 1.4), mix(c2, white, 0.4) * 0.45, fd);
    farSnow = mix(farSnow, emb, farCracks(pp.xz) * 0.8 * (1.0 - fd));
    col = mix(emb * 0.5, farSnow, field);
  }

  float sTop = s;
  if (hit > 0.5) {
    vec3 n = nrmAt(p);
    float dl = max(dot(n, ls), 0.0);
    float inCrack = smoothstep(YR - 0.02, YR - 0.2, p.y);

    // snowfield: white, sun on the crests, orchid shade in the troughs
    float g = vn(p.xz * 40.0) * det;
    // shade sits in deep violet, lit faces go white and warm toward the sun
    float lit = smoothstep(0.15, 0.55, dl);
    vec3 shade = mix(c3 * 0.18, c0 * 0.4, smoothstep(0.85, 1.0, n.y));
    vec3 snow = shade + white * lit * 0.7 * min(sunK, 1.4) + amb * dl * dl * 0.45 * sunK;
    snow *= 0.9 + 0.15 * g;
    float fc = farCracks(p.xz) * smoothstep(2.5, 6.0, s);
    snow = mix(snow, emb, fc * 0.9);
    vec2 sq = p.xz * 70.0;
    float sh = hs(floor(sq));
    float sparkle = step(0.97, sh) * smoothstep(0.25, 0.05, length(fract(sq) - 0.5)) * det * lit * sunK
                  * (0.5 + 0.5 * sin(t * 2.0 + sh * 50.0));
    snow += white * sparkle;

    // crack walls: banded white, clear and dusty ice, swallowing light with depth
    float c = cx(p.z);
    float side = sign(p.x - c);
    float sv = strat(p);
    float band = floor(sv);
    float fb = fract(sv);
    float depth = max(YR - p.y, 0.0);
    float f = exp(-depth * 0.75 * absK);
    float hb = hs(vec2(band, side * 2.0 + 1.0));
    float clearB = 1.0 - smoothstep(0.3, 0.42, hb);
    float dirty = smoothstep(0.82, 0.92, hb);
    float lam = 0.5 + 0.5 * sin(sv * 9.0 + 3.0 * vn(vec2(p.z * 1.5, sv * 2.0)));
    lam = mix(0.5, lam, det2);
    float gr = mix(0.5, vn(vec2(p.z * 9.0, p.y * 55.0)), det);
    float bub = smoothstep(0.62, 0.86, vn(vec2(p.z * 15.0 + band * 5.0, p.y * 22.0 + p.x * 5.0))) * (1.0 - clearB) * det;
    float seam = smoothstep(0.0, 0.07, fb) * smoothstep(1.0, 0.9, fb);
    seam = mix(1.0, seam, (0.35 + 0.65 * det2) * smoothstep(0.08, 0.35, abs(dot(n, rd))));

    vec3 ice = mix(white, c1, clearB * 0.7);
    ice = mix(ice, white * 1.1, 0.4 * bub);
    ice = mix(ice, c3 * 0.35, dirty * 0.8);

    // white near the lip, orchid then violet lower down, then ember-black
    vec3 lightL = mix(emb * 0.5, mix(c3 * 0.8, mix(c0, white * 1.15, smoothstep(0.45, 0.9, f)), smoothstep(0.2, 0.6, f)), smoothstep(0.0, 0.3, f)) * f * 1.2;
    float ambT = 0.7 + 0.3 * abs(n.x) + 0.3 * max(n.y, 0.0);
    float sv2 = sunVis(p + n * 0.03, ls);
    vec3 wall = ice * lightL * ambT * seam * (0.6 + 0.55 * lam);
    wall += ice * amb * sv2 * dl * sunK * 0.9 * f * (0.7 + 0.5 * gr) * seam;
    // light glowing through the clear bands from the sky behind
    wall += c2 * clearB * f * f * 0.35 * (0.4 + 0.6 * lam);
    wall += emb * (0.4 + 0.6 * (1.0 - f));
    float spec = pow(max(dot(reflect(rd, n), ls), 0.0), 20.0);
    wall += white * spec * sv2 * sunK * 0.6 * f;

    col = mix(snow, wall, inCrack);
    // fade distant snow into the pale haze toward the ridge
    col = mix(col, mix(c2, white, 0.4) * 0.45, (1.0 - exp(-s * 0.035)) * (1.0 - inCrack));
    col = mix(col, emb * 0.6, (1.0 - exp(-s * 0.06)) * inCrack);
  }

  // snow bridges spanning the gap, far to near, with hanging icicles
  float k0 = floor(ro.z / GAP);
  for (int k = 0; k < 6; k++) {
    float kk = k0 + 5.0 - float(k);
    float has = step(0.3, hs(vec2(kk, 5.0)));
    float zk = kk * GAP + 0.3 * GAP * hs(vec2(kk, 3.0));
    float sk = (zk - ro.z) / max(rd.z, 1e-3);
    if (has > 0.5 && sk > 0.2 && sk < sTop) {
      vec3 q = ro + rd * sk;
      float yk = 0.2 + 1.1 * hs(vec2(kk, 4.2));
      float wk = wid(yk, zk) * 0.98;
      float xn = (q.x - cx(zk)) / wk;
      float sag = 0.08 * (1.0 - xn * xn);
      float top = yk + 0.08 - sag + 0.03 * vn(vec2(xn * 6.0, kk));
      float th = 0.1 + 0.08 * hs(vec2(kk, 8.0)) + 0.1 * xn * xn;
      float ic = abs(fract(xn * 6.0 + hs(vec2(kk, 6.0))) - 0.5) * 2.0;
      float nz = vn(vec2(xn * 4.0 + kk * 3.1, 1.0));
      float tooth = 0.3 * nz * nz * pow(max(1.0 - ic, 0.0), 2.0);
      float bot = top - th - tooth;
      float pw = sk / (FOCAL * mn) * 1.5;
      float m = smoothstep(1.02, 0.98, abs(xn)) * smoothstep(-pw, pw, q.y - bot) * smoothstep(pw, -pw, q.y - top);
      if (m > 0.001) {
        float fk = exp(-max(YR - yk, 0.0) * 0.75 * absK);
        float vt = exp(-max(top - q.y, 0.0) * 10.0);
        // packed snow: bright crust on top, translucent violet body, glowing icicle tips
        float body = clamp((q.y - bot) / max(top - bot, 0.01), 0.0, 1.0);
        vec3 bc = mix(c0 * 0.6, white, 0.35 + 0.65 * vt) * (0.55 + 0.6 * body);
        bc *= 0.75 + 0.35 * vn(q.xy * vec2(12.0, 20.0) + kk);
        bc += c2 * exp(-max(q.y - bot, 0.0) * 18.0) * 0.5;
        bc += amb * sunK * 0.4 * vt * sunVis(vec3(q.x, top, q.z), ls);
        bc = bc * (0.2 + 0.8 * fk) + emb * 0.4;
        bc = mix(bc, emb * 0.6, 1.0 - exp(-sk * 0.06));
        col = mix(col, bc, m);
        if (m > 0.5) sTop = min(sTop, sk);
      }
    }
  }

  // cold haze breathing up out of the slot, lit where the sun gets in
  float vend = min(sTop, 14.0);
  float dt = vend / 16.0;
  float jit = hs(gl_FragCoord.xy * 0.613);
  float fogv = 0.0;
  for (int i = 0; i < 16; i++) {
    float sp = (float(i) + jit) * dt;
    vec3 q = ro + rd * sp;
    float inCr = smoothstep(YR + 0.05, YR - 0.25, q.y) * step(crackD(q), 0.2);
    float h = max(YR - q.y, 0.0);
    float dens = 0.3 + 0.9 * vn(vec2(q.z * 0.5 + q.x * 0.8 - t * 0.07, q.y * 1.3 + t * 0.04));
    fogv += dens * exp(-h * 0.7) * inCr * dt * (0.4 + sunVis(q, ls) * sunK);
  }
  col += mix(c2, amb, 0.25) * fogv * 0.18;

  // diamond dust drifting over the lip
  vec2 mq = uv * 30.0 + vec2(t * 0.05, -t * 0.08);
  vec2 mf = fract(mq) - 0.5;
  float mh = hs(floor(mq));
  float mote = step(0.95, mh) * smoothstep(0.12, 0.0, length(mf - 0.25 * vec2(mh - 0.5, fract(mh * 9.0) - 0.5)))
             * (0.5 + 0.5 * sin(t * 1.1 + mh * 40.0));
  col += white * mote * 0.3 * sunK;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
