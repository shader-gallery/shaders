// wisp (Bloom) — two or three pale teardrop flames wandering weightlessly over
// dark marsh water. Each flame is a vertical SDF teardrop softened by FBM
// interior flicker; it follows a smooth quasi-periodic path (a sum of
// incommensurate sines) that produces pauses, swerves and apparent intent at
// walking pace, while the body flickers at a faster, subtler rate. Each flame
// drags a thin fading filament tracing the path it just travelled — the path is
// analytic, so the trail is drawn by sampling earlier path times. A barely-there
// mist band breathes along the bottom edge. Cool palette tints, each different.
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
uniform float u_wanderSpeed;  // path travel speed              (default 0.4)
uniform float u_flameSize;    // teardrop height, css px        (default 66)
uniform float u_count;        // how many flames wander, 2..6   (default 5)
uniform float u_flicker;      // FBM interior flicker amplitude (default 0.8)
uniform float u_trailLength;  // beaded filament reach          (default 0.6)

const vec3  BG       = vec3(0.030, 0.032, 0.040); // near-black marsh base
const float NFLAMES  = 6.0;                        // literal loop bound

// ---- hash / value noise / fbm -------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
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
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return s;
}

// Analytic wander path for flame index fi at path-time pt, in CSS px relative to
// screen centre. Sum of incommensurate sines so it never visibly repeats and
// produces pauses + swerves. Returns a position the trail can re-sample.
vec2 wanderPath(float fi, float pt) {
  float seed = fi * 17.123;
  // incommensurate angular frequencies (irrational-ish ratios)
  float x =
      sin(pt * 0.31 + seed * 1.7) * 0.34
    + sin(pt * 0.53 + seed * 0.9) * 0.18
    + sin(pt * 0.127 + seed * 2.3) * 0.22;
  float y =
      sin(pt * 0.37 + seed * 2.1) * 0.20
    + sin(pt * 0.181 + seed * 1.3) * 0.16
    + cos(pt * 0.089 + seed * 0.6) * 0.10;
  // bias each flame to its own zone and keep them in frame
  float zone = (fi / max(NFLAMES - 1.0, 1.0) - 0.5);
  return vec2(x + zone * 0.46, y + 0.04);
}

// teardrop / flame field: a rounded bulb at the bottom tapering to a tip at the
// top (classic flame). p is in flame-local units where ~1.0 == one flame height,
// y up. The body spans roughly y in [-0.5, +0.5]: bulb low, tip high.
// wob (FBM-driven) widens/narrows the profile to give the flicker. Returns 0..1.
float teardrop(vec2 p, float wob) {
  float y = p.y;
  // normalised height along the flame: 0 at the rounded base, 1 at the tip
  float h = clamp((y + 0.5), 0.0, 1.0);
  // half-width profile: full near the base, sharpening to a point at the tip.
  // sin(pi*h)-ish rise then a strong taper makes the rounded-bottom teardrop.
  float w = pow(1.0 - h, 0.85) * sqrt(clamp(h * 4.0, 0.0, 1.0)) * 0.34;
  w *= 1.0 + wob;                                  // flicker widens/narrows
  w = max(w, 0.010);
  // round the very bottom so the base is a bulb, not a flat cut
  float baseRound = 1.0 - smoothstep(0.0, 0.14, -p.y - 0.36);
  float d = abs(p.x) / w;                          // 0 on axis, 1 at edge
  float body = (1.0 - smoothstep(0.55, 1.05, d)) * baseRound;
  // fade the tip out softly so it doesn't end abruptly
  body *= (1.0 - smoothstep(0.40, 0.55, y));
  return body;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // CSS-px world centred on screen. gl_FragCoord origin is bottom-left, so this
  // P already has y pointing UP (no flip needed) — flame tips point to +y.
  vec2 P = (fc - ctr) / pr;

  // span in css px used to map normalised path coords -> screen
  float span = min(res.x, res.y) / pr;

  vec3 col = BG;

  float flameH  = max(u_flameSize, 4.0) * pr;       // height in device px
  float flameHc = flameH / pr;                       // height in css px
  float ptBase  = t * (0.10 + u_wanderSpeed * 0.55); // walking-pace path time

  // palette with fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // accumulate flames + their trailing filaments
  for (int fi = 0; fi < 6; fi++) {
    float f = float(fi);
    if (f > u_count - 0.5) continue;   // u_count gates how many wander

    // each flame a slightly different cool tint, mixed from the (cool) palette
    float tk = fract(0.18 + f * 0.31);
    vec3 tint = mix(c2, c0, tk);
    tint = mix(tint, c1, 0.30 * f);
    tint = clamp(tint, 0.0, 1.0);

    // ---- current head position (css px, screen space) ----
    vec2 pn   = wanderPath(f, ptBase);
    vec2 head = pn * vec2(span * 0.54, span * 0.40); // screen-space offset (css)

    // long private brightness cycle (breathing swell), per flame
    float swell = 0.55 + 0.45 * sin(t * (0.16 + 0.05 * f) + f * 2.3);

    // ---- the trailing filament: sample earlier path times ----
    // (path is analytic, so we walk pt backwards and find nearest approach)
    float trail = 0.0;
    for (int s = 1; s <= 28; s++) {
      float fs = float(s);
      // step back in path-time; trailLength stretches the reach.
      // start the trail just behind the head so it reads as leaving the base.
      float back = fs * (0.04 + 0.115 * u_trailLength);
      vec2  qn   = wanderPath(f, ptBase - back);
      vec2  q    = qn * vec2(span * 0.54, span * 0.40);
      // anchor the filament near the base of the flame, not its tip
      q += vec2(0.0, -0.18 * flameHc);
      float dseg = length(P - q);
      // thin filament, fainter the further back we go (a touch wider so the
      // discrete path samples blend into one continuous thread)
      float thin = flameHc * (0.075 + 0.022 * u_trailLength);
      float fade = (1.0 - fs / 28.0);
      fade *= fade;
      // beaded texture: brightness pulses along the trail (droplets of cold
      // fire strung on the thread) rather than a flat filament.
      float bead = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(fs * 1.4 - t * 1.6 + f * 2.0), 2.2);
      trail += exp(-dseg * dseg / (thin * thin)) * fade * bead;
    }
    // normalise vs step density, then scale by length & breathing brightness
    trail *= u_trailLength * (0.8 + 0.4 * swell);

    // ---- the flame body ----
    // local coords: x across, y along flame height; teardrop expects ~unit height
    vec2 local = (P - head) / flameHc;
    // gentle upward lean & sway as it wanders
    float sway = sin(t * 1.1 + f * 2.0) * 0.05;
    local.x -= sway * local.y;

    // faster FBM flicker inside the body — at high u_flicker it gutters like a
    // flame in wind: the silhouette wobbles, the tip licks sideways and the
    // brightness flutters; at 0 it's a calm, steady glow.
    vec2 fcoord = local * vec2(3.2, 2.4) + vec2(f * 9.0, -t * (2.2 + u_flicker * 2.4));
    float fb  = fbm(fcoord);
    float fb2 = fbm(fcoord * 1.9 + vec2(3.0, -t * (1.0 + u_flicker)));
    // lateral lick that grows up the flame (tip flutters most)
    float lick = (fb - 0.5) * u_flicker * 0.42 * clamp(local.y + 0.5, 0.0, 1.2);
    vec2 flLocal = local;
    flLocal.x -= lick;
    float wob = (fb2 - 0.5) * (0.16 + u_flicker * 0.85);    // width wobble
    float body = teardrop(flLocal, wob);

    // interior texture + brightness flutter (the guttering)
    float interior = 0.58 + 0.42 * fb;
    float flutter  = 1.0 - u_flicker * 0.45 * (0.5 - fb2);  // 0.5..1.x dimming
    interior = mix(1.0, interior * flutter, clamp(u_flicker * 0.7, 0.0, 1.0));
    body *= max(interior, 0.0);

    // hot core sits low, in the bulb of the teardrop
    vec2 cc = local - vec2(0.0, -0.22);
    float core = exp(-dot(cc, cc) * 11.0);

    // soft outer halo, vertically stretched to follow the flame (not a box)
    vec2 hc = local * vec2(1.6, 0.85) - vec2(0.0, -0.05);
    float halo = exp(-dot(hc, hc) * 2.4);

    float bright = swell;

    // compose this flame (cool tint body + whiter hot core + faint halo)
    col += tint * body * 1.45 * bright;
    col += mix(tint, vec3(1.0), 0.6) * body * core * 1.15 * bright;
    col += tint * halo * 0.24 * bright;
    // beaded filament trail in the same tint, dimmer than the body but readable
    col += tint * trail * 1.0;
  }

  // ---- barely-there mist band along the bottom edge ----
  float yb = fc.y / res.y;                   // 0 bottom .. 1 top
  float mistBand = (1.0 - smoothstep(0.0, 0.22, yb));
  float mistTex = fbm(vec2(fc.x / (res.x) * 5.0, t * 0.06)) * 0.6 + 0.4;
  float mistBreathe = 0.6 + 0.4 * sin(t * 0.23);
  vec3  mistCol = mix(c2, c0, 0.5) * 0.10;
  col += mistCol * mistBand * mistTex * mistBreathe;

  // gentle vignette to keep edges dark and the marsh deep
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.72, 1.0, vign);

  // subtle tonemap to tame any hot core without washing out
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
