// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// gloaming (Abyss) — a whole-frame time-of-day colour journey. A warm-to-indigo
// horizon glow occupies the lower frame, softened by a whisper of FBM haze,
// beneath a sky that runs from deep blue to near-black overhead. As the horizon
// light sinks and cools, fixed stars blink on one by one at hashed moments —
// each appearing with a small soft bloom and settling to a steady point — until
// full night holds; then a faint dawn tint rises and gently rinses the stars
// away. The entire frame rides one imperceptibly slow closed colour cycle:
// dusk -> night -> pre-dawn -> rinse -> back to dusk, phase-continuous so no
// frame is a boundary. Nothing translates; all motion is luminance and hue.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cyclePeriod;   // seconds per full dusk-to-dusk cycle  (default 150)
uniform float u_glowHeight;    // horizon glow band height, css px      (default 230)
uniform float u_glowIntensity; // horizon glow brightness, 0..2         (default 1)
uniform float u_starDensity;   // fraction of stars that blink on       (default 0.7)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float STAR_CELL_CSS = 38.0;  // css px per star cell (one star candidate each)
const float TWINKLE_HZ    = 0.9;   // twinkle speed (the only fast element)
// the cycle begins partway down the dusk->night descent so the scene reads as an
// evening already in progress (and so even a slow cycle shows visible change).
const float PHASE_OFFSET  = 0.32;

// ---- hashing (no textures; deterministic per-cell randomness) ----
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y * 95.4307);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 11.7));
}

// value noise + small FBM for the horizon haze
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
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    p = p * 2.03 + vec2(7.3, 1.1);
    amp *= 0.5;
  }
  return s;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized vertical: 0 at bottom (horizon), 1 at top (overhead)
  float y  = fc.y / max(res.y, 1.0);
  vec2  uv = fc / max(res.y, 1.0);  // aspect-correct coords (y-normalized)

  // ---- the one slow closed cycle, phase in [0,1) ----
  // guard period so the min slider value never divides by zero
  float period = max(u_cyclePeriod, 1.0);
  float phase  = fract(t / period + PHASE_OFFSET);
  float ang    = phase * 6.2831853;
  // dayCurve: 1 = full dusk/horizon-lit, 0 = full night. Cosine => phase-
  // continuous (no boundary frame). Peak light at phase 0 / trough at 0.5.
  float dayCurve = 0.5 + 0.5 * cos(ang);
  // dawnSide separates the two halves of the cycle: ~0 during the post-dusk
  // descent (phase 0..0.5), ~1 during the pre-dawn ascent (phase 0.5..1) when
  // the dawn tint rises and rinses the stars away.
  float dawnSide = 0.5 - 0.5 * sin(ang); // 0 at post-dusk, 1 at pre-dawn rinse

  // ---- palette with house fallback ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // role the palette into the scene:
  //   warm   = warm horizon at dusk            -> c3 (house red/amber accent)
  //   cool   = cool indigo horizon at deep dusk-> c1 (violet)
  //   skyHi  = overhead deep blue              -> c0
  //   star   = star/dawn tint                  -> c2 (cyan, brightest accent)
  vec3 warm  = c3;
  vec3 cool  = c1;
  vec3 skyHi = c0;
  vec3 star  = c2;

  // =========================================================
  // 1. SKY GRADIENT — deep blue near horizon to near-black overhead
  // =========================================================
  // base vertical gradient: a touch of skyHi low down, fading to BG up top
  float skyGrad = exp(-y * 2.4);                 // strongest at horizon
  vec3  sky = BG + skyHi * skyGrad * 0.11 * (0.30 + 0.70 * dayCurve);

  // =========================================================
  // 2. HORIZON LANDSCAPE — a low rolling hill silhouette across the bottom third.
  // Computed BEFORE the glow so the glow band can sit just above the ridge. This
  // anchors the frame as a real twilight scene (rule-of-thirds horizon) and
  // separates gloaming hard from starfall's uniform dot-field.
  // =========================================================
  // ridge line height (y-normalized), gently rolling via low-freq FBM.
  float ridge = 0.10
    + 0.050 * fbm(vec2(uv.x * 1.7 + 4.0, 2.0))
    + 0.024 * fbm(vec2(uv.x * 4.3 - 1.0, 9.0));
  // a second, nearer hill mass for depth on the left third
  float ridge2 = 0.06 + 0.07 * fbm(vec2(uv.x * 1.1 - 2.0, 21.0));
  float hill = max(ridge, ridge2 * smoothstep(0.55, -0.1, uv.x)); // nearer mass left
  float ax   = 1.2 / max(res.y, 1.0);
  float land = smoothstep(hill + ax, hill - ax, y);   // 1 below ridge, 0 above

  // =========================================================
  // 3. HORIZON GLOW BAND — warm-to-indigo glow, brightest AT the ridge line and
  // fading up into the sky (so it lights the horizon, not the ground beneath it).
  // =========================================================
  float gi    = clamp(u_glowIntensity, 0.0, 2.0);
  float glowH = max(u_glowHeight, 1.0) * pr / max(res.y, 1.0);      // band height (y-norm)
  float aboveRidge = max(y - hill, 0.0);
  float band  = exp(-aboveRidge / max(glowH, 1e-3));
  float haze  = fbm(vec2(uv.x * 3.0, y * 4.0 + 13.0) + vec2(0.0, t * 0.01));
  band *= 0.80 + 0.28 * haze;
  // colour: warm amber at dusk, cooling to indigo as the light sinks, with a
  // faint dawn tint rising during the pre-dawn rinse.
  vec3 duskCol = mix(cool, warm, dayCurve);
  vec3 dawnCol = mix(duskCol, mix(warm, star, 0.5), dawnSide * 0.5 * (1.0 - dayCurve));
  float glowAmt = band * (0.22 + 1.35 * dayCurve + 0.20 * dawnSide * (1.0 - dayCurve)) * gi;
  // sky glow lights only the sky (above the ridge), never the hill silhouette
  sky += dawnCol * glowAmt * (1.0 - land);

  // warm glowing rim exactly along the ridge crest (brightest at dusk)
  float rim = exp(-pow((y - hill) / 0.010, 2.0)) * (0.30 + 0.90 * dayCurve);
  vec3  rimCol = mix(cool, warm, clamp(dayCurve + 0.2, 0.0, 1.0));

  // =========================================================
  // 3. STARS — blink on one by one at per-star hashed offsets in the cycle
  // =========================================================
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = STAR_CELL_CSS * refScale * pr;
  vec2  gid     = floor(fc / cell);
  vec2  gloc    = fract(fc / cell);
  vec3  starAccum = vec3(0.0);

  // sample a 3x3 neighbourhood so star blooms can spill across cell edges
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = gid + vec2(float(ox), float(oy));
      vec2 rnd = hash22(nid);
      // does this cell host a star at all? density gates how many ignite, and
      // rises toward the base so the field thickens above the glowing horizon
      // (a rising swarm) rather than reading as a uniform sheet like starfall.
      float densGrad = mix(1.5, 0.45, smoothstep(0.04, 0.85, y));
      float exists = step(rnd.x, clamp(u_starDensity * densGrad, 0.0, 1.0));
      // jittered position within the cell
      vec2  spos = vec2(float(ox), float(oy)) + clamp(hash22(nid + 3.1), 0.12, 0.88);
      vec2  d    = gloc - spos;
      float r2   = dot(d, d);

      // each star has its own ignite moment within the cycle
      float ignite = hash21(nid + 7.7);
      // brightness envelope vs phase: stars come on as night deepens (dayCurve
      // low) and rinse away near pre-dawn. Build a per-star "on" window that
      // opens after its ignite phase and closes as dawn rinses.
      // nightAmt: 0 at dusk, 1 at deep night
      float nightAmt = 1.0 - dayCurve;
      // gate by ignite offset: a star only lights once the night has deepened
      // past its hashed threshold -> "one by one"
      float onset = smoothstep(ignite * 0.85, ignite * 0.85 + 0.18, nightAmt);
      // dawn rinse: stars fade only in the pre-dawn ascent (dawnSide high),
      // staggered per-star so they wink out one by one as the tint rises.
      float rinse = 1.0 - smoothstep(0.48 + ignite * 0.22, 0.78 + ignite * 0.20, dawnSide);
      float onAmt = onset * rinse;

      // ignite bloom: a brief soft bloom right as it appears, settling to a point
      float bloomEnv = exp(-pow((nightAmt - ignite * 0.85) * 6.0, 2.0)) * 0.9;

      // twinkle: the only fast element, small amplitude, per-star phase
      float tw = 0.78 + 0.22 * sin(t * 6.2831853 * TWINKLE_HZ + ignite * 31.4);

      // star core (settled point) + a soft surrounding bloom
      float coreSig  = exp(-r2 / 0.0022);
      float bloomSig = exp(-r2 / (0.014 + 0.026 * bloomEnv));
      float starLum  = (coreSig * (1.3 + bloomEnv * 0.7) + bloomSig * (0.22 + 0.6 * bloomEnv));

      // higher stars are slightly cooler/whiter; tint toward star colour, with
      // a faint per-star hue variation toward skyHi for variety
      vec3 sc = mix(star, mix(star, vec3(1.0), 0.55), rnd.y);
      starAccum += sc * starLum * exists * onAmt * tw;
    }
  }
  // stars dimmed within the bright horizon band (washed out by the glow)
  float horizonWash = 1.0 - 0.75 * band * (0.3 + 0.7 * dayCurve);
  sky += starAccum * 1.15 * horizonWash;

  // =========================================================
  // composite the landscape OVER the sky+stars: dark hill mass that occludes the
  // lower frame, with the warm glowing ridge rim on top.
  // =========================================================
  vec3 landCol = BG * 0.6 + skyHi * 0.012; // near-black silhouette, faint cool cast
  sky = mix(sky, landCol, land);
  sky += rimCol * rim * (1.0 - land * 0.0) * gi;

  // =========================================================
  // 4. finishing — gentle vignette top corners, clamp
  // =========================================================
  vec2 q = fc / res;
  float vign = 1.0 - 0.35 * smoothstep(0.55, 1.15, length((q - vec2(0.5, 0.42))));
  sky *= vign;

  // subtle dithering to kill gradient banding (sky is a long smooth ramp)
  float dither = (hash21(fc + fract(t)) - 0.5) / 255.0;
  sky += dither;

  gl_FragColor = vec4(max(sky, 0.0), 1.0);
}
