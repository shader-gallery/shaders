// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// shatter (Facet) - a dark pane of glass struck three times. Every impact
// throws out a fan of radial cracks that wander, kink, thin toward their tips
// and fork off short side branches; the pane is never cut into closed cells.
// The cracks live in polar space around each impact (crack k sits at an angle
// that drifts with radius), so a pixel only ever measures its distance to the
// three angularly nearest cracks and their branch segments. Each crack also
// carries a small tilt jump: the shard on one side of it catches the reflected
// room light a little differently from the shard on the other, and that jump
// fades out exactly where the crack ends, so the shading never invents an edge
// the crack did not make. Along the cracks the fractured glass edge lights up:
// a bright hairline core, a frosted haze of micro-fractures beside it, a lit
// face and a shadowed face, prism fringes, and sparkles that run along the
// line as a soft light sweeps the pane. Impacts heal and re-strike on a slow
// staggered cycle, and a crush zone of fine radial crazing sits at each point
// of impact.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cracks;   // radial cracks per impact            (default 11)
uniform float u_spread;   // crack reach, frame-relative         (default 1.0)
uniform float u_glint;    // edge glint and sparkle strength     (default 1.0)
uniform float u_tilt;     // shard tilt / reflection shift       (default 1.0)
uniform float u_speed;    // growth, sweep and re-strike speed   (default 1.0)

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

// wrap an angle difference to -pi..pi
float wrapA(float a) { return a - TAU * floor((a + PI) / TAU); }

// signed distance to a segment: positive on the left of a->b
float sdSegS(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  vec2 v = pa - ba * h;
  float s = sign(ba.x * pa.y - ba.y * pa.x);
  return length(v) * (s == 0.0 ? 1.0 : s);
}

// ---- crack accumulators (screen-blended across every line in the frame)
float gCore  = 0.0;  // bright fractured-edge hairline
float gHalo  = 0.0;  // frosted micro-fracture haze beside the line
float gSide  = 0.0;  // signed: lit face (+) and shadowed face (-)
float gSpark = 0.0;  // travelling sparkles on the edge
float gPr    = 2.0;  // device px per css px
float gPx    = 400.0; // device px per frame unit
float gSweep = 0.0;  // light sweep amount at this pixel
float gT     = 0.0;  // scaled time
vec2  gLight = vec2(0.6, 0.8);

// one crack line at signed distance sdPx (device px). w is the width factor
// (1 root, near 0 at the tip), along is the arc parameter for sparkles, dirA
// the crack direction, id a per-line seed.
void crackLine(float sdPx, float w, float along, float dirA, float id) {
  float d  = abs(sdPx);
  float wc = max(0.85 * w * gPr, 0.55);            // core half width, px
  float core = exp(-d * d / (2.0 * wc * wc)) * min(1.0, 1.4 * w * gPr);
  float halo = exp(-d / (7.0 * gPr * max(w, 0.15))) * w;
  float side = clamp(sdPx / (2.6 * gPr), -1.0, 1.0) * exp(-d / (3.5 * gPr)) * w;
  // glass edges glint hardest when the crack runs across the light
  vec2  dv = vec2(cos(dirA), sin(dirA));
  float gf = 0.35 + 0.65 * abs(dv.x * gLight.y - dv.y * gLight.x);
  float sp = vnoise(vec2(along * 16.0 - gT * 1.1, id * 5.3 + 2.0));
  sp = smoothstep(0.60, 0.96, sp) * (0.4 + 0.6 * w);
  // stretches of the edge face toward or away from the room light
  float fv  = 0.50 + 0.50 * vnoise(vec2(along * 3.2 + 4.0, id * 2.1));
  float lit = core * (0.40 + 0.60 * gf) * fv * (0.55 + 0.90 * gSweep);
  gCore  = 1.0 - (1.0 - gCore) * (1.0 - lit);
  gSpark = max(gSpark, core * sp * gf);
  gHalo += halo;
  gSide += side;
}

// one impact: radial fan + forks + tilt. Returns the shard tilt vector at p.
vec2 impact(vec2 p, vec2 c, float seed, float age, float N, float reach) {
  vec2  d   = p - c;
  float r   = length(d);
  float phi = atan(d.y, d.x);
  float sw  = TAU / N;
  float k0  = floor(phi / sw);
  float grow = 1.0 - exp(-age * 1.6);
  float heal = grow;                       // caller folds the fade into age

  float alive[3];
  vec2  tiltJ[3];
  float th1 = 0.0;

  for (int j = 0; j < 3; j++) {
    float k  = k0 + float(j) - 1.0;
    float km = mod(k, N);
    float hk  = hash21(vec2(km + 0.31, seed));
    float hk2 = hash21(vec2(km + 31.7, seed * 1.7));
    float hk3 = hash21(vec2(km + 57.1, seed * 2.3));
    float Lfull = reach * (0.45 + 0.80 * hk);
    float L  = Lfull * grow;
    float th0 = (k + 0.5 + (hk2 - 0.5) * 0.5) * sw;
    // wander: a slow bend plus fine kinks, straight for the first stretch
    float bend = (vnoise(vec2(r * 2.2 + km * 7.0, seed * 3.1)) - 0.5) * 0.18
               + (vnoise(vec2(r * 9.0 + km * 3.0, seed * 5.3 + 11.0)) - 0.5) * 0.05;
    float th  = th0 + bend * smoothstep(0.0, 0.3, r / max(reach, 1e-3));
    if (j == 1) th1 = th;
    float sd  = r * wrapA(phi - th);
    float u   = r / max(L, 1e-4);
    float w   = 1.0 - 0.78 * clamp(u, 0.0, 1.0);
    float al  = (1.0 - smoothstep(0.85, 1.0, u)) * heal;
    alive[j]  = al;
    tiltJ[j]  = vec2(hk3 - 0.5, hash21(vec2(km + 77.3, seed * 4.9)) - 0.5) * 2.0;
    if (al > 0.001) {
      crackLine(sd * gPx, w * al, r, th, km + seed);
    }
    // forks: two straight branches leaving the crack once it has grown past
    // the fork radius, at a steep angle so they read as side splits, and
    // short enough never to meet the next radial crack
    for (int b = 0; b < 2; b++) {
      float fb  = float(b);
      float hb  = hash21(vec2(km + 91.0 + fb * 13.0, seed * 4.1 + fb));
      float hb2 = hash21(vec2(km + 17.0 + fb * 29.0, seed * 6.7 + fb));
      float hb3 = hash21(vec2(km + 43.0 + fb * 51.0, seed * 8.9 + fb));
      float rb  = Lfull * (0.22 + 0.50 * hb);
      float gb  = clamp((L - rb) / (0.10 * reach), 0.0, 1.0) * heal;
      if (gb <= 0.001) continue;
      float thb = th0 + (vnoise(vec2(rb * 2.2 + km * 7.0, seed * 3.1)) - 0.5) * 0.18
                        * smoothstep(0.0, 0.3, rb / max(reach, 1e-3));
      vec2  P0  = c + rb * vec2(cos(thb), sin(thb));
      float sgn = (hb2 < 0.5) ? -1.0 : 1.0;
      float da  = thb + sgn * (0.30 + 0.55 * hb3);
      float Lb  = Lfull * (0.14 + 0.34 * hb2) * gb;
      vec2  P1  = P0 + Lb * vec2(cos(da), sin(da));
      float sdb = sdSegS(p, P0, P1);
      float ub  = clamp(dot(p - P0, P1 - P0) / max(dot(P1 - P0, P1 - P0), 1e-6), 0.0, 1.0);
      float wb  = (0.55 - 0.45 * ub) * (1.0 - 0.5 * clamp(rb / Lfull, 0.0, 1.0))
                * (1.0 - smoothstep(0.80, 1.0, ub));
      crackLine(sdb * gPx, wb * gb, rb + ub * Lb, da, km * 3.0 + seed + fb);
    }
  }

  // crush zone: fine radial crazing right at the point of impact
  float rr = r / max(reach, 1e-3);
  float crush = smoothstep(0.11, 0.0, rr) * heal;
  float craze = vnoise(vec2(phi * N * 1.6, rr * 90.0 + seed));
  gHalo += crush * (0.35 + 1.4 * smoothstep(0.55, 0.9, craze));
  gCore  = 1.0 - (1.0 - gCore) * (1.0 - crush * smoothstep(0.7, 0.95, craze) * 0.8);

  // shard tilt: the sector between its lower and upper crack takes the lower
  // crack jump minus the upper one, each weighted by whether that crack is
  // actually present at this radius. Across a living crack the tilt jumps;
  // past its tip the two sides agree again.
  float sLow = step(th1, phi);
  vec2  tl = mix(tiltJ[0], tiltJ[1], sLow);
  vec2  tu = mix(tiltJ[1], tiltJ[2], sLow);
  float vl = mix(alive[0], alive[1], sLow);
  float vu = mix(alive[1], alive[2], sLow);
  return (tl * vl - tu * vu) * 0.7 * exp(-rr * 0.9);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  gPr = max(u_pixelRatio, 0.5);
  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  p      = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;   // y in -1..1
  gPx          = u_resolution.y * 0.5;                    // device px per frame unit
  float speed  = clamp(u_speed, 0.0, 3.0);
  gT           = u_time * speed;
  float N      = floor(clamp(u_cracks, 5.0, 16.0));
  float reach  = 1.3 * max(u_spread, 0.2);
  float glint  = clamp(u_glint, 0.0, 2.0);
  float tiltK  = clamp(u_tilt, 0.0, 2.0);

  // a soft light sweeping diagonally across the pane every so often
  float sweepPos = -2.6 + mod(gT * 0.30 + 1.9, 6.2);
  float sx = dot(p, vec2(0.80, 0.60)) - sweepPos;
  gSweep = exp(-sx * sx * 2.5);
  gLight = normalize(vec2(0.55, 0.83));

  // ---- three impacts on staggered heal / re-strike cycles
  const float PERIOD = 26.0;
  vec2 tilt = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    float fi    = float(i);
    float birth = fi * 2.9;
    float tt    = gT - birth + PERIOD * 4.0;
    float cyc   = floor(tt / PERIOD);
    float age   = tt - cyc * PERIOD;
    float fade  = 1.0 - smoothstep(PERIOD - 2.5, PERIOD - 0.2, age);
    float seed  = 3.7 + fi * 5.1 + cyc * 0.37;
    // home positions spread across the frame, re-seated each strike
    vec2 home = (i == 0) ? vec2(-0.95, 0.30) : ((i == 1) ? vec2(0.75, -0.12) : vec2(0.05, 0.62));
    home.x *= aspect / 1.6;
    vec2 jit = vec2(hash21(vec2(cyc + fi, 1.3)), hash21(vec2(cyc + fi, 7.7))) - 0.5;
    vec2 c = home + jit * 0.5;
    // full growth in a couple of seconds, then the fade is folded into the
    // effective age so a healing pane withdraws its cracks before the re-strike
    if (fade < 0.002) continue;
    float effAge = age * fade;
    tilt += impact(p, c, seed, effAge, N, reach * (0.85 + 0.3 * hash21(vec2(seed, 2.2))));
  }
  tilt *= tiltK;

  // ---- the pane: dark glass reflecting a dim room. A broad window light and a
  // cooler secondary glow, both displaced by the shard tilt, so every shard
  // shows a slightly shifted reflection of the same room.
  vec2  q     = p + tilt * 0.45;
  float win   = dot(q, vec2(0.55, 0.83)) - 0.15;
  float band  = exp(-win * win * 1.6);
  float w2    = dot(q, vec2(-0.72, 0.70)) + 0.75;
  float band2 = exp(-w2 * w2 * 1.1);
  float haze  = fbm(q * 0.9 + vec2(2.0, 5.0) + gT * 0.01) - 0.5;
  vec3  deep  = mix(c3, c0, 0.5);
  float lumD  = dot(deep, vec3(0.299, 0.587, 0.114));
  deep = mix(vec3(lumD), deep, 0.55);
  vec3  glass = deep * 0.10 + vec3(0.025);
  glass += mix(c0, c1, smoothstep(-1.2, 1.2, q.x)) * (0.16 * band);
  glass += c2 * (0.07 * band2);
  // the reflected window: a few soft mullion-spaced bars of light, blurred by
  // the glass, sitting inside the broad band. Tilted shards shift them.
  float bars = 0.5 + 0.5 * cos(q.x * 4.2 + q.y * 0.8 + 1.3);
  bars = smoothstep(0.35, 0.95, bars) * band;
  glass += mix(c2, c0, 0.4) * bars * 0.09;
  glass *= 1.0 + haze * 0.35;
  // facet brightness: tilted shards lean toward or away from the light
  glass *= 1.0 + 0.7 * dot(tilt, gLight);

  // ---- the cracks
  float halo = clamp(gHalo, 0.0, 2.5);
  vec3  frost = mix(c2, vec3(1.0), 0.55);
  vec3  col = glass;
  col += frost * halo * 0.05;
  // lit face and shadowed face of the fractured edge
  col *= 1.0 + gSide * 0.45;
  // prism fringe: the two faces of the edge split the light warm and cool
  vec3 fringe = mix(c1, c0, smoothstep(-0.6, 0.6, gSide));
  col += fringe * abs(gSide) * 0.45 * glint;
  // the hairline core, whitish glass tinted by the pale pole
  vec3 edgeCol = mix(frost, vec3(1.0), 0.35);
  col += edgeCol * gCore * (0.55 + 0.45 * glint);
  // sparkles racing along the edges
  col += vec3(1.0) * gSpark * 1.3 * glint;
  // the sweep also lifts the frosted haze as it passes
  col += frost * halo * gSweep * 0.05 * glint;

  gl_FragColor = vec4(col, 1.0);
}
