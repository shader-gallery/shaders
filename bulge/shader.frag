// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// bulge (Manifold) - a glass lens travelling across a dense field of glowing
// print. The field is dark stock with palette light for ink: blocks of
// dot-matrix glyph rows alternate with blocks of fine ruled lines, a faint
// column grid ties them together, the whole sheet scrolls slowly and the
// characters quietly re-set themselves. Over it rides one large spherical cap
// of glass that enters from the right edge, with a small satellite lens on
// its own path. Each lens is refracted for real: an orthographic ray hits
// the cap, bends by Snell at the surface normal and is followed down to the
// sheet, so the centre magnifies, the ruled lines bow into arcs and pile up
// at the rim, and the glyphs stretch and compress instead of smearing. Red,
// green and blue take different refractive indices, so the rim opens a
// visible chromatic split that closes toward the centre. The glass gathers
// the light under it, carries a fresnel rim and a studio highlight, throws a
// contact shadow onto the sheet and lands a thin caustic ring just inside
// its edge.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bulge;    // dome height against its radius       (default 0.7)
uniform float u_size;     // large dome radius, frame-relative     (default 0.44)
uniform float u_speed;    // travel speed of the domes             (default 1.0)
uniform float u_split;    // chromatic split at the rim            (default 1.6)
uniform float u_cell;     // glyph cell width, css px              (default 8)

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float h3(float a, float b, float c) {
  return hash21(vec2(a * 1.37 + c * 0.713, b * 2.93 + c * 0.291) + 0.5);
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

// one 5 x 7 dot-matrix glyph. Letterforms are built from stems (whole
// columns), bars (rows 0, 3, 6) and a few loose dots, so the field reads as
// type rather than noise. g in cell-local 0..1, id picks the character.
// Returns the crisp dot in .x and a soft halo in .y for the glow.
vec2 glyph(vec2 g, float id) {
  // glyph box inside the cell: x 0.12..0.88, y 0.18..0.90
  vec2 m = (g - vec2(0.12, 0.18)) / vec2(0.76, 0.72) * vec2(5.0, 7.0);
  if (m.x < 0.0 || m.x >= 5.0 || m.y < 0.0 || m.y >= 7.0) return vec2(0.0);
  vec2 c = floor(m);
  float ix = c.x, iy = 6.0 - c.y;              // iy counts from the top
  float stemP = (ix < 0.5 || ix > 3.5) ? 0.55 : 0.16;
  float stem  = step(h3(id, ix, 11.0), stemP);
  float barRow = step(abs(iy - 3.0), 0.5) + step(iy, 0.5) + step(5.5, iy);
  float bar   = step(h3(id, iy, 23.0), 0.42) * min(barRow, 1.0);
  float dotp  = step(h3(id, ix * 7.0 + iy, 37.0), 0.10);
  float on = min(stem + bar + dotp, 1.0);
  vec2 f = fract(m) - 0.5;
  float r = length(f);
  float dotc = 1.0 - smoothstep(0.28, 0.44, r);
  float halo = 1.0 - smoothstep(0.30, 0.95, r);
  return vec2(dotc, halo) * on;
}

// the printed field at css px point s. Blocks of four rows are either type
// or fine ruled lines; a column grid runs through both. Returns lit colour.
vec3 field(vec2 s, float t, float cw, float wCells,
           vec3 ground, vec3 ink, vec3 inkHead, vec3 inkHi, vec3 rule) {
  float ch = cw * 1.5;
  s.y += t * 0.30 * ch;                         // slow scroll upward
  float col = floor(s.x / cw), row = floor(s.y / ch);
  vec2  g   = vec2(s.x - col * cw, s.y - row * ch) / vec2(cw, ch);

  // block character: the sheet runs in 4-row blocks, two of type then one
  // of ruled lines, so every view mixes the two textures
  float blk   = floor(row / 4.0);
  float ruled = step(abs(blk - 3.0 * floor(blk / 3.0) - 1.0), 0.5);
  float rowIn = row - blk * 4.0;

  vec3 c = ground;

  // ---- ruled block: fine horizontal lines, three per row, one heavier per
  // block, with a slow amplitude wave along x so the lines read as a field
  float pitch = ch / 3.0;
  float ly    = fract(s.y / pitch);
  float lw    = 0.6 / pitch;                    // ~0.6 css px lines
  float line  = 1.0 - smoothstep(lw, lw * 2.4, min(ly, 1.0 - ly));
  float heavy = step(rowIn, 0.5) * step(ly, 0.5) * step(fract(s.y / ch), 0.13);
  float wave  = 0.55 + 0.45 * sin(s.x / (cw * 9.0) + blk * 1.7 + t * 0.15);
  vec3 ruledC = c + rule * line * (0.30 + 0.40 * wave) + inkHead * heavy * 0.8;

  // ---- type block: paragraph gaps, header rows, ragged line ends, words
  float rB = hash21(vec2(row, 3.1));
  float blank  = step(rB, 0.08);
  float header = step(0.08, rB) * step(rB, 0.18);
  float lineLen = floor(mix(0.70, 1.04, hash21(vec2(row, 7.7))) * wCells);
  float inLine = step(col, lineLen);
  float space = step(hash21(vec2(col, row) + 0.3), 0.14);
  float word  = floor(col / 5.0);
  float hi    = step(hash21(vec2(word, row) + 9.1), 0.08);
  // characters occasionally re-set themselves
  float epoch = floor(t * 0.35 + hash21(vec2(col, row) + 1.7) * 9.0);
  float id    = floor(hash21(vec2(col * 1.7 + epoch * 0.13, row) + epoch) * 64.0);
  vec2  gl    = glyph(g, id) * (1.0 - space) * (1.0 - blank) * inLine;
  vec3 inkC = mix(ink, inkHead, header);
  inkC = mix(inkC, inkHi, hi);
  // baseline under each row of type
  float hline = 1.0 - smoothstep(0.0, 0.10, g.y - 0.02);
  vec3 typeC = c + rule * 0.30 * hline + inkC * (gl.y * 0.30 + gl.x * mix(0.85, 1.0, header));

  c = mix(typeC, ruledC, ruled);

  // faint column grid every 8 cells, through both block kinds
  float vline = 1.0 - smoothstep(0.0, 0.12, abs(g.x - 0.5) - 0.02);
  float onCol = step(fract(col / 8.0), 0.01);
  c += rule * 0.45 * vline * onCol;
  return c;
}

// refract a straight-down ray through a spherical glass cap of base radius R
// and height hr * R centred at c, and follow it to the sheet. Returns the
// sheet point seen at p; n is the surface normal (0,0,1 outside the cap).
vec2 dome(vec2 p, vec2 c, float R, float hr, float eta, out vec3 n, out float r) {
  vec2 d = p - c;
  r = length(d);
  n = vec3(0.0, 0.0, 1.0);
  if (r >= R) return p;
  float h  = hr * R;
  float Rs = (R * R + h * h) / (2.0 * h);
  float z0 = h - Rs;
  float zh = z0 + sqrt(max(Rs * Rs - r * r, 0.0));
  n = vec3(d, zh - z0) / Rs;
  vec3 td = refract(vec3(0.0, 0.0, -1.0), n, eta);
  float s = zh / max(-td.z, 0.08);
  return p + td.xy * s;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr       = max(u_pixelRatio, 0.5);
  vec2  res      = u_resolution;
  vec2  css      = res / pr;
  float refScale = pow(max(min(css.x, css.y) / 400.0, 1.0), 0.55);
  float cw       = max(u_cell, 4.0) * refScale;          // glyph cell width, css px
  vec2  p        = gl_FragCoord.xy / pr;                  // css px
  vec2  uv       = gl_FragCoord.xy / res;
  float t        = u_time * clamp(u_speed, 0.0, 4.0);
  float hr       = clamp(u_bulge, 0.15, 0.95);
  float split    = clamp(u_split, 0.0, 3.0);
  float wCells   = css.x / cw;

  // ---- inks and stock from the palette: near-black tinted stock, light inks
  float l0 = luma(c0), l1 = luma(c1), l2 = luma(c2), l3 = luma(c3);
  vec3 ground  = mix(vec3(l3), c3, 0.35) / max(l3, 0.05) * 0.045;
  vec3 ink     = mix(vec3(l0), c0, 0.85) / max(l0, 0.05) * 0.78;
  vec3 inkHead = mix(vec3(l2), c2, 0.80) / max(l2, 0.05) * 0.85;
  vec3 inkHi   = mix(vec3(l1), c1, 0.90) / max(l1, 0.05) * 0.85;
  vec3 rule    = mix(vec3(l0), c0, 0.55) / max(l0, 0.05) * 0.30;
  float mottle = vnoise(p * 0.02 + 3.0) - 0.5;
  ground *= 1.0 + mottle * 0.30;

  // ---- the lenses in css px: one large cap that lives on the right and
  // crosses the edge, one small satellite on its own slow path
  float RA = clamp(u_size, 0.08, 0.6) * css.y;
  float RB = RA * 0.30;
  vec2 cA = vec2(css.x * (0.78 + 0.14 * sin(t * 0.11 + 0.8)),
                 css.y * (0.50 + 0.22 * sin(t * 0.075 + 2.1)));
  vec2 cB = vec2(css.x * (0.26 + 0.16 * sin(t * 0.17 + 4.1)),
                 css.y * (0.32 + 0.20 * cos(t * 0.13 + 0.7)));
  float hrB = min(hr + 0.10, 0.95);

  // ---- refract per channel: small dome first, then the large one on top
  float etaR = 1.0 / (1.50 - 0.05 * split);
  float etaG = 1.0 / 1.50;
  float etaB = 1.0 / (1.50 + 0.06 * split);
  vec3 nA, nB, nx; float rA, rB, rx;
  vec2 qG = dome(dome(p, cB, RB, hrB, etaG, nB, rB), cA, RA, hr, etaG, nA, rA);
  vec2 qR = dome(dome(p, cB, RB, hrB, etaR, nx, rx), cA, RA, hr, etaR, nx, rx);
  vec2 qB = dome(dome(p, cB, RB, hrB, etaB, nx, rx), cA, RA, hr, etaB, nx, rx);

  vec3 sG = field(qG, t, cw, wCells, ground, ink, inkHead, inkHi, rule);
  vec3 sR = field(qR, t, cw, wCells, ground, ink, inkHead, inkHi, rule);
  vec3 sB = field(qB, t, cw, wCells, ground, ink, inkHead, inkHi, rule);
  vec3 col = vec3(sR.r, sG.g, sB.b);

  // ---- glass shading for each dome
  vec3 L = normalize(vec3(-0.45, 0.62, 0.64));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  vec3 glassTint = mix(vec3(1.0), c2, 0.30);
  // the fresnel rim splits too: the outer edge leans to c1, inner to c2
  vec3 rimIn  = mix(vec3(1.0), c2, 0.55);
  vec3 rimOut = mix(vec3(1.0), c1, 0.55);

  // large dome
  float inA = 1.0 - smoothstep(RA - 1.0, RA + 1.0, rA);
  float frA = 1.0 - nA.z;
  float rimA = frA * frA; rimA = rimA * rimA * frA;
  float spA = max(dot(nA, H), 0.0); spA = pow(spA, 90.0);
  float shA = smoothstep(RA * 1.30, RA * 0.985, rA) * (1.0 - inA);
  float uA  = rA / max(RA, 1.0);
  float caA = exp(-(uA - 0.90) * (uA - 0.90) * 500.0) * inA;
  // light gathered under the glass: brightest at the centre, still lifted at the rim
  float gatherA = inA * (1.0 + 0.22 * (1.0 - uA * uA) + 0.10);
  col *= 1.0 - 0.40 * shA;
  col *= mix(1.0, gatherA, inA);
  col += mix(rimIn, rimOut, smoothstep(0.86, 1.0, uA)) * 1.2 * rimA * inA;
  col += glassTint * (0.55 * spA * inA + 0.10 * caA);

  // small dome
  float inB = 1.0 - smoothstep(RB - 1.0, RB + 1.0, rB);
  float frB = 1.0 - nB.z;
  float rimB = frB * frB; rimB = rimB * rimB * frB;
  float spB = max(dot(nB, H), 0.0); spB = pow(spB, 90.0);
  float shB = smoothstep(RB * 1.30, RB * 0.985, rB) * (1.0 - inB);
  float uB  = rB / max(RB, 1.0);
  float caB = exp(-(uB - 0.90) * (uB - 0.90) * 500.0) * inB;
  float gatherB = inB * (1.0 + 0.22 * (1.0 - uB * uB) + 0.10);
  col *= 1.0 - 0.40 * shB;
  col *= mix(1.0, gatherB, inB);
  col += mix(rimIn, rimOut, smoothstep(0.86, 1.0, uB)) * 1.2 * rimB * inB;
  col += glassTint * (0.55 * spB * inB + 0.10 * caB);

  // a whisper of reflected room in the glass, brightest on the lit shoulder
  float shoulderA = max(dot(nA, L), 0.0) * (1.0 - nA.z) * inA;
  float shoulderB = max(dot(nB, L), 0.0) * (1.0 - nB.z) * inB;
  col += c2 * 0.08 * (shoulderA + shoulderB);

  // ---- seat the sheet under a soft lamp that favours the lens side
  vec2 vq = uv - vec2(0.62, 0.5);
  col *= 1.0 - 0.30 * smoothstep(0.35, 1.05, length(vq * vec2(1.0, 1.3)));

  gl_FragColor = vec4(col, 1.0);
}
