// vein (Mosaic) — only the boundary network of a voronoi partition: thin
// capillary seams on a near-black field, cell interiors left empty. The web
// is never complete — it continuously rewires itself. Individual edges fade
// in along their length, dock into junctions with a soft glint, stand a
// while as part of the living web, then thin and retract. Each seam is
// tinted by blending palette colours hashed from its two adjacent cells.
// The seed layout never moves, so a stable ghost structure persists through
// endless turnover; nothing travels along the lines — the animation is which
// edges exist at all.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cell;       // voronoi cell diameter, css px (default 130)
uniform float u_rewireRate; // edge grow/retract turnover speed (default 0.3)
uniform float u_coverage;   // fraction of the web standing (default 0.7)
uniform float u_vein;       // capillary line width, css px (default 1.5)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float JITTER    = 0.80;  // seed jitter amplitude inside each grid cell
const float GHOST     = 0.045; // faint trace of the full web (stable skeleton)
const float EDGE_SPAN = 0.62;  // along-edge normalisation, in cell units
const float TIP_SOFT  = 0.10;  // softness of the growing/retreating tip

float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 q = fract(p.xyx * vec3(0.2317, 0.2483, 0.1991));
  q += dot(q, q.yzx + 23.19);
  return fract((q.xx + q.yz) * q.zy);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// stable palette tint for a cell, hashed from its grid id
vec3 cellColor(vec2 id, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float h = hash12(id + 17.17) * 4.0;
  return c0 * wheelW(h, 0.0) + c1 * wheelW(h, 1.0) +
         c2 * wheelW(h, 2.0) + c3 * wheelW(h, 3.0);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cellPx = max(u_cell, 8.0) * refScale * pr;        // cell diameter in device px
  float wHalf  = max(u_vein, 0.25) * pr * 0.5; // line half-width in device px
  float aa     = max(pr * 0.7, 0.75);          // anti-alias ramp

  // theme palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- pass A: nearest seed (3x3 around the pixel's grid cell) -----------
  vec2 p = fc / cellPx;
  vec2 g = floor(p);
  vec2 idA = g; vec2 seedA = g + 0.5; float dBest = 1e9;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 id = g + vec2(float(dx), float(dy));
      vec2 sp = id + 0.5 + (hash22(id) - 0.5) * JITTER;
      vec2 dv = p - sp;
      float d2 = dot(dv, dv);
      if (d2 < dBest) { dBest = d2; idA = id; seedA = sp; }
    }
  }
  vec2 pA = seedA * cellPx;
  vec3 colA = cellColor(idA, c0, c1, c2, c3);

  // envelope timing shared by every edge
  float cov = clamp(u_coverage, 0.05, 0.97);   // standing fraction of cycle
  float gw  = min(0.20, (1.0 - cov) * 0.7);    // grow/retract window fraction
  float baseRate = max(u_rewireRate, 0.0) * 0.07;

  // ---- pass B: per-edge seams from the 5x5 neighbourhood of cell A -------
  vec3 acc = vec3(0.0);
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 idB = idA + vec2(float(dx), float(dy));
      vec2 pB  = (idB + 0.5 + (hash22(idB) - 0.5) * JITTER) * cellPx;

      vec2  rv = pB - pA;
      float rl = max(length(rv), 1e-4);
      vec2  N  = rv / rl;                 // seam normal (A -> B)
      vec2  M  = 0.5 * (pA + pB);         // seam midpoint
      float d  = abs(dot(M - fc, N));     // distance to the bisector plane

      float glowR = wHalf * 7.0 + 3.0 * pr;
      if (d > glowR * 3.0 + wHalf) continue;

      // symmetric edge identity: same hashes seen from either side
      vec2 sid = idA + idB;
      vec2 did = abs(idA - idB);
      float h1 = hash12(sid + did * 0.37 + 5.5);  // life-cycle phase
      float h2 = hash12(sid * 1.93 + did + 9.1);  // rate jitter
      float h3 = fract(h1 * 13.7 + h2 * 7.31);    // origin end + gain

      // long overlapping life cycle: grow in, stand, thin + retract, absent
      float uph   = fract(u_time * baseRate * (0.6 + 0.8 * h2) + h1);
      float fGrow = smoothstep(0.0, 1.0, clamp(uph / max(gw, 1e-3), 0.0, 1.0))
                  - smoothstep(0.0, 1.0, clamp((uph - cov) / max(gw, 1e-3), 0.0, 1.0));

      // canonical tangent so both sides of the seam agree on "along"
      float flip = (abs(N.x) > 1e-5) ? sign(N.x) : sign(N.y);
      vec2  T    = vec2(-N.y, N.x) * flip;
      float s    = dot(fc - M, T) / (cellPx * EDGE_SPAN); // ~ -1..1 along edge
      float org  = (h3 > 0.5) ? 1.0 : -1.0;               // which end grows first
      float q    = 0.5 + 0.5 * s * org;                   // 0 at origin end

      // advancing/retreating front along the edge's length
      float F     = fGrow * 1.7 - 0.25;
      float along = 1.0 - smoothstep(F - TIP_SOFT, F + 0.03, q);

      // seam profile: crisp core (thinned in transition) + soft halo
      float wEff = wHalf * (0.55 + 0.45 * fGrow);
      float core = 1.0 - smoothstep(wEff - aa, wEff + aa, d);
      float halo = exp(-(d * d) / (glowR * glowR)) * 0.16;

      // soft glint riding the tip — docks into junctions as F reaches the end
      float tipd  = (q - F) / 0.07;
      float glint = exp(-tipd * tipd)
                  * smoothstep(0.02, 0.10, fGrow)
                  * (1.0 - smoothstep(0.90, 1.0, fGrow));

      // seam tint = blend of the two adjacent cells' palette colours
      vec3 ecol = (colA + cellColor(idB, c0, c1, c2, c3)) * 0.5;
      float gain = 0.70 + 0.55 * h3;
      float vis  = along * (0.45 + 0.55 * fGrow) * gain;

      acc += ecol * (core * (1.0 + 2.4 * glint) + halo * 0.85) * vis;

      // stable ghost skeleton: the full web, barely above the dark
      float gcore = 1.0 - smoothstep(wHalf * 0.5 - aa, wHalf * 0.5 + aa, d);
      acc += ecol * gcore * GHOST;
    }
  }

  // faint plasma pooling inside each cell: a slow per-cell breath glowing from
  // the seed outward, kept well below the seam brightness so the web still
  // reads as edges-on-void — just living membrane rather than dead black.
  float cellR  = sqrt(dBest);
  float pool   = 1.0 - smoothstep(0.0, 0.6, cellR);
  float cpulse = 0.55 + 0.45 * sin(u_time * 0.45 + hash12(idA + 3.3) * 6.2831);
  acc += colA * pool * 0.05 * cpulse;

  // gentle vignette; soft-knee tone map keeps junction pileups from blowing out
  vec2  uv  = (fc - 0.5 * res) / max(res.y, 1.0);
  float vig = 1.0 - 0.42 * smoothstep(0.42, 1.0, length(uv));
  vec3  lit = 1.0 - exp(-acc * 1.6);
  vec3  col = BG + lit * vig;

  gl_FragColor = vec4(col, 1.0);
}
