// damask (Burnish) — a heavy damask curtain fills the frame: brick-tiled foliate
// scrollwork (vine-and-scroll motifs built from arc and log-spiral SDF strokes,
// mirrored on alternating rows) woven into cloth that hangs in soft vertical
// pleats. Each pleat's rounded crest catches a fixed satin sheen while its
// valleys sink to true black, so tall lit ribs of ornament alternate with
// drowned folds. The light is bolted down — the cloth does the moving: a draft
// sways the pleats side-to-side, amplitude growing toward the hem, on a sum of
// incommensurate slow sines, and each crest's sheen slides locally as the fold
// rolls beneath it. No band ever travels across the wall.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four motif tints, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swaySpeed;  // multiplies the draft driving the curtain (default 0.35)
uniform float u_pleat;      // pleat width, CSS px (default 150)
uniform float u_tile;       // scrollwork brick size, CSS px (default 160)
uniform float u_fold;       // pleat depth: sway relief + crest/valley contrast (default 0.8)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI = 3.14159265;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// distance to a circular arc centred at the origin, radius R, angular sweep
// [a0,a1] (radians). Returns distance to the nearest point on the arc stroke.
float sdArc(vec2 p, float R, float a0, float a1) {
  float ang = atan(p.y, p.x);
  // wrap ang into a span near the arc range
  float lo = min(a0, a1), hi = max(a0, a1);
  float ca = clamp(ang, lo, hi);
  // nearest point on the arc at clamped angle
  vec2 q = R * vec2(cos(ca), sin(ca));
  return length(p - q);
}

// distance to a logarithmic-spiral stroke sampled as a short chain of segments.
// r = a*exp(b*theta); we march theta and keep the min distance to segments.
float sdLogSpiral(vec2 p, float a, float b, float t0, float t1) {
  float best = 1e9;
  vec2 prev = vec2(0.0);
  // constant loop bound (GLSL ES 1.00): fixed sample count
  const int N = 14;
  for (int i = 0; i <= N; i++) {
    float f  = float(i) / float(N);
    float th = mix(t0, t1, f);
    float r  = a * exp(b * th);
    vec2  cur = r * vec2(cos(th), sin(th));
    if (i > 0) {
      vec2 e = cur - prev;
      vec2 w = p - prev;
      float h = clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
      best = min(best, length(w - e * h));
    }
    prev = cur;
  }
  return best;
}

// One foliate vine-and-scroll motif evaluated in tile-local coords q (-0.5..0.5
// in tile units), returning a soft stroke mask. The motif is left/right mirrored
// (bilateral) and its strokes reach the tile edges so adjacent bricks link into
// a continuous scrolling vine. Built from arc strokes + paired log-spiral curls.
// strokeW = half-width of the etched line; aaW = anti-alias band (both in tile
// units, fed in screen-aware so small tiles stay fine engraving, not smears).
float motif(vec2 q, float strokeW, float aaW) {
  float d = 1e9;

  // bilateral symmetry: fold x so we only describe the right half, mirrored.
  vec2 m = vec2(abs(q.x), q.y);

  // central vertical stem spanning the tile top-to-bottom (connects bricks);
  // a gentle ogee waver so it reads as a living vine, not a ruler
  float ogee = 0.05 * sin(q.y * 6.2831853);
  d = min(d, abs(q.x - ogee));

  // big paired side scrolls (the signature damask C-scroll), mirrored L/R via m.
  // Pulled back (t1 6.6 -> 4.3) and pushed out from the stem so the scroll reads
  // as a distinct C, not a dense knot merging with the central stem.
  d = min(d, sdLogSpiral(m - vec2(0.17, 0.18), 0.020, 0.30, 0.4, 4.3));
  d = min(d, sdLogSpiral(m - vec2(0.17, -0.18), 0.020, 0.30, 0.4, 4.3));

  // connecting arcs from the stem out to the scroll roots (the vine branches)
  d = min(d, sdArc(m - vec2(0.0,  0.18), 0.12, -0.05 * PI, 0.50 * PI));
  d = min(d, sdArc(m - vec2(0.0, -0.18), 0.12, -0.50 * PI, 0.05 * PI));

  // leaf/petal pair flanking the centre
  d = min(d, sdArc(m - vec2(0.30, 0.0), 0.085, 0.35 * PI, 1.25 * PI));

  // central bud rosette
  d = min(d, sdArc(q, 0.050, -PI, PI));

  // soft anti-aliased stroke from the SDF: a tight band keeps strokes fine
  return 1.0 - smoothstep(strokeW, strokeW + aaW, d);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // palette with house fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- sizes in device px ---
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float pleatW = max(u_pleat, 1.0) * refScale * pr;       // pleat period across x
  float tileW = max(u_tile, 1.0) * refScale * pr;        // scrollwork brick size
  float fold   = clamp(u_fold, 0.0, 2.0);      // pleat depth

  // vertical 0 at top, 1 at hem (bottom) — sway amplitude grows toward the hem
  float vy = 1.0 - fc.y / res.y;                // 0 top .. 1 bottom (hem)
  float hem = vy * vy;                          // amplitude grows toward the hem

  // --- the draft: a sum of incommensurate slow sines, no visible reset ---
  float sp = u_swaySpeed;
  float draft = sin(t * 0.31 * sp + 0.0)
              + 0.7 * sin(t * 0.53 * sp + 1.7)
              + 0.5 * sin(t * 0.19 * sp + 4.1);
  draft *= 1.0 / 2.2;                           // normalise to ~[-1,1]
  // local sway varies a little along x so the whole wall doesn't slide rigidly
  float swayPhase = fc.x / pleatW * 0.6;
  float sway = (draft + 0.4 * sin(t * 0.27 * sp + swayPhase));
  // horizontal displacement of the cloth, in px, growing toward the hem
  float swayPx = sway * pleatW * 0.22 * fold * hem;

  // displaced horizontal coordinate of the cloth surface
  float x = fc.x + swayPx;

  // --- pleat profile across x: fold position 0..1 within a pleat ---
  float pf = x / pleatW;                         // pleat units
  float pPhase = fract(pf);                      // 0..1 across one pleat
  // surface normal tilt: cosine fold. crest where the fold faces the fixed light.
  // crest at pPhase=0.5, valleys at the seams (0 / 1).
  float fang = (pPhase - 0.5) * 2.0;             // -1..1 across the pleat
  // depth of the fold roll modulated by fold + a gentle breathing on the draft
  float roll = cos(fang * PI);                   // +1 at crest, -1 at valley seam
  // breathe: folds deepen and relax with the draft (incommensurate)
  float breathe = 0.85 + 0.15 * sin(t * 0.23 * sp + 2.0);
  roll *= breathe;

  // --- fixed light: a satin sheen sits where a crest faces the unseen lamp ---
  // The lamp is bolted down (upper-left). Sheen depends on the local fold facing,
  // which the cloth rolls beneath as it sways — sheen slides locally, not across.
  float facing = clamp(roll, 0.0, 1.0);          // crest faces the light
  // local sheen slide: the bright satin streak rides slightly off-crest as the
  // fold rolls (sway shifts where the specular sits within the pleat)
  float sheenPos = fang - 0.30 * sway * fold;    // streak centre within pleat
  // tighter falloff so the satin streak is a narrow rib, not a broad bright wash
  float sheen = exp(-sheenPos * sheenPos * 9.0) * facing;

  // crest-to-valley luminance envelope: crests lit, valleys drown to black.
  // fold scales the contrast — high fold = valleys truly black. This envelope is
  // the dominant compositional element: tall lit ribs alternating with dark folds.
  float lit = clamp(0.5 + 0.5 * roll, 0.0, 1.0);
  float valley = mix(0.40, 0.01, clamp(fold, 0.0, 1.0)); // floor in valleys
  // sharpen toward the seams so valleys read as crisp dark folds, not a soft band
  float ribLum = pow(lit, mix(1.3, 3.2, clamp(fold, 0.0, 1.0)));
  float foldLum = mix(valley, 1.0, ribLum);

  // --- scrollwork: brick-tiled foliate motif in cloth space ---
  // Use the displaced cloth x so the ornament rides with the pleats (the wall
  // moves, the pattern is fixed to the cloth).
  vec2 cloth = vec2(x, fc.y);
  // brick offset on alternating rows; rows are mirrored vertically for vine-scroll
  float row = floor(cloth.y / tileW);
  float rowOdd = mod(row, 2.0);
  float bx = cloth.x + rowOdd * tileW * 0.5;     // half-brick horizontal offset
  float colId = floor(bx / tileW);
  // local tile coords in -0.5..0.5
  vec2 q = vec2(fract(bx / tileW) - 0.5,
                fract(cloth.y / tileW) - 0.5);
  // mirror the motif vertically on alternating rows (vine-and-scroll alternation)
  if (rowOdd > 0.5) q.y = -q.y;

  // Etched-line width fixed in device pixels, then converted to tile-local units
  // so the engraving stays a fine constant-weight line at any tile size — small
  // wallpaper tiles no longer smear into gummy blobs. A floor keeps tiny tiles
  // from collapsing the stroke below a pixel.
  float lineDevPx = 2.6 * pr;                    // fine etched line, device px
  float strokeW = clamp(lineDevPx / tileW, 0.010, 0.030);
  float aaW = clamp(1.4 * pr / tileW, 0.004, 0.012); // crisp 1px-ish AA band
  float orn = motif(q, strokeW, aaW);

  // motif tint walks the four palette colours by brick row + column phase
  float k = colId * 0.21 + row * 0.13 + 0.05 * sin(t * 0.05);
  float s = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3 tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // --- compose ---
  // base cloth: a very dark tinted ground so the lit ribs read as dyed fabric
  // and valleys fall to near-black. The fold luminance is applied broadly so the
  // whole rib (cloth + ornament) brightens together — a satin sheen, not paint.
  vec3 cloth0 = tint * 0.085 + BG;               // deep dyed fabric base
  // valleys drown toward true black; pow makes the dark folds crisp, not a band
  float groundLum = pow(foldLum, 1.6);
  col = mix(BG * 0.18, cloth0, groundLum);       // dark valleys, lit ribs

  // the ornament sits in the cloth, catching the satin light: brightest where a
  // crest faces the fixed lamp. Ornament is brightened by foldLum AND the sheen
  // (sheen gain pulled back so lit bricks don't float far above their neighbours).
  float ornLight = foldLum * (0.50 + 1.7 * sheen);
  col += tint * orn * ornLight * 1.05;

  // the satin sheen streak lifts the bare cloth along each lit crest
  col += tint * (0.16 + 0.20 * orn) * sheen * 1.15;

  // rare glints: punctuate the orbit where a crest, a motif stroke, and the
  // draft peak coincide — sparse bright catches, not a constant shimmer. Gated
  // harder and weaker so a few bricks no longer flare brighter than the field.
  float glintGate = smoothstep(0.90, 1.0, sheen) *
                    smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(t * 0.41 * sp + colId * 1.3 + row * 0.7));
  col += tint * orn * glintGate * 1.0;
  col += vec3(1.0) * orn * glintGate * 0.22;

  // a faint specular bloom on the crest so the satin reads as cloth, not paint
  float bloom = sheen * (0.10 + 0.30 * orn);
  col += tint * bloom * 0.6;

  // gentle vignette to settle the corners into the dark; keep the hem readable
  vec2 vq = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.55, 1.05, length(vq) * 1.2);
  col *= mix(0.80, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
