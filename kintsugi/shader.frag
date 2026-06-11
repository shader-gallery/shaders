// kintsugi (Burnish) — a near-black porcelain field with the faintest glaze
// sheen, repaired in real time. Five sparse, hand-drawn fissures (noise-
// displaced polylines, at most one fork each) live out staggered lifecycles:
// a fresh fissure shows first as a hair of deeper black edged with a whisper
// of cool glaze light; gold wells up
// through it from below, the whole seam brightening IN PLACE from deep ember
// to liquid gold; the mended seam settles into a quiet warm gleam, hue eased
// through the palette's warm colours along its length, mellows for a long
// while, then fades and yields its place to a new break elsewhere. Nothing
// ever travels along a line — settled gold carries only a faint simmering
// shimmer, and each cycle's geometry is rehashed while the seam is invisible,
// so the drawing rewrites itself with no visible reset.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cyclePeriod; // seconds per seam break-flood-settle-fade lifecycle (default 30)
uniform float u_seam;        // seam width in css px, scaled by u_pixelRatio   (default 2.5)
uniform float u_shimmer;     // simmer intensity on settled gold, 0 = steady   (default 0.8)

const int   SEAMS = 5;                            // sparse population, constant
const vec3  BG    = vec3(0.035, 0.035, 0.043);    // near-black porcelain
const vec3  GOLD  = vec3(1.00, 0.78, 0.34);       // liquid-gold core hue

// ---- hashes / noise -------------------------------------------------------
float hash11(float x) { return fract(sin(x * 127.1) * 43758.5453123); }

float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 q = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// hand-drawn wander of a fissure: 3 octaves of 1D value noise, centred
float crackDisp(float t, float seed) {
  return (vnoise1(t * 3.0  + seed)              - 0.5)
       + (vnoise1(t * 7.0  + seed * 1.7 + 13.1) - 0.5) * 0.45
       + (vnoise1(t * 15.0 + seed * 2.3 + 37.7) - 0.5) * 0.20;
}

// ---- stroke field ----------------------------------------------------------
// distance field of one noise-displaced polyline; returns
// (core, halo, along, rim) — rim is a narrow gaussian for fresh-break edge light
vec4 stroke(vec2 p, vec2 A, vec2 dirv, float len, float amp, float seed,
            float wHalfPx, float aa, float resy) {
  vec2  perp = vec2(-dirv.y, dirv.x);
  vec2  rel  = p - A;
  float L    = max(len, 1e-4);
  float t    = dot(rel, dirv) / L;
  float tc   = clamp(t, 0.0, 1.0);
  float d    = dot(rel, perp);
  float w    = crackDisp(tc, seed) * amp;
  float dd   = d - w;
  float over = max(abs(t - 0.5) - 0.5, 0.0) * L;     // beyond the tips
  float dpx  = length(vec2(dd, over)) * resy;        // device px to the curve
  // tips converge to points; width breathes a little along the length
  float taper = sqrt(smoothstep(0.0, 0.09, tc) * smoothstep(1.0, 0.91, tc));
  float wvar  = 0.65 + 0.50 * vnoise1(tc * 9.0 + seed * 3.1);
  float wEff  = wHalfPx * taper * wvar;
  float core  = (1.0 - smoothstep(wEff - aa, wEff + aa, dpx))
              * smoothstep(0.0, 0.02, taper);
  float glowR = wHalfPx * 6.0 + 5.0 * aa;
  // glow ends fall off RADIALLY: dpx already caps the beyond-tip distance, and
  // the end ease works over the glow's own radius (in device px) — never a
  // straight constant-t cut, so wide halos keep rounded ends at u_seam max
  float tipPx = max(0.5 - abs(t - 0.5), 0.0) * L * resy; // inside dist to nearer tip
  float ends  = smoothstep(0.0, glowR * 1.6, tipPx + glowR * 0.45);
  float halo  = exp(-(dpx * dpx) / (glowR * glowR)) * ends;
  // narrow rim hugging the line (small radius, so taper can't cut visibly)
  float rimR  = wHalfPx * 2.0 + 2.5 * aa;
  float rim   = exp(-(dpx * dpx) / (rimR * rimR)) * taper;
  return vec4(core, halo, tc, rim);
}

// ---- palette helpers -------------------------------------------------------
// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// strongly favour warm palette entries — cool ones barely tint the gold
float warmth(vec3 c) {
  float w = max(c.r - c.b, 0.0);
  return 0.05 + w * w * 2.5 + c.g * 0.06;
}

// favour cool palette entries — the porcelain edge-light of a fresh break
float coolth(vec3 c) {
  float w = max(c.b - c.r, 0.0);
  return 0.05 + w * w * 2.5 + c.g * 0.04;
}

// hue eased through the palette's warm colours along the seam's length
vec3 tintAlong(float s, float hseed, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float wheel = fract(hseed + s * 0.45) * 4.0;
  float w0 = (wheelW(wheel, 0.0) + 0.30) * warmth(c0);
  float w1 = (wheelW(wheel, 1.0) + 0.30) * warmth(c1);
  float w2 = (wheelW(wheel, 2.0) + 0.30) * warmth(c2);
  float w3 = (wheelW(wheel, 3.0) + 0.30) * warmth(c3);
  vec3 t = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
  return t / max(max(t.r, max(t.g, t.b)), 0.25);
}

void main() {
  float pr     = max(u_pixelRatio, 0.5);
  vec2  fc     = gl_FragCoord.xy;
  vec2  res    = u_resolution;
  float aspect = res.x / max(res.y, 1.0);
  vec2  uv     = (fc - 0.5 * res) / max(res.y, 1.0);

  // theme palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float P       = max(u_cyclePeriod, 1.0);          // lifecycle seconds
  float wHalfPx = max(u_seam, 0.15) * pr * 0.5;     // css px -> device px
  float aa      = max(pr * 0.7, 0.75);

  // faint cool porcelain tint for the fresh-break rim (coolest palette entries,
  // anchored to a blue-white so all-warm themes still read as glaze light)
  float k0 = coolth(c0), k1 = coolth(c1), k2 = coolth(c2), k3 = coolth(c3);
  vec3 coolC = (c0 * k0 + c1 * k1 + c2 * k2 + c3 * k3) / (k0 + k1 + k2 + k3);
  coolC = mix(vec3(0.62, 0.72, 0.92),
              coolC / max(max(coolC.r, max(coolC.g, coolC.b)), 0.25), 0.5);

  vec3  acc     = vec3(0.0);   // gold light
  float darkAcc = 0.0;         // fresh-fissure deeper black

  for (int k = 0; k < SEAMS; k++) {
    float fk  = float(k);
    // hash-staggered schedule: even offsets keep the population constant
    float off = fk / float(SEAMS) + hash11(fk * 3.7 + 0.13) * 0.05;
    float tt  = u_time / P + off;
    float u   = fract(tt);          // lifecycle phase 0..1
    float cyc = floor(tt);          // geometry rehashes every cycle, unseen
    float seed = fk * 19.19 + cyc * 7.7 + 3.1;

    vec2 h1 = hash22(vec2(seed, seed + 1.3));
    vec2 h2 = hash22(vec2(seed + 2.6, seed + 4.9));

    // composed placement: five anchor slots whose y values land evenly on
    // {-0.4,-0.2,0,0.2,0.4} so the schedule visits the bottom quarter too,
    // plus per-cycle jitter
    vec2 anchor = vec2(fract(fk * 0.618 + 0.19) - 0.5,
                       fract(fk * 0.6   + 0.3 ) - 0.5);
    vec2 center = anchor * vec2(aspect * 0.62, 0.85)
                + (h1 - 0.5) * vec2(aspect * 0.34, 0.26);
    float ang  = h2.x * 6.28318530718;
    float len  = 0.34 + 0.42 * h2.y;
    vec2  dirv = vec2(cos(ang), sin(ang));
    vec2  A    = center - dirv * (len * 0.5);
    float amp  = (0.030 + 0.030 * hash11(seed + 3.3)) * (len / 0.5);

    // lifecycle envelopes — every brightening happens in place
    float wScale  = mix(0.40, 1.0, smoothstep(0.08, 0.32, u)); // hair -> channel
    float goldEnv = smoothstep(0.10, 0.36, u);                 // gold wells up
    float heat    = smoothstep(0.14, 0.46, u);                 // ember -> gold
    // settled gleam mellows; high shimmer keeps mended lines quietly molten
    float mellow  = mix(1.0, 0.55 + 0.15 * min(u_shimmer, 2.5),
                        smoothstep(0.46, 0.86, u));
    float fade    = 1.0 - smoothstep(0.88, 0.985, u);          // yields its place
    float settle  = smoothstep(0.36, 0.50, u);                 // shimmer gate
    float darkEnv = smoothstep(0.0, 0.05, u)
                  * (1.0 - smoothstep(0.10, 0.24, u));         // hair of deeper black

    float wpx = wHalfPx * wScale;
    vec4 sm = stroke(uv, A, dirv, len, amp, seed, wpx, aa, res.y);

    // at most one fork, hashed per cycle; joined at a point — no junction pool
    float fGate = step(hash11(seed + 11.1), 0.55);
    float tf    = 0.30 + 0.40 * hash11(seed + 12.3);
    vec2  perp  = vec2(-dirv.y, dirv.x);
    vec2  Q     = A + dirv * (tf * len) + perp * (crackDisp(tf, seed) * amp);
    float fside = hash11(seed + 14.9) < 0.5 ? -1.0 : 1.0;
    float fang  = ang + fside * (0.55 + 0.55 * hash11(seed + 13.7));
    vec2  fdir  = vec2(cos(fang), sin(fang));
    float flen  = len * (0.25 + 0.28 * hash11(seed + 15.3));
    vec4 sf = stroke(uv, Q, fdir, flen, amp * 0.55, seed + 21.7,
                     wpx * 0.75, aa, res.y) * vec4(fGate, fGate, 1.0, fGate);

    float core = max(sm.x, sf.x);
    float halo = max(sm.y, sf.y);
    // along-position for hue/shimmer; fork continues the hue from its joint
    float wsel = step(sm.x + sm.y * 0.3, (sf.x + sf.y * 0.3) * fGate);
    float sPos = mix(sm.z, clamp(tf + sf.z * 0.35, 0.0, 1.0), wsel);

    vec3 tintN = tintAlong(sPos, hash11(seed + 8.8), c0, c1, c2, c3);
    vec3 goldC = mix(GOLD, tintN, 0.45);
    vec3 ember = vec3(0.36, 0.085, 0.025) + tintN * 0.08;
    vec3 seamC = mix(ember, goldC, heat);

    // faint simmer on settled gold — two-scale flicker in place, never a pulse;
    // the high-frequency term backs off as shimmer rises and the response
    // saturates softly, so hot settings stay quietly molten instead of
    // breaking into chains of discrete beads
    float sn   = vnoise2(vec2(sPos * 8.0 + seed * 0.31,
                              u_time * 1.6 + seed * 0.77));
    float sn2  = vnoise2(vec2(sPos * 24.0 + seed * 0.53,
                              u_time * 2.4 + seed * 1.21));
    float hiAmp = 0.6 / (1.0 + 0.55 * u_shimmer);
    float raw   = u_shimmer * settle
                * ((sn - 0.5) * 0.9 + (sn2 - 0.5) * hiAmp);
    float shim  = 1.0 + raw / (1.0 + 0.8 * abs(raw));
    shim = max(shim, 0.42);   // never let a mended line visually break apart

    float bright = goldEnv * mellow * fade * shim;
    // molten lines bleed extra glow as shimmer rises
    float haloW  = 0.3 + 0.20 * u_shimmer * settle;
    acc     += seamC * (core * 1.2 + halo * haloW) * bright;
    // fresh break: deeper-black hair plus a faint cool glaze rim so the stage
    // reads as an intentional event, not a stray scratch
    float rim = max(sm.w * (1.0 - sm.x), sf.w * (1.0 - sf.x));
    acc     += coolC * rim * darkEnv * 0.085;
    darkAcc += core * darkEnv;
  }

  // porcelain: static micro-mottle + a sweeping glaze sheen (a narrow lobe and
  // a broad cross lobe), kept just bright enough that a fresh hairline break
  // reads as deeper black anywhere on the field
  float mot = (vnoise2(uv * 3.1 + 7.7) - 0.5) * 0.016
            + (vnoise2(uv * 12.0 + 3.3) - 0.5) * 0.007;
  vec2  sd   = normalize(vec2(0.80, 0.55));
  float bd   = (dot(uv, sd) - 0.75 * sin(u_time * 0.11 + 1.3)) / 0.32;
  float bd2  = (dot(uv, vec2(-sd.y, sd.x)) + 0.55 * sin(u_time * 0.073 - 0.6)) / 0.60;
  vec3  stnt = c0 * 0.55 + c1 * 0.45;
  stnt = mix(vec3(1.0), stnt / max(max(stnt.r, max(stnt.g, stnt.b)), 0.25), 0.6);
  vec3  sheen = stnt * (exp(-bd * bd) * 0.030 + exp(-bd2 * bd2) * 0.013);

  vec3  base  = BG + vec3(mot) + sheen;
  float darkM = clamp(darkAcc, 0.0, 1.0);
  vec3  lit   = 1.0 - exp(-acc * 1.5);            // soft knee, no blowout
  float vig   = 1.0 - 0.26 * smoothstep(0.50, 1.10, length(uv));
  vec3  col   = (base * (1.0 - 0.80 * darkM) + lit) * vig;
  col += (hash12(fc) - 0.5) * (1.5 / 255.0);      // dither against banding

  gl_FragColor = vec4(col, 1.0);
}
