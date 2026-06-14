// kintsugi (Burnish) - gold-repaired pottery. A palette-tinted ceramic glaze
// body fills the whole frame (subtle craze + a soft glaze gradient per shard),
// fractured by an interconnected VORONOI crack network whose edges run as molten
// gold seams - deep ember in the hollows rising to bright liquid gold on the
// ridges, with a slow shimmer creeping along the repair. Dense network, no void.
// Comments are 7-bit ASCII on purpose (the headless-gl poster compiler chokes on
// non-ASCII and on a few identifiers).
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_density;  // shard count / crack-network density   (default 6.0)
uniform float u_seam;     // gold seam width in CSS px              (default 2.5)
uniform float u_shimmer;  // molten shimmer travelling the seams    (default 0.8)

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 11.3));
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { v += amp * vnoise(p); p = p * 2.03 + vec2(7.1, 3.7); amp *= 0.5; }
  return v;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
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

  // DPR-independent uv scaled so the shard count tracks u_density
  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float mn = min(res.x, res.y);
  vec2  uv = (fc - ctr) / mn * max(u_density, 1.0);

  // --- Voronoi: nearest (f1) and second-nearest (f2) jittered feature points.
  // f2-f1 ~ 0 exactly on the cell borders -> that is the crack network. ---
  vec2 ip = floor(uv), fp = fract(uv);
  float f1 = 9.0, f2 = 9.0;
  vec2  id1 = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g);
      o = 0.5 + 0.42 * sin(t * 0.15 + 6.2831853 * o);   // drift the points slowly
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id1 = ip + g; }
      else if (d < f2) { f2 = d; }
    }
  }
  float edge = sqrt(f2) - sqrt(f1);     // 0 at border, grows into the shard

  // --- palette fallback ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- ceramic glaze body: each shard a palette-tinted glaze, pale and desat,
  // with a soft within-shard gradient and a fine craze of hairline cracks. ---
  float shardHue = hash21(id1);
  vec3  glaze = wheelCol(shardHue * 0.9 + 0.05, c0, c1, c2, c3);
  glaze = mix(vec3(dot(glaze, vec3(0.33))), glaze, 0.5);     // desaturate toward porcelain
  glaze = mix(glaze * 0.5, glaze, 0.6 + 0.4 * f1);           // shard interior gradient
  float craze = fbm(uv * 7.0 + shardHue * 19.0);
  glaze *= 0.82 + 0.18 * smoothstep(0.35, 0.65, craze);      // faint hairline craze
  glaze += 0.06 * vec3(0.9, 0.93, 1.0);                      // cool porcelain floor (no dead-black)

  // --- molten gold seams along the Voronoi edges ---
  float seamUv = max(u_seam, 0.6) * refScale / mn * max(u_density, 1.0); // edge units
  float seam = 1.0 - smoothstep(0.0, seamUv * 2.4, edge);
  // molten gradient: deep ember in the seam hollow rising to bright gold on top,
  // with a slow shimmer travelling the repair.
  float shim = 0.5 + 0.5 * sin(t * (0.6 + u_shimmer) + (id1.x + id1.y) * 2.3 + edge * 22.0);
  vec3 ember = vec3(0.62, 0.20, 0.03);
  vec3 gold  = vec3(1.0, 0.80, 0.36);
  vec3 hot   = vec3(1.0, 0.95, 0.72);
  vec3 goldCol = mix(ember, gold, smoothstep(0.0, 1.0, seam));
  goldCol = mix(goldCol, hot, seam * seam * (0.45 + 0.55 * shim) * (0.4 + 0.6 * u_shimmer));
  // tint the gold faintly toward the palette so themes shift the metal
  goldCol = mix(goldCol, goldCol * (0.6 + 0.8 * wheelCol(0.12, c0, c1, c2, c3)), 0.22);

  // compose: glaze body, gold seams laid over, brightening toward the seam crest
  vec3 col = glaze;
  col = mix(col, goldCol, smoothstep(0.04, 0.85, seam));
  col += gold * seam * seam * 0.5 * (0.5 + 0.5 * shim);   // seam glow for bloom to catch

  // gentle vignette
  float vign = 1.0 - smoothstep(0.6, 1.25, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
