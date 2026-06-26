// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// pleat (Veil) — crisp accordion-pleated fabric: a triangle-wave heightfield
// folds the frame into alternating flat panels divided by hard crease lines.
// Each panel is flat-shaded by its facet normal, so adjacent pleats read as
// distinct planes of light and shadow. A broad band of illumination rolls
// horizontally across the cloth (~10 s per traversal), handing brightness off
// pleat to pleat, while the creases bow and lean on slow sines. Panels are
// tinted by palette colour according to position — geometric, architectural
// folds against a dark sky.
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
uniform float u_pleatWidth;  // css-px width of one accordion panel (default 110), scaled by u_pixelRatio
uniform float u_rollSpeed;   // illumination-band sweep speed       (default 0.4)
uniform float u_sway;        // amplitude of crease bowing/leaning   (default 0.45)

const vec3  BG         = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI         = 3.14159265;
const float TWO_PI     = 6.28318531;
const float BAND_WIDTH = 0.22;   // fraction of screen the bright band spans

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

  // normalized coords: nx in roughly [-aspect/2, aspect/2], ny in [-0.5, 0.5]
  float aspect = res.x / max(res.y, 1.0);
  vec2  uv = (fc - ctr) / max(res.y, 1.0);

  // ---- pleat coordinate along x, in panel units ----
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float panelPx = max(u_pleatWidth, 8.0) * refScale * pr;        // guard against 0
  float panels  = res.x / panelPx;                    // number of panels across
  // continuous panel coordinate (0 at left edge), so creases sit on integers
  float px = (fc.x / panelPx);

  // gentle sway: the whole pleat field leans and bows on slow sines. We shear
  // the panel coordinate by a vertical-dependent term and modulate amplitude.
  float ny = uv.y;
  float lean = sin(t * 0.21) * 0.55 + sin(t * 0.13 + 1.7) * 0.45;   // -1..1 slow
  float bow  = sin(ny * PI + t * 0.17);                              // vertical bow
  float swayAmt = u_sway * 0.9;
  px += swayAmt * (lean * ny * 1.2 + bow * 0.35);

  // triangle wave from the panel coordinate: each unit is one fold. The fold
  // phase 0..1 within a panel; tri ramps 0->1->0 giving a /\ accordion ridge.
  float pid  = floor(px);              // which panel (facet id)
  float fphase = fract(px);            // 0..1 across this panel
  // triangle height: 0 at creases (integer px), 1 at panel centre
  float tri = 1.0 - abs(fphase - 0.5) * 2.0;

  // ---- facet normal (flat shading) ----
  // The heightfield is z = tri across x. Within a panel the slope is constant:
  // +1 on the rising half, -1 on the falling half -> two flat facets per fold,
  // i.e. every panel shows a lit plane and a shadowed plane. Sign flips at the
  // ridge (fphase==0.5) and at the creases (fphase==0/1).
  float slopeSign = (fphase < 0.5) ? 1.0 : -1.0;
  // facet brightness from a fixed key light direction; the two slopes catch
  // light differently so adjacent half-panels read as distinct planes.
  // map slopeSign (+/-1) plus a slow tilt to a 0..1 facet shade.
  float facetTilt = swayAmt * (lean * 0.5 + bow * 0.25);
  float facet = 0.5 + 0.5 * slopeSign;                 // 1.0 lit half, 0.0 dark half
  // Strong, BAND-INDEPENDENT facet contrast so every panel reads as a lit plane
  // hard against a shadow plane (the geometric, flat-shaded /\ signature) even
  // away from the rolling band. The lit half is bright, the shadow half is a
  // deep but non-black tint so the two planes always stay legible side by side.
  float facetShade = mix(0.22, 1.0, facet);
  // sway tilts which plane catches more light (folds leaning toward/away light)
  facetShade *= clamp(1.0 + facetTilt * slopeSign * 0.7, 0.2, 1.6);

  // ---- hard crease lines ----
  // creases at integer px (between panels) AND at the ridge (fphase 0.5).
  // distance to nearest crease in panel-units, converted to px for AA.
  float creaseDist = min(fphase, 1.0 - fphase);        // 0 at panel edges
  float ridgeDist  = abs(fphase - 0.5);                // 0 at ridge
  // width of a panel in screen px controls AA feather
  float aaPx = 1.5 / panelPx;                          // ~1.5px feather in panel units
  float crease = 1.0 - smoothstep(0.0, aaPx * 2.2, creaseDist);
  float ridge  = 1.0 - smoothstep(0.0, aaPx * 2.2, ridgeDist);

  // ---- rolling illumination band (sweeps horizontally, ~10s/traversal) ----
  // phase travels continuously; map screen x (0..1) minus moving centre.
  float bandPhase = fract(t * u_rollSpeed * 0.1);      // 0..1 loop, ~10s at speed 1
  float xn = fc.x / res.x;                              // 0..1 across screen
  // wrap-aware distance from the band centre so it re-enters seamlessly
  float dx = xn - bandPhase;
  dx -= floor(dx + 0.5);                                // nearest wrap, -0.5..0.5
  float band = exp(-(dx * dx) / (2.0 * BAND_WIDTH * BAND_WIDTH * 0.5));
  // a faint second lobe so brightness is handed off rather than a lone blob
  float dx2 = xn - fract(bandPhase + 0.5);
  dx2 -= floor(dx2 + 0.5);
  band += 0.45 * exp(-(dx2 * dx2) / (2.0 * BAND_WIDTH * BAND_WIDTH * 0.5));
  band = clamp(band, 0.0, 1.3);

  // ---- palette tint by panel position ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // hue drifts panel to panel plus a slow time roll so it loops without reset.
  float k = pid * 0.16 + ny * 0.25 + t * 0.02;
  float s = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // ---- compose ----
  vec3 col = BG;

  // Base cloth = flat-shaded facets. The facet step (lit half vs shadow half)
  // is carried by an AMBIENT term that does NOT depend on the band, so the
  // hard /\ two-plane accordion read is present across the WHOLE frame, not
  // only under the moving light. This is the geometric signature the facets owe.
  float ambient = 0.14 * facetShade;                   // always-on plane lighting
  // The rolling band adds a coherent horizontal sweep ON TOP, handing brightness
  // pleat to pleat. It still respects the facet step (so the band brightens the
  // lit half more than the shadow half) but it is additive, not a multiply that
  // would wash the facet contrast out. Band term is strong vs ambient so the
  // horizontal travel is unmistakable.
  float bandLit = band * facetShade;
  float lit = ambient + bandLit * 0.95;
  col += tint * lit * 0.58;

  // a faint sheen on the lit facet within the band — kept low so facets stay
  // FLAT (discrete planes) rather than turning into a smooth crest gradient.
  float sheen = band * facet;
  col += tint * sheen * 0.18;

  // ---- hard creases + a BRIGHT ridge catch-light ----
  // Dark valleys carve the panel edges (integer px). The ridge (fphase==0.5) is
  // lit as a luminous crease that SPLITS each panel into its two facets — this is
  // the line that makes the lit half and shadow half read as distinct planes.
  col *= 1.0 - crease * 0.92;                           // creases carve shadow
  // ridge catch-light: a constant base sheen (so the split is visible even off
  // the band) plus a strong band-driven boost (so it blazes under the sweep).
  float ridgeLight = ridge * (0.18 + band * 0.70);
  col += tint * ridgeLight;

  // gentle vignette keeps the framing composed and the edges dark
  vec2 vq = (fc - ctr) / res;
  float vign = 1.0 - smoothstep(0.3, 1.0, length(vq * vec2(1.0, 1.15)));
  col *= mix(0.45, 1.0, vign);

  // subtle global breath so even at roll-speed 0 the cloth feels alive
  col *= 0.92 + 0.08 * (0.5 + 0.5 * sin(t * 0.4 + ny * 2.0));

  gl_FragColor = vec4(col, 1.0);
}
