// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// peat (Smolder) — a cross-section of dark ground: faint horizontal soil
// strata as low-contrast banded FBM, with a buried seam running roughly level
// at mid-height. The seam smoulders from within: along one travelling stretch
// it glows, and the light escapes UPWARD through narrow vertical fissures (a
// ridged-noise crack mask above the seam), so the burn reads as stitched
// threads of ember light leaking out of the earth rather than as a drawn edge.
// The glow grades through the four palette colours along its escape path —
// hottest in the seam core, cooling up through the crack throats until it dies
// just short of the surface. Behind the lit stretch the seam dims to a barely
// -lit ash band; ahead it is coal black and silent. The burning boundary
// itself is never seen — only what escapes the fissures. A staggered second
// seam-phase crossfades in (while dark) after the first has cooled, so the
// underground burn never visibly restarts.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_seamSpeed;       // how fast the lit stretch travels along the seam (default 0.12)
uniform float u_fissureDensity;  // spatial frequency of the vertical cracks the glow escapes (default 1.2)
uniform float u_glowReach;       // how far in css px the seam light climbs the fissures before dying (default 60), scaled by u_pixelRatio
uniform float u_ashEmber;        // residual ember level left in the seam behind the front; 0 = pure black (default 0.12)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// smooth value noise (C1)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fbm, rotated per octave; range ~[0,0.97], mean ~0.5
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.616, 1.214, -1.214, 1.616);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// one seam-phase: returns accumulated ember light from a buried seam whose lit
// stretch travels left-to-right. `prog` is the front position in css-x units
// (advances monotonically); `seed` decorrelates the two staggered phases.
// xCss/yCss are css-px coords; seamY is the seam height (css px); reach is the
// glow climb distance (css px); pr is pixelRatio.
vec3 seamPhase(float xCss, float yCss, float seamY, float prog, vec2 seed,
               vec3 c0, vec3 c1, vec3 c2, vec3 c3, float reach, float pr,
               float fissFreq, float ashEmber) {
  // wobble the seam line a little so it isn't dead level
  float seamWob = (fbm(vec2(xCss / 220.0, 3.1) + seed) - 0.5) * 34.0;
  float sy = seamY + seamWob;

  // height above the seam (only light leaking UPward matters)
  float above = yCss - sy;

  // ---- the travelling lit stretch along the seam --------------------------
  // a soft window centred on the front; the front has a sharp leading edge
  // (coal black ahead) and a long cooling tail behind it (ash). `lit` is the
  // current burn intensity at this x; `passed` is how far behind the front.
  float behind = prog - xCss;             // >0 once the front has passed here
  float lead   = smoothstep(120.0, -10.0, behind); // 1 just-after, 0 well-ahead
  // residual ash ember a long way behind the front (banked down, never relit)
  float tail   = ashEmber * exp(-max(behind, 0.0) / 520.0);
  // hot band right at the front
  float hotBand = exp(-behind * behind / (180.0 * 180.0)) * step(-260.0, behind);
  float lit     = clamp(max(hotBand, tail) * lead + tail, 0.0, 1.4);

  // x-varying burn texture: not every span of the lit stretch is equally hot
  float burnVar = 0.55 + 0.45 * fbm(vec2(xCss / 90.0 + prog * 0.004, 9.7) + seed);
  lit *= burnVar;

  if (lit < 0.002) return vec3(0.0);

  // ---- ridged vertical fissures: the cracks the glow escapes through -------
  // ridged noise in x gives sharp vertical threads. The throats narrow with
  // height (cracks pinch shut toward the surface) so light dies just short.
  // Each thread meanders slightly as it climbs, so the leak reads as stitched
  // filaments of light rather than a flat sheet. The meander is keyed by
  // HEIGHT only (not a 2-D fbm) so a given crack stays a coherent column.
  float cellW   = max(40.0 / fissFreq, 5.0);  // css px between fissures
  float meander = (fbm(vec2(yCss / 70.0, seed.x)) - 0.5) * 26.0
                + (fbm(vec2(yCss / 24.0, seed.y + 4.0)) - 0.5) * 9.0;
  float fx = (xCss + meander) / cellW;
  // two ridged bands at different scales -> stitched-thread look
  float r1 = 1.0 - abs(2.0 * vnoise(vec2(fx,        seed.x * 1.3)) - 1.0);
  float r2 = 1.0 - abs(2.0 * vnoise(vec2(fx * 2.07 + 5.1, seed.y)) - 1.0);
  float ridge = r1 * 0.70 + r2 * 0.30;
  ridge = pow(clamp(ridge, 0.0, 1.0), 3.0);  // sharpen into threads (ridge>=0, safe)

  // ---- vertical escape profile: light climbs the fissure and dies out ------
  // climb 0 at seam, 1 at reach; the throat closes (ridge gate) higher up.
  float h = clamp(above / reach, 0.0, 4.0);
  // seam core: a compact incandescent pocket sitting ON the seam line; it leans
  // upward (asymmetric) so it reads as glow welling out of the earth, not a
  // free-floating horizontal bar.
  float coreUp = exp(-above * above / (16.0 * 16.0));
  float coreDn = exp(-above * above / (8.0 * 8.0));
  float core   = (above >= 0.0) ? coreUp : coreDn * 0.6;
  // upward leak: the threads carry light up; decays with height and pinches
  // shut just short of the surface (smoothstep gate near h=1).
  float climb = exp(-h * 1.55) * ridge * (1.0 - smoothstep(0.55, 1.05, h));
  // only above the seam (light escapes UPward); hard floor just below it
  float aboveGate = smoothstep(-10.0, 14.0, above);
  float escape = (core * 0.9 + climb * 2.2 * aboveGate);

  // faint slow flicker of the leak (intensity only — threads don't move)
  float flick = 0.80 + 0.20 * vnoise(vec2(xCss / 50.0, h * 3.0) + vec2(prog * 0.01, 0.0) + seed);
  escape *= flick;

  // ---- palette grade along the escape path ---------------------------------
  // hottest in the seam core (c0->c1 hot), cooling up through the throats (c3)
  // and dying into the cool tip (c2). h is the climb fraction.
  vec3 ramp = mix(c0, c1, 0.35);                       // seam-core hot
  ramp = mix(ramp, c3, smoothstep(0.05, 0.42, h));     // warm mid throat
  ramp = mix(ramp, c2, smoothstep(0.45, 0.95, h));     // cool dying tip
  // white-hot pinch right in the seam core where it's most incandescent
  vec3 hotc = mix(ramp, vec3(1.0, 0.93, 0.78), 0.5);
  ramp = mix(ramp, hotc, core * 0.7);

  return ramp * escape * lit;
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.25);
  vec2  fragPx = gl_FragCoord.xy;
  vec2  cssP   = fragPx / pr;
  vec2  resCss = u_resolution / pr;
  float t      = u_time;

  float reach    = max(u_glowReach, 4.0) * 1.0;        // css px climb distance
  float fissFreq = clamp(u_fissureDensity, 0.05, 6.0);
  float ashEmber = clamp(u_ashEmber, 0.0, 0.5);
  float speed    = max(u_seamSpeed, 0.0);

  // seam sits a touch below centre so the leak has room to climb into frame
  float seamY = resCss.y * 0.46;

  // ---- dark ground: faint horizontal soil strata (low-contrast banded fbm)
  // bands are stretched horizontally (small y-scale, large x-scale) and tilt
  // very slightly so strata read as sedimentary layers.
  float tilt   = cssP.x * 0.035;
  float strata = fbm(vec2(cssP.x / 320.0, (cssP.y + tilt) / 26.0));
  float fine   = fbm(vec2(cssP.x / 60.0, (cssP.y + tilt) / 7.0));
  float soil   = strata * 0.7 + fine * 0.3;
  // very low contrast, near-black; darker toward the bottom (deeper = denser)
  float depth  = smoothstep(resCss.y, 0.0, cssP.y);
  vec3  ground = BG * (0.55 + 0.85 * soil) * (0.85 - 0.25 * depth);

  vec3 col = ground;

  // ---- travelling front, two staggered crossfaded phases -------------------
  // travel distance: front sweeps left->right across (frame width + margins).
  // span includes generous margins so the front is fully off-frame (seam dark)
  // during each phase's crossfade, hiding the reset.
  float span = resCss.x + 760.0;
  float rate = speed * 90.0;                 // css px / sec
  float cyc  = span / max(rate, 1.0);        // seconds for one full traverse

  // phase progress 0..1 over a full cycle; second phase offset by half a cycle
  float p0 = fract(t / max(cyc, 0.001));
  float p1 = fract(p0 + 0.5);
  // front x position for each phase (starts left of frame, ends right of it)
  float prog0 = -380.0 + p0 * span;
  float prog1 = -380.0 + p1 * span;

  // visibility weights: each phase is fully present while its front is on or
  // near the frame, and faded out while the front is off in the dark margins.
  // The rise/fall sit half a cycle apart so the two always sum to ~1 with no
  // dark dip — the underground burn never visibly restarts.
  float w0 = smoothstep(0.0, 0.10, p0) * (1.0 - smoothstep(0.90, 1.0, p0));
  float w1 = smoothstep(0.0, 0.10, p1) * (1.0 - smoothstep(0.90, 1.0, p1));

  vec3 leak = vec3(0.0);
  if (w0 > 0.001) {
    leak += w0 * seamPhase(cssP.x, cssP.y, seamY, prog0, vec2(3.7, 17.3),
                           c0, c1, c2, c3, reach, pr, fissFreq, ashEmber);
  }
  if (w1 > 0.001) {
    leak += w1 * seamPhase(cssP.x, cssP.y, seamY, prog1, vec2(-11.1, 5.9),
                           c0, c1, c2, c3, reach, pr, fissFreq, ashEmber);
  }
  col += leak;

  // gentle vignette to seat the cross-section
  vec2 uv = fragPx / max(u_resolution.xy, vec2(1.0));
  col *= 1.0 - 0.40 * smoothstep(0.40, 1.10, length(uv - 0.5) * 1.42);

  // tiny dither to keep the long glow gradients band-free
  col += (hash21(fragPx + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
