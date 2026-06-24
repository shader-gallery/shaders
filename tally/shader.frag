// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cols;           // number of LED columns                (default 28)
uniform float u_speed;          // how fast the bars bounce             (default 1.0)
uniform float u_dotSize;        // LED dot size                         (default 0.7)
uniform float u_glowOff;        // brightness of the unlit grid dots     (default 0.12)
uniform float u_mouseInfluence; // pointer drives a bar up               (default 0.0)

float hash(float n){ return fract(sin(n * 43758.5453) * 1.0 + n * 0.0001); }

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

  float t = u_time * u_speed;
  // LED grid: square cells; columns set by u_cols, rows follow aspect so dots
  // stay round and the board fills the frame
  float NX = max(u_cols, 6.0);
  float NY = floor(NX / aspect + 0.5);
  vec2 cellId = floor(uv * vec2(NX, NY));
  vec2 g = fract(uv * vec2(NX, NY)) - 0.5;
  g.x *= aspect / (NY / NX < 1.0 ? 1.0 : 1.0);     // keep round (square cells)

  float colX = cellId.x;
  float rowFrac = (cellId.y + 0.5) / NY;           // 0 bottom .. 1 top

  // per-column bouncing bar height (layered sines keyed by a column hash)
  float seed = hash(colX + 1.0);
  float h = 0.5
          + 0.32 * sin(t * (1.3 + seed) + seed * 30.0)
          + 0.18 * sin(t * (2.1 + seed * 1.7) + seed * 12.0);
  // pointer pushes the nearest column to full
  vec2 m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float mCol = floor(m.x * NX);
  h = mix(h, 1.05, mAmt * step(abs(colX - mCol), 0.5));
  h = clamp(h, 0.05, 1.0);

  float lit = step(rowFrac, h);                    // dots below the bar top are on
  float peak = step(abs(rowFrac - h), 0.6 / NY);   // a peak-hold cap dot

  // round LED dot
  float d = length(g);
  float radius = u_dotSize * 0.5;
  float aa = clamp(1.5 * NX / u_resolution.x, 0.004, 0.2);
  float dotm = smoothstep(radius + aa, radius - aa, d);

  // VU colour by height: cool/low -> warm/high through the palette
  vec3 onCol = ramp(c0, c1, c2, c3, rowFrac * 0.9 + 0.05);
  vec3 ledOff = c3 * u_glowOff;
  vec3 led = mix(ledOff, onCol, max(lit, peak));
  vec3 bg = c3 * 0.05;
  vec3 col = mix(bg, led, dotm);

  gl_FragColor = vec4(col, 1.0);
}
