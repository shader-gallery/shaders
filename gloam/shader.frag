// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_driftSpeed;     // twilight drift speed              (default 0.14)
uniform float u_softness;       // pole influence radius             (default 1.0)
uniform float u_glow;           // luminance of the brightest pole   (default 0.7)
uniform float u_warp;           // organic edge warp                 (default 0.6)
uniform float u_mouseInfluence; // pointer pull on the field         (default 0.0)

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
float poleW(vec2 pos, vec2 c, float r){
  vec2 d = pos - c;
  return exp(-dot(d, d) / max(r * r, 1e-3));
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

  vec2 wv = vec2(fbm(pos * 1.5 + t * 0.35), fbm(pos * 1.5 + vec2(5.0, 2.0) - t * 0.3)) - 0.5;
  pos += wv * (0.38 * u_warp);

  // four deep twilight poles drifting; the luminous one biased off-centre
  // (upper-right third) so the frame reads composed, not symmetric
  vec2 P0 = vec2(-0.50, -0.35) + vec2(sin(t * 0.67 + 0.0), cos(t * 0.59 + 1.0)) * 0.34;
  vec2 P1 = vec2( 0.30,  0.45) + vec2(sin(t * 0.51 + 2.1), cos(t * 0.74 + 0.4)) * 0.36; // bright pole
  vec2 P2 = vec2( 0.50, -0.30) + vec2(sin(t * 0.62 + 4.0), cos(t * 0.47 + 3.0)) * 0.34;
  vec2 P3 = vec2(-0.40,  0.30) + vec2(sin(t * 0.78 + 5.5), cos(t * 0.65 + 2.4)) * 0.38;

  float r = 0.50 * max(u_softness, 0.25);
  float w0 = poleW(pos, P0, r), w1 = poleW(pos, P1, r);
  float w2 = poleW(pos, P2, r), w3 = poleW(pos, P3, r);
  float wsum = w0 + w1 + w2 + w3 + 1e-3;
  vec3 col = (w0 * c0 + w1 * c1 + w2 * c2 + w3 * c3) / wsum;

  // twilight: pull the whole field down toward near-black, then let the bright
  // pole (c1) bloom back up as a luminous accent — dark base, glowing heart
  float lum = w1 / wsum;            // proximity to the bright pole
  col *= 0.40 + 0.30 * fbm(pos * 1.2 - t * 0.2);   // deep, uneven shadow
  col += c1 * u_glow * 0.9 * smoothstep(0.25, 0.95, lum);

  gl_FragColor = vec4(col, 1.0);
}
