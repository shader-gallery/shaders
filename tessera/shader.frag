// tessera (Mosaic) — an irregular wall of dark glass tiles: a jittered voronoi
// partition with hairline bright grout seams and faint glassy fills hashed from
// the palette. The tiling itself is alive: hash-timed per-tile envelopes
// crossfade each pane with a nested finer partition — tiles shatter into small
// tesserae and clutches of chips fuse back into broad panes, newborn seams
// flashing softly, fading seams cooling out. No lamp, no sweep, no reset: the
// light budget holds still and the partition geometry is what moves.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cell;       // avg parent tile diameter, css px (default 90)
uniform float u_splitRate;  // how fast one split/fuse plays out (default 0.25)
uniform float u_seam;       // grout seam thickness, css px     (default 1.5)
uniform float u_churn;      // fraction of wall mid-transition  (default 0.2)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black house base
const float CHILD_SCALE = 2.6;   // sub-partition fineness (a "handful" of chips)
const float DRIFT_AMP   = 0.07;  // reseat drift radius, grid units
const float DRIFT_SEC   = 47.0;  // reseat drift period, seconds

// ------------------------------------------------------------------ hashing
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.17));
}

// seed position for lattice cell n: jittered, with a slow phase-continuous
// circular drift so cells flex and reseat themselves almost imperceptibly
vec2 seedPos(vec2 n, float t) {
  vec2  h = hash22(n);
  float a = 6.2831853 * (t / DRIFT_SEC + hash21(n + 9.1));
  return n + 0.5 + (h - 0.5) * 0.72 + DRIFT_AMP * vec2(cos(a), sin(a));
}

// voronoi with true distance-to-border (bisector-plane second pass).
// p in grid units. Returns cell id, border distance (grid units) and the
// vector from the pixel to its seed (for glassy interior shading).
void voro(vec2 p, float t, out vec2 outId, out float outBorder, out vec2 outLocal) {
  vec2  g = floor(p);
  vec2  f = fract(p);
  vec2  mo = vec2(0.0);
  vec2  mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2  o = vec2(float(i), float(j));
      vec2  r = seedPos(g + o, t) - g - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mo = o; }
    }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o  = mo + vec2(float(i), float(j));
      vec2 r  = seedPos(g + o, t) - g - f;
      vec2 dr = r - mr;
      if (dot(dr, dr) > 1e-5) {
        md = min(md, dot(0.5 * (mr + r), normalize(dr)));
      }
    }
  }
  outId     = g + mo;
  outBorder = md;
  outLocal  = mr;
}

// smooth cyclic ramp through the four palette colours
vec3 pal4(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float x = fract(s) * 4.0;
  vec3 col = mix(c0, c1, clamp(x, 0.0, 1.0));
  col = mix(col, c2, clamp(x - 1.0, 0.0, 1.0));
  col = mix(col, c3, clamp(x - 2.0, 0.0, 1.0));
  col = mix(col, c0, clamp(x - 3.0, 0.0, 1.0));
  return col;
}

void main() {
  float pr = max(u_pixelRatio, 0.5);
  vec2  fc = gl_FragCoord.xy;
  vec2  res = max(u_resolution, vec2(1.0));
  float t  = u_time;

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float cellPx  = max(u_cell, 8.0) * pr;          // parent tile size, device px
  float childPx = cellPx / CHILD_SCALE;           // sub-tile size, device px
  float seamPx  = clamp(u_seam, 0.2, 8.0) * pr;   // grout thickness, device px

  // ---- parent partition (the coarse panes)
  vec2 idP; float dbP; vec2 lP;
  voro(fc / cellPx, t, idP, dbP, lP);
  float dPx = dbP * cellPx;

  // ---- child partition (the shattered tesserae; offset hash-space)
  vec2 idC; float dbC; vec2 lC;
  voro(fc / cellPx * CHILD_SCALE + 71.31, t, idC, dbC, lC);
  float dPxC = dbC * childPx;

  // ---- per-parent split/fuse envelope: hash-timed, staggered, no global beat.
  // ph rises 0->1 over fT (split), holds subdivided, falls back over fT (fuse).
  float churn  = clamp(u_churn, 0.01, 0.95);
  float fT     = 0.5 * churn;                        // transition fraction each way
  float hold   = min(1.5 * fT, 0.95 - 2.0 * fT);     // subdivided dwell fraction
  float tau    = 2.0 / max(u_splitRate, 0.02);       // seconds for one split/fuse
  float period = (tau / fT) * (0.75 + 0.5 * hash21(idP + 8.13)); // de-synced
  float ph     = fract(t / period + hash21(idP + 3.71));
  float e      = smoothstep(0.0, fT, ph)
               - smoothstep(fT + hold, 2.0 * fT + hold, ph);
  // newborn seams flash softly; fusing seams just cool out
  float flash  = e * (1.0 - e) * 4.0;
  flash *= mix(0.25, 1.0, 1.0 - smoothstep(fT, fT + hold, ph));

  // ---- glass fills: palette tints barely above black, glassy gradient + bevel
  vec3  tintP = pal4(hash21(idP * 0.7 + 1.3), c0, c1, c2, c3);
  vec2  dirP  = normalize(hash22(idP + 5.5) - 0.5 + 1e-4);
  float gradP = clamp(0.5 - 0.6 * dot(lP, dirP), 0.0, 1.0);
  float bevP  = 0.5 + 0.5 * smoothstep(0.0, cellPx * 0.10, dPx);
  vec3  fillP = tintP * (0.045 + 0.085 * gradP) * bevP;

  vec3  tintC = pal4(hash21(idC * 0.7 + 2.6), c0, c1, c2, c3);
  vec2  dirC  = normalize(hash22(idC + 5.5) - 0.5 + 1e-4);
  float gradC = clamp(0.5 - 0.6 * dot(lC, dirC), 0.0, 1.0);
  float bevC  = 0.5 + 0.5 * smoothstep(0.0, childPx * 0.12, min(dPxC, dPx));
  vec3  fillC = tintC * (0.05 + 0.095 * gradC) * bevC;

  vec3 fill = mix(fillP, fillC, e);

  // ---- grout seams: hairline bright web, antialiased, with a soft halo
  float aa    = pr * 0.75;
  float lineP = 1.0 - smoothstep(seamPx * 0.5 - aa, seamPx * 0.5 + aa, dPx);
  float glowP = exp(-dPx / (seamPx * 3.0 + 1.0));
  float lineC = (1.0 - smoothstep(seamPx * 0.4 - aa, seamPx * 0.4 + aa, dPxC)) * e;
  float glowC = exp(-dPxC / (seamPx * 2.5 + 1.0)) * e;

  vec3 seamColP = mix(tintP, vec3(1.0), 0.25);
  vec3 seamColC = mix(tintC, vec3(1.0), 0.30);

  vec3 col = BG + fill;
  col += seamColP * (lineP * 0.80 + glowP * 0.16);
  col += seamColC * (lineC * (0.70 + 0.85 * flash) + glowC * (0.13 + 0.20 * flash));

  // gentle vignette to keep the framing composed
  vec2 q = fc / res - 0.5;
  col *= 1.0 - 0.55 * dot(q, q);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
