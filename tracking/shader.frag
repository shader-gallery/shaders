// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_warp;           // horizontal wobble / jitter           (default 0.5)
uniform float u_bleed;          // chroma bleed amount                  (default 0.5)
uniform float u_tracking;       // tracking-error band severity          (default 0.6)
uniform float u_rollSpeed;      // how fast the error band rolls         (default 0.3)
uniform float u_mouseInfluence; // pointer disturbs tracking at its row   (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash1(float n){ return fract(sin(n * 78.233) * 43758.5453); }

vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x){
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(c3, c0, smoothstep(0.0, 0.34, x));
  a = mix(a, c1, smoothstep(0.34, 0.67, x));
  a = mix(a, c2, smoothstep(0.67, 1.0, x));
  return a;
}

// the taped "content": soft horizontal colour bands drifting
vec3 content(vec2 uv, vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t){
  float b = uv.y * 5.0 + 0.15 * sin(uv.x * 3.0 + t * 0.4) + t * 0.05;
  float tone = fract(b);
  return ramp(c0, c1, c2, c3, tone) * (0.8 + 0.2 * sin(uv.x * 6.0 + t));
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time;

  // per-scanline horizontal jitter + a slow wavy warp (tape wobble)
  float lineH = u_resolution.y / max(u_pixelRatio, 1.0);
  float line = floor(uv.y * lineH * 0.5);
  float jit = (hash(vec2(line, floor(t * 24.0))) - 0.5) * 0.04 * u_warp;
  float wob = sin(uv.y * 11.0 + t * 1.5) * 0.008 * u_warp
            + (hash(vec2(floor(t * 6.0), line * 0.1)) - 0.5) * 0.02 * u_warp;
  float xoff = jit + wob;

  // rolling tracking-error band: a region that desyncs hard
  float bandPos = fract(-t * u_rollSpeed);
  float bd = abs(fract(uv.y - bandPos) - 0.0);
  bd = min(bd, 1.0 - bd);
  float band = smoothstep(0.10, 0.0, bd) * u_tracking;

  vec2 m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  band = max(band, mAmt * smoothstep(0.06, 0.0, abs(uv.y - m.y)));

  // in the band: big horizontal smear + noise
  xoff += band * ((hash(vec2(line, floor(t * 40.0))) - 0.5) * 0.5);

  // chroma bleed: sample content with R/B horizontal offsets
  float sp = (0.004 + 0.02 * band) * u_bleed + 0.01 * band;
  vec3 cR = content(vec2(uv.x + xoff + sp, uv.y), c0, c1, c2, c3, t);
  vec3 cG = content(vec2(uv.x + xoff,      uv.y), c0, c1, c2, c3, t);
  vec3 cB = content(vec2(uv.x + xoff - sp, uv.y), c0, c1, c2, c3, t);
  vec3 col = vec3(cR.r, cG.g, cB.b);

  // band adds desync noise streaks + brightening (snow)
  float snow = hash(vec2(uv.x * 220.0, floor(t * 50.0) + line));
  col = mix(col, vec3(snow), band * 0.6);
  col += vec3(0.8) * band * step(0.93, snow) * 0.5;

  // VHS scanlines + slight head-switching dropout at the very bottom
  float sl = 0.5 + 0.5 * sin(gl_FragCoord.y / max(u_pixelRatio, 1.0) * 3.14159);
  col *= 0.85 + 0.15 * sl;
  col *= smoothstep(0.0, 0.04, uv.y);    // dropout strip at bottom edge

  gl_FragColor = vec4(col, 1.0);
}
