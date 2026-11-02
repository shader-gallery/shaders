// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Moonlit erg - a sea of transverse dunes under a low moon. Two travelling
// ridge waves from different wind sources sum into the dune field, so the
// crests interfere into sinuous, forking lines, and a finer pair of ripple
// waves puckers the windward slopes. Each ridge breaks at a sharp brink into
// a steep slip face that falls into blue-black moon shadow, while sand blows
// off the crests in thin lit plumes. The view drifts slowly across the erg.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_wind;   // strength and speed of the sand blowing off the crests (default 1.0)
uniform float u_moon;   // moon elevation above the horizon, sets shadow length (default 0.08)
uniform float u_ripple; // depth of the interfering ripple marks on windward slopes (default 1.0)
uniform float u_haze;   // night haze over the distant dunes (default 0.8)

const float CAMH = 2.7;
const vec2 WIND = vec2(0.954, -0.300);
const vec2 WIND2 = vec2(0.600, 0.800);

float gPh = 0.0;   // main ridge phase of the last dunes() call
float gAmp = 0.0;  // main ridge amplitude of the last dunes() call

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.37, 289.11))) * 43717.29);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y);
}

// asymmetric dune profile over one wave period: long windward ramp,
// sharp brink at 0.8, steep slip face down to the trough
float prof(float w) {
  if (w < 0.8) {
    float s = w / 0.8;
    return 0.5 * s * s * (3.0 - 2.0 * s) + 0.5 * s;
  }
  float u = (w - 0.8) / 0.2;
  return (1.0 - u) * (1.0 - u);
}

// two ridge waves from different winds summed, over a slow swell
float dunes(vec2 q) {
  float n1 = vn(q * 0.11 + 3.1);
  float n2 = vn(q * 0.27 + 7.7);
  float ph1 = dot(q, WIND) / 3.2 + 1.5 * n1 + 0.35 * n2;
  float ph2 = dot(q, WIND2) / 5.3 + 1.2 * n2 + 0.4 * n1;
  float amp = 0.42 + 0.38 * n1;
  gPh = fract(ph1);
  gAmp = amp;
  return amp * prof(gPh) + 0.20 * (0.4 + 0.6 * n1) * prof(fract(ph2)) + 0.45 * vn(q * 0.045 + 11.0);
}

// fine ripple marks: two interfering ripple trains, migrating downwind
float ripples(vec2 q, float t) {
  float a = dot(q, vec2(0.970, -0.243)) * 46.0 + 6.0 * vn(q * 0.9) + 2.0 * vn(q * 2.3) - t * 0.12;
  float b = dot(q, vec2(0.899, 0.438)) * 33.0 + 4.0 * vn(q * 0.7 + 4.0) - t * 0.09;
  return sin(a) + 0.45 * sin(b);
}

vec3 skyCol(vec3 rd, vec3 L, vec3 c0, vec3 c1, vec3 c2) {
  float hy = rd.y;
  vec3 col = mix(vec3(0.022, 0.040, 0.115), vec3(0.003, 0.006, 0.026), smoothstep(-0.02, 0.45, hy));
  float md = max(dot(rd, L), 0.0);
  col += c1 * 0.10 * pow(md, 60.0) + c2 * 0.10 * pow(md, 400.0);
  col += c0 * 0.05 * pow(md, 24.0);
  // moonrise glow lying on the horizon below the moon
  float az = max(dot(normalize(rd.xz), normalize(L.xz)), 0.0);
  col += c0 * 0.22 * exp(-abs(hy) * 30.0) * pow(az, 30.0);
  return col;
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
  float wind = clamp(u_wind, 0.0, 3.0);
  float elev = clamp(u_moon, 0.0, 0.5);
  float rip = max(u_ripple, 0.0);
  float haze = max(u_haze, 0.0);

  // camera drifts slowly across the erg, looking a little down
  vec3 ro = vec3(t * 0.07, CAMH, t * 0.11);
  vec3 fw = normalize(vec3(0.0, -0.13, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.3 + rt * uv.x + up * uv.y);
  vec3 L = normalize(vec3(-0.27, elev, 1.0));

  // march the heightfield, gathering blown sand near the crests
  float tt = 0.05;
  float dt = 0.0;
  bool hit = false;
  float blown = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * tt;
    float h = dunes(p.xz);
    float c = p.y - h;
    if (c < 0.0) { hit = true; break; }
    // sand lifting off the brink and streaming over the slip face
    float lu = clamp((gPh - 0.8) / 0.2, 0.0, 1.0);
    float lee = smoothstep(0.76, 0.80, gPh) * (1.0 - smoothstep(0.82, 0.90, gPh));
    float along = dot(p.xz, WIND);
    float across = dot(p.xz, vec2(-WIND.y, WIND.x));
    float sn = vn(vec2(along * 1.1 - t * (0.4 + 0.9 * wind), across * 16.0 + p.y * 6.0));
    sn = smoothstep(0.5, 0.9, sn);
    // the sheet hugs the brink, then thins and rises as it crosses the slip face
    float plume = exp(-c * mix(14.0, 6.0, lu)) * mix(1.0, 0.4, lu) * smoothstep(0.35, 0.9, gAmp);
    blown += plume * lee * sn * gAmp * dt / (1.0 + tt * 0.08);
    if (p.y > 1.7 && rd.y > 0.0) break;
    dt = clamp(c * (0.32 + 0.02 * tt), 0.004 + 0.004 * tt, 1.5);
    tt += dt;
    if (tt > 48.0) break;
  }

  vec3 col;
  vec3 sky = skyCol(rd, L, c0, c1, c2);
  if (hit) {
    // refine the crossing
    float a = tt - dt, b = tt;
    for (int i = 0; i < 5; i++) {
      float m = 0.5 * (a + b);
      vec3 p = ro + rd * m;
      if (p.y - dunes(p.xz) < 0.0) b = m; else a = m;
    }
    tt = 0.5 * (a + b);
    vec3 p = ro + rd * tt;

    float fade = 1.0 - smoothstep(3.0, 11.0, tt);
    float e = 0.008 + 0.0025 * tt;
    float hx = dunes(p.xz + vec2(e, 0.0));
    float hz = dunes(p.xz + vec2(0.0, e));
    float h0 = dunes(p.xz);
    float ph = gPh;
    float amp = gAmp;
    float windward = 1.0 - smoothstep(0.74, 0.80, ph);
    float rk = 0.0045 * rip * fade * windward;
    float r0 = ripples(p.xz, t);
    hx += rk * ripples(p.xz + vec2(e, 0.0), t);
    hz += rk * ripples(p.xz + vec2(0.0, e), t);
    h0 += rk * r0;
    vec3 n = normalize(vec3(h0 - hx, e, h0 - hz));

    // soft moon shadow, long because the moon is low
    float sh = 1.0;
    float s = 0.06;
    for (int i = 0; i < 18; i++) {
      vec3 sp = p + n * 0.01 + L * s;
      float hh = sp.y - dunes(sp.xz);
      sh = min(sh, 9.0 * hh / s);
      s += clamp(hh * 0.7, 0.07, 0.7);
      if (sh < 0.0) break;
    }
    sh = clamp(sh, 0.0, 1.0);
    sh = sh * sh * (3.0 - 2.0 * sh);

    float ndl = max(dot(n, L), 0.0) * sh;
    float lit = clamp(ndl * 2.8, 0.0, 1.0);
    vec3 base = mix(c3 * 0.55, c0, smoothstep(0.0, 0.45, lit));
    base = mix(base, c1, smoothstep(0.40, 0.80, lit));
    base = mix(base, mix(c2, vec3(1.0, 0.95, 0.85), 0.35) * 1.2, smoothstep(0.72, 1.0, lit));
    col = base * lit * 1.25;

    // blue-black skylight in the shade
    col += vec3(0.012, 0.024, 0.075) * (0.5 + 0.5 * n.y) * (1.0 - 0.6 * lit);

    // brink rim where the ridge breaks, caught by the moon
    float brink = exp(-abs(ph - 0.8) * 60.0) * amp;
    col += mix(c1, c2, 0.6) * brink * (0.25 + 0.9 * sh) * 0.55;

    // grain glints: a jittered grain grid that swells on the ripple crests
    vec2 gq = p.xz * 9.0;
    vec2 gi = floor(gq);
    vec2 go = vec2(hs(gi), hs(gi + 17.3)) * 0.6 + 0.2;
    float gd = length(fract(gq) - go);
    float swell = clamp(0.5 + 0.35 * r0, 0.0, 1.0);
    float gr = 0.03 + 0.07 * swell * swell;
    float glint = (1.0 - smoothstep(gr * 0.4, gr, gd)) * step(0.7, hs(gi + 5.1));
    float tw = 0.5 + 0.5 * sin(t * 0.7 + hs(gi + 9.9) * 6.2832);
    col += c2 * glint * tw * lit * fade * 0.6;

    // night haze toward the horizon
    float fd = 1.0 - exp(-tt * 0.045 * haze);
    vec3 fogC = sky * 0.9;
    col = mix(col, fogC, clamp(fd, 0.0, 0.95));
  } else {
    col = sky;
    // the moon: a warm near-white disc with faint maria
    float md = length(rd - L);
    float disk = 1.0 - smoothstep(0.022, 0.0255, md);
    float maria = vn((rd.xy - L.xy) * 120.0 + 3.0);
    vec3 moonC = mix(c2, vec3(1.0, 0.96, 0.88), 0.45) * (1.25 - 0.3 * maria);
    col = mix(col, moonC * 1.6, disk);
    // sparse stars, washed out near the moon and the horizon
    vec2 sp = rd.xy / max(rd.z, 0.2) * 70.0;
    vec2 si = floor(sp);
    vec2 so = vec2(hs(si + 2.2), hs(si + 8.4)) * 0.7 + 0.15;
    float sd = length(fract(sp) - so);
    float star = (1.0 - smoothstep(0.03, 0.09, sd)) * step(0.86, hs(si + 1.3));
    star *= smoothstep(0.04, 0.25, rd.y) * smoothstep(0.08, 0.4, md);
    star *= 0.6 + 0.4 * sin(t * 1.3 + hs(si) * 40.0);
    col += mix(vec3(0.75, 0.82, 1.0), c2, 0.35) * star * 0.6;
  }

  // blown sand, lit hardest when looking into the moon
  float fwd = pow(max(dot(rd, L), 0.0), 5.0);
  col += mix(c1, c2, 0.5) * blown * (1.6 + 4.0 * fwd) * smoothstep(0.0, 0.4, wind) * (0.5 + 0.5 * wind);

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.35);
  gl_FragColor = vec4(col, 1.0);
}
