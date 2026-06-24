// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// stitch (Loom) — tiny glowing cross-stitches planted one cell at a time by a
// bright needle glint that works back and forth (boustrophedon) across a working
// band, low in the frame. The whole frame is woven AIDA CLOTH (warp + weft thread
// ridges with embossed depth): bare cloth waits below the needle, freshly stitched
// rows drift slowly up-frame and dim into the dark above, like work receding into
// memory. Each band of rows carries a hashed folk-sampler motif tinted from one
// palette colour. The image is BUILT by accumulation — phase-continuous, no reset.
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
uniform float u_sewSpeed;    // needle travel + planting rate
uniform float u_stitchCss;   // cross-stitch cell size, css px
uniform float u_rows;        // completed rows kept lit above the needle
uniform float u_complexity;  // bias toward denser sampler motifs
uniform float u_weave;       // aida cloth thread visibility (bespoke background)
uniform float u_clothDepth;  // embossed depth of the woven threads
uniform float u_glint;       // needle-spark size and brightness

const vec3  BG   = vec3(0.030, 0.030, 0.038); // near-black aida ~#08080A
const float COLS = 40.0;                       // stitches across the working band

// hash helpers (no textures): cheap deterministic pseudo-random
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// a single diagonal dash (rounded segment) within a cell, half-thickness th.
// dir = +1 for "/", -1 for "\". p is local cell coords in [-0.5,0.5].
float dash(vec2 p, float dir, float th, float halfLen) {
  vec2 q = vec2((p.x + dir * p.y) * 0.70710678, (p.x - dir * p.y) * 0.70710678);
  float along = clamp(q.x, -halfLen, halfLen);
  float d = length(q - vec2(along, 0.0));
  return d - th;
}

// woven AIDA height field at cell-grid coordinate g (1 unit = one stitch cell).
// warp ridges run vertically, weft horizontally; an over-under checker raises one
// set above the other so the crossings read as genuine weave. Seam-free (cos based).
float weaveHeight(vec2 g) {
  float warp = 0.5 + 0.5 * cos(g.x * 6.2831853);   // peaks on a vertical thread
  float weft = 0.5 + 0.5 * cos(g.y * 6.2831853);   // peaks on a horizontal thread
  warp = pow(warp, 2.5);                            // sharpen into thread ridges
  weft = pow(weft, 2.5);
  float over  = 0.5 + 0.5 * cos(g.x * 3.14159265) * cos(g.y * 3.14159265);
  float warpH = warp * mix(0.62, 1.0, over);
  float weftH = weft * mix(1.0, 0.62, over);
  return max(warpH, weftH);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // palette with house fallback (headless can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell    = max(u_stitchCss, 1.0) * refScale * pr;  // cross-stitch cell, device px
  float speed   = max(u_sewSpeed, 0.001);
  float rowsLit = max(u_rows, 1.0);

  // ---- build clock: a global rows-completed counter advances with time ----
  float rowDur  = 1.4 / speed;                    // seconds to plant one row
  float prog    = t / rowDur;                     // rows completed so far (fractional)
  float rowInt  = floor(prog);                    // row being worked NOW
  float rowFrac = fract(prog);                    // 0..1 progress through current row

  // working band sits LOW so nearly the whole frame is finished cloth drifting up.
  // cloth RISES: a row planted at the band drifts UP-frame as the build clock
  // advances, so rowF decreases with screen height — above the band is older,
  // already-finished cloth; below the band waits bare, unsewn cloth.
  float bandY  = res.y * 0.14;
  float rowF   = prog - (fc.y - bandY) / cell;
  float rowIdx = floor(rowF);
  float inRowY = fract(rowF);

  float colF   = fc.x / cell;
  float colIdx = floor(colF);
  float inRowX = fract(colF);

  // ---- bespoke AIDA CLOTH substrate: woven threads fill the entire frame ----
  // sampled 3x for a cheap embossed normal so the weave catches a raking light.
  vec2  g   = vec2(colF, rowF);
  float hC  = weaveHeight(g);
  float eX  = weaveHeight(g + vec2(-0.06, 0.0)) - weaveHeight(g + vec2(0.06, 0.0));
  float eY  = weaveHeight(g + vec2(0.0, -0.06)) - weaveHeight(g + vec2(0.0, 0.06));
  float lit = clamp(0.5 + (eX + eY) * 1.7 * max(u_clothDepth, 0.0), 0.05, 1.0);
  vec3  threadCol = vec3(0.050, 0.054, 0.072);    // cool dark linen
  vec3  cloth = mix(BG, threadCol, hC) * (0.45 + 1.0 * lit);
  // a hashed thread-by-thread tone variation so the linen looks hand-woven
  cloth *= 0.85 + 0.30 * hash21(floor(g) + 0.5);
  col = mix(BG, cloth, clamp(u_weave, 0.0, 1.5));

  // warm the working band faintly (raking light where the needle works)
  float warmBand = exp(-abs(fc.y - bandY) / (cell * 3.0)) * 0.06;
  col += mix(c2, c0, 0.5) * warmBand;

  // ---- needle sweep (boustrophedon) ----
  float colsAcross = COLS;
  float dirRow     = mod(rowInt, 2.0);            // 0 -> L->R, 1 -> R->L
  float eased      = smoothstep(0.0, 1.0, rowFrac);
  float needleCol  = mix(0.0, colsAcross, eased);
  float sweepCol   = mix(colF, colsAcross - colF, dirRow);

  // ---- has this stitch been planted yet? ----
  float planted = 0.0;
  if (rowIdx < rowInt - 0.5) {
    planted = 1.0;                                // older rows above, fully done
  } else if (abs(rowIdx - rowInt) < 0.5) {
    planted = step(sweepCol, needleCol);          // current row up to the needle
  }
  // rowIdx > rowInt -> future rows below the band, still bare cloth

  // ---- age / fade: rows drift up and dim into the dark (receding into memory) --
  float age  = rowInt - rowIdx;                   // 0 at needle row, grows upward (older)
  float fade = 1.0 - smoothstep(rowsLit * 0.35, rowsLit, age);
  fade       = clamp(fade, 0.0, 1.0);

  // ---- sampler bands: several stitch-rows make one motif band ----
  const float BAND_H = 4.0;
  float bandIdx  = floor(rowIdx / BAND_H);
  float byInBand = rowIdx - bandIdx * BAND_H;

  // per-band tint: each band takes essentially ONE palette colour, stepped by a
  // golden-ratio walk so the stack reads as a restrained rainbow.
  float tintH = hash11(bandIdx * 1.37 + 3.1);
  float s4    = fract(bandIdx * 0.61803 + tintH * 0.18) * 4.0;
  float w0 = wheelW(s4, 0.0), w1 = wheelW(s4, 1.0), w2 = wheelW(s4, 2.0), w3 = wheelW(s4, 3.0);
  w0 = pow(w0, 2.2); w1 = pow(w1, 2.2); w2 = pow(w2, 2.2); w3 = pow(w3, 2.2);
  vec3 rowCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ---- folk-sampler motif, hashed per band, biased by complexity ----
  float cmplx    = clamp(u_complexity, 1.0, 8.0);
  float motifSel = hash11(bandIdx * 2.71 + 11.0);
  float biased   = clamp(motifSel * (1.0 - (cmplx - 1.0) / 7.0 * 0.7) + (cmplx - 1.0) / 7.0 * 0.62, 0.0, 0.999);
  float motif    = floor(biased * 5.0);           // 0..4

  float cx = colIdx;
  float by = byInBand;

  float stripe = step(abs(by - 1.5), 1.0);

  float zphase = mod(cx, BAND_H * 2.0 - 2.0);
  float ztri   = abs(zphase - (BAND_H - 1.0));
  float zigzag = step(abs(by - ((BAND_H - 1.0) - ztri)), 0.55);

  float dx      = abs(mod(cx, 4.0) - 2.0);
  float dyl     = abs(by - 1.5);
  float diamond = step(abs((dx + dyl) - 2.0), 0.7);

  float check = step(0.5, mod(floor(cx * 0.5) + floor(by * 0.5), 2.0));

  float bord      = step(by, 0.5) + step(BAND_H - 1.5, by);
  float medCtr    = step(abs(mod(cx, 8.0) - 4.0) + abs(by - 1.5) - 1.6, 0.0);
  float medallion = clamp(bord + medCtr, 0.0, 1.0);

  float sel0 = step(abs(motif - 0.0), 0.5);
  float sel1 = step(abs(motif - 1.0), 0.5);
  float sel2 = step(abs(motif - 2.0), 0.5);
  float sel3 = step(abs(motif - 3.0), 0.5);
  float sel4 = step(abs(motif - 4.0), 0.5);
  float on = stripe*sel0 + zigzag*sel1 + diamond*sel2 + check*sel3 + medallion*sel4;

  on *= step(0.5, byInBand) * step(byInBand, BAND_H - 1.5) + sel4;
  on  = clamp(on, 0.0, 1.0);

  float density = mix(0.82, 0.98, (cmplx - 1.0) / 7.0);
  float keep    = step(hash21(vec2(cx, rowIdx) + 0.5), density);
  on = on * keep;

  // ---- draw the X (two diagonal dashes) for this cell, if present and planted ----
  vec2  lp  = vec2(inRowX, inRowY) - 0.5;
  float th  = (0.085 + 0.02 * (8.0 - cmplx) / 7.0);
  float hl  = 0.30;
  float aa  = 1.2 / cell;
  float d1  = dash(lp, 1.0, th, hl);
  float d2  = dash(lp, -1.0, th, hl);
  float dX  = min(d1, d2);
  float xMask = (1.0 - smoothstep(0.0, aa, dX)) * on * planted;

  // ---- needle glint: a small bright spark at the current planting head ----
  float headColCloth = mix(needleCol, colsAcross - needleCol, dirRow);
  vec2  headCell     = vec2(headColCloth, rowInt + 0.5);
  vec2  cellHere     = vec2(colF, rowF);
  float headDist     = length(cellHere - headCell);
  // a faint trailing thread back to the last planted stitch in the sweep
  float popDist      = abs(sweepCol - needleCol);
  float pop          = exp(-popDist * popDist * 3.0) * planted * on;
  float glint        = exp(-headDist * headDist * 2.0) * max(u_glint, 0.0);

  // ---- compose ----
  vec3  stitchCol = rowCol;
  float bright    = 1.18 + 0.6 * pop;
  col += stitchCol * xMask * bright * fade;

  // faint underglow on the cloth within lit rows so the bands read as fabric
  float bandGlow = fade * on * planted * 0.05;
  col += stitchCol * bandGlow;

  // needle spark (white-hot core tinted by the current row colour), tamed
  col += mix(vec3(1.0), stitchCol, 0.4) * glint * 0.55;

  // gentle top-darken so the oldest cloth recedes fully into the dark
  float topFade = 1.0 - smoothstep(0.55, 1.05, fc.y / res.y) * 0.45;
  col *= topFade;

  // subtle vignette to compose the framing
  vec2  uvc  = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.55, 1.15, length(uvc));
  col *= mix(0.82, 1.0, vign);

  // in-shader dither (~1 LSB) to pre-empt 8-bit FBO banding on the dark cloth
  float ign = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
  col += (ign - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
