// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// gossamer (Veil) — aurora curtains: soft vertical ribbons of layered value/FBM
// noise drifting slowly sideways over a dark sky, with a gentle vertical falloff
// like northern lights. Translucent, slow, ethereal; colours blend smoothly
// across u_palette and a faint fine grain keeps the gradients from banding.
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
uniform float u_speed;  // drift speed multiplier      (default 1)
uniform float u_gap;    // curtain gap threshold       (default 0.35)
uniform float u_glow;   // curtain glow multiplier     (default 1)
uniform float u_haze;   // low-horizon haze strength   (default 0.10)

const float TAU = 6.28318530718;
const float PERIOD = 24.0;   // loop period (s); all motion is sin/cos(t*w)

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

// FBM drifting horizontally by phase, so it loops with the period
float fbm(vec2 p, float phase) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    vec2 q = p + vec2(phase * (1.0 + float(i) * 0.35), 0.0);
    sum += amp * vnoise(q);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

// blend smoothly across all four palette colours by a 0..1 coordinate
vec3 paletteRamp(float x) {
  vec3 a = mix(u_palette[0], u_palette[1], smoothstep(0.0, 0.5, x));
  vec3 b = mix(u_palette[2], u_palette[3], smoothstep(0.5, 1.0, x));
  return mix(a, b, smoothstep(0.25, 0.75, x));
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = gl_FragCoord.xy / res;          // 0..1
  float asp = res.x / res.y;
  vec2  p   = vec2(uv.x * asp, uv.y);
  float t   = u_time * u_speed;
  float w   = TAU / PERIOD;                    // base angular speed for the loop

  // looping drift phases (continuous, period-aligned -> no jump at wrap)
  float driftA = sin(t * w) * 1.6;
  float driftB = sin(t * w + 1.7) * 1.1;
  float driftC = cos(t * w * 0.5) * 0.8;

  vec3 col = vec3(0.035, 0.035, 0.043);        // dark sky base ~#09090B

  // three curtain layers: tall FBM gathered into bright vertical filaments
  for (int L = 0; L < 3; L++) {
    float fl    = float(L);
    float scale = 2.4 + fl * 1.7;
    float phase = driftA * (1.0 - fl * 0.25) + driftB * fl * 0.4;

    // stretch y so ribbons read as vertical curtains
    vec2  np = vec2(p.x * scale, p.y * (0.9 + fl * 0.3) + driftC * 0.3);
    float n  = fbm(np, phase);

    // fold the noise into broad, soft vertical filaments (low spatial freq so
    // the curtains stay calm rather than busy); soft floor so they read
    float ribbon = sin((p.x * (1.6 + fl * 1.1) + n * 3.0 + phase) * TAU * 0.5);
    ribbon = 0.5 + 0.5 * ribbon;                 // 0..1, rounded crests
    ribbon = smoothstep(u_gap * 0.7, 1.0, ribbon); // curtains read more broadly
    // fine vertical ray striations within each curtain — the aurora "rays" that
    // give the sheet visible structure instead of a soft blur
    float rays = 0.74 + 0.26 * sin(p.x * (70.0 + fl * 34.0) + n * 6.0);
    // lower the noise-density gate so curtains fill more of the frame
    float curtain = ribbon * smoothstep(0.30, 0.74, n) * rays;

    // gentle vertical falloff: brightest hanging from the top, fading to the
    // horizon; a slow shimmer drifts the band over the loop
    float lift    = 0.08 * sin(t * w * 0.5 + fl * 1.3);
    float falloff = smoothstep(-0.15, 0.6 + lift, uv.y) * smoothstep(1.2, 0.82, uv.y);
    // bright lower hem: auroras glow hottest along their trailing bottom edge
    float hem = smoothstep(0.55, 0.18, uv.y) * smoothstep(0.0, 0.3, n);
    curtain *= falloff * (0.85 + fl * 0.15);
    curtain += ribbon * smoothstep(0.34, 0.74, n) * rays * hem * 0.5;

    // colour: blend across the palette, low-frequency so hues stay coherent
    float mixA = fract(uv.x * 0.35 + n * 0.25 + fl * 0.3 + driftB * 0.04);
    col += paletteRamp(mixA) * curtain * (1.85 - fl * 0.20) * u_glow;
  }

  // soft low haze so the curtains feel anchored above the horizon
  float haze = smoothstep(0.6, 0.0, uv.y) * u_haze;
  col += mix(u_palette[2], u_palette[0], uv.x) * haze;

  // faint fine grain to break banding (subtle, stays calm)
  float grain = hash(gl_FragCoord.xy + floor(t * 12.0)) - 0.5;
  col += grain * 0.012;

  // soft tone curve: glowing but not blown out (gentler knee so the brighter
  // curtains keep their luminosity instead of compressing back to dim)
  col = col / (1.0 + col * 0.38);

  gl_FragColor = vec4(col, 1.0);
}
