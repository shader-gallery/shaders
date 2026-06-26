// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_driftSpeed;     // how fast the haze drifts            (default 0.13)
uniform float u_steps;          // colour-band quantisation (posterise) (default 7.0)
uniform float u_softness;       // pole influence radius                (default 1.1)
uniform float u_dither;         // softens the band edges (ordered)     (default 0.5)
uniform float u_mouseInfluence; // pointer pull on the field            (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.55;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = rot * p * 2.03 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return s;
}
// four-stop palette ramp (dark -> mid -> mid -> light)
vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x){
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(c3, c0, smoothstep(0.0, 0.34, x));
  a = mix(a, c1, smoothstep(0.34, 0.67, x));
  a = mix(a, c2, smoothstep(0.67, 1.0, x));
  return a;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 pos = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  pos += m * mAmt * 0.4;

  float t = u_time * u_driftSpeed;

  // a broad, drifting smooth scalar field across the whole frame — softness
  // sets its scale (low = big banks, high = more banks)
  float sc = 1.5 / max(u_softness, 0.3);
  vec2 q2 = vec2(fbm(pos * sc + t * 0.3), fbm(pos * sc + vec2(5.0, 2.0) - t * 0.25));
  float field = fbm(pos * sc + 0.9 * q2 + vec2(0.0, t * 0.2));
  field = clamp((field - 0.22) / 0.56, 0.0, 1.0);   // normalise to ~0..1

  // POSTERISE — quantise the field into discrete colour bands (the "pixel
  // haze" stepped look), then map through the 4-stop palette ramp so whole
  // bands share one tone. An ordered-dither offset breaks the band edges into
  // a fine stipple instead of hard contours.
  float steps = max(u_steps, 2.0);
  float bayer = vnoise(gl_FragCoord.xy * 0.5) - 0.5;
  float qd = floor(field * steps + bayer * u_dither) / steps;

  vec3 col = ramp(c0, c1, c2, c3, qd);
  // keep a whisper of the continuous field so motion reads between band jumps
  col = mix(col, ramp(c0, c1, c2, c3, field), 0.18);

  // hazy: never fully black, slightly lifted
  col = col * 0.92 + 0.07;

  gl_FragColor = vec4(col, 1.0);
}
