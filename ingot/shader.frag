precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sweepSpeed;     // speed the highlight sweeps the sheet (default 0.35)
uniform float u_brush;          // coarseness of the brushed grooves    (default 0.6)
uniform float u_sheen;          // brightness/sharpness of the highlight (default 0.7)
uniform float u_anisotropy;     // how stretched the highlight is        (default 0.7)
uniform float u_mouseInfluence; // pointer tilt of the sheet             (default 0.0)

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
  vec2 q = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  float t = u_time;

  // optional pointer tilt — shifts where the sheet "faces" the light
  vec2 mo = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 tilt = mo * mAmt * 0.5;

  // brushed grooves run horizontally: brightness varies fast across y (between
  // grooves) and slowly along x — the anisotropic signature of brushed metal
  float bf = mix(60.0, 340.0, u_brush);
  float groove = vnoise(vec2(q.x * 5.0, q.y * bf)) * 0.6
               + vnoise(vec2(q.x * 11.0, q.y * bf * 2.3)) * 0.4;
  // micro-glint along the grooves
  float glint = vnoise(vec2(q.x * 220.0, q.y * bf)) ;

  // surface "normal" tilt from the grooves (mostly in the cross-brush axis)
  float ny = (groove - 0.5);

  // a couple of broad highlight bands sweeping vertically across the sheet —
  // these are the studio lights the metal catches. Anisotropy stretches them
  // wide in x and narrow in y.
  float sweep = 0.30 * sin(t * u_sweepSpeed) + tilt.y;
  float yc = q.y + ny * 0.12 - sweep;
  float bandW = mix(0.05, 0.26, u_anisotropy);
  float band1 = exp(-(yc * yc) / (bandW * bandW));
  float yc2 = q.y + ny * 0.12 - (sweep * 0.6 - 0.28);
  float band2 = exp(-(yc2 * yc2) / (bandW * bandW * 0.5)) * 0.6;

  // base metal: vertical gradient between palette tones, brush-modulated so the
  // grooves read as fine reflectance variation
  float vgrad = smoothstep(-0.55, 0.55, q.y + tilt.y);
  vec3 metal = mix(c3 * 0.55, c0 * 1.0, vgrad);
  metal = mix(metal, c1 * 1.05, vgrad * vgrad * 0.5);
  metal *= 0.78 + 0.34 * groove;          // brushed reflectance streaks

  // highlights — bright, palette-warm, sharpened by the brush glint
  float hl = (band1 + band2) * (0.6 + 0.8 * glint);
  vec3 col = metal + (c2 * 1.2 + 0.2) * hl * u_sheen;
  // a hot core in the brightest band reads as polished metal catching the light
  col += vec3(1.0) * pow(band1, 3.0) * glint * u_sheen * 0.6;

  gl_FragColor = vec4(col, 1.0);
}
