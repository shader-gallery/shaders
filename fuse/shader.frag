// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// fuse (Smolder) — REFRAMED as a CIRCUIT NETWORK: instead of two lonely cords on
// black, the traveling fuse-spark now runs as charge pulses along a frame-filling
// lattice of faint copper traces with solder pads. Each row and column carries a
// white-hot pulse head — the original bead with its palette-graded halo, spark
// spray and a glowing cooling trail behind it — racing along the traces at its own
// hashed speed and direction, lighting pads as it passes. The spark-burst, halo
// and burnt-trail mechanic is kept; it just has a host structure now, so the frame
// reads as a live circuit rather than near-empty black. Everything themes from
// u_palette.
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
uniform float u_burnSpeed;    // how fast the pulse heads race along the traces (default 0.08)
uniform float u_haloWidth;    // halo radius in CSS px around each pulse head     (default 16)
uniform float u_sparkSpray;   // density of spark flecks thrown off each head 0..1 (default 0.8)
uniform float u_traceDensity; // how dense the circuit lattice + routing is 0..1   (default 0.5)
uniform float u_padGlow;      // brightness of the solder pads / traces 0..1       (default 0.5)

const vec3  BG     = vec3(0.020, 0.022, 0.028); // dark board
const float TWO_PI = 6.2831853;

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// palette-graded halo around a pulse head: warm core -> cool rim across radius r/halo.
vec3 haloGrade(float r, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float g = clamp(r, 0.0, 1.0);
  vec3 grad = mix(mix(vec3(1.0, 0.85, 0.55), c0, 0.5), c1, smoothstep(0.0, 0.45, g));
  grad = mix(grad, c3, smoothstep(0.35, 0.70, g));
  grad = mix(grad, c2, smoothstep(0.60, 1.00, g));
  return grad;
}

// spark spray around a head point hp (reuses fuse's hashed fleck burst).
vec3 sparks(vec2 fc, vec2 hp, float haloW, float spray, float t, float seed,
            vec3 c0, vec3 c1, vec3 c2, vec3 c3, float pr) {
  vec3 acc = vec3(0.0);
  const int SP = 6;
  for (int sx = 0; sx < SP; sx++) {
    for (int sy = 0; sy < SP; sy++) {
      vec2 cell = vec2(float(sx), float(sy));
      float life = floor(t * 9.0) + cell.x * 3.0 + cell.y * 7.0 + seed * 31.0;
      float h0 = hash21(cell + seed * 17.0 + floor(life));
      if (h0 < spray) {
        float ang = hash21(cell + 3.1 + life) * TWO_PI;
        float rad = (0.30 + 1.00 * hash21(cell + 7.7 + life)) * haloW * 1.05;
        vec2 sp = hp + vec2(cos(ang), sin(ang)) * rad;
        float sd = length(fc - sp);
        float fl = hash21(cell + 5.5 + life);
        float twinkle = 0.6 + 0.4 * sin(t * 40.0 + fl * TWO_PI);
        float sg = max(pr * 1.7, 1.0);
        float pt = exp(-sd * sd / (sg * sg));
        float amt = pt * twinkle * (0.7 + 0.5 * h0);
        acc += mix(vec3(1.0, 0.85, 0.5), c3, clamp(rad / haloW, 0.0, 1.0)) * amt;
      }
    }
  }
  return acc * 1.7;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float speed   = max(u_burnSpeed, 0.001);
  float haloW   = max(u_haloWidth, 1.0) * pr;
  float spray   = clamp(u_sparkSpray, 0.0, 1.0);
  float density = clamp(u_traceDensity, 0.0, 1.0);
  float padG    = clamp(u_padGlow, 0.0, 1.0);

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 traceCol = c2 * 0.5 + c0 * 0.18;        // copper trace tint
  vec3 col = BG;

  // ---- lattice geometry: square cells; density picks how fine the routing is.
  float cells   = mix(5.0, 11.0, density);
  float colW    = res.x / cells;
  vec2  g       = fc / colW;                   // grid coords
  float traceHalf = 1.6 * pr;
  float aa      = 1.2 * pr;

  float rx = floor(g.x + 0.5);                 // nearest vertical lattice line
  float ry = floor(g.y + 0.5);                 // nearest horizontal lattice line
  float dxPx = (g.x - rx) * colW;              // px distance to that vertical line
  float dyPx = (g.y - ry) * colW;              // px distance to that horizontal line
  float ix = floor(g.x);                       // cell column index
  float jy = floor(g.y);                       // cell row index

  // segment presence: not every lattice edge is routed (hashed) -> reads as PCB
  // routing rather than a full grid. Higher density routes more edges.
  float presThr = mix(0.45, 0.92, density);
  float presH = step(hash21(vec2(ix, ry) + 0.13), presThr); // horizontal edge at row ry
  float presV = step(hash21(vec2(rx, jy) + 7.70), presThr); // vertical edge at col rx

  float hMask = (1.0 - smoothstep(traceHalf, traceHalf + aa, abs(dyPx))) * presH;
  float vMask = (1.0 - smoothstep(traceHalf, traceHalf + aa, abs(dxPx))) * presV;
  col += traceCol * max(hMask, vMask) * (0.18 + 0.5 * padG);

  // ---- solder pads at the nearest node
  vec2  nodeG = vec2(rx, ry);
  float dn    = length(g - nodeG) * colW;
  float pad   = 1.0 - smoothstep(3.2 * pr, 4.4 * pr, dn);
  float ring  = (1.0 - smoothstep(4.4 * pr, 5.6 * pr, dn)) * smoothstep(3.4 * pr, 4.4 * pr, dn);
  float padLit = step(hash21(nodeG + 3.3), 0.28);
  vec3  padBase = mix(traceCol * 1.3, mix(c0, c3, 0.4) * 1.4, padLit);
  col += padBase * (pad * 0.6 + ring * 0.35) * (0.4 + 0.9 * padG);

  // ---- horizontal charge pulse: a smooth white-hot bead with the original
  // palette-graded halo, gated to a routed segment so it tracks the copper, and
  // dragging a clean glowing wake along the trace behind it.
  float rowHas = step(hash21(vec2(ry, 0.0) + 1.1), 0.55);   // fewer rows carry a pulse
  {
    float dir = (mod(ry, 2.0) < 1.0) ? 1.0 : -1.0;
    float spd = speed * (0.6 + 0.9 * hash11(ry + 2.0));
    float ph  = hash11(ry + 4.0);
    float bx  = fract(t * spd * dir + ph) * res.x;
    float headPres = step(hash21(vec2(floor(bx / colW), ry) + 0.13), presThr);
    if (rowHas * headPres > 0.5) {
      vec2  hp    = vec2(bx, ry * colW);
      float bd    = length(fc - hp);
      float perp  = abs(dyPx);
      float along = (fc.x - bx) * dir;                       // <0 behind the head
      // smooth white-hot bead + round palette-graded halo (the original look)
      float cr = max(traceHalf * 2.6, 1.0);
      col += vec3(1.0, 0.96, 0.88) * exp(-bd * bd / (cr * cr)) * 1.6;
      float r = bd / haloW;
      col += haloGrade(r, c0, c1, c2, c3) * exp(-r * r * 2.0) * 1.15;
      // clean glowing wake along the trace behind the head
      float onLine = 1.0 - smoothstep(traceHalf, traceHalf + haloW * 0.40, perp);
      float wake = exp(-max(-along, 0.0) / (colW * 3.2)) * step(along, 0.0) * onLine;
      col += mix(c3, c0, 0.5) * wake * 0.7;
      // delicate sparks at the head
      col += sparks(fc, hp, haloW * 0.7, spray * 0.55, t, ry + 0.5, c0, c1, c2, c3, pr) * 0.7;
    }
  }

  // ---- vertical charge pulse on the nearest column (same, axes swapped)
  float colHas = step(hash21(vec2(rx, 0.0) + 8.4), 0.55);
  {
    float dir = (mod(rx, 2.0) < 1.0) ? 1.0 : -1.0;
    float spd = speed * (0.6 + 0.9 * hash11(rx + 5.0));
    float ph  = hash11(rx + 9.0);
    float by  = fract(t * spd * dir + ph) * res.y;
    float headPres = step(hash21(vec2(rx, floor(by / colW)) + 7.70), presThr);
    if (colHas * headPres > 0.5) {
      vec2  hp    = vec2(rx * colW, by);
      float bd    = length(fc - hp);
      float perp  = abs(dxPx);
      float along = (fc.y - by) * dir;
      float cr = max(traceHalf * 2.6, 1.0);
      col += vec3(1.0, 0.96, 0.88) * exp(-bd * bd / (cr * cr)) * 1.6;
      float r = bd / haloW;
      col += haloGrade(r, c0, c1, c2, c3) * exp(-r * r * 2.0) * 1.15;
      float onLine = 1.0 - smoothstep(traceHalf, traceHalf + haloW * 0.40, perp);
      float wake = exp(-max(-along, 0.0) / (colW * 3.2)) * step(along, 0.0) * onLine;
      col += mix(c3, c0, 0.5) * wake * 0.7;
      col += sparks(fc, hp, haloW * 0.7, spray * 0.55, t, rx + 40.0, c0, c1, c2, c3, pr) * 0.7;
    }
  }

  // gentle vignette to keep the corners dark and the pulse heads luminous
  float vign = 1.0 - smoothstep(0.55, 1.18, length((fc - ctr) / res));
  col *= mix(0.74, 1.0, vign);

  // soft tonemap so overlapping glow doesn't clip harshly to flat white
  col = col / (col + vec3(0.55)) * 1.55;

  gl_FragColor = vec4(col, 1.0);
}
