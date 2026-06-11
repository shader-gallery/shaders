// sigil (Omen) — branded runes on black iron. At any moment two or three
// angular, hash-generated sigils — stave-like figures of straight strokes,
// crossbars and forked terminals — sit at scattered positions and scales across
// the near-black field, each at a different stage of cooling. A fresh brand
// glows near-white along its whole figure; as it cools the heat drains down the
// palette (rose → violet → ember), thick stroke junctions holding heat longest,
// until only a faint charred trace remains.
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
uniform float u_strikeRate;  // brand frequency, strikes/cycle scale (default 0.35)
uniform float u_coolPeriod;  // seconds to cool white→charred       (default 40)
uniform float u_runeCss;     // characteristic figure height, css px (default 260)

const vec3  BG       = vec3(0.030, 0.029, 0.036); // near-black iron base
const int   SLOTS    = 6;    // rune slots scattered over the field (const bound)
const float STROKE_CSS = 3.4;// half-thickness of a brand stroke, css px

// ---- hashes (cheap, deterministic) ----
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
vec2  hash21(float n) {
  return fract(sin(vec2(n * 91.345, n * 47.853)) * vec2(43758.5453, 22578.145));
}

// signed distance to a line segment a→b
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Draw a hash-generated angular rune into local space `p` (centred figure,
// roughly height `h` tall). Returns vec3(coverage, junctionHeat, nearDist):
//  .x = soft stroke coverage 0..1 (anti-aliased), .y = extra heat near thick
//  junctions, .z = nearest distance to any stroke (for the glow halo).
vec3 runeFigure(vec2 p, float h, float seed, float strokeW, float aa) {
  float halfH = h * 0.5;
  // a single off-centre vertical stave (nothing circular, nothing centred)
  float stemX = (hash11(seed + 3.1) - 0.5) * h * 0.34;
  vec2  top    = vec2(stemX,  halfH);
  vec2  bottom = vec2(stemX, -halfH);

  float best = 1e9;   // nearest distance to any stroke
  float jct  = 0.0;   // accumulated junction heat (overlapping strokes)

  // main stave
  float dStem = sdSeg(p, top, bottom);
  best = min(best, dStem);

  // forked terminals at the foot (two short diverging strokes)
  float fork = h * (0.16 + 0.10 * hash11(seed + 7.7));
  vec2  fL = bottom + vec2(-fork, fork * (0.7 + 0.5 * hash11(seed + 2.2)));
  vec2  fR = bottom + vec2( fork, fork * (0.6 + 0.6 * hash11(seed + 5.5)));
  best = min(best, sdSeg(p, bottom, fL));
  best = min(best, sdSeg(p, bottom, fR));

  // 3 hash-placed crossbars/branches climbing the stave — each an angular
  // straight stroke springing from a point on the stem to a scattered tip.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sd = seed + fi * 13.37;
    // attachment height along the stave (biased so they spread out)
    float ay = mix(-halfH * 0.35, halfH * 0.85, (fi + 0.5) / 3.0 + (hash11(sd) - 0.5) * 0.18);
    vec2  base = vec2(stemX, ay);
    // direction: pick one of a few angular headings, alternate sides
    float side = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
    float ang  = mix(0.18, 1.15, hash11(sd + 1.0)) * side; // radians off-horizontal
    float len  = h * mix(0.20, 0.46, hash11(sd + 2.0));
    vec2  dir  = vec2(cos(ang) * side, sin(ang));
    vec2  tip  = base + dir * len;
    float dBar = sdSeg(p, base, tip);
    best = min(best, dBar);
    // a fraction of branches fork at the tip (forked terminal)
    if (hash11(sd + 4.0) > 0.45) {
      vec2 t2 = tip + vec2(side * len * 0.22, -len * (0.18 + 0.2 * hash11(sd + 6.0)));
      best = min(best, sdSeg(p, tip, t2));
    }
    // junction heat: where this branch meets the stave the metal is thickest
    jct += exp(-dot(p - base, p - base) / (strokeW * strokeW * 7.0));
  }
  // foot junction (fork root) also holds heat
  jct += exp(-dot(p - bottom, p - bottom) / (strokeW * strokeW * 9.0));

  // anti-aliased stroke coverage from nearest distance
  float cov = 1.0 - smoothstep(strokeW - aa, strokeW + aa, best);
  return vec3(cov, clamp(jct, 0.0, 1.5), best);
}

// thermal palette: temp 1 = fresh near-white brand, → 0 = charred trace.
// drains down through rose → violet → ember as it cools.
vec3 thermal(float temp, vec3 cRose, vec3 cViolet, vec3 cEmber) {
  temp = clamp(temp, 0.0, 1.0);
  // charred dull ember at the cold end, never fully black so a trace remains
  vec3 charred = cEmber * 0.16;
  vec3 col;
  if (temp < 0.33) {
    col = mix(charred, cEmber, temp / 0.33);
  } else if (temp < 0.62) {
    col = mix(cEmber, cViolet, (temp - 0.33) / 0.29);
  } else if (temp < 0.86) {
    col = mix(cViolet, cRose, (temp - 0.62) / 0.24);
  } else {
    // top of the strike: bloom toward near-white along the whole figure
    col = mix(cRose, vec3(1.0), (temp - 0.86) / 0.14 * 0.85);
  }
  return col;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // map palette to a heat ramp: rose (hot) → violet → ember (cool)
  vec3 cRose   = c3;             // hottest accent
  vec3 cViolet = mix(c1, c0, 0.4);
  vec3 cEmber  = mix(c2, c3, 0.3) * 0.9 + vec3(0.06, 0.02, 0.0);

  float strokeW = STROKE_CSS * pr;
  float aa      = pr * 1.4;
  float runeH   = max(u_runeCss, 60.0) * pr; // guard against 0

  // cooling cycle length (guard the divide); strike rate compresses the "lit"
  // share of each cycle — high rate → fresh white figures often, low rate →
  // long stretches of slowly dimming embers.
  float period  = max(u_coolPeriod, 1.0);
  float rate    = clamp(u_strikeRate, 0.05, 1.2);

  // soft additive accumulation over all rune slots
  for (int s = 0; s < SLOTS; s++) {
    float fs   = float(s);
    float seed = fs * 17.13 + 4.0;

    // scattered position (avoid dead-centre): jittered across the field
    vec2  rnd  = hash21(seed);
    vec2  pos  = vec2(
      mix(0.12, 0.88, rnd.x),
      mix(0.14, 0.86, rnd.y)
    ) * res;
    // per-slot scale variation: a scatter of small marks up to frame-dominating
    float scl  = mix(0.55, 1.25, hash11(seed + 9.0));
    float h    = runeH * scl;

    // per-slot rotation so figures sit at angles (still angular/straight)
    float rot  = (hash11(seed + 0.7) - 0.5) * 0.9;
    float cr = cos(rot), sr = sin(rot);
    vec2  local = fc - pos;
    local = vec2(cr * local.x + sr * local.y, -sr * local.x + cr * local.y);

    // ---- strike-and-cool cycle, hash-staggered per slot ----
    // each slot has its own cycle period scaled by strike rate (faster rate →
    // shorter idle → strikes recur sooner) and a hash phase offset.
    float slotPeriod = period * mix(0.8, 1.4, hash11(seed + 11.0)) / max(rate * 2.2, 0.25);
    float phase = hash11(seed + 13.0);
    float u = fract(t / slotPeriod + phase);     // 0..1 within this slot's cycle

    // strike: bloom to full heat over the first ~6% of the cycle, then cool.
    float strikeFrac = 0.06;
    float temp;
    if (u < strikeFrac) {
      temp = u / strikeFrac;                     // rapid bloom to 1.0
    } else {
      // cool over the remainder; the rune index changes each cycle
      float k = (u - strikeFrac) / (1.0 - strikeFrac); // 0..1 cooling progress
      temp = 1.0 - k;
      temp = temp * temp * (0.7 + 0.3 * temp);   // ease so it lingers warm then fades
    }

    // re-seed the figure each cycle so every strike writes a DIFFERENT rune
    float cycleIdx = floor(t / slotPeriod + phase);
    float figSeed  = seed + cycleIdx * 3.7;

    vec3 rf = runeFigure(local, h, figSeed, strokeW, aa);
    float cov  = rf.x;
    float jct  = rf.y;
    float near = rf.z;
    // soft glow halo radiating from the strokes (wider when hot)
    float halo = exp(-near / (strokeW * 3.0));

    // junctions hold heat longest: lift local temp where strokes thicken,
    // strongest while the figure is mid-cool (not during the white strike).
    float coolMask = smoothstep(0.95, 0.55, temp); // ~1 once past the strike
    float localTemp = clamp(temp + jct * 0.22 * coolMask, 0.0, 1.0);

    vec3 heat = thermal(localTemp, cRose, cViolet, cEmber);

    // brightness: hot brands are luminous, charred traces are faint embers.
    // keep a floor so a cold rune still leaves a charred trace on the iron.
    float bright = 0.06 + 1.25 * pow(localTemp, 0.9);

    col += heat * cov * bright;
    // soft glow halo around the strokes, brighter while the rune is hot
    col += heat * halo * (0.22 + 0.45 * localTemp) * bright * 0.45;
    // junction sparkle: extra near-white pinpoints at the thick crossings
    col += heat * jct * coolMask * 0.10 * bright;
  }

  // gentle vignette so the iron field stays darkest at the frame edge
  float vign = 1.0 - smoothstep(0.45, 1.15, length((fc - ctr) / res));
  col *= mix(0.75, 1.0, vign);

  // a whisper of cool tone in the deep background so black iron isn't dead flat
  col += BG * 0.5;

  gl_FragColor = vec4(col, 1.0);
}
