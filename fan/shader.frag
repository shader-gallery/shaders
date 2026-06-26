// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// fan (Veil) — a radial sibling of Pleat. Where Pleat folds the frame into
// straight vertical accordion panels, Fan pleats the cloth around a pivot just
// below the frame, so the folds RADIATE: narrow and converging near the pivot,
// fanning out into broad wedges toward the top, like a folding hand-fan or a
// sunburst-pleated skirt opening upward. Each wedge is flat-shaded into a lit
// plane and a shadow plane split by a luminous radial crease, and a broad band
// of light sweeps ANGULARLY across the fan, handing brightness wedge to wedge.
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
uniform float u_pleatCount;  // number of pleats across a 90-degree span (default 12)
uniform float u_rollSpeed;   // angular illumination-band sweep speed     (default 0.4)
uniform float u_sway;        // amplitude of pleat flutter / ripple        (default 0.45)

const vec3  BG         = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI         = 3.14159265;
const float BAND_WIDTH = 0.22;   // fraction of the fan the bright band spans

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

  // ---- radial fan coordinate around a pivot just below the frame ----
  // The pivot sits below the bottom edge so the fan converges there and opens
  // upward across the whole frame. Pivot offset scales with resolution, so the
  // composition is identical at poster size and full-screen (no refScale needed:
  // the pleat count is an ANGLE division, which is inherently scale-stable).
  vec2  pivot = vec2(ctr.x, -0.30 * res.y);
  vec2  v     = fc - pivot;
  float r     = length(v);
  float ang   = atan(v.x, v.y);          // 0 points straight up, +/- toward sides

  // pleats divide the angle evenly: count pleats per 90 degrees. Continuous
  // panel coordinate so creases land on integers and the fan tiles all angles.
  float angStep = (PI * 0.5) / max(u_pleatCount, 2.0);
  float px = ang / angStep;

  // gentle flutter: the fan ripples as a function of radius and time, so the
  // pleats lean and breathe instead of standing rigid. Amplitude grows a little
  // with radius (the open end of the fan flutters more than the pivot).
  float rn   = r / max(res.y, 1.0);                       // 0 at pivot, ~1+ at top
  float lean = sin(t * 0.21) * 0.55 + sin(t * 0.13 + 1.7) * 0.45;  // slow -1..1
  float ripple = sin(rn * 5.0 - t * 0.6);                // travelling radial wave
  float swayAmt = u_sway * 0.9;
  px += swayAmt * (lean * 0.6 + ripple * rn * 0.7);

  // triangle wave from the panel coordinate: each unit is one fold (/\ ridge).
  float pid    = floor(px);              // which wedge (facet id)
  float fphase = fract(px);              // 0..1 across this wedge
  float tri    = 1.0 - abs(fphase - 0.5) * 2.0;   // 0 at creases, 1 at ridge

  // ---- facet normal (flat shading) ----
  // Two flat facets per fold: rising half and falling half catch the key light
  // differently, so adjacent half-wedges read as distinct planes of light/shadow.
  float slopeSign = (fphase < 0.5) ? 1.0 : -1.0;
  float facetTilt = swayAmt * (lean * 0.5 + ripple * 0.25);
  float facet     = 0.5 + 0.5 * slopeSign;             // 1.0 lit half, 0.0 dark half
  float facetShade = mix(0.22, 1.0, facet);            // deep but non-black shadow
  facetShade *= clamp(1.0 + facetTilt * slopeSign * 0.7, 0.2, 1.6);

  // ---- hard radial creases + bright ridge catch-light ----
  // Pleat widens with radius, so a fixed screen-px feather must be converted to
  // panel units via the local pleat width (r * angStep). Clamp near the pivot
  // where wedges collapse to a point (keeps the convergence from aliasing).
  float pleatPx = max(r * angStep, 1.0);               // screen-px width of a pleat
  float aa      = clamp(1.5 / pleatPx, 0.0, 0.45);     // feather in panel units
  float creaseDist = min(fphase, 1.0 - fphase);        // 0 at wedge edges
  float ridgeDist  = abs(fphase - 0.5);                // 0 at ridge
  float crease = 1.0 - smoothstep(0.0, aa * 2.2, creaseDist);
  float ridge  = 1.0 - smoothstep(0.0, aa * 2.2, ridgeDist);

  // ---- rolling illumination band (sweeps ANGULARLY across the fan) ----
  float bandPhase = fract(t * u_rollSpeed * 0.1);      // 0..1 loop, ~10s at speed 1
  // normalised angular position across a reference 150-degree fan, 0..1
  float xn = clamp(ang / (PI * 0.83) + 0.5, 0.0, 1.0);
  float dx = xn - bandPhase;
  dx -= floor(dx + 0.5);                                // nearest wrap, -0.5..0.5
  float band = exp(-(dx * dx) / (2.0 * BAND_WIDTH * BAND_WIDTH * 0.5));
  float dx2 = xn - fract(bandPhase + 0.5);
  dx2 -= floor(dx2 + 0.5);
  band += 0.45 * exp(-(dx2 * dx2) / (2.0 * BAND_WIDTH * BAND_WIDTH * 0.5));
  band = clamp(band, 0.0, 1.3);

  // ---- palette tint by wedge position + radius ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // hue drifts wedge to wedge plus an outward radial drift and a slow time roll
  float k = pid * 0.16 + rn * 0.6 + t * 0.02;
  float s = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // ---- compose ----
  vec3 col = BG;

  // always-on plane lighting carries the /\ two-facet read across the whole fan
  float ambient = 0.14 * facetShade;
  float bandLit = band * facetShade;
  float lit = ambient + bandLit * 0.95;
  col += tint * lit * 0.58;

  // faint flat sheen on the lit facet within the band (kept low so facets stay flat)
  float sheen = band * facet;
  col += tint * sheen * 0.18;

  // hard radial creases carve shadow; bright ridge splits each wedge into planes
  col *= 1.0 - crease * 0.92;
  float ridgeLight = ridge * (0.18 + band * 0.70);
  col += tint * ridgeLight;

  // radial brightness: lift the open end of the fan a touch and keep the pivot
  // dense and dark, so the sunburst reads as opening upward (not a flat wash)
  col *= mix(0.7, 1.12, smoothstep(0.0, 1.1, rn));

  // gentle vignette keeps the framing composed and the edges dark
  vec2 vq = (fc - ctr) / res;
  float vign = 1.0 - smoothstep(0.32, 1.05, length(vq * vec2(1.0, 1.1)));
  col *= mix(0.5, 1.0, vign);

  // subtle global breath so even at roll-speed 0 the cloth feels alive
  col *= 0.92 + 0.08 * (0.5 + 0.5 * sin(t * 0.4 + rn * 3.0));

  // keep u_mouse referenced so the no-pointer face is the only face
  col += 0.0 * (u_mouse.x);

  gl_FragColor = vec4(col, 1.0);
}
