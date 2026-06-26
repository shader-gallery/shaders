// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// baluster (Umbra) — a stair banister shadow thrown up a wall. A fan of dark
// bars radiates from a vanishing anchor just below the bottom-left corner, each
// bar an angular capsule in polar coordinates about that off-screen point,
// hash-jittered in angle and tapering wider with radius (projective
// foreshortening of identical posts). Blur is graded across the fan: bars on the
// lamp-near leading edge are broad and soft, trailing bars thin and knife-sharp.
// An implied lamp swings on a slow pendulum downstairs, so the whole fan pivots
// about its anchor and the bars scissor — gaps widening on one side as they pool
// on the other. Motion is read entirely in negative: only the light is shown.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swingSpeed;  // pendulum arc rate of the implied lamp   (default 0.18)
uniform float u_barWidth;    // bar base thickness, css px (pre-taper)   (default 16)
uniform float u_fanSpread;   // how widely the fan opens across frame    (default 0.85)
uniform float u_penumbra;    // soft-to-sharp blur gradient strength     (default 0.8)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black wall base ~#09090B
const float NBARS    = 17.0;   // number of banister posts in the fan (const loop bound)
const float TWO_PI   = 6.2831853;

// cheap deterministic hash 0..1
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

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

  // palette + midnight fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- the lit wall field: a c0->c1 corner gradient ---
  vec2 uv = fc / res;                       // 0..1 across the frame
  float corner = clamp((uv.x + (1.0 - uv.y)) * 0.5, 0.0, 1.0); // bottom-left -> top-right
  vec3  wall   = mix(c0, c1, corner);

  // --- vanishing anchor: just below the bottom-left corner, off-screen ---
  vec2  anchor = vec2(-0.06, -0.12) * res;
  vec2  d      = fc - anchor;               // ray from anchor to this pixel
  float ang    = atan(d.y, d.x);            // 0..~PI/2 across the visible wedge
  float rad    = length(d);

  // --- implied lamp on a slow continuous pendulum (one sine, no turnaround snap) ---
  float swing  = sin(t * u_swingSpeed) * 0.18 * u_fanSpread; // angular pivot of whole fan
  // the lamp distance to the rail breathes with the swing, modulating penumbra
  float lampNear = 0.5 + 0.5 * cos(t * u_swingSpeed);        // 0..1, near<->far phase

  // fan geometry: bars spread over an angular wedge about the anchor
  float spread = u_fanSpread * 1.20;        // total angular width of the fan (radians)
  float base   = 0.16;                      // lowest bar angle (radians above horizon)

  // accumulate shadow occlusion (1 = fully blocked) and a fringe glow tint
  float shadow = 0.0;
  float fringe = 0.0;
  float wedgeLit = 0.0; // brightening in the widest open gaps (c2 wash)

  // bar base thickness in css px -> a fraction of the inter-bar spacing. A 16px
  // post on a ~46px reference spacing reads as ~0.35 of the gap; scale from there.
  float widthFrac = clamp((u_barWidth * pr) / (0.045 * res.x + 1.0), 0.06, 0.9);
  float radRef    = max(res.y, 1.0);

  for (float i = 0.0; i < NBARS; i += 1.0) {
    float fi  = (i + 0.5) / NBARS;          // 0..1 position across the fan
    float jit = (hash11(i + 3.0) - 0.5) * (spread / NBARS) * 0.9; // hash-jittered angle
    float ca  = base + fi * spread + jit + swing; // this bar's centre angle

    // angular distance from pixel to bar centre
    float da  = ang - ca;

    // bar half-width in ANGLE: posts have a fixed angular footprint that grows a
    // little with radius (projective foreshortening: distant posts project wider).
    // Express width as a fraction of the inter-bar spacing so bars read as bands.
    float spacingA = spread / NBARS;        // angular gap between adjacent bars
    float taper    = 1.0 + (rad / radRef) * 0.55;   // distant posts project wider
    float wA       = spacingA * widthFrac * taper;

    // penumbra: leading (lamp-near, high fi) bars broad+soft, trailing sharp.
    // the swing modulates each bar's softness as lamp distance changes.
    float soft  = mix(0.18, 1.6, fi);                 // graded across the fan
    soft        = soft * (0.6 + 0.8 * lampNear);      // breathe with the swing
    float blur  = wA * (0.12 + soft * u_penumbra);    // angular blur band
    blur        = max(blur, 0.0008);

    // capsule along the ray: full inside |da|<wA, soft to wA+blur
    float bar = 1.0 - smoothstep(wA, wA + blur, abs(da));
    // fade the bar in near the anchor (posts start a little out) and never beyond top
    bar *= smoothstep(0.02 * res.y, 0.10 * res.y, rad);

    shadow = max(shadow, bar);
    // fringe tint lives in the penumbra band only (the soft edge, not the core)
    float band = (1.0 - smoothstep(wA, wA + blur, abs(da)))
               * smoothstep(wA - blur, wA + blur, abs(da));
    fringe += band;
  }

  // widest-gap wash: where no bar is near, the lamp's throw is least obstructed.
  // approximate "openness" as inverse of the strongest shadow nearby.
  wedgeLit = (1.0 - shadow);
  wedgeLit *= wedgeLit; // bias toward the truly open wedges

  // colour the fringe with a faint c3 tint, blended on the wheel by angle so the
  // tint drifts gently rather than reading as one flat colour
  float s  = fract(ang / (TWO_PI) * 4.0 + t * 0.01) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  driftTint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // --- compose: build the LIT wall, then carve shadow out of it ---
  // a soft top-down falloff: light is brightest low (near the lamp throw)
  float throwF = 1.0 - smoothstep(-0.05, 1.25, uv.y);

  // the lit wall in the open wedges: dim base + a c2 wash where light pours
  // through the widest gaps. This is the "ribs of light" half of the frame.
  vec3 lit = wall * 0.13;
  lit += c2 * wedgeLit * 0.60;               // bright lit wedges between bars
  lit *= mix(0.45, 1.05, throwF);            // brightest low near the lamp throw
  lit += BG;                                  // never fully black even when lit==0

  // carve the shadow: where a bar occludes, drop toward deep near-black
  vec3 col = mix(lit, BG * 0.45, shadow);

  // faint c3 fringe glow on the penumbra rim (scattered light around the edge)
  fringe = clamp(fringe, 0.0, 1.0);
  col += mix(c3, driftTint, 0.45) * fringe * 0.12;

  // gentle vignette to settle the frame
  vec2 q = uv - 0.5;
  float vign = 1.0 - smoothstep(0.45, 1.05, length(q) * 1.25);
  col *= mix(0.78, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
