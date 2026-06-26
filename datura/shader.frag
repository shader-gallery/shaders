// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// datura (Rosette) — Angel trumpet datura at night. Two or three pendant
// trumpet blooms hang from an unseen branch along the top edge, drawn as softly
// glowing corolla outlines over faint translucent membranes, each long bell
// tapering to a five-pointed flared rim. A warm pool of palette light pools in
// each throat and spills partway down the bell; fine pollen motes drift slowly
// upward through the dark. Each bloom sways on its own eased pendulum so no two
// swing in step; throat glows breathe on long offset sines. Nothing opens,
// closes, or assembles — the flowers simply hang, sway, and breathe.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sway;        // pendulum amplitude of the hanging blooms   (default 0.4)
uniform float u_breezeSpeed; // rate of sway pendulums + noise gusts       (default 0.15)
uniform float u_bloomLen;    // bloom length, branch->rim, css px          (default 300)
uniform float u_blooms;      // number of hanging blooms (1..5)            (default 3)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265;
const float TAU      = 6.2831853;
const float MAXBLOOM = 5.0;  // literal cap for the bloom loop (param gates count)

// cheap hash + value noise for eased gusts and mote scatter
float hash11(float p) {
  p = fract(p * 0.2317);
  p *= p + 23.19;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.2317);
  p3 += dot(p3, p3.yzx + 23.19);
  return fract((p3.x + p3.y) * p3.z);
}
// smooth value noise in 1D (eased gust)
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x in roughly [-aspect/2..], y=0 top, y=1 bottom
  float aspect = res.x / max(res.y, 1.0);
  vec2  uv;
  uv.x = (fc.x - res.x * 0.5) / res.y; // centred, aspect-correct, units of height
  uv.y = (res.y - fc.y) / res.y;       // 0 at top of frame, 1 at bottom

  // palette with midnight fallback (headless can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  // resolve param count safely
  float nBlooms = clamp(floor(u_blooms + 0.5), 1.0, MAXBLOOM);
  if (u_blooms < 0.5) nBlooms = 1.0; // guard if unfed (0.0)
  float bloomLenH = (u_bloomLen * pr) / max(res.y, 1.0); // bell length in height units
  if (u_bloomLen < 1.0) bloomLenH = 300.0 * pr / max(res.y, 1.0);
  float breeze = max(u_breezeSpeed, 0.0);
  float sway   = clamp(u_sway, 0.0, 1.0);

  float aw = aspect; // usable half-width in height units is aspect*0.5

  // ---- accumulate the hanging blooms (constant loop bound; param gates count) ----
  for (float bi = 0.0; bi < MAXBLOOM; bi += 1.0) {
    if (bi >= nBlooms) break;

    // even spacing of branch anchors across the top, with a little jitter
    float frac = (bi + 1.0) / (nBlooms + 1.0);           // 0..1 across width
    float anchorX = (frac - 0.5) * 2.0 * aw * 0.88;      // hang point x
    float jit = hash11(bi * 13.7 + 4.0);
    anchorX += (jit - 0.5) * aw * 0.10;
    float anchorY = -0.02 - jit * 0.03;                  // just above top edge

    // per-bloom slow pendulum, eased by smooth-noise gusts, unique phase
    float ph = jit * TAU + bi * 1.7;
    float baseSwing = sin(t * breeze * 0.9 + ph);
    float gust = (vnoise(t * breeze * 0.35 + bi * 7.0) - 0.5) * 2.0;
    float swing = (baseSwing * 0.7 + gust * 0.5) * sway;  // -~1.2..1.2
    float bloomLen = bloomLenH * (0.85 + 0.30 * jit);     // size variety

    // pendulum: tilt the bell downward axis by an angle ~ swing
    float ang = swing * 0.45;                              // radians of tilt
    float ca = cos(ang), sa = sin(ang);

    // position relative to anchor, then rotate into the bell local frame
    // (local y runs DOWN the bell from throat=0 to rim=1)
    vec2 rel = uv - vec2(anchorX, anchorY);
    // rotate by -ang so the swinging bell stands upright in local space
    vec2 lp;
    lp.x = rel.x * ca + rel.y * sa;
    lp.y = -rel.x * sa + rel.y * ca;

    // normalized distance down the bell
    float yb = lp.y / max(bloomLen, 1e-4); // 0 at throat, 1 at rim

    // only shade within the bell vertical span (+ a little for rim flare)
    if (yb < -0.06 || yb > 1.18) continue;

    // trumpet profile: half-width grows from a modest throat to a flared rim,
    // curving outward like a real corolla. yc is the eased 0..1 progress.
    float yc = clamp(yb, 0.0, 1.0);
    float sizeJit = (0.85 + 0.30 * jit);
    // smooth trumpet curve: starts at a readable throat, accelerates open
    float body = 0.10 + 0.40 * smoothstep(0.0, 1.0, pow(yc, 1.25));
    float taper = body * sizeJit;                 // half-width in height units

    // five-pointed scalloped rim flare: five lobes along the rim, flaring outward
    // near yb~1.0 so the bell ends in a flared star rim with pointed tips.
    float lobe = 0.5 + 0.5 * cos(5.0 * (lp.x / max(taper, 1e-4)));
    lobe = pow(lobe, 1.6);                              // sharpen the five points
    float rimBand = exp(-pow((yb - 1.0) / 0.20, 2.0)); // peaks at the rim
    float flare = rimBand * (0.13 + 0.05 * jit) * (0.12 + 0.88 * lobe);
    float halfW = taper + flare;

    // signed horizontal distance to the corolla edge (positive = outside the bell)
    float dx = abs(lp.x) - halfW;

    // membrane fill: translucent lit interior of the bell
    float aa = 0.006;
    float inside = smoothstep(aa, -aa, dx); // 1 inside, 0 outside
    // fade membrane near the very throat top so it tucks under the branch
    float topFade = smoothstep(-0.04, 0.06, yb);
    inside *= topFade;
    inside *= 1.0 - smoothstep(1.05, 1.20, yb); // fade out below the rim
    // interior gets dimmer toward the open rim (lit from the throat above)
    float litGrad = mix(1.0, 0.34, smoothstep(0.1, 1.0, yc));
    // luminous central column: the translucent bell glows brightest down its
    // axis and toward its lit edges, so it reads as a glowing form not two lines.
    float across = abs(lp.x) / max(halfW, 1e-4);            // 0 axis .. 1 edge
    float fillGlow = (1.0 - across * across * 0.55) * inside; // domed across width

    // corolla outline: thin glowing edge of the bell
    float lw = (1.5 * pr) / max(res.y, 1.0); // outline half-thickness in height units
    float edge = 1.0 - smoothstep(0.0, lw + 0.0016, abs(dx));
    edge *= topFade;
    edge *= 1.0 - smoothstep(1.10, 1.24, yb);

    // faint longitudinal veins/fibers running down the bell (radial-phase decoration)
    float vein = 0.5 + 0.5 * cos(7.0 * lp.x / max(taper, 1e-4) + yb * 1.5);
    vein = pow(vein, 5.0) * inside * smoothstep(0.05, 0.35, yb);

    // throat glow: a warm pool of palette light pooling high in the bell and
    // spilling partway down, breathing on a long offset sine. The pool sits on
    // the bell axis so the throat reads as a luminous well, not a hollow.
    float breathe = 0.60 + 0.40 * sin(t * breeze * 0.7 + jit * TAU + bi * 2.1);
    float throatProf = exp(-pow((yb - 0.12) / 0.28, 2.0)); // pools high in the bell
    float throatCore = exp(-across * across * 2.2);        // concentrated on axis
    float throat = throatProf * (0.45 + 0.55 * throatCore) * inside * breathe;

    // colour per bloom: a slow palette drift so blooms differ subtly + loop
    float k = jit * 1.7 + bi * 0.31 + t * 0.01;
    float s = fract(k) * 4.0;
    float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
    vec3 hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
    // throat pool leans warmer: bias toward the warm palette entry
    vec3 warm = mix(hue, c3, 0.40) * vec3(1.08, 0.97, 0.84);

    // soft depth falloff: blooms lower in frame slightly dimmer (night air)
    float depth = 1.0 - 0.16 * clamp(yb, 0.0, 1.0);

    // compose this bloom
    col += hue  * edge   * 1.05 * depth;                 // glowing corolla outline
    col += warm * throat * 1.05 * depth;                 // warm throat pool
    col += hue  * fillGlow * litGrad * 0.30 * depth;     // translucent lit membrane
    col += hue  * vein   * 0.12 * depth;                 // longitudinal fibers
    // a whisper of outline bloom so the glass corolla catches light
    float ob = exp(-abs(dx) / (lw * 5.0)) * topFade * (1.0 - smoothstep(1.10,1.24,yb));
    col += hue * ob * 0.22 * depth;
  }

  // ---- pollen motes: fine glints drifting slowly UPWARD through the dark ----
  // layered cells; each cell hosts one mote that rises and fades near the top.
  float moteAccum = 0.0;
  vec3  moteCol = c2; // cool pale glints
  for (float L = 0.0; L < 3.0; L += 1.0) {
    float scale = 9.0 + L * 6.0;                 // cells across height
    float speed = breeze * (0.06 + L * 0.02);    // slow rise
    vec2 g = vec2(uv.x * aspect, uv.y);          // square-ish cells
    // scroll upward over time (motes rise => subtract from y)
    float yscroll = g.y * scale + t * speed * scale;
    vec2 cell = vec2(floor(g.x * scale), floor(yscroll));
    vec2 f    = vec2(fract(g.x * scale), fract(yscroll));
    float rnd = hash21(cell + L * 31.0);
    if (rnd > 0.5) {                              // only ~half the cells host a mote
      vec2 mp = vec2(hash21(cell + 5.0 + L*7.0), hash21(cell + 9.0 + L*7.0));
      float d = length(f - mp);
      float m = exp(-d * d * 220.0);
      // born dim low, fade out high: weight by frame position (uv.y 1=bottom)
      float life = smoothstep(0.0, 0.25, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y));
      float tw = 0.6 + 0.4 * sin(t * (0.8 + rnd) + rnd * TAU); // twinkle
      moteAccum += m * life * tw * (0.7 - L * 0.16);
    }
  }
  col += moteCol * moteAccum * 0.22;

  // gentle top-anchored gradient + side vignette so the branch edge reads dark
  float topShade = 1.0 - 0.12 * smoothstep(0.0, 0.10, uv.y);
  float sideVign = 1.0 - smoothstep(0.55, 1.05, abs(uv.x) / max(aspect * 0.5, 1e-4));
  col *= mix(0.78, 1.0, sideVign);
  col *= topShade;

  // subtle tone shaping to keep accents luminous without blowing out
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
