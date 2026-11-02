// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Moonlit dunes - long sinuous dune ridges recede toward a low moon, their
// windward slopes lit in wine light and their steep lee faces dropped into
// blue-black shadow. Fine sand streams off every crest in glowing plumes and
// grains skim past close to the eye while the view drifts slowly over the sea
// of sand.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_wind;   // strength of the wind lifting sand off the crests (default 1)
uniform float u_drive;  // speed of the slow drift over the dunes (default 1)
uniform float u_moon;   // brightness of the moonlight (default 1)

const float P = 7.5;      // dune wavelength along the wind
const float CR = 0.74;    // crest position within one dune wavelength
const float CAMH = 4.4;   // eye height above the sand datum

vec3 c0, c1, c2, c3;
vec2 WD, WP;
float windAmt, tt;

float hk(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1619, 0.2381, 0.1847));
  q += dot(q, q.yzx + 27.41);
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
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return s;
}

// dune height; y returns the position within the wavelength (crest at CR),
// z the height of this dune crest
vec3 dune(vec2 q) {
  float al = dot(q, WD), ac = dot(q, WP);
  float ph = al / P + 0.55 * sin(ac * 0.085 + 1.3) + 0.22 * sin(ac * 0.23 + al * 0.04) + 0.5 * vn(q * 0.035);
  float u = fract(ph);
  float id = floor(ph);
  float hgt;
  if (u < CR) {
    float s = u / CR;
    hgt = s * s * (1.6 - 0.6 * s);
  } else {
    float l = (u - CR) / (1.0 - CR);
    hgt = 1.0 - l * (2.0 - l);
  }
  float amp = 0.7 + 1.0 * vn(vec2(ac * 0.045, id * 1.7 + 3.0));
  float h = amp * hgt * 1.35;
  // low cross dunes that break the ridges into saddles and horns
  float base = 0.28 * vn(q * vec2(0.11, 0.07) + 9.0) - 0.1;
  return vec3(h + base, u, amp * 1.35 + base);
}

float shadowAt(vec3 p, vec3 L) {
  float s = 1.0;
  float d = 0.1 + 0.1 * hk(p.xz * 37.0);
  for (int i = 0; i < 18; i++) {
    vec3 q = p + L * d;
    float h = q.y - dune(q.xz).x;
    s = min(s, clamp(6.0 * h / d + 0.15, 0.0, 1.0));
    d += 0.18 + 0.14 * d;
  }
  return s;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float ax = 0.5 * res.x / res.y;
  tt = u_time;
  windAmt = clamp(u_wind, 0.0, 2.0);
  float drive = clamp(u_drive, 0.0, 2.0);
  float moonAmt = clamp(u_moon, 0.0, 2.0);

  WD = normalize(vec2(-1.0, -0.22));
  WP = vec2(-WD.y, WD.x);

  // blue-black night: the cool shadow that sets off the warm wine moonlight
  vec3 night = vec3(0.007, 0.016, 0.065);
  vec3 moonC = mix(c1, vec3(1.0, 0.93, 0.92), 0.4);

  vec3 L = normalize(vec3(0.26, 0.085, 1.0));
  float travel = tt * 0.45 * drive;
  vec3 ro = vec3(4.0 + travel * 0.35, CAMH, travel);
  vec3 fw = normalize(vec3(0.0, -0.13, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.55 + rt * p.x + up * p.y);

  // sky: blue-black overhead, a wine glow along the horizon and around the moon
  float mu = max(dot(rd, L), 0.0);
  float hz = exp(-max(rd.y + 0.02, 0.0) * 9.0);
  vec3 sky = night * (0.7 + 0.6 * (1.0 - rd.y));
  sky += mix(c3, c2, 0.4) * 0.22 * hz * (0.5 + 0.5 * mu);
  sky += c0 * 0.3 * pow(mu, 18.0) * moonAmt + c1 * 0.5 * pow(mu, 120.0) * moonAmt;
  // thin high cloud streaks catching the moon
  vec2 cq = rd.xz / max(rd.y + 0.08, 0.04);
  float cl = smoothstep(0.5, 0.85, fbm(cq * vec2(0.35, 1.4) + vec2(tt * 0.01, 0.0)));
  sky += mix(c2, c1, mu) * cl * 0.12 * (0.3 + 0.7 * pow(mu, 3.0)) * smoothstep(-0.02, 0.08, rd.y);
  // a scatter of faint stars
  vec2 sg = floor(p * 90.0);
  vec2 so = vec2(hk(sg + 4.1), hk(sg + 8.3)) * 0.6 + 0.2;
  float st = step(0.975, hk(sg + 13.0)) * smoothstep(0.02, 0.2, rd.y);
  st *= smoothstep(0.16, 0.0, length(fract(p * 90.0) - so)) * (0.4 + 0.6 * hk(sg + 2.2));
  sky += vec3(0.75, 0.8, 1.0) * st * 0.35 * (0.6 + 0.4 * sin(tt * 1.3 + hk(sg) * 6.28)) * (1.0 - smoothstep(0.85, 0.99, mu));
  // the moon: a worn, mottled disc
  float md = acos(clamp(dot(rd, L), -1.0, 1.0));
  float mr = 0.045;
  vec2 mq = vec2(dot(rd - L, rt), dot(rd - L, up)) / mr;
  float maria = fbm(mq * 2.2 + 4.0);
  float disc = smoothstep(mr, mr * 0.93, md);
  sky = mix(sky, moonC * (1.1 - 0.45 * smoothstep(0.45, 0.7, maria)) * (0.5 + 0.5 * moonAmt), disc);

  // march the dune field
  float t = 0.5 + 0.05 * hk(gl_FragCoord.xy);
  float tp = t;
  float hit = 0.0;
  vec3 drift = vec3(0.0);
  float tr = 1.0;
  for (int i = 0; i < 64; i++) {
    vec3 q = ro + rd * t;
    vec3 du = dune(q.xz);
    float d = q.y - du.x;
    if (d < 0.002 * t) { hit = 1.0; break; }
    // sand blown off the crest: a thin sheet leaving the crest level and
    // sagging downwind over the lee face, combed into streamers by the wind
    float l = (du.y - CR) / (1.0 - CR);
    float al = dot(q.xz, WD), ac = dot(q.xz, WP);
    float sheet = du.z - 0.05 - 0.9 * l * l - 0.25 * l;
    float lee = smoothstep(-0.02, 0.04, l) * exp(-l * 3.5) * step(0.0, l);
    float strk = smoothstep(0.45, 0.95, vn(vec2(al * 0.8 - tt * 2.6 * (0.3 + windAmt), ac * 11.0)));
    strk *= 0.3 + vn(vec2(al * 0.25 - tt * 0.8, ac * 1.3 + 5.0));
    float dens = lee * step(l, 0.6) * exp(-abs(q.y - sheet) * (9.0 - 5.0 * l)) * strk * windAmt * 2.2;
    float stepL = max(0.42 * d, 0.03 + 0.016 * t);
    float a = clamp(dens * stepL, 0.0, 0.6);
    drift += tr * a * (moonC * (0.25 + 1.6 * pow(mu, 4.0)) + c0 * 0.25);
    tr *= 1.0 - a * 0.6;
    tp = t;
    t += stepL;
    if (t > 140.0) break;
  }
  // a ray that ran out of steps below the horizon still lands on far sand
  if (hit < 0.5 && t < 140.0) { hit = 1.0; tp = t; }
  // refine the hit between the last two samples so the crests stay crisp
  if (hit > 0.5) {
    float ta = tp, tb = t;
    for (int i = 0; i < 6; i++) {
      float tm = 0.5 * (ta + tb);
      vec3 q = ro + rd * tm;
      if (q.y - dune(q.xz).x < 0.0) tb = tm; else ta = tm;
    }
    t = tb;
  }

  vec3 col = sky;
  if (hit > 0.5) {
    vec3 q = ro + rd * t;
    vec2 e = vec2(0.02 + 0.002 * t, 0.0);
    vec3 dq = dune(q.xz);
    float h0 = dq.x;
    vec3 n = normalize(vec3(h0 - dune(q.xz + e.xy).x, e.x, h0 - dune(q.xz + e.yx).x));
    float u = dq.y;
    // wind ripples across the stoss slopes, fading out with distance
    float al = dot(q.xz, WD), ac = dot(q.xz, WP);
    float rf = smoothstep(13.0, 5.0, t) * (1.0 - smoothstep(CR - 0.08, CR, u));
    float rph = al * 5.5 + 1.4 * vn(vec2(ac * 0.6, al * 0.3)) + 0.6 * sin(ac * 0.9);
    vec2 rg = WD * cos(rph) * 0.16 * rf;
    n = normalize(n + vec3(rg.x, 0.0, rg.y));
    float sh = shadowAt(q + n * 0.02, L);
    float dif = max(dot(n, L), 0.0) * sh;
    float grain = 0.85 + 0.3 * vn(q.xz * 3.1);
    // lit sand runs from deep wine through rose to near-white where the moon hits square
    float dv = vn(q.xz * 0.08 + 2.0);
    vec3 alb = mix(mix(c3, c0, 0.5 + 0.4 * dv), mix(c1, vec3(1.0, 0.9, 0.9), 0.2), smoothstep(0.3, 0.8, dif)) * grain;
    // far dunes cool toward the plum of the theme
    alb = mix(alb, c2, 0.45 * smoothstep(10.0, 45.0, t));
    vec3 lit = alb * dif * 2.2 * moonAmt;
    // crest edges catch near-white light
    float cw = 0.012 + 0.0006 * t;
    float crest = smoothstep(CR - cw, CR, u) * smoothstep(CR + cw * 0.6, CR, u);
    lit += mix(c1, vec3(1.0), 0.6) * crest * 0.7 * moonAmt * (0.5 + 0.5 * mu);
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), 16.0);
    lit += moonC * spec * sh * 0.35 * moonAmt;
    // blue-black ambient fills the lee faces, with a faint wine bounce at the foot
    vec3 amb = night * (0.8 + 1.0 * n.y) + c2 * 0.025 * smoothstep(0.9, 0.3, n.y) * (1.0 - smoothstep(0.0, 0.3, h0));
    col = lit + amb * grain;
    // haze thickening toward the horizon
    float fog = 1.0 - exp(-t * 0.022);
    vec3 hazeC = night * 1.2 + mix(c3, c2, 0.4) * 0.14 * (0.3 + 0.7 * mu * mu);
    col = mix(col, hazeC, fog);
  }
  col = col * (0.5 + 0.5 * tr) + drift;

  // loose grains skimming past close to the eye
  vec2 sp = vec2(p.x * 3.0 + tt * 1.4 * (0.3 + windAmt), p.y * 40.0);
  float row = floor(sp.y);
  float rh = hk(vec2(row, 3.7));
  float sx = fract(sp.x * (0.6 + 0.5 * rh) + rh * 9.0);
  float dash = smoothstep(0.0, 0.03, sx) * smoothstep(0.12, 0.03, sx) * smoothstep(0.35, 0.0, abs(fract(sp.y) - 0.5));
  dash *= step(0.8, hk(vec2(row, floor(sp.x * (0.6 + 0.5 * rh) + rh * 9.0)))) * smoothstep(0.05, -0.35, p.y);
  col += moonC * dash * 0.12 * windAmt * moonAmt;

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.3);
  gl_FragColor = vec4(col, 1.0);
}
