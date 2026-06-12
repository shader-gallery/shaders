precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;          // terrain feature scale                (default 1.4)
uniform float u_lines;          // contour line count                   (default 14)
uniform float u_emboss;         // hillshade / relief strength           (default 0.7)
uniform float u_drift;          // how fast the terrain morphs           (default 0.25)
uniform float u_mouseInfluence; // pointer pushes the terrain up          (default 0.0)

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
float fbm(vec2 p){
  float s = 0.0, a = 0.55;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = rot * p * 2.02 + vec2(11.3, 7.1); a *= 0.5; }
  return s;
}

vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x){
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(c3, c0, smoothstep(0.0, 0.34, x));
  a = mix(a, c1, smoothstep(0.34, 0.67, x));
  a = mix(a, c2, smoothstep(0.67, 1.0, x));
  return a;
}

float terrain(vec2 p, float t){ return fbm(p + vec2(t * 0.4, -t * 0.2)); }

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * (max(u_scale, 0.3) * 2.5);

  float t = u_time * u_drift;
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0) * (max(u_scale,0.3)*2.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  float h = terrain(p, t);
  h += mAmt * 0.4 * exp(-dot(p - m, p - m) * 0.3);

  // height gradient → hillshade emboss (carved relief)
  float e = 0.012 * max(u_scale, 0.3) * 2.5;
  float hx = terrain(p + vec2(e, 0.0), t) - terrain(p - vec2(e, 0.0), t);
  float hy = terrain(p + vec2(0.0, e), t) - terrain(p - vec2(0.0, e), t);
  vec3 n = normalize(vec3(-hx, -hy, e * 1.4));
  vec3 L = normalize(vec3(-0.5, 0.7, 0.55));
  float hill = clamp(dot(n, L), 0.0, 1.0);

  // crisp contour bands at regular elevations
  float lines = max(u_lines, 3.0);
  float band = abs(fract(h * lines) - 0.5) * 2.0;     // 0 on a contour
  float lw = clamp(2.5 * lines / u_resolution.y * 60.0, 0.04, 0.4);
  float contour = smoothstep(lw, 0.0, band);
  // every 5th line heavier (index contours)
  float major = smoothstep(0.12, 0.0, abs(fract(h * lines / 5.0) - 0.0));

  // colour by elevation, shaded by the hillshade, contours inked darker+rim
  vec3 col = ramp(c0, c1, c2, c3, h);
  col *= mix(1.0 - u_emboss * 0.7, 1.0 + u_emboss * 0.45, hill);
  col = mix(col, c3 * 0.25, contour * 0.8);            // dark contour ink
  col += c2 * contour * 0.25 * hill;                   // lit edge on the ink
  col += c1 * major * 0.2;

  gl_FragColor = vec4(col, 1.0);
}
