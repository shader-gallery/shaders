// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// engraving (Trace) - a copperplate line engraving of an undulating drapery,
// ink on paper. The form is a folded height field lit by one raking light;
// its shading is never painted, it is translated into burin work the way an
// intaglio engraver does it. A primary family of parallel lines wraps the
// form, bending over every fold like cross-contours, and its line weight
// swells with the tone: hairlines that taper away to bare paper in the
// highlights, fat swelling cuts in the shadow. As tone deepens a second
// family crosses the first at an angle, then a third in the darkest hollows,
// so the shadows build as true cross-hatch. In the half-tones, before the
// second family arrives, a dot sits in the centre of every lozenge between
// the lines: the dot-and-lozenge of the classical engravers. Every line has
// a slight burin wobble and swell along its length, the paper carries fibre
// and tooth, and the wiped plate leaves a faint film of tone in the shadows.
// The drapery breathes slowly and the light precesses, so the lines re-bend
// and the hatch migrates over the folds in real time.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pitch;    // line spacing, css px                  (default 9)
uniform float u_wrap;     // how far lines bend around the form    (default 1.0)
uniform float u_relief;   // depth of the form, tonal range        (default 1.0)
uniform float u_ink;      // ink density                           (default 0.95)
uniform float u_drift;    // breathing speed of the drapery        (default 0.25)

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

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.14;
}

// the drapery: folds running roughly diagonal, bent by a slow warp, with a
// finer ripple laid across them. p is frame units, t is slow time.
float form(vec2 p, float t) {
  vec2 w = p + 0.45 * vec2(fbm3(p * 0.7 + t * 0.07) - 0.5,
                           fbm3(p * 0.7 + vec2(7.3, 2.1) - t * 0.05) - 0.5) * 2.0;
  float folds = sin(w.x * 1.7 + w.y * 0.8 + sin(w.y * 1.3 - t * 0.2) * 0.9 + t * 0.15);
  float ripple = sin(w.x * 4.1 - w.y * 2.6 + t * 0.3) * 0.06;
  float h = folds * 0.5 + 0.5 + ripple;
  return h;
}

// one engraved line family. s is the line coordinate in pitch units, gs the
// magnitude of its screen gradient (1/px), wf the line width as a fraction
// of the pitch. Returns ink coverage.
float lineInk(float s, float gs, float wf) {
  float dl = abs(fract(s) - 0.5) * 2.0;        // 0 on the line centre, 1 midway
  float aa = gs * 1.4;                          // ~0.7 px each side
  // a line thinner than the AA width fades out instead of leaving a ghost
  return smoothstep(wf + aa, wf - aa, dl) * min(wf / max(aa, 1e-4), 1.0);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr    = max(u_pixelRatio, 0.5);
  vec2  resC  = u_resolution / pr;              // css px
  vec2  q     = gl_FragCoord.xy / pr;           // css px coords
  float t     = u_time * clamp(u_drift, 0.0, 2.0);
  float pitch = max(u_pitch, 3.0);
  float wrap  = max(u_wrap, 0.0);
  float relief = max(u_relief, 0.0);
  float inkAmt = clamp(u_ink, 0.0, 1.0);

  // ---- the form, frame-relative so the fold count holds tile to fullsize
  float fscale = 2.4;
  float toP = fscale * 2.0 / resC.y;            // frame units per css px
  vec2 p = (q - resC * 0.5) * toP;
  float e = 3.0;                                // finite-difference step, css px
  float h  = form(p, t);
  float hx = form(p + vec2(e * toP, 0.0), t);
  float hy = form(p + vec2(0.0, e * toP), t);
  vec2 gh = vec2(hx - h, hy - h) / e;           // dh per css px

  // ---- tone from a raking light that slowly precesses
  float la = 2.35 + 0.45 * sin(t * 0.13);
  vec3 L = normalize(vec3(cos(la), sin(la), 1.0));
  // slope in frame units, scaled by relief
  vec2 slope = gh / toP * relief * 0.26;
  vec3 N = normalize(vec3(-slope, 1.0));
  float lambert = dot(N, L);
  float shade = clamp(lambert, 0.0, 1.0);
  // flat paper under this light sits at lambert ~0.7: a light half-tone
  float tone = 1.0 - shade;
  // a broad drift of light across the sheet, so whole regions lift toward
  // bare paper while others sink, the way a lit drapery falls into shadow
  float broad = (fbm3(p * 0.32 + vec2(t * 0.02, 3.0)) - 0.5) * 2.0;
  tone = (tone - 0.14) * (1.15 + 0.35 * relief) + 0.10 * (1.0 - h) * relief + 0.16 * broad;
  tone = clamp(tone, 0.0, 1.0);

  // ---- the line coordinates. Each family is a parallel ruling displaced by
  // the height, so the lines wrap over the folds. amp is the displacement in
  // css px per unit height.
  float amp = 18.0 * wrap * pitch / 9.0;
  vec2 d1 = vec2(0.17, 0.985);                  // primary: near-horizontal lines
  vec2 d2 = vec2(0.80, 0.60);                   // second family: about 53 deg
  vec2 d3 = vec2(-0.72, 0.69);                  // third family: about -46 deg
  float s1 = (dot(q, d1) + amp * h) / pitch;
  float s2 = (dot(q, d2) + amp * 0.7 * h) / (pitch * 1.08);
  float s3 = (dot(q, d3) + amp * 0.5 * h) / (pitch * 1.16);
  float g1 = length(d1 + amp * gh) / pitch;
  float g2 = length(d2 + amp * 0.7 * gh) / (pitch * 1.08);
  float g3 = length(d3 + amp * 0.5 * gh) / (pitch * 1.16);

  // burin character: the cut swells and wanders a little along its length,
  // and the plate has a fine tremor so no line is machine-perfect
  float along1 = dot(q, vec2(d1.y, -d1.x));
  float swell1 = 0.82 + 0.36 * vnoise(vec2(along1 * 0.035, floor(s1) * 0.71 + 3.0));
  float along2 = dot(q, vec2(d2.y, -d2.x));
  float swell2 = 0.85 + 0.30 * vnoise(vec2(along2 * 0.035, floor(s2) * 0.71 + 19.0));
  float along3 = dot(q, vec2(d3.y, -d3.x));
  float swell3 = 0.85 + 0.30 * vnoise(vec2(along3 * 0.035, floor(s3) * 0.71 + 41.0));
  float tremor = (vnoise(q * 0.22 + 77.0) - 0.5) * 0.05;

  // ---- line weights from tone. Primary lines taper to nothing in the
  // highlights; the second family enters in the half-shadow, the third only
  // in the deepest hollows.
  float w1 = smoothstep(0.02, 0.70, tone) * 0.62 * swell1;
  w1 *= smoothstep(0.0, 0.12, tone);            // taper out on the lit crests
  float w2 = clamp((tone - 0.40) / 0.45, 0.0, 1.0) * 0.52 * swell2;
  float w3 = clamp((tone - 0.68) / 0.32, 0.0, 1.0) * 0.44 * swell3;

  float i1 = lineInk(s1 + tremor, g1, w1);
  float i2 = lineInk(s2 + tremor, g2, w2);
  float i3 = lineInk(s3 + tremor, g3, w3);

  // dot-and-lozenge: a flick of the burin in the centre of each lozenge that
  // the first two rulings would form, in the half-tone before the second
  // family is cut. Fades out as the crossing lines take over.
  // lines sit at fract 0.5, so the lozenge centre is at fract 0
  vec2 lz = vec2(fract(s1 + tremor + 0.5) - 0.5, fract(s2 + tremor + 0.5) - 0.5);
  float dotR = clamp((tone - 0.20) / 0.22, 0.0, 1.0) * (1.0 - clamp((tone - 0.42) / 0.16, 0.0, 1.0));
  dotR *= 0.06 + 0.05 * hash21(floor(vec2(s1 + 0.5, s2 + 0.5)));
  float dotAA = max(g1, g2) * 1.2;
  float idot = smoothstep(dotR + dotAA, dotR - dotAA, length(lz));

  // ink coverage: passes multiply like real ink on ink
  float cov = 1.0 - (1.0 - i1) * (1.0 - i2) * (1.0 - i3) * (1.0 - idot);
  cov *= inkAmt;
  // intaglio ink is dense in the line core, a whisper lighter where the
  // paper tooth lifts it
  float tooth = vnoise(q * 0.6 + 5.0);
  cov *= 0.90 + 0.10 * tooth;

  // ---- the sheet: a warm laid paper tinted by the pale pole
  vec3 stock = mix(vec3(0.93, 0.895, 0.83), c2, 0.10);
  float fib = vnoise(vec2(q.x * 0.08, q.y * 1.1) + 3.0) * 0.6
            + vnoise(vec2(q.x * 1.1, q.y * 0.08) + 9.0) * 0.4;
  float mottle = fbm3(q * 0.012 + 5.0) - 0.5;
  float speck  = hash21(floor(q * 0.9)) - 0.5;
  float paperL = 1.0 + (fib - 0.5) * 0.05 + speck * 0.025 + mottle * 0.09;
  vec3 paper = stock * clamp(paperL, 0.7, 1.08);

  // plate tone: the wiped plate leaves a thin film of ink in the shadows,
  // tinted by the second pole the way a coloured intaglio ink would
  float lumT = dot(c1, vec3(0.299, 0.587, 0.114));
  vec3 toneInk = mix(vec3(lumT), c1, 0.55);
  float film = tone * tone * 0.16 * inkAmt;
  paper *= mix(vec3(1.0), toneInk * 0.7 + 0.2, film);

  // the ink: a near-black tinted by the deep and first poles, so a blue
  // palette prints blue-black and a warm one prints sepia
  vec3 tint = mix(c3, c0, 0.4);
  float lumI = dot(tint, vec3(0.299, 0.587, 0.114));
  tint = mix(vec3(lumI), tint, 0.85);
  vec3 ink = mix(vec3(0.045, 0.04, 0.038), tint * 0.32, 0.6);

  vec3 col = paper * mix(vec3(1.0), ink / max(paper, vec3(0.2)), cov);
  // the raised ink catches a hair of light on the far side of each line
  col += vec3(0.05) * cov * (1.0 - cov) * 0.5;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
