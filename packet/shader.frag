precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cols;           // byte cells across a row             (default 26)
uniform float u_speed;          // data scroll speed                   (default 0.5)
uniform float u_burst;          // density of bright packet bursts      (default 0.5)
uniform float u_churn;          // how fast byte values change          (default 2)
uniform float u_mouseInfluence; // pointer lights its row               (default 0.0)

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
  float row = floor(uv.y * NY);

  // each row streams its data leftward at its own rate
  float speed = u_speed * (0.5 + hash1(row) * 1.3);
  float xs = uv.x + t * speed;
  float cellX = floor(xs * NX);
  vec2 cellUV = vec2(fract(xs * NX), fract(uv.y * NY));

  // byte value per cell, re-rolling slowly (data updating)
  float vframe = floor(t * u_churn + hash1(row) * 5.0);
  float val = hash(vec2(cellX, row) + vframe * 0.37);

  // packet bursts: contiguous runs of bright cells travelling along the row
  float burstId = floor(xs * NX * 0.25 - t * speed * 0.6);
  float burst = step(1.0 - 0.5 * u_burst, hash(vec2(burstId, row + 3.0)));

  vec2 mp = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float mRow = mAmt * smoothstep(1.5 / NY, 0.0, abs(uv.y - mp.y));

  // byte cell as a filled block with a gap (data-grid feel)
  float margin = step(0.10, cellUV.x) * step(cellUV.x, 0.90)
               * step(0.14, cellUV.y) * step(cellUV.y, 0.86);

  // brightness: dim ambient by value, bright where a burst passes / mouse row
  float lit = 0.18 + 0.35 * val;
  lit = max(lit, burst * (0.7 + 0.3 * val));
  lit = max(lit, mRow * 0.9);

  // a vertical read cursor sweeping across, briefly lighting a column
  float cur = smoothstep(0.02, 0.0, abs(fract(uv.x - t * 0.13) - 0.5) - 0.0);
  lit = max(lit, cur * 0.6);

  vec3 cell = ramp(c0, c1, c2, c3, val * 0.5 + burst * 0.4 + 0.1);
  vec3 col = mix(c3 * 0.06, cell * (0.4 + 1.1 * lit), margin);
  col += cell * burst * margin * 0.3;        // glow on active packets

  gl_FragColor = vec4(col, 1.0);
}
