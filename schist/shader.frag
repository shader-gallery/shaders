// schist (Strata) — a slab of foliated metamorphic rock seen face-on: dense
// wavy mineral bands (the foliation) sweep diagonally across the frame, each
// layer a different restrained palette tint, separated by thin dark cleavage
// seams and crossed by slow folds. Domain-warped FBM bends the banding into
// boudinage swells and pinches so it never reads as ruled stripes. Scattered
// along the foliation, tiny mica flakes catch the light and twinkle — bright
// specular specks that drift and breathe on their own phases. Everything moves
// slowly: the warp creeps, the folds breathe, the flakes glint, all phase-
// continuous so there is no loop seam. Dark rock with luminous mineral colour.
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
uniform float u_bandScale;  // css-px thickness of one mineral band      (default 46)
uniform float u_fold;       // strength of the domain-warp folding        (default 1)
uniform float u_mica;       // density / brightness of the mica glints    (default 1)
uniform float u_drift;      // creep speed of the warp + flake twinkle     (default 0.5)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black rock base ~#09090B
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.62, 1.21, -1.21, 1.62);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = m * p + vec2(8.3, 2.7);
    a *= 0.5;
  }
  return v;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);
  float t   = u_time;

  // palette + headless fallback (midnight)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // P0-C reference scale: keep band COUNT constant tile->fullsize.
  float refScale = mn / (max(pr, 1.0) * 400.0);
  float bandPx   = max(u_bandScale, 8.0) * refScale * pr;  // band thickness, device px
  float fold     = max(u_fold, 0.0);
  float micaAmt  = max(u_mica, 0.0);
  float drift    = max(u_drift, 0.0);

  // rotate the coordinate frame so the foliation runs on a shallow diagonal
  // (rule-of-thirds: bands cross the frame, not flat horizontal)
  float ca = 0.94, sa = 0.34;                 // ~20 deg tilt
  vec2  q  = vec2(ca * fc.x + sa * fc.y, -sa * fc.x + ca * fc.y);

  // domain-warp the across-band axis with low-frequency FBM so the foliation
  // folds into swells and pinches (boudinage), creeping slowly over time
  vec2  wcoord = q / (bandPx * 5.0);
  float warp = fbm(wcoord + vec2(t * drift * 0.05, -t * drift * 0.03));
  float warp2 = fbm(wcoord * 2.3 + vec2(-t * drift * 0.04, t * drift * 0.06) + 11.0);
  float across = q.y / bandPx + fold * (warp - 0.5) * 6.0 + fold * (warp2 - 0.5) * 2.4;

  // band index + within-band coordinate
  float bandId = floor(across);
  float bf     = fract(across);             // 0..1 across one band

  // thin dark cleavage seam at each band boundary; a brighter mineral core mid-band
  float seam = smoothstep(0.0, 0.10, bf) * smoothstep(1.0, 0.90, bf);
  float core = 1.0 - abs(bf - 0.5) * 2.0;   // 1 at band centre -> 0 at seams
  core = pow(clamp(core, 0.0, 1.0), 0.8);

  // per-band tint: each layer commits to mostly one palette colour (squared
  // weights), the wheel position hashed per band + drifting slowly
  float hk = hash21(vec2(bandId, 3.1)) * 4.0 + bandId * 0.07 + t * drift * 0.02;
  float sw = fract(hk * 0.25) * 4.0;
  float w0 = wheelW(sw, 0.0), w1 = wheelW(sw, 1.0), w2 = wheelW(sw, 2.0), w3 = wheelW(sw, 3.0);
  w0 *= w0; w1 *= w1; w2 *= w2; w3 *= w3;
  vec3 bandCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 1e-4);

  // fine grain within the band (mineral speckle / quartz fleck texture)
  float grain = fbm(q / (bandPx * 0.16) + bandId * 7.0);
  float gain  = 0.55 + 0.9 * grain;          // textured brightness across the band

  vec3 col = BG;
  // rock body: dark, the band core carrying the mineral colour, seams falling dark
  col += bandCol * seam * core * gain * 0.34;
  // a soft sheen ridge down the centre of each band so the foliation reads 3D
  col += bandCol * pow(core, 3.0) * seam * 0.16;
  // dark cleavage line emphasis at the seams (subtract toward black)
  col -= BG * (1.0 - seam) * 0.4;

  // ---- mica flakes: sparse specular specks scattered along the foliation ----
  // cell grid aligned to the (warped) band space so flakes lie within the layers
  vec2  mcell = vec2(q.x / (bandPx * 0.9), across);
  vec2  gi    = floor(mcell);
  vec2  gf    = fract(mcell);
  float glint = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = gi + vec2(float(i), float(j));
      float h = hash21(cell * 1.31 + 5.0);
      if (h < 0.34 * micaAmt) {                       // only some cells hold a flake
        vec2 fpos = vec2(hash21(cell + 1.7), hash21(cell + 9.3));
        vec2 d = (gf - vec2(float(i), float(j)) - fpos);
        // anisotropic: flakes are stretched along the foliation (x in band space)
        float dd = d.x * d.x * 0.55 + d.y * d.y * 3.0;
        // twinkle: each flake breathes through a bright peak on its own phase
        float tw = 0.5 + 0.5 * sin(t * (1.0 + 2.0 * h) * (0.6 + drift) + h * TAU);
        tw = tw * tw;
        glint += exp(-dd * 22.0) * (0.25 + 0.75 * tw);
      }
    }
  }
  // mica catches a pale, slightly warm-white specular plus the local band hue
  vec3 micaCol = mix(vec3(0.92, 0.94, 1.0), bandCol, 0.35);
  col += micaCol * glint * micaAmt * 0.9;

  // gentle vignette to seat the slab and keep corners dark
  vec2 uvn = fc / res - 0.5;
  col *= 1.0 - 0.34 * dot(uvn, uvn) * 2.0;

  // tiny dither against banding in the long mineral gradients
  col += (hash21(fc + fract(t) * vec2(13.1, 7.7)) - 0.5) * (1.4 / 255.0);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
