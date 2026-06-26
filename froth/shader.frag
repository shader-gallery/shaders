// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// froth (Mosaic) — a wall packed edge-to-edge with soap-foam cells: rounded
// voronoi with a smooth-min softened edge distance so every cell reads as a
// cushioned bubble. Interiors sit near-black; the walls are thin and prismatic,
// their colour blended across the four palette hues by local wall angle, like
// light on an interference film. The whole field scrolls slowly upward — cells
// stretch progressively taller as they climb — and near the top individual
// cells pop at hash-timed moments: a brief wall flash, then the cell sits
// black until it carries off the frame.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four membrane colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cell;       // average bubble diameter, css px (default 70)
uniform float u_riseSpeed;  // upward scroll rate of the foam  (default 0.2)
uniform float u_popRate;    // pop frequency near the top 0..1 (default 0.4)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float STRETCH  = 1.8;  // cells are (1+STRETCH)x taller at the frame top
const float SMIN_K   = 0.13; // junction rounding (cell units) -> cushioned foam
const float WALL_W   = 0.034;// membrane half-thickness in cell units
const float SCROLL_K = 1.5;  // cells per second at riseSpeed = 1

vec2 hash22(vec2 q) {
  q = vec2(dot(q, vec2(127.1, 311.7)), dot(q, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}

// seed point inside cell id (0..1 offset), flexing almost imperceptibly
vec2 seedPt(vec2 id, float t) {
  vec2 h = hash22(id);
  return 0.5 + (h - 0.5) * 0.55 + 0.05 * sin(t * 0.4 + 6.2831853 * h.yx);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr = u_pixelRatio;
  float t  = u_time;
  vec2  fc = gl_FragCoord.xy;
  float H  = max(u_resolution.y, 1.0);

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cellPx = max(u_cell, 8.0) * refScale * pr; // device px per cell unit (at frame bottom)

  // Vertical domain compression: g(y) climbs slower than y, so a fixed-size
  // domain cell occupies more screen the higher it sits — bubbles stretch
  // taller as they rise. Scrolling the domain (not the screen) means new
  // cells enter from below with no visible reset.
  float gy     = (H / STRETCH) * log(1.0 + STRETCH * fc.y / H);
  float scroll = SCROLL_K * u_riseSpeed * t;
  vec2  p      = vec2(fc.x, gy) / cellPx;
  p.y -= scroll;

  vec2 ip = floor(p), fp = fract(p);

  // --- pass 1: nearest bubble seed ---
  float md = 8.0;
  vec2  mr = vec2(0.0), mg = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + seedPt(ip + g, t) - fp;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  vec2 cid = ip + mg; // id of the bubble this pixel lives in

  // Theme colours from u_palette; headless contexts can leave the array
  // zeroed, so fall back to the default "midnight" hues.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- pass 2: smooth-min border distance (rounded foam walls) + membrane
  // hue accumulated from each wall's angle, like an interference film ---
  float hueOff = hash22(cid + 41.7).x * 0.9; // each bubble's film differs a little
  float bd = 8.0;
  vec3  hueSum = vec3(0.0);
  float wSum = 1e-4;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + seedPt(ip + g, t) - fp;
      vec2 dr = r - mr;
      if (dot(dr, dr) > 1e-5) {
        vec2 n = normalize(dr);
        float d = dot(0.5 * (mr + r), n);
        // polynomial smooth-min rounds the junctions: cushioned bubbles
        float hmix = clamp(0.5 + 0.5 * (bd - d) / SMIN_K, 0.0, 1.0);
        bd = mix(bd, d, hmix) - SMIN_K * hmix * (1.0 - hmix);
        // membrane hue from local wall angle, drifting very slowly
        float ang = atan(n.y, n.x);
        float s = fract(ang / 6.2831853 + 0.5 + hueOff + t * 0.012) * 4.0;
        vec3 wc = c0 * wheelW(s, 0.0) + c1 * wheelW(s, 1.0)
                + c2 * wheelW(s, 2.0) + c3 * wheelW(s, 3.0);
        float w = exp(-d * d * 26.0);
        hueSum += wc * w;
        wSum   += w;
      }
    }
  }
  bd = max(bd, 0.0);
  vec3 wallCol = hueSum / wSum;

  // --- pop state: where is this bubble's seed on screen right now? ---
  // invert the domain mapping for the seed to get its screen height fraction
  float gval = (cid.y + seedPt(cid, t).y + scroll) * cellPx;
  float yscr = (H / STRETCH) * (exp(min(STRETCH * gval / H, 3.0)) - 1.0);
  float prog = yscr / H;
  vec2  hc   = hash22(cid + 17.3);
  float thr  = mix(0.55, 0.92, hc.x);   // hash-timed pop line near the top
  float over = prog - thr;
  float sel  = step(hc.y, u_popRate);   // only some bubbles are fated to pop
  float dead = sel * step(0.0, over);   // burst: sits black till it leaves
  float flash = sel * (smoothstep(-0.012, 0.0, over) - smoothstep(0.012, 0.05, over));

  // --- compose ---
  // light pulses travelling seam to seam (domain-space wave, scrolls along)
  float pulse = 0.72 + 0.28 * sin(p.x * 0.9 + p.y * 1.4 - t * 0.6);
  float amp   = (1.0 - dead) + flash * 2.6;

  float aa   = 1.5 / cellPx; // ~1.5 device px of anti-aliasing, in cell units
  float core = 1.0 - smoothstep(WALL_W - aa, WALL_W + aa, bd);
  float halo = exp(-bd * 10.0);

  vec3 col = BG;
  col += wallCol * (core * 0.88 + halo * 0.16) * pulse * amp;
  // faint soap-film sheen filling the live cells
  col += wallCol * 0.04 * (1.0 - dead) * exp(-bd * 2.5);
  // the pop flash whitens briefly, like a membrane catching full light
  col += vec3(1.0) * flash * core * 0.5;

  // gentle vignette keeps the frame composed
  vec2 q = fc / u_resolution - 0.5;
  col *= 1.0 - 0.55 * dot(q, q);

  // tiny dither defeats banding in the dark glow falloffs
  col += (hash22(fc * 0.7 + t).x - 0.5) * (1.5 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
