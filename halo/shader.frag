// halo (Shoal) — Snell window seen from underwater: one bright wavering disc of
// surface light hangs high in the frame, its interior a soft warm-to-cool palette
// blend brightest at centre, like sky read through a heaving surface. The rim frays
// with ridged FBM — the circle edge torn radially into filamental tongues where
// total internal reflection breaks — and outside it the field falls quickly into
// deep blue-black with only the faintest downwelling gradient. The fray crawls
// slowly around the disc (noise drifted in the angular domain, periodic by
// construction so seamless), the radius breathes a few percent, and the interior
// shimmers with low-amplitude warped noise — all very slow, nothing that can reset.
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
uniform float u_haloRadius;  // CSS-px radius of the Snell-window disc (default 320), times u_pixelRatio in code
uniform float u_fray;        // depth of the rim's ridged-noise fraying    (default 1)
uniform float u_waverSpeed;  // crawl speed of fray + interior shimmer      (default 0.18)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
// disc centre lift above frame centre. Expressed as a FRACTION of disc radius so the
// aperture genuinely hangs high at every radius — a big disc lifts proportionally more,
// keeping its full frayed rim on-screen instead of only a lower arc.
const float DISC_LIFT_FRAC = 0.62;

// --- hash / value noise (no textures, all procedural) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Periodic value noise on an angle a (0..2pi): sample on a circle of radius rad in a
// noise plane so it is seamless in the angular domain, plus a free axis (radius/time).
float pnoise1(float a, float freq, float yaxis) {
  vec2 q = vec2(cos(a), sin(a)) * freq;
  return vnoise(q + vec2(0.0, yaxis));
}

// ridged fbm over the periodic angular noise — feathery filamental tongues for the fray
float ridgedFray(float a, float yaxis) {
  float sum = 0.0;
  float amp = 0.55;
  float fr  = 3.0;
  // 4 octaves, constant bounds
  for (int o = 0; o < 4; o++) {
    float n = pnoise1(a, fr, yaxis * (1.0 + float(o) * 0.37));
    n = 1.0 - abs(2.0 * n - 1.0);   // ridge
    // gentle sharpen — keep tongues soft & feathery (caustic), not spiky lightning
    n = n * (0.55 + 0.45 * n);
    sum += n * amp;
    amp *= 0.5;
    fr  *= 2.0;
  }
  return sum; // ~0..1 range
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // guard radius against a 0 param so nothing divides by zero / explodes
  float reqR = max(u_haloRadius, 1.0) * pr;
  // Soft-contain the disc so its full frayed rim stays on-screen across the WHOLE
  // radius range. (1 - exp(-x)) saturates: small radii pass through near-linearly (the
  // param still visibly grows the disc) while the largest radii asymptote to ~maxVisible
  // instead of swallowing the frame into a flat gradient — it always stays a ringed
  // disc with a live rim, never an accidental generic radial wash at the top end.
  // (exp is GLSL ES 1.00; tanh is not, so this is the portable saturator.)
  float maxVisible = min(res.x, res.y) * 0.45;
  float baseR = maxVisible * (1.0 - exp(-reqR / maxVisible));

  // disc centre: horizontally centred, lifted high in the frame by a fraction of its
  // own radius so the aperture genuinely hangs high and its whole rim shows.
  // gl_FragCoord.y increases upward, so ADD the lift to push the disc toward the top.
  float lift = baseR * DISC_LIFT_FRAC;
  vec2 ctr = vec2(res.x * 0.5, res.y * 0.5 + lift);
  vec2 d   = fc - ctr;
  float r  = length(d);
  float ang = atan(d.y, d.x); // -pi..pi

  float wsp = u_waverSpeed;

  // --- breathing radius (a few percent, very slow, two incommensurate sines) ---
  float breathe = 1.0
    + 0.018 * sin(t * (0.18 + wsp * 0.6))
    + 0.012 * sin(t * (0.11 + wsp * 0.37) + 1.7);
  float discR = baseR * breathe;

  // --- rim fray: ridged noise drifting in the angular domain (crawls around) ---
  // angle advanced by time so the whole fray pattern rotates slowly & seamlessly
  float crawl = t * wsp * 0.45;
  float fray = ridgedFray(ang + crawl, t * wsp * 0.25);
  // centre the fray around 0 so it both eats into and pushes out the rim as tongues
  float frayAmp = baseR * 0.20 * u_fray;
  float rimR = discR + (fray - 0.42) * frayAmp;

  // soft anti-aliased disc membership: 1 inside, 0 outside, with a fray-torn edge
  float aa = max(2.0 * pr, baseR * 0.012);
  float inside = 1.0 - smoothstep(rimR - aa, rimR + aa, r);

  // normalised radius within the disc for the interior gradient
  float rn = clamp(r / max(discR, 1.0), 0.0, 1.0);

  // --- interior shimmer: low-amplitude warped value noise, slow rolling ---
  vec2 uv = d / max(baseR, 1.0);
  float warp = vnoise(uv * 2.3 + vec2(t * wsp * 0.12, -t * wsp * 0.09));
  float shimmer = vnoise(uv * 3.1 + warp * 0.6 + vec2(-t * wsp * 0.07, t * wsp * 0.10));
  shimmer = 0.85 + 0.30 * (shimmer - 0.5);

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // interior colour: warm-to-cool blend, warmest/brightest at centre cooling to rim.
  // Treat c3 as the warm core, c0/c2 as the cool sky toward the rim, c1 a mid accent.
  vec3 warmCore = mix(c3, c1, 0.35);
  vec3 coolSky  = mix(c0, c2, 0.5);
  vec3 interior = mix(warmCore, coolSky, smoothstep(0.0, 0.55, rn));
  // a faint shimmer-driven hue wobble toward c2 so the surface "heaves"
  interior = mix(interior, c2, 0.10 * (shimmer - 0.85) / 0.30);

  // brightness profile: hot, concentrated core falling steeply toward the rim so
  // the bright aperture reads contained and the disc edges sink into deep water.
  float coreGlow = 0.95 * exp(-rn * rn * 3.1) + 0.10 * (1.0 - rn);
  coreGlow *= shimmer;

  // rim incandescence: a soft caustic web along the torn edge — wide, feathery falloff
  // (not a tight high-contrast arc) so the tongues read as bent light, not electric arcs.
  float rimGlow = exp(-abs(r - rimR) / max(aa * 9.0, baseR * 0.07));
  // modest tongue brightening, kept low-contrast so it never clips toward white
  rimGlow *= (0.55 + 0.45 * fray);

  vec3 col = BG;

  // faint downwelling gradient outside the disc (top a touch lighter than bottom —
  // light comes from the surface above; fc.y increases upward).
  float down = smoothstep(-0.6, 0.6, (fc.y - res.y * 0.5) / res.y);
  col += coolSky * 0.022 * down;

  // the disc body
  col += interior * coreGlow * inside * 0.72;

  // rim incandescence (additive, both just inside and as bloom just outside).
  // Tinted toward the warm caustic core; intensity kept low so the tongues stay a soft
  // luminous fringe — never a blown-out white wash.
  vec3 rimCol = mix(warmCore, c2, 0.22);
  col += rimCol * rimGlow * (0.14 + 0.16 * u_fray);

  // soft outer bloom halo so the aperture bleeds light into the dark water
  float outerBloom = exp(-max(r - discR, 0.0) / (baseR * 0.55));
  col += coolSky * outerBloom * 0.10 * (1.0 - inside);

  // gentle vignette to settle the corners into deep blue-black
  float vign = 1.0 - smoothstep(0.45, 1.15, length((fc - res * 0.5) / res));
  col *= vign;

  // soft luminance ceiling: keep the brightest rim/core a luminous glow, never a
  // blown-out white clip. Roll values above ~0.7 toward a gentle shoulder.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float capped = lum - 0.30 * max(lum - 0.62, 0.0);
  col *= capped / max(lum, 1e-4);

  gl_FragColor = vec4(col, 1.0);
}
