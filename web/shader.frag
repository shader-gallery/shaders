// web (Loom) — a single orb-weaver web hung across the dark from an off-centre
// hub: a dozen-odd irregular radial spokes at hashed angles crossed by a slightly
// wonky Archimedean spiral. Hairline silk strands are barely brighter than the
// night behind them; dew beads sit at the spoke–spiral crossings and glint awake
// in slow travelling sequence around the web, their colour drawn from the palette
// by ring and angle. The whole structure trembles a few pixels in the night air.
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
uniform float u_spokes;      // number of radial silk spokes        (default 13)
uniform float u_spacing;     // radial gap between spiral passes, css px (default 34)
uniform float u_tremble;     // night-air shiver amplitude          (default 0.5)
uniform float u_glintSpeed;  // dew-bead lighting-up rate           (default 0.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU      = 6.2831853;
const float MAX_SPK  = 24.0;   // literal loop cap (param clamps below this)
const float MAX_RING = 20.0;   // literal loop cap for dew rings along a spoke

// cheap hash helpers
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// smooth value noise in 2D (for the tremble displacement)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i, vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // off-centre hub: up and to the right of frame centre
  vec2 hub = res * vec2(0.585, 0.610);

  // overall scale so the web fills the frame regardless of aspect
  float scale = min(res.x, res.y);

  // --- tremble: a few CSS px of smooth, continuous noise displacement ---
  // two slow octaves of value noise drive a 2D wobble; phase-continuous, no reset.
  float trAmp = u_tremble * 6.0 * pr; // CSS px -> device px
  float nx = vnoise(fc * (0.9 / scale) + vec2(0.0, t * 0.32))
           + 0.5 * vnoise(fc * (2.1 / scale) + vec2(t * 0.47, 5.0));
  float ny = vnoise(fc * (0.9 / scale) + vec2(t * 0.28, 9.0))
           + 0.5 * vnoise(fc * (2.1 / scale) + vec2(3.0, t * 0.41));
  // a slow circular sway (never zero on both axes at once) guarantees the web is
  // always perceptibly displaced, with the value-noise adding the irregular shiver
  vec2 sway = vec2(sin(t * 0.55 + 1.3), cos(t * 0.47)) * 0.85;
  vec2 wobble = ((vec2(nx, ny) - 0.75) + sway) * trAmp;
  vec2 p = fc - hub + wobble;   // hub-relative, trembling

  float r   = length(p);
  float ang = atan(p.y, p.x);   // -PI..PI

  vec3 col = BG;

  // strand half-thickness (hairline) and dew radius, in device px
  float silk = 0.85 * pr;
  float dewR = 3.4 * pr;

  // ring gap (Archimedean pitch) from the css-px param
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float ringGap = max(u_spacing, 6.0) * refScale * pr;
  // gentle low-amplitude wobble on the spiral radius so rings are not perfectly true
  float spiralWobble = (vnoise(vec2(ang * 1.7, r * 0.004)) - 0.5) * ringGap * 0.35;

  float nSpk = clamp(floor(u_spokes + 0.5), 5.0, MAX_SPK);

  // ---- radial spokes at hashed (irregular) angles ----
  // distance from p to the nearest spoke ray, plus which spoke is nearest.
  float spokeDist = 1e9;
  float spokeIdx  = 0.0;
  float spokeAng  = 0.0;
  for (float i = 0.0; i < MAX_SPK; i += 1.0) {
    if (i >= nSpk) break;
    // base even angle + a hashed jitter so spokes are irregular
    float jitter = (hash11(i * 3.17 + 1.0) - 0.5) * (TAU / nSpk) * 0.55;
    float a = (i / nSpk) * TAU + jitter;
    vec2 dir = vec2(cos(a), sin(a));
    // perpendicular distance to the ray (only the half-plane in front of hub)
    float along = dot(p, dir);
    float perp  = abs(dot(p, vec2(-dir.y, dir.x)));
    // outside the ray (behind hub) gets pushed far so it does not draw
    float d = along > 0.0 ? perp : 1e9;
    if (d < spokeDist) { spokeDist = d; spokeIdx = i; spokeAng = a; }
  }

  // ---- spiral pass: Archimedean r = ringGap * k, with wobble ----
  float rw = r + spiralWobble;
  float ringF = rw / ringGap;           // continuous ring coordinate
  float ringId = floor(ringF + 0.5);    // nearest ring index
  float ringDist = abs(rw - ringId * ringGap); // distance to nearest spiral pass

  // fade the web out near the hub (tangle) and at the far edge
  float inner = smoothstep(ringGap * 0.6, ringGap * 1.4, r);
  float outerLim = scale * 0.62;
  float outer = 1.0 - smoothstep(outerLim, outerLim + ringGap * 2.0, r);
  float webMask = inner * outer;

  // anti-aliased silk strokes (barely brighter than the dark)
  float spokeStroke = (1.0 - smoothstep(0.0, silk + pr * 1.1, spokeDist)) * webMask;
  float ringStroke  = (1.0 - smoothstep(0.0, silk + pr * 1.1, ringDist)) * webMask;

  // ---- dew beads at spoke x spiral intersections ----
  // a bead sits where the nearest spoke meets each ring. We walk rings along the
  // nearest spoke and find the closest bead centre to p.
  float bead = 0.0;       // bead intensity (geometry)
  float beadPhase = 0.0;  // glint phase of the chosen bead
  float beadRingId = 0.0;
  {
    vec2 dir = vec2(cos(spokeAng), sin(spokeAng));
    float best = 1e9;
    for (float k = 1.0; k < MAX_RING; k += 1.0) {
      // bead radius along this spoke = ring k, de-wobbled back toward true radius
      float br = ringGap * k - spiralWobble;
      if (br > outerLim + ringGap) break;
      vec2 bc = dir * br;                 // bead centre, hub-relative
      float dd = length(p - bc);
      if (dd < best) { best = dd; beadRingId = k; }
    }
    // gaussian dew bead
    float g = exp(-(best * best) / (dewR * dewR));
    bead = g;
  }

  // sequenced glint: a brightness wave travelling around the spiral. Phase keyed
  // by ring + angle so it spirals; continuous sin, never resets.
  float angN = (spokeIdx / nSpk);                       // 0..1 around the web
  float seq  = beadRingId * 1.6 + angN * 3.0;           // spiral ordering, steeper pitch
  float glint = 0.5 + 0.5 * sin(seq * 1.3 - t * u_glintSpeed * TAU * 0.22);
  glint = pow(glint, 3.5);                              // sharpen into discrete sparks
  // a faint floor so beads never fully vanish
  float beadLight = mix(0.12, 1.0, glint);

  // palette: colour wanders by ring and angle through the restrained rainbow
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  float hue = fract(beadRingId * 0.14 + angN * 0.8 + t * 0.01) * 4.0;
  float w0 = wheelW(hue, 0.0), w1 = wheelW(hue, 1.0), w2 = wheelW(hue, 2.0), w3 = wheelW(hue, 3.0);
  vec3 dewCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // silk colour: a cool, very dim tint pulled from the palette mid
  vec3 silkCol = mix(c0, c2, 0.5);

  // woven propagation: a faint brightness wave travels outward along the silk in
  // step with the dew glint, so the threads themselves shimmer as the chase passes
  // (family motion language). Keyed to radius + angle, paced by the same speed.
  float silkWave = 0.5 + 0.5 * sin(rw / ringGap * 1.6 + angN * 3.0
                                   - t * u_glintSpeed * TAU * 0.22);
  silkWave = mix(0.08, 1.45, silkWave * silkWave);

  // --- compose: silk is faint, dew carries most of the light ---
  float silkAmt = (spokeStroke + ringStroke);
  col += silkCol * silkAmt * 0.24 * silkWave;            // hairline strands, shimmering
  col += dewCol * bead * beadLight * webMask * 1.35;     // dew core
  // soft bloom halo around lit beads
  col += dewCol * bead * beadLight * webMask * 0.5;
  // tiny white-hot centre on the brightest glints
  col += vec3(1.0) * bead * pow(glint, 3.0) * webMask * 0.35;

  // radial vignette to settle the framing
  float vign = 1.0 - smoothstep(0.35, 1.15, length((fc - res * 0.5) / res));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
