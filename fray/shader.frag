// fray (Current) — combed, then released. Diagonal fibres run sleek and parallel
// where a comb has just passed, and fray into wild domain-warped chaos in the
// length they have not yet reached. A bright comb stroke sweeps along the fibres
// over and over, re-ordering the weave behind it and leaving it to unravel ahead,
// so the whole field breathes order into chaos and back. Two parallax depth
// layers fray at different rates. The transition itself is the subject.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four fibre colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_threads;  // fibre density across the weave              (default 90)
uniform float u_fray;     // how violently the released length unravels   (default 1.0)
uniform float u_comb;     // comb-stroke travel speed                     (default 0.22)
uniform float u_strokes;  // comb strokes visible across the frame        (default 1.5)
uniform float u_glow;     // fibre emission                               (default 1.0)
uniform float u_hueSpread;// hue swing from order to chaos                (default 1.2)
uniform float u_depth;    // near/far parallax + far dimming              (default 0.8)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

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
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) { s += amp * vnoise(p * f); f *= 2.03; amp *= 0.5; }
  return s;
}
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// one diagonal fibre layer. `along`/`perp` are the fibre-length and across-fibre
// coordinates; `disorder` (0..1) frays the across-coordinate with domain warp.
float fibreLayer(float along, float perp, vec2 p, float t, float freq, float fray,
                 float disorder, float depth) {
  // domain warp grows with disorder: sleek straight fibres -> chaotic tangle
  // disorder^1.5 keeps the just-combed region crisply straight, then ramps the
  // warp up steeply so the released tips read as genuinely wild, not just wavy
  float dis = disorder * disorder * (0.4 + 0.6 * disorder);
  float bend = (fbm(p * 2.0 + vec2(t * 0.2, depth * 6.0)) - 0.5) * fray * 2.4 * dis
             + (fbm(p * 4.3 + vec2(-t * 0.13, depth * 3.0)) - 0.5) * fray * 1.4 * dis;
  float v = perp * freq + bend * freq * 0.30;
  float band = abs(fract(v) - 0.5) * 2.0;        // 0 on a fibre, 1 between
  float thread = pow(1.0 - band, 6.0);
  // fibres thin/break along their length where frayed, stay solid where combed
  float breaks = mix(0.85, 0.45 + 0.55 * fbm(vec2(along * 3.0, floor(v) * 1.7 + depth * 4.0)),
                     disorder);
  return thread * breaks;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  float aspect = res.x / max(res.y, 1.0);
  vec2  uv = fc / res;
  vec2  p  = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t      = u_time;
  float freq   = max(u_threads, 8.0) * 0.5;
  float fray   = max(u_fray, 0.0);
  float glow   = max(u_glow, 0.0);
  float depthA = clamp(u_depth, 0.0, 1.0);

  // diagonal fibre axis (~30 degrees) and the across-fibre axis
  vec2 dir  = normalize(vec2(0.86, 0.50));
  vec2 prp  = vec2(-dir.y, dir.x);
  float along = dot(p, dir);
  float perp  = dot(p, prp);

  // the comb stroke sweeps along the fibre length. `release` is 0 just behind the
  // comb (sleek) climbing to 1 at the un-combed tips (frayed). fract hides the
  // re-comb under the bright comb glint so the wrap is not a visible jump.
  float sweep   = along * max(u_strokes, 0.4) - t * u_comb;
  float release = fract(sweep);
  float disorder = smoothstep(0.04, 0.72, release);

  float angN, angF;
  float near = fibreLayer(along, perp, p, t, freq, fray, disorder, 0.0);
  vec2  pf   = p * (1.0 + 0.06 * depthA) + vec2(0.03 * depthA, 0.0);
  float alF  = dot(pf, dir), prF = dot(pf, prp);
  float relF = fract(alF * max(u_strokes, 0.4) - t * u_comb * 0.8);
  float disF = smoothstep(0.04, 0.72, relF);
  float far  = fibreLayer(alF, prF, pf, t * 0.85, freq * 0.8, fray, disF, 1.0);

  // hue ramps from order (one palette end) to chaos (another); drifts slowly
  float hue = 0.45 + disorder * max(u_hueSpread, 0.0) * 0.4 + t * 0.02;
  float s4  = fract(hue) * 4.0;
  float w0 = wheelW(s4,0.0), w1 = wheelW(s4,1.0), w2 = wheelW(s4,2.0), w3 = wheelW(s4,3.0);
  vec3 nearCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  float hf = 0.45 + disF * max(u_hueSpread, 0.0) * 0.4 + t * 0.02;
  float sf = fract(hf) * 4.0;
  float f0 = wheelW(sf,0.0), f1 = wheelW(sf,1.0), f2 = wheelW(sf,2.0), f3 = wheelW(sf,3.0);
  vec3 farCol = (c0*f0 + c1*f1 + c2*f2 + c3*f3) / max(f0+f1+f2+f3, 0.001);

  vec3 col = BG;
  float farBright = 0.5 * (1.0 - 0.4 * depthA);
  col += farCol  * far  * farBright * glow;
  col += nearCol * near * 1.2       * glow;

  // the comb glint: a bright diagonal stroke at the freshly-combed edge
  // (release near 0). lights the re-ordering line and hides the fract wrap.
  float glint = smoothstep(0.06, 0.0, release) + 0.5 * smoothstep(0.97, 1.0, release);
  vec3  glintCol = (c0 + c2) * 0.5;
  col += glintCol * glint * 0.5 * glow;

  // bespoke fill so the gaps are not dead-black: a dim fibre-coloured wash that
  // follows the order->chaos ramp (sleeker side cooler, frayed side warmer).
  vec3 washCol = mix(nearCol, c2, 0.4);
  col += washCol * (0.03 + 0.05 * disorder) * glow;

  // filmic shoulder keeps the brightest combed bands from clipping flat
  col = col / (col + vec3(0.92)) * 1.55;

  // gentle vignette
  float vign = 1.0 - smoothstep(0.55, 1.1, length((uv - 0.5) * vec2(1.0, 1.05)));
  col *= mix(0.74, 1.0, vign);

  // dither against banding in the smooth wash / hue gradients
  col += (hash21(fc + fract(t)) - 0.5) / 255.0;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
