// glim (Bloom) — a dark meadow at night. True near-black with the faintest
// vertical ground gradient, scattered with sparse hash-grid fireflies that are
// invisible except when flashing. Each flash is a soft additive point: a fast
// smoothstep attack and a long slow decay, tinted by hashing into a warm blend
// of two palette colours. Fireflies drift a few pixels on a slow per-hash
// Lissajous wobble and fire at hash-staggered 4–12 s intervals, so the field
// shimmers indefinitely with no visible cycle seam.
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
uniform float u_blinkRate;  // flash frequency multiplier      (default 1)
uniform float u_afterglow;  // decay-tail stretch              (default 1)
uniform float u_flySize;    // glow-core radius, css px         (default 4)
uniform float u_spread;     // hash-grid cell size, css px      (default 160)

const vec3  BG          = vec3(0.030, 0.031, 0.040); // near-black meadow base
const float DRIFT_CSS   = 7.0;   // Lissajous wobble amplitude in css px
const float PERIOD_MIN  = 4.0;   // shortest base flash interval (s)
const float PERIOD_MAX  = 12.0;  // longest base flash interval (s)

// 2D value hash -> [0,1)
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // faint vertical ground gradient: a touch lighter low (the ground) fading to
  // true black up top (the air). Very subtle so the base reads as near-black.
  float gy   = fc.y / max(res.y, 1.0);
  vec3  col  = BG * (1.0 + (1.0 - gy) * 0.22) - vec3(0.0, 0.0, 0.002) * gy;

  // palette with house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // hash-grid in css px (so swarm density is DPR-independent)
  float spread = max(u_spread, 1.0) * pr;
  float core   = max(u_flySize, 0.5) * pr;   // glow-core radius
  float drift  = DRIFT_CSS * pr;
  float rate   = max(u_blinkRate, 0.001);
  float glowR  = core * 9.0;                 // soft halo reach

  vec2 cellF = fc / spread;
  vec2 baseId = floor(cellF);

  vec3 acc = vec3(0.0);

  // 3x3 neighbourhood so a firefly's halo spills across cell borders
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 id = baseId + vec2(float(ox), float(oy));

      // per-firefly hashes
      float h0 = hash21(id + 11.3);
      float h1 = hash21(id + 47.7);
      float h2 = hash21(id + 83.1);
      float h3 = hash21(id + 19.9);

      // resting position inside the cell (kept away from edges)
      vec2 home = (id + vec2(0.15) + 0.70 * vec2(h0, h1)) * spread;

      // slow per-hash Lissajous wobble (a few px); distinct x/y speeds & phase
      float wx = 0.21 + 0.30 * h2;
      float wy = 0.17 + 0.27 * h3;
      vec2 wob = vec2(
        sin(t * wx + h0 * 6.2831853),
        cos(t * wy + h1 * 6.2831853)
      ) * drift;
      vec2 pos = home + wob;

      // hash-staggered flash interval (4–12 s), sped by blink rate. The duty
      // cycle (fraction of the period spent lit) is held roughly constant in
      // real seconds so faster periods overlap into a busier, shimmering field.
      float period = mix(PERIOD_MIN, PERIOD_MAX, h2) / rate;
      float phase  = fract(t / period + h3);   // 0..1 within this firefly's cycle

      // on-window as a fraction of the period: a fixed ~1.0 s attack+decay base,
      // with the decay tail stretched by afterglow. Clamp so short periods still
      // resolve a clean blink and long ones keep an ember.
      float attackF = clamp(0.30 / period, 0.03, 0.32);
      float decayF  = clamp(1.70 * u_afterglow / period, 0.14, 0.85);
      float attack  = smoothstep(0.0, attackF, phase);
      float decay   = 1.0 - smoothstep(attackF, attackF + decayF, phase);
      float env     = attack * decay;
      // soften the curve a touch but keep the mid-envelope bright so several
      // fireflies read at once (an event field, not a single hot point)
      env = env * (0.62 + 0.38 * env);

      // soft additive point: bright core + wide gaussian halo
      float d  = length(fc - pos);
      float coreG = exp(-(d * d) / (core * core * 2.2));
      float halo  = exp(-(d * d) / (glowR * glowR * 0.5));
      float shape = coreG * 0.60 + halo * 0.48;

      // warm two-colour tint: each firefly hashes into a blend of two palette
      // entries, biased toward the warm pair so the meadow reads amber/gold with
      // occasional cool sparks (rather than a uniform white-blue wash).
      vec3 warm = mix(c0, c3, 0.6);                 // warm anchor (warm-cool mix)
      vec3 coolA = mix(c2, c1, h1);                 // cooler companion
      vec3 tint = mix(warm, coolA, h0 * h0 * 0.7);  // h0^2 keeps most fireflies warm
      // pull the tint toward firefly amber/gold and away from pure white
      tint = mix(tint, vec3(1.0, 0.72, 0.28), 0.34);
      tint = normalize(tint + 1e-4) * 1.25;

      acc += tint * (shape * env);
    }
  }

  col += acc * 2.1;

  // gentle filmic-ish soft clamp so the brightest flashes bloom without harsh
  // clip — kept light so flash cores keep their warm colour instead of blowing
  // out to white.
  col = col / (1.0 + col * 0.45);
  col = pow(max(col, 0.0), vec3(0.94));

  gl_FragColor = vec4(col, 1.0);
}
