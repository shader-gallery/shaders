// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// nebula-drift (Abyss) — a Nebula variation: instead of standing pillars, a deep
// volumetric emission field seen edge-on. Layered domain-warped gas glows in
// drifting palette hues, threaded by serpentine DARK DUST LANES (Bok globules)
// that silhouette against the backlight, and laced with thin bright ionization
// FILAMENTS where the gas is densest. Two parallaxing depth layers give real
// front-to-back separation; the brightest emission sits off-centre (rule of
// thirds). Everything billows on slow unbounded noise — no points of light, no
// hard reset. Texture and depth, not a soft glow.
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
uniform float u_drift;     // billow + parallax speed                 (default 0.3)
uniform float u_dust;      // darkness/coverage of the dust lanes,0..1 (default 0.6)
uniform float u_filament;  // ionization-filament brightness          (default 0.7)
uniform float u_scale;     // overall gas feature scale               (default 1.0)

const vec3 BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// --- hash / value noise / fbm (no textures) -------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 6; i++) {
    s += amp * vnoise(p * f);
    f *= 2.02;
    amp *= 0.5;
  }
  return s;
}
// ridged fbm — sharp bright veins (for the ionization filaments)
float ridged(vec2 p) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = vnoise(p * f);
    n = 1.0 - abs(2.0 * n - 1.0);   // fold to ridges
    s += amp * n * n;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// one parallaxing gas layer: returns vec2(density, hueIndex-ish phase)
// p is aspect-correct plane coords; depth in [0,1] (0 far, 1 near).
float gasLayer(vec2 p, float depth, float t, float scale, out float warpHue) {
  float drift = t;
  // domain warp: push the sampling coords by a low-freq flow so the gas swirls
  vec2 warp = vec2(fbm(p * 1.3 + vec2(0.0, drift * 0.4)),
                   fbm(p * 1.3 + vec2(5.2, -drift * 0.3 + 9.1)));
  vec2 q = p * (1.9 * scale) + (warp - 0.5) * (0.9 + 0.6 * depth);
  q += vec2(drift * (0.10 + 0.10 * depth), drift * 0.05);
  float d = fbm(q);
  d = pow(clamp(d, 0.0, 1.0), 1.9);     // bright veins, dark gaps
  warpHue = warp.x + warp.y;            // feed the hue so colour follows the flow
  return d;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time * 0.1 * max(u_drift, 0.0);

  vec2 uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float scale = max(u_scale, 0.2);
  float dust  = clamp(u_dust, 0.0, 1.0);
  float fila  = max(u_filament, 0.0);

  // brightest emission off-centre (upper-left third) — composed framing
  vec2 hotspot = vec2(-0.26, 0.16);
  float toHot = length((p - hotspot) * vec2(0.9, 1.0));
  float backlight = exp(-toHot * 1.05) * 1.25 + 0.16;

  // --- two parallaxing gas layers, far then near ---
  float h0, h1;
  float far  = gasLayer(p + vec2(0.05, 0.0), 0.15, t * 0.7, scale * 0.75, h0);
  float near = gasLayer(p, 0.85, t, scale, h1);

  // hue index drifts across the palette wheel with position, depth-flow and time
  float hue = (p.x + p.y) * 0.7 + h1 * 1.6 + h0 * 0.6 + t * 0.4;
  float s4  = fract(hue * 0.25) * 4.0;
  float w0 = wheelW(s4,0.0), w1 = wheelW(s4,1.0), w2 = wheelW(s4,2.0), w3 = wheelW(s4,3.0);
  vec3 gasCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // composite emission: far layer dimmer/cooler, near layer brighter; both lit
  // by the off-centre backlight so the cloud has a luminous heart.
  float emission = (far * 0.45 + near * 0.95) * backlight;

  // --- dark dust lanes: a separate low-freq ridged field carves serpentine
  // opaque lanes that silhouette against the glow (Bok globules / dust). ---
  float lane = ridged(p * (1.5 * scale) + vec2(11.0, -t * 0.5));
  float dustMask = smoothstep(0.55, 0.95, lane * (0.7 + 0.6 * near));
  dustMask *= dust;
  // a few denser dark globules where two dust fields agree
  float glob = smoothstep(0.6, 0.9, fbm(p * 2.6 * scale + 30.0)) *
               smoothstep(0.5, 0.85, lane);
  dustMask = clamp(dustMask + glob * dust * 0.7, 0.0, 1.0);

  // --- bright ionization filaments: thin hot veins along the densest gas ---
  float fil = ridged(p * (3.4 * scale) + vec2(-4.0, t * 0.8));
  fil = pow(clamp(fil, 0.0, 1.0), 2.6);
  float filament = fil * smoothstep(0.28, 0.8, near) * backlight * fila;
  // a second finer filament octave for crisp hot threads
  float fil2 = ridged(p * (6.2 * scale) + vec2(7.0, -t * 0.6));
  fil2 = pow(clamp(fil2, 0.0, 1.0), 4.0);
  filament += fil2 * smoothstep(0.4, 0.85, near) * backlight * fila * 0.7;

  // ---- compose ----
  vec3 col = BG;
  // emission gas, knocked back where dust lanes cross in front
  col += gasCol * emission * (1.0 - dustMask * 0.96);
  // the dust itself: near-black, faint warm-brown cast so it reads as matter
  vec3 dustCol = BG + gasCol * 0.02;
  col = mix(col, dustCol, dustMask * 0.95);
  // ionization filaments on top (brightest accents), faintly whiter than the gas
  col += mix(gasCol, vec3(1.0), 0.45) * filament * 1.4;

  // a dim outer halo of diffuse gas so the field fills the frame, no dead black
  col += gasCol * fbm(p * 0.8 + vec2(t * 0.2, 3.0)) * 0.05 * backlight;

  // filmic shoulder to tame only the hottest filaments
  col = col / (col + vec3(0.9)) * 1.85;

  // gentle vignette, edges fall to black
  vec2 vq = uv - 0.5;
  float vign = 1.0 - smoothstep(0.5, 1.05, length(vec2(vq.x * 0.95, vq.y)));
  col *= mix(0.74, 1.0, vign);

  // dither to kill banding in the smooth gas gradients
  col += (hash21(fc + fract(t)) - 0.5) / 255.0;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
