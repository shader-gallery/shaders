// geode (Rosette) — a druzy crystal bed filling the frame: small angular
// Voronoi facets with hard, hash-jittered straight edges tile the screen like
// the lining of a split-open geode. The bed rests in cold dim palette tones with
// the faintest mineral line tracing each facet edge; the base tint drifts
// glacially through the palette like an ambient hue tide. Individual facets fire
// sharp specular glints on independent hash-scheduled timers — a fast pow-shaped
// attack and a slower afterglow decay — only a handful alive at any moment,
// scattered uncorrelated across the bed like moonlight catching druzy quartz.
// No light orbits, sweeps, or travels: the motion is pointwise sparkle events
// over otherwise still mineral, every timer phase-continuous in u_time.
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
uniform float u_sparkRate;   // how often facets fire        (default 1)
uniform float u_facet;       // crystal facet size, css px   (default 70), scaled by u_pixelRatio
uniform float u_glint;       // peak brightness/sharpness    (default 0.6)
uniform float u_afterglow;   // relative decay length        (default 0.4)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float CYCLE    = 11.0;  // base seconds between a facet's glints (scaled by 1/sparkRate)

// hash helpers --------------------------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(262144.0, 32768.0) * n);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
vec3 paletteMix(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  s = fract(s) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // facet cell size in device px (guard against a 0 param)
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = max(u_facet, 8.0) * refScale * pr;
  vec2  uv   = fc / cell;

  // --- Voronoi over a jittered point lattice: hard angular facets ----------
  // walk the 3x3 neighbourhood; track nearest (F1) and second-nearest (F2).
  // F2 - F1 gives the straight-edge mineral seam between adjacent facets.
  vec2  g  = floor(uv);
  vec2  f  = fract(uv);

  float f1 = 8.0, f2 = 8.0;
  vec2  id1 = vec2(0.0);      // cell id of the nearest seed (the facet we live in)
  vec2  rel1 = vec2(0.0);     // vector from us to that seed

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o    = vec2(float(i), float(j));
      vec2 jit  = hash22(g + o);                 // 0..1 jitter, hard/angular
      vec2 seed = o + jit;                        // seed pos relative to cell
      vec2 r    = seed - f;
      float d   = dot(r, r);
      if (d < f1) {
        f2  = f1;  f1 = d;
        id1 = g + o;  rel1 = r;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  f1 = sqrt(f1); f2 = sqrt(f2);

  // mineral seam: bright exactly on the F2-F1==0 boundary, thin & AA'd.
  // edge in px so thickness is DPR-stable.
  float edge = (f2 - f1);                          // 0 at the seam, grows inward
  float seamPx = edge * cell;                      // approx distance to seam in px
  float seam = 1.0 - smoothstep(0.0, 1.6 * pr, seamPx); // faint hairline

  // --- base mineral tint: cold, dim, drifting glacially through palette ----
  // per-facet hue offset (stable hash) + an ambient hue tide in time.
  float facetHash = hash21(id1 + 0.5);
  float baseHue   = facetHash * 0.30 + t * 0.018;   // slow tide
  // a faint angular shading across the facet so each reads as a flat crystal
  // plane catching ambient light (gradient toward its seed point).
  float facetShade = 0.5 + 0.5 * dot(normalize(rel1 + 1e-4), normalize(vec2(0.6, 0.8)));

  // --- stochastic specular glint, scheduled per facet ----------------------
  // each facet owns an independent timer in u_time: phase-continuous, never
  // reset. cycle length jittered per facet; sparkRate compresses the interval.
  float sr      = max(u_sparkRate, 0.001);
  float period  = (CYCLE * (0.6 + facetHash * 1.4)) / sr;   // seconds between fires
  float offset  = hash21(id1 * 1.7 + 3.1) * period;          // de-phase facets
  float local   = mod(t + offset, period);                  // 0..period, continuous
  float phase   = local / period;                           // 0..1 within a cycle

  // glint envelope: fast pow-shaped attack, slower afterglow decay.
  // attack peaks early; decay length scales with afterglow.
  // the lit window is a SMALL fraction of the cycle so only a handful of facets
  // are ever alive at once; the rest of the period the facet sits dark mineral.
  float atk     = 0.012;                                     // attack fraction (sharp)
  float dec     = mix(0.12, 0.42, clamp(u_afterglow, 0.0, 1.0)); // decay fraction (longer -> more alive)
  float env     = 0.0;
  if (phase < atk) {
    float a = phase / atk;
    env = pow(a, 4.0);                                       // sharp rise
  } else if (phase < atk + dec * 3.0) {
    float a = (phase - atk) / dec;
    env = exp(-a * a * 2.2);                                 // pow-ish afterglow tail
  }
  // brighten the spark toward the facet centre so it reads as a point glint,
  // not a flat fill — distance to seed normalized by cell.
  float core = exp(-dot(rel1, rel1) * 2.4);
  float gAmt = clamp(u_glint, 0.0, 1.5);
  // sharpness of the flash rises with glint
  float spark = env * core * (0.5 + gAmt * 1.6);

  // theme colours with house fallback -------------------------------------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 mineral = paletteMix(baseHue, c0, c1, c2, c3);
  // the spark picks a brighter, slightly shifted palette colour per facet
  vec3 glintCol = paletteMix(baseHue + 0.5 + facetHash * 0.2, c0, c1, c2, c3);
  // hot core toward white for a hard diamond flash at high glint
  glintCol = mix(glintCol, vec3(1.0), gAmt * 0.45);

  vec3 col = BG;

  // dim cold facet fill: a whisper of mineral colour, modulated by the flat
  // shading so the angular planes are felt without lifting the base off black.
  col += mineral * (0.11 + 0.16 * facetShade);

  // faint mineral seam line tracing every facet edge
  col += mineral * seam * 0.13;

  // the specular glints — the only real light, scattered & pointwise
  col += glintCol * spark * (1.4 * gAmt + 0.3);

  // a soft halo of the spark spilling slightly past the facet core
  col += glintCol * env * core * 0.22 * gAmt;

  // gentle radial vignette keeps the frame composed and the edges colder
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.78, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
