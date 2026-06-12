// harlequin (Kaleido) — a cut-crystal mandala of hard, flat facets. Where the
// other Kaleido pieces blur, this one keeps knife-sharp mirror seams: the folded
// field is quantised into angular/radial facets, each flat-shaded a single jewel
// hue with a bright bevel at its edges, like a faceted gemstone catching light.
// Inner and outer rings counter-rotate, so the diamond pattern shears and
// reshuffles as the stone turns.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_segments;    // mirror-fold count           (default 10)
uniform float u_facets;      // radial facet rings          (default 6)
uniform float u_counterSpin; // inner/outer counter-rotation (default 0.18)
uniform float u_bevel;       // facet bevel sharpness        (default 1.0)

const vec3 BG = vec3(0.030, 0.030, 0.039);

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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

  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);

  // RIGID counter-rotation by radial zone: each concentric band turns as one
  // piece (alternating sense) so the diamonds stay crisp instead of shearing into
  // spirals — the kaleidoscope-turn click, kept hard-edged.
  float RINGS = max(floor(u_facets), 2.0);
  float zone  = floor(r * RINGS * 0.5);
  float zdir  = mod(zone, 2.0) < 0.5 ? 1.0 : -1.0;
  a += t * u_counterSpin * zdir;

  float N    = max(floor(u_segments), 3.0);
  float seg  = 6.2831853 / N;
  // continuous pane coordinate around the full circle (each unit = one diamond),
  // mirror-folded so opposite sides reflect
  float paneU = a / seg;
  float fold  = abs(fract(paneU) - 0.5) * 2.0;   // 0..1, mirror within each pane

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // ARGYLE diamonds: a polar lattice of ring x pane cells, alternate rings offset
  // half a pane so the cells lock into a diamond harlequin. Each diamond a bold
  // jewel hue from the full palette wheel; the interstices are dark, and thin
  // contrast threads cross the lattice like argyle overstitch.
  float ringF = r * RINGS;
  float ri    = floor(ringF);
  float rf    = fract(ringF);
  float off   = 0.5 * mod(ri, 2.0);
  float pf    = fract(paneU + off);            // 0..1 within the pane (staggered)
  float pi    = floor(paneU + off);

  // diamond cell: L1 distance from the cell centre — diamond edge at dd = 0.5
  float dd    = abs(rf - 0.5) + abs(pf - 0.5);
  float bev   = clamp(u_bevel, 0.1, 3.0);
  float edgeW = 0.16 / bev;
  float plate = smoothstep(0.5, 0.5 - edgeW, dd);   // flat diamond, crisp edge

  float h     = hash21(vec2(pi, ri) * 1.31 + 4.0);
  vec3  facet = palBlend(c0, c1, c2, c3, h + t * 0.02);   // full-wheel jewel per diamond
  float shimmer = 0.7 + 0.3 * sin(ri * 1.1 - t * 0.7 + h * 6.28);

  vec3  col = BG;
  col += facet * plate * (0.7 + 0.7 * shimmer) * 1.25;

  // bright thread riding the diamond edge (the harlequin overstitch glint)
  float thread = smoothstep(0.5 + edgeW, 0.5, dd) * smoothstep(0.5 - edgeW * 2.0, 0.5, dd);
  col += palBlend(c0, c1, c2, c3, h + 0.5) * thread * 0.6;

  // a small contrast pip at each diamond centre, the jester's dot
  float pip = smoothstep(0.13, 0.0, dd);
  col += palBlend(c0, c1, c2, c3, h + 2.0) * pip * 0.5;

  // a hard central crystal table
  col += palBlend(c0, c1, c2, c3, 0.2 + t * 0.04) * smoothstep(0.12, 0.0, r) * 0.6;

  // keep the argyle running into the corners (corner radius ~1.9); only soften
  // the very edge so the diamonds fill the frame instead of a black disc
  col *= 1.0 - 0.4 * smoothstep(1.55, 2.1, r);

  gl_FragColor = vec4(col, 1.0);
}
