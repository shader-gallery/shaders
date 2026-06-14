// kintsugi (Burnish) - gold-repaired pottery. The break is a BRANCHING impact
// fracture: radial cracks spread and split outward from a few strike points,
// ringed by concentric hackle and laced with a fine craquelure - each crack TYPE
// dialable. Molten gold floods the breaks over one continuous palette-tinted
// ceramic glaze. Optional movable light sources travel the surface so the gold
// flares where a light passes. Not a Voronoi cell mosaic - a fracture web.
// Comments short/ASCII on purpose (the headless-gl poster compiler is fussy).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_impacts;    // number of strike points         (default 4)
uniform float u_spread;     // fracture scale / reach           (default 1.0)
uniform float u_radial;     // radial spoke crack strength      (default 1.0)
uniform float u_wander;     // how much spokes curve/wander      (default 0.4)
uniform float u_rings;      // concentric ring crack strength   (default 0.25)
uniform float u_craze;      // fine craquelure strength         (default 0.5)
uniform float u_seam;       // gold seam width in CSS px         (default 2.6)
uniform float u_shimmer;    // molten shimmer along the seams    (default 0.9)
uniform float u_lights;     // number of travelling lights (0 = shimmer only) (default 0)
uniform float u_lightSpeed; // light travel speed                (default 0.5)

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
  for (int i = 0; i < 4; i++) { v += amp * vnoise(p); p = p * 2.03 + vec2(7.1, 3.7); amp *= 0.5; }
  return v;
}
float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

// branching radial spokes (x) and concentric hackle rings (y) around one strike
vec2 impactCracks(vec2 rel, float seed, float width, float wander) {
  float rad = length(rel) + 1e-3;
  float ang = atan(rel.y, rel.x);
  float wob = fbm(rel * 2.1 + seed * 17.0) - 0.5;
  float aw = ang + wob * wander * 2.4;        // 0 = straight spokes, high = curvy
  float spokes = (3.0 + floor(seed * 2.0)) * (1.0 + floor(rad * 0.85));   // split = branch
  float radial = abs(fract(aw / 6.2831853 * spokes) - 0.5) * 2.0;
  float rw = width * (2.6 + 10.0 / max(spokes, 1.0));
  float radCrack = smoothstep(rw, 0.0, radial);
  float ringWob = fbm(rel * 1.5 + seed * 7.0 + 3.0) - 0.5;
  float ring = abs(fract(rad * 1.8 + ringWob * 0.9) - 0.5) * 2.0;
  float ringCrack = smoothstep(width * 4.0, 0.0, ring) * smoothstep(1.2, 0.2, rad);
  return vec2(radCrack, ringCrack) * exp(-rad * 0.7);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float mn = min(res.x, res.y);
  vec2  uv = (fc - ctr) / mn / max(u_spread, 0.3);
  float width = max(u_seam, 0.6) * refScale * 0.012 / max(u_spread, 0.3);

  // branching fracture per strike point, crack TYPES kept apart for the dials
  vec2 cr = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= max(floor(u_impacts + 0.5), 1.0)) break;
    float fi = float(i) + 1.0;
    vec2 imp = (vec2(hash21(vec2(fi, 1.7)), hash21(vec2(fi, 4.3))) - 0.5) * 1.3;
    cr = max(cr, impactCracks(uv - imp, fi, width, u_wander));
  }
  float fine = smoothstep(0.5, 0.46, abs(fbm(uv * 9.0 + 2.0) - 0.5) * 2.0);
  fine *= smoothstep(1.3, 0.2, length(uv));
  // mix the three crack types by their dials (defaults reproduce the liked look)
  float crack = clamp(max(max(cr.x * u_radial, cr.y * u_rings), fine * u_craze), 0.0, 1.0);

  // optional travelling light sources (0 -> shimmer-only, the original look)
  float lightAmt = 0.0;
  float nL = max(floor(u_lights + 0.5), 0.0);
  for (int i = 0; i < 6; i++) {
    if (float(i) >= nL) break;
    float fi = float(i);
    float a = t * u_lightSpeed * 0.4 + fi * 2.39996;
    vec2 Lp = vec2(cos(a), sin(a * 1.13 + fi * 1.7)) * (0.32 + 0.34 * hash21(vec2(fi, 5.0)));
    float dl = length(uv - Lp);
    lightAmt += 0.75 * exp(-dl * dl * 9.0);
  }
  lightAmt = clamp(lightAmt, 0.0, 1.5);

  // --- palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ceramic glaze body: palette-tinted, pooling hue + fine craze
  float pool = fbm(uv * 1.6 + 5.0);
  vec3  glaze = wheelCol(0.05 + pool * 0.5, c0, c1, c2, c3);
  glaze = mix(vec3(dot(glaze, vec3(0.33))), glaze, 0.55);
  glaze *= 0.42 + 0.30 * pool;
  float crazeTone = fbm(uv * 16.0);
  glaze *= 0.86 + 0.14 * smoothstep(0.4, 0.62, crazeTone);
  glaze += 0.07 * vec3(0.9, 0.93, 1.0);
  glaze *= 1.0 + 0.25 * lightAmt;                       // lights wash the glaze (0 at default)

  // molten gold: ember hollow -> liquid gold ridge, slow shimmer, flaring at lights
  float shim = 0.5 + 0.5 * sin(t * (0.6 + u_shimmer) + length(uv) * 26.0 + pool * 9.0);
  vec3 ember = vec3(0.62, 0.20, 0.03);
  vec3 gold  = vec3(1.0, 0.80, 0.36);
  vec3 hot   = vec3(1.0, 0.95, 0.72);
  vec3 goldCol = mix(ember, gold, smoothstep(0.0, 1.0, crack));
  goldCol = mix(goldCol, hot, crack * crack * (0.45 + 0.55 * shim) * (0.4 + 0.6 * u_shimmer));
  goldCol = mix(goldCol, hot, crack * crack * clamp(lightAmt, 0.0, 1.0) * 0.8);  // light flare
  goldCol = mix(goldCol, goldCol * (0.6 + 0.8 * wheelCol(0.12, c0, c1, c2, c3)), 0.2);

  vec3 col = mix(glaze, goldCol, smoothstep(0.04, 0.8, crack));
  col += gold * crack * crack * 0.5 * (0.5 + 0.5 * shim);   // seam glow (bloom)
  col += gold * crack * crack * 0.4 * lightAmt;             // extra glow near lights (0 default)

  float vign = 1.0 - smoothstep(0.62, 1.3, length((fc - ctr) / res));
  col *= mix(0.85, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
