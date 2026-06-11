// puppet (Umbra) — shadow theatre on an insomniac wall. Inside the soft-edged
// oval throw of a lamp (light blending c0 to c1 across its width on a
// near-black wall, the feathered rim fringed with c2), a hand-shadow bird
// performs: a head with an opening/closing beak wedge, a rounded body, and a
// fan of feather-finger lobes that splay and fold. The figure reads SHARP at
// the core and SOFT at the splayed extremities — penumbra blur graded by the
// implied occluder-to-wall distance. A dim c3 second-bounce lifts the far
// corner so the frame never dies outside the oval. Motion is read entirely in
// the negative: gestures driven by layered incommensurate sinusoids, never
// repeating, occasionally leaning toward the light so the whole silhouette
// swells and melts a step before re-sharpening.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_gestureSpeed;  // tempo of head tilt / beak / feather phrases (default 0.2)
uniform float u_splay;         // how widely the feather lobes fan (0..1, default 0.6)
uniform float u_throwSize;     // css-px width of the lit oval (scaled by pr, default 360)
uniform float u_penumbra;      // graded core→tip blur strength (0..2, default 1)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black wall ~#09090B

// --- SDF primitives ---------------------------------------------------------
float sdCircle(vec2 p, float r) { return length(p) - r; }

// capsule / rounded line segment from a to b with radius r
float sdSegment(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// smooth-min union (keeps the silhouette one continuous body, no hard seams)
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-5), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 2D rotation
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // pixel space centred on the wall, y-up, normalised so 1.0 ~ half-throw width
  vec2  ctr   = res * 0.5;
  float throw = max(u_throwSize, 60.0) * pr;   // guard: never zero/negative
  vec2  p     = (fc - ctr) / (throw * 0.5);
  p.y = -p.y;                                   // y-up for intuitive geometry

  // theme palette with midnight fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float gs = u_gestureSpeed;

  // === THE LAMP THROW =======================================================
  // a soft-edged oval of light on the wall; the implied lamp drifts slowly so
  // the throw breathes and the projected shadow stretches/foreshortens.
  vec2 lampDrift = vec2(0.10 * sin(t * gs * 0.31), 0.06 * sin(t * gs * 0.23 + 1.7));
  vec2 q = (p - lampDrift) / vec2(1.0, 0.72);   // oval: wider than tall
  float rOval = length(q);
  // light intensity inside the oval, feathered rim
  float lamp = 1.0 - smoothstep(0.55, 1.18, rOval);
  // blend c0 (one side) to c1 (other side) across the throw's width
  float across = clamp(0.5 + 0.42 * p.x, 0.0, 1.0);
  vec3  lampCol = mix(c0, c1, across);
  // feathered rim fringe in c2
  float rim = smoothstep(0.82, 1.02, rOval) * (1.0 - smoothstep(1.02, 1.30, rOval));

  // === THE BIRD (articulated occluder) =====================================
  // performs in slow phrases; layered incommensurate sinusoids so gestures
  // never repeat exactly and never reset. "lean" occasionally pushes toward the
  // light: silhouette swells + melts a step, then re-sharpens.
  float ph  = t * gs;
  float lean = 0.5 + 0.5 * sin(ph * 0.37 + 0.9);          // 0..1 slow lean cycle
  lean = smoothstep(0.55, 1.0, lean);                      // mostly settled, occasional surge

  // bird anchored slightly left-of-centre, filling much of the throw
  vec2  bp = (p - vec2(-0.12 + lampDrift.x * 0.6, -0.06)) / 1.35;
  // whole-figure scale swell when leaning toward the lamp
  bp /= (1.0 + 0.10 * lean);

  // head tilt — gentle pivot of the head/beak about the neck
  float tilt = 0.20 * sin(ph * 0.83) + 0.09 * sin(ph * 1.47 + 2.1);

  // The bird faces RIGHT: head + beak up-right, body below-left, the feather
  // crest fanning up-and-LEFT behind the head.
  // body: a rounded ovoid sitting low and left
  vec2  body_p = bp - vec2(-0.22, -0.22);
  float body = sdCircle(body_p * vec2(0.78, 1.05), 0.24);

  // neck rising from the body up-and-right to the head
  vec2  headC = vec2(0.22, 0.16);
  float neck  = sdSegment(bp, vec2(-0.14, -0.10), headC, 0.095);

  // head: a small rounded lobe at the end of the neck, tilts with `tilt`
  vec2  hp    = rot(tilt) * (bp - headC);
  float head  = sdCircle(hp * vec2(0.95, 1.0), 0.125);

  // beak wedge: opens and closes in silent speech. Two lobes hinged at the
  // front of the head, the gap between them widening/narrowing. Points right.
  float speak = 0.5 + 0.5 * sin(ph * 1.9 + 0.6);           // beak open amount
  speak *= speak;                                          // crisper closes
  float beakOpen = 0.035 + 0.16 * speak;
  vec2  hinge   = headC + rot(tilt) * vec2(0.09, -0.01);
  vec2  beakDir = rot(tilt) * vec2(1.0, -0.10);
  vec2  beakUpN = rot(tilt) * vec2(0.10, 1.0);
  vec2  upTip = hinge + beakDir * 0.30 + beakUpN * beakOpen;
  vec2  loTip = hinge + beakDir * 0.30 - beakUpN * beakOpen;
  float beakU = sdSegment(bp, hinge, upTip, 0.028);
  float beakL = sdSegment(bp, hinge, loTip, 0.028);
  float beak  = min(beakU, beakL);

  // feather-finger fan: 4 lobes splaying up-and-back (to upper-left) from
  // behind the head, the crest/wing of the puppet. Each has its own
  // incommensurate phase so they ripple rather than move in lockstep
  // (const-unrolled, no dynamic indexing).
  vec2  fOrig = bp - vec2(0.06, 0.12);
  float splayAmt = clamp(u_splay, 0.0, 1.0);
  // phrase gates: feathers splay then fold over the phrase
  float spread0 = 0.5 + 0.5 * sin(ph * 0.61 + 0.0);
  float spread1 = 0.5 + 0.5 * sin(ph * 0.53 + 1.3);
  float spread2 = 0.5 + 0.5 * sin(ph * 0.67 + 2.7);
  float spread3 = 0.5 + 0.5 * sin(ph * 0.59 + 4.1);
  // base fan centre angle: up-and-left (back/crest of the bird), ~135 deg
  float baseA = 2.40;
  float spanA = 0.28 + 0.95 * splayAmt;       // fan spread grows with splay
  float a0 = baseA + spanA * (-0.52 + 0.16 * spread0);
  float a1 = baseA + spanA * (-0.18 + 0.16 * spread1);
  float a2 = baseA + spanA * ( 0.18 + 0.16 * spread2);
  float a3 = baseA + spanA * ( 0.52 + 0.16 * spread3);
  float fLen = 0.32 + 0.13 * splayAmt;
  vec2  t0 = vec2(cos(a0), sin(a0)) * fLen;
  vec2  t1 = vec2(cos(a1), sin(a1)) * (fLen + 0.05);
  vec2  t2v = vec2(cos(a2), sin(a2)) * (fLen + 0.05);
  vec2  t3 = vec2(cos(a3), sin(a3)) * fLen;
  float fr = 0.050;                    // feather thickness
  float f0 = sdSegment(fOrig, vec2(0.0), t0, fr);
  float f1 = sdSegment(fOrig, vec2(0.0), t1, fr);
  float f2 = sdSegment(fOrig, vec2(0.0), t2v, fr);
  float f3 = sdSegment(fOrig, vec2(0.0), t3, fr);
  float feathers = min(min(f0, f1), min(f2, f3));

  // assemble the silhouette as one continuous body (smooth unions)
  float fig = body;
  fig = smin(fig, neck, 0.10);
  fig = smin(fig, head, 0.08);
  fig = min(fig, beak);                 // beak stays crisp (sharp wedge)
  fig = smin(fig, feathers, 0.06);

  // === PENUMBRA: graded edge softness ======================================
  // The puppeteer holds a fixed distance, so the CORE reads sharp while the
  // EXTREMITIES (splayed feather tips, far from the wall) soften. Approximate
  // the implied occluder-to-wall distance by distance from the body core.
  float coreDist = length(body_p);                 // 0 at body centre
  float farness  = smoothstep(0.20, 0.85, coreDist); // 0 core … 1 tips
  // leaning toward the light melts the edge a step, then re-sharpens
  float meltStep = 0.035 * lean;
  // base blur tiny (crisp core), grows modestly toward the splayed extremities
  float blurPx = 0.005 + (0.030 * farness + meltStep) * clamp(u_penumbra, 0.0, 2.0);
  blurPx = max(blurPx, 0.0025);                    // guard so min stays sane

  // occlusion: 1 fully inside the figure, soft penumbra band at the rim
  float occ = 1.0 - smoothstep(-blurPx, blurPx, fig);

  // === COMPOSITE ============================================================
  // wall lit by lamp; the bird BLOCKS the light (shadow = absence of light).
  vec3 col = BG;

  // base lamp glow on the wall, blended across its width
  float lit = lamp * (1.0 - 0.985 * occ);          // bird carves the dark out
  col += lampCol * lit * 1.05;

  // feathered rim fringe in c2 (the throw's soft luminous edge)
  col += c2 * rim * 0.30 * (1.0 - 0.6 * occ);

  // a faint inner glow gradient so the lit oval has depth, not a flat fill
  float core = 1.0 - smoothstep(0.0, 0.85, rOval);
  col += lampCol * core * lamp * 0.18 * (1.0 - occ);

  // dim c3 second-bounce lifting the far (lower-right) corner so the frame
  // never dies to pure black outside the lit oval
  vec2  cornerV = (fc - ctr) / res;                // -0.5..0.5
  float bounce = smoothstep(0.20, 0.62, cornerV.x - cornerV.y);
  col += c3 * bounce * 0.045;
  // and a barely-there ambient floor everywhere
  col += c3 * 0.012;

  // optional mouse: a subtle brightening where the pointer hovers, gated so
  // the no-pointer (0,0) state is the true face. (No param needed: this is
  // additive-only and zero when absent, per the contract at-rest rule.)
  if (dot(u_mouse, u_mouse) > 1.0) {
    vec2 m = (u_mouse - ctr) / (throw * 0.5);
    m.y = -m.y;
    float md = exp(-dot(p - m, p - m) * 3.0);
    col += lampCol * md * 0.06 * lamp;
  }

  // gentle vignette to seat the throw in the dark room
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res) * 1.6);
  col *= mix(0.78, 1.0, vign);

  // soft tone curve to keep accents luminous without blowing out
  col = col / (1.0 + col * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
