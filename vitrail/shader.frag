// vitrail (Kaleido) — a stained-glass rose window. The mirror-fold lays out
// concentric rings of leaded panes around a bright central rosette, and unlike a
// flat colour-wheel EVERY pane carries its own jewel hue, so the window reads as
// a real mosaic of cut glass rather than banded rings. A slow tide of light
// blooms outward ring by ring; the dark lead cames stay black between the panes.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_petals;     // panes per ring (mirror-fold count) (default 12)
uniform float u_rings;      // concentric pane rings              (default 6)
uniform float u_leadWidth;  // lead came thickness, pane fraction (default 0.10)
uniform float u_pulseSpeed; // outward light-bloom speed          (default 0.6)

const vec3 BG = vec3(0.026, 0.026, 0.034); // near-black leaded base

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

  float r    = length(p) * 2.0;
  float ang  = atan(p.y, p.x) + t * 0.04;     // window turns slowly
  float N    = max(floor(u_petals), 3.0);
  float seg  = 6.2831853 / N;
  float si   = floor(ang / seg);              // which pane around the ring (for hue)
  float a    = abs(mod(ang, seg) - seg * 0.5);
  float au   = clamp(a / max(seg * 0.5, 1e-3), 0.0, 1.0); // 0 pane centre .. 1 seam

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float RINGS = max(floor(u_rings), 1.0);
  // brick-stagger alternate rings so seams do not line up into spokes
  float ring  = r * RINGS;
  float ri    = floor(ring);
  float rf    = fract(ring);
  float sib   = floor(ang / seg + 0.5 * mod(ri, 2.0)); // staggered pane id per ring
  float lead  = clamp(u_leadWidth, 0.03, 0.4);

  // lead cames: dark at the pane borders (ring edges + the seam at au=1)
  float cameR = smoothstep(0.0, lead, rf) * smoothstep(0.0, lead, 1.0 - rf);
  float cameA = smoothstep(0.0, lead, 1.0 - au);
  float pane  = cameR * cameA;

  // EACH pane its own jewel hue (hash of ring + pane index), with a faint inner
  // gradient so the glass looks lit through, not flat. Strong per-pane hue swing
  // so neighbours contrast like real cut glass, not a smooth wash.
  float h     = hash21(vec2(ri, sib) + ri * 1.7);
  // hue is the FULL palette wheel per pane (no radial bias) → bold random mosaic,
  // adjacent panes contrast like real cut glass instead of tonal rings
  vec3  glass = palBlend(c0, c1, c2, c3, h + t * 0.02);
  float grad  = 0.82 + 0.18 * (1.0 - au);     // brighter toward the pane centre

  // a tide of light blooming outward through the rings — shimmer, never dark
  float pulse = 0.5 + 0.5 * sin(r * 5.0 - t * u_pulseSpeed * 2.2);
  float lum   = pane * grad * (0.42 + 0.42 * pulse);

  vec3 col = BG;
  col += glass * lum * 1.18;

  // a thin warm glint riding the lead just inside each pane (came catching light)
  float glint = (1.0 - cameR) * cameA + (1.0 - cameA) * cameR;
  col += palBlend(c0, c1, c2, c3, h * 1.6 + 0.5) * glint * 0.08 * (0.5 + 0.5 * pulse);

  // central rosette — a bright multi-petal glass boss
  float pet  = 0.5 + 0.5 * cos(ang * N * 0.5 - t * 0.2);
  float boss = exp(-r * r * 22.0) * (0.6 + 0.4 * pet);
  col += palBlend(c0, c1, c2, c3, 0.15 + t * 0.05) * boss * 0.5;

  // keep the panes lit into the corners (corner radius ~1.9) but let the glass
  // settle a touch toward the rim so it reads as backlit, not a blown-out wash
  col *= 1.0 - 0.5 * smoothstep(0.7, 2.0, r);

  gl_FragColor = vec4(col, 1.0);
}
