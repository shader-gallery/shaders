// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// lull (Wake) — a faint static seascape: dim horizontal FBM bands of dark water
// layered toward a barely-visible horizon, salted with a few sparse glints,
// rendered just above the threshold of visibility. Nothing within the scene
// moves; instead the ENTIRE field rides at anchor — a slow coupled sway (x) and
// heave (y) translates the whole frame as one body, while a broad luminance tilt
// rocks across the frame in counterphase, like lamplight shifting across a deck.
// Everything is sinusoidal, so the loop is seamless and the motion sits
// deliberately at the edge of perception.
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
uniform float u_rockSpeed;  // rate of the whole-field rock; slow even at max (default 0.08)
uniform float u_sway;       // css-px amplitude of coupled sway+heave (default 18) — scaled by u_pixelRatio
uniform float u_tiltDepth;  // strength of the rocking brightness tilt    (default 0.45)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI2      = 6.2831853;

// hash + value noise (no textures): smooth interpolated lattice noise
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
// fbm with horizontal stretch so the noise reads as water bands, not blobs
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  // constant loop bound (GLSL ES 1.00)
  for (int o = 0; o < 5; o++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(11.7, 4.3);
    amp *= 0.5;
  }
  return v;
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
  float t   = u_time;

  // normalized coords: y up, centred, aspect-corrected so bands stay horizontal
  vec2 uv = (fc - 0.5 * res) / res.y;

  // --- the whole field rides at anchor: one coupled sway(x)+heave(y) ---
  // period ~30s base; u_rockSpeed scales the rate. Sway and heave are a quarter
  // turn out of phase so the field traces a slow lissajous slosh, not a line.
  float phase = t * u_rockSpeed * (PI2 / 30.0) * 30.0; // = t*u_rockSpeed*PI2 ; default ~0.5 rad/s
  float swayAmp = u_sway * pr / res.y;                 // css-px amplitude in uv units
  vec2  rideOff = vec2(swayAmp * sin(phase),
                       swayAmp * 0.62 * sin(phase * 0.5 + 1.5707963));
  vec2  p = uv + rideOff;

  // --- the static seascape (built in the rocked frame `p`) ---
  // horizon sits a touch above centre; water occupies the lower field.
  float horizon = 0.06;
  // distance below the horizon (0 at horizon, grows downward)
  float depth = horizon - p.y;

  // horizontally-stretched fbm = layered water bands receding toward horizon.
  // squashing y as bands approach the horizon packs them tighter (perspective).
  float band = p.y;
  vec2  wp = vec2(p.x * 2.4, band * 7.0 + exp(-max(band + horizon, 0.0) * 3.0) * 6.0);
  float water = fbm(wp + vec2(3.0, 0.0));
  // a slower, broader swell underneath for big tonal undulation
  float swell = fbm(p * vec2(1.1, 2.2) + vec2(20.0, 7.0));

  // sky above horizon: near-black, faint graded glow toward the horizon line
  // water below: dim bands whose brightness falls off with depth
  float isWater = smoothstep(0.0, 0.012, depth);

  // band luminance: low base, accents where fbm crests. Falls off with depth so
  // the far water (near horizon) is brightest/most detailed, near water settles
  // into shadow — the classic receding-sea read.
  float depthFade = exp(-max(depth, 0.0) * 2.3);
  float crest = smoothstep(0.55, 0.95, water);
  // finer surface detail: a second higher-frequency crest layer adds woven wave
  // texture to the water (static, so the "scene at anchor" conceit holds).
  float crest2 = smoothstep(0.58, 0.92, fbm(wp * vec2(2.1, 2.6) + vec2(40.0, 9.0)));
  float bandLum = (0.08 + 0.85 * crest + 0.30 * crest2) * depthFade;

  // horizon glow: a brighter seam where sea meets sky
  float horizonGlow = exp(-abs(depth) * 22.0) * 1.5;
  // broad sky glow rising above the horizon so the upper frame isn't a dead void
  float skyGlow = exp(-max(-depth, 0.0) * 3.2) * (1.0 - smoothstep(0.0, 0.012, depth));

  // sparse glints: a few salt-bright specular points on the far water. Built
  // from a high-threshold product of two fbms so only a handful survive.
  float gn = fbm(wp * 1.7 + vec2(50.0, 12.0)) * fbm(wp * 3.1 + vec2(7.0, 70.0));
  float glint = smoothstep(0.34, 0.5, gn) * depthFade * isWater;

  // Theme colours come from u_palette; fall back to midnight if unbound (headless).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // deep desaturated washes: pick band colour by depth + the broad swell so the
  // palette sits in the water as layered tonal bands (no dynamic array indexing).
  float s = fract(clamp(depth * 0.6, 0.0, 1.0) * 0.7 + swell * 0.5) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  bandCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
  // desaturate toward a cold wash so colours read as "deep" not vivid
  bandCol = mix(vec3(dot(bandCol, vec3(0.33))), bandCol, 0.55);

  vec3 col = BG;
  // water bands
  col += bandCol * bandLum * isWater * 1.15;
  // horizon seam (sky-side gets a cool bandCol tint too)
  col += mix(bandCol, c2, 0.3) * horizonGlow * 0.8;
  // broad sky glow above the horizon filling the upper void
  col += mix(bandCol, c2, 0.35) * skyGlow * 0.22;
  // glints (slightly warmer/brighter mix of palette)
  col += mix(bandCol, c2, 0.4) * glint * 1.1;

  // --- the rocking brightness tilt, in COUNTERPHASE with the ride ---
  // a broad linear luminance lean across the frame that rocks left<->right,
  // brightening one side as the other settles into shadow.
  float tilt = sin(phase + PI2 * 0.5); // counterphase to the sway's sin(phase)
  // signed horizontal position across the frame (-1 left .. +1 right)
  float xpos = (fc.x - 0.5 * res.x) / (0.5 * res.x);
  float lean = 1.0 + u_tiltDepth * tilt * xpos;
  col *= clamp(lean, 0.0, 2.0);

  // gentle vignette to keep the frame composed and the corners settled
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - 0.5 * res) / res));
  col *= mix(0.78, 1.0, vign);

  // keep a near-black floor so the base never lifts to grey
  col = max(col, BG * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
