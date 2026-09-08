// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_driftSpeed;     // how fast the colour points wander     (default 0.18)
uniform float u_spread;         // reach of each colour point            (default 1.0)
uniform float u_bleed;          // organic warp of the blend boundaries  (default 0.7)
uniform float u_remix;          // how fast points trade palette hues    (default 0.5)
uniform float u_chroma;         // saturation push on the mixed field    (default 1.45)
uniform float u_grain;          // film grain strength                   (default 0.18)
uniform float u_grainSize;      // grain cell size in device px          (default 1.5)
uniform float u_mouseInfluence; // pointer pull on the colour field      (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// pixel-coordinate hash: the lattice hash above breaks into visible stripes on
// large integer inputs, so grain cells go through this one instead
float phash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
// four-stop colour wheel: phase 0..1 walks c0 -> c1 -> c2 -> c3 -> c0
float wheelW(float s, float c){
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
vec3 wheel(float ph, vec3 c0, vec3 c1, vec3 c2, vec3 c3){
  float s4 = fract(ph) * 4.0;
  float w0 = wheelW(s4, 0.0), w1 = wheelW(s4, 1.0), w2 = wheelW(s4, 2.0), w3 = wheelW(s4, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}
// inverse-distance weight: pure colour near the point, a long soft skirt away
// from it, so the flats stay saturated and only the seams blend
float pointW(vec2 pos, vec2 c, float r){
  vec2 d = (pos - c) / r;
  float d2 = dot(d, d);
  return 1.0 / (d2 * d2 * d2 + 0.02);
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

  // optional pointer pull, gated and zero at rest (u_mouse==0 => no pointer)
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 toM = m - pos;
  pos += toM * mAmt * 0.5 * exp(-dot(toM, toM) * 3.0);

  float t = u_time * u_driftSpeed;

  // soft organic warp so the blends bleed into each other instead of sitting
  // as round spots; low frequency on purpose, this is a gradient not smoke
  vec2 wv = vec2(fbm(pos * 1.3 + t * 0.35), fbm(pos * 1.3 + vec2(7.3, 2.9) - t * 0.3)) - 0.5;
  vec2 q = pos + wv * (0.8 * u_bleed);

  // seven colour points wandering on slow orbits across the whole frame
  vec2 P0 = vec2(-0.62,  0.42) + vec2(sin(t * 0.83 + 0.0), cos(t * 0.71 + 1.0)) * 0.22;
  vec2 P1 = vec2( 0.05,  0.48) + vec2(sin(t * 0.67 + 2.1), cos(t * 0.93 + 0.4)) * 0.24;
  vec2 P2 = vec2( 0.66,  0.34) + vec2(sin(t * 0.91 + 4.0), cos(t * 0.62 + 3.0)) * 0.22;
  vec2 P3 = vec2(-0.55, -0.35) + vec2(sin(t * 0.74 + 5.5), cos(t * 0.86 + 2.4)) * 0.24;
  vec2 P4 = vec2( 0.10, -0.46) + vec2(sin(t * 0.88 + 1.3), cos(t * 0.77 + 4.2)) * 0.22;
  vec2 P5 = vec2( 0.68, -0.30) + vec2(sin(t * 0.69 + 3.3), cos(t * 0.95 + 5.1)) * 0.24;
  vec2 P6 = vec2( 0.00,  0.02) + vec2(sin(t * 0.58 + 0.7), cos(t * 0.64 + 2.8)) * 0.30;

  // each point owns a slot on the palette wheel and slowly trades hues with
  // its neighbours, so the field keeps re-mixing rather than settling
  float rm = u_time * u_remix * 0.02;
  vec3 K0 = wheel(0.000 + rm, c0, c1, c2, c3);
  vec3 K1 = wheel(0.375 + rm, c0, c1, c2, c3);
  vec3 K2 = wheel(0.750 + rm, c0, c1, c2, c3);
  vec3 K3 = wheel(0.500 + rm, c0, c1, c2, c3);
  vec3 K4 = wheel(0.125 + rm, c0, c1, c2, c3);
  vec3 K5 = wheel(0.250 + rm, c0, c1, c2, c3);
  vec3 K6 = wheel(0.625 + rm, c0, c1, c2, c3);

  float r = 0.5 * max(u_spread, 0.2);
  float w0 = pointW(q, P0, r), w1 = pointW(q, P1, r), w2 = pointW(q, P2, r);
  float w3 = pointW(q, P3, r), w4 = pointW(q, P4, r), w5 = pointW(q, P5, r);
  float w6 = pointW(q, P6, r);
  float wsum = w0 + w1 + w2 + w3 + w4 + w5 + w6;
  vec3 col = (w0 * K0 + w1 * K1 + w2 * K2 + w3 * K3 + w4 * K4 + w5 * K5 + w6 * K6) / wsum;

  // saturation push: the blends between points wash toward grey, so pull them
  // back out to the palette chroma and keep the whole field vivid
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, u_chroma);
  // a slow luminous breathing across the field so it reads lit, not printed
  col *= 0.92 + 0.22 * wv.x + 0.12 * wv.y;

  // film grain, baked at device-pixel scale so it is visible in the flats:
  // a luminance boil plus a weaker per-channel colour boil, reseeded ~12x a
  // second so it shimmers rather than sits like a texture
  vec2 cell = mod(floor(gl_FragCoord.xy / max(u_grainSize, 1.0)), 4096.0);
  float fr = mod(floor(u_time * 12.0), 61.0);
  vec2 seed = cell + fr * vec2(37.0, 17.0);
  float g = phash(seed) - 0.5;
  vec3 gc = vec3(phash(seed + vec2(101.0, 0.0)),
                 phash(seed + vec2(0.0, 203.0)),
                 phash(seed + vec2(307.0, 307.0))) - 0.5;
  col += (g * 0.75 + gc * 0.45) * u_grain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
