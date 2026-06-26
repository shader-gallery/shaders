// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// eclipse (Abyss) — a minutes-long lunar eclipse. A large, softly mottled moon
// disc (low-frequency FBM maria + limb-darkened edge) hangs in a near-black sky
// scattered with very faint stars. A soft umbral shadow, penumbra tinted warm,
// slides across the disc on a slow straight track; at totality — kept brief —
// the disc smoulders ember-red, graded brighter toward the trailing limb and
// still visibly mottled, never a uniform dark disc with a rim. The faint stars
// brighten in the deepened dark, then light returns from the opposite limb and
// the cycle loops while the shadow is fully off the disc (the wrap is invisible).
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
uniform float u_period;   // seconds for the full shadow transit cycle (default 150)
uniform float u_radius;   // moon disc radius in CSS px              (default 160)
uniform float u_ember;    // warm tint strength of shadow/totality   (default 0.6)
uniform float u_mottle;   // contrast of the FBM maria texture       (default 0.5)

const vec3  BG = vec3(0.020, 0.020, 0.030); // near-black night sky

// --- hash / value noise / fbm (low frequency, for maria) ---
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // palette fallback (headless contexts can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // guard params against catastrophic 0 values
  float period = max(u_period, 1.0);
  float radius = max(u_radius, 1.0) * pr;
  float ember  = clamp(u_ember, 0.0, 1.0);
  float mottle = clamp(u_mottle, 0.0, 1.0);

  // moon-centred coordinates, normalized so r=1 is the limb
  vec2  q = (fc - ctr) / radius;
  float r = length(q);

  vec3 col = BG;

  // ---------------------------------------------------------------------------
  // STARFIELD — very faint scattered stars with a gentle twinkle. Brighten
  // slightly in the deepened dark of totality. Suppressed under the moon disc.
  // ---------------------------------------------------------------------------
  // build the transit phase first (stars respond to darkness).
  float phase = fract(t / period);          // 0..1 over the full cycle
  // The shadow crosses the disc for the great majority of the cycle (phase
  // 0..CROSS), then runs fully off the disc for a short gap so the loop wrap is
  // invisible. Phase 0 = first contact at the trailing (left) limb; the umbra
  // sweeps right across the body and exits at the leading limb near phase CROSS.
  const float CROSS = 0.86;                  // fraction of cycle spent crossing
  float xphase = clamp(phase / CROSS, 0.0, 1.0);
  // The umbra is a circle a little larger than the moon (shadowR > 1) so that at
  // totality it can fully cover the disc. Its CURVED EDGE is what we read as the
  // terminator: with the shadow centre swept from off the left limb to off the
  // right limb, that edge sits ON the disc as a moving crescent for the great
  // majority of the cycle, and only fully covers the moon for a brief window in
  // the middle (totality). track = horizontal position of the shadow centre.
  const float SHADOWR = 1.36;                // umbra radius in moon radii (>1 -> can fully occult)
  // sweep so the leading terminator edge (track + SHADOWR) crosses from the left
  // limb (-1) to off the right limb: track from -(1+SHADOWR) to +(1+SHADOWR).
  const float TRK = 1.0 + SHADOWR;           // 2.36 -> edge enters/exits exactly at limbs
  float track = (phase <= CROSS)
    ? mix(-TRK, TRK, xphase)
    : TRK + 1.6;                             // parked well off the right limb during the gap
  vec2  shadowC = vec2(track, 0.16);        // slight vertical offset -> curved terminator reads
  float shadowR = SHADOWR;
  // overlap of shadow over the moon centre region: 1 = fully covered (totality)
  float sep = length(shadowC);              // distance moon-centre to shadow-centre
  // totality requires the shadow to fully engulf the disc: sep + 1 <= shadowR,
  // i.e. sep <= shadowR-1 (~0.36). Keep it brief & graded.
  float coverage = 1.0 - smoothstep(0.0, shadowR - 0.9, sep); // ~1 only near sep~0
  // totality is brief: sharpen the coverage so deep dark only sits near sep~0
  float totality = pow(clamp(coverage, 0.0, 1.0), 1.8);
  // slow breathing of the totality glow
  float breath = 0.85 + 0.15 * sin(t * 0.5);

  // star layer (computed in screen space, scaled by pixel ratio)
  {
    vec2 sp = fc / (2.4 * pr);
    vec2 cell = floor(sp);
    vec2 f = fract(sp);
    float h = hash21(cell);
    // only a sparse subset are stars
    float starSeed = step(0.86, h);
    vec2 starPos = vec2(hash21(cell + 3.1), hash21(cell + 7.7));
    float d = length(f - starPos);
    float star = starSeed * (1.0 - smoothstep(0.0, 0.12, d));
    // per-star twinkle (the only fast element)
    float tw = 0.55 + 0.45 * sin(t * (2.0 + 4.0 * hash21(cell + 1.3)) + h * 31.0);
    // stars brighten in the deepened dark around totality
    float darkBoost = 1.0 + 1.4 * totality;
    float starBri = star * tw * darkBoost;
    // colour: cool white with faint palette tint from c2
    vec3 starCol = mix(vec3(0.85, 0.88, 1.0), c2, 0.25);
    // suppress stars where the bright lit moon is (they'd be invisible anyway)
    float moonMask = smoothstep(1.04, 0.92, r); // 1 inside disc, 0 outside
    col += starCol * starBri * 0.16 * (1.0 - 0.95 * moonMask);
  }

  // ---------------------------------------------------------------------------
  // MOON DISC
  // ---------------------------------------------------------------------------
  float disc = smoothstep(1.0, 1.0 - 2.5 / radius * pr, r); // 1 inside, AA limb
  if (disc > 0.001) {
    // low-frequency maria texture (FBM), domain in moon-radius units
    float m = fbm(q * 2.3 + vec2(4.0, 1.5));
    float m2 = fbm(q * 5.1 - vec2(2.0, 6.0));
    float maria = mix(m, m2, 0.35);
    // remap to a mottling factor centred on 1.0, contrast driven by u_mottle
    float mottleAmt = (maria - 0.5) * (0.35 + 1.05 * mottle);
    float surf = clamp(1.0 + mottleAmt, 0.35, 1.45);

    // limb darkening — disc dims toward the edge like a real lit sphere
    float limb = sqrt(max(0.0, 1.0 - r * r));      // cosine-ish falloff
    float limbDark = mix(0.32, 1.0, smoothstep(0.0, 0.9, limb));

    // base lit-moon colour: a neutral moon-grey driven strongly by the palette so
    // the lit body re-themes (midnight -> cool blue-grey, ember -> warm sand). We
    // pick the COOLEST palette entry (lowest red-minus-blue) for the lit hue, blend
    // it into the grey at ~45%, and keep enough neutral grey that it still reads as
    // a moon, not a coloured ball.
    vec3 cool = c0;
    float coolScore = c0.r - c0.b;
    if (c1.r - c1.b < coolScore) { cool = c1; coolScore = c1.r - c1.b; }
    if (c2.r - c2.b < coolScore) { cool = c2; coolScore = c2.r - c2.b; }
    if (c3.r - c3.b < coolScore) { cool = c3; coolScore = c3.r - c3.b; }
    // desaturate the picked hue a touch and lift it toward moon-grey luminance
    vec3 coolGrey = mix(cool, vec3(dot(cool, vec3(0.33))), 0.35);
    vec3 litCol = mix(vec3(0.60, 0.62, 0.68), coolGrey * 1.05, 0.48);
    vec3 litMoon = litCol * surf * limbDark;

    // -------------------------------------------------------------------------
    // SHADOW across the disc. The umbra is the region inside the shadow circle.
    // Penumbra = soft transition ring, tinted warm. Inside the umbra near
    // totality the disc smoulders ember-red, graded toward the trailing limb.
    // -------------------------------------------------------------------------
    float ds = length(q - shadowC);                 // dist to shadow centre
    // umbra mask: 1 deep in shadow, 0 in full light, soft penumbra band
    float umbra = smoothstep(shadowR + 0.18, shadowR - 0.18, ds);
    // penumbra emphasis (the soft ring where light grades down)
    float penumbra = umbra * (1.0 - umbra) * 4.0;   // peaks in the transition

    // Pick the WARMEST palette entry (highest red-minus-blue) so the ember
    // smoulder leans on the palette's own warm hue rather than a hard-coded
    // orange. We only gently bias it toward red so cool-only palettes still get a
    // believable blood-moon (witchlight's amber, ember's orange, midnight's rose).
    vec3 warm = c0;
    float wScore = c0.r - c0.b;
    if (c1.r - c1.b > wScore) { warm = c1; wScore = c1.r - c1.b; }
    if (c2.r - c2.b > wScore) { warm = c2; wScore = c2.r - c2.b; }
    if (c3.r - c3.b > wScore) { warm = c3; wScore = c3.r - c3.b; }
    // light red-bias only (was 0.35 toward a fixed orange — that flattened theming)
    warm = mix(warm, vec3(0.92, 0.34, 0.14), 0.18);
    vec3 emberDeep = warm * vec3(0.62, 0.22, 0.14);  // dark shadowed body, deep warm
    vec3 emberHot  = mix(warm, vec3(1.0, 0.52, 0.22), 0.30); // glowing limb smoulder

    // brightness grade toward the trailing limb (the side the shadow entered
    // from): brighter on the -x edge during/after totality. Use q.x.
    float grade = smoothstep(0.95, -0.95, q.x);     // 1 on trailing (left) limb

    // shadowed surface: still mottled (surf carried in), darkened to a deep red
    // body, then graded brighter toward the trailing limb so it never reads as
    // a flat dark disc. Ember param scales the whole warm intensity.
    // ember=0 -> near-black occlusion; ember=1 -> bright smouldering red disc
    float es = 0.12 + 1.15 * ember;                 // overall ember strength
    // Strengthen the maria's hold on the shadowed body: square-ish surf so the
    // dark seas darken more than the bright highlands brighten -> visible mottle
    // survives in the mid-crossing band instead of clipping to flat red.
    float surfShadow = surf * mix(1.0, surf, 0.55); // deeper contrast in shadow
    vec3 shadowCol = emberDeep * surfShadow * (0.55 + 0.7 * grade) * es;
    // totality smoulder: a graded glow that breathes, strongest mid-eclipse and
    // toward the trailing limb (the classic blood-moon highlight). Carry the
    // mottle here too so the glow stays textured rather than saturating flat.
    float emberGlow = totality * es * breath;
    shadowCol += emberHot * surfShadow * (0.25 + 1.1 * grade) * emberGlow * 0.8;
    // warm penumbra rim so first/last contact reads warm (ember widens it)
    shadowCol += emberHot * penumbra * (0.06 + 0.50 * ember);

    // mix lit moon -> shadowed moon by umbra coverage
    vec3 moonCol = mix(litMoon, shadowCol, umbra);

    // gentle bloom just inside the limb so the lit disc feels luminous
    float rim = smoothstep(0.78, 1.0, r) * (1.0 - umbra * 0.7);
    moonCol += litCol * rim * 0.12;

    col = mix(col, moonCol, disc);
  }

  // soft global vignette to keep the frame composed and the corners dark
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  // subtle tonemap to avoid any harsh clipping on the lit limb
  col = col / (1.0 + col * 0.45);
  col *= 1.15;

  gl_FragColor = vec4(col, 1.0);
}
