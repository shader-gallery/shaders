// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// orrery (Trace) — six concentric, barely-etched orbit rings centred on the
// dark field, each carrying one small glowing body with a short arc of
// phosphor smear trailing behind it along its ring. Bodies revolve at
// clock-steady rates in the ratio 24:16:12:8:6:3 of one base rate
// (TAU / 192 s), so laps run 8 s on the innermost ring up to 64 s on the
// outermost and the whole system is one seamless 192-second loop. When the
// pair of bodies nearest to angular alignment drifts into conjunction a
// hair-thin radial resonance line fades up between their rings, flares
// gently, and fades away — one quiet periodic event at a time, never resets.
// The ring-radius budget is scaled to the viewport (outermost ring at 0.45 x
// the short side at the default gap) so the whole instrument always fits.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_orbitSpeed; // scales every body's angular rate together (default 1)
uniform float u_ringGap;    // ring spacing control, css-px flavoured but scaled to the viewport so the system fits (default 90)
uniform float u_flare;      // resonance-line intensity at conjunction, 0..2 (default 1)

const float TAU  = 6.28318530718;
const float BASE = 0.03272492347; // TAU / 192 — base angular rate (full loop 192 s)
const vec3  BG   = vec3(0.035, 0.035, 0.043); // house near-black floor

const float ORB_CORE   = 2.4;   // body core radius, css px (gaussian sigma)
const float ORB_HALO   = 13.0;  // body halo sigma cap, css px
const float TRAIL_LEN  = 120.0; // phosphor smear 1/e arc-length cap, css px
const float TRAIL_W    = 2.6;   // smear radial sigma, css px
const float ETCH_W     = 1.0;   // etched-ring half width, css px
const float LINE_W     = 1.0;   // resonance line sigma, css px
const float ALIGN_WIN  = 0.22;  // rad — narrow window so conjunctions are events

// per-ring angular-rate multipliers (integers -> commensurate -> seamless loop)
float ringK(int i) {
  if (i == 0) return 24.0;  // 8 s lap
  if (i == 1) return 16.0;  // 12 s
  if (i == 2) return 12.0;  // 16 s
  if (i == 3) return  8.0;  // 24 s
  if (i == 4) return  6.0;  // 32 s
  return 3.0;               // 64 s
}

// starting phases, staggered around the dial so sampled moments distribute
// bodies across the whole field; rings 1 & 4 meet down-right at t = 9 s at
// default speed (the curated conjunction)
float ringPhase(int i) {
  if (i == 0) return 2.4000;
  if (i == 1) return 0.8708;
  if (i == 2) return 4.8000;
  if (i == 3) return 0.3000;
  if (i == 4) return 3.8161;
  return 5.7200;
}

vec3 ringColor(int i, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  if (i == 0) return c0;
  if (i == 1) return c1;
  if (i == 2) return c2;
  if (i == 3) return c3;
  if (i == 4) return mix(c2, c0, 0.45);
  return mix(c1, c3, 0.50);
}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

void main() {
  float pr  = max(u_pixelRatio, 1e-3);
  vec2  p   = (gl_FragCoord.xy - 0.5 * u_resolution) / pr; // css px, centred
  float rad = length(p);
  float fa  = atan(p.y, p.x);

  // ring-radius budget scaled to the viewport: at the default gap (90) the
  // outermost ring sits at 0.45 * the short viewport side, so all six rings
  // and the 64-second body are always inside the frame
  float minRes = max(min(u_resolution.x, u_resolution.y) / pr, 1.0); // css px
  float gap    = max(u_ringGap, 8.0) * (0.45 * minRes / 540.0);
  float speed  = u_orbitSpeed;
  float halo   = min(ORB_HALO, 0.42 * gap); // keep halos inside tight nests

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 glow = vec3(0.0);

  // central pivot — small dim hub the whole instrument turns around
  vec3 hub = mix(c0, c1, 0.55);
  glow += hub * (0.55 * exp(-rad * rad / 50.0) + 0.05 * exp(-rad / 30.0));

  // ---- rings, bodies, phosphor smears -----------------------------------
  for (int i = 0; i < 6; i++) {
    float r   = (1.0 + float(i)) * gap;
    float ang = ringPhase(i) + mod(ringK(i) * BASE * speed * u_time, TAU);
    vec3  col = ringColor(i, c0, c1, c2, c3);

    // barely-there etched circle
    float dr   = rad - r;
    float adr  = abs(dr);
    float etch = smoothstep(ETCH_W + 0.9, ETCH_W - 0.4, adr);
    glow += mix(col, vec3(0.55, 0.60, 0.72), 0.45) * etch * 0.065;

    // body: soft additive orb with a hot pinpoint heart
    vec2  b = r * vec2(cos(ang), sin(ang));
    float d = length(p - b);
    glow += col * 1.50 * exp(-d * d / (2.0 * ORB_CORE * ORB_CORE));
    glow += col * 0.50 * exp(-d * d / (2.0 * halo * halo));
    glow += vec3(0.60)  * exp(-d * d / (2.0 * 1.1 * 1.1));

    // phosphor smear: short arc trailing behind along the ring. The 1/e
    // length is capped per-ring to a fraction of the circumference and the
    // wrap-around floor exp(-circ/len) is subtracted, so the smear dies out
    // fully before wrapping back to the body — no lit full circle on the
    // inner rings, just a comet tail.
    float behind = mod(ang - fa, TAU);          // rad behind the body
    float s      = behind * r;                  // arc length behind, css px
    float circ   = TAU * r;
    float tl     = min(TRAIL_LEN, 0.22 * circ);
    float wrapF  = exp(-circ / tl);
    float fade   = max(exp(-s / tl) - wrapF, 0.0) / (1.0 - wrapF);
    float radial = exp(-dr * dr / (2.0 * TRAIL_W * TRAIL_W));
    glow += col * radial * fade * 0.80;
  }

  // ---- resonance line: only the single pair nearest conjunction ----------
  // pass 1: find the pair with the smallest angular separation (and the
  // runner-up separation, used to fade the line before the lead changes
  // hands so the chord never pops between pairs)
  float bestD = 1e9, secondD = 1e9;
  float bRi = gap, bRj = 2.0 * gap, bAi = 0.0, bAj = 0.0;
  vec3  bCi = c0, bCj = c1;
  for (int i = 0; i < 6; i++) {
    for (int j = 0; j < 6; j++) {
      if (j <= i) continue;
      float ai = ringPhase(i) + mod(ringK(i) * BASE * speed * u_time, TAU);
      float aj = ringPhase(j) + mod(ringK(j) * BASE * speed * u_time, TAU);
      float dA = atan(sin(aj - ai), cos(aj - ai)); // signed shortest diff
      float d  = abs(dA);
      if (d < bestD) {
        secondD = bestD;
        bestD   = d;
        bRi = (1.0 + float(i)) * gap;
        bRj = (1.0 + float(j)) * gap;
        bAi = ai;
        bAj = aj;
        bCi = ringColor(i, c0, c1, c2, c3);
        bCj = ringColor(j, c0, c1, c2, c3);
      } else if (d < secondD) {
        secondD = d;
      }
    }
  }

  float aWin  = max(0.0, 1.0 - bestD / ALIGN_WIN);
  float align = aWin * aWin * aWin;              // slow fade-up, gentle flare
  // fade out while a rival pair is about to become the nearest (no popping)
  float dom = smoothstep(0.0, 0.06, secondD - bestD);
  // both endpoints must actually be on screen — no chords to invisible bodies
  vec2 he = 0.5 * u_resolution / pr;             // css half-extents
  vec2 bi = bRi * vec2(cos(bAi), sin(bAi));
  vec2 bj = bRj * vec2(cos(bAj), sin(bAj));
  vec2 qi = he - abs(bi);
  vec2 qj = he - abs(bj);
  float vis = smoothstep(-16.0, 16.0, min(qi.x, qi.y))
            * smoothstep(-16.0, 16.0, min(qj.x, qj.y));
  float gate = align * dom * vis;
  if (gate > 0.002) {
    float dA  = atan(sin(bAj - bAi), cos(bAj - bAi));
    float aL  = bAi + 0.5 * dA;                  // chord angle (midpoint)
    vec2  dir = vec2(cos(aL), sin(aL));
    float along = dot(p, dir);
    float perp  = abs(dot(p, vec2(-dir.y, dir.x)));
    float seg = smoothstep(bRi - 4.0, bRi + 9.0, along)
              * (1.0 - smoothstep(bRj - 9.0, bRj + 4.0, along));
    float thin = exp(-perp * perp / (2.0 * LINE_W * LINE_W));
    float wide = exp(-perp * perp / (2.0 * 12.0 * 12.0));
    vec3  lc = mix(bCi, bCj, smoothstep(bRi, bRj, along));
    glow += lc * seg * gate * u_flare * (1.6 * thin + 0.70 * wide * align);
    // gentle conjunction bloom around the two aligning bodies
    float di = length(p - bi);
    float dj = length(p - bj);
    glow += bCi * align * gate * u_flare * 0.80 * exp(-di * di / 480.0);
    glow += bCj * align * gate * u_flare * 0.80 * exp(-dj * dj / 480.0);
  }

  // soft-knee tonemap on the additive light, over the near-black floor
  glow = 1.0 - exp(-glow);
  vec3 colr = BG + glow;

  // gentle vignette keyed to the frame, not the rings
  float vd = length(p / (0.5 * u_resolution / pr));
  colr *= 1.0 - 0.30 * smoothstep(0.62, 1.30, vd);

  // dither to keep the long gaussian falloffs band-free
  colr += (hash21(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(colr, 1.0);
}
