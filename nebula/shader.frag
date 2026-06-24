// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// nebula (Abyss) — a Trifid-style emission/reflection nebula. Billowing
// domain-warped gas fills the frame: a warm pink/red emission region glows in
// the lower body, cooling to a blue reflection haze toward the top, the two
// woven together along a noisy boundary. Branching dark DUST LANES — ridged
// noise crests — carve trifurcating channels through the glowing gas (the
// Trifid's signature), and a dense field of stars of varied brightness twinkles
// behind and through it, with a couple of bright young stars embedded in the
// clouds. Everything billows on slow unbounded drift — nothing resets.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;        // billow drift speed                  (default 0.3)
uniform float u_dust;         // prominence of the dark dust lanes   (default 0.7)
uniform float u_starDensity;  // density of the background starfield  (default 1.0)
uniform float u_gasScale;     // spatial scale of the gas structure  (default 1.0)

const vec3  BG = vec3(0.022, 0.022, 0.038); // deep space base

// --- hash / value noise / fbm (no textures) -------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) {
    s += amp * vnoise(p * f);
    f *= 2.02;
    amp *= 0.5;
  }
  return s;
}

// one starfield layer: hashed cells, sparse points, slow twinkle. `thresh` gates
// how many cells carry a star (higher = fewer).
float starLayer(vec2 fc, float cell, float t, float seed, float thresh) {
  vec2 g  = fc / cell;
  vec2 id = floor(g);
  vec2 f  = fract(g);
  float h3 = hash21(id + seed + 19.3);
  if (h3 > thresh) return 0.0;
  float h  = hash21(id + seed);
  float h2 = hash21(id + seed + 7.1);
  vec2  sc = vec2(0.25 + 0.5 * h, 0.25 + 0.5 * h2);
  float d  = length(f - sc);
  float bright = 0.35 + 0.65 * h;
  float tw = 0.55 + 0.45 * sin(t * (0.4 + h * 1.8) + h2 * 6.2831);
  float core = smoothstep(0.07, 0.0, d);
  float glow = smoothstep(0.22, 0.0, d) * 0.22;
  return (core + glow) * bright * tw;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec2  uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);
  vec2  p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5); // centred, aspect-correct

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float drift = max(u_drift, 0.0);
  float dustAmt = clamp(u_dust, 0.0, 1.5);
  float gscale  = clamp(u_gasScale, 0.4, 2.5);
  float bill = t * drift * 0.04;

  // ---- billowing gas: domain-warped FBM ------------------------------------
  vec2 wp = p * (1.6 * gscale);
  vec2 warp = vec2(fbm(wp + vec2(0.0, bill)),
                   fbm(wp + vec2(5.2, -bill) + 3.0));
  float gas = fbm(wp + warp * 1.5 + vec2(bill * 0.5, 0.0));
  gas = pow(clamp(gas, 0.0, 1.0), 1.25);
  // large-scale clumps so brightness isn't uniform
  float clump = fbm(p * 0.7 + 9.0 + vec2(bill * 0.3, 0.0));

  // ---- emission(pink) / reflection(blue) regions ---------------------------
  // pink emission concentrated low, blue reflection toward the top, woven along
  // a noisy boundary (the Trifid's two-region character).
  float regN = fbm(p * 0.6 + vec2(-2.0, bill * 0.2) + 17.0);
  float blend = smoothstep(0.20, 0.80, (uv.y - 0.5) + (regN - 0.5) * 0.9);
  vec3 pink = mix(c3, c1, 0.30);          // warm emission (red/magenta)
  vec3 blue = mix(c0, c2, 0.55);          // cool reflection (blue/cyan)
  vec3 gasCol = mix(pink, blue, blend);
  // a faint violet seam where the two regions meet
  float seam = 1.0 - abs(blend - 0.5) * 2.0;
  gasCol = mix(gasCol, mix(pink, blue, 0.5) * 1.1, seam * 0.25);

  // ---- branching dark dust lanes: ridged-noise crests ----------------------
  vec2 dp1 = p * (1.9 * gscale) + warp * 0.6;
  float n1 = fbm(dp1 + vec2(bill * 0.2, 0.0));
  float rid1 = 1.0 - abs(2.0 * n1 - 1.0);
  vec2 dp2 = p * (2.7 * gscale) + vec2(31.0, 7.0) + warp * 0.4;
  float n2 = fbm(dp2);
  float rid2 = 1.0 - abs(2.0 * n2 - 1.0);
  float dustField = max(smoothstep(0.70, 0.97, rid1),
                        smoothstep(0.76, 0.99, rid2) * 0.85);
  float dust = clamp(dustField * dustAmt, 0.0, 1.0);

  // ---- assemble the gas ----------------------------------------------------
  float bright = (0.16 + 0.95 * gas) * (0.45 + 0.65 * clump);
  // a soft central concentration so the nebula has a luminous heart
  bright *= 0.7 + 0.6 * exp(-dot(p, p) * 1.4);
  vec3 emission = gasCol * bright;
  // dust lanes carve dark branching channels (and tint the residual a touch warm)
  emission *= (1.0 - 0.93 * dust);

  vec3 col = BG + emission;

  // ---- dense starfield (behind + through the gas) --------------------------
  float dens = clamp(u_starDensity, 0.0, 2.0);
  float th1 = mix(0.80, 0.26, clamp(dens, 0.0, 1.0));
  float th2 = mix(0.90, 0.50, clamp(dens, 0.0, 1.0));
  float stars = starLayer(fc, 40.0 * pr, t, 3.0,  th1)
              + starLayer(fc, 22.0 * pr, t, 91.0, th2) * 0.8;
  vec3 starCol = mix(vec3(0.85, 0.90, 1.0), c2, 0.16);
  // stars dim a little inside the densest dust lanes (extinction)
  col += starCol * stars * 1.3 * (1.0 - 0.6 * dust);

  // ---- a couple of bright young stars embedded in the clouds ---------------
  vec2 s1 = vec2(-0.10 * aspect, 0.06);
  vec2 s2 = vec2( 0.16 * aspect, -0.12);
  float g1 = exp(-length(p - s1) / 0.06);
  float g2 = exp(-length(p - s2) / 0.05);
  float c1c = exp(-pow(length(p - s1) / 0.010, 2.0));
  float c2c = exp(-pow(length(p - s2) / 0.009, 2.0));
  col += mix(blue, vec3(1.0), 0.5) * g1 * 0.30;
  col += mix(pink, vec3(1.0), 0.5) * g2 * 0.26;
  col += vec3(1.0) * (c1c + c2c) * 0.9;

  // ---- finishing -----------------------------------------------------------
  vec2 vq = uv - 0.5;
  float vign = 1.0 - smoothstep(0.45, 1.05, length(vec2(vq.x * 0.95, vq.y)));
  col *= mix(0.74, 1.0, vign);
  col = col / (col + vec3(0.85)) * 1.85;          // gentle filmic shoulder
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
