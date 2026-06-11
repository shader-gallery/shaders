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
uniform float u_surgeSpeed;    // rate of every lane's surge + drain-back  (default 0.6)
uniform float u_spacing;       // perpendicular css-px between lanes        (default 28)
uniform float u_streakLength;  // css-px length of each streak head->tail   (default 140)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float ANGLE    = 0.34;   // shallow lane angle (radians) — etched beach
const float HALF_CSS = 1.4;    // streak half-thickness across its lane (css px)

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
  // lanes. Shallow ANGLE etches the field at a beach-like rake.
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

  // Thin soft-edged capsule across the lane (anti-aliased on both flanks).
  float hw   = HALF_CSS * pr;
  float lane = 1.0 - smoothstep(hw, hw + 1.6 * pr, abs(laneOff));

  // ---- reciprocation: each streak surges up-slope, holds an accent, drains back ----
  // The lane is tiled into segments so streaks populate its WHOLE length, filling
  // the frame; each segment reciprocates on its own hash-staggered phase.
  float len    = max(u_streakLength, 8.0) * pr;
  float travel = len * 1.15;                     // up-slope excursion of the head
  float seg    = len + travel + spacing * 2.0;   // segment pitch up the lane
  float segF   = along / seg;
  float segId  = floor(segF);
  // unique cell key blends lane + segment so neighbours never sync
  float cellK  = laneId * 2.3 + segId * 5.7;

  float ph0   = hash11(cellK);                   // staggered phase per streak
  float speed = max(u_surgeSpeed, 0.05);         // never freeze entirely
  float cyc   = fract(t * speed * (1.0 / 7.0) + ph0); // ~7 s base period at speed 1
  // ease.in/out triangle gives advance + retreat; the cosine eases into a HELD
  // bright accent at the top of the stroke (slow near the turn) before draining.
  float tri   = 0.5 - 0.5 * cos(cyc * 6.2831853); // 0->1->0, slow at both turns
  // smootherstep the rise so the head lingers at the top: reciprocation accent.
  float ride  = tri * tri * (3.0 - 2.0 * tri);

  // Head rides up its segment then drains back; base offset varies per segment.
  float base   = (segId + 0.18 + hash11(cellK + 7.3) * 0.18) * seg;
  float head   = base + ride * travel;

  // distance from this fragment up the lane to the streak HEAD (signed: +tail).
  float d     = head - along;            // >0 : we are below the head (the tail side)
  float along01 = clamp(d / len, 0.0, 1.0); // 0 at head, 1 at faded tail end
  // capsule body: 1 inside [head .. head-len], soft-capped at both ends
  float headCap = 1.0 - smoothstep(0.0, 4.0 * pr, -d);            // soft head end
  float tailCap = 1.0 - smoothstep(len - 6.0 * pr, len, d);       // faded tail end
  float body    = headCap * tailCap;

  // brightness graded along the streak: bright head -> dim tail
  float grade = (1.0 - along01);
  grade = grade * grade;                  // bias light toward the head
  // accent flare: brightest exactly when the lane holds at the top of its surge
  float accent = 0.35 + 0.65 * ride;

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
  col += hue * streak * 1.5 * vign;
  col += hue * bloom * 0.30 * vign;

  gl_FragColor = vec4(col, 1.0);
}
