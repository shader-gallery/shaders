// frond (Smolder) — a leaf skeleton burning from its margin inward. A single
// leaf lies diagonally across the frame: a midrib stroke with paired side
// veins, the lamina between them a hair-thin membrane just above black. Fire
// enters from the outer margin and eats toward the midrib — the front is a
// growing inward offset of the leaf-edge distance field, perturbed by FBM, so
// a glowing rim traces an ever-shrinking copy of the leaf's outline. Across the
// rim width the four palette colours grade hottest-at-the-leading-(inner)-edge
// to coolest-at-the-charred-(outer)-side. Behind the rim the membrane is char
// but the veins it crossed keep a dim cooling glow that drains over tens of
// seconds; ahead, intact membrane waits unlit. When the leaf is consumed its
// veins cool to black while a second leaf on the opposite diagonal — long
// since faded in as pure dark geometry — ignites at its own margin, crossfaded
// so the burn never visibly restarts.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_burnRate;        // how fast the margin contracts toward the midrib (default 0.25)
uniform float u_rimWidth;        // width of the glowing margin rim, css px, scaled by u_pixelRatio (default 10)
uniform float u_veinAfterglow;   // how long crossed veins keep their cooling glow; 0 snuffs them at once (default 0.5)
uniform float u_marginRagged;    // FBM roughness of the burning margin; 0 = clean offset of the leaf edge (default 0.7)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// smooth value noise (C1)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fbm, rotated per octave; range ~[0,0.95], mean ~0.5
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.616, 1.214, -1.214, 1.616);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// distance to a line segment a->b
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

// --- leaf geometry, in a leaf-local frame (x along midrib, y across) ---
// The lamina is a smooth lens: |y| <= halfWidth(x) for x in [-1,1] (tip..base).
// halfWidth tapers to zero at both ends. We return a signed value:
//   leafSDF > 0  inside the lamina (distance toward the margin),
//   leafSDF < 0  outside.
// Units are leaf-local (1.0 ~ half the leaf length).
float leafHalfWidth(float x) {
  // x in [-1 (tip), 1 (base)]; widest a bit past mid toward the base
  float u = clamp((x + 1.0) * 0.5, 0.0, 1.0);          // 0 at tip, 1 at base
  float w = sin(pow(u, 0.72) * 3.14159265);            // lens taper, 0 at both ends
  return w * 0.46;
}

// signed inward distance to the leaf margin (leaf-local units). Positive
// inside; magnitude ~= shortest distance to the outline (good enough for an
// offset-contour front).
float leafEdgeDist(vec2 q) {
  // clamp x to the body so tip/base round off rather than ring forever
  float x = clamp(q.x, -1.0, 1.0);
  float hw = leafHalfWidth(x);
  // distance from the centerline minus the local half-width is a fair
  // approximation of inward depth for a slowly-varying lens
  float across = hw - abs(q.y);
  // longitudinal containment (kills everything past tip/base)
  float along  = 1.0 - abs(q.x);
  // combine: inside requires both positive; use a soft min toward the nearer wall
  float d = min(across, along * 0.62);
  return d;
}

// the vein skeleton mask in leaf-local space: midrib + hashed paired side
// veins. Returns a 0..1 coverage (1 on a vein) and writes the vein's
// longitudinal position s (0 tip .. 1 base) so afterglow can age by when the
// front crossed it.
float veinMask(vec2 q, out float vs) {
  float pr_unused = 0.0;
  float cover = 0.0;
  vs = clamp((q.x + 1.0) * 0.5, 0.0, 1.0);

  // midrib: a capsule along the centerline
  float dm = sdSeg(q, vec2(-0.98, 0.0), vec2(0.98, 0.0));
  cover = max(cover, 1.0 - smoothstep(0.006, 0.018, dm));

  // paired side veins at hashed angles/lengths along the midrib
  const int N = 9;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float t = (fi + 0.5) / float(N);          // 0..1 along midrib
    float bx = mix(-0.86, 0.86, t);           // base point on midrib
    float hw = leafHalfWidth(bx);             // local half-width (reach)
    float h  = hash21(vec2(fi, 3.1));
    float ang = mix(0.55, 1.15, hash21(vec2(fi, 7.7))); // splay from midrib
    float len = hw * mix(0.78, 1.02, h);
    // upper vein
    vec2 du = vec2(cos(ang), sin(ang));
    vec2 tipU = vec2(bx, 0.0) + vec2(du.x * 0.9, du.y) * len;
    float su = sdSeg(q, vec2(bx, 0.0), tipU);
    cover = max(cover, (1.0 - smoothstep(0.004, 0.013, su)) * 0.92);
    // lower vein (mirror)
    vec2 tipL = vec2(bx, 0.0) + vec2(du.x * 0.9, -du.y) * len;
    float sl = sdSeg(q, vec2(bx, 0.0), tipL);
    cover = max(cover, (1.0 - smoothstep(0.004, 0.013, sl)) * 0.92);
  }
  return clamp(cover, 0.0, 1.0);
}

// Shade one leaf. `phase` runs 0..1 over the burn cycle. The margin offset
// `off` grows from 0 (just the rim of the outline) to past the midrib, so the
// fire eats inward. Returns colour contribution; this leaf's geometry is
// transformed by leaf-local frame (origin ctr, axis `axis`, scale `scl`).
vec3 shadeLeaf(vec2 cssP, vec2 ctr, vec2 axis, float scl, float phase,
               vec3 c0, vec3 c1, vec3 c2, vec3 c3,
               float rimCss, float ragAmp, float afterglow, float t, float seed) {
  // into leaf-local coords (x along axis, y across), normalised by scale
  vec2 rel = cssP - ctr;
  vec2 ax  = normalize(axis);
  vec2 pn  = vec2(ax.x, -ax.y);                 // perpendicular wrong-handed; fix below
  vec2 perp = vec2(-ax.y, ax.x);
  vec2 q = vec2(dot(rel, ax), dot(rel, perp)) / scl;

  float vs;                                      // vein longitudinal pos (out)
  float ed = leafEdgeDist(q);                    // inward depth (leaf units), <0 outside
  if (ed < -0.06) {
    // far outside the leaf body — contributes only deep char ambience, skip cost
    return vec3(0.0);
  }

  // perturb the front with FBM so the margin necks & frays (static per leaf,
  // only the threshold moves => the front only ever advances inward)
  float rag = ragAmp * 0.10 * (fbm(q * vec2(3.0, 6.0) * 2.4 + seed) - 0.5) * 2.0;
  float edp = ed + rag;                          // ragged inward depth

  // burn offset grows with phase: front sits at edp == off.
  // off goes a touch negative early (rim hugging the true margin) up to ~0.55
  // (past the midrib) so the whole lamina is consumed.
  float off = mix(-0.02, 0.56, phase);

  // signed distance of THIS fragment to the front, in css px.
  // edp - off > 0 -> still unburned (inside of the front, toward midrib... no:
  // larger edp = deeper inside leaf). The front is the locus edp==off and it
  // sweeps from the margin (edp small) inward (edp large). Ahead of the front
  // (unburned membrane) is edp > off; behind (char) is edp < off.
  float edToPx = scl;                            // leaf-units -> css px (approx)
  float sdCss = (edp - off) * edToPx;            // >0 unburned, <0 char
  float sdPx  = sdCss * u_pixelRatio;
  float rimPx = max(rimCss, 1.0) * u_pixelRatio;

  // ---- base material: unburned membrane (faint) ahead, char behind
  float onChar = 1.0 - smoothstep(-rimPx * 0.35, rimPx * 0.15, sdPx);
  // membrane: a hair above background, only inside the leaf body
  float bodyIn = smoothstep(-0.02, 0.05, ed);
  // a faint cool glow fills the intact lamina so the whole leaf reads as a
  // luminous membrane, not a near-black void with a lit rim
  vec3 membrane = BG * (1.0 + 0.30 * bodyIn) + mix(c2, c0, 0.5) * bodyIn * 0.06;
  vec3 charBase = BG * 0.55;
  vec3 col = mix(membrane, charBase, onChar) - BG; // work in additive space over shared BG

  // ---- vein skeleton: drawn everywhere inside the body, but only glows where
  // the front has already crossed it (char side) and then cools.
  float vs2;
  float vein = veinMask(q, vs2);
  // seconds since the front crossed this point: front reaches edp at time when
  // off == edp i.e. phase == (edp+0.02)/0.58. tau grows with how far behind.
  float burnedDepth = max(off - edp, 0.0);       // how far past the front (leaf units)
  // convert to a cooling age: deeper-burned (closer to midrib was burned later
  // -> small age; near margin burned earliest -> large age). Use distance the
  // front has travelled since crossing this fragment.
  float ageNorm = burnedDepth;                   // 0 at the rim .. grows into char
  // afterglow controls BOTH how slowly the glow cools with depth and how
  // bright it is: at 0 the cooling is steep and the floor near-zero (snuffed
  // the moment the front passes); at 1 it lingers far into the char.
  float cool = exp(-ageNorm * (11.0 - 9.5 * clamp(afterglow, 0.0, 1.0)));
  // dim cooling vein glow on the char side only
  vec3 veinGlowCol = mix(c2, c0, 0.4) * 0.7 + c1 * 0.16;
  col += veinGlowCol * vein * onChar * cool * (0.08 + 2.7 * afterglow) * 1.0;
  // always-on structural vein glow: the leaf skeleton reads as a luminous
  // network even before the fire reaches it — frond's veined-leaf identity
  // (vs char's burnt-paper crack field).
  col += veinGlowCol * vein * bodyIn * 0.15;
  // a broad cooling-ember wash over the burned lamina, brightest just behind
  // the rim and fading deeper into the char; gated hard by afterglow so 0
  // snuffs the whole char side dark the instant the front passes
  float charWash = onChar * exp(-ageNorm * (5.0 - 3.5 * clamp(afterglow,0.0,1.0)));
  col += (c2 * 0.5 + c3 * 0.2) * charWash * afterglow * 0.32;
  // faint structural darkening of veins on unburned membrane (visible as dark
  // skeleton waiting to be lit)
  col -= vec3(0.012) * vein * (1.0 - onChar) * bodyIn;

  // ---- incandescent rim: graded across its width, hottest at the leading
  // (inner) edge, cooling toward the charred (outer) side.
  // qn runs 0 at the leading edge -> 1 at the trailing side.
  float qn  = -sdPx / rimPx;
  float on  = smoothstep(1.4 * u_pixelRatio, -1.4 * u_pixelRatio, sdPx);
  vec3 ramp = c3;                                            // hottest
  ramp = mix(ramp, c1, smoothstep(0.05, 0.32, qn));
  ramp = mix(ramp, c0, smoothstep(0.32, 0.60, qn));
  ramp = mix(ramp, c2, smoothstep(0.60, 0.95, qn));
  // shimmer along the front (intensity only — contour fixed)
  float sh = 0.82 + 0.36 * vnoise(q * 22.0 + vec2(t * 0.8, -t * 0.5) + seed);
  float env = on * (0.10 + 0.90 * exp(-max(qn, 0.0) * 1.9))
            * (1.0 - smoothstep(0.95, 1.35, qn));
  float hot = on * exp(-qn * qn * 60.0);                     // thin white-hot line
  // the rim only exists where there is leaf body to consume
  float rimBody = smoothstep(-0.03, 0.04, ed);
  col += ramp * env * 1.15 * sh * rimBody;
  col += (c3 * 0.7 + vec3(0.30, 0.27, 0.22)) * hot * 0.55 * sh * rimBody;

  // preheat: a little glow bleeding into the not-yet-burned membrane
  float ah = max(sdPx, 0.0);
  float preheat = (1.0 - on) * 0.30 * exp(-ah / (rimPx * 0.5)) * bodyIn;
  col += (c3 * 0.85 + c1 * 0.15) * preheat * sh;

  // ---- spark-pops right at the rim: hashed cells near the front pop once
  float cellSz = 0.10;                                       // leaf units
  vec2 gi = floor(q / cellSz);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = gi + vec2(float(i), float(j));
      float hv = hash21(cell * 1.31 + seed * 5.0);
      if (hv < 0.5) {
        vec2 pos = (cell + 0.5) * cellSz;
        float edc = leafEdgeDist(pos) + rag;                 // depth at the cell
        float dToFront = abs(edc - off) * edToPx * u_pixelRatio;
        // only when the front is passing this cell
        float when = exp(-dToFront * dToFront / (rimPx * rimPx * 1.4));
        float flick = 0.6 + 0.4 * sin(t * (10.0 + 8.0 * hv) + hv * TAU);
        vec2 ppos = (cell + 0.25 + 0.5 * hash21(cell + seed)) * cellSz;
        float dpx = length(q - ppos) * edToPx * u_pixelRatio;
        float r = (1.4 + 1.2 * hv) * u_pixelRatio;
        float core = exp(-dpx * dpx / (r * r));
        vec3 sc = mix(vec3(1.0, 0.92, 0.76), c3, 0.4);
        col += sc * core * when * flick * 0.9 * rimBody;
      }
    }
  }

  return col;
}

// visibility weight over a leaf's phase: rise [0.30,0.40] (still dark geometry)
// and fall [0.84,0.94] (veins cooled to black) sit half a cycle apart so the
// two leaves always sum to ~1 — no dip at handoff.
float vis(float p) {
  return smoothstep(0.30, 0.40, p) * (1.0 - smoothstep(0.84, 0.94, p));
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr    = max(u_pixelRatio, 0.25);
  vec2  fragPx = gl_FragCoord.xy;
  vec2  cssP   = fragPx / pr;
  vec2  resCss = u_resolution / pr;
  float t     = u_time;

  float rimCss   = max(u_rimWidth, 1.0);
  float ragAmp   = clamp(u_marginRagged, 0.0, 1.5);
  float after    = clamp(u_veinAfterglow, 0.0, 1.0);
  float rate     = max(u_burnRate, 0.001) * 0.10;  // cycles per second scaler

  // leaf placement: diagonal across the frame, scaled to the shorter axis so
  // it fits with margin on either side. Two leaves on opposite diagonals.
  vec2 ctr  = resCss * 0.5;
  float scl = min(resCss.x, resCss.y) * 0.54;       // leaf half-length in css px
  vec2 axisA = normalize(vec2( 0.80,  0.60));        // leaf A diagonal
  vec2 axisB = normalize(vec2(-0.80,  0.60));        // leaf B opposite diagonal

  // burn cycle phase. T is the cycle length in phase-units (1.0); rate sets
  // how many cycles per second.
  float ph0 = fract(t * rate + 0.34);
  float ph1 = fract(ph0 + 0.5);
  float w0 = vis(ph0);
  float w1 = vis(ph1);

  vec3 col = BG;

  if (w0 > 0.001) {
    col += w0 * shadeLeaf(cssP, ctr, axisA, scl, ph0, c0, c1, c2, c3,
                          rimCss, ragAmp, after, t, 3.7);
  }
  if (w1 > 0.001) {
    col += w1 * shadeLeaf(cssP, ctr - axisA * scl * 0.10 + axisB * scl * 0.06,
                          axisB, scl, ph1, c0, c1, c2, c3,
                          rimCss, ragAmp, after, t, 11.3);
  }

  // gentle vignette to seat the composition
  vec2 uv = fragPx / max(u_resolution, vec2(1.0));
  col *= 1.0 - 0.32 * smoothstep(0.40, 1.05, length(uv - 0.5) * 1.40);

  // tiny dither to keep long glow gradients band-free
  col += (hash21(fragPx + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
