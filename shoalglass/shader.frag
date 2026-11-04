// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A shallow sandy floor seen through clear water. Bright caustic filaments,
// focused by the rippling surface, fold, pinch and slide over wind-cut sand
// ripples; scattered pebbles sit half buried at every depth, sharp near and
// soft far, and the far floor sinks into a deep blue water haze.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_waveSpeed;  // speed of the surface swell driving the caustics (default 0.55)
uniform float u_focus;      // how hard the surface focuses light, soft dapple to knotted filaments (default 1.0)
uniform float u_clarity;    // water clarity, how far the floor stays visible (default 0.7)
uniform float u_glow;       // brightness of the caustic light (default 1.0)

float hsh(vec2 p) {
  p = fract(p * vec2(0.2713, 0.6219));
  p += dot(p, p.yx + 27.71);
  return fract((p.x + p.y) * p.x * 3.917);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hsh(i);
  float b = hsh(i + vec2(1.0, 0.0));
  float c = hsh(i + vec2(0.0, 1.0));
  float d = hsh(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// one surface wave train; it fades once it is finer than the ground
// footprint f, so the far light softens instead of aliasing
float wv(vec2 x, vec2 k, float a, float w, float ph, float t, float f) {
  float kk = dot(k, k);
  return a * exp(-kk * f * f) * sin(dot(x, k) - t * w + ph);
}

// water surface height: a long swell, cross chop and two rose-curve ring
// trains whose wavy fronts carry the parent lace into the light
float waterH(vec2 x, float t, float f) {
  float h = 0.0;
  h += wv(x, vec2(3.6, 20.0), 0.00150, 1.10, 0.0, t, f);
  h += wv(x, vec2(-14.0, 24.0), 0.00055, 1.45, 1.3, t, f);
  h += wv(x, vec2(24.0, 15.0), 0.00035, 1.70, 4.1, t, f);
  h += wv(x, vec2(-34.0, 29.0), 0.00020, 2.05, 2.2, t, f);
  h += wv(x, vec2(12.0, -47.0), 0.00016, 2.30, 0.7, t, f);
  vec2 q = x - vec2(-2.6, 5.5);
  float r = length(q);
  float a = atan(q.y, q.x);
  h += 0.00040 * exp(-1024.0 * f * f) * sin(r * 32.0 - t * 1.6 + 0.6 * cos(9.0 * a + t * 0.2));
  q = x - vec2(3.4, 1.0);
  r = length(q);
  a = atan(q.y, q.x);
  h += 0.00026 * exp(-1600.0 * f * f) * sin(r * 40.0 - t * 1.9 + 0.5 * cos(7.0 * a - t * 0.15));
  return h;
}

// caustic brightness from the curvature of the refracting surface: light is
// bent by the surface slope, and where neighbouring rays converge the
// Jacobian of the mapping collapses into a bright fold line
float caustic(vec2 x, float t, float e, float D, float f) {
  float h0  = waterH(x, t, f);
  float hxp = waterH(x + vec2(e, 0.0), t, f);
  float hxm = waterH(x - vec2(e, 0.0), t, f);
  float hyp = waterH(x + vec2(0.0, e), t, f);
  float hym = waterH(x - vec2(0.0, e), t, f);
  float hpp = waterH(x + vec2(e, e), t, f);
  float hmm = waterH(x - vec2(e, e), t, f);
  float hxx = (hxp - 2.0 * h0 + hxm) / (e * e);
  float hyy = (hyp - 2.0 * h0 + hym) / (e * e);
  float hxy = ((hpp - hxp - hyp + h0) + (hmm - hxm - hym + h0)) / (2.0 * e * e);
  float jx = 1.0 + D * hxx;
  float jy = 1.0 + D * hyy;
  float det = jx * jy - D * D * hxy * hxy;
  return det;
}

// wind-cut sand ripples: asymmetric crests that wander and fork
float sandH(vec2 x) {
  float warp = vnoise(x * 0.9) * 2.4 + vnoise(x * 2.3 + 7.0) * 0.6;
  float ph = x.y * 17.0 + x.x * 3.0 + warp * 3.2;
  float s = sin(ph + 0.6 * sin(ph));
  float amp = 0.7 + 0.5 * vnoise(x * 1.7 + 3.0);
  return s * amp * 0.016 + (vnoise(x * 3.0) - 0.5) * 0.03;
}

void main() {
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);
  vec2  p   = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t   = u_time * u_waveSpeed;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // cool deep-water ambient against the warm-pink theme light
  vec3 deepW = vec3(0.006, 0.026, 0.050);
  vec3 skyW  = vec3(0.020, 0.085, 0.140);

  // camera above the water, looking down the beach at an angle, drifting
  float pitch = 0.52;
  float cp = cos(pitch), sp = sin(pitch);
  vec3 ro = vec3(0.15 * sin(u_time * 0.03), 1.0, u_time * 0.035);
  vec3 fw = vec3(0.0, -sp, cp);
  vec3 up = vec3(0.0, cp, sp);
  vec3 rd = normalize(p.x * vec3(1.0, 0.0, 0.0) + p.y * up + 1.25 * fw);
  float dist = ro.y / max(-rd.y, 0.02);
  vec2 x = ro.xz + rd.xz * dist;

  // ground footprint of one pixel, used to soften detail with depth
  float fp = dist / (mn * 1.25 * max(-rd.y, 0.05));
  float nearK = smoothstep(0.02, 0.003, fp);

  // sand normal
  float es = max(0.003, fp);
  float s0 = sandH(x);
  float sx = sandH(x + vec2(es, 0.0));
  float sy = sandH(x + vec2(0.0, es));
  float rippleFade = smoothstep(0.045, 0.008, fp);
  vec3 n = normalize(vec3(-(sx - s0) / es * rippleFade, 1.0, -(sy - s0) / es * rippleFade));

  // pebbles half sunk in the sand, varied size, shape and tone
  vec2 cellSz = vec2(0.5);
  vec2 cid = floor(x / cellSz - 0.5);
  float peb = 0.0;
  float pebShade = 0.0;
  float pebTone = 0.0;
  float pebBand = 0.0;
  vec3 pn = n;
  for (int j = 0; j < 4; j++) {
    vec2 o = vec2(mod(float(j), 2.0), floor(float(j) / 2.0));
    vec2 id = cid + o;
    float rnd = hsh(id + 11.3);
    if (rnd > 0.5) continue;
    vec2 ctr = (id + 0.2 + 0.6 * vec2(hsh(id + 2.1), hsh(id + 5.7))) * cellSz;
    float rad = mix(0.04, 0.15, hsh(id + 8.8) * hsh(id + 1.7));
    float ang = hsh(id + 4.4) * 6.283;
    vec2 q = x - ctr;
    q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * q;
    q.x *= mix(0.55, 1.0, hsh(id + 9.9));
    float th = atan(q.y, q.x);
    float wob = 1.0 + 0.10 * sin(th * 3.0 + rnd * 20.0) + 0.06 * sin(th * 5.0 + rnd * 9.0)
              + 0.10 * (vnoise(q / rad * 3.0 + id * 7.0) - 0.5);
    float d = length(q) / (rad * wob);
    float aa = max(fp / rad, 0.02) * 1.5;
    float m = smoothstep(1.0, 1.0 - aa, d);
    // contact shadow cast down-light of the stone
    vec2 qs = q + vec2(0.4, 0.3) * rad;
    float sh = smoothstep(1.4, 0.5, length(qs) / rad) * (1.0 - m);
    pebShade = max(pebShade, sh);
    if (m > peb) {
      peb = m;
      float dz = sqrt(max(1.0 - d * d, 0.0));
      pn = normalize(vec3(q.x / rad, dz * 1.2 + 0.2, q.y / rad));
      pebTone = hsh(id + 3.3);
      pebBand = sin((q.x * 0.6 + q.y) / rad * 9.0 + vnoise(q / rad * 4.0) * 3.0);
    }
  }
  n = normalize(mix(n, pn, peb));

  // light from the low morning sun, down through the surface
  vec3 L = normalize(vec3(-0.45, 0.85, 0.35));
  float diff = max(dot(n, L), 0.0);
  float back = max(dot(n, normalize(vec3(0.5, 0.6, -0.4))), 0.0);

  // caustics; the fade term f strips fine wave trains with distance
  float fl = fp * 1.4 * nearK + fp * 2.5 * (1.0 - nearK);
  float ce = max(0.006, fp);
  float D = 0.85 * u_focus;
  float det = caustic(x + n.xz * 0.015, t, ce, D, fl);
  // thin fold filament where the Jacobian crosses zero, plus a softer body
  // of focused light on the converging side; both blur with distance
  float lw = 0.10 + 0.6 * smoothstep(0.004, 0.05, fp);
  float fil = exp(-abs(det) / lw) * (1.0 - 0.5 * smoothstep(0.004, 0.05, fp));
  float body = smoothstep(0.7, 0.0, det) * 0.6;
  float cAmt = 3.0 * fil + body;

  // sand material: fine grain and darker trough silt
  float grain = hsh(floor(x * 420.0)) * nearK;
  float trough = smoothstep(0.003, -0.008, s0);
  vec3 sandBase = c3 * 0.15 * (0.8 + 0.4 * grain) * (1.0 - 0.4 * trough * rippleFade);
  vec3 stoneA = c3 * 0.07;
  vec3 stoneB = c0 * 0.26;
  vec3 pebBase = mix(stoneA, stoneB, pebTone) * (0.85 + 0.25 * pebBand) * (0.8 + 0.4 * vnoise(x * 70.0) * nearK);
  vec3 base = mix(sandBase, pebBase, peb);

  vec3 col = deepW + skyW * back * 0.6 + base * (0.15 + 1.8 * diff * diff) + c0 * 0.05 * diff * diff * rippleFade;
  col *= 1.0 - 0.6 * pebShade;

  // caustic light across the theme range: mid-tone body to near-white cores
  vec3 cCol = mix(c3, c0, smoothstep(0.0, 0.6, cAmt));
  cCol = mix(cCol, c1, smoothstep(0.6, 1.6, cAmt));
  cCol = mix(cCol, c2 * 1.1, smoothstep(2.2, 3.2, cAmt));
  float lit = (0.1 + 1.3 * diff * diff) * (1.0 - 0.65 * pebShade);
  col += cCol * cAmt * 0.30 * u_glow * lit;

  // wet sheen on stones
  vec3 hv = normalize(L + vec3(0.0, 1.0, -0.6));
  col += c2 * pow(max(dot(pn, hv), 0.0), 40.0) * peb * 0.45;

  // water haze swallows the far floor
  float fogK = 0.26 / max(u_clarity, 0.1);
  float fog = 1.0 - exp(-max(dist - 1.2, 0.0) * fogK);
  vec3 haze = mix(deepW, skyW, smoothstep(-0.2, 0.55, p.y)) + c3 * 0.04;
  col = mix(col, haze, fog);

  // sun glitter on the far surface, sparse and twinkling
  vec2 gp = vec2(p.x * 60.0 + u_time * 0.4, p.y * 140.0);
  vec2 gi = floor(gp);
  vec2 gf = fract(gp) - 0.5;
  float gr = hsh(gi + 0.37);
  float gl = smoothstep(0.30, 0.0, length(gf * vec2(1.0, 1.6)));
  float gtw = pow(max(sin(u_time * (1.0 + gr * 2.0) * 0.8 + gr * 50.0), 0.0), 6.0);
  float band = smoothstep(0.05, 0.45, p.y) * smoothstep(0.62, 0.40, p.y + 0.15 * sin(p.x * 3.0));
  col += mix(c1, c2, gr) * gl * gtw * step(0.82, gr) * band * 0.6;

  // suspended motes catching the light at a few depths
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sc = 7.0 + fk * 6.0;
    vec2 mp = p * sc + vec2(u_time * (0.03 + fk * 0.01), -u_time * (0.015 + 0.01 * fk)) + fk * 13.1;
    vec2 mi = floor(mp);
    vec2 mf = fract(mp) - 0.5;
    float hr = hsh(mi + fk * 3.7);
    vec2 off = vec2(hsh(mi + 1.3), hsh(mi + 2.9)) - 0.5;
    float md = length(mf - off * 0.7);
    float sz = (0.03 - fk * 0.007) * (0.5 + hr);
    float m = smoothstep(sz, sz * (0.2 + fk * 0.3), md) * step(0.6, hr);
    float tw = 0.5 + 0.5 * sin(u_time * 0.7 + hr * 40.0);
    col += c2 * m * (0.18 - fk * 0.04) * tw;
  }

  gl_FragColor = vec4(col, 1.0);
}
