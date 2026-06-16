// web (Loom) -- an irregular cobweb: a tangle of silk threads stretched between
// scattered anchor points into a polygonal mesh of cells, with no single hub.
// The threads waver and sag in the night air, dew beads sit in the cells and
// glint awake in a slow travelling chase, and each cell carries its own colour
// drawn from the palette. The mesh has no centre, so it fills the frame as a
// real web does instead of reading as a target.
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
uniform float u_density;     // silk cells across the frame            (default 7)
uniform float u_irregular;   // regular net 0 .. random cobweb 1       (default 0.85)
uniform float u_warp;        // organic thread waver                   (default 0.45)
uniform float u_sag;         // gravity droop of the whole mesh        (default 0.3)
uniform float u_silk;        // thread glow                            (default 1.0)
uniform float u_threadWidth; // silk strand weight                     (default 1.0)
uniform float u_dewSize;     // dew bead size                          (default 1.0)
uniform float u_glintSpeed;  // dew lighting-up chase rate             (default 0.5)
uniform float u_hueSpread;   // cell-to-cell colour variety            (default 0.7)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU = 6.2831853;

// cheap hashes
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// smooth value noise (for the organic silk waver and sag wander)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i, vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// the jittered anchor offset for the cell at lattice coord g. jit interpolates
// from a perfectly regular net (0) to a fully random cobweb (1); a small drift
// keeps the silk breathing on a loop. Both voronoi passes must agree, so this
// depends only on (g, t).
vec2 anchor(vec2 g, float t, float jit) {
  vec2 base = hash2(g);
  vec2 o = mix(vec2(0.5), base, clamp(jit, 0.0, 1.0));
  o += 0.045 * sin(t * 0.5 + TAU * base);
  return o;
}

// voronoi mesh: returns edge distance (to the nearest cell boundary = silk
// thread), site distance (to the nearest anchor = where dew sits) and the
// chosen cell id, all in lattice units.
void mesh(vec2 x, float t, float jit, out float edge, out float siteDist, out vec2 site) {
  vec2 n = floor(x);
  vec2 f = fract(x);

  // pass 1: nearest anchor
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + anchor(n + g, t, jit) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  site = n + mg;
  siteDist = sqrt(md);

  // pass 2: distance to the perpendicular bisector edges around that anchor
  md = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + anchor(n + g, t, jit) - f;
      vec2 diff = r - mr;
      float dd = dot(diff, diff);
      if (dd > 1e-4) md = min(md, dot(0.5 * (mr + r), normalize(diff)));
    }
  }
  edge = md;
}

// cyclic triangular palette weight on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float mn  = min(res.x, res.y);

  // square-cell, frame-centred coordinate
  vec2 uv = (fc - 0.5 * res) / mn;

  // palette with the house peacock fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // lattice coordinate, then warp it: organic silk waver + a downward gravity
  // sag that grows toward the bottom of the frame so the mesh droops.
  vec2 x = uv * max(u_density, 1.0);
  float w1 = vnoise(x * 0.6 + vec2(0.0, t * 0.05));
  float w2 = vnoise(x * 0.6 + vec2(5.0, -t * 0.04));
  x += u_warp * 0.8 * (vec2(w1, w2) - 0.5);
  x.y += u_sag * (0.8 + 0.9 * (-uv.y)) * (0.6 + 0.5 * vnoise(x * 0.3));

  float edge, siteDist;
  vec2  site;
  mesh(x, t, u_irregular, edge, siteDist, site);

  // --- silk threads on the cell borders ---
  // hairline strand in lattice units, with a faint narrow glow; thread
  // brightness varies cell to cell so the mesh is not a uniform tessellation
  float hw   = 0.011 * u_threadWidth;
  float aa   = 0.009;
  float core = 1.0 - smoothstep(hw, hw + aa, edge);
  float halo = exp(-edge * edge / (0.032 * 0.032));
  float cellRand = hash11(dot(site, vec2(12.39, 7.91)) + 1.3);
  float threadVar = 0.45 + 0.55 * hash11(dot(site, vec2(5.2, 1.7)) + 2.0);
  float silkAmt = (core + 0.22 * halo) * threadVar;

  // --- dew bead at each cell anchor, glinting in a travelling chase ---
  float dewR = (0.045 + 0.02 * cellRand) * u_dewSize;
  float bead = exp(-(siteDist * siteDist) / (dewR * dewR));
  float glint = 0.5 + 0.5 * sin((site.x + site.y) * 1.15 + cellRand * TAU
                                - t * u_glintSpeed * TAU * 0.22);
  glint = pow(glint, 3.5);
  float beadLight = mix(0.14, 1.0, glint);

  // --- colour: each cell draws a hue from the palette wheel ---
  float hueRand = hash11(dot(site, vec2(3.17, 9.73)) + 4.1);
  float hue = fract(hueRand * clamp(u_hueSpread, 0.0, 1.0) + 0.12 + t * 0.01) * 4.0;
  float k0 = wheelW(hue, 0.0), k1 = wheelW(hue, 1.0), k2 = wheelW(hue, 2.0), k3 = wheelW(hue, 3.0);
  vec3 dewCol = (c0 * k0 + c1 * k1 + c2 * k2 + c3 * k3) / max(k0 + k1 + k2 + k3, 0.001);

  // cool silk tint, faintly carrying the local cell hue
  vec3 silkCol = mix(mix(c0, c2, 0.5), dewCol, 0.25);

  // a brightness wave travelling along the silk in step with the dew chase
  float silkWave = 0.5 + 0.5 * sin((site.x + site.y) * 1.15 + cellRand * TAU
                                   - t * u_glintSpeed * TAU * 0.22 - 0.6);
  silkWave = mix(0.45, 1.5, silkWave * silkWave);

  // --- compose ---
  vec3 accum = vec3(0.0);
  accum += silkCol * silkAmt * 0.6 * u_silk * silkWave;       // silk mesh
  accum += dewCol * bead * beadLight * 1.7;                    // dew core
  accum += dewCol * bead * beadLight * 0.55;                   // dew halo
  accum += vec3(1.0) * bead * pow(glint, 3.0) * 0.5;           // white-hot glint

  // exposure tonemap so dense overlaps saturate to colour, not white
  accum = vec3(1.0) - exp(-accum * 1.25);

  vec3 col = BG + accum;

  // gentle radial falloff, floored so the mesh reads to the edges
  float vign = 0.8 + 0.2 * (1.0 - smoothstep(0.5, 1.3, length(uv)));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
