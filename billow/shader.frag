// billow (Veil) — a continuous sheet of cloth seen from above, billowing over
// moving air. Two slow travelling wave-trains cross the frame at a shallow
// diagonal, summed with soft low-octave FBM and shaded via analytically derived
// normals, so each wavefront carries a moving ridge of sheen with dark troughs
// between. A fainter counter-angled wave passes through the main swell. Palette
// hues grade smoothly across the frame so successive crests catch subtly
// different colours — one unbroken shaded surface, never discrete lines and no
// vertical fold structure: the waves roll diagonally across a horizontal sheet,
// advancing open-endedly so there is no loop seam.
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
uniform float u_waveSpeed;  // travel speed of wavefronts + riding sheen (default 0.35)
uniform float u_swell;      // css-px wavelength of the main swell        (default 300)
uniform float u_cross;      // strength of counter-angled second wave     (default 0.4)

const vec3 BG = vec3(0.035, 0.035, 0.043); // near-black cloth shadow base

// hash + value noise for the soft FBM that softens the travelling swells
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

// surface height of the billowing sheet at device-px coordinate p.
//   swell = device-px wavelength of the main swell
//   cross = strength of the counter-angled second wave-train
//   travel = phase advance (time * speed), slides crests + sheen along
float billowHeight(vec2 p, float swell, float cross, float travel) {
  float k = 6.2831853 / swell;             // angular wavenumber
  // main wave-train: travels along a shallow diagonal (mostly rightward, a
  // little downward). project position onto its direction of travel.
  vec2  d1 = normalize(vec2(0.92, 0.39));
  float ph1 = dot(p, d1) * k - travel;
  float w1  = sin(ph1);
  // gentle second harmonic on the same train sharpens crests a touch without
  // faceting, keeping broad rounded ridges with narrower troughs
  w1 += 0.18 * sin(ph1 * 2.0 - travel * 0.5);

  // counter-angled second wave-train: crosses the main one at a shallow angle,
  // travelling the other way so the two interfere into dappled billows. its
  // wavelength is slightly longer (incommensurate) so the pattern never repeats.
  vec2  d2 = normalize(vec2(0.62, -0.78));
  float ph2 = dot(p, d2) * (k * 0.83) + travel * 0.85;
  float w2  = sin(ph2);

  float h = w1 * 0.80 + w2 * cross * 0.55;

  // soft low-octave FBM, slowly advected, so the wavefronts undulate organically
  // along their length rather than reading as perfect rulers. kept subtle so the
  // travelling ridge structure dominates. scaled to the swell so it reads at any
  // wavelength; drifts on its own incommensurate phase (no loop seam).
  float fbmScale = 1.0 / (swell * 0.9);
  vec2  flow = d1 * travel * (swell * 0.018);
  float f = 0.0;
  f += vnoise((p + flow) * fbmScale) * 0.55;
  f += vnoise((p - flow * 0.7) * fbmScale * 2.1 + 11.3) * 0.26;
  h += (f - 0.4) * 0.42;

  return h;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params so the full slider range stays safe
  float swell = max(u_swell, 40.0) * pr; // css-px wavelength -> device px
  float cross = clamp(u_cross, 0.0, 1.0);
  float speed = max(u_waveSpeed, 0.0);
  float travel = t * speed * 1.4; // phase advance of the travelling crests

  // sample the heightfield + neighbours for an analytic normal (central diff)
  float e = 1.5 * pr;
  float h   = billowHeight(fc,                  swell, cross, travel);
  float hxp = billowHeight(fc + vec2(e, 0.0),   swell, cross, travel);
  float hxm = billowHeight(fc - vec2(e, 0.0),   swell, cross, travel);
  float hyp = billowHeight(fc + vec2(0.0, e),   swell, cross, travel);
  float hym = billowHeight(fc - vec2(0.0, e),   swell, cross, travel);
  // relief converts the dimensionless height into px depth so normals tilt
  // meaningfully relative to the swell scale
  float relief = swell * 0.13;
  float dhx = (hxp - hxm) / (2.0 * e) * relief;
  float dhy = (hyp - hym) / (2.0 * e) * relief;
  vec3 n = normalize(vec3(-dhx, -dhy, 1.0));

  // lighting: a soft grazing key from upper-left so crests catch a sheen ridge
  vec3 L = normalize(vec3(-0.5, 0.55, 0.66));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float diff = max(dot(n, L), 0.0);
  float ndh  = max(dot(n, H), 0.0);
  // broad specular lobe: a wide ridge of sheen riding the lit face of each
  // wavefront rather than a tight pinpoint glint
  float spec = pow(ndh, 16.0) * 1.7;

  // crest emphasis: normalize height to 0..1 so highlights ride the wave crests
  // and troughs fall dark. height ranges roughly -1.5..1.5.
  float crestN = clamp(h * 0.5 + 0.5, 0.0, 1.0);
  float crest  = smoothstep(0.34, 0.92, crestN);
  // band of light along the moving wavefront: a soft stripe near the crest top,
  // so each travelling ridge carries an unbroken slide of sheen
  float ridge = smoothstep(0.55, 0.98, crestN);

  // palette fallback (headless contexts can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // hue grades smoothly across the frame (diagonal, following the swell travel)
  // plus a slow time roll so successive crests catch subtly different colours
  // and the gradient drifts without a visible reset. No dynamic array indexing —
  // cyclic triangular weights only.
  vec2 g = (fc - ctr) / max(res.x, res.y);
  float k = dot(g, vec2(0.85, 0.55)) * 1.35 + 0.5 + travel * 0.012 + h * 0.06;
  float s = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // --- compose the lit billowing sheet ---
  vec3 col = BG;
  // dark cloth body: a diffuse wash in the local hue, gated up by crest height
  // so troughs fall to near-black and crests carry the colour
  col += hue * diff * (0.09 + 0.30 * crest);
  // soft ambient so the body between crests isn't pure black
  col += hue * (0.022 + 0.038 * crest);
  // the luminous sheen ridge sliding along the wavefront crests — the signature.
  // ride the bright crest band so it reads as a continuous moving stripe of light
  col += hue * spec * (0.22 + 0.62 * ridge) * 0.78;
  // a tighter near-white glint core at the very top of the sheen for liquid cloth
  col += vec3(1.0) * pow(spec, 1.7) * ridge * 0.10;

  // radial vignette to compose the framing and keep edges dark
  float vign = 1.0 - smoothstep(0.55, 1.28, length((fc - ctr) / res));
  col *= mix(0.80, 1.0, vign);

  // subtle dithering to kill banding in the dark gradients
  float dither = (hash(fc + t) - 0.5) * (1.5 / 255.0);
  col += dither;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
