// drape (Veil) — heavy silk hung in vertical folds. A smooth periodic
// heightfield of large folds plus low-octave FBM wrinkles, lit with
// analytically derived normals so every crest carries a soft specular ridge of
// light while valleys fall to near-black. Crest highlights blend the four
// palette colours by horizontal position and fold phase, so neighbouring folds
// glow in different restrained hues over a dark cloth body. The cloth sways as
// if hung at an open window — fold centres lean and wrinkle detail drift on slow
// incommensurate sine phases, breathing continuously with no repeat point.
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
uniform float u_foldWidth;  // css-px width of one silk fold      (default 200)
uniform float u_swaySpeed;  // sway / wrinkle-drift speed scale   (default 0.5)
uniform float u_sheen;      // specular crest strength & tightness (default 0.7)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black cloth shadow base

// hash + value noise for low-octave wrinkle FBM
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// silk height as a function of horizontal css-px coordinate x and vertical y.
// returns surface height (0..~1); larger = crest toward the viewer.
float silkHeight(float x, float y, float foldW, float t) {
  // slow horizontal lean of fold centres: incommensurate sine phases so the
  // sway never repeats (full sway reads over ~15-25 s)
  float lean = sin(x / foldW * 1.7 + t * 0.21) * 0.18
             + sin(x / foldW * 0.9 - t * 0.13 + 1.7) * 0.10;
  float fx = x / foldW + lean + y * 0.0004 * foldW * 0.0; // phase per fold
  // primary smooth periodic fold profile (rounded, never faceted)
  float fold = 0.5 + 0.5 * sin(fx * 6.2831853);
  fold = fold * fold * (3.0 - 2.0 * fold); // smootherstep -> rounded crests
  // low-octave FBM wrinkles drifting slowly on their own phases
  float w = 0.0;
  w += vnoise(vec2(x / (foldW * 0.55) + t * 0.05, y / (foldW * 1.1) - t * 0.037)) * 0.55;
  w += vnoise(vec2(x / (foldW * 0.27) - t * 0.031, y / (foldW * 0.6) + t * 0.022)) * 0.28;
  return fold * 0.8 + w * 0.32;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params so the full slider range stays safe
  float foldW = max(u_foldWidth, 24.0) * pr; // css-px fold width -> device px
  float sway  = max(u_swaySpeed, 0.0);
  float sheen = max(u_sheen, 0.0);

  // sway-scaled time for the heightfield animation
  float ts = t * sway;

  // sample the heightfield + neighbours for analytic normal (central diff)
  float e = 1.5 * pr;
  float h  = silkHeight(fc.x,     fc.y,     foldW, ts);
  float hxp = silkHeight(fc.x + e, fc.y,     foldW, ts);
  float hxm = silkHeight(fc.x - e, fc.y,     foldW, ts);
  float hyp = silkHeight(fc.x,     fc.y + e, foldW, ts);
  float hym = silkHeight(fc.x,     fc.y - e, foldW, ts);
  // slope of the heightfield in cloth units. relief converts the dimensionless
  // height (~0..1) into the px depth of the folds so normals tilt meaningfully.
  float relief = foldW * 0.16;
  float dhx = (hxp - hxm) / (2.0 * e) * relief;
  float dhy = (hyp - hym) / (2.0 * e) * relief;
  vec3 n = normalize(vec3(-dhx, -dhy, 1.0));

  // lighting: a soft key from upper-left, grazing so crests catch a sheen ridge
  vec3 L = normalize(vec3(-0.55, 0.45, 0.70));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float diff = max(dot(n, L), 0.0);
  float ndh  = max(dot(n, H), 0.0);
  // sheen tightens the specular lobe and scales its strength
  float specPow = mix(8.0, 60.0, clamp(sheen / 1.5, 0.0, 1.0));
  float spec = pow(ndh, specPow) * mix(0.9, 3.4, clamp(sheen / 1.5, 0.0, 1.0));

  // crest emphasis: the surface height itself, so highlights ride fold crests
  float crest = smoothstep(0.40, 1.0, h);
  // valley darkening: push the troughs between folds toward black
  float valley = smoothstep(0.0, 0.45, h);

  // palette fallback (headless contexts can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // crest hue blends the four palette colours by horizontal position + fold
  // phase, so neighbouring folds glow in different restrained hues. No dynamic
  // array indexing — cyclic triangular weights only.
  float foldPhase = fc.x / foldW;
  float k = foldPhase * 0.6 + sin(foldPhase * 2.1 + ts * 0.07) * 0.5 + ts * 0.01;
  float s = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // --- compose the lit silk ---
  vec3 col = BG;
  // dark cloth body: a low diffuse wash in the fold hue, valleys near-black
  col += hue * diff * mix(0.05, 0.20, crest) * valley;
  // soft ambient so the body isn't pure black between crests
  col += hue * (0.010 + 0.040 * crest) * valley;
  // the luminous specular sheen ridge along the crests — the silk's signature
  col += hue * spec * (0.35 + 0.65 * crest) * 1.35;
  // a tighter white-ish glint core at the very top of the sheen for liquid silk
  col += vec3(1.0) * pow(spec, 1.4) * crest * 0.35 * clamp(sheen / 1.5, 0.0, 1.0);

  // gentle vertical falloff + radial vignette to compose the framing
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  // subtle dithering to kill banding in the dark gradients
  float dither = (hash(fc + t) - 0.5) * (1.5 / 255.0);
  col += dither;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
