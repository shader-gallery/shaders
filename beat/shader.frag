precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_freq;           // ring frequency across the frame      (default 26)
uniform float u_detune;         // scale mismatch driving the moiré      (default 0.12)
uniform float u_drift;          // how the two centres wander            (default 0.4)
uniform float u_crisp;          // band sharpness                        (default 0.6)
uniform float u_mouseInfluence; // pointer pulls one centre              (default 0.0)

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
  // two ring centres drifting apart and back — the offset beats the moiré
  vec2 cA = vec2(-0.28, 0.0) + vec2(sin(t * 0.31 * u_drift), cos(t * 0.27 * u_drift)) * 0.18;
  vec2 cB = vec2( 0.28, 0.0) + vec2(cos(t * 0.29 * u_drift), sin(t * 0.33 * u_drift)) * 0.18;

  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  cB = mix(cB, m, mAmt * 0.8);

  float f = max(u_freq, 4.0);
  // two concentric ring gratings, slightly detuned in scale
  float ra = sin(length(p - cA) * f - t * 1.3);
  float rb = sin(length(p - cB) * f * (1.0 + u_detune) + t * 1.1);

  // product → moiré rosette; crisp the bands
  float moire = ra * rb;                         // -1..1
  float k = mix(0.32, 0.04, clamp(u_crisp, 0.0, 1.0));
  float band = smoothstep(0.5 - k, 0.5 + k, moire * 0.5 + 0.5);

  // a second, finer interference term tints the bands across the palette
  float hue = 0.5 + 0.5 * sin(length(p) * 3.0 + (ra + rb));
  vec3 lit = mix(c2, c1, hue);
  lit = mix(lit, c0, smoothstep(0.3, 0.9, band) * 0.5);

  vec3 bg = c3 * 0.10;
  vec3 col = mix(bg, lit, band);

  gl_FragColor = vec4(col, 1.0);
}
