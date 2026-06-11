// pulsar (Abyss) — a fixed scatter of small hash stars twinkles arrhythmically,
// each on its own hashed sine rate and phase, across a near-black void. Among
// them one distinguished point — larger, in its own palette hue, wrapped in a
// soft radial halo — flashes with perfect clockwork: sharp attack, exponential
// decay, identical every period. The piece is one metronome against a field of
// noise. Nothing drifts; positions are completely fixed.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pulsePeriod;  // seconds between pulsar flashes      (default 1.5)
uniform float u_flash;        // pulsar halo radius at peak, css px  (default 80)
uniform float u_starDensity;  // per-cell hash threshold for stars   (default 0.5)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float CELL_CSS  = 26.0;   // grid cell size for the star scatter (css px)
const float STAR_CSS  = 1.15;   // base star core radius (css px)

// cheap 2D hash -> 0..1, deterministic per integer cell
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // Palette fallback (headless contexts can leave the array zeroed) — midnight.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // Guard params against catastrophic zero values (unfed uniforms are 0.0).
  float period  = max(u_pulsePeriod, 0.05);
  float flashR  = max(u_flash, 1.0) * pr;       // css px -> device px
  float density = clamp(u_starDensity, 0.0, 1.0);

  vec3 col = BG;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = CELL_CSS * refScale * pr;
  float star = STAR_CSS * pr;

  // ---- field of irregular twinklers ----------------------------------------
  // Fixed scatter: for each 3x3 neighbourhood of cells, a star may live at a
  // hashed position inside the cell. We sample neighbours so a star's glow can
  // bleed across cell borders. Constant 3x3 loop bounds (GLSL ES 1.00 safe).
  vec2 gid = floor(fc / cell);
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 id = gid + vec2(float(ox), float(oy));
      float h = hash21(id);
      // density gates how many cells host a star (low density -> sparse sky)
      if (h > 1.0 - density) {
        // fixed sub-cell position (no drift, ever)
        vec2 jit = vec2(hash21(id + 17.0), hash21(id + 31.0));
        vec2 pos = (id + jit) * cell;
        float d  = length(fc - pos);

        // arrhythmic twinkle: hashed rate + hashed phase, sine in [0..1].
        // A subset of stars twinkle hard (deep blinks) while others glimmer
        // gently, so the field reads as alive and the frame-to-frame change is
        // unmistakable without ever drifting position.
        float rate  = mix(0.6, 3.4, hash21(id + 5.0));
        float phase = hash21(id + 9.0) * 6.2831853;
        float tw    = 0.5 + 0.5 * sin(t * rate + phase);
        float depth = mix(2.0, 4.0, hash21(id + 21.0));
        tw = pow(tw, depth);                  // bias toward dark, sharper blinks
        float bright = mix(0.04, 1.15, tw);

        // each star keeps its own hue from the palette neighbours
        float hpick = hash21(id + 13.0);
        vec3  scol  = mix(mix(c0, c2, smoothstep(0.0,0.5,hpick)),
                          mix(c2, c1, smoothstep(0.5,1.0,hpick)),
                          step(0.5, hpick));

        // crisp anti-aliased core + a wider soft glow halo so each twinkle
        // breathes over a visible area (lifts frame-to-frame change off the
        // tiny core without turning stars into blobs)
        float core  = 1.0 - smoothstep(0.0, star + pr, d);
        float glow  = exp(-d / (star * 5.5));
        float glow2 = exp(-d / (star * 2.0));
        col += scol * (core * 0.95 + glow2 * 0.45 + glow * 0.28) * bright;
      }
    }
  }

  // ---- the pulsar: one clockwork beacon ------------------------------------
  // Fixed position, off-centre for composition. Strict period: sharp attack,
  // exponential decay, identical every cycle -> seamless loop.
  vec2 pPos = ctr + vec2(-0.18, 0.12) * res;
  // small phase offset so the flash peak doesn't land exactly on integer beats
  float ph  = fract(t / period + 0.12);       // 0..1 within each beat
  // sharp attack over the first ~5% of the beat, then exponential decay.
  // The decay tail spans most of the beat so the beacon is rarely fully dark,
  // and a change of period visibly shifts where in the flash we sample.
  float attack = smoothstep(0.0, 0.05, ph);
  float decay  = exp(-ph * 3.0);
  float flash  = attack * decay;              // 0..~1, clockwork pulse

  float dp = length(fc - pPos);
  vec3  pcol = c3;                            // pulsar's own distinguished hue

  // persistent slightly-larger core so the pulsar is always locatable, plus a
  // faint resting halo so the beacon is present even between flashes
  float pcore = 1.0 - smoothstep(0.0, star * 2.1 + pr, dp);
  col += pcol * pcore * (0.45 + 0.75 * flash);
  float rest  = exp(-dp / (star * 5.0));
  col += pcol * rest * 0.18;

  // soft radial halo that swells to flashR at peak flash
  float radius = mix(star * 2.5, flashR, flash);
  float halo   = exp(-dp / max(radius * 0.5, 1.0));
  col += pcol * halo * flash * 2.0;

  // a thin diffraction cross at peak so the beacon reads as a star, not a blob
  vec2 ap = abs(fc - pPos);
  float spike = exp(-ap.y / (2.0 * pr)) * exp(-ap.x / (radius * 0.9))
              + exp(-ap.x / (2.0 * pr)) * exp(-ap.y / (radius * 0.9));
  col += pcol * spike * flash * 0.5;

  // gentle vignette to seat the field in the void
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
