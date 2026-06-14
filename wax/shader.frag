// wax (Mercury) — a lava lamp without the lamp. A heavy basal pool clings to the
// bottom edge of the frame as one liquid mass, and two or three dark molten wax
// bodies rise through the column above it: each pinches off the pool with a bright
// snap, stretches into a slow teardrop as it climbs, stalls and rounds out near
// the top, then sinks and is reluctantly reabsorbed, sending a damped wobble
// running along the pool's crest line. Surfaces read as dark liquid mirror with a
// thin gradient-derived rim highlight; risers blend palette colour 1 low to
// colour 2 high by altitude, the pool holds near-black with a colour-0 crest
// sheen, and every neck flashes colour 3 at the instant of fusion.
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
uniform float u_riseSpeed;  // climb/stall/sink loop speed        (default 0.3)
uniform float u_blobSize;   // riser radius in css px             (default 95)
uniform float u_poolDepth;  // pool height, fraction of frame     (default 0.18)
uniform float u_wobble;     // pool-crest settling wobble amount  (default 1)

const vec3  BG       = vec3(0.018, 0.018, 0.026); // near-black base
const float TAU      = 6.2831853;
const float ISO      = 1.0;   // iso-surface threshold of the summed field

// smooth-min (polynomial) — fuses two field/distance values so bodies bulge
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// circular metaball kernel: peaks well above the iso threshold at the centre so
// a lone body fills solid (dark interior), with the iso-surface sitting inside
// the kernel radius — only the boundary is near iso, so the rim stays thin.
float ball(vec2 p, vec2 c, float r) {
  float d2 = dot(p - c, p - c);
  float x  = clamp(1.0 - d2 / (r * r), 0.0, 1.0);
  return x * x * 1.9; // peak ~1.9 > ISO(1.0); falloff soft & round
}

// one riser's vertical loop: buoyant-slow ascent, heavy descent, stall at top.
// returns y (0=pool top .. 1=top of run) and an "attach" weight (1 near pool).
vec2 riserLoop(float phase) {
  float p = fract(phase);                    // 0..1 loop position
  // ease: ascent occupies 0..0.55 (slow/buoyant), descent 0.55..1 (heavier/quicker)
  float y;
  if (p < 0.55) {
    float a = p / 0.55;
    y = a * a * (3.0 - 2.0 * a);             // smoothstep up — eases into a stall
  } else {
    float d = (p - 0.55) / 0.45;
    float e = d * d;                          // accelerating fall (heavier)
    y = 1.0 - e;
  }
  // attach weight: strong only at the very bottom of the loop (neck region)
  float attach = smoothstep(0.22, 0.0, p) + smoothstep(0.78, 1.0, p);
  return vec2(clamp(y, 0.0, 1.0), clamp(attach, 0.0, 1.0));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x in aspect units, y in 0..1 (0 bottom, 1 top)
  vec2 uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);
  vec2 P = vec2((uv.x - 0.5) * aspect + 0.5, uv.y); // keep x centred, 0..1-ish

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float speed = u_riseSpeed;
  // riser radius in normalized-height units (css px / frame height)
  float r = (u_blobSize * pr) / max(res.y, 1.0);
  float pool = clamp(u_poolDepth, 0.04, 0.45);  // pool top height (fraction)
  float wob  = u_wobble;

  // ---- the basal pool: a half-plane fused with a row of broad kernels so the
  // floor reads as one liquid mass with a single curved upper crest -----------
  // crest wobble: a damped travelling ripple along x, retriggered by riser events.
  // Build a continuous wobble field; its amplitude swells right after detach/rejoin.
  // (an event-driven swell tied to the riser attach pulses is added below.)
  float crest = 0.0;
  // three travelling components for an organic, non-periodic settling ripple
  crest += 0.024 * sin(P.x * 7.0  + t * 0.9);
  crest += 0.016 * sin(P.x * 13.0 - t * 1.5);
  crest += 0.011 * sin(P.x * 19.0 + t * 2.2);

  // half-plane term: rises through the iso threshold across a thin crest band,
  // then climbs well above it deeper in the pool so the interior is solidly
  // "inside" (dark) and only the crest line itself sits near the iso-surface.
  float crestY = pool + crest * wob;
  float poolField = smoothstep(crestY + 0.05, crestY - 0.05, P.y) * 1.0
                  + smoothstep(crestY, -0.05, P.y) * 1.4; // deepens toward the floor
  float bx0 = 0.18, bx1 = 0.50, bx2 = 0.82;

  // ---- risers: 3 bodies, each on its own offset phase-continuous loop --------
  // phases are irrational-ish multiples so loops never synchronize
  float lp = t * speed * 0.12; // base loop rate (slow)
  float ph0 = lp * 1.00 + 0.00;
  float ph1 = lp * 0.83 + 0.37;
  float ph2 = lp * 1.21 + 0.71;

  vec2  L0 = riserLoop(ph0);
  vec2  L1 = riserLoop(ph1);
  vec2  L2 = riserLoop(ph2);

  // horizontal lanes (slight sway so they aren't rigid columns)
  float x0 = bx0 + 0.03 * sin(t * 0.21 + 0.0);
  float x1 = bx1 + 0.03 * sin(t * 0.18 + 2.1);
  float x2 = bx2 + 0.03 * sin(t * 0.24 + 4.2);

  // map loop-y (0..1) to a vertical position above the pool up toward the top
  float lo = crestY;                 // launch from the pool crest
  float hi = 0.92;                   // stall height near the top
  float y0 = mix(lo, hi, L0.x);
  float y1 = mix(lo, hi, L1.x);
  float y2 = mix(lo, hi, L2.x);

  // teardrop stretch: vertical scale grows mid-rise (stretched), rounds at stall.
  // We emulate by adding a second trailing kernel below the body when attached.
  vec2 c_r0 = vec2(x0, y0);
  vec2 c_r1 = vec2(x1, y1);
  vec2 c_r2 = vec2(x2, y2);

  // summed metaball field: pool + risers, iso-surfaced through smooth-min fusion.
  // Each riser contributes a head kernel plus a neck kernel that reaches back down
  // toward the pool when attach>0, so necks visibly thin and snap.
  float F = poolField;

  // pool body kernels (wide, low) — part of the same field so necks fuse in
  F = max(F, ball(P, vec2(bx0, pool * 0.35), pool * 1.5));
  F = max(F, ball(P, vec2(bx1, pool * 0.35), pool * 1.6));
  F = max(F, ball(P, vec2(bx2, pool * 0.35), pool * 1.5));

  // riser heads
  float h0 = ball(P, c_r0, r);
  float h1 = ball(P, c_r1, r);
  float h2 = ball(P, c_r2, r);

  // neck kernels: a stretched lobe between body and pool, present when attached
  float n0 = ball(P, mix(vec2(x0, crestY), c_r0, 0.5), r * (0.55 + 0.5 * L0.y)) * L0.y;
  float n1 = ball(P, mix(vec2(x1, crestY), c_r1, 0.5), r * (0.55 + 0.5 * L1.y)) * L1.y;
  float n2 = ball(P, mix(vec2(x2, crestY), c_r2, 0.5), r * (0.55 + 0.5 * L2.y)) * L2.y;

  // fuse everything with smooth-min on the *field* via additive blobby sum, then
  // iso-threshold. Additive sum is the classic metaball fusion (bodies bulge,
  // neck, fuse). Add risers + necks on top of the pool field.
  F += h0 + h1 + h2 + n0 + n1 + n2;

  // iso-surface: inside where F >= ISO. Anti-aliased boundary via fwidth-free
  // smoothstep against an estimated edge softness.
  float aa = 0.04; // edge softness in field units
  float inside = smoothstep(ISO - aa, ISO + aa, F);

  // ---- gradient-derived rim: thin bright band where the field crosses iso -----
  // |F-ISO| small near the surface; convert to a thin rim that fades inward/outward
  float edge = abs(F - ISO);
  float rim  = exp(-edge * edge / (2.0 * 0.018 * 0.018));

  // ---- colour the bodies -----------------------------------------------------
  // base molten body colour: near-black so it reads as dark liquid mirror
  vec3 body = BG * 1.2;

  // riser tint blends colour1 low -> colour2 high purely by altitude
  float altMix = smoothstep(crestY, hi, P.y);
  vec3 riserTint = mix(c1, c2, altMix);

  // is this pixel a riser (above crest) vs pool (below)? use a soft split
  float aboveCrest = smoothstep(crestY - 0.02, crestY + 0.06, P.y);

  // interior sheen: faint cool interior glow, stronger in risers
  vec3 sheenCol = mix(c0, riserTint, aboveCrest);
  float interior = inside * (0.10 + 0.18 * aboveCrest);

  // rim highlight: thin, bright, gradient-derived. Cooler in pool, riser-tinted up.
  vec3 rimCol = mix(c0 * 1.2, riserTint * 1.35, aboveCrest);

  // neck flash: colour3 where a neck kernel is active AND near the surface.
  // The snap is brightest while attach is mid-transition (pinch). Use a pulse on
  // the combined neck contribution localized near the crest.
  float neckAmt = (n0 + n1 + n2);
  // pinch pulse per riser: peaks while the neck is mid-transition (snapping), with
  // a broadened window so the bright snap reads even in a still frame.
  float pp0 = L0.y * (1.0 - L0.y);
  float pp1 = L1.y * (1.0 - L1.y);
  float pp2 = L2.y * (1.0 - L2.y);
  float attachPulse = (pp0 + pp1 + pp2) * 4.0;
  attachPulse = clamp(attachPulse + 0.35 * clamp(neckAmt, 0.0, 1.0), 0.0, 1.5);
  float neckBand = exp(-edge * edge / (2.0 * 0.04 * 0.04));
  float neckRegion = smoothstep(crestY - 0.12, crestY + 0.14, P.y) * (1.0 - smoothstep(crestY + 0.34, crestY + 0.55, P.y));
  float flash = clamp(neckAmt * 2.2, 0.0, 1.0) * attachPulse * neckBand * neckRegion;

  // ---- compose ---------------------------------------------------------------
  vec3 col = BG;

  // dark liquid body fill (very dark — it's a mirror, not a glow blob)
  col = mix(col, body, inside);

  // faint cool interior sheen
  col += sheenCol * interior;

  // pool crest sheen: colour0 glints along the upper surface of the pool
  float crestGlint = rim * (1.0 - aboveCrest) * smoothstep(crestY - 0.10, crestY, P.y);
  col += c0 * crestGlint * 0.9;

  // thin bright rim highlight everywhere (the gradient-derived edge)
  col += rimCol * rim * (0.55 + 0.45 * aboveCrest);

  // the bright snap at the neck — colour3 flash at fusion/pinch
  col += c3 * flash * 2.4;

  // a soft bloom around the whole liquid so dark bodies still read as luminous wax
  col += rimCol * inside * 0.05;

  // --- depth-of-field background: soft defocused wax blobs rise in the background
  // column behind the risers, giving depth + filling the dark (replaces backdrop). ---
  vec3 dofBg = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i) + 1.0;
    vec2  seed = vec2(fract(sin(fi * 91.7) * 4373.0), fract(sin(fi * 47.3) * 9277.0));
    float bx = seed.x;
    float by = pool + fract(seed.y + t * speed * 0.04 + fi * 0.13) * (1.0 - pool);
    vec2  obp  = vec2((bx - 0.5) * aspect + 0.5, by);
    float orad = 0.10 + 0.10 * fract(sin(fi * 23.1) * 1731.0);
    float od   = length(P - obp);
    float disc = smoothstep(orad, orad * 0.5, od);
    float ring = exp(-pow((od - orad * 0.9) / (orad * 0.18), 2.0));
    vec3  oc   = mix(c1, c2, fract(sin(fi * 5.5) * 331.0));
    dofBg += oc * (disc * 0.55 + ring * 0.80);
  }
  col += dofBg * 0.050 * (1.0 - inside);

  // gentle vignette to compose the framing and keep edges dark
  vec2 vd = (fc / res - 0.5);
  float vign = 1.0 - smoothstep(0.55, 1.0, length(vd) * 1.25);
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
