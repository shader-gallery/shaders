// panicle (Sough) — two or three pampas plumes at close range: tall curved stems,
// each carrying one large feathery head, a teardrop mass of fine FBM-streaked
// fibers rather than a hard silhouette. At rest the plumes are deep charcoal,
// their fiber texture barely a step above the background. When a gust combs
// through, streaks of glow run lengthwise along the fibers — brightest at the
// feathered fringe where the head thins to nothing — while the head streams
// downwind and the stem bows late with one soft overshoot. Long calms between
// fronts leave only a slow breathing shimmer, the plumes near-dissolving to dark.
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
uniform float u_gustRate;     // how often combing gusts stream through      (default 0.4)
uniform float u_comb;         // fiber downwind stretch + streak-glow surge   (default 1.0)
uniform float u_fiberScale;   // css-px wavelength of the fiber texture       (default 5)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// three plumes filling the frame
const int   PLUMES = 3;

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// value noise (no textures)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// fractal value noise, fixed octave count
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    s += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return s;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // normalised coords, y up, aspect-corrected so plumes stay upright at any DPR
  vec2 uv = fc / res;                 // 0..1
  float aspect = res.x / max(res.y, 1.0);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y); // x centred & aspect-true, y in 0..1

  float comb       = max(u_comb, 0.0);
  float gustRate   = max(u_gustRate, 0.02);
  float fiberScale = max(u_fiberScale, 1.0);
  // fiber texture frequency: smaller css wavelength -> higher frequency.
  // base ~ how many fiber bands across a head; inversely tied to fiberScale.
  float fiberFreq  = 60.0 / fiberScale;

  // faintest ambient grade behind the plumes (the fourth colour, barely there)
  vec3 col = BG;
  float ambGrade = smoothstep(0.0, 1.0, uv.y) * (1.0 - smoothstep(0.4, 1.2, length(uv - vec2(0.5, 0.65))));
  col += c3 * ambGrade * 0.018;

  vec3 glow = vec3(0.0);

  // a coherent gust front travels left->right across the field; a plume is
  // excited as the front sweeps over its x, with a long becalmed quiet between.
  // front position cycles slowly; gustRate sets how frequently fronts arrive.
  float frontCycle = t * gustRate * 0.42;
  // multiple staggered fronts so calm dominates but excitation recurs
  // (each front is a narrow travelling pulse in x).

  for (int i = 0; i < PLUMES; i++) {
    float fi = float(i);
    // plume horizontal anchor (root x), spread across the frame
    float baseX = (fi + 0.5) / float(PLUMES);          // 0..1
    baseX += (hash11(fi * 9.1) - 0.5) * 0.10;
    float rootX = (baseX - 0.5) * aspect;              // aspect-true x

    // per-plume character — tall plumes filling the frame at close range
    float hgt   = 0.86 + 0.06 * hash11(fi * 3.7);      // head-top height (0..1)
    float curve = (hash11(fi * 5.3) - 0.5) * 0.26;     // resting stem curvature
    float headLen = 0.62 + 0.12 * hash11(fi * 2.1);    // head length along stem
    float headW   = 0.12 + 0.05 * hash11(fi * 6.9);    // head half-width at fattest
    float phase   = hash11(fi * 11.7) * 6.2831853;

    // --- gust excitation for this plume -------------------------------------
    // the front sweeps across x; excite when its travelling pulse aligns w/ rootX.
    // map rootX (-asp/2..asp/2) to 0..1 sweep coordinate.
    float sweepX = (rootX / aspect) + 0.5;
    // front passes are periodic in frontCycle; use a saw that advances and test
    // proximity to the plume's sweep position. fract gives the front's location.
    float frontPos = fract(frontCycle + hash11(fi * 1.3) * 0.13);
    float dFront = abs(frontPos - sweepX);
    dFront = min(dFront, 1.0 - dFront);
    // narrow travelling excitation pulse; long calm between
    float excite = exp(-dFront * dFront / 0.012);
    // a soft secondary breathing so calm isn't perfectly dead
    float breathe = 0.5 + 0.5 * sin(t * (0.5 + 0.2 * hash11(fi * 8.2)) + phase);
    float activity = excite;                            // 0 calm .. 1 full gust

    // downwind lean grows with excitation & comb; stem bows LATE with overshoot
    // (a damped spring: lean follows excite but lags + overshoots).
    float spring = sin(t * 6.2831853 * gustRate * 0.9 + phase);
    float lean = activity * comb * (0.085 + 0.03 * spring * activity); // wind blows +x

    // --- evaluate this plume's head field at p ------------------------------
    // The stem runs from root (y=-0.04, just off bottom) up to head top (y=hgt).
    // Parameterise by s in 0..1 along the stem; head occupies the top headLen.
    // We sample by inverting: for the fragment's y, find s, then the stem x at s.
    float yTop = hgt;
    float yRoot = -0.04;
    float s = clamp((p.y - yRoot) / max(yTop - yRoot, 0.001), 0.0, 1.0);

    // stem centre x at this height: root fixed, curvature + wind lean increasing
    // with height (roots never move; tips overshoot). bend ramps as s^1.6.
    float bendRamp = pow(s, 1.6);
    float stemX = rootX + curve * bendRamp + lean * bendRamp;

    // distance from stem centreline (horizontal), aspect-true
    float dx = p.x - stemX;

    // head envelope: a teardrop — zero below headStart, fattening then tapering
    // to nothing at the very tip (the feathered fringe).
    float headStart = 1.0 - headLen;                    // s where head begins
    float hs = clamp((s - headStart) / max(headLen, 0.001), 0.0, 1.0); // 0..1 up head
    // teardrop width profile: fat low, feather-thin at the top fringe.
    // pow shapes the fattest point lower down (like a real plume head).
    float widthProf = pow(sin(hs * 3.14159), 0.72) * (1.0 - hs * 0.45);
    widthProf = max(widthProf, 0.0);
    float halfW = headW * widthProf;
    // also fatten/streak downwind when combed (fibers stretch downwind)
    float stretch = 1.0 + activity * comb * 1.05 * smoothstep(0.0, 1.0, hs);
    halfW *= stretch;

    float inHead = step(headStart - 0.001, s);

    // ---- fiber texture: FBM streaked ALONG the fiber direction -------------
    // fibers fan outward from the stem; their angle grows with lateral offset.
    // along-fiber axis runs up the head (low freq), across-fiber is lateral
    // (high freq) -> streaky combed look. downwind shear when combed.
    float lat0 = dx / max(headW, 0.0008);               // raw lateral (head-widths)
    // fiber strand index: high spatial frequency across the head, sheared up
    float across = (dx * fiberFreq * 12.0) + fi * 53.0
                   - hs * (1.6 + activity * comb * 3.0); // fibers sweep up + downwind
    float along  = hs * fiberFreq * 0.7;
    float fib = fbm(vec2(across * 0.5, along * 1.4 + fi * 7.0));
    // discrete fiber strands: sharp ridges along the comb direction
    float strands = 0.5 + 0.5 * sin(across + fib * 2.2);
    strands = pow(max(strands, 0.0), 2.2);              // crisp filaments

    // ragged feathery silhouette: the FBM eats into the edge so the head is a
    // fibrous mass, not a hard teardrop. edge softness widens toward the fringe.
    float ragged = fib * (0.30 + 0.45 * hs);            // more feathered up top
    float edge = abs(lat0) - (widthProf * (1.0 - ragged)); // <0 inside the mass
    // antialiased membership, fibrous boundary
    float aa = 0.05 + 0.10 * hs;
    float headMask = (1.0 - smoothstep(-aa, aa, edge)) * inHead;
    // soft body weighting toward the centreline so the core reads denser
    headMask *= (0.45 + 0.55 * exp(-lat0 * lat0 * 1.3));

    // base charcoal texture: barely above background at rest (a single step),
    // carrying the fiber strands so the resting plume still reads as fibrous.
    // brightens a touch only where a gust is present (deformed -> lit).
    float texBase = headMask * (0.55 + 0.45 * strands) * (0.7 + 0.5 * fib)
                    * (0.5 + 0.9 * activity * comb);

    // ---- streak glow that SURGES through during a gust ---------------------
    // the surge runs lengthwise from windward edge (head base) to the fringe:
    // a bright band travels up hs as the gust peaks. brightest where it thins.
    float surgePos = activity;                          // 0..1 -> band climbs head
    float band = exp(-pow((hs - mix(0.0, 1.05, surgePos)) * 2.0, 2.0));
    // fringe emphasis: thinning tip catches the most light
    float fringe = smoothstep(0.4, 1.0, hs) * (1.0 - smoothstep(0.97, 1.03, hs));
    float surge = activity * comb * comb * (band * 0.7 + fringe * 0.5);
    // streaks themselves carry the glow (lengthwise filament highlights)
    float streakGlow = headMask * strands * surge;
    // a gentle always-on breathing shimmer in calm (very faint)
    float calmShimmer = headMask * strands * (0.05 + 0.05 * breathe) * (0.4 + 0.6 * fringe);

    // ---- visible curved stem below the head --------------------------------
    float stemHalf = (0.0016 + 0.0010 * (1.0 - s)) * 1.0; // thin, slightly thicker low
    float stemBody = 1.0 - smoothstep(stemHalf, stemHalf + 0.004, abs(dx));
    // stem only below where the head fully takes over; fades into the head base
    float stemMask = stemBody * (1.0 - smoothstep(headStart - 0.05, headStart + 0.10, s))
                     * step(yRoot, p.y);
    // the stem catches a thin glow when the plume is bowing (combed), dark at rest
    float stemGlow = stemMask * (0.05 + activity * comb * 0.5);

    // ---- colour: blend two adjacent palette colours base->fringe -----------
    // each plume picks an adjacent pair (i selects), streak highlights push to a
    // third. Three plumes -> related but unequal hues.
    vec3 baseCol, midCol, hiCol;
    if (i == 0) { baseCol = c0; midCol = c2; hiCol = c1; }
    else if (i == 1) { baseCol = c1; midCol = c2; hiCol = c0; }
    else { baseCol = c2; midCol = c1; hiCol = c3; }
    vec3 fiberCol = mix(baseCol, midCol, smoothstep(0.0, 1.0, hs));
    // highlight pushes toward the third colour where the surge is hottest
    vec3 hotCol = mix(fiberCol, hiCol, clamp(surge * 0.9, 0.0, 1.0));

    // accumulate: faint charcoal texture always, glow only when combed
    glow += fiberCol * texBase * 0.30;
    glow += hotCol  * (streakGlow * 1.55 + calmShimmer * 0.45);
    // soft fringe bloom so the feathered tip melts into dark
    glow += hiCol * fringe * surge * headMask * 0.55;
    // the bowing stem catches a thin line of the base colour
    glow += baseCol * stemGlow * 0.6;
  }

  col += glow;

  // gentle vignette keeps frame edges dark, composed framing
  vec2 vuv = uv - 0.5;
  float vign = 1.0 - smoothstep(0.55, 1.15, length(vuv * vec2(1.1, 0.95)));
  col *= mix(0.7, 1.0, vign);

  // soft tonemap so a peak gust never blows to flat white
  col = col / (1.0 + col * 0.62);

  gl_FragColor = vec4(col, 1.0);
}
