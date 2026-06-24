// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// comet (Abyss) — a single comet bound to a long elliptical orbit that fits
// inside the frame. The empty focus is dark and far off-centre; the nucleus is a
// small bright point with a tight coma; its ion tail always streams anti-sunward
// (away from the hidden focus), swinging through 180° around the orbit. The tail
// flares long and bright through the fast perihelion whip and shrinks to a stub
// on the slow aphelion crawl. A faint dust trail lingers along the recently
// travelled arc, a decaying ghost of the path. Kepler-paced, phase-continuous,
// loop-safe: most of each period is a far-arc crawl, then a few-second dive.
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
uniform float u_orbitPeriod;   // seconds per full orbit          (default 36)
uniform float u_eccentricity;  // how stretched the ellipse is    (default 0.7)
uniform float u_tail;          // ion-tail length at perihelion, css px (default 320)
uniform float u_trail;         // dust-trail persistence 0..1     (default 0.45)

const vec3  BG       = vec3(0.030, 0.031, 0.040); // near-black space base
const float PI       = 3.14159265359;
const float TAU      = 6.28318530718;
const int   KEPLER_N = 6;   // Newton iterations to solve Kepler's equation
const int   TRAIL_N  = 110; // samples along the orbit for the dust trail

// ---- hash for the static starfield ----
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Solve Kepler's equation M = E - e*sin(E) for the eccentric anomaly E.
float solveKepler(float M, float e) {
  // wrap M to [-PI, PI] for fast convergence
  M = mod(M + PI, TAU) - PI;
  float E = M + e * sin(M); // good initial guess
  for (int i = 0; i < KEPLER_N; i++) {
    float f  = E - e * sin(E) - M;
    float fp = 1.0 - e * cos(E);
    E = E - f / max(fp, 0.05);
  }
  return E;
}

// Position on the unit-semimajor ellipse (in orbit-plane units) for mean anomaly
// M. Focus is at the origin (the hidden Sun). Returns the body position; the
// anti-sunward direction is then simply normalize(pos).
vec2 orbitPos(float M, float e) {
  float E = solveKepler(M, e);
  // ellipse param: x along major axis, y along minor; focus offset by a*e
  float a = 1.0;
  float b = a * sqrt(max(1.0 - e * e, 0.0001));
  vec2 p = vec2(a * cos(E) - a * e, b * sin(E)); // focus at origin
  return p;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;
  float minRes = min(res.x, res.y);

  vec3 col = BG;

  // ---------- palette fallback (headless contexts can zero the array) ----------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---------- orbit geometry, in screen px ----------
  float e = clamp(u_eccentricity, 0.05, 0.92);
  // semimajor axis sized so the whole ellipse fits the frame with margin.
  float a = minRes * 0.34;
  float b = a * sqrt(max(1.0 - e * e, 0.0001));
  // the hidden focus sits off-centre: shift the ellipse so its geometric centre
  // is near frame-centre, which puts the focus far off to one side.
  // orbit orientation: tilt the major axis a touch for composition.
  float ang = 0.42;
  vec2  ux  = vec2(cos(ang), sin(ang));        // major-axis direction
  vec2  uy  = vec2(-sin(ang), cos(ang));       // minor-axis direction
  // focus position in screen space: ellipse centre at frame centre, focus is
  // centre + a*e along +major. We want focus placement -> screen-map below.
  vec2 focusScreen = ctr - ux * (a * e) * 0.0; // (focus computed via orbitPos origin)
  // We'll map orbit-plane coords (focus at origin) to screen via:
  //   screen = ctr + (ellipseCentreOffset) + (p.x*ux + p.y*uy)*a-scale
  // orbitPos already has focus at origin and centre at (-a*e, 0). To centre the
  // ellipse in-frame we add +a*e along x before mapping.
  // map function applied inline.

  // ---------- comet phase (Kepler mean anomaly advances linearly in time) ----------
  float period = max(u_orbitPeriod, 4.0);
  float M = (t / period) * TAU; // mean anomaly, loops every period

  // current comet position (orbit-plane, focus at origin)
  vec2 op = orbitPos(M, e);
  // anti-sunward direction = away from focus (origin)
  vec2 antiSun = normalize(op + vec2(1e-4));
  // speed proxy: distance from focus controls Kepler speed (vis-viva). Near
  // perihelion r is small and the comet is fast -> long bright tail. Use 1/r.
  float r = length(op);
  float perihelion = a * (1.0 - e);
  float aphelion   = a * (1.0 + e);
  // normalized "whip" factor: 1 at perihelion, ~0 at aphelion
  float whip = clamp((aphelion - r) / max(aphelion - perihelion, 1e-3), 0.0, 1.0);

  // map an orbit-plane point to screen
  // (factored as a helper-like expression; centre the ellipse in frame)
  // screenOf(p) = ctr + ((p.x + a*e)*ux + p.y*uy)  where p is in a-units already
  // op is already in a-units (a=1 inside orbitPos), so multiply by a.
  vec2 cometScreen = ctr + ((op.x * a + a * e) * ux + (op.y * a) * uy);
  vec2 antiSunScreen = (antiSun.x * ux + antiSun.y * uy); // direction in screen

  // ============================================================
  // 1) STATIC STARFIELD — faint twinkling points, the only fast element
  // ============================================================
  {
    vec2 g = fc / (minRes * 0.05); // ~star cell grid
    vec2 cell = floor(g);
    vec2 f = fract(g);
    // one candidate star per cell
    float h = hash21(cell);
    if (h > 0.55) {
      vec2 starPos = vec2(hash21(cell + 3.1), hash21(cell + 7.7));
      float d = length((f - starPos));
      float bright = (h - 0.55) / 0.45;
      float tw = 0.6 + 0.4 * sin(t * (1.5 + h * 3.0) + h * 40.0); // twinkle
      float s = exp(-d * d * 240.0) * bright * tw;
      vec3 starCol = mix(vec3(0.7,0.78,1.0), c2, h);
      col += starCol * s * 0.5;
    }
  }

  // ============================================================
  // 2) DUST TRAIL — faint glow along the recently-travelled arc, decaying
  // ============================================================
  {
    float trailAmt = clamp(u_trail, 0.0, 1.0);
    // how far back along the orbit the trail persists, in mean-anomaly radians:
    // a short stub near trail=0, up to nearly a full orbit at trail=1. Both the
    // length AND the brightness grow with the param so the slider reads clearly.
    float trailSpan = mix(0.45, 1.9 * PI, trailAmt);
    vec3  tcol = vec3(0.0);
    for (int i = 0; i < TRAIL_N; i++) {
      float fi = float(i) / float(TRAIL_N - 1); // 0..1, 0 = nucleus
      float back = fi * trailSpan;              // mean-anomaly behind comet
      vec2 sp = orbitPos(M - back, e);
      vec2 scr = ctr + ((sp.x * a + a * e) * ux + (sp.y * a) * uy);
      float d = length(fc - scr);
      // Near perihelion the comet covers more arc per unit mean-anomaly, so
      // equal-M samples spread apart there; widen the splat by local speed
      // (∝ 1/r) so the ribbon stays continuous instead of dotting.
      float rs = length(sp);
      float speed = perihelion / max(rs, perihelion * 0.5); // ~1 far, >1 near peri
      float wpx = (3.0 + fi * 5.0) * (0.85 + 1.6 * (speed - 1.0)) * pr;
      wpx = max(wpx, 3.0 * pr);
      float seg = exp(-d * d / (wpx * wpx));
      // age decay: newer dust brighter; the ghost fades over the whole arc
      float decay = (1.0 - fi);
      decay = decay * decay;
      // dust hue: warm head drifting toward cool/violet with age
      tcol += mix(c0, c3, fi) * seg * decay;
    }
    // additive (no acc-normalize): brightness scales straight with persistence
    col += tcol * (0.25 + trailAmt * 1.15) * trailAmt;
  }

  // ============================================================
  // 3) ION TAIL — streams anti-sunward, length scales with whip + u_tail
  // ============================================================
  {
    float tailLenPx = max(u_tail, 1.0) * pr;
    // tail length shrinks to a stub at aphelion, full at perihelion
    float len = tailLenPx * mix(0.28, 1.0, whip);
    vec2 rel = fc - cometScreen;
    // project onto anti-sunward axis (along) and perpendicular (across)
    float along  = dot(rel, antiSunScreen);
    float across = dot(rel, vec2(-antiSunScreen.y, antiSunScreen.x));
    // only behind the nucleus (anti-sunward, along > 0)
    float s = clamp(along / len, 0.0, 1.0);
    // tail widens with distance (cone) and fades to nothing at the tip
    float halfW = (3.0 + s * 20.0) * pr;
    float profile = exp(-(across * across) / (halfW * halfW));
    // longitudinal falloff: bright near head, easing along the streak so the
    // full streamer (not just the root) carries brightness, then snuffing at
    // the tip via the gate below.
    float fall = mix(1.0, 0.30, s);
    float gate = step(0.0, along) * (1.0 - smoothstep(0.78, 1.0, s));
    float ion = profile * fall * gate;
    // ion tails read cool/blue; blend c2 (cyan) and c0 (blue)
    vec3 ionCol = mix(c2, c0, s);
    col += ionCol * ion * (0.6 + 0.9 * whip) * 1.1;

    // a second, slightly broader & dimmer dust-ion blend for body
    float halfW2 = (6.0 + s * 30.0) * pr;
    float profile2 = exp(-(across * across) / (halfW2 * halfW2));
    float ion2 = profile2 * fall * gate;
    col += mix(c2, c1, s) * ion2 * (0.20 + 0.32 * whip);
  }

  // ============================================================
  // 4) COMA + NUCLEUS — tight bright glow + sharp core
  // ============================================================
  {
    float d = length(fc - cometScreen);
    // coma: soft halo, a bit bigger & brighter near perihelion (sublimation)
    float comaR = (10.0 + 6.0 * whip) * pr;
    float coma = exp(-d * d / (comaR * comaR));
    vec3 comaCol = mix(c2, vec3(0.85, 0.92, 1.0), 0.4);
    col += comaCol * coma * (0.7 + 0.7 * whip);
    // nucleus: tight bright core
    float coreR = 2.2 * pr;
    float core = exp(-d * d / (coreR * coreR));
    col += vec3(1.0, 0.98, 0.95) * core * 1.4;
    // tiny outer bloom
    float bloomR = (26.0 + 14.0 * whip) * pr;
    col += comaCol * exp(-d * d / (bloomR * bloomR)) * 0.16 * (0.6 + whip);
  }

  // ---------- gentle vignette: keep edges of the void dark ----------
  float vign = 1.0 - smoothstep(0.55, 1.18, length((fc - ctr) / res) * 1.3);
  col *= mix(0.72, 1.0, vign);

  // subtle filmic-ish soft clip to avoid harsh blowout on the core
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
