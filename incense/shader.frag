// incense (Smolder) — two or three hair-thin incense sticks stand at staggered
// heights in a near-black room. Each live stick wears a tiny incandescent ember
// cap at its tip — a few-px white-hot core ringed by a halo grading warm-to-cool
// through the palette, with a pale ash collar just below. The ember creeps
// strictly downward over minutes, so the dark unburned stick visibly shortens
// while the dead ash above it lengthens: the whole burn history is readable at a
// glance. A thin sine-and-noise smoke filament rises from the cap and fades.
// Sticks are phase-staggered so one is always alive; a spent stick fades to
// black and a fresh dark stick fades in before its tip kindles. Flameless: the
// ember eats its own support, one-way, never retreating.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_burnRate;     // scales how fast each ember descends its stick (default 1)
uniform float u_drawPulse;    // amplitude of the slow brighten-and-bank breathing; 0 = steady glow (default 0.5)
uniform float u_smokeReach;   // how high the smoke filament climbs, css px, scaled by u_pixelRatio; 0 removes smoke (default 100)
uniform float u_emberSize;    // radius of the white-hot tip core, css px, scaled by u_pixelRatio (default 4)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black base
const float TAU = 6.28318530718;
const int   NSTICK = 3;       // number of incense sticks (literal — frag loop bound)

float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// smooth value noise (C1)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr    = max(u_pixelRatio, 0.25);
  vec2  fragPx = gl_FragCoord.xy;
  vec2  res    = max(u_resolution.xy, vec2(1.0));
  vec2  cssP   = fragPx / pr;       // css-px coords, origin bottom-left
  vec2  cssRes = res / pr;
  float t      = u_time;

  // ---- params, guarded across full slider range
  float burnRate  = max(u_burnRate, 0.001);
  float drawPulse = clamp(u_drawPulse, 0.0, 1.0);
  float emberR    = max(u_emberSize, 0.5) * pr;       // white-hot core radius (px)
  float smokeReach = max(u_smokeReach, 0.0) * pr;     // smoke climb (px); 0 = none

  vec3 col = BG;

  // sticks live in the lower two-thirds of the room. Geometry in css px so it
  // is DPR-independent; convert to device px (×pr) for distance math.
  float stickTop    = cssRes.y * 0.66;   // highest a fresh tip can reach
  float stickBottom = cssRes.y * 0.10;   // base of every stick (the burn floor)
  float fullLen     = stickTop - stickBottom;

  // life cycle: an ember crosses its stick top->bottom over T seconds, then the
  // stick fades to black and a new dark stick fades in. Stagger phases evenly so
  // one stick is always mid-burn. (per the spec — phase-staggered, always alive)
  float T = 17.0 / burnRate;             // seconds per full descent

  for (int i = 0; i < NSTICK; i++) {
    float fi  = float(i);
    // per-stick hash-staggered x offset and tiny top jitter
    float hx  = hash11(fi * 3.17 + 1.7);
    float hy  = hash11(fi * 5.91 + 4.3);
    float hph = hash11(fi * 2.13 + 9.1);

    // x position: spread across the central band, hash-staggered
    float xpos = cssRes.x * (0.28 + 0.44 * (fi + 0.5) / float(NSTICK) + (hx - 0.5) * 0.10);
    // this stick's own top (staggered height) and length
    float topY = stickTop - hy * cssRes.y * 0.16;
    float baseY = stickBottom;
    float lenY = topY - baseY;

    // life phase 0..1 across the cycle, staggered per stick
    float phase = fract(t / T + hph + fi / float(NSTICK));

    // ember position along the stick: descends monotonically while alive.
    // burnP 0..1 maps tip(top)->base(bottom). Confine active burn to the middle
    // of the cycle so there is room to fade out (spent) and fade in (fresh).
    float burnP = clamp((phase - 0.06) / 0.74, 0.0, 1.0);
    float emberY = mix(topY, baseY, burnP);

    // alive envelope: fade in a fresh dark stick, hold through the burn, fade
    // the spent stick to black. Smooth so handoff never flickers.
    float alive = smoothstep(0.02, 0.07, phase) * (1.0 - smoothstep(0.86, 0.97, phase));

    // slow private draw cycle: someone unseen breathes on the ember. At peak
    // breath the ember flares well above its banked baseline; drawPulse scales
    // how deep the swing goes (0 = a steady glow that never banks).
    float breath = 0.5 + 0.5 * sin(t * (0.5 + 0.18 * hx) + hph * TAU);
    float draw   = mix(1.0, 0.32 + 1.30 * breath, drawPulse); // banks dark, flares bright

    // horizontal distance to this stick's column (px)
    float dx = (cssP.x - xpos) * pr;

    // ---------- the unburned stick body: dark, one step above background ----------
    // visible only from the ember down to the base (above the ember is ash/empty)
    float stickHalf = 0.9 * pr;            // hair-thin
    float bodyX = 1.0 - smoothstep(stickHalf, stickHalf + 1.3 * pr, abs(dx));
    float belowEmber = smoothstep(-2.0 * pr, 2.0 * pr, (emberY - cssP.y) * pr);
    float aboveBase  = smoothstep(-2.0 * pr, 2.0 * pr, (cssP.y - baseY) * pr);
    float bodyMask = bodyX * belowEmber * aboveBase * alive;
    // faint warm-grey unburned stick
    col += mix(c0, vec3(0.5), 0.4) * 0.045 * bodyMask;

    // ---------- dead ash above the ember: slightly darker, lengthening ----------
    float aboveEmber = smoothstep(-2.0 * pr, 2.0 * pr, (cssP.y - emberY) * pr);
    float belowTop   = smoothstep(-2.0 * pr, 2.0 * pr, (topY - cssP.y) * pr);
    float ashMask = bodyX * aboveEmber * belowTop * alive;
    col -= BG * 0.45 * ashMask;            // char: a half-step darker than base
    // pale ash collar just below the cap
    float collar = exp(-pow((cssP.y - (emberY + 1.8)) , 2.0) * 0.6) * bodyX;
    col += vec3(0.40, 0.38, 0.36) * 0.10 * collar * alive;

    // ---------- the ember cap: white-hot core, palette-graded halo ----------
    vec2  ep = vec2(dx, (cssP.y - emberY) * pr);
    float dEm = length(ep);
    // core: hottest palette colour pushed toward white
    vec3  hotc = mix(c2, vec3(1.0, 0.96, 0.86), 0.62);
    float core = exp(-dEm * dEm / (emberR * emberR));
    // halo grading outward through the remaining three palette entries
    float halo = exp(-dEm / (emberR * 3.2));
    vec3  haloc = c2;
    float hr = dEm / (emberR * 3.2);
    haloc = mix(haloc, c0, smoothstep(0.10, 0.45, hr));
    haloc = mix(haloc, c1, smoothstep(0.45, 0.78, hr));
    haloc = mix(haloc, c3, smoothstep(0.78, 1.10, hr));
    float emberGlow = alive * draw;
    col += hotc  * core * 1.45 * emberGlow;
    col += haloc * halo * 0.70 * emberGlow;
    // wide soft bloom seating the ember into the dark room
    col += haloc * exp(-dEm / (emberR * 9.0)) * 0.16 * emberGlow;

    // ---------- spark fleck popping off the cap (one-shot, occasional) ----------
    // a spark is born on a slow beat, rises a little, drifts, and guts out.
    float beat = floor(t * 0.55 + hph * 7.0);
    float sb   = hash11(beat * 1.7 + fi * 13.3);
    if (sb < 0.5) {                          // only some beats spawn a spark
      float st  = fract(t * 0.55 + hph * 7.0); // 0..1 spark life
      float sh1 = hash11(beat * 2.9 + fi * 4.1);
      float sh2 = hash11(beat * 6.1 + fi * 8.7);
      float rise = st * (10.0 + 8.0 * sh1) * pr;
      float sway = sin(st * 6.0 + sh2 * TAU) * 2.4 * pr;
      vec2  spos = vec2(dx - sway, (cssP.y - emberY) * pr - rise);
      float sd   = length(spos);
      float sr   = (1.0 + 0.8 * sh2) * pr;
      float slife = (1.0 - st) * smoothstep(0.0, 0.08, st);
      vec3  scol = mix(hotc, c3, smoothstep(0.2, 0.9, st));
      col += scol * exp(-sd * sd / (sr * sr)) * slife * 0.9 * alive;
    }

    // ---------- smoke filament: thin displaced vertical stroke, fades ----------
    if (smokeReach > 1.0) {
      float above = (cssP.y - emberY) * pr;        // px above the ember
      if (above > 0.0 && above < smokeReach) {
        float h = above / smokeReach;              // 0 at cap, 1 at top of reach
        // sine + noise lateral displacement, widening and slowing as it rises
        float disp = sin(above / (22.0 * pr) - t * 1.1 + hph * TAU) * (3.0 + 9.0 * h) * pr
                   + (vnoise(vec2(hph * 30.0, above / (30.0 * pr) - t * 0.8)) - 0.5) * 16.0 * h * pr;
        float sw = (1.1 + 4.4 * h) * pr;           // smoke half-width, widening
        float across = exp(-pow((dx - disp) / sw, 2.0));
        float fade = (1.0 - h) * smoothstep(0.0, 0.10, h); // rise from cap, fade out
        vec3 smokec = mix(c2, vec3(0.64, 0.64, 0.68), 0.50);
        col += smokec * across * fade * 0.30 * alive * (0.6 + 0.4 * min(draw, 1.4));
      }
    }
  }

  // gentle room vignette: keep the corners dark, seat the sticks
  vec2 uv = fragPx / res;
  col *= 1.0 - 0.40 * smoothstep(0.30, 1.05, length(uv - 0.5) * 1.40);

  // tiny dither to keep the long glow gradients band-free
  col += (hash21(fragPx + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
