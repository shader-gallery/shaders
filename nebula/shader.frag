// nebula (Abyss) — the Pillars of Creation as a backdrop: two or three towering
// dark gas columns rise from the bottom of the frame, hard near-black silhouettes
// against a softly glowing emission backdrop whose hue drifts across the palette
// with height and depth. An unseen star above the frame lights the scene — each
// pillar's tip and lit edge carries a thin bright photoevaporation rim, and faint
// wisps stream off the tips and dissolve downwind. Discrete architecture with
// FBM-gnawed edges, not an amorphous cloud. No points of light anywhere.
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
uniform float u_drift;        // backdrop billow + wisp stream speed  (default 0.3)
uniform float u_pillarWidth;  // base column width in css px          (default 150)
uniform float u_rim;          // photoevaporation rim brightness      (default 0.6)
uniform float u_erosion;      // FBM raggedness of pillar edges        (default 0.5)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// --- hash / value noise / fbm (no textures) -------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float amp = 0.5;
  float f = 1.0;
  for (int i = 0; i < 5; i++) {
    s += amp * vnoise(p * f);
    f *= 2.02;
    amp *= 0.5;
  }
  return s;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x in [-aspect..aspect], y in [0..1] (0 = bottom)
  vec2 uv = fc / res;
  float aspect = res.x / max(res.y, 1.0);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

  // ---- palette with house fallback ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float drift   = max(u_drift, 0.0);
  float erosion = clamp(u_erosion, 0.0, 1.0);
  float rim     = clamp(u_rim, 0.0, 1.0);
  // pillar half-width in normalized x units. css-px → fraction of height.
  float pw = (u_pillarWidth * pr) / max(res.y, 1.0);
  pw = max(pw, 0.02);

  float billow = t * drift * 0.05; // barely-perceptible backdrop motion

  // ====================================================================
  // EMISSION BACKDROP — soft glowing gas, hue drifts with height + depth.
  // Billows at barely perceptible speed.
  // ====================================================================
  vec2 gp = p * 2.4;
  float back = fbm(gp + vec2(0.0, -billow * 1.2) + vec2(billow * 0.3, 0.0));
  back = pow(clamp(back, 0.0, 1.0), 2.1); // higher contrast: dark gaps, bright veins
  // a second, larger scale so the glow has structure (gas clouds), not flat
  float back2 = fbm(gp * 0.45 + vec2(billow * 0.4, billow * 0.6) + 7.3);
  back2 = pow(clamp(back2, 0.0, 1.0), 1.5);

  // hue index drifts across the four palette colours with height (uv.y) and a
  // slow depth-noise, plus a whisper of time so it never reads frozen. Height
  // uses a smooth easeo curve (not linear) so the top of the frame does NOT run
  // off the wheel onto one garish palette stop and band — instead the upper gas
  // settles into a blend dominated by depth-noise, keeping the field open.
  float hHeight = smoothstep(0.0, 1.0, uv.y) * 1.85;      // eases, max ~1.85 (no full lap)
  float hue = hHeight + back2 * 1.4 + back * 0.5 + billow * 0.5;
  float s4  = fract(hue * 0.25) * 4.0;
  float w0 = wheelW(s4, 0.0), w1 = wheelW(s4, 1.0), w2 = wheelW(s4, 2.0), w3 = wheelW(s4, 3.0);
  vec3 gasCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  // near the very top, blend toward an averaged palette so no single stop locks
  // into a flat horizontal stripe across the frame's top edge.
  float topMix = smoothstep(0.82, 1.0, uv.y);
  vec3 avgCol = (c0 + c1 + c2 + c3) * 0.25;
  gasCol = mix(gasCol, mix(gasCol, avgCol, 0.55), topMix);

  // glow fills the whole frame (the lit emission nebula the pillars stand in),
  // brightest in the upper-mid where the hidden star pours light down, easing
  // a little toward the very bottom so the columns' roots sit in dimmer gas.
  // brightest high (star above frame pours light down), easing toward the roots;
  // never fully cuts at the very top so the gas reads as an open glowing field.
  float vert = mix(0.30, 1.0, smoothstep(-0.05, 0.72, uv.y));
  // ease the glow back down at the very top so the upper edge reads as open
  // glowing field falling off into the void, not a hard bright banded strip.
  vert *= mix(1.0, 0.72, smoothstep(0.80, 1.0, uv.y));
  float glowAmt = (0.08 + 0.46 * back + 0.18 * back2) * vert;
  vec3 emission = gasCol * glowAmt;

  // ====================================================================
  // PILLARS — discrete dark vertical columns rising from the bottom.
  // Each column has a centre x, a width, and a top height; edges are gnawed
  // by FBM (erosion) and the whole silhouette breathes via slow unbounded noise.
  // ====================================================================
  // Slow unbounded erosion/regrowth time — no wrap, no reset.
  float morph = t * drift * 0.03;

  // Hidden star angle eases back and forth on a multi-minute sine → rim
  // migrates along the lit edge. Star is above frame; lit side flips slowly.
  float starAng = sin(t * drift * 0.018) * 0.6; // -0.6..0.6, who's lit
  // lit direction in x (which edge catches light)
  float litDir = starAng;

  // Accumulate the densest (nearest / most opaque) pillar coverage and the rim.
  float pillarMask = 0.0;   // 0 = clear, 1 = solid dark column
  float rimLight   = 0.0;   // accumulated rim brightness
  float wispGlow   = 0.0;   // streaming wisps off tips
  vec3  rimTint    = vec3(0.0);

  // three columns, back-to-front by depth (parallax + brightness). const loop.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // depth 0 (far) .. 1 (near). near columns are wider, darker, lower-rooted.
    float depth = fi / 2.0;
    float near  = 1.0 - depth * 0.45;

    // base centre x, spread across the frame so columns stay separated with
    // luminous gas visible between them. tallest (main) pillar near centre.
    float cx = (fi - 1.0) * 0.70 + 0.12 * sin(fi * 2.3);
    // column half-width: narrow, discrete towers (param scales the base width)
    float halfW = pw * 0.5 * (0.7 + 0.45 * near) * (0.85 + 0.3 * hash21(vec2(fi, 1.7)));

    // top of the column (how high it rises). varies per column so the crowns
    // sit at different heights; capped so glow is always visible above the tips.
    float topY = 0.54 + 0.18 * near + 0.08 * sin(fi * 1.7 + 1.0);

    // pillars lean, and their CENTERLINE meanders left/right with height via
    // low-frequency noise — this asymmetric wander (not width pulsing) is what
    // makes the towers read as irregular columnar/branching forms instead of a
    // symmetric vase. The whole column drifts sideways as it rises.
    float colSeed = cx * 13.0 + fi * 31.0;
    float lean    = (uv.y) * (0.06 * sin(fi * 3.1));
    // centerline wander: blend a width-relative term with a small absolute term
    // so even slender spires meander (don't collapse to a symmetric vase).
    float meander = (fbm(vec2(colSeed + 17.0, uv.y * 1.3 - morph * 0.3)) - 0.5)
                    * (halfW * 1.8 + 0.04);
    float xrel = (p.x - cx - lean - meander);

    // ---- roughly columnar profile (NOT a symmetric waisted vase) ----
    // Trunk width stays near-constant; only MODEST low-frequency per-side
    // variation rides on top, sampled from INDEPENDENT noise per edge so the
    // silhouette is never a mirror and there is no manufactured pinched neck.
    float yColm = uv.y * 1.5 - morph * (0.35 + 0.4 * near); // slow vertical FBM
    float wL = halfW * (0.92 + 0.26 * fbm(vec2(colSeed + 4.0,  yColm)));
    float wR = halfW * (0.92 + 0.26 * fbm(vec2(colSeed + 60.0, yColm)));
    // gentle crown narrowing, jittered per side by noise so the shoulder is
    // irregular (not a flat step) and the tip isn't a blunt slab.
    float trimAmt = 0.20 + 0.12 * erosion;
    float crownL = mix(1.0, 1.0 - trimAmt, smoothstep(topY - 0.46, topY + 0.02,
                       uv.y + 0.06 * fbm(vec2(colSeed + 2.0, uv.y * 4.0))));
    float crownR = mix(1.0, 1.0 - trimAmt, smoothstep(topY - 0.46, topY + 0.02,
                       uv.y + 0.06 * fbm(vec2(colSeed + 50.0, uv.y * 4.0))));
    wL *= crownL; wR *= crownR;

    // higher-frequency erosion gnaws each edge independently (asymmetric bite)
    float biteL = (fbm(vec2(colSeed + 7.0,  uv.y * 6.5 - morph * (0.6 + near))) - 0.5)
                  * (0.25 + 0.85 * erosion) * halfW * 1.7;
    float biteR = (fbm(vec2(colSeed + 88.0, uv.y * 6.5 - morph * (0.6 + near) + 3.0)) - 0.5)
                  * (0.25 + 0.85 * erosion) * halfW * 1.7;
    wL = max(wL - biteL, 0.0);
    wR = max(wR - biteR, 0.0);
    // pick the edge facing this fragment (independent left/right widths)
    float w = (xrel < 0.0) ? wL : wR;

    // soft anti-aliased silhouette edge in x
    float ax = 1.5 / max(res.y, 1.0); // ~1px AA in x
    float side = 1.0 - smoothstep(w - ax, w + ax, abs(xrel));

    // vertical extent: solid from bottom up to topY, gnawed/feathered at the tip
    float tipNoise = fbm(vec2(cx * 5.0 - morph, uv.y * 9.0 - morph * 1.4)) - 0.5;
    float topEdge = topY + tipNoise * (0.04 + 0.10 * erosion);
    float ay = 2.0 / max(res.y, 1.0);
    float vmask = 1.0 - smoothstep(topEdge - 0.02, topEdge + 0.02 + ay, uv.y);
    // root: ensure the column is anchored solidly at the very bottom
    vmask *= smoothstep(-0.02, 0.04, uv.y);

    float colMask = side * vmask;

    // depth occlusion: nearer columns paint over farther ones
    pillarMask = max(pillarMask, colMask * near);

    // ---- photoevaporation rim: the star is ABOVE the frame, so the TIPS and
    // upper lit edge are the brightest accent, not a full-height side stroke ----
    float litX = sign(litDir + 0.0001); // which side faces the star
    // signed distance to edge (positive outside)
    float dEdge = abs(xrel) - w;
    // soft, glowing falloff (not a 1px electric line) — gas, not neon stroke
    float edgeBand = exp(-max(dEdge, 0.0) * (42.0 + 26.0 * near));
    // crown weight: rim is overwhelmingly concentrated near the tips of the
    // column where light pours over the top. Ramps up strongly toward topEdge.
    float crown = smoothstep(topY - 0.34, topEdge + 0.02, uv.y);
    crown = crown * crown; // bias even harder to the very top
    // faint side accent on the star-facing edge, fading out below mid-height so
    // it never reads as a continuous bright outline down the whole pillar.
    float litFace = smoothstep(-0.15, 0.7, xrel * litX / max(w, 1e-3));
    float sideHeight = smoothstep(0.18, topY, uv.y); // only the upper portion
    float litFaceA = litFace * sideHeight * 0.22;     // faint accent only
    float thisRim = edgeBand * vmask * (crown * 1.0 + litFaceA) * near;
    // the rim only exists at the boundary, fade where deep inside the column
    thisRim *= smoothstep(0.0, 0.012, dEdge + 0.012);
    rimLight = max(rimLight, thisRim);
    // rim hue: warm/bright tint pulled from the gas at that height
    rimTint += gasCol * thisRim;

    // ---- wisps streaming off the tip, dissolving downwind ----
    // sample a flowy noise above the tip; streams sideways with the star/wind.
    float wy = uv.y - topY;
    if (wy > -0.02) {
      // anchor the wisp cone at the column's meandered centerline near the tip
      float tipCx = cx + topY * (0.06 * sin(fi * 3.1))
                    + (fbm(vec2(colSeed + 17.0, topY * 1.3 - morph * 0.3)) - 0.5) * (halfW * 1.8 + 0.04);
      float wxrel = p.x - tipCx;
      vec2 wp = vec2(wxrel * 5.0 - litDir * 2.5 * wy, wy * 7.0 - t * drift * 0.8);
      float wsp = fbm(wp);
      // confined to a cone above + downwind of the tip, fading with height
      float coneX = exp(-pow((wxrel - litDir * 0.18 * wy) / (halfW * (1.0 + 6.0 * wy)), 2.0));
      float fade  = exp(-max(wy, 0.0) * 6.0);
      wispGlow += pow(clamp(wsp, 0.0, 1.0), 2.0) * coneX * fade * near;
    }
  }

  pillarMask = clamp(pillarMask, 0.0, 1.0);
  rimLight   = clamp(rimLight, 0.0, 1.0);

  // ====================================================================
  // COMPOSITE
  // ====================================================================
  // Start from near-black base, add the emission glow where NOT occluded.
  vec3 col = BG;
  col += emission * (1.0 - pillarMask * 0.98);

  // wisps: dim glowing gas streaming off the tips (palette-tinted, additive)
  vec3 wispCol = mix(gasCol, c2, 0.3);
  col += wispCol * wispGlow * 0.28 * (1.0 - pillarMask * 0.9);

  // the dark columns themselves: crush toward black where masked, keep a faint
  // interior so they read as gas not a hole.
  vec3 pillarInterior = BG + gasCol * 0.012;
  col = mix(col, pillarInterior, pillarMask * 0.97);

  // photoevaporation rim on top of everything (brightest accent in the frame)
  vec3 rimColor = normalize(rimTint + 1e-4) * (0.6 + 0.4 * length(rimTint));
  rimColor = mix(vec3(0.9, 0.85, 0.95), gasCol, 0.55); // bright, faintly tinted
  // RIM=0 must be a genuinely unlit silhouette → no floor, start near zero.
  col += rimColor * rimLight * (rim * 1.8);

  // subtle overall vignette so edges fall to black — composed framing
  vec2 vq = uv - 0.5;
  float vign = 1.0 - smoothstep(0.45, 1.0, length(vec2(vq.x * 0.9, vq.y)));
  col *= mix(0.78, 1.0, vign);

  // gentle filmic-ish shoulder to tame only the brightest rim accents
  col = col / (col + vec3(0.92)) * 1.82;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
