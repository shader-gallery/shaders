// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Noctiluca - a night beach seen from the dry sand. Long low swells roll in
// under a blue-black sky, each crest flaring with living light as it breaks
// and peels along the shore. The broken water rushes up the slope as a lit
// lace of foam, leaves glowing smears on the wet sand and fades as it drains
// back. Slow swell sets carry fast flickering foam and plankton sparks.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent - unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_surf;   // pace of the incoming wave sets             (default 0.6)
uniform float u_glow;   // strength of the bioluminescence             (default 1)
uniform float u_reach;  // how far the broken water runs up the sand   (default 1)

const float HZ = 0.40;   // horizon height on screen
const float CH = 1.6;    // camera height above the sand
const float FL = 1.6;    // focal length
const float WA = 0.22;   // wave amplitude in world units
const float RUN = 2.6;   // full runup distance up the beach

float h1(vec2 p) {
  p = fract(p * vec2(5.3171, 3.9427));
  p += dot(p, p.yx + vec2(21.37, 13.91));
  return fract(p.x * p.y * 39.617);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x),
             mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vn(p);
    p = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y) * 2.11 + vec2(3.7, 8.1);
    a *= 0.5;
  }
  return s;
}

// living light ramp: black, deep rust, orange, amber, pale gold to white
vec3 lum(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  x = max(x, 0.0);
  vec3 c = mix(vec3(0.0), c3 * 0.7, smoothstep(0.0, 0.25, x));
  c = mix(c, c0, smoothstep(0.2, 0.5, x));
  c = mix(c, c1 * 1.15, smoothstep(0.45, 0.8, x));
  c = mix(c, c2 * 1.4, smoothstep(0.75, 1.1, x));
  c = mix(c, vec3(1.6, 1.5, 1.3), smoothstep(1.1, 1.8, x));
  return c;
}

// the shoreline: distance out to sea where dry beach meets the water
float shore(float x) {
  return 4.3 + 0.24 * x + 0.9 * sin(x * 0.21 + 1.3) + 0.6 * vn(vec2(x * 0.35, 2.0));
}

// set phase along the beach: the waves peel from one side to the other
float phase(float x, float t) {
  return t + 0.07 * x + 0.5 * vn(vec2(x * 0.12, 7.0));
}

// wave height at distance d beyond the shoreline, phase ps
float waveH(float d, float ps, float x) {
  float lam = 2.0 + 0.22 * d;
  float w = d / lam + ps;
  float f = fract(w);
  float back = (1.0 - f) * (1.0 - f);
  float front = smoothstep(0.84, 1.0, f);
  float amp = 0.45 + 0.7 * vn(vec2(w * 0.9, x * 0.04 + 1.0));
  float build = smoothstep(0.0, 1.5, d) * (1.0 - 0.6 * smoothstep(6.0, 30.0, d));
  return max(back, front) * amp * build;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res = max(u_resolution, vec2(1.0));
  float asp = res.x / res.y;
  vec2  p = (gl_FragCoord.xy - 0.5 * res) / (0.5 * res.y);
  float px = 2.0 / res.y;
  float t = u_time;
  float rate = clamp(u_surf, 0.0, 2.0);
  float gk = clamp(u_glow, 0.0, 2.0);
  float reach = clamp(u_reach, 0.2, 1.6);

  // the cool night ambient, kept apart from the warm living light
  vec3 nightLo = vec3(0.004, 0.010, 0.026);
  vec3 nightHi = vec3(0.020, 0.045, 0.095);

  float ps0 = t * 0.16 * rate;
  vec3 col;

  if (p.y > HZ) {
    // sky: blue-black, faintly lifted at the horizon, a scatter of stars
    float e = p.y - HZ;
    col = mix(nightHi, nightLo, smoothstep(0.0, 0.5, e));
    col += c3 * 0.05 * exp(-e * 14.0);
    vec2 sq = p * 46.0;
    vec2 sf = fract(sq) - 0.5;
    float sh = h1(floor(sq));
    vec2 so = sf - 0.35 * vec2(sh - 0.5, fract(sh * 9.0) - 0.5);
    float star = step(0.9, sh) * exp(-dot(so, so) * 260.0) * (0.6 + 0.4 * sin(t * (1.0 + 2.0 * sh) + sh * 50.0));
    // the galaxy band arcing up from the right, cool dust with dark lanes
    vec2 gp = vec2(p.x * 0.8 - e * 0.9, p.x * 0.6 + e * 1.2);
    float band = exp(-(gp.x - 0.45) * (gp.x - 0.45) * 4.0) * 1.6;
    float dust = fbm(gp * vec2(3.0, 5.0) + vec2(0.0, t * 0.004));
    float lane = smoothstep(0.45, 0.7, fbm(gp * vec2(6.0, 2.5) + 9.0));
    col += vec3(0.05, 0.08, 0.16) * band * dust * (1.0 - 0.75 * lane) * smoothstep(0.02, 0.25, e);
    float star2 = step(0.8, sh) * exp(-dot(so, so) * 400.0) * band;
    col += mix(vec3(0.5, 0.65, 1.0), c2, step(0.97, sh)) * (star * 0.5 + star2 * 0.4) * smoothstep(0.0, 0.08, e);
    // thin drifting cloud banks catching nothing but starlight
    float cl = fbm(vec2(p.x * 1.4 + t * 0.01, e * 7.0));
    col *= 1.0 - 0.5 * smoothstep(0.5, 0.75, cl) * smoothstep(0.02, 0.15, e);
    // a far headland on the left, black against the sky, a few shore lights
    float hx = p.x + 0.55 * asp;
    float ridge = 0.05 + 0.10 * smoothstep(0.9, -0.6, hx) + 0.04 * fbm(vec2(p.x * 3.0, 1.0)) - 0.03;
    ridge *= smoothstep(0.6, 0.0, hx);
    float land = smoothstep(ridge + px, ridge - px, e);
    col = mix(col, nightLo * 0.6, land);
    vec2 lq = vec2(p.x * 30.0, 0.0);
    float lh = h1(floor(lq) + vec2(4.0, 0.0));
    float ld = abs(fract(lq.x) - 0.5);
    float lamp = step(0.72, lh) * exp(-ld * ld * 120.0) * exp(-(e - ridge * 0.35) * (e - ridge * 0.35) / 0.000036) * land;
    col += c1 * lamp * 0.5;
  } else {
    // ground plane under the camera: x across the beach, z out to sea
    float dy = max(HZ - p.y, 1e-4);
    float z = CH * FL / dy;
    float x = z * p.x / FL;
    float fz = z * z / (CH * FL) * px;
    float ps = phase(x, ps0);
    float zs = shore(x);
    float d = z - zs;

    if (d > 0.0) {
      // sea: refine the hit on the moving heightfield a few times
      float zz = z;
      float hh = 0.0;
      for (int i = 0; i < 5; i++) {
        float xi = zz * p.x / FL;
        hh = waveH(zz - shore(xi), phase(xi, ps0), xi);
        zz = max((CH - WA * hh) * FL / dy, zs + 0.01);
      }
      z = zz;
      x = z * p.x / FL;
      zs = shore(x);
      ps = phase(x, ps0);
      d = max(z - zs, 0.0);
      fz = z * z / (CH * FL) * px;

      float lam = 2.0 + 0.22 * d;
      float w = d / lam + ps;
      float f = fract(w);
      float slope = waveH(d + 0.08, ps, x) - waveH(d - 0.08, ps, x);
      // breaking strength: the crest flares in the last metres before shore
      float bk = smoothstep(5.5, 1.2, d) * smoothstep(0.0, 0.6, d + 0.3);
      bk *= 0.55 + 0.6 * vn(vec2(w * 0.9, x * 0.04 + 1.0));
      // the crest line itself, with a fast flickering lace along it
      float cd = min(f, 1.0 - f) * lam;
      float wid = 0.10 + 0.25 * bk + fz;
      float lace = fbm(vec2(x * 2.4 - t * 0.35, w * 6.0 + t * 0.9));
      float crest = exp(-cd * cd / (wid * wid)) * (0.35 + 1.1 * smoothstep(0.3, 0.75, lace));
      // white water trailing behind the broken crest, torn into filaments
      float trail = exp(-f * lam / 0.9) * smoothstep(0.35, 0.8, fbm(vec2(x * 3.2 + t * 0.2, d * 4.0 - t * 0.5)));
      // the glassy face lit from within as it stands up
      float face = smoothstep(0.82, 0.97, f) * (1.0 - smoothstep(0.97, 1.0, f));
      float light = (crest * (0.25 + 1.4 * bk) + trail * 0.9 * bk + face * 0.45 * bk) * gk;

      // water body: deep blue-black with a Fresnel sheen of the horizon sky
      float fres = 0.12 + 0.88 * pow(1.0 - clamp(dy * 1.1 + slope * 3.0, 0.0, 1.0), 5.0);
      col = nightLo * (0.6 + 0.4 * hh);
      col += nightHi * fres * (0.8 + 0.6 * vn(vec2(x * 1.5, z * 3.0 - t * 0.2)));
      // the glow of the crests spreading into the water around them
      col += c3 * 0.10 * bk * gk * exp(-cd / 0.7);
      col += lum(light, c0, c1, c2, c3) * min(light, 1.6);
      // plankton sparks in the churned water, fast and fine
      vec2 gq = vec2(x * 7.0, z * 7.0 / (1.0 + 0.15 * z));
      float gh = h1(floor(gq) + vec2(11.0, 3.0));
      vec2 go = fract(gq) - 0.5;
      float spark = step(0.86, gh) * exp(-dot(go, go) * 90.0) * smoothstep(0.4, 1.0, sin(t * (3.0 + 5.0 * gh) + gh * 60.0));
      col += c2 * spark * (bk * 0.7 + trail) * gk * 0.6 * (1.0 - smoothstep(0.03, 0.1, fz));
    } else {
      // beach: swash runs up the slope, then drains back leaving it wet
      float rp = -d / (RUN * reach);
      float u = fract(ps);
      float runA = 0.6 + 0.5 * vn(vec2(ps * 0.7 + 0.5, x * 0.05));
      float run = smoothstep(0.0, 0.28, u) * (1.0 - smoothstep(0.28, 1.0, u)) * runA;
      run = min(run, 1.0);
      float edge = rp - run + 0.06 * (fbm(vec2(x * 2.5, t * 0.3)) - 0.5);

      // sand: wind ripples whose crests catch the cool sky, black troughs
      float rw = vn(vec2(x * 0.9, z * 0.6));
      float rph = z * 26.0 + 5.0 * rw + x * 1.4 + 4.0 * vn(vec2(x * 0.5, z * 0.6))
                + 3.5 * vn(vec2(x * 2.2, z * 1.7)) + 1.2 * sin(x * 3.1 + z * 2.0);
      // the swash smooths the ripples away on the wet part of the slope
      float rv = (1.0 - smoothstep(0.02, 0.07, fz)) * smoothstep(runA - 0.05, runA + 0.25, rp);
      float rf = fract(rph / 6.2832);
      float ripD = mix(0.5, 1.0 - smoothstep(0.0, 0.55, rf) * smoothstep(1.0, 0.85, rf), rv);
      float rip = smoothstep(0.55, 0.95, sin(rph)) * rv;
      float grain = h1(floor(vec2(x, z) * 60.0));
      float gv = 1.0 - smoothstep(0.004, 0.02, fz);
      vec3 sand = nightLo * (0.7 + 0.5 * ripD) + nightHi * (0.1 + 0.55 * rip * (0.5 + rw));
      sand *= 0.75 + 0.5 * mix(0.5, grain, gv);
      // the surf light falls warm across the sand nearest the water
      float fall = exp(-max(rp - run, 0.0) * 2.2) * (0.4 + 0.6 * smoothstep(0.6, 0.0, u));
      sand += c3 * 0.10 * gk * fall * (0.4 + 0.6 * rip + 0.3 * ripD);
      col = sand;

      // wrack line: kelp tangles and shell grit stranded above the highest runup
      float wb = rp - 1.18 - 0.12 * vn(vec2(x * 0.6, 4.0));
      float kelp = smoothstep(0.58, 0.64, fbm(vec2(x * 6.0, z * 10.0))) * exp(-wb * wb / 0.006);
      float sw = abs(vn(vec2(x * 4.0, z * 3.0)) - 0.5);
      float strand = (1.0 - smoothstep(0.015, 0.04, sw)) * exp(-wb * wb / 0.02);
      float dk = max(kelp, strand * 0.85);
      col = mix(col, vec3(0.002, 0.003, 0.006), dk);
      col += c3 * 0.12 * gk * strand * fall;

      // the wet band below the highest recent runup is dark and glossy
      float wet = smoothstep(runA + 0.08, runA - 0.08, rp);
      col *= 1.0 - 0.45 * wet;
      col += nightHi * wet * 0.5 * pow(1.0 - clamp(dy, 0.0, 1.0), 3.0);

      // under the moving sheet of water: lit lace foam thinning uphill
      float cover = smoothstep(0.02, -0.02, edge);
      float sheet = fbm(vec2(x * 3.0 - t * 0.15, z * 4.0 + u * 6.0));
      float foam = cover * (0.25 + 0.75 * smoothstep(0.4, 0.75, sheet)) * (0.3 + 0.7 * smoothstep(0.6, 0.0, u));
      float lip = exp(-edge * edge / 0.0012) * smoothstep(0.7, 0.1, u);
      // the smear left behind as the water drains back, fading with time
      float drain = smoothstep(0.28, 0.4, u) * (1.0 - u) * (1.0 - u);
      float smear = drain * wet * exp(-max(edge, 0.0) * 4.0) * (1.0 - cover) * (0.4 + 0.6 * vn(vec2(x * 9.0, z * 0.7)));
      // streaks of the breaking crest mirrored down the wet sand
      float near = smoothstep(0.6, 0.95, fract(ps + 0.1)) * smoothstep(1.12, 1.0, fract(ps + 0.1));
      float streak = wet * near * (1.0 - cover) * smoothstep(0.35, 0.75, fbm(vec2(x * 2.5, z * 0.8 + x * 0.3))) * exp(-rp * 1.5);
      float light = (foam * 0.9 + lip * 1.3 + smear * 1.1 + streak * 0.5) * gk;
      col = mix(col, nightLo * 1.2 + nightHi * 0.4, cover * 0.6);
      col += lum(light, c0, c1, c2, c3) * min(light, 1.6);

      // stranded sparks at the wrack line where the last wave reached
      vec2 sq = vec2(x * 5.0, z * 9.0);
      float sh = h1(floor(sq) + vec2(2.0, 17.0));
      vec2 so = fract(sq) - 0.5;
      float wr = exp(-(rp - runA) * (rp - runA) / 0.02);
      col += c1 * step(0.9, sh) * exp(-dot(so, so) * 70.0) * wr * gk * 0.4 * (0.5 + 0.5 * sin(t * 2.0 + sh * 40.0)) * gv;
    }
    // night air thickens toward the horizon
    float fog = 1.0 - exp(-z * 0.03);
    col = mix(col, nightHi + c3 * 0.03, fog * 0.7);
  }

  col = max(col, 0.0);
  col = 1.0 - exp(-col * 1.8);
  gl_FragColor = vec4(col, 1.0);
}
