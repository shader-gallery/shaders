// nautilus (Delve) — the cross-section of a chambered shell, camera looking
// straight into the whorl. The log-radius axis is tiled into a few grand
// chambers: each chamber is a full annulus flooded with a pearly interior
// fill that brightens toward its outer wall, and the septum between chambers
// is a thin bright nacre seam arcing the whole circle. A single bright radial
// channel — the siphuncle — runs unbroken from the frame edge to the fog
// floor at one fixed angle, piercing every septum on the way. Chamber bodies
// blend two adjacent palette colours by depth phase while each seam takes the
// next colour ahead, so the palette appears to lead the descent inward; an
// exponential dark term drowns the innermost chambers in true black. The
// whole vessel slides down the scale axis: chambers are born wide at the
// frame edge and compress septum by septum into the dark center. Spacing and
// colour cycle are exactly periodic in log-space, so the procession is
// seamless. Nothing rotates and nothing translates — scale-travel only.
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
uniform float u_descentSpeed;   // scale-octaves per second of sink   (default 0.1)
uniform float u_chamberDensity; // chambers per scale octave          (default 1.8)
uniform float u_seamGlow;       // septum seam brightness             (default 0.9)
uniform float u_pearl;          // pearly interior fill strength      (default 0.75)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265359;
const float TAU      = 6.28318530718;
const float LN2      = 0.69314718056;
const float SIPH_ANG = 1.95;   // fixed siphuncle angle (rad) — the one landmark
const float FOG_R    = 0.20;   // fog-floor radius, fraction of min dimension —
                               // wide enough that the last 2-3 chambers visibly
                               // dim and sink instead of vanishing at a hard core
const float CORE_R   = 0.050;  // radius scale of the true-black core ramp

float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// continuous cyclic palette blend; for any s exactly two adjacent weights
// are nonzero and they sum to one (no dynamic indexing)
vec3 palWheel(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  return c0 * wheelW(s, 0.0) + c1 * wheelW(s, 1.0)
       + c2 * wheelW(s, 2.0) + c3 * wheelW(s, 3.0);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);

  // theme palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // guarded params — the whole slider range must be safe
  float dens  = clamp(u_chamberDensity, 0.5, 6.0);
  float spd   = clamp(u_descentSpeed, 0.0, 1.0);
  float pearl = clamp(u_pearl, 0.0, 1.0);
  float sglow = clamp(u_seamGlow, 0.0, 2.0);

  vec2  v   = fc - 0.5 * res;
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);

  // log-polar scale axis in octaves, referenced to the frame half-size so the
  // composition is identical at any resolution / DPR
  float q = log2(r / (0.5 * mn));

  // chamber coordinate: integer steps are septa, fract is depth in a chamber
  // (0 = inner wall, 1 = outer wall). Time slides the whole vessel inward.
  float w  = (q + spd * u_time) * dens;
  float ci = floor(w);
  float fw = w - ci;

  // device pixels per chamber unit at this radius (analytic AA basis)
  float pxw   = r * LN2 / dens;
  float dwall = min(fw, 1.0 - fw) * pxw;   // px distance to nearest septum

  // palette depth phase: advances one colour per chamber going inward,
  // exactly periodic over 4 chambers so the wrap is invisible
  float P       = mod(-w, 4.0);
  vec3  bodyCol = palWheel(P, c0, c1, c2, c3);
  vec3  seamCol = palWheel(mod(P + 1.0, 4.0), c0, c1, c2, c3);
  vec3  chanCol = palWheel(mod(P + 2.0, 4.0), c0, c1, c2, c3);
  // nacre: lift the fill toward pearl-white as it approaches the outer wall
  bodyCol = mix(bodyCol, vec3(0.82, 0.84, 0.88), 0.28 * fw * fw);

  // pearly interior fill: a nacre gradient brightening toward the outer wall
  // plus a soft glow hugging the inside of that wall — the chamber reads as a
  // filled vessel of light, never a thin band
  float fillGrad  = 0.16 + 0.84 * pow(fw, 1.6);
  float underGlow = exp(-(1.0 - fw) * pxw / (26.0 * pr));
  float fill      = pearl * (0.55 * fillGrad + 0.40 * underGlow);
  // static directional sheen (light from the siphuncle side); static,
  // so nothing rotates
  fill *= 0.78 + 0.22 * cos(ang - SIPH_ANG);

  // septum seam: thin bright nacre arc, antialiased in device px
  float seamCore = 1.0 - smoothstep(0.0, 1.7 * pr, dwall);
  float seamHalo = exp(-dwall / (5.0 * pr));
  float seam     = sglow * (1.15 * seamCore + 0.25 * seamHalo);

  // siphuncle: one continuous bright radial channel at a fixed angle
  float dA    = abs(mod(ang - SIPH_ANG + PI, TAU) - PI);
  float arcPx = dA * r;                   // across-channel distance in px
  float sw    = 9.0 * pr;                 // channel core width, css px
  float chan     = exp(-(arcPx * arcPx) / (2.0 * sw * sw));
  float chanHalo = exp(-arcPx / (28.0 * pr));
  // the channel pierces every septum — a small bright node at each crossing
  float siph = chan * (0.85 + 0.80 * seamCore) + 0.16 * chanHalo;

  // exponential dark term: a wide, soft fog floor — the last few chambers
  // dim progressively and drown in true black rather than stopping at a
  // small hard core (soft exponent + broad core ramp)
  float fade = 1.0 - exp(-pow(r / (FOG_R * mn), 1.3));
  fade *= smoothstep(0.2 * CORE_R * mn, 2.2 * CORE_R * mn, r);

  vec3 acc = (bodyCol * fill + seamCol * seam + chanCol * siph) * fade;

  // gentle corner vignette; soft-knee tone map keeps seams from blowing out
  vec2  uv  = v / mn;
  float vig = 1.0 - 0.40 * smoothstep(0.50, 1.05, length(uv));
  vec3  col = BG + (1.0 - exp(-acc * 1.18)) * vig;

  // ~1-LSB hash dither breaks 8-bit banding in the broad nacre gradients
  col += (hash12(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
