// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// laminar (Current) — smooth horizontal streamlines of a steady flow gliding
// past an invisible bluff body. The lines part cleanly around the obstacle and
// rejoin downstream, crowding bright where the flow squeezes and accelerates over
// the shoulders and opening calm in the far field — never crossing, never breaking
// (laminar). Add circulation and the flow goes asymmetric, wrapping the body in a
// Magnus spin. Luminous packets ride the lines downstream and a near and far sheet
// parallax for depth. Built from the exact streamfunction of uniform flow plus a
// doublet plus a bound vortex, so the picture is the real flow, not a fake.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four streamline colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_density;   // streamlines across the frame                (default 22)
uniform float u_radius;    // obstacle radius, fraction of short axis      (default 0.22)
uniform float u_flow;      // speed the luminous packets ride downstream   (default 0.5)
uniform float u_spin;      // circulation: asymmetry / Magnus wrap         (default 0)
uniform float u_posY;      // obstacle vertical position                   (default 0)
uniform float u_line;      // streamline width in CSS px                   (default 1.6)
uniform float u_glow;      // overall emission                             (default 1.0)
uniform float u_hueSpread; // how far hue ranges across the streamlines    (default 0.9)
uniform float u_depth;     // near/far parallax + far-sheet dimming        (default 0.8)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU = 6.2831853;
const float OBX = -0.32;                      // obstacle x: left third (rule of thirds)

// smooth cyclic colour from the 4-stop palette (no hard seam at the wrap)
vec3 wheel(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = max(0.0, 1.0 - min(abs(s - 0.0), 4.0 - abs(s - 0.0)));
  float w1 = max(0.0, 1.0 - min(abs(s - 1.0), 4.0 - abs(s - 1.0)));
  float w2 = max(0.0, 1.0 - min(abs(s - 2.0), 4.0 - abs(s - 2.0)));
  float w3 = max(0.0, 1.0 - min(abs(s - 3.0), 4.0 - abs(s - 3.0)));
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// streamfunction of uniform +x flow past a cylinder, plus a bound vortex:
//   psi = Y(1 - R^2/r^2) - (spin) * 0.5 * ln(r^2)
float psiAt(vec2 d, float R2, float spin) {
  float r2 = max(dot(d, d), 1e-4);
  return d.y * (1.0 - R2 / r2) - spin * 0.5 * log(r2);
}

// one sheet of streamlines. returns line intensity; writes the streamfunction
// (for hue) into psiOut. brightness follows local flow speed -> bright crowded
// shoulders, calm far field.
float sheet(vec2 p, vec2 ctr, float R, float spin, float density, float flowPhase,
            float lineW, out float psiOut) {
  vec2  d  = p - ctr;
  float R2 = R * R;
  float psi = psiAt(d, R2, spin);
  psiOut = psi;

  // local flow speed via central differences -> Venturi shoulder glow + crowding
  float e  = 0.01;
  float dx = psiAt(d + vec2(e, 0.0), R2, spin) - psiAt(d - vec2(e, 0.0), R2, spin);
  float dy = psiAt(d + vec2(0.0, e), R2, spin) - psiAt(d - vec2(0.0, e), R2, spin);
  float speed = length(vec2(dy, -dx)) / (2.0 * e);

  // contour lines at even psi intervals -> the streamlines themselves
  float v   = psi * density;
  float lf  = abs(fract(v) - 0.5) * 2.0;        // 0 on a streamline, 1 between
  float w   = (0.16 + 0.10 * smoothstep(0.0, 1.5, dot(d, d))) * lineW;
  float line = smoothstep(w, 0.0, lf);

  // brighten where the flow accelerates (over the shoulders), dim the calm field
  line *= 0.5 + 0.9 * smoothstep(0.3, 2.4, speed);

  // luminous packets riding downstream along x -> the current appears to move
  float packet = 0.55 + 0.45 * sin(p.x * 5.0 - flowPhase + d.y * 1.5);
  line *= 0.45 + 0.55 * packet * packet;

  // fade the lines out inside the solid body so the obstacle reads as a void
  float body = smoothstep(R * 0.86, R * 1.04, length(d));
  return line * body;
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

  float density = max(u_density, 3.0);   // streamlines across the psi range (~1.0)
  float R       = clamp(u_radius, 0.04, 0.45);
  float flow    = u_time * u_flow * TAU * 0.6;
  float spin    = u_spin;
  float glow    = max(u_glow, 0.0);
  float depthAmt= clamp(u_depth, 0.0, 1.0);
  float lineW   = max(u_line, 0.3) / 1.6;        // 1.0 at the default css-px width
  float spread  = max(u_hueSpread, 0.0);

  // a small constant vertical sway keeps the steady flow gently alive + looping
  float cy   = clamp(u_posY, -0.42, 0.42) + 0.03 * sin(u_time * 0.18 * TAU * 0.25);
  vec2  ctr  = vec2(OBX, cy);

  // far sheet: denser, fainter, parallax-shifted; near sheet: bold packets
  float psiF, psiN;
  float far  = sheet(p * (1.0 + 0.05 * depthAmt) + vec2(0.0, 0.04 * depthAmt),
                     ctr, R * 1.12, spin, density * 1.5, flow * 0.7, lineW, psiF);
  float near = sheet(p, ctr, R, spin, density, flow, lineW, psiN);

  // hue from the streamfunction: streamlines diverge across the palette by band
  float hueN = psiN * spin + psiN * 0.9 * spread + 0.5 + u_time * 0.015;
  float hueF = psiF * spin + psiF * 0.9 * spread + 0.5 + u_time * 0.015;
  vec3  nearCol = wheel(c0, c1, c2, c3, hueN);
  vec3  farCol  = wheel(c0, c1, c2, c3, hueF);

  vec3 col = BG;
  float farBright = 0.45 * (1.0 - 0.4 * depthAmt);
  col += farCol  * far  * farBright * glow;
  col += nearCol * near * 1.0       * glow;

  // bespoke flow-following wash so the calm gaps are not dead-black: a dim
  // streamline-coloured fill, brightest where the flow crowds over the body.
  vec2  d0    = p - ctr;
  float crowd = exp(-length(d0 * vec2(0.7, 1.0)) * 1.1);
  vec3  washCol = wheel(c0, c1, c2, c3, p.y * 0.7 + 0.5);
  col += washCol * (0.025 + 0.10 * crowd) * glow;

  // filmic shoulder keeps the crowded bright streamlines from clipping flat
  col = col / (col + vec3(0.9)) * 1.5;

  // dither against banding in the smooth wash / packet gradients
  col += (fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
