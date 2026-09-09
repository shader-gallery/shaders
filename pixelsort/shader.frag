// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// pixelsort (Glitch) - the Asendorf pixel-sort: an image is scanned row by
// row, every run of pixels brighter than a threshold is cut out, sorted by
// brightness and written back, so the bright parts of the picture smear into
// long monotone gradients that end in a hard edge where the run stops. The
// runtime is a single pass with no neighbour reads, so the sort is rebuilt
// analytically. The image underneath is procedural: a soft landscape-like
// field, a lit sky, a low sun, drifting cloud masses and a dark ground, with
// enough detail that it reads as a blurred photograph rather than a
// gradient. For each pixel inside a bright run the shader marches along its
// row in both directions to find where the brightness falls back under the
// threshold, refining each crossing by interpolation, and records the peak
// brightness it passed. That gives the run extent and its brightest member,
// which is all a sort needs: the pixel takes the luminance of the sorted
// ramp at its fractional position in the run (convex, since most pixels of a
// run sit just above threshold and only a few are bright), keeping the local
// hue of the picture. The threshold is jittered per row so run edges break
// into the ragged teeth of the real effect, and it breathes slowly while the
// clouds drift, so streaks grow, snap and re-form. A direction control turns
// the whole sort from horizontal to vertical.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_threshold; // brightness above which a run is sorted (default 0.42)
uniform float u_tooth;     // per-row threshold jitter, edge raggedness (default 0.6)
uniform float u_direction; // 0 horizontal sort, 1 vertical            (default 0.0)
uniform float u_scale;     // feature scale of the picture underneath  (default 1.3)
uniform float u_speed;     // drift of the picture and the threshold   (default 0.3)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const int NMARCH = 16;     // search steps each way along the row

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

// four octaves with a high gain so the cloud field keeps mid-scale billow:
// cheap enough to call thirty-odd times in the row march
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.13 + vec2(11.7, 5.3);
    a *= 0.56;
  }
  return s * 0.86;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// ---- the picture underneath. p is frame coords (x scaled by aspect, y 0..1
// bottom to top), t drives the cloud drift. Returns brightness only; the
// colour is resolved once, at the pixel, from the same ingredients.
// Composition: a lit sky graded down to a dark ground, a low sun glow off
// centre, cloud masses drifting across, a dark ragged treeline.
float sunGlow(vec2 p) {
  vec2 d = (p - vec2(0.62, 0.66)) * vec2(1.0, 1.35);
  float r2 = dot(d, d);
  return exp(-r2 * 9.0) + 0.35 * exp(-r2 * 1.6);
}
float clouds(vec2 p, float t, float scl) {
  return fbm3(vec2(p.x * 1.1, p.y * 2.2) * scl + vec2(t * 0.045, t * 0.008));
}
float treeline(vec2 p, float t, float scl) {
  float ridge = 0.12 + 0.05 * (vnoise(vec2(p.x * 3.0 * scl + t * 0.01, 2.0)) - 0.5)
              + 0.05 * (vnoise(vec2(p.x * 11.0 * scl - t * 0.02, 5.0)) - 0.5)
              + 0.02 * (vnoise(vec2(p.x * 37.0 * scl, 9.0)) - 0.5);
  return smoothstep(ridge + 0.015, ridge - 0.015, p.y);
}
float picture(vec2 p, float t, float scl) {
  float sky   = 0.24 + 0.26 * smoothstep(0.0, 1.0, p.y);
  float cl    = clouds(p, t, scl) - 0.5;
  float glow  = sunGlow(p);
  float L = sky + cl * 1.05 + glow * 0.50;
  // clouds in front of the sun read as bright rims, dark bodies
  L += glow * cl * 0.5;
  // the ground: dark, but lit, with its own soft mottle and a haze lift
  // toward the horizon so the treeline never reads as a black slab
  float ground = treeline(p, t, scl);
  float gL = 0.12 + 0.08 * cl + 0.12 * smoothstep(0.0, 0.22, p.y) + glow * 0.08;
  L = mix(L, gL, ground);
  return clamp(L, 0.0, 1.0);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  uv     = gl_FragCoord.xy / res;
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float scl    = max(u_scale, 0.2);
  float vert   = clamp(u_direction, 0.0, 1.0);
  float tooth  = clamp(u_tooth, 0.0, 1.0);

  // frame coords for the picture: x spans aspect, y spans 0..1
  vec2 p = vec2(uv.x * aspect, uv.y);

  // optional pointer flourish: the threshold dips around the pointer so the
  // sort blooms under it; zero at rest
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2  mP   = vec2(u_mouse.x / res.x * aspect, u_mouse.y / res.y);

  // ---- sort axis. Rows run along ax; the row id is the coordinate across it.
  vec2  ax    = normalize(mix(vec2(1.0, 0.0), vec2(0.0, 1.0), vert));
  float rowCo = mix(gl_FragCoord.y, gl_FragCoord.x, vert) / pr;   // css px row
  float row   = floor(rowCo);
  float extent = mix(aspect, 1.0, vert);                          // row length, frame units
  float along  = dot(p, ax);                                      // position along the row

  // ---- threshold: base, slow breath, per-row jitter (the teeth), and a
  // slower per-row wander so neighbouring rows share long runs in places
  float thr = clamp(u_threshold, 0.05, 0.95);
  thr += 0.04 * sin(t * 0.37) + 0.025 * sin(t * 0.91 + 1.7);
  float rowJit = (hash21(vec2(row, 7.0 + floor(t * 0.5))) - 0.5) * 0.05
               + (vnoise(vec2(row * 0.05, t * 0.1)) - 0.5) * 0.16
               + (vnoise(vec2(row * 0.011, 4.0 + t * 0.06)) - 0.5) * 0.14;
  thr += rowJit * tooth;
  thr -= mAmt * 0.12 * exp(-dot(p - mP, p - mP) * 6.0);

  // ---- the picture at this pixel
  float L0 = picture(p, t, scl);

  // ---- run search: march both ways along the row for the threshold crossing
  float stepF = extent / float(NMARCH) * 0.5;   // covers half the row each way
  float x0 = along, x1 = along;                 // run bounds (frame units)
  float peak = L0;
  float inRun = step(thr, L0);
  for (int dir = 0; dir < 2; dir++) {
    float sgn = (dir == 0) ? 1.0 : -1.0;
    float prevL = L0, prevX = along;
    float found = 0.0, bound = along + sgn * float(NMARCH) * stepF;
    for (int i = 1; i <= NMARCH; i++) {
      float xs = along + sgn * float(i) * stepF;
      vec2  ps = p + ax * (xs - along);
      float Ls = picture(ps, t, scl);
      if (found < 0.5) {
        peak = max(peak, Ls);
        if (Ls < thr) {
          // linear refinement of the crossing between the last two samples
          float f = clamp((prevL - thr) / max(prevL - Ls, 1e-4), 0.0, 1.0);
          bound = mix(prevX, xs, f);
          found = 1.0;
        }
        prevL = Ls; prevX = xs;
      }
    }
    if (dir == 0) x1 = bound; else x0 = bound;
  }
  // clamp the run to the frame
  x0 = max(x0, 0.0); x1 = min(x1, extent);
  // interval cut: a sorter working in fixed-length intervals restarts its
  // ramp every so often along a long run, which is where the repeated
  // sawtooth bands of the classic look come from. The interval length
  // wanders slowly row to row so the restarts stagger into staircases.
  float cutLen = extent * mix(0.14, 0.75, vnoise(vec2(row * 0.07, 3.0 + floor(t * 0.25))));
  float k = floor((along - x0) / cutLen);
  float s0 = x0 + k * cutLen;
  float s1 = min(s0 + cutLen, x1);
  float runLen = max(s1 - s0, 1e-4);
  float u = clamp((along - s0) / runLen, 0.0, 1.0);
  // later intervals of a run inherit only what is left of the brightness
  peak = mix(peak, thr + (peak - thr) * 0.7, step(0.5, k));
  x1 = s1;

  // ---- sorted luminance: ascending along the row, convex ramp from the
  // threshold up to the brightest member the run held
  float ramp = thr + (peak - thr) * 1.45 * u * u * (0.6 + 0.4 * u);
  // a real sort also stacks the darkest members first, so the run starts a
  // touch under threshold, which is what makes the left edge sit flush
  ramp = mix(thr - 0.04, ramp, smoothstep(0.0, 0.08, u));

  // ---- colour the picture: shadows in the deep pole, mids in the first,
  // sky highs in the pale pole, the sun in the warm pole
  vec3 deep  = mix(c3, vec3(luma(c3)), 0.35) * 0.35;
  vec3 mid   = mix(c0, vec3(luma(c0)), 0.25);
  vec3 high  = mix(c2, vec3(1.0), 0.25);
  float glow = sunGlow(p);
  vec3 sunC  = mix(c1, vec3(1.0), 0.3);
  float L = mix(L0, ramp, inRun);
  vec3 col = mix(deep, mid, smoothstep(0.05, 0.42, L));
  col = mix(col, high, smoothstep(0.42, 0.90, L));
  col = mix(col, sunC, clamp(glow * 0.6, 0.0, 1.0) * smoothstep(0.35, 0.8, L));
  // sorted runs go a little chromatic at their bright end: the hot pixels
  // of the sun and sky rims get dragged along the streak
  col = mix(col, sunC, inRun * 0.7 * smoothstep(0.5, 0.95, ramp) * smoothstep(0.2, 1.0, u));
  // luminance match: the colour ramps above are hue only, pin the brightness
  col *= L / max(luma(col), 1e-3);

  // ---- the picture texture: a faint film grain and a soft vignette so the
  // untouched parts read as a photograph
  float grain = (hash21(gl_FragCoord.xy + fract(t) * 7.0) - 0.5) * 0.035;
  col += grain * (1.0 - inRun * 0.6);
  // hard bright edge at the end of each run: a one-pixel lift
  float edgePx = (x1 - along) / (extent) * mix(res.x, res.y, vert) / pr;
  col += inRun * high * 0.18 * smoothstep(1.5, 0.0, edgePx) * step(0.5, peak - thr + 0.3);
  col *= 1.0 - 0.18 * smoothstep(0.35, 1.0, length(uv - 0.5) * 1.42);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
