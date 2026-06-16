// lantern (Bloom) — bioluminescent sea-lanterns: several translucent glowing
// orbs drift over dark water, but each is a STRUCTURED lantern, not a soft blur.
// A bright membrane rim catches the light, a caustic cell-web shimmers across the
// interior, fine filament ribs radiate from a hot nucleus, and faint tendrils
// trail below. Overlaps bloom brighter. All motion is looping sin/cos drift +
// slow caustic crawl, so the piece returns to itself with no visible jump.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // drift/breathing/caustic speed multiplier (default 1)
uniform float u_size;      // lantern radius multiplier                (default 1)
uniform float u_glow;      // overall emission multiplier              (default 1)
uniform float u_structure; // interior caustic + rib detail, 0..1      (default 0.7)
uniform float u_atmosphere;// colored water-glow fill                  (default 0.8)
uniform float u_colorSpread;// lantern-to-lantern hue variety          (default 0.85)
uniform float u_saturation;// lantern colour vividness                 (default 1.2)
uniform float u_count;     // how many hero lanterns are alive, 3..48     (default 40)
uniform float u_depth;     // randomized depth: far ones shrink+fade+blur(default 1)
uniform float u_shape;     // per-lantern squash/tilt/rim distortion, 0..1(default 0.5)
uniform float u_tentacles; // hero-jelly tentacle length/visibility, 0..1 (default 0.6)
uniform float u_haze;      // dense low-detail far jelly field, 0..1      (default 0.6)
uniform float u_variety;   // per-jelly randomization of detail/size/glow  (default 0.6)

const int   MAX_LANTERNS = 48;  // GLSL needs a const loop bound; u_count culls
const float BG = 0.035;   // deep-water base, ~#09090B

// cheap per-lantern hashes for stable random per-jelly traits, 0..1
float hash11(float n) { return fract(sin(n * 91.37 + 2.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.3, 289.1)) + 1.7) * 43758.5453); }

// Read a palette entry with the house all-zero fallback to midnight.
vec3 pal(int i) {
  vec3 c = i == 0 ? u_palette[0] : i == 1 ? u_palette[1]
         : i == 2 ? u_palette[2] : u_palette[3];
  vec3 sum = u_palette[0] + u_palette[1] + u_palette[2] + u_palette[3];
  if (dot(sum, sum) < 1e-5) {
    if (i == 0) return vec3(0.231, 0.510, 0.965);
    if (i == 1) return vec3(0.659, 0.333, 0.969);
    if (i == 2) return vec3(0.133, 0.827, 0.933);
    return vec3(0.957, 0.247, 0.369);
  }
  return c;
}

// ridged caustic interference — bright web veins from summed travelling waves
float caustic(vec2 q, float t) {
  float v = sin(q.x * 6.3 + t)
          + sin(q.y * 5.7 - t * 0.8 + 1.3)
          + sin((q.x + q.y) * 4.4 + t * 0.6)
          + sin((q.x - q.y) * 5.1 - t * 0.5 + 2.1)
          + sin(length(q) * 9.0 - t * 1.1);
  v = abs(v) * 0.2;                       // fold to ridges
  return pow(1.0 - clamp(v, 0.0, 1.0), 4.5);   // sharper cell-web veins
}

// structured lantern at local coords (uv-center). returns:
//   x = interior fill (membrane glow + caustic web)
//   y = rim membrane brightness
//   z = nucleus + radial ribs (hot structured core)
// `soft` (0..1) defocuses the lantern for depth: wider rim, blurrier nucleus,
// washed interior — a far/out-of-focus orb instead of a crisp near bell.
vec3 lantern(vec2 d, float r, float seed, float t, float structure, float soft) {
  float rad = length(d) / max(r, 1e-3);   // 0 at centre .. 1 at membrane
  float ang = atan(d.y, d.x);

  // interior mask: solid inside, soft membrane falloff just past the rim
  float inside = 1.0 - smoothstep(0.82, 1.0, rad);
  float outerHalo = exp(-pow(max(rad - 1.0, 0.0) * mix(3.0, 1.7, soft), 2.0)); // contained bloom, wider when far

  // caustic cell-web across the interior, crawling slowly; brighter mid-bell
  vec2 q = d / max(r, 1e-3) * 3.0 + seed * 7.0;
  float web = caustic(q, t * 0.7 + seed * 4.0);
  float interior = (0.35 + 0.65 * web * structure) * inside
                 + 0.25 * outerHalo;

  // membrane rim: a crisp bright ring at the edge, slightly rippling; far
  // lanterns get a softer, wider rim so they read out-of-focus.
  float ripple = 0.03 * sin(ang * 7.0 + t * 0.9 + seed * 5.0);
  float rim = exp(-pow((rad - (0.92 + ripple)) * mix(17.0, 6.0, soft), 2.0));

  // radial filament ribs from the nucleus, thin and glowing
  float ribCount = 9.0 + floor(seed * 6.0);
  float ribs = 0.5 + 0.5 * sin(ang * ribCount + sin(rad * 7.0 - t) * 1.2 + seed * 3.0);
  ribs = pow(ribs, 7.0) * smoothstep(0.05, 0.45, rad) * (1.0 - smoothstep(0.7, 1.0, rad));
  // hot nucleus — blurs out (wider, dimmer falloff) with depth
  float nucleus = exp(-rad * rad * mix(7.0, 3.2, soft));
  float coreStruct = nucleus * 1.4 + ribs * structure * 0.8;

  return vec3(interior, rim, coreStruct);
}

// marginal tentacle fringe around a hero bell, seen from above: fine strands
// radiating just past the rim all the way around, gently waving. `rad`/`ang`
// are the bell-local polar coords (rad=1 at the rim). Reads correctly from a
// top-down view — no gravity-aligned curtain.
float fringe(float rad, float ang, float seed, float t, float len, float nStr) {
  float ro = (rad - 0.96) / max(len, 1e-4);   // 0 at the rim .. 1 at the tips
  if (ro <= 0.0 || ro >= 1.0) return 0.0;
  float wob  = sin(t * 1.1 + seed * 5.0 + ang * 3.0) * 0.45;   // lazy wave
  float comb = pow(0.5 + 0.5 * sin(ang * nStr + wob), 4.0);    // thin strands
  return comb * (1.0 - ro) * smoothstep(0.0, 0.18, ro);        // taper to tips
}

// one parallax layer of low-detail jellies behind the hero bells: a hash grid
// with one slowly-rising, looping, faintly-pulsing bell per cell. `detail`
// gates how much shape it gets — near layers show a soft rim ring and the
// four-gonad cross, far layers collapse to plain domes (cheap: no atan).
vec3 hazeLayer(vec2 uv, float t, float scale, float driftRate, float detail,
               vec3 tint0, vec3 tint1, float so) {
  vec3 acc = vec3(0.0);
  vec2 cellId = floor(uv * scale + so);
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 cc = cellId + vec2(float(ox), float(oy));
      float h = hash21(cc + so);
      if (hash21(cc + so + 13.1) > 0.85) continue;       // organic gaps
      float rise = fract(hash21(cc + so + 5.0) + t * driftRate * (0.6 + 0.8 * h));
      float sway = 0.10 * sin(t * 0.6 + h * 6.28);
      vec2  jc = (cc + vec2(h + sway, rise)) / scale;
      vec2  p  = (uv - jc) * scale;
      float rr = mix(0.34, 0.72, h);
      vec2  pe = vec2(p.x, p.y * 1.2);                    // dome a touch wide
      float rad = length(pe) / rr;
      if (rad > 1.5) continue;                            // outside this bell
      float pulse = 0.85 + 0.15 * sin(t * 1.3 + h * 6.0);
      float lum = exp(-rad * rad * 1.8) * 0.7;            // soft dome
      if (detail > 0.01) {
        float ang = atan(pe.y, pe.x);
        lum += exp(-pow((rad - 0.85) * 4.0, 2.0)) * 0.8 * detail;             // rim ring
        lum += (0.5 + 0.5 * cos(ang * 4.0)) * exp(-pow((rad - 0.45) * 3.0, 2.0)) * 0.55 * detail; // 4 gonads
      }
      float vis = smoothstep(0.0, 0.13, rise) * (1.0 - smoothstep(0.85, 1.0, rise));
      acc += mix(tint0, tint1, h) * lum * vis * pulse;
    }
  }
  return acc;
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / res.y;   // y in -0.5..0.5
  float t   = u_time * u_speed;
  float structure = clamp(u_structure, 0.0, 1.0);

  // colored water atmosphere: a slow drifting glow field so the frame is never
  // dead black between the lanterns; brighter up top, with a soft caustic crawl.
  vec3 atm = mix(pal(0), pal(2), 0.5 + 0.4 * sin(uv.x * 2.4 + t * 0.12));
  atm = mix(atm, pal(1), 0.25 + 0.25 * sin(uv.y * 1.8 - t * 0.1));
  float depth   = 0.5 + 0.5 * (-uv.y);                 // brighter toward the top
  float shimmer = 0.5 + 0.5 * sin(uv.x * 3.0 + t * 0.25) * sin(uv.y * 2.3 - t * 0.20);
  vec3 col = vec3(BG) + atm * u_atmosphere * (0.05 + 0.07 * shimmer) * (0.45 + 0.7 * depth);

  // three parallax layers of low-detail jellies in the deep water, drawn first
  // so the hero bells sit in front. Near layer is bigger/brighter with rim +
  // gonads; the far layers shrink, dim and lose detail toward plain domes.
  if (u_haze > 0.01) {
    float hz = clamp(u_haze, 0.0, 1.0);
    vec3 near = hazeLayer(uv, t, mix(6.0,  13.0, hz), 0.06,  0.7, pal(2), pal(0),  0.0);
    vec3 mid  = hazeLayer(uv, t, mix(10.0, 21.0, hz), 0.045, 0.3, pal(1), pal(2), 31.7);
    vec3 far  = hazeLayer(uv, t, mix(16.0, 33.0, hz), 0.03,  0.0, pal(2), pal(1), 71.3);
    col += (near * 0.14 + mid * 0.10 + far * 0.07) * hz * (0.55 + 0.6 * depth);
  }

  // up to MAX_LANTERNS structured lanterns, anchored across the frame and
  // wandering on small looping orbits, each cycling through the four palette
  // colours. u_count culls the tail; u_depth scatters them through depth so
  // some sit far (small, dim, blurred) and some near (big, sharp).
  for (int i = 0; i < MAX_LANTERNS; i++) {
    float fi = float(i);
    if (fi > u_count - 1.0) break;
    float ph = fi * 1.2566;
    float sp = 0.09 + 0.035 * fi;

    // random depth 0 (near) .. 1 (far), skewed toward far so a dense haze of
    // small faint lanterns sits behind a few big sharp near ones.
    float dd = pow(hash11(fi * 1.7 + 3.0), 0.7) * clamp(u_depth, 0.0, 1.0);

    // hash-scattered anchor that fills the whole frame (no central void), with
    // y pushed past the edges so bells crowd in from top and bottom too.
    vec2 anchor = vec2(hash11(fi * 1.3 + 0.5) * 1.9 - 0.95,
                       hash11(fi * 2.7 + 4.2) * 1.3 - 0.65);
    vec2 c = anchor + vec2(
      0.24 * sin(t * sp + ph) + 0.10 * cos(t * sp * 0.6 + ph * 1.7),
      0.20 * cos(t * sp * 0.8 + ph * 1.3) + 0.09 * sin(t * sp * 0.5 + ph)
    );

    // per-jelly randomization (scaled by u_variety): size, glow and interior
    // detail all jitter so the school reads as many individuals, not clones.
    float var    = clamp(u_variety, 0.0, 1.0);
    float vSize   = mix(1.0, mix(0.66, 1.34, hash11(fi * 7.9 + 6.0)), var);
    float vGlow   = mix(1.0, mix(0.6,  1.25, hash11(fi * 9.3 + 8.0)), var);
    float vDetail = mix(1.0, mix(0.3,  1.0,  hash11(fi * 6.1 + 2.0)), var);
    float vHue    = (hash11(fi * 11.7 + 4.0) - 0.5) * 2.0 * var;

    // breathing brightness + radius, out of phase per orb. Far lanterns shrink
    // hard (toward a third) for a deep, parallaxed field.
    float br = 0.55 + 0.45 * sin(t * (0.35 + 0.05 * fi) + ph * 2.0);
    float r  = mix(0.22, 0.36, 0.5 + 0.5 * sin(t * 0.3 + ph)) * u_size
             * mix(1.0, 0.32, dd) * vSize;

    vec2 d = uv - c;
    // cheap cull: skip fragments well outside this bell's bloom (the marginal
    // fringe sits at rad ~1.4, comfortably inside this reach)
    float reach = r * mix(1.8, 2.4, dd);
    if (dot(d, d) > reach * reach) continue;

    // per-jelly fringe length (as a fraction past the rim) and strand count;
    // far jellies wear a shorter, finer fringe.
    float fringeLen = u_tentacles * mix(0.18, 0.40, hash11(fi * 4.3 + 2.0))
                    * mix(1.0, 0.6, dd);
    float nFr = 22.0 + floor(hash11(fi * 8.1 + 5.0) * 34.0);

    // per-lantern shape: squash to an oval, tilt off-axis, and a tri-lobe rim
    // wobble so no two bells are the same circle. u_shape scales the whole
    // effect; area-preserving squash keeps radii consistent.
    float sh = clamp(u_shape, 0.0, 1.0);
    float aspect = mix(1.0, mix(0.72, 1.4, hash11(fi * 3.1 + 1.0)), sh);
    float tilt   = (hash11(fi * 5.7 + 9.0) - 0.5) * 2.6 * sh;
    float cs = cos(tilt), sn = sin(tilt);
    vec2 dl = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
    dl = vec2(dl.x / aspect, dl.y * aspect);
    float aw = atan(dl.y, dl.x);
    dl *= 1.0 + sh * 0.14 * sin(aw * 3.0 + fi * 2.0);

    // far lanterns AND randomly low-detail ones lose interior structure
    float structPer = structure * mix(1.0, 0.25, dd) * vDetail;
    vec3 L = lantern(dl, r, fi * 0.37, t, structPer, dd);

    // two adjacent palette hues per orb; spread controls hue variety, the
    // per-jelly hue jitter nudges the selection so neighbours differ.
    float sel = mod(fi * mix(0.0, 1.7, u_colorSpread) + vHue * 1.3 + t * 0.05 + 0.5, 4.0);
    vec3  cc  = mix(pal(int(sel)), pal(int(mod(sel + 1.0, 4.0))), fract(sel));
    float clum = dot(cc, vec3(0.299, 0.587, 0.114));
    cc = clamp(mix(vec3(clum), cc, u_saturation), 0.0, 1.0);
    vec3  rimCol = mix(cc, vec3(1.0), 0.18);          // membrane reads brighter
    vec3  ribCol = mix(cc, vec3(1.0), 0.12);          // ribs keep palette hue

    float em = mix(0.6, 1.0, br) * u_glow * vGlow * mix(1.0, 0.32, dd); // far ones fade out
    col += cc     * L.x * 0.62 * em;                  // interior + caustic web
    col += rimCol * L.y * 0.72 * em;                  // bright membrane rim
    col += ribCol * L.z * 0.80 * em;                  // nucleus + ribs

    // marginal tentacle fringe radiating around the rim (top-down correct);
    // tinted by the jelly's own hue, fainter than the bell.
    if (u_tentacles > 0.01) {
      float radL = length(dl) / max(r, 1e-3);
      float angL = atan(dl.y, dl.x);
      float fr = fringe(radL, angL, fi * 0.37, t, fringeLen, nFr);
      col += mix(cc, vec3(1.0), 0.12) * fr * 0.45 * em;
    }
  }

  // tone curve: overlaps keep glowing without blowing to white; deep base kept
  col = col / (col + vec3(0.62));
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
