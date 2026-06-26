// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// flit (Umbra) — shadow theatre on an insomniac wall. An unseen moth circles an
// unseen lamp; the wall records only its shadow — one small winged silhouette
// (two eased triangle/ellipse wing SDFs about a slim body capsule) whose
// projected size AND penumbra blur swing enormously with its orbit. Close to the
// bulb it balloons into a soft frame-filling grey breath; near the wall it
// shrinks to a sharp thumb-sized cutout. Scale and softness covary — the whole
// physics lesson. The wall carries the lamp's round throw: a broad radial
// gradient from c0 at the core through c1 in the falloff to near-black, with a
// c2-tinted bright ring where the throw meets the wall. The penumbra fringe
// glows faintly c3 — the bulb's warm limb bleeding around the occluder.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_orbitSpeed;  // moth's circuit speed around the bulb (default 0.2)
uniform float u_flapRate;    // wingbeats per second, eased to flutter (default 0.9)
uniform float u_depthRange;  // how close the orbit dives toward the bulb (default 0.8)
uniform float u_glowReach;   // lamp throw radius relative to frame (default 0.8)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black wall base ~#09090B

// signed distance to a capsule (line segment a->b with radius r) — the body
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// signed distance to a wing lobe: a tapered ellipse — an eased triangle/ellipse
// blend. Rooted at the origin, extending along +x to a softened tip; the y-half
// width tapers from full (at the root) toward a point (at the tip), so the lobe
// reads as a winged triangle with rounded trailing edge, not a plain oval.
float sdWing(vec2 p, float reach, float width) {
  // a tapered teardrop: ellipse along +x whose half-width eases from `width` at
  // the root (x=0) to a point at the tip (x=reach). Build it as a parametric
  // boundary distance so the field is bounded everywhere (no infinite bands).
  float xn = p.x / max(reach, 1e-4);            // 0 at root, 1 at tip
  // outside the [0,1] span the lobe is closed off — measure to the nearer cap
  float xc = clamp(xn, 0.0, 1.0);
  float prof = width * sqrt(max(1.0 - xc * xc, 0.0)) * (1.0 - 0.18 * xc); // half-width here
  // distance: combine the lateral overshoot and the longitudinal cap overshoot
  float dy = abs(p.y) - prof;                   // >0 = outside laterally
  float dx = max(-p.x, p.x - reach);            // >0 = beyond root/tip caps
  vec2  d  = vec2(max(dx, 0.0), max(dy, 0.0));
  float outside = length(d);
  float inside  = min(max(dx, dy), 0.0);
  return outside + inside;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized, aspect-correct coords centred on the frame: y in [-0.5,0.5]
  vec2 uv = (fc - 0.5 * res) / max(res.y, 1.0);

  // --- palette fallback (headless contexts can leave the array zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---------------------------------------------------------------------------
  // The lamp's round throw on the wall. The bulb projects from slightly above
  // centre; the throw is a broad radial gradient. reach scales the falloff.
  // ---------------------------------------------------------------------------
  vec2  lampCtr = vec2(0.0, 0.04);
  float reach   = max(u_glowReach, 0.05);
  float rr      = length(uv - lampCtr) / reach;

  // core -> falloff -> near-black. Two smooth bands of throw.
  float core  = exp(-rr * rr * 2.3);            // hot core (c0)
  float falloff = exp(-rr * 1.35);              // broad warm body (c1)
  // the bright ring where the throw meets the wall (c2-tinted limb)
  float ring  = exp(-pow(rr - 0.92, 2.0) * 9.0) * 0.6;

  vec3 wall = BG;
  wall += c0 * core    * 0.26;
  wall += c1 * falloff * 0.13;
  wall += c2 * ring    * 0.34;

  // ---------------------------------------------------------------------------
  // The unseen moth orbits the unseen lamp on a Lissajous-weighted path biased
  // toward the bulb. "depth" d in [0,1]: 0 = right at the bulb (huge, soft
  // shadow), 1 = near the wall (tiny, sharp cutout). The orbit dives toward the
  // bulb; u_depthRange controls how deep the near pass goes.
  // ---------------------------------------------------------------------------
  float ph = t * u_orbitSpeed;
  // Lissajous position of the moth in the lamp's plane (its lateral wander),
  // which projects onto the wall. Continuous, non-repeating-feeling.
  vec2 orbit = vec2(sin(ph * 6.2831853) * 0.9 + sin(ph * 2.3) * 0.18,
                    sin(ph * 6.2831853 * 0.5 + 1.7) * 0.55 + sin(ph * 1.7) * 0.12);

  // depth oscillation: a slow swing between near-bulb and near-wall, biased so
  // it lingers more in the deep-soft register (the family's extreme demo).
  float dwell = 0.5 + 0.5 * sin(ph * 6.2831853 * 0.37 + 0.6);
  dwell = pow(dwell, 1.4); // bias toward smaller d (closer to bulb) longer
  float dmin = mix(0.95, 0.18, clamp(u_depthRange, 0.0, 1.0)); // deepest dive
  float d    = mix(dmin, 0.95, dwell); // 0~near bulb, ~1 near wall

  // Projection: a shadow from an occluder between point-source and wall is
  // magnified by 1/d (similar triangles). Near the bulb (small d) -> huge.
  // The shadow CENTRE on the wall is the orbit position scaled by projection.
  float mag      = 0.42 / max(d, 0.12);           // overall shadow scale
  vec2  shadowC  = lampCtr + orbit * (1.0 - d) * 0.6; // projected centre on wall

  // Penumbra half-width: edge softness ∝ (source size) * (occluder-to-source /
  // occluder-to-wall). Closer to the bulb (small d) => much softer. This is the
  // covariance with scale — same d drives both.
  float penumbra = mix(0.004, 0.16, pow(1.0 - d, 1.5)) + 0.003;

  // --- build the moth silhouette in its own local frame ---
  // gentle bank/heading: the moth tilts as it banks through the orbit
  float bank = 0.35 * sin(ph * 6.2831853 + 1.0);
  float cb = cos(bank), sb = sin(bank);
  vec2  q  = (uv - shadowC);
  q = mat2(cb, -sb, sb, cb) * q;
  q /= mag; // into unit moth space

  // wingbeat: eased sinusoid, slow flutter. Wings fold (foreshorten) as they
  // beat — modeled as a horizontal squash of each wing's reach.
  float beat = sin(t * u_flapRate * 6.2831853);
  float ease = sign(beat) * pow(abs(beat), 0.6); // ease the extremes -> flutter
  float wingExt = mix(0.62, 1.0, 0.5 + 0.5 * ease); // wing span fraction

  // body: a slim vertical capsule (head up, abdomen down)
  float body = sdCapsule(q, vec2(0.0, 0.24), vec2(0.0, -0.34), 0.05);

  // two wings, mirrored about x, rooted at the thorax and fanning out to the
  // sides, swept slightly back (tips angle down-and-out). The wingbeat folds
  // them (wingExt squashes the span). Right wing extends along +x; left mirrors.
  vec2  wroot  = vec2(0.0, 0.10);
  float wReach = 0.52 * wingExt;   // span out to the side
  float wWidth = 0.40;             // chord (vertical depth of the wing)
  // sweep: rotate the wing's +x span toward -y so the tip points down-and-out
  float sw = 0.40; float cs = cos(sw), ss = sin(sw);
  mat2 sweepR = mat2(cs, -ss, ss, cs);
  // right wing
  vec2 wr = sweepR * (q - wroot);
  float wingR = sdWing(wr, wReach, wWidth);
  // left wing (mirror the field x)
  vec2 ql = vec2(-q.x, q.y);
  vec2 wl = sweepR * (ql - wroot);
  float wingL = sdWing(wl, wReach, wWidth);

  // union of body + both wings (min of SDFs), smoothed a touch
  float moth = min(body, min(wingR, wingL));

  // The shadow OCCLUDES the wall's light. occ = 1 fully inside the silhouette,
  // 0 outside, with a penumbra-wide soft edge. Distances are in unit-moth space,
  // so convert the penumbra (wall units) by dividing by mag.
  float pw  = max(penumbra / max(mag, 1e-4), 0.0015);
  float occ = 1.0 - smoothstep(-pw, pw, moth);

  // The deep-soft pass should never go fully black — it's a grey breath. Cap the
  // occlusion strength so far shadows are dense, near-bulb ones are gauzy.
  float dens = mix(0.55, 0.97, clamp(d, 0.0, 1.0));
  occ *= dens;

  // apply occlusion: remove the wall's light where the shadow falls
  vec3 col = wall * (1.0 - occ);

  // ---------------------------------------------------------------------------
  // Penumbra fringe: the bulb's warm limb (c3) bleeds faintly around the
  // occluder edge — a thin glowing rim riding the shadow boundary.
  // ---------------------------------------------------------------------------
  float edge = exp(-pow(moth / max(pw * 1.6, 1e-4), 2.0));
  // only where there's light to bleed (scaled by local throw) and on the lit side
  float lit  = core * 0.6 + falloff * 0.9 + 0.05;
  col += c3 * edge * lit * 0.5 * (0.4 + 0.6 * (1.0 - dens));

  // gentle film grain-free vignette to seat the throw in dark corners
  float vign = 1.0 - smoothstep(0.55, 1.15, length(uv * vec2(res.x/max(res.y,1.0), 1.0)) );
  col *= mix(0.82, 1.0, vign);

  // subtle dithering to kill banding in the broad gradient
  float dither = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += dither * (1.5 / 255.0);

  col = max(col, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
