precision highp float;

// Mitosis — one dark-liquid cell divides into two, then four, then re-fuses,
// forever. Family: Mercury. Four metaball kernels whose centres are analytic
// functions of a single eased master phase: coincident -> a pair split along
// one axis -> a 2x2 quad split along the perpendicular axis -> and palindromic
// reverse. Nothing appears or vanishes; the whole genealogy lives in four
// kernels held mirror-symmetric about both split axes at every instant.

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cellSize;     // radius of the united mother cell, css px (default 170)
uniform float u_divideSpeed;  // speed through the divide/refuse palindrome (default 0.3)
uniform float u_wobble;       // amplitude of the damped post-snap ringing (default 1.0)

// the four kernel centres + shared field params (set in main)
vec2  gC0, gC1, gC2, gC3;
float gR, gK;

// polynomial smooth minimum — kernels bulge toward each other, neck, fuse
float smin2(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// signed distance to the iso-surface of the four summed kernels
float field(vec2 p) {
  float d0 = length(p - gC0) - gR;
  float d1 = length(p - gC1) - gR;
  float d2 = length(p - gC2) - gR;
  float d3 = length(p - gC3) - gR;
  float a = smin2(d0, d1, gK);
  float b = smin2(d2, d3, gK);
  return smin2(a, b, gK);
}

float gauss(float x, float c, float w) {
  float u = (x - c) / w;
  return exp(-u * u);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr = max(u_pixelRatio, 0.25);
  vec2 pc = (gl_FragCoord.xy - 0.5 * u_resolution) / pr;  // css px, centered
  vec2 resC = u_resolution / pr;

  float S = max(u_cellSize, 1.0);              // mother-cell radius scale, css px
  float speed = max(u_divideSpeed, 0.001);
  float T = u_time * speed;
  float ph = fract(T / 12.0);                  // one full divide/refuse round

  // --- two split amounts driven by one eased master phase ---
  // FIRST split along axis A (horizontal): the mother elongates and snaps into
  // a mirror-symmetric pair.  SECOND split along axis B (vertical): each
  // daughter snaps again, perpendicular, into an equal-spaced 2x2 quad.  Then
  // the palindrome runs both events backward.
  // event windows: A-split, settle, B-split, hold, B-fuse, settle, A-fuse.
  float sA = smoothstep(0.04, 0.17, ph) - smoothstep(0.83, 0.96, ph);
  float sB = smoothstep(0.30, 0.43, ph) - smoothstep(0.57, 0.70, ph);

  // separation distances (css px). The quad is exact and equal-spaced because
  // both axes share the same eased amplitude scaled off S.
  const float SPLIT = 1.02;   // centre offset along a split axis, in radii
  float ax = sA * SPLIT * S;
  float ay = sB * SPLIT * S;

  // --- damped mirrored wobble after each snap (rings, then settles) ---
  float wAmp = u_wobble;
  // A-split snap ring and A-fuse snap ring
  float envA = (gauss(ph, 0.17, 0.05) + gauss(ph, 0.83, 0.05));
  // B-split snap ring and B-fuse snap ring
  float envB = (gauss(ph, 0.43, 0.05) + gauss(ph, 0.57, 0.05));
  float wt = T * 6.2831853;
  float wobX = sin(wt * 1.7) * 0.10 * S * envA * wAmp;
  float wobY = sin(wt * 1.9 + 1.1) * 0.10 * S * envB * wAmp;

  // four mirror-symmetric centres about both axes at (+-x, +-y)
  float ox = ax + wobX;
  float oy = ay + wobY;
  gC0 = vec2(-ox, -oy);
  gC1 = vec2( ox, -oy);
  gC2 = vec2(-ox,  oy);
  gC3 = vec2( ox,  oy);

  // kernel radius: shrink slightly as they spread so total "mass" reads steady
  float spread = clamp((ax + ay) / (1.6 * S), 0.0, 1.0);
  gR = (0.62 - 0.18 * spread) * S;
  gK = 0.42 * S;

  float d = field(pc);

  // --- per-body hue weights -------------------------------------------------
  // nearest-kernel soft weights (no dynamic indexing)
  float e0 = exp(-length(pc - gC0) / (0.55 * S));
  float e1 = exp(-length(pc - gC1) / (0.55 * S));
  float e2 = exp(-length(pc - gC2) / (0.55 * S));
  float e3 = exp(-length(pc - gC3) / (0.55 * S));
  float esum = max(e0 + e1 + e2 + e3, 1e-4);
  // hue by generation: united mother -> c0; left pair -> toward c1, right -> c2;
  // the four grandchildren take a positional blend of their parents' hues.
  // left side (x<0) leans c1, right side (x>0) leans c2; vertical position adds
  // a gentle further tint so the quad's four drops are individuated.
  float leftW  = (e0 + e2) / esum;             // kernels on the -x side
  vec3 pairHue = mix(c2, c1, leftW);           // two-daughter colours
  // blend mother colour in when united, daughter colours as they separate
  float oneness = 1.0 - clamp((ax + ay) / (0.9 * SPLIT * S), 0.0, 1.0);
  vec3 hue = mix(pairHue, c0, oneness);
  // grandchild individuation: vertical lean tints the quad corners subtly
  float topW = (e2 + e3) / esum;
  hue = mix(hue, mix(hue, c0, 0.18), topW * sB);

  // --- gradient of the field for the directional rim highlight --------------
  float ge = 2.0;
  vec2 g = vec2(field(pc + vec2(ge, 0.0)) - field(pc - vec2(ge, 0.0)),
                field(pc + vec2(0.0, ge)) - field(pc - vec2(0.0, ge)));
  vec2 n = g / max(length(g), 1e-4);

  // --- compose --------------------------------------------------------------
  vec3 bg = vec3(0.035, 0.035, 0.043);
  float vig = 1.0 - 0.32 * smoothstep(0.35, 1.18,
                length(pc) / (0.5 * min(resC.x, resC.y)));
  vec3 col = bg * vig;

  float aa = 1.5;
  float body = smoothstep(aa, -aa, d);

  // interior: near-black liquid mirror with a faint cool sheen + depth falloff
  float yrel = pc.y / max(S, 1.0);
  float sheen = smoothstep(0.9, -1.1, yrel);
  float inner = exp(min(d, 0.0) / (0.20 * S));
  vec3 interior = bg * 0.82 + c2 * (0.05 * sheen + 0.05 * inner * sheen + 0.012);
  col = mix(col, interior, body);

  // thin bright gradient-derived rim, lit from upper-left — the brightest element
  float lightAmt = max(dot(n, normalize(vec2(-0.40, 0.88))), 0.0);
  float specW = 0.28 + 0.72 * lightAmt * lightAmt;
  float rim = exp(-(d * d) / (2.5 * 2.5));
  col += hue * rim * specW * 1.25;

  // soft halo so the surrounding dark breathes
  float halo = exp(-max(d, 0.0) / (0.32 * S)) * (1.0 - body);
  col += hue * halo * 0.05;

  // --- the snap: hot c3 fires at every neck at the instant of fusion/pinch ---
  // necks live on the midlines between kernel pairs. A-events neck on the x=0
  // axis (vertical neck), B-events neck on the y=0 axis (horizontal neck).
  float flashA = (gauss(ph, 0.105, 0.020) + gauss(ph, 0.895, 0.020));
  float flashB = (gauss(ph, 0.365, 0.022) + gauss(ph, 0.635, 0.022));
  // A neck: along the vertical line x=0, between top/bottom mirror pairs
  float distAx = abs(pc.x);
  float distAy = abs(abs(pc.y) - oy);
  float neckA = exp(-(distAx * distAx) / (0.22 * S * 0.22 * S))
              * exp(-(distAy * distAy) / (0.30 * S * 0.30 * S));
  // B neck: along the horizontal line y=0, between left/right mirror pairs
  float distBy = abs(pc.y);
  float distBx = abs(abs(pc.x) - ox);
  float neckB = exp(-(distBy * distBy) / (0.22 * S * 0.22 * S))
              * exp(-(distBx * distBx) / (0.30 * S * 0.30 * S));
  float flashGlow = flashA * neckA + flashB * neckB;
  col += c3 * flashGlow * 0.95;
  col += c3 * (flashA + flashB) * rim * 0.45;   // rim catches the snap

  // soft tone map keeps the flash hot without clipping, then dither
  col = 1.0 - exp(-col);
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
