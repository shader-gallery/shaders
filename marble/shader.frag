// marble — suminagashi paper-marbling. Two inks drawn from opposite ends of
// the palette interleave as thin luminous filaments on a near-black ground,
// each leaning toward one of the middle palette hues by large-scale phase so
// no region reads single-hued. The filaments are level-bands of an FBM field
// whose domain is warped twice by drifting, centred noise offsets, so they
// stretch, thin, and fold into hooked swirls like ink combed on water.
// Time enters only as unbounded continuous offsets into the noise — the
// field perpetually refolds with no wrap, no reset, no global translation.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_churnSpeed;  // pace of the perpetual folding drift (default 0.25)
uniform float u_fold;        // amplitude of the iterated domain warp (default 1.2)
uniform float u_scale;       // dominant swirl size, css px, scaled by u_pixelRatio (default 420)

const vec3  BG     = vec3(0.035, 0.035, 0.043); // house near-black
const float NBANDS = 16.0;  // ink iso-bands across the field's value range

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// smooth value noise
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80); // rotate between octaves

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.032; // renormalise the 5-octave sum toward 0..1
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr      = max(u_pixelRatio, 0.25);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float scalePx = max(u_scale, 40.0) * refScale * pr;     // dominant feature size, device px
  vec2  p       = gl_FragCoord.xy / scalePx;
  float t       = u_time * clamp(u_churnSpeed, 0.0, 4.0);
  float fold    = max(u_fold, 0.0);

  // ---- iterated domain warp: two curl-like stages of drifting, centred
  // noise offsets. Each stage subtracts the fbm mean so the offsets churn
  // around zero — media rotate locally while going nowhere globally.
  vec2 q = vec2(fbm(p + vec2( 0.13 * t, -0.09 * t)),
                fbm(p + vec2(5.2, 1.3) + vec2(-0.11 * t,  0.12 * t))) - 0.5;
  vec2 w1 = p + fold * 1.5 * q;
  vec2 r = vec2(fbm(w1 + vec2(1.7, 9.2) + vec2( 0.08 * t,  0.10 * t)),
                fbm(w1 + vec2(8.3, 2.8) + vec2(-0.10 * t, -0.07 * t))) - 0.5;
  float f = fbm(w1 + fold * 2.0 * r + vec2(0.05 * t, -0.04 * t));

  // ---- thin luminous level-bands of the warped field = the ink filaments
  float s    = f * NBANDS;
  float band = fract(s);
  float idx  = floor(s);
  float d    = abs(band - 0.5);          // 0 at a filament core, 0.5 between

  float core = 1.0 - smoothstep(0.0, 0.105, d);
  core *= core;                          // sharpen the spine, keep soft feet
  float halo = exp(-(d * d) / 0.016);    // soft ink bleed around the core

  // shimmer along the filament so lines read as carried ink, not contours
  float amp = 0.62 + 0.38 * vnoise(w1 * 3.1 + vec2(idx * 0.71, -idx * 0.37));

  // ---- two inks from opposite palette ends, alternating band-by-band;
  // each blends toward one of the middle hues by large-scale phase (the
  // first warp field doubles as the phase, so hue follows the current).
  // The lean is capped at 0.62 so each ink keeps its end-of-palette
  // identity — both inks can never collapse into the same hue family.
  float parity = mod(idx, 2.0);
  float phA = smoothstep(-0.28, 0.28, q.x + 0.3 * r.y);
  float phB = smoothstep(-0.28, 0.28, q.y + 0.3 * r.x);
  vec3 inkA = mix(c0, c1, 0.62 * phA);
  vec3 inkB = mix(c3, c2, 0.62 * phB);
  vec3 ink  = mix(inkA, inkB, parity);

  // ---- compose: deep near-black ground, brightness only in the cores
  vec3 col = BG;
  col += ink * 0.042 * (0.4 + 0.6 * halo);          // whisper of submerged ink
  col += ink * halo * 0.38 * amp;                   // bleed
  col += ink * core * 0.95 * amp;                   // luminous core
  col += vec3(0.16) * core * core * amp;            // faint white-hot spine

  // gentle vignette to seat the sheet
  vec2 vq = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.34 * smoothstep(0.35, 1.05, length(vq - 0.5) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
