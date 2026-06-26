// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// threshold (Umbra) — an unlit room read entirely in negative. Almost the whole
// frame is the family's deepest dark; the only light is one thin blazing strip
// along the bottom edge: the gap under a door. The strip's core melts c3 into
// c0, its spill feathers up the floor through c1 — widening and softening with
// distance in honest penumbra fashion — and a single vertical hairline of c2
// climbs the latch-side door edge. At long, hash-scheduled intervals a form
// passes in the lit hallway: two soft occlusion lobes (footsteps) glide along
// the strip, dimming and splitting the spill, their penumbra stretched ahead of
// their motion. Between passes the strip breathes almost imperceptibly, an old
// hallway bulb. Motion is read only as blocked light.
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
uniform float u_gapHeight;   // css-px thickness of the lit gap under the door (default 7)
uniform float u_spillReach;  // how far light feathers up, as fraction of frame height (default 0.45)
uniform float u_passRate;    // how often a form crosses the hallway (default 0.3)
uniform float u_flicker;     // depth of the strip's slow brightness breathing (default 0.12)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// cheap deterministic hash, 1D -> 1D in 0..1
float hash11(float n) {
  return fract(sin(n * 91.3458) * 47453.5453);
}

// eased 0..1 (smootherstep) — gentle entrances/exits, never popping
float ease(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalised coords: x 0..1 across, y 0 at the bottom edge (the gap) -> 1 top
  vec2 uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);

  vec3 col = BG;

  // --- palette with midnight fallback (headless contexts can zero the array) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // --- the lit gap geometry, in fraction-of-height ---
  // gap thickness (css px -> device px -> fraction of frame height)
  float gapH = (u_gapHeight * pr) / max(res.y, 1.0);
  // spill reaches this far up the floor; guard against 0
  float reach = max(u_spillReach, 0.02);

  // height above the gap, 0 at the floor/gap line
  float y = uv.y;

  // --- slow flicker: old hallway bulb breathing, eased, never a strobe ---
  // two slow sines beat together so the breath never reads periodic
  float br = 0.5 + 0.5 * sin(t * 0.55) * sin(t * 0.21 + 1.3);
  float flick = 1.0 - u_flicker * (0.5 + 0.5 * ease(br)); // dips, never brightens past 1

  // --- passing forms on a continuous hashed timeline ---
  // One unbroken phase: a "slot" advances at passRate; each slot may or may not
  // host a pass (hash gate), so quiet stretches and crossings share one clock.
  float slotDur = mix(26.0, 3.2, clamp(u_passRate, 0.0, 1.0)); // seconds per slot
  float phase   = t / slotDur;
  float slot    = floor(phase);
  float fslot   = fract(phase);

  // occlusion from the current slot and the previous one (so a pass can finish
  // gliding off-frame while the next begins) — fixed, unrolled, no dynamic loops
  float occ = 0.0;     // 0 = unblocked, 1 = fully blocked
  float occLead = 0.0; // penumbra smear leading the motion (for spill stretch)

  // walk direction & body for two adjacent slots
  for (int i = 0; i < 2; i++) {
    float s   = slot - float(i);
    float p   = fslot + float(i); // 0..1 within slot i==0, 1..2 for the older
    float gate = hash11(s * 1.7 + 3.1);
    // only some slots host a pass — rarer when passRate is low (longer quiets)
    float present = step(0.42, gate);
    // direction: left->right or right->left
    float dir = (hash11(s * 2.3 + 0.7) < 0.5) ? -1.0 : 1.0;
    // walk progress 0..1 across the frame (eased so it blurs up from the edge
    // and melts at the far edge, never popping in/out)
    float wp = ease(p);                 // p>1 clamps to 1 in ease -> parked off-frame
    float startX = (dir > 0.0) ? -0.25 : 1.25;
    float cx = mix(startX, startX + dir * 1.5, wp); // centre of the form along x
    // two footstep lobes, offset along the walk direction (a stride)
    float stride = 0.10;
    float speedF = abs(cos((p) * 3.14159)); // fastest mid-stride -> longer penumbra
    for (int j = 0; j < 2; j++) {
      float lx = cx + dir * stride * (float(j) - 0.5);
      // lobe footprint width grows with speed (penumbra stretches ahead of motion)
      float w = 0.07 + 0.05 * speedF;
      float dxl = (uv.x - lx) * aspect;
      // penumbra: stretch the leading edge in the direction of travel
      float lead = dxl * dir; // positive = ahead of the lobe
      float stretch = 1.0 + 0.9 * smoothstep(0.0, w, lead) * speedF;
      float dd = dxl / (w * stretch);
      float lobe = exp(-dd * dd) * present;
      occ = max(occ, lobe);
      occLead = max(occLead, lobe * smoothstep(-w, w, lead));
    }
  }
  // forms only block the LOW part of the spill (feet near the floor); higher
  // spill is barely touched, so the dimming reads as floor-level occlusion
  float occHeightFalloff = 1.0 - smoothstep(0.0, reach * 0.6, y);
  float block = occ * occHeightFalloff;

  // --- the lit strip + feathered spill (penumbra widens with distance up) ---
  // core: the searing gap itself, near the very bottom
  float core = 1.0 - smoothstep(0.0, gapH, y);
  // spill: feathers up the floor; the soft boundary itself billows slowly along
  // the strip, and softens (penumbra grows) the higher it climbs
  float billow = 0.018 * sin(uv.x * 9.0 + t * 0.5) * sin(uv.x * 3.3 - t * 0.27);
  float localReach = reach * (1.0 + billow * 6.0);
  // distance-softened falloff: sharper near the gap, melting higher up
  float spill = 1.0 - smoothstep(gapH, localReach, y);
  spill = pow(spill, 1.6); // honest penumbra: bright near gap, long soft tail

  // --- vertical hairline of c2 up the latch-side door edge (right side) ---
  // climbs from the gap; thin, faint, fades with height
  float edgeX = 0.93;
  float hairW = (1.4 * pr) / max(res.x, 1.0); // ~1.4 css px wide
  float hair = (1.0 - smoothstep(0.0, hairW * 2.5, abs(uv.x - edgeX)));
  hair *= smoothstep(0.0, gapH * 1.5, y);            // starts at the floor
  hair *= (1.0 - smoothstep(gapH, reach * 0.85, y)); // fades up
  hair *= flick;
  // the hairline also dims when a form blocks the gap near it
  hair *= (1.0 - 0.7 * occ);

  // --- compose colour ---
  // strip core blends c3 (warm filament) into c0 deeper in the room
  // height 0 -> c3 core, climbing -> c1 spill, with c0 mixed into the deepest dark
  float h = clamp(y / max(localReach, 0.001), 0.0, 1.0);
  vec3 spillCol = mix(c3, c1, smoothstep(0.0, 0.5, h));   // core c3 -> mid c1
  spillCol = mix(spillCol, c0, smoothstep(0.4, 1.0, h));  // tail melts toward c0
  // the very core is hottest — push c3 toward white-hot a touch
  vec3 coreCol = mix(c3, mix(c3, vec3(1.0), 0.35), core);

  vec3 light = coreCol * core * 1.15 * flick * (1.0 - 0.6 * block)
             + spillCol * spill * 0.9 * flick * (1.0 - 0.92 * block);

  // hairline of c2
  light += c2 * hair * 0.5;

  // faint warm bloom from the gap into the lowest dark, so the strip glows
  float bloom = exp(-y / max(reach * 0.5, 0.001)) * (1.0 - 0.85 * block);
  light += mix(c3, c1, 0.5) * bloom * 0.10 * flick;

  col += light;

  // gentle horizontal vignette: corners of the room stay deepest dark
  float vign = 1.0 - 0.35 * smoothstep(0.3, 0.5, abs(uv.x - 0.5));
  col *= vign;

  // subtle filmic-ish soft clamp to avoid blown highlights at the core
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
