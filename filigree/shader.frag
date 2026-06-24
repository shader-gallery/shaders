// filigree (Loom) — a fine ornamental lattice: a grid of thin glowing
// rounded-diamond outlines that pulse brighter in slow waves rolling across the
// field. Lace-like and delicate; cell interiors carry a controllable radial
// gradient while the outlines trace palette colours and catch a steerable light,
// like etched metal relief. The whole field can be rotated, skewed and tilted.
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
uniform float u_spacing;    // px between lattice nodes
uniform float u_line;       // outline half-thickness
uniform float u_waveSpeed;  // brightness wave speed
uniform float u_glow;       // lace glow multiplier
// radial-gradient controls (per cell)
uniform float u_dotSize;    // centre jewel radius scale
uniform float u_dotGlow;    // centre jewel intensity scale
uniform float u_fill;       // interior radial fill amount
uniform float u_fillSize;   // interior fill radius (fraction of cell)
uniform float u_variation;  // per-tile brightness/gradient jitter
// transform + light
uniform float u_rotate;     // field rotation (degrees)
uniform float u_tilt;       // perspective fore/back foreshorten
uniform float u_skew;       // horizontal shear
uniform float u_lightAngle; // light bearing (degrees)
uniform float u_lightAmt;   // relief light strength

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float ROUND_CSS   = 4.0;    // corner rounding radius of each diamond
const float WAVELEN_CSS = 380.0;  // wavelength of the rolling brightness wave

float hash21(vec2 p) { p = fract(p * vec2(0.2317, 0.2659)); p += dot(p, p.yx + 23.19); return fract((p.x + p.y) * p.x); }

// rounded-diamond signed distance: an L1 (diamond) of radius rad, rounded by r
float sdRoundDiamond(vec2 p, float rad, float r) {
  p = abs(p);
  float d = (p.x + p.y - rad) * 0.70710678; // /sqrt(2): perpendicular dist to edge
  return d - r;
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

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = u_spacing * refScale * pr;
  float round   = ROUND_CSS * pr;
  float line    = u_line * pr;
  // diamond radius (pre-round); corners reach toward the cell edges so the
  // diamonds nearly touch and read as one continuous lace net
  float rad     = spacing * 0.5 - round - line - pr * 0.5;

  // --- field transform: rotate, skew, then a perspective tilt. At defaults
  // (all 0) the pattern coordinate equals fc so the look is unchanged. ---
  vec2 p = fc - ctr;
  float ra = radians(u_rotate);
  float ca = cos(ra), sa = sin(ra);
  p = mat2(ca, -sa, sa, ca) * p;
  p.x += u_skew * p.y;
  float depth = 1.0 + u_tilt * (p.y / max(res.y * 0.5, 1.0));
  p /= max(depth, 0.2);
  vec2 pf = p + ctr;

  // local position within the current cell, centred on its node
  vec2 cellId = floor(pf / spacing);
  vec2 node   = (cellId + 0.5) * spacing;
  vec2 local  = pf - node;

  // signed distance to this cell's rounded diamond, then its thin outline
  float sd      = sdRoundDiamond(local, rad, round);
  // soft anti-aliased lace stroke (1.0 on the line, fading out)
  float stroke  = 1.0 - smoothstep(0.0, line + pr * 1.2, abs(sd));

  // --- slow brightness wave rolling diagonally across the field ---
  float diag  = dot(node - ctr, normalize(vec2(0.8, 0.6)));
  float wave  = 0.5 + 0.5 * sin(diag / (WAVELEN_CSS * pr) * 6.2831853 - t * u_waveSpeed);
  // a second, slower cross-wave so the pulse never reads as a single sweep
  float wave2 = 0.5 + 0.5 * sin(length(node - ctr) / (WAVELEN_CSS * 1.7 * pr) * 6.2831853 + t * u_waveSpeed * 0.6);
  float pulse = mix(0.44, 1.0, wave * 0.7 + wave2 * 0.3);

  // per-tile variation: each cell gets a stable random that can dim/brighten it
  // and shift its gradient, so the field is not a perfect repeat. 0 = uniform.
  float rnd = hash21(cellId + 7.0);
  pulse *= mix(1.0, 0.45 + 1.1 * rnd, clamp(u_variation, 0.0, 1.0));

  // Theme colours come from u_palette. Some headless poster contexts can't bind
  // a vec3[] uniform (the active name is "u_palette[0]"), leaving it all-zero;
  // fall back to the default "midnight" hues so a poster never renders black.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // colour traces position: hue drifts with the node + a gentle time roll.
  float k  = (cellId.x * 0.11 + cellId.y * 0.07) + t * 0.012 + rnd * u_variation * 0.6;
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  lace = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // --- steerable relief light: the diamond faces (4 quadrant normals) catch a
  // directional light, brightening the sides that face it like beveled metal. ---
  vec2 ldir = vec2(cos(radians(u_lightAngle)), sin(radians(u_lightAngle)));
  vec2 nrm  = normalize(sign(local) + vec2(0.0008, 0.0011));
  float sheen = dot(nrm, ldir) * 0.5 + 0.5;
  float lit = mix(1.0, 0.3 + 1.35 * sheen, clamp(u_lightAmt, 0.0, 1.0));

  // node jewels: a radial glow dot where the diamonds meet (the per-cell radial
  // gradient). u_dotSize scales its radius, u_dotGlow its strength.
  float jewel = exp(-dot(local, local) / (spacing * spacing * 0.012 * max(u_dotSize, 0.05))) * pulse;

  // interior radial fill: a soft gradient filling each cell from its node out to
  // a fraction of the cell, tinted by the lace colour. 0 keeps interiors dark.
  float fillR = rad * max(u_fillSize, 0.05);
  float fill = (1.0 - smoothstep(0.0, fillR, length(local))) * pulse * u_fill;

  // gentle radial falloff (floored so the lace still reads to the edges)
  float vign = 0.72 + 0.28 * (1.0 - smoothstep(0.45, 1.30, length((fc - ctr) / res)));

  col += lace * stroke * pulse * 0.95 * u_glow * vign * lit;
  col += lace * jewel * 0.55 * u_dotGlow * u_glow * vign;
  col += lace * fill * 0.5 * u_glow * vign;

  // a whisper of outline bloom so the etched metal catches light
  float bloom = exp(-abs(sd) / (line * 5.0)) * pulse;
  col += lace * bloom * 0.18 * u_glow * vign * lit;

  gl_FragColor = vec4(col, 1.0);
}
