// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_freq;           // line frequency across the frame      (default 34)
uniform float u_skew;           // angle between the two gratings        (default 0.18)
uniform float u_spin;           // rotation speed of the pair            (default 0.25)
uniform float u_duty;           // line thickness (duty cycle)           (default 0.5)
uniform float u_mouseInfluence; // pointer tilts the second grating       (default 0.0)

float stripes(vec2 p, float ang, float f, float duty, float aa){
  vec2 dir = vec2(cos(ang), sin(ang));
  float s = sin(dot(p, dir) * f) * 0.5 + 0.5;
  return smoothstep(duty + aa, duty - aa, s);   // 1 = on a bar
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float t = u_time;
  float f = max(u_freq, 6.0);
  float aa = clamp(2.0 * f / u_resolution.y, 0.01, 0.4);

  float base = t * u_spin;
  float ang1 = base;
  float ang2 = base + u_skew;

  vec2 m = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ang2 += m.x * mAmt * 1.0;

  float A = stripes(p, ang1, f, u_duty, aa);
  float B = stripes(p, ang2, f, u_duty, aa);

  // overlay two coloured gratings; their near-equal spacing beats into broad
  // moiré fringes where the bars align (overlap) vs interleave
  vec3 bg = c3 * 0.10;
  vec3 col = bg;
  col = mix(col, c0, A * 0.9);                 // first grating
  col = mix(col, c2, B * 0.9);                 // second grating over it
  // bright weld where both bars coincide — the moiré crests
  col = mix(col, c1 * 1.25 + 0.1, A * B);

  gl_FragColor = vec4(col, 1.0);
}
