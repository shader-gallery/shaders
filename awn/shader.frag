// awn (Sough) — three ranks of wheat stalks receding in shallow perspective on a
// near-black field. Each stalk is a slender curved stroke rooted at its rank's
// baseline, topped by an awned seed-head (a tight fan of hairline bristles). At
// rest the stalks are barely-readable charcoal silhouettes with the faintest
// residual head glow; when a travelling gust front bends them, brightness pours
// into the head and awns in proportion to local curvature, so light maps to flex.
// Gust fronts arrive on an irregular layered-sine schedule, strike the far rank a
// beat before the near one, bow each stalk downwind and ring it down through a few
// diminishing overshooting swings — root never moves. Calm is the resting state.
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
uniform float u_gustRate;  // how often gust fronts arrive to sweep the field (default 0.45)
uniform float u_bend;      // bow depth + spring-back overshoot under a front  (default 1)
uniform float u_spacing;   // css-px spacing of stalks in the nearest rank     (default 22)
uniform float u_headGlow;  // brightness the seed-heads/awns catch at full flex(default 1)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// hash a float to 0..1
float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

// distance from point p to segment a-b, plus the param t (0..1) along it
float sdSeg(vec2 p, vec2 a, vec2 b, out float seg_t) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  seg_t = h;
  return length(pa - ba * h);
}

// --- gust field -------------------------------------------------------------
// A travelling bow-and-ring excitation. We build an irregular arrival schedule
// from layered incommensurate sine gates (nothing ever resets), find the front
// sweeping across in x, and return a signed bend angle whose magnitude is the
// local flex (which we also map to glow). x in 0..1 across the field; phase is a
// per-rank time offset so the far rank is struck a beat before the near one.
// Returns: x = signed bend, y = flex magnitude (0..1-ish for glow).
vec2 gustAt(float x, float t) {
  float bend = 0.0;
  float flex = 0.0;
  // three overlapping fronts on incommensurate periods so arrivals never align
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float period = mix(7.3, 13.7, hash11(fi + 1.0)); // seconds between this lane's fronts
    float speed  = mix(0.55, 0.95, hash11(fi + 5.0)); // front travel speed across x (units/s)
    float ph     = hash11(fi + 9.0) * period;
    // front position sweeps left->right and wraps; arrival index drives randomness
    float prog   = (t + ph) / period;
    float k      = floor(prog);          // which arrival
    float local  = fract(prog);          // 0..1 within this arrival cycle
    // the front centre sweeps across x = -0.3 .. 1.3 over the active window
    float fx     = -0.3 + local * 1.6 * speed * (period / 1.0) * 0.10 + 0.0;
    // simpler, robust sweep: centre travels with local across the field
    fx           = -0.35 + local * 1.7;
    // distance of this column from the moving front centre
    float d      = (x - fx);
    // a localized travelling envelope (the coherent gust front, ~0.35 wide)
    float env    = exp(-(d * d) / 0.045);
    // amplitude varies per arrival so no two fronts feel alike; gate so most of
    // the cycle is becalmed quiet (front only "live" for part of local)
    float amp    = mix(0.5, 1.0, hash11(k * 1.7 + fi * 3.1));
    // time since this column was hit by the front (negative = not yet arrived)
    float since  = (x - fx);                // small near front
    // bow + ring-down: when struck, bow downwind then overshoot & ring through a
    // few diminishing swings. We phase the oscillation off the front arrival.
    float ringT  = local * period;          // seconds into the cycle
    float ring   = sin(ringT * 6.2831 * 0.5) * exp(-ringT * 0.55);
    bend += env * amp * ring;
    flex += env * amp * abs(ring);
  }
  return vec2(bend, flex);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x 0..1 across, y 0..1 up (0 at bottom)
  vec2 uv = fc / res;

  vec3 col = BG;

  // palette fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float gr = max(u_gustRate, 0.02);
  float tg = t * gr * 2.2;             // gust-schedule clock scaled by rate
  float bendAmt = u_bend;
  float glow    = max(u_headGlow, 0.0);

  // three ranks, far -> near. Each has a baseline (y of roots), a stalk height,
  // a stroke width, a hue centre on the 0..4 wheel, and a time offset (far first).
  // We accumulate contributions front-to-back painter style (near drawn last).
  // Rank params:           far,   mid,   near
  // baseline y (roots):    0.46,  0.30,  0.10  (implied horizon ~0.5)
  // top reach (height):    0.16,  0.30,  0.52
  // base hue centre:       blends colour i toward neighbour i+1
  // hottest awn glint leans toward c3 (the fourth colour).

  // iterate ranks back-to-front — a deep sea of grass: many overlapping rows
  // recede from the horizon down to the foreground so the whole lower frame
  // fills with wheat, a wind rippling across the field.
  for (int r = 0; r < 7; r++) {
    float fr   = float(r);
    float rk   = fr / 6.0;                        // 0 far .. 1 near
    float baseY = mix(0.60, -0.02, rk);           // root line (rows recede to horizon)
    float height = mix(0.12, 0.46, rk);           // stalk height (overlap -> continuous sea)
    float spCss  = u_spacing * mix(0.40, 1.0, rk); // far rows much denser in css px
    float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
    float spacing = max(spCss * refScale * pr, 3.0);
    float strokeW = mix(0.7, 1.6, rk) * pr;       // near stalks thicker
    float dimDepth = mix(0.55, 1.0, rk);          // far rows a touch dimmer
    float rankPhase = (1.0 - rk) * 0.9;           // far struck a beat earlier

    // skip pixels well below this rank's root or far above its tip (cheap reject
    // not possible in unrolled loop sense, but we just let contributions be ~0)

    // which stalk column are we near? convert fc.x to stalk index
    float colF = fc.x / spacing;
    // examine the nearest few stalk centres so a leaning stalk still gets drawn
    // (a stalk bent sideways can cross neighbouring columns)
    for (int o = -1; o <= 1; o++) {
      float idx = floor(colF) + float(o);
      float rootX = (idx + 0.5) * spacing;       // root x in device px
      float xN    = rootX / res.x;               // normalized 0..1 for gust field

      // per-stalk randomness: slight height/lean variation + micro-sway phase
      float hsh  = hash11(idx * 1.37 + fr * 11.1);
      float hsh2 = hash11(idx * 2.91 + fr * 5.3);
      float hMul = mix(0.82, 1.12, hsh);
      float topReach = height * hMul * res.y;    // stalk length in device px

      // gust-driven bend for this column (signed) + flex magnitude
      vec2 g = gustAt(xN, tg + rankPhase);
      float bend = g.x * bendAmt;
      float flex = g.y;
      // near-still micro-sway between gusts so the field is never fully dead
      float micro = sin(t * 0.7 + hsh2 * 6.28 + idx * 0.5) * 0.06;
      bend += micro;

      // build the stalk as a quadratic-ish curve: root fixed, tip displaced by
      // bend horizontally (downwind). The horizontal offset grows with height^2
      // so roots never move and tips swing most. Sample as a polyline of segs.
      vec2 root = vec2(rootX, baseY * res.y);
      // tip horizontal displacement in device px (bend in radians-ish lean)
      float tipDX = bend * topReach * 0.55;
      float tipUp = topReach;

      // distance from this fragment to the stalk curve, tracking param along it
      float best = 1e9;
      float bestT = 0.0;
      vec2 prev = root;
      // unrolled polyline (constant bounds): 6 segments up the stalk
      for (int s = 1; s <= 6; s++) {
        float tt = float(s) / 6.0;
        // curved profile: more lean accumulates toward the top (tt^1.6)
        float curve = pow(tt, 1.6);
        vec2 p = root + vec2(tipDX * curve, tipUp * tt);
        float segT;
        float d = sdSeg(fc, prev, p, segT);
        // global param along whole stalk for this segment
        float gT = (float(s - 1) + segT) / 6.0;
        if (d < best) { best = d; bestT = gT; }
        prev = p;
      }
      vec2 tip = root + vec2(tipDX, tipUp); // actual tip position

      // local curvature ~ how much the stalk is bent; brightness maps to flex.
      // taper the stroke toward the tip so it reads slender
      float taper = mix(1.0, 0.35, bestT);
      float halfW = strokeW * taper;
      float stalk = 1.0 - smoothstep(halfW, halfW + 1.4 * pr, best);

      // the stalk silhouette is near-black charcoal; only a thin rim glow that
      // grows with flex (curvature) lights its edges. Keep the falloff tight so
      // the stalks read as defined strokes, not wide spotlight beams.
      float edge = exp(-best / (halfW * 1.4 + pr));

      // hue: each rank takes colour r blended toward neighbour r+1, plus a tiny
      // per-stalk jitter; hottest glints lean toward c3.
      float baseS = fr + 0.35 + hsh * 0.25;       // wheel position 0..4
      float w0 = wheelW(baseS, 0.0), w1 = wheelW(baseS, 1.0);
      float w2 = wheelW(baseS, 2.0), w3 = wheelW(baseS, 3.0);
      vec3 hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

      // ---- seed-head + awns at the tip ----
      // residual head glow keeps the field alive at rest; flex pours in brightness
      float headFlex = clamp(flex * 1.3, 0.0, 1.0);
      float headLit  = 0.05 + headFlex * 0.95;     // baseline residual + flex
      // seed head: a soft elongated blob at the tip, oriented along the stalk
      vec2 stalkDir = normalize(vec2(tipDX, tipUp) + vec2(0.0, 1e-3));
      vec2 toTip    = fc - tip;
      float along   = dot(toTip, stalkDir);
      float across  = dot(toTip, vec2(stalkDir.y, -stalkDir.x));
      float headLen = topReach * 0.16;             // seed head length
      float headWid = strokeW * 1.6;
      float he = exp(-(along*along)/(headLen*headLen) - (across*across)/(headWid*headWid));

      // awns: a fan of 7 hairline bristles spraying up from the head tip — the
      // fuzzy bristled seed-head is awn's signature texture (vs culm's bare cane)
      vec2 headTip = tip + stalkDir * headLen * 0.9;
      float awns = 0.0;
      for (int aI = 0; aI < 5; aI++) {
        float af = (float(aI) - 2.0) / 2.0;        // -1 .. 1 fan spread
        // bristle direction = stalk dir rotated slightly outward; flex spreads
        float ang = af * (0.22 + headFlex * 0.10);
        float cs = cos(ang), sn = sin(ang);
        vec2 bd = vec2(stalkDir.x*cs - stalkDir.y*sn, stalkDir.x*sn + stalkDir.y*cs);
        vec2 bTip = headTip + bd * headLen * (1.5 + hash11(float(aI)+idx)*0.5);
        float bt;
        float bdst = sdSeg(fc, headTip, bTip, bt);
        // hairline, fades toward bristle tip
        float bw = (0.7 * pr) * (1.0 - bt * 0.7);
        awns += (1.0 - smoothstep(bw, bw + 1.2*pr, bdst)) * (1.0 - bt*0.5);
      }

      // glint colour: hottest awn glow leans toward the fourth palette colour
      vec3 hotHue = mix(hue, c3, 0.55);

      // --- compose this stalk's contribution ---
      // Emissive glowing blades (no charcoal darkening) so the field reads as a
      // bright, luminous sea of wheat rather than dark silhouettes on black.

      // 1) the blade body: a soft glowing stroke, always lit, brighter with flex
      float rim = (stalk * 0.7 + edge * 0.4) * (0.34 + headFlex * 0.82) * dimDepth;
      col += hue * rim * 0.85 * glow;

      // 2) seed head glow — strong resting baseline + iridescent flex hue shift
      float headLitB = 0.30 + headFlex * 0.92;
      vec3 iris = mix(hue, hotHue, 0.4 + 0.6 * headFlex); // head iridescence
      col += iris * he * headLitB * dimDepth * 1.25 * glow;
      // hotter core when strongly flexed, leaning to c3
      col += hotHue * he * headFlex * headFlex * dimDepth * 0.8 * glow;

      // 3) awns: the signature fine bristle fan — bright fuzzy heads at rest,
      // brightest at full flex
      float awnLit = (0.42 + headFlex * 1.0);
      col += mix(hue, hotHue, headFlex) * awns * awnLit * dimDepth * 1.35 * glow;
    }
  }

  // dusk gradient + horizon glow so the sky behind the sea isn't dead black and
  // the grass tips read against a faint lit band near the horizon (~y0.62)
  vec3 skyCol = mix(c0, c1, 0.5);
  col += skyCol * smoothstep(1.0, 0.55, uv.y) * 0.035 * smoothstep(0.45, 0.85, uv.y);
  float horizon = exp(-pow((uv.y - 0.62) * 5.0, 2.0)) * 0.05;
  col += mix(c2, c0, 0.5) * horizon;

  // soft vignette: keep the top corners composed but let the sea fill brightly
  vec2 vc = (fc / res - vec2(0.5, 0.42));
  float vign = 1.0 - smoothstep(0.42, 1.05, length(vc * vec2(1.0, 1.1)));
  col *= mix(0.72, 1.0, vign);

  // subtle filmic-ish soft clamp to avoid blown highlights at high glow
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
