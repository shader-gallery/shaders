// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// swash (Wake) — dozens of thin diagonal streaks of light lie in parallel lanes
// across the frame, like a beach etched at a shallow angle. Each streak is a
// soft-edged capsule of glow, palette-graded from a bright head to a dim tail,
// that surges up-slope and drains back along its own lane on a hash-staggered
// ~7 s reciprocation — easing into a held bright accent at the top of the
// stroke before retreating. Graphic etched strokes on near-black, anchored by a
// faint static slope-gradient. Reciprocation: it always returns, accenting at
// the moment of turning.
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
uniform float u_flowSpeed;     // rate the streaks flow along their lanes    (default 0.6)
uniform float u_spacing;       // perpendicular css-px between lanes        (default 18)
uniform float u_streakLength;  // css-px length of each streak head->tail   (default 200)
uniform float u_thickness;     // streak half-thickness across its lane, css px (default 2.4)
uniform float u_angle;         // lane angle in degrees                      (default 20)
uniform float u_density;       // along-lane dash frequency, 1 = baseline    (default 1.0)
uniform float u_randomize;     // per-lane/dash variation amount, 0..1        (default 1.0)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// hash a lane index to a pseudo-random 0..1 (stable per integer lane)
float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // Rotated frame: 'along' runs up the slope (lane axis), 'across' steps between
  // lanes. The lane angle is a control (degrees), etching the field at a rake.
  float ANGLE = radians(u_angle);
  float ca = cos(ANGLE), sa = sin(ANGLE);
  vec2  p  = fc - ctr;
  float along  = p.x * ca + p.y * sa;   // distance up the lane direction
  float across = -p.x * sa + p.y * ca;  // perpendicular offset between lanes

  // Lane geometry. Guard spacing against 0 so min-slider never divides by zero.
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 1.0) * refScale * pr;
  float laneF   = across / spacing;     // continuous lane coordinate
  float laneId  = floor(laneF + 0.5);   // nearest lane index
  float laneOff = (laneF - laneId) * spacing; // perpendicular dist to lane centre

  // Soft-edged capsule across the lane (anti-aliased on both flanks); thickness
  // is now a param so the streaks can read as bold crisp strokes.
  float hw   = max(u_thickness, 0.5) * pr;
  float lane = 1.0 - smoothstep(hw, hw + 1.6 * pr, abs(laneOff));

  // ---- continuous flow: dashes scroll along each lane, off one edge while new
  // ones enter the other — a travelling current, not a back-and-forth surge. ----
  float len    = max(u_streakLength, 8.0) * pr;
  // dash + gap pitch up the lane; u_density scales the inter-dash gap so a lane
  // packs more (or fewer) dashes along its length without resizing the dashes.
  float gap    = (spacing * 1.4 + len * 0.7) / max(u_density, 0.05);
  float seg    = len + gap;
  float speed  = max(u_flowSpeed, 0.0);
  // u_randomize scales every per-lane / per-dash deviation from a clean, uniform
  // field: 0 = mechanically regular identical lanes, 1 = the full lively scatter.
  float rnd     = clamp(u_randomize, 0.0, 1.0);
  // per-lane flow speed variation so lanes don't move in lockstep (mean 1.0)
  float laneSpd = speed * (1.0 + rnd * (0.9 * hash11(laneId * 1.7 + 3.0) - 0.45));
  // per-lane constant phase so lanes are already staggered at t=0 — the streaks
  // read as uneven from the first frame instead of starting aligned and only
  // drifting apart over time. Scaled by rnd so randomize=0 stays a regular grid.
  float lanePhase = rnd * hash11(laneId * 4.7 + 9.0) * seg;
  // continuous scroll up the lane (features travel +along and exit the top edge)
  float scroll = t * laneSpd * 70.0 * pr + lanePhase;
  float alongS = along - scroll;
  float segF   = alongS / seg;
  float segId  = floor(segF);
  float cellK  = laneId * 2.3 + segId * 5.7;

  // each dash sits fixed within its scrolling segment, with a per-dash length
  float dashLen = len * (1.0 + rnd * (0.6 * hash11(cellK + 11.0) - 0.3));
  float base    = (segId + 0.15 + 0.25 + rnd * (hash11(cellK + 7.3) * 0.5 - 0.25)) * seg;
  float d       = base - alongS;          // >0 : tail side of this dash
  float along01 = clamp(d / dashLen, 0.0, 1.0);
  float headCap = 1.0 - smoothstep(0.0, 4.0 * pr, -d);
  float tailCap = 1.0 - smoothstep(dashLen - 6.0 * pr, dashLen, d);
  float body    = headCap * tailCap;
  // toward the top of the density range the residual inter-dash gaps close into
  // a single continuous flowing ribbon — at max the lane fills completely (the
  // grade + colour sweep below still run along it, so it reads as flow, not a bar).
  float fillBoost = smoothstep(1.6, 3.0, u_density);
  body = mix(body, 1.0, fillBoost);

  // brightness graded along the streak: bright head -> dim tail, floored so the
  // whole dash reads; per-dash variation + a gentle twinkle keep the flow lively.
  float grade = (1.0 - along01);
  grade = grade * grade;
  grade = 0.32 + 0.68 * grade;
  float accent = (0.81 + rnd * (0.38 * hash11(cellK + 2.1) - 0.19)) * (0.85 + 0.15 * sin(t * 2.0 + cellK));

  float streak = lane * body * grade * accent;

  // ---- colour graded along the streak (head hue -> tail hue), per-lane offset ----
  // walk the palette wheel along the stroke; lane hash offsets the entry point so
  // neighbouring lanes differ. No dynamic array indexing (cyclic weights).
  float s  = fract(hash11(laneId + 2.1) + along01 * 0.6 + t * 0.01) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // soft cross-lane bloom so heads catch light beyond their hairline
  float bloom = exp(-abs(laneOff) / (hw * 4.0)) * body * grade * accent;

  // faint static slope-gradient anchoring the field (brighter low, darker high)
  float slope = 0.5 - 0.5 * (along / (res.y * 0.9));
  slope = clamp(slope, 0.0, 1.0);
  vec3  floorTint = hue * 0.018 * slope;

  // gentle vignette to compose the framing
  float vign = 1.0 - smoothstep(0.55, 1.25, length(p / res));

  col += floorTint * vign;
  col += hue * streak * 2.4 * vign;
  col += hue * bloom * 0.5 * vign;

  gl_FragColor = vec4(col, 1.0);
}
