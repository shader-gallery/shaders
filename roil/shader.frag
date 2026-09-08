// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// roil (Current) - a turbulent current, all eddies and whorls. Dense fine fibres
// are advected through a churning flow field: curl-noise plus a handful of slowly
// orbiting point vortices drag the threads into spiralling eddies that wind up,
// shear apart and reform. Colour follows the local flow direction so opposing
// swirls glow in different palette hues. Two parallaxing depth layers churn at
// different rates. Restless and rotational - the chaotic cousin of the combed
// warp-current. The pointer can stir the current locally: a small vortex and
// drag folded into the advection near the cursor, easing back with distance.
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
uniform float u_threads;  // fibre density across the frame            (default 80)
uniform float u_churn;    // strength of the curl-noise turbulence      (default 0.9)
uniform float u_vortex;   // strength of the orbiting point vortices    (default 0.7)
uniform float u_speed;    // master flow speed                          (default 0.5)
uniform float u_glow;     // fibre emission                             (default 1.0)
uniform float u_hueSpread;// how far hue swings with flow direction     (default 1.4)
uniform float u_depth;    // near/far parallax + far dimming            (default 0.8)
uniform float u_mouseInfluence; // pointer stir strength, 0 = off          (default 0.0)
uniform float u_mouseRadius;    // reach of the pointer stir, frame units  (default 0.2)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

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
// rotational derivative of an fbm potential -> a divergence-free velocity field
vec2 curlNoise(vec2 p) {
  float e = 0.08;
  float n1 = fbm(p + vec2(0.0, e));
  float n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0));
  float n4 = fbm(p - vec2(e, 0.0));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// advect the coordinate through the turbulent field, then read a fibre value.
// writes the final local flow angle into `ang` (for hue).
float fibre(vec2 p, float t, float freq, float churn, float vort, float depth,
            vec2 mpos, float mAmt, float mRad, out float ang) {
  vec2 q = p;
  vec2 vel = vec2(0.0);
  // a few advection steps wind the fibres into eddies (const loop bound)
  for (int i = 0; i < 4; i++) {
    vec2 v = curlNoise(q * 1.3 + vec2(t * 0.12, depth * 5.0 + t * 0.05)) * churn;
    // pointer stir: a local vortex plus a drag toward the cursor. The falloff
    // is a smooth bump that hits exactly zero at twice the radius, so the far
    // field is untouched by construction (the advection is chaotic and would
    // amplify even a gaussian tail). mAmt is exactly 0 at rest.
    vec2 rm = q - mpos;
    float mt = clamp(1.0 - dot(rm, rm) / (4.0 * mRad * mRad), 0.0, 1.0);
    float mk = mt * mt * (3.0 - 2.0 * mt) * mAmt;
    v += (vec2(-rm.y, rm.x) * 3.0 - rm * 1.2) * mk;
    // three orbiting point vortices add big coherent whorls
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 c = vec2(sin(t * 0.2 + fk * 2.1) * 0.5, cos(t * 0.17 + fk * 1.7) * 0.34);
      vec2 r = q - c;
      float r2 = dot(r, r) + 0.02;
      v += vec2(-r.y, r.x) / r2 * vort * 0.06;   // tangential swirl around centre
    }
    q += v * 0.16;
    vel = v;
  }
  ang = atan(vel.y, vel.x);
  // fibres run along the (warped) horizontal: integer bands across q.y are threads
  float band = abs(fract(q.y * freq) - 0.5) * 2.0;   // 0 on a fibre, 1 between
  float thread = pow(1.0 - band, 6.0);
  // stochastic breaks along the fibre length so it reads as separate strands
  float breaks = 0.5 + 0.5 * fbm(vec2(q.x * 2.0, floor(q.y * freq) * 1.7 + depth * 4.0));
  return thread * breaks;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  float aspect = res.x / max(res.y, 1.0);
  vec2  uv = fc / res;
  vec2  p  = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t      = u_time * max(u_speed, 0.0);
  float freq   = max(u_threads, 8.0) * 0.5;
  float churn  = max(u_churn, 0.0);
  float vort   = max(u_vortex, 0.0);
  float glow   = max(u_glow, 0.0);
  float depthA = clamp(u_depth, 0.0, 1.0);

  // pointer in frame coords, gated so (0,0) at rest means no stir at all
  vec2  mpos = (u_mouse / res - 0.5) * vec2(aspect, 1.0);
  float mAmt = max(u_mouseInfluence, 0.0) * step(0.5, dot(u_mouse, u_mouse));
  float mRad = max(u_mouseRadius, 0.05);

  float angN, angF;
  float near = fibre(p, t, freq, churn, vort, 0.0, mpos, mAmt, mRad, angN);
  vec2  farP = p * (1.0 + 0.07 * depthA) + vec2(0.03 * depthA, 0.0);
  float far  = fibre(farP, t * 0.7, freq * 0.8, churn, vort, 1.0, mpos, mAmt, mRad, angF);

  // hue from the local flow direction -> opposing swirls glow different colours
  float hue = angN * max(u_hueSpread, 0.0) * 0.5 + t * 0.04 + 0.5;
  float s4  = fract(hue) * 4.0;
  float w0 = wheelW(s4,0.0), w1 = wheelW(s4,1.0), w2 = wheelW(s4,2.0), w3 = wheelW(s4,3.0);
  vec3 nearCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  float hf = angF * max(u_hueSpread, 0.0) * 0.5 + t * 0.04 + 0.5;
  float sf = fract(hf) * 4.0;
  float f0 = wheelW(sf,0.0), f1 = wheelW(sf,1.0), f2 = wheelW(sf,2.0), f3 = wheelW(sf,3.0);
  vec3 farCol = (c0*f0 + c1*f1 + c2*f2 + c3*f3) / max(f0+f1+f2+f3, 0.001);

  vec3 col = BG;
  float farBright = 0.5 * (1.0 - 0.4 * depthA);
  col += farCol  * far  * farBright * glow;
  col += nearCol * near * 1.2       * glow;

  // bespoke flow-following wash so eddy interiors are not dead-black: a dim
  // swirl-coloured fill keyed to the turbulence field.
  float fillN = fbm(p * 1.6 + vec2(t * 0.1, 2.0));
  vec3  washCol = mix(nearCol, c2, 0.4);
  col += washCol * (0.03 + 0.07 * fillN) * glow;

  // filmic shoulder keeps the tightest bright eddies from clipping flat
  col = col / (col + vec3(0.92)) * 1.6;

  // gentle vignette
  float vign = 1.0 - smoothstep(0.55, 1.1, length((uv - 0.5) * vec2(1.0, 1.05)));
  col *= mix(0.72, 1.0, vign);

  // dither against banding in the smooth wash gradients
  col += (hash21(fc + fract(t)) - 0.5) / 255.0;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
