// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// pinion (Brink) — a Phoenix Julia set: the two-term recurrence
//   z_next = z*z + p + q * z_prev
// iterated ~40 steps carrying both the current and previous iterate (two vec2s,
// no arrays). With p near 0.567, q near -0.5 and the plane turned a quarter turn,
// the set grows the phoenix's signature plumage — ranks of feather-fronds, each
// a spine with self-similar barbs, fanning from a dark central body. Smooth
// escape shading lays glow along the feather edges; the palette is blended by
// escape phase crossed with each pixel's frond orientation, so adjacent feathers
// lean into adjacent hues. Body interior and far field rest at near-black; only
// the feather edges burn. The "writhe": the memory coefficient q rides a slow
// circle so the plumage preens — barbs curl and release, fronds fork and merge,
// the whole fan widens and narrows like a wing deciding whether to open.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_feather;     // radius of q's slow circuit — how wild the fan strays (default 0.05)
uniform float u_writheSpeed; // speed of q's circuit — how fast the plumage preens (default 0.04)
uniform float u_zoom;        // magnification about the body (default 0.95)
uniform float u_glowReach;   // depth of the luminous escape margin before black (default 2.0)

const vec3  BG    = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   ITERS = 40;                        // constant escape-time loop bound
const float ESCAPE = 36.0;                     // escape radius squared

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized plane coords, aspect-corrected, centred on the body
  vec2 uv = (fc - 0.5 * res) / min(res.x, res.y);

  // ZOOM magnifies about the body; guard against zero. The base scale is tuned
  // so the connected phoenix plumage FILLS the frame at default zoom (smaller
  // scale = bigger set), instead of floating as a small island in a black field.
  float zoom = max(u_zoom, 0.1);
  vec2 c = uv * (1.62 / zoom);

  // quarter-turn rotation so the plumage fans across the frame (not up/down),
  // and a small lift so the two phoenix lobes straddle the frame centre rather
  // than leaving a dead vertical channel down the middle.
  c = vec2(-c.y, c.x);
  c.x += 0.18;

  // --- phoenix constants ---
  // p is fixed; q (the memory coefficient) rides a slow circle for the writhe.
  // FEATHER sets the circle radius (0.02 floor keeps a whisper of preening so
  // the fan never freezes from the slider); WRITHE_SPEED sets its angular rate.
  vec2  p     = vec2(0.5667, 0.0);
  float fr    = max(u_feather, 0.02);
  float phase = t * u_writheSpeed;
  vec2  q     = vec2(-0.5, 0.0) + fr * vec2(cos(phase), sin(phase));

  // Phoenix Julia: z carries the iterate, zp the previous iterate.
  // Each pixel's plane coordinate is the seed z0; the constant is p (+ q*zp).
  vec2 z  = c;
  vec2 zp = vec2(0.0);

  float escaped = 0.0;   // 1.0 once it leaves the escape radius
  float smoothN = float(ITERS);
  float trap    = 1e9;   // orbit-trap: closest the orbit comes to the origin

  for (int i = 0; i < 40; i++) {
    // z_next = z*z + p + q * zp   (complex square: (x^2-y^2, 2xy))
    vec2 znew = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y)
              + p
              + vec2(q.x * zp.x - q.y * zp.y, q.x * zp.y + q.y * zp.x);
    zp = z;
    z  = znew;

    float r2 = dot(z, z);
    if (escaped < 0.5) {
      // track how close the (still-bound) orbit passes the origin so the dark
      // body fills with a faint luminous interior instead of a dead-black hole.
      trap = min(trap, r2);
    }
    if (escaped < 0.5 && r2 > ESCAPE) {
      // smooth (continuous) escape count for banding-free gradients
      float nu = float(i) + 1.0 - log2(0.5 * log2(max(r2, 1.0001)));
      smoothN = nu;
      escaped = 1.0;
    }
  }

  vec3 col = BG;

  // Theme colours come from u_palette; fall back to midnight when headless
  // contexts leave the vec3[] uniform zeroed so a poster never renders black.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float reach = max(u_glowReach, 0.1);

  // palette blended by frond orientation (angle about the body) — used by both
  // the escaped feathers and the trapped interior so hues stay continuous.
  float ang  = atan(c.y, c.x) / 6.2831853 + 0.5;   // 0..1 around the body

  if (escaped > 0.5) {
    // escape phase 0..1: HIGH near the boundary (slow, many-iteration escape),
    // LOW in the far field (fast escape). Feathers live at high ph.
    float ph = clamp(smoothN / float(ITERS), 0.0, 1.0);

    // GLOW_REACH controls how deep the luminous margin reaches before falling to
    // black. A gentler curve lets the luminous mass spread further out from the
    // boundary so the plumage reads as filled fronds, not thin filaments.
    float m     = pow(ph, max(2.0 / reach, 0.32));   // luminous margin hugging the boundary
    // crisp inner rim threaded along each frond, anti-aliased
    float rim   = smoothstep(0.42, 0.88, ph) * (1.0 - smoothstep(0.93, 1.0, ph));
    float glow  = m * 1.5 + rim * 0.7;

    // palette blended by escape phase CROSSED with frond orientation, so
    // adjacent feathers lean into adjacent hues — a restrained gradient across
    // the fan, never a stripe pattern.
    float s    = fract(ang + ph * 0.6 + t * 0.01) * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

    col += hue * glow;

    // a soft outer bloom so the fronds catch light against the dark field
    col += hue * pow(ph, max(3.4 / reach, 0.6)) * 0.3;
  } else {
    // TRAPPED interior (the dark body): fill it with a faint luminous wash whose
    // brightness rises where the bound orbit hugged the origin, so the central
    // body glows softly instead of being a dead-black gap — kept low so the
    // body stays a deep glow, not a bright block competing with the fronds.
    float bodyPh = clamp(1.0 - sqrt(trap) * 1.05, 0.0, 1.0);
    float s    = fract(ang + bodyPh * 0.6 + t * 0.01) * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
    col += hue * pow(bodyPh, 2.2) * 0.28;
  }

  // gentle radial vignette keeps the frame composed and edges dark
  float vign = 1.0 - smoothstep(0.55, 1.25, length(uv) * 1.4);
  col *= mix(0.8, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
