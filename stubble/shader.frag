// stubble (Smolder) — a harvested field at night seen from straight above.
// Parallel windrows of stubble cross the frame on a shallow diagonal: an
// anisotropic comb of short dash striations stretched along the row direction,
// the unburned side a half-step above black. An invisible FBM-perturbed burn
// front advances across the rows roughly perpendicular to them, but the glow
// is gated HARD by the fuel — it exists only where the front overlaps a
// windrow, and is suppressed to near-zero in the bare gaps between rows, so no
// continuous edge is ever drawn. The fire reads as a chain of discrete
// point-fires catching one row after another, each igniting with a prominent
// flare; within each lit point the four palette colours grade across the
// front's width from the leading hot edge to the trailing cool side. Behind
// the front lie char rows a tone darker, dressed with sparse cooling sparks
// aligned to the row direction. Two staggered burn fields crossfade while
// featureless (both states near-black), so the relay never pauses or retreats.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_lineSpeed;      // how fast the fire line advances across the rows (default 0.22)
uniform float u_rowSpacing;     // CSS px between windrows, scaled by u_pixelRatio; wider = longer dark gaps (default 32)
uniform float u_flareIntensity; // strength of the catch-flare when a fresh row ignites; 0 removes flares (default 1)
uniform float u_sparkDensity;   // how many cooling sparks lie along the charred rows (default 0.35)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black
const float TAU = 6.28318530718;
// row direction (unit) — windrows run along this; the front advances across it
const vec2  ROW  = vec2(0.9701, 0.2425);     // shallow diagonal (~14 deg)
const vec2  CROSS = vec2(-0.2425, 0.9701);   // perpendicular: front travel axis

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.17));
}

// smooth value noise (C1, safe to difference for gradients)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fbm, rotated per octave; range ~[0,0.94], mean ~0.5
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.616, 1.214, -1.214, 1.616);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// graded ember ramp across the front width: q in [0,1], 0 = leading hot edge,
// 1 = trailing cool side. hottest c3, cooling through c1, c0, into c2.
vec3 emberRamp(float q, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 r = c3;
  r = mix(r, c1, smoothstep(0.06, 0.34, q));
  r = mix(r, c0, smoothstep(0.34, 0.62, q));
  r = mix(r, c2, smoothstep(0.62, 0.98, q));
  return r;
}

// fbm offset evaluated at a windrow's centreline so the whole row shares one
// front-crossing value (keeps each row catching as a single event).
float fbmPxAtRow(vec2 cssP, float along, float rowId, float rowSp, vec2 seed) {
  // sample fbm along the row at this `along` but at the row's nominal centre
  vec2 q = vec2(along, (rowId + 0.5) * rowSp);
  return (fbm(q / 150.0 + seed) - 0.5) * rowSp * 5.0;
}

// one burn field. Coordinates: `along` = position along a row (px),
// `across` = position across rows (px, the front-travel axis). The front is a
// receding FBM-perturbed threshold in `across`; glow exists only on a lit dash
// of a windrow. Returns additive colour for this field.
vec3 shadeField(vec2 cssP, float along, float across, float phase, vec2 seed,
                vec3 c0, vec3 c1, vec3 c2, vec3 c3,
                float rowSp, float frontPx, float pre, float spanPx, float T,
                float rate, float t, float pr, float flare, out float charMask) {
  // ---- windrow geometry: rows centred every rowSp along the `across` axis.
  float rowF   = across / rowSp;       // continuous row coordinate
  float rowId  = floor(rowF);
  float rowFr  = fract(rowF);          // 0..1 within the row band
  // fuel profile across a row: a fat dash band centred in the band, near-zero
  // in the bare gap between rows (this is the hard fuel gate).
  float rowProf = smoothstep(0.10, 0.30, rowFr) * (1.0 - smoothstep(0.70, 0.90, rowFr));
  // per-row jitter so windrows don't read perfectly regular
  float rj = hash21(vec2(rowId, 7.3) + seed) - 0.5;

  // dash striations ALONG the row: short bright segments separated by gaps,
  // length stretched along ROW. Each (row, dash) cell is one piece of fuel.
  float dashLen = rowSp * 1.7;                 // dashes ~1.7x row spacing long
  float dashF   = (along + rj * dashLen) / dashLen;
  float dashId  = floor(dashF);
  float dashFr  = fract(dashF);
  float dashProf = smoothstep(0.04, 0.16, dashFr) * (1.0 - smoothstep(0.78, 0.94, dashFr));
  vec2  cellId  = vec2(dashId, rowId);
  vec2  hv      = hash22(cellId * 1.31 + seed * 3.7);
  // dash present at all? thin out a little so the comb looks hand-cut
  float present = step(0.14, hv.x);
  float fuel    = rowProf * dashProf * present;

  // ---- the burn front: a receding threshold in the `across` coordinate,
  // perturbed by a STATIC fbm so it advances with a ragged, never-retreating
  // line. `c` is the threshold position in px; cells with crossPos < c are lit
  // or burnt, ahead are virgin.
  float frontAt = -pre + spanPx * phase;      // threshold sweeps forward in px

  // signed distance from this fragment's row-centre to the front (px).
  // We evaluate the front per WINDROW (at the row's centreline), so a whole
  // row catches as one event rather than the front cutting through it.
  float rowCenter = (rowId + 0.5) * rowSp + fbmPxAtRow(cssP, along, rowId, rowSp, seed);
  float sd = rowCenter - frontAt;             // >0 row not yet reached, <0 passed

  // q across the front width: 0 at leading hot edge, 1 trailing
  float q = -sd / frontPx;
  // how long (in this field's phase-seconds) since the front passed the row
  float tau = max(-sd, 0.0) / max(rate * spanPx, 1.0);

  // ---- catch-flare: a fresh row ignites with a prominent, brief flare — the
  // brightest event on screen — then banks into a graded ember bead.
  float ignite = smoothstep(0.0, 0.06, tau) * exp(-tau * 1.7);
  float flarePow = ignite * (0.5 + 1.5 * hv.y);

  // active ember envelope across the front width (only where the row is at/just
  // behind the threshold)
  float on  = smoothstep(1.0, -frontPx * 0.5, sd); // 1 when sd<0 region
  float env = on * (0.10 + 0.90 * exp(-max(q, 0.0) * 2.0)) * (1.0 - smoothstep(0.9, 1.5, q));
  vec3  ramp = emberRamp(clamp(q, 0.0, 1.0), c0, c1, c2, c3);
  // slow incandescent shimmer (intensity only — contour is fixed)
  float sh = 0.80 + 0.35 * vnoise(cssP / 60.0 + vec2(t * 0.6, -t * 0.4) + seed);

  // ---- assemble glow, GATED HARD by fuel so gaps stay near-black ----
  vec3 col = vec3(0.0);
  // graded ember bead at the lit point
  col += ramp * env * fuel * 1.25 * sh;
  // the prominent catch-flare: a hot near-white burst on the freshly-lit fuel
  vec3 flareCol = mix(vec3(1.0, 0.92, 0.74), c3, 0.35);
  col += flareCol * flarePow * fuel * 1.6 * flare * sh;
  // faint cooling afterglow that lingers a moment on the just-burnt fuel
  col += (c3 * 0.5 + c2 * 0.5) * fuel * 0.18 * exp(-tau * 0.8) * step(0.0, tau);

  // ---- cooling sparks aligned to the row, on the char side behind the front.
  // tau is per-row (a whole row passes at once), so each spark cell gets its own
  // randomised delay/life staggered over several seconds; this scatters cooling
  // sparks back through the char band rather than flashing all rows at once.
  if (u_sparkDensity > 0.0005 && tau > 0.0) {
    // spark cells march along the row within this windrow's dash band
    float sCell = rowSp * 0.7;
    float si = floor((along + rj * 30.0) / sCell);
    for (int k = -2; k <= 2; k++) {
      float sc = si + float(k);
      vec2  sh2 = hash22(vec2(sc, rowId) * 1.71 + seed * 5.1);
      if (sh2.x < u_sparkDensity) {
        float h3 = hash21(vec2(sc, rowId) + seed + 4.4);
        float delay = 0.1 + 9.0 * h3;              // staggered across the char band
        float life  = 1.0 + 3.0 * fract(h3 * 17.3);
        float ts = tau - delay;
        if (ts > 0.0 && ts < life) {
          float lf = ts / life;
          float amp = smoothstep(0.0, 0.12, lf) * (1.0 - lf) * (1.0 - lf);
          float flick = 0.7 + 0.3 * sin(ts * 16.0 + sh2.y * TAU);
          // position: jittered along the row, pinned to the windrow centreline
          float salong = (sc + 0.5 + (sh2.y - 0.5) * 0.7) * sCell - rj * 30.0;
          float dAlong = (along - salong);
          float dAcross = (rowFr - 0.5) * rowSp;     // distance to row centre
          // anisotropic: sparks are stretched along the row
          float d2 = (dAlong * dAlong) / (rowSp * rowSp * 0.9) + (dAcross * dAcross) / (rowSp * rowSp * 0.06);
          float core = exp(-d2 * 4.5);
          vec3 sCol = mix(mix(vec3(1.0, 0.92, 0.74), c3, 0.45), mix(c2, c0, 0.4) * 0.7, smoothstep(0.2, 0.9, lf));
          col += sCol * amp * flick * core * 3.4 * rowProf;
        }
      }
    }
  }

  // char mask: how "consumed" this fragment is (1 well behind the front), used
  // by the caller to darken burnt rows a tone below the standing ones.
  charMask = smoothstep(-frontPx * 0.4, frontPx * 1.2, -sd) * rowProf;
  return col;
}

// visibility weight over a field's phase: rises while still all-virgin, falls
// once fully char. Rise/fall sit half a cycle apart so two staggered fields
// always sum to ~1 — no brightness dip at the crossfade.
float vis(float p) {
  return smoothstep(0.10, 0.19, p) * (1.0 - smoothstep(0.88, 0.97, p));
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr    = max(u_pixelRatio, 0.25);
  vec2  fragPx = gl_FragCoord.xy;
  vec2  cssP   = fragPx / pr;
  float t      = u_time;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float rowSp = max(u_rowSpacing, 6.0) * refScale * pr;           // px between windrows
  float frontPx = rowSp * 1.3;                          // graded front width (px)
  float flare  = clamp(u_flareIntensity, 0.0, 1.5);

  // row-aligned coordinates (px)
  float along  = dot(fragPx, ROW);
  float across = dot(fragPx, CROSS);

  // ---- sweep timing. The front travels across the whole frame's `across`
  // extent plus generous margins so each field is fully virgin while it fades
  // in and fully char while it fades out.
  float extent = abs(dot(u_resolution.xy, CROSS));      // across-span of frame
  float rate   = max(u_lineSpeed, 0.001) * 0.10;        // phase units / sec
  float pre    = extent * 0.30 + rowSp * 4.0;           // virgin margin (px)
  float post   = extent * 0.20 + rowSp * 4.0;           // char margin (px)
  float spanPx = pre + extent + post;
  float T      = 1.0;                                   // phase is already 0..1

  float ph0 = fract(t * rate + 0.41);
  float ph1 = fract(ph0 + 0.5);
  float w0  = vis(ph0);
  float w1  = vis(ph1);

  // standing stubble base: faint comb a half-step above black, modulated by the
  // same row/dash profile so the unburned field reads as a textured comb.
  float rowF0   = across / rowSp;
  float rowFr0  = fract(rowF0);
  float rowProf0 = smoothstep(0.10, 0.30, rowFr0) * (1.0 - smoothstep(0.70, 0.90, rowFr0));
  float dashLen0 = rowSp * 1.7;
  float dashFr0  = fract(along / dashLen0);
  float dashProf0 = smoothstep(0.04, 0.16, dashFr0) * (1.0 - smoothstep(0.78, 0.94, dashFr0));
  float standMask = rowProf0 * dashProf0;
  // base field: near-black ground, stubble a half-step above it
  float grain = vnoise(cssP / 7.0) * 0.5 + vnoise(cssP / 23.0 + 3.1) * 0.5;
  vec3 ground  = BG * (0.85 + 0.25 * grain);
  vec3 standing = mix(ground, BG * 1.5 * (0.8 + 0.4 * grain), standMask);

  // accumulate the two staggered burn fields
  float ch0 = 0.0, ch1 = 0.0;
  vec3 fire = vec3(0.0);
  if (w0 > 0.001) {
    fire += w0 * shadeField(cssP, along, across, ph0, vec2(2.7, 13.1),
                            c0, c1, c2, c3, rowSp, frontPx, pre, spanPx, T,
                            rate, t, pr, flare, ch0);
  }
  if (w1 > 0.001) {
    fire += w1 * shadeField(cssP, along, across, ph1, vec2(-9.3, 6.7),
                            c0, c1, c2, c3, rowSp, frontPx, pre, spanPx, T,
                            rate, t, pr, flare, ch1);
  }
  float charMask = clamp(w0 * ch0 + w1 * ch1, 0.0, 1.0);

  // char rows a tone darker than the standing ones (only on fuelled rows)
  vec3 charRow = standing * mix(1.0, 0.45, standMask);
  vec3 col = mix(standing, charRow, charMask);
  col += fire;

  // gentle vignette to seat the field
  vec2 uv = fragPx / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.32 * smoothstep(0.35, 1.05, length(uv - 0.5) * 1.42);

  // tiny dither to keep the long glow gradients band-free
  col += (hash21(fragPx + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
