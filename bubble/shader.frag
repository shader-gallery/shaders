// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// bubble (Bloom) — sparse thin glassy ring outlines rise through open darkness,
// growing slightly as they climb, each carrying a single brighter highlight arc
// that suggests curved glass. At a hash-determined height a bubble pops: a quick
// expanding flash that dissolves into a soft fading glow before that bubble's
// cycle re-seeds below the frame. Only the outlines and pop flashes emit light;
// interiors stay near-black. Breathing drift — bodies wander weightlessly.
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
uniform float u_riseSpeed;  // climb rate of every bubble; pops arrive more often as it rises (default 0.5)
uniform float u_size;       // base ring radius in CSS px at launch (default 30)
uniform float u_waver;      // horizontal waver amplitude in CSS px (default 18)
uniform float u_popFlash;   // brightness & spread of the pop burst (default 1)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   NUM_BUBBLES = 40;    // dense field; literal const (no dynamic counts)
const float LINE_CSS    = 1.4;   // ring outline half-thickness in CSS px
const float GROW        = 0.30;  // fractional growth over a lifetime (~30%)
const float POP_FRAC    = 0.5;   // fraction of life spent as the pop (half second-ish)

// hash helpers (no textures) — cheap, stable per-id
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// pick a single palette tint by a 0..1 hash (one tint per bubble)
vec3 tintFor(float h, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s  = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalise so 1.0 unit == screen height; keep aspect for x so rings are round
  float H    = max(res.y, 1.0);
  float aspect = res.x / H;
  vec2  uv   = fc / H;                 // y in 0..1, x in 0..aspect
  vec2  px   = vec2(pr / H);           // one device px in uv units

  vec3 col = BG;

  // palette + midnight fallback (headless contexts can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // sizes in uv units
  float baseR = u_size * pr / H;       // launch radius
  float line  = LINE_CSS * pr / H;     // outline half-thickness
  float waver = u_waver * pr / H;      // waver amplitude

  // climb speed: cycles per second scale gently with rise so faster => more pops.
  // travel = vertical distance covered per second (uv units).
  float speed = max(u_riseSpeed, 0.0) * 0.18;

  for (int i = 0; i < NUM_BUBBLES; i++) {
    float fi = float(i);

    // per-bubble stable hashes
    float hx    = hash11(fi * 1.7 + 3.1);   // horizontal lane (0..1)
    float hph   = hash11(fi * 2.3 + 11.7);  // phase offset along its cycle
    float htint = hash11(fi * 0.7 + 5.9);   // palette tint
    float hpop  = hash11(fi * 3.9 + 1.3);   // pop height (fraction of travel)
    float hwav  = hash11(fi * 4.6 + 8.2);   // waver phase
    float hspd  = 0.7 + 0.6 * hash11(fi * 5.1 + 2.4); // per-bubble speed variation

    // pop height: bubble dies mid-frame, between ~45% and ~80% of the rise span
    float popY = mix(0.45, 0.82, hpop);

    // total travel from birth (below frame) to pop, plus pop time, looped.
    // life is measured 0..1 across rise (0..popY in y), then POP_FRAC pop window.
    float riseDist = popY + 0.25;                 // start 0.25 below bottom edge
    float lifeLen  = riseDist / max(speed * hspd, 1e-4); // seconds of rise
    float popLen   = POP_FRAC;                     // seconds of pop
    float cycle    = lifeLen + popLen;

    // local time within this bubble's cycle (staggered by phase)
    float lt = mod(t + hph * cycle, cycle);

    // current y position: born at -0.25 (below), climbs to popY
    float rising = clamp(lt / lifeLen, 0.0, 1.0);   // 0..1 during rise
    float y = mix(-0.25, popY, rising);

    // horizontal lane + side-to-side waver as it climbs
    float laneX = hx * aspect;
    float wav   = waver * sin((y * 6.2831 * 1.3) + hwav * 6.2831);
    float x = laneX + wav;
    vec2  cen = vec2(x, y);

    // radius grows ~GROW over the rise
    float r = baseR * (1.0 + GROW * rising);

    vec2  d  = uv - cen;
    float dist = length(d);
    float rN  = dist / max(r, 1e-4);          // 0 centre .. 1 rim
    float ang = atan(d.y, d.x);

    float born = smoothstep(0.0, 0.06, rising);
    vec3 tint = tintFor(htint, c0, c1, c2, c3);

    // depth: nearer bubbles read bigger/brighter/crisper, farther fainter/softer
    float hd     = hash11(fi * 6.3 + 2.0);
    float edge   = mix(0.12, 0.035, hd);      // crisper membrane when near
    float bright = mix(0.40, 1.10, hd);

    // glassy sphere: translucent body, a fresnel rim that brightens to the edge, a
    // crisp surface membrane, iridescent thin-film sheen and a specular glint.
    float inside   = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, rN);
    float fres     = smoothstep(0.55, 1.0, rN) * inside;
    float membrane = exp(-((rN - 1.0) * (rN - 1.0)) / max(edge * edge * 0.9, 1e-5));
    // thin-film iridescence: hue cycles with radius + angle (soap-film colours)
    float ir    = fract(rN * 1.7 + ang / 6.2831 + htint * 2.0 + t * 0.03);
    vec3  sheen = tintFor(ir, c0, c1, c2, c3);
    // specular glints (upper-left bright, lower-right dim) sell the curved glass
    vec2  sp1 = cen + vec2(-0.40, 0.42) * r;
    vec2  sp2 = cen + vec2( 0.34, -0.36) * r;
    float spec1 = exp(-dot(uv - sp1, uv - sp1) / max(r * r * 0.020, 1e-6)) * inside;
    float spec2 = exp(-dot(uv - sp2, uv - sp2) / max(r * r * 0.060, 1e-6)) * inside;

    // --- pop: a quick expanding flash dissolving into a fading glow ---
    float popT = clamp((lt - lifeLen) / popLen, 0.0, 1.0);
    float inPop = step(lifeLen, lt);
    float popR  = r * (1.0 + 2.6 * popT);
    float popShellSD = abs(dist - popR);
    float popSpread  = (line * 3.0 + baseR * 1.2 * popT);
    float shell = exp(-popShellSD / max(popSpread, 1e-4));
    float corePop = exp(-dist * dist / max(baseR * baseR * (0.4 + 2.0 * popT), 1e-4));
    float popFade = (1.0 - popT);
    float popLight = (shell * 1.1 + corePop * 0.5) * popFade * popFade * inPop;

    // assemble the glassy bubble (translucent, additive over the dark water)
    float vis = born * (1.0 - inPop) * bright;
    col += sheen * inside * 0.085 * vis;                       // faint glass body
    col += sheen * fres * 0.80 * vis;                          // fresnel rim
    col += mix(sheen, vec3(1.0), 0.45) * membrane * 0.95 * vis; // crisp membrane
    col += vec3(1.0) * spec1 * 0.95 * vis;                     // bright specular
    col += sheen * spec2 * 0.45 * vis;                         // secondary glint
    col += tint * popLight * (0.6 + 0.9 * max(u_popFlash, 0.0));
  }

  // gentle vignette to keep edges in open darkness
  vec2 q = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.15, length(q) * 1.6);
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
