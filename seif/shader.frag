// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Moonlit erg - a raymarched sand sea seen from a low vantage. Sinuous
// transverse dune ridges recede diagonally to the horizon, each with a long
// rippled windward slope facing a low moon on the left and a straight slip
// face at the angle of repose falling into ember-dark shade. Smaller dunelets
// ride the troughs, sand streams off the crests downwind, and the view
// glides slowly across the field.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_wind;    // strength and speed of sand streaming off the crests (default 1)
uniform float u_moon;    // brightness of the moon and the light it throws (default 1)
uniform float u_relief;  // height of the dune ridges (default 1)
uniform float u_haze;    // how much the far erg dissolves into night air (default 1)

const vec3 EMB = vec3(1.0, 0.2, 0.06);
const float PI = 3.14159265;

vec3 c0, c1, c2, c3;
float gRelief;

float hk(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.4127, 0.2963, 0.3571));
  q += dot(q, q.yzx + 19.73);
  return fract((q.x + q.y) * q.z + q.y * 0.41);
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
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return s;
}

// one dune train: gentle windward rise, sharp crest, straight lee slope
// returns (height 0..1, crest closeness)
vec2 train(float u, float v, float seed) {
  u += 0.55 * (vn(vec2(v * 0.35, seed)) - 0.5) + 0.25 * (vn(vec2(v * 1.1, seed + 4.0)) - 0.5);
  float id = floor(u);
  float f = u - id;
  float k = 0.74;
  float r = clamp(f / k, 0.0, 1.0);
  float rise = r * r * (3.0 - 2.0 * r);
  rise = mix(rise, r, 0.35);
  float g = clamp((f - k) / (1.0 - k), 0.0, 1.0);
  float fall = 1.0 - g;
  fall = mix(fall, fall * fall, 0.3);
  float prof = f < k ? rise : fall;
  float crest = exp(-abs(f - k) * 14.0);
  return vec2(prof, crest);
}

// wind blows toward +x and slightly toward the viewer
const vec2 WD = vec2(0.91, -0.41);

vec2 terrain(vec2 q) {
  float u = dot(q, WD);
  float v = dot(q, vec2(-WD.y, WD.x));
  // main ridges, height varying along each crest
  vec2 a = train(u / 2.6, v, 1.0);
  float amp = 0.55 + 0.45 * vn(vec2(u * 0.18 + 2.0, v * 0.22));
  float h = a.x * amp * 0.62;
  // smaller dunelets crossing the troughs at another angle
  vec2 q2 = vec2(0.97 * q.x + 0.26 * q.y, -0.26 * q.x + 0.97 * q.y);
  vec2 b = train(dot(q2, WD) / 0.9, dot(q2, vec2(-WD.y, WD.x)) * 1.6, 7.0);
  float trough = 1.0 - a.x;
  h += b.x * 0.12 * (0.3 + 0.7 * trough) * vn(vec2(u * 0.5, v * 0.5 + 9.0));
  // broad swell of the erg
  h += 0.35 * fbm(q * 0.07 + 3.0);
  return vec2(h * gRelief, a.y * amp);
}

float hgt(vec2 q) { return terrain(q).x; }

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = u_time;
  float wind = clamp(u_wind, 0.0, 2.0);
  float moonI = 0.35 + 0.65 * clamp(u_moon, 0.0, 2.0);
  gRelief = 0.35 + 0.65 * clamp(u_relief, 0.0, 2.0);
  float hazeA = clamp(u_haze, 0.0, 2.0);

  // camera glides along the field, low over the sand
  vec3 ro = vec3(t * 0.09, 0.0, t * 0.05);
  ro.y = 0.95 + 0.62 * gRelief;
  float pitch = -0.12;
  vec3 fw = normalize(vec3(0.12, sin(pitch), cos(pitch)));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.6 + rt * p.x + up * p.y);

  // the moon hangs low in the left third of the frame
  vec3 L = normalize(fw * 1.6 + rt * -0.52 + up * 0.40);

  // ---- sky ----
  float el = rd.y;
  vec3 skyH = c3 * 0.30 + c0 * 0.05;
  vec3 skyZ = c3 * 0.025;
  vec3 sky = mix(skyH, skyZ, sqrt(clamp(el / 0.35, 0.0, 1.0)));
  // far warm glow on the horizon away from the moon
  sky += EMB * 0.06 * exp(-max(el, 0.0) * 18.0) * smoothstep(-0.2, 0.6, rd.x);
  float md = dot(rd, L);
  float ang = acos(clamp(md, -1.0, 1.0));
  float R = 0.038;
  vec3 mx = normalize(cross(L, vec3(0.0, 1.0, 0.0)));
  vec3 my = cross(mx, L);
  vec2 mq = vec2(dot(rd, mx), dot(rd, my));
  float disc = 1.0 - smoothstep(R * 0.94, R, ang);
  float mar = 0.6 * vn(mq * 26.0 + 3.0) + 0.4 * vn(mq * 64.0);
  float rr = ang / R;
  float surf = (0.95 - 0.38 * smoothstep(0.35, 0.7, mar)) * (1.0 - 0.2 * rr * rr);
  float occl = 1.0 - smoothstep(R * 0.9, R, length(mq - vec2(-0.018, 0.006)));
  vec3 moonC = mix(c2, vec3(1.0), 0.6);
  sky += moonC * surf * disc * (1.0 - occl) * 1.9 * moonI + c3 * 0.12 * disc * occl;
  sky += c1 * 0.22 * exp(-ang * 11.0) * moonI + c0 * 0.08 * exp(-ang * 3.0) * moonI;
  float wsp = fbm(vec2(rd.x * 3.0 - t * 0.012, rd.y * 12.0 + 2.0));
  sky += mix(c1, c2, 0.5) * 0.06 * smoothstep(0.5, 0.78, wsp) * (0.4 + 2.0 * exp(-ang * 4.0)) * moonI * smoothstep(0.0, 0.05, el);
  vec2 sq = vec2(atan(rd.x, rd.z), rd.y) * 110.0;
  vec2 sid = floor(sq);
  vec2 sf = fract(sq) - 0.5;
  float sh = hk(sid + 3.0);
  vec2 jit = vec2(hk(sid + 7.0), hk(sid + 11.0)) - 0.5;
  float star = step(0.963, sh) * (1.0 - smoothstep(0.03, 0.2, length(sf - jit * 0.6)));
  star *= 0.55 + 0.45 * sin(t * (0.8 + 2.0 * hk(sid + 1.0)) + sh * 40.0);
  star *= smoothstep(0.02, 0.2, el) * (1.0 - exp(-ang * 5.0));
  sky += c2 * star * 0.9;

  // ---- march the erg ----
  float d = 0.05;
  float hit = 0.0;
  float spray = 0.0;
  float prevD = d, prevGap = 1.0;
  for (int i = 0; i < 64; i++) {
    vec3 pos = ro + rd * d;
    vec2 tr = terrain(pos.xz);
    float gap = pos.y - tr.x;
    if (gap < 0.0) {
      // refine between last two samples
      d = prevD + (d - prevD) * prevGap / max(prevGap - gap, 1e-4);
      hit = 1.0;
      break;
    }
    // sand streaming off the crests: thin veil just above sharp ridges
    float st = max(d - prevD, 0.02);
    float sw = dot(pos.xz, WD) - t * 0.35 * (0.3 + wind);
    float streak = vn(vec2(sw * 1.6, gap * 70.0 + dot(pos.xz, vec2(-WD.y, WD.x)) * 3.0));
    spray += tr.y * tr.y * exp(-gap * 12.0) * smoothstep(0.5, 0.88, streak) * st * exp(-d * 0.05);
    prevD = d; prevGap = gap;
    d += max(0.02, gap * 0.45) * (1.0 + d * 0.012);
    if (d > 60.0) break;
  }

  vec3 col = sky;
  if (hit > 0.5) {
    vec3 pos = ro + rd * d;
    float e = 0.004 + 0.002 * d;
    float h0 = hgt(pos.xz);
    vec3 n = normalize(vec3(hgt(pos.xz - vec2(e, 0.0)) - hgt(pos.xz + vec2(e, 0.0)),
                            2.0 * e,
                            hgt(pos.xz - vec2(0.0, e)) - hgt(pos.xz + vec2(0.0, e))));
    // wind ripples on the windward sand, fading with distance
    float u = dot(pos.xz, WD);
    float v = dot(pos.xz, vec2(-WD.y, WD.x));
    float ripF = 1.0 - smoothstep(1.5, 8.0, d);
    float rph = u * 68.0 + 5.0 * vn(vec2(u * 3.0, v * 4.0)) + 1.2 * sin(v * 5.0 + u * 2.0);
    float windward = smoothstep(0.1, 0.5, dot(n.xz, -WD) + 0.3);
    vec2 rgr = WD * cos(rph) * 0.13 * ripF * windward;
    vec3 nr = normalize(n + vec3(rgr.x, 0.0, rgr.y));

    float nl = dot(nr, L);
    float lit = smoothstep(-0.08, 0.26, nl);
    // cast shadow toward the low moon
    float sh2 = 1.0;
    float sd = 0.08;
    for (int j = 0; j < 14; j++) {
      vec3 sp = pos + L * sd;
      float g = sp.y - hgt(sp.xz);
      sh2 = min(sh2, clamp(g * 4.0 / sd + 0.25, 0.0, 1.0));
      sd += 0.12 + sd * 0.35;
    }
    lit *= sh2;

    float grn = vn(pos.xz * 140.0);
    float far = smoothstep(2.0, 30.0, d);
    vec3 litC = (mix(c0, c1, 0.3 + 0.5 * lit) * 0.7 * lit + c2 * pow(lit, 3.0) * 0.6) * moonI;
    litC *= 0.9 + 0.2 * grn * (1.0 - far);
    // fresnel catch along crests seen against the sky
    litC += c2 * pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * 0.25 * moonI * lit;
    // ember-dark shade in the slip faces, with slight bounce from the lit sand
    float lee = vn(vec2(u * 30.0, pos.y * 40.0));
    vec3 shC = EMB * (0.028 + 0.03 * lee * lee) * (1.0 - far * 0.6) + c3 * 0.03 * max(n.y, 0.0);
    vec3 lc = shC + litC;
    // glints on near lit sand
    vec2 gq = pos.xz * 90.0;
    vec2 gid = floor(gq);
    float glint = step(0.986, hk(gid)) * (1.0 - smoothstep(0.1, 0.32, length(fract(gq) - 0.5)));
    glint *= 0.5 + 0.5 * sin(t * (1.0 + 2.0 * hk(gid + 2.0)) + hk(gid + 5.0) * 20.0);
    lc += c2 * glint * lit * (1.0 - far) * 1.2 * moonI;

    float fogA = 1.0 - exp(-d * 0.045 * (0.3 + hazeA));
    vec3 fogC = skyH * 0.95 +c0 * 0.05 * exp(-ang * 2.0) * moonI;
    col = mix(lc, fogC, clamp(fogA, 0.0, 0.92));
  }

  col += mix(c1, c2, 0.55) * spray * (0.15 + 0.6 * wind) * 11.0 * moonI;
  col += c1 * 0.025 * exp(-ang * 2.5) * moonI;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.0);
}
