// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// griddistort (Manifold) - a fine drafting grid printed on a dark painted
// wall, seen through a sheet of rippling glass. A travelling wavefront and an
// expanding ring both push the grid about: the grid is drawn by INVERSE
// mapping (each pixel asks where it came from in the flat grid), and the
// local Jacobian of that map, taken by finite differences, says how much the
// grid is squeezed at this pixel. Where the wave compresses the sheet the
// lines crowd together, THICKEN and brighten as if the ink piled up; where
// it stretches them they thin and fade. Each pixel samples the grid three
// times with the displacement scaled a little short, exact and a little long,
// and the mismatch between those samples is painted as a warm and a cool
// fringe, so a slight chromatic split rides only where the glass is bending.
// A caustic band of light follows the compression front, the wall shows
// paint texture and a broad top-left light, and a slow breathing warp keeps
// every corner of the grid alive between pulses. The wave, the ring and the
// breathing all share one 24 second period, so the piece loops.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pitch;      // grid pitch in css px                   (default 11)
uniform float u_amplitude;  // wave displacement, frame-relative      (default 1.0)
uniform float u_speed;      // travel speed of the waves              (default 1.0)
uniform float u_thicken;    // how much compression fattens the ink   (default 1.0)
uniform float u_fringe;     // chromatic split along the displacement (default 0.5)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float TAU = 6.28318530718;
const float LOOP = 24.0;    // seconds for one full cycle of every wave

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// one wave pulse: a short train of crests under a gaussian envelope,
// centred on s = 0. lambda is the crest spacing, sigma the envelope width.
float pulse(float s, float lambda, float sigma) {
  return sin(TAU * s / lambda) * exp(-(s * s) / (2.0 * sigma * sigma));
}

// the displacement field, in frame units (short side of the frame = 1).
// w is the frame-unit position, t the looped time in seconds, amp the
// displacement scale. Three parts: a diagonal wavefront crossing the frame,
// a ring expanding from a slowly orbiting centre, and a gentle full-frame
// breathing warp so the grid is never dead still anywhere.
vec2 disp(vec2 w, float t, float amp, float aspect) {
  float ph = t / LOOP;                       // 0..1 across the loop

  // ---- wavefront: travels along dir, period P1 in frame units, twice a loop
  vec2  dir = normalize(vec2(1.0, 0.42));
  float P1  = 1.25;
  // a little waviness along the front so it is not a ruler-straight line
  float wob = (vnoise(w * 2.6 + vec2(3.1, 7.7)) - 0.5) * 0.09;
  float s1  = dot(w, dir) + wob - ph * 2.0 * P1;
  s1 = mod(s1, P1) - P1 * 0.5;
  vec2 d1 = dir * pulse(s1, 0.30, 0.15);

  // ---- ring: expands from an orbiting centre, period P2 in frame units
  vec2  ctr = vec2(0.5 * aspect + 0.30 * aspect * sin(TAU * ph),
                   0.5 + 0.24 * cos(TAU * ph));
  vec2  rv  = w - ctr;
  float r   = length(rv);
  float P2  = 1.10;
  float s2  = mod(r - ph * 2.0 * P2, P2) - P2 * 0.5;
  vec2 d2 = rv / max(r, 1e-4) * pulse(s2, 0.24, 0.11) * 0.75 / (1.0 + 1.6 * r)
          * smoothstep(0.0, 0.10, r);      // no pinch at the centre

  // ---- breathing: a broad slow undulation across the whole sheet
  vec2 d3 = 0.22 * vec2(sin(w.y * 5.0 + TAU * ph + w.x * 1.7),
                        cos(w.x * 4.2 - TAU * ph - w.y * 2.3));

  return amp * (d1 + d2 + d3);
}

// coverage of a grid line family at fractional position f (cells), given the
// screen-space gradient magnitude of that coordinate (cells per device px),
// a line semi-width in device px and an anti-alias width in px
float lineCov(float f, float gradMag, float hw, float aa) {
  float dc = abs(fract(f + 0.5) - 0.5);         // cells to nearest line
  float dp = dc / max(gradMag, 1e-5);           // device px to nearest line
  return 1.0 - smoothstep(hw - aa, hw + aa, dp);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr       = max(u_pixelRatio, 0.25);
  vec2  res      = u_resolution;
  vec2  fc       = gl_FragCoord.xy;
  float minRes   = min(res.x, res.y);
  float aspect   = res.x / res.y;
  // frame units: short side = 1. The grid pitch is given in css px at a
  // 400 css px reference frame, so the LINE COUNT holds tile to fullsize.
  float refScale = minRes / (max(u_pixelRatio, 1.0) * 400.0);
  float pitchDev = max(u_pitch, 4.0) * refScale * pr;    // device px per cell
  float pitchF   = pitchDev / minRes;                     // frame units per cell
  float t        = u_time * clamp(u_speed, 0.0, 4.0);
  float amp      = clamp(u_amplitude, 0.0, 3.0) * 0.034;
  float thick    = clamp(u_thicken, 0.0, 2.0);
  float fr       = clamp(u_fringe, 0.0, 1.0) * 0.22;

  vec2 w = fc / minRes;                                   // frame units
  vec2 uv = fc / res;

  // optional pointer flourish: a gentle dimple under the cursor, exactly zero
  // when there is no pointer
  vec2  mw   = u_mouse / minRes;
  float mOn  = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2  mv   = w - mw;
  float mr   = length(mv);
  vec2  mD   = mOn * mv / max(mr, 1e-4) * 0.05 * amp * 30.0 * exp(-mr * mr / 0.03) * (mr / 0.12);

  // ---- inverse map with finite differences for the Jacobian
  float e  = 1.0 / minRes;                                // one device px
  vec2 D0 = disp(w, t, amp, aspect) + mD;
  vec2 Dx = disp(w + vec2(e, 0.0), t, amp, aspect) + mD;
  vec2 Dy = disp(w + vec2(0.0, e), t, amp, aspect) + mD;
  vec2 q0 = (w + D0) / pitchF;                            // flat grid coords, cells
  vec2 qx = (w + vec2(e, 0.0) + Dx) / pitchF;
  vec2 qy = (w + vec2(0.0, e) + Dy) / pitchF;
  // gradient of each grid coordinate across the screen, cells per device px
  vec2 gX = vec2(qx.x - q0.x, qy.x - q0.x);
  vec2 gY = vec2(qx.y - q0.y, qy.y - q0.y);
  float mX = length(gX), mY = length(gY);
  // compression ratio per family: 1 where the grid is flat, >1 squeezed
  float kX = mX * pitchDev;
  float kY = mY * pitchDev;
  float comp = 0.5 * (kX + kY);

  // ---- line geometry: thickness grows with compression, fades with stretch
  float baseHW = 0.55 * refScale * pr;                    // minor line semi-width, device px
  float aa     = 0.75 * pr;
  float tX = mix(1.0, kX, thick * 0.85);
  float tY = mix(1.0, kY, thick * 0.85);
  float hwX = baseHW * clamp(tX, 0.35, 3.5);
  float hwY = baseHW * clamp(tY, 0.35, 3.5);
  // ink brightness: the ink is conserved, so crowded lines glow brighter
  float bX = clamp(mix(1.0, kX, thick * 0.7), 0.35, 2.4);
  float bY = clamp(mix(1.0, kY, thick * 0.7), 0.35, 2.4);

  // three samples of the grid: displacement a touch short, exact, a touch long
  vec2 qR = q0 - D0 * fr / pitchF;
  vec2 qB = q0 + D0 * fr / pitchF;
  float minorG = max(lineCov(q0.x, mX, hwX, aa) * bX, lineCov(q0.y, mY, hwY, aa) * bY);
  float minorR = max(lineCov(qR.x, mX, hwX, aa) * bX, lineCov(qR.y, mY, hwY, aa) * bY);
  float minorB = max(lineCov(qB.x, mX, hwX, aa) * bX, lineCov(qB.y, mY, hwY, aa) * bY);
  // major lines every five cells, a little heavier
  float majHWX = hwX * 1.7, majHWY = hwY * 1.7;
  float majorG = max(lineCov(q0.x / 5.0, mX / 5.0, majHWX, aa) * bX,
                     lineCov(q0.y / 5.0, mY / 5.0, majHWY, aa) * bY);
  float majorR = max(lineCov(qR.x / 5.0, mX / 5.0, majHWX, aa) * bX,
                     lineCov(qR.y / 5.0, mY / 5.0, majHWY, aa) * bY);
  float majorB = max(lineCov(qB.x / 5.0, mX / 5.0, majHWX, aa) * bX,
                     lineCov(qB.y / 5.0, mY / 5.0, majHWY, aa) * bY);

  // ---- the wall: dark painted plaster tinted by the deep pole, with roller
  // texture at css-pixel scale and a broad light falling from the top left
  vec2  cp    = fc / pr;                                  // css px
  vec3  deep  = mix(vec3(luma(c3)), c3, 0.45);
  vec3  cool  = mix(vec3(luma(c0)), c0, 0.35);
  vec3  wallT = normalize(deep * 0.6 + cool * 0.4 + 0.05);
  float paint = fbm(cp * 0.045 + 3.0) - 0.5;
  float tooth = vnoise(cp * 0.9 + 17.0) - 0.5;
  float light = 0.50 + 1.0 * exp(-dot(w - vec2(0.30 * aspect, 0.82), w - vec2(0.30 * aspect, 0.82)) / 0.55);
  vec3  wall  = wallT * 0.30 * light * (1.0 + paint * 0.55 + tooth * 0.14);
  // the sheet under stress: the wall reads a touch lighter where the glass
  // gathers light and darker where it spreads it
  wall *= clamp(1.0 + (comp - 1.0) * 0.35, 0.6, 1.5);

  // ---- ink colours: minor lines in the first pole lifted toward white, major
  // lines in the pale third pole; fringes warm (fourth) and cool (second)
  vec3 minorC = mix(c0, vec3(1.0), 0.30) * 0.62;
  vec3 majorC = mix(c2, vec3(1.0), 0.30) * 0.85;
  vec3 warmC  = c3;
  vec3 coolC  = mix(c1, c2, 0.5);

  vec3 col = wall;

  // soft halo under the lines so they sit in the glass rather than on top
  float haloD = min(abs(fract(q0.x + 0.5) - 0.5) / max(mX, 1e-5),
                    abs(fract(q0.y + 0.5) - 0.5) / max(mY, 1e-5));
  col += minorC * 0.10 * exp(-haloD / (5.0 * pr)) * comp;

  // minor grid: main pass plus the split fringes where the samples disagree
  col += minorC * minorG;
  col += warmC * max(minorR - minorG, 0.0) * 0.8;
  col += coolC * max(minorB - minorG, 0.0) * 0.8;
  // major grid on top
  col += majorC * majorG;
  col += warmC * max(majorR - majorG, 0.0) * 0.9;
  col += coolC * max(majorB - majorG, 0.0) * 0.9;

  // ---- caustic: the compression front gathers light into a soft band
  float caus = smoothstep(1.05, 1.8, comp);
  col += mix(c1, c2, 0.35) * caus * 0.34;
  // and the stretched trough behind it falls into shadow
  col *= 1.0 - 0.25 * smoothstep(0.85, 0.45, comp);

  // seat the frame: gentle vignette
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.22 * smoothstep(0.30, 0.95, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
