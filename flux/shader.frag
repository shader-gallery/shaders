// flux (Strata) — the analytic 2D magnetic dipole. Two opposite poles hang in
// dark space as small soft cores, and the dipole stream function (the difference
// of the two atan angles) is contoured into fine luminous field-line arcs sweeping
// pole to pole. Arcs compress into bright bundles diving into each core and relax
// into wide lazy curves at midfield; hue blends by arc index from the inner bundle
// outward. The poles orbit their common centre while a contour-phase crawl slides
// each line along its own length — arcs budding at one flank, absorbed at the other.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_orbitSpeed;  // angular speed of the two poles    (default 0.15)
uniform float u_lineCount;   // number of contour levels / arcs   (default 24)
uniform float u_crawl;       // line-slide speed along their length (default 0.4)
uniform float u_lineWidth;   // stroke half-width, css px          (default 1.1)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float ORBIT_R  = 0.26;   // pole orbit radius in normalised units (1 = half min-dim)
const float TWO_PI   = 6.2831853;

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

  // normalised coordinate: centred, y-up, unit = half the min screen dimension,
  // so the field geometry is DPR- and aspect-stable.
  float mind = min(res.x, res.y);
  vec2  p = (fc - ctr) / (mind * 0.5);

  // --- two orbiting poles about the common centre ---
  float orbit = t * u_orbitSpeed;                 // periodic, phase-continuous
  vec2  dir   = vec2(cos(orbit), sin(orbit));
  vec2  poleA =  dir * ORBIT_R;                    // + source
  vec2  poleB = -dir * ORBIT_R;                    // - sink

  // analytic dipole stream function: difference of the two atan angles.
  vec2  dA = p - poleA;
  vec2  dB = p - poleB;
  float aA = atan(dA.y, dA.x);
  float aB = atan(dB.y, dB.x);
  float phi = aA - aB;                             // stream function (the arcs are its level sets)

  // contour the stream function. sin(N*phi - crawlPhase) carves N field-line arcs;
  // the crawl phase slides each line along its own length (pole-to-pole) without reset.
  float N      = max(u_lineCount, 1.0);
  float crawl  = t * u_crawl * 1.2;
  float field  = N * phi - crawl;

  // analytic screen-space width of one contour: |grad(field)| in device px.
  // grad(phi) of a dipole = (dA/|dA|^2 rotated) - (dB/|dB|^2 rotated); we only need
  // its magnitude to normalise the stroke to a constant pixel width everywhere.
  float r2A = max(dot(dA, dA), 1e-4);
  float r2B = max(dot(dB, dB), 1e-4);
  // d(atan(y,x)) magnitude = 1/r ; gradient of phi has magnitude ~ |gA - gB| but a
  // safe upper proxy that keeps strokes crisp near the poles is the sum of 1/r terms.
  vec2  gA = vec2(-dA.y, dA.x) / r2A;
  vec2  gB = vec2(-dB.y, dB.x) / r2B;
  vec2  grad = (gA - gB) * N;                       // per normalised-unit
  // convert to per-device-pixel: one normalised unit = mind*0.5 device px
  float gpx = length(grad) / (mind * 0.5);
  gpx = max(gpx, 1e-4);

  // signed distance (in device px) to the nearest contour crest of sin(field).
  float s   = sin(field);
  float dpx = asin(clamp(s, -1.0, 1.0));            // small-angle distance to crest, in field-radians
  // distance in px from this fragment to the line crest:
  float linePx = abs(dpx) / gpx;

  // anti-aliased stroke. Width in css px → device px; near the poles arcs overlap
  // into bright bundles naturally because many crests crowd one pixel.
  float halfw = u_lineWidth * pr;
  float aa    = pr * 1.0;
  float stroke = 1.0 - smoothstep(halfw, halfw + aa, linePx);

  // iron-filing granularity: modulate brightness with a fine texture running
  // across + along the arcs so they read as chains of aligned magnetic filings
  // rather than perfectly smooth curves — flux's granular identity vs isobar's
  // clean cyclonic spirals. A slow drift keeps the filings alive without reset.
  float grain = sin(field * 2.7 + (p.x - p.y) * mind * 0.55 + t * 0.3)
              * sin((p.x + p.y) * mind * 0.42 - t * 0.2);
  grain = 0.60 + 0.40 * (0.5 + 0.5 * grain);
  stroke *= grain;

  // arc index for hue: the contour level number from inner bundle outward.
  // floor of (field / pi) gives a per-arc integer that the crawl advances slowly.
  float arc = floor(field / 3.14159265);
  float hk  = arc * 0.13 + t * 0.01;                // hue drifts gently, loops
  float sw  = fract(hk) * 4.0;

  // palette + headless fallback (midnight)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  float w0 = wheelW(sw, 0.0), w1 = wheelW(sw, 1.0), w2 = wheelW(sw, 2.0), w3 = wheelW(sw, 3.0);
  vec3  hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  vec3 col = BG;

  // field lines. Fade arcs that pass very far from any pole (the field is weak at
  // the frame corners) so midfield stays composed and the corners don't fill.
  float reach = exp(-max(0.0, (min(r2A, r2B) - 0.04)) * 1.1);
  col += hue * stroke * (0.85 + 0.5 * reach);

  // a faint bloom along each line so the lace catches light
  float bloom = exp(-linePx / (halfw * 4.0 + pr));
  col += hue * bloom * 0.16 * (0.6 + 0.6 * reach);

  // --- the two pole cores: small soft glows ---
  float coreSig = 0.10;                              // core radius in normalised units
  float glowA = exp(-r2A / (coreSig*coreSig));
  float glowB = exp(-r2B / (coreSig*coreSig));
  // give the poles complementary hues drawn from opposite ends of the palette
  vec3  hotA = c3;                                   // + pole
  vec3  hotB = c0;                                   // - pole
  col += hotA * glowA * 0.9;
  col += hotB * glowB * 0.9;
  // tiny bright pinpoint at each singularity
  col += vec3(1.0) * exp(-r2A / (coreSig*coreSig*0.10)) * 0.5;
  col += vec3(1.0) * exp(-r2B / (coreSig*coreSig*0.10)) * 0.5;

  // radial vignette keeps edges dark and the dipole luminous/centred
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res) * 1.6);
  col *= mix(0.55, 1.0, vign);

  // gentle tonemap to tame the bright bundles into glow rather than clipped white
  col = col / (1.0 + col * 0.45);

  gl_FragColor = vec4(col, 1.0);
}
