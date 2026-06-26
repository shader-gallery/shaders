// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cells;          // cube count across the frame          (default 8)
uniform float u_rise;           // height-pulse amount                  (default 0.6)
uniform float u_speed;          // how fast cubes rise and fall         (default 0.5)
uniform float u_contrast;       // face shading contrast                (default 0.7)
uniform float u_mouseInfluence; // pointer raises nearby cubes           (default 0.0)

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hexDist(vec2 p){
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}
vec4 hexCoords(vec2 uv){
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, uv - gv);
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

  float t = u_time * u_speed;
  float N = max(u_cells, 3.0);
  vec4 hc = hexCoords(p * N);
  vec2 gv = hc.xy;
  vec2 id = hc.zw;

  // three cube faces: pick by which face-direction the local point leans toward
  float dT = dot(gv, vec2(0.0, 1.0));
  float dL = dot(gv, vec2(-0.866, -0.5));
  float dR = dot(gv, vec2(0.866, -0.5));

  float k = clamp(u_contrast, 0.0, 1.0);
  float topS   = mix(0.9, 1.15, 1.0);
  float leftS  = mix(0.7, 0.34, k);
  float rightS = mix(0.8, 0.6, k);
  float faceShade;
  if (dT >= dL && dT >= dR) faceShade = mix(0.95, 1.15, k);
  else if (dR >= dL)        faceShade = rightS;
  else                      faceShade = leftS;

  // per-cube colour + rising height (pulse) → block cityscape
  float rnd = hash21(id);
  float rise = 0.5 + 0.5 * sin(t + rnd * 6.2831);
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  rise = mix(rise, 1.0, mAmt * smoothstep(0.4, 0.0, length(id / N - m)));

  vec3 cubeCol = mix(c3, c0, rnd);
  cubeCol = mix(cubeCol, c2, smoothstep(0.6, 1.0, rnd) * 0.5);
  // taller cubes read brighter (lit from above)
  cubeCol *= 0.6 + u_rise * 0.7 * rise;

  // crisp edges between the 3 faces (the cube's near silhouette lines)
  float e1 = abs(dT - dL), e2 = abs(dT - dR), e3 = abs(dL - dR);
  float edge = smoothstep(0.0, 0.02, min(min(e1, e2), e3));
  // dark groove at hex boundary
  float groove = smoothstep(0.5, 0.46, hexDist(gv));

  vec3 col = cubeCol * faceShade;
  col *= mix(0.6, 1.0, edge);              // darken the inner face seams
  col = mix(vec3(0.02, 0.02, 0.03), col, groove);

  gl_FragColor = vec4(col, 1.0);
}
