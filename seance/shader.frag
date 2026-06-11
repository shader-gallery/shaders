// seance (Omen) — a full-frame veil of near-black cloth, rendered as a fine
// vertical-biased FBM weave that drifts imperceptibly and never rests. From
// behind it, vague rounded forms press forward: domain-warped swellings that
// brighten locally, stretch the weave's highlights around their bulge, and
// gather a faint palette-blended halo as they near the surface — almost a face,
// almost a hand — then relax and dissolve back into the dark. The subject is
// emergence (perpendicular pressure toward the viewer), not lateral travel.
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
uniform float u_emergeSpeed; // press-through / dissolve cycle speed  (default 0.25)
uniform float u_formSize;    // swelling diameter, css px            (default 280)
uniform float u_presence;    // peak contrast + warp depth a form reaches (default 0.6)

const vec3  BG        = vec3(0.030, 0.030, 0.038); // near-black cloth base
const float WEAVE_CSS = 3.4;   // base cell size of the weave, css px
const int   FORMS     = 3;     // simultaneous candidate swellings (const loop bound)

// --- hashes (no textures) ---
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  hash22(vec2 p)  {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

// value noise
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fbm with vertical bias (warp coords stretched in y -> threads run vertically)
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return s;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guards so param extremes never NaN/divide-by-zero
  float speed   = max(u_emergeSpeed, 0.02);
  float formCss = max(u_formSize, 60.0);
  float pres    = clamp(u_presence, 0.05, 1.2);

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // resolution-independent coords: y in 0..1, x preserves aspect
  vec2 uv = (fc - ctr) / res.y;          // centred, y-normalised
  float aspect = res.x / res.y;

  // ----------------------------------------------------------------------
  // SWELLINGS pressing toward the viewer. Each form lives at a hashed screen
  // position on its own ~10s hash-staggered envelope. `emerge` is 0 (gone) ->
  // 1 (at the threshold of legibility) -> 0, a smooth press-and-dissolve.
  // We accumulate: a brightness/contrast field, a warp vector (to stretch the
  // weave around the bulge), and a halo colour gathered from the palette.
  // ----------------------------------------------------------------------
  float field  = 0.0;        // 0..1 local presence under this pixel
  vec2  warp   = vec2(0.0);  // local displacement of the weave around bulges
  vec3  halo   = vec3(0.0);  // gathered palette glow
  float haloW  = 0.0;        // halo weight for normalisation

  float cycle  = 10.0 / speed;          // seconds per full visitation cycle
  float radius = formCss / res.y * pr;  // form radius in y-normalised units

  for (int k = 0; k < FORMS; k++) {
    float fk = float(k);
    // stagger each form's phase around the cycle so 2-3 overlap, never reset together
    float stagger = hash11(fk * 3.17 + 1.7);
    float ph = fract(t / cycle + stagger);          // 0..1 within this form's life
    // smooth press-through envelope: rise, brief dwell near threshold, dissolve
    float emerge = smoothstep(0.0, 0.42, ph) * (1.0 - smoothstep(0.55, 1.0, ph));

    // which "slot" of randomness this visitation uses (changes each cycle)
    float epoch = floor(t / cycle + stagger);
    vec2  seed  = vec2(fk * 7.13, epoch * 1.31);
    vec2  rnd   = hash22(seed);
    // a hashed centre that drifts slowly across the frame within the cycle
    vec2  cpos  = (rnd - 0.5) * vec2(1.6 * aspect, 1.05);
    cpos += vec2(sin(t * 0.07 + fk) * 0.05, cos(t * 0.05 + fk * 1.7) * 0.04);

    // organic, non-circular outline: domain-warped radius via low-freq noise
    vec2  d  = uv - cpos;
    float ang = atan(d.y, d.x);
    float lobe = 0.78 + 0.30 * fbm(vec2(ang * 0.95, epoch * 2.0 + fk) * 1.3
                                   + vec2(cos(ang), sin(ang)) * 0.6);
    float rr = radius * lobe;
    float dist = length(d);

    // soft rounded falloff -> the form is a smooth bulge, brightest at centre
    float bulge = 1.0 - smoothstep(0.0, rr, dist);
    bulge = bulge * bulge * (3.0 - 2.0 * bulge);   // extra smoothing
    float pf = bulge * emerge;

    field += pf;

    // push the weave outward around the bulge (a gentle local bow, not a
    // radial blast) — strongest in a shell near the rim so threads bend over it
    vec2 dir = d / max(dist, 1e-3);
    float bow = pf * (1.0 - smoothstep(0.0, rr, abs(dist - rr * 0.55)));
    warp += dir * (bow * rr * 0.18 + pf * rr * 0.05);

    // gather a palette colour per form: sweep the full 4-hue wheel across the
    // form's body (core hue -> rim hue) offset by a per-visitation hash, so each
    // apparition shows several palette colours and re-themes are unmistakable
    // (no dynamic array indexing — cyclic triangular blend like filigree).
    float hbase = hash11(fk * 5.7 + epoch * 0.91) * 4.0;
    float s = mod(hbase + (1.0 - dist / max(rr, 1e-3)) * 2.3, 4.0);
    float w0 = max(0.0, 1.0 - min(abs(s - 0.0), 4.0 - abs(s - 0.0)));
    float w1 = max(0.0, 1.0 - min(abs(s - 1.0), 4.0 - abs(s - 1.0)));
    float w2 = max(0.0, 1.0 - min(abs(s - 2.0), 4.0 - abs(s - 2.0)));
    float w3 = max(0.0, 1.0 - min(abs(s - 3.0), 4.0 - abs(s - 3.0)));
    vec3 hc = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 1e-3);
    halo  += hc * pf;
    haloW += pf;
  }

  field = clamp(field, 0.0, 1.0);
  halo  = halo / max(haloW, 1e-3);

  // ----------------------------------------------------------------------
  // THE WEAVE. Fine vertical-biased FBM threads, drifting continuously. The
  // accumulated warp displaces the weave's sampling so threads bow around the
  // swellings; presence raises local contrast so the weave reads near a form.
  // ----------------------------------------------------------------------
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = WEAVE_CSS * refScale * pr;
  // sampling coords, displaced by the warp so threads bow around bulges
  vec2 wp = fc + warp * res.y;
  // slow, imperceptible vertical drift — never resets
  wp += vec2(sin(t * 0.013) * 6.0 * pr, t * 6.0 * pr);

  // FINE VERTICAL THREADS: sharp sinusoidal columns (the warp threads of the
  // cloth) whose horizontal placement wanders slowly via low-freq noise so the
  // weave isn't a ruler-straight grid. This is the always-present veil.
  float colN  = fbm(wp / (cell * 6.0));                 // slow horizontal wander
  float colX  = wp.x / cell + colN * 1.6;               // thread coordinate
  float vthr  = abs(sin(colX * 3.14159265));            // 0 at thread, 1 between
  vthr = pow(1.0 - vthr, 2.2);                          // sharp bright thread cores
  // faint horizontal weft crossing it, much dimmer -> vertical-dominant weave
  float weftN = fbm(wp.yx / (cell * 6.0) + 19.0);
  float weft  = pow(1.0 - abs(sin((wp.y / (cell * 1.7) + weftN) * 3.14159265)), 3.0);
  // FBM mottling so the cloth has organic, uneven luminosity (not a clean grid)
  float mott  = fbm(wp / (cell * 9.0));
  float cloth = vthr * (0.55 + 0.45 * mott) + weft * 0.22 * (0.4 + 0.6 * mott);
  // micro grain so the cloth isn't smooth
  cloth += (hash21(floor(fc / pr)) - 0.5) * 0.03;
  cloth = clamp(cloth, 0.0, 1.4);

  // local contrast lift where a form presses through (presence -> legibility)
  float lift = field * pres;
  // weave: very dim everywhere at rest, threads catching light brighten under
  // the bulge so the swelling reads as relief in the cloth itself
  float baseGain = 0.16;                  // resting weave thread luminosity
  float weaveLum = cloth * (baseGain + lift * 1.6);
  // deepen the troughs under a form a touch so the bulge has tactile relief
  weaveLum *= mix(1.0, 0.5 + 0.9 * cloth, lift * 0.8);

  // ----------------------------------------------------------------------
  // COMPOSITE
  // ----------------------------------------------------------------------
  vec3 col = BG;

  // the cloth carries the theme even at rest: a dim, desaturated blend of all
  // four palette hues (so witchlight/ember re-tint the whole veil, not just the
  // forms), warming toward a form's gathered halo as it presses through.
  vec3 paletteMean = (c0 + c1 + c2 + c3) * 0.25;
  vec3 restTint = mix(vec3(dot(paletteMean, vec3(0.299, 0.587, 0.114))),
                      paletteMean, 0.65) * 1.15;
  vec3 clothTint = mix(restTint, halo, clamp(lift * 1.1, 0.0, 0.85));
  col += clothTint * weaveLum;

  // the gathered halo — a soft palette glow blooming around emergent forms,
  // strongest just inside the threshold, smoothstep-soft at the rim
  float rim  = field * field;
  float glow = rim * pres;
  col += halo * glow * 0.9;
  // a faint outer corona so a form gathers light before it is legible
  col += halo * field * (1.0 - field) * pres * 0.5;

  // keep the deepest darks alive but truly dark (never grey-washed)
  // gentle filmic-ish knee
  col = col / (col + 0.85);
  col *= 1.55;

  // radial vignette — ritual composure, edges sink into black
  float vign = 1.0 - smoothstep(0.55, 1.18, length((fc - ctr) / res) * 1.35);
  col *= mix(0.55, 1.0, vign);

  // subtle dither to kill banding in the near-black gradients
  float dith = (hash21(fc + fract(t) * 17.0) - 0.5) / 255.0;
  col += dith;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
