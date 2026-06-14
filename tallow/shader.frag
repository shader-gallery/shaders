// tallow (Omen) — a shelf of small candle flames along the lower third: a loose
// row of teardrop SDF flames at hash-varied heights and offsets, each with a hot
// pale core, a palette-tinted mantle, and a soft breathing halo that pools light
// on the implied shelf line below. The upper two-thirds stays deep near-black,
// faintly warmed by the gathered glow. At long staggered intervals one flame
// gutters, snuffs to an ember point, and a single thin smoke thread wavers up
// before the candle slowly relights. Witchlight and quiet ritual — the occult as
// composure, never horror.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused face state
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flameCss;   // flame height in CSS px, scales cores+halos (default 36)
uniform float u_flicker;    // gutter-noise bend + brightness jitter amplitude (default 0.5)
uniform float u_snuffRate;  // how often a candle snuffs + smokes (default 0.3)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float NCAND     = 7.0;   // number of candles on the shelf (const loop bound)
const float SHELF_Y   = 0.30;  // shelf line height as fraction of frame (from bottom)

// --- hashes (deterministic, no textures) ---
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
float hash11b(float n){ return fract(sin(n * 311.7 + 1.3) * 24634.6345); }

// value noise in 1D for smooth flicker
float vnoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float a = hash11(i);
  float b = hash11(i + 1.0);
  f = f * f * (3.0 - 2.0 * f);
  return mix(a, b, f);
}

// teardrop / candle-flame signed distance in flame-local space.
// p: position relative to wick base; h: flame height; w: base half-width.
// Negative inside. A real candle flame: rounded BULB near the base, tapering to
// a sharp POINT at the top. yn=0 is the wick, yn=1 is the tip.
float sdFlame(vec2 p, float h, float w) {
  float yn = clamp(p.y / h, 0.0, 1.0);
  // width profile: starts modest at the wick, swells to a round bulb in the
  // lower third, then tapers smoothly to zero at the tip.
  // bulb: a rounded rise+fall peaking around yn~0.28
  float bulb = smoothstep(0.0, 0.18, yn) * (1.0 - smoothstep(0.22, 1.0, yn));
  // ensure the base itself is rounded (not a flat cut) — taper width near wick
  float baseRound = smoothstep(-0.06, 0.16, yn);
  float width = w * (0.16 + 0.84 * bulb) * baseRound;
  width = max(width, 0.0001);
  float dx = abs(p.x) - width;
  // vertical caps: below the wick and above the tip
  float below = -p.y;            // >0 below wick
  float above = p.y - h;         // >0 above tip
  float d = dx;
  d = max(d, below);
  d = max(d, above);
  return d;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // palette with house fallback (headless can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // warm candle assignment of palette: mantle tint, halo tint, hot core.
  // hot pale core stays a warm near-white so flames read as fire regardless of
  // theme — only lightly tinted by the brightest palette hue.
  vec3 brightHue = max(max(c0, c1), max(c2, c3));
  vec3 coreCol  = mix(vec3(1.0, 0.95, 0.82), brightHue, 0.10);
  vec3 mantleA  = c0;            // inner mantle hue
  vec3 mantleB  = c1;            // outer mantle hue
  vec3 haloCol  = mix(c0, c2, 0.5);
  vec3 emberCol = c3;           // dim ember when snuffed
  vec3 smokeCol = mix(c2, vec3(0.5,0.5,0.55), 0.4);

  // params, guarded
  float flameCss = max(u_flameCss, 1.0);
  float flicker  = clamp(u_flicker, 0.0, 1.0);
  float snuffR   = clamp(u_snuffRate, 0.0, 1.0);

  float flameH = flameCss * pr;                 // flame height in device px
  float flameW = flameH * 0.42;                 // base half-width tracks height

  // shelf geometry: a row of candles spread across the lower third
  float shelfY = res.y * SHELF_Y;               // wick-line height (device px)
  float margin = res.x * 0.12;
  float span   = res.x - margin * 2.0;

  vec3 col = BG;

  // gentle warm ambient from the gathered glow pooling upward, fades toward top
  float upWarm = smoothstep(res.y * 1.02, shelfY, fc.y);
  col += mix(c0, c1, 0.4) * upWarm * 0.032;

  // implied shelf line: a faint dark ledge with a thin lit edge where light pools
  float shelfDist = fc.y - shelfY;

  // accumulate contributions from each candle
  for (float i = 0.0; i < NCAND; i += 1.0) {
    float fi = i + 1.0;
    // hashed horizontal slot with jitter, plus per-candle height/phase variety
    float slot   = (i + 0.5) / NCAND;
    float jitter = (hash11(fi * 3.1) - 0.5) * (span / NCAND) * 0.55;
    float cx     = margin + slot * span + jitter;
    // per-candle wick height varies a touch (candles burned down differently)
    float baseY  = shelfY + (hash11b(fi) - 0.5) * flameH * 0.22;
    // per-candle scale variety (votive vs taper feel within the row)
    float hScale = 0.78 + 0.5 * hash11(fi * 5.7);
    float h      = flameH * hScale;
    float w      = flameW * hScale;

    // --- snuff / relight cycle (long, staggered per candle) ---
    // cycle period shrinks as snuffR rises (more frequent dying); the snuff event
    // also occupies a larger slice of each cycle, so at max one or more candles
    // are nearly always dying/dark/relighting somewhere in the row.
    float period = mix(80.0, 11.0, snuffR);     // seconds between snuff events
    float snuffLen = mix(6.0, 8.5, snuffR);      // dying+dark+relight duration
    float phase  = hash11(fi * 13.3) * period;   // stagger candles
    float ct     = mod(t + phase, period);
    // life: 1 = fully lit, 0 = fully snuffed (ember+smoke). gradual fades.
    float life = 1.0;
    float smokeAmt = 0.0;
    if (snuffR > 0.001) {
      float s = ct;                               // 0..period
      // dying ramp, dark hold, relight ramp inside [0, snuffLen]
      if (s < snuffLen) {
        float u = s / snuffLen;                   // 0..1 across the event
        // life dips to ~0 with a wide dark hold in the middle, returns at ends
        float dip = smoothstep(0.0, 0.26, u) * (1.0 - smoothstep(0.70, 1.0, u));
        life = 1.0 - dip;                          // 1 -> ~0 -> 1
        // smoke rises during/after the dark trough
        smokeAmt = smoothstep(0.16, 0.40, u) * (1.0 - smoothstep(0.82, 1.0, u));
      }
    }

    // --- flicker / gutter noise: bend the flame + jitter brightness ---
    float fseed = fi * 7.0;
    // candle-speed wavering, independent per candle
    float bendN = vnoise1(t * 3.1 + fseed) - 0.5
                + 0.5 * (vnoise1(t * 6.7 + fseed * 1.7) - 0.5);
    float bright = 0.8 + 0.4 * (vnoise1(t * 5.0 + fseed * 2.3) - 0.5) * 2.0;
    bright = mix(1.0, bright, flicker);

    // local coordinates relative to wick base
    vec2 p = fc - vec2(cx, baseY);
    // bend grows toward the tip (base anchored on the wick)
    float yn = clamp(p.y / h, 0.0, 1.4);
    float bendAmt = flicker * h * 0.30;
    p.x -= bendN * bendAmt * yn * yn;
    // slight asymmetric lean from a slow draught
    p.x -= sin(t * 0.7 + fi) * flicker * h * 0.05 * yn;

    // flame shrinks as it dies
    float lh = h * mix(0.18, 1.0, life);
    float lw = w * mix(0.30, 1.0, life);

    float d = sdFlame(p, lh, lw);

    // --- flame body shading ---
    // soft anti-aliased fill; inside the SDF d<0
    float edge = pr * 1.5;
    float fill = 1.0 - smoothstep(-edge, edge, d);
    // distance into the flame for core/mantle gradient (0 at edge -> deep inside)
    float inside = clamp(-d / (lw + 0.0001), 0.0, 1.0);
    // height factor: 0 at wick, 1 at tip. The hot core lives low (the bulb),
    // the tip is cooler and dimmer — that vertical gradient sells "flame".
    float hf = clamp(p.y / max(lh, 0.0001), 0.0, 1.0);
    // hot pale core: deep inside AND in the lower bulb (peaks around hf~0.22)
    float lowCore = smoothstep(0.06, 0.24, hf) * (1.0 - smoothstep(0.24, 0.62, hf));
    lowCore = max(lowCore, 1.0 - smoothstep(0.0, 0.30, hf)); // also hot right at wick
    float coreMask = smoothstep(0.30, 0.92, inside) * lowCore;
    // mantle gradient: outer edge cool, inner warm; tip biases to outer mantle
    vec3 mantle = mix(mantleB, mantleA, inside * (1.0 - hf * 0.55));
    vec3 flameCol = mix(mantle, coreCol, coreMask);

    // overall flame intensity: brighter in the bulb, fading toward the cool tip
    float vGrad = mix(1.0, 0.45, smoothstep(0.2, 1.0, hf));
    float intensity = fill * bright * life * vGrad;
    col += flameCol * intensity * 1.5;
    // extra hot-core bloom concentrated in the bulb so the core reads pale-hot
    col += coreCol * coreMask * fill * bright * life * 0.7;

    // --- breathing halo: soft glow pooling around + below the flame ---
    // halo center a bit above the wick, breathes on a slow per-candle phase
    float breathe = 0.78 + 0.22 * sin(t * 0.6 + fi * 1.9);
    vec2  hc = vec2(cx, baseY + h * 0.32);
    vec2  hp = (fc - hc);
    // anisotropic: wider pooling on the shelf, taller upward
    float hr = h * (1.3 + 0.5 * breathe);
    float halo = exp(-dot(hp, hp) / (hr * hr));
    col += haloCol * halo * 0.34 * mix(0.25, 1.0, life) * bright;

    // light pooled on the implied shelf just below the flame
    float poolX = exp(-((fc.x - cx) * (fc.x - cx)) / (h * h * 1.6));
    float poolY = exp(-(shelfDist * shelfDist) / (h * h * 0.30));
    float pool  = poolX * poolY * step(shelfDist, h * 0.2);
    col += haloCol * pool * 0.30 * mix(0.2, 1.0, life) * breathe;

    // --- ember point when snuffed: a dim glowing wick tip ---
    float emb = 1.0 - life;
    vec2 ep = fc - vec2(cx, baseY + h * 0.06);
    float ember = exp(-dot(ep, ep) / (lw * lw * 0.9 + pr * pr));
    col += emberCol * ember * emb * 0.55;

    // --- smoke thread: a thin wavering vertical filament above the wick ---
    if (smokeAmt > 0.001) {
      // smoke rises from wick; sample a column above baseY
      float sy = (fc.y - (baseY + h * 0.1));      // height above wick
      if (sy > 0.0) {
        float smokeH = h * 3.2;                    // how high smoke reaches
        float syn = sy / smokeH;                   // 0..1+ up the thread
        // wavering horizontal offset, grows with height, slow inscription
        float wav = (vnoise1(t * 1.3 + syn * 4.0 + fi) - 0.5);
        wav += 0.5 * (vnoise1(t * 0.8 + syn * 8.0 + fi * 2.0) - 0.5);
        float sxoff = wav * h * 0.55 * smoothstep(0.0, 0.5, syn);
        float threadX = abs((fc.x - cx) - sxoff);
        float thickness = pr * (1.2 + 2.6 * syn);  // widens as it rises/diffuses
        float thread = 1.0 - smoothstep(0.0, thickness, threadX);
        // fade with height and clip past the top
        float vfade = (1.0 - smoothstep(0.55, 1.05, syn)) * smoothstep(0.0, 0.12, syn);
        col += smokeCol * thread * vfade * smokeAmt * 0.16;
      }
    }
  }

  // back row of distant candles (depth): small dim warm glows on a higher shelf so
  // the frame reads as a deep field of candles rather than one front row (in-shader
  // fill replacing the backdrop).
  float bgShelf = res.y * 0.58;
  for (float bi = 0.0; bi < 9.0; bi += 1.0) {
    float bfi = bi + 1.0;
    float bcx = margin * 0.4 + ((bi + 0.5) / 9.0) * (res.x - margin * 0.8)
              + (hash11(bfi * 8.3) - 0.5) * (span / 9.0) * 0.7;
    float bby = bgShelf + (hash11b(bfi * 2.0) - 0.5) * flameH * 0.5;
    float bbr = 0.55 + 0.45 * sin(t * 0.5 + bfi * 1.7);   // slow distant flicker
    vec2  bp  = fc - vec2(bcx, bby);
    float bsz = flameH * 0.5;
    float bglow = exp(-dot(bp, bp) / (bsz * bsz));
    float bcore = exp(-dot(bp, bp) / (bsz * bsz * 0.13));
    col += (mix(c0, c1, 0.4) * bglow * 0.085 + coreCol * bcore * 0.16) * bbr;
  }

  // gentle vignette to keep the frame composed and edges dark
  vec2 uv = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.05, length(uv * vec2(1.0, 1.25)));
  col *= mix(0.78, 1.0, vign);

  // subtle filmic-ish roll to tame any hot core clipping, preserve glow
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
