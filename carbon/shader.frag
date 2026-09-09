// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// carbon (Burnish) - a sheet of carbon fibre in a 2x2 twill weave under a clear
// coat, seen close and lit by a light that sweeps across it. The cloth is built
// exactly the way the loom does: flat tows a fixed width wide, each warp tow
// floating over two weft tows then diving under two, the float shifting by one
// tow per row so the raised segments stack into the twill diagonal. Each float
// is a bundle of parallel fibres, so it is shaded as an anisotropic strand
// surface (Kajiya-Kay): the fibres glint only where the half vector is
// perpendicular to the fibre direction, which means warp and weft floats
// brighten under opposite light positions. As the light travels, the checker
// of bright and dark floats flips family by family, the signature of real
// carbon. Each float bows up out of the weave and dives back under at its
// ends, so the ends go dark and the crossing tow shades them; individual
// fibres show as fine stripes across every float, resin gaps run between the
// tows, and a broad soft clear-coat reflection rides on top of it all.
// Palette tints the sheen of the two tow families and the body of the weave,
// so the sheet reads as carbon in every theme: grey in the neutral palettes,
// blue or bronze carbon-kevlar in the coloured ones.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // tow width in css px                    (default 20)
uniform float u_sweep;    // speed of the travelling light          (default 0.3)
uniform float u_gloss;    // clear-coat reflection strength         (default 0.8)
uniform float u_fibre;    // visibility of individual fibre stripes (default 1.0)
uniform float u_tint;     // how much palette colour enters the sheen (default 0.5)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float PI = 3.14159265359;

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

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
  float t      = u_time * clamp(u_sweep, 0.0, 3.0);
  float gloss  = clamp(u_gloss, 0.0, 2.0);
  float fibAmt = clamp(u_fibre, 0.0, 2.0);
  float tint   = clamp(u_tint, 0.0, 1.0);
  float W      = max(u_scale, 6.0);            // tow width, css px

  // frame coords for the lights: x in -aspect..aspect, y in -1..1
  vec2 p = (fc / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  // css px coords for the cloth, rotated a hair so the weave is not ruler
  // square to the screen (a laid-up sheet never is)
  vec2 q = fc / pr;
  float ca = cos(-0.07), sa = sin(-0.07);
  q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);

  // ---- the twill lattice
  vec2  g  = q / W;
  vec2  gi = floor(g);
  vec2  gf = fract(g);
  float m  = mod(gi.x - gi.y, 4.0);            // 0,1 warp on top; 2,3 weft on top
  float isWarp = step(m, 1.5);

  // along-float coordinate v runs 0..2 across the two cells of the float,
  // across-tow coordinate w runs 0..1 across the tow width
  float v = mix((m - 2.0) + gf.x, (1.0 - m) + gf.y, isWarp);
  float w = mix(gf.y, gf.x, isWarp);
  // ids: which tow this is, and which float along it
  float towId   = mix(gi.y, gi.x, isWarp);
  float floatId = mix(gi.x - (m - 2.0), gi.y - (1.0 - m), isWarp);
  float seed    = towId * 3.17 + isWarp * 41.0;

  // ---- tow geometry: the float bows up over the crossing tows (a raised
  // arch along v) and has a slight crown across w. Heights in tow widths.
  float arch   = sin(PI * v * 0.5);             // 0 at the ends, 1 mid float
  float dArch  = 0.5 * PI * cos(PI * v * 0.5);  // slope along v
  float cw     = 2.0 * w - 1.0;
  float crown  = 1.0 - cw * cw;
  float dCrown = -4.0 * cw;
  float bowAmp = 0.28, crownAmp = 0.08;
  // surface normal and fibre tangent in sheet space (x right, y up, z out)
  vec2  slope  = mix(vec2(dArch * bowAmp, dCrown * crownAmp),
                     vec2(dCrown * crownAmp, dArch * bowAmp), isWarp);
  vec3  N      = normalize(vec3(-slope, 1.0));
  vec3  T      = mix(vec3(1.0, 0.0, dArch * bowAmp), vec3(0.0, 1.0, dArch * bowAmp), isWarp);
  T = normalize(T);

  // ---- fibre stripes across the tow: each fibre is ~1.4 css px, with its own
  // brightness, plus a slow waver along the float so the bundle is not ruled
  float acrossPx = w * W + (vnoise(vec2(v * 1.7, towId * 0.9) + seed) - 0.5) * 2.0;
  float strandId = floor(acrossPx / 1.4);
  float strand   = hash21(vec2(strandId, seed));
  float stripe   = vnoise(vec2(acrossPx * 0.9, v * 0.6 + floatId * 2.3) + seed * 0.1);
  float fib      = 1.0 + fibAmt * ((strand - 0.5) * 0.45 + (stripe - 0.5) * 0.5);
  // a few fibres per tow are broken or lifted and flash brighter
  float loose    = step(0.965, hash21(vec2(strandId * 1.7, floatId + seed)));
  fib += fibAmt * loose * 0.6 * smoothstep(0.3, 0.9, sin(v * PI + strand * 6.0));

  // ---- resin gaps between tows and the shadow of the crossing tow at the
  // float ends, where the tow dives under
  float gapW  = 0.06;
  float gap   = smoothstep(0.0, gapW, w) * smoothstep(1.0, 1.0 - gapW, w);
  float endD  = min(v, 2.0 - v);
  float ao    = mix(0.42, 1.0, smoothstep(0.0, 0.28, endD));
  float ends  = smoothstep(0.0, 0.04, endD);      // the seam where it dips under
  // per-tow and per-float lay-up variation: some tows sit a touch brighter
  float lay   = 0.92 + 0.16 * hash21(vec2(towId, isWarp)) + 0.06 * (hash21(vec2(floatId, seed)) - 0.5);

  // ---- lights. The sweep light travels a figure-eight across the sheet; a
  // dim fixed fill from the upper left keeps the far tows readable.
  float a  = t * 0.25;
  vec2  lp = vec2(1.15 * aspect * cos(a), 0.75 * sin(2.0 * a));
  // optional pointer: the light slides to the cursor, zero at rest
  vec2  mp = (u_mouse / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  lp = mix(lp, mp, mAmt * 0.55);
  vec3  L  = normalize(vec3(lp - p, 1.35));
  vec3  Lf = normalize(vec3(-0.9, 0.7, 0.9));
  // a soft overhead strip (the studio ceiling) the fibres reflect everywhere:
  // this is what keeps the whole sheet reading as satin, not just the pool
  // under the sweep light
  vec3  E  = normalize(vec3(0.15, 0.55, 1.0));
  vec3  V  = normalize(vec3(-p * 0.35, 2.4));
  vec3  H  = normalize(L + V);
  vec3  Hf = normalize(Lf + V);

  // Kajiya-Kay strand shading: sin of the angle between the fibre and the
  // light / half vector. Fibres glint when H is perpendicular to them.
  float tl  = dot(T, L);
  float th  = dot(T, H);
  float tlf = dot(T, Lf);
  float thf = dot(T, Hf);
  float sinTL  = sqrt(max(1.0 - tl * tl, 0.0));
  float sinTH  = sqrt(max(1.0 - th * th, 0.0));
  float sinTLf = sqrt(max(1.0 - tlf * tlf, 0.0));
  float sinTHf = sqrt(max(1.0 - thf * thf, 0.0));
  float te     = dot(T, E);
  float sinTE  = sqrt(max(1.0 - te * te, 0.0));
  float e2 = sinTE * sinTE, e4 = e2 * e2;
  float envSheen = e4 * e4 * e2;                    // ~ power 10
  float ndle = clamp(dot(N, E), 0.0, 1.0);
  // sharp lobe (the fibre glint) and a broad lobe (the satin body sheen)
  float s2 = sinTH * sinTH, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8;
  float s32 = s16 * s16;
  float specSharp = s32 * s32 * s8;                 // ~ power 72
  float specBroad = s8 * s2;                        // ~ power 10
  float f2 = sinTHf * sinTHf, f4 = f2 * f2, f8 = f4 * f4;
  float fillSpec  = f8 * f8 * f4;                   // ~ power 20
  // the arched normal darkens the float ends and one flank
  float ndl  = clamp(dot(N, L), 0.0, 1.0);
  float ndlf = clamp(dot(N, Lf), 0.0, 1.0);
  float dist = length(vec3(lp - p, 1.35));
  float falloff = 1.6 / (0.6 + dist * dist);

  // ---- colour. The body of the weave is near-black carbon, faintly tinted by
  // the deep pole; the sheen of each tow family takes a different palette
  // pole, kept mostly white so it stays metallic. Neutral palettes give plain
  // grey carbon, coloured ones give the two-tone carbon-kevlar look.
  vec3  deep    = c3 * (0.5 / max(luma(c3), 0.2));
  vec3  body    = mix(vec3(0.075, 0.078, 0.084), deep * 0.16, 0.5 * tint);
  vec3  poleA   = c2 * (0.85 / max(luma(c2), 0.25));
  vec3  poleB   = c0 * (0.85 / max(luma(c0), 0.25));
  vec3  sheenA  = mix(vec3(1.0), clamp(poleA, 0.0, 1.0), 0.55 * tint);
  vec3  sheenB  = mix(vec3(1.0), clamp(poleB, 0.0, 1.0), 0.55 * tint);
  vec3  sheen   = mix(sheenB, sheenA, isWarp);
  vec3  coatCol = mix(vec3(1.0), clamp(c1 * (0.9 / max(luma(c1), 0.25)), 0.0, 1.0), 0.3 * tint);

  vec3 col = body * (0.55 + 0.45 * sinTLf) * (0.6 + 0.5 * ndlf);
  col += body * 2.2 * sinTL * ndl * falloff;
  col += sheen * 0.20 * fillSpec * ndlf;
  col += sheen * 0.16 * envSheen * ndle;
  col += sheen * (0.09 * specBroad + 0.55 * specSharp) * ndl * falloff;
  col *= fib * lay * ao * gap * mix(0.5, 1.0, ends);

  // ---- clear coat: a smooth resin skin lying over the weave with a gentle
  // macro ripple, reflecting the sweep light as one broad soft bloom and a
  // tight hot core, and picking up a faint tinted sky at grazing angles
  vec2  rip = vec2(sin(p.x * 2.3 + p.y * 0.8 + t * 0.07), sin(p.y * 3.1 - p.x * 0.5 + 1.7));
  vec3  Nm  = normalize(vec3(-rip * 0.045, 1.0));
  float ndhm = clamp(dot(Nm, normalize(L + V)), 0.0, 1.0);
  float c2_ = ndhm * ndhm, c4 = c2_ * c2_, c8 = c4 * c4, c16 = c8 * c8, c32 = c16 * c16;
  float coatBroad = c16 * c4;                        // ~ power 20
  float coatCore  = c32 * c32 * c32 * c32;           // ~ power 128
  float fres = 1.0 - clamp(dot(Nm, V), 0.0, 1.0);
  fres = fres * fres;
  col += coatCol * gloss * (0.16 * coatBroad + 0.30 * coatCore) * falloff * (0.7 + 0.3 * fib);
  col += coatCol * gloss * 0.05 * fres;
  // the gap resin is glossier than the fibre: the coat also shows in the seams
  col += coatCol * gloss * 0.08 * coatBroad * (1.0 - gap);

  gl_FragColor = vec4(col, 1.0);
}
