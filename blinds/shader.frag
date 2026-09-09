// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// blinds (Veil) - vertical fabric blinds hanging in front of a lit window.
// Behind them a luminous colour field drifts: the light of a sky or a street
// seen through frosted glass. Each slat is a real curved surface: a shallow
// arc in cross-section, rotated about its hanging axis by a tilt angle, and
// solved per pixel by a short fixed-point iteration so the screen x maps
// back to a position across the arc. From that come a normal for wrapped
// diffuse and a satin specular band, a translucency term where the window
// light bleeds through the cloth, and a thin bright rim at the edge that
// faces the light. Three neighbouring slats are composited in depth order
// with anti-aliased edges, and the slat in front lays a soft contact shadow
// on the one behind it, so the run of slats has weight. Where the slats do
// not cover, the window shows through, and its light wraps onto the slat
// edges either side of every gap. A wave of tilt travels along the run so
// the blinds open and close in a slow ripple, the whole set breathes between
// nearly shut and half open, and a draft sways the slats gently.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_count;    // slats across the frame width           (default 13)
uniform float u_tilt;     // base tilt, 0 face-on to 1 edge-on       (default 0.55)
uniform float u_curve;    // slat curvature                          (default 1.0)
uniform float u_glow;     // window light through and around slats   (default 1.0)
uniform float u_sway;     // sway, tilt wave and drift speed         (default 0.5)

const float PI = 3.14159265359;

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

// the window: a luminous colour field behind the blinds. Frame coords q
// (x scaled by aspect, y 0..1). Bright, soft, drifting: two broad glows of
// the warmer poles over a cool ground, blurred as if through frosted glass.
vec3 window(vec2 q, float t, float aspect, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2  w  = vec2(fbm(q * 1.3 + vec2(t * 0.04, -t * 0.03)),
                  fbm(q * 1.3 + vec2(4.7, 2.9) + vec2(-t * 0.03, t * 0.05))) - 0.5;
  vec2  qq = q + w * 0.35;
  // a dusk sky: brightest along the horizon, deepening toward the zenith,
  // and a dark street below the sill
  float horizon = 0.48;
  vec3  col = mix(c0 * 0.95, c3 * 0.45, smoothstep(horizon, 1.05, qq.y));
  col = mix(col, c3 * 0.22, smoothstep(horizon + 0.02, horizon - 0.22, qq.y));
  // the sunset band: a warm glow hugging the horizon, strongest about a
  // drifting point low in the middle of the window
  float gx = aspect * 0.5 + 0.25 * sin(t * 0.11);
  float band = exp(-abs(qq.y - horizon + 0.02) * 4.5) * exp(-abs(qq.x - gx) * 1.1);
  col = mix(col, c2 * 1.25, clamp(band * 1.3, 0.0, 1.0));
  // afterglow bleeding up the sky above it
  col = mix(col, c1 * 1.05, 0.55 * smoothstep(0.9, 0.0, length((qq - vec2(gx, horizon)) * vec2(0.8, 1.6))));
  // a cooler lamp glow high toward the right edge
  vec2  g2 = vec2(aspect * 0.88 + 0.08 * cos(t * 0.08), 0.82 + 0.06 * sin(t * 0.13));
  col = mix(col, c0 * 1.15, 0.6 * smoothstep(0.55, 0.05, length(qq - g2)));
  // frosted bloom: lift the whole field toward white in its brightest part
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += vec3(0.30) * smoothstep(0.55, 1.1, lum) * 0.35;
  return col;
}

// arc profile of a slat in its own frame: s across the width in -0.5..0.5,
// height toward the viewer, and its slope
float arcZ(float s, float curve)  { return curve * 0.42 * (0.25 - s * s); }
float arcDz(float s, float curve) { return -curve * 0.84 * s; }

// one slat: given the pixel x in slat-pitch units and the slat index, find
// where on the arc the pixel lands. Writes coverage alpha, depth toward the
// viewer, the 3D normal, the across-slat coordinate and the edge distance.
void slat(float X, float idx, float tilt, float curve, float pxW, float sway,
          out float alpha, out float depth, out vec3 n, out float sOut, out float edge) {
  float cx   = idx + 0.5 + sway;                 // hanging axis in pitch units
  float wid  = 1.14;                             // slat width, pitch units
  float cs   = cos(tilt), sn = sin(tilt);
  // solve X = cx + (s * cs - z(s) * sn) * wid for s by fixed-point iteration
  float s = (X - cx) / (wid * cs);
  for (int i = 0; i < 4; i++) {
    s = clamp(s, -0.6, 0.6);
    s = (X - cx) / wid / cs + arcZ(s, curve) * wid * sn / (wid * cs);
  }
  s = clamp(s, -0.6, 0.6);
  edge  = 0.5 - abs(s);                          // distance to the slat edge, s units
  // projected edge softness: one pixel in s units through the slant
  float aa = pxW / (wid * max(cs, 0.12));
  alpha = smoothstep(-aa, aa, edge);
  depth = (s * sn + arcZ(s, curve) * cs) * wid;
  // local normal (across, toward viewer) rotated by the tilt
  vec2  nl = normalize(vec2(-arcDz(s, curve), 1.0));
  vec2  nr = vec2(nl.x * cs - nl.y * sn, nl.x * sn + nl.y * cs);
  n = vec3(nr.x, 0.0, nr.y);
  sOut = s;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  vec2  uv     = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  float count  = max(u_count, 3.0);
  float t      = u_time * clamp(u_sway, 0.0, 2.0);
  float curve  = clamp(u_curve, 0.0, 2.0);
  float glow   = clamp(u_glow, 0.0, 2.0);
  float pxW    = count / res.x;                  // one device pixel in pitch units

  // the window light behind everything, softened further behind the cloth
  vec2 q = vec2(uv.x * aspect, uv.y);
  vec3 back = window(q, t, aspect, c0, c1, c2, c3);

  // ---- tilt: base setting, a slow breath, and a wave travelling along the
  // run so the blinds open and close in a ripple from one side to the other
  float baseTilt = mix(0.08, 1.25, clamp(u_tilt, 0.0, 1.0));
  baseTilt += 0.12 * sin(t * 0.21);

  float X  = uv.x * count;
  float i0 = floor(X);

  // ---- three candidate slats, front-to-back compositing
  vec3  L  = normalize(vec3(-0.55, 0.45, 0.70));
  vec3  V  = vec3(0.0, 0.0, 1.0);
  vec3  H  = normalize(L + V);
  vec3  cloth = mix(vec3(0.13, 0.13, 0.155), c3, 0.30);  // dyed fabric, matte
  cloth = mix(cloth, vec3(dot(cloth, vec3(0.299, 0.587, 0.114))), 0.30);

  float al[3]; float dp[3]; vec3 cl[3]; float ex[3]; float xl[3]; float xr[3];
  for (int k = 0; k < 3; k++) {
    float idx  = i0 + float(k) - 1.0;
    // per-slat tilt wave and sway (a draft moves down the run)
    float tilt = baseTilt + 0.38 * sin(t * 0.55 - idx * 0.72);
    tilt = clamp(tilt, 0.05, 1.35);
    // slats hang from the top, so the free lower ends swing the most
    float sway = 0.08 * sin(t * 0.9 + idx * 0.7 + uv.y * 2.2) * (1.0 - 0.7 * uv.y);
    float a, d, s, e; vec3 n;
    slat(X, idx, tilt, curve, pxW, sway, a, d, n, s, e);
    // projected span of this slat on screen, pitch units
    float halfSpan = 0.5 * 1.14 * cos(tilt);
    xl[k] = idx + 0.5 + sway - halfSpan;
    xr[k] = idx + 0.5 + sway + halfSpan;

    // fabric: fine vertical fibre in the weave, and a faint weft
    float fib  = vnoise(vec2((s + 0.5) * 70.0 + idx * 13.0, uv.y * 900.0)) - 0.5;
    float weft = vnoise(vec2((s + 0.5) * 5.0 + idx * 3.1, uv.y * 40.0)) - 0.5;
    vec3  alb  = cloth * (1.0 + fib * 0.10 + weft * 0.06);

    // lighting: wrapped diffuse, a satin band, and window light coming
    // through the cloth strongest where the slat faces the window square on
    float ndl  = clamp(dot(n, L) * 0.6 + 0.4, 0.0, 1.0);
    float ndh  = clamp(dot(n, H), 0.0, 1.0);
    float spec = ndh * ndh; spec *= spec; spec *= spec; spec *= spec; spec *= spec;
    float facing = clamp(n.z, 0.0, 1.0);
    vec3  trans  = back * (0.05 + 0.16 * facing * facing) * glow;
    // rim: the edge nearest the light picks up a bright line, the far edge
    // sinks into a dark seam
    float rimL = smoothstep(0.10, 0.0, e) * smoothstep(0.0, 0.5, 0.5 - s);
    vec3  col  = alb * (0.10 + 0.90 * ndl) + trans;
    col += mix(vec3(1.0), c2, 0.35) * spec * 0.30;
    col += back * rimL * 0.30 * glow;
    col *= 1.0 - 0.18 * smoothstep(0.12, 0.0, e);          // soft edge fold
    // the far edge turns away from the room and tucks behind its neighbour
    col *= 1.0 - 0.40 * smoothstep(-0.15, -0.5, s);
    // a little top light down the hanging slat
    col *= 0.92 + 0.14 * uv.y;

    al[k] = a; dp[k] = d; cl[k] = col; ex[k] = e;
  }

  // depth order, farthest first. Depth is only meaningful where a slat is
  // hit, but the clamped value of a missed slat still ranks its near edge
  // in front, which is what the shadow wants.
  float d0 = dp[0], d1 = dp[1], d2 = dp[2];
  int o0, o1, o2;
  if (d0 <= d1 && d0 <= d2)      { o0 = 0; if (d1 <= d2) { o1 = 1; o2 = 2; } else { o1 = 2; o2 = 1; } }
  else if (d1 <= d0 && d1 <= d2) { o0 = 1; if (d0 <= d2) { o1 = 0; o2 = 2; } else { o1 = 2; o2 = 0; } }
  else                           { o0 = 2; if (d0 <= d1) { o1 = 0; o2 = 1; } else { o1 = 1; o2 = 0; } }

  // contact shadow: a slat nearer the viewer darkens what lies just past
  // its edge. The light hangs to the left, so the shadow falls to the right
  // of a slat and is fainter on its lit side.
  float shadowB = 1.0;   // on the back-most
  float shadowM = 1.0;   // on the middle
  for (int k = 0; k < 3; k++) {
    float dR = X - xr[k];                 // past the right edge
    float dL = xl[k] - X;                 // past the left edge
    float sh = exp(-max(dR, 0.0) / 0.09) * step(0.0, dR) * 0.60
             + exp(-max(dL, 0.0) / 0.05) * step(0.0, dL) * 0.30;
    if (k == o2) { shadowB = min(shadowB, 1.0 - sh); shadowM = min(shadowM, 1.0 - sh); }
    if (k == o1) { shadowB = min(shadowB, 1.0 - sh * 0.8); }
  }

  // light wrap: the window light bleeds over slat edges on either side of a
  // gap. Keyed to how open this stretch of the run is.
  float openness = clamp(1.0 - 1.14 * cos(baseTilt + 0.38 * sin(t * 0.55 - i0 * 0.72)), 0.0, 1.0);
  float gapDist  = 10.0;
  for (int k = 0; k < 3; k++) {
    // inside distance to this slat edge; only slats that span the pixel count
    float inside = min(X - xl[k], xr[k] - X);
    if (inside >= 0.0) gapDist = min(gapDist, inside);
  }
  vec3  wrap = back * exp(-max(gapDist, 0.0) * 14.0) * 0.45 * glow * (0.35 + 0.65 * openness);

  // composite back to front over the window
  vec3 acc = back;
  for (int k = 0; k < 3; k++) {
    int   idx   = (k == 0) ? o0 : ((k == 1) ? o1 : o2);
    float shade = (k == 0) ? shadowB : ((k == 1) ? shadowM : 1.0);
    float a; vec3 c;
    // WebGL1 cannot index arrays with a runtime int, so select by chain
    if (idx == 0)      { a = al[0]; c = cl[0]; }
    else if (idx == 1) { a = al[1]; c = cl[1]; }
    else               { a = al[2]; c = cl[2]; }
    acc = mix(acc, c * shade + wrap, a);
  }

  // the room: gentle falloff at the frame corners
  vec2  vq = uv - 0.5;
  acc *= 1.0 - 0.20 * smoothstep(0.30, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(acc, 1.0);
}
