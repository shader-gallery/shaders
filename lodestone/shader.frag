// lodestone (Mercury) — a dark liquid mirror. One broad pool rests low in the
// frame; an unseen magnetic lode patrols a slow arc through the upper dark,
// marked only by a faint colour-2 halo point. The lode is an attractor kernel
// summed into the pool's smooth-min metaball field: as it passes the surface
// bulges into a teardrop reaching up, necks, and a single droplet snaps free in
// a colour-3 flash, riding beneath the attractor before falling home and fusing
// back with a long settling wobble. The rim blends colour 0 -> colour 1 toward
// whichever side is nearest the lode; the interior stays dark mirror.
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
uniform float u_pull;        // strength of the lode's attraction      (default 1)
uniform float u_patrolSpeed; // speed of the unseen lode along its arc  (default 0.3)
uniform float u_poolSize;    // resting pool width scale, css px        (default 210)
uniform float u_halo;        // brightness of the lode marker halo      (default 0.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265;
const float ISO      = 1.0;   // iso-surface threshold of the summed field

// smooth minimum (polynomial) — fuses two field bodies with a soft seam
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// circular metaball potential: high near centre, falling off smoothly.
// radius r in same units as d; returns ~1 at the rim it defines.
float ball(vec2 p, vec2 c, float r) {
  float d2 = dot(p - c, p - c);
  return (r * r) / (d2 + r * r * 0.18);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Work in a resolution-independent space: y up, centred horizontally, unit ~
  // half the smaller screen dimension. Keeps the composition stable at any DPR.
  float uscale = 0.5 * min(res.x, res.y);
  vec2  p = (fc - 0.5 * res) / uscale;   // p.x in ~[-asp,asp], p.y in ~[-1,1]

  // --- guarded params -----------------------------------------------------
  float pull   = max(u_pull, 0.0);
  float pSpeed = max(u_patrolSpeed, 0.0);
  // pool width in our unit space (poolSize is a css-px width)
  float poolW  = max(u_poolSize, 1.0) * pr / uscale;
  float halo   = max(u_halo, 0.0);

  // --- the unseen lode: a slow arc through the upper dark ------------------
  // One phase-continuous round. phase in [0,1) drives the whole cycle. The
  // round is paced so a full reach->pinch->carry->fall->merge is viewable in
  // ~20s at the default patrol speed; the reach stays slow, the pinch quick.
  float phase = fract(t * pSpeed * 0.165);
  float ang   = phase * 2.0 * PI;
  // arc swings left->right across the top over a round, dipping toward the pool
  // near mid-round when the lode is closest and the grip strongest.
  float lodeX = sin(ang) * 0.74;
  float lodeY = 0.40 - 0.22 * cos(ang);          // dips lowest at mid-round
  vec2  lode  = vec2(lodeX, lodeY);

  // attraction envelope: the lode's grip rises and falls over the round so the
  // reach is achingly slow and possession changes hands smoothly. Peak near
  // mid-phase (lode lowest/closest), waning toward the ends.
  float grip = 0.5 - 0.5 * cos(ang);             // 0..1, smooth, peaks at phase .5
  grip = grip * grip * (3.0 - 2.0 * grip);       // smootherstep-ish
  float attract = grip * pull;

  // --- the resting pool ---------------------------------------------------
  // A broad low pool. Its surface is the iso-contour of a wide, flattened
  // metaball whose top edge sits in the lower third of the frame.
  float poolR = 0.62 * poolW;                     // pool radius scale
  vec2  poolC = vec2(0.0, -0.92);                 // centre below frame bottom
  // squash vertically so the pool reads as a broad shallow body, not a circle
  vec2  pPool = vec2(p.x, (p.y - poolC.y) * 0.66) + vec2(0.0, poolC.y);
  float fieldPool = ball(pPool, poolC, poolR);

  // a faint surface wobble that ripples after each fusion (settling wobble)
  float wob = sin(p.x * 5.0 - t * 1.7) * 0.010 + sin(p.x * 9.0 + t * 1.1) * 0.005;
  // wobble strongest just after re-merge (phase near 0/1)
  float settle = smoothstep(0.0, 0.20, phase) * (1.0 - smoothstep(0.80, 1.0, phase));
  fieldPool += wob * (0.35 + 0.65 * settle);

  // a broad surface tilt: the whole pool heaves gently toward the lode side as
  // the grip strengthens, so the attraction is legible across the body (and the
  // PULL param reads in shape, not just at the thin tongue).
  float heave = attract * 0.16 * exp(-pow(p.x - lodeX * 0.7, 2.0) * 1.1);
  fieldPool += heave;

  // pool surface height directly under the lode (where the tongue roots)
  float rootY = -0.32 + wob * 0.4 + heave * 0.6;
  vec2  root  = vec2(lodeX * 0.62, rootY);

  // --- the teardrop reach: a tongue of the pool pulled toward the lode -----
  // reachT ramps with attraction; the tongue is a CHAIN of metaballs from the
  // pool root up toward the lode so it stays connected and visibly necks. The
  // reach is slow (eased), so the strain builds gradually.
  float reachT  = clamp(attract * 1.05, 0.0, 1.35);
  float reachE  = smoothstep(0.0, 1.0, clamp(reachT, 0.0, 1.0)); // eased reach
  vec2  reachTip = mix(root + vec2(0.0, 0.06), lode + vec2(0.0, -0.22), reachE);
  // A continuous tongue: distance to the line SEGMENT root->reachTip, treated
  // as a capsule metaball (one smooth body, never a string of beads). It thins
  // toward the tip as it stretches, so it visibly necks before pinch-off.
  vec2  seg = reachTip - root;
  float segLen2 = max(dot(seg, seg), 1e-5);
  float hseg = clamp(dot(p - root, seg) / segLen2, 0.0, 1.0); // 0 at root, 1 at tip
  vec2  segPt = root + seg * hseg;                 // nearest point on the tongue spine
  // capsule radius: fat at the root, necking toward the tip as the reach grows
  float tr = mix(0.18, 0.05, reachE * hseg) * poolW;
  float fieldReach = ball(p, segPt, max(tr, 0.001)) * smoothstep(0.015, 0.14, reachT);

  // --- the freed droplet --------------------------------------------------
  // Above a pinch threshold the tip snaps free into a droplet that rides
  // beneath the lode, then falls home. Possession is a smooth blend, never a
  // jump: carryW eases the droplet between "pulled up under the lode" (carry)
  // and "sunk back into the pool" (home).
  // Higher pull pinches off earlier (droplet leaps free), so the threshold
  // lowers with pull.
  float pinchThresh = mix(1.05, 0.62, smoothstep(0.2, 1.8, pull));
  float pinch = smoothstep(pinchThresh, pinchThresh + 0.22, reachT); // droplet existence
  // droplet home (sunk into pool) vs carried (under the lode)
  vec2  dropHome  = vec2(lodeX * 0.45, rootY - 0.10);
  vec2  dropCarry = lode + vec2(0.0, -0.28);
  // carry weight follows grip but lags on the fall so it eases back home
  float carryW = smoothstep(0.22, 0.62, grip);
  vec2  dropC = mix(dropHome, dropCarry, carryW);
  float dropR = mix(0.085, 0.135, pinch) * poolW;
  float fieldDrop = ball(p, dropC, max(dropR, 0.001)) * pinch;

  // --- iso-surface via smooth-min combination -----------------------------
  // The pool + tongue fuse softly (one straining body). The droplet shares the
  // same field, so as it nears the pool the iso-contour necks and fuses again.
  float k = 0.45;  // smin softness — how readily bodies neck/fuse
  // soft union pool & tongue (negate -> smin -> negate = bulging soft max)
  float body = -smin(-fieldPool, -fieldReach, k);
  // soft-union the body with the droplet so approach -> neck -> fuse reads.
  float fused = -smin(-body, -fieldDrop, k);       // soft max -> bulging union
  float field = mix(body + fieldDrop * 0.6, fused, smoothstep(0.0, 0.55, pinch));

  // --- iso-surface shading ------------------------------------------------
  // interior = field above ISO. Compute a soft anti-aliased mask.
  float aa   = 2.0 / uscale;                      // ~2px edge softness
  float surf = smoothstep(ISO - aa * 90.0, ISO + aa * 90.0, field);

  // gradient of the field (for rim highlight + sheen) via central differences.
  // Approximate with the dominant smooth contributors: the squashed pool, the
  // four tongue beads, and the droplet — the same bodies that own the rim.
  float e = 1.5 / uscale;
  vec2  ex = vec2(e, 0.0), ey = vec2(0.0, e);
  vec2 qsP = vec2(0.0, poolC.y);
  // nearest spine points for the x/y offset samples (capsule contribution)
  float hx1 = clamp(dot((p+ex) - root, seg) / segLen2, 0.0, 1.0);
  float hx0 = clamp(dot((p-ex) - root, seg) / segLen2, 0.0, 1.0);
  float hy1 = clamp(dot((p+ey) - root, seg) / segLen2, 0.0, 1.0);
  float hy0 = clamp(dot((p-ey) - root, seg) / segLen2, 0.0, 1.0);
  float reachGate = smoothstep(0.015, 0.14, reachT);
  float fxv =
      (ball(vec2((p+ex).x,((p+ex).y-poolC.y)*0.66)+qsP, poolC, poolR) - ball(vec2((p-ex).x,((p-ex).y-poolC.y)*0.66)+qsP, poolC, poolR))
    + (ball(p+ex, root+seg*hx1, max(mix(0.18,0.05,reachE*hx1)*poolW,0.001)) - ball(p-ex, root+seg*hx0, max(mix(0.18,0.05,reachE*hx0)*poolW,0.001))) * reachGate
    + (ball(p+ex, dropC, max(dropR,0.001)) - ball(p-ex, dropC, max(dropR,0.001))) * pinch;
  float fyv =
      (ball(vec2((p+ey).x,((p+ey).y-poolC.y)*0.66)+qsP, poolC, poolR) - ball(vec2((p-ey).x,((p-ey).y-poolC.y)*0.66)+qsP, poolC, poolR))
    + (ball(p+ey, root+seg*hy1, max(mix(0.18,0.05,reachE*hy1)*poolW,0.001)) - ball(p-ey, root+seg*hy0, max(mix(0.18,0.05,reachE*hy0)*poolW,0.001))) * reachGate
    + (ball(p+ey, dropC, max(dropR,0.001)) - ball(p-ey, dropC, max(dropR,0.001))) * pinch;
  vec2 grad = vec2(fxv, fyv);
  float gl  = length(grad) + 1e-5;
  vec2  nrm = grad / gl;                           // points outward from body

  // rim band: bright where the iso-contour is, i.e. field ~ ISO
  float rimDist = abs(field - ISO);
  float rim = exp(-rimDist * 3.2);                 // thin bright rim
  // a directional lift on the rim — brighter where the surface faces "up-light"
  float facing = 0.5 + 0.5 * dot(nrm, normalize(vec2(0.18, 1.0)));
  rim *= 0.45 + 0.55 * facing;

  // --- palette fallback (house convention) --------------------------------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // rim colour blends c0 -> c1 toward whichever side is nearest the lode, so the
  // attraction is legible in colour before shape. side = which horizontal half.
  float sidePull = clamp(0.5 + 0.5 * (p.x * lodeX) * (0.6 + attract), 0.0, 1.0);
  // also brighten the colour shift where grip is high
  vec3 rimCol = mix(c0, c1, mix(0.5, sidePull, 0.7 + 0.3 * grip));

  // faint cool interior sheen (dark mirror): a soft gradient using c2, dim
  float sheen = surf * (0.10 + 0.10 * facing) * pow(rim, 0.4);
  vec3 interior = BG * (0.7 + 0.6 * surf);         // dark, just lifted inside body
  interior += c2 * sheen * 0.5;                    // cool sheen

  vec3 col = mix(BG, interior, surf);

  // bright rim highlight on top, palette-blended
  col += rimCol * rim * surf * 1.25;
  // also a faint outer rim glow (the liquid catching light) just outside body
  float outerRim = exp(-rimDist * 5.0) * (1.0 - surf);
  col += rimCol * outerRim * 0.35;

  // --- the snap flash: a brief colour-3 burst at the instant of pinch-off ---
  // fires as reachT crosses the (pull-dependent) pinch threshold: quick beat.
  float snap = smoothstep(pinchThresh - 0.10, pinchThresh + 0.02, reachT)
             * (1.0 - smoothstep(pinchThresh + 0.02, pinchThresh + 0.20, reachT));
  // localise the flash at the neck (between the tongue tip and the droplet)
  vec2 neck = mix(reachTip, dropC, 0.5);
  float neckGlow = exp(-dot(p - neck, p - neck) / 0.012);
  col += c3 * snap * neckGlow * 0.9;

  // --- the lode's faint marker halo ---------------------------------------
  // a soft colour-2 point at the lode position; at u_halo=0 it vanishes.
  float ld = length(p - lode);
  float haloGlow = exp(-ld * ld / 0.004) * 1.0    // bright core
                 + exp(-ld * ld / 0.022) * 0.45   // soft inner halo
                 + exp(-ld * ld / 0.10)  * 0.14;  // broad faint corona
  col += c2 * haloGlow * halo * 0.8;

  // --- composition: gentle vignette, keep edges dark ----------------------
  vec2 q = (fc - 0.5 * res) / res;
  float vign = 1.0 - smoothstep(0.42, 0.95, length(q));
  col *= 0.55 + 0.45 * vign;

  // subtle dithering to kill banding in the dark gradients
  float dither = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += dither * (1.0 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
