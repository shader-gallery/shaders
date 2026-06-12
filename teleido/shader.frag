// teleido (Kaleido) — the archetypal kaleidoscope: a single wedge of soft
// jewel-light blobs mirror-folded N times around the centre and slowly rotated,
// so the pattern endlessly reshuffles as the unseen object cell drifts through
// the tube. Jewel hues bloom on near-black; the mirror seams catch a faint rim
// of light. The family reference piece for the polar mirror-fold.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_segments;     // mirror-fold count          (default 6)
uniform float u_rotateSpeed;  // tube rotation speed        (default 0.15)
uniform float u_zoom;         // pattern zoom               (default 1.0)
uniform float u_drift;        // object-cell drift rate     (default 1.0)

const vec3 BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
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
  vec2  p   = (gl_FragCoord.xy - ctr) / mn; // frame-relative, already DPR-safe
  float t   = u_time;

  // --- polar mirror-fold: rotate the tube, then reflect within one wedge ---
  float r   = length(p);
  float a   = atan(p.y, p.x);
  float N   = max(floor(u_segments), 2.0);
  float seg = 6.2831853 / N;
  a += t * u_rotateSpeed;
  a  = mod(a, seg);
  a  = abs(a - seg * 0.5);          // mirror seam at the wedge edges
  vec2 q = vec2(cos(a), sin(a)) * r;

  // pattern (object-cell) space: a jewel LATTICE in the folded coordinate. The
  // fold confines q to a thin wedge, so a tiled field (not scattered blobs) is
  // what keeps every reflection full. Drift is applied AFTER the fold so all
  // reflected copies sample the same lattice and symmetry holds.
  float z = max(u_zoom, 0.05);
  vec2  g = q * (4.6 / z);
  g += vec2(sin(t * 0.13 * u_drift) * 0.6, t * 0.24 * u_drift);

  // palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 col = BG;

  // a deep jewel tint between the chips so the wedge glows rather than going
  // dead-black — hue rolls outward with radius and time
  col += palBlend(c0, c1, c2, c3, r * 0.7 - t * 0.04) * exp(-r * r * 2.0) * 0.10;

  // jewel lattice — each cell holds one soft glass chip with a hashed hue that
  // drifts gently within its cell; a 3x3 neighbourhood keeps the discs seamless
  vec2  id   = floor(g);
  vec3  csum = vec3(0.0);
  float wsum = 0.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2  cid = id + vec2(float(ox), float(oy));
      float h   = hash21(cid);
      vec2  jp  = cid + 0.5 + 0.34 * vec2(sin(t * 0.3 * u_drift + h * 6.28),
                                          cos(t * 0.27 * u_drift + h * 5.13));
      float d    = length(g - jp);
      float rad  = 0.36 + 0.12 * sin(h * 9.0);
      float glow = smoothstep(rad, 0.0, d);
      float w    = glow * glow;
      csum += palBlend(c0, c1, c2, c3, h * 1.7 + t * 0.03) * w;
      wsum += w;
    }
  }
  // colour = weighted average (stays saturated where chips overlap, instead of
  // summing to white); coverage drives the brightness
  vec3  jewels = csum / max(wsum, 0.001);
  float cover  = min(wsum, 1.0);
  col += jewels * cover * 1.35;

  // a whisper of light along the mirror seams (the reflected glass edges)
  float seam = exp(-a * a * 60.0) * smoothstep(0.75, 0.04, r) * smoothstep(0.02, 0.14, r);
  col += palBlend(c0, c1, c2, c3, 0.55 + t * 0.05) * seam * 0.06;

  // luminous centre jewel, dark outer rim
  col *= smoothstep(1.2, 0.05, r);
  col += palBlend(c0, c1, c2, c3, 0.3) * exp(-r * r * 70.0) * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
