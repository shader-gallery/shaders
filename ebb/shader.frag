// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// ebb (Wake) — a falling tide leaves a scatter of glowing pools stranded across
// dark wet sand. Hash-placed blobs with noise-roughened irregular outlines, each
// a soft mirror-bright fill rimmed by a thin meniscus line. A low horizontal
// waterline carries a faint damp sheen above it. Over a long ~25s cycle the tide
// retreats down the frame, stranding pools that drain and dim at hash-staggered
// moments — one winking down, then another — until a single luminous up-sweep
// rolls through and refills them all at once (the sweep IS the loop's wrap).
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
uniform float u_cycleSpeed;    // rate of the whole retreat-and-refill cycle (default 0.4)
uniform float u_poolSize;      // pool radius in CSS px, *u_pixelRatio in code   (default 55)
uniform float u_drainStagger;  // spread of per-pool drain timing 0..1          (default 0.6)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black wet sand ~#09090B
const float TAU      = 6.2831853;
const float MENISCUS = 1.4;   // meniscus rim half-thickness, css px
const float WATERLN  = 0.22;  // resting waterline height (0=bottom, 1=top of frame)
const float STRAND   = 0.96;  // top of the strand: pools scatter up to here
const float RETREAT  = 0.16;  // how far down the resting waterline retreats over a cycle

// --- hashes (no textures) -------------------------------------------------
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
vec2 hash22(vec2 p) {
  float n = dot(p, vec2(127.1, 311.7));
  return fract(sin(vec2(n, n + 1.7)) * 43758.5453123);
}
// value noise for roughening pool outlines + sheen
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i + vec2(0.0, 0.0), vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// cyclic triangular weight for a palette entry on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized vertical coordinate, 0 at bottom, 1 at top
  float yN = fc.y / res.y;

  // --- palette with house fallback ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  // --- tide cycle phase (0..1), loops seamlessly ---
  // retreat occupies most of the cycle; the refill up-sweep is the wrap.
  float phase = fract(t * u_cycleSpeed * 0.04);   // ~25s at default 0.4
  // tide level retreats downward across the cycle, then the up-sweep restores it.
  float tideY = WATERLN - RETREAT * phase;        // current waterline height (0..1)

  // refill sweep: a luminous front that rolls UP through the frame near the wrap.
  // active for the last ~22% of the cycle; sweepFront travels from below the
  // lowest pool up past the top, refilling every pool it passes.
  float sweepP  = smoothstep(0.78, 1.0, phase);   // 0..1 over the sweep window
  float sweepFront = -0.15 + sweepP * 1.4;        // front height climbing the frame

  // --- pool field: hash-placed on a jittered grid in CSS space ---
  float poolR   = max(u_poolSize, 8.0) * pr;      // guard against 0
  float cell    = poolR * 2.1;                    // grid pitch ~ pool spacing (overlap at large R)
  vec2  gp      = fc / cell;
  vec2  baseId  = floor(gp);

  // sheen band: faint damp glow in the band just above the (retreating) waterline
  float damp = smoothstep(tideY + 0.22, tideY + 0.02, yN) * smoothstep(tideY - 0.015, tideY + 0.01, yN);
  float sheen = damp * (0.085 + 0.05 * vnoise(fc / (70.0 * pr) + vec2(0.0, t * 0.05)));
  // waterline itself: a thin brighter horizontal seam
  float lineW = 0.005;
  float seam  = exp(-pow((yN - tideY) / lineW, 2.0)) * 0.5;
  vec3  dampCol = mix(c2, c0, 0.5);
  col += dampCol * (sheen + seam * 0.55);

  // accumulate pools from the 3x3 neighbourhood of cells (constant bounds)
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 id = baseId + vec2(float(ox), float(oy));
      vec2 rnd = hash22(id);
      // not every cell hosts a pool — sparse strand of scattered embers
      if (rnd.x > 0.60) continue;

      // pool centre jittered within its cell
      vec2 jit = hash22(id + 7.3);
      vec2 centre = (id + 0.18 + 0.64 * jit) * cell;
      float cy = centre.y / res.y; // pool's normalized height

      // pools strand on the exposed sand ABOVE the resting waterline, scattered
      // up the frame to the top of the strand; nothing sits below the water.
      if (cy < WATERLN + 0.04) continue;
      if (cy > STRAND) continue;

      vec2 d = fc - centre;
      float dist = length(d);

      // per-pool radius variation + noise-roughened irregular outline
      float pr2  = poolR * (0.6 + 0.6 * rnd.y);
      float ang  = atan(d.y, d.x);
      float rough = 0.86 + 0.16 * vnoise(vec2(ang * 1.9, 0.0) + id * 4.1)
                         + 0.10 * vnoise(vec2(ang * 4.3, id.x * 2.0));
      float radius = pr2 * rough;

      // --- per-pool fill level: drains as the tide leaves it stranded ---
      // each pool gets a staggered drain time; spread controlled by u_drainStagger.
      float stag = hash11(dot(id, vec2(12.9, 78.2)) + 3.0);
      // higher pools (farther above the retreating water) strand & drain first.
      // map height across the strand to a 0..1 base drain moment.
      float drainAt = clamp((cy - WATERLN) / (STRAND - WATERLN), 0.0, 1.0);
      // invert so the highest pools (drainAt~1) trigger EARLIEST in the cycle
      float baseMoment = 0.62 * (1.0 - drainAt);
      // stagger spreads the moments out; at 0 every pool shares baseMoment,
      // at 1 the hash strings them out one-by-one across the ebb window.
      float stagOff = (stag - 0.5) * u_drainStagger * 0.5;
      float trigger = clamp(baseMoment + stagOff, 0.0, 0.74);
      float drain = smoothstep(trigger, trigger + 0.12, phase);
      // fill goes 1 -> low as it drains
      float fill = mix(1.0, 0.10, drain);

      // the refill up-sweep: when the front passes this pool, snap it back to full
      float refill = smoothstep(-0.10, 0.07, sweepFront - cy) * sweepP;
      fill = mix(fill, 1.0, refill);

      // --- shape: soft mirror-bright fill + thin meniscus rim ---
      float edge = radius;
      float aa   = 2.0 * pr;
      // interior mask (1 inside, fading at the irregular edge)
      float inside = 1.0 - smoothstep(edge - aa, edge + aa, dist);
      // mirror-bright fill: brightest at centre, gentle falloff
      float bright = inside * (0.55 + 0.45 * (1.0 - smoothstep(0.0, edge, dist)));
      // meniscus: thin bright ring right at the rim
      float rim = exp(-pow((dist - edge) / (MENISCUS * pr + aa), 2.0));

      // per-pool colour drawn from the palette (scattered four-colour embers)
      float s  = fract(rnd.x * 2.0 + rnd.y * 1.37 + stag * 0.5) * 4.0;
      float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
      vec3  pcol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

      // luminosity = fill level (drained pools dim toward dark)
      float lum = fill;
      // subtle inner shimmer so fills read as wet, not flat
      float shimmer = 0.85 + 0.15 * vnoise(d / (18.0 * pr) + vec2(t * 0.06, 0.0));

      col += pcol * bright * lum * 0.52 * shimmer;
      col += pcol * rim * (0.30 + 0.55 * lum);
      // a soft outer glow halo so embers bleed onto the sand
      float halo = exp(-dist / (radius * 0.9 + 1.0)) * inside * 0.0
                 + exp(-max(dist - edge, 0.0) / (radius * 0.55 + 1.0));
      col += pcol * halo * lum * 0.16;
    }
  }

  // refill sweep crest: a luminous horizontal wave-front glow as it rolls up
  float crest = exp(-pow((yN - sweepFront) / 0.05, 2.0)) * sweepP;
  vec3  crestCol = mix(c2, c0, 0.4);
  col += crestCol * crest * 0.45;

  // gentle vignette to settle the framing
  vec2 q = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.0, length(q * vec2(1.0, 1.25)));
  col *= mix(0.75, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
