// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// bokeh (Noir) — a city seen through a fast lens at night: three depth layers of
// out-of-focus light discs on a near-black field. Each disc is a soft-edged
// heptagonal aperture (polygon SDF) tinted one palette hue by hash, ringed by the
// faint bright rim of a defocused camera iris. The near layer carries a few large
// dim discs; the far layer many small bright ones. Layers drift sideways with depth
// parallax and individual discs blink on hash phases like distant signage. Discs
// that wrap off-screen return re-hashed as different lights, so the loop never seams.
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
uniform float u_discSize;   // near-layer aperture diameter, css px  (default 60)
uniform float u_drift;      // overall sideways drift speed          (default 0.4)
uniform float u_parallax;   // speed spread between depth layers     (default 0.6)
uniform float u_blinkRate;  // signage blink frequency               (default 0.6)

const vec3  BG       = vec3(0.030, 0.031, 0.040); // near-black base
const float TWO_PI   = 6.2831853;
const int   SIDES    = 7;     // heptagonal aperture

// hash helpers (no textures) — stable per integer cell id
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  hash22(vec2 p)  {
  float n = sin(dot(p, vec2(41.3, 289.1)));
  return fract(vec2(262144.0, 32768.0) * n);
}

// signed distance to a regular polygon of circumradius r, rotated by ang.
// negative inside. SIDES is a constant so the loop bound is legal.
float sdHeptagon(vec2 p, float r, float ang) {
  float d = -1e9;
  for (int i = 0; i < SIDES; i++) {
    float a = ang + TWO_PI * (float(i) + 0.5) / float(SIDES);
    vec2  n = vec2(cos(a), sin(a)); // outward normal of one edge
    // apothem = r * cos(pi/sides); edge is at distance apothem along n
    d = max(d, dot(p, n) - r * 0.90096887); // cos(pi/7) = 0.9009688679
  }
  return d;
}

// render one depth layer of discs into accumulated colour `col`.
// scale: disc size multiplier vs near layer; speed: drift multiplier;
// bright: base brightness of this layer's discs; cellCss: grid pitch in css px;
// seed: decorrelates the layer's hashes.
vec3 layer(vec2 fc, vec2 res, float pr, float t,
           float scale, float speed, float bright, float cellCss, float seed) {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = cellCss * refScale * pr;                 // grid pitch in device px
  float discR = u_discSize * 0.5 * pr * scale; // aperture circumradius, device px

  // sideways drift for this layer (parallax: near races, far crawls)
  vec2 drift = vec2(u_drift * speed * t * 38.0 * pr, 0.0);
  vec2 sp    = fc + drift;                     // sampling position in drifted space

  vec2 base = floor(sp / cell);
  vec3 acc  = vec3(0.0);

  // scan a 3x3 neighbourhood of cells so large near discs that overlap cell
  // borders still contribute. Constant bounds — legal in GLSL ES 1.00.
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2  cid  = base + vec2(float(ox), float(oy));
      vec2  hid  = cid + vec2(seed, seed * 1.7); // re-hashed identity (wrap = new light)

      // jittered disc centre within the cell (kept away from edges)
      vec2  jit  = hash22(hid) * 0.6 + 0.2;
      vec2  ctr  = (cid + jit) * cell;
      vec2  p    = sp - ctr;

      // per-disc identity: hue, size wobble, rotation, blink phase
      float hsiz = hash21(hid + 3.1);
      float r    = discR * mix(0.55, 1.15, hsiz);
      float ang  = hash11(hid.x * 7.0 + hid.y * 13.0 + seed) * TWO_PI;
      float hue  = hash21(hid + 9.7);
      float blkP = hash21(hid + 1.3);

      // signage blink: each disc breathes between dim and lit on its own phase.
      // u_blinkRate=0 leaves it steady (full on).
      float blink = 0.5 + 0.5 * sin((t * u_blinkRate + blkP) * TWO_PI * 0.5);
      blink = mix(1.0, smoothstep(0.04, 0.6, blink), clamp(u_blinkRate, 0.0, 1.0));
      // far-off signage switches: a chunk of discs sit dark on each beat, re-rolled
      // per blink interval so the dark set keeps changing (crisp on/off, not a fade)
      float beat = floor(t * u_blinkRate * 0.5 + blkP);
      float off  = step(0.6, hash21(hid + beat * 1.91));
      blink *= mix(1.0, 1.0 - off * 0.92, clamp(u_blinkRate, 0.0, 1.0));

      // heptagonal aperture SDF
      float sd  = sdHeptagon(p, r, ang);
      float aa  = max(r * 0.20, 1.5 * pr); // defocus softness scales with disc size

      // soft-filled interior (out-of-focus disc, dim toward centre)
      float fill = 1.0 - smoothstep(-aa, aa * 0.6, sd);
      // bright iris rim of a defocused lens: a ring hugging the aperture edge
      float rimW = max(r * 0.07, 1.0 * pr);
      float rim  = exp(-pow(sd / rimW, 2.0)) * smoothstep(aa, -aa, sd - rimW * 0.5);

      // tint: pick a palette hue per disc by blending (no dynamic indexing)
      float s  = hue * 4.0;
      float w0 = max(0.0, 1.0 - min(abs(s-0.0), 4.0-abs(s-0.0)));
      float w1 = max(0.0, 1.0 - min(abs(s-1.0), 4.0-abs(s-1.0)));
      float w2 = max(0.0, 1.0 - min(abs(s-2.0), 4.0-abs(s-2.0)));
      float w3 = max(0.0, 1.0 - min(abs(s-3.0), 4.0-abs(s-3.0)));
      vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

      float lit = bright * blink;
      // flat optics: interior is a soft even pool, rim is the bright edge.
      // the pool reads slightly brighter toward the rim (defocused disc) but stays
      // an even fill, not a bloom — keeping the look optical rather than organic.
      float pool = fill * (0.78 + 0.35 * smoothstep(-r, 0.0, sd));
      acc += tint * pool * 0.92 * lit;
      acc += (tint * 0.55 + vec3(0.45)) * rim * 1.6 * lit; // rim biases toward white-hot
    }
  }
  return acc;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // parallax spread: near layer drifts fast, far layer nearly still.
  float px = clamp(u_parallax, 0.0, 1.0);
  float nearSpd = mix(1.0, 1.7, px);
  float midSpd  = 1.0;
  float farSpd  = mix(1.0, 0.18, px);

  // FAR: many small bright discs
  col += layer(fc, res, pr, t, 0.34, farSpd, 1.10, 56.0, 0.0);
  // MID: medium discs
  col += layer(fc, res, pr, t, 0.62, midSpd, 0.72, 120.0, 17.0);
  // NEAR: a few large dim discs (big soft foreground circles)
  col += layer(fc, res, pr, t, 1.75, nearSpd, 0.52, 175.0, 41.0);

  // gentle lens vignette: corners fall to near-black like a fast lens
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.70, 1.0, vign);

  // subtle filmic toe so accents stay luminous without washing the base
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
