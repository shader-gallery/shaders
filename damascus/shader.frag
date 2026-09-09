// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// damascus (Burnish) - a slab of pattern-welded steel, etched and satin
// finished, filling the frame. Real damascus is a stack of two alternating
// steels forged into one billet; the smith then sinks grooves and dimples into
// the block and grinds it flat again, so the layers cut the surface like the
// contour lines of a landscape. The piece is built the same way: a height
// field for the ground surface (drawn-out noise for the wandering layers, a
// tilted comb of pressed grooves for the LADDER pattern, a staggered field of
// drilled dimples for the RAINDROP pattern), and the visible pattern is
// simply the layer index at that height, folded through a triangle wave and
// thresholded with slope-aware anti-aliasing. Bands bunch up into rungs where
// the grooves were, open into rings around each dimple, and dissolve into
// flowing wood-like grain elsewhere. Etching sinks the dark high-carbon
// layers a hair below the bright nickel ones, so every band edge carries a
// tiny lit and shadowed step from finite-difference relief normals. The
// bright layers get an anisotropic satin sheen along a fine grind, with one
// tall highlight sweeping the slab; the grind slowly deepens so the contours
// crawl across the steel, the whole thing on a 16 second loop.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_layers;   // layer count through the billet height   (default 36)
uniform float u_ladder;   // depth of the pressed ladder grooves      (default 0.7)
uniform float u_raindrop; // depth of the drilled raindrop dimples    (default 0.6)
uniform float u_sheen;    // satin highlight strength                 (default 1.0)
uniform float u_drift;    // grind crawl and light sweep speed        (default 0.3)

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + vec2(41.3, 17.9)));
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

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// ---- the ground surface of the billet, in layer units. Higher = more layers
// cut away. p is in frame units (about -2.4..2.4 across at default scale).
float billet(vec2 p, float layers, float ladder, float rain) {
  // the base stack was drawn out along x when forged, so the layer surface
  // wanders slowly across and faster up-down: anisotropic noise
  vec2  s = vec2(p.x * 0.55, p.y * 1.05);
  float f0 = fbm(s * 0.72 + 58.6);
  f0 = 0.5 + (f0 - 0.5) * 1.9;
  // plateaus: where the stack was ground nearly parallel to a layer, one
  // layer spans a wide island of the surface. Flatten the highs and lows of
  // the noise so the frame gets broad single-layer fields with the tight
  // banding packed between them, the way a real blade shows islands.
  float h = mix(f0, smoothstep(0.25, 0.75, f0), 0.8) * 0.82;
  h += (vnoise(p * 2.6 + 21.0) - 0.5) * 0.04;

  // LADDER: a tilted comb of grooves pressed into the hot billet. A gaussian
  // trough per period, wobbled slightly so the rungs are hand-made, and the
  // depth modulated by a broad field so parts of the slab stay plain grain.
  float ca = 0.9689, sa = 0.2474;                       // 14.3 degrees
  vec2  lp = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
  float lx = fract(lp.x * 0.62 + 0.035 * sin(lp.y * 2.3 + 1.0)) - 0.5;
  float groove = exp(-lx * lx * 70.0);
  float ladMask = smoothstep(0.28, 0.60, fbm(p * 0.33 + 8.0));
  h -= ladder * 0.34 * groove * ladMask;

  // RAINDROP: dimples drilled on a staggered grid, one per cell, each cell
  // read once (no neighbour gather). Some cells are skipped and every dimple
  // is jittered and sized on its own, so the rings never read as a lattice.
  vec2 rg = p * 0.72 + vec2(0.31, 0.17);
  rg.x += 0.5 * mod(floor(rg.y), 2.0);
  vec2 cell = floor(rg);
  vec2 f = fract(rg) - 0.5;
  vec2 rnd = hash22(cell + 7.0);
  float keep = step(0.42, hash21(cell + 3.1));
  vec2 c = (rnd - 0.5) * 0.30;
  float R = 0.26 + 0.12 * rnd.y;
  float d = length(f - c) / R;
  float bowl = max(1.0 - d * d, 0.0);
  bowl = bowl * bowl;
  h -= rain * 0.36 * bowl * keep;

  return h * layers;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float aspect = res.x / res.y;
  vec2  uv     = fc / res;
  float layers = clamp(u_layers, 8.0, 160.0);
  float ladder = clamp(u_ladder, 0.0, 1.5);
  float rain   = clamp(u_raindrop, 0.0, 1.5);
  float sheen  = clamp(u_sheen, 0.0, 2.0);
  float speed  = clamp(u_drift, 0.0, 2.0);

  // frame coordinates: the pattern count holds tile to fullsize
  float scl = 3.0;
  vec2  p   = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * scl;
  float px  = scl / res.y;                         // one device pixel in p units

  // 16 second loop: the grind deepens by four layers per cycle (the contours
  // crawl) and the light makes one full pass
  float T     = u_time * speed;
  float phase = T * 0.25;
  float sweep = sin(T * TAU / 16.0);

  // ---- the layer field and its pixel slope, by finite differences
  float e  = px * 1.25;
  float h  = billet(p, layers, ladder, rain) + phase;
  float hx = billet(p + vec2(e, 0.0), layers, ladder, rain) + phase;
  float hy = billet(p + vec2(0.0, e), layers, ladder, rain) + phase;
  float slope = (abs(hx - h) + abs(hy - h)) / 1.25;   // layers per pixel

  // ---- the etched pattern: bright nickel layer vs dark carbon layer. Fold
  // the layer index through a triangle wave and threshold at the midpoint
  // with a slope-sized edge, so bands stay crisp at one pixel and fade to a
  // mean grey rather than shimmering where they pack tighter than pixels.
  float aa = clamp(slope * 0.9, 0.012, 0.5);
  float triH  = abs(fract(h)  - 0.5) * 2.0;
  float triHx = abs(fract(hx) - 0.5) * 2.0;
  float triHy = abs(fract(hy) - 0.5) * 2.0;
  float bright  = smoothstep(0.5 - aa, 0.5 + aa, triH);
  float brightX = smoothstep(0.5 - aa, 0.5 + aa, triHx);
  float brightY = smoothstep(0.5 - aa, 0.5 + aa, triHy);
  // slightly uneven etch: some carbon bands bite deeper than others
  float bite = 0.7 + 0.6 * vnoise(p * 3.1 + floor(h) * 0.37);

  // etch relief: the dark layers sit a hair below the bright ones, so each
  // band edge is a tiny step. Normal from the finite differences of the mask.
  float depth = 1.6 * bite;
  vec3  n = normalize(vec3(-(brightX - bright) * depth, -(brightY - bright) * depth, 1.25));

  // ---- lighting: one lamp sweeping across the slab, a little above it
  vec3  lampPos = vec3(sweep * aspect * scl * 0.62, 0.28 + 0.22 * sweep * sweep, 1.35);
  vec3  toLamp = lampPos - vec3(p, 0.0);
  vec3  L = normalize(toLamp);
  // distance falloff so the lamp shapes the whole slab, near side bright
  float atten = 1.0 / (1.0 + 0.012 * dot(toLamp.xy, toLamp.xy));
  vec3  V = vec3(0.0, 0.0, 1.0);
  vec3  H = normalize(L + V);
  float diffFlat = clamp(L.z, 0.0, 1.0) * atten;
  float diffEtch = clamp(dot(n, L), 0.0, 1.0) * atten;

  // satin finish: fine grind lines at about 34 degrees, css-pixel scale
  vec2  q  = fc / pr;
  float ga = 0.8290, gs = 0.5592;
  vec2  g  = vec2(ga * q.x + gs * q.y, -gs * q.x + ga * q.y);
  float streak = vnoise(vec2(g.x * 0.012, g.y * 0.85) + 5.0) * 0.7
               + vnoise(vec2(g.x * 0.03,  g.y * 1.7) + 19.0) * 0.3 - 0.5;

  // anisotropic sheen: the highlight is stretched ACROSS the grind, so with
  // diagonal grind lines it is a slanted band that walks left to right.
  vec3  Tdir = vec3(-gs, ga, 0.0);                    // across the grind
  vec3  Bdir = vec3(ga, gs, 0.0);                     // along the grind
  float hT = dot(H, Tdir), hB = dot(H, Bdir), hN = max(H.z, 0.05);
  float ward = exp(-(hT * hT / 0.36 + hB * hB / 0.012) / (hN * hN));
  float spec = ward * (0.8 + 0.5 * streak) * sheen;
  // a tighter core inside the broad sheen
  float core = exp(-(hT * hT / 0.08 + hB * hB / 0.004) / (hN * hN)) * sheen;

  // ---- materials, built as greys and tinted by the palette
  float lumAcc = luma(c0);
  vec3  tintPale = mix(vec3(luma(c2)), c2, 0.55);
  vec3  tintDeep = mix(vec3(luma(c3)), c3, 0.6);
  // bright nickel layer: satin steel, a soft reflected gradient, grind streaks
  vec3  steel = mix(vec3(0.44), tintPale, 0.22);
  steel *= 0.84 + 0.16 * uv.y + 0.16 * streak;
  steel *= 0.66 + 0.55 * diffFlat;
  // low mottle of polish so the flat is not one value
  steel *= 0.94 + 0.12 * fbm(p * 0.9 + 40.0);
  // the sheen: pale core, temper-colour fringe from the first pole
  vec3  sheenCol = mix(c0 * (0.5 + 0.5 * lumAcc), mix(vec3(1.0), c2, 0.3), clamp(spec, 0.0, 1.0));
  steel += sheenCol * spec * 0.9 + vec3(1.0) * core * 0.3;

  // dark carbon layer: etched matte black with the deep pole bled into it,
  // the relief step lit on the lamp side and shadowed on the far side
  vec3  carbon = mix(vec3(0.07), tintDeep, 0.28) * bite;
  carbon *= 0.55 + 0.9 * diffEtch;
  carbon += sheenCol * spec * 0.08;

  // the step itself: brighten where the bright band edge faces the lamp,
  // darken the carbon floor right under the bright shoulder
  float edgeLit = clamp(diffEtch - diffFlat, -1.0, 1.0);
  vec3  col = mix(carbon, steel, bright);
  col *= 1.0 + 0.9 * edgeLit;

  // dense regions (many layers per pixel) read as a soft grey haze in real
  // damascus; the AA already averages them, add a touch of the sheen there
  float dense = smoothstep(0.35, 0.9, slope);
  col += dense * spec * 0.10;

  // seat the slab: slight vignette and a whisper of the deep pole at the edges
  vec2  vq = uv - 0.5;
  float vig = smoothstep(0.35, 1.0, length(vq) * 1.4);
  col = mix(col, col * 0.84 + tintDeep * 0.02, vig);

  gl_FragColor = vec4(col, 1.0);
}
