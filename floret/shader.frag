precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spin;           // rotation speed of the spiral          (default 0.3)
uniform float u_spacing;        // seed spacing / overall size           (default 0.062)
uniform float u_dotSize;        // dot radius vs spacing                  (default 0.62)
uniform float u_pulse;          // brightness wave travelling outward     (default 0.5)
uniform float u_mouseInfluence; // pointer nudges the spiral centre        (default 0.0)

const int N = 160;
const float GA = 2.399963;   // golden angle in radians (137.5 deg)

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
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  p -= m * mAmt * 0.3;

  float t = u_time;
  float sp = max(u_spacing, 0.02);
  float aa = clamp(2.0 / u_resolution.y, 0.001, 0.05);

  vec3 col = c3 * 0.08;     // dark ground
  // place phyllotaxis seeds; keep only the nearest-contributing dot per pixel
  for (int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * GA + t * u_spin;
    float rad = sqrt(fi) * sp;
    vec2 s = rad * vec2(cos(ang), sin(ang));
    float d = length(p - s);
    float dotR = sp * u_dotSize * (0.72 + 0.28 * sqrt(fi / float(N)));  // grow outward
    float mask = smoothstep(dotR + aa, dotR - aa, d);
    // colour by radius; a brightness pulse rides outward through the seeds
    float idx = fi / float(N);
    float pulse = 0.78 + 0.45 * sin(rad * 10.0 - t * 3.0) * u_pulse;
    vec3 seedCol = ramp(c0, c1, c2, c3, idx) * (1.18 * pulse);
    col = mix(col, seedCol, mask);
  }

  gl_FragColor = vec4(col, 1.0);
}
