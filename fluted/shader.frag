// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_ribs;           // rib count across the frame width     (default 26.0)
uniform float u_refraction;     // how hard each rib bends the backdrop (default 0.85)
uniform float u_dispersion;     // chromatic split at the rib edges      (default 0.7)
uniform float u_drift;          // backdrop drift speed                  (default 0.3)
uniform float u_mouseInfluence; // pointer pull on the backdrop          (default 0.0)

vec3 c0, c1, c2, c3;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = p * 2.03 + vec2(9.1, 4.7);
    a *= 0.5;
  }
  return s;
}

// the glowing field behind the glass: a dark ground with big saturated
// glows drifting across it, a few tall light pillars and a soft fbm haze.
// The pillars and the glow edges are what the ribs slice into stripes.
vec3 backdrop(vec2 p, float t){
  vec3 col = c3 * 0.05;
  // four palette glows on slow orbits
  vec2 g0 = vec2(sin(t * 0.50) * 0.55, cos(t * 0.37) * 0.30);
  vec2 g1 = vec2(cos(t * 0.41 + 2.1) * 0.62, sin(t * 0.53 + 1.4) * 0.34);
  vec2 g2 = vec2(sin(t * 0.33 + 4.2) * 0.58, cos(t * 0.47 + 3.3) * 0.36);
  vec2 g3 = vec2(cos(t * 0.29 + 0.7) * 0.50, sin(t * 0.61 + 5.0) * 0.28);
  float d0 = length(p - g0), d1 = length(p - g1), d2 = length(p - g2), d3 = length(p - g3);
  col += c0 * 0.90 * exp(-d0 * d0 * 6.0);
  col += c1 * 0.85 * exp(-d1 * d1 * 7.0);
  col += c2 * 0.70 * exp(-d2 * d2 * 6.5);
  col += c3 * 0.80 * exp(-d3 * d3 * 8.0);
  // small bright orbs: a point light behind reeded glass becomes a row of
  // repeated streaks across the neighbouring ribs, the signature of the look
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    vec2 oc = vec2(sin(t * (0.30 + fi * 0.07) + fi * 1.9) * 0.78,
                   cos(t * (0.26 + fi * 0.05) + fi * 2.7) * 0.42);
    // squashed in x so each becomes a tall streak once the ribs slice it
    float od = length((p - oc) * vec2(1.0, 0.45));
    float orb = exp(-od * od * 160.0) + 0.30 * exp(-od * od * 30.0);
    vec3 ocol = (i == 0 || i == 3) ? c2 : (i == 1 || i == 4) ? c0 : c1;
    col += (ocol * 1.0 + 0.15) * orb * 0.6;
  }
  // soft haze so the dark ground is never flat
  float hz = fbm(p * 1.6 + vec2(t * 0.15, -t * 0.08));
  col += mix(c1, c2, hz) * 0.12 * hz;
  // tall light pillars: narrow vertical glows that give the ribs hard
  // structure to chop up
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float px = sin(t * (0.21 + fi * 0.05) + fi * 2.4) * 0.72;
    float dx = p.x - px;
    float pw = 0.020 + 0.012 * fi;
    float pillar = exp(-dx * dx / (pw * pw));
    float vy = 0.65 + 0.35 * sin(p.y * 4.0 + fi * 1.9 + t * 0.4);
    vec3 pc = (i == 0) ? c2 : (i == 1) ? c0 : (i == 2) ? c1 : c2;
    col += (pc * 1.0 + 0.15) * pillar * vy * 0.75;
  }
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time * u_drift;

  // optional pointer pull on the backdrop, zero at rest
  vec2 mo = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 shift = mo * mAmt * 0.5;

  // ---- the ribbed glass ----
  float ribs = max(u_ribs, 4.0);
  float ribW = aspect / ribs;                 // one rib width in p units
  float rx = p.x / ribW;
  float ribId = floor(rx);
  // u runs -1..1 across each rib; a faint wobble keeps the glass hand-drawn
  float u = (fract(rx) - 0.5) * 2.0;
  u += 0.018 * sin(p.y * 5.0 + ribId * 1.7 + u_time * 0.2);
  u = clamp(u, -0.995, 0.995);
  float hgt = sqrt(1.0 - u * u);             // semicircular rib profile
  vec3 n = normalize(vec3(u, 0.0, hgt));     // rib surface normal (z faces us)
  vec3 I = vec3(0.0, 0.0, -1.0);             // view ray into the glass

  // lateral shift of what shows through: refract into the rib, run the
  // bent ray down through the glass thickness, read the backdrop there.
  // Three refractive indices so the edges split into colour fringes.
  float depth = ribW * 3.0 * u_refraction;
  float disp = 0.05 * u_dispersion;
  vec3 rR = refract(I, n, 1.0 / (1.50 - disp));
  vec3 rG = refract(I, n, 1.0 / 1.50);
  vec3 rB = refract(I, n, 1.0 / (1.50 + disp));
  float oR = rR.x / max(-rR.z, 0.25) * depth;
  float oG = rG.x / max(-rG.z, 0.25) * depth;
  float oB = rB.x / max(-rB.z, 0.25) * depth;
  vec2 q = p + shift;
  vec3 bR = backdrop(vec2(q.x + oR, q.y), t);
  vec3 bG = backdrop(vec2(q.x + oG, q.y), t);
  vec3 bB = backdrop(vec2(q.x + oB, q.y), t);
  vec3 seen = vec3(bR.r, bG.g, bB.b);

  // the rib itself: transmission drops toward the edges (fresnel), and the
  // glass gathers a bright specular line where each rib faces the key light
  float cosv = hgt;
  float fr1 = 1.0 - cosv;
  float fres = fr1 * fr1 * fr1;
  vec3 col = seen * (0.95 - 0.55 * fres) * (0.66 + 0.34 * hgt);
  // ambient reflection of the room in the glass, brighter at the edges
  vec3 room = mix(c3 * 0.4, c2 * 0.9, 0.5 + 0.5 * u);
  col += room * fres * 0.45;
  // key light specular streak down each rib
  vec3 L1 = normalize(vec3(-0.45, 0.55, 0.70));
  vec3 L2 = normalize(vec3(0.70, -0.30, 0.55));
  vec3 rv = reflect(I, n);
  float sp1 = pow(max(dot(rv, L1), 0.0), 90.0);
  float sp2 = pow(max(dot(rv, L2), 0.0), 140.0);
  col += (vec3(0.85) + c2 * 0.3) * sp1 * 1.1;
  col += (vec3(0.6) + c1 * 0.4) * sp2 * 0.6;
  // bright seam where two ribs meet: total internal reflection lights the join
  float seam = smoothstep(0.86, 0.995, abs(u));
  col += (c2 * 0.6 + 0.5) * seam * seam * 0.55;
  // and a hairline dark groove at the very join
  float groove = smoothstep(0.975, 0.995, abs(u));
  col *= 1.0 - 0.45 * groove;

  gl_FragColor = vec4(col, 1.0);
}
