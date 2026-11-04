// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Shoalfire - looking down through shallow clear water onto a rippled sand floor.
// The swell overhead bends the light into bright filaments that fold, pinch and
// slide across the ripple crests, wrapping over weathered rocks half buried in the
// sand. Slanting shafts hang in the water, silt drifts through them, and the floor
// fades into blue-black depth toward the top of the frame.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swell;  // speed of the surface swell driving the caustics (default 1.0)
uniform float u_focus;  // how sharply the waves focus light into filaments (default 1.0)
uniform float u_shafts; // strength of the light shafts in the water       (default 1.0)

const float SURF = 1.9;
float gAmp;   // ripple amplitude after distance filtering
float gTime;

float h21(vec2 p) { return fract(sin(dot(p, vec2(41.73, 89.29))) * 51731.917); }

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = mat2(0.79, -0.61, 0.61, 0.79) * p * 2.13 + vec2(3.7, 1.1);
    a *= 0.5;
  }
  return v / 0.875;
}

float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

// sand: asymmetric ripples with forks from a warped phase, on a slow undulation
float sandH(vec2 x) {
  vec2 dr = normalize(vec2(0.22, 1.0));
  float w = 6.0 * vnoise(x * 1.4) + 2.4 * vnoise(x * 3.7 + 7.0) + 2.5 * x.x * x.x * 0.1;
  float ph = dot(x, dr) * 50.0 + w;
  float r = sin(ph + 0.65 * cos(ph));
  // ripple amplitude wanders so crests fade out and fork
  float am = 0.45 + 0.75 * vnoise(x * 2.1 + 1.7);
  return 0.014 * r * am * gAmp + 0.06 * vnoise(x * 0.45 + 3.0);
}

// a weathered boulder half sunk in the sand
float rockH(vec2 x, vec2 c, float r, float hg, float seed) {
  vec2 d = x - c;
  float q0 = length(d) / r;
  if (q0 > 1.6) return -1.0;
  float a = atan(d.y, d.x);
  float rr = r * (1.0 + 0.16 * sin(a * 3.0 + seed) + 0.08 * sin(a * 5.0 + seed * 2.3));
  float q = length(d * vec2(1.0, 1.2)) / rr;
  float dome = sqrt(max(1.0 - q * q, 0.0));
  float er = fbm3(x * 6.5 + seed);
  float ledge = 0.04 * smoothstep(0.4, 0.6, fract(x.y * 3.0 + er * 0.8 + seed));
  return hg * dome * (0.7 + 0.45 * er) - 0.04 + ledge * dome;
}

float rocks(vec2 x) {
  float h = rockH(x, vec2(-0.78, 3.05), 0.56, 0.44, 1.3);
  h = max(h, rockH(x, vec2(1.55, 5.7), 0.4, 0.3, 4.1));
  h = max(h, rockH(x, vec2(0.42, 1.95), 0.13, 0.11, 8.7));
  h = max(h, rockH(x, vec2(-2.3, 8.2), 0.75, 0.55, 2.2));
  h = max(h, rockH(x, vec2(-0.25, 2.55), 0.08, 0.06, 6.1));
  return h;
}

float H(vec2 x) {
  return smax(sandH(x), rocks(x), 0.05);
}

// caustic focus from the swell: curvature of the surface maps to light density
float caustic(vec2 x, float depth, float soft) {
  x += 0.35 * vec2(vnoise(x * 0.6 + gTime * 0.03), vnoise(x * 0.6 + 4.1 - gTime * 0.025));
  float hxx = 0.0, hzz = 0.0, hxz = 0.0;
  float foc = max(u_focus, 0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = 1.25 + (fi - 2.5) * 0.2 + 0.12 * sin(fi * 3.7);
    vec2 d = vec2(cos(ang), sin(ang));
    float k = 8.0 + 10.0 * fract(fi * 0.618 + 0.13);
    float A = foc * 0.42 / (k * k);
    float om = sqrt(9.8 * k) * 0.32 * max(u_swell, 0.0);
    float s = sin(dot(d, x) * k - gTime * om + fi * 1.9);
    float c = A * k * k * s;
    hxx -= c * d.x * d.x;
    hzz -= c * d.y * d.y;
    hxz -= c * d.x * d.y;
  }
  float D = depth;
  float det = (1.0 + D * hxx) * (1.0 + D * hzz) - D * D * hxz * hxz;
  return 1.0 / (abs(det) + soft);
}

void main() {
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);
  vec2  p   = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t   = u_time;
  gTime = t;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  float shK = max(u_shafts, 0.0);

  // cool depth against the warm theme light
  vec3 deep  = vec3(0.004, 0.016, 0.038);
  vec3 amb   = vec3(0.03, 0.085, 0.16);
  vec3 lightC = mix(c1, vec3(1.0, 0.9, 0.88), 0.2);
  vec3 hot   = mix(c1, vec3(1.0, 0.96, 0.95), 0.72);

  // camera hovering above the floor, looking down and ahead, gently bobbing
  vec3 ro = vec3(0.05 * sin(t * 0.07), 1.35 + 0.025 * sin(t * 0.21), 0.04 * sin(t * 0.05));
  vec3 fw = normalize(vec3(0.1, -0.62, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw + (p.x * rt + p.y * up) * 0.95);

  vec3 L = normalize(vec3(-0.42, 1.0, -0.28));

  // distance filter for the ripples so far sand does not alias
  float dy = min(rd.y, -0.03);
  float tp = (ro.y) / -dy;
  float foot = tp * 0.95 / mn / max(-dy, 0.06);
  gAmp = smoothstep(0.05, 0.015, foot);

  // march the floor heightfield
  float tt = max((ro.y - 0.6) / -dy, 0.0);
  float hitT = 30.0;
  for (int i = 0; i < 60; i++) {
    vec3 q = ro + rd * tt;
    float d = q.y - H(q.xz);
    if (d < 0.0015 * tt) { hitT = tt; break; }
    tt += 0.6 * d / max(-rd.y, 0.35);
    if (tt > 30.0) break;
  }
  hitT = min(hitT, tt);
  vec3 pos = ro + rd * hitT;

  float e = 0.003 + 0.0015 * hitT;
  float h0 = H(pos.xz);
  vec3 n = normalize(vec3(h0 - H(pos.xz + vec2(e, 0.0)), e, h0 - H(pos.xz + vec2(0.0, e))));

  float rk = rocks(pos.xz);
  float isRock = smoothstep(-0.01, 0.03, rk - sandH(pos.xz));

  // soft shadow toward the surface light
  float shd = 1.0;
  for (int j = 0; j < 8; j++) {
    float sj = 0.03 + 0.09 * float(j);
    vec3 sp = pos + L * sj;
    shd = min(shd, clamp(4.0 * (sp.y - H(sp.xz) + 0.01) / sj, 0.0, 1.0));
  }
  shd = 0.15 + 0.85 * shd;

  // caustics at the hit point, projected up to the surface along the light
  float depthW = SURF - pos.y;
  vec2 cxz = pos.xz + L.xz / L.y * depthW;
  float soft = 0.14 + foot * 3.0;
  float ca = caustic(cxz, depthW * 0.85, soft);
  // focus wanders across the floor so some reaches burn brighter than others
  float reach = 0.6 + 0.7 * vnoise(cxz * 0.35 + vec2(t * 0.02, 0.0));
  float caN = ca * 0.36 * reach;

  float dif = max(dot(n, L), 0.0);
  // material
  float grain = vnoise(pos.xz * 140.0) * gAmp;
  vec3 sandA = vec3(0.78, 0.68, 0.66) * (0.85 + 0.3 * grain);
  // scattered shell grit: varied pale flecks
  vec2 gc = pos.xz * 18.0;
  vec2 gi = floor(gc);
  vec2 gf = fract(gc) - 0.5 - (vec2(h21(gi), h21(gi + 5.3)) - 0.5) * 0.6;
  float gsz = 0.04 + 0.12 * h21(gi + 2.7);
  float fleck = smoothstep(gsz, gsz * 0.4, length(gf)) * step(0.82, h21(gi + 9.9)) * gAmp;
  sandA = mix(sandA, vec3(1.0, 0.92, 0.9), fleck * 0.6);
  float trough = smoothstep(0.004, -0.012, sandH(pos.xz) - 0.05 * vnoise(pos.xz * 0.45 + 3.0));
  sandA *= 1.0 - 0.35 * trough * gAmp;

  float rf = fbm3(pos.xz * 9.0 + pos.y * 4.0);
  vec3 rockA = mix(c3 * 0.9, c2 * 0.8, smoothstep(0.35, 0.7, rf)) * (0.5 + 0.6 * rf);
  // dark weed crust on the rock tops
  float pit = smoothstep(0.55, 0.75, fbm3(pos.xz * 22.0 + 3.0));
  rockA = mix(rockA, vec3(0.04, 0.02, 0.05), pit * 0.6);
  rockA = mix(rockA, vec3(0.75, 0.62, 0.62), smoothstep(0.8, 0.95, rf) * 0.5);
  rockA *= 1.6;
  vec3 alb = mix(sandA, rockA, isRock);

  float lit = dif * shd;
  vec3 direct = lit * (c3 * 0.2 + c0 * 0.08 + c2 * 0.1 * caN + lightC * caN * 0.7 + hot * smoothstep(1.0, 2.6, caN) * 1.8);
  // the cool water light fills the lee slopes and the rock shade
  vec3 col = alb * (direct + amb * (0.25 + 0.75 * n.y) * (1.0 - 0.75 * smoothstep(0.0, 0.6, lit)));
  // edge catch on rock rims from the light above
  col += isRock * c1 * pow(1.0 - max(n.y, 0.0), 3.0) * dif * shd * 0.25;

  // water absorption: warm glow toward the surface side, blue-black below
  vec3 fogC = mix(deep, c3 * 0.32 + c0 * 0.06, smoothstep(-0.5, -0.1, rd.y));
  float fogA = 1.0 - exp(-hitT * 0.17);
  col = mix(col, fogC, fogA);

  // light shafts through the water column
  float marchLen = min(hitT, 9.0);
  float jit = h21(gl_FragCoord.xy + fract(t) * 13.0);
  float shaft = 0.0;
  for (int k = 0; k < 8; k++) {
    float s = (float(k) + jit) / 8.0 * marchLen;
    vec3 q = ro + rd * s;
    vec2 sx = q.xz + L.xz / L.y * (SURF - q.y);
    // ribbons of focused light hanging from the swell, drifting with it
    float a = dot(sx, vec2(0.93, -0.37)) * 2.6 + 2.2 * vnoise(sx * 0.7 + t * 0.04) - t * 0.12 * max(u_swell, 0.0);
    float rib = pow(0.5 + 0.5 * sin(a), 5.0) * (0.4 + 0.9 * vnoise(sx * 1.3 - t * 0.05));
    shaft += rib * exp(-s * 0.2) * smoothstep(0.0, 0.4, s);
  }
  shaft *= marchLen / 8.0;
  col += mix(c0, c1, 0.6) * shaft * 0.07 * shK;

  // drifting silt at three depths, lit by the shafts
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sc = 7.0 + fk * 6.0;
    vec2 uv = p * sc + vec2(t * (0.03 + fk * 0.01), -t * (0.05 - fk * 0.01)) + fk * 11.3;
    vec2 ci = floor(uv);
    vec2 cf = fract(uv) - 0.5 - (vec2(h21(ci + fk), h21(ci + 2.9 + fk)) - 0.5) * 0.7;
    float sz = 0.025 + 0.05 * h21(ci + 6.1) / (1.0 + fk * 0.5);
    float m = exp(-dot(cf, cf) / (sz * sz)) * step(0.7, h21(ci + 3.3 + fk));
    col += hot * m * (0.1 + shaft * 0.3 * shK) * (1.0 - fk * 0.25);
  }

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
