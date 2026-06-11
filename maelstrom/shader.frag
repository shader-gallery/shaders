// maelstrom (Gyre) — one vast log-spiral vortex sits centred just off the
// lower-right corner. Its dye arms — sin bands in (angle*arms + twist*log r)
// space — sit barely a step above a near-black ground across most of the frame.
// Structure resolves only toward the core, where the bands tighten, the palette
// warms through its third and fourth colours, and a soft glow pools inside a
// defined core radius. The far field dissolves into faint traces so the
// upper-left stays almost empty, leaving room for foreground content. The whole
// spiral rotates rigidly and extremely slowly while an unbounded FBM shimmer
// drifts along the arms, so nothing ever reads frozen and nothing ever wraps.
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
uniform float u_spinSpeed;  // angular velocity of the vortex      (default 0.06)
uniform float u_twist;      // log-spiral tightness                (default 3.5)
uniform float u_core;       // css-px radius of the warm bright core (default 260)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float ARMS     = 5.0;    // number of dye arms in the spiral
const float SHIMMER  = 0.10;   // FBM shimmer drift speed along the arms

// hash + value noise + fbm (no textures; cheap unbounded drift)
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    p = p * 2.02 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return s;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Vortex centre sits just off the lower-right corner so the open arms sweep up
  // and to the left, leaving the upper-left almost empty for foreground content.
  vec2 ctr = res * vec2(0.92, 0.08);
  vec2 p   = fc - ctr;

  float r   = length(p);
  float ang = atan(p.y, p.x);

  // normalise radius in css-px units so spiral geometry is DPR-independent
  float rcss = r / pr;
  float core = max(u_core, 1.0);              // guard: core never hits 0

  // rigid global rotation — a continuous angle offset (never wraps visibly)
  float spin = t * u_spinSpeed;

  // log-spiral coordinate: angle*arms + twist*log(radius). log(r) keeps arms
  // evenly spaced in screen-space as they wind toward the core.
  float lr     = log(rcss + 1.0);
  float spiral = ang * ARMS + u_twist * lr + spin * ARMS;

  // subtle FBM shimmer drifting ALONG the arms (unbounded, so never frozen and
  // never wraps). The shimmer must be sampled from a coordinate that is CONTINUOUS
  // across the atan branch cut (p.y=0, p.x<0): the raw `spiral` scalar jumps by
  // 10*pi there, and feeding spiral*0.5 to the noise jumped its input by 5*pi (an
  // odd multiple of pi), leaving a visible filament/seam in the lower-right. Wrap
  // spiral onto the unit circle instead — cos/sin of spiral are continuous because
  // the 10*pi jump is an exact multiple of 2*pi — and let log-r drive the radial
  // axis. Time-drift stays unbounded so nothing ever freezes or wraps.
  vec2 shCoord = vec2(cos(spiral), sin(spiral)) * 1.3 + vec2(0.0, lr * 1.5);
  float sh = fbm(shCoord + vec2(t * SHIMMER, -t * SHIMMER * 0.6));
  float bands = sin(spiral + (sh - 0.5) * 1.6);

  // dye-arm mask: smooth crests of the sin bands, antialiased. Near-black almost
  // everywhere; only the crest ridges carry dye.
  float arm = smoothstep(0.15, 0.95, bands * 0.5 + 0.5);
  // sharpen the ridge a touch so arms read as filaments, not a soft gradient
  arm = arm * arm * (3.0 - 2.0 * arm);

  // core resolution: structure (and brightness) resolves only toward the core.
  // far field dissolves to faint traces, upper-left stays nearly empty.
  float coreT = 1.0 - smoothstep(0.0, core, rcss);          // 1 at centre → 0 out
  float farFade = mix(0.10, 1.0, 1.0 - smoothstep(core, core * 4.5, rcss));
  // overall arm visibility: faint far out, resolving in toward the core
  float vis = mix(0.10, 1.0, coreT) * farFade;

  // tighten the bands toward the core: extra high-frequency ridges only resolve
  // inside the core region, so the coil reads denser at the heart.
  float tight = sin(spiral * 2.0 + (sh - 0.5) * 1.0);
  float tightArm = smoothstep(0.35, 0.95, tight * 0.5 + 0.5);
  arm = mix(arm, max(arm, tightArm), coreT * 0.7);

  // Palette with house fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // Colour by radius: cool first/second hues sweep the open far arms, warming
  // through the third and fourth palette colours as the bands tighten into core.
  float warm = smoothstep(core * 2.2, core * 0.25, rcss);   // 0 far → 1 at core
  // Hue variation along the arms must also be continuous across the atan cut:
  // sin(spiral*0.5) flips sign there (spiral jumps 10*pi → arg jumps 5*pi), which
  // tinted the two halves of the cut differently. Use sin(spiral) (jump = 5*2*pi,
  // fully continuous) so the colour reads seamlessly across the branch line.
  vec3 coolMix = mix(c0, c1, 0.5 + 0.5 * sin(spiral));
  vec3 warmMix = mix(c2, c3, 0.5 + 0.5 * sin(spiral + 1.0));
  vec3 dye = mix(coolMix, warmMix, warm);

  vec3 col = BG;

  // dye arms laid onto the near-black ground
  col += dye * arm * vis * 0.85;

  // soft warm glow pooling inside the defined core radius
  float glow = exp(-rcss / (core * 0.6));
  col += mix(c2, c3, 0.5) * glow * 0.55;
  // a tighter inner bloom so the very heart is luminous
  col += c3 * exp(-rcss / (core * 0.28)) * 0.30;

  // gentle overall vignette toward the upper-left empty quadrant keeps that
  // region calm (purely subtractive of stray noise, never darkens the core)
  float ul = 1.0 - smoothstep(0.2, 1.3, length((fc - ctr) / res));
  col *= mix(0.85, 1.0, ul);

  // faint global glow lift inside the core so the warm pool reads as light, not
  // just coloured arms
  col += mix(c2, c3, 0.4) * coreT * 0.04;

  gl_FragColor = vec4(col, 1.0);
}
