// nova (Abyss) — a lone bright progenitor star sits near a frame edge in a
// sparse, faint starfield. Once per long cycle it brightens, flashes, and sheds
// a single enormous shell: one thin expanding ring of light, its rim unevenly
// torn by FBM filaments, that sweeps across the whole frame, thinning and
// dimming as it grows until it dissolves into the dark. A long quiet interval
// follows; the loop wraps during that dark interval so no reset is visible.
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
uniform float u_novaPeriod;  // seconds between shell sheddings (default 40)
uniform float u_ringWidth;   // shell thickness in css px       (default 22)
uniform float u_filament;    // FBM raggedness of the rim 0..1   (default 0.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TWOPI    = 6.2831853;

// --- hash / value-noise / fbm (no textures) -------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.123);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords (aspect-correct, y in roughly [-0.5,0.5])
  float mn  = min(res.x, res.y);
  vec2  uv  = (fc - 0.5 * res) / mn;

  // progenitor star fixed near a frame edge (upper-left quadrant)
  vec2  src = vec2(-0.34, 0.26);

  vec3 col = BG;

  // ---- cycle clock -------------------------------------------------------
  float period = max(u_novaPeriod, 4.0);          // guard div-by-zero
  float phase  = mod(t, period) / period;          // 0..1 within a cycle
  // The active eruption occupies the first ~45% of the cycle; the rest is the
  // dark quiet interval the loop wraps inside, so no hard reset is ever seen.
  float ERUPT  = 0.80;

  // pre-brighten -> flash -> decay envelope of the source itself
  // brighten ramp builds toward the shed, flash spike at the shed, then ebbs.
  float SHED   = 0.10;                                // phase of the flash/shed
  float bright = smoothstep(0.0, SHED, phase) * (1.0 - smoothstep(SHED, ERUPT, phase));
  float flash  = exp(-pow((phase - SHED) / 0.022, 2.0)); // sharp spike at shed
  // faint breathing of the progenitor in the quiet time
  float breath = 0.5 + 0.5 * sin(t * 0.7);

  // ---- ring expansion ----------------------------------------------------
  // the shell is born at the shed and expands across the rest of the eruption.
  float er  = clamp((phase - SHED) / (ERUPT - SHED), 0.0, 1.0); // 0..1 post-shed
  // ease-out so it leaps from the flash then decelerates as it dissolves
  float rg  = 1.0 - pow(1.0 - er, 1.4);
  float maxR = 1.55;                                 // reaches off the far corner
  float ringR = rg * maxR;

  // distance + angle from the source (aspect-correct space)
  vec2  d2   = uv - src;
  float dist = length(d2);
  float ang  = atan(d2.y, d2.x);

  // FBM raggedness torn into the rim: modulate the effective radius by an
  // angular noise field so the shell's edge is unevenly filamentary. Sampling
  // on a unit circle keeps the tearing periodic around the full angle; two
  // frequencies give coarse bulges plus fine torn strands.
  float fil  = clamp(u_filament, 0.0, 1.0);
  vec2  acrd = vec2(cos(ang), sin(ang));
  float ragCoarse = fbm(acrd * 3.0 + vec2(13.0, 5.0)) - 0.5;          // bulges
  float ragFine   = fbm(acrd * 9.0 + vec2(0.0, ringR * 0.5)) - 0.5;   // strands
  float ragged = ragCoarse * 0.7 + ragFine * 0.5;     // ~[-0.6,0.6]
  float ragR = ringR + ragged * fil * 0.26;           // torn rim displacement

  // shell thickness: starts knife-edge, broadens slightly as it grows; the
  // param sets the base CSS thickness. convert css->normalized via mn.
  float wcss = max(u_ringWidth, 1.0) * pr;
  float wN   = (wcss / mn) * (0.7 + 0.8 * er);
  // brightness thins/dims as the shell grows, but stays readable mid-frame
  float ringFade = (1.0 - er * 0.55) * (1.0 - smoothstep(0.7, 1.0, er));
  // a broad band spreads the same shell energy over more thickness, so dim it
  // per-pixel — keeps a wide ring a luminous band, not a blown-out wash.
  float widthDim = 0.045 / (wN + 0.045);

  // gaussian shell profile around the torn radius
  float shell = exp(-pow((dist - ragR) / max(wN, 1e-3), 2.0));
  // extra filamentary brightness variation along the rim (sparkly torn strands)
  float strand = mix(1.0, 0.30 + 1.5 * fbm(acrd * 14.0 + ringR * 2.0), fil);
  float ring  = shell * ringFade * strand * widthDim;
  // fade in just after the shed, fade out as it dissolves off-frame
  ring *= smoothstep(0.0, 0.04, er);

  // ---- palette fallback (house convention) -------------------------------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ring colour shifts from a hot leading core (c2 cyan/white-ish) at the flash
  // toward cooler trailing hues (c1 violet) as it ages and dims.
  vec3 ringCol = mix(c2, c1, smoothstep(0.0, 0.7, er));
  vec3 core    = mix(ringCol, vec3(1.0), 0.35 * (1.0 - er)); // hot near flash
  col += core * ring * 3.1;

  // ---- progenitor star ---------------------------------------------------
  // a tight glowing source that pre-brightens, flashes white at the shed, then
  // settles to a faint breathing ember.
  float sd2 = dist;
  float starCore = exp(-pow(sd2 / 0.012, 2.0));
  float starGlow = exp(-sd2 / 0.085);
  float starLvl  = 0.18 + 0.10 * breath          // quiet breathing baseline
                 + 1.10 * bright                  // pre-brighten ramp
                 + 2.40 * flash;                  // sharp shed flash
  vec3  starCol  = mix(c0, vec3(1.0), clamp(0.35 + flash, 0.0, 1.0));
  col += starCol * starGlow * starLvl * 0.55;
  col += vec3(1.0) * starCore * (0.5 + 2.5 * flash);

  // ---- sparse faint starfield -------------------------------------------
  // a few scattered far stars with slow independent twinkle (the only fast
  // element). cellular: one candidate star per coarse cell, sparsely lit.
  vec2  sgrid = uv * 9.0;
  vec2  cid   = floor(sgrid);
  vec2  cf    = fract(sgrid) - 0.5;
  float rnd   = hash21(cid * 1.7 + 3.1);
  // keep it sparse: only ~18% of cells host a star
  float present = step(0.82, rnd);
  vec2  jitter  = (vec2(hash21(cid + 5.2), hash21(cid + 9.8)) - 0.5) * 0.7;
  float sdStar  = length(cf - jitter);
  float twk     = 0.45 + 0.55 * sin(t * (1.3 + 2.0 * hash21(cid + 1.1)) + rnd * 31.4);
  float starPt  = exp(-pow(sdStar / 0.045, 2.0)) * present * twk;
  // tint scattered stars across the palette by cell
  vec3  fieldCol = mix(c3, c2, hash21(cid + 7.7));
  col += fieldCol * starPt * 0.16;

  // ---- finishing ---------------------------------------------------------
  // gentle vignette to deepen the void at the edges
  float vign = 1.0 - smoothstep(0.45, 1.15, length(uv) * 1.3);
  col *= mix(0.7, 1.0, vign);

  // subtle filmic clamp so the flash blooms without harsh clipping
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
