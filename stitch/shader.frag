// stitch (Loom) — tiny glowing cross-stitches planted one cell at a time by a
// bright needle glint that works back and forth (boustrophedon) across a working
// band. Each completed row carries a hashed folk-sampler motif tinted from one
// palette colour; the finished cloth drifts slowly up-frame and dims into the
// dark. Near-black aida cloth elsewhere, faintly warmed under the working band.
// The image is BUILT by accumulation: a moving work-point rasters the grid, the
// fabric growing behind it and aging out above — phase-continuous, no reset.
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
uniform float u_sewSpeed;    // needle travel + planting rate    (default 0.6)
uniform float u_stitchCss;   // cross-stitch cell size, css px    (default 12)
uniform float u_rows;        // completed rows kept lit above needle (default 10)
uniform float u_complexity;  // bias toward denser sampler motifs (default 4)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black aida ~#09090B
const float COLS        = 40.0;   // stitches across the working band (const loop bound surrogate)

// hash helpers (no textures): cheap deterministic pseudo-random
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// a single diagonal dash (a rounded line segment) within a cell, half-thickness th.
// dir = +1 for "/" , -1 for "\" . p is local cell coords in [-0.5,0.5].
float dash(vec2 p, float dir, float th, float halfLen) {
  // rotate so the dash lies along x: for a 45deg diagonal use (x +- y)
  vec2 q = vec2((p.x + dir * p.y) * 0.70710678, (p.x - dir * p.y) * 0.70710678);
  float along = clamp(q.x, -halfLen, halfLen);
  float d = length(q - vec2(along, 0.0));
  return d - th;
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

  float cell    = max(u_stitchCss, 1.0) * pr;     // cross-stitch cell size in device px
  float speed   = max(u_sewSpeed, 0.001);
  float rowsLit = max(u_rows, 1.0);               // rows kept lit above the needle

  // ---- coordinate frame: x in cells across, y in cells up from bottom ----
  // The working band sits at a FIXED screen height; finished cloth scrolls up
  // through it. We model an infinite scrolling cloth: a global "rows completed"
  // counter advances with time, and the fabric's vertical offset eases up by one
  // cell per completed row so the build stays phase-continuous (no reset).
  float rowDur  = 1.4 / speed;                    // seconds to plant one row
  float prog    = t / rowDur;                     // rows completed so far (fractional)
  float rowInt  = floor(prog);                    // index of the row being worked NOW
  float rowFrac = fract(prog);                    // 0..1 progress through current row

  // The needle's screen row (the working band) sits low in the frame, leaving
  // most of the frame above it for accumulated, scrolling, dimming cloth.
  float bandY   = res.y * 0.28;                   // device-px height of the working band
  // Absolute cloth-row index at this fragment: rows above bandY are higher index
  // (already completed and scrolling up); rows below are not yet sewn.
  // scrollOff eases the cloth up by rowFrac of a cell so motion is continuous.
  float scrollOff = (prog) * cell;                // continuous upward travel of cloth
  // map fragment Y into cloth space: cloth y grows upward, anchored so the row
  // currently being worked (rowInt) lands at bandY.
  float clothY  = (fc.y - bandY) + scrollOff;     // device px in cloth space
  float rowF    = clothY / cell;                  // fractional cloth-row coordinate
  float rowIdx  = floor(rowF);                    // which absolute cloth row this is
  float inRowY  = fract(rowF);                    // 0..1 within the row

  // column coordinate (boustrophedon handled via needle position, not geometry)
  float colF    = fc.x / cell;
  float colIdx  = floor(colF);
  float inRowX  = fract(colF);

  // ---- has this stitch been planted yet? ----
  // Cloth scrolls UP: higher fc.y → higher rowIdx → OLDER, completed rows.
  //   rowIdx > rowInt  → already-sewn, scrolling up & dimming.
  //   rowIdx == rowInt → the row being worked NOW (partial, up to the needle).
  //   rowIdx < rowInt  → not yet reached: empty near-black cloth below the band.
  float colsAcross = COLS;
  // boustrophedon: even rows sew left→right, odd rows right→left
  float dirRow   = mod(rowInt, 2.0);              // 0 → L→R, 1 → R→L
  // needle column position within the current row (with soft turn pause at ends)
  // ease rowFrac with a smoothstep so the needle slows at the turns
  float eased    = smoothstep(0.0, 1.0, rowFrac);
  float needleCol = mix(0.0, colsAcross, eased);
  // map this fragment's column to a "sweep coordinate" in sew direction
  float sweepCol  = mix(colF, colsAcross - colF, dirRow); // flips for odd rows
  float needleHere = needleCol;

  float planted = 0.0;
  if (rowIdx > rowInt + 0.5) {
    planted = 1.0;                                // older rows fully done
  } else if (abs(rowIdx - rowInt) < 0.5) {
    // current row: planted where the needle has already passed
    planted = step(sweepCol, needleHere);
  }
  // future rows (below the band) stay 0

  // ---- age / fade: oldest rows (high rowIdx above needle) dim toward black ----
  float age      = rowIdx - rowInt;               // 0 at needle row, grows upward
  // visible band is rowsLit rows tall above the needle, then fades out
  float fade     = 1.0 - smoothstep(rowsLit * 0.5, rowsLit, age);
  fade           = clamp(fade, 0.0, 1.0);

  // ---- band groups: several stitch-rows make one sampler band, so 2D motifs
  // (zigzag/diamond/check) can actually be read. Motif + tint are chosen per
  // band group; tint steps gently between bands for the restrained-rainbow stack.
  const float BAND_H = 4.0;                        // stitch-rows per sampler band
  float bandIdx  = floor(rowIdx / BAND_H);         // which band group
  float byInBand = rowIdx - bandIdx * BAND_H;      // 0..BAND_H-1 row within band

  // ---- per-band tint: each band takes essentially ONE palette colour. Step the
  // hue decisively from band to band (golden-ratio walk) so the stack reads as a
  // restrained rainbow rather than one colour; a small jitter keeps it organic.
  float tintH    = hash11(bandIdx * 1.37 + 3.1);
  float s4       = fract(bandIdx * 0.61803 + tintH * 0.18) * 4.0;
  float w0 = wheelW(s4, 0.0), w1 = wheelW(s4, 1.0), w2 = wheelW(s4, 2.0), w3 = wheelW(s4, 3.0);
  // sharpen toward the nearest palette entry so each band is nearly a pure hue
  w0 = pow(w0, 2.2); w1 = pow(w1, 2.2); w2 = pow(w2, 2.2); w3 = pow(w3, 2.2);
  vec3  rowCol   = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ---- folk-sampler motif, hashed per band, biased by complexity. 5 families:
  //  0 running stripes, 1 zigzag, 2 diamond lattice, 3 check, 4 bordered medallion
  float cmplx    = clamp(u_complexity, 1.0, 8.0);
  float motifSel = hash11(bandIdx * 2.71 + 11.0);
  // bias selection toward higher (denser) motifs as complexity rises
  float biased   = clamp(motifSel * (1.0 - (cmplx - 1.0) / 7.0 * 0.7) + (cmplx - 1.0) / 7.0 * 0.62, 0.0, 0.999);
  float motif    = floor(biased * 5.0);            // 0..4

  // cell coords: x across, y within the band (0..BAND_H-1)
  float cx = colIdx;
  float by = byInBand;

  // running stripes: solid horizontal running line on the band's mid rows
  float stripe = step(abs(by - 1.5), 1.0);         // fill the central 2 rows fully

  // zigzag: a chevron that climbs then descends across the band height
  float zphase = mod(cx, BAND_H * 2.0 - 2.0);      // 0..2H-2 triangle period
  float ztri   = abs(zphase - (BAND_H - 1.0));     // V shape 0..H-1
  float zigzag = step(abs(by - ((BAND_H - 1.0) - ztri)), 0.55);

  // diamond lattice: |x| + |y| outline within each 4x4 tile
  float dx     = abs(mod(cx, 4.0) - 2.0);
  float dyl    = abs(by - 1.5);                     // centre of band
  float diamond = step(abs((dx + dyl) - 2.0), 0.7);

  // check: 2x2 blocks of stitches
  float check  = step(0.5, mod(floor(cx * 0.5) + floor(by * 0.5), 2.0));

  // bordered medallion: solid top/bottom border rows + a centred diamond medallion
  float bord   = step(by, 0.5) + step(BAND_H - 1.5, by);
  float medCtr = step(abs(mod(cx, 8.0) - 4.0) + abs(by - 1.5) - 1.6, 0.0);
  float medallion = clamp(bord + medCtr, 0.0, 1.0);

  // pick the motif's on-mask via weighted select (no dynamic indexing)
  float sel0 = step(abs(motif - 0.0), 0.5);
  float sel1 = step(abs(motif - 1.0), 0.5);
  float sel2 = step(abs(motif - 2.0), 0.5);
  float sel3 = step(abs(motif - 3.0), 0.5);
  float sel4 = step(abs(motif - 4.0), 0.5);
  float on = stripe*sel0 + zigzag*sel1 + diamond*sel2 + check*sel3 + medallion*sel4;

  // gap row between bands keeps them legible as separate samplers
  on *= step(0.5, byInBand) * step(byInBand, BAND_H - 1.5) + sel4; // medallion uses full band
  on  = clamp(on, 0.0, 1.0);

  // a whisper of hashed dropout so bands look hand-worked (lighter at high cmplx)
  float density = mix(0.82, 0.98, (cmplx - 1.0) / 7.0);
  float keep    = step(hash21(vec2(cx, rowIdx) + 0.5), density);
  on = on * keep;

  // ---- draw the X (two diagonal dashes) for this cell, if present & planted ----
  vec2 lp   = vec2(inRowX, inRowY) - 0.5;         // local cell coords [-0.5,0.5]
  float th  = (0.085 + 0.02 * (8.0 - cmplx) / 7.0); // dash half-thickness (cell units)
  float hl  = 0.30;                                // dash half-length
  float aa  = 1.2 / cell;                          // ~1px antialias in cell units
  float d1  = dash(lp, 1.0, th, hl);              // "/"
  float d2  = dash(lp, -1.0, th, hl);             // "\"
  float dX  = min(d1, d2);
  float xMask = (1.0 - smoothstep(0.0, aa, dX)) * on * planted;

  // ---- needle glint: bright spark at the current planting head ----
  // its screen position: column = needleCol (in sew dir), row = needle band row
  float headColCloth = mix(needleCol, colsAcross - needleCol, dirRow); // back to cloth cols
  vec2  headCell     = vec2(headColCloth, rowInt + 0.5); // cloth-space cell coords
  vec2  cellHere     = vec2(colF, rowF);
  float headDist     = length(cellHere - headCell);
  // tiny swell as the needle passes a cell: pop-in glow on freshly planted cells
  float popDist      = abs(sweepCol - needleHere);
  float pop          = exp(-popDist * popDist * 2.2) * planted * on;
  float glint        = exp(-headDist * headDist * 0.9);

  // ---- compose ----
  vec3  stitchCol = rowCol;
  // brightness: stitches glow; pop adds a swell; older rows dim via fade
  float bright    = 0.85 + 0.6 * pop;
  col += stitchCol * xMask * bright * fade;

  // faint underglow on the cloth within lit rows so bands read as fabric
  float bandGlow  = fade * on * planted * 0.05;
  col += stitchCol * bandGlow;

  // warm the working band faintly (the un-sewn cloth just under the needle)
  float warmBand  = exp(-abs(fc.y - bandY) / (cell * 2.5)) * 0.05;
  col += mix(c2, c0, 0.5) * warmBand;

  // needle glint spark (white-hot core tinted by current row colour)
  col += mix(vec3(1.0), stitchCol, 0.35) * glint * 0.9;

  // subtle vignette to compose the framing
  vec2  uvc  = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.0, length(uvc));
  col *= mix(0.7, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
