// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cells;          // hex count across the frame           (default 9)
uniform float u_bevel;          // bevel width / depth                  (default 0.5)
uniform float u_flow;           // speed of the glow path               (default 0.5)
uniform float u_litFrac;        // fraction of cells lit                (default 0.4)
uniform float u_mouseInfluence; // pointer lights nearby cells           (default 0.0)

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hexDist(vec2 p){
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

// hex tiling: returns local coords (xy) + cell id (zw)
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

  float t = u_time;
  float N = max(u_cells, 3.0);
  vec4 hc = hexCoords(p * N);
  vec2 gv = hc.xy;
  vec2 id = hc.zw;

  float hd = hexDist(gv);                 // 0 centre .. 0.5 edge
  float edge = 0.5;
  float bw = mix(0.06, 0.26, clamp(u_bevel, 0.0, 1.0));

  // bevel: flat top inside, chamfered ring near the edge, dark groove between
  float topFlat = smoothstep(edge - bw, edge - bw - 0.02, hd);   // 1 on flat top
  float face = smoothstep(edge, edge - bw, hd);                  // 1 inside hex incl bevel
  float groove = 1.0 - smoothstep(edge - 0.03, edge, hd);        // ~1 inside, 0 in gaps

  // bevel normal ~ outward direction in the chamfer ring; light it
  vec2 nrm = normalize(gv + 1e-4);
  vec3 L = normalize(vec2(-0.55, 0.8)).xyy * vec3(1.0, 1.0, 0.0) + vec3(0.0, 0.0, 0.7);
  float bevelRing = face * (1.0 - topFlat);
  float shade = 0.5 + 0.5 * dot(nrm, normalize(vec2(-0.55, 0.8)));  // -? bright on lit side

  // per-cell lit state: a travelling glow path + random twinkle
  float rnd = hash21(id);
  float wave = 0.5 + 0.5 * sin(t * u_flow + id.x * 0.7 + id.y * 0.5);
  float lit = step(1.0 - clamp(u_litFrac, 0.0, 1.0), wave * 0.6 + rnd * 0.4);

  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  lit = max(lit, mAmt * smoothstep(0.5, 0.0, length(id / N - m)));

  // base cell colour from id, lit cells brighter through palette
  vec3 baseCol = mix(c3, c0, rnd);
  vec3 litCol = mix(c1, c2, rnd) * 1.25;
  vec3 cell = mix(baseCol * 0.5, litCol, lit);

  // compose: dark gaps -> beveled face; top flat full, bevel ring shaded
  vec3 col = vec3(0.02, 0.02, 0.03);
  vec3 faceCol = cell * (0.55 + 0.55 * topFlat);          // flat top brightest
  faceCol *= mix(1.0, 0.45 + 0.9 * shade, bevelRing);     // chamfer light/shadow
  col = mix(col, faceCol, groove);

  gl_FragColor = vec4(col, 1.0);
}
