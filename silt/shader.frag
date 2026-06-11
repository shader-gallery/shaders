// silt (Gyre) — a riverbed current laid along the frame floor. The bottom
// band is a stretched FBM field (about 10:1 horizontal) forming fine sediment
// streaks in the palette cooler colours, dense at the bottom edge and
// thinning to a soft boundary. Sparse bright grains ride the streaks with the
// current, catching the light. The upper two thirds stay a calm, near-black
// gradient, faintly tinted so the frame never splits in two. Everything obeys
// one slow shared current with gentle shear: faster low, slower near the top.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_currentSpeed; // horizontal drift rate of streaks & grains (default 0.55)
uniform float u_bedHeight;    // fraction of frame height the bed occupies   (default 0.33)
uniform float u_grain;        // CSS-px thickness of streaks & grains        (default 7)
uniform float u_sparkle;      // density+brightness of bright riding grains  (default 0.5)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// --- value noise (hash-based, no textures) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// stretched FBM — anisotropy is applied by the caller via the sampling coords
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.0 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized vertical: 0 at bottom edge, 1 at top
  float ny = fc.y / max(res.y, 1.0);

  vec3 col = BG;

  // --- palette fallback (headless can leave u_palette zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // cooler sediment tones for the streaks (blues/teals of the theme); a warmer
  // accent reserved for the catching grains.
  vec3 coolA = c2;            // teal-ish
  vec3 coolB = c0;            // blue-ish
  vec3 sparkCol = mix(c1, c3, 0.5); // brighter accent for grains

  // ---------------------------------------------------------------
  // Upper two thirds: calm near-black gradient, faintly tinted.
  // Breathes almost imperceptibly over about 20s.
  // ---------------------------------------------------------------
  float breathe = 0.5 + 0.5 * sin(t * 6.2831853 / 20.0);
  vec3 upperTint = mix(coolB, coolA, 0.35);
  // gradient: brighter low (near the bed) fading toward the top, but never to
  // dead black — the water column stays faintly lit so the frame isn't split.
  float upGrad = pow(max(0.0, 1.0 - ny), 1.4);
  col += upperTint * (upGrad * (0.032 + 0.018 * breathe) + 0.010);

  // suspended turbidity: slow large-scale sediment clouds drifting through the
  // whole water column so the upper frame carries faint texture, not void.
  vec2 tp;
  tp.x = (fc.x + t * u_currentSpeed * 30.0 * pr) / max(res.y, 1.0) * 2.2;
  tp.y = fc.y / max(res.y, 1.0) * 3.4 + t * 0.02;
  float turb = fbm(tp);
  turb = smoothstep(0.45, 0.95, turb);
  col += mix(coolA, coolB, 0.5) * turb * (0.05 + 0.03 * (1.0 - ny));

  // ---------------------------------------------------------------
  // Bottom band: the sediment current.
  // ---------------------------------------------------------------
  float bedTop = clamp(u_bedHeight, 0.05, 0.9); // fraction of height
  // bed coordinate: 1 at bottom edge, 0 at the soft boundary
  float bed = clamp((bedTop - ny) / max(bedTop, 1e-3), 0.0, 1.0);
  // soft upper boundary so the band fades rather than cuts
  float bedMask = smoothstep(0.0, 0.22, bed);

  // streak/grain thickness in CSS px → device px. Larger u_grain = coarser
  // strands → smaller spatial frequency.
  float grainPx = max(u_grain, 0.5) * pr;
  // base spatial scale (cells per device px) for the cross-flow (vertical) axis
  float scaleY = 1.0 / max(grainPx * 7.0, 1.0);

  // shear: faster low in the bed, slower near the boundary. bed=1 bottom.
  float shear = mix(0.45, 1.0, bed);
  // unbounded continuous horizontal drift offset (never resets)
  float drift = t * u_currentSpeed * 80.0 * pr * shear;

  // anisotropic sampling: stretch ~10:1 along horizontal flow so noise forms
  // long horizontal laminations. x compressed (low freq), y normal freq.
  vec2 sp;
  sp.x = (fc.x + drift) * scaleY * 0.10;
  sp.y = fc.y * scaleY;

  float n1 = fbm(sp);
  // ridged transform: fold the noise so mid-values become bright crests and
  // produce sharp horizontal lamination lines rather than a smooth wash.
  float ridge = 1.0 - abs(2.0 * n1 - 1.0);
  ridge = pow(clamp(ridge, 0.0, 1.0), 2.2);
  // a second, finer layer drifting slightly differently for depth
  vec2 sp2;
  sp2.x = (fc.x + drift * 1.35 + 200.0) * scaleY * 0.13;
  sp2.y = fc.y * scaleY * 1.9 + 50.0;
  float n2 = fbm(sp2);
  float ridge2 = 1.0 - abs(2.0 * n2 - 1.0);
  ridge2 = pow(clamp(ridge2, 0.0, 1.0), 3.0);
  float streak = max(ridge, ridge2 * 0.8);

  // density gradient: denser near the bottom edge, thinning upward
  float density = pow(bed, 1.3);
  float streakAmt = streak * density * bedMask;

  // colour the streaks by a slow horizontal hue drift between the two cool tones
  float hueMix = 0.5 + 0.5 * sin((fc.x + drift) * scaleY * 0.06 + bed * 2.0);
  vec3 sedCol = mix(coolA, coolB, hueMix);

  col += sedCol * streakAmt * 1.35;

  // ---------------------------------------------------------------
  // Bright riding grains — sparse hash sparkles on the streaks that drift
  // with the current and brighten/dim on individual phases.
  // ---------------------------------------------------------------
  // grain cells: long along x (so grains read as glints, not blobs), tied to
  // thickness. Drift the cell lattice with the current so grains ride along.
  float cellW = grainPx * 9.0;
  float cellH = grainPx * 2.2;
  vec2 gco = vec2(fc.x + drift, fc.y);
  vec2 gcell = floor(vec2(gco.x / cellW, gco.y / cellH));
  vec2 gfrac = fract(vec2(gco.x / cellW, gco.y / cellH)) - 0.5;

  float gh = hash21(gcell + 7.0);
  float gh2 = hash21(gcell + 19.0);
  // density gate from SPARKLE: at 0 essentially none, at 1 most cells glint
  float gate = step(1.0 - clamp(u_sparkle, 0.0, 1.0) * 0.95, gh);
  // each grain twinkles on its own phase
  float phase = gh2 * 6.2831853;
  float twink = 0.5 + 0.5 * sin(t * (1.2 + gh * 1.8) + phase);
  // grains live within the streaks (need some sediment under them) and the bed
  float grainHere = gate * smoothstep(0.25, 0.6, streak) * density * bedMask;
  // soft round glint within the cell
  float gd = length(gfrac * vec2(1.0, cellW / cellH));
  float glint = exp(-gd * gd * 9.0);
  float sparkAmt = grainHere * glint * twink * (0.4 + 0.6 * clamp(u_sparkle, 0.0, 1.0));

  col += sparkCol * sparkAmt * 1.9;
  // a bloom halo around the brightest grains so they catch the light
  col += sparkCol * grainHere * exp(-gd * gd * 2.0) * twink * 0.30 * clamp(u_sparkle, 0.0, 1.0);

  // gentle bottom-edge darkening vignette on the very floor to ground the band
  float floorV = smoothstep(0.0, 0.04, ny);
  col *= mix(0.7, 1.0, floorV);

  // subtle side vignette so the frame feels composed, not tiled
  float sideV = smoothstep(0.0, 0.18, fc.x / res.x) * smoothstep(0.0, 0.18, 1.0 - fc.x / res.x);
  col *= mix(0.88, 1.0, sideV);

  gl_FragColor = vec4(col, 1.0);
}
