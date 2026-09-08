// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// deckle (Burnish) - a risograph print on uncoated stock, seen close. The
// paper carries the piece: long fibres laid in two directions, a cloudy
// mottle in the pulp, and a fine tooth speckle, all at css-pixel scale so the
// sheet keeps its grain at any size. Three flat ink layers are pulled through
// it one at a time: two solid shapes with fibre-rough edges and one drawn as
// a coarse halftone tone, each layer misregistered by a few pixels the way a
// riso drum drifts between passes. Ink multiplies over ink, so crossings go
// to the dense mixed tones of translucent riso colour, and the fibre tops
// show through every layer as pale flecks. Matte throughout: no bloom, no
// glow, the surface does the work. The shapes creep slowly and the
// registration breathes, so the print is never quite the same twice.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // ink shape scale, frame-relative       (default 1.0)
uniform float u_offset;   // misregistration between inks, css px  (default 6)
uniform float u_tooth;    // paper fibre and grain strength        (default 1.0)
uniform float u_ink;      // ink density                           (default 0.92)
uniform float u_drift;    // creep speed of the shapes             (default 0.12)

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

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.032;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// riso inks are translucent and a touch more saturated than the swatch
vec3 inkOf(vec3 c) {
  return clamp(mix(vec3(luma(c)), c, 1.25), 0.0, 1.0);
}

// paper fibre field at css-pixel scale q: two families of long thin fibres
// laid at different angles, returned centred on zero
float fibres(vec2 q) {
  vec2 a = vec2(0.97 * q.x + 0.26 * q.y, -0.26 * q.x + 0.97 * q.y);   // ~15 deg
  vec2 b = vec2(0.42 * q.x - 0.91 * q.y,  0.91 * q.x + 0.42 * q.y);   // ~65 deg
  // sparse: only the strongest fibres of each family show, the rest is pulp
  float f1 = vnoise(vec2(a.x * 0.08, a.y * 0.95) + 3.0);
  float f2 = vnoise(vec2(b.x * 0.10, b.y * 1.05) + 17.0);
  f1 = smoothstep(0.52, 0.80, f1);
  f2 = smoothstep(0.55, 0.82, f2);
  return f1 + f2 * 0.6 - 0.16;
}

// one ink layer: the low-frequency shape field for pass k at frame coords p
float shapeField(vec2 p, float k, float t) {
  vec2 o = vec2(k * 7.3, k * 3.9);
  return fbm(p + o + vec2(t * 0.05, -t * 0.04) * (0.7 + 0.3 * k));
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
  float t      = u_time * clamp(u_drift, 0.0, 2.0);
  float tooth  = clamp(u_tooth, 0.0, 2.0);
  float inkAmt = clamp(u_ink, 0.0, 1.0);
  float scl    = max(u_scale, 0.2) * 2.2;
  float regPx  = max(u_offset, 0.0) * pr;

  // css-pixel coordinates for everything that is a surface property
  vec2 q = fc / pr;

  // ---- the stock: warm cream tinted by the pale pole, with fibre, mottle, tooth
  vec3  stock  = mix(vec3(0.94, 0.905, 0.835), c2, 0.14);
  float fib    = fibres(q);
  float mottle = fbm(q * 0.011 + 5.0) - 0.5;
  float cloud  = fbm(q * 0.035 + 9.0) - 0.5;
  float speck  = hash21(floor(q * 0.85)) - 0.5;
  float paperL = 1.0 + tooth * (fib * 0.026 + speck * 0.03) + mottle * 0.12 + cloud * 0.05;
  vec3  paper  = stock * clamp(paperL, 0.6, 1.1);
  // the pale fibre tops that lift ink off the sheet
  float fibTop = smoothstep(0.30, 0.70, fib) * tooth;

  // ---- three ink passes, each misregistered on its own drifting offset
  vec2 reg0 = vec2( 0.0,  0.0);
  vec2 reg1 = vec2( 1.0, -0.55) + 0.25 * vec2(sin(t * 0.7), cos(t * 0.5));
  vec2 reg2 = vec2(-0.75, 0.85) + 0.25 * vec2(cos(t * 0.6), sin(t * 0.8));
  vec2 fc0 = fc + reg0 * regPx;
  vec2 fc1 = fc + reg1 * regPx;
  vec2 fc2 = fc + reg2 * regPx;
  // frame-relative shape coords, one per pass (anchored to uv so the shape
  // count holds tile to fullsize)
  vec2 p0 = vec2((fc0.x / res.x - 0.5) * aspect, fc0.y / res.y - 0.5) * scl;
  vec2 p1 = vec2((fc1.x / res.x - 0.5) * aspect, fc1.y / res.y - 0.5) * scl;
  vec2 p2 = vec2((fc2.x / res.x - 0.5) * aspect, fc2.y / res.y - 0.5) * scl;

  // edge roughness: ink bleeds along fibres and wobbles at the pulp scale
  float rough = (vnoise(q * 0.09 + 21.0) - 0.5) * 0.05
              + (vnoise(q * 0.35 + 63.0) - 0.5) * 0.02 + fib * 0.006;
  float aaW   = 0.012;

  // pass A: solid shape in the first pole
  float sA = shapeField(p0, 0.0, t) + rough;
  float covA = smoothstep(0.50 - aaW, 0.50 + aaW, sA);

  // pass B: the halftone pass, dot size driven by the shape field so the
  // layer reads as a tonal gradient that merges to solid at its heart.
  // 45 degree screen, cell in css px
  float sB = shapeField(p1, 1.0, t);
  float cell = 7.5;
  vec2  qh = fc1 / pr;
  vec2  g  = vec2(0.7071 * (qh.x + qh.y), 0.7071 * (qh.y - qh.x)) / cell;
  vec2  gf = fract(g) - 0.5;
  float dotR = clamp((sB - 0.38) / 0.30, 0.0, 1.0);
  dotR = dotR * (1.6 - 0.6 * dotR);                 // grow fast, then merge
  float dotAA = 1.0 / cell;
  float halft = smoothstep(dotR * 0.78 + dotAA, dotR * 0.78 - dotAA, length(gf));
  float solidB = smoothstep(0.64, 0.68, sB + rough);
  float covB = max(halft, solidB);

  // pass C: the fourth pole. Its own smaller solids, plus a keyline traced
  // round the first pass shape but pulled in this drum position, so the line
  // sits slipped off the fill: overlapping on one side, a sliver of bare
  // paper on the other. That slip is the riso signature.
  float sC = shapeField(p2 * 1.15, 2.0, t) + rough;
  float covC = smoothstep(0.55 - aaW, 0.55 + aaW, sC);
  float sK  = shapeField(p2, 0.0, t) + rough;
  float keyW = 0.016 + 0.006 * (vnoise(q * 0.05 + 44.0) - 0.5);
  float key = smoothstep(0.50 - keyW - aaW, 0.50 - keyW + aaW, sK)
            * smoothstep(0.50 + keyW + aaW, 0.50 + keyW - aaW, sK);
  covC = max(covC, key);

  // ---- ink density: uneven drum coverage, fibre tops lifting, tooth dropouts
  float unevenA = 0.80 + 0.20 * vnoise(fc0 / pr * 0.045 + 31.0);
  float unevenB = 0.80 + 0.20 * vnoise(fc1 / pr * 0.045 + 57.0);
  float unevenC = 0.80 + 0.20 * vnoise(fc2 / pr * 0.045 + 83.0);
  float lift    = 1.0 - 0.10 * fibTop;
  // ink grain: a fine soft speckle where the drum laid the ink thin
  float dropA   = 1.0 - 0.30 * tooth * smoothstep(0.58, 0.92, vnoise(fc0 / pr * 0.55 + 1.0));
  float dropB   = 1.0 - 0.30 * tooth * smoothstep(0.58, 0.92, vnoise(fc1 / pr * 0.55 + 2.0));
  float dropC   = 1.0 - 0.30 * tooth * smoothstep(0.58, 0.92, vnoise(fc2 / pr * 0.55 + 3.0));

  float dA = covA * inkAmt * unevenA * lift * dropA;
  float dB = covB * inkAmt * unevenB * lift * dropB;
  float dC = covC * inkAmt * unevenC * lift * dropC;

  vec3 inkA = inkOf(c0);
  vec3 inkB = inkOf(c1);
  vec3 inkC = inkOf(c3);

  // ---- multiply the passes down onto the sheet, in print order
  vec3 col = paper;
  col *= mix(vec3(1.0), inkA, dA);
  col *= mix(vec3(1.0), inkB, dB);
  col *= mix(vec3(1.0), inkC, dC);

  // the sheet itself is matte; a whisper of fibre relief on the inked areas
  col *= 1.0 + tooth * fib * 0.03 * (dA + dB + dC);

  gl_FragColor = vec4(col, 1.0);
}
