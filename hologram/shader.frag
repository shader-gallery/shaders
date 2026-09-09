// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// hologram (Glitch) - a scanline holographic projection filling a dark, hazy
// room. Three geometric layers are thrown into the air at different depths:
// a far measurement grid with blinking data blocks, a middle lattice of
// dialled rings and rotating arc gauges, and a near field of scrolling readout
// bars. They slide against one another with a slow camera drift, so the
// projection has parallax and reads as a volume, not a decal. The whole
// image passes through the projector: the field is sampled three times with
// a horizontal offset for the two chroma ghosts, so every edge splits into a
// pale core flanked by a cyan and a magenta fringe; horizontal scanlines at
// css-pixel pitch darken every third row with a bright roll bar climbing
// through them; interference bands drift up the projection; the brightness
// flickers, and every so often a horizontal tear slips a slice of the image
// sideways for a frame or two. The projector lights the haze around it, so
// the room floor and the dust hold the frame edge to edge.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;    // drift, rotation and roll speed          (default 0.35)
uniform float u_split;    // chroma ghost offset, css px             (default 3.0)
uniform float u_scan;     // scanline depth                          (default 0.6)
uniform float u_flicker;  // flicker and tear intensity              (default 0.6)
uniform float u_haze;     // room haze and floor glow                (default 0.8)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

// a projected line: crisp core of width w (frame units) plus a soft glow
// halo, since holographic light scatters in the haze around every edge
float pline(float d, float w) {
  d = abs(d);
  float core = 1.0 - smoothstep(w * 0.6, w * 1.4, d);
  float halo = exp(-d / (w * 4.0)) * 0.35;
  return core + halo;
}

// ---- layer 0, far: a fine measurement grid with blinking data blocks
float layerGrid(vec2 p, float t, float w) {
  float cell = 0.11;
  vec2  g  = p / cell;
  vec2  gf = fract(g) - 0.5;
  vec2  gi = floor(g);
  float lines = max(pline(gf.x * cell, w), pline(gf.y * cell, w)) * 0.35;
  // every fifth line heavier, the way a ruled grid is
  vec2 major = step(abs(fract(g / 5.0) - 0.5), vec2(0.5 / 5.0 * 0.5 + 0.02));
  lines += max(pline(gf.x * cell, w) * major.x, pline(gf.y * cell, w) * major.y) * 0.35;
  // data blocks: a few cells lit solid, flipping state a couple of times a second
  float tick = floor(t * 2.5);
  float on   = step(0.93, hash21(gi + tick * 0.37 + 11.0));
  float sq   = (1.0 - smoothstep(0.30, 0.36, abs(gf.x))) * (1.0 - smoothstep(0.30, 0.36, abs(gf.y)));
  return lines + on * sq * 0.9;
}

// ---- layer 1, middle: a lattice of dialled rings with a rotating arc gauge
float layerRings(vec2 p, float t, float w) {
  float cell = 0.66;
  vec2  g  = p / cell;
  // stagger alternate rows by half a cell so the lattice does not rule up
  g.x += 0.5 * step(0.5, fract(g.y * 0.5));
  vec2  gi = floor(g);
  vec2  gf = (fract(g) - 0.5) * cell;
  float h  = hash21(gi + 3.0);
  float r  = length(gf);
  float R  = 0.13 + 0.15 * hash21(gi + 8.0);
  float ang = atan(gf.y, gf.x);
  // outer ring and a thin inner ring
  float v = pline(r - R, w) * 0.8 + pline(r - R * 0.62, w * 0.8) * 0.45;
  // a rotating arc segment riding just outside the ring
  float spin = ang - t * (0.6 + h) * (h > 0.5 ? 1.0 : -1.0);
  float arc = smoothstep(0.42, 0.5, fract(spin / TAU)) * (1.0 - smoothstep(0.78, 0.86, fract(spin / TAU)));
  v += pline(r - R * 1.18, w * 1.6) * arc * 0.9;
  // twelve tick marks around the dial
  float tk = abs(fract(ang / TAU * 12.0) - 0.5) * TAU / 12.0 * r;
  float tickBand = smoothstep(R * 0.78, R * 0.82, r) * (1.0 - smoothstep(R * 0.90, R * 0.94, r));
  v += pline(tk, w * 0.9) * tickBand * 0.7;
  // centre cross
  float cross = max(pline(gf.x, w * 0.7), pline(gf.y, w * 0.7)) * (1.0 - smoothstep(R * 0.30, R * 0.36, r));
  v += cross * 0.5;
  // only some slots hold a dial, and a few of those are dimmed, so the
  // lattice reads as scattered instruments rather than wallpaper
  v *= step(0.42, h) * (0.55 + 0.45 * step(0.6, h));
  // thinned where the master dial sits, so the two do not tangle
  v *= 0.35 + 0.65 * smoothstep(0.50, 0.90, length(p - vec2(-0.72, 0.12)));
  return v;
}

// ---- layer 2, near: scrolling readout bars, sparse, on staggered rows
float layerBars(vec2 p, float t, float w) {
  float rowH = 0.105;
  float row  = floor(p.y / rowH);
  float fy   = fract(p.y / rowH) - 0.5;
  float h    = hash11(row * 7.31 + 1.7);
  // each row scrolls at its own speed and direction
  float dir  = h > 0.5 ? 1.0 : -1.0;
  float x    = p.x + dir * t * (0.05 + 0.10 * h) + h * 9.0;
  float segW = 0.55 + 0.5 * hash11(row * 3.7 + 5.1);
  float seg  = floor(x / segW);
  float fx   = fract(x / segW);
  float hs   = hash21(vec2(seg, row));
  // a bar occupies a random fraction of its segment, only on some rows
  float len  = 0.15 + 0.6 * hs;
  float on   = step(0.62, hash11(row * 11.3 + 2.9)) * step(0.35, hs);
  float bar  = on * step(fx, len) * step(0.06, fx) * (1.0 - smoothstep(0.14, 0.20, abs(fy)));
  // bar body is a translucent slab with a bright leading edge
  float edge = pline((fx - len) * segW, w * 1.2) * on * (1.0 - smoothstep(0.16, 0.22, abs(fy)));
  return bar * 0.5 + edge * 1.0;
}

// ---- layer 3, nearest: large concentric arcs of a radar dial whose centre
// sits below the frame, with a sweeping radial hand
float layerArcs(vec2 p, float t, float w) {
  vec2  c   = p - vec2(0.0, -1.35);
  float r   = length(c);
  float ang = atan(c.y, c.x);
  float v   = 0.0;
  for (int i = 0; i < 3; i++) {
    float k  = float(i);
    float R  = 1.15 + 0.42 * k;
    // each ring is broken into arcs by a slow angular gate
    float gate = smoothstep(0.1, 0.4, sin(ang * (3.0 + k) + t * (0.3 - 0.1 * k) + k * 2.1));
    v += pline(r - R, w * (1.4 - 0.2 * k)) * gate * (0.7 - 0.15 * k);
  }
  // fine radial ticks between the inner two rings
  float tk = abs(fract(ang / TAU * 90.0) - 0.5) * TAU / 90.0 * r;
  float band = smoothstep(1.52, 1.55, r) * (1.0 - smoothstep(1.60, 1.63, r));
  v += pline(tk, w * 0.8) * band * 0.6;
  // the sweeping hand
  float sweep = fract((ang - t * 0.25) / TAU);
  float hand  = exp(-sweep * 14.0) * smoothstep(1.0, 1.15, r) * (1.0 - smoothstep(1.95, 2.1, r));
  v += hand * 0.35;
  return v;
}

// ---- the master dial: one large instrument held in the middle of the
// projection, a thick outer ring with a graduated scale, two counter-rotating
// sector gauges and a slow sweeping hand
float layerMaster(vec2 p, float t, float w) {
  float r   = length(p);
  float ang = atan(p.y, p.x);
  float R   = 0.58;
  float v   = pline(r - R, w * 1.6) * 1.0;
  v += pline(r - R * 0.88, w * 0.8) * 0.5;
  v += pline(r - R * 0.40, w) * 0.6;
  // graduated scale between the two outer rings: 60 fine, 12 heavy
  float tk1  = abs(fract(ang / TAU * 60.0) - 0.5) * TAU / 60.0 * r;
  float tk2  = abs(fract(ang / TAU * 12.0) - 0.5) * TAU / 12.0 * r;
  float band1 = smoothstep(R * 0.90, R * 0.92, r) * (1.0 - smoothstep(R * 0.95, R * 0.97, r));
  float band2 = smoothstep(R * 0.89, R * 0.91, r) * (1.0 - smoothstep(R * 0.985, R * 1.0, r));
  v += pline(tk1, w * 0.7) * band1 * 0.6 + pline(tk2, w * 1.1) * band2 * 0.8;
  // two sector gauges, counter-rotating, drawn as translucent wedges with a
  // bright arc on their outer edge
  float a1 = fract((ang + t * 0.18) / TAU);
  float a2 = fract((ang - t * 0.11 + 2.0) / TAU);
  float s1 = step(a1, 0.22) * smoothstep(R * 0.66, R * 0.68, r) * (1.0 - smoothstep(R * 0.84, R * 0.86, r));
  float s2 = step(a2, 0.14) * smoothstep(R * 0.44, R * 0.46, r) * (1.0 - smoothstep(R * 0.62, R * 0.64, r));
  v += s1 * 0.22 + s2 * 0.22;
  v += pline(r - R * 0.85, w * 1.3) * step(a1, 0.22) * 0.9;
  v += pline(r - R * 0.63, w * 1.3) * step(a2, 0.14) * 0.9;
  // the sweeping hand, fading behind itself
  float sweep = fract((ang - t * 0.4) / TAU);
  v += exp(-sweep * 18.0) * (1.0 - smoothstep(R * 0.86, R * 0.88, r)) * 0.4;
  // crosshair through the centre, broken near the middle
  float cross = max(pline(p.x, w * 0.8) * step(0.06, abs(p.y)), pline(p.y, w * 0.8) * step(0.06, abs(p.x)));
  v += cross * (1.0 - smoothstep(R * 0.36, R * 0.40, r)) * 0.6;
  return v;
}

// the whole projected field at frame coords p, with per-layer parallax
float field(vec2 p, vec2 cam, float t, float w) {
  float v = 0.0;
  v += layerGrid(p * 1.0 + cam * 0.25 + vec2(0.0, t * 0.01), t, w) * 0.55;
  v += layerRings(p * 1.0 + cam * 0.6 + vec2(t * 0.012, 0.0), t, w);
  v += layerBars(p * 1.0 + cam * 1.1, t, w);
  v += layerArcs(p * 1.0 + cam * 1.5, t, w);
  v += layerMaster(p - vec2(-0.72, 0.12) + cam * 0.9, t, w);
  return v;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float aspect = res.x / res.y;
  float t      = u_time * clamp(u_speed, 0.0, 3.0);
  float tRaw   = u_time;
  float scanA  = clamp(u_scan, 0.0, 1.0);
  float flickA = clamp(u_flicker, 0.0, 2.0);
  float hazeA  = clamp(u_haze, 0.0, 2.0);

  vec2  uv = fc / res;
  // frame units: y runs -1..1, x scaled by aspect
  vec2  p  = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  float px = 2.0 / res.y;                 // one device pixel in frame units
  float w  = 1.3 * pr * px;               // line width: 1.3 css px

  // ---- projector faults: flicker, and a horizontal tear now and then
  float frame  = floor(tRaw * 24.0);
  float flick  = 1.0 - flickA * (0.06 * hash11(frame) + 0.30 * step(0.965, hash11(frame * 0.37 + 5.0)));
  float tearRow  = floor(uv.y * 28.0);
  float tearSeed = hash11(tearRow * 3.1 + floor(tRaw * 6.0) * 1.7);
  float tearOn   = step(0.975 - 0.02 * flickA, tearSeed) * step(0.01, flickA);
  p.x += tearOn * (hash11(tearRow + frame) - 0.5) * 0.10;

  // ---- camera drift for parallax; the pointer nudges it, zero at rest
  vec2 cam = vec2(sin(t * 0.21), 0.5 * cos(t * 0.16)) * 0.10;
  vec2 m   = (u_mouse / res - 0.5) * vec2(aspect, 1.0);
  cam += m * 0.12 * u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // ---- the field, sampled three times for the chroma ghosts
  float dx   = max(u_split, 0.0) * pr * px;
  float fC   = field(p, cam, t, w);
  float fA   = field(p + vec2(dx, 0.0), cam, t, w);
  float fB   = field(p - vec2(dx, 0.0), cam, t, w);

  // hologram colours: a pale core with the cool pole, and the two ghosts in
  // the cool and warm poles (cyan and magenta in the midnight theme)
  vec3 coreCol = mix(c2, vec3(1.0), 0.45);
  vec3 ghostA  = c2;
  vec3 ghostB  = c3;
  vec3 holo = coreCol * fC * 0.5 + ghostA * fA * 0.42 + ghostB * fB * 0.68;

  // ---- the projection thins toward the top and the sides, as a cone of
  // light from a floor emitter does
  float cone = 1.0 - 0.50 * smoothstep(0.2, 1.0, uv.y);
  cone *= 1.0 - 0.45 * smoothstep(0.45, 1.0, abs(p.x) / aspect);
  // the emitter sits off to the left, so the projection is brightest there
  vec2  ec = p - vec2(-0.72, 0.12);
  cone *= 1.0 + 0.35 * exp(-dot(ec, ec) * 1.0);
  // interference bands crawling up the projection
  float bands = 0.82 + 0.18 * sin(p.y * 38.0 - t * 2.4) * sin(p.y * 7.0 + t * 0.7);
  // the roll bar: a bright band climbing through the scanlines
  float roll = fract(uv.y * 1.0 - tRaw * 0.11);
  float rollBar = 1.0 + 0.55 * exp(-roll * roll * 180.0) + 0.12 * smoothstep(0.0, 0.25, roll) * (1.0 - smoothstep(0.25, 1.0, roll));
  holo *= cone * bands * rollBar * flick;

  // ---- scanlines at css-pixel pitch, three rows per line
  float sl = 0.5 + 0.5 * sin(fc.y / pr * TAU / 3.0);
  float scan = 1.0 - scanA * 0.7 * sl;
  holo *= scan;

  // ---- the room: dark haze lit by the projector, dust drifting through it
  vec3  roomBase = mix(c0, c1, 0.3) * 0.06 + c3 * 0.012;
  float floorGlow = exp(-uv.y * 3.2) * (1.0 - 0.5 * smoothstep(0.0, 1.0, abs(p.x + 0.5) / aspect));
  float airGlow   = exp(-length(vec2((p.x + 0.72) * 0.5, (uv.y - 0.15) * 1.6)) * 1.3);
  // the projector cone: a soft wedge of lit air widening upward from the
  // emitter below the frame
  float coneAir   = (1.0 - smoothstep(0.25 + 0.6 * uv.y, 0.55 + 0.9 * uv.y, abs(p.x + 0.72) / aspect)) * (1.0 - 0.6 * uv.y);
  float dust = fbm(vec2(p.x * 1.3, p.y * 1.3 + t * 0.06) + vec2(t * 0.02, 0.0)) - 0.4;
  vec3  haze = roomBase * (1.0 + 0.8 * dust)
             + mix(c2, c0, 0.4) * (0.17 * floorGlow + 0.07 * airGlow + 0.06 * coneAir) * hazeA * (0.85 + 0.6 * dust);
  // the haze catches the scanlines faintly too, since the room is lit by them
  haze *= 1.0 - scanA * 0.15 * sl;
  // sparse bright motes in the beam
  vec2  mq = vec2(p.x, p.y - t * 0.05) * 9.0;
  float mote = smoothstep(0.985, 1.0, hash21(floor(mq) + 7.0)) * (1.0 - smoothstep(0.0, 0.4, length(fract(mq) - 0.5)));
  haze += c2 * mote * 0.25 * hazeA * flick;

  vec3 col = haze + holo;

  // the projector blooms: lift the darks slightly where the field is dense so
  // the hologram sits in a glow rather than on flat black
  float dense = clamp((fC + fA + fB) * 0.12, 0.0, 1.0);
  col += mix(c2, c3, 0.5) * dense * 0.05 * hazeA;

  gl_FragColor = vec4(col, 1.0);
}
