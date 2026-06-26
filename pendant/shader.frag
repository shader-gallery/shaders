// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// pendant (Umbra) — a hanging mobile turns in lamplight and the wall sees only
// its shadow: five or six silhouettes (discs, a crescent built by two-circle
// subtraction, a slim bar capsule) suspended at staggered heights from implied
// threads that register as hairlines of half-shadow. Each piece slowly revolves
// about its own vertical thread axis, so its projected shadow is an ellipse of
// animated eccentricity — it widens to a full disc, thins to a bar, reinflates;
// projection does all the morphing. Pieces hang at hashed occluder distances, so
// the top shapes hover blurry while the lowest one nearly bites. The wall glow
// blends c1 near the top into c0 below; penumbrae fringe toward c2, and when a
// piece drifts across the throw's hot spot the unoccluded wall around it flares
// toward c3, edging the silhouette. Bodies emit nothing — known only by the
// light they block.
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
uniform float u_turnSpeed;  // how fast pieces revolve about their threads (default 0.22)
uniform float u_pieceSize;  // CSS-px diameter of the mobile's shapes        (default 64)
uniform float u_penumbra;   // per-piece blur-tier scale, crisp..dissolving  (default 1.1)
uniform float u_sway;       // amplitude of the shared pendular drift         (default 0.4)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black wall base
const float PI       = 3.14159265;
const float NPIECE   = 6.0; // number of mobile pieces (literal loop bound below)

// hash a float to 0..1
float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

// distance to a horizontal capsule (slim bar): half-length hl, radius r
float sdCapsule(vec2 p, float hl, float r) {
  p.x -= clamp(p.x, -hl, hl);
  return length(p) - r;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // wall coordinates centred, normalised by height so layout is DPR/aspect stable
  vec2  ctr = res * 0.5;
  vec2  uv  = (fc - ctr) / res.y;

  // --- palette with house fallback (headless can leave u_palette zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- the lit wall: a soft lamp throw with a hot spot, glow c1(top)->c0(bottom) ---
  // implied lamp sits a touch above-right; warm falloff to the corners.
  vec2  lamp   = vec2(0.18, 0.34);
  float r2     = dot(uv - lamp, uv - lamp);
  float throw_ = exp(-r2 * 2.1);                 // brightness of the wall throw
  float vert   = clamp(uv.y * 0.9 + 0.5, 0.0, 1.0); // 0 bottom -> 1 top
  vec3  wallHue = mix(c0, c1, vert);
  // base wall: near-black, gently lifted by the lamp throw, faintly tinted
  vec3  col = BG + wallHue * (0.05 + 0.30 * throw_);

  // piece radius in the same normalised units
  float pieceR = (u_pieceSize * 0.5) * pr / res.y;
  pieceR = max(pieceR, 0.004);

  // shared shallow pendular sway of the whole mobile (phase-continuous)
  float swayA = 0.14 * u_sway;
  float swayX = swayA * sin(t * 0.37);
  float swayY = swayA * 0.35 * sin(t * 0.37 * 2.0 + 1.1); // slight bob

  // accumulate occlusion (how much light each piece blocks at this pixel) and
  // the penumbra fringe (soft half-shadow rim) — both as scalars, read in negative
  float occ    = 0.0; // 0 = fully lit, 1 = fully blocked
  float fringe = 0.0; // half-shadow band intensity (for c2 colouring)

  // pieces hang in a staggered row across the upper-middle wall
  for (float i = 0.0; i < NPIECE; i += 1.0) {
    float fi = i;
    // horizontal slot across the wall, with a little hashed jitter
    float slot = (fi / (NPIECE - 1.0) - 0.5) * 1.36;
    float jx   = (hash11(fi + 3.7) - 0.5) * 0.10;
    // staggered hanging height; thread length hashed per piece
    float thread = 0.18 + hash11(fi + 1.3) * 0.30;
    float hangY  = 0.30 - thread;                 // y of the piece centre
    vec2  pc = vec2(slot + jx + swayX, hangY + swayY);

    // per-piece size variation so the mobile reads as varied hanging shapes
    float pr_i = pieceR * (0.78 + hash11(fi + 4.4) * 0.62);

    // each piece revolves about its vertical thread axis at its own rate;
    // projected shadow horizontal scale = |cos(turn)| (disc <-> bar morph).
    float rate  = 0.55 + hash11(fi + 5.1) * 1.05;  // incommensurate per piece
    float phase = hash11(fi + 9.2) * 6.2831; // staggered start orientations
    float turn  = t * u_turnSpeed * rate + phase;
    float xscale = abs(cos(turn));                 // 1 = full face, 0 = edge-on bar
    xscale = mix(0.05, 1.0, xscale);               // linear disc<->bar morph; never a zero-width sliver

    // occluder distance from the wall (hashed) -> penumbra blur tier.
    // top/short-thread pieces sit farther from the wall => blurrier.
    float dist = 0.35 + (1.0 - thread / 0.48) * 0.65 + hash11(fi + 7.4) * 0.25;
    // faster-revolving pieces smear their edge (rotational motion blur), so the
    // turn speed reads even in a still: a quick mobile is softer than a slow one.
    float spin = u_turnSpeed * rate * 0.45;
    float blur = pr_i * (0.05 + 0.55 * dist * u_penumbra + spin) + pr * 0.8 / res.y;

    // local coords in the piece frame, with the turn-driven horizontal squash
    vec2 q = uv - pc;
    q.x /= xscale;

    // piece shape by type: discs, one crescent (2-circle subtraction), one capsule
    float typ = hash11(fi + 2.1);
    float sd;
    if (typ < 0.30) {
      // crescent: disc minus an offset disc
      float a = length(q) - pr_i;
      float b = length(q - vec2(pr_i * 0.62, pr_i * 0.10)) - pr_i * 0.92;
      sd = max(a, -b);
    } else if (typ < 0.46) {
      // slim bar capsule
      sd = sdCapsule(q, pr_i * 0.78, pr_i * 0.30);
    } else {
      // plain disc
      sd = length(q) - pr_i;
    }

    // soft-edged silhouette: penumbra width = blur (scaled by occluder distance).
    // inside (sd<0) -> 1, fading across the half-shadow band to 0 outside.
    float body = 1.0 - smoothstep(-blur, blur, sd);
    // the half-shadow rim itself: a thin cool band just OUTSIDE the umbra, a
    // faint tint — not a halo. Sits where sd is small-positive (still in light).
    float rim  = exp(-(sd * sd) / (blur * blur * 0.7 + 1e-7)) * smoothstep(-blur * 0.2, blur * 0.9, sd);

    // combine: darkest piece wins (max), fringe accumulates softly
    occ    = max(occ, body);
    fringe = max(fringe, rim);

    // implied thread: a hairline of half-shadow rising from the piece to the rail
    float threadX = pc.x;
    float dxl = abs(uv.x - threadX);
    float onY = step(pc.y, uv.y) * step(uv.y, 0.34); // between piece and rail
    float line = (1.0 - smoothstep(0.0, blur * 1.6 + 0.0015, dxl)) * onY * 0.10;
    occ = max(occ, line);
  }

  // a faint rail across the top from which the threads hang (its own soft shadow)
  float railY = 0.34;
  float rail  = (1.0 - smoothstep(0.0, 0.010, abs(uv.y - railY))) * 0.10;
  occ = max(occ, rail);

  // --- compose the shadow onto the lit wall ---
  // the unoccluded wall near the hot spot flares toward c3, edging the silhouette.
  float hot   = smoothstep(0.45, 1.0, throw_);
  vec3  flare = mix(wallHue, c3, 0.55) * hot;
  col += flare * 0.22 * (1.0 - occ);

  // the body blocks the light: drop toward deep dark where occluded.
  // pooled overlaps read darker because occ saturates near 1.
  vec3 shadowCol = BG * 0.35;
  col = mix(col, shadowCol, occ);

  // penumbra fringe tints toward c2 (cool half-shadow rim) — faint, added AFTER
  // the shadow drop so it reads as a cool fading of the rim, not a bright halo.
  col += c2 * fringe * (0.10 + 0.16 * throw_);

  // gentle vignette to keep the corners as dark wall
  float vign = 1.0 - smoothstep(0.55, 1.25, length(uv * vec2(res.x/res.y, 1.0)));
  col *= mix(0.72, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
