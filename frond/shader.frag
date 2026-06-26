// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// frond (Smolder) — REFRAMED as a POTHOS VINE (Epipremnum aureum): trailing vines
// hang and climb down the frame, each a prominent tapering stem (thicker at the
// crown, thinning toward the growing tip) studded with MANY tiny heart-shaped
// leaves that fan out in naturally varied directions. Each little leaf keeps
// frond's identity — a glowing midrib + margin (cool vein / warm margin) — plus
// cream variegation. A gentle oscillating breeze sways the leaves and tips (no
// drift). Leaves are z-composited so the nearest wins, reading as real foliage on
// visible vines rather than free-floating leaves. Fully palette-themeable.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_leafSize;     // heart leaf radius in CSS px — small (default 16)
uniform float u_leafDensity;  // how many leaves crowd each vine, 0..1 (default 0.8)
uniform float u_veinGlow;     // brightness of the leaf midrib/veins (default 0.6)
uniform float u_marginGlow;   // brightness of the warm leaf margin (default 0.6)
uniform float u_sway;         // breeze sway amount, 0..1 (default 0.5)
uniform float u_variegation;  // cream variegation patch amount, 0..1 (default 0.5)

const vec3  BG = vec3(0.013, 0.020, 0.016); // deep foliage near-black
const int   VINES  = 8;
const int   LEAVES = 16;

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float sdSeg(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

// STATIC vine shape: a fixed curve hanging from the top of the frame, wandering
// horizontally as it climbs down. No time term — the shape never drifts.
vec2 vinePoint(float fv, float s, vec2 res, out vec2 tang) {
  float h0 = hash11(fv * 1.7 + 1.0);
  float h1 = hash11(fv * 2.3 + 4.0);
  float startX = (fv + 0.5) / float(VINES) * res.x + (h0 - 0.5) * res.x * 0.10;
  float amp    = res.x * (0.04 + 0.07 * h1);
  float freq   = 1.1 + 1.4 * h0;
  float phase  = fv * 2.1;
  float y = res.y * 1.10 - s * res.y * 1.22;             // top -> bottom (climbs down)
  float wob = sin(s * freq * 3.14159 + phase) + 0.4 * sin(s * freq * 6.3 + phase * 1.7);
  float x = startX + amp * wob;
  float s2 = s + 1.0 / 96.0;
  float wob2 = sin(s2 * freq * 3.14159 + phase) + 0.4 * sin(s2 * freq * 6.3 + phase * 1.7);
  float x2 = startX + amp * wob2;
  float y2 = res.y * 1.10 - s2 * res.y * 1.22;
  tang = normalize(vec2(x2 - x, y2 - y));
  return vec2(x, y);
}

// heart / cordate implicit, lobes at +y (cleft toward petiole), cusp/tip at -y.
float heartField(vec2 p) {
  float x = p.x, y = p.y;
  float a = x * x + y * y - 1.0;
  return a * a * a - x * x * y * y * y;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr   = max(u_pixelRatio, 0.25);
  vec2  cssP = gl_FragCoord.xy / pr;
  vec2  res  = max(u_resolution / pr, vec2(1.0));
  float t    = u_time;

  float leafR  = max(u_leafSize, 6.0);
  float dens   = clamp(u_leafDensity, 0.0, 1.0);
  float vGlow  = clamp(u_veinGlow, 0.0, 1.5);
  float mGlow  = clamp(u_marginGlow, 0.0, 1.5);
  float sway   = clamp(u_sway, 0.0, 1.0);
  float varieg = clamp(u_variegation, 0.0, 1.0);

  // palette-derived colours
  vec3 foliageHi = c2 * 0.55 + c0 * 0.12 + vec3(0.02);
  vec3 foliageLo = c2 * 0.20 + c1 * 0.10;
  vec3 veinCol   = c0 * 0.95 + c2 * 0.25 + vec3(0.05);
  vec3 marginC   = c3 * 1.00 + c1 * 0.15;
  vec3 varCol    = c2 * 0.6  + vec3(0.45);
  vec3 stemCol   = c2 * 0.60 + c0 * 0.16 + vec3(0.0, 0.05, 0.0);

  vec3 col = BG + (c2 * 0.04 + c1 * 0.02) * vnoise(cssP / 80.0);

  float activeLeaves = mix(6.0, float(LEAVES), dens);
  float activeVines  = mix(4.0, float(VINES), dens);

  // z-buffer: nearest leaf wins (clean foliage, not additive mush)
  float bestZ = -1.0;
  vec3  bestCol = vec3(0.0);
  float bestCov = 0.0;

  for (int vi = 0; vi < VINES; vi++) {
    float fv = float(vi);
    if (fv > activeVines) continue;

    // ---- draw the VINE as a prominent tapering stem (sample the curve finely so
    // it reads as a continuous climbing vine, not a chain of dots).
    const int SAMP = 16;
    vec2 stemTg;
    vec2 prev = vinePoint(fv, 0.0, res, stemTg);
    for (int k = 1; k <= SAMP; k++) {
      float s = float(k) / float(SAMP);
      vec2 tg;
      vec2 P = vinePoint(fv, s, res, tg);
      // breeze sway grows toward the tip
      vec2 nrm = vec2(-tg.y, tg.x);
      float swA = sin(t * 1.1 + fv * 2.0 + s * 3.2) * sway * leafR * 1.0 * (0.2 + s);
      vec2 Pp = P + nrm * swA;
      float hseg;
      float ds = sdSeg(cssP, prev, Pp, hseg);
      // taper: thick near the crown (s small), thinning to the growing tip
      float width = mix(2.1, 0.6, s) * pr;
      float stem = (1.0 - smoothstep(width, width + 1.5 * pr, ds));
      col += stemCol * stem * 0.85;
      prev = Pp;
    }

    // ---- many tiny leaves fanning off the vine in varied directions
    for (int li = 0; li < LEAVES; li++) {
      float fl = float(li);
      if (fl >= activeLeaves) continue;

      float s = (fl + 0.5) / float(LEAVES);
      vec2 tg;
      vec2 P = vinePoint(fv, s, res, tg);
      vec2 nrm = vec2(-tg.y, tg.x);
      float swA = sin(t * 1.1 + fv * 2.0 + s * 3.2) * sway * leafR * 1.0 * (0.2 + s);
      vec2 Pp = P + nrm * swA;

      // per-leaf variation
      float side  = (mod(fl, 2.0) < 1.0) ? 1.0 : -1.0;
      float hOri  = hash11(fv * 7.0 + fl * 3.1);
      float hSize = hash11(fv * 5.0 + fl * 1.7);
      float hDep  = hash11(fv * 11.0 + fl * 2.3);
      // leaves shrink toward the growing tip (younger), tiny overall
      float lr = leafR * (0.7 + 0.6 * hSize) * mix(1.05, 0.5, s);

      // natural varied orientation: outward off the vine + a wide random rotation,
      // plus a little sway swing
      vec2 outward = normalize(nrm * side * 0.85 + vec2(0.0, -0.45));
      float ori = (hOri - 0.5) * 2.6 + sin(t * 1.1 + fv * 2.0 + s * 3.2 + 0.6) * sway * 0.25;
      float cs = cos(ori), sn = sin(ori);
      vec2 tipDir = vec2(outward.x * cs - outward.y * sn, outward.x * sn + outward.y * cs);
      vec2 ctr = Pp + tipDir * lr * 1.0;

      vec2 rel = cssP - ctr;
      if (dot(rel, rel) > lr * lr * 3.2) continue;

      vec2 up = -tipDir;                 // leaf-local +y toward the petiole/cleft
      vec2 rt = vec2(up.y, -up.x);
      vec2 q  = vec2(dot(rel, rt), dot(rel, up)) / lr;

      vec2 hp = vec2(q.x * 1.04, q.y * 1.12 + 0.42);
      float f = heartField(hp);
      float cov = smoothstep(0.12, -0.22, f);
      if (cov < 0.02) continue;

      float midrib = exp(-hp.x * hp.x / 0.012);
      float rim = exp(-f * f / 0.026) * smoothstep(0.18, -0.05, f);
      float vg = vnoise(q * 3.0 + vec2(fv * 4.0, fl * 2.0));
      float varMask = smoothstep(0.6, 0.85, vg) * varieg;
      float shade = clamp(0.5 + 0.5 * (1.0 - abs(hp.x)), 0.0, 1.0);

      vec3 leafCol = mix(foliageLo, foliageHi, shade);
      leafCol = mix(leafCol, varCol, varMask * 0.6);
      leafCol += veinCol * midrib * vGlow * 0.6;
      leafCol += marginC * rim * mGlow * 0.85;
      leafCol *= 0.6 + 0.55 * hDep;

      if (hDep > bestZ) { bestZ = hDep; bestCol = leafCol; bestCov = cov; }
    }
  }

  col = mix(col, bestCol, bestCov);

  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  col *= 1.0 - 0.28 * smoothstep(0.5, 1.15, length(uv - 0.5) * 1.40);
  col += (hash21(gl_FragCoord.xy + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
