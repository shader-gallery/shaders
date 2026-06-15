// emboss (Burnish) - tufted iridescent relief. A deep quilted surface of padded
// diamond cushions pulled in at button points and creased along the seams, lit as
// a soft satin so each pucker carries a specular bloom. The fabric is iridescent:
// hue shifts across the curve of every cushion like shot silk, sweeping slowly.
// Fills the frame, no flat grid - all relief and colour. Comments short/ASCII
// on purpose (the headless-gl poster compiler is fussy about both).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_size;    // cushion size in CSS px       (default 120)
uniform float u_relief;  // relief depth 0..1            (default 0.7)
uniform float u_iris;    // iridescence amount + drift   (default 0.8)
uniform float u_sheen;   // satin specular strength      (default 0.7)
uniform float u_scatter; // button scatter 0..1          (default 0.45)
uniform float u_rotate;  // extra lattice rotation deg   (default 0)
uniform float u_skew;    // lattice shear                (default 0)
uniform float u_tilt;    // perspective tilt into depth  (default 0)
uniform float u_shade;   // light/dark depth 0..1        (default 0.5)
uniform float u_lightaz; // key light azimuth degrees    (default 55)
uniform float u_lightel; // key light elevation degrees  (default 40)

float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
vec2  hash22(vec2 p) { float n = hash21(p); return vec2(n, hash21(p + n + 7.7)); }

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

// quilted tuft height at lattice coordinate p (cells of size 1):
// a padded cushion bulging between button dimples at cell centres, creased at
// the seams (cell edges). Returns ~0 at buttons/seams up to ~1 on the puff.
float tuftH(vec2 p, float scatter) {
  vec2 ip = floor(p), fp = fract(p);
  vec2 jit = (hash22(ip) - 0.5) * 0.62 * scatter;  // push the button off-centre
  vec2 c = fp - 0.5 - jit;                         // vector to the button dimple
  float dB = length(c);
  float puff = smoothstep(0.0, 0.46, dB);          // dimple in, bulge out
  float seam = min(min(fp.x, 1.0 - fp.x), min(fp.y, 1.0 - fp.y)); // dist to seam
  puff -= 0.55 * smoothstep(0.13, 0.0, seam);      // crease down along the seams
  return clamp(puff, 0.0, 1.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float cell = max(u_size, 24.0) * refScale * pr;

  // diamond tufting: rotate the lattice 45 degrees, plus a user rotation/shear
  // about the centre so the quilt can lean off the diamond and onto a bias.
  float ang = radians(45.0 + u_rotate);
  float ca = cos(ang), sa = sin(ang);
  vec2 rel = fc - ctr;
  vec2 rc = vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
  rc.x += rc.y * u_skew;
  // tilt: lay the quilt back in perspective; one edge recedes and its cushions
  // compress while the near edge swells, giving the flat quilt real depth.
  // Denominator stays positive (ny and u_tilt both clamped), so it never folds.
  float ny = clamp(rc.y / max(res.y, 1.0), -0.6, 0.6);
  rc *= 1.0 / (1.0 + clamp(u_tilt, -1.0, 1.0) * ny);
  vec2 p = rc / cell;

  // height + analytic normal via finite differences
  float e = 0.02;
  float sc = clamp(u_scatter, 0.0, 1.0);
  float h  = tuftH(p, sc);
  float hx = tuftH(p + vec2(e, 0.0), sc) - tuftH(p - vec2(e, 0.0), sc);
  float hy = tuftH(p + vec2(0.0, e), sc) - tuftH(p - vec2(0.0, e), sc);
  float depth = 1.2 + (1.0 - u_relief) * 3.0;       // larger = shallower
  vec3 N = normalize(vec3(-hx, -hy, e * depth));

  // lighting: one soft key light whose azimuth (compass bearing across the cloth)
  // and elevation (how high/grazing) are both steerable, satin specular.
  float az = radians(u_lightaz), el = radians(u_lightel);
  vec3 L = normalize(vec3(cos(az) * cos(el), sin(az) * cos(el), sin(el)));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hh = normalize(L + V);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, Hh), 0.0), 22.0);
  float rim  = pow(1.0 - max(N.z, 0.0), 2.0);        // edge fold darkening/sheen

  // --- palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // iridescent shot-silk hue: shifts with the surface normal and cushion curve
  float irid = N.x * 0.55 + N.y * 0.45 + h * 0.5 + t * 0.03 * (0.5 + u_iris);
  vec3 silk = wheelCol(irid, c0, c1, c2, c3);
  // a second hue at the highlight so speculars flash a complementary colour
  vec3 silk2 = wheelCol(irid + 0.5, c0, c1, c2, c3);
  silk = mix(silk, silk * (1.0 - u_iris) + silk * u_iris, 1.0); // keep saturated

  // compose: lit satin body + iridescent specular + soft seam shadow.
  // u_shade sets the light/dark spread: low lifts the shadows toward flat even
  // light, high drops the ambient floor and drives the diffuse for deep contrast.
  float amb   = 0.32 + (0.5 - u_shade) * 0.40;   // 0.5 -> 0.32 (the original floor)
  float dgain = 0.85 + (u_shade - 0.5) * 0.70;   // 0.5 -> 0.85 (the original gain)
  vec3 col = silk * (amb + dgain * diff);
  col += mix(vec3(1.0), silk2, 0.55) * spec * (0.5 + u_sheen) * 1.1;
  col *= mix(1.0, 0.72, rim);                        // deepen the seam folds
  col += silk * 0.10;                                // ambient floor (no dead-black)

  gl_FragColor = vec4(col, 1.0);
}
