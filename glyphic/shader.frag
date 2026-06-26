// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cols;           // character columns                   (default 34)
uniform float u_flow;           // drift speed of the underlying image   (default 0.35)
uniform float u_contrast;       // brightness-to-density contrast        (default 0.6)
uniform float u_churn;          // how fast characters re-roll           (default 2.0)
uniform float u_mouseInfluence; // pointer brightens the image            (default 0.0)

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
  float NY = floor(NX / aspect);
  vec2 cellId = floor(uv * vec2(NX, NY));
  vec2 cuv = fract(uv * vec2(NX, NY));
  vec2 cellCentre = (cellId + 0.5) / vec2(NX, NY);

  // the underlying "image": a drifting field centred near mid-grey (so glyph
  // density spans sparse..dense) with two soft moving glows as the subject
  vec2 q = (cellCentre - 0.5) * vec2(aspect, 1.0);
  float img = vnoise(q * 2.6 + vec2(t * u_flow, -t * u_flow * 0.7));   // 0..1
  img = img * 0.55 + 0.04;                                            // mostly low/mid
  vec2 b1 = vec2(0.32 * sin(t * 0.4), 0.24 * cos(t * 0.5));
  vec2 b2 = vec2(-0.34 * cos(t * 0.3), 0.20 * sin(t * 0.45));
  img += 0.42 * exp(-dot(q - b1, q - b1) * 3.0) + 0.34 * exp(-dot(q - b2, q - b2) * 4.5);

  vec2 m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  img += mAmt * 0.6 * exp(-dot(cellCentre - m, cellCentre - m) * 6.0);

  // map brightness through a contrast curve → target glyph density 0..1
  float b = clamp((img - 0.5) * (0.6 + u_contrast * 1.6) + 0.5, 0.0, 1.0);

  // a per-cell character that re-rolls slowly; coverage tracks brightness so
  // dark cells show sparse marks, bright cells dense ones (ASCII ramp)
  float cFrame = floor(t * u_churn + hash(cellId) * 7.0);
  vec2 sub = floor(cuv * vec2(3.0, 5.0));
  float on = step(1.0 - b, hash(sub + cellId * 1.7 + cFrame));
  float margin = step(0.08, cuv.x) * step(cuv.x, 0.92) * step(0.06, cuv.y) * step(cuv.y, 0.94);
  on *= margin;

  // colour: dim-to-bright through the palette by brightness; lit glyphs glow
  vec3 glyphCol = mix(c0, c2, smoothstep(0.4, 1.0, b));
  vec3 col = glyphCol * on * (0.4 + 0.8 * b);
  col = max(col, c3 * 0.04);

  gl_FragColor = vec4(col, 1.0);
}
