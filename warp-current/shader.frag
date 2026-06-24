// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// warp-current (Loom) — a Warp variation: instead of straight tensioned threads,
// a whole warp of fine fibres COMBED into a flowing current. Hundreds of thin
// bright threads run across the frame, each bent by a shared domain-warped flow
// field so they sweep, gather and part like wind through long hair or silk under
// water. Two depth layers of fibres parallax against each other; the threads take
// palette hues by flow angle, brightest where the comb bunches them into luminous
// bands (off-centre), thinning into the dark between. Slow unbounded flow — the
// current never resets. Dense woven texture, not a soft glow.
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
uniform float u_flowSpeed;  // master speed of the combing current    (default 0.4)
uniform float u_threadCount;// fibre density (threads across frame)   (default 90)
uniform float u_swirl;      // strength of the flow warp / bend       (default 0.6)
uniform float u_glow;       // thread emission                        (default 1.0)
uniform float u_nearSpeed;  // near fibre-layer flow speed multiplier (default 1.0)
uniform float u_farSpeed;   // far fibre-layer flow speed multiplier  (default 0.8)
uniform float u_threadWidth;// fibre core thickness                   (default 1.0)
uniform float u_backdrop;   // flow-following wash that lifts the gaps (default 0)
uniform float u_hueSpread;  // how far hue swings with flow angle      (default 1.0)
uniform float u_hueShift;   // rotate the palette mapping              (default 0)
uniform float u_farTint;    // far-layer colour shift for depth        (default 0.4)
uniform float u_depth;      // parallax separation + far dimming       (default 1.0)
uniform float u_bandX;      // luminous comb-band focal X              (default 0.22)
uniform float u_bandY;      // luminous comb-band focal Y              (default 0.18)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI  = 3.14159265;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) { s += amp * vnoise(p * f); f *= 2.03; amp *= 0.5; }
  return s;
}
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// one combed fibre layer. Returns thread intensity; writes the local flow angle
// (for hue) into `ang`. `freq` = threads across the frame, `depth` parallax.
float fibreLayer(vec2 p, float t, float freq, float swirl, float depth, out float ang) {
  // shared flow field: a low-freq domain warp that bends the otherwise-horizontal
  // fibres into sweeping currents. Parallax + drift differ per depth layer.
  vec2 fp = p * vec2(1.4, 1.1) + vec2(t * (0.10 + 0.05 * depth), depth * 7.0);
  float warpA = fbm(fp);
  float warpB = fbm(fp * 1.9 + vec2(11.0, -3.0));
  float bend  = (warpA - 0.5) * swirl * 1.6 + (warpB - 0.5) * swirl * 0.7;
  ang = bend;
  // warped "across-thread" coordinate: each integer band is one fibre row
  float v = p.y * freq + bend * freq * 0.5;
  // sharp thread cores: distance to the nearest band centre
  float band = abs(fract(v) - 0.5) * 2.0;     // 0 at thread, 1 between
  // core sharpness: higher width -> smaller exponent -> thicker, softer fibres
  float thread = pow(1.0 - band, 7.0 / max(u_threadWidth, 0.2));
  // fibre breaks: thin out threads stochastically along their length so the comb
  // looks like real separate fibres, not a continuous corrugation
  float along = p.x * 2.2 + bend * 2.0;
  float breaks = 0.55 + 0.45 * fbm(vec2(along, floor(v) * 1.7 + depth * 5.0));
  return thread * breaks;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float tm    = u_time * max(u_flowSpeed, 0.0);   // master flow time
  float tNear = tm * max(u_nearSpeed, 0.0);       // near-layer flow time
  float tFar  = tm * max(u_farSpeed, 0.0);        // far-layer flow time

  float aspect = res.x / max(res.y, 1.0);
  vec2  uv = fc / res;
  vec2  p  = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // thread frequency → fibre density. css-px-free: a count across the short axis.
  float freq  = max(u_threadCount, 6.0) * 0.5;
  float swirl = max(u_swirl, 0.0);
  float glow  = max(u_glow, 0.0);

  // two parallaxing fibre layers (far dimmer, near brighter). depth scales both
  // the parallax displacement and how much darker the far layer sits.
  float depthAmt = max(u_depth, 0.0);
  float angN, angF;
  float near = fibreLayer(p, tNear, freq, swirl, 0.0, angN);
  vec2  farP = p * (1.0 + 0.06 * depthAmt) + vec2(0.0, 0.13 * depthAmt);
  float far  = fibreLayer(farP, tFar, freq * 0.78, swirl, 1.0, angF);

  // luminous comb bands: the current bunches fibres into bright sweeping bands,
  // placed off-centre (movable focal) so the frame reads composed, not even.
  float bandField = fbm(p * vec2(0.9, 1.3) + vec2(tm * 0.15, 3.0));
  float bright = smoothstep(0.30, 0.80, bandField);
  float offc   = exp(-length((p - vec2(u_bandX, u_bandY)) * vec2(0.75, 1.05)) * 1.25);
  float lum    = 0.28 + 1.7 * bright * (0.3 + 1.0 * offc);

  // hue from the local flow angle so currents in different directions glow in
  // different palette colours. spread scales the swing, shift rotates the wheel.
  float hue = (angN * 2.2 + p.x * 0.6) * max(u_hueSpread, 0.0) + tm * 0.3 + u_hueShift;
  float s4  = fract(hue * 0.25 + 0.5) * 4.0;
  float w0 = wheelW(s4,0.0), w1 = wheelW(s4,1.0), w2 = wheelW(s4,2.0), w3 = wheelW(s4,3.0);
  vec3 nearCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  // far layer tinted toward one palette anchor for depth separation
  vec3 farCol = mix(nearCol, c0, clamp(u_farTint, 0.0, 1.0));

  float farBright = 0.5 * (1.5 - 0.5 * depthAmt);  // 0.5 at depth 1, dimmer as it grows
  vec3 col = BG;
  col += farCol  * far  * farBright * lum * glow;
  col += nearCol * near * 1.3       * lum * glow;
  // bespoke flow-following wash: lifts the dark gaps between fibres without
  // flattening the contrast (follows the band field + the off-centre focal).
  vec3  washCol = mix(nearCol, mix(c0, c2, 0.5), 0.5);
  float wash    = (0.25 + 0.75 * bandField) * (0.4 + 0.6 * offc);
  col += washCol * wash * (0.04 + 0.30 * max(u_backdrop, 0.0)) * glow;

  // filmic shoulder to keep the brightest thread crossings from clipping flat
  col = col / (col + vec3(0.92)) * 1.8;

  // gentle vignette
  float vign = 1.0 - smoothstep(0.5, 1.08, length((uv - 0.5) * vec2(1.0, 1.05)));
  col *= mix(0.74, 1.0, vign);

  // dither against banding in the smooth comb-band gradients
  col += (hash21(fc + fract(tm)) - 0.5) / 255.0;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
