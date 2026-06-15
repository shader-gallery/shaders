// rush (Sough) — a single rank of cattail rushes along a waterline in the lower
// third: straight slender stems, each carrying one dark sausage-shaped head near
// its tip, silhouetted a hair above black against a faintly graded night sky.
// Below the waterline, still black water holds a dim, vertically-stretched mirror
// of the rank. A gust front crosses the rank stem by stem — each rush bows in
// turn, tip overshooting, root fixed at the waterline — then springs back through
// shrinking swings into a long stillness. Glow gathers on a stem's downwind edge
// and rims its head only when bent; the reflection echoes the same light a shade
// dimmer and a beat softer, wobbling as if the water answers late. Stems blend two
// cool palette colours; heads rim in a warmer third; the sky grade carries the
// fourth. Calm is the resting state; excitation is intermittent and traveling.
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
uniform float u_gustRate;   // how often gust fronts cross the bed  (default 0.4)
uniform float u_bend;       // how far rushes bow & overshoot       (default 1.0)
uniform float u_spacing;    // css-px between rushes (scaled by pr)  (default 26)
uniform float u_reflect;    // brightness of the mirrored rank       (default 0.55)
uniform float u_randomize;  // per-stem height/phase variation 0..1   (default 1)
uniform float u_height;     // reed height scale                      (default 1)
uniform float u_sunX;       // sun horizontal position 0..1           (default 0.6)
uniform float u_ripple;     // water ripple / shimmer strength        (default 1)
uniform float u_dusk;       // dusk sky brightness                    (default 1)
uniform float u_hills;      // far-shore hill height (depth)          (default 1)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float WATER_FRAC  = 0.66;   // waterline height as fraction up from bottom
const float STEM_CSS    = 1.6;    // stem half-width in css px
const float STEMH_CSS   = 150.0;  // nominal stem height in css px
const float HEAD_CSS    = 5.5;    // cattail head half-width in css px
const float HEADLEN_CSS = 34.0;   // cattail head length in css px
const float FRONT_CSS   = 220.0;  // spatial width of one gust front in css px

// hash for per-stem jitter (height, phase)
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// gentle continuous sway: each reed leans on its own slow, multi-frequency
// drift so the bed is always softly alive — no gust events, no dead calm, just a
// lazy dusk breeze. `spd` paces it; the result is a small signed lean amplitude.
float drift(float id, float t, float spd) {
  float ph1 = hash11(id * 3.1) * 6.2831853;
  float ph2 = hash11(id * 1.7) * 6.2831853;
  float s1 = sin(t * spd * 0.45 + ph1);
  float s2 = sin(t * spd * 0.78 + ph2) * 0.4;
  return (s1 + s2) * 0.15;            // small amplitude -> a gentle, clearly-read lean
}

// distance from point p to a vertical-ish capsule segment a->b, half-width r
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * hh) - r;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// Evaluate the rank silhouette + its glow at a sample point `q` (device px),
// using a bend that is sampled with an optional time-lag `lag` (for the
// reflection's late answer) and a vertical wobble already folded into `q`.
// Writes accumulated silhouette coverage into `sil` and glow colour into `glow`.
void rank(vec2 q, float pr, float spacing, float waterY, float lag,
          out float sil, out vec3 glow, vec3 c0, vec3 c1, vec3 c2) {
  sil = 0.0;
  glow = vec3(0.0);

  float stemHW  = STEM_CSS * pr;
  float headHW  = HEAD_CSS * pr;
  float headLen = HEADLEN_CSS * pr;
  float t       = u_time - lag;

  float spd     = max(u_gustRate, 0.001);   // now paces the gentle continuous sway
  float nearest = floor(q.x / spacing);

  // walk a small fixed window of stems around this fragment (const bound)
  for (int i = -3; i <= 3; i++) {
    float id   = nearest + float(i);
    // u_randomize spreads every per-stem trait (0 = even rank, 1 = wild scatter):
    // root spacing, height (a wide tall/short mix), sway amount and head size.
    float rnd  = clamp(u_randomize, 0.0, 1.0);
    float root = (id + 0.5) * spacing + (hash11(id * 4.3) - 0.5) * spacing * 0.5 * rnd;
    // u_height scales the bed; the per-stem factor now spans a wide 0.55..1.5 so
    // some rushes stand tall and others stay short (a natural reed bed).
    float hgt  = STEMH_CSS * pr * (0.55 + 0.95 * mix(0.5, hash11(id * 1.7), rnd)) * clamp(u_height, 0.4, 1.6);
    float swayK = mix(1.0, 0.45 + 1.1 * hash11(id * 6.1), rnd);   // some lean more
    float headSc = mix(1.0, 0.65 + 0.7 * hash11(id * 8.9), rnd);  // varied head size
    // each reed drifts on its own slow phase so the rank never moves in lockstep
    float amp = drift(id, t, spd) * u_bend * swayK;

    vec2 base = vec2(root, waterY);                 // root pinned to waterline
    // tip displaced by amp*hgt; mid-stem bows so it reads as a bend, not a tilt
    float topx = root + amp * hgt * 0.55;
    vec2 tip  = vec2(topx, waterY + hgt);
    vec2 mid  = vec2(root + amp * hgt * 0.42, waterY + hgt * 0.55);

    // two capsule segments approximate the bowed stem (root->mid, mid->tip)
    float d1 = sdCapsule(q, base, mid, stemHW);
    float d2 = sdCapsule(q, mid,  tip, stemHW * 0.85);
    float ds = min(d1, d2);

    // cattail head: a fat sausage sitting just below the tip on the stem
    // (per-stem size variation via headSc)
    float headLenK = headLen * headSc;
    float headHWK  = headHW  * headSc;
    float headFrac = clamp(headLenK / max(hgt, 1.0), 0.0, 0.5);
    vec2 hb = mix(mid, tip, 0.58 - headFrac * 0.5);
    vec2 ht = mix(mid, tip, 0.58 + headFrac * 0.5);
    float dh = sdCapsule(q, hb, ht, headHWK);

    float aa = 1.5 * pr;
    float sStem = 1.0 - smoothstep(0.0, aa, ds);
    float sHead = 1.0 - smoothstep(0.0, aa, dh);
    sil = max(sil, max(sStem, sHead));
    // no rim glow: the reeds read as clean dusk silhouettes; movement is carried
    // by their gentle continuous sway and the wavering reflection alone.
  }
}

// dusk sky colour at a normalized height above the horizon (0 = waterline,
// 1 = top of frame): warm glowing horizon grading to a cool violet zenith.
vec3 skyAt(float yA, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 horizon = mix(c3, c2, 0.30);              // warm dusk (red/orange + teal)
  vec3 zenith  = mix(c0, c1, 0.55);              // cool blue/violet up high
  vec3 s = mix(horizon, zenith, smoothstep(0.0, 0.85, yA));
  // a band of dusk glow hugging the horizon
  s += mix(c3, vec3(1.0,0.85,0.7), 0.3) * exp(-yA / 0.22) * 0.5;
  return s * 0.55 * clamp(u_dusk, 0.3, 1.8);     // overall dusk brightness (u_dusk)
}

// far-shore rolling hills for depth: two layered ridge silhouettes hugging the
// horizon behind the reeds. Composites the hills into `base`. `yA` is px above
// the horizon (waterline) — feed the mirrored height for the reflection pass.
// `hs` (u_hills) raises/lowers the ridges; `crest` tints the dusk-lit hilltops.
vec3 hills(vec3 base, float xPx, float yA, float pr, float skyH, float hs, vec3 crest) {
  float x = xPx / pr;
  float aa = 2.0 * pr;
  vec3 c = base;
  // FOUR receding ridges drawn back -> front. The back ranges sit HIGHER and
  // hazier (atmospheric perspective), the near ones LOWER and darker, so each
  // ridge peeks above the one in front of it — layered horizons selling depth.
  for (int k = 0; k < 4; k++) {
    float fk   = float(k) / 3.0;                 // 0 = farthest .. 1 = nearest
    float seed = float(k) * 7.31 + 0.4;
    float baseH = skyH * hs * (0.130 - 0.082 * fk);          // back highest, front lowest
    float ampH  = skyH * hs * (0.022 + 0.030 * (1.0 - fk));  // back rolls more broadly
    float freq  = 0.0024 + 0.0030 * fk;                      // near ridges finer-grained
    float h = baseH + ampH * (0.6 * sin(x * freq + seed) + 0.4 * sin(x * freq * 2.1 + seed * 1.7));
    float m = smoothstep(0.0, aa, h - yA);
    // colour: far ridges hazed toward the sky, near ridges near-black silhouettes
    vec3 ridgeCol = mix(mix(base, vec3(0.06, 0.06, 0.10), 0.5),
                        vec3(0.012, 0.012, 0.026), fk);
    c = mix(c, ridgeCol, m * (0.7 + 0.3 * fk));
    // a dusk-lit crest skims the nearest ridge's top edge
    if (k == 3) c += crest * exp(-abs(h - yA) / (2.5 * pr)) * step(-6.0*pr, h - yA) * 0.16;
  }
  return c;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing * refScale * pr, 4.0);
  float waterY  = res.y * (1.0 - WATER_FRAC); // device-px y of the waterline
  float skyH    = max(res.y - waterY, 1.0);

  // low dusk sun sitting just above the horizon (u_sunX moves it along it)
  float sunX = res.x * clamp(u_sunX, 0.05, 0.95);
  vec2  sun  = vec2(sunX, waterY + skyH * 0.10);
  vec3  sunCol = mix(c3, vec3(1.0, 0.9, 0.75), 0.4);

  vec3 col;
  bool above = fc.y >= waterY;

  if (above) {
    // ----- dusk sky + the rank silhouetted against it -----
    float yA = (fc.y - waterY) / skyH;             // 0 horizon .. 1 top
    col = skyAt(yA, c0, c1, c2, c3);
    // the sun glow
    col += sunCol * exp(-length(fc - sun) / (res.y * 0.18)) * 0.6;
    // far-shore rolling hills behind the reeds (depth / scene-setting)
    col = hills(col, fc.x, fc.y - waterY, pr, skyH, clamp(u_hills, 0.0, 2.0), mix(sunCol, c2, 0.35));

    float sil; vec3 glow;
    rank(fc, pr, spacing, waterY, 0.0, sil, glow, c0, c1, c2);
    // backlit reeds: near-black silhouettes against the bright dusk sky
    col = mix(col, col * 0.08 + vec3(0.004, 0.005, 0.010), sil);
    col += glow * 1.0;                             // rim glow when bent
  } else {
    // ----- the water: a PROMINENT reflection of the dusk sky + the reeds -----
    float depth = (waterY - fc.y);                 // px below the line
    float yR = depth / skyH;                       // mirrored sky height
    // rolling ripple bands travelling down the water
    float ripple = clamp(u_ripple, 0.0, 2.0);
    // slow rolling ripple bands travelling down the water (barely breathing)
    float band = sin(depth * 0.045 / pr - t * 0.35)
               + 0.5 * sin(depth * 0.11 / pr + t * 0.22 + 1.3);
    float rippleBright = 0.85 + 0.15 * band * ripple;
    // reflected dusk sky (a touch darker + desaturated, broken by ripples)
    vec3 reflSky = skyAt(yR, c0, c1, c2, c3) * 0.82 * rippleBright;
    col = reflSky;
    // reflected sun = a slow shimmering glitter column straight below the sun
    float sunDx = (fc.x - sunX);
    float glint = exp(-(sunDx*sunDx) / (res.x*res.x*0.010))
                * (0.5 + 0.5 * sin(depth * 0.18 / pr - t * 0.9))
                * exp(-depth / (skyH * 1.1));
    col += sunCol * glint * 0.5;

    // slow horizontal shimmer so the mirror wavers like calm water
    float shimmer = sin(fc.y * 0.05 / pr + t * 0.45) * 3.0 * pr
                  * smoothstep(0.0, 60.0 * pr, depth) * ripple;
    // reflected far-shore hills, just under the horizon (mirrored, dimmed, rippled)
    float hfade = exp(-depth / (res.y * 0.55));
    col = mix(col, hills(col, fc.x + shimmer, depth, pr, skyH, clamp(u_hills, 0.0, 2.0), mix(sunCol, c2, 0.35)),
              0.8 * (0.5 + 0.5 * hfade) * rippleBright);
    vec2 q = vec2(fc.x + shimmer, waterY + depth * 1.18); // stretched mirror
    float sil; vec3 glow;
    rank(q, pr, spacing, waterY, 0.22, sil, glow, c0, c1, c2);
    float fade = exp(-depth / (res.y * 0.75));
    float r = clamp(u_reflect, 0.0, 1.5);
    // dark reed mirror over the bright reflected sky (the reflection reads clearly)
    col = mix(col, col * 0.14, sil * clamp(r, 0.0, 1.0) * (0.5 + 0.5*fade));
    col += glow * 1.3 * r * fade * rippleBright;
  }

  // crisp bright waterline glint where reeds meet their reflection
  float lineD = abs(fc.y - waterY);
  col += mix(sunCol, c2, 0.4) * 0.18 * exp(-lineD / (2.5 * pr));

  // gentle vignette keeps the frame composed
  vec2 uv = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.42, 1.05, length(uv));
  col *= mix(0.80, 1.0, vign);

  col = col / (1.0 + col * 0.4);                   // soft tonemap
  gl_FragColor = vec4(col, 1.0);
}
