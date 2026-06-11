// stain — a stained-glass window of large irregular voronoi panes.
// Each pane holds one palette colour pulled down to barely above black;
// bright leading separates them. Nothing crosses the window: panes take
// turns blooming from within on long, hash-phased overlapping cycles,
// leaning toward a neighbouring palette hue at the peak.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pane;        // average pane diameter, css px, scaled by u_pixelRatio (default 220)
uniform float u_bloomRate;   // pace of the panes' bloom cycles, cycles/sec (default 0.1)
uniform float u_litFraction; // rough fraction of panes lit at any moment (default 0.15)
uniform float u_lead;        // leading line thickness, css px, scaled by u_pixelRatio (default 3.5)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.17));
}

// cheap value noise for the glass mottle
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// relaxed voronoi sites: pulled toward cell centres, with an almost
// imperceptible slow flex so the partition feels alive, never drifting.
vec2 sitePos(vec2 cell, float t) {
  vec2 o = hash22(cell);
  vec2 base = 0.5 + (o - 0.5) * 0.72;
  base += 0.030 * vec2(sin(t * 0.23 + o.x * TAU), cos(t * 0.19 + o.y * TAU));
  return base;
}

// which pane holds a given point (same nearest-site rule as the fragment
// pass), so the hero blooms below can address whole panes by id.
vec2 cellAt(vec2 pt, float t) {
  vec2 n = floor(pt), f = fract(pt);
  vec2 best = n;
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + sitePos(n + g, t) - f;
      float d = dot(r, r);
      if (d < md) { md = d; best = n + g; }
    }
  }
  return best;
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.25);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cellPx = max(u_pane, 40.0) * refScale * pr;       // pane diameter in device px
  float leadPx = max(u_lead, 0.5) * pr;        // lead thickness in device px
  float t      = u_time;

  vec2 p = gl_FragCoord.xy / cellPx;
  vec2 n = floor(p), f = fract(p);

  // pass 1: nearest site
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + sitePos(n + g, t) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  vec2 cellId = n + mg;

  // pass 2: true distance to the pane border (perpendicular bisectors)
  float bd = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + sitePos(n + g, t) - f;
      vec2 dr = r - mr;
      if (dot(dr, dr) > 1e-5) {
        bd = min(bd, dot(0.5 * (mr + r), normalize(dr)));
      }
    }
  }
  float dPx = bd * cellPx; // distance to the nearest seam, device px

  // ---- pane colour: one of the four palette hues, leaning to its neighbour
  float h = hash21(cellId + 7.31);
  float k = floor(h * 3.999);
  vec3 paneCol, leanCol;
  if      (k < 0.5) { paneCol = c0; leanCol = c1; }
  else if (k < 1.5) { paneCol = c1; leanCol = c2; }
  else if (k < 2.5) { paneCol = c2; leanCol = c3; }
  else              { paneCol = c3; leanCol = c0; }

  // ---- per-pane bloom cycle: long, hash-phased, overlapping, no reset.
  // Phases sit on an R2 low-discrepancy lattice (+ hash jitter) rather than
  // raw hashes, so the blooms stay evenly staggered through the cycle —
  // they never clump into a bright wash or an all-dark lull — while panes
  // adjacent in time land far apart in space (reads scattered, no order).
  float h2   = hash21(cellId + 3.70);
  float h3   = hash21(cellId + 11.13);
  float ph0  = fract(cellId.x * 0.7548777 + cellId.y * 0.5698403 + 0.22 * h2);
  float rate = max(u_bloomRate, 0.0) * (0.95 + 0.10 * h3);
  float cyc  = fract(t * rate + ph0);
  float tri  = 1.0 - abs(2.0 * cyc - 1.0);        // continuous triangle swell
  float lf   = clamp(u_litFraction, 0.02, 0.95);
  // free-running field blooms: window widened so a pane is VISIBLY awake
  // for ~0.9*lf of its cycle, then squared so partials stay dim tails and
  // only near-peak panes reach full colour. Together with the lf-gated
  // hero slots below, the share of lit panes tracks u_litFraction from a
  // lone bloom up to half the window.
  float e    = smoothstep(1.0 - lf * 1.3, 1.0 - lf * 0.3, tri);
  e *= e;

  // ---- hero blooms: staggered slots, each adopting a fresh pane whose
  // heart sits well inside the view, re-chosen only while fully dark
  // (tri = 0) so the hand-off is invisible. Slots 0+1 run half a cycle
  // apart — max(tri0, tri1) >= 0.5 at every instant, so some pane is always
  // near peak (no dead window at any bloom rate). Slots 2+3 fade in as
  // u_litFraction rises, so the lit count scales structurally with the
  // param instead of by hash luck. Every bloom still swells strictly in
  // place — nothing crosses the glass. Hero brightness also eases with
  // u_litFraction, so the low end reads as a lone soft bloom — structurally
  // different from the default at every instant, not by hash luck.
  float rateH   = max(u_bloomRate, 0.005) * 0.85;
  float heroAmp = mix(0.62, 1.0, smoothstep(0.04, 0.14, lf));
  float g2 = smoothstep(0.07, 0.14, lf);   // third bloom: in by the default
  float g3 = smoothstep(0.22, 0.38, lf);   // fourth: toward "half awake"
  for (int s = 0; s < 4; s++) {
    float fs   = float(s);
    float off  = mod(fs * 0.5, 1.0) + step(1.5, fs) * 0.25; // 0 .5 .25 .75
    float gate = mix(1.0, g2, step(1.5, fs));
    gate = mix(gate, g3, step(2.5, fs));
    if (gate > 0.001) {
      float ph   = fract(t * rateH + off);
      float seed = floor(t * rateH + off);
      vec2  jit  = hash22(vec2(seed * 0.731 + fs * 77.7, seed * 0.413 + 13.7 + fs * 5.1));
      vec2  tgt  = (vec2(0.5) + (jit - 0.5) * 0.60) * u_resolution.xy / cellPx;
      if (length(cellAt(tgt, t) - cellId) < 0.5) {
        float triH = 1.0 - abs(2.0 * ph - 1.0);
        e = max(e, gate * heroAmp * smoothstep(0.25, 0.70, triH));
      }
    }
  }

  // ---- glass body
  float mot = 0.74 + 0.52 * vnoise(p * 2.9 + hash22(cellId) * 9.7); // mottled glass
  vec3 dim  = paneCol * 0.085 * mot;               // barely above black
  dim *= 0.80 + 0.35 * tri;                        // faint warmth approaching the bloom
  vec3 lit  = mix(paneCol, leanCol, 0.55 * e);     // chromatic lean at the peak

  // bloom swells from within: brightest toward the pane's heart
  float heart = 1.0 - smoothstep(0.0, 0.85, length(mr));
  vec3 glass  = dim + lit * e * (0.22 + 0.78 * heart) * 0.58 * (0.78 + 0.22 * mot);

  // glass darkens as it tucks under the lead
  glass *= 0.42 + 0.58 * smoothstep(0.0, leadPx * 4.5, dPx);

  // ---- leading: steadily lit bright lines + a soft halo
  float aa    = 0.75 * pr + 0.5;
  float line  = 1.0 - smoothstep(leadPx * 0.5 - aa, leadPx * 0.5 + aa, dPx);
  float halo  = exp(-dPx / max(leadPx * 2.2, 1.0)) * 0.14;
  vec3 palAvg = (c0 + c1 + c2 + c3) * 0.25;
  vec3 leadCol = vec3(0.60, 0.62, 0.68) + palAvg * 0.32;

  vec3 col = BG + glass;
  col += leadCol * halo * (1.0 - line);
  col  = mix(col, leadCol, line);

  // gentle vignette to seat the window
  vec2 q = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.36 * smoothstep(0.35, 1.05, length(q - 0.5) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
