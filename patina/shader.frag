// patina (Burnish) — an aged bronze plate in time-lapse. Thresholded FBM carves
// mottled verdigris stains (tinted from the palette's cool colours) over darker
// metal, every stain rimmed by a thin line of raw bright bronze where oxide meets
// polish. Nothing orbits, nothing roams: the chemistry is the subject. Patch
// interiors stay matte and dark so the plate reads as material; all the light
// lives at the slowly creeping coastline between corrosion and metal.
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
uniform float u_creepSpeed;  // rate of coastline drift           (default 0.3)
uniform float u_grain;       // stain size, css px                (default 150)
uniform float u_fringe;      // crystal-fringe / glint brightness (default 0.7)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const vec3  BRONZE   = vec3(0.62,  0.42,  0.16);   // warm raw-bronze metal tint
const float THRESH   = 0.50;   // oxide forms where the field rises above this

// hash + value noise (no textures allowed)
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

// the oxide field: anchored FBM whose octaves drift in PHASE (z), not position,
// so stains change shape in place rather than translating across the plate.
float oxideField(vec2 p, float z) {
  float sum = 0.0;
  float amp = 0.5;
  float frq = 1.0;
  // Each octave morphs in place: we blend two ANCHORED noise samples (fixed
  // lattice, no translation) by a slowly time-varying weight, so the summed
  // coastline advances and retreats while no blob ever drifts across the plate.
  for (int i = 0; i < 5; i++) {
    float ph    = z * (0.6 + frq * 0.22) + float(i) * 1.7;
    float n     = vnoise(p * frq + 17.3);          // anchored sample A
    float n2    = vnoise(p * frq - 9.1);           // anchored sample B
    float modu  = vnoise(p * frq * 0.5 + 31.7);    // anchored phase modulator
    float blend = 0.5 + 0.5 * sin(ph + modu * 6.2831853);
    sum += amp * mix(n, n2, blend);
    frq *= 2.03;
    amp *= 0.52;
  }
  return sum;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // verdigris tint: blend the two coolest palette entries. We rank by how
  // blue-green each colour is (g+b minus r) so the stain reads "cool oxide"
  // regardless of theme; the warm raw bronze stays its own tone.
  float k0 = c0.g + c0.b - c0.r;
  float k1 = c1.g + c1.b - c1.r;
  float k2 = c2.g + c2.b - c2.r;
  float k3 = c3.g + c3.b - c3.r;
  // weighted toward the cooler colours
  float w0 = max(k0, 0.0) + 0.05;
  float w1 = max(k1, 0.0) + 0.05;
  float w2 = max(k2, 0.0) + 0.05;
  float w3 = max(k3, 0.0) + 0.05;
  vec3 verdigris = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
  // the bright fringe takes the single warmest palette entry (raw oxide crystal /
  // bared bronze glint) so the coastline pops against the cool patch.
  vec3 warmCol = c0;
  float warmest = -k0;
  if (-k1 > warmest) { warmest = -k1; warmCol = c1; }
  if (-k2 > warmest) { warmest = -k2; warmCol = c2; }
  if (-k3 > warmest) { warmest = -k3; warmCol = c3; }

  // sample the oxide field. grain (css px) sets the characteristic stain size:
  // larger grain => fewer, broader continental stains.
  float grain = max(u_grain, 20.0) * pr;
  vec2  uv    = (fc - ctr) / grain;
  // creep phase advances the chemistry; 0 freezes the plate. Continuous, no reset.
  float z     = t * u_creepSpeed * 0.5;

  float field = oxideField(uv, z);
  // normalise roughly to 0..1 (fbm sum ~ 0..1 already; gentle contrast)
  field = clamp((field - 0.18) * 1.55, 0.0, 1.0);

  // distance of the field from the oxide threshold. We estimate the local
  // gradient so the rim is constant-width in screen space (anti-aliased)
  // regardless of how steep the field is here.
  float eps = 0.012;
  float fxa = oxideField(uv + vec2(eps, 0.0), z);
  float fxb = oxideField(uv - vec2(eps, 0.0), z);
  float fya = oxideField(uv + vec2(0.0, eps), z);
  float fyb = oxideField(uv - vec2(0.0, eps), z);
  // re-apply the same contrast mapping to keep units consistent
  float gradMag = length(vec2(fxa - fxb, fya - fyb)) * 1.55 / (2.0 * eps);
  gradMag = max(gradMag, 0.001);

  // signed distance (in uv-ish field units) from the coastline
  float signedF = field - THRESH;
  // convert to an approximate pixel distance using the gradient
  float pxDist = abs(signedF) / gradMag; // ~ uv units to the coast

  // --- patch interior: matte, dark metal vs. dark oxide ---
  // inside oxide (field > THRESH): matte verdigris, kept DARK (material, not light)
  float inside = smoothstep(-0.02, 0.02, signedF);
  // subtle interior mottle so the patch reads as corroded material, still dark
  float mottle = 0.5 + 0.5 * sin(field * 22.0 + uv.x * 0.7);
  vec3  oxideInterior = verdigris * (0.05 + 0.06 * mottle);
  vec3  metalInterior = BRONZE   * (0.018 + 0.02 * mottle); // darker raw metal
  vec3  col = BG + mix(metalInterior, oxideInterior, inside);

  // --- the coastline: where ALL the light lives ---
  // a thin bright rim hugging the threshold, anti-aliased to ~1.5 css px
  float rimW = 1.6 / grain; // rim half-width in uv units (~1.6 css px)
  float rim  = 1.0 - smoothstep(0.0, rimW * 2.2, pxDist);

  // advancing vs retreating: sign of dField/dt tells us which way the coast moves.
  // sample the field slightly later in phase.
  float zAhead = (t + 0.18) * u_creepSpeed * 0.5;
  float fieldAhead = clamp((oxideField(uv, zAhead) - 0.18) * 1.55, 0.0, 1.0);
  float motion = (fieldAhead - field); // >0 oxide advancing here, <0 retreating

  // advancing fringe: cool crystal glitter (verdigris-bright). retreating edge:
  // warm bared-bronze glint. Both are the light of the moving shoreline.
  float adv = smoothstep(0.0, 0.01, motion);
  vec3  fringeCol = mix(warmCol, mix(verdigris, vec3(1.0), 0.35), adv);

  // micro-crystal glitter on the advancing fringe: sparse high-freq sparkle that
  // travels WITH the coast (anchored to the field, punctuating the orbit).
  float spark = vnoise(uv * 9.0 + z * 1.3);
  spark = smoothstep(0.86, 1.0, spark);
  float glint = spark * rim * (0.4 + 0.6 * abs(motion) * 30.0);

  float fringe = max(u_fringe, 0.0);
  // base rim glow + the directional glint, all scaled by FRINGE
  vec3 light = fringeCol * rim * (0.55 + 1.1 * abs(motion) * 20.0);
  light += mix(verdigris, vec3(1.0), 0.5) * glint * 1.2;
  col += light * fringe;

  // a whisper of bloom just off the coastline so the etched line catches light
  float bloom = exp(-pxDist / (rimW * 6.0));
  col += fringeCol * bloom * 0.12 * fringe;

  // radial vignette: keep the plate's edges in shadow, centre catching lamplight
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.72, 1.0, vign);

  // gentle tone curve so highlights don't clip and the base stays inky
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
