// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// acidsquares (Manifold) - a checkerboard printed on a surface that will not
// hold still. The grid is sampled through a warp field: three travelling
// ripples spreading from slow-drifting centres, a tall-aspect FBM melt that
// runs the squares downward like softened vinyl, and a long swell that leans
// the whole board. The warp Jacobian is measured by finite differences and
// does three jobs: it sets the anti-aliasing width so edges stay crisp at any
// amount of stretch, its area term shades compressed folds darker and
// stretched runs brighter so the board reads as a rippled skin rather than a
// flat texture, and its slope gives a normal for a restrained specular sheen.
// Red, green and blue each sample the board through a slightly different warp
// amount, so every edge carries a thin chromatic fringe that widens where the
// warp is strongest. Light squares glow in a palette hue keyed to the ripple
// height and pulse on a slow beat; dark squares are near-black tinted glass.
// Acid house register, kept quiet: dark ground, colour as light, no neon wash.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // squares down the frame height        (default 7)
uniform float u_ripple;   // travelling ripple amplitude           (default 0.9)
uniform float u_melt;     // downward melt depth                   (default 1.0)
uniform float u_fringe;   // chromatic fringing strength           (default 1.0)
uniform float u_speed;    // ripple, melt and pulse speed          (default 0.5)

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

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
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

// the warp field. p is in square units (one unit = one square). Returns the
// displacement to add to p, and writes the ripple height (the part of the
// field that is a real surface height, used for tint and sheen) to h.
vec2 warpField(vec2 p, float t, float tiles, float aspect, out float h) {
  vec2  d = vec2(0.0);
  float rippleAmp = clamp(u_ripple, 0.0, 2.0) * 0.30;
  float meltAmp   = clamp(u_melt, 0.0, 2.0);
  h = 0.0;

  // three travelling ripples from centres that drift on slow lissajous paths.
  // Each is a damped radial sine; the displacement is radial (a real surface
  // ripple pushes a printed pattern in and out from the centre) and the
  // height is the undirected wave.
  for (int i = 0; i < 3; i++) {
    float k  = float(i);
    vec2  c  = vec2(sin(t * (0.11 + 0.03 * k) + k * 2.1) * 0.42 * aspect,
                    cos(t * (0.08 + 0.04 * k) + k * 1.3) * 0.40) * tiles;
    vec2  dv = p - c;
    float r  = length(dv);
    float wl = 2.3 + 0.5 * k;                            // wavelength, squares
    float ph = r / wl * TAU - t * (1.6 + 0.3 * k) + k * 1.9;
    float env = exp(-r / (tiles * (0.55 + 0.1 * k)));
    float w  = sin(ph) * env;
    h += w * (1.0 - 0.2 * k);
    // divide by r plus a core radius so the centre stays smooth, no pinch
    d += dv * w / (r + 0.45) * rippleAmp * (1.0 - 0.15 * k);
  }

  // the melt: a noise field stretched tall so its features are drips, not
  // blobs, flowing downward. Mostly a vertical displacement with a small
  // sideways wobble so drips lean.
  vec2  mp = vec2(p.x * 0.55, p.y * 0.20) + vec2(0.0, t * 0.10);
  float m1 = fbm(mp) - 0.5;
  float m2 = fbm(mp * 1.7 + vec2(7.3, 2.1)) - 0.5;
  d += vec2(m2 * 0.35, m1 * 1.25) * meltAmp * tiles * 0.16;
  h += m1 * 0.6 * meltAmp;

  // a long lazy swell leaning the whole board, so no row ever sits square
  d.x += sin(p.y * 0.45 / tiles * PI + t * 0.23) * 0.18 * tiles * 0.25 * (0.3 + 0.7 * meltAmp);
  d.y += sin(p.x * 0.30 / tiles * PI - t * 0.17) * 0.10 * tiles * 0.25 * rippleAmp;

  return d;
}

// anti-aliased checker at warped coords q, edge softness w in square units.
// Each axis is a square wave built from a folded fract, then XOR-ed.
float checker(vec2 q, float w) {
  vec2 f = abs(fract(q + 0.25) - 0.5) - 0.25;
  vec2 s = smoothstep(-w, w, f);
  return s.x + s.y - 2.0 * s.x * s.y;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  vec2  uv     = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  float tiles  = max(u_scale, 2.0);
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float fringe = clamp(u_fringe, 0.0, 2.0);

  // square-unit coordinates, anchored to uv so the count holds at any size
  vec2  p  = (uv - 0.5) * vec2(aspect, 1.0) * tiles;
  float px = tiles / res.y;                         // one device pixel in squares

  // ---- warp and its finite-difference Jacobian (one pixel step)
  float h, hx, hy;
  vec2 d  = warpField(p, t, tiles, aspect, h);
  vec2 dx = warpField(p + vec2(px, 0.0), t, tiles, aspect, hx);
  vec2 dy = warpField(p + vec2(0.0, px), t, tiles, aspect, hy);
  vec2 W  = p + d;
  vec2 Jx = (vec2(px, 0.0) + dx - d);               // change of W per pixel in x
  vec2 Jy = (vec2(0.0, px) + dy - d);
  float area = abs(Jx.x * Jy.y - Jx.y * Jy.x) / (px * px);   // 1 = unstretched
  float aaW  = 0.7 * max(length(Jx), length(Jy));            // edge width, squares

  // ---- chromatic fringing: each channel sees a slightly different warp
  // amount, plus a small constant split along the light direction so even
  // calm regions carry a hairline of colour at the edges
  vec2 split = d * 0.085 * fringe + vec2(-0.6, 0.45) * px * 1.8 * fringe;
  float kR = checker(W + split, aaW);
  float kG = checker(W, aaW);
  float kB = checker(W - split, aaW);

  // ---- surface shading from the ripple height
  float slopeK = 0.9 / px;
  vec3  n  = normalize(vec3(-(hx - h) * slopeK * 0.22, -(hy - h) * slopeK * 0.22, 1.0));
  vec3  L  = normalize(vec3(-0.5, 0.62, 0.6));
  vec3  H  = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndl = clamp(dot(n, L), 0.0, 1.0);
  float ndh = clamp(dot(n, H), 0.0, 1.0);
  float spec = ndh * ndh; spec *= spec; spec *= spec; spec *= spec; spec *= spec;
  // fold shading: compressed squares sink into shadow, stretched ones lift
  float fold = clamp(1.0 - 0.35 * (area - 1.0), 0.55, 1.25);

  // ---- tile colours. Light squares glow in a hue keyed to the ripple
  // height (crest toward the second pole, trough toward the first) with a
  // slow beat pulse rolling across the board; dark squares are tinted glass.
  float hue  = smoothstep(-0.7, 0.3, h);
  vec3  glow = mix(c0, c1, hue);
  glow = mix(glow, c2, 0.75 * smoothstep(0.15, 0.9, h));
  glow = mix(glow, c3 * 0.9, 0.5 * smoothstep(-0.45, -1.2, h));
  float beat = 0.86 + 0.14 * sin(t * 1.2 - length(W) * 0.35 + h * 1.5);
  vec3  light = glow * (0.66 + 0.30 * ndl) * beat;
  vec3  ink   = mix(vec3(0.030, 0.028, 0.040), c3, 0.16) * (0.75 + 0.35 * ndl);
  // the darks pick up a whisper of the glow bleeding across the surface
  ink += glow * 0.035 * beat;

  vec3 col;
  col.r = mix(ink.r, light.r, kR);
  col.g = mix(ink.g, light.g, kG);
  col.b = mix(ink.b, light.b, kB);
  col *= fold;

  // sheen: a restrained gloss over both tiles, stronger on the dark glass
  float lightAmt = kG;
  col += mix(vec3(1.0), c2, 0.5) * spec * (0.10 + 0.12 * (1.0 - lightAmt));

  // one lamp, high and to the left: the board falls off into shadow away
  // from it so the frame has a light direction, then a soft corner haze
  vec2  vq   = (uv - 0.5) * vec2(aspect, 1.0);
  float lamp = exp(-length(vq - vec2(-0.35 * aspect, 0.35)) * 1.1);
  col *= 0.62 + 0.62 * lamp;
  col *= 1.0 - 0.16 * smoothstep(0.35, 1.0, length(uv - 0.5) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
