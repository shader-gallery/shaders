// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// felt (Burnish) - a sheet of dyed wool felt, seen close under a raking lamp.
// Felt is not woven: it is a tangle of short kinked fibres pressed into a mat,
// so the surface is built from four families of short stretched strands laid
// at different angles, each strand broken into stubby lengths and sharpened
// to a pixel or two wide, over a fine matte fuzz. The mat has a nap: a
// dominant direction the fibres lie in, which drifts in soft patches across
// the sheet. Nap is what makes felt and velvet read as cloth: where the pile
// lies toward the light you look down into it and it goes dark, where it lies
// away the fibre flanks face you and it goes pale. A slow hand-stroke travels
// across the sheet and lays the pile over in its wake, so a moving band of
// brushed nap crosses the frame and relaxes back behind it. The sheet itself
// is not flat: low soft folds give it a raking-light relief, and the dye is
// wet-felted in soft patches of the palette poles, blended where the rovings
// met. Matte throughout: no specular, the pile does all the lighting.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pile;     // fibre pile visibility                  (default 1.0)
uniform float u_nap;      // nap shading contrast                   (default 1.0)
uniform float u_stroke;   // hand-stroke speed                      (default 0.25)
uniform float u_folds;    // fold relief of the sheet               (default 0.7)
uniform float u_scale;    // fibre length scale, css px             (default 1.0)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
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

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

// broad three-octave version for the sheet folds
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.14;
}

// fold height: stretched 3.5:1 along a diagonal so folds read as ridges
float foldH(vec2 p) {
  vec2 r = vec2(0.94 * p.x + 0.34 * p.y, -0.34 * p.x + 0.94 * p.y);
  return fbm3(vec2(r.x * 0.28, r.y * 1.0));
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// dyed wool: the swatch pulled toward a mid grey and darkened, since felt
// absorbs light and never shows a saturated surface colour
vec3 dye(vec3 c) {
  float l = luma(c);
  vec3 d = mix(vec3(l), c, 0.62);
  return d * (0.62 / max(l, 0.25)) * 0.55;
}

// one family of short fibres lying along direction d at css coords q (q is
// already gently warped so the strands kink instead of ruling straight).
// Stretched value noise gives long thin strands; a second noise along the
// strand breaks them into short lengths the way carded wool lies.
// Returns a sharpened 0..1 mask of the strand tops.
float strands(vec2 q, vec2 d, float seed, float len) {
  vec2 n = vec2(-d.y, d.x);
  float along  = dot(q, d);
  float across = dot(q, n);
  float s = vnoise(vec2(along / len, across * 1.25) + seed);
  float b = vnoise(vec2(along / (len * 0.5), across * 0.30) + seed * 1.7 + 9.0);
  float top = smoothstep(0.52, 0.90, s) * smoothstep(0.34, 0.64, b);
  return top;
}

// nap angle field: base lie of the pile, patchy drift, and the hand-stroke.
// p is frame-relative, t is stroke time. Returns the angle in radians.
float napAngle(vec2 p, float t, out float wakeOut) {
  // felt is carded in patches: the lie wanders slowly across the sheet
  float base = 0.55 + 1.3 * (fbm(p * 1.4 + 3.0) - 0.5);
  // the hand: a stroke front crossing the sheet diagonally, wrapped so it
  // returns every few seconds. Behind the front the pile is laid over toward
  // the stroke direction, then it relaxes back to its rest lie.
  vec2  sd   = normalize(vec2(0.82, -0.57));
  float ph   = fract(dot(p, sd) * 0.30 - t * 0.16 + 0.5);
  float wake = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.08, 0.70, ph));
  wakeOut = wake;
  float strokeAng = atan(sd.y, sd.x);
  // a little sideways scuff so the stroked band is not one flat tone
  strokeAng += 0.25 * (vnoise(p * 6.0 + t * 0.3) - 0.5);
  return mix(base, strokeAng, wake * 0.85);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float aspect = res.x / res.y;
  float t      = u_time * clamp(u_stroke, 0.0, 2.0);
  float pile   = clamp(u_pile, 0.0, 2.0);
  float napAmt = clamp(u_nap, 0.0, 2.0);
  float folds  = clamp(u_folds, 0.0, 2.0);
  float fscale = max(u_scale, 0.3);

  // css-pixel coords for the fibres (a surface property), frame-relative
  // coords for everything that composes the sheet
  vec2 q = fc / pr;
  vec2 p = vec2((fc.x / res.x - 0.5) * aspect, fc.y / res.y - 0.5) * 2.0;

  // optional pointer: a light second stroke under the cursor, zero at rest
  vec2  m    = (u_mouse / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mOn  = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // ---- the sheet: low soft folds, lit by a raking lamp from the upper left
  // the folds run long and diagonal, as a sheet pushed from one side folds,
  // so the fold field is fbm stretched along one axis in a rotated frame
  vec2  fp = p * 0.55 + vec2(t * 0.02, 0.0);
  float e  = 0.03;
  float h  = foldH(fp);
  float hx = foldH(fp + vec2(e, 0.0));
  float hy = foldH(fp + vec2(0.0, e));
  vec3  nrm = normalize(vec3(-(hx - h) * folds * 2.0, -(hy - h) * folds * 2.0, e));
  vec3  L   = normalize(vec3(-0.6, 0.7, 0.42));
  float diff = clamp(dot(nrm, L), 0.0, 1.0);
  // wool is a rough diffuser: wrapped and soft
  float wrap = diff * 0.7 + 0.3;
  // the lamp sits up and to the left, so the sheet falls off toward the far
  // corner the way a single raking light always does
  float lamp = 1.18 - 0.55 * smoothstep(-1.4, 1.6, p.x * 0.7 - p.y * 0.7);
  float sheetLit = (0.62 + 0.85 * wrap) * lamp;

  // ---- the nap: direction of the pile here
  float wake;
  float ang = napAngle(p, t, wake);
  // the pointer strokes the pile toward itself where it hovers
  float mFall = exp(-dot(p - m, p - m) * 6.0) * mOn;
  ang = mix(ang, atan(m.y - p.y, m.x - p.x), mFall * 0.6);
  vec2  nd   = vec2(cos(ang), sin(ang));
  // nap shading: pile pointing into the lamp goes dark, pile lying away shows
  // its flanks and goes pale. Brushed regions therefore read as a tonal band.
  float toward = dot(nd, normalize(L.xy));
  float napShade = 1.0 - 0.30 * napAmt * toward;
  // a soft anisotropic glint: fibres broadside to the lamp catch it
  float broad = 1.0 - toward * toward;
  napShade += 0.10 * napAmt * broad;
  // a freshly brushed pile lies flat and shows more fibre flank: a touch paler
  napShade += 0.08 * napAmt * wake;

  // ---- fibre pile: six families at fixed angles, each weighted by how
  // closely it lies along the local nap, so the pile turns with the nap
  // without the strands themselves bending into whorls. A gentle warp of the
  // css coords kinks every strand a little, as carded wool does.
  float len = 10.0 * fscale;
  vec2  qk  = q + 4.0 * fscale * (vec2(vnoise(q * 0.045 + 5.0), vnoise(q * 0.045 + 45.0)) - 0.5);
  float f = 0.0;
  for (int i = 0; i < 6; i++) {
    float k  = float(i);
    float fa = k * 0.5236;                          // 30 degree steps
    float cd = cos(fa - ang);
    float w  = 0.10 + 0.90 * cd * cd;               // aligned families dominate
    w = w * w;
    vec2  d  = vec2(cos(fa), sin(fa));
    f += w * strands(qk + k * 37.0, d, k * 5.3, len * (0.85 + 0.1 * k));
  }
  // a finer, shorter under-pile of three families fills the mat between the
  // longer strands so the surface is dense fuzz, not scratches on a ground
  float fine = 0.0;
  for (int i = 0; i < 3; i++) {
    float k  = float(i);
    float fa = k * 1.0472 + 0.26;                   // 60 degree steps, offset
    float cd = cos(fa - ang);
    float w  = 0.25 + 0.75 * cd * cd;
    vec2  d  = vec2(cos(fa), sin(fa));
    fine += w * strands(qk * 1.7 + k * 53.0, d, k * 3.1 + 40.0, len * 0.9);
  }
  f = clamp(f + fine * 0.5, 0.0, 1.5);
  // a scatter of long stray hairs lying loose on top of the mat
  vec2  sdir  = vec2(cos(0.9), sin(0.9));
  float stray = strands(qk * 0.55 + 200.0, sdir, 21.0, len * 3.5);
  stray *= smoothstep(0.66, 0.92, vnoise(q * 0.013 + 51.0));
  // matte fuzz: fine tooth over everything so no pixel is flat
  float fuzz  = vnoise(q * 0.9 + 77.0) - 0.5;
  float fuzz2 = vnoise(q * 0.3 + 13.0) - 0.5;
  // felt density mottle: thicker and thinner spots in the mat
  float mottle = fbm(q * 0.012 + 31.0) - 0.5;

  // ---- dye: wet-felted patches of the palette poles blended into one sheet
  float dyeA = fbm(p * 0.75 + vec2(4.2, 1.7));
  float dyeB = fbm(p * 1.1 + vec2(9.5, 6.1));
  vec3  wool = dye(c0);
  wool = mix(wool, dye(c1), smoothstep(0.42, 0.66, dyeA));
  wool = mix(wool, dye(c3), smoothstep(0.50, 0.72, dyeB) * 0.85);
  // the fibre tops carry a paler, greyer wool colour: the dye sits in the
  // core and the scaled cuticle scatters white
  vec3 fibreCol = mix(wool, vec3(luma(wool)) * 1.6 + c2 * 0.10, 0.55);

  // ---- assemble the surface
  float pileAmt = pile * (0.6 + 0.4 * sheetLit);
  vec3 col = wool * (0.92 + 0.14 * mottle + 0.08 * fuzz2 + 0.06 * fuzz * pile);
  col = mix(col, fibreCol, clamp(f * 0.42 * pileAmt, 0.0, 1.0));
  col = mix(col, fibreCol * 1.08, stray * 0.35 * pileAmt);
  // the pile shadows itself: a dark cast beside each fibre family lends the
  // mat its depth, offset a pixel down-light
  float shadow = 0.0;
  for (int i = 0; i < 3; i++) {
    float k  = float(i) * 2.0;
    float fa = k * 0.5236;
    float cd = cos(fa - ang);
    float w  = 0.10 + 0.90 * cd * cd;
    w = w * w;
    vec2  d  = vec2(cos(fa), sin(fa));
    shadow += w * strands(qk + k * 37.0 - vec2(-1.6, 1.8) * fscale, d, k * 5.3, len * (0.85 + 0.1 * k));
  }
  col *= 1.0 - 0.18 * pile * clamp(shadow, 0.0, 1.0) * (1.0 - f);

  col *= sheetLit * napShade;
  // deep folds swallow light between them
  col *= 1.0 - 0.18 * folds * (1.0 - diff) * (1.0 - diff);

  gl_FragColor = vec4(col, 1.0);
}
