// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// marquee (Noir) - a theatre marquee frame on a painted wall. A wide rectangle
// of dark matte board sits inside two beaded metal bezels with a channel of
// incandescent bulbs running between them, and the bulbs chase: every third
// bulb is lit and the lit set steps round the frame, each filament heating
// fast and cooling slowly so a warm orange tail trails every step. Bulbs are
// found analytically: each pixel picks the nearest side of the bulb track,
// snaps to the nearest three sockets on that side, and shades them as small
// glass spheres (hot white core, glowing envelope, dark collar) or, when
// off, as dull grey glass with a top highlight. A few sockets are burnt out
// and a few more stutter. Each lit bulb throws a gaussian pool of light onto
// the channel, the bezels and the wall, so the chase runs round the wall
// too. The wall is plaster with roller mottle and tooth, lit from above and
// falling off toward the bottom corners, with a soft drop shadow under the
// frame. The board inside stays clean and dark: negative space for a mark.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_chase;      // chase rate, bulbs per second          (default 3.0)
uniform float u_bulbPitch;  // socket spacing in css px               (default 26)
uniform float u_panel;      // frame width as a fraction of the frame (default 0.74)
uniform float u_glow;       // light the bulbs throw on the surfaces  (default 1.0)
uniform float u_wear;       // share of dead and stuttering bulbs     (default 0.06)

float hash11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// axis-aligned box signed distance, b is the box extent from centre
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// filament brightness for a bulb with chase phase u (in bulb steps, 0..3):
// on for the first step, heating fast; then cooling slowly through the rest
float filament(float u) {
  float heat = 1.0 - exp(-u / 0.10);
  float cool = exp(-(u - 1.0) / 0.42);
  return u < 1.0 ? heat : heat * cool;
}

// globals filled in main so the bulb shader can read them
vec3  gBulbHot, gBulbWarm, gBulbCool, gMetal;
float gR, gAA, gT, gGlow, gWear, gRate;

// shade one bulb at centre c with chain index idx, seen from p.
// Adds the glass to col by coverage and returns the light it throws.
vec3 bulb(vec2 p, vec2 c, float idx, inout vec3 col, inout float glassCov) {
  vec2  dv = p - c;
  float d  = length(dv);
  float R  = gR;

  // chase state for this socket: which step of the three-cycle it is on
  float u = fract((gT * gRate - idx) / 3.0) * 3.0;   // grows with time: on at 0, off at 1
  float b = filament(u);
  // wear: some sockets are dead, a few more stutter
  float h    = hash11(idx * 7.31 + 3.7);
  float dead = step(h, gWear);
  float stut = step(h, gWear * 2.2) * (1.0 - dead);
  float flick = step(0.35, vnoise(vec2(gT * 14.0 + idx * 3.1, idx)));
  b *= (1.0 - dead) * mix(1.0, flick, stut);
  // colour cools from near-white through the warm pole toward the deep pole
  vec3 lit = mix(gBulbCool, gBulbWarm, smoothstep(1.0, 0.45, b));
  lit = mix(lit, gBulbHot, smoothstep(0.7, 1.0, b));

  // ---- the light it throws (gaussian pool, wider than the bulb)
  float sig  = R * 2.2;
  float pool = exp(-(d * d) / (sig * sig));
  vec3 thrown = lit * pool * b * 1.1 * gGlow;

  // ---- glass sphere shading
  float dc = min(d, R * 0.999);
  vec3  n  = vec3(dv / R, sqrt(max(1.0 - (dc * dc) / (R * R), 0.0)));
  vec3  L  = normalize(vec3(-0.45, 0.70, 0.55));
  vec3  H  = normalize(L + vec3(0.0, 0.0, 1.0));
  float dif = max(dot(n, L), 0.0);
  float sp  = max(dot(n, H), 0.0);
  sp = sp * sp; sp = sp * sp; sp = sp * sp; sp = sp * sp;   // ^16
  // off glass: dull grey envelope, darker at the limb, a dead one is smoked
  vec3 offG = mix(gMetal, vec3(1.0), 0.35) * (0.15 + 0.22 * dif) * (1.0 - 0.45 * dead) + vec3(0.30) * sp;
  // on glass: the envelope glows, the filament core burns white
  float core = exp(-(d * d) / (R * R * 0.16));
  vec3 onG = lit * (0.55 + 0.75 * n.z) + gBulbHot * core * 1.6;
  vec3 glass = mix(offG, onG, b) + vec3(0.25) * sp * (1.0 - b);

  float cov = 1.0 - smoothstep(R - gAA, R + gAA, d);
  // collar: a dark metal ring the bulb screws into
  float collar = (1.0 - smoothstep(R * 1.32, R * 1.32 + gAA, d)) * (1.0 - cov);
  vec3  colC = gMetal * (0.16 + 0.10 * max(dv.y / R, 0.0)) + lit * b * 0.20;
  col = mix(col, colC, collar);
  col = mix(col, glass, cov);
  glassCov = max(glassCov, cov);
  return thrown;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.25);
  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float F      = min(res.x, res.y);
  float aspect = res.x / res.y;
  // frame units, short side = 1, origin at the centre
  vec2  pw = (fc - 0.5 * res) / F;                     // wall coords
  vec2  uv = fc / res;
  // the sign hangs high and a little left of centre, as a sign on a wall
  // is photographed, leaving more wall below and to the right of it
  vec2  p  = pw - vec2(-0.075 * aspect, 0.055);
  // one reference css px in frame units (sizes hold tile to fullsize)
  float U  = pr / (max(u_pixelRatio, 1.0) * 400.0);
  gAA   = 1.0 / F;
  gT    = u_time;
  gRate = max(u_chase, 0.0);
  gGlow = clamp(u_glow, 0.0, 2.0);
  gWear = clamp(u_wear, 0.0, 0.3);

  // ---- materials from the palette
  vec3 deep  = mix(vec3(luma(c3)), c3, 0.5);
  vec3 warm  = mix(vec3(luma(c0)), c0, 0.6);
  gMetal     = mix(vec3(luma(c1)), c1, 0.28);           // brass or steel by theme
  gBulbWarm  = mix(c0, c1, 0.5);                         // glowing envelope
  gBulbCool  = mix(c3, c0, 0.35);                        // cooling filament
  gBulbHot   = mix(c2, vec3(1.0), 0.55);                 // white-hot core
  vec3 wallT = normalize(deep * 0.55 + warm * 0.30 + 0.12);

  // ---- panel geometry
  float hx = min(clamp(u_panel, 0.3, 0.95) * 0.5 * aspect, 0.5 * aspect - 0.10 * aspect);
  float hy = min(hx * (aspect >= 1.0 ? 0.56 : 1.45), 0.38);
  vec2  hs = vec2(hx, hy);
  float pitch = max(u_bulbPitch, 10.0) * U;
  gR = pitch * 0.30;
  float bezelOut = 9.0 * U;
  float channel  = gR * 2.0 * 1.55;
  float bezelIn  = 7.0 * U;
  float inset    = bezelOut + channel * 0.5;           // bulb track inset
  float dOut = sdBox(p, hs);                         // >0 on the wall
  float dCh0 = dOut + bezelOut;                         // channel outer edge
  float dCh1 = dCh0 + channel;                          // channel inner edge
  float dIn  = dCh1 + bezelIn;                          // board edge

  // ---- the wall: plaster with roller mottle and tooth, lit from above
  vec2  cp    = fc / pr;
  float mottle = fbm(cp * 0.030 + 5.0) - 0.5;
  float roller = vnoise(vec2(cp.x * 0.35, cp.y * 0.04) + 9.0) - 0.5;
  float tooth  = vnoise(cp * 1.1 + 17.0) - 0.5;
  vec2  lp = vec2(-0.30 * aspect, 0.90);
  float light = 0.40 + 1.10 * exp(-dot(pw - lp, pw - lp) / 0.95);
  vec3  wall  = wallT * 0.36 * light * (1.0 + mottle * 0.5 + roller * 0.12 + tooth * 0.12);
  // drop shadow from the frame, light from the upper left
  float dSh = sdBox(p - vec2(0.012, -0.018), hs);
  wall *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.06, dSh)) * step(0.0, dOut);
  // and a soft contact shadow tight against the frame
  wall *= 1.0 - 0.30 * (1.0 - smoothstep(0.0, 0.012, dOut));

  // ---- bezels: a rounded metal bead, lit from the upper left
  // side normal (which face of the box this pixel is nearest)
  vec2 ad = abs(p) - hs;
  vec2 nrm = ad.x > ad.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y));
  float L2 = dot(nrm, normalize(vec2(-0.5, 1.0)));      // 2D lighting of the face
  // bead profile across each bezel: -1 at the outer edge, +1 at the inner
  float xo = clamp((-dOut) / bezelOut * 2.0 - 1.0, -1.0, 1.0);
  float xi = clamp((-dCh1) / bezelIn * 2.0 - 1.0, -1.0, 1.0);
  float beadO = sqrt(max(1.0 - xo * xo, 0.0));
  float beadI = sqrt(max(1.0 - xi * xi, 0.0));
  // the outward-facing slope catches L2, the inward one its opposite
  float shO = 0.35 + 0.30 * beadO + 0.35 * L2 * (-xo) + 0.20 * L2;
  float shI = 0.35 + 0.30 * beadI + 0.35 * L2 * ( xi) + 0.20 * L2;
  float brush = 1.0 + 0.10 * (vnoise(vec2(dot(p, vec2(nrm.y, -nrm.x)) * 900.0, dot(p, nrm) * 40.0)) - 0.5);
  vec3 bezO = gMetal * clamp(shO, 0.08, 1.4) * 0.55 * brush;
  vec3 bezI = gMetal * clamp(shI, 0.08, 1.4) * 0.50 * brush;
  // specular line along each bead crest
  bezO += vec3(0.35) * exp(-(xo + 0.3) * (xo + 0.3) / 0.06) * max(L2 + 0.4, 0.0);
  bezI += vec3(0.30) * exp(-(xi - 0.2) * (xi - 0.2) / 0.06) * max(L2 + 0.4, 0.0);

  // ---- channel: dark painted plate the sockets sit in
  float chDepth = 1.0 - 0.35 * exp(-(-dCh0) / (channel * 0.25)) * step(0.0, L2)
                      - 0.20 * exp(-(-dCh0) / (channel * 0.25)) * step(L2, 0.0);
  vec3 chan = deep * 0.16 * chDepth * (1.0 + tooth * 0.10);

  // ---- board: the clean dark negative space, a whisper of gradient
  vec3 board = deep * (0.030 + 0.012 * uv.y) + wallT * 0.004 * (1.0 + tooth * 0.4);

  // assemble the surfaces by distance band
  float aa = gAA * 1.2;
  vec3 col = wall;
  col = mix(col, bezO,  1.0 - smoothstep(-aa, aa, dOut));
  col = mix(col, chan,  1.0 - smoothstep(-aa, aa, dCh0));
  col = mix(col, bezI,  1.0 - smoothstep(-aa, aa, dCh1));
  col = mix(col, board, 1.0 - smoothstep(-aa, aa, dIn));

  // ---- bulbs on the track: nearest side, nearest three sockets
  float tx = hx - inset, ty = hy - inset;
  float Nx = max(floor(2.0 * tx / pitch + 0.5), 1.0);
  float Ny = max(floor(2.0 * ty / pitch + 0.5), 1.0);
  // the chase repeats every 3 bulbs, so the chain length must divide by 3
  float rem = mod(2.0 * (Nx + Ny), 3.0);
  Ny += rem > 1.5 ? -1.0 : rem;
  Ny = max(Ny, 1.0);
  float sx = 2.0 * tx / Nx, sy = 2.0 * ty / Ny;
  vec2  at = abs(p) - vec2(tx, ty);
  bool  vert = at.x > at.y;
  // local position along the side and the chain index base and direction
  float along, spacing, base, dirn, N;
  vec2  origin, step2;
  if (vert) {
    N = Ny; spacing = sy;
    if (p.x > 0.0) { along = ty - p.y; base = Nx;            origin = vec2( tx,  ty); step2 = vec2(0.0, -sy); }
    else           { along = p.y + ty; base = 2.0 * Nx + Ny; origin = vec2(-tx, -ty); step2 = vec2(0.0,  sy); }
  } else {
    N = Nx; spacing = sx;
    if (p.y > 0.0) { along = p.x + tx; base = 0.0;           origin = vec2(-tx,  ty); step2 = vec2( sx, 0.0); }
    else           { along = tx - p.x; base = Nx + Ny;       origin = vec2( tx, -ty); step2 = vec2(-sx, 0.0); }
  }
  float k0 = floor(along / spacing + 0.5);
  vec3  thrown = vec3(0.0);
  float glassCov = 0.0;
  for (int i = -1; i <= 1; i++) {
    float k = k0 + float(i);
    if (k < 0.0 || k > N) continue;
    // corner sockets belong to the side that starts there, so the chain
    // index at the end of a side wraps to the next side start
    float idx = base + k;
    vec2  c   = origin + step2 * k;
    thrown += bulb(p, c, idx, col, glassCov);
  }
  // the thrown light lands on everything but the glass itself
  col += thrown * (1.0 - glassCov);
  // a steady ambient spill from the whole chain onto the wall and board
  float spill = exp(-abs(dOut - (-inset)) / (pitch * 2.2)) * 0.14 * gGlow;
  col += gBulbWarm * spill * (1.0 - glassCov);

  // seat the frame: gentle vignette
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.25 * smoothstep(0.35, 0.95, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
