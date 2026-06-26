// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// bloom (Rosette) — a flower iris filling the frame: instead of straight fibers,
// overlapping teardrop petal lobes whorl out of a dark central core in three
// offset rings, the way a dahlia or ranunculus packs its bloom. Each petal is a
// soft angular lobe with a luminous spine and a tapering tip; successive whorls
// are rotated half a petal and scaled larger so the lobes interleave and the
// frame fills to the corners with no dead sclera. Colour blends cyclically
// through the palette by angle; the whole bloom opens and closes on a slow
// sinusoidal breath, the core a dark protagonist with a glowing rim.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_petals;      // petals per whorl around the circle      (default 13)
uniform float u_curl;        // how much each petal sweeps tangentially  (default 0.35)
uniform float u_breathSpeed; // bloom open/close cycle rate              (default 0.06)
uniform float u_core;        // mean core radius, css px (×pixelRatio)   (default 90)

const vec3  BG   = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU  = 6.28318530718;
const float PI   = 3.14159265359;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// cheap hash → 0..1 (stable per integer index)
float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params against the unfed-uniform = 0.0 case so extremes/headless stay sane
  float petalCount = max(u_petals, 4.0);
  float curl       = clamp(u_curl, 0.0, 1.0);
  float breathRate = max(u_breathSpeed, 0.0);
  float coreMean   = max(u_core, 20.0) * pr;

  // --- polar coordinates centred on the bloom ---
  vec2  d    = fc - ctr;
  float ang  = atan(d.y, d.x);          // -PI..PI
  float rad  = length(d);
  float maxR = length(res) * 0.5;       // half-diagonal: outward==1 at the corner

  // --- the breathing bloom: long sinusoidal open/close, phase-continuous ---
  float breath = sin(t * breathRate * TAU);
  float coreR  = coreMean * (1.0 + 0.28 * breath);

  // radial coordinate from the core edge outward, 0..1 across the half-diagonal
  float rFromCore = rad - coreR;
  float outward   = clamp(rFromCore / max(maxR - coreR, 1.0), 0.0, 1.0);

  vec3  col       = BG;
  float petalLum  = 0.0;
  float colAngle  = ang;
  float spineLum  = 0.0;

  // slow bloom rotation (felt, not seen) + per-whorl curl that swings the petals
  float spin = t * 0.02;

  // ====================================================================
  // LAYERED-ROSE PETALS
  // Four concentric whorls (const loop bound — params cannot size loops).
  // Each whorl is a bright SCALLOPED rim: a ring whose radius waves in and
  // out with the petal angle, so the lit band reads as a row of overlapping
  // petal tips rather than a straight radial spoke. Successive whorls are
  // rotated half a petal and pushed outward so the scallops of one ring
  // nest into the gaps of the next, the way a rose or dahlia packs layers.
  // The petal body fills inward from each rim with a soft inner shade.
  // ====================================================================
  float petalEdge = 0.0; // tracks proximity to the winning petal rim, for a tip highlight
  for (int k = 0; k < 4; k++) {
    float fk    = float(k);
    // this whorl mean radius (outward units) and how scalloped the rim is
    float bandC = (0.18 + 0.24 * fk) * (1.0 + 0.07 * breath); // ring centre
    float scallop = 0.07 + 0.015 * fk;                        // petal-tip wave amplitude
    float bandW = 0.16 + 0.05 * fk;                           // petal body radial softness
    float rot   = fk * (PI / petalCount)                      // half-petal stagger
                + spin * (1.0 + fk * 0.25);
    // curl sweeps the whole whorl tangentially, growing with radius → soft spiral
    float swirl = curl * (0.5 + 0.8 * outward) * (0.4 + 0.4 * fk);

    // petal angle for this whorl, continuous around the ring
    float pang = (ang + rot + swirl);
    // the scalloped rim radius: waves outward at each petal tip, inward at seams
    float wave = cos(pang * petalCount);              // +1 at a tip, -1 at a seam
    float rimR = bandC + scallop * wave;

    // radial profile: a soft band hugging the wavy rim, with the petal body
    // filling inward and a faint dark seam just past the rim (overlap shadow)
    float rd   = (outward - rimR) / bandW;
    float body = exp(-rd * rd);                       // lit petal body around the rim
    // brighten the outward tip edge and shade the base for layered depth
    float tip  = (0.5 + 0.5 * wave);                  // 1 at tips, 0 at seams
    float env  = body * (0.45 + 0.55 * tip);

    // per-petal brightness variation so the bloom is not mechanically uniform
    float pidx = floor(pang / TAU * petalCount) + fk * 131.0;
    float pb   = 0.66 + 0.34 * hash11(pidx);

    float lum = env * pb;
    if (lum > petalLum) {
      petalLum = lum;
      // colour follows the petal angle of the winning whorl for a coherent wash
      colAngle = ang + rot;
      petalEdge = tip;                                // tip glow strength
      // brighter highlight right on the scalloped rim line
      spineLum = exp(-rd * rd * 4.0) * tip;
    }
  }
  // a luminous rim along the petal tips
  spineLum = max(spineLum, petalLum * petalEdge * 0.6);

  // petals only exist outside the core; fade in at the rim
  float coreMask = smoothstep(coreR - 2.0 * pr, coreR + 8.0 * pr, rad);
  // gentle far-soften so the very corners settle without going black
  float farSoft  = 1.0 - 0.35 * smoothstep(0.86, 1.0, outward);
  petalLum *= coreMask * farSoft;
  spineLum *= coreMask * farSoft;

  // ====================================================================
  // PALETTE: colour by angle, blending the four hues cyclically with a slow roll
  // ====================================================================
  float hue = (colAngle / TAU + 0.5) + 0.12 * outward + t * 0.01;
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 petalCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // RADIAL SHADING: brighter near the core, easing outward, slight limbus
  // ====================================================================
  float radialFall = mix(1.15, 0.32, smoothstep(0.0, 0.62, outward));
  // limbal darkening: dim the outer whorls so the bloom recedes into the dark
  // field at the edges instead of washing the whole frame mid-bright
  float limbus     = 1.0 - 0.62 * smoothstep(0.45, 1.0, outward);
  float shade      = radialFall * limbus;

  // ====================================================================
  // COMPOSE
  // ====================================================================
  // main petal body
  col += petalCol * petalLum * shade * 0.95;
  // luminous spine highlight down each petal
  col += petalCol * spineLum * shade * 0.5;
  // soft diffuse wash between petals so seams never read as black gaps
  float wash = coreMask * farSoft * 0.03 * (0.5 + 0.5 * radialFall);
  col += petalCol * wash;

  // ====================================================================
  // CORE: dark negative space with a luminous glowing rim (the protagonist)
  // ====================================================================
  float coreInner = 1.0 - smoothstep(coreR - 10.0 * pr, coreR, rad);
  col *= mix(1.0, 0.05, coreInner);                 // crush content inside the core
  // glowing rim that catches the breath
  float rim = exp(-pow((rad - coreR) / (7.0 * pr), 2.0));
  col += petalCol * rim * 0.55 * (0.7 + 0.3 * (0.5 + 0.5 * breath));
  // a faint stamen glow at the very centre so the core is not a flat void
  float stamen = exp(-pow(rad / (coreR * 0.55), 2.0));
  col += petalCol * stamen * 0.06 * (0.6 + 0.4 * (0.5 + 0.5 * breath));

  // settle the very corners so framing stays composed
  float vign = 1.0 - 0.42 * smoothstep(0.6, 1.18, rad / maxR);
  col *= vign;

  // gentle tone shaping to avoid blow-out while keeping luminous accents
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
