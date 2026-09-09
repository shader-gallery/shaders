// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// pillar (Aether) - a vertical column of light standing in a hazy room, with
// a second, fainter column deep in the fog behind it. A source above the frame
// throws a narrow cone straight down: a hard bright core, a soft shoulder,
// then a long falloff into the fog that fills the whole frame. The beam is read as a volume, not a stripe: smoke drifts up through it
// and thickens and thins the glow, fine vertical striations inside the cone
// sway as the haze moves, and the light dims with distance from the source and
// with the fog it has already crossed. Dust motes hang in the air at three
// depths, drifting down and sideways on slow turbulence, and light up only
// while they pass through the cone. The beam lands on a dark floor in a soft
// pool that spills a little bounce light back into the fog. The column leans
// and breathes slowly, so the room never holds still.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_width;    // beam core width, frame-relative      (default 0.16)
uniform float u_haze;     // fog density in the room              (default 1.0)
uniform float u_dust;     // dust mote amount                     (default 1.0)
uniform float u_drift;    // speed of smoke, motes and sway       (default 0.4)
uniform float u_sway;     // how far the column leans and wanders (default 0.35)

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// sparse scatter of soft round motes: one candidate per cell at a hashed
// offset, only the brighter hashes survive, each twinkling on its own phase.
// q is in cell units, t drives the twinkle.
float motes(vec2 q, float t, float keep) {
  vec2 i = floor(q), f = fract(q);
  float m = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2  o  = vec2(float(x), float(y));
      vec2  c  = i + o;
      vec2  h  = vec2(hash21(c + 0.37), hash21(c + 7.91));
      float sz = 0.06 + 0.12 * hash21(c + 3.3);
      float br = smoothstep(keep, 1.0, hash21(c + 11.1));
      br *= 0.55 + 0.45 * sin(t * 1.3 + hash21(c + 5.5) * TAU);
      vec2  d  = f - (o + h);
      m += br * exp(-dot(d, d) / (sz * sz));
    }
  }
  return m;
}

// one light column. px, y are frame coords (x aspect-corrected, y 0..1 up).
// foot is where the axis meets the floor, lean tilts it, w0 is the core width
// at the lamp, down is the distance below the lamp. Returns
//   x: radiance shape (core + shoulder + skirt, striated)
//   y: the bare skirt
//   z: how strongly a mote here is lit
//   w: nx, the signed distance across the core in core widths
// and writes the bare core and the striation factor for colouring.
vec4 column(float px, float y, float foot, float lean, float w0, float horizon,
            float down, float t, float smokeA, out float core, out float stria) {
  float axisX = foot + lean * (y - horizon) * 2.0;
  // spot cone: the beam widens slightly with distance from the lamp
  float w  = w0 * (0.55 + 0.45 * down);
  float dx = px - axisX;
  float ax = abs(dx);
  float nx = dx / w;
  // a tight core, a soft shoulder, and a long exponential skirt that bleeds
  // into the fog; the skirt is what makes it a volume rather than a stripe
  core        = exp(-nx * nx * 2.2);
  float shoul = exp(-nx * nx * 0.55);
  float skirt = exp(-ax / (w * 3.2));
  // vertical striations inside the cone: high frequency across, very low
  // along, sliding slowly with the smoke so the rays seem to sway
  stria = vnoise(vec2(nx * 6.0 + 0.4 * t + smokeA * 3.0, y * 1.2 - 0.2 * t));
  stria = 0.72 + 0.56 * stria;
  float shape = (core * 2.4 + shoul * 0.5 + skirt * 0.28) * stria;
  float lit   = core + shoul * 0.6 + skirt * 0.25;
  return vec4(shape, skirt, lit, nx);
}

// the pool of light where a cone lands on the floor: a soft ellipse in
// perspective, a hot centre where the core itself hits, a short spill across
// the ground, and a gloss reflection of the column smeared downward.
float pool(float px, float fy, float foot, float w0, float nx, float stria) {
  float w     = w0 * (0.55 + 0.45 * 1.15);
  float poolR = w * (1.0 + 1.2 * fy);
  vec2  pd    = vec2((px - foot) / max(poolR * 1.6, 1e-3), (fy - 0.40) / 0.30);
  float pl    = exp(-dot(pd, pd) * 1.4);
  vec2  hd    = vec2((px - foot) / max(poolR * 0.7, 1e-3), (fy - 0.40) / 0.16);
  float hot   = exp(-dot(hd, hd) * 2.0);
  float spill = exp(-abs(px - foot) * 3.0) * (0.3 + 0.7 * (1.0 - fy));
  float refl  = exp(-nx * nx * 1.6) * exp(-fy * 3.0) * 0.6 * stria;
  return pl * 1.5 + hot * 1.4 + spill * 0.14 + refl;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t      = u_time * clamp(u_drift, 0.0, 2.0);
  float haze   = clamp(u_haze, 0.0, 3.0);
  float dust   = clamp(u_dust, 0.0, 3.0);
  float sway   = clamp(u_sway, 0.0, 1.5);
  float w0     = max(u_width, 0.02);

  // ---- colours. The light is the first two poles pushed toward white at the
  // core; the fog takes a desaturated second pole; the floor is near black
  // warmed by the fourth pole. Every ground here is a luminance mix so the
  // room stays a dark room in every theme.
  vec3 lightCol = mix(c0, c2, 0.5);
  lightCol = mix(vec3(luma(lightCol)), lightCol, 0.7);
  // pin the light and fog to fixed luminances so pale palettes do not blow
  // the room out and dark ones do not leave it black
  lightCol *= 0.72 / max(luma(lightCol), 0.05);
  vec3 coreCol  = mix(lightCol, vec3(1.0), 0.30);
  vec3 edgeCol  = mix(c1, lightCol, 0.4);              // the cone shoulder shifts hue
  vec3 fogCol   = mix(vec3(luma(c1)), c1, 0.45);
  fogCol   *= 0.42 / max(luma(fogCol), 0.05);
  vec3 floorCol = mix(vec3(0.018, 0.018, 0.024), c3, 0.10);
  vec3 roomCol  = mix(vec3(0.020, 0.020, 0.027), fogCol, 0.10);

  // ---- the floor. A horizon low in the frame; below it a ground plane seen
  // in shallow perspective. y in [0,1] up.
  float horizon = 0.15;
  float onFloor = smoothstep(horizon + 0.004, horizon - 0.004, uv.y);

  // ---- smoke drifting up through the room. Two fbm reads at different
  // scales, both rising, give slow rolling density inside and outside the cone.
  vec2  sp     = vec2(p.x * 1.4, uv.y * 1.6);
  float smokeA = fbm(sp * 1.6 + vec2(0.11 * t, -0.34 * t));
  float smokeB = fbm(sp * 3.4 + vec2(-0.07 * t, -0.55 * t) + 9.0);
  float smoke  = smokeA * 0.65 + smokeB * 0.35;      // ~0.2..0.8
  float dens   = 0.55 + 1.4 * (smoke - 0.5) * haze;  // local fog density

  // distance from the lamps, which sit above the top edge
  float src   = 1.25;
  float down  = clamp(src - uv.y, 0.0, 2.0);        // 0 at the source, grows downward
  float fy    = (horizon - uv.y) / horizon;          // floor depth, 0 horizon .. 1 bottom
  float reach = 1.0 / (0.35 + 0.9 * down * down);

  // ---- the main column. It stands left of centre so the frame reads as a
  // room with a light in it, not a symmetric emblem. Its foot wanders on slow
  // sines and the axis leans, so top and foot move differently.
  float foot = -0.36 + sway * (0.10 * sin(t * 0.23) + 0.05 * sin(t * 0.61 + 1.7));
  float lean = 0.05 + sway * (0.06 * sin(t * 0.17 + 0.9) + 0.03 * cos(t * 0.43));
  float extinct = exp(-down * (0.22 + 0.30 * haze));
  float core, stria;
  vec4  bm = column(p.x, uv.y, foot, lean, w0, horizon, down, t, smokeA, core, stria);
  // bm: x = beam radiance shape, y = skirt, z = lit (for motes), w = nx
  float beamI = bm.x * reach * extinct * (0.25 + 1.3 * dens) * (1.0 - onFloor);

  // ---- a second, farther column at the right. Narrower on screen, much
  // dimmer, with more fog in front of it, so it sits deep in the room and
  // gives the haze a far wall to hang against.
  float foot2 = 0.56 + sway * (0.06 * sin(t * 0.19 + 2.3));
  float lean2 = -0.03 + sway * 0.03 * sin(t * 0.29 + 4.0);
  float extinct2 = exp(-down * (0.30 + 0.45 * haze)) * 0.30;
  float core2, stria2;
  vec4  bm2 = column(p.x, uv.y, foot2, lean2, w0 * 0.45, horizon, down, t + 31.0, smokeB, core2, stria2);
  float beamI2 = bm2.x * reach * extinct2 * (0.35 + 1.0 * dens) * (1.0 - onFloor);

  // ---- floor pools where the cones land, and gloss reflections of both
  float floorL  = onFloor * pool(p.x, fy, foot, w0, bm.w, stria) * extinct;
  float floorL2 = onFloor * pool(p.x, fy, foot2, w0 * 0.45, bm2.w, stria2) * extinct2 * 0.8;
  // the floor itself is a matte dark plane with a whisper of grain
  float floorG = 0.9 + 0.2 * vnoise(vec2(p.x * 60.0, fy * 200.0));

  // ---- the room haze. Fog everywhere, brighter toward the lamps and the
  // columns, so the frame fills with a soft dark glow rather than dropping to
  // black at the edges. Bounce from the floor pools lifts the low air.
  float nearBeam = exp(-abs(p.x - foot) * 1.3) + 0.45 * exp(-abs(p.x - foot2) * 1.6);
  float lampGlow = exp(-down * 1.4);
  float bounce   = exp(-abs(uv.y - horizon) * 5.0)
                 * (exp(-abs(p.x - foot) * 1.6) + 0.4 * exp(-abs(p.x - foot2) * 2.0)) * 0.5;
  float roomL    = (0.022 + 0.045 * nearBeam + 0.032 * lampGlow + bounce * 0.4)
                 * (0.6 + 0.8 * smoke) * (0.5 + 0.5 * haze) * (1.0 - onFloor * 0.6);

  // ---- dust. Three depths in screen space. Motes fall slowly and are pushed
  // sideways by the same turbulence as the smoke. Near ones are large and
  // soft, far ones small and sharp. They shine only inside a cone.
  float lit   = bm.z * reach * extinct + bm2.z * reach * extinct2;
  vec2  wind  = vec2(0.05 * sin(t * 0.3 + uv.y * 4.0), -0.10);
  float mFar  = motes(p * 60.0 + wind * t * 0.7 + vec2(3.0, 0.0), t, 0.72);
  float mMid  = motes(p * 32.0 + wind * t * 1.2 + vec2(0.0, 5.0), t * 0.8, 0.70);
  float mNear = motes(p * 15.0 + wind * t * 2.0 + vec2(7.0, 2.0), t * 0.6, 0.86);
  float moteL = (mFar * 0.5 + mMid * 0.8 + mNear * 0.55) * dust * lit * (1.0 - onFloor);

  // ---- compose
  vec3 col = mix(roomCol, floorCol * floorG, onFloor);
  col += fogCol * roomL;
  vec3 beamCol = mix(edgeCol, coreCol, clamp(core * 1.2, 0.0, 1.0));
  col += beamCol * beamI;
  // the far column is more fogged, so it takes more of the fog hue
  vec3 beamCol2 = mix(mix(edgeCol, fogCol, 0.35), coreCol, clamp(core2 * 1.1, 0.0, 1.0));
  col += beamCol2 * beamI2;
  col += mix(lightCol, coreCol, 0.5) * (floorL + floorL2);
  col += mix(coreCol, vec3(1.0), 0.3) * moteL;

  // soft film roll-off on luminance, so the core blooms without clipping to a
  // flat white bar and without the hue shift a per-channel curve would give
  float L  = max(luma(col), 1e-4);
  float Lc = 1.0 - exp(-L * 1.3);
  col *= Lc / L;
  // bleach toward white as the core saturates, instead of clipping a channel
  col = mix(col, vec3(Lc), smoothstep(0.68, 1.0, Lc));
  col = pow(max(col, 0.0), vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
