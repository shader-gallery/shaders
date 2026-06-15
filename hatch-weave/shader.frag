// hatch-weave (Burnish) - Hatch Weave variation: woven tartan plaid.
// Full description in meta.json. (Keep comments ASCII-only here; see meta.)
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) - unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;    // speed of the invisible plume drift   (default 0.35)
uniform float u_spacing;  // hatch line gap in CSS px                (default 7)
uniform float u_ink;      // how strongly the ghost field carves     (default 0.8)
uniform float u_rotate;   // weave rotation in degrees               (default 0)
uniform float u_skew;     // weave shear along x per unit y          (default 0)
uniform float u_shade;    // light/dark depth of the ghost shading   (default 1)
uniform float u_tint;     // hue gradient swept across the weave     (default 0)

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

vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

// One hatch set: parallel lines along direction `dir`, gap `spacing` (px),
// each line ink coverage gated by `weight` (0 = no line, 1 = full). Returns a
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

  // --- palette fallback (headless contexts can leave the array zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- TARTAN plaid: broad colour bands (the "sett") run along each axis and
  // cross into checked squares; a fine over-under weave rides on top as a
  // luminance texture so the cloth shows its thread without collapsing into a
  // dot grid. The drifting ghost field lights and shades the whole bolt. ---

  // weave-space coordinate: rotate and shear the whole lattice about the centre
  // so the plaid can hang on a bias or lean, while the ghost-field light below
  // stays fixed in screen space (the cloth turns, the light does not).
  vec2 rel = fc - ctr;
  float ang = radians(u_rotate);
  float ca = cos(ang), sa = sin(ang);
  rel = mat2(ca, -sa, sa, ca) * rel;
  rel.x += rel.y * u_skew;
  vec2 wfc = rel + ctr;

  // band coordinates: quantise into coarse stripes; a short period repeats the
  // sett like a real tartan, and each band takes a flat hue from the wheel.
  float bw = spacing * 7.0;                       // band width in px
  float bandx = floor(wfc.x / bw);
  float bandy = floor(wfc.y / bw);
  float kx = fract(bandx * 0.2 + 0.05);           // ~5-band repeating hue run
  float ky = fract(bandy * 0.2 + 0.55);
  // a smooth hue gradient swept across the whole bolt; u_tint scales how far the
  // colour wheel travels corner-to-corner, so the flat sett picks up a directional
  // wash (0 = the original banded-only hue, higher = a rolling rainbow across cloth).
  float hgrad = dot((wfc - ctr) / min(res.x, res.y), vec2(1.0, 0.7)) * u_tint;
  vec3 colX = wheelCol(kx + tone * 0.12 + t * 0.01 + hgrad, c0, c1, c2, c3);   // vertical yarn
  vec3 colY = wheelCol(ky + tone * 0.12 + t * 0.01 + hgrad, c0, c1, c2, c3);   // horizontal yarn

  // over-under parity per thread cell tips each check toward warp or weft yarn,
  // so crossing bands read as woven checks rather than a flat colour average.
  vec2 wcell = floor(wfc / spacing);
  float topw = mod(wcell.x + wcell.y, 2.0);
  vec3 cloth = mix(colX, colY, mix(0.5, topw, 0.55));

  // fine weave: a soft thread ripple along each axis, the topmost yarn showing,
  // this is the woven TEXTURE, carried in luminance only so colour stays banded.
  float thx = 0.5 + 0.5 * cos(6.2831853 * wfc.x / spacing);
  float thy = 0.5 + 0.5 * cos(6.2831853 * wfc.y / spacing);
  float weaveTex = mix(thx, thy, topw);           // 0..1 over-under ripple

  // thin darker sett lines at the band edges give the plaid crisp definition.
  float ex = smoothstep(0.0, 0.06, min(fract(wfc.x / bw), 1.0 - fract(wfc.x / bw)));
  float ey = smoothstep(0.0, 0.06, min(fract(wfc.y / bw), 1.0 - fract(wfc.y / bw)));
  float settLines = 0.62 + 0.38 * min(ex, ey);

  // --- raking light: a low light whose bearing precesses a slow circle over the
  // loop, sweeping a soft luminance gradient and a rare grazing glint. ---
  float bearing = t * 0.18;
  vec2  lightDir = vec2(cos(bearing), sin(bearing));
  float ramp = dot((fc - ctr) / (RAKE_CSS * pr), lightDir);
  float rake = clamp(0.5 + 0.5 * ramp, 0.0, 1.0);
  float sheen = exp(-pow(ramp * 1.6, 2.0));

  // light the cloth: raking gradient * tone (ghost-field shading) * woven thread
  // ripple * sett gridlines, with a grazing sheen on top. ink modulates contrast.
  float dens = smoothstep(0.08, 0.9, shade);
  // u_shade scales the chiaroscuro spread: 0 flattens the cloth to even light,
  // 1 is the original ghost shading, higher drives deep darks and bright lights.
  float chiar = clamp(dens * (0.6 + 0.4 * ink) * u_shade, 0.0, 1.0);
  float toneLight = mix(1.12, 0.46, chiar);  // shade darkens
  float lumin = mix(0.66, 1.2, rake) * toneLight * (0.66 + 0.46 * weaveTex) * settLines;
  vec3 ink_col = cloth;                            // (named for the bloom tail)
  col = cloth * lumin + cloth * sheen * 0.45;

  // a whisper of extra bloom where the light grazes the weave
  col += ink_col * sheen * 0.16 * (0.4 + rake);

  // gentle vignette keeps the frame composed
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.78, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
