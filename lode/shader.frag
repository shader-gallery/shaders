// lode (Delve) — a mine shaft sunk through ore-bearing rock, seen straight down
// the bore. Near-black stone walls (low FBM in angle / log-depth space, banded
// into concentric receding rings of rock) salted with tiny hash-scattered
// mineral glints, a few glowing ore veins that snake radially as they descend,
// and one warm waist of light: a tight stationary lamp band at a fixed screen
// radius that rock and glints flare through as they pour past it. The wall pours
// perpetually down the scale axis toward a true-black focal depth at the centre;
// the self-similar log wrap is hidden by the lamp's falloff and the core dark.
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
uniform float u_descentSpeed; // scale-octaves/sec the rock pours past the lamp (default 0.14)
uniform float u_glintDensity; // fraction of wall cells carrying a sparkle      (default 0.5)
uniform float u_lampDepth;    // lamp band screen radius, frac of half-size     (default 0.45)
uniform float u_veinGlow;     // brightness of the ore veins                    (default 0.8)

const vec3  BG       = vec3(0.018, 0.017, 0.024); // near-black shaft base
const float PI       = 3.14159265;
const float TWO_PI   = 6.28318531;
const float CELLS_A  = 20.0;  // angular cells around the bore
const float CELLS_D  = 3.0;   // log-depth cells per scale octave
const float WRAP     = 6.0;   // log-depth octaves before self-similar wrap

// ---- hashes (no textures) ----
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// value noise periodic in x with period px (keeps the angular seam invisible)
float pnoise(vec2 p, float px) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float ix0 = mod(i.x, px), ix1 = mod(i.x + 1.0, px);
  float a = hash21(vec2(ix0, i.y));
  float b = hash21(vec2(ix1, i.y));
  float c = hash21(vec2(ix0, i.y + 1.0));
  float d = hash21(vec2(ix1, i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// fbm with the angular axis kept periodic; px is the period at the base octave
float fbmA(vec2 p, float px) {
  float s = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 4; i++) {
    s += amp * pnoise(vec2(p.x * freq, p.y * freq), px * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return s;
}

// 1D smooth noise for vein angle wander, periodic over period px
float n1p(float x, float px) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i, px), i1 = mod(i + 1.0, px);
  return mix(hash11(i0), hash11(i1), f);
}

// cyclic triangular weight for a palette entry on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
vec3 palMix(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float s01) {
  float s = fract(s01) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  vec2  fc   = gl_FragCoord.xy;
  vec2  res  = u_resolution;
  vec2  ctr  = res * 0.5;
  float hs   = min(res.x, res.y) * 0.5;

  float t    = u_time;

  // screen position relative to bore axis, normalised to half-size
  vec2  q   = (fc - ctr) / hs;
  float r   = max(length(q), 1e-4);     // radius, 0 at the bore axis
  float ang = atan(q.y, q.x);           // -PI..PI

  // --- log-polar mapping: depth = -log(r) so equal screen rings map to equal
  // depth steps; descent advances depth linearly, a never-arriving zoom ---
  float descent = t * u_descentSpeed;
  float depth   = -log(r) + descent;    // grows toward centre; +descent pours it down

  // angle in cell units (continuous around the loop)
  float au = (ang / TWO_PI + 0.5) * CELLS_A; // 0..CELLS_A
  float du = depth * CELLS_D;                 // depth in cells

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 col = BG;

  // ---- rock wall: FBM grain in (angle, depth) space, BANDED into concentric
  // receding rings so the shaft wall actually reads as nested hollows. The
  // banding is a periodic function of log-depth so rings are born at the frame
  // edge and swallowed by the centre, every ring self-similar to the next. ----
  float grain  = fbmA(vec2(au, du * 0.55), CELLS_A);
  float grain2 = fbmA(vec2(au * 2.0, du * 1.3 + 11.0), CELLS_A * 2.0);
  float grainV = clamp(0.7 * grain + 0.45 * grain2, 0.0, 1.0);

  // concentric ring banding: a wavy dark groove every CELLS_D depth-cells.
  // the ring crest is offset per-angle by the grain so grooves are not perfect
  // circles but ragged stone ledges receding down the bore.
  float ringPhase = du + 0.9 * grain;            // depth carries rings inward
  float ringWave  = 0.5 - 0.5 * cos(ringPhase * TWO_PI); // 0 in groove, 1 on ledge
  float ledge     = pow(ringWave, 1.6);          // sharpen the ledge crests
  // rock luminance: grainy stone face, darkened in the ring grooves
  float rock = grainV * (0.30 + 0.70 * ledge);
  rock = pow(rock, 1.35);                         // contrast the grain up

  // faint stone tint that cycles with depth phase (rings shift hue as they fall)
  vec3 rockTint = palMix(c0, c1, c2, c3, depth * 0.18 + 0.5);
  // ambient (un-lit) wall: dim but visibly grainy and ringed
  col += rockTint * rock * 0.28;

  // faint cosmic-dust haze filling the void between veins (in-shader; replaces the
  // old gradient backdrop): a low-frequency palette-tinted nebula cloud, textured
  // by FBM so it reads as drifting dust rather than a flat wash. Shaped by the
  // core-dark + vignette at the end so the focal centre and frame edge still fall off.
  float dust = fbmA(vec2(au * 0.6, du * 0.32 + 5.0), CELLS_A);
  dust = pow(clamp(dust, 0.0, 1.0), 1.4);
  vec3  dustCol = palMix(c0, c1, c2, c3, depth * 0.12 + 0.3);
  col += dustCol * dust * 0.13;

  // ---- the stationary lamp band: fixed SCREEN radius, no motion ----
  // a TIGHT warm ring of illumination at r = u_lampDepth; brightness events
  // happen here as the descending wall passes through, without any light moving.
  float lr    = clamp(u_lampDepth, 0.05, 0.95);
  float sigma = 0.085;                            // band half-width, frac of half-size
  float band  = exp(-pow((r - lr) / sigma, 2.0)); // discrete warm waist
  vec3  lampCol = mix(c3, c2, 0.30);              // warmest palette colour leads

  // lamp flares the rock wall as it passes through the waist (its grain/rings
  // light up where they cross the band, then dim again above and below)
  col += mix(rockTint, lampCol, 0.45) * rock * band * 1.55;
  // a faint warm wash of the band itself catching dust in the air of the shaft
  col += lampCol * band * (0.05 + 0.12 * grainV);

  // ---- mineral glints: TINY hash-scattered point sparkles in log-polar cells ----
  // iterate a small fixed jitter neighbourhood so points near cell borders are
  // not clipped; each cell may carry at most one tiny sparkle gated by density.
  float glintAcc = 0.0;
  vec3  glintCol = vec3(0.0);
  vec2  cellF = vec2(au, du);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cell = floor(cellF) + vec2(float(dx), float(dy));
      // wrap the angular cell index so the seam matches (mod CELLS_A)
      float cidA = mod(cell.x, CELLS_A);
      // wrap depth cell over the period so the field is periodic across WRAP
      float cidD = mod(cell.y, WRAP * CELLS_D);
      float h    = hash21(vec2(cidA, cidD));
      // density threshold: only a fraction of cells carry a sparkle
      if (h < u_glintDensity) {
        // sub-cell position of the sparkle
        vec2 jit = vec2(hash21(vec2(cidA + 3.1, cidD + 7.7)),
                        hash21(vec2(cidA + 5.3, cidD + 1.9)));
        vec2 pc  = cell + jit;          // sparkle centre in cell space
        vec2 d   = cellF - pc;
        float dist2 = dot(d, d);
        // tiny point — small enough to read as dust, not bokeh, but with a
        // faint halo so the field's density is legible across the wall.
        float bright = 0.6 + 0.7 * hash11(h * 91.7);
        float core   = exp(-dist2 / 0.0024);     // tight pinprick
        float halo   = exp(-dist2 / 0.020);      // faint dust halo
        float spark  = core + 0.35 * halo;
        // glints hash across all four palette colours
        vec3 gc = palMix(c0, c1, c2, c3, hash11(h * 13.3));
        glintAcc += spark * bright;
        glintCol += gc * spark * bright;
      }
    }
  }
  // glints are present in shadow and flare bright through the lamp band —
  // raised base so the ore sparkle reads across the dim wall, not just at the lamp
  float glintLit = 1.6 + 2.4 * band;
  col += glintCol * glintLit;
  col += vec3(glintAcc) * (0.50 + band * 0.35);   // hard glint highlight

  // ---- ore veins: continuous glowing curves whose centreline angle wanders
  // WITH log-depth, so each vein snakes radially as it descends rather than
  // standing as a fixed spoke. Sampled along the radius via depth->angle. ----
  float veins = 0.0;
  for (int v = 0; v < 3; v++) {
    float fv = float(v);
    // the vein's angle is a function of depth: base offset + a depth-driven
    // wander. Because both fragment angle and depth are known, the centreline
    // angle at THIS depth tells us how far the fragment is from the vein.
    // de-symmetrised base angle (hash-spread, NOT an even 120-deg pinwheel) and
    // a strong depth-driven wander so each vein snakes as it descends.
    float seed  = hash11(fv * 23.7 + 4.0);
    float wob   = (n1p(depth * 1.3 + fv * 7.0, WRAP) - 0.5) * 4.2;
    float baseA = (seed * TWO_PI) - PI + wob;      // snakes with depth
    // angular distance from the fragment to the vein centre line (wrapped)
    float da = ang - baseA;
    da = atan(sin(da), cos(da));                   // wrap to -PI..PI
    // thin glowing stroke: a tight bright spine with a faint halo.
    // width shrinks toward the centre so the stroke tapers down the bore.
    float w = (0.030 + 0.035 * r) + 0.012 * band;  // thin thread
    float stroke = 1.0 * exp(-(da * da) / (w * w * 0.25))
                 + 0.40 * exp(-(da * da) / (w * w));
    // veins live in the wall: fade at the dead-black centre and the frame edge
    float reach = smoothstep(0.04, 0.20, r) * (1.0 - smoothstep(0.88, 1.15, r));
    // veins are richer where the wall grain is rich (embedded in the rock)
    veins += stroke * reach * (0.5 + 0.5 * grainV);
  }
  vec3 veinCol = mix(c3, lampCol, 0.2);            // warmest palette colour
  float veinLit = 0.55 + 1.8 * band;               // veins flare through the lamp too
  col += veinCol * veins * veinLit * u_veinGlow * 2.1;

  // ---- focal depth: true black always waits at the centre ----
  float coreDark = smoothstep(0.0, 0.14, r);
  col *= coreDark;

  // edge vignette to compose the framing and hide the outer wrap
  float vign = 1.0 - smoothstep(0.74, 1.18, r);
  col *= mix(0.50, 1.0, vign);

  // gentle tonemap to keep accents luminous without blowing out
  col = col / (1.0 + col * 0.44);

  gl_FragColor = vec4(col, 1.0);
}
