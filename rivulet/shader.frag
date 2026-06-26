// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// rivulet (Noir) — a near-black pane in front of a softly blurred field of city
// colour. A large-scale FBM wash, blended from the four palette hues, drifts
// dim and out of focus behind the glass. A handful of meandering water trails
// descend in hash-assigned columns, wandering side to side on layered sines and
// occasionally forking; each trail is crowned by a bright refractive leading
// bead that locally sharpens and brightens the colour field behind the glass,
// leaving a faint darker wet track above it. Rain and smeared neon.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four city-light colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fallSpeed;    // bead descent speed down the pane     (default 0.55)
uniform float u_trailWidth;   // trail+bead width in CSS px           (default 5)
uniform float u_wander;       // side-to-side sine meander amplitude  (default 0.6)

const vec3  BG          = vec3(0.030, 0.031, 0.040); // near-black glass base
const float COLUMNS     = 9.0;   // hash-assigned trail columns (const loop bound)
const float FIELD_CSS   = 520.0; // base wavelength of the blurred colour field

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// smooth value noise on a 2D lattice
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// a few octaves of fractal noise for the soft city wash
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.1);
    amp *= 0.5;
  }
  return v;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords, y up = 0 at top so beads "fall" with increasing phase
  vec2  uv  = fc / res;                 // 0..1
  float asp = res.x / max(res.y, 1.0);
  vec2  p   = (fc - res * 0.5) / max(res.y, 1.0); // centred, aspect-correct

  // --- palette fallback (headless contexts can zero the array) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ----------------------------------------------------------------------
  // Blurred city colour field behind the glass: a large-scale FBM wash that
  // drifts almost imperceptibly. We sample it at low spatial frequency so it
  // reads as out of focus, and use two fbm samples (one for brightness, one
  // for hue selection) so the colour wanders independently of the lightness.
  // ----------------------------------------------------------------------
  float fscale = res.y / (FIELD_CSS * pr);
  vec2  fp     = uv * fscale * vec2(asp, 1.0);
  float drift  = t * 0.018;            // almost imperceptible background drift
  float lum    = fbm(fp + vec2(drift, drift * 0.6));
  float hueN   = fbm(fp * 0.6 + vec2(-drift * 0.7, 2.0 + drift));

  // map hue noise onto the 4-hue wheel; blend with cyclic weights (no dynamic
  // indexing — illegal in the GLSL ES 1.00 frag stage)
  float s  = fract(hueN * 1.3 + 0.10 * sin(t * 0.05)) * 4.0;
  float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
  vec3  cityHue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // dim, defocused base wash — raised floor so the neon city actually reads
  // behind the glass across the whole pane (no near-dead lower regions), while
  // staying out of focus and below the beads.
  float wash = smoothstep(0.08, 0.92, lum);
  vec3  city = cityHue * (0.15 + 0.34 * wash);

  // soft bokeh blooms where the wash peaks (out-of-focus signage) — lowered
  // thresholds so blooms appear more often and fill the field with smeared light
  float bokeh = smoothstep(0.50, 0.90, lum);
  city += cityHue * bokeh * 0.42;

  // a second, lower-frequency bloom layer from the hue-noise field so even the
  // calmer central/lower regions carry some defocused signage glow
  float bloom2 = smoothstep(0.45, 0.95, hueN);
  city += cityHue * bloom2 * 0.18;

  // start from a dark pane that shows the softly blurred field through the glass
  vec3 col = BG + city * 0.78;

  // ----------------------------------------------------------------------
  // Water trails. Each column owns a vertical lane; a hash gives it an offset
  // period and phase so beads re-enter the top out of phase. The bead's x
  // wanders on layered sines (the WANDER param), and occasionally a fork
  // splits a second bead to the side. The bead is a moving lens: it locally
  // sharpens + brightens the colour field, and trails a faint darker wet track
  // above it.
  // ----------------------------------------------------------------------
  float widthN = u_trailWidth * pr / max(res.y, 1.0); // trail half-extent, normalized
  float colW   = asp / COLUMNS;                        // lane width in centred-x units
  float xLeft  = -asp * 0.5;
  float py     = p.y;                                  // pixel y (centred, +0.5 top)

  // path x at a given descent phase ph for column with hashes h0,h1 (meander)
  // (declared inline per column below)

  float lensSharpen = 0.0; // sharpened field revealed under the bead (lens)
  float beadGlow    = 0.0; // bright refractive leading-bead highlight
  float trailGlow   = 0.0; // luminous wet thread the bead leads
  float wetDark     = 0.0; // faint darker wet track above the bead

  for (int ci = 0; ci < 9; ci++) {
    float fi  = float(ci);
    float h0  = hash11(fi + 1.0);
    float h1  = hash11(fi + 31.0);
    float h2  = hash11(fi + 57.0);

    // lane centre x with a hashed jitter inside the lane
    float laneX = xLeft + (fi + 0.5) * colW + (h0 - 0.5) * colW * 0.5;

    // per-column fall period + phase so columns never synchronize
    float period = 2.6 + h1 * 3.4;                       // seconds for a descent
    float speed  = (1.0 / period) * (0.35 + u_fallSpeed);// descents/sec
    float phase  = fract(t * speed + h2);                // 0 top .. 1 bottom
    float beadY  = 0.5 - phase;                          // bead y (descends)

    // meander x as a function of *vertical phase* so the whole trail is one
    // continuous wandering path (not just a moving dot). Amplitude = WANDER.
    // We evaluate the path at the PIXEL's own height so the streak curves.
    float pyPhase = 0.5 - py;                            // 0 top .. 1 bottom at pixel
    float wobBead = sin((1.0 - phase) * 7.0 + h0 * 6.28) * 0.55
                  + sin((1.0 - phase) * 3.1 + h1 * 6.28) * 0.45;
    float wobPix  = sin((1.0 - pyPhase) * 7.0 + h0 * 6.28) * 0.55
                  + sin((1.0 - pyPhase) * 3.1 + h1 * 6.28) * 0.45;
    float bx   = laneX + wobBead * u_wander * colW * 0.5; // bead centre x
    float pathX= laneX + wobPix  * u_wander * colW * 0.5; // trail path x at pixel y

    // distance from pixel to the meandering trail path (horizontal)
    float dpath = p.x - pathX;
    float pathLine = exp(-(dpath*dpath) / max(widthN*widthN * 1.1, 1e-7));

    // the trail is the segment ABOVE the bead (the wet runnel it has left). A
    // long, slow fade so each bead clearly LEADS a continuous rivulet rather
    // than reading as an isolated falling spark.
    float distAbove = py - beadY;
    float aboveBead = smoothstep(0.0, 0.03, distAbove)             // start at bead
                    * (1.0 - smoothstep(0.40, 0.95, distAbove));   // long fade up
    trailGlow += pathLine * aboveBead;

    // the faint DARKER wet track sits just above the bead head — a tighter,
    // nearer segment than the luminous thread so it reads as refractive wetting
    float wetSeg = smoothstep(0.0, 0.02, distAbove)
                 * (1.0 - smoothstep(0.10, 0.42, distAbove));
    wetDark   += pathLine * wetSeg;

    // --- leading bead (a bright refractive blob at the head of the trail) ---
    float bdx = p.x - bx;
    float bdy = py - beadY;
    float br  = widthN;
    float bead = exp(-(bdx*bdx + bdy*bdy) / max(br*br, 1e-7));

    // occasional fork: a second bead branches off near mid-descent
    float forkOn = step(0.5, h2) * smoothstep(0.35, 0.5, phase)
                 * (1.0 - smoothstep(0.7, 0.85, phase));
    float forkX  = bx + (h1 - 0.5) * 1.6 * colW * 0.5 * u_wander;
    float fdx = p.x - forkX;
    float fdy = py - (beadY + 0.015);
    float fbead = exp(-(fdx*fdx + fdy*fdy) / max(br*br*0.7, 1e-7)) * forkOn;

    float beadField = bead + fbead;
    lensSharpen += beadField;
    beadGlow    += beadField;
  }

  // faint darker WET TRACK above the bead (refractive darkening + cool tint) —
  // applied first so the brighter trail thread reads on top of it. Strengthened
  // so the named spec element is actually perceptible against the dark pane.
  float wd = clamp(wetDark, 0.0, 1.0);
  col -= vec3(0.055, 0.050, 0.038) * wd;

  // luminous wet THREAD the bead leads: the trail picks up smeared city colour.
  // Brightened + given a faint cool-white core so the runnel clearly reads as a
  // continuous rivulet leading the bead, not a scattered spark.
  float tg = clamp(trailGlow, 0.0, 1.4);
  col += cityHue * tg * 0.28;
  col += vec3(0.55, 0.62, 0.72) * tg * 0.06;

  // The lens reveals the colour field with more contrast + brightness. Resample
  // a slightly higher-frequency version of the field at the bead for "sharper".
  float sharpLum = fbm(fp * 1.6 + vec2(drift, 5.0));
  vec3  revealed = cityHue * (0.40 + 1.0 * smoothstep(0.2, 0.9, sharpLum));
  float lensAmt  = clamp(lensSharpen, 0.0, 1.0);
  col = mix(col, col + revealed, lensAmt * 0.9);

  // bright refractive leading bead highlight (white-hot core + hue rim)
  float bg = clamp(beadGlow, 0.0, 1.6);
  col += (vec3(0.9, 0.94, 1.0) * 0.40 + cityHue * 0.70) * bg * 0.95;

  // a touch of bloom around the brightest beads
  col += cityHue * smoothstep(0.4, 1.2, bg) * 0.30;

  // subtle vignette to compose the framing and keep edges of the pane dark
  vec2  q    = uv - 0.5;
  float vign = 1.0 - smoothstep(0.45, 0.95, length(q * vec2(asp, 1.0)) / max(asp, 1.0));
  col *= mix(0.78, 1.0, vign);

  // gentle filmic-ish soft clip to avoid blowout at the bead cores
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
