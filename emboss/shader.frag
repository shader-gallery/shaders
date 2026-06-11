// emboss (Burnish) — low-relief medallion ornament under a lamp that never moves.
// A procedural heightfield of bosses on an offset grid: each motif is concentric
// petal ridges summed from smooth radial SDFs, shaded analytically against one
// fixed oblique light so every boss shows a lit flank and a shadowed flank.
// Each medallion runs its own hash-staggered strike cycle — swelling up from flat
// metal with a brief highlight bloom as the die lands, holding in relief, then
// subsiding — so shadows deepen and drain around individual bosses all across the
// field, with no synchronized episode. The lamp is constant; only the metal moves.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_strikePeriod; // seconds of one swell-hold-subside cycle (default 18)
uniform float u_relief;       // apparent depth at full strike, scales gradient (default 1)
uniform float u_motif;        // medallion size in css px (default 140), x u_pixelRatio

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PETALS   = 6.0;   // number of petal ridges per medallion
const float RIDGES   = 3.0;   // concentric ridge count

// 2D hash -> 0..1, stable per cell
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y * 95.43);
}

// medallion height field as a function of local coord (in cell-radius units, |q|<~1)
// and a strike amplitude amp (0 flat .. 1 full relief). Returns a height 0..~1.
float bossHeight(vec2 q, float amp, float seed) {
  float r = length(q);
  float a = atan(q.y, q.x);
  // dome falloff: high at centre, smoothly to zero at rim
  float dome = smoothstep(1.0, 0.0, r);
  // concentric petal ridges — radial cosine corrugation modulated by petal lobes
  float petals = 1.0 + 0.18 * cos(PETALS * a + seed * 6.2831);
  float ridge  = 0.5 + 0.5 * cos((r * petals) * RIDGES * 6.2831 - seed * 6.2831);
  // a raised central button
  float button = smoothstep(0.34, 0.18, r);
  float h = dome * (0.55 + 0.45 * ridge) + button * 0.35;
  return h * dome * amp;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params against zero / degenerate at slider extremes
  float period = max(u_strikePeriod, 0.5);
  float relief = max(u_relief, 0.0);
  float motif  = max(u_motif, 24.0) * pr;     // css-px size (boss diameter) -> device px
  // grid pitch slightly tighter than the boss so neighbours nearly touch and the
  // field always reads populated — no empty stage between medallions.
  float cellW  = motif * 0.86;
  float cellH  = motif * 0.86 * 0.8660254;    // hex-ish row pitch for an offset grid

  // --- offset (brick) grid cell lookup ---
  float row    = floor(fc.y / cellH);
  float xoff    = mod(row, 2.0) * 0.5;          // every other row shifted half a cell
  float colF    = fc.x / cellW - xoff;
  float col     = floor(colF);
  vec2  cellId  = vec2(col, row);

  // accumulate the lit relief over a small 3x3 neighbourhood so bosses on the
  // offset rows overlap correctly and rims are continuous (constant bounds).
  vec3 col_out = BG;
  float bestH   = 0.0;
  vec3 bestCol  = BG;

  // fixed oblique light direction (upper-left), constant for the whole field
  vec3 L = normalize(vec3(-0.55, 0.62, 0.56));

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 id = cellId + vec2(float(dx), float(dy));
      float ro = mod(id.y, 2.0) * 0.5;
      // cell centre in device px
      vec2 centre = vec2((id.x + 0.5 + ro) * cellW, (id.y + 0.5) * cellH);
      // local coord normalised to cell radius
      vec2 q = (fc - centre) / (motif * 0.5);
      // squash y a touch to fill the hex row spacing
      q.y /= 0.8660254;
      if (dot(q, q) > 1.2) continue; // outside this boss footprint

      float seed = hash21(id + 11.0);

      // --- per-medallion strike cycle, hash-staggered phase ---
      float ph = fract(t / period + seed);
      // swell (fast) -> hold -> subside (slow): a skewed pulse
      float swell  = smoothstep(0.0, 0.12, ph);
      float subside = 1.0 - smoothstep(0.45, 1.0, ph);
      float amp = swell * subside;             // 0..1 relief amplitude
      // brief highlight bloom right as the die lands
      float landing = exp(-pow((ph - 0.12) * 9.0, 2.0));

      // sample height + analytic gradient (central differences in q-space)
      float e = 0.02;
      float h  = bossHeight(q, amp, seed);
      float hx = bossHeight(q + vec2(e, 0.0), amp, seed) - bossHeight(q - vec2(e, 0.0), amp, seed);
      float hy = bossHeight(q + vec2(0.0, e), amp, seed) - bossHeight(q - vec2(0.0, e), amp, seed);
      // surface normal of the heightfield; relief scales slope -> chiaroscuro depth
      vec3 n = normalize(vec3(-hx / (2.0 * e) * relief, -hy / (2.0 * e) * relief, 1.0));

      // analytic shading: lit flank vs shadowed flank
      float diff = max(dot(n, L), 0.0);
      // specular sheen from the fixed lamp (Blinn-ish), constant lamp position
      vec3 V = vec3(0.0, 0.0, 1.0);
      vec3 Hh = normalize(L + V);
      float spec = pow(max(dot(n, Hh), 0.0), 38.0);

      // metal tone: base near-black, ambient + diffuse build the relief
      float metal = 0.045 + 0.42 * diff;
      // mask so only where the boss actually rises do we paint metal over BG
      float mask = smoothstep(0.0, 0.04, h);

      // highlight tint warmed faintly from palette by screen position
      // (chosen below after fallback); store raw terms, combine after.
      float hgt = h;
      if (hgt > bestH) {
        bestH = hgt;
        // pack shading into a temporary; final tinting after palette resolve
        bestCol = vec3(metal, spec + landing * 0.25 * amp, mask);
      }
    }
  }

  // --- palette (house fallback block) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // warm highlight tint drifts across the screen so relief never reads flat grey:
  // blend two palette hues by screen position (x for warm, y for cool accent).
  vec2 uv = fc / res;
  vec3 warmTint = mix(c2, c0, uv.x);            // base metal sheen hue
  vec3 hotTint  = mix(c3, c1, uv.y);            // specular glint hue

  float metal = bestCol.x;
  float spec  = bestCol.y;
  float mask  = bestCol.z;

  // build the lit metal: dark tinted base + diffuse-driven sheen + spec glint
  vec3 relCol = BG;
  relCol += warmTint * metal * 1.15 * mask;     // tinted diffuse relief
  relCol += hotTint * spec * 1.4 * mask;        // rare sharp glint
  // a faint cool fill in the shadowed valleys so they're not pure black holes
  relCol += warmTint * 0.06 * mask;

  col_out = mix(BG, relCol, mask);
  // ensure unmasked field is the dark base (overlapping mask already handled)
  col_out = max(col_out, BG);

  // gentle vignette to compose the framing
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col_out = mix(BG, col_out, mix(0.7, 1.0, vign));

  gl_FragColor = vec4(col_out, 1.0);
}
