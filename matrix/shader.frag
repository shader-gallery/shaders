// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cols;           // glyph columns                       (default 24)
uniform float u_speed;          // fall speed                          (default 0.6)
uniform float u_trail;          // trail length (fraction of height)     (default 0.5)
uniform float u_churn;          // how fast glyphs re-roll              (default 3)
uniform float u_mouseInfluence; // pointer brightens nearby columns      (default 0.0)

const float STROKE = 0.07;      // glyph stroke half-width (glyph space)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash1(float n){ return fract(sin(n * 78.233) * 43758.5453); }

float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// a small alphabet of angular code-symbols, drawn as line-segment SDFs
// (katakana / digit feel) — u in roughly [-0.45,0.45] x [-0.5,0.5]
float glyphDist(vec2 u, float gid){
  float d = 1e3;
  if (gid < 0.5) {
    // vertical spine + top bar + kicked diagonal (katakana-ish)
    d = min(sdSeg(u, vec2(0.0, 0.46), vec2(0.0, -0.46)),
            sdSeg(u, vec2(-0.30, 0.30), vec2(0.30, 0.30)));
    d = min(d, sdSeg(u, vec2(0.04, 0.18), vec2(0.30, -0.20)));
  } else if (gid < 1.5) {
    // three stacked bars (三)
    d = min(min(sdSeg(u, vec2(-0.32, 0.30), vec2(0.32, 0.30)),
                sdSeg(u, vec2(-0.24, 0.0),  vec2(0.24, 0.0))),
            sdSeg(u, vec2(-0.32, -0.30), vec2(0.32, -0.30)));
  } else if (gid < 2.5) {
    // plus / cross
    d = min(sdSeg(u, vec2(-0.32, 0.0), vec2(0.32, 0.0)),
            sdSeg(u, vec2(0.0, 0.40), vec2(0.0, -0.40)));
  } else if (gid < 3.5) {
    // bracket ⊐ : top bar, right spine, bottom bar
    d = min(min(sdSeg(u, vec2(-0.20, 0.40), vec2(0.28, 0.40)),
                sdSeg(u, vec2(0.28, 0.40), vec2(0.28, -0.40))),
            sdSeg(u, vec2(-0.20, -0.40), vec2(0.28, -0.40)));
  } else if (gid < 4.5) {
    // Y fork on a stem (katakana ﾅ feel)
    d = min(min(sdSeg(u, vec2(-0.28, 0.42), vec2(0.0, 0.06)),
                sdSeg(u, vec2(0.28, 0.42), vec2(0.0, 0.06))),
            sdSeg(u, vec2(0.0, 0.06), vec2(0.0, -0.44)));
  } else if (gid < 5.5) {
    // Z : top bar, diagonal, bottom bar
    d = min(min(sdSeg(u, vec2(-0.30, 0.40), vec2(0.30, 0.40)),
                sdSeg(u, vec2(0.30, 0.40), vec2(-0.30, -0.40))),
            sdSeg(u, vec2(-0.30, -0.40), vec2(0.30, -0.40)));
  } else if (gid < 6.5) {
    // ﾄ : tall spine + right mid-bar + short top tick
    d = min(sdSeg(u, vec2(-0.05, 0.44), vec2(-0.05, -0.44)),
            sdSeg(u, vec2(-0.05, 0.08), vec2(0.30, 0.08)));
    d = min(d, sdSeg(u, vec2(-0.22, 0.30), vec2(-0.05, 0.30)));
  } else {
    // box with an inner tick (data-cell feel)
    d = min(min(sdSeg(u, vec2(-0.28, 0.36), vec2(0.28, 0.36)),
                sdSeg(u, vec2(0.28, 0.36), vec2(0.28, -0.36))),
            min(sdSeg(u, vec2(0.28, -0.36), vec2(-0.28, -0.36)),
                sdSeg(u, vec2(-0.28, -0.36), vec2(-0.28, 0.36))));
    d = min(d, sdSeg(u, vec2(0.0, 0.12), vec2(0.0, -0.12)));
  }
  return d;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;

  float NX = max(u_cols, 8.0);
  float colId = floor(uv.x * NX);
  float NY = floor(NX / aspect * 1.35);     // slightly tall cells for the glyphs
  float cellRow = floor(uv.y * NY);

  // per-column fall: bright HEAD descends (head row decreases over time)
  float speed = u_speed * (0.45 + hash1(colId) * 1.3);
  float headRow = floor(fract(hash1(colId) * 1.7 - t * speed * 0.18) * NY);
  float dist = mod(cellRow - headRow, NY);
  float trail = max(u_trail * NY, 1.0);
  float b = clamp(1.0 - dist / trail, 0.0, 1.0);
  b *= b;
  float head = step(dist, 0.5);

  vec2 m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float mGlow = mAmt * smoothstep(1.5 / NX, 0.0, abs(uv.x - m.x));

  // glyph: pick a symbol per cell, re-rolling as the rain passes
  vec2 cuv = fract(vec2(uv.x * NX, uv.y * NY));
  float chFrame = floor(t * u_churn + hash(vec2(colId, cellRow)) * 9.0);
  float gid = floor(hash(vec2(colId, cellRow) * 1.7 + chFrame * 0.31) * 8.0);
  vec2 gu = (cuv - 0.5) * vec2(0.92, 1.0);
  float gd = glyphDist(gu, gid);
  float aa = clamp(1.6 * NY / u_resolution.y, 0.004, 0.12);
  float glyph = smoothstep(STROKE + aa, STROKE - aa, gd);

  // colour: green trail (dark → bright), leading glyph SHINES white
  float lit = max(b, mGlow);
  vec3 trailCol = mix(c3 * 0.5, c0, lit);
  trailCol = mix(trailCol, c2, lit * lit);
  vec3 col = trailCol * lit;
  col += vec3(0.85, 1.0, 0.9) * head * (0.9 + mGlow);
  col *= glyph;
  col = max(col, c3 * 0.03);

  gl_FragColor = vec4(col, 1.0);
}
