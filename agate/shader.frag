// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// agate (Strata) - a polished agate slice on a lightbox, seen close enough
// that the stone runs off every edge. Two nucleation lobes are fused with a
// smooth-min so one wandering fortification outline wraps them both; every
// band inside follows that outline, and the wander is scaled by depth so the
// outer bands are ragged where they met the cavity wall and the inner ones
// smooth out toward the heart, the way chalcedony really deposits. Band
// widths come from a nonlinearly remapped depth so thick milky zones sit
// between runs of hairline layers. Each band is hashed into a mineral type:
// milky translucent chalcedony, iron-tinted layers, thin dark deposition
// lines, and an occasional saturated dyed band. The slice is backlit, so the
// translucent bands glow where they are thin and the light behind them
// drifts; a polished-surface sheen sweeps the top. The innermost zone is a
// druzy quartz bed built from stacked noise, not cells: a crystalline
// texture with individually timed glints. Nothing is a nearest-point cell.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bands;    // band density per unit of depth         (default 12.0)
uniform float u_wander;   // outline irregularity                    (default 1.0)
uniform float u_glow;     // backlight translucency                  (default 1.0)
uniform float u_druzy;    // size of the crystalline heart           (default 0.30)
uniform float u_drift;    // speed of light drift and slice rotation (default 0.3)

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// linearly interpolated lattice hash: bilinear patches with creased borders
float lnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// druzy height field: two rotated creased lattices at different scales
float druzyH(vec2 q) {
  vec2 qa = mat2(0.94, 0.34, -0.34, 0.94) * q;
  vec2 qb = mat2(0.50, -0.87, 0.87, 0.50) * q * 1.7 + 5.0;
  vec2 qc = mat2(0.17, 0.98, -0.98, 0.17) * q * 1.3 + 9.0;
  return lnoise(qa) * 0.5 + lnoise(qb) * 0.25 + lnoise(qc) * 0.25;
}

// polynomial smooth-min: fuses the two lobes into one outline
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// depth into the stone: 0 at the heart, growing outward, following one
// wandering outline shared by every band
float depth(vec2 p, float wander) {
  // raw lobe distances before any wander
  float d0 = smin(length(p - vec2(0.55, -0.30)), length(p - vec2(-1.05, 0.62)) * 1.30, 0.7);
  // outline wander: scaled by depth, so outer bands are ragged and the inner
  // bands smooth toward the heart. Two noise octaves at different scales:
  // a broad lobing and a finer crenellation.
  vec2 w1 = vec2(fbm(p * 1.1 + 3.7), fbm(p * 1.1 + vec2(9.2, 4.4))) - 0.5;
  vec2 w2 = vec2(vnoise(p * 2.4 + 21.0), vnoise(p * 2.4 + 57.0)) - 0.5;
  vec2 pw = p + wander * (0.08 + 0.26 * d0) * w1 + wander * (0.02 + 0.06 * d0) * w2;
  return smin(length(pw - vec2(0.55, -0.30)), length(pw - vec2(-1.05, 0.62)) * 1.30, 0.6);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t      = u_time * clamp(u_drift, 0.0, 2.0);
  float wander = clamp(u_wander, 0.0, 2.0);
  float glow   = clamp(u_glow, 0.0, 2.0);
  float bandF  = max(u_bands, 2.0);
  float eyeR   = clamp(u_druzy, 0.05, 1.0);

  // frame-relative coords, height 2, with a glacial rotation about the frame
  // centre so the whole slice turns under the light
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  float ra = t * 0.02;
  p = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * p;

  // ---- mineral palette. Milky chalcedony is a pale desaturated tint of the
  // lightest pole; the iron and dye colours come from the other poles.
  float l0 = luma(c0), l1 = luma(c1), l2 = luma(c2), l3 = luma(c3);
  vec3 milk  = mix(vec3(0.86, 0.84, 0.80), c2, 0.18);            // white chalcedony
  vec3 iron  = mix(vec3(l0) * 0.5, c0, 0.55) * 0.75;              // iron-tinted band
  vec3 dye   = mix(vec3(l1), c1, 0.9);                            // the saturated dyed band
  vec3 amber = mix(vec3(l3) * 0.6, c3, 0.7);                      // warm secondary
  vec3 dark  = mix(vec3(0.06, 0.055, 0.05), c3, 0.12);            // deposition lines
  vec3 rind  = mix(vec3(0.16, 0.15, 0.14), c0, 0.15);             // outer host rock

  // ---- depth and its finite-difference gradient (band normal for shading)
  float e  = 0.004;
  float d  = depth(p, wander);
  float dx = depth(p + vec2(e, 0.0), wander);
  float dy = depth(p + vec2(0.0, e), wander);
  vec2  gn = normalize(vec2(dx - d, dy - d) + 1e-5);   // points outward

  // ---- band structure: remap depth so band widths vary, then index
  float n = d * bandF;
  n += 0.9 * sin(n * 0.31 + 1.3) + 0.45 * sin(n * 0.83 + 4.1);   // width breathing
  float bi = floor(n);
  float bf = fract(n);
  float hb  = hash11(bi + 1.0);
  float hb2 = hash11(bi * 3.3 + 7.0);
  float hb3 = hash11(bi * 5.7 + 2.0);

  // band mineral type by hash: mostly milk, some iron, a few dye, some amber
  vec3 bandCol = milk * (0.75 + 0.25 * hb2);
  float trans = 0.85;                                     // translucency
  if (hb < 0.30) { bandCol = mix(milk, iron, 0.6 + 0.4 * hb2); trans = 0.4; }
  if (hb > 0.30 && hb < 0.42) { bandCol = mix(iron, amber, hb2); trans = 0.35; }
  if (hb > 0.86) { bandCol = mix(dye, milk, 0.25 * hb2); trans = 0.7; }
  if (hb > 0.42 && hb < 0.50) { bandCol = dark * (1.4 + hb2); trans = 0.12; }

  // within-band deposition gradient: each layer is darker on its inner face
  float grade = 0.74 + 0.26 * smoothstep(0.0, 0.7, bf);
  // hairline sub-layers: fine parallel lines inside each band
  float hair = 0.5 + 0.5 * sin(n * 6.2832 * (4.0 + 3.0 * hb3));
  hair = 1.0 - 0.16 * hair * hair * (0.4 + 0.6 * trans);
  // thin dark boundary line at every band start
  // pixel-aware anti-aliasing: one device pixel in band-fraction units
  float pxB   = (2.0 / u_resolution.y) * bandF;
  float lineW = max(0.045, pxB * 1.2);
  float line = 1.0 - smoothstep(lineW + pxB * 0.5, lineW - pxB * 0.5, bf) * 0.65
                   - smoothstep(1.0 - lineW * 0.6 - pxB * 0.5, 1.0 - lineW * 0.6 + pxB * 0.5, bf) * 0.30;

  vec3 stone = bandCol * grade * hair * line;

  // ---- backlight: a soft light drifting behind the slice; translucent bands
  // glow where the light sits, thin bands more than thick ones
  vec2 lp = vec2(1.1 * sin(t * 0.13) + 0.3, 0.8 * cos(t * 0.09) - 0.1);
  float lr = length(p - lp);
  float back = 0.28 + 1.15 * exp(-lr * lr * 0.5);
  float thin = 1.0 - smoothstep(0.0, 1.0, abs(fract(n * 0.5) - 0.5) * 2.0);  // brighter at band centres
  vec3 lit = stone * (0.40 + 0.7 * back * (0.5 + 0.5 * glow) * (trans + 0.2));
  // translucent bands transmit the tint of the light: warm pole bleeds through
  lit += bandCol * amber * back * trans * glow * 0.35;

  // relief: the bands are polished flat, but deposition steps catch a little
  // side light so each layer edge reads as a lip
  vec3 L = normalize(vec3(-0.6, 0.7, 0.4));
  float lip = smoothstep(lineW * 2.0, 0.0, bf);
  float side = dot(gn, L.xy);
  lit *= 1.0 + 0.10 * lip * side;

  // ---- druzy heart: crystalline quartz bed inside eyeR, edge roughened
  float eyeEdge = eyeR * (1.0 + 0.35 * (fbm(p * 5.0 + 11.0) - 0.5));
  float inEye = smoothstep(eyeEdge + 0.03, eyeEdge - 0.03, d);
  // crystal texture: two rotated lattices of linearly interpolated hash
  // (bilinear patches, so each cell is a flat-ish tilted face with a crease
  // at its border) summed into a height field, then lit from a finite-
  // difference normal with the slope exaggerated. Flat lit faces, dark
  // turned faces, and creases between them: a bed of quartz points, built
  // from a height field, not from any nearest-point cell.
  vec2 q = p * 30.0;
  vec3 Lc = normalize(vec3(-0.55, 0.65, 0.5));
  float eq = 0.05;
  float h0 = druzyH(q);
  float hx = druzyH(q + vec2(eq, 0.0));
  float hy = druzyH(q + vec2(0.0, eq));
  vec3 nC = normalize(vec3(-(hx - h0), -(hy - h0), eq * 0.9));
  float faceLit = clamp(dot(nC, Lc), 0.0, 1.0);
  vec3 Hc = normalize(Lc + vec3(0.0, 0.0, 1.0));
  float fspec = clamp(dot(nC, Hc), 0.0, 1.0);
  fspec = fspec * fspec; fspec = fspec * fspec; fspec = fspec * fspec; fspec = fspec * fspec;
  float k1 = vnoise(q * 0.22 + 17.0);
  float cryst = 0.18 + 0.55 * faceLit * faceLit + 0.5 * fspec;
  // cluster shading: crystals sitting lower in the bed fall into shadow
  cryst *= 0.5 + 0.8 * k1;
  // terminated points: the local peaks of the height field
  float tip = smoothstep(0.72, 0.95, h0);
  // per-crystal glints on their own timers, plus fine sugar sparkle
  vec2 gid = floor(q * 0.7);
  float gh = hash21(gid);
  float gph = hash21(gid + 7.0) * 6.2832;
  float tw = 0.5 + 0.5 * sin(t * (0.8 + 1.4 * gh) + gph);
  tw = tw * tw; tw = tw * tw; tw = tw * tw;           // sharp attack
  float glint = tw * step(0.55, gh) * tip * (0.4 + 0.6 * fspec);
  float sugar = step(0.965, hash21(floor(q * 3.0))) * (0.5 + 0.5 * sin(t * 2.0 + hash21(floor(q * 3.0) + 3.0) * 6.2832));
  vec3 quartz = mix(milk, c2, 0.25) * cryst * (0.75 + 0.45 * back);
  quartz += vec3(1.0) * (glint * 0.9 + sugar * 0.45 + tip * faceLit * 0.2);
  // a darker hollow at the very centre where the crystals point inward
  float hollow = smoothstep(eyeR * 0.55, eyeR * 0.15, d);
  quartz *= 1.0 - 0.45 * hollow;
  quartz += mix(c2, c1, 0.5) * hollow * 0.15 * back;

  vec3 col = mix(lit, quartz, inEye);

  // ---- outer rind: rough host rock past the last band, then the lightbox
  float rindR = 2.05 + 0.12 * (fbm(p * 2.2 + 31.0) - 0.5);
  float inRind = smoothstep(rindR - 0.02, rindR + 0.02, d);
  float rock = fbm(p * 9.0 + 3.0);
  vec3 rindCol = rind * (0.6 + 0.8 * rock) * (0.7 + 0.3 * back);
  // a bright translucent skin band right at the outline where the stone is thinnest
  float skin = smoothstep(rindR - 0.10, rindR - 0.02, d) * (1.0 - inRind);
  col += milk * skin * back * 0.35 * glow;
  col = mix(col, rindCol, inRind);
  float table = smoothstep(rindR + 0.10, rindR + 0.22, d);
  col = mix(col, vec3(0.03, 0.03, 0.035) + c0 * 0.03, table);

  // ---- polished surface sheen: a broad soft highlight sweeping the face
  vec2 sdir = normalize(vec2(0.8, 0.6));
  float sweep = dot(p, sdir) - 0.9 * sin(t * 0.07);
  float sheen = exp(-sweep * sweep * 3.0) * 0.14;
  col += vec3(1.0) * sheen * (1.0 - table);

  gl_FragColor = vec4(col, 1.0);
}
