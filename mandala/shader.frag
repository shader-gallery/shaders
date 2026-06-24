// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// mandala (Rosette) - a dense, multi-layered concentric ornament. Many nested
// rings of glowing scalloped petals (alternating N and 2N symmetry per ring) are
// laced together by radial spokes and studded with jewel dots, building a real
// intricate mandala that fills the frame and breathes slowly. Line-work glows and
// takes graded palette hues by ring. Comments ASCII-only (poster compiler quirk).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_petals; // base symmetry (petals on the inner rings)  (default 12)
uniform float u_rings;  // number of concentric ornament rings        (default 9)
uniform float u_breath; // breathing / morph speed                    (default 0.5)
uniform float u_glow;   // line-work glow strength                    (default 1.0)

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}
float gline(float d, float w) { return w / (abs(d) + w); }   // thin glowing line

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float mn = min(res.x, res.y);
  vec2  uv = (fc - ctr) / mn;
  float breath = 1.0 + 0.05 * sin(t * u_breath);
  float R = length(uv) / (0.54 * breath);          // ~1 at the frame edge
  float a = atan(uv.y, uv.x) + t * u_breath * 0.05; // very slow rotation

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float Nf = max(floor(u_petals + 0.5), 3.0);
  float nR = max(floor(u_rings + 0.5), 2.0);
  float lw = 0.9 * pr / mn * 2.0;                  // line half-width in R-units-ish
  float amp = 0.42 / nR;                           // scallop depth fits between rings

  vec3 col = vec3(0.0);
  float lit = 0.0;

  for (int i = 0; i < 14; i++) {
    if (float(i) >= nR) break;
    float fi = float(i);
    float ringR = (fi + 0.55) / nR;                          // 0..1 radius
    float pet = Nf * (1.0 + mod(fi, 2.0));                    // alternate N / 2N
    float scal = ringR + amp * cos(a * pet);                 // scalloped petal ring
    float line = gline(R - scal, lw * (1.0 + ringR));        // the glowing petal outline
    // petal-fill: brighten the lobes between scallops on alternate rings
    float fillm = 0.55 + 0.45 * cos(a * pet) * mod(fi + 1.0, 2.0);
    float jewel = smoothstep(0.86, 1.0, cos(a * pet)) * exp(-pow((R - (ringR + amp)) * 26.0, 2.0));
    vec3 hue = wheelCol(fi / nR * 0.8 + a * 0.05 + t * 0.02, c0, c1, c2, c3);
    float v = line * fillm + jewel * 1.4;
    col += hue * v;
    lit += v;
  }

  // radial spokes lacing the rings together (bright near centre, fading out)
  float spokeD = abs(fract(a * Nf / 6.2831853 * Nf) - 0.5);   // 0 on a spoke axis
  float spoke = gline(spokeD, lw * 1.5) * smoothstep(0.02, 0.2, R) * smoothstep(1.05, 0.5, R);
  col += wheelCol(0.5 + t * 0.02, c0, c1, c2, c3) * spoke * 0.5;
  lit += spoke * 0.5;

  // central rosette: a small dense flower
  float ros = gline(R - 0.06, lw * 1.2) + smoothstep(0.06, 0.0, R) * 0.6
            + gline(R - 0.11, lw) * (0.5 + 0.5 * cos(a * Nf));
  col += wheelCol(0.1 + t * 0.02, c0, c1, c2, c3) * ros;
  lit += ros;

  // soft palette backdrop so the negative space is tinted, never dead-black
  vec3 back = wheelCol(0.6 + R * 0.4 + t * 0.01, c0, c1, c2, c3) * (0.07 + 0.05 * (1.0 - R));
  col = back + col * u_glow;

  // gentle outer vignette
  col *= 1.0 - smoothstep(0.95, 1.5, R);

  gl_FragColor = vec4(col, 1.0);
}
