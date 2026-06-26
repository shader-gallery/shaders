// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// scry (Omen) — a standing obsidian mirror: a tall, arch-topped slab traced by a
// hairline of palette-tinted edge light, set slightly off-centre on a near-black
// ground. The glass reads pure black until the eye adjusts; inside, slow
// domain-warped smoke turns in grey-violet, denser toward the base of the arch.
// At long intervals thin bright threads of almost-imagery rise toward the glass,
// sharpen to the edge of legibility, then sink back into the depth. Interior
// light only — no rim flicker; the hairline frame holds steady while the smoke
// churns at a syrupy pace and visions surface on hash-staggered envelopes.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swirlSpeed;  // angular+warp speed of interior smoke (default 0.3)
uniform float u_mirror;      // arch height in CSS px (default 460); scaled by pr
uniform float u_visionRate;  // how often/near-legible the threads surface (default 0.35)

const vec3  BG          = vec3(0.020, 0.020, 0.028); // near-black ground, slightly under house BG so the arch reads
const float ASPECT      = 0.46;   // mirror width / height (portrait vessel)
const float ARCH_FRAC   = 0.34;   // fraction of height taken by the arched top
const float HALFLIFE    = 13.0;   // seconds between vision-surfacing peaks

// hash helpers (no textures) ------------------------------------------------
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
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    amp *= 0.5;
  }
  return v;
}

// signed distance to the arched-mirror silhouette in mirror-local space `q`
// (q centred on the mirror; x in +-halfW, y in +-halfH). Negative inside.
// halfW, halfH in the same units as q. archY = y where the straight sides end.
// Built as a true UNION of a box (lower body, extended above archY) and a
// half-ellipse cap (centred at archY), the two overlapping so the union has a
// single clean outer boundary — no internal seam at the join.
float sdMirror(vec2 q, float halfW, float halfH, float archY) {
  // elliptical arch cap centred at (0, archY), radii (halfW, halfH-archY)
  float capH = max(halfH - archY, 1e-4);
  // rectangular lower body: from y=-halfH up to archY. The cap's widest point is
  // also at archY with the same half-width halfW, so box top meets cap tangentially
  // -> the union min() is strictly negative inside, no internal seam in sd=0.
  float topY = archY;
  float cy   = (topY - halfH) * 0.5;             // box centre y
  float hy   = (topY + halfH) * 0.5;             // box half-height
  vec2  dR   = abs(vec2(q.x, q.y - cy)) - vec2(halfW, hy);
  float rect = min(max(dR.x, dR.y), 0.0) + length(max(dR, 0.0));
  vec2  e    = vec2(q.x / halfW, (q.y - archY) / capH);
  float r    = min(halfW, capH);
  float cap  = (length(e) - 1.0) * r;            // approximate signed distance
  // union: the two shapes overlap around y=archY, so min() gives a clean hull
  return min(rect, cap);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // ---- palette fallback (headless contexts can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // params (guard against unset 0.0)
  float swirl   = max(u_swirlSpeed, 0.0);
  float mirrorH = max(u_mirror, 60.0) * pr;          // arch height in device px
  float vrate   = clamp(u_visionRate, 0.0, 1.0);

  // mirror geometry, slightly off-centre, sitting low on the ground
  float halfH   = mirrorH * 0.5;
  float halfW   = halfH * ASPECT;
  float archY   = halfH * (1.0 - 2.0 * ARCH_FRAC);   // where straight sides end
  vec2  ctr     = vec2(res.x * 0.455, res.y * 0.515);// off-centre placement
  vec2  q       = fc - ctr;

  float sd      = sdMirror(q, halfW, halfH, archY);  // <0 inside the glass

  vec3 col = BG;

  // subtle ground vignette so corners fall to true black
  float gv = 1.0 - smoothstep(0.35, 1.15, length((fc - res * 0.5) / res));
  col *= mix(0.55, 1.0, gv);

  // ---------- interior smoke (only where inside the glass) ----------
  // normalised interior coords: nx,ny in roughly [-1,1] across the mirror
  vec2 nrm = q / vec2(halfW, halfH);
  // mask with soft inner falloff so smoke fades before the rim (no rim spill)
  float inside = smoothstep(0.0, -2.5 * pr, sd);     // 1 well inside, 0 at edge

  if (inside > 0.001) {
    float ang = swirl * t * 0.18;                    // slow rotation of the field
    // rotate sample coords for churning turn
    float ca = cos(ang), sa = sin(ang);
    vec2  p  = vec2(nrm.x * ca - nrm.y * sa, nrm.x * sa + nrm.y * ca);
    p *= 2.3;

    // domain warp: drifting, syrupy self-advection
    float tw = t * swirl * 0.35;
    vec2  w1v = vec2(fbm(p + vec2(0.0, tw)), fbm(p + vec2(5.2, -tw * 0.8)));
    vec2  w2v = vec2(fbm(p * 1.7 + 4.0 * w1v + vec2(tw * 0.5, 1.7)),
                     fbm(p * 1.7 + 4.0 * w1v + vec2(-1.3, -tw * 0.6)));
    float smoke = fbm(p + 3.0 * w2v + vec2(0.0, tw * 0.3));
    smoke = smoke * smoke;                            // deepen the blacks

    // denser toward the base of the arch (lower interior)
    float baseBias = smoothstep(1.0, -0.9, nrm.y);
    smoke *= mix(0.45, 1.25, baseBias);

    // grey-violet interior tint: lean on the purple palette entry, desaturated
    vec3 violet = mix(c1, c0, 0.35);                  // purple-leaning blue mix
    vec3 grey   = vec3(dot(violet, vec3(0.33)));      // its own luminance grey
    vec3 cool   = mix(violet, grey, 0.45);            // grey-violet, not vivid blue
    vec3 smokeC = cool * (0.16 + 0.40 * smoke);

    // ------- visions: thin bright threads that rise & sharpen rarely -------
    // a handful of staggered envelopes; each fades fully in/out (seamless loop)
    float visionLum = 0.0;
    vec3  visionCol = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float fi   = float(i);
      float seed = hash21(vec2(fi * 7.31 + 1.0, 3.0));
      // smooth periodic envelope, phase-staggered. The threshold is lowered as
      // visionRate rises so at max some thread is almost always forming; at 0 the
      // gate is shut and only smoke remains. Each peak fades fully in/out (loop-safe).
      float ph   = t / (HALFLIFE * (1.0 + seed * 0.8)) + seed * 6.2831853;
      float raw  = 0.5 + 0.5 * sin(ph);
      float gate = mix(0.86, 0.18, vrate);           // high gate = rare, low = frequent
      float env  = smoothstep(gate, 1.0, raw) * step(0.001, vrate);
      float legible = mix(0.3, 1.0, vrate);          // how sharp the thread gets

      // a thread: a vertical filament that rises through the glass and sharpens as
      // it nears the surface (the top of the arch). rise climbs 0..1 over the peak.
      float xoff = (hash21(vec2(seed * 13.0, 2.0)) - 0.5) * 1.1;
      float rise = clamp((raw - gate) / max(1.0 - gate, 1e-3), 0.0, 1.0);
      float ythread = mix(-0.55, 0.92, rise);        // base -> up toward the glass
      float sharp   = mix(0.045, 0.010, rise * legible); // sharpens as it surfaces
      float dx = nrm.x - xoff;
      float dy = nrm.y - ythread;
      float thread = exp(-dx * dx / sharp) * exp(-dy * dy / 0.16);
      // modulate by fine warped detail so it's filamentary, not a clean blob
      float fil = fbm(vec2(nrm.x * 7.0 + seed * 10.0, nrm.y * 11.0 - t * swirl * 0.4));
      thread *= mix(0.35, 1.0, fil) * mix(0.55, 1.0, legible);

      float lum = thread * env;
      visionLum += lum;
      // vision colour leans bright/cool-pale (the almost-image catching light)
      vec3 vc = mix(c2, mix(c2, vec3(0.85, 0.88, 0.96), 0.45), seed);
      visionCol += vc * lum;
    }
    visionCol = visionLum > 1e-4 ? visionCol / visionLum : vec3(0.0);

    // composite interior: smoke base + visions, all multiplied by inside mask
    vec3 interior = smokeC;
    interior += visionCol * visionLum * 2.4;
    // a faint overall interior glow so the glass isn't dead flat
    interior += cool * 0.05 * smoke;

    col = mix(col, col + interior, inside);
  }

  // ---------- hairline edge light: steady palette-tinted frame ----------
  // thin bright contour exactly on the silhouette, no flicker
  float line = pr * 1.15;
  float edge = exp(-abs(sd) / line) ;                // sharp hairline
  edge += 0.30 * exp(-abs(sd) / (line * 4.0));       // faint bloom shoulder
  // tint the frame: hue drifts gently along the perimeter height for life
  float hk   = nrm.y * 0.5 + 0.5;
  vec3 frameC = mix(c0, c1, smoothstep(0.0, 1.0, hk));
  frameC = mix(frameC, c2, 0.18);
  col += frameC * edge * 0.9;

  // gentle global tone & soft contrast
  col = col / (1.0 + col * 0.35);                     // mild filmic compress
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
