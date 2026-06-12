precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;          // grid scroll speed toward viewer       (default 0.6)
uniform float u_density;        // grid cell count                      (default 10)
uniform float u_glow;           // line glow strength                   (default 0.7)
uniform float u_sun;            // horizon sun size/brightness           (default 0.7)
uniform float u_mouseInfluence; // pointer steers the vanishing point     (default 0.0)

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

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float t = u_time;

  float vp = 0.0;   // vanishing-point x offset
  vec2 m = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vp += m.x * mAmt * 0.5;

  float horizon = 0.02;
  vec3 col;

  if (uv.y < horizon){
    // perspective ground plane: depth from the horizon line
    float z = 1.0 / (horizon - uv.y + 0.0001);
    float gx = (uv.x - vp) * z;
    float gz = z + t * u_speed * 4.0;

    float N = max(u_density, 3.0) * 0.5;
    // grid lines (distance to nearest line, width grows with depth to stay AA)
    float lx = abs(fract(gx * N) - 0.5) / N;
    float lz = abs(fract(gz * N) - 0.5) / N;
    float wd = 0.012 * z;
    float gridX = smoothstep(wd, 0.0, lx);
    float gridZ = smoothstep(wd, 0.0, lz);
    float grid = max(gridX, gridZ);

    // fade with distance; neon line colour
    float fade = exp(-z * 0.05);
    vec3 lineCol = ramp(c0, c1, c2, c3, 0.7);
    vec3 ground = c3 * 0.06;
    col = mix(ground, lineCol * (1.0 + u_glow), grid * fade);
    col += lineCol * grid * fade * u_glow * 0.5;
  } else {
    // sky with a banded synthwave sun sitting on the horizon
    vec2 sp = vec2(uv.x - vp, uv.y - horizon);
    float sd = length(sp * vec2(1.0, 1.3));
    float sunR = 0.30 * (0.5 + u_sun);
    float sun = smoothstep(sunR, sunR - 0.01, sd);
    // horizontal cut bands across the sun
    float bands = smoothstep(0.0, 0.02, abs(fract(uv.y * 26.0) - 0.5) - 0.18);
    sun *= mix(1.0, bands, smoothstep(0.0, 0.12, uv.y));

    vec3 sky = mix(c3 * 0.18, vec3(0.02, 0.02, 0.04), smoothstep(0.0, 0.7, uv.y));
    vec3 sunCol = ramp(c0, c1, c2, c3, smoothstep(sunR, -0.1, sd));
    col = mix(sky, sunCol * (1.0 + u_sun * 0.6), sun);
    // horizon glow line
    col += ramp(c0,c1,c2,c3,0.6) * exp(-abs(uv.y - horizon) * 30.0) * (0.4 + u_glow * 0.6);
  }

  gl_FragColor = vec4(col, 1.0);
}
