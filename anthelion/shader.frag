// anthelion (Kaleido) — named for the mirrored counter-sun halo, the luminous
// higher-key end of the family. A blazing multi-hue core throws a corona of
// mirror-folded rays of UNEVEN length (long spikes between short ones, like a
// real sun corona), crossed by a finer counter-rotating spark fan and ringed by
// concentric arcs broken into glowing beads. Pure bent light rather than cut
// glass, radiant on a deep dusk sky.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rays;       // primary light spokes (fold count) (default 12)
uniform float u_haloSpeed;  // beaded-arc outward speed           (default 0.6)
uniform float u_spin;       // ray rotation speed                 (default 0.1)
uniform float u_glow;       // overall luminosity                 (default 1.0)

const vec3 BG = vec3(0.024, 0.027, 0.044); // deep dusk-blue sky

float hash11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
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
  float ang  = atan(p.y, p.x);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 col = BG;

  // a soft coloured glow disc so the sky between rays has body, not dead black
  col += palBlend(c0, c1, c2, c3, r * 0.8 + t * 0.04) * exp(-r * r * 1.4) * 0.10 * u_glow;

  // --- primary corona: rays of uneven length, each its own hue ---
  float N    = max(floor(u_rays), 3.0);
  float seg  = 6.2831853 / N;
  float a1   = ang + t * u_spin;
  float si   = floor(a1 / seg);                 // ray index (for length + hue)
  float af   = abs(mod(a1, seg) - seg * 0.5);
  float au   = af / max(seg * 0.5, 1e-3);       // 0 at ray centre .. 1 between rays
  float hR   = hash11(si);
  // rays reach into the corners (corner radius ~1.9): long spikes to the frame
  // edge, short ones between, so the corona fills rather than floating in a disc
  float rayLen = 0.85 + 0.95 * hR;             // long spikes between short ones
  float thin   = mix(0.5, 0.16, hR);           // longer rays a touch finer
  float ray  = (1.0 - smoothstep(0.0, thin, au)) * smoothstep(rayLen + 0.45, 0.04, r);
  ray = ray * ray;
  vec3  rayHue = palBlend(c0, c1, c2, c3, hR * 1.6 + r * 0.3 + t * 0.04);
  col += rayHue * ray * 1.1 * u_glow;

  // --- finer counter-rotating spark fan, doubled frequency, offset ---
  float N2  = N * 2.0;
  float seg2 = 6.2831853 / N2;
  float a2  = ang - t * u_spin * 1.3;
  float af2 = abs(mod(a2 + seg2 * 0.5, seg2) - seg2 * 0.5);
  float au2 = af2 / max(seg2 * 0.5, 1e-3);
  float spark = (1.0 - smoothstep(0.0, 0.3, au2)) * smoothstep(1.5, 0.1, r) * smoothstep(0.05, 0.25, r);
  col += palBlend(c0, c1, c2, c3, 0.5 + r * 0.4 - t * 0.03) * spark * spark * 0.5 * u_glow;

  // --- concentric arcs broken into glowing beads, blooming outward to the rim ---
  float ringPhase = r * 5.5 - t * u_haloSpeed * 2.2;
  float arc  = exp(-pow(sin(ringPhase * 3.14159), 2.0) * 9.0);    // thin ring lines
  float bead = 0.5 + 0.5 * cos(ang * N - ringPhase * 1.5);        // chop into beads
  bead = 0.35 + 0.65 * pow(bead, 2.0);
  vec3  arcHue = palBlend(c0, c1, c2, c3, r * 0.8 + 0.3 - t * 0.03);
  col += arcHue * arc * bead * smoothstep(2.0, 0.14, r) * smoothstep(0.1, 0.3, r) * 1.15 * u_glow;

  // --- blazing multi-hue core ---
  float core = exp(-r * r * 11.0);
  col += palBlend(c0, c1, c2, c3, 0.15 + ang * 0.16 + t * 0.05) * core * 0.7 * u_glow;
  col += vec3(1.0) * exp(-r * r * 60.0) * 0.30 * u_glow;          // white-hot centre

  // keep the corona reaching into the corners; only soften the very edge
  col *= 1.0 - 0.4 * smoothstep(1.65, 2.2, r);

  gl_FragColor = vec4(col, 1.0);
}
