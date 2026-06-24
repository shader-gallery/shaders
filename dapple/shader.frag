// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// dapple (Shoal) — sunlight through a drifting mat of surface foliage. The
// near-black seabed carries a sparse constellation of discrete, soft-edged
// elliptical sun-flecks: countable patches of light with crisp penumbrae and
// true dark between them, never a continuous field. All flecks share one
// projection slant so their ellipses align; each takes a slightly different
// palette tint by position. A passing swell sways the whole constellation in
// coherent lockstep, while individual flecks fade out and back as fronds
// occlude them (an unbounded noise domain, so nothing ever resets), and now
// and then one fleck pinches smoothly into two as a gap overhead closes.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swaySpeed;  // swell rocking speed + occlusion-blink pace (default 0.3)
uniform float u_fleck;      // css-px width of one sun-fleck (default 110)
uniform float u_cover;      // fraction of floor shaded by the mat 0..0.9 (default 0.55)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black seabed ~#09090B
const float SLANT     = 0.62;  // shared projection slant: how stretched/sheared ellipses are
const float SHEAR     = 0.52;  // diagonal shear so all ellipses align to one obvious common tilt

// hash helpers (no textures) ------------------------------------------------
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
vec2  hash21(float n) { return fract(sin(vec2(n * 127.1, n * 311.7)) * 43758.5453123); }

// 2D value noise for the unbounded occluding-cover domain
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i,               vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1,0),   vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0,1),   vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1,1),   vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // palette fallback (headless contexts can leave the array zeroed) ----------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float speed = u_swaySpeed;
  float fleck = max(u_fleck, 8.0) * pr;   // guard: never zero-width
  float cover = clamp(u_cover, 0.0, 0.9);

  // --- lockstep swell: the whole constellation shears + slides in unison.
  // Built from incommensurate sines so the rocking never repeats exactly. ---
  float ph = t * speed;
  vec2 sway = vec2(
    sin(ph * 0.73) * 0.55 + sin(ph * 1.31 + 1.7) * 0.30 + sin(ph * 0.41 + 4.2) * 0.22,
    sin(ph * 0.91 + 2.3) * 0.50 + sin(ph * 1.17 + 0.5) * 0.28 + sin(ph * 0.37 + 3.1) * 0.20
  ) * fleck * 0.28;   // subtle rock-in-place: blinking does the visible work, not drift

  // sample point shifted by the swell, then sheared into the common slant.
  // grid cells are fleck-sized so flecks are sparse and countable.
  float cell = fleck * 1.35;
  vec2 sp = fc - sway;
  // shear into projection slant: ellipses align to one diagonal tilt
  vec2 warp = vec2(sp.x + sp.y * SHEAR, sp.y * (1.0 + SLANT));
  vec2 gid  = floor(warp / cell);
  vec2 lf   = fract(warp / cell);

  // accumulate over a 3x3 neighbourhood of cells (constant bounds) so flecks
  // near cell borders aren't clipped.
  float light = 0.0;
  vec3  tint  = vec3(0.0);

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 o    = vec2(float(ox), float(oy));
      vec2 id   = gid + o;
      float seed = dot(id, vec2(37.3, 11.7)) + 0.5;

      // per-fleck random jitter inside its cell (anchored — sways in place)
      vec2 jit = hash21(seed) * 0.6 + 0.2;
      vec2 fcen = (o + jit - lf);           // vector from this pixel to fleck centre, in cell units

      // ellipse: strongly anisotropic AND rotated to a shared diagonal tilt, so
      // each spot reads as a slanted sun-fleck (a stretched lens of light) rather
      // than a round bokeh disc. Rotate fcen into the slant axis first, then
      // squash: long axis runs down-right for every fleck (one common projection).
      const float CA = 0.829, SA = 0.559;  // cos/sin of the shared ~34deg slant
      vec2 fr = vec2(fcen.x * CA - fcen.y * SA, fcen.x * SA + fcen.y * CA);
      vec2 e = fr * vec2(0.60, 1.46);

      // occasional smooth pinch into two: as a gap overhead closes, the fleck
      // parts into two clearly separate rounded lobes that slide apart along the
      // ellipse's long (warped-x) axis. We sample TWO lobe centres and take the
      // stronger — so the result is two distinct rounded flecks, not a thin slit.
      // Phase per fleck, slow; a full split is rare and always a clean parting.
      float pinchPh = t * speed * 0.5 + seed * 6.28;
      float pinchAmt = smoothstep(0.78, 1.0, sin(pinchPh) * 0.5 + 0.5); // 0 nearly always
      float sepX = pinchAmt * 0.26;   // half-distance the two lobes drift apart

      float rad = 0.30;
      // two lobe samples offset along the major axis; each is a soft round-ended
      // ellipse so the split products are themselves clean rounded flecks.
      float rL = length(e - vec2(-sepX, 0.0));
      float rR = length(e - vec2( sepX, 0.0));
      float spotL = 1.0 - smoothstep(rad * 0.45, rad, rL);
      float spotR = 1.0 - smoothstep(rad * 0.45, rad, rR);
      float spot = max(spotL, spotR);

      // occlusion: fronds drift in an unbounded noise domain. cover raises the
      // shade threshold so fewer flecks survive. blink fades in/out smoothly.
      vec2 ndom = (id * 0.6) + vec2(t * speed * 0.18, -t * speed * 0.13);
      float shade = vnoise(ndom) * 0.6 + vnoise(ndom * 2.3 + 5.0) * 0.4;
      // also a faster per-fleck flicker so flecks blink at slightly different times
      shade += 0.18 * sin(t * speed * 0.9 + seed * 2.1);
      float survive = smoothstep(cover - 0.12, cover + 0.18, shade);

      float amp = spot * survive;

      // per-position palette tint: a warm fleck beside a cool one. Position on
      // the wheel from cell id (no dynamic array indexing).
      float wsel = fract(seed * 0.013 + (id.x * 0.05 + id.y * 0.03));
      float s = wsel * 4.0;
      float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
      vec3  fcol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

      light += amp;
      tint  += fcol * amp;
    }
  }

  vec3 fleckCol = tint / max(light, 0.001);

  // core + a soft bloom halo so each fleck reads as light cast on dark floor.
  // a slightly larger, brighter halo gives the palette more presence across the
  // frame so a re-theme registers clearly even against the near-black seabed.
  float core = light;
  float halo = light * 0.50;

  // gentle vignette: edges deeper in shade, composed framing
  float vign = 1.0 - smoothstep(0.35, 1.15, length((fc - ctr) / res));

  col += fleckCol * core * 1.35 * vign;
  col += fleckCol * halo * 0.72 * vign;

  // faint cool ambient in the deep water so true-dark isn't dead flat
  col += c2 * 0.012 * vign;

  gl_FragColor = vec4(col, 1.0);
}
