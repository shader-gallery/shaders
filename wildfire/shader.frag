// wildfire (Smolder) — a fire season from a night satellite. Dark terrain with
// a whisper of FBM relief carries two or three closed irregular rings of ember
// light at staggered ages: a broad old perimeter swelling past mid-frame, a
// younger loop tight around its ignition point, sometimes a brand-new spark of
// a ring. Each ring is the contour where its own radial-plus-FBM distance field
// crosses a rising threshold, so it bulges along unseen valleys and stalls on
// ridges, its narrow stroke graded through the four palette colours across its
// width with isolated brighter knots where the line is locally fiercest. Every
// interior is uniformly burned, a tone darker than the unburned exterior,
// pricked by sparse cooling sparks that thin behind the front. Perimeters only
// grow; births overlap lifetimes; an exhausted ring's near-black interior
// crossfades away only once it has swollen past the frame corners.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device px, (0,0) when absent — unused
//   u_pixelRatio  devicePixelRatio of the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spreadRate;   // how fast each perimeter dilates outward (default 0.15)
uniform float u_lineWidth;    // stroke width of the glowing perimeter, css px, scaled by u_pixelRatio (default 8)
uniform float u_knotIntensity;// brightness boost of the hot knots along the lines; 0 evens them out (default 0.8)
uniform float u_terrainDrag;  // how strongly unseen terrain distorts the rings; 0 = clean circles (default 0.55)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// smooth value noise (C1)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fbm, rotated per octave; range ~[0,0.95], mean ~0.5
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.616, 1.214, -1.214, 1.616);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// Each ring lives on its own cycle of length T (seconds-units of phase). Born
// as a spark at phase 0, it dilates monotonically; once swollen well past the
// frame corners it is invisible and its slot re-ignites at a fresh hash-chosen
// point. `vis` fades a ring in from the spark and out once huge, hiding both
// the birth pop and the retire crossfade.
float vis(float ph) {
  // ph in [0,1]. Fade in fast at birth, hold, fade out late once off-frame.
  float born = smoothstep(0.0, 0.06, ph);
  float gone = 1.0 - smoothstep(0.80, 1.0, ph);
  return born * gone;
}

// Per-slot state for one expanding conversion loop. Returns the additive ember
// contribution and accumulates the burned-interior darkening via `burnOut`.
// `slot` selects an independent ignition point + cycle phase.
vec3 ringLayer(vec2 fragPx, float slot, float phase, float vw,
               vec3 c0, vec3 c1, vec3 c2, vec3 c3,
               float linePx, float dragAmp, float knot,
               float t, float pr, vec2 res, inout float burnOut) {
  // ignition point: hash-chosen from `slot`, which the caller bumps by the
  // cycle index each re-ignition so a slot lights somewhere new every cycle
  // (stable within a cycle, so the contour is fixed and the front only grows).
  vec2 hp = vec2(slot * 13.7 + 2.3, slot * 5.1 - 1.9);
  vec2 ign = vec2(hash21(hp), hash21(hp + 9.31));
  // keep ignition comfortably inside the frame so the loop reads as closed
  ign = mix(vec2(0.22), vec2(0.78), ign) * res;

  // radial distance field from the ignition point, in css-ish units
  vec2 d = (fragPx - ign) / max(pr, 0.25);
  float r = length(d) / 90.0;            // ~screens of radius
  float ang = atan(d.y, d.x);

  // terrain distortion: low-freq FBM keyed to angle + radius so lobes bulge
  // along valleys and stall on ridges. Static per slot (contour fixed; only
  // the threshold rises), so the front can only advance.
  vec2 q = vec2(cos(ang), sin(ang)) * (r * 1.4) + vec2(slot * 3.1, -slot * 2.2);
  float terr = (fbm(q * 1.7 + 4.0) - 0.5) * dragAmp;
  float fieldVal = r + terr;             // distance field for this ring

  // rising threshold = current perimeter radius. phase 0..1 maps to radius
  // growing from ~0 (spark) out past the frame corners.
  float thr = phase * 2.4;               // max radius in same units as r

  // signed distance to the perimeter (in field units), >0 outside (unburned)
  float sd = fieldVal - thr;
  // approximate field gradient magnitude ~1 (radial); convert sd to px width
  float linU = linePx / (pr * 90.0);     // line half-width in field units
  float lh = max(linU, 0.004);

  // ---- burned interior: everything inside the perimeter is converted.
  float inside = smoothstep(lh * 0.4, -lh * 0.6, sd); // 1 well inside
  burnOut = max(burnOut, inside * vw);

  // ---- the incandescent perimeter stroke, graded across its width.
  // u runs 0 at the leading (outer) edge against unburned dark, to 1 at the
  // trailing (inner) side dropping into char. Hottest c3 first -> c1 -> c0 -> c2.
  float u = clamp(-sd / lh * 0.5 + 0.5, 0.0, 1.0);
  float on = exp(-(sd * sd) / (lh * lh)); // gaussian stroke, AA by construction
  vec3 ramp = c3;
  ramp = mix(ramp, c1, smoothstep(0.10, 0.40, u));
  ramp = mix(ramp, c0, smoothstep(0.40, 0.68, u));
  ramp = mix(ramp, c2, smoothstep(0.68, 0.98, u));

  // hot knots: isolated brighter beads strung along the line where it is
  // locally fiercest, drifting slowly along the perimeter. Two angular noise
  // octaves gated tight so knots stay sparse and punchy; as `knot` rises the
  // line between knots is gently recessed so the beading reads, not a uniform
  // brighten. At knot==0 the perimeter is perfectly even.
  float knr = vnoise(vec2(ang * 2.4 + slot * 4.0, t * 0.25 + slot))
            * 0.65
            + vnoise(vec2(ang * 6.1 - slot * 2.0, t * 0.15 + slot * 3.0)) * 0.35;
  float kn = smoothstep(0.58, 0.90, knr);
  float knotBoost = 1.0 + knot * (3.2 * kn - 0.5 * (1.0 - kn));

  // white-hot thread at the very crest
  float crest = exp(-(sd * sd) / (lh * lh * 0.10));

  // perimeter brightness scales down a touch as the ring grows huge so the old
  // broad loop reads cooler/fainter than a fresh tight one.
  float ageDim = mix(1.05, 0.62, smoothstep(0.15, 0.95, phase));

  vec3 col = vec3(0.0);
  col += ramp * on * 0.95 * knotBoost * ageDim;
  col += (c3 * 0.7 + vec3(0.28, 0.24, 0.20)) * crest * (0.45 + 0.6 * kn) * ageDim;

  // faint preheat bleeding just outside the line into the unburned dark
  float ahead = max(sd, 0.0);
  float preheat = 0.22 * exp(-ahead / (lh * 1.6));
  col += (c3 * 0.8 + c1 * 0.2) * preheat * ageDim;

  return col * vw;
}

void main() {
  float pr  = max(u_pixelRatio, 0.25);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = max(u_resolution.xy, vec2(1.0));
  vec2  cssP = fc / pr;
  float t   = u_time;

  float linePx = max(u_lineWidth, 1.0) * pr;
  float drag   = clamp(u_terrainDrag, 0.0, 1.0) * 0.9;
  float knot   = clamp(u_knotIntensity, 0.0, 1.5);
  float rate   = max(u_spreadRate, 0.001) * 0.06; // cycles/sec scaler

  // ---- palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // ---- dark terrain ground: a whisper of FBM relief, nearly featureless
  float relief = fbm(cssP / 220.0 + 2.1) * 0.6 + fbm(cssP / 70.0 + 8.0) * 0.4;
  vec3 ground = BG * (0.82 + 0.42 * relief);

  // Three independent ring slots, each on its own staggered cycle so births
  // overlap lifetimes — two or three loops alive at once, a fresh one always
  // kindling while an old perimeter is still mid-frame. Each slot folds its
  // running cycle index into its ignition seed so it lights somewhere new each
  // re-ignition; phase 0..1 dilates the perimeter, vis() hides birth+retire.
  float T = 1.0; // normalised cycle; rate carries seconds

  // slot phases, evenly offset by 1/3 so the three ages stay staggered
  float base = t * rate;
  float p0 = fract(base + 0.00);
  float p1 = fract(base + 0.34);
  float p2 = fract(base + 0.67);
  // cycle index per slot -> fresh ignition point each re-ignition
  float k0 = floor(base + 0.00);
  float k1 = floor(base + 0.34);
  float k2 = floor(base + 0.67);

  float v0 = vis(p0), v1 = vis(p1), v2 = vis(p2);

  // burned-interior accumulation: rings convert territory irreversibly. We take
  // the max coverage across live rings (overlapping burns stay burned).
  float burn = 0.0;

  vec3 ember = vec3(0.0);
  ember += ringLayer(fc, 1.7 + k0 * 3.1, p0, v0, c0, c1, c2, c3, linePx, drag, knot, t, pr, res, burn);
  ember += ringLayer(fc, 8.3 + k1 * 3.1, p1, v1, c0, c1, c2, c3, linePx, drag, knot, t, pr, res, burn);
  ember += ringLayer(fc, 4.9 + k2 * 3.1, p2, v2, c0, c1, c2, c3, linePx, drag, knot, t, pr, res, burn);

  // burned interior is a tone darker than the unburned exterior
  vec3 charBase = BG * 0.46 * (0.80 + 0.5 * relief);
  vec3 col = mix(ground, charBase, burn);

  // ---- sparse cooling sparks pricking the burned interiors, thinning with
  // distance behind each front. Hash-placed cells, one-shot pop + decay.
  // (Cheap global field gated by `burn` so sparks only sit on converted land.)
  vec2 cell = floor(cssP / 26.0);
  float sh = hash21(cell + 0.5);
  if (sh > 0.62) {
    vec2 cseed = cell + 11.0;
    float life = 2.2;
    float ph = fract(t / life + hash21(cseed));
    float pop = exp(-ph * 5.0) * smoothstep(0.0, 0.04, ph);
    vec2 jit = (vec2(hash21(cseed + 1.0), hash21(cseed + 2.0)) - 0.5) * 18.0;
    vec2 sc = (cell + 0.5) * 26.0 + jit;
    float dd = length(cssP - sc);
    float dot = exp(-dd * dd / 6.0);
    col += (c3 * 0.7 + c1 * 0.3) * dot * pop * 0.9 * burn;
  }

  col += ember;

  // gentle vignette seats the scene
  vec2 uv = fc / res;
  col *= 1.0 - 0.40 * smoothstep(0.35, 1.10, length(uv - 0.5) * 1.42);

  // tiny dither to keep long glow gradients band-free
  col += (hash21(fc + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
