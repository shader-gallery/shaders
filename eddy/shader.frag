// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spin;           // rotation speed of the swirl         (default 0.35)
uniform float u_twist;          // how tightly the arms wind (spiral)   (default 0.7)
uniform float u_core;           // brightness of the luminous core      (default 0.7)
uniform float u_softness;       // colour-pole radius                   (default 1.0)
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
  pos += m * mAmt * 0.3;

  float t = u_time;
  float rad = length(pos);

  // differential rotation: the swirl turns faster toward the centre and winds
  // out with radius → spiral arms (galaxy swirl)
  float ang = t * u_spin - rad * u_twist * 4.5;
  float ca = cos(ang), sa = sin(ang);
  vec2 rp = mat2(ca, -sa, sa, ca) * pos;

  // a little turbulence on the swirled coords so arms aren't mechanical
  vec2 wv = vec2(fbm(rp * 1.3 + t * 0.15), fbm(rp * 1.3 + vec2(4.0, 9.0))) - 0.5;
  rp += wv * 0.35;

  // four colour poles in the swirled frame → they smear into arms
  vec2 P0 = vec2(-0.42, -0.10) ;
  vec2 P1 = vec2( 0.44, -0.36) ;
  vec2 P2 = vec2( 0.30,  0.42) ;
  vec2 P3 = vec2(-0.40,  0.40) ;
  float r = 0.55 * max(u_softness, 0.25);
  float w0 = poleW(rp, P0, r), w1 = poleW(rp, P1, r);
  float w2 = poleW(rp, P2, r), w3 = poleW(rp, P3, r);
  float wsum = w0 + w1 + w2 + w3 + 1e-3;
  vec3 col = (w0 * c0 + w1 * c1 + w2 * c2 + w3 * c3) / wsum;

  // arm brightness: a sinusoid in the swirled angle so two bright spiral arms
  // stand out from the inter-arm dust
  float swAng = atan(rp.y, rp.x);
  float arms = 0.5 + 0.5 * sin(swAng * 2.0 + rad * 3.0);
  col *= 0.55 + 0.6 * arms;

  // luminous galactic core, slightly off the geometric centre (rule-of-thirds)
  float coreD = length(pos - vec2(0.06, 0.04));
  float coreGlow = exp(-coreD * coreD * 7.0);
  col += (c2 * 0.8 + c1 * 0.4) * u_core * coreGlow;
  // gentle outward dimming so the field falls into darkness at the corners
  col *= mix(1.0, 0.5, smoothstep(0.4, 1.1, rad));

  gl_FragColor = vec4(col, 1.0);
}
