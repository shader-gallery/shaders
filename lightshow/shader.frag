// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// lightshow (Bloom) - a 1960s liquid light show: coloured oil and dyed water
// pressed between two glass plates on an overhead projector, thrown onto the
// wall. The oil rides the plate as blooming translucent lenses that drift,
// swell, touch and fuse; where two dyes overlap the light passes through both
// films and goes to a deeper mixed colour; where a lens edge bends the light
// there is a bright meniscus rim and a soft halo of thrown colour.
// Built without any cell gather: four dyes, each a smooth-min union of four
// discs on slow Lissajous orbits, so same-dye blobs merge into amoebas with a
// single soft outline while different dyes simply overlap. Each blob is given
// a rounded dome thickness; the projector light is attenuated in log space
// through the base-dyed water and through every film it crosses (oil displaces
// the dark water, so a lens is brighter than the ground around it), and the
// thickness gradient by finite differences lights the rim like a lens edge.
// The plate itself rotates slowly on the wheel, the dyes convect in fbm
// mottle, a scatter of tiny air bubbles rides the water, and the lamp breathes.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;   // orbit and wheel speed                    (default 0.35)
uniform float u_size;    // blob radius scale                        (default 1.0)
uniform float u_merge;   // how readily same-dye blobs fuse          (default 0.5)
uniform float u_dye;     // dye density: pale gels to deep saturated (default 1.0)
uniform float u_lamp;    // projector brightness and hotspot         (default 1.0)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;

vec3 c0, c1, c2, c3;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// polynomial smooth minimum: two discs within k of each other grow a neck
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// signed distance to the fused union of the four discs of dye group g, at
// plate point p. Disc n of 16 starts in its own stratified cell of a 4x4 grid
// (the index permuted so one dye is spread across the plate, not clumped)
// and rides a slow Lissajous orbit from there, its radius breathing.
float dyeField(vec2 p, float g, float t, float aspect, float sizeS, float k) {
  float d = 1e3;
  for (int i = 0; i < 4; i++) {
    float n  = g * 4.0 + float(i);
    float m  = mod(n * 5.0 + 3.0, 16.0);          // permuted grid slot
    vec2  cell = vec2(mod(m, 4.0), floor(m / 4.0));
    float h0 = hash11(n + 1.0), h1 = hash11(n + 9.0);
    float h2 = hash11(n + 17.0), h3 = hash11(n + 25.0);
    vec2  base = ((cell + 0.5 + (vec2(h0, h1) - 0.5) * 0.6) / 4.0 * 2.0 - 1.0)
               * vec2(aspect * 1.05, 1.0);
    vec2  amp  = vec2(0.30 + 0.30 * h2, 0.25 + 0.25 * h3);
    vec2  orb  = vec2(sin(t * (0.21 + 0.13 * h0) + h1 * TAU),
                      cos(t * (0.17 + 0.11 * h1) + h2 * TAU)) * amp;
    float r    = (0.22 + 0.26 * h3) * sizeS;
    r *= 1.0 + 0.16 * sin(t * (0.3 + 0.2 * h2) + h0 * TAU);
    float di = length(p - base - orb) - r;
    d = smin(d, di, k);
  }
  return d;
}

// lens dome thickness from the signed distance: a circular meniscus profile
// that rises steeply at the outline and flattens across the body
float dome(float d, float edge) {
  float inside = clamp(-d / edge, 0.0, 1.0);
  return sqrt(inside * (2.0 - inside));
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float sizeS  = clamp(u_size, 0.3, 2.0);
  float k      = 0.04 + 0.42 * clamp(u_merge, 0.0, 1.0);
  float dyeK   = clamp(u_dye, 0.2, 2.0);
  float lampK  = clamp(u_lamp, 0.0, 2.0);

  // wall coords, half height = 1
  vec2 q = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;

  // the pointer, when present, nudges the plate a little (zero at rest)
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 pPlate = q - m * 0.12 * mAmt;

  // the wheel turns: the whole plate rotates slowly about a point off centre
  vec2 pivot = vec2(0.12 * aspect, -0.08);
  vec2 p = rot(t * 0.045) * (pPlate - pivot) + pivot;

  // convection: a soft warp so the lens outlines are never true circles
  vec2 wq = vec2(fbm(p * 0.9 + vec2(t * 0.05, -t * 0.03)),
                 fbm(p * 0.9 + vec2(4.7, 2.3) - vec2(t * 0.04, t * 0.06))) - 0.5;
  p += wq * 0.18;

  // ---- the projector: a soft hotspot on the wall, breathing lamp
  float breathe = 1.0 + 0.04 * sin(u_time * 0.7) + 0.02 * sin(u_time * 2.3);
  vec2  hs = q - vec2(0.15, 0.1);
  float hotspot = exp(-dot(hs, hs) * 0.35);
  vec3  lampCol = vec3(1.0, 0.975, 0.94);                    // incandescent
  vec3  light = lampCol * (0.55 + 0.75 * hotspot) * breathe * lampK;

  // ---- the base-dyed water: a deep tint built from the first pole with a
  // little of the fourth, kept dark so the oil lenses read as light. Mottle
  // from convection.
  vec3  waterDye = mix(c0, c3, 0.22);
  float lumaW = dot(waterDye, vec3(0.299, 0.587, 0.114));
  waterDye = mix(vec3(lumaW), waterDye, 0.88);                // desaturate a touch
  float mottle = fbm(p * 1.6 + vec2(-t * 0.07, t * 0.05)) - 0.5;
  vec3  waterT = clamp(waterDye * (0.24 + 0.16 * mottle) + 0.02, 0.01, 1.0);
  vec3  logT   = log(waterT);                                   // water attenuation

  // ---- four dyes: field, dome thickness, gradient, then attenuate in log
  // space. Oil displaces the dark water, so where a lens sits the water term
  // is removed and the film term takes over.
  float e = 0.012;
  float coverAll = 0.0;       // 1 - product(1 - h_g): how much water is displaced
  vec3  filmLog  = vec3(0.0);
  float rim      = 0.0;
  vec3  rimCol   = vec3(0.0);
  vec3  halo     = vec3(0.0);
  float inner    = 0.0;
  float edgeW    = 0.19 * sizeS;

  for (int g = 0; g < 4; g++) {
    float gf = float(g);
    vec3 dye = c0;
    dye = mix(dye, c1, step(0.5, gf));
    dye = mix(dye, c2, step(1.5, gf));
    dye = mix(dye, c3, step(2.5, gf));
    // gels are a touch more saturated than the swatch
    float lum = dot(dye, vec3(0.299, 0.587, 0.114));
    vec3  gel = clamp(mix(vec3(lum), dye, 1.05), 0.03, 1.0);

    // each dye has its own slight plate wobble so outlines do not share edges
    vec2 pg = p + 0.05 * vec2(sin(p.y * 2.3 + gf * 1.7 + t * 0.2),
                              cos(p.x * 2.1 - gf * 2.9 + t * 0.17));
    float d  = dyeField(pg, gf, t, aspect, sizeS, k);
    float dx = dyeField(pg + vec2(e, 0.0), gf, t, aspect, sizeS, k);
    float dy = dyeField(pg + vec2(0.0, e), gf, t, aspect, sizeS, k);
    float h  = dome(d, edgeW);
    float hx = dome(dx, edgeW);
    float hy = dome(dy, edgeW);
    float slope = length(vec2(hx - h, hy - h)) / e;

    // the oil is not a uniform slab: convection thins and pools it, so the
    // body of every lens carries paler and deeper zones that slowly move
    float thkVar = vnoise(pg * 1.3 + gf * 7.1 + vec2(t * 0.05, -t * 0.03)) * 0.7
                 + vnoise(pg * 3.1 + gf * 3.3 - vec2(t * 0.04, t * 0.02)) * 0.3;
    // film attenuation: thicker oil, deeper colour. log(gel) is negative.
    float thick = h * (0.35 + 0.65 * h) * dyeK * (0.5 + 1.1 * thkVar);
    filmLog += log(gel) * thick * 1.1;
    coverAll = 1.0 - (1.0 - coverAll) * (1.0 - h);

    // meniscus: the steep outer skirt of the dome bends light into a bright
    // rim; the shoulder just inside it goes a little dark (the lens shadow)
    float skirt = smoothstep(0.0, 1.0, h) * (1.0 - smoothstep(0.55, 1.0, h));
    float rimG  = clamp(slope * 0.17, 0.0, 1.0) * skirt;
    rim   += rimG;
    rimCol += mix(gel, vec3(1.0), 0.55) * rimG;
    inner += smoothstep(0.45, 0.95, h) * (1.0 - smoothstep(0.85, 1.0, h)) * 0.5;

    // thrown halo outside the outline: soft colour bloom on the wall
    float outD = max(d, 0.0);
    halo += gel * exp(-outD * 4.5) * (1.0 - h) * 0.6;
  }

  // water is only where there is no oil; films stack multiplicatively
  vec3 T = exp(logT * (1.0 - coverAll) + filmLog);

  // ---- tiny air bubbles riding the water: sparse, bright ring, dark centre
  float pr = max(u_pixelRatio, 0.5);
  vec2  bq = (rot(t * 0.045) * (pPlate - pivot)) * 90.0 + vec2(t * 1.5, t * 0.6);
  vec2  bi = floor(bq), bf = fract(bq) - 0.5;
  float bh = hash21(bi + 7.0);
  vec2  bc = (vec2(hash21(bi + 3.0), hash21(bi + 11.0)) - 0.5) * 0.5;
  float br = 0.07 + 0.10 * hash21(bi + 19.0);
  float bd = length(bf - bc) - br;
  float bubble = step(bh, 0.10) * smoothstep(0.03, 0.0, abs(bd)) ;
  float bubbleIn = step(bh, 0.10) * smoothstep(0.0, -0.04, bd);

  // ---- compose: projector light through the plate, plus rim and halo
  vec3 col = T * light;
  col *= 1.0 - 0.22 * clamp(inner, 0.0, 1.0);               // lens shoulder shade
  col += rimCol * light * 0.55 * clamp(rim, 0.0, 1.5);       // meniscus rim
  col += halo * light * 0.26 * (1.0 - coverAll);             // thrown bloom
  col = mix(col, col * 0.7, bubbleIn * 0.6);
  col += vec3(1.0) * bubble * 0.25 * light;

  // the dyes are translucent so the wall keeps a whisper of texture
  col *= 0.94 + 0.06 * vnoise(gl_FragCoord.xy / pr * 0.9);

  // soft roll-off so stacked rims bloom rather than clip
  col = col / (1.0 + col * 0.25);

  gl_FragColor = vec4(col, 1.0);
}
