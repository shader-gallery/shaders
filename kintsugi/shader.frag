// kintsugi (Burnish) - gold-repaired pottery. The break is a BRANCHING impact
// fracture (radial spokes that split outward from strike points + concentric
// hackle rings + a fine craquelure), each crack TYPE separately dialable. Molten
// gold floods the breaks over one continuous palette-tinted ceramic glaze, and a
// set of movable light sources travels the surface so the gold catches the light
// and flares where a light passes. Not a Voronoi cell mosaic - a fracture web.
// Comments short/ASCII on purpose (the headless-gl poster compiler is fussy).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_impacts;    // number of strike points        (default 4)
uniform float u_spread;     // fracture scale / reach          (default 1.0)
uniform float u_radial;     // radial spoke crack strength     (default 1.0)
uniform float u_rings;      // concentric ring crack strength  (default 0.6)
uniform float u_craze;      // fine craquelure strength        (default 0.35)
uniform float u_seam;       // gold seam width in CSS px        (default 2.8)
uniform float u_lights;     // number of travelling lights      (default 3)
uniform float u_lightSpeed; // light travel speed               (default 0.5)

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
vec2 impactCracks(vec2 rel, float seed, float width) {
  float rad = length(rel) + 1e-3;
  float ang = atan(rel.y, rel.x);
  float wob = fbm(rel * 2.1 + seed * 17.0) - 0.5;
  float aw = ang + wob * 1.1;
  float spokes = (3.0 + floor(seed * 2.0)) * (1.0 + floor(rad * 0.85));   // split = branch
  float radial = abs(fract(aw / 6.2831853 * spokes) - 0.5) * 2.0;
  float rw = width * (2.6 + 10.0 / max(spokes, 1.0));
  float radCrack = smoothstep(rw, 0.0, radial) * exp(-rad * 0.7);
  float ringWob = fbm(rel * 1.5 + seed * 7.0 + 3.0) - 0.5;
  float ring = abs(fract(rad * 1.8 + ringWob * 0.9) - 0.5) * 2.0;
  float ringCrack = smoothstep(width * 4.0, 0.0, ring) * smoothstep(1.2, 0.2, rad) * exp(-rad * 0.5);
  return vec2(radCrack, ringCrack);
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
  float width = max(u_seam, 0.6) * refScale * 0.02 / max(u_spread, 0.3);

  // accumulate the branching fracture per strike point, keeping crack TYPES apart
  vec2 cr = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= max(floor(u_impacts + 0.5), 1.0)) break;
    float fi = float(i) + 1.0;
    vec2 imp = (vec2(hash21(vec2(fi, 1.7)), hash21(vec2(fi, 4.3))) - 0.5) * 1.3;
    cr = max(cr, impactCracks(uv - imp, fi, width));
  }
  // fine craquelure as its own type (an all-over hairline network)
  float craze = smoothstep(0.5, 0.43, abs(fbm(uv * 11.0 + 2.0) - 0.5) * 2.0);
  craze *= smoothstep(1.5, 0.2, length(uv));
  // mix the three crack types by their dials
  float crack = clamp(max(max(cr.x * u_radial, cr.y * u_rings), craze * u_craze), 0.0, 1.0);

  // --- travelling light sources ---
  float lightAmt = 0.18;
  float nL = max(floor(u_lights + 0.5), 0.0);
  for (int i = 0; i < 6; i++) {
    if (float(i) >= nL) break;
    float fi = float(i);
    float a = t * u_lightSpeed * 0.4 + fi * 2.39996;
    vec2 Lp = vec2(cos(a), sin(a * 1.13 + fi * 1.7)) * (0.32 + 0.34 * hash21(vec2(fi, 5.0)));
    float dl = length(uv - Lp);
    lightAmt += 0.8 * exp(-dl * dl * 9.5);          // tighter, more localized pools
  }
  lightAmt = clamp(lightAmt, 0.0, 1.8);

  // --- palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // calm, cool ceramic glaze body so the gold reads against it (celadon + gold)
  float pool = fbm(uv * 1.6 + 5.0);
  vec3  glaze = wheelCol(0.05 + pool * 0.4, c0, c1, c2, c3);
  glaze = mix(vec3(dot(glaze, vec3(0.33))), glaze, 0.7);
  glaze *= 0.26 + 0.18 * pool;
  float crazeTone = fbm(uv * 16.0);
  glaze *= 0.9 + 0.1 * smoothstep(0.4, 0.62, crazeTone);
  glaze += 0.05 * vec3(0.82, 0.92, 1.0);
  glaze *= 0.82 + 0.22 * lightAmt;                       // the lights wash the glaze too

  // molten gold in the breaks, flaring where a light passes
  vec3 ember = vec3(0.62, 0.20, 0.03);
  vec3 gold  = vec3(1.0, 0.80, 0.36);
  vec3 hot   = vec3(1.0, 0.95, 0.72);
  vec3 goldCol = mix(ember, gold, smoothstep(0.0, 1.0, crack));
  goldCol = mix(goldCol, hot, crack * crack * clamp(lightAmt * 0.7, 0.0, 1.0));
  goldCol = mix(goldCol, goldCol * (0.6 + 0.8 * wheelCol(0.12, c0, c1, c2, c3)), 0.18);

  vec3 col = mix(glaze, goldCol * (0.5 + 0.85 * lightAmt), smoothstep(0.04, 0.8, crack));
  col += gold * crack * crack * 0.5 * lightAmt * lightAmt; // seam glow near lights (bloom)

  float vign = 1.0 - smoothstep(0.62, 1.3, length((fc - ctr) / res));
  col *= mix(0.86, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
