// kintsugi (Burnish) - gold-repaired pottery. A solid, lit ceramic glaze surface
// is laced with a natural, irregular CRACKLE network - wandering cracks that
// branch and meet at random angles the way real crazed glaze does (no radial
// spokes, no cell-grid). The cracks are filled with crisp metallic gold rendered
// as a lit rounded lacquer ridge, and the glaze between them carries its own
// shifting tone, soft sheen and iron speckle.
// Comments short/ASCII on purpose (the headless-gl poster compiler is fussy).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_density; // crack network scale            (default 3.2)
uniform float u_seam;    // gold seam width in CSS px        (default 3.0)
uniform float u_fine;    // fine secondary cracks 0..1       (default 0.6)
uniform float u_glaze;   // ceramic glaze sheen + depth      (default 0.7)
uniform float u_light;   // raking-light drift speed        (default 0.4)
uniform float u_terminate; // how much cracks taper/break at ends (default 0)
uniform float u_marble;    // marble veining in the glaze body    (default 0)

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
  for (int i = 0; i < 5; i++) { v += amp * vnoise(p); p = p * 2.03 + vec2(7.1, 3.7); amp *= 0.5; }
  return v;
}
float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

// domain-warped point shared by the crack network and the shard tones, so the
// tone patches are bounded exactly by the cracks.
vec2 warpP(vec2 p) {
  return p + (vec2(fbm(p * 0.5 + 11.0), fbm(p * 0.5 + 27.0)) - 0.5) * 0.8;
}

// natural crackle: cracks lie on the iso-lines of a few warped noise fields, so
// they wander and branch organically and enclose irregular shards.
float crackAt(vec2 p, float w, float fine) {
  vec2 wp = warpP(p);
  float na = fbm(wp * 0.9 + 3.0);
  float nb = fbm(wp * 1.9 + 17.0);
  float nd = fbm(wp * 3.7 + 31.0);
  // primary crack at full width; the secondary and fine "background" cracks are
  // drawn THINNER than the primary so the main seams read in front and the lesser
  // network recedes behind them.
  float c = 1.0 - smoothstep(0.0, w, abs(na - 0.5));
  c = max(c, (1.0 - smoothstep(0.0, w * 0.65, abs(nb - 0.5))) * 0.7);
  c = max(c, (1.0 - smoothstep(0.0, w * 0.42, abs(nd - 0.5))) * 0.5 * fine);
  return clamp(c, 0.0, 1.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float mn = min(res.x, res.y);
  vec2  uv = (fc - ctr) / mn * max(u_density, 1.0);
  // crack width in the noise-value domain (approx constant screen px)
  float w = (max(u_seam, 0.6) * pr / mn) * max(u_density, 1.0) * 0.5 + 0.012;

  float crack = crackAt(uv, w, u_fine);
  // crack termination: a slow noise gates the seam strength so cracks taper out and
  // end naturally instead of running unbroken. u_terminate sets how aggressively the
  // ends fade; the smoothstep band keeps the terminations soft, not chopped.
  float termN = fbm(uv * 1.3 + 51.0);
  float term  = mix(1.0, smoothstep(0.30, 0.56, termN), clamp(u_terminate, 0.0, 1.0));
  crack *= term;
  // gradient -> rounded gold-ridge normal
  float e = 0.012;
  vec2  grad = vec2(crackAt(uv + vec2(e, 0.0), w, u_fine) - crackAt(uv - vec2(e, 0.0), w, u_fine),
                    crackAt(uv + vec2(0.0, e), w, u_fine) - crackAt(uv - vec2(0.0, e), w, u_fine));
  vec2  crackN = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0, 1.0);

  // shard region: which side of each crack field this pixel sits on -> a tone id
  vec2  wp = warpP(uv);
  float na = fbm(wp * 0.9 + 3.0), nb = fbm(wp * 1.9 + 17.0), nc = fbm(wp * 1.3 + 41.0);
  float region = dot(step(vec3(0.5), vec3(na, nb, nc)), vec3(1.0, 2.0, 4.0));
  float shardHue = hash21(vec2(region + 0.5, 2.3));
  float shardDepth = hash21(vec2(region + 1.5, 7.1));

  // --- palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float la = t * u_light * 0.25 + 0.7;
  vec2  L = vec2(cos(la), sin(la));

  // --- solid lit ceramic glaze, toned per shard ---
  vec3  glaze = wheelCol(0.07 + shardHue * 0.5, c0, c1, c2, c3);
  glaze = mix(vec3(dot(glaze, vec3(0.3, 0.5, 0.2))), glaze, 0.62);
  glaze *= 0.26 + 0.26 * shardDepth;
  // marble veining: domain-warped sinusoidal veins coloured from the palette and
  // blended into the ceramic body so it reads as veined marble rather than a flat
  // glaze. u_marble fades the whole effect (0 = the original solid shard tone).
  float mturb = fbm(uv * 1.7 + 21.0);
  float vein  = 0.5 + 0.5 * sin((uv.x * 1.3 + uv.y * 0.7) * 3.4 + mturb * 6.0);
  vein = pow(vein, 2.2);
  vec3 marbleTint = wheelCol(0.42 + shardHue * 0.3 + vein * 0.35, c0, c1, c2, c3);
  marbleTint = mix(vec3(dot(marbleTint, vec3(0.33))), marbleTint, 0.7) * (0.30 + 0.30 * shardDepth);
  glaze = mix(glaze, mix(glaze, marbleTint, vein * 0.85), clamp(u_marble, 0.0, 1.0));
  // soft sheen from a gentle glaze normal under the raking light
  float ge = 0.02;
  vec2  pg = vec2(fbm((uv + vec2(ge, 0.0)) * 1.6 + 4.0) - fbm((uv - vec2(ge, 0.0)) * 1.6 + 4.0),
                  fbm((uv + vec2(0.0, ge)) * 1.6 + 4.0) - fbm((uv - vec2(0.0, ge)) * 1.6 + 4.0));
  vec3  Ng = normalize(vec3(-pg * 2.0, 1.0));
  glaze *= 0.7 + 0.3 * max(dot(Ng, vec3(L, 0.6)), 0.0);
  float gspec = pow(max(dot(Ng, normalize(vec3(L, 0.8))), 0.0), 10.0);
  glaze += glaze * gspec * 0.8 * u_glaze;
  float speck = fbm(uv * 9.0 + shardHue * 20.0);
  glaze *= 0.94 + 0.10 * smoothstep(0.62, 0.78, speck);
  glaze *= 1.0 - 0.5 * smoothstep(0.0, 0.5, crack);          // recessed crack shading
  glaze += 0.012;

  // --- crisp metallic gold ridge ---
  float crest = smoothstep(0.5, 1.0, crack);
  float facing = dot(crackN, L);
  float lit = 0.4 + 0.6 * facing;
  vec3 goldLo = vec3(0.26, 0.12, 0.03);
  vec3 goldMid = vec3(0.90, 0.64, 0.24);
  vec3 goldHi = vec3(1.0, 0.94, 0.72);
  vec3 gold = mix(goldLo, goldMid, smoothstep(0.0, 0.6, crack)) * (0.55 + 0.85 * lit);
  gold = mix(gold, goldHi, crest * smoothstep(0.2, 1.0, lit));
  gold = mix(gold, gold * (0.75 + 0.5 * wheelCol(0.1, c0, c1, c2, c3)), 0.10);

  vec3 col = mix(glaze, gold, smoothstep(0.04, 0.5, crack));
  col += goldHi * crest * pow(max(lit, 0.0), 3.0) * 0.5;

  float vign = 1.0 - smoothstep(0.62, 1.3, length((fc - ctr) / res));
  col *= mix(0.84, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
