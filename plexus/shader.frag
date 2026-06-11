// plexus (Loom) — a loose constellation of glow-dot nodes hung across the dark,
// one per cell of an invisible jittered grid, each slowly circling its own anchor.
// Hairline threads fade in between nodes whenever a pair drifts within reach —
// brighter the closer they get — and where three mutually-near nodes meet a faint
// translucent triangle ghosts in behind the lines. The mesh itself is alive:
// threads are transient relationships between drifting points, forming and
// dissolving by proximity while a barely-there brightness wave breathes
// diagonally across the whole net.
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
uniform float u_orbitSpeed;  // how fast nodes circle their anchors  (default 0.5)
uniform float u_cell;        // node grid spacing, css px           (default 120)
uniform float u_reach;       // proximity-threshold multiplier      (default 1.0)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float LINE_CSS    = 1.1;    // half-thickness of a thread, css px
const float NODE_CSS    = 2.6;    // node glow-dot radius, css px
const float WAVELEN_CSS = 720.0;  // wavelength of the diagonal breathing wave

// hash a cell id -> two pseudo-random scalars in 0..1
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// blend the four palette colours by a 0..1 phase
vec3 paletteAt(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// world position of the node belonging to cell `cid`, given grid spacing.
// the node sits at a jittered anchor inside the cell and circles it on a slow,
// hashed orbit (period 10..30 s) — phase-continuous, never resets.
vec2 nodePos(vec2 cid, float spacing, float t) {
  vec2 h  = hash2(cid);
  vec2 h2 = hash2(cid + 17.0);
  // anchor: jittered within the cell, kept off the edges so neighbours stay near
  vec2 anchor = (cid + 0.3 + 0.4 * h) * spacing;
  // orbit: radius ~0.2-0.32 cells, hashed period and phase per node so distances
  // swing enough that threads + triangles visibly form and dissolve
  float period = mix(10.0, 30.0, h2.x);
  float phase  = h2.y * 6.2831853;
  float ang    = t * (6.2831853 / period) * u_orbitSpeed + phase;
  float rad    = spacing * (0.20 + 0.12 * h.x);
  return anchor + vec2(cos(ang), sin(ang)) * rad;
}

// distance from point p to segment a-b
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}

// signed area helper for point-in-triangle (barycentric sign)
float edgeSign(vec2 p, vec2 a, vec2 b) {
  return (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // grid spacing in device px (css * dpr). guard against a zero param.
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_cell, 8.0) * refScale * pr;
  float line    = LINE_CSS * pr;
  float nodeR   = NODE_CSS * pr;

  // proximity threshold: threads fade in when two nodes are nearer than this.
  // ~1.15 cells at reach 1 keeps the net strung between adjacent nodes while
  // diagonal pairs come and go; reach scales it for sparser/denser meshes.
  float thresh  = spacing * 1.15 * max(u_reach, 0.05);

  // palette with house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // diagonal breathing wave — a barely-there brightness rolling across the mesh
  float diag  = dot(fc - ctr, normalize(vec2(0.8, 0.6)));
  float wave  = 0.5 + 0.5 * sin(diag / (WAVELEN_CSS * pr) * 6.2831853 - t * 0.25);
  float breath = mix(0.78, 1.0, wave);

  vec2 baseId = floor(fc / spacing);

  // gather the 3x3 ring of nodes around this fragment (constant bounds).
  // we store positions + per-node colour phase; max 9 nodes.
  vec2 P[9];
  float K[9];
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      vec2 cid = baseId + vec2(float(i) - 1.0, float(j) - 1.0);
      int idx = j * 3 + i;
      vec2 np = nodePos(cid, spacing, t);
      // colour phase traces node position + a slow time roll (loops, no reset)
      float k = cid.x * 0.13 + cid.y * 0.09 + t * 0.010;
      // GLSL ES 1.00: no dynamic write-indexing pitfalls — assign per known idx
      if (idx == 0) { P[0] = np; K[0] = k; }
      else if (idx == 1) { P[1] = np; K[1] = k; }
      else if (idx == 2) { P[2] = np; K[2] = k; }
      else if (idx == 3) { P[3] = np; K[3] = k; }
      else if (idx == 4) { P[4] = np; K[4] = k; }
      else if (idx == 5) { P[5] = np; K[5] = k; }
      else if (idx == 6) { P[6] = np; K[6] = k; }
      else if (idx == 7) { P[7] = np; K[7] = k; }
      else { P[8] = np; K[8] = k; }
    }
  }

  vec3  accum   = vec3(0.0);
  float aaLine  = line + pr * 1.1;

  // --- threads: every unordered pair among the 9 nodes, drawn if within reach.
  // brightness scales with closeness (closer = brighter). 36 pairs, unrolled
  // via nested constant loops with i<k guard.
  for (int a = 0; a < 9; a++) {
    for (int b = 0; b < 9; b++) {
      if (b <= a) continue;
      // fetch positions without dynamic indexing by scanning to the const slot
      vec2 pa = P[0]; float ka = K[0];
      vec2 pb = P[0]; float kb = K[0];
      for (int s = 0; s < 9; s++) {
        if (s == a) { pa = P[s]; ka = K[s]; }
        if (s == b) { pb = P[s]; kb = K[s]; }
      }
      float d = distance(pa, pb);
      if (d > thresh) continue;
      // closeness 0..1 (1 when coincident, 0 at the reach threshold)
      float close = 1.0 - d / thresh;
      close = close * (0.45 + 0.55 * close); // ease, but keep mid-range visible
      float sd = segDist(fc, pa, pb);
      float stroke = 1.0 - smoothstep(0.0, aaLine, sd);
      vec3  tcol = paletteAt((ka + kb) * 0.5, c0, c1, c2, c3);
      accum += tcol * stroke * close;
    }
  }

  // --- triangle ghosts: where three mutually-near nodes meet, a faint fill.
  // restrict to a few cheap triplets around the centre node (slot 4) to keep
  // cost bounded; pair the centre with its 8 neighbours and adjacent neighbours.
  // we test the 8 triangles fanning the centre node to each consecutive ring
  // pair — constant set, no dynamic indexing.
  const int TRI = 8;
  // ring order around centre: slots 0,1,2,5,8,7,6,3 form a cycle
  for (int tri = 0; tri < TRI; tri++) {
    // pick centre + two consecutive ring nodes
    vec2 pc = P[4];
    vec2 r0 = P[0]; vec2 r1 = P[0];
    float kc = K[4], k0 = K[0], k1 = K[0];
    // ring index pairs
    for (int s = 0; s < 9; s++) {
      // map tri -> two ring slots via the cyclic order
      // order: [0,1,2,5,8,7,6,3]
      int s0 = 0, s1 = 1;
      if (tri == 0) { s0 = 0; s1 = 1; }
      else if (tri == 1) { s0 = 1; s1 = 2; }
      else if (tri == 2) { s0 = 2; s1 = 5; }
      else if (tri == 3) { s0 = 5; s1 = 8; }
      else if (tri == 4) { s0 = 8; s1 = 7; }
      else if (tri == 5) { s0 = 7; s1 = 6; }
      else if (tri == 6) { s0 = 6; s1 = 3; }
      else { s0 = 3; s1 = 0; }
      if (s == s0) { r0 = P[s]; k0 = K[s]; }
      if (s == s1) { r1 = P[s]; k1 = K[s]; }
    }
    // all three edges must be within reach for the fill to ghost in
    float dca = distance(pc, r0);
    float dcb = distance(pc, r1);
    float dab = distance(r0, r1);
    float m = max(dca, max(dcb, dab));
    if (m > thresh) continue;
    // mutual closeness gates the fill (fades as any edge stretches)
    float fillClose = 1.0 - m / thresh;
    fillClose = fillClose * fillClose * fillClose;
    // point-in-triangle test with soft edges
    float e0 = edgeSign(fc, pc, r0);
    float e1 = edgeSign(fc, r0, r1);
    float e2 = edgeSign(fc, r1, pc);
    bool inside = (e0 >= 0.0 && e1 >= 0.0 && e2 >= 0.0) ||
                  (e0 <= 0.0 && e1 <= 0.0 && e2 <= 0.0);
    if (!inside) continue;
    vec3 fcol = paletteAt((kc + k0 + k1) / 3.0, c0, c1, c2, c3);
    accum += fcol * fillClose * 0.16;
  }

  // --- node glow dots: drawn on top, each a soft luminous point.
  for (int n = 0; n < 9; n++) {
    vec2 np = P[0]; float kn = K[0];
    for (int s = 0; s < 9; s++) {
      if (s == n) { np = P[s]; kn = K[s]; }
    }
    float dd = distance(fc, np);
    // crisp core + soft halo
    float core = 1.0 - smoothstep(0.0, nodeR + pr * 1.2, dd);
    float halo = exp(-dd * dd / (nodeR * nodeR * 9.0));
    vec3  ncol = paletteAt(kn, c0, c1, c2, c3);
    accum += ncol * (core * 1.0 + halo * 0.45);
  }

  // breathing wave modulates the whole mesh; gentle vignette keeps edges calm
  float vign = 1.0 - smoothstep(0.35, 1.15, length((fc - ctr) / res));
  col += accum * breath * vign;

  gl_FragColor = vec4(col, 1.0);
}
