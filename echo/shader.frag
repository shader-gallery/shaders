// echo (Delve) — a stone well heard rather than seen, but now the sound returns
// from every wall at once. Thin circular wavefronts still procession inward at
// log-spaced stations, but each ring is broken into a shimmering bead-row of
// arcs by a slowly-rotating angular standing wave: the echo scattered off the
// well's rough throat, returning louder from some bearings than others. The
// bead phase walks ring-to-ring and the whole interference pattern turns, so
// the field reads as a dense returning chorus rather than a clean bullseye —
// this is the family's *scattered* tunnel, distinct from borehole's smooth fog
// bands and throat's icy wobble. Rings fill nearly the whole frame and only the
// small central pupil and the extreme corners go dark.
//
// Motion: rings march down the log-scale axis (equal spacing forever, no ring
// ever arriving), while the angular bead pattern counter-rotates — two
// continuous verbs whose beat fills the frame with travelling glints. No
// visible start, end, or wrap.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_descentSpeed; // scale-octaves per second the wavefronts sink (default 0.15)
uniform float u_ringDensity;  // wavefront rings per scale octave             (default 4)
uniform float u_scatter;      // depth of the angular bead modulation, 0..1   (default 0.6)
uniform float u_haloGlow;     // softness/reach of the glow halo, 0..1        (default 0.5)

const vec3  BG     = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU    = 6.28318530718;
const float LN2    = 0.69314718056;
const float CYCLE  = 12.0; // colour cycle spans this many rings (keeps hue periodic)

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  v += 0.55 * vnoise(p);
  v += 0.30 * vnoise(p * 2.03 + 11.7);
  v += 0.15 * vnoise(p * 4.07 + 5.1);
  return v;
}

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

vec3 palWheel(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  return c0 * wheelW(s, 0.0) + c1 * wheelW(s, 1.0)
       + c2 * wheelW(s, 2.0) + c3 * wheelW(s, 3.0);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // guarded params — the whole slider range must be safe (no div-by-zero / NaN)
  float spd   = clamp(u_descentSpeed, 0.0, 0.6);
  float dens  = clamp(u_ringDensity, 1.0, 7.0);
  float scat  = clamp(u_scatter, 0.0, 1.0);
  float halo  = clamp(u_haloGlow, 0.0, 1.0);
  float lw    = 2.0 * pr;   // fixed hairline stroke, css px → device px

  // compose off-centre: bias the well mouth up-and-left of dead-centre (≈⅓)
  // so the frame reads composed rather than a symmetric bullseye.
  vec2  ctr = vec2(0.5 * res.x - 0.085 * mn, 0.5 * res.y + 0.065 * mn);
  vec2  v   = fc - ctr;
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);

  // log-polar scale axis in octaves, referenced to the frame half-size
  float rn  = r / (0.5 * mn);          // 1.0 at frame half-size
  float q   = log2(rn);

  // ring coordinate: integer steps are the log-spaced stations; the procession
  // slides inward with time.
  float w   = (q - spd * u_time) * dens;

  // --- the wall: faintest FBM so the void has a surface --------------------
  float wall = fbm(vec2(ang * 2.2, q * 3.0)) * 0.5
             + fbm(vec2(ang * 5.3 + 4.0, q * 6.0)) * 0.25;
  vec3  wallCol = palWheel(mod(-w / CYCLE * 4.0, 4.0), c0, c1, c2, c3);

  // device pixels per ring-unit at this radius (analytic AA + halo basis)
  float pxw = max(r * LN2 / dens, 0.5);
  float strokeU = (lw * 0.5) / pxw;
  float haloU   = strokeU + (0.10 + halo * 0.55);

  // --- lifetime envelope ----------------------------------------------------
  // Broadened so rings stay lit across most of the frame (the old narrow bell
  // emptied the field). Rings fade only near the rim corners and near the small
  // central pupil; the bulk of the radius carries a returning chorus.
  float envR = smoothstep(0.04, 0.22, rn) * (1.0 - smoothstep(0.86, 1.18, rn));
  envR = pow(max(envR, 0.0), 0.6);

  float bi = floor(w);
  vec3  acc = vec3(0.0);

  // slow rotation of the whole scatter field
  float spin = u_time * 0.09;

  // coherent spiral structure: the angular crest phase winds by TWIST radians
  // per ring station, so bright arcs chain across rings into slow spiral arms
  // sweeping inward — the echo returning, smeared by the throat's twist. This
  // is what separates echo from borehole's concentric fog bands and throat's
  // wobble: a turning pinwheel of beaded light, not a clean bullseye.
  const float ARMS  = 6.0;
  const float TWIST = 1.15;

  for (int k = -2; k <= 2; k++) {
    float idx = bi + float(k);
    float d   = w - idx;
    float ad  = abs(d);

    // hairline anti-aliased core stroke
    float core = 1.0 - smoothstep(strokeU, strokeU + 1.0 / pxw, ad);
    // soft glow halo around the line
    float gl   = exp(-(ad * ad) / max(haloU * haloU * 0.30, 1e-3));
    gl *= (0.05 + 0.95 * halo);

    // --- spiral-arm bead modulation -------------------------------------
    // two arm-counts beating give an irregular, organic scatter rather than a
    // mechanical pinwheel; both wind with idx (→ spirals) and turn with time.
    float p1  = ang * ARMS        + idx * TWIST       + spin * ARMS;
    float p2  = ang * (ARMS + 4.0) - idx * TWIST * 0.6 - spin * (ARMS + 4.0);
    float a1  = 0.5 + 0.5 * cos(p1);
    float a2  = 0.5 + 0.5 * cos(p2);
    // floor keeps a faint full ring even at the bead troughs so the structure
    // stays legible; scat pushes from clean-ring toward fully-beaded.
    float beadv = a1 * 0.65 + a2 * 0.45;
    beadv = pow(clamp(beadv, 0.0, 1.0), 1.6);   // sharpen crests into discrete beads
    float arc = mix(1.0, 0.16 + 1.15 * beadv, scat);
    arc = clamp(arc, 0.0, 1.45);

    // colour by depth phase — each ring reads c0..c3 as it sinks
    float P    = mod(-idx / CYCLE * 4.0, 4.0);
    vec3  rc   = palWheel(P, c0, c1, c2, c3);
    // glint the bead crests toward warm-white
    vec3  cc   = mix(rc, vec3(0.92, 0.93, 0.88), 0.30 * core + 0.18 * arc * core);

    float ring = (core * 1.0 + gl * 0.6) * arc;
    acc += cc * ring;
  }
  acc *= envR;

  // small central pupil + soft corner fade
  float pupil = smoothstep(0.03, 0.14, rn);
  float outer = 1.0 - smoothstep(1.15, 1.7, rn);

  vec3  col = BG;
  col += wallCol * wall * 0.06 * envR * pupil * outer;
  col += acc * 1.15 * pupil * outer;

  // soft-knee tone map keeps the brightest crests from blowing out
  col = BG + (1.0 - exp(-(col - BG) * 1.3));

  // gentle corner vignette
  vec2  uv  = v / mn;
  float vig = 1.0 - 0.40 * smoothstep(0.55, 1.1, length(uv));
  col = BG + (col - BG) * vig;

  // ~1-LSB hash dither breaks 8-bit banding in the smooth halos / fog
  col += (hash21(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
