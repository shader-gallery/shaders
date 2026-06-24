// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// snare (Brink) — an orbit-trap Julia set. The same 40-step z -> z*z + c
// iteration, but instead of escape bands the shader records the minimum distance
// each orbit ever comes to a thin cross (two perpendicular segments through the
// origin of the dynamical plane). Brightness is a reciprocal falloff on that
// trapped distance, so the frame fills with ghost-images of the cross — warped,
// mirrored and nested at every scale, dense filigree where the set folds tight.
// The continuous iteration phase at which the minimum was struck blends the four
// palette colours, so shallow first-fold echoes wear one end of the palette and
// deeply nested echoes shade toward the other. The cross is never drawn, only
// remembered by orbits that grazed it. The seed c orbits slowly inside the
// cardioid and the trap cross turns even slower, so the whole population of
// echoes re-inks itself in place — nothing travels, the boundary writhes.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_writheSpeed;     // orbit speed of the hidden seed c     (default 0.05)
uniform float u_trapSpin;        // rotation rate of the unseen cross    (default 0.025)
uniform float u_trapThickness;   // trap arm thickness                   (default 0.06)
uniform float u_filigreeGain;    // brightness gain on the falloff       (default 1.4)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   ITERS    = 40;       // constant iteration bound (escape-time loop)
const float VIEW     = 1.18;     // half-extent of the dynamical plane in view
const float ESCAPE2  = 100.0;    // escape radius squared

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // map pixel to the dynamical plane, aspect-correct, centred
  float scale = VIEW / (0.5 * min(res.x, res.y));
  vec2  z     = (fc - ctr) * scale;

  // --- hidden seed c orbits slowly just inside the cardioid ---
  // Cardioid boundary is c = e^{i a}/2 - e^{2 i a}/4; pull inward by 0.86 so the
  // Julia set stays a connected, richly-folded coastline as it redraws itself.
  float a   = t * u_writheSpeed;
  vec2  ca  = vec2(cos(a), sin(a));
  vec2  c2a = vec2(cos(2.0 * a), sin(2.0 * a));
  // sit very close to the cardioid edge so the Julia set is a thin dendritic
  // coastline (minimal solid interior) — filigree everywhere, not filled bulbs.
  vec2  c   = (0.5 * ca - 0.25 * c2a) * 0.992;

  // --- trap cross slowly rotates in the dynamical plane ---
  float spin = t * u_trapSpin;
  float cs = cos(spin), sn = sin(spin);
  // arm thickness (guard the lower end so the reciprocal never blows up)
  float thick = max(u_trapThickness, 0.004);

  // iterate, tracking the closest grazing of the rotating cross and the
  // continuous iteration phase at which it happened (no dynamic indexing —
  // both carried as plain floats).
  float minDist = 1e9;
  float phaseAt = 0.0;
  for (int i = 0; i < ITERS; i++) {
    // z -> z*z + c
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;

    // escaped orbits never return to graze the trap; stop before recording so
    // fast-escaping exterior points can't stamp a raw first-bounce spike.
    if (dot(z, z) > ESCAPE2) break;

    // skip the very first step: exterior points start strung along the axes and
    // would otherwise paint hard radial rays. Real nested echoes come from the
    // folding of bounded and slowly-escaping orbits at iteration 1 onward.
    // only grazes by orbit points still near the trap region count: a far-flung
    // escaping point sitting near an axis must not stamp a hard radial ray.
    if (i >= 1 && dot(z, z) < 4.0) {
      // rotate orbit point into the cross's frame; the cross is the union of the
      // two coordinate axes there, so distance to it is min(|x|,|y|).
      vec2 zr = vec2(cs * z.x + sn * z.y, -sn * z.x + cs * z.y);
      float d = min(abs(zr.x), abs(zr.y));

      if (d < minDist) {
        minDist = d;
        // smooth (continuous) iteration index so the phase doesn't band
        phaseAt = float(i) - log2(max(d, 1e-4)) * 0.06;
      }
    }
  }

  // sharp falloff on the trapped distance: bright only where an orbit hugged the
  // cross to within an arm's width, near-black elsewhere, so the threads stay
  // thin and the interior never floods to a solid blob. The arm thickness sets
  // the width of the lit core; a tight exponential tail keeps the filigree crisp.
  // Use a fraction of the arm thickness as the falloff scale so even fat arms
  // resolve into threads rather than flooding interior cells to a flat tone.
  float fil = exp(-minDist / (thick * 0.45));      // 1 at a grazing core
  fil = pow(fil, 3.0);                             // tighten to filigree threads
  fil *= u_filigreeGain;

  // Theme colours from u_palette; fall back to midnight if headless leaves the
  // array zeroed (the active name is "u_palette[0]").
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2c = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2c, c2c) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2c = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // continuous iteration phase drives a smooth walk through the four colours:
  // shallow first-fold echoes wear one end of the palette, deeply nested echoes
  // the other. A slow time roll keeps the hues breathing without a hard reset.
  float ph = phaseAt / float(ITERS);
  float s  = fract(ph * 1.6 + t * 0.01) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  ink = (c0 * w0 + c1 * w1 + c2c * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  vec3 col = BG;
  // deep-fold echoes get a touch warmer/brighter so nesting reads with depth
  float depth = clamp(phaseAt / float(ITERS), 0.0, 1.0);
  col += ink * fil * (0.85 + 0.5 * depth);

  // a soft outer bloom so the brightest threads catch light without banding
  float bloom = fil * fil;
  col += ink * bloom * 0.35;

  // gentle vignette keeps the frame composed and edges dark
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.6, 1.0, vign);

  // tonemap to keep the bright cores from clipping to flat white
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.9));

  gl_FragColor = vec4(col, 1.0);
}
