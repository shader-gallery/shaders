// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// facet (Rosette) — a kaleidoscope jewel. The angle around screen centre is
// mirror-folded into N wedges and a slowly drifting two-to-three-octave FBM glow
// field is sampled in the folded space, so soft luminous lobes repeat with
// perfect n-fold symmetry. Brightest where mirrored features kiss along the fold
// seams, fading into a near-black base toward the corners via a gentle vignette.
// The source field drifts on an unbounded straight path (FBM never wraps), so the
// symmetric blooms continuously merge, split, and bloom along the seams with no
// cycle and no possible reset frame; the fold frame itself also turns imperceptibly.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_folds;    // number of mirror wedges in the kaleidoscope (default 8)
uniform float u_drift;    // speed the source glow field slides beneath the folds (default 0.22)
uniform float u_feature;  // characteristic FBM blob size in CSS px (default 320)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU         = 6.2831853;
const float FRAME_SPIN  = 0.015;  // imperceptibly slow turn of the fold frame (rad/s)

// --- value-noise + FBM (no textures; hash-based) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// three-octave FBM with a small rotation between octaves to avoid axis artefacts
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = rot * p * 2.02 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // centred coords, normalised so the shorter screen axis is the jewel diameter
  float minDim = min(res.x, res.y);
  vec2  p      = (fc - ctr) / minDim;   // ~[-0.5..0.5] on the short axis
  float r      = length(p);
  float ang    = atan(p.y, p.x);

  // --- mirror-fold the angle into N wedges (kaleidoscope) ---
  // guard folds so the slider's whole range is safe (never 0 -> div-by-zero)
  float folds  = max(u_folds, 1.0);
  float wedge  = TAU / folds;
  // slow turn of the fold frame, felt rather than seen
  float fang   = ang + t * FRAME_SPIN;
  // fold to [0, wedge] then mirror about its centre -> seam at the wedge edges
  float a      = mod(fang, wedge);
  a            = abs(a - wedge * 0.5);

  // Theme colours from u_palette with the house fallback (headless contexts can
  // leave the vec3[] zeroed; fall back to midnight so a poster never renders black).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // --- cut-gem faceting in the folded (angle, radius) space ----------------
  // The jewel is partitioned into hard diamond facets: concentric facet rings,
  // each subdivided into angular wedgelets, with alternate rings half-offset so
  // cells read as cut diamonds. Each facet is one FLAT crystal face — a hashed
  // normal catching a slowly-turning raking light — and the cut lines between
  // facets glint sharp and bright. No soft FBM glow: this is the hard, angular
  // member of the pair, vs mandala's soft floral petals.
  float refScale  = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float featurePx = max(u_feature, 1.0) * refScale * pr;
  // facet ring count scales inversely with feature size (smaller feature = more,
  // finer facets). Floored so the gem never collapses to one ring.
  float rings = max(floor((minDim * 0.9) / featurePx), 3.0);

  float rr = r * rings;              // radius in facet-ring units
  float ri = floor(rr);
  float rf = fract(rr);

  // wedgelets per folded half-wedge; alternate rings brick-offset for diamonds
  const float ANGFAC = 3.0;
  float aw  = a / max(wedge * 0.5, 1e-4);     // 0..1 across the folded half-wedge
  float off = mod(ri, 2.0) * 0.5;
  float au  = aw * ANGFAC + off;
  float ai  = floor(au);
  float af  = fract(au);

  vec2  cid = vec2(ai, ri) + 17.0;            // facet cell id (folded space)

  // flat-facet shading: hashed surface normal + a low raking light whose angle
  // wanders, so neighbouring facets sit a stop apart and twinkle as light moves.
  vec2  tilt = (vec2(hash21(cid * 1.91), hash21(cid * 2.73 + 5.0)) - 0.5) * 1.7;
  vec3  nrm  = normalize(vec3(tilt, 1.0));
  float la   = t * (0.10 + 0.25 * max(u_drift, 0.0)) + 0.7 * sin(t * 0.05);
  vec3  L    = normalize(vec3(cos(la), sin(la), 0.55));
  float dif  = clamp(dot(nrm, L), 0.0, 1.0);
  float spark = pow(dif, 3.0);                 // tight crystal glint per facet

  // per-facet hue: flat across the cell (constant), rolling with ring + a hash
  float kk  = hash21(cid * 0.53) * 0.6 + ri / max(rings, 1.0) * 1.3 + t * 0.012;
  float s   = fract(kk) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  faceCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // sharp cut lines: distance to the nearest facet border, AA'd to a thin glint
  float angPx = max(wedge * 0.5 / ANGFAC * r * minDim, 1.0); // facet ang. width, px
  float ew    = 1.6 / max(angPx, 1.0);
  float edgeA = min(af, 1.0 - af);
  float edgeR = min(rf, 1.0 - rf);
  float cut   = (1.0 - smoothstep(0.0, 0.10 + ew, edgeA))
              + (1.0 - smoothstep(0.0, 0.10 + ew, edgeR));
  cut = clamp(cut, 0.0, 1.0);

  // radial vignette so the gem fills a 16:9 hero, dark toward the corners
  float vign = 1.0 - smoothstep(0.42, 1.02, r);

  // per-facet value: many faces sit deep in shadow, a few catch the light, so
  // the jewel reads as cut crystal with depth — not a flat stained-glass wheel.
  float facetVal = 0.25 + 0.75 * hash21(cid * 3.17 + 9.0);

  // compose: DARK flat crystal faces (dim base, strong per-facet light contrast),
  // then sharp cut-line glints and tight sparkles as the bright accents on top.
  vec3 face = faceCol * (0.045 + 0.42 * dif * dif + 0.55 * spark) * facetVal;
  col += face * vign;
  // cut lines catch the light — near-white only where a facet actually sparkles
  vec3 cutCol = mix(faceCol, vec3(0.95, 0.96, 1.0), 0.35 + 0.45 * spark);
  col += cutCol * cut * (0.10 + 0.85 * spark) * vign;

  // a tight central table facet so the core reads as the jewel's culet
  float core = exp(-r * r * 16.0);
  col += mix(faceCol, vec3(1.0), 0.3) * core * (0.18 + 0.5 * spark);

  // soft-knee tone map keeps the brightest sparkles from clipping to flat white
  col = BG + (1.0 - exp(-(col - BG) * 1.25));

  gl_FragColor = vec4(col, 1.0);
}
