// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_dots;           // dot count across the frame          (default 30)
uniform float u_speed;          // ripple travel speed                  (default 1.4)
uniform float u_wavelength;     // ripple wavelength                    (default 1.0)
uniform float u_amp;            // how hard the dots pulse              (default 0.7)
uniform float u_mouseInfluence; // pointer becomes a ripple source        (default 0.0)

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
  float N = max(u_dots, 6.0);
  vec2 cellId = floor(p * N) + 0.5;
  vec2 cellCentre = cellId / N;          // grid cell centre, frame-relative
  vec2 g = fract(p * N) - 0.5;

  // two ripple sources (rule-of-thirds offsets) + optional pointer source
  float k = 6.2831 / max(u_wavelength, 0.15);
  vec2 s1 = vec2(-0.35, 0.22), s2 = vec2(0.38, -0.28);
  float w = sin(length(cellCentre - s1) * k - t * u_speed)
          + 0.8 * sin(length(cellCentre - s2) * k - t * u_speed * 1.1);

  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  w += mAmt * 1.2 * sin(length(cellCentre - m) * k - t * u_speed * 1.3);

  w *= 0.5;   // ~ -1..1

  // dot size pulses with the wave height at this cell
  float base = 0.30;
  float radius = clamp(base + u_amp * 0.26 * w, 0.04, 0.49);
  float d = length(g);
  float aa = clamp(1.5 * N / u_resolution.y, 0.004, 0.2);
  float dotm = smoothstep(radius + aa, radius - aa, d);

  // colour the dots by wave height (crest bright, trough deep) through palette
  float h = w * 0.5 + 0.5;
  vec3 dotCol = mix(c3, c0, smoothstep(0.2, 0.6, h));
  dotCol = mix(dotCol, c2 * 1.15, smoothstep(0.6, 1.0, h));
  vec3 bg = c3 * 0.09;
  vec3 col = mix(bg, dotCol, dotm);

  gl_FragColor = vec4(col, 1.0);
}
