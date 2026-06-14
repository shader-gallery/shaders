// damask (Burnish) - a brocade wallpaper of mirror-symmetric foliate medallions
// on a half-drop repeat. Each cell folds a noise field through an N-fold dihedral
// kaleidoscope into an ornate, perfectly symmetric motif; the ground carries the
// pattern tone-on-tone like real damask, and gold filigree outlines the ornament
// on a deep jewel field. Lit evenly across the whole frame - no dark midriff.
// Comments short/ASCII on purpose (headless-gl poster compiler is fussy).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // motif size in CSS px        (default 150)
uniform float u_fold;    // dihedral symmetry order      (default 8)
uniform float u_detail;  // ornament complexity 0..1     (default 0.6)
uniform float u_drift;   // slow shimmer of the gold      (default 0.4)

float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) { v += amp * vnoise(p); p = p * 2.02 + vec2(5.2, 1.3); amp *= 0.5; }
  return v;
}
float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float cell = max(u_scale, 40.0) * refScale * pr;
  vec2  uv = (fc - ctr) / cell;

  // half-drop damask repeat: shift alternate columns by half a row
  float colOdd = mod(floor(uv.x), 2.0);
  vec2  p = vec2(uv.x, uv.y + colOdd * 0.5);
  vec2  cellId = floor(p);
  vec2  g = fract(p) - 0.5;

  // fold into an N-fold dihedral kaleidoscope -> a perfectly symmetric motif
  float r = length(g);
  float ang = atan(g.y, g.x);
  float N = max(floor(u_fold + 0.5), 2.0);
  float sector = 6.2831853 / N;
  float fa = mod(ang, sector);
  fa = abs(fa - 0.5 * sector);
  vec2  fg = vec2(cos(fa), sin(fa)) * r;

  // ornamental density field, symmetric by construction
  float det = 6.0 + u_detail * 10.0;
  float d1 = fbm(fg * det + cellId * 0.3 + 2.1);
  float d2 = fbm(fg * det * 1.9 + 8.4);
  float orn = mix(d1, d2, 0.35);

  // confine the ornament to a medallion that fades before the cell edge
  float radMask = smoothstep(0.5, 0.12, r);
  float mass = smoothstep(0.5, 0.62, orn) * radMask;          // filled ornament body
  float line = smoothstep(0.035, 0.0, abs(orn - 0.56)) * radMask; // gold outline filigree
  float boss = smoothstep(0.09, 0.0, r);                      // central boss
  float ink  = clamp(max(line, boss * 0.9) + mass * 0.25, 0.0, 1.0);

  // --- palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // deep jewel ground, hue drifting gently across the wall (even, no midriff dark)
  float groundHue = 0.08 + 0.10 * sin(uv.x * 0.25) + 0.10 * cos(uv.y * 0.22);
  vec3  jewel = wheelCol(groundHue, c0, c1, c2, c3);
  jewel = mix(vec3(dot(jewel, vec3(0.33))), jewel, 1.05) * 0.42;   // rich but deep
  // tone-on-tone: the motif body shows as a slightly lifted shade of the ground
  vec3 ground = jewel * (1.0 + 0.55 * mass);

  // gold filigree, faintly themed and shimmering along the line
  float shim = 0.6 + 0.4 * sin(t * (0.4 + u_drift) + (cellId.x + cellId.y) * 1.7 + r * 18.0);
  vec3 gold = mix(vec3(1.0, 0.82, 0.42), vec3(1.0, 0.93, 0.7), shim);
  gold = mix(gold, gold * (0.7 + 0.7 * wheelCol(0.1, c0, c1, c2, c3)), 0.18);

  vec3 col = mix(ground, gold, ink);
  col += gold * line * 0.4 * shim;                  // seam glow for bloom

  gl_FragColor = vec4(col, 1.0);
}
