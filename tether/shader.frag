// tether (Wake) — a handful of mooring lights ride at anchor on black water.
// Each is a small glowing buoy with a dim vertical reflection streak, held by one
// thin visible tether line to its own fixed dark anchor point nearby. An unseen
// current veers slowly, so every light weathervanes around its anchor in lazy
// arcs; when a veer swings one wide its tether straightens and brightens taut for
// a beat before bowing slack again. Reciprocation — advance and retreat, always
// returning, with accents at the moment of turning. Leashed embers on black glass.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_veerSpeed;     // rate the current's heading wanders   (default 0.25)
uniform float u_tetherLength;  // css-px mooring-line length / arc radius (default 110)
uniform float u_buoyGlow;      // css-px buoy glow + reflection width   (default 7)

const vec3  BG       = vec3(0.030, 0.032, 0.041); // near-black water
const int   N        = 7;     // number of moorings (constant loop bound)
const float TAU      = 6.2831853;
const float LOOP     = 40.0;  // seamless period of the veer (~40 s)

// cheap hash -> 0..1
float h11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // work in a resolution-independent space scaled to the short edge
  float S    = min(res.x, res.y);
  vec2  uv   = (fc - 0.5 * res) / S;          // ~ -aspect/2..aspect/2 , -0.5..0.5
  float aspect = res.x / res.y;

  vec3 col = BG;

  // Theme colours come from u_palette; fall back to midnight when a headless
  // context leaves the vec3[] uniform zeroed (active name "u_palette[0]").
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // tether arc radius and buoy size in uv units (css-px -> device px -> uv)
  float arcR = max(u_tetherLength, 1.0) * pr / S;
  float glow = max(u_buoyGlow,    1.0) * pr / S;

  // the global current heading veers as a sum of continuous sines (seamless over
  // LOOP seconds). Each mooring follows it with its own loose lag + amplitude.
  float ph = TAU * t / LOOP;                  // base phase, wraps cleanly
  float spd = max(u_veerSpeed, 0.0);

  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // fixed anchor point: distributed on a jittered 7-column sweep so the harbour
    // fills the WHOLE frame (no dead quadrant). Columns march evenly across the
    // full visible width; each column gets a hash-jittered x nudge and a row band
    // chosen so the upper area (incl. upper-right) is occupied, not just the
    // bottom. Anchors sit ABOVE their buoys (buoy hangs downstream), so the band
    // is lifted upward to keep both anchor and the leash/streak on-screen.
    float halfW = 0.5 * aspect - 0.10;
    // even column centre across the frame: i/(N-1) maps 0..1 -> -halfW..+halfW
    float colT  = fi / float(N - 1);
    float jx    = (h11(fi * 1.7 + 3.1) - 0.5) * (2.0 * halfW / float(N)) * 1.1;
    float ax    = mix(-halfW, halfW, colT) + jx;
    // 3-band vertical scatter cycled per column so no horizontal row forms, plus
    // a hash jitter; whole field lifted upward so anchors sit high and their
    // buoys + reflections hang into (not past) the lower frame.
    float bsel  = mod(fi, 3.0);
    float band  = (bsel < 0.5) ? 0.26 : (bsel < 1.5 ? 0.04 : -0.18);
    float ay    = band + (h11(fi * 2.3 + 5.7) - 0.5) * 0.20;
    ay = clamp(ay, -0.26, 0.30);
    vec2  anchor = vec2(ax, ay);

    // per-mooring palette colour, dealt round-robin so the harbour reads as a
    // few differently-coloured embers
    float pick = h11(fi * 4.9 + 1.3);
    vec3  hue = pick < 0.25 ? c0 : (pick < 0.5 ? c1 : (pick < 0.75 ? c2 : c3));

    // --- veering heading: sum of two continuous sines, scaled by veer speed ---
    // staggered phases & rates per mooring so arcs are loosely correlated, never
    // in lockstep, and never reset (all sines of a continuously advancing phase).
    float lag  = h11(fi * 3.3 + 0.9) * TAU;
    float r2   = 0.6 + 0.8 * h11(fi * 5.1 + 2.2);
    float head = 0.70 * sin(ph * (0.5 + spd) + lag)
               + 0.34 * sin(ph * (0.5 + spd) * r2 + lag * 1.7 + 1.3);
    // bias so the buoy always sits downstream of its anchor within a swing cone
    float baseAng = h11(fi * 6.7 + 4.4) * TAU;       // rest direction of the line
    float ang = baseAng + head;                      // swing cone ~ +-1 rad

    // own hash-staggered bob (swell) — small heave that always returns
    float bobPh = TAU * t / (LOOP * (0.18 + 0.10 * h11(fi * 7.9 + 0.5)));
    float bob   = 0.012 * arcR * sin(bobPh + lag);

    // tautness: how stretched the line is right now. At the turning extreme the
    // swing is widest -> tether straightens & the light brightens for a beat.
    float taut = 0.5 + 0.5 * sin(ph * (0.5 + spd) + lag + 1.5707963); // turns of head
    taut = taut * taut;                              // accent the extremes

    // slack curve: the line bows when slack, straightens when taut.
    float slack = mix(0.34, 0.02, taut);             // bow depth fraction of arcR

    vec2  dir   = vec2(cos(ang), sin(ang));
    float lineLen = arcR * mix(0.82, 1.0, taut);     // taut line reaches further
    vec2  buoy  = anchor + dir * lineLen + vec2(0.0, bob);

    // ---- draw the tether: a thin bowed line from anchor to buoy ----
    // parameterize along the chord; sag perpendicular, peaking at the middle.
    vec2  ab   = buoy - anchor;
    float L    = max(length(ab), 1e-4);
    vec2  tdir = ab / L;
    vec2  ndir = vec2(-tdir.y, tdir.x);              // perpendicular
    vec2  rp   = uv - anchor;
    float along = clamp(dot(rp, tdir) / L, 0.0, 1.0);
    float perp  = dot(rp, ndir);
    // bow sags toward the anchor side (downstream slack); parabola in `along`
    float sag   = -slack * arcR * 4.0 * along * (1.0 - along);
    float lineD = abs(perp - sag);
    float lw    = (1.1 * pr) / S;                    // line half-width
    float endFade = smoothstep(0.0, 0.05, along) * smoothstep(0.0, 0.05, 1.0 - along);
    float lineGlow = (1.0 - smoothstep(lw, lw + 2.5 * pr / S, lineD)) * endFade;
    // taut lines brighten; slack lines stay dim
    col += hue * lineGlow * mix(0.10, 0.55, taut);

    // ---- vertical reflection streak below the buoy, mirrored on black glass ----
    // Reads as a true on-water reflection: a bright near-buoy lobe (the light's
    // own mirror image just under the waterline) that elongates and dims with
    // distance, broken by horizontal shimmer ripples so it's water, not a tail.
    vec2  rq = uv - buoy;
    float below   = max(0.0, -rq.y);
    // tighter horizontal falloff -> a defined streak, not a smear
    float streakX = exp(-(rq.x * rq.x) / (glow * glow * 0.42));
    // bright mirror lobe right under the buoy + a longer dim tail
    float mirror  = exp(-below / (glow * 4.0));        // crisp reflected core
    float tail    = exp(-below / (glow * 11.0));       // long faint glass trail
    float streakY = (mirror * 1.0 + tail * 0.45) * step(rq.y, 0.0);
    // fade the trailing end softly before the bottom edge so it never clips hard
    float bottomFade = smoothstep(-0.50, -0.36, uv.y);
    streakY *= bottomFade;
    // horizontal ripple bands marching across the streak = water surface
    float shim = 0.62 + 0.38 * sin(below * (140.0 / max(aspect,1.0)) - t * 2.4 + fi * 2.1);
    col += hue * streakX * streakY * 0.46 * shim * mix(0.8, 1.35, taut);

    // ---- the buoy glow core ----
    float d2   = dot(rq, rq);
    float core = exp(-d2 / (glow * glow * 0.5));
    float halo = exp(-d2 / (glow * glow * 4.0));
    float bright = mix(0.85, 1.45, taut);            // taut beat = brighter
    col += hue * (core * 1.15 + halo * 0.40) * bright;
    // white-hot centre so the buoy reads as a light, not just a tint
    col += vec3(core * core) * 0.5 * bright;

    // ---- the fixed dark anchor point: a faint cold pin, mostly unseen ----
    float ad = length(uv - anchor);
    float anchorDot = 1.0 - smoothstep(0.0, glow * 0.5, ad);
    col += hue * anchorDot * 0.06;
  }

  // radial vignette keeps edges as dark water
  float vign = 1.0 - smoothstep(0.55, 1.15, length(uv * vec2(1.0 / max(aspect,1.0), 1.0)) * 2.0);
  col *= mix(0.78, 1.0, vign);

  // gentle filmic-ish roll so bright buoys don't clip harshly
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
