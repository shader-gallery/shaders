// echo (Delve) — a stone well heard rather than seen. On a wall texture kept a
// whisper above black (the faintest FBM, so the void has a surface), thin,
// perfectly circular wavefront rings procession inward like a dropped pebble's
// sound returning. The rings sit at exact log-spaced stations: each is drawn as
// a hairline anti-aliased circle with a soft halo, and each carries a lifetime
// brightness envelope — born faint at the rim, swelling to full glow at
// mid-depth, then drowned by the dark well before the center. Each ring is
// tinted by blending the four palette colours by its depth phase, so the
// procession reads c0..c3 as it sinks, and a small constant core of fog holds
// the center as a pure black pupil. Between rings there is almost nothing — the
// family's emptiest, most linear entry.
//
// Motion: the rings march down the scale axis at constant log-speed, equal
// spacing maintained forever, no ring ever arriving. Because spacing is exactly
// periodic in log-space and the mid-depth envelope hides both birth and death,
// the procession has no visible start, end, or wrap. Scale-travel is the only
// verb: nothing rotates and nothing translates.
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
uniform float u_ringDensity;  // wavefront rings per scale octave             (default 3)
uniform float u_lineWidth;    // ring stroke width in CSS px (×pixelRatio)     (default 2)
uniform float u_haloGlow;     // softness/reach of the glow halo, 0..1         (default 0.5)

const vec3  BG     = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU    = 6.28318530718;
const float LN2    = 0.69314718056;
const float CYCLE  = 12.0; // colour cycle spans this many rings (keeps hue periodic)

// 1D hash over an integer ring index
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

// value noise on a 2D coordinate (cheap, smooth)
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

// 3-octave FBM — only ever used at a whisper amplitude for the wall surface
float fbm(vec2 p) {
  float v = 0.0;
  v += 0.55 * vnoise(p);
  v += 0.30 * vnoise(p * 2.03 + 11.7);
  v += 0.15 * vnoise(p * 4.07 + 5.1);
  return v;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// continuous cyclic palette blend (no dynamic array indexing — illegal here)
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

  // guarded params — the whole slider range must be safe (no div-by-zero / NaN)
  float spd  = clamp(u_descentSpeed, 0.0, 0.6);
  float dens = clamp(u_ringDensity, 1.0, 7.0);
  float lw   = clamp(u_lineWidth, 0.5, 8.0) * pr;   // css px → device px
  float halo = clamp(u_haloGlow, 0.0, 1.0);

  vec2  v   = fc - 0.5 * res;
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);

  // log-polar scale axis in octaves, referenced to the frame half-size so the
  // composition is identical at any resolution / DPR
  float rn  = r / (0.5 * mn);          // 1.0 at frame half-size
  float q   = log2(rn);

  // ring coordinate: integer steps are the log-spaced stations; the whole
  // procession slides inward (toward smaller r → more negative q) with time.
  // Adding spd*t shifts which station each radius falls on; equal log-spacing
  // is preserved forever, so the march has no visible start or wrap.
  float w   = (q - spd * u_time) * dens;

  // --- the wall: faintest FBM so the void has a surface --------------------
  // log-polar coords give a self-similar wall that holds still under the zoom
  // (the rings move across it). Kept a whisper above black.
  float wall = fbm(vec2(ang * 2.2, q * 3.0)) * 0.5
             + fbm(vec2(ang * 5.3 + 4.0, q * 6.0)) * 0.25;
  vec3  wallCol = palWheel(mod(-w / CYCLE * 4.0, 4.0), c0, c1, c2, c3);

  // --- accumulate the procession of hairline rings ------------------------
  // We walk a handful of neighbouring stations around the current radius so a
  // ring's soft halo can spill across station boundaries. Constant loop bound.
  // device pixels per ring-unit at this radius (analytic AA + halo basis)
  float pxw = max(r * LN2 / dens, 0.5);
  // stroke / halo half-widths converted to ring-units
  float strokeU = (lw * 0.5) / pxw;
  float haloU   = strokeU + (0.10 + halo * 0.55); // halo reach grows with u_haloGlow

  // --- lifetime envelope, anchored to SCREEN RADIUS (not the moving station) -
  // The envelope is a property of where a ring physically sits in the well, so
  // the overall brightness is steady in time while each ring brightens then
  // dims as it travels through the fixed bell: faint at the rim, full at
  // mid-depth, drowned by the dark well before the pure-black pupil. Phase is
  // the normalised radius rn (1.0 at frame half-size → 0 at center).
  // raised-cosine bell peaking around mid-radius.
  float envR = sin(clamp(rn, 0.0, 1.0) * 3.14159265); // 0 at rim&center, 1 mid
  envR = pow(max(envR, 0.0), 0.85);

  float bi = floor(w);   // station index just below the sample
  vec3  acc = vec3(0.0);

  for (int k = -2; k <= 2; k++) {
    float idx = bi + float(k);
    // signed distance (in ring-units) from this station's circle centre
    float d   = w - idx;
    float ad  = abs(d);

    // hairline anti-aliased core stroke
    float core = 1.0 - smoothstep(strokeU, strokeU + 1.0 / pxw, ad);
    // soft glow halo around the line, gaussian-ish falloff scaled by reach
    float gl   = exp(-(ad * ad) / max(haloU * haloU * 0.30, 1e-3));
    gl *= (0.05 + 0.95 * halo);  // at halo=0 the bare circle dominates

    // colour by depth phase — each ring reads c0..c3 as it sinks
    float P    = mod(-idx / CYCLE * 4.0, 4.0);
    vec3  rc   = palWheel(P, c0, c1, c2, c3);
    // lift the very core toward warm-white so the hairline glints like a
    // returning wavefront crest
    vec3  cc   = mix(rc, vec3(0.92, 0.93, 0.88), 0.30 * core);

    float ring = (core * 1.0 + gl * 0.6);
    acc += cc * ring;
  }
  acc *= envR;

  // --- the dark well: a hard true-black pupil holds the very center, and a
  // soft outer fade tidies the corners. The envelope above already drowns the
  // deep rings before they reach this pupil. Both in normalised radius so
  // they're resolution independent.
  float pupil = smoothstep(0.05, 0.20, rn);          // 0 at center → black pupil
  float outer = 1.0 - smoothstep(1.05, 1.55, rn);

  // assemble: near-empty wall whisper + the lit rings, all gated by the pupil
  vec3  col = BG;
  // wall surface: extremely faint, palette-tinted, never grey-washing the field
  col += wallCol * wall * 0.05 * envR * pupil * outer;
  // the rings
  col += acc * 0.95 * pupil * outer;

  // soft-knee tone map keeps the brightest crests from blowing out
  col = BG + (1.0 - exp(-(col - BG) * 1.3));

  // gentle corner vignette
  vec2  uv  = v / mn;
  float vig = 1.0 - 0.40 * smoothstep(0.5, 1.05, length(uv));
  col = BG + (col - BG) * vig;

  // ~1-LSB hash dither breaks 8-bit banding in the smooth halos / fog
  col += (hash21(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
