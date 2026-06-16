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
uniform float u_count;     // how many lanterns are alive, 3..16        (default 12)
uniform float u_depth;     // randomized depth: far ones shrink+fade+blur(default 0.6)

const int   MAX_LANTERNS = 16;  // GLSL needs a const loop bound; u_count culls
const float BG = 0.035;   // deep-water base, ~#09090B

// cheap per-lantern hash for a stable random depth, 0..1
float hash11(float n) { return fract(sin(n * 91.37 + 2.1) * 43758.5453); }

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

  // up to MAX_LANTERNS structured lanterns, anchored across the frame and
  // wandering on small looping orbits, each cycling through the four palette
  // colours. u_count culls the tail; u_depth scatters them through depth so
  // some sit far (small, dim, blurred) and some near (big, sharp).
  for (int i = 0; i < MAX_LANTERNS; i++) {
    float fi = float(i);
    if (fi > u_count - 1.0) break;
    float ph = fi * 1.2566;
    float sp = 0.09 + 0.035 * fi;

    // random depth 0 (near) .. 1 (far), scaled by u_depth
    float dd = hash11(fi * 1.7 + 3.0) * clamp(u_depth, 0.0, 1.0);

    vec2 anchor = vec2(0.86 * sin(fi * 2.3 + 0.7),
                       0.40 * cos(fi * 1.7 + 1.1));
    vec2 c = anchor + vec2(
      0.24 * sin(t * sp + ph) + 0.10 * cos(t * sp * 0.6 + ph * 1.7),
      0.20 * cos(t * sp * 0.8 + ph * 1.3) + 0.09 * sin(t * sp * 0.5 + ph)
    );

    // breathing brightness + radius, out of phase per orb. Bigger than v1 so
    // the structured bells read at fullsize and fill the frame. Far lanterns
    // shrink toward half size.
    float br = 0.55 + 0.45 * sin(t * (0.35 + 0.05 * fi) + ph * 2.0);
    float r  = mix(0.22, 0.36, 0.5 + 0.5 * sin(t * 0.3 + ph)) * u_size
             * mix(1.0, 0.5, dd);

    vec2 d = uv - c;
    // cheap cull: skip fragments well outside this lantern's bloom (wider when
    // far, since the soft rim/halo reaches further out)
    float reach = r * mix(1.8, 2.4, dd);
    if (dot(d, d) > reach * reach) continue;

    // far lanterns lose interior structure (toward plain soft glow)
    float structPer = structure * mix(1.0, 0.25, dd);
    vec3 L = lantern(d, r, fi * 0.37, t, structPer, dd);

    // two adjacent palette hues per orb; spread controls hue variety, saturation
    // the vividness.
    float sel = mod(fi * mix(0.0, 1.7, u_colorSpread) + t * 0.05 + 0.5, 4.0);
    vec3  cc  = mix(pal(int(sel)), pal(int(mod(sel + 1.0, 4.0))), fract(sel));
    float clum = dot(cc, vec3(0.299, 0.587, 0.114));
    cc = clamp(mix(vec3(clum), cc, u_saturation), 0.0, 1.0);
    vec3  rimCol = mix(cc, vec3(1.0), 0.18);          // membrane reads brighter
    vec3  ribCol = mix(cc, vec3(1.0), 0.12);          // ribs keep palette hue

    float em = mix(0.6, 1.0, br) * u_glow * mix(1.0, 0.32, dd); // far ones fade out
    col += cc     * L.x * 0.62 * em;                  // interior + caustic web
    col += rimCol * L.y * 0.72 * em;                  // bright membrane rim
    col += ribCol * L.z * 0.80 * em;                  // nucleus + ribs
  }

  // tone curve: overlaps keep glowing without blowing to white; deep base kept
  col = col / (col + vec3(0.62));
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
