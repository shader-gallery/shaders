// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// keel (Brink) — a burning-ship-style Julia set rendered as a single glowing
// coastline: before each squaring the iterate is folded through abs(), so the
// smooth quadratic curl breaks into creases — keel-lines, hull flanks and
// rigging-like tendril stands — an anisotropic dark vessel run aground in
// near-black. Shading is the smooth escape count rendered as glow hugging the
// boundary, palette blended by escape phase mixed with local fold parity so
// creased faces and open bays sit in different hues. The hidden seed c sweeps a
// slow closed arc and the whole wreck rebuilds itself: tendrils extend and
// dissolve, creases migrate, the keel buckles into new keels — the boundary
// continuously becomes a different boundary without any part of it travelling.
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
uniform float u_foldMix;     // 0=smooth quadratic Julia .. 1=full abs-fold burning-ship  (default 1)
uniform float u_writheSpeed; // speed of the seed's closed arc / rebuild rate            (default 0.045)
uniform float u_zoom;        // magnification about the composition centre               (default 1)
uniform float u_glowReach;   // depth of the luminous escape-band margin                 (default 1.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   ITERS    = 40;     // constant escape-time loop bound
const float ESCAPE   = 64.0;   // bailout radius squared (large -> smooth count)

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // --- map pixel to fractal plane, off-centre with a shallow diagonal axis ---
  // normalised coords, square aspect on the short edge
  float mn  = min(res.x, res.y);
  vec2  uv  = (fc - ctr) / mn;          // ~[-0.5..0.5] on short axis
  float zoom = max(u_zoom, 0.05);
  // base half-extent of the view; smaller -> more zoom. The whole creased
  // hull lives in roughly [-2.2..2.2], so frame it as a contained vessel.
  vec2  p   = uv * (2.4 / zoom);
  // rotate the set's long axis onto a shallow diagonal
  float a   = -0.30;
  float ca  = cos(a), sa = sin(a);
  p = mat2(ca, -sa, sa, ca) * p;
  // look-at the hull's creased flank, off-centre so the wreck runs aground on a
  // shallow diagonal with an open dark bay; FIXED in fractal space so zooming
  // magnifies into the coastline rather than sliding it off-frame
  p += vec2(-0.30, 0.42);

  // --- hidden seed c sweeps a slow closed (Lissajous) arc through a region of
  // the parameter plane rich in creased burning-ship filigree ---
  float ph = t * u_writheSpeed;
  vec2  c  = vec2(
    -0.90 + 0.155 * cos(ph * 6.2831853),
    -0.18 + 0.130 * sin(ph * 6.2831853 * 2.0)
  );

  // --- abs-folded Julia iteration, 40 constant steps, smooth escape count ---
  vec2  z      = p;
  float fold   = clamp(u_foldMix, 0.0, 1.0);
  float escAcc = 0.0;        // accumulated fold "energy" -> parity of creasing
  float esc    = 0.0;        // smooth escape count
  float r2     = dot(z, z);
  float escaped = 0.0;

  for (int i = 0; i < ITERS; i++) {
    // once escaped, freeze the iterate so z never overflows to inf/NaN and
    // poisons the crease/parity accumulation (GLSL ES 1.00 has no early break)
    if (escaped < 0.5) {
      // fold through abs() before squaring (burning-ship when fold==1)
      vec2 zf = mix(z, abs(z), fold);
      // how much this step bent the iterate away from the smooth path (crease cue)
      escAcc += abs(zf.x - z.x) + abs(zf.y - z.y);
      // complex square + seed
      z = vec2(zf.x * zf.x - zf.y * zf.y, 2.0 * zf.x * zf.y) + c;
      r2 = dot(z, z);
      if (r2 > ESCAPE) {
        // smooth (continuous) iteration count via the standard log-log estimator
        esc = float(i) + 1.0 - log2(0.5 * log(r2));
        escaped = 1.0;
      }
    }
  }
  // points that never escaped: treat as deep interior (max count)
  if (escaped < 0.5) esc = float(ITERS);

  // normalised escape phase 0..1 (boundary band is the interesting region)
  float en = esc / float(ITERS);

  // --- glow hugging the boundary: bright where escape is slow (near the edge),
  // falling to black on both the interior and exterior sides ---
  float reach = max(u_glowReach, 0.05);
  // raw smooth escape count: small in the far exterior, large near the
  // coastline, ITERS in the deep interior. The luminous margin is a band that
  // peaks just outside the boundary and decays both ways into black.
  float ec    = esc;                       // 0 (far out) .. ITERS (interior)
  // The creased filigree lives in the bunched-up escape shells just outside the
  // hull. A wide soft band catches several of those shells (the scalloped
  // keel-lines and rigging stands); glowReach scales the lit depth.
  float shell = float(ITERS) - 1.0;        // coastline sits near max escape
  // band width grows with glowReach but keeps a usable floor so the min
  // extreme is a tight bright keel-line rather than an empty black screen
  float bw    = 11.0 + 7.0 * reach;
  float d     = (shell - ec) / bw;
  float band  = exp(-d * d);
  // kill glow on the deep-interior side so the hull body reads as a dark mass
  band       *= 1.0 - smoothstep(0.94, 1.0, en);
  // fade the far exterior (very low escape counts) so the bay reads near-black
  band       *= smoothstep(2.0, 9.0, ec);
  // a tighter hot rim right at the coastline filament
  float d2    = (shell - ec) / (2.0 + 1.5 * reach);
  float rim   = exp(-d2 * d2) * (1.0 - smoothstep(0.97, 1.0, en));

  // interior keel-lines: faint creased structure INSIDE the dark hull, so keel
  // reads as a textured solid mass — its identity vs limn's hollow neon outline
  // and shore's bright fill. Driven by fold energy + the final orbit position so
  // the creases sit where the burning-ship folding bunched up.
  float interiorMask = smoothstep(0.93, 1.0, en);            // 1 deep inside hull
  float orbitTex = 0.5 + 0.5 * sin(escAcc * 2.6 + z.x * 4.0 - z.y * 3.4);
  orbitTex = pow(orbitTex, 2.2);
  float interior = interiorMask * (0.12 + 0.55 * orbitTex);

  // --- palette blended by escape phase mixed with local fold parity ---
  // At fold==1 the lit pixels of the thin rim all sit near the same escape
  // shell, so escape count alone collapses the hue to a single slice of the
  // wheel. To make warm creased spines visibly separate from cool open bays we
  // drive the wheel with quantities that genuinely VARY along the rim at high
  // fold: (a) the accumulated fold energy (creased faces fold far more than
  // smooth ones) and (b) a spatial position term that sweeps the hue smoothly
  // around the hull's flanks. The escape-count term is kept small so the vivid
  // multi-shell lacework still reads at fold==0 where ec does vary.

  // fold parity / crease energy: creased keel-lines accumulate large escAcc,
  // smooth bays accumulate little. Map it through a gentle curve so it spans
  // most of the wheel without high-frequency fract() speckling.
  float foldE  = escAcc / (1.0 + escAcc);          // 0 (smooth) .. ~1 (deeply creased)
  float parity = foldE;                            // crease discriminator for brightness

  // spatial sweep: angle of the sample about the composition centre walks the
  // hue continuously around the hull so opposite flanks land in different
  // palette entries (warm spine on one side, cool bay on the other). Scaled to
  // span a couple of wheel units across the visible coastline.
  vec2  pr     = p - vec2(-0.30, 0.42);            // recentre on the wreck
  float ang    = atan(pr.y, pr.x);                 // -PI..PI around the hull
  float spatial = ang * (1.0 / 3.14159265);        // -1..1

  // wheel position: spatial sweep gives the dominant warm-spine/cool-bay
  // separation, crease energy offsets creased faces, escape phase adds the
  // fine multi-hue lacework (dominant only at low fold), all drifting slowly.
  float s = (spatial * 2.1 + foldE * 1.7 + ec * 0.10 + ph * 0.5);
  s = fract(s) * 4.0;

  // Palette fallback (headless contexts can leave u_palette zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  // push the blended hue away from its grey to keep theme colours vivid on the
  // dim rim (the soft-mix toward BG otherwise desaturates the glow to near-grey)
  float hlum = dot(hue, vec3(0.299, 0.587, 0.114));
  hue = clamp(mix(vec3(hlum), hue, 1.45), 0.0, 1.0);

  // creased faces lean warm/bright, smooth bays stay cooler & dimmer
  float crease = mix(0.75, 1.25, parity);

  // --- composite onto near-black ---
  vec3 col = BG;
  // soft luminous boundary glow hugging the coastline filigree
  col += hue * band * 4.4 * crease;
  // hot coastline filament (brighter so the rim reads clearly)
  col += hue * rim * 2.4 * crease;
  // faint interior keel-line texture, tinted cool toward the hull body
  col += mix(hue, c0, 0.4) * interior * 0.34 * crease;

  // soft tone-map to tame the hot filament without clipping to flat white,
  // keeping the near-black base intact
  col = vec3(1.0) - exp(-col * 1.6);

  // gentle vignette to seat the wreck in surrounding darkness
  float vign = 1.0 - smoothstep(0.45, 1.15, length((fc - ctr) / res));
  col *= mix(0.6, 1.0, vign);

  // subtle dithering to kill banding in the dim gradients
  float dith = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += dith / 255.0;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
