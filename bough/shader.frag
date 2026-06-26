// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// bough (Umbra) — shadow theatre on an insomniac wall. The silhouette of a
// potted bough stands inside an unseen lamp's throw: ~14 elliptical leaf SDFs
// hung on two curved stem polylines occupy the left half, drawn purely as
// occlusion of the wall glow. The wall blends c0 (lamp side) → c2 → near-black
// across the frame, with the brightest unoccluded sliver rimmed in c3. Each
// leaf carries a hashed occluder distance setting its smoothstep edge width —
// near leaves bite as crisp blots, far leaves swell into soft grey breaths —
// and where soft shadows overlap their occlusions multiply into deeper dark.
// Penumbral fringes warm toward c1, the lamp's near limb bleeding around each
// leaf. The cluster pivots a few degrees about its stem root while each leaf
// nods on its own hashed phase, so the blur itself animates.
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
uniform float u_swaySpeed;    // pivot + per-leaf nod rate          (default 0.25)
uniform float u_leafSize;     // CSS-px length of leaf ellipses     (default 80)
uniform float u_penumbra;     // scales distance-coded edge blur    (default 1)
uniform float u_poolDepth;    // extra darkening where shadows pool (default 0.65)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   LEAVES    = 14;
const float TWO_PI    = 6.2831853;

// cheap 2D hash → 0..1
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

// signed distance to an ellipse-ish blob (cheap: scaled circle), p in leaf-local
// space already divided by the leaf's semi-axes. Returns distance in "radius"
// units where <0 is inside, ~0 the rim.
float leafSD(vec2 p) {
  return length(p) - 1.0;
}

// rotate a 2D vector
vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: 0..1 across, y up, aspect-corrected for x
  vec2 uv = fc / res;
  float aspect = res.x / res.y;

  // --- palette + fallback (house convention) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- the unseen lamp's wall glow ----
  // Lamp sits off the left edge, a touch above centre. Wall brightness falls
  // with distance from that throw; a soft horizontal+radial gradient.
  vec2 lampPos = vec2(-0.18, 0.62);
  float dl = distance(vec2(uv.x * aspect, uv.y), vec2(lampPos.x * aspect, lampPos.y));
  float throwG = exp(-dl * 1.05);                 // radial falloff from lamp
  float horiz  = 1.0 - smoothstep(-0.05, 1.25, uv.x); // lamp-side bias
  float wall   = clamp(0.32 * throwG + 0.72 * horiz * throwG, 0.0, 1.0);

  // wall colour: c0 (lamp limb) → c2 (mid) → near-black, by wall brightness
  vec3 wallCol = mix(c2 * 0.45, c0, smoothstep(0.25, 0.95, wall));
  wallCol = mix(BG, wallCol, smoothstep(0.02, 0.4, wall));
  // brightest unoccluded sliver rimmed in c3 near the lamp limb
  float rim = smoothstep(0.82, 0.99, wall);
  wallCol = mix(wallCol, mix(wallCol, c3, 0.55), rim);

  vec3 lit = BG + wallCol * (0.12 + 0.95 * wall);

  // ---- the bough: stem root the cluster pivots about ----
  vec2 root = vec2(0.14, -0.06);     // near bottom-left, just below frame edge
  // whole-cluster pivot, a few degrees, slow draft
  float sway = sin(t * u_swaySpeed) * 0.085 + sin(t * u_swaySpeed * 0.47 + 1.3) * 0.04;

  // accumulate occlusion. occ = product of (1 - leaf coverage) so overlapping
  // soft shadows multiply into deeper dark; penumbra = warm fringe accumulation.
  float litMask = 1.0;   // multiplicative light transmission (1=lit, 0=blocked)
  float fringe  = 0.0;   // penumbral warm bleed accumulation
  float softAcc = 0.0;   // how much of the occlusion came from SOFT (far) leaves

  // aspect-corrected sample point in cluster space
  vec2 P = vec2(uv.x * aspect, uv.y);
  vec2 R = vec2(root.x * aspect, root.y);

  for (int i = 0; i < LEAVES; i++) {
    float fi = float(i);
    float h0 = hash11(fi + 1.0);
    float h1 = hash11(fi * 2.0 + 3.0);
    float h2 = hash11(fi * 1.7 + 7.0);
    float h3 = hash11(fi * 2.3 + 11.0);

    // two curved stem polylines: parameter s along the stem, branch chooses side
    float branch = (fi - 2.0 * floor(fi * 0.5)); // 0 or 1, alternating
    // distribute leaves up two stems; each branch gets ~half, spread along s
    float idxOnBranch = floor(fi * 0.5);          // 0..6
    float s = (idxOnBranch + 0.6) / 7.5;          // 0..~1 up the stem
    float side = mix(-1.0, 1.0, branch);
    // base stem curve: rises from the root, splaying outward; the two stems
    // arc apart so leaves fan across the left half of the frame
    float curve = s * s;
    vec2 stem = R + vec2(side * (0.10 + 0.34 * s) + 0.06 * curve,
                         0.08 + 0.92 * s - 0.10 * curve);
    // hashed jitter so leaves stagger off the stem line like real foliage
    stem += vec2((h0 - 0.5) * 0.16 + side * 0.05, (h1 - 0.5) * 0.13);

    // leaf semi-axes in cluster units (leaf length in CSS px → fraction of height)
    float lenU = (u_leafSize * pr / res.y);
    vec2 axes = lenU * vec2(0.26 + 0.12 * h2, 0.70 + 0.34 * h3); // slim leaf ellipse
    axes = max(axes, vec2(1e-3));

    // per-leaf nod: own slower hashed phase, plus the global pivot about root
    float nodPhase = h0 * TWO_PI;
    float nod = sin(t * u_swaySpeed * (0.55 + 0.5 * h1) + nodPhase) * 0.26;
    // leaves splay outward: long axis points away from the stem root, so the
    // ellipse reads as a leaf hanging off its petiole, plus hashed scatter
    vec2 outward = stem - R;
    float baseAng = atan(outward.x, outward.y); // 0 = pointing +y (up)
    float leafAng = baseAng + sway + nod + (h2 - 0.5) * 1.0;

    // position of this fragment relative to the leaf, then de-rotate the pivot
    // so the leaf swings about the stem root (projective swing)
    vec2 q = rot(P - R, -sway) + R - stem;  // undo cluster pivot, centre on leaf
    q = rot(q, -leafAng);
    vec2 e = q / axes;
    float sd = leafSD(e);                    // <0 inside leaf, in radius units

    // hashed occluder→source distance sets the penumbra edge width. Near leaves
    // (small dist) have crisp edges; far leaves swell soft. PENUMBRA scales it.
    float occDist = 0.15 + 0.85 * h3;        // 0.15..1.0 implied distance
    float edge = (0.02 + occDist * 0.55 * u_penumbra) ;
    edge = max(edge, 0.012);

    // coverage 0..1: 1 deep inside, 0 well outside, smooth penumbra in between
    float cover = 1.0 - smoothstep(-edge, edge, sd);

    // warm penumbral fringe: a ring just outside the hard core where the lamp's
    // limb bleeds around the leaf
    float rn = sd / max(edge, 1e-3);
    float ring = exp(-rn * rn) * smoothstep(-edge, 0.0, sd);
    fringe += ring * (0.5 + 0.5 * h2);

    // pooling tracker: a broad soft halo around each leaf (wider than the hard
    // edge, weighted by softness) so far/soft leaves cast a large grey breath.
    // These halos sum across leaves, so wherever the bough is dense or two
    // breaths cross, softAcc climbs and POOL_DEPTH deepens the dark there.
    float halo = exp(-max(sd, 0.0) / max(edge * 1.6, 0.04));
    float softness = 0.3 + 0.7 * smoothstep(0.2, 1.0, occDist);
    softAcc += halo * softness;

    // multiplicative occlusion (so overlaps pool into deeper dark)
    litMask *= (1.0 - cover * 0.96);
  }

  // pooling: deepen the soft-shadow regions by POOL_DEPTH, ramping up where
  // soft coverage accumulates from multiple overlapping/crossing leaves so the
  // grey breaths multiply into deeper dark exactly where the bough is densest.
  float pool = smoothstep(0.2, 1.5, softAcc);
  litMask *= clamp(1.0 - u_poolDepth * 0.8 * pool, 0.0, 1.0);

  // apply occlusion to the wall: blocked light → near-black, but carry the
  // shadow tint slightly cooler so silhouettes read as shadow not hole
  vec3 shadowed = lit * litMask;
  shadowed = mix(shadowed, shadowed * vec3(0.85, 0.88, 1.0), (1.0 - litMask) * 0.5);

  // warm penumbral fringe bleeds c1 around the leaves, only where there's light
  fringe = clamp(fringe, 0.0, 1.5);
  shadowed += c1 * fringe * 0.10 * wall * litMask;

  // gentle filmic-ish tonemap + vignette to keep premium dark feel
  vec3 col = shadowed;
  vec2 vc = (fc / res - 0.5);
  vc.x *= aspect;
  float vign = 1.0 - smoothstep(0.45, 1.15, length(vc));
  col *= mix(0.7, 1.0, vign);

  // subtle dithering to kill banding in the soft gradients
  float dither = (hash11(dot(fc, vec2(0.137, 0.631)) + t) - 0.5) / 255.0;
  col += dither;

  col = max(col, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
