// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;

// Amalgam — two quicksilver pools meet, fuse, wobble, and pinch apart.
// Family: Mercury. Smooth-min metaball duet in open near-black darkness.

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_poolScale;     // radius scale of both pools, css px (default 170)
uniform float u_cycleSpeed;    // speed of the fusion round         (default 0.4)
uniform float u_rimGlow;       // rim highlight brightness          (default 1.0)
uniform float u_flashStrength; // fusion / pinch flash intensity    (default 1.0)

// duet state shared with the field function
vec2  gP1, gP2;
float gR1, gR2, gK;

// polynomial smooth minimum — bodies bulge toward each other, neck, fuse
float smin2(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// the summed-kernel iso field: signed distance to the fused silhouette
float field(vec2 p) {
  float d1 = length(p - gP1) - gR1;
  float d2 = length(p - gP2) - gR2;
  return smin2(d1, d2, gK);
}

float gauss(float x, float c, float w) {
  float u = (x - c) / w;
  return exp(-u * u);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr = max(u_pixelRatio, 0.25);
  vec2 pc = (gl_FragCoord.xy - 0.5 * u_resolution) / pr;  // css px, centered
  vec2 resC = u_resolution / pr;

  float S = max(u_poolScale, 1.0);          // css-px radius scale
  float speed = max(u_cycleSpeed, 0.001);
  float T = u_time * speed;                 // scaled clock
  float ph = fract((T + 3.7) / 20.0);       // one full round of the duet

  // --- separation schedule: apogee, slow approach, snap, settle, pinch ---
  const float SEP_MAX   = 1.95;  // apogee — clearly two bodies
  const float SEP_NEAR  = 1.28;  // first contact, neck about to bridge
  const float SEP_MIN   = 0.42;  // fully merged single body
  const float SEP_PINCH = 1.45;  // elongated past the break point
  float sep = SEP_MAX
    + (SEP_NEAR  - SEP_MAX)  * smoothstep(0.02, 0.33,  ph)   // magnetic approach
    + (SEP_MIN   - SEP_NEAR) * smoothstep(0.34, 0.385, ph)   // quick snap
    + (SEP_PINCH - SEP_MIN)  * smoothstep(0.62, 0.86,  ph)   // reluctant stretch
    + (SEP_MAX   - SEP_PINCH)* smoothstep(0.86, 0.995, ph);  // release to apogee
  sep *= S;

  // duet axis rotates slowly; centre of mass drifts gently (phase-continuous)
  float ang = 0.45 + 0.045 * T;
  vec2 axis = vec2(cos(ang), sin(ang));
  vec2 nrm  = vec2(-axis.y, axis.x);
  vec2 cm   = vec2(sin(T * 0.21), sin(T * 0.157 + 1.3)) * 0.05 * S;

  // damped elliptical ring after fusion: counter-oscillating kernel centres
  float env = smoothstep(0.34, 0.39, ph)
            * exp(-max(ph - 0.39, 0.0) * 7.0)
            * (1.0 - smoothstep(0.60, 0.72, ph));
  float wt = T * 5.0;
  vec2 wob = (axis * sin(wt) * 0.12 + nrm * sin(wt * 0.63 + 1.7) * 0.07) * S * env;

  gR1 = 0.62 * S;                            // the larger pool
  gR2 = 0.48 * S;                            // the smaller pool
  gK  = 0.34 * S;                            // smooth-min reach
  gP1 = cm - axis * sep * 0.375 + wob * 0.38;  // heavier body moves less
  gP2 = cm + axis * sep * 0.625 - wob * 0.62;

  float d = field(pc);

  // pool dominance weight at this pixel (1 = large pool) for hue blending
  float dd1 = length(pc - gP1) - gR1;
  float dd2 = length(pc - gP2) - gR2;
  float hw = clamp(0.5 + 0.5 * (dd2 - dd1) / gK, 0.0, 1.0);

  // gradient of the field for the directional rim highlight
  float e = 2.0;
  vec2 g = vec2(field(pc + vec2(e, 0.0)) - field(pc - vec2(e, 0.0)),
                field(pc + vec2(0.0, e)) - field(pc - vec2(0.0, e)));
  vec2 n = g / max(length(g), 1e-4);

  // --- compose ---
  vec3 bg = vec3(0.035, 0.035, 0.043);
  float vig = 1.0 - 0.30 * smoothstep(0.35, 1.15,
                length(pc) / (0.5 * min(resC.x, resC.y)));
  vec3 col = bg * vig;

  float aa = 1.5;
  float body = smoothstep(aa, -aa, d);

  // interior: dark liquid mirror with a faint cool sheen toward the lower half
  vec2  pCen = mix(gP2, gP1, hw);
  float pRad = mix(gR2, gR1, hw);
  float yrel = (pc.y - pCen.y) / max(pRad, 1.0);
  float sheen = smoothstep(0.55, -0.95, yrel);
  float inner = exp(min(d, 0.0) / (0.16 * pRad));   // depth falloff from surface
  vec3 interior = bg * 0.85 + c2 * (0.06 * sheen + 0.06 * inner * sheen + 0.012);
  col = mix(col, interior, body);

  // thin bright gradient-derived rim, lit from upper left, hue c0 -> c1
  float lightAmt = max(dot(n, normalize(vec2(-0.42, 0.86))), 0.0);
  float specW = 0.30 + 0.70 * lightAmt * lightAmt;
  float rim = exp(-(d * d) / (2.4 * 2.4));
  vec3 rimCol = mix(c1, c0, hw);
  col += rimCol * rim * specW * u_rimGlow * 1.15;

  // very soft halo so the dark around the bodies breathes a little
  float halo = exp(-max(d, 0.0) / (0.30 * S)) * (1.0 - body);
  col += rimCol * halo * 0.045 * (0.4 + 0.6 * u_rimGlow);

  // --- the snap: hot c3 bloom at the neck at fusion and at pinch-apart ---
  float fz = (gauss(ph, 0.355, 0.022) + gauss(ph, 0.78, 0.025)) * u_flashStrength;
  vec2 dvec = gP2 - gP1;
  float slen = max(length(dvec), 1.0);
  float tn = clamp((gR1 + 0.5 * (slen - gR1 - gR2)) / slen, 0.0, 1.0);
  vec2 neckP = gP1 + dvec * tn;
  float fd = length(pc - neckP);
  float flashGlow = fz * (0.70 * exp(-(fd * fd) / (0.34 * S * 0.34 * S))
                        + 0.65 * exp(-(fd * fd) / (0.14 * S * 0.14 * S)));
  col += c3 * flashGlow;
  col += c3 * fz * rim * 0.6;   // the rim catches the flash

  // soft tone map keeps the flash hot without clipping, then dither
  col = 1.0 - exp(-col);
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
