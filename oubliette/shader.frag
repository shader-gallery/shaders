// oubliette (Delve) — a masonry shaft of square cross-section seen straight down
// through a dungeon grate, falling to a perfect black square at centre. The
// square rings come from the Chebyshev norm max(|x|,|y|): its logarithm is sliced
// into stone courses laid in running bond (each course offset half a brick along
// the perimeter), mortar lines glowing faintly, brick faces near-black and
// whisper-tinted from the four palette colours by course-depth phase. The four
// corners carry brighter quoin lines. A static screen-fixed grate silhouette lies
// over everything. The masonry pours steadily down the scale axis and never
// arrives — the log-periodic courses hide the wrap below the focal fog.
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
uniform float u_descentSpeed;   // scale-octaves/sec the courses fall  (default 0.12)
uniform float u_courseDensity;  // stone courses per scale octave      (default 6)
uniform float u_mortarGlow;     // brightness of the mortar lines       (default 0.6)
uniform float u_grate;          // visibility of the overhead grate     (default 0.55)
uniform float u_centerX;        // focal x offset, short-axis (off-centre) (default 0.12)
uniform float u_centerY;        // focal y offset, short-axis            (default -0.08)
uniform float u_mouseShift;     // pointer depth-parallax on near courses  (default 0.35)

const vec3  BG       = vec3(0.030, 0.030, 0.038); // near-black shaft base
const float PI       = 3.14159265;
const float TWO_PI   = 6.28318531;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// hash for a faint per-brick tint jitter
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  vec2  fc   = gl_FragCoord.xy;
  vec2  res  = u_resolution;
  vec2  ctr  = res * 0.5;
  float t    = u_time;
  float pr   = u_pixelRatio;

  // square-cross-section coordinate, normalised by the short screen axis so the
  // shaft looks square at any aspect; centred on the focal point
  float minRes = min(res.x, res.y);
  // movable focal (off-centre by default) + r-weighted mouse depth parallax:
  // near (outer) courses slide toward the pointer while the deep focus holds.
  vec2  mraw = u_mouse;
  if (dot(mraw, mraw) < 1.0) mraw = ctr;
  vec2  mN   = (mraw - ctr) / (minRes * 0.5);
  vec2  p0   = (fc - ctr) / (minRes * 0.5) - vec2(u_centerX, u_centerY);
  float r0   = length(p0);
  vec2  p    = p0 - mN * (0.16 * max(u_mouseShift, 0.0)) * smoothstep(0.0, 0.9, r0);

  vec3 col = BG;

  // ---- palette fallback (headless contexts can leave u_palette zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- Chebyshev (square) norm + which wall we are on ----
  vec2  ap   = abs(p);
  float cheb = max(ap.x, ap.y) + 1e-5;          // square radius; 0 at centre
  // perimeter coordinate u in [0,1) running around the square ring, plus a
  // 0..4 side index for quoin (corner) detection
  float u, sideMix;
  if (ap.x >= ap.y) {
    // left / right walls — perimeter runs with y
    u = (p.y / cheb) * 0.25 + (p.x >= 0.0 ? 0.0 : 0.5);
  } else {
    // top / bottom walls — perimeter runs with x
    u = (p.x / cheb) * 0.25 + (p.y >= 0.0 ? 0.25 : 0.75);
  }
  u = fract(u);                                  // 0..1 around the perimeter
  // distance (in u units) to the nearest corner of the square — corners sit at
  // u = 0.125, 0.375, 0.625, 0.875 (mid of each quarter is a wall centre)
  float uq    = fract(u * 4.0 + 0.5);            // 0..1, 0.5 at a corner
  float corner = abs(uq - 0.5) * 2.0;            // 0 at corner, 1 at wall middle

  // ---- log-scale depth axis: courses are slices of -log2(cheb) ----
  float density = max(u_courseDensity, 0.5);     // guard min
  // depth grows toward the centre (cheb -> 0). Add the descent so the whole
  // stack pours inward; log-periodic so the wrap is invisible.
  float depth   = -log2(cheb) * density + t * u_descentSpeed * density;

  float courseId = floor(depth);                 // integer course index
  float courseF  = fract(depth);                 // 0..1 within the course

  // ---- running bond: each course offset half a brick along the perimeter ----
  // bricks-per-course chosen so faces read square-ish; offset alternates by course
  const float BRICKS = 8.0;                       // bricks per side-quarter span
  float bondShift = mod(courseId, 2.0) * 0.5;     // half-brick stagger
  float brickU    = u * (BRICKS * 4.0) + bondShift;
  float brickId   = floor(brickU);
  float brickF    = fract(brickU);

  // ---- mortar grooves: horizontal (between courses) + vertical (between bricks) ----
  // The mortar is a RECESSED groove (grout), not a wire: a wide soft band of
  // shadow with a thin lit line down its centre. Wide AA so it reads as carved
  // stone seam rather than a 1px neon filament.
  float distH = min(courseF, 1.0 - courseF);     // 0 at a course seam
  float distV = min(brickF, 1.0 - brickF);       // 0 at a brick seam
  // groove half-width (fraction of a cell). Wide -> reads as grout, not wire.
  const float GROOVE_H = 0.16;
  const float GROOVE_V = 0.14;
  // the dark recess: 1 deep in the groove, 0 on the brick face
  float grooveH = 1.0 - smoothstep(0.0, GROOVE_H, distH);
  float grooveV = 1.0 - smoothstep(0.0, GROOVE_V, distV);
  float groove  = max(grooveH, grooveV);
  // the thin lit line sitting at the very bottom of the groove (catch-light)
  float lineH = 1.0 - smoothstep(0.0, GROOVE_H * 0.35, distH);
  float lineV = 1.0 - smoothstep(0.0, GROOVE_V * 0.35, distV);
  float mortarLine = max(lineH, lineV);

  // ---- quoin lines: brighter continuous radial seams at the four corners ----
  float quoin = 1.0 - smoothstep(0.0, 0.10, corner);  // 1 at corner, fades to wall

  // ---- colour: coherent whisper tint per COURSE depth phase ----
  // Hue is keyed to course depth ONLY (no per-brick hue jitter) so a single
  // course is one coherent colour — this removes the red/cyan/purple fringing
  // that read as chromatic aberration across a course span.
  float phase = courseId * 0.075;
  float s = fract(phase) * 4.0;
  float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
  vec3  hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // ---- brick faces: near-black STONE blocks with relief ----
  // each cell is a near-black stone face tinted with the course hue; per-brick
  // brightness jitter gives stone-to-stone variation; an inner bevel darkens
  // the face toward its grout edges so the block reads with depth/relief.
  float faceJit = 0.7 + 0.6 * hash11(brickId * 7.1 + courseId * 3.3);
  // bevel: bright in the centre of the cell, falling off toward the grooves
  float bevel = (1.0 - groove);                      // 0 in groove, 1 mid-face
  bevel = bevel * bevel;                             // tighten toward centre
  // base stone tint + jittered relief; the face is clearly visible stone now
  vec3 stone = hue * (0.145 + 0.125 * bevel) * faceJit;
  // a touch of cool ambient so faces aren't a pure single hue and never pure black
  stone += BG * 1.05;
  col = stone;

  // mortar — the luminous accent recessed BETWEEN stones (not over them)
  float glow = u_mortarGlow;
  // first deepen the groove shadow so grout reads as a recess
  col *= mix(1.0, 0.35, groove);
  // then lay the thin catch-light line in the bottom of the groove
  col += hue * mortarLine * 0.74 * glow;

  // quoin seams: brighter continuous corner lines (the only radial feature)
  col += hue * quoin * (0.28 + 0.22 * mortarLine) * glow * 0.8;

  // ---- focal fog: courses drown in black below a chosen depth (near centre) ----
  // fade to pure black as cheb -> 0 (the perfect black square focus)
  float focusFog = smoothstep(0.0, 0.07, cheb);   // 0 at exact centre (smaller dark focus)
  // an extra depth-based dimming so deeper courses lose energy gradually
  float depthDim = smoothstep(0.012, 0.18, cheb);
  col *= focusFog * mix(0.78, 1.0, depthDim);

  // gentle outer vignette so the frame edge reads as the lip of the shaft
  float vign = 1.0 - smoothstep(0.75, 1.45, length(p));
  col *= mix(0.55, 1.0, vign);

  // ---- static, screen-fixed overhead grate silhouette ----
  // a few soft dark bars (2 vertical + 2 horizontal) with a hair of rim light;
  // anchored to screen space so it is the fixed station the shaft falls past.
  float g = clamp(u_grate, 0.0, 1.0);
  if (g > 0.001) {
    // bar coordinate in normalised short-axis units; bars at +-barPos
    float barPos = 0.42;
    float barHalf = 0.045;
    float rim     = 0.018;
    // distance to nearest of the two vertical bars (|x| near barPos)
    float dvx = abs(ap.x - barPos);
    // distance to nearest of the two horizontal bars (|y| near barPos)
    float dhy = abs(ap.y - barPos);
    float barV = 1.0 - smoothstep(barHalf, barHalf + rim, dvx);
    float barH = 1.0 - smoothstep(barHalf, barHalf + rim, dhy);
    float bar  = max(barV, barH);
    // rim light: thin bright edge just outside the dark bar
    float rimV = (1.0 - smoothstep(barHalf, barHalf + rim, dvx)) * smoothstep(barHalf - rim, barHalf, dvx);
    float rimH = (1.0 - smoothstep(barHalf, barHalf + rim, dhy)) * smoothstep(barHalf - rim, barHalf, dhy);
    float rimL = max(rimV, rimH);
    // darken under the bars, then add a faint rim of palette light
    col = mix(col, col * 0.06, bar * g);
    col += (c2 * 0.4 + c0 * 0.2) * rimL * 0.25 * g;
  }

  col = max(col, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
