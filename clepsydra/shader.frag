// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// clepsydra (Trace) — a water clock rendered in light. From a spout near the top
// a single glowing drop detaches on an exact beat and falls with gravity easing
// into a wide etched vessel at the bottom. The pool of soft luminous fill carries
// a gentle surface wave and flashes an expanding splash ring at each impact; the
// level climbs drop by drop, then a siphon phase draws it smoothly down to nearly
// empty — the drain itself is the chime. Drops take the brightest palette colour,
// the pool blends the cooler ones, splash rings flash the accent.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_dropRate;    // drops per second                 (default 1)
uniform float u_fillPeriod;  // seconds per rise-and-siphon cycle (default 24)
uniform float u_vessel;      // vessel width in css px            (default 380)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float SPOUT_Y   = 0.86;  // spout height in 0..1 frame space (near top)
const float FLOOR_Y   = 0.14;  // vessel inner-floor height in 0..1 frame space
const float TWO_PI    = 6.2831853;

// smooth single-bump pulse, peaks at x=0, ~0 outside [-1,1]
float bump(float x) { return exp(-x * x); }

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalize to a height-based space so aspect doesn't distort drop physics
  vec2  uv  = fc / res.y;          // y in 0..1, x in 0..aspect
  float asp = res.x / res.y;
  float cx  = asp * 0.5;           // horizontal centre

  vec3 col = BG;

  // --- palette with house fallback (headless can leave the array zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // brightest entry for drops, cool blend for the pool, accent for splash rings
  float lum0 = dot(c0, vec3(0.299,0.587,0.114));
  float lum2 = dot(c2, vec3(0.299,0.587,0.114));
  vec3  dropCol  = (lum0 >= lum2) ? c0 : c2;     // the brighter cool hue
  vec3  poolCol  = mix(c0, c2, 0.5);              // cooler blend
  vec3  splashCol = c3;                           // accent

  // ---- timekeeping ----
  float rate   = max(u_dropRate, 0.05);           // guard against 0
  float period = max(u_fillPeriod, 4.0);          // guard
  // ---- fill level: long triangle rise then a fast siphon draw-down ----
  // cyclePh 0..1 over the fill period; rise occupies most of it, siphon the tail.
  float cyclePh = fract(t / period);
  const float SIPHON_FRAC = 0.16;                 // fraction of cycle spent draining
  float riseEnd  = 1.0 - SIPHON_FRAC;
  float fillNorm; // 0 (empty) .. 1 (full), continuous & loop-closing
  if (cyclePh < riseEnd) {
    // gentle accelerating-then-settling rise (smoothstep eases both ends)
    fillNorm = smoothstep(0.0, 1.0, cyclePh / riseEnd);
  } else {
    // smooth siphon: full -> nearly empty
    float s = (cyclePh - riseEnd) / SIPHON_FRAC;
    fillNorm = 1.0 - smoothstep(0.0, 1.0, s);
  }
  // siphon "chime" envelope: bright while draining, used to flare the surface
  float draining = (cyclePh >= riseEnd) ? 1.0 : 0.0;
  float siphonGlow = draining * sin(min((cyclePh - riseEnd) / SIPHON_FRAC, 1.0) * 3.14159);

  // ---- geometry: vessel band ----
  float vesselW   = (u_vessel * pr) / res.y;      // half-handled below; in y-units
  float halfW     = vesselW * 0.5;
  float wallX     = halfW;                         // |x-cx| < wallX is inside
  float minLevel  = FLOOR_Y + 0.015;              // nearly-empty resting level
  float maxLevel  = mix(FLOOR_Y + 0.04, SPOUT_Y - 0.10, 0.55); // generous full line
  float surfaceY  = mix(minLevel, maxLevel, fillNorm);

  float xr = uv.x - cx;                            // horizontal offset from centre
  float absXR = abs(xr);
  float aa = 1.5 / res.y;                          // ~1.5px antialias in y-units

  // ---- etched vessel outline (faint strokes): floor + two slightly flared walls
  float flare = 0.06 * (uv.y - FLOOR_Y);          // walls splay out slightly upward
  float wallAt = wallX + max(flare, 0.0);
  // left & right wall strokes (only above the floor, up to the rim)
  float rimY   = maxLevel + 0.06;
  float inBand = step(FLOOR_Y - 0.02, uv.y) * step(uv.y, rimY);
  float wallStroke = (1.0 - smoothstep(0.0, aa*2.2, abs(absXR - wallAt))) * inBand;
  // floor stroke
  float floorStroke = (1.0 - smoothstep(0.0, aa*2.2, abs(uv.y - FLOOR_Y)))
                      * step(absXR, wallAt + aa*3.0);
  float etch = max(wallStroke, floorStroke);
  // etched glass vessel — brighter so the vessel reads as struck crystal
  col += mix(poolCol, vec3(0.6,0.7,0.9), 0.3) * etch * 0.32;

  // ---- luminous pool fill ----
  float insideX = 1.0 - smoothstep(wallAt - aa, wallAt + aa, absXR); // 1 inside walls
  // gentle surface wave: small ripple on the water line. A busier trickle (higher
  // DROP_RATE) agitates the pool more, so the ripple amplitude and choppiness grow
  // with the rate — a calm sheet at slow settings, a lively chop when it glitters.
  float agit = mix(0.55, 1.7, clamp((rate - 0.3) / 2.7, 0.0, 1.0));
  float wavePhase = xr / max(halfW, 1e-3) * (2.4 + agit * 1.6);
  float surfWave = (0.006 * sin(wavePhase + t * 1.7)
                 +  0.004 * sin(wavePhase * 2.3 - t * 1.1)) * agit
                 +  0.003 * agit * sin(wavePhase * 4.1 + t * 2.6);
  float localSurf = surfaceY + surfWave;
  // body of water: below the wavy surface, above the floor
  float belowSurf = smoothstep(localSurf + aa, localSurf - aa*1.5, uv.y);
  float aboveFloor = smoothstep(FLOOR_Y - aa, FLOOR_Y + aa, uv.y);
  float water = insideX * belowSurf * aboveFloor;
  // depth gradient: brighter near the surface, dimmer at the bottom. A faster
  // trickle keeps the pool more energized/luminous; a slow clock lets it settle
  // darker between drops — another face of DROP_RATE across the whole pool body.
  float depth = clamp((uv.y - FLOOR_Y) / max(localSurf - FLOOR_Y, 1e-3), 0.0, 1.0);
  float energy = mix(0.78, 1.35, clamp((rate - 0.3) / 2.7, 0.0, 1.0));
  float poolBright = mix(0.30, 0.88, depth) * energy;
  col += poolCol * water * poolBright;
  // caustic shimmer threading the water body — slow refracted light bands so the
  // pool reads as living water with detail, not a flat luminous block
  float caus = 0.5 + 0.5 * sin(xr / max(halfW,1e-3) * 9.0 + t * 0.9 + depth * 6.0);
  caus *= 0.5 + 0.5 * sin(uv.y * 70.0 - t * 1.3);
  col += mix(poolCol, dropCol, 0.3) * water * pow(caus, 2.0) * 0.14 * (0.4 + depth);
  // luminous surface line (meniscus) catches the most light
  float meniscus = (1.0 - smoothstep(0.0, aa*3.0, abs(uv.y - localSurf))) * insideX;
  col += mix(poolCol, dropCol, 0.4) * meniscus * (0.7 + 0.5 * siphonGlow);
  // siphon flare: whole pool glows brighter as it drains (the chime)
  col += poolCol * water * siphonGlow * 0.5;

  // ---- falling drops (a fixed bank of recent drops, loop bound is const) ----
  // Each drop falls over a FIXED wall-clock span, so a faster DROP_RATE packs more
  // drops into the column at once (a glittering trickle) while a slow rate leaves
  // long dark pauses with at most one drop aloft — that's the param's visible face.
  const float FALL_SECS = 1.05;                   // seconds a drop takes to fall
  const int   MAX_DROPS = 4;                      // most drops drawn at once (const)
  float fallTop = SPOUT_Y;
  float fallBot = localSurf + 0.012;              // lands at the (current) surface
  float dropR   = 0.012;
  float spacing = 1.0 / rate;                     // seconds between emissions
  float lastIdx = floor(t / spacing);             // most recent emitted drop index

  float dropAccum = 0.0;   // additive drop+tail glow
  float impact    = 0.0;   // strongest active impact (drives splash)
  float impactX   = cx;    // x of that impact
  float formedTop = 0.0;   // is a drop currently forming at the spout?

  for (int k = 0; k < MAX_DROPS; k++) {
    float idx   = lastIdx - float(k);             // this drop's emission index
    float tEmit = idx * spacing;                  // when it detached
    float fp    = (t - tEmit) / FALL_SECS;        // fall phase 0..1 (1 = landed)
    if (fp < 0.0 || fp > 1.15) continue;          // not in flight / long gone

    float kf    = clamp(fp, 0.0, 1.0);
    float dy    = mix(fallTop, fallBot, kf * kf); // gravity easing
    float formed = smoothstep(0.0, 0.07, fp);     // forms at the spout
    float dx    = cx + 0.004 * sin(idx * 1.7);    // faint per-drop sway
    // fade the drop out just before the surface so impact reads as a splash
    float nearSurf = smoothstep(0.0, 0.035, dy - localSurf);

    vec2  dp    = vec2(uv.x - dx, uv.y - dy);
    dp.y       /= (1.0 + kf * 0.6);               // teardrop stretch
    float drop  = bump(length(dp) / dropR) * formed * nearSurf;
    dropAccum  += drop * 1.25;

    // short comet tail above the drop only
    float above  = max(0.0, uv.y - dy);
    float tailLen = 0.04 * (1.0 + kf * 1.5);
    dropAccum   += step(dy, uv.y) * exp(-above / tailLen)
                 * bump((uv.x - dx) / (dropR * 0.7)) * formed * nearSurf * 0.16;

    // track the freshest impact (drop reaching surface) for the splash event
    float imp = smoothstep(0.80, 1.0, fp);
    if (imp > impact) { impact = imp; impactX = dx; }
    // is this drop still forming at the spout?
    formedTop = max(formedTop, 1.0 - formed);
  }
  col += dropCol * dropAccum;

  // spout fixture: a faint emitter point at the top centre, glows as a drop forms
  float spout = bump(length(vec2(uv.x - cx, uv.y - SPOUT_Y)) / 0.014);
  col += dropCol * spout * (0.25 + 0.35 * formedTop);

  // ---- splash ring + crown at the freshest impact ----
  float ringAge = clamp((impact - 0.05) / 0.95, 0.0, 1.0);
  float ringR   = ringAge * (halfW * 0.7);        // expanding radius
  float distOnSurf = abs(abs(uv.x - impactX) - ringR);
  float onSurfBand = 1.0 - smoothstep(0.0, aa*3.0, abs(uv.y - localSurf));
  float ring = (1.0 - smoothstep(0.0, aa*4.0, distOnSurf)) * onSurfBand;
  float ringFade = (1.0 - ringAge);               // fades as it expands
  col += splashCol * ring * impact * ringFade * insideX * 1.1;
  // a small upward splash crown right at impact x
  float crown = bump((uv.x - impactX) / 0.02)
              * smoothstep(0.0, 0.05, uv.y - localSurf)
              * (1.0 - smoothstep(0.05, 0.11, uv.y - localSurf));
  col += splashCol * crown * impact * 0.6;

  // ---- soft ambient glow above the pool surface (phosphor haze) ----
  float haze = insideX * smoothstep(localSurf + 0.18, localSurf, uv.y)
             * smoothstep(FLOOR_Y - 0.05, localSurf, uv.y);
  col += poolCol * haze * 0.05;

  // ---- composed vignette ----
  vec2 vc = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.34, 0.95, length(vec2(vc.x, vc.y * 1.1)));
  col *= mix(0.72, 1.0, vign);

  // gentle tone curve to tame any hot spots without greying the base
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
