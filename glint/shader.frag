// glint (Shoal) — moonlight on dark open water. A horizon line sits in the upper
// third; below it a vertical glitter path descends toward the viewer — tiny
// horizontally-stretched specular highlights on a perspective grid whose rows
// compress and densify toward the horizon and grow sparser/larger near the
// bottom. A faint cool vertical sheen marks the path's spine; outside the column
// the water is near-black with only the barest swell shading. A slow heave (two
// superimposed sinusoidal swells in perspective space) carries glints up and
// down and modulates each one's flicker phase, so highlights ignite and die
// asynchronously over 1–4s lives, every flicker passing through zero brightness
// to hide per-glint repositioning. Pure sinusoids — the sea never resets.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_heaveSpeed;  // swell + flicker speed             (default 0.35)
uniform float u_glintCss;    // highlight height in css px        (default 2.5)
uniform float u_pathCss;     // column width at bottom, css px     (default 340)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float HORIZON_Y   = 0.685;  // horizon as fraction up the frame (upper third)
const float ROWS        = 26.0;   // number of perspective rows below the horizon
const float STRETCH     = 4.0;    // anisotropy: glint width / height

// hash helpers (no textures) — cheap, stable per-integer-cell randoms
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized screen coords; uv.y 0 at bottom, 1 at top
  vec2 uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);

  vec3 col = BG;

  // Palette with house fallback (headless contexts can zero the array).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float heave = max(u_heaveSpeed, 0.0);
  float glintH = max(u_glintCss, 0.5) * pr;            // highlight half-height-ish
  float pathW  = max(u_pathCss, 40.0) * pr;            // column width at bottom (px)

  // ---- horizon + sky -------------------------------------------------------
  float horizonPx = HORIZON_Y * res.y;
  // a faint moon-glow band hugging the horizon along the path's spine
  float distAbove = (fc.y - horizonPx) / res.y;        // >0 above horizon
  // sky: very dark, a barely-there cool wash that brightens toward horizon
  float skyMask = smoothstep(0.0, 0.16, distAbove);
  // Column chrome hue: blend cool cyan/blue (c2/c0) with the palette's warm/violet
  // entries (c1/c3) so the dominant sheen, halo, seam and bg-swell re-theme with
  // the palette instead of staying locked near cyan across every theme.
  vec3  moonHue = normalize(c2 * 0.85 + c0 * 0.45 + c1 * 0.55 + c3 * 0.30 + 1e-4);
  // horizon moon halo, centred on the column's x, fading upward
  float colX = 0.5;                                    // path centre (frame middle)
  float dx0  = (uv.x - colX) * aspect;
  float halo = exp(-max(distAbove, 0.0) * 26.0) * exp(-dx0 * dx0 * 16.0);
  col = mix(col, col + moonHue * 0.05, skyMask * 0.4);
  col += moonHue * halo * 0.14;

  // a crisp-ish horizon seam (where water meets sky)
  float seam = exp(-abs(fc.y - horizonPx) / (2.0 * pr));
  col += moonHue * seam * 0.05 * exp(-dx0 * dx0 * 3.0);

  // Everything below is water. Mask out the sky region for the glitter pass.
  float waterMask = smoothstep(0.004, 0.02, (horizonPx - fc.y) / res.y);

  // ---- perspective water field --------------------------------------------
  // Map screen y (below horizon) to a ground-plane depth. yb = 0 at the bottom
  // edge (nearest the viewer) and 1 at the horizon (the far plane). A reciprocal
  // makes `depth` small near the viewer and shoot up toward the horizon, so
  // perspective rows compress and densify toward the horizon and spread out,
  // sparser and larger, near the bottom — exactly the spec's grading.
  float yb = fc.y / max(horizonPx, 1.0);               // 0 at bottom -> 1 at horizon
  yb = clamp(yb, 0.0, 1.0);
  float depth = 1.0 / max(1.0 - yb * 0.985, 0.015);    // ~1 (near) .. ~67 (far/horizon)

  // --- the heave: two superimposed sinusoidal swells in perspective space ---
  // They shift the row coordinate up/down (vertical heave) and feed flicker.
  float swellA = sin(depth * 0.9  - t * heave * 1.7);
  float swellB = sin(depth * 0.37 + t * heave * 1.05 + 1.7);
  float swell  = swellA * 0.6 + swellB * 0.4;           // -1..1

  // Row coordinate along depth — denser (rows per depth high) near horizon
  // because depth changes slowly there; we sample by depth directly so density
  // grades naturally. Apply the heave as a sub-row vertical wobble.
  // global slow heave drifts the whole field of rows up and down together, on
  // top of the per-depth swell — the unhurried slosh of shallow water.
  float drift    = sin(t * heave * 0.8) * 0.6 + sin(t * heave * 0.43 + 2.1) * 0.4;
  float rowCoord = depth * 1.6 + swell * 0.5 + drift * 0.8;
  float rowId    = floor(rowCoord);
  float rowF     = fract(rowCoord);

  // Column coordinate: the glitter path widens toward the bottom (near) and is a
  // thin lane near the horizon (perspective convergence). Path half-width in uv:
  float nearHalf = (pathW * 0.5) / res.x;               // bottom half-width (uv.x)
  // full width at the bottom (near), converging to a sliver at the horizon
  float pathHalf = nearHalf * mix(1.0, 0.06, yb);
  float halfCells = max(pathHalf * aspect, 0.001);

  // horizontal cell index across the path; cell size scales so ~same count of
  // glints per row regardless of width (anisotropic, stretched horizontally).
  float colsPerRow = 11.0;                              // glints across the lane
  float u2 = (uv.x - colX) * aspect;                    // centred, aspect-corrected
  float colNorm = u2 / max(halfCells, 1e-3);            // -1..1 inside the lane
  float colCoord = (colNorm * 0.5 + 0.5) * colsPerRow;  // 0..colsPerRow
  float colId    = floor(colCoord);
  float colF     = fract(colCoord);

  float insideLane = 1.0 - smoothstep(0.92, 1.0, abs(colNorm));

  // per-glint random seed (stable across the cell)
  vec2  cellSeed = vec2(rowId, colId);
  float rnd  = hash21(cellSeed);
  float rnd2 = hash21(cellSeed + 17.3);
  float rnd3 = hash21(cellSeed + 41.1);

  // jitter the glint within its cell (centre + per-cell offset)
  float cx = 0.5 + (rnd  - 0.5) * 0.7;
  float cy = 0.5 + (rnd2 - 0.5) * 0.7;

  // within-cell offset from the glint centre, in cell fractions (~ -0.5..0.5)
  float dyCell = (rowF - cy);                           // along row (vertical)
  float dxCell = (colF - cx);                           // along col (horizontal)

  // Approximate this cell's on-screen size in pixels so we can convert the
  // requested css-px glint height into a cell-fraction radius. Rows compress
  // toward the horizon (rowPx small there) and columns are wider near the
  // bottom — exactly the density/size grading the spec calls for.
  float rowPx = horizonPx * (1.0 / max(depth, 1.0)) * 0.95; // px height of a row band
  float colPx = (2.0 * halfCells * res.x) / colsPerRow;     // px width of a col cell
  rowPx = max(rowPx, 1.0);
  colPx = max(colPx, 1.0);

  // glint half-extents as cell fractions; clamp so a glint never fills its cell
  float gh = max(glintH, 0.5 * pr);                    // half-height in px
  float gw = gh * STRETCH;                             // half-width in px (anisotropic)
  float ry = clamp(gh / rowPx, 0.03, 0.30);            // vertical radius (cell frac)
  float rx = clamp(gw / colPx, 0.10, 0.48);            // horizontal radius (cell frac)
  rx = max(rx, ry * STRETCH * 0.6);                    // keep glints horizontally stretched

  // anisotropic gaussian footprint in cell-fraction space
  float gd = (dxCell * dxCell) / (rx * rx) + (dyCell * dyCell) / (ry * ry);
  float spark = exp(-gd * 1.6);

  // ---- flicker: every glint breathes through zero brightness ---------------
  // phase per glint, modulated by the swell so flicker is asynchronous and
  // coupled to the sea. Lives ~1–4s depending on rnd.
  float life  = mix(1.0, 4.0, rnd3);                   // seconds per cycle (at heave=0.35)
  float phase = (t * heave * 2.9) / max(life, 0.4) * 6.2831853
              + rnd * 6.2831853
              + swell * 1.6;                            // swell modulates phase
  // raised-sine envelope that passes through 0 each cycle (hides repositioning)
  float flick = sin(phase) * 0.5 + 0.5;
  flick = smoothstep(0.0, 1.0, flick);                  // ease, but still reach 0

  // brightness fades with depth a touch (far glints fainter) but horizon stays
  // dense so it still reads as a band
  float depthFade = mix(1.0, 0.62, smoothstep(1.0, 45.0, depth));

  float glint = spark * flick * insideLane * waterMask * depthFade;

  // ---- glint colour: shifts subtly along the path -------------------------
  // hue drifts with depth + a slow time roll, blended from the palette. The wheel
  // position spreads wider (×1.0 instead of being clustered cool) so warm/violet
  // palette entries surface along the path, reinforcing both the path-colour-shift
  // and the re-theme.
  float kk = depth * 0.06 + colId * 0.045 + t * 0.02 + rnd * 0.45;
  float s  = fract(kk) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  glintCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
  // moonlit glints lean cool/white — mix toward a pale moon tint, but lightly so
  // the palette saturation survives and the re-theme reads (was 0.35, washed hue).
  glintCol = mix(glintCol, vec3(0.85, 0.90, 1.0), 0.18);

  // ---- the spine sheen: faint cool vertical glow down the column ----------
  float spine = exp(-(colNorm * colNorm) * 2.0) * waterMask;
  // brighter near the horizon where the column converges
  spine *= mix(0.35, 1.0, yb);
  col += moonHue * spine * 0.07;

  // ---- barest swell shading outside the column ----------------------------
  // a very low-amplitude brightness ripple so the dark water isn't flat
  float bgSwell = (sin(depth * 1.3 - t * heave * 1.4) * 0.5 + 0.5);
  col += moonHue * bgSwell * 0.012 * waterMask * (1.0 - insideLane * 0.6);

  // ---- composite glints ----------------------------------------------------
  col += glintCol * glint * 2.3;
  // a soft bloom under each bright glint
  col += glintCol * exp(-gd * 0.5) * flick * insideLane * waterMask * depthFade * 0.28;

  // gentle vignette to keep frame edges dark and composed
  vec2  vp = (uv - vec2(0.5, 0.5));
  float vign = 1.0 - smoothstep(0.55, 1.15, length(vp * vec2(aspect * 0.7, 1.0)));
  col *= mix(0.78, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
