// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;

// Solder — four molten beads ride a gently bowed weld seam. Summed kernels are
// smooth-min iso-surfaced so neighbours bulge, neck, and wick into longer liquid
// slugs; merges propagate left-to-right down the line, then the slug reluctantly
// re-pinches back into four beads. Family: Mercury (1D-confined fusion cascade).

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_beadSize;    // bead radius, css px            (default 80)
uniform float u_travelSpeed; // merge/pinch travel speed       (default 0.45)
uniform float u_seamSag;     // downward bow of the seam, 0..1 (default 0.12)
uniform float u_sheen;       // cool interior sheen strength   (default 0.8)

// four bead centres + radii, shared with the field function
vec2  bP0, bP1, bP2, bP3;
float bR0, bR1, bR2, bR3, bK;

// polynomial smooth minimum — bodies bulge toward each other, neck, fuse
float smin2(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// summed-kernel iso field: signed distance to the fused chain silhouette
float field(vec2 p) {
  float d0 = length(p - bP0) - bR0;
  float d1 = length(p - bP1) - bR1;
  float d2 = length(p - bP2) - bR2;
  float d3 = length(p - bP3) - bR3;
  float d = smin2(d0, d1, bK);
  d = smin2(d, d2, bK);
  d = smin2(d, d3, bK);
  return d;
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

  float pr   = max(u_pixelRatio, 0.25);
  vec2  pc   = (gl_FragCoord.xy - 0.5 * u_resolution) / pr; // css px, centred
  vec2  resC = u_resolution / pr;
  float minS = min(resC.x, resC.y);

  float R     = max(u_beadSize, 1.0);            // bead radius, css px
  float speed = max(u_travelSpeed, 0.0001);
  float sag   = clamp(u_seamSag, 0.0, 1.0);

  // --- the seam: a hair-thin filament bowing downward across the frame ---
  // x spans most of the width; sag pushes the middle down as a parabola
  float halfSpan = 0.40 * resC.x;                // seam reaches near both edges
  float seamDrop = sag * 0.55 * minS;            // depth of the bow at centre
  // seam y at a given normalized arc position a in [-1,1]
  // (parabola: zero bow at ends, full drop at centre)

  float T  = u_time * speed;
  float ph = fract(T / 22.0);                    // one peristaltic round

  // Four beads sit at rest arc positions a = -0.75,-0.25,0.25,0.75.
  // A merge "wickfront" sweeps left->right pulling each bead toward its left
  // neighbour, fusing the chain; then it relaxes and the slug re-pinches at
  // staggered moments back to four beads. Eased, offset per-bead timing.
  const float A0 = -0.78;
  const float A1 = -0.26;
  const float A2 =  0.26;
  const float A3 =  0.78;

  // merge envelope per gap: how strongly bead i is drawn toward bead i-1.
  // gaps close in sequence (left first), then reopen later, staggered.
  // g1 = bead1->bead0, g2 = bead2->bead1, g3 = bead3->bead2
  float g1 = smoothstep(0.04, 0.20, ph) * (1.0 - smoothstep(0.66, 0.84, ph));
  float g2 = smoothstep(0.16, 0.32, ph) * (1.0 - smoothstep(0.74, 0.90, ph));
  float g3 = smoothstep(0.28, 0.44, ph) * (1.0 - smoothstep(0.82, 0.97, ph));

  // pull amounts: closing a gap slides the trailing bead onto its neighbour.
  // accumulate so a fused slug travels as one (bead3 follows bead2 follows...).
  float pull1 = g1 * (A1 - A0);
  float pull2 = g2 * (A2 - A1) + pull1;          // rides the upstream merge too
  float pull3 = g3 * (A3 - A2) + pull2;

  float a0 = A0;
  float a1 = A1 - pull1 * 0.96;
  float a2 = A2 - pull2 * 0.96;
  float a3 = A3 - pull3 * 0.96;

  // a tiny settling wobble along the line after each merge (peristaltic shimmy)
  float wob = 0.012 * minS * sin(T * 4.7);
  float setl = smoothstep(0.20, 0.30, ph) * (1.0 - smoothstep(0.60, 0.74, ph));
  a1 += (wob / halfSpan) * setl * 0.7;
  a2 += (wob / halfSpan) * setl;
  a3 += (wob / halfSpan) * setl * 1.3;

  // map arc position -> world point on the bowed seam
  // x = a * halfSpan ; y = -seamDrop*(1 - x_norm^2), x_norm in [-1,1]
  // (note +y is up in pc; seam bows DOWN so y is negative at centre)
  // bead 0
  float x0 = a0 * halfSpan; float n0 = clamp(x0 / halfSpan, -1.0, 1.0);
  float y0 = -seamDrop * (1.0 - n0 * n0);
  float x1 = a1 * halfSpan; float n1 = clamp(x1 / halfSpan, -1.0, 1.0);
  float y1 = -seamDrop * (1.0 - n1 * n1);
  float x2 = a2 * halfSpan; float n2 = clamp(x2 / halfSpan, -1.0, 1.0);
  float y2 = -seamDrop * (1.0 - n2 * n2);
  float x3 = a3 * halfSpan; float n3 = clamp(x3 / halfSpan, -1.0, 1.0);
  float y3 = -seamDrop * (1.0 - n3 * n3);

  // overall gentle drift so the whole assembly breathes (phase-continuous)
  vec2 drift = vec2(sin(T * 0.13) * 0.02, sin(T * 0.097 + 1.1) * 0.02) * minS;

  bP0 = vec2(x0, y0) + drift;
  bP1 = vec2(x1, y1) + drift;
  bP2 = vec2(x2, y2) + drift;
  bP3 = vec2(x3, y3) + drift;

  // mass redistributes as beads fuse: a merged bead fattens slightly
  bR0 = R * (1.0 + 0.10 * g1);
  bR1 = R * (1.0 + 0.06 * g2 - 0.04 * g1);
  bR2 = R * (1.0 + 0.06 * g3 - 0.04 * g2);
  bR3 = R * (1.0 - 0.04 * g3);
  bK  = 0.62 * R;                                // smooth-min reach (necking)

  float d = field(pc);

  // --- hue: blend c0 (left end) -> c1 (right end) by arc position of the
  // nearest bead; pick the dominant bead via inverse-distance weights. ---
  float w0 = 1.0 / (0.0001 + dot(pc - bP0, pc - bP0));
  float w1 = 1.0 / (0.0001 + dot(pc - bP1, pc - bP1));
  float w2 = 1.0 / (0.0001 + dot(pc - bP2, pc - bP2));
  float w3 = 1.0 / (0.0001 + dot(pc - bP3, pc - bP3));
  float wsum = w0 + w1 + w2 + w3;
  // arc coordinate at this pixel (0 = left end, 1 = right end)
  float arc = (a0 * w0 + a1 * w1 + a2 * w2 + a3 * w3) / wsum;
  // also fold in the raw pixel x so the gradient reads across a fused slug too
  float hueT = clamp(0.5 * (arc * 0.5 + 0.5) + 0.5 * (pc.x / halfSpan * 0.5 + 0.5), 0.0, 1.0);
  hueT = smoothstep(0.0, 1.0, hueT);             // ease the ends apart
  vec3 beadCol = mix(c0, c1, hueT);

  // gradient of the field for the directional rim highlight + curvature
  float e = 1.6;
  float dxp = field(pc + vec2(e, 0.0)), dxn = field(pc - vec2(e, 0.0));
  float dyp = field(pc + vec2(0.0, e)), dyn = field(pc - vec2(0.0, e));
  vec2 g = vec2(dxp - dxn, dyp - dyn);
  vec2 nrm = g / max(length(g), 1e-4);
  // discrete Laplacian ~ curvature: necks (tight curvature) read hot
  float lap = (dxp + dxn + dyp + dyn - 4.0 * d);
  float curv = clamp(abs(lap) * 0.9, 0.0, 1.5);

  // --- compose ---
  vec3 bg  = vec3(0.035, 0.035, 0.043);
  float vig = 1.0 - 0.30 * smoothstep(0.40, 1.15, length(pc) / (0.5 * minS));
  vec3 col = bg * vig;

  // hair-thin faint seam filament in colour 3 (the cooling weld line)
  // distance from this pixel to the bowed seam curve (vertical approximation)
  float xn = clamp(pc.x / halfSpan, -1.0, 1.0);
  float seamY = -seamDrop * (1.0 - xn * xn) + drift.y;
  float inSpan = 1.0 - smoothstep(halfSpan * 0.98, halfSpan * 1.02, abs(pc.x - drift.x));
  float seamDist = abs(pc.y - seamY);
  float seamLine = (1.0 - smoothstep(0.0, 1.6 * pr, seamDist)) * inSpan;
  col += c3 * seamLine * 0.10;

  float aa = 1.4;
  float body = smoothstep(aa, -aa, d);

  // interior: dark liquid mirror; a colour-2 sheen along each bead's UPPER edge
  // as if lit by one implied lamp above (upper edge => normal points up, +y).
  // gate hard on up-facing surfaces so the necks/cusps don't catch the sheen
  // (which would carve dark icicle pockets between beads).
  float upper = smoothstep(0.15, 0.85, nrm.y);   // only clearly up-facing rim
  float nearTop = smoothstep(-3.0, -16.0, d);    // a band just inside the top edge
  float sheenBand = upper * nearTop;
  vec3 interior = bg * 0.86
                + c2 * 0.14 * sheenBand * u_sheen
                + beadCol * 0.018;
  col = mix(col, interior, body);

  // thin bright gradient-derived rim, brightest where curvature is tightest
  float lightAmt = max(dot(nrm, normalize(vec2(-0.30, 0.92))), 0.0);
  float specW = 0.28 + 0.72 * lightAmt * lightAmt;
  float rim = exp(-(d * d) / (2.2 * 2.2));
  float hotNeck = 1.0 + 1.6 * curv;              // necks glow hotter
  col += beadCol * rim * specW * hotNeck * 1.20;

  // a hot snap at the instant each gap fuses (bright bloom at the neck)
  // fusion instants ~ where each g rises through ~0.5: approx ph stamps below.
  float snap = (gauss(ph, 0.12, 0.018)
              + gauss(ph, 0.24, 0.018)
              + gauss(ph, 0.36, 0.018));
  col += c2 * rim * snap * 0.55 * u_sheen;
  // and the necks themselves catch the snap most
  col += beadCol * rim * curv * snap * 0.8;

  // very soft halo so the dark around the chain breathes a little
  float halo = exp(-max(d, 0.0) / (0.45 * R)) * (1.0 - body);
  col += beadCol * halo * 0.045;

  // --- depth-of-field background: soft defocused blobs of the same liquid format
  // drift behind the subject for depth + to fill the dark (replaces the backdrop),
  // gated behind the solid body so the subject stays crisp against the blur. ---
  vec3 dofBg = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + 1.0;
    vec2  seed = vec2(fract(sin(fi * 91.7) * 4373.0), fract(sin(fi * 47.3) * 9277.0));
    vec2  obp  = (seed - 0.5) * resC * 0.98;
    obp += vec2(sin(u_time * 0.15 + fi), cos(u_time * 0.12 + fi * 1.6)) * (0.5 * minS) * 0.12;
    float orad = (0.16 + 0.22 * fract(sin(fi * 23.1) * 1731.0)) * (0.5 * minS);
    float od   = length(pc - obp);
    float disc = smoothstep(orad, orad * 0.5, od);
    float ring = exp(-pow((od - orad * 0.9) / (orad * 0.16), 2.0));
    vec3  oc   = mix(mix(c0, c2, fract(sin(fi * 5.5) * 331.0)), c1, 0.30);
    dofBg += oc * (disc * 0.55 + ring * 0.85);
  }
  col += dofBg * 0.060 * (1.0 - body);

  // soft tone map keeps highlights hot without clipping, then dither
  col = 1.0 - exp(-col);
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
