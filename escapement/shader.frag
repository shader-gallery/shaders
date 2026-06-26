// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// escapement (Trace) — concentric toothed rings, the wheel train of a pocket
// watch seen face-on. Thin etched circles scallop into gear teeth via an angular
// wave; each ring advances in discrete ticks rather than smooth rotation. At a
// fixed pallet point on every ring the engaging tooth flares at the instant of
// the tick, its phosphor afterglow decaying until the next step. Rings tick at
// meshed rates (inner twice for the next ring's once) so faster inner wheels
// shimmer while the outer wheel turns with slow gravity. Tooth highlights take
// alternating palette colours. The gallery's only strictly stepped tempo.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four phosphor colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_tickRate;   // ticks per second on the driving wheel (default 1)
uniform float u_ringGap;    // radial gap between rings, css px       (default 90)
uniform float u_snap;       // step-easing sharpness 0.1..1           (default 0.7)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265;
const float TAU      = 6.28318530;
const int   NRINGS   = 5;     // wheels in the train (innermost ticks fastest)
const float TEETH0   = 12.0;  // teeth on the innermost wheel
const float LINE_CSS = 2.0;   // etched circle half-thickness, css px

// stepped easing of a continuous phase `ph` (in tick units): hold, snap, hold.
// returns the eased tick index in continuous units. `snap` in (0,1]: near 0 it
// oozes almost linearly, near 1 it holds dead still then snaps instantaneously.
float stepEase(float ph, float snap) {
  float i = floor(ph);
  float f = fract(ph);
  // width of the transition window shrinks as snap -> 1
  float w = mix(0.85, 0.06, clamp(snap, 0.0, 1.0));
  float e = smoothstep(0.5 - w * 0.5, 0.5 + w * 0.5, f);
  return i + e;
}

// distance from fract(x) to the nearest integer tick, for the flare phase
float tickPhase(float ph) {
  return fract(ph);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // guard params so the full slider range is safe (uniforms are 0 if unfed)
  float tickRate = max(u_tickRate, 0.001);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float ringGap = max(u_ringGap, 1.0) * refScale * pr;
  float snap     = clamp(u_snap, 0.1, 1.0);
  float line     = LINE_CSS * pr;

  // polar coords centred on the watch face
  vec2  p   = fc - ctr;
  float r   = length(p);
  float ang = atan(p.y, p.x); // -PI..PI

  // first ring radius leaves a small hub at centre; a modest fixed-ish floor
  // keeps the innermost wheel from collapsing into the arbor at large gaps,
  // while small gaps nest the full 3-4 wheel train into the centre.
  float r0  = ringGap * 0.42 + 28.0 * pr;

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 ringCols[4];
  ringCols[0] = c0; ringCols[1] = c1; ringCols[2] = c2; ringCols[3] = c3;

  // pallet point: where the engaging tooth flares (fixed on each ring), at the
  // 12-o'clock position of the face
  float palletAng = PI * 0.5;

  // soft inner hub radius — bloom is masked inside this so the centre stays a
  // clean dark arbor and the per-ring bloom can't paint radial spokes
  float hubR = r0 * 0.85;

  // accumulate contributions from each ring of the train
  for (int ri = 0; ri < NRINGS; ri++) {
    float fi = float(ri);

    // ring geometry
    float ringR  = r0 + fi * ringGap;
    float teeth  = TEETH0 + fi * 4.0; // outer wheels carry more teeth

    // meshed rates: inner wheel ticks fastest, halving each step outward, so the
    // whole train returns to its mesh on a long seamless loop. Outer = slow.
    float rate   = tickRate / pow(1.7, fi);
    float ph     = t * rate;                 // continuous tick phase
    float eased  = stepEase(ph, snap);       // hold-snap-hold tick index

    // Each tick advances the wheel by a fixed angle. The step count per
    // revolution is chosen NOT to equal the tooth count, so every tick visibly
    // shifts the teeth to a fresh angular position (a whole-tooth advance would
    // alias back to an identical-looking wheel). Steps-per-rev are mutually
    // chosen so the whole train returns to its mesh on a long seamless loop.
    // Alternate spin direction per ring like meshing gears.
    float dir    = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
    float stepsPerRev = teeth + 5.0;           // coprime-ish with teeth
    float rot    = dir * eased * (TAU / stepsPerRev);

    // toothed edge: scallop the circle radius with an angular square-ish wave
    float a      = ang + rot;
    float toothW = 0.5 + 0.5 * cos(a * teeth); // 0..1, peaks at tooth tips
    // sharpen the scallop a touch so teeth read as teeth, not a sine wave
    toothW       = smoothstep(0.12, 0.88, toothW);
    float toothDepth = ringGap * 0.16;
    float edgeR  = ringR + (toothW - 0.5) * 2.0 * toothDepth;

    // thin etched stroke along the toothed edge (anti-aliased)
    float dr     = abs(r - edgeR);
    float stroke = 1.0 - smoothstep(0.0, line + pr * 1.3, dr);
    // skip rings whose radius runs off the visible face (keeps the train tidy)
    float ringMask = 1.0 - smoothstep(min(res.x, res.y) * 0.46, min(res.x, res.y) * 0.52, ringR);
    stroke *= ringMask;

    // base ring colour, alternating palette entries per wheel (no dynamic index)
    vec3 base = ringCols[0] * (mod(fi, 4.0) < 0.5 ? 1.0 : 0.0)
              + ringCols[1] * (abs(mod(fi, 4.0) - 1.0) < 0.5 ? 1.0 : 0.0)
              + ringCols[2] * (abs(mod(fi, 4.0) - 2.0) < 0.5 ? 1.0 : 0.0)
              + ringCols[3] * (abs(mod(fi, 4.0) - 3.0) < 0.5 ? 1.0 : 0.0);

    // --- pallet flare: the engaging tooth glows at the instant of each tick,
    // afterglow decaying until the next step (pure function of tick phase). ---
    float tph    = tickPhase(ph);            // 0 just after a tick -> 1 before next
    // sharper attack with higher snap, longer decay tail
    float decayK = mix(2.2, 5.5, snap);
    float after  = exp(-tph * decayK);       // 1 at tick, fading to ~0

    // the whole rim brightens on each tick (the wheel catching the escape beat),
    // decaying through the hold — gives the static frame a global breathing
    // pulse. Higher snap deadens the hold and sharpens the tick: the steady
    // floor drops while the on-tick peak climbs, so the beat reads harder.
    float floorB = mix(0.68, 0.16, snap);
    float beat   = floorB + (1.0 - floorB) * after;

    // bloom is masked to a thin shell hugging the rim AND faded out inside the
    // hub, so it can never streak inward as radial spokes through the centre.
    float hubFade = smoothstep(hubR, hubR + ringGap * 0.35, r);
    float rimBloom = exp(-dr / (line * 4.0)) * hubFade;

    // persistent etched line — the cold phosphor trace of the wheel rim
    col += base * stroke * 0.78 * beat;
    // a whisper of bloom hugging each rim so the etching catches light
    col += base * rimBloom * ringMask * 0.26 * beat;

    // --- pallet flare: a SINGLE engaging tooth at 12 o'clock flares on the tick.
    // The angular gate is narrow and, crucially, scaled by ring radius so the
    // arc-length of the lit region is roughly one tooth wide on EVERY wheel
    // (wide gate on the inner small wheel, very tight on the big outer one).
    // It is also confined to the meshing tooth tip and clamped so it cannot
    // reach the frame edge — no continuous vertical comet-tail. ---
    float dA     = abs(atan(sin(ang - palletAng), cos(ang - palletAng)));
    // angular half-width that holds one tooth: shrinks with more teeth / bigger r
    float gateW  = (PI / teeth) * 0.5;
    float gate   = exp(-(dA * dA) / (gateW * gateW));
    // strongly attenuate the flare on outer rings so only the inner meshing
    // wheels actually flare (outermost barely glints) — kills the stacking beam
    float ringAtten = exp(-fi * 0.9);
    // flare sits on the very tooth TIP (where edgeR bulges outward), biased to a
    // single tip rather than a wedge spanning several teeth
    float tipW   = smoothstep(0.55, 1.0, toothW);
    float flare  = after * gate * tipW * ringAtten;

    // alternating highlight colour for the flaring tooth
    vec3 hiCol = mix(ringCols[1], ringCols[2], 0.5 + 0.5 * sin(fi * 1.7));

    // higher snap = a brighter, harder tick flare (the wheel slams to its stop)
    float snapBoost = mix(0.55, 2.0, snap);

    // radial bloom around the tip, kept TIGHT to the rim and hub-faded so it
    // never beams outward past the frame nor inward across the centre
    float tipBloom = exp(-dr / (line * 3.0)) * hubFade * flare;
    // vignette the flare itself toward the edge so it dies well inside the frame
    float flareVign = 1.0 - smoothstep(0.30, 0.50, edgeR / min(res.x, res.y));

    // flare core riding the stroke
    col += hiCol * flare * stroke * 2.0 * snapBoost * flareVign;
    col += hiCol * tipBloom * 0.7 * snapBoost * flareVign;
    // a small glowing dot pinned right at the engaging tip to mark the escapement
    float dotR  = exp(-dr / (line * 2.0));
    col += hiCol * dotR * gate * tipW * ringAtten * (0.25 + 0.6 * after) * 0.45 * snapBoost * flareVign;
  }

  // central hub: a faint glowing arbor so the train has a heart
  float hub = exp(-r / (r0 * 0.5));
  col += mix(c2, c0, 0.5) * hub * 0.18;

  // radial vignette keeps the frame dark at the edges, face luminous in centre
  float vign = 1.0 - smoothstep(0.45, 1.15, r / (min(res.x, res.y) * 0.5));
  col *= vign;

  // gentle tonemap to keep flares from blowing fully white
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
