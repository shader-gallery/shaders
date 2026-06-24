// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// neon (Noir) — one elegant abstract neon tube hangs centered on a near-black
// wall: a single flowing stroke of two linked arcs, no letters, with a
// white-hot core, a wide coloured halo, and a dim soft splash of that colour
// cast on the wall behind it. The tube performs a repeating ignition ritual —
// it stutters to life in ragged flickers, settles into a steady hum-glow,
// falters once, relaxes dark, then re-ignites in the next palette colour. The
// colour index advances each cycle so the full loop spans four cycles with no
// visible seam. Nothing translates or drifts; the drama is purely temporal.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cyclePeriod;  // seconds for one ignite-hum-falter-dark cycle (default 12)
uniform float u_flicker;      // raggedness of stutter & falter, 0 smooth .. 1 violent (default 0.6)
uniform float u_tubeWidth;    // hot-core thickness in css px           (default 4)
uniform float u_halo;         // coloured glow radius in css px          (default 50)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black wall ~#09090B
const float TUBE_SCALE = 0.30;  // tube half-extent as fraction of min(res)

// cheap hash for hash-driven flicker
float hash11(float x) {
  return fract(sin(x * 91.3458) * 47453.5453);
}
// smoothed value-noise in 1D so flicker reads as ragged, not pure static
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  f = f * f * (3.0 - 2.0 * f);
  return mix(a, b, f);
}

// signed distance from p to an arc: a circle of radius rad centred at c, spanning
// angles [a0, a1]. Returns distance to the nearest point ON the arc (endpoints
// are rounded caps). Works in the tube's normalized space.
float sdArc(vec2 p, vec2 c, float rad, float a0, float a1) {
  vec2 q = p - c;
  float ang = atan(q.y, q.x);
  // wrap ang into [a0, a0+2pi) then clamp into the swept span
  float twoPi = 6.2831853;
  float rel = mod(ang - a0, twoPi);
  float span = a1 - a0;
  if (rel <= span) {
    // inside the angular sweep: distance is |length - rad|
    return abs(length(q) - rad);
  }
  // outside: nearest endpoint cap
  vec2 e0 = c + rad * vec2(cos(a0), sin(a0));
  vec2 e1 = c + rad * vec2(cos(a1), sin(a1));
  return min(length(p - e0), length(p - e1));
}

// the neon glyph SDF in normalized space (units ~ fraction of TUBE_SCALE).
// Two arcs of equal radius, point-symmetric through the origin, share a vertical
// tangent at the origin so they read as ONE continuous flowing S-stroke (their
// inner ends coincide there — no central gap, no stray endpoint lobes).
float glyphSD(vec2 p) {
  float R = 0.52;
  // upper arc: centre to the right, curling up and around the left/top.
  // its lower-right end sits at the origin (angle ~pi for centre at +x).
  float d1 = sdArc(p, vec2( R, 0.0), R, 2.36, 4.32);
  // lower arc: point-symmetric copy, curling down and around the right/bottom;
  // its upper-left end also sits at the origin → the two ends meet seamlessly.
  float d2 = sdArc(p, vec2(-R, 0.0), R, -0.78, 1.18);
  return min(d1, d2);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // --- normalized, aspect-correct coordinates centred on the tube ---
  float minRes = min(res.x, res.y);
  vec2  uv = (fc - ctr) / (minRes * TUBE_SCALE);

  // signed distance to the glyph centreline, expressed back in device px
  float sdN = glyphSD(uv);
  float sd  = sdN * (minRes * TUBE_SCALE);   // px distance to the tube line

  // --- param-driven sizes (css px → device px) ---
  float period = max(u_cyclePeriod, 0.5);    // guard div-by-zero / strobe
  float core   = max(u_tubeWidth, 0.5) * pr; // hot-core half-thickness, px
  float halo   = max(u_halo, 1.0) * pr;      // coloured glow radius, px
  float flick  = clamp(u_flicker, 0.0, 1.0);

  // ================= temporal ignition ritual =================
  // cycle phase in [0,1); which cycle we are in selects the palette colour.
  float cyc   = t / period;
  float cycId = floor(cyc);
  float ph    = fract(cyc);

  // envelope over one cycle:  ignite-stutter -> steady hum -> falter -> dark
  //  ph 0.00..0.22  ragged ramp up
  //  ph 0.22..0.62  steady hum (subtle shimmer)
  //  ph 0.62..0.72  a single falter dip
  //  ph 0.72..1.00  relax to dark
  float ignite = smoothstep(0.0, 0.18, ph);
  float relax  = 1.0 - smoothstep(0.72, 0.96, ph);
  float base   = ignite * relax;             // smooth on-then-off bed

  // ragged stutter, strongest while igniting and while relaxing dark (a faulty
  // sign sputters at both the catch and the dying fade), with a low continuous
  // sputter through the hum. At flick=0 this collapses to the smooth bed; at 1
  // it sputters hard. Because it's tied to the unstable phases AND carries a
  // small always-on term, flicker reads visibly at any sampled moment.
  float startZone = 1.0 - smoothstep(0.04, 0.26, ph);  // catching at startup
  float fadeZone  = smoothstep(0.66, 0.94, ph);         // sputtering as it dies
  float stutZone  = max(max(startZone, fadeZone), 0.32);// 0.32 = faint hum sputter
  // ragged factor: layered fast noise + hard dropouts. Crucially it is almost
  // always well below 1 (mean ~0.45), so blending toward it with flicker visibly
  // darkens & roughens the tube at ANY sampled instant — not only on a lucky
  // dropout. Higher flicker deepens the gate so dropouts get more frequent.
  float fn  = vnoise(t * 22.0 + cycId * 13.0);
  float fn2 = vnoise(t * 9.0  + cycId * 5.0);
  float blink = step(0.62 - flick * 0.30, fn);         // dropouts; more at hi flick
  float ragged = blink * (0.25 + 0.55 * fn) * (0.5 + 0.5 * fn2);
  float stutter = mix(1.0, ragged, stutZone * flick);

  // mid-hum falter: one brief dip around ph~0.55, raggedness scaled by flicker
  float falterZone = exp(-pow((ph - 0.55) / 0.045, 2.0));
  float fdip = 1.0 - falterZone * (0.55 + 0.4 * vnoise(t * 17.0 + cycId * 7.0)) * (0.35 + 0.65 * flick);

  // subtle shimmer during steady hum so it breathes rather than sits flat
  float hum = 1.0 + 0.06 * sin(t * 5.3) + 0.04 * vnoise(t * 3.1);

  float drive = base * stutter * fdip * hum;
  drive = clamp(drive, 0.0, 1.2);

  // ================= palette colour for this cycle =================
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // cycId advances the colour each cycle; weighted four-way blend (no dynamic
  // indexing). A tiny crossfade window keeps the per-cycle hue swap seamless,
  // and because the dark relax phase sits between cycles the swap is hidden.
  float s = mod(cycId, 4.0);
  // narrow triangular weights centred on each integer slot
  float w0 = max(0.0, 1.0 - abs(s - 0.0)) + max(0.0, 1.0 - abs(s - 4.0));
  float w1 = max(0.0, 1.0 - abs(s - 1.0));
  float w2 = max(0.0, 1.0 - abs(s - 2.0));
  float w3 = max(0.0, 1.0 - abs(s - 3.0));
  vec3 hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ================= compose the tube =================
  vec3 col = BG;

  float ad = abs(sd);

  // wall splash: a broad, dim pool of the colour cast behind the tube. Uses a
  // much wider falloff than the halo and is dimmer, reading as bounced light.
  float splash = exp(-ad / (halo * 2.6));
  col += hue * splash * 0.20 * drive;

  // coloured halo: the wide aura hugging the tube in the palette colour.
  float glow = exp(-ad / (halo * 0.55));
  col += hue * glow * 1.15 * drive;

  // a tighter inner glow lifts saturation right next to the core
  float glow2 = exp(-ad / (core * 4.0 + halo * 0.08));
  col += hue * glow2 * 0.9 * drive;

  // white-hot core: a crisp antialiased line of near-white light.
  float coreLine = 1.0 - smoothstep(core, core + 1.6 * pr, ad);
  vec3  hotCol   = mix(hue, vec3(1.0), 0.82);   // white-hot, faint colour tint
  col += hotCol * coreLine * 1.5 * drive;

  // ================= vignette keeps the frame composed =================
  float vign = 1.0 - smoothstep(0.45, 1.18, length((fc - ctr) / res));
  col *= mix(0.55, 1.0, vign);
  col += BG * (1.0 - vign) * 0.0;  // keep corners at true BG (no lift)

  gl_FragColor = vec4(col, 1.0);
}
