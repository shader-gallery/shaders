// chamber (Kaleido) — the three-mirror tube. The triangular mirror chamber of a
// real kaleidoscope tiles the whole plane with reflected copies of one triangle,
// so this fills the frame edge-to-edge with a repeating jewelled wallpaper
// rather than a single radial star. Motes of coloured glass drift through the
// fundamental triangle; the lattice reflects them into an endless honeycomb that
// slides and turns. Distinct from the radial pieces — this is the wallpaper view.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;       // triangles across the frame   (default 3.5)
uniform float u_driftSpeed;  // glass drift through the cell  (default 1.0)
uniform float u_turnSpeed;   // whole-lattice rotation        (default 0.08)
uniform float u_glow;        // mote glow strength            (default 1.0)

const vec3 BG = vec3(0.034, 0.034, 0.043);
const float SQ3 = 1.7320508;

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 palBlend(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float mn  = min(res.x, res.y);
  vec2  p   = (gl_FragCoord.xy - ctr) / mn;
  float t   = u_time;

  // turn the whole lattice slowly
  float ca = cos(t * u_turnSpeed), sa = sin(t * u_turnSpeed);
  p = mat2(ca, -sa, sa, ca) * p;

  // RADIAL mirror-fold (the Teleido split): reflect the plane into 12 wedges
  // around the centre, so the triangular tiling radiates from the middle with
  // mirror seams and fills the frame to the corners — a hexagonal kaleidoscope
  // rather than a flat parallel wallpaper.
  float rr  = length(p);
  float aa  = atan(p.y, p.x);
  float segf = 6.2831853 / 12.0;
  aa = abs(mod(aa, segf) - segf * 0.5);
  p  = vec2(cos(aa), sin(aa)) * rr;

  float scale = max(u_scale, 0.5);
  vec2  g = p * scale;

  // --- fold the plane into one equilateral-triangle cell (reflective tiling) ---
  // express g in the rhombic lattice basis e1=(1,0), e2=(0.5, SQ3/2)
  float u = g.x - g.y / SQ3;
  float v = g.y * 2.0 / SQ3;
  u = fract(u);
  v = fract(v);
  // the rhombus splits into two mirrored triangles; fold the far one back so the
  // content is identical (mirrored) in every triangle — a true reflective tiling
  if (u + v > 1.0) { u = 1.0 - u; v = 1.0 - v; }

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 col = BG;

  // barycentric weights of the fundamental triangle: w0 at the origin vertex,
  // wu at (1,0), wv at (0,1). Because the content depends ONLY on these (same in
  // every triangle), the tiling is a seamless mirror honeycomb.
  float w0 = 1.0 - u - v;
  float wu = u;
  float wv = v;
  float br = 0.5 + 0.5 * sin(t * 0.5 * u_driftSpeed);

  // each triangle is a little stained-glass pane: a smooth three-colour blend
  // across its vertices, so every pane carries all the hues and edges match
  vec3 glass = c0 * w0 + c1 * wu + c2 * wv;

  // distance to the nearest triangle edge (0 on an edge, 1/3 at the centroid)
  float edge = min(min(w0, wu), wv);
  float interior = smoothstep(0.0, 0.30, edge);     // dark at the leading, lit inside
  col += glass * (0.16 + 0.7 * interior) * (0.7 + 0.45 * br) * u_glow;

  // GLOWING MIRROR NET: bright lines along every triangle edge make the
  // kaleidoscope chamber legible as a triangular lattice, not a dot grid
  float net = smoothstep(0.05, 0.0, edge);
  col += palBlend(c0, c1, c2, c3, 0.6 + t * 0.05) * net * 0.5 * u_glow;

  // a bright jewel at each triangle centroid, breathing
  float cd  = length(vec2(u - 1.0 / 3.0, v - 1.0 / 3.0));
  float pip = smoothstep(0.26, 0.0, cd);
  col += palBlend(c0, c1, c2, c3, 0.15 + t * 0.04) * pip * pip * (0.45 + 0.5 * br) * u_glow;

  // gentle centre-weighting that still keeps the corners lit (length(p) is the
  // true radius — both the rotation and the radial fold preserve it)
  float vign = 1.0 - 0.4 * smoothstep(0.5, 1.4, length(p));
  col *= mix(0.95, 1.12, smoothstep(1.0, 0.0, length(p))) * vign;

  gl_FragColor = vec4(col, 1.0);
}
