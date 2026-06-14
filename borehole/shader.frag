// borehole (Delve) — a geological borehole seen from directly overhead,
// plunging to a true-black focal point at screen center. The wall lives in
// log-polar space: log(radius) is sliced into fine sedimentary bands whose
// thicknesses come from a 1D hash over the log-depth axis (so they read as
// irregular strata, not draftsman rings), and a faint FBM grain stretched
// along the angular direction scuffs each band into drilled rock. Each band
// is tinted by blending the four palette colours by its depth phase, cycling
// through c0..c3 and around again over several scale octaves, while an
// exponential fog term drags everything below a chosen depth down to true
// black. The angular axis carries NO structure of its own — no spokes, no
// seams, no landmark — so nothing in the image can even suggest rotation.
//
// Motion: the whole stack of strata travels steadily down the scale axis —
// each band is born wide at the frame edge, then compresses and dims as it
// sinks toward the center it never reaches. The band pattern and the colour
// cycle are exactly periodic over the scale wrap, and the crossfade happens
// far below the fog floor, so the descent is seamless and phase-continuous.
// Scale-travel is the only verb: nothing rotates and nothing translates.
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
uniform float u_descentSpeed; // scale-octaves per second the strata sink   (default 0.12)
uniform float u_bandDensity;  // sediment bands per scale octave            (default 6)
uniform float u_fogDepth;     // how far down light reaches before black     (default 0.8)
uniform float u_grain;        // angular drill-grain scuffing the bands      (default 0.55)
uniform float u_centerX;      // focal x offset, short-axis units (off-centre) (default 0.14)
uniform float u_centerY;      // focal y offset, short-axis units             (default -0.10)
uniform float u_mouseShift;   // pointer depth-parallax on the near walls      (default 0.35)

const vec3  BG     = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI     = 3.14159265359;
const float TAU    = 6.28318530718;
const float LN2    = 0.69314718056;
const float CORE_R = 0.045; // radius scale of the true-black focal core ramp
// colour cycle spans this many bands (an integer multiple of the band period
// keeps both the strata pattern AND the hue cycle periodic over one wrap)
const float CYCLE  = 16.0;

// 1D hash over the integer band index — gives each stratum its own thickness
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

// 2-octave FBM, used only along the angular axis (band thickness modulation)
float fbm(vec2 p) {
  float v = 0.0;
  v += 0.60 * vnoise(p);
  v += 0.30 * vnoise(p * 2.03 + 11.7);
  return v / 0.90;
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
  float spd  = clamp(u_descentSpeed, 0.0, 1.0);
  float dens = clamp(u_bandDensity, 1.0, 16.0);
  float fogD = clamp(u_fogDepth, 0.15, 2.0);
  float grn  = clamp(u_grain, 0.0, 1.0);

  // movable focal (off-centre by default) + r-weighted mouse depth parallax:
  // the near (outer) walls slide toward the pointer while the deep core holds.
  vec2  mraw = u_mouse;
  if (dot(mraw, mraw) < 1.0) mraw = 0.5 * res;
  vec2  mN   = (mraw - 0.5 * res) / (0.5 * mn);
  vec2  v0   = (fc - 0.5 * res) - vec2(u_centerX, u_centerY) * (0.5 * mn);
  float r0n  = length(v0) / (0.5 * mn);
  vec2  v    = v0 - mN * (0.16 * max(u_mouseShift, 0.0)) * (0.5 * mn) * smoothstep(0.0, 0.9, r0n);
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);
  // a seamless angular coordinate for the grain noise: sampling noise on
  // (cos,sin) of the angle is exactly periodic, so there is NO discontinuity
  // where atan wraps at ±pi (which would otherwise leave a faint seam on the
  // -X axis and read as a fixed landmark — forbidden in this family).
  vec2  adir = vec2(cos(ang), sin(ang));

  // log-polar scale axis in octaves, referenced to the frame half-size so the
  // composition is identical at any resolution / DPR
  float q = log2(r / (0.5 * mn));

  // band coordinate: integer steps separate strata, the whole stack slides
  // inward with time. Quantise the time march to the colour cycle so the wrap
  // (which lives far below the fog floor) is exactly seamless.
  float w  = (q + spd * u_time) * dens;

  // device pixels per band unit at this radius (analytic AA basis)
  float pxw = r * LN2 / dens;

  // --- irregular sedimentary bands -------------------------------------
  // Each integer band gets a hashed thickness fraction so strata vary in
  // width; a faint angular FBM warps the band boundary so it reads as
  // drilled rock rather than a clean ring. We sample the nearest boundary.
  float bi   = floor(w);          // band index below the sample
  float fw   = w - bi;            // 0..1 position within this band

  // angular grain: warp the local band coordinate by FBM along the angle.
  // The warp is purely angular (constant along radius within a band), so it
  // never introduces a radial spoke. Amplitude scales with u_grain.
  float gA   = fbm(adir * 2.3 + vec2(bi * 0.7, 0.0)) - 0.5;
  float gB   = fbm(adir * 5.7 + vec2(0.0, bi * 1.3) + 3.0) - 0.5;
  float warp = (gA * 0.62 + gB * 0.38) * grn;
  float fwG  = fw + warp * 0.85;   // grain-displaced within-band position

  // thickness of THIS band's bright vein vs its dark gap, from the hash
  float thick = mix(0.16, 0.40, hash11(bi));
  // distance (in band-units) from the band's bright vein centre at fwG=0.5
  float dCen  = abs(fract(fwG) - 0.5);
  // bright stratum vein: a soft band, antialiased in device px
  float aa    = 1.2 / max(pxw, 0.5);  // band-unit AA width
  float vein  = 1.0 - smoothstep(thick - aa, thick + aa, dCen);

  // a thinner, brighter seam line at the very centre of each vein — the
  // glinting bedding plane of the stratum
  float seam  = 1.0 - smoothstep(0.0, 0.06 + aa, dCen);

  // rock-face speckle: high-freq grain over the lit vein, angular + radial,
  // so the wall reads as drilled stone catching light. Stronger modulation so
  // the strata clearly read as scuffed rock at the default grain.
  float speck = fbm(adir * 24.0 + vec2(w * 1.7, w * 0.9));
  float rough = mix(1.0, 0.32 + 1.15 * speck, grn);

  // --- palette by depth phase ------------------------------------------
  // hue advances continuously inward and cycles every CYCLE bands; periodic
  // over the wrap so the colour procession never jumps
  float P       = mod(-w / CYCLE * 4.0, 4.0);
  vec3  bandCol = palWheel(P, c0, c1, c2, c3);
  vec3  seamCol = palWheel(mod(P + 0.6, 4.0), c0, c1, c2, c3);
  // lift the vein body slightly toward warm-white at its bright core so the
  // strata catch light like wet rock
  bandCol = mix(bandCol, vec3(0.86, 0.85, 0.80), 0.14 * vein);

  // --- exponential fog floor -------------------------------------------
  // light reaches down to ~fogD octaves of depth, then black swallows the
  // walls; low fogD shrinks the lit annulus toward the rim. Referenced in
  // normalised radius so it's resolution-independent.
  float rn   = r / (0.5 * mn);          // 1.0 at frame half-size
  float fog  = exp(-pow(max(0.0, -log2(rn)) / fogD, 1.35));
  // hard true-black focal core at the very centre
  float core = smoothstep(0.15 * CORE_R * mn, 1.6 * CORE_R * mn, r);
  float fade = fog * core;

  // assemble the wall: vein body + seam glint, scuffed by rock grain
  float body = vein * rough;
  vec3  acc  = (bandCol * body * 0.72 + seamCol * seam * 0.60) * fade;

  // faint ambient haze in the gaps so the lit annulus reads as a continuous
  // throat of rock rather than isolated rings (kept very low, palette-tinted)
  acc += bandCol * (0.035 * fade);

  // gentle corner vignette + soft-knee tone map keeps seams from blowing out
  vec2  uv  = v / mn;
  float vig = 1.0 - 0.42 * smoothstep(0.48, 1.05, length(uv));
  vec3  col = BG + (1.0 - exp(-acc * 1.45)) * vig;

  // ~1-LSB hash dither breaks 8-bit banding in the smooth fog gradient
  col += (hash21(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
