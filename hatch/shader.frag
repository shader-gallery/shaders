// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// hatch (Burnish) — a full-bleed crosshatch engraving. Two fine sets of parallel
// lines at opposing diagonals (plus a sparse third set that only appears in the
// deepest tones) read as the tonal shading of a plume of smoke that is never
// itself drawn: an invisible FBM "ghost field" modulates each line's weight and
// gap, so density alone carves the form. The hatching never moves — only its ink
// weight breathes as the hidden field drifts. A low raking light sweeps across
// the static engraving like a coin tilted under lamplight, and the line tint
// shifts subtly through the palette with the ghost field's local density,
// keeping the rainbow buried inside the linework.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;    // speed of the invisible plume's drift   (default 0.35)
uniform float u_spacing;  // hatch line gap in CSS px                (default 7)
uniform float u_ink;      // how strongly the ghost field carves     (default 0.8)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float RAKE_CSS    = 520.0;  // wavelength of the raking-light luminance ramp

// --- value-noise FBM (no textures; hash-based) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  // constant loop bound (GLSL ES 1.00)
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.7, 5.3);
    amp *= 0.5;
  }
  return v; // ~0..1
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// One hatch set: parallel lines along direction `dir`, gap `spacing` (px),
// each line's ink coverage gated by `weight` (0 = no line, 1 = full). Returns a
// soft anti-aliased coverage 0..1. The lattice itself is static in screen space.
float hatchSet(vec2 fc, vec2 dir, float spacing, float weight, float aa) {
  // signed coordinate perpendicular to the line direction
  float u = dot(fc, vec2(-dir.y, dir.x));
  // distance to the nearest line centre, in px
  float d = abs(fract(u / spacing - 0.5) - 0.5) * spacing;
  // half-thickness scales with desired weight: thin strokes when ghost is light,
  // fat strokes (which can even merge into solid mass) when ghost is dark.
  float ht = weight * spacing * 0.5;
  // coverage: 1 inside the stroke, smooth falloff over `aa` px at the edge
  return 1.0 - smoothstep(ht - aa, ht + aa, d);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // --- the invisible ghost field: an FBM plume that drifts but is never drawn ---
  // Domain in CSS-ish units (divide out pr so the form is DPR-independent).
  // Larger denominator -> bigger, more readable smoke masses.
  vec2 q = (fc - ctr) / (pr * 255.0);
  // phase-continuous translation: up and sideways, never wrapping.
  vec2 flow = vec2(0.18, 0.62) * (t * u_drift * 0.45);
  // three octave layers offset so the plume billows and re-forms organically;
  // the extra finer layer seeds MORE, more-frequent lit clusters across the frame
  // (the Phase-3 ask: more of the frame must carry weight, not two corner blooms).
  float g = fbm(q + flow);
  g = mix(g, fbm(q * 1.7 - flow * 0.7 + vec2(3.1, 1.2)), 0.5);
  g = mix(g, fbm(q * 2.9 + flow * 0.45 + vec2(7.4, 2.8)), 0.28);
  // shape into a smoky tonal field 0..1 (0 = light paper, 1 = deep shadow); the
  // lower thresholds push more area up into the lit/dense band so clusters recur
  // across the whole frame rather than huddling at two edges.
  float tone = smoothstep(0.24, 0.84, g);

  // INK controls how hard the ghost carves: low -> faint near-uniform hatching,
  // high -> deep chiaroscuro (bare highlights, heavy black masses). It both
  // expands the tonal contrast and (below) fattens the darkest strokes.
  float ink = clamp(u_ink, 0.0, 2.0);
  // contrast pivot around the field mean: low ink compresses toward a flat mid
  // grey (uniform faint hatch); high ink stretches to bare-paper / solid-black.
  float contrast = 0.28 + ink * 2.05;            // ~0.69 .. ~3.36
  float shade = clamp(0.44 + (tone - 0.5) * contrast, 0.0, 1.0);

  // hatch gap in device px (css-px semantics, scaled by pr); guard the slider min
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 1.0) * refScale * pr;
  float aa = pr * 0.9;

  // Per-set line weight from the shade. First set fades in over the lighter half,
  // the second crosshatch over the mid-darks, the third sparse set only in the
  // very deepest tones — classic engraving tonal build-up.
  float w1 = smoothstep(0.18, 0.70, shade);                 // primary diagonal
  float w2 = smoothstep(0.46, 0.96, shade);                 // crossing diagonal
  float w3 = smoothstep(0.80, 1.00, shade) * 0.85;          // sparse third set

  // map weight (0..1) to a stroke fraction of the gap: thin lines that thicken
  // and finally merge into heavy mass in the darkest shade. High ink widens the
  // peak stroke so dark masses fill toward solid black; low ink keeps every
  // stroke hairline (near-uniform faint hatch).
  float fatten = 0.26 + ink * 0.26;              // peak stroke fraction
  float f1 = w1 * fatten;
  float f2 = w2 * fatten;
  float f3 = w3 * (fatten + 0.04);

  // two opposing ~45 degree diagonals form the X cross-weave; a steeper third
  // set at a wide, irregular gap reinforces only the deepest tones without
  // tessellating into a regular mesh.
  vec2 dirA = normalize(vec2( 1.0,  1.0));
  vec2 dirB = normalize(vec2(-1.0,  1.0));
  vec2 dirC = normalize(vec2( 0.45, 1.0));

  float hA = hatchSet(fc, dirA, spacing,        f1, aa);
  float hB = hatchSet(fc, dirB, spacing,        f2, aa);
  float hC = hatchSet(fc, dirC, spacing * 2.3,  f3, aa);

  // total ink coverage (union of the three sets), 0 = bare paper, 1 = full black
  float coverage = 1.0 - (1.0 - hA) * (1.0 - hB) * (1.0 - hC);

  // --- palette fallback (headless contexts can leave the array zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // line tint shifts through the palette with the ghost field's local density —
  // rainbow stays buried inside the linework, never a wash. Keep the spatial
  // sweep gentle and the tone coupling small so each region holds one or two
  // neighbouring hues rather than the whole spectrum at once.
  float k  = tone * 0.9 + dot(fc - ctr, vec2(0.00018, 0.00026)) / pr + t * 0.010;
  float s  = fract(k) * 4.0;
  float w0p = wheelW(s, 0.0), w1p = wheelW(s, 1.0), w2p = wheelW(s, 2.0), w3p = wheelW(s, 3.0);
  vec3  ink_col = (c0*w0p + c1*w1p + c2*w2p + c3*w3p) / max(w0p+w1p+w2p+w3p, 0.001);

  // --- raking light: a low light from one edge whose bearing precesses a full
  // slow circle over the loop, adding a gentle luminance gradient across the
  // static engraving (the only thing that "moves"). ---
  float bearing = t * 0.18; // precesses; full circle ~ loop
  vec2  lightDir = vec2(cos(bearing), sin(bearing));
  float ramp = dot((fc - ctr) / (RAKE_CSS * pr), lightDir);
  float rake = 0.5 + 0.5 * ramp;        // 0..1 luminance gradient
  rake = clamp(rake, 0.0, 1.0);
  // sheen: a narrow bright band where the raking light grazes — the rare glint
  float sheen = exp(-pow((ramp) * 1.6, 2.0));

  // The ink itself is luminous (etched metal catching light). Brightness of the
  // linework is driven by the raking light, so the sheen sweeps across. Denser
  // (darker-tone) regions glow a little harder so the smoke mass reads, while
  // the floor stays low so bare paper sits near-black and only the grazed band
  // glints.
  float dens = smoothstep(0.10, 0.85, shade);
  // brighter raking floor (the dim side no longer falls to near-black) and a
  // higher base density-glow so even the faint background hatch carries colour.
  float lumin = mix(0.36, 1.08, rake) * mix(0.74, 1.58, dens) + sheen * 0.9;

  // compose: dark engraving on near-black, glow only in the inked lines
  vec3 line = ink_col * lumin;
  col = mix(col, line, coverage);

  // a whisper of bloom along the ink so it reads as catching light, gated by the
  // sheen so glints punctuate the orbit
  col += ink_col * coverage * sheen * 0.18 * (0.4 + rake);

  // gentle vignette keeps the frame composed
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.72, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
