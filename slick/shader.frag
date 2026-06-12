precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_driftSpeed;     // how fast the slick churns        (default 0.22)
uniform float u_warp;           // domain-warp / oily folding depth  (default 1.05)
uniform float u_scale;          // blob feature scale, frame-rel     (default 1.5)
uniform float u_sheen;          // iridescent band sharpness         (default 0.65)
uniform float u_mouseInfluence; // pointer pull on the field         (default 0.0)

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
  for (int i = 0; i < 5; i++){
    s += a * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return s;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  // frame-relative coords: blob COUNT holds tile->fullsize (anchored to uv)
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * (max(u_scale, 0.2) * 2.0);

  // optional pointer pull, gated and zero at rest (u_mouse==0 => no pointer)
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  p += m * mAmt * 0.6;

  float t = u_time * u_driftSpeed;
  float warp = max(u_warp, 0.0);

  // iq domain warp — two stages of fbm feedback for liquid folds
  vec2 q = vec2(fbm(p + t * 0.6),
                fbm(p + vec2(5.2, 1.3) - t * 0.5));
  vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + t * 0.4),
                fbm(p + warp * q + vec2(8.3, 2.8) - t * 0.3));
  float f = fbm(p + warp * r);

  // iridescent banding — fold the field through a sine so thin-film colour
  // bands sweep through it (the oil-slick signature)
  float band = 0.5 + 0.5 * sin(6.2831 * (f * 1.6 + length(r) * (0.4 + u_sheen)) + t);

  // blend the four palette poles by the warped field + the iridescent bands
  vec3 col = mix(c0, c1, clamp(length(q) * 1.1, 0.0, 1.0));
  col = mix(col, c2, clamp(r.x * 1.25, 0.0, 1.0));
  col = mix(col, c3, clamp(band, 0.0, 1.0));
  // thin-film shimmer: a touch of the cool pole peaking on the band crests
  col = mix(col, c2, 0.22 * band * band);

  // gentle depth shading so the folds read as a surface, not a flat wash
  col *= 0.82 + 0.30 * f;

  gl_FragColor = vec4(col, 1.0);
}
