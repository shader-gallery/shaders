// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// beacon (Veil) - a lighthouse lantern sits just off the LEFT edge of the frame
// and its twin-panel beam turns slowly through a bank of night fog. The fog is
// the ground: it fills every corner with a dim, even, cool ambient so the frame
// is never black, but its detail is kept low until the beam finds it. Where the
// beam passes, a short radial march from the lantern toward each pixel
// accumulates fog density, so dense clumps throw long soft shadow shafts down
// the beam (crepuscular streaks) and the light reads as volume, not a wedge.
// Between sweeps the fog settles back to a clean, low-contrast field, which is
// the negative space a wordmark can sit in. The lantern itself never appears:
// only its glare bleeds in at the left edge.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sweepSpeed;   // lantern rotation rate                     (default 0.5)
uniform float u_beamWidth;    // angular half-width of the beam in degrees (default 5.0)
uniform float u_fogDensity;   // how thick the fog bank is                 (default 0.8)
uniform float u_sourceHeight; // lantern height, fraction of frame height  (default 0.7)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float PI  = 3.14159265;
const int   NSHAFT = 12;        // radial march steps lantern -> pixel (constant bound)

// ---- hash / noise (no textures) --------------------------------------------
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
// full fog field: 4 octaves, drifting slowly to the right and down like a
// bank rolling in off the water
float fbm4(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(13.1, 7.9);
    amp *= 0.5;
  }
  return v;
}
// cheap 2-octave version for the shadow march (called NSHAFT times)
float fbm2(vec2 p) {
  return 0.66 * vnoise(p) + 0.34 * vnoise(p * 2.03 + vec2(13.1, 7.9));
}

// fog density at a frame-space point. Denser toward the bottom of the frame
// (a bank lying on the water), thinner and wispier up high.
float fogAt(vec2 p, vec2 drift, float thick) {
  float n = fbm4(p * 3.1 + drift);
  // a second, finer layer riding a little faster gives the clumps a ragged
  // wispy edge once the beam lights them
  float n2 = fbm4(p * 7.5 + drift * 1.7 + vec2(3.3, 1.1));
  n = n * 0.72 + n2 * 0.28;
  float lowBias = smoothstep(0.65, -0.55, p.y);          // 1 low, 0 high
  float d = smoothstep(0.30, 0.86, n + 0.10 * lowBias);
  return d * mix(0.55, 1.0, lowBias) * thick;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  res = u_resolution;
  vec2  uv  = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  float t   = u_time;

  // ---- palette with house fallback (headless can leave the array zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- materials derived from the palette ----------------------------------
  // ambient fog: the darkest palette entry pulled most of the way to its own
  // grey, so the ground is a cool dim haze in every theme rather than a colour.
  float l3 = dot(c3, vec3(0.299, 0.587, 0.114));
  vec3  fogAmb = mix(vec3(l3), c3, 0.35);
  fogAmb = fogAmb / max(l3, 0.05) * 0.13;                  // pin ambient luminance ~0.13
  // beam: near-white lantern light with a tint of the lightest palette entry
  float l2 = dot(c2, vec3(0.299, 0.587, 0.114));
  vec3  beamCol = mix(vec3(1.0), c2 / max(l2, 0.05), 0.35);
  // faint second tint for the far skirt of the beam (reads as colour depth)
  vec3  skirtCol = mix(beamCol, c1 / max(dot(c1, vec3(0.299,0.587,0.114)), 0.05), 0.35);

  // ---- frame coordinates: y up, x spans +-aspect/2 -----------------------
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // lantern just off the left edge at the chosen height
  float srcY = clamp(u_sourceHeight, 0.0, 1.0) - 0.5;
  vec2  S    = vec2(-0.5 * aspect - 0.10, srcY);
  vec2  d    = p - S;
  float r    = length(d);
  float ang  = atan(d.y, d.x);

  // ---- fog drift + density at this pixel ------------------------------------
  float thick = max(u_fogDensity, 0.0);
  vec2  drift = vec2(t * 0.045, -t * 0.012);
  float dens  = fogAt(p, drift, thick);

  // ---- the turning beam -----------------------------------------------------
  // two lantern panels 180 degrees apart, so one is always somewhere in the
  // half-plane facing the frame. Phase is continuous, never resets.
  float theta = 1.15 - t * u_sweepSpeed * 0.35;
  float da    = abs(mod(ang - theta + 0.5 * PI, PI) - 0.5 * PI); // angular distance to nearest panel
  float w     = max(u_beamWidth, 0.3) * PI / 180.0;
  float core  = exp(-(da * da) / (w * w) * 1.6);
  // wide soft fan around the core: the light the fog scatters sideways
  float skirt = exp(-(da * da) / (w * w * 12.0)) * 0.34;
  // the widest, faintest scatter fan is left unshadowed (it is bounce light)
  float fan   = exp(-(da * da) / (w * w * 55.0)) * 0.11;
  // panel light falls off with distance from the lantern
  float fall  = exp(-r * 0.30) / (0.45 + r * 0.45);

  // ---- shadow march: fog between the lantern and this pixel --------------
  // Only worth paying for where the beam has any presence; elsewhere the
  // transmittance is irrelevant and we skip the loop.
  float beamAmt = core + skirt;
  float trans = 1.0;
  if (beamAmt > 0.003) {
    float acc = 0.0;
    vec2  q = S;
    vec2  dq = d / float(NSHAFT);
    for (int i = 0; i < NSHAFT; i++) {
      q += dq;
      // finer mist along the ray, same drift as the visible fog. Clumps close
      // to the lantern subtend the widest angle, so they are weighted up: that
      // is what turns the shadows into long radial streaks instead of a mush.
      float n = fbm2(q * 6.5 + drift * 1.4 + vec2(3.3, 1.1));
      float near = 1.6 - 1.1 * float(i) / float(NSHAFT);
      acc += smoothstep(0.48, 0.72, n) * near;
    }
    // normalise to a 0..1 occlusion so the shafts are CONTRAST inside the
    // beam rather than a global dimming of its far end; thicker fog deepens
    // the shadows without ever black-holing the beam
    float occl = clamp((acc / float(NSHAFT) - 0.22) / 0.55, 0.0, 1.0);
    occl *= smoothstep(0.0, 0.5, r);                // no shadows right at the lantern
    trans = 1.0 - 0.9 * occl * clamp(thick * 0.9, 0.0, 1.0);
  }

  // scattered beam light: proportional to fog density (with a floor so thin
  // fog still shows the beam), attenuated by the shadow march
  float scat = (0.40 + 0.72 * dens);
  vec3  beam = (beamCol * core * 1.45 + skirtCol * skirt) * fall * scat * trans
             + skirtCol * fan * fall * (0.3 + 0.7 * dens);

  // ---- lantern glare bleeding in at the left edge -------------------------
  // the source itself is off-frame; its glare is a warm-white bloom that
  // decays fast across the first part of the frame and picks up the fog.
  float glare = exp(-r * 7.0) * (0.55 + 0.45 * dens) * 0.55;
  // a broad faint scatter halo so the lantern side of the fog is a shade lighter
  float halo  = exp(-r * 1.4) * 0.14;

  // ---- compose ------------------------------------------------------------
  // ambient fog ground: even tone, low detail (the negative space)
  // a very broad, slow swell keeps the haze from reading as a flat card
  float swell = fbm4(p * 0.9 + drift * 0.4 + vec2(9.0, 4.0));
  vec3 col = fogAmb * (0.80 + 0.10 * dens + 0.16 * swell);
  // slight vertical lift toward the top (thinner fog reads a touch lighter)
  col *= 1.0 + 0.10 * uv.y;
  col += fogAmb * (halo + glare * 0.8) * 3.0;
  col += beamCol * glare * 0.35;
  col += beam;

  // optional pointer flourish: a faint second lantern from the pointer,
  // gated to zero at rest (u_mouse == 0 means no pointer)
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  if (mAmt > 0.002) {
    vec2 m = vec2((u_mouse.x / res.x - 0.5) * aspect, u_mouse.y / res.y - 0.5);
    float rm = length(p - m);
    col += beamCol * exp(-rm * 6.0) * 0.12 * mAmt * (0.4 + dens);
  }

  // soft filmic compress so the beam core saturates to white gracefully
  col = col / (1.0 + col * 0.34);
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
