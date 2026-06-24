// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// plume (Gyre) — a single thin column of dye rises from bottom-center: an
// FBM-textured ridge around a curved centerline, glowing warmest at its dense
// base and cooling as it climbs, widens, and dissipates into the near-black
// upper frame. A height-increasing cross-current shears the column into a smooth
// bow, shedding faint wisps off its downstream edge. Everything outside the
// plume stays deep dark with only the gentlest ambient gradient.
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
uniform float u_riseSpeed;  // upward scroll rate of the dye        (default 0.45)
uniform float u_shear;      // strength of the height-rising current (default 0.8)
uniform float u_width;      // base column width, css px            (default 70)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float SWAY_AMP_CSS = 90.0;   // sideways amplitude of the meandering current
const float WISP_AMP_CSS = 60.0;   // how far wisps detach downstream

// hash + value-noise (no textures); smooth, tileable enough for advected fbm
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return v;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// a dim background plume (offset lane) for the multi-plume field + depth fill
float bgPlumeMass(vec2 uv, float laneX, float wMul, float rise, float shear, float phase) {
  float yy = clamp(uv.y, 0.0, 1.4);
  float meander = sin(uv.y * 2.3 + phase) * 0.7 + sin(uv.y * 4.1 + phase * 1.7) * 0.3;
  float center = laneX + 0.12 * meander * (0.15 + yy * 0.85) + shear * 0.20 * yy * yy;
  float dx = uv.x - center;
  float width = max(0.060 * wMul * (0.55 + yy * 1.6), 1e-3);
  vec2  q = vec2(dx * 6.5, uv.y * 5.2 - rise);
  float dye = fbm(q * 0.9 + vec2(phase, rise * 0.4));
  float ridge = 0.28 + 1.05 * dye; ridge *= ridge;
  float r = abs(dx) / width;
  float core = (1.0 - smoothstep(0.0, 1.0, r)) * ridge;
  float foot = smoothstep(0.0, 0.06, uv.y);
  float dissip = 1.0 - smoothstep(0.30, 1.25, uv.y);
  return core * foot * dissip;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalize so y in 0..1 bottom->top, x centered at 0, isotropic by height
  float h    = res.y;
  vec2  uv   = (fc - vec2(res.x * 0.5, 0.0)) / h; // uv.y: 0 at bottom, ~1 at top
  float yy   = clamp(uv.y, 0.0, 1.4);

  vec3 col = BG;

  // gentlest ambient vertical gradient: a touch of warmth pooled low, fading up
  col += BG * 0.6 * (1.0 - smoothstep(0.0, 0.7, uv.y));

  // --- shared slow current: a meandering cross-flow that strengthens with height
  float shear = u_shear;
  // sway phase drifts continuously (no reset); two octaves so it meanders
  float meander = sin(t * 0.35 + yy * 2.3) * 0.7 + sin(t * 0.21 + yy * 4.1) * 0.3;
  // centerline x offset: shear pushes the column into a smooth bow that grows
  // with height. yy*yy gives the curved bow (straight at base, hard at top).
  // coefficient tuned so the default (0.8) bows gracefully in-frame and the
  // max (2.0) bends hard toward the edge.
  float center = (SWAY_AMP_CSS * pr / h) * meander * (0.15 + yy * 0.85)
               + shear * 0.26 * yy * yy;

  // horizontal distance from the (curved, swaying) centerline
  float dx = uv.x - center;

  // column widens with height: pencil at base -> soft pillar near top
  float baseW = (u_width * pr / h);
  float width = baseW * (0.55 + yy * 1.6);
  width = max(width, 1e-3);

  // --- dye texture: fbm advected upward (scrolls) and locally churning ---
  // domain warp so the media folds into itself (Gyre churn) while rising.
  // sample in a coordinate that follows the curved centerline so the marbling
  // rides with the bow instead of smearing across it.
  float rise = t * u_riseSpeed;
  vec2  q = vec2(dx * 6.5, uv.y * 5.2 - rise);
  vec2  warp = vec2(fbm(q * 0.7 + vec2(0.0, rise * 0.5)),
                    fbm(q * 0.7 + vec2(5.2, -rise * 0.4)));
  float dye = fbm(q + (warp - 0.5) * 2.2);
  // ridge: sharpen into filaments (marbled ink), keep interior textured
  float ridge = 0.28 + 1.05 * dye;
  ridge *= ridge;

  // radial column profile: dense bright core, soft smoothstep-AA edges
  float r = abs(dx) / width;
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  // the fbm perturbs the silhouette so the edge is feathered, not a clean tube
  core *= ridge;

  // density falls off toward the top as the plume dissipates; base is dense.
  // rises from the very bottom (small lead-in so the foot isn't clipped).
  float foot   = smoothstep(0.0, 0.06, uv.y);
  float dissip = 1.0 - smoothstep(0.35, 1.25, uv.y);
  float density = core * foot * dissip;

  // --- faint wisps shed off the downstream edge, ~8s lifetimes, fading fully
  // before their noise phase moves on (so no visible reset) ---
  float downstream = sign(shear + 1e-4); // bow leans toward +x as shear grows
  float wispLife = fract(t / 8.0 + yy * 0.5);      // 0..1 over 8s
  float wispFade = sin(wispLife * 3.14159265);     // 0 at birth/death, 1 mid
  float wispX = center + downstream * (WISP_AMP_CSS * pr / h)
              * (0.3 + yy) * (0.4 + 0.6 * wispLife);
  float wd = (uv.x - wispX) / max(width * 0.9, 1e-3);
  float wispNoise = fbm(vec2(uv.x * 4.0 - downstream * wispLife * 3.0,
                             uv.y * 3.0 - rise * 0.7 + wispLife * 2.0));
  float wisp = (1.0 - smoothstep(0.0, 1.3, abs(wd)))
             * wispFade * smoothstep(0.25, 0.8, uv.y) * dissip
             * (0.3 + 0.7 * wispNoise);

  // --- temperature story: warmest palette colour at dense base, cooling up ---
  // palette wheel param mapped to height (base = warmest c0, tip = coolest)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // warmest first: c3 (warm/red) at base -> c0 (cool/blue) at tip; weighted
  // blend over the 0..4 wheel, no dynamic array indexing.
  float s = clamp(yy, 0.0, 1.0) * 3.0;           // 0 at base -> 3 near tip
  float wA = wheelW(s, 0.0); // base    (warmest)
  float wB = wheelW(s, 1.0);
  float wC = wheelW(s, 2.0);
  float wD = wheelW(s, 3.0); // tip     (coolest)
  vec3 dyeCol = (c3 * wA + c2 * wB + c1 * wC + c0 * wD)
              / max(wA + wB + wC + wD, 0.001);
  vec3 wispCol = mix(c1, c0, smoothstep(0.4, 1.0, yy));

  // base hot-spot: extra warm glow pooled at the dense foot
  float hotspot = exp(-r * r * 2.2) * (1.0 - smoothstep(0.0, 0.4, uv.y)) * foot;

  // composite — glow added on top of the dark base
  col += dyeCol * density * 1.5;
  col += c3 * hotspot * 0.9;
  col += wispCol * wisp * 0.4;

  // soft inner bloom along the dense core so the base reads luminous (kept
  // subtle so it underlights the marbling rather than washing it flat)
  float bloom = exp(-r * r * 1.6) * core * foot * dissip;
  col += dyeCol * bloom * 0.22;

  // background plumes: two dimmer offset columns so the frame reads as a field of
  // rising dye with depth (in-shader fill replacing the backdrop), not one lone column.
  float bg0 = bgPlumeMass(uv, -0.27, 0.85, rise * 0.85 + 3.0, shear * 0.7, 1.3);
  float bg1 = bgPlumeMass(uv,  0.31, 0.70, rise * 1.15 + 7.0, shear * 0.6, 4.1);
  col += mix(dyeCol, c0, 0.30) * bg0 * 0.52;
  col += mix(dyeCol, c1, 0.30) * bg1 * 0.44;

  // gentle horizontal vignette so the frame edges stay deep dark
  float vign = 1.0 - smoothstep(0.52, 0.78, abs(uv.x));
  col *= mix(0.7, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
