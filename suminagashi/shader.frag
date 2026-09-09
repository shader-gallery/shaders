// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// suminagashi (Trace) - Japanese paper marbling, floating ink. Ink and clear
// dispersant are dropped alternately onto still water from a brush tip, each
// drop pushing the rings already there outward, so a nest of thin concentric
// ink lines grows around every drop point and neighbouring nests flatten one
// another where they meet. Then the surface is drawn out: a stylus pulled
// through stretches the rings into long feathered tongues, a fine comb pass
// adds the small ripple of a breath across the water, and the sheet is laid
// down to lift the print. Built with the mathematical marbling model: every
// operation is an invertible map of the plane, so each pixel undoes the
// breath, the comb and the stylus draw, then peels off the drops in reverse
// order until it lands inside one and knows whether it sits on ink or on
// clear water. The ring edge is anti-aliased from a second undo one pixel
// away, and that same local stretch thins the ink where it was pulled, as
// real floating ink does. Two inks on warm fibred paper, nothing else.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rings;    // drops per nest, 5..21                 (default 21)
uniform float u_size;     // ring spacing, frame-relative          (default 0.052)
uniform float u_draw;     // stylus pull that draws out the rings  (default 1.0)
uniform float u_fan;      // fanned wave feathering                (default 1.0)
uniform float u_drift;    // speed of the water                    (default 0.3)

const int   ND = 63;      // total drops: 21 rings x 3 nests
const float PI = 3.14159265;

vec3  c0, c1, c2, c3;
float gT;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
mat2  outer2(vec2 a, vec2 b) { return mat2(a * b.x, a * b.y); }   // a b^T

// ---- the drop schedule. Drop k belongs to nest (k mod 3) and is ring k/3
// of that nest. Ink and clear alternate; clear drops are larger, which is
// what keeps the ink rings thin and the gaps wide. The brush hand is not
// perfectly still, so every drop lands a touch off its nest centre.
vec2 nestCentre(int ci) {
  float t = gT;
  if (ci == 0) return vec2(-0.50, 0.14) + 0.035 * vec2(sin(t * 0.17), cos(t * 0.13));
  if (ci == 1) return vec2( 0.06, -0.27) + 0.035 * vec2(cos(t * 0.11 + 2.0), sin(t * 0.15 + 1.0));
  return vec2(0.56, 0.27) + 0.035 * vec2(sin(t * 0.14 + 4.0), sin(t * 0.10 + 2.5));
}
void dropOf(int k, out vec2 C, out float r, out float isInk) {
  int   ringIx = k / 3;
  int   ci     = k - ringIx * 3;
  float fk     = float(k);
  float rings  = clamp(floor(u_rings + 0.5), 1.0, 21.0);
  // n counts rings from the centre outward: the LAST drop laid is the
  // innermost, so n = rings - ringIx. Odd n is ink, even n is clear.
  float n = rings - float(ringIx);
  isInk = mod(n, 2.0);
  vec2 jit = vec2(hash21(vec2(fk, 1.3)), hash21(vec2(fk, 7.1))) - 0.5;
  C = nestCentre(ci) + jit * 0.020;
  // each drop is sized so the finished rings sit at an even spacing S, ink
  // lines taking about a quarter of it: ring n reaches radius rho(n), and a
  // drop of radius sqrt(rho(n)^2 - rho(n-1)^2) makes exactly that annulus
  float S    = max(u_size, 0.008);
  float wi   = 0.15, wc = 0.85;
  float rhoN = S * (wi * floor((n + 1.0) * 0.5) + wc * floor(n * 0.5));
  float rhoP = S * (wi * floor(n * 0.5) + wc * floor((n - 1.0) * 0.5));
  r = sqrt(max(rhoN * rhoN - rhoP * rhoP, 0.0)) * (0.92 + 0.16 * hash21(vec2(fk, 3.7)));
  // drops beyond the ring count become no-ops
  r *= step(0.5, n);
}

// Every surface operation is an invertible map of the plane. Each undo also
// multiplies the running Jacobian J (undone position with respect to screen
// position) so the ring edge can be anti-aliased and the local stretch read
// without any second evaluation.

// inverse of a stylus pull: points move along M by an amount falling off
// with distance from the line, so the perpendicular coordinate is
// unchanged and the inverse is the same shift subtracted
vec2 undoTine(inout mat2 J, vec2 P, vec2 M, float u0, float z, float lam) {
  vec2  N  = vec2(-M.y, M.x);
  float u  = dot(P, N) - u0;
  float e  = 0.07;                           // softened tip: no crease on the line
  float d  = sqrt(u * u + e * e);
  float f  = z * lam / (lam + d);
  float fp = -z * lam / ((lam + d) * (lam + d)) * (u / d);
  J = (mat2(1.0, 0.0, 0.0, 1.0) - outer2(M, N) * fp) * J;
  return P - M * f;
}
// inverse of a smooth fanned wave: a sinusoidal shear along M
vec2 undoWave(inout mat2 J, vec2 P, vec2 M, float w, float A, float ph) {
  vec2  N = vec2(-M.y, M.x);
  float a = dot(P, N) * w + ph;
  J = (mat2(1.0, 0.0, 0.0, 1.0) - outer2(M, N) * (A * w * cos(a))) * J;
  return P - M * A * sin(a);
}

// undo everything on top of the drops, in reverse order of application
vec2 undoSurface(inout mat2 J, vec2 p) {
  float t   = gT;
  float fan = 0.045 * clamp(u_fan, 0.0, 2.5);
  float drw = max(u_draw, 0.0);
  // breath: a small travelling ripple blown across the water
  p = undoWave(J, p, vec2(1.0, 0.0), 9.0, 0.006, t * 0.35);
  p = undoWave(J, p, vec2(0.0, 1.0), 7.0, 0.005, -t * 0.30 + 1.0);
  // fanning: three smooth waves at different angles and scales draw the
  // rings into undulating feathered bands, their phases drifting slowly
  p = undoWave(J, p, normalize(vec2(1.0, 0.30)), 4.5, fan * 1.5, t * 0.12);
  p = undoWave(J, p, normalize(vec2(-0.35, 1.0)), 6.5, fan, -t * 0.09 + 2.0);
  p = undoWave(J, p, normalize(vec2(0.8, -0.6)), 12.0, fan * 0.22, t * 0.16 + 4.0);
  // the stylus: two broad slow pulls between the nests, their lines
  // wandering so the drawn-out tongues travel across the print
  vec2  Ms = normalize(vec2(1.0, -0.35));
  p = undoTine(J, p, Ms, 0.05 + 0.10 * sin(t * 0.06), 0.30 * drw, 0.30);
  vec2  Ms2 = normalize(vec2(-1.0, -0.25));
  p = undoTine(J, p, Ms2, -0.48 + 0.08 * cos(t * 0.05 + 1.0), 0.22 * drw, 0.26);
  return p;
}

// peel the drops in reverse, carrying the Jacobian; returns the drop hit
// (or -1), its radius, the distance to its centre and the unit radial
void peel(inout mat2 J, vec2 P, out int hit, out float rHit, out float dHit, out float inkHit, out int ciHit, out vec2 rad) {
  hit = -1; rHit = 0.0; dHit = 0.0; inkHit = 0.0; ciHit = 0; rad = vec2(1.0, 0.0);
  for (int k = ND - 1; k >= 0; k--) {
    vec2 C; float r; float ink;
    dropOf(k, C, r, ink);
    if (r <= 0.0) continue;
    vec2  d = P - C;
    float D = max(length(d), 1e-5);
    if (D < r) {
      hit = k; rHit = r; dHit = D; inkHit = ink; ciHit = k - (k / 3) * 3; rad = d / D;
      break;
    }
    float s = sqrt(max(1.0 - r * r / (D * D), 4e-4));
    // P = C + d s ; dP/dP = s I + d d^T r^2 / (s D^4)
    J = (mat2(s, 0.0, 0.0, s) + outer2(d, d) * (r * r / (s * D * D * D * D))) * J;
    P = C + d * s;
  }
}

// paper fibre field at css-pixel scale: two families of long thin fibres
float fibres(vec2 q) {
  vec2 a = vec2(0.97 * q.x + 0.26 * q.y, -0.26 * q.x + 0.97 * q.y);
  vec2 b = vec2(0.42 * q.x - 0.91 * q.y,  0.91 * q.x + 0.42 * q.y);
  float f1 = vnoise(vec2(a.x * 0.07, a.y * 0.9) + 3.0);
  float f2 = vnoise(vec2(b.x * 0.09, b.y * 1.0) + 17.0);
  f1 = smoothstep(0.52, 0.80, f1);
  f2 = smoothstep(0.55, 0.82, f2);
  return f1 + f2 * 0.6 - 0.16;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  gT = u_time * clamp(u_drift, 0.0, 3.0);

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float aspect = res.x / res.y;
  vec2  uv     = fc / res;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float px     = 1.0 / res.y;            // one device pixel in frame units
  vec2  q      = fc / pr;                // css px for surface texture

  // ---- the sheet: warm washi, tinted a whisper by the palest pole
  float palest = 0.0; vec3 pale = c2;
  if (luma(c0) > palest) { palest = luma(c0); pale = c0; }
  if (luma(c1) > palest) { palest = luma(c1); pale = c1; }
  if (luma(c2) > palest) { palest = luma(c2); pale = c2; }
  if (luma(c3) > palest) { palest = luma(c3); pale = c3; }
  vec3  stock  = mix(vec3(0.905, 0.875, 0.815), pale, 0.10);
  float fib    = fibres(q);
  float mottle = vnoise(q * 0.012 + 5.0) - 0.5;
  float cloud  = vnoise(q * 0.04 + 9.0) - 0.5;
  float speck  = hash21(floor(q * 0.9)) - 0.5;
  vec3  paper  = stock * clamp(1.0 + fib * 0.030 + speck * 0.025 + mottle * 0.09 + cloud * 0.04, 0.6, 1.1);

  // ---- two inks: a sumi black warmed by the deepest pole, and a colour ink
  // from the first pole, both pulled down to floating-ink depth
  float deepest = 9.0; vec3 deep = c3;
  if (luma(c0) < deepest) { deepest = luma(c0); deep = c0; }
  if (luma(c1) < deepest) { deepest = luma(c1); deep = c1; }
  if (luma(c2) < deepest) { deepest = luma(c2); deep = c2; }
  if (luma(c3) < deepest) { deepest = luma(c3); deep = c3; }
  vec3 sumi   = mix(vec3(0.07, 0.07, 0.08), deep, 0.40);
  vec3 colour = mix(vec3(luma(c0)), c0, 1.15) * 0.62;
  colour = mix(colour, c1 * 0.6, 0.25);

  // ---- undo the surface and peel the drops, carrying the Jacobian
  mat2 J = mat2(1.0, 0.0, 0.0, 1.0);
  vec2 P0 = undoSurface(J, p);
  int hit; float rH, dH, inkH; int ciH; vec2 rad;
  peel(J, P0, hit, rH, dH, inkH, ciH, rad);

  vec3 col = paper;
  if (hit >= 0) {
    // gradient of the ring coordinate with respect to the screen: the
    // anti-aliasing width, and the stretch that thins the ink where pulled
    float g = length(vec2(dot(rad, J[0]), dot(rad, J[1])));
    g = clamp(g, 0.05, 40.0);
    float sd = (rH - dH) / (g * px);           // signed distance in pixels
    float w  = 0.9;
    // inside an ink drop the ink runs to its edge; inside a clear drop the
    // ink is the ring just outside it, so coverage flips at the boundary
    float cov = mix(1.0 - smoothstep(-w, w, sd), smoothstep(-w, w, sd), inkH);
    // the outermost drop has no ring beyond it, so its edge draws nothing
    float ringsN = clamp(floor(u_rings + 0.5), 1.0, 21.0);
    float ringIx = floor(float(hit) / 3.0 + 0.01);
    float nH = ringsN - ringIx;
    cov *= mix(step(nH + 0.5, ringsN), 1.0, inkH);
    // a soft bleed of ink into the sizing just beyond the line edge
    float bleed = (1.0 - cov) * exp(-max(abs(sd) - w, 0.0) * 0.45) * 0.10;
    cov = cov + bleed * mix(step(nH + 0.5, ringsN), 1.0, inkH);
    // stretched ink thins: g near 1 is undisturbed, small g is pulled thin
    float dens = mix(0.55, 1.0, smoothstep(0.0, 1.2, g));
    // the brush runs drier on some drops, so rings alternate strong and faint
    float ringK = mix(ringIx, ringIx + 1.0, 1.0 - inkH);   // the ink ring this pixel belongs to
    dens *= 0.55 + 0.45 * hash21(vec2(ringK, float(ciH) + 0.5));
    // the ink darkens toward the ring edges and carries a faint grain
    float edge = 1.0 - smoothstep(0.0, 6.0, abs(sd));
    dens *= 0.86 + 0.14 * edge;
    dens *= 0.92 + 0.16 * (vnoise(q * 0.18 + float(hit) * 3.1) - 0.5);
    vec3 ink = mix(sumi, colour, step(0.5, float(ciH)) * step(float(ciH), 1.5));
    // floating ink lies thin: multiply into the sheet rather than paint
    col = mix(col, col * mix(vec3(1.0), ink, 0.94), cov * dens);
  }

  // the fibre tops lift a little ink off the sheet
  col = mix(col, paper, 0.08 * smoothstep(0.35, 0.75, fib) * (1.0 - step(0.98, luma(col) / max(luma(paper), 1e-3))));

  gl_FragColor = vec4(col, 1.0);
}
