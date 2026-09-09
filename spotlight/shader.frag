// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// spotlight (Aether) - a single stage spotlight in a haze-filled black box.
// The lamp hangs just above the top edge, right of centre, and its cone
// drops through drifting haze to land as a foreshortened elliptical pool on a
// dark plank floor. The pool is the negative space: an even, softly edged
// disc of light where a wordmark can sit, with a penumbra and a wide spill
// that warms the boards around it. The beam is drawn in its own cone space
// (distance down the axis, lateral offset across it): energy thins as the
// cone widens, a slow domain-drifting fbm gives the haze its body, a wider
// faint cone is the scatter halo, and two layers of dust motes twinkle and
// drift only where the beam lights them. The floor is a perspective plane
// with plank seams and grain, receding to a horizon under a dim velvet drape
// whose vertical folds catch the haze, so the whole frame carries tone. The lamp
// sways very slightly and the haze rolls, so the pool breathes at its edge
// while its middle stays flat.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) - unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_poolWidth;  // width of the floor pool in css px        (default 340)
uniform float u_haze;       // haze density in the beam and the room    (default 1.0)
uniform float u_dust;       // dust mote count and brightness           (default 1.0)
uniform float u_drift;      // haze roll speed                          (default 0.4)
uniform float u_sway;       // lamp sway amplitude                      (default 0.5)

const float HORIZON = 0.42;   // floor meets the haze wall at this frame height

// ---------------------------------------------------------------- noise ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
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
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(13.1, 7.7);
    amp *= 0.5;
  }
  return v;
}

// One layer of dust: a jittered grid of motes in screen space, drifting with
// velocity vel (css px per second) and twinkling. Returns 0..1 brightness.
float motes(vec2 p, float cell, vec2 vel, float t, float seed) {
  vec2 g  = (p - vel * t) / cell;
  vec2 id = floor(g);
  vec2 f  = fract(g);
  float h1 = hash21(id + seed);
  float h2 = hash21(id + seed + 17.3);
  float h3 = hash21(id + seed + 41.9);
  // each mote wanders a little inside its own cell
  vec2 c = vec2(0.5) + 0.32 * vec2(sin(t * 0.7 + h1 * 6.28), cos(t * 0.5 + h2 * 6.28));
  float d = length((f - c) * cell);
  float r = mix(0.7, 1.6, h3);
  float m = exp(-d * d / (r * r));
  // twinkle and thin the population so it reads as dust, not a grid
  float tw = 0.55 + 0.45 * sin(t * (1.5 + h2 * 2.0) + h1 * 20.0);
  float keep = step(0.55, h1);
  return m * tw * keep;
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  res = u_resolution;
  vec2  p   = gl_FragCoord.xy / pr;        // css px, origin bottom left
  vec2  csz = res / pr;
  vec2  uv  = gl_FragCoord.xy / res;
  float aspect = csz.x / csz.y;
  float t   = u_time;

  // ---- palette fallback (headless contexts can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float haze  = max(u_haze, 0.0);
  float dust  = max(u_dust, 0.0);
  float drift = max(u_drift, 0.0);
  float sway  = clamp(u_sway, 0.0, 2.0);
  float poolW = max(u_poolWidth, 80.0);

  // ---- materials from the palette ----
  vec3 lampC  = mix(c2, vec3(1.0), 0.40);                 // hot pale beam core
  vec3 beamC  = mix(c1, c2, 0.55);                         // body of the beam
  vec3 poolC  = mix(mix(c1, c2, 0.55), vec3(1.0), 0.22);   // light on the boards
  vec3 hazeC  = mix(c0, c3, 0.5);
  hazeC = mix(hazeC, vec3(dot(hazeC, vec3(0.333))), 0.55); // desaturated room haze
  vec3 floorC = mix(c3, vec3(dot(c3, vec3(0.333))), 0.6) * 0.20 + vec3(0.012, 0.011, 0.010);

  // ---- lamp geometry: source above the top edge, pool on the floor ----
  float swayX = sway * 0.012 * sin(t * 0.37) * csz.x;
  vec2  src   = vec2(csz.x * 0.70 + swayX * 0.4, csz.y * 1.10);
  vec2  pc    = vec2(csz.x * 0.615 + swayX,       csz.y * 0.235);   // pool centre
  float rx    = poolW * 0.5;
  float ry    = rx * 0.30;                                           // foreshortened

  // cone space: s runs 0 at the lamp to 1 at the pool centre line, u is the
  // lateral offset in units of the local cone half width
  vec2  axis  = pc - src;
  float axLen = length(axis);
  vec2  ad    = axis / axLen;
  vec2  rel   = p - src;
  float s     = dot(rel, ad) / axLen;
  float lat   = dot(rel, vec2(-ad.y, ad.x));
  float w0    = csz.x * 0.018;                                       // aperture half width
  float wS    = mix(w0, rx, clamp(s, 0.0, 1.5));
  float u     = lat / wS;

  // pool ellipse on the floor
  vec2  ep    = (p - pc) / vec2(rx, ry);
  float e     = length(ep);

  // ---- haze field: two slow fbm layers rolling through the room ----
  vec2  hq    = p / csz.y;
  float tw    = t * drift;
  float roll  = fbm(hq * 2.2 + vec2(tw * 0.06, tw * 0.035) + 3.0);
  float roll2 = fbm(hq * 4.5 + vec2(-tw * 0.04, tw * 0.05) + roll * 1.4 + 9.0);
  float hazeN = 0.45 + 0.55 * (0.6 * roll + 0.4 * roll2);

  // ---- floor plane ----
  float below  = 1.0 - smoothstep(HORIZON - 0.004, HORIZON + 0.004, uv.y);
  float depth  = 1.0 / max(HORIZON - uv.y, 0.006);                  // grows toward the horizon
  float fx     = (uv.x - 0.5) * aspect * depth * 1.15;
  float fz     = depth * 0.9;
  // plank seams along the depth direction and butt joints across
  float seamW  = 0.012 + 0.006 * depth;                              // softens toward the horizon
  float seam   = 1.0 - smoothstep(0.0, seamW, 0.5 - abs(fract(fx) - 0.5));   // 1 only in the groove
  float plankId = floor(fx);
  float joint  = 1.0 - smoothstep(0.0, 0.02, 0.5 - abs(fract(fz * 0.28 + hash21(vec2(plankId, 1.0))) - 0.5));
  float grain  = vnoise(vec2(fx * 30.0, fz * 1.5 + plankId * 7.0));
  float plankTone = 0.86 + 0.14 * hash21(vec2(plankId, 3.0)) + 0.08 * (grain - 0.5);
  float boards = plankTone * (1.0 - 0.45 * seam) * (1.0 - 0.30 * joint);
  // distance fog toward the horizon so the boards sink into the haze
  float fog    = smoothstep(0.0, 1.0, (uv.y / HORIZON));
  fog = fog * fog;

  // ---- light on the floor: the pool, its penumbra, and the spill ----
  float poolCore = 1.0 - smoothstep(0.86, 1.00, e);
  float penum    = 1.0 - smoothstep(0.92, 1.35, e);
  float spill    = exp(-e * 1.25) * 0.28;
  float poolL    = poolCore * 1.35 + penum * 0.30 + spill;
  // a soft gloss streak toward the camera, the boards catching the pool
  float gloss    = exp(-abs(p.x - pc.x) / (rx * 0.9)) * smoothstep(pc.y, pc.y - csz.y * 0.35, p.y) * 0.18;

  // ---- back drape above the horizon ----
  // a velvet curtain hangs to the floor behind the pool: broad vertical folds
  // whose ridges catch the room haze and whose valleys fall to black. Fold
  // spacing wanders with a slow noise so the drape reads as gathered cloth
  float foldW  = csz.y * 0.71;
  float foldPh = (p.x + csz.y * 0.089) / foldW + 0.12 * fbm(vec2(p.x / csz.y * 1.3, uv.y * 0.35) + 20.0);
  float fold   = 0.5 + 0.5 * sin(foldPh * 6.2831853);
  fold = fold * fold;
  float foldDepth = 0.80 + 0.20 * fbm(vec2(p.x / csz.y * 0.8 + 7.0, 2.0));
  float drape  = mix(1.0, 0.10 + 1.90 * fold, foldDepth);
  // nap of the velvet: fine vertical grain
  drape *= 0.94 + 0.06 * vnoise(vec2(p.x * 0.9, p.y * 0.08));
  vec3 wallCol = hazeC * (0.08 + 0.30 * hazeN) * drape * (0.55 + 0.45 * (1.0 - uv.y));
  // the drape picks up a soft glow around the pool line and below the lamp
  wallCol += beamC * 0.03 * exp(-abs(uv.y - HORIZON) * 9.0) * exp(-abs(p.x - pc.x) / (rx * 1.6));

  vec3 floorCol = floorC * boards;
  floorCol *= 0.40 + 0.60 * hazeN;                                    // ambient from the room haze
  floorCol += poolC * boards * poolL * 1.05;
  floorCol += poolC * gloss;
  // keep the plank pattern from cluttering the pool: the core is nearly flat
  floorCol = mix(floorCol, poolC * (0.97 + 0.03 * boards) * 1.22, poolCore * 0.85);
  // the painted boards are glossy: the drape folds reflect as vertical streaks
  // that fade with distance below the horizon, and the pool washes them out
  float reflFall = exp(-(HORIZON - uv.y) * 3.5) * below;
  floorCol += hazeC * (0.10 + 0.30 * hazeN) * drape * 1.35 * reflFall * (1.0 - poolCore);
  floorCol = mix(floorCol, hazeC * (0.05 + 0.24 * hazeN) * 1.05, fog * 0.94);

  vec3 col = mix(wallCol, floorCol, below);

  // ---- the beam ----
  // soft lateral edge, energy falling as the cone spreads, ending at the pool
  float edgeIn  = 1.0 - smoothstep(0.78, 1.02, abs(u));
  float coneEnd = mix(1.0, 1.0 - smoothstep(0.90, 1.08, e), smoothstep(0.92, 1.0, s));
  float along   = smoothstep(-0.05, 0.08, s);
  float spread  = pow(w0 / wS, 0.55);
  // faint lateral striations, the ray structure a lens and gobo leave in haze
  float striae  = 0.82 + 0.18 * vnoise(vec2(u * 7.0 + 3.0, s * 1.2 - tw * 0.08));
  float body    = edgeIn * along * coneEnd * spread * striae;
  // haze body: the beam is only as visible as the haze it lights
  float beamHaze = mix(0.55, 1.25, hazeN);
  float beam    = body * beamHaze * haze * 1.05;
  // hot core near the lamp aperture
  float core    = exp(-u * u * 3.0) * exp(-s * 5.0) * along * 1.4;
  // wide faint scatter halo around the cone
  float halo    = (1.0 - smoothstep(0.6, 2.4, abs(u))) * along * coneEnd * spread * 0.22 * haze * hazeN;

  col += beamC * beam;
  col += lampC * core * haze;
  col += hazeC * halo * 2.0;

  // ---- dust in the beam: two mote layers drifting slowly ----
  // motes fade out just above the floor so the pool itself stays clean
  float inBeam = body * beamHaze * (1.0 - smoothstep(0.82, 0.97, s));
  float m1 = motes(p, 16.0, vec2(-3.0, 4.5), t, 1.0);
  float m2 = motes(p, 26.0, vec2(2.0, 2.5), t, 5.0) * 0.7;
  float mote = (m1 + m2) * inBeam * dust;
  col += lampC * mote * 1.6;

  // ---- global tone: dark room, mild filmic compress ----
  col = col / (1.0 + col * 0.30);
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
