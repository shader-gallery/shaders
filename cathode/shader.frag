precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_curve;          // CRT barrel curvature                 (default 0.5)
uniform float u_scanline;       // scanline darkening                   (default 0.6)
uniform float u_phosphor;       // RGB aperture-grille strength          (default 0.5)
uniform float u_roll;           // vsync roll-bar speed                  (default 0.4)
uniform float u_mouseInfluence; // pointer brightens (tracking)          (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time;

  // barrel curvature — bow the screen UV outward toward the corners
  vec2 cv = uv * 2.0 - 1.0;
  cv *= 1.0 + dot(cv, cv) * 0.18 * u_curve;
  vec2 quv = cv * 0.5 + 0.5;

  // tube border: outside the curved screen is black bezel
  vec2 inside = step(0.0, quv) * step(quv, vec2(1.0));
  float screen = inside.x * inside.y;

  // content: horizontal colour test-bars slowly scrolling, with a couple of
  // bright station-ident blocks drifting through
  float scroll = quv.y + t * 0.05;
  float barId = floor(scroll * 7.0);
  float tone = fract(barId * 0.31 + 0.1 * sin(t * 0.3));
  vec3 bars = mix(mix(c3, c0, tone), mix(c1, c2, tone), smoothstep(0.3, 0.9, tone));
  float blockX = floor(quv.x * 6.0 + t * 0.7);
  bars *= 0.75 + 0.4 * hash(vec2(blockX, barId));

  // vsync roll bar: a bright horizontal band sweeping down
  float rollPos = fract(-t * u_roll);
  float roll = smoothstep(0.10, 0.0, abs(fract(quv.y - rollPos) - 0.0));
  bars += vec3(0.6, 0.6, 0.7) * roll * 0.4;

  vec3 col = bars;

  // scanlines (device-pixel locked) and RGB aperture-grille phosphor mask
  float sl = 0.5 + 0.5 * sin(gl_FragCoord.y / max(u_pixelRatio, 1.0) * 3.14159);
  col *= 1.0 - u_scanline * 0.6 * (1.0 - sl);

  float colMod = mod(floor(gl_FragCoord.x / max(u_pixelRatio, 1.0)), 3.0);
  vec3 mask = vec3(colMod < 0.5 ? 1.0 : 0.6,
                   (colMod >= 0.5 && colMod < 1.5) ? 1.0 : 0.6,
                   colMod >= 1.5 ? 1.0 : 0.6);
  col *= mix(vec3(1.0), mask, u_phosphor);
  col *= 1.35;   // lift to offset the scanline + mask darkening

  // global flicker + a little static hiss
  col *= 0.92 + 0.08 * sin(t * 50.0) + 0.04 * (hash(gl_FragCoord.xy + t) - 0.5);

  vec2 m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  col += vec3(0.3) * mAmt * smoothstep(0.25, 0.0, length(quv - m));

  // tube vignette + black bezel
  float vig = smoothstep(1.4, 0.4, length(cv));
  col *= vig;
  col *= screen;

  gl_FragColor = vec4(col, 1.0);
}
