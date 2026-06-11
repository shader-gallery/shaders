// labyrinth (Rosette) — a full-frame orthogonal maze of faintly glowing etched
// wall segments on a near-black base. The plan is the frame, edge to edge: a
// hash-seeded grid of horizontal/vertical wall pieces that slide along their
// own axes on staggered smooth-eased schedules, sealing old corridors and
// opening new ones so the topology perpetually rewires itself. When a moving
// wall docks into a junction a soft glint blooms briefly and fades. No traveling
// light, no rings, no centred figure — just a restless rectilinear city plan.
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
uniform float u_shiftSpeed; // rate of wall reconfiguration       (default 0.15)
uniform float u_cell;       // maze cell size, css px             (default 70)
uniform float u_line;       // wall stroke width, css px          (default 1.5)
uniform float u_glint;      // dock glint brightness 0..1         (default 0.45)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU      = 6.2831853;

// 2D hash -> 0..1 scalar
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// smooth-eased ping-pong slide in 0..1, period determined by speed, staggered
// by a per-segment phase. Continuous in time, never resets globally.
float slidePhase(float seed, float t) {
  float ph = t + seed * 17.0;               // staggered phase offset
  float tri = abs(fract(ph) * 2.0 - 1.0);   // 0..1..0 triangle
  return smoothstep(0.0, 1.0, tri);         // ease in/out
}

// distance from point p to an axis-aligned segment from a to b
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  float cell  = max(u_cell, 8.0) * pr;        // cell size in device px
  float line  = max(u_line, 0.3) * pr;        // wall half-thickness-ish
  float speed = max(u_shiftSpeed, 0.0);

  // which cell are we in, and local coords within it (0..cell)
  vec2  gid   = floor(fc / cell);
  vec2  lp    = fc - gid * cell;              // 0..cell

  // palette fallback (headless poster contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // accumulate wall coverage and glint over the 3x3 neighbourhood of cells so
  // segments belonging to neighbours that slide into this cell are caught.
  float wall  = 0.0;   // strongest wall coverage at this fragment
  float glint = 0.0;   // glint bloom contribution
  float aa    = line + pr * 1.2;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 ci = gid + vec2(float(dx), float(dy));
      vec2 base = ci * cell;          // cell origin in device px

      // -------- vertical wall segment living on this cell --------
      // exists only if hash says so; slides up/down along its column.
      float hV = hash21(ci + vec2(7.0, 1.0));
      if (hV > 0.40) {
        float seedV = hash21(ci + vec2(3.3, 9.1));
        float sp    = slidePhase(seedV, t * speed + seedV);
        // anchor x at one of two column lines; slide travels vertically
        float ax    = base.x + mix(0.0, cell, step(0.5, fract(seedV * 7.0)));
        float y0    = base.y + mix(-0.15, 0.55, sp) * cell;
        float y1    = y0 + cell * 0.9;        // span ~one cell tall
        float d     = sdSegment(fc, vec2(ax, y0), vec2(ax, y1));
        float seg   = 1.0 - smoothstep(0.0, aa, d - line);
        wall = max(wall, seg);

        // glint: brief bloom at the leading end when the slide docks (eased
        // phase tri reaches 0 or 1). The triangle of the slide is fastest in
        // the middle and stalls at the ends — bloom on that stall.
        float tri  = abs(fract(t * speed + seedV + seedV * 17.0) * 2.0 - 1.0);
        float dock = pow(1.0 - tri, 5.0);     // bright near a dock, brief flare
        float jY   = (sp < 0.5) ? y0 : y1;    // the docking (leading) end
        float dj   = length(fc - vec2(ax, jY));
        glint = max(glint, exp(-dj*dj/(cell*cell*0.02)) * dock);
      }

      // -------- horizontal wall segment living on this cell --------
      float hH = hash21(ci + vec2(1.0, 7.0));
      if (hH > 0.40) {
        float seedH = hash21(ci + vec2(9.1, 3.3));
        float sp    = slidePhase(seedH, t * speed + seedH + 0.5);
        float ay    = base.y + mix(0.0, cell, step(0.5, fract(seedH * 7.0)));
        float x0    = base.x + mix(-0.15, 0.55, sp) * cell;
        float x1    = x0 + cell * 0.9;
        float d     = sdSegment(fc, vec2(x0, ay), vec2(x1, ay));
        float seg   = 1.0 - smoothstep(0.0, aa, d - line);
        wall = max(wall, seg);

        float tri  = abs(fract(t * speed + seedH + 0.5 + seedH * 17.0) * 2.0 - 1.0);
        float dock = pow(1.0 - tri, 5.0);
        float jX   = (sp < 0.5) ? x0 : x1;
        float dj   = length(fc - vec2(jX, ay));
        glint = max(glint, exp(-dj*dj/(cell*cell*0.02)) * dock);
      }
    }
  }

  // ---- colour: region tint so distant quarters sit in different cold tints ----
  // hue keyed to coarse position + a very slow time roll (felt, not seen)
  float k  = (gid.x * 0.045 + gid.y * 0.031) + t * 0.01;
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // faint etched-line glow: walls barely luminous on the near-black plan
  col += tint * wall * 0.55;
  // a whisper of bloom around each stroke for the etched-metal catch
  col += tint * wall * wall * 0.25;

  // dock glints punctuate joints; gated by GLINT param
  vec3 glintCol = mix(tint, vec3(1.0), 0.55);
  col += glintCol * glint * u_glint * 2.2;

  // radial vignette keeps the very edges dark so the plan reads as composed
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.75, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
