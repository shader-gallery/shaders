// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// thermal (Smolder) - a thermal camera pointed at a room of moving heat. The
// scene is a temperature field: a slow ambient drift of warm and cool air,
// a handful of hot sources wandering on their own paths, and a convective
// plume rising off each source, built by advecting a noise warp upward so the
// hot edges waver like heat over a radiator. The camera then does what
// thermal cameras do: it maps temperature to a false-colour ramp whose
// brightness rises monotonically with heat (the four palette colours are
// sorted by luminance so cold is the dark pole and white-hot sits above the
// bright one), posterises that ramp into isotherm steps with a thin contour
// at each step edge, blooms the hottest cores, and lays sensor character
// over the top: a coarse detector grid of temporal noise, faint fixed-pattern
// row noise, and cold vignetting at the lens edges. No UI is drawn; the
// banded ramp itself carries the scale-bar feel.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bands;    // isotherm step count                     (default 14)
uniform float u_step;     // posterisation: smooth (0) to stepped (1) (default 0.75)
uniform float u_heat;     // source temperature, how far into white   (default 1.0)
uniform float u_speed;    // drift speed of the sources and the air   (default 0.3)
uniform float u_noise;    // detector noise and row pattern strength  (default 0.6)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

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

float fbm4(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// one hot source: an anisotropic gaussian, taller than it is wide so the
// warm air trails upward, plus a wide faint halo (the lens blooms hot things)
float source(vec2 p, vec2 c, float r, float amp, float turb) {
  vec2 d = p - c;
  float q = dot(d, d) / (r * r);
  float body = exp(-q * 1.8) + 0.16 * exp(-q * 0.28);
  // the plume: a column above the source that widens and cools as it rises,
  // its brightness broken up along its length by the convection noise
  float h  = max(d.y, 0.0);
  float wd = r * (0.55 + 0.9 * h);
  float col = exp(-(d.x * d.x) / (wd * wd)) * exp(-h * 1.1) * smoothstep(0.0, 0.25 * r, d.y);
  col *= 0.55 + 0.45 * turb;
  return amp * (body + 0.55 * col);
}

// convective warp: noise advected upward. Low frequency, so it is computed
// once per pixel and shared by the three field samples in main.
vec2 convection(vec2 p, float t) {
  vec2 adv = p * 1.6 + vec2(0.0, -t * 0.9);
  return vec2(fbm4(adv + 3.1), fbm4(adv + vec2(7.7, 2.2))) - 0.5;
}

// the temperature field at frame coords p, 0 cold .. ~1.4 white hot
float temperature(vec2 p, vec2 w, float t, float heat) {
  // the warp is stronger higher in the frame so the plumes waver more the
  // further they have risen
  float rise = 0.08 + 0.16 * smoothstep(-0.9, 0.9, p.y);
  vec2 pw = p + w * rise;
  // brightness modulation along the plumes, from the same rising noise
  float turb = smoothstep(-0.25, 0.25, w.x + w.y);

  // ambient air: slow, low frequency, warm and cool pockets
  float air = fbm4(p * 0.9 + vec2(t * 0.07, t * 0.04) + 21.0);
  // warm air pools under the ceiling: a gentle stratification up the frame
  float T = 0.08 + 0.30 * air + 0.09 * smoothstep(-1.0, 1.0, p.y);

  // hot sources wandering on lissajous paths across the frame
  float ph = t * 0.55;
  vec2 c0p = vec2(-1.05 + 0.55 * sin(ph * 0.61 + 1.0),  0.15 + 0.40 * sin(ph * 0.47));
  vec2 c1p = vec2( 0.95 + 0.50 * sin(ph * 0.43 + 2.5), -0.55 + 0.30 * cos(ph * 0.53 + 0.4));
  vec2 c2p = vec2( 0.10 + 0.70 * cos(ph * 0.37 + 4.1),  0.30 + 0.35 * sin(ph * 0.66 + 1.9));
  vec2 c3p = vec2(-0.55 + 0.45 * sin(ph * 0.71 + 3.3), -0.65 + 0.22 * cos(ph * 0.39 + 2.6));
  vec2 c4p = vec2( 1.15 + 0.35 * cos(ph * 0.52 + 0.9),  0.55 + 0.35 * sin(ph * 0.44 + 5.0));
  vec2 c5p = vec2( 0.35 + 0.60 * sin(ph * 0.33 + 0.2), -0.80 + 0.15 * sin(ph * 0.58 + 3.9));

  float s = 0.0;
  s += source(pw, c0p, 0.34, 1.00, turb);
  s += source(pw, c1p, 0.26, 0.85, turb);
  s += source(pw, c2p, 0.44, 0.70, turb);
  s += source(pw, c3p, 0.18, 0.95, turb);
  s += source(pw, c4p, 0.30, 0.60, turb);
  s += source(pw, c5p, 0.22, 0.55, turb);
  // sources breathe slightly, as if the load on them varies
  s *= 0.9 + 0.1 * sin(t * 0.8 + p.x);

  // soft saturation so stacked sources roll into white instead of blowing out
  float hot = s * heat;
  T += 1.15 * hot / (1.0 + 0.55 * hot);
  return T;
}

// false-colour ramp: dark pole through the sorted palette to white hot.
// Brightness is monotonic in T, which is what makes it read as a thermal
// image and not a rainbow map.
vec3 ramp(float T, vec3 k0, vec3 k1, vec3 k2, vec3 k3) {
  vec3 cold  = k0 * 0.10;
  vec3 hot   = mix(k3, vec3(1.0), 0.78);
  vec3 c = cold;
  c = mix(c,  k0 * 0.55, smoothstep(0.00, 0.24, T));
  c = mix(c,  k0,        smoothstep(0.24, 0.42, T));
  c = mix(c,  k1,        smoothstep(0.42, 0.60, T));
  c = mix(c,  k2,        smoothstep(0.60, 0.78, T));
  c = mix(c,  k3,        smoothstep(0.78, 0.94, T));
  c = mix(c,  hot,       smoothstep(0.94, 1.18, T));
  return c;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // sort the four palette colours by luminance: a small compare-swap network
  vec3 k0 = c0, k1 = c1, k2 = c2, k3 = c3, tmp;
  if (luma(k0) > luma(k1)) { tmp = k0; k0 = k1; k1 = tmp; }
  if (luma(k2) > luma(k3)) { tmp = k2; k2 = k3; k3 = tmp; }
  if (luma(k0) > luma(k2)) { tmp = k0; k0 = k2; k2 = tmp; }
  if (luma(k1) > luma(k3)) { tmp = k1; k1 = k3; k3 = tmp; }
  if (luma(k1) > luma(k2)) { tmp = k1; k1 = k2; k2 = tmp; }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  uv     = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float bands  = max(floor(u_bands + 0.5), 2.0);
  float stepA  = clamp(u_step, 0.0, 1.0);
  float heat   = max(u_heat, 0.0);
  float nz     = clamp(u_noise, 0.0, 2.0);

  // frame-relative coords, height = 2
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;

  // optional pointer: a warm hand held near the lens. Zero at rest.
  vec2  m    = (u_mouse / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mOn  = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // ---- temperature and its finite-difference slope (for contour width)
  float e  = 2.0 / res.y * 1.5;
  vec2  w  = convection(p, t);
  float T  = temperature(p, w, t, heat) + mOn * source(p, m, 0.30, 0.8 * heat, 0.5);
  float Tx = temperature(p + vec2(e, 0.0), w, t, heat) + mOn * source(p + vec2(e, 0.0), m, 0.30, 0.8 * heat, 0.5);
  float Ty = temperature(p + vec2(0.0, e), w, t, heat) + mOn * source(p + vec2(0.0, e), m, 0.30, 0.8 * heat, 0.5);
  float slope = length(vec2(Tx - T, Ty - T)) / e;   // dT per frame unit

  // ---- detector character. Thermal cores are coarse: a grid of detector
  // pixels each with its own temporal noise, plus fixed row pattern.
  float cellPx = 3.0 * pr;                        // detector pixel in device px
  vec2  cell   = floor(gl_FragCoord.xy / cellPx);
  float frame  = floor(u_time * 14.0);
  float tnoise = hash21(cell + vec2(frame * 0.37, frame * 1.13)) - 0.5;
  float rowFP  = hash21(vec2(cell.y, 3.7)) - 0.5;
  float colFP  = hash21(vec2(cell.x, 9.1)) - 0.5;
  T += nz * (0.012 * tnoise + 0.008 * rowFP + 0.005 * colFP);

  // lens edge: the optics see the cold housing toward the corners
  vec2  vq   = uv - 0.5;
  float edge = smoothstep(0.30, 0.85, length(vq * vec2(1.0, 1.15)) * 1.45);
  T -= 0.07 * edge;

  // ---- isotherm posterisation with a thin contour at every step
  float Ts   = T * bands;
  float Tq   = (floor(Ts) + 0.5) / bands;
  float Tb   = mix(T, Tq, stepA);
  // contour: distance to the nearest step edge in device pixels
  float fr   = abs(fract(Ts) - 0.5);              // 0.5 at the edge, 0 mid band
  float edgeDist = (0.5 - fr) / bands / max(slope, 1e-3) * res.y * 0.5;  // px
  float line = 1.0 - smoothstep(0.4 * pr, 1.3 * pr, edgeDist);
  line *= stepA * smoothstep(0.02, 0.12, slope);  // no lines on flat plateaus

  // ---- colour
  vec3 col = ramp(Tb, k0, k1, k2, k3);
  // contour lines: a hair darker than the band, as if the step is a small
  // brightness cliff the display could not smooth
  col *= 1.0 - 0.28 * line;
  // white-hot bloom on the cores, spilling a little past the step edges
  float core = smoothstep(0.95, 1.30, T);
  col += vec3(0.35) * core * core * heat;
  // a whisper of the temporal noise as brightness too, so the image crawls
  col *= 1.0 + nz * 0.07 * tnoise;
  // cold corners of the housing
  col *= 1.0 - 0.18 * edge;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
