// web (Loom) -- layered orb-weaver webs receding into the dark. Two or three
// irregular radial webs hang at different depths from decorrelated hubs: the far
// webs are smaller, finer, dimmer and softened by depth-of-field while the near
// web is crisp and bright. Dew beads at the spoke-spiral crossings glint awake
// in slow travelling sequence around each web, their colour drawn from the
// palette by ring and angle, and the whole structure trembles in the night air.
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
uniform float u_spokes;      // radial silk spokes per web            (default 13)
uniform float u_spacing;     // radial gap between spiral passes, css px (default 34)
uniform float u_tremble;     // night-air shiver amplitude            (default 0.5)
uniform float u_glintSpeed;  // dew-bead lighting-up rate             (default 0.5)
uniform float u_layers;      // stacked webs at receding depth, 1..3  (default 3)
uniform float u_depthFade;   // brightness of the farthest web vs near (default 0.32)
uniform float u_dof;         // depth-of-field softening on far webs   (default 1.6)
uniform float u_irregular;   // spoke and spiral irregularity          (default 1.0)
uniform float u_hueSpread;   // hue separation between near and far    (default 0.18)

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

// one full orb-weaver web. seed decorrelates the spoke pattern and hub position;
// zoom below 1 pushes the web farther (smaller on screen, finer rings); blur
// widens the strokes and dew (depth-of-field); hueOff rotates its dew palette.
// Returns the additive glow contribution before depth dimming.
vec3 webLayer(vec2 fc, vec2 res, float t, float pr, float scale, float seed,
              float zoom, float blur, float hueOff,
              vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  // per-layer hub: off-centre, jittered by seed so the webs do not stack
  vec2 hubJit = (vec2(hash11(seed + 1.7), hash11(seed + 4.3)) - 0.5) * 0.34;
  vec2 hub = res * (vec2(0.585, 0.610) + hubJit);

  // --- tremble: a few CSS px of smooth, continuous noise displacement ---
  float trAmp = u_tremble * 6.0 * pr;
  float ph = seed * 2.0;   // decorrelate each web's shiver phase
  float nx = vnoise(fc * (0.9 / scale) + vec2(ph, t * 0.32))
           + 0.5 * vnoise(fc * (2.1 / scale) + vec2(t * 0.47, 5.0 + ph));
  float ny = vnoise(fc * (0.9 / scale) + vec2(t * 0.28, 9.0 + ph))
           + 0.5 * vnoise(fc * (2.1 / scale) + vec2(3.0 + ph, t * 0.41));
  vec2 sway = vec2(sin(t * 0.55 + 1.3 + ph), cos(t * 0.47 + ph)) * 0.85;
  vec2 wobble = ((vec2(nx, ny) - 0.75) + sway) * trAmp;

  // zoom scales the hub-relative coordinate: a far web reads smaller and finer
  vec2 p = (fc - hub + wobble) / max(zoom, 0.05);

  float r   = length(p);
  float ang = atan(p.y, p.x);   // -PI..PI

  // strand half-thickness and dew radius; blur softens both for the far webs
  float silk = (0.85 + blur) * pr;
  float dewR = (3.4 + blur * 1.6) * pr;
  float aa   = pr * 1.1 + blur * pr;

  // ring gap (Archimedean pitch) from the css-px param
  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float ringGap = max(u_spacing, 6.0) * refScale * pr;
  // low-amplitude wobble on the spiral radius so rings are not perfectly true
  float spiralWobble = (vnoise(vec2(ang * 1.7, r * 0.004)) - 0.5) * ringGap * 0.35 * u_irregular;

  float nSpk = clamp(floor(u_spokes + 0.5), 5.0, MAX_SPK);

  // ---- radial spokes at hashed (irregular) angles ----
  float spokeDist = 1e9;
  float spokeIdx  = 0.0;
  float spokeAng  = 0.0;
  for (float i = 0.0; i < MAX_SPK; i += 1.0) {
    if (i >= nSpk) break;
    float jitter = (hash11(i * 3.17 + 1.0 + seed * 7.0) - 0.5) * (TAU / nSpk) * 0.55 * u_irregular;
    float a = (i / nSpk) * TAU + jitter;
    vec2 dir = vec2(cos(a), sin(a));
    float along = dot(p, dir);
    float perp  = abs(dot(p, vec2(-dir.y, dir.x)));
    float d = along > 0.0 ? perp : 1e9;
    if (d < spokeDist) { spokeDist = d; spokeIdx = i; spokeAng = a; }
  }

  // ---- spiral pass: Archimedean r = ringGap * k, with wobble ----
  float rw = r + spiralWobble;
  float ringId = floor(rw / ringGap + 0.5);
  float ringDist = abs(rw - ringId * ringGap);

  // fade the web out near the hub (tangle) and at the far edge
  float inner = smoothstep(ringGap * 0.6, ringGap * 1.4, r);
  float outerLim = scale * 0.62;
  float outer = 1.0 - smoothstep(outerLim, outerLim + ringGap * 2.0, r);
  float webMask = inner * outer;

  // anti-aliased silk strokes
  float spokeStroke = (1.0 - smoothstep(0.0, silk + aa, spokeDist)) * webMask;
  float ringStroke  = (1.0 - smoothstep(0.0, silk + aa, ringDist)) * webMask;

  // ---- dew beads at spoke x spiral intersections ----
  float bead = 0.0;
  float beadRingId = 0.0;
  {
    vec2 dir = vec2(cos(spokeAng), sin(spokeAng));
    float best = 1e9;
    for (float k = 1.0; k < MAX_RING; k += 1.0) {
      float br = ringGap * k - spiralWobble;
      if (br > outerLim + ringGap) break;
      vec2 bc = dir * br;
      float dd = length(p - bc);
      if (dd < best) { best = dd; beadRingId = k; }
    }
    bead = exp(-(best * best) / (dewR * dewR));
  }

  // sequenced glint: a brightness wave travelling around the spiral
  float angN = spokeIdx / nSpk;
  float seq  = beadRingId * 1.6 + angN * 3.0;
  float glint = 0.5 + 0.5 * sin(seq * 1.3 - t * u_glintSpeed * TAU * 0.22);
  glint = pow(glint, 3.5);
  float beadLight = mix(0.12, 1.0, glint);

  // palette: colour wanders by ring and angle, offset per layer by hueOff
  float hue = fract(beadRingId * 0.14 + angN * 0.8 + t * 0.01 + hueOff) * 4.0;
  float w0 = wheelW(hue, 0.0), w1 = wheelW(hue, 1.0), w2 = wheelW(hue, 2.0), w3 = wheelW(hue, 3.0);
  vec3 dewCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // silk colour: a cool tint pulled from the palette mid
  vec3 silkCol = mix(c0, c2, 0.5);

  // woven propagation: a brightness wave travels outward along the silk in step
  // with the dew glint, so the threads shimmer as the chase passes
  float silkWave = 0.5 + 0.5 * sin(rw / ringGap * 1.6 + angN * 3.0
                                   - t * u_glintSpeed * TAU * 0.22);
  silkWave = mix(0.32, 1.7, silkWave * silkWave);

  // --- compose this web: luminous silk + bright dew glints ---
  vec3 acc = vec3(0.0);
  float silkAmt = spokeStroke + ringStroke;
  acc += silkCol * silkAmt * 0.62 * silkWave;      // hairline strands, shimmering
  acc += dewCol * bead * beadLight * webMask * 1.7; // dew core
  acc += dewCol * bead * beadLight * webMask * 0.6; // soft bloom halo
  acc += vec3(1.0) * bead * pow(glint, 3.0) * webMask * 0.55; // white-hot centre
  return acc;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float scale = min(res.x, res.y);

  // palette with a peacock fallback when none is themed
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float nLayers = clamp(floor(u_layers + 0.5), 1.0, 3.0);
  vec3 accum = vec3(0.0);
  // draw back-to-front so the near web reads on top of the far ones
  for (float i = 2.0; i >= 0.0; i -= 1.0) {
    if (i > nLayers - 1.0) continue;
    float depth01 = nLayers > 1.0 ? i / (nLayers - 1.0) : 0.0; // 0 near .. 1 far
    float dim    = mix(1.0, u_depthFade, depth01);
    float blur   = u_dof * depth01;
    float zoom   = mix(1.0, 0.72, depth01);
    float hueOff = depth01 * u_hueSpread;
    float seed   = i * 11.7;
    accum += webLayer(fc, res, t, pr, scale, seed, zoom, blur, hueOff,
                      c0, c1, c2, c3) * dim;
  }

  // exposure tonemap so stacked additive glow saturates to colour, not white
  accum = vec3(1.0) - exp(-accum * 1.15);

  vec3 col = BG + accum;

  // gentle radial falloff, floored so the webs read to the edges
  float vign = 0.78 + 0.22 * (1.0 - smoothstep(0.5, 1.25, length((fc - res * 0.5) / res)));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
