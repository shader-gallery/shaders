// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// karst (Strata) — a Li River nocturne. One rank of steep karst-tower
// silhouettes stands across the middle of the frame, their crests rim-lit with a
// thin glow, the tower bodies solid dark masses occluding a faintly lit sky, and
// the whole skyline hangs mirrored in the dark still water filling the lower
// frame — the reflection dimmer, softly smeared, broken by slow ripple shimmer.
// A single mist band lies across the towers' waists, hiding and revealing their
// middles, while tower tint shifts subtly through the palette along the rank. The
// waterline stays dark: the mirror is betrayed only by the inverted rim-lit
// crests, never by a glowing edge.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;    // lateral skyline travel speed   (default 0.08)
uniform float u_ripple;   // reflection ripple amplitude     (default 0.45)
uniform float u_mist;     // waist mist density / breathing  (default 0.5)
uniform float u_spacing;  // tower width+spacing, css px     (default 180), TOWER_CSS

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float HORIZON  = 0.50;   // waterline as a fraction of height (0=top,1=bottom in uv)
const float CREST_CSS = 2.2;   // rim-light half-thickness in css px

// hash / value noise (cheap, no textures)
float hash11(float p) {
  p = fract(p * 0.2317);
  p *= p + 23.19;
  p *= p + p;
  return fract(p);
}
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u);
}

// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// Skyline height (0..1, height above the horizon as fraction of sky region) at a
// given world-x in css px. A rank of steep karst towers: tall narrow pinnacles
// with broad bodies that fill solidly to the waterline, jittered per cell. A
// continuous base floor keeps the rank reading as a connected ridge — the profile
// never dips back to the horizon, so it reads as terrain, not an audio trace.
float karstTower(float d, float halfW, float peak) {
  float x = abs(d) / max(halfW, 1e-4);           // 0 at centre, 1 at base edge
  // sharp tip blended with a wide skirt -> a solid broad-bodied limestone tower
  float spire = exp(-x * x * 2.6);               // sharp tip
  float base  = 1.0 - smoothstep(0.62, 1.10, x); // wide skirt near the foot
  float prof  = max(pow(spire, 0.55), base * 0.86);
  return peak * clamp(prof, 0.0, 1.0);
}
float skyline(float wx, float spacingCss) {
  float u = wx / spacingCss;            // tower-cell coordinate
  float h = 0.20;                       // continuous ridge floor (never bare horizon)
  // overlapping towers around this position (const bounds)
  for (int k = -1; k <= 1; k++) {
    float cell = floor(u) + float(k);
    float jitterPos = (hash11(cell * 1.7 + 11.0) - 0.5) * 0.30;
    float center = cell + 0.5 + jitterPos;
    float d = u - center;
    float peak  = 0.50 + hash11(cell * 2.3 + 4.0) * 0.42;   // tower height
    float halfW = 0.56 + hash11(cell * 3.1 + 7.0) * 0.18;   // base half-width
    h = max(h, karstTower(d, halfW, peak));
  }
  return clamp(h, 0.0, 1.0);
}

// Shortest distance (in uv-y units) from a point (px in css-x, py in uv) to the
// silhouette crest curve y=topY(x). Samples the skyline at several nearby x and
// takes the min euclidean distance, so the rim has constant thickness even on
// near-vertical flanks (no per-column gaps). horizon/skyRegion map h->uv.
float crestDist(float pxCss, float py, float spacingCss, float horizon,
                float skyRegion, float aspectPxPerUv) {
  float best = 1e3;
  // sample window ~ +-0.06 of a tower spacing, 9 taps
  for (int i = -4; i <= 4; i++) {
    float fx = float(i) / 4.0 * 0.10 * spacingCss;   // css-x offset
    float hy = skyline(pxCss + fx, spacingCss);
    float ty = horizon - hy * skyRegion;              // crest uv-y at that x
    float dx = fx / aspectPxPerUv;                    // css-x -> uv-x scale
    float dy = py - ty;
    best = min(best, sqrt(dx * dx + dy * dy));
  }
  return best;
}

// tint along the rank: subtly walks the palette wheel by tower cell + position
vec3 rankTint(float wxCss, float spacingCss, float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float cellF = floor(wxCss / spacingCss);
  float s = fract(cellF * 0.16 + 0.12 * vnoise(wxCss / spacingCss * 0.5) + t * 0.01) * 4.0;
  float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
  return (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // uv with y=0 at top, y=1 at bottom feels natural for "sky above water below"
  vec2 uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);

  // --- palette fallback (headless contexts can leave u_palette zeroed) ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float spacingCss = max(u_spacing, 16.0);   // guard the divide if param hits 0
  float pxPerUvX   = res.x / pr;             // css-px per uv-x unit

  // lateral drift: the whole skyline slides past at a slow boat's pace
  float driftPx = t * u_drift * 60.0 * pr;
  // world-x in css px for the current fragment column
  float wxCss = (fc.x + driftPx) / pr;

  // region geometry: sky occupies uv.y in [0,HORIZON], water in [HORIZON,1]
  float horizon   = HORIZON;
  float skyRegion = horizon;                 // height of sky band in uv
  float aa = 1.5 / res.y;                    // edge softness in uv

  bool inWater = uv.y > horizon;

  // ============================ SKY HALF ============================
  // The lit sky is a real luminous field filling the WHOLE sky band, brightest
  // through the upper-mid sky and easing toward the waterline, so the open sky
  // above and between the towers glows. The tower body is a solid dark mass that
  // OCCLUDES this glow — the silhouette reads by the contrast between lit sky and
  // black tower, not by the rim alone.
  float skyY = uv.y / max(horizon, 1e-4);                       // 0 top -> 1 horizon
  // a broad lit field filling the whole sky: lifted strongly even at the top so
  // open sky above the crests glows, easing up further toward the waterline
  float lit  = 0.62 + 0.38 * smoothstep(0.0, 0.95, skyY);       // bright everywhere
  vec3 skyGlow  = BG
                + (c0 * 0.24 + c2 * 0.36) * lit                 // broad nocturnal glow
                + (c1 * 0.12) * smoothstep(0.4, 1.0, skyY);     // warmer near the line
  // a soft star-dust mottle so the sky isn't a dead flat gradient
  float dust = vnoise(uv.x * 30.0 + 3.1) * vnoise(uv.y * 24.0 + t * 0.02);
  skyGlow += c2 * 0.030 * dust * (1.0 - skyY * 0.5);

  float h    = skyline(wxCss, spacingCss);   // 0..1 tower height fraction
  float topY = horizon - h * skyRegion;      // silhouette top in uv (lower y = higher)

  // solid silhouette mask: 1 inside the tower body (below crest, above horizon)
  float bodySky = smoothstep(topY - aa, topY + aa, uv.y);

  // crest rim-light: thin luminous line on the silhouette top edge (2D distance
  // so it's even on near-vertical flanks).
  float crestW   = CREST_CSS / res.y;        // thin thickness in uv
  float dCrest   = crestDist(wxCss, uv.y, spacingCss, horizon, skyRegion, pxPerUvX);
  float crestSky = exp(-pow(dCrest / max(crestW * 1.4, 1e-4), 2.0));

  vec3 tint = rankTint(wxCss, spacingCss, t, c0, c1, c2, c3);

  // tower body: a true dark silhouette mass (much darker than the lit sky behind)
  vec3 bodyCol = BG * 0.6;

  // ============================ WATER HALF (mirror) ============================
  // The reflection is a clean vertical mirror of the SAME skyline (locked beneath
  // the rank), only its sampled column is rippled and its brightness/sharpness
  // reduced. depth grows from 0 at the waterline to 1 at the bottom.
  float depth = (uv.y - horizon) / max(1.0 - horizon, 1e-4);
  // ripple shimmer: lateral wobble of the reflection column on overlapping phases
  float rip = u_ripple * (0.012 + 0.030 * max(depth, 0.0));
  // smooth low-frequency ripple phases (avoid per-pixel chaos that aliases the
  // reflected crest sampler); kept below ~half a tower so the mirror stays legible
  float shimmer =
      sin(uv.y * 24.0 - t * 1.7) * 0.55 +
      sin(uv.y * 15.0 + t * 1.1 + wxCss * 0.01) * 0.30 +
      sin(uv.y * 40.0 - t * 2.3) * 0.15;
  float wobbleCss = clamp(shimmer * rip, -0.5, 0.5) * pxPerUvX; // lateral smear, css px
  float wxRefl = (fc.x + driftPx + wobbleCss * pr) / pr;        // rippled mirror column
  // sample the same skyline at the rippled column, mirror its crest into the water
  float hR          = skyline(wxRefl, spacingCss);
  float topYR_sky   = horizon - hR * skyRegion;
  float topYR_water = horizon + (horizon - topYR_sky);   // mirrored crest in water

  // mirrored tower body (dark mass) from the waterline down to the mirrored crest
  float bodyWater = smoothstep(horizon - aa, horizon + aa, uv.y) *
                    (1.0 - smoothstep(topYR_water - aa, topYR_water + aa, uv.y));

  // mirrored crest rim-light — softly smeared (wider with depth), dimmer
  float crestWr  = crestW * (1.5 + 2.8 * depth);
  float reflPy   = 2.0 * horizon - uv.y;                  // uv.y mirrored into sky coords
  float dCrestR  = crestDist(wxRefl, reflPy, spacingCss, horizon, skyRegion, pxPerUvX);
  float crestWater = exp(-pow(dCrestR / max(crestWr * 1.4, 1e-4), 2.0));

  vec3 tintR = rankTint(wxRefl, spacingCss, t, c0, c1, c2, c3);

  // the water itself: a dim, smeared reflection of the sky glow (keeps the lower
  // frame alive without glowing the waterline). Mirror the sky-glow field and dim
  // it hard so the upper rank stays dominant.
  float skyYr = reflPy / max(horizon, 1e-4);
  float litR  = 0.62 + 0.38 * smoothstep(0.0, 0.95, skyYr);
  vec3 waterGlow = BG
                 + (c0 * 0.24 + c2 * 0.36) * litR * 0.38
                 + (c1 * 0.12) * smoothstep(0.4, 1.0, skyYr) * 0.38;
  waterGlow *= (1.0 - 0.32 * depth);                      // darken with depth

  // ============================ COMPOSE ============================
  vec3 col = inWater ? waterGlow : skyGlow;

  float skyMask   = 1.0 - step(horizon, uv.y);
  float waterMask = step(horizon, uv.y);

  // --- SKY: dark tower body occludes the lit sky, then the bright rim on top ---
  col = mix(col, bodyCol, bodySky * skyMask);
  // crest rim — bright (this is the dominant subject)
  col += tint * crestSky * skyMask * 2.3;
  // soft outer bloom along the crest so it reads as glow, not a hairline
  float bloomSky = exp(-pow((uv.y - topY) / max(crestW * 5.0, 1e-4), 2.0)) * skyMask;
  col += tint * bloomSky * 0.30;

  // --- WATER: dark mirrored body, then the dimmer smeared crest ---
  col = mix(col, bodyCol * 0.85, bodyWater * waterMask);
  // reflection clearly dimmer than the sky rank, and fading with depth
  float reflDim = (0.42 - 0.26 * depth);
  col += tintR * crestWater * waterMask * 2.3 * reflDim;
  float bloomWater = exp(-pow((uv.y - topYR_water) / max(crestWr * 4.0, 1e-4), 2.0)) * waterMask;
  col += tintR * bloomWater * 0.30 * reflDim;

  // broad horizontal shimmer streaks on the water (luminance only, faint)
  float streak = sin(uv.y * 22.0 - t * 1.3 + sin(wxCss * 0.006 + t * 0.2) * 2.0);
  streak = max(0.0, streak) * waterMask * depth * 0.11 * u_ripple;
  col += (c2 * 0.6 + tintR * 0.4) * streak;

  // ===================== WAIST MIST BAND across the towers' middles =====================
  // A soft band lying across the towers' waists, breathing slowly. It is KEYED to
  // the tower bodies (bodySky) so it veils the dark masses' middles — hiding and
  // revealing them — rather than smearing a generic glow bar across open sky.
  float breathe  = 0.5 + 0.5 * sin(t * 0.18);
  float mistAmt  = u_mist * (0.7 + 0.5 * breathe);
  float bandCenter = horizon - 0.30 * skyRegion;     // across the towers' waists
  float bandHalf   = 0.085 + 0.050 * breathe;
  float band = exp(-pow((uv.y - bandCenter) / max(bandHalf, 1e-4), 2.0));
  // gentle drifting lumpiness so the mist isn't a flat stripe
  float mlump = 0.55 + 0.45 * vnoise(wxCss * 0.012 + t * 0.05);
  // veil sits on the towers (strong over bodies) but a thin haze hangs in the gaps
  float waist = band * mlump * skyMask;
  float onBody = mix(0.35, 1.0, bodySky);            // thickest over the tower masses
  float mist  = waist * mistAmt * onBody;
  vec3  mistCol = mix(c2, vec3(0.80, 0.85, 0.97), 0.45);
  col = mix(col, mistCol, clamp(mist * 0.95, 0.0, 0.92));
  col += mistCol * mist * 0.12;                       // faint self-glow

  // faint mirrored mist haze just below the waterline (the band's reflection)
  float bandCenterR = 2.0 * horizon - bandCenter;
  float bandR = exp(-pow((uv.y - bandCenterR) / max(bandHalf * 1.2, 1e-4), 2.0));
  float onBodyR = mix(0.35, 1.0, bodyWater);
  float mistR = bandR * mistAmt * mlump * onBodyR * 0.45 * waterMask;
  col = mix(col, mistCol * 0.6, clamp(mistR * 0.5, 0.0, 0.5));

  // gentle vignette to compose the frame
  vec2 q = uv - 0.5; q.x *= aspect;
  float vign = 1.0 - smoothstep(0.60, 1.20, length(q));
  col *= mix(0.86, 1.0, vign);

  // subtle filmic lift to avoid pure-black banding, kept dark
  col = max(col, BG * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
