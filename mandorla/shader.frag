// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// mandorla (Kaleido) — an ornate guilloché rosette, the lacework end of the
// family. Where the others fill cells, this one is drawn in light: dozens of fine
// wavy concentric rose-curves of different petal counts interweave into an
// engraved lace, jewel nodes flaring where the threads cross. The whole rosette
// breathes — the curve amplitudes swell and ease — and turns slowly, so the moire
// of crossing threads shimmers like a spun mandala.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_petals;      // base petal count of the rose-curves (default 9)
uniform float u_tiers;       // number of interwoven curve layers    (default 6)
uniform float u_breathSpeed; // amplitude breath rate                (default 0.5)
uniform float u_bloom;       // thread glow strength                 (default 1.0)

const vec3 BG = vec3(0.030, 0.030, 0.040);

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 palBlend(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float mn  = min(res.x, res.y);
  vec2  p   = (gl_FragCoord.xy - ctr) / mn;
  float t   = u_time;

  float r = length(p) * 2.0;
  float a = atan(p.y, p.x) + t * 0.05;        // rosette turns slowly

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // long eased breath, 0 (tight) .. 1 (swelled)
  float br = 0.5 - 0.5 * cos(t * u_breathSpeed);
  br = br * br * (3.0 - 2.0 * br);

  float baseN = max(floor(u_petals), 3.0);
  float TIERS = max(floor(u_tiers), 1.0);

  // sum many thin rose-curve threads; each layer a different petal count and
  // base radius so they cross densely into guilloché lace
  vec3  lc   = vec3(0.0);
  float lace = 0.0;
  float node = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= TIERS) break;
    float fi   = float(i);
    float petN = baseN + floor(fi * 1.5);              // distinct petal counts → moire
    float dir  = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;      // alternate spin sense
    float amp  = (0.06 + 0.02 * fi) * mix(0.35, 1.15, br);
    // spread the rose-curves out to the corner radius (~1.9) so the lace fills
    // the whole frame instead of a centred disc
    float baseR = 0.12 + fi * (1.82 / TIERS);
    float curve = baseR + amp * cos(petN * a + dir * t * 0.4 + fi * 1.7);
    float d     = abs(r - curve);
    float line  = exp(-d * d * 1500.0);                // thin glowing thread
    vec3  hue   = palBlend(c0, c1, c2, c3, fi * 0.23 + a * 0.08 + t * 0.03);
    lc   += hue * line;
    lace += line;
    node += line;                                       // accumulate for crossings
  }

  // jewel nodes where threads pile up (crossings) flare brighter
  float crossing = smoothstep(1.3, 2.4, node);

  vec3 col = BG;
  col += lc * 1.5 * u_bloom;
  col += palBlend(c0, c1, c2, c3, a * 0.16 + t * 0.04) * crossing * 0.9 * u_bloom;

  // a fine radial filigree of spokes folded N-fold, running out to the corners
  // so the angular gaps between lace rings stay filled
  float spoke = pow(0.5 + 0.5 * cos(baseN * 2.0 * a), 8.0);
  col += palBlend(c0, c1, c2, c3, 0.5 + t * 0.05) * spoke * smoothstep(2.0, 0.1, r)
         * smoothstep(0.08, 0.3, r) * 0.18 * u_bloom;

  // glowing heart
  col += palBlend(c0, c1, c2, c3, 0.18 + t * 0.05) * exp(-r * r * 60.0) * (0.4 + 0.4 * br);

  // keep the lace lit into the corners; only soften the very edge
  col *= 1.0 - 0.4 * smoothstep(1.6, 2.15, r);

  gl_FragColor = vec4(col, 1.0);
}
