// moth (Omen) — a lit window at night. One broad arch-shouldered pane of soft
// warm light, gently graded as if by a curtain behind the glass, with a thin dark
// mullion crossing it, sits off-centre on a near-black field — the only brightness
// in the frame. Against the glass, dark moth silhouettes gather: small two-lobed
// wing shapes that crawl along the pane, flit between perches, and drift in to
// bump the glass, each casting a soft enlarged shadow on the pane when near the
// implied lamp behind. Everything bright is static; everything that moves is dark.
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
uniform float u_moths;       // number of moth silhouettes 1..7   (default 4)
uniform float u_wanderSpeed; // pace of crawl/perch/flit traffic  (default 0.4)
uniform float u_window;      // lit pane width, css px            (default 300)
uniform float u_flutter;     // wing-beat speed of silhouettes    (default 1)

const vec3  BG       = vec3(0.030, 0.030, 0.038); // near-black night field
const float MOTH_MAX = 7.0;                        // literal loop bound

// --- small hashes (no textures) ---
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
vec2  hash21(float n) {
  return fract(sin(vec2(n * 91.3458, n * 47.853)) * vec2(47453.5453, 33094.733));
}

// signed distance to an axis box centred at origin, half-size b
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// 2D rotation
vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// one wing lobe: a soft ellipse coverage 0..1, p in pane-pixel space relative to
// the lobe centre, half-extent (rx,ry). aa is the antialias width in px.
float lobe(vec2 p, vec2 r, float aa) {
  float e = length(p / r);            // <1 inside
  return 1.0 - smoothstep(1.0 - aa / max(r.x, r.y), 1.0, e);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float aa  = pr * 1.4;               // base antialias width in px

  // --- pane geometry: off-centre, arch-shouldered, in css px ---
  vec2  paneC = vec2(res.x * 0.42, res.y * 0.50);   // off-centre window centre
  float wWid  = max(u_window, 80.0) * pr;            // pane width  (guard min)
  float wHt   = wWid * 1.45;                          // taller than wide
  vec2  q     = fc - paneC;                           // pixels relative to pane

  // pane signed field: a rounded-top arch. Lower body is a box; the top shoulders
  // round off into an arch by clipping with a circle near the head.
  vec2  hsz   = vec2(wWid * 0.5, wHt * 0.5);
  float body  = sdBox(q + vec2(0.0, wHt * 0.10), hsz * vec2(1.0, 0.80)); // squat box
  // arch cap: distance to a circle centred a little above mid, radius ~ width/2
  vec2  archC = vec2(0.0, -wHt * 0.18);
  float arch  = length(q - archC) - wWid * 0.52;
  float sdPane = max(min(body, arch), -1e9);          // union-ish: inside if either
  sdPane = min(body, arch);

  // pane interior mask, antialiased
  float pane = 1.0 - smoothstep(0.0, aa * 2.0, sdPane);

  // --- the lit glass: soft warm vertical grade as if a curtain hangs behind ---
  // normalised pane coords 0..1 across width / height
  vec2  uv = (q + hsz) / (2.0 * hsz);
  // vertical curtain grade: brighter toward upper-middle, dimmer at the sill
  float grade = mix(0.55, 1.0, smoothstep(0.0, 0.7, uv.y));
  grade *= mix(1.0, 0.72, smoothstep(0.62, 1.05, uv.y));   // dim the very top arch
  // gentle horizontal falloff toward the frame edges (curtain folds)
  float foldx = 0.82 + 0.18 * cos((uv.x - 0.5) * 3.14159);
  // soft curtain folds: a few low broad vertical bands
  float folds = 0.90 + 0.10 * sin(uv.x * 18.0 + 0.6) * smoothstep(0.0, 0.3, uv.y);
  grade *= foldx * folds;

  // implied lamp position behind the glass (a touch above centre) — the bright
  // heart that moth shadows enlarge toward. In pane-pixel space.
  vec2  lampP = vec2(0.0, -wHt * 0.08);
  float lampD = length(q - lampP) / (wWid * 0.62);
  float lampGlow = exp(-lampD * lampD * 1.6);              // soft central bloom
  grade += lampGlow * 0.30;

  // almost-imperceptible breathing of the pane light
  grade *= 0.985 + 0.015 * sin(t * 0.5);

  // --- thin dark mullion crossing the pane (one vertical + one horizontal) ---
  float mw = max(1.2 * pr, wWid * 0.012);                 // mullion half-width
  float mullV = smoothstep(mw, mw + aa, abs(q.x));        // 0 on the bar
  float mullH = smoothstep(mw, mw + aa, abs(q.y + wHt * 0.06));
  float mull  = min(mullV, mullH);
  // keep mullion only inside the pane
  grade *= mix(1.0, 0.16, (1.0 - mull) * pane);

  // base warm light value on the glass (before silhouettes)
  float light = grade * pane;

  // --- moths: dark occluders pressed against the pane ---
  float nMoths = clamp(u_moths, 1.0, MOTH_MAX);
  float ws  = u_wanderSpeed;
  float arenaW = wWid * 0.86;       // moths roam within the pane
  float arenaH = wHt  * 0.86;

  float occl   = 0.0;   // hard silhouette coverage on the glass (0..1)
  float shadow = 0.0;   // soft enlarged shadow blob on the glass (0..1)

  for (float i = 0.0; i < MOTH_MAX; i += 1.0) {
    float live = step(i + 0.5, nMoths);     // 1 if this moth is in play
    if (live < 0.5) continue;

    float seed = i * 13.17 + 4.3;
    vec2  h0   = hash21(seed);
    vec2  h1   = hash21(seed + 7.0);
    float h2   = hash11(seed + 19.0);

    // each moth's own incommensurate frequencies → traffic never repeats
    float f1 = 0.13 + h0.x * 0.11;
    float f2 = 0.19 + h0.y * 0.13;
    float f3 = 0.07 + h1.x * 0.06;
    float ph = h2 * 6.2831853;

    // wandering position within the arena, built from incommensurate sines
    float px = sin(t * ws * f1 + ph)        * 0.42
             + sin(t * ws * f2 * 1.7 + ph)  * 0.20;
    float py = cos(t * ws * f3 + ph * 1.3)  * 0.40
             + sin(t * ws * f2 + ph * 0.7)  * 0.18;
    // static per-moth offset so they don't pile on centre
    vec2  base = (h1 - 0.5) * vec2(arenaW, arenaH) * 0.55;
    vec2  pos  = base + vec2(px * arenaW * 0.5, py * arenaH * 0.5);

    // crawl/perch/flit schedule: a slow gate that occasionally near-stills the
    // moth (perch) and occasionally lets it hop (flit). Smooth, hash-phased.
    float sched = 0.5 + 0.5 * sin(t * ws * (0.21 + h0.x * 0.1) + seed);
    float perch = smoothstep(0.35, 0.0, sched);   // 1 when perched (near-still)
    // when perched, damp motion toward a held perch point
    vec2  perchPt = base * 1.05;
    pos = mix(pos, perchPt, perch * 0.85);

    // a short "bump the glass then retreat" pulse — proximity to lamp swells
    float approach = 0.5 + 0.5 * sin(t * ws * 0.16 + seed * 2.1);
    float bump = smoothstep(0.78, 1.0, approach);  // occasional near-glass push

    // moth body-local coords (rotate so it faces its travel a touch)
    float ang = 0.35 * sin(t * ws * f1 * 2.0 + ph) + (h2 - 0.5) * 1.2;
    vec2  lp  = rot(q - pos, ang);

    // size of this moth (small), scaled by pane
    float sz  = wWid * (0.040 + h0.y * 0.030);

    // --- wing flutter: wings open/close a few beats per second ---
    float beat = u_flutter * (3.6 + h2 * 1.8);   // beats/sec, per-moth varied
    float flap = 0.62 + 0.38 * abs(sin(t * beat * 3.14159 + seed));
    // when perched, wings mostly fold (narrower)
    flap = mix(flap, 0.45, perch);

    // two wing lobes (left/right) + a slim body. Lobes are tilted ellipses.
    // fast flutter smears the wing into a wider averaged blur (a shiver); slow
    // flutter keeps a crisp, narrow glide. The smear adds a static height term so
    // the difference reads at any frozen instant, plus a softened edge.
    float smear  = u_flutter * 0.30;                // 0.06..0.60 across the range
    vec2 wr = vec2(sz * 1.05, sz * (0.52 + 0.44 * flap + 0.22 * smear)); // wing half-extents
    float wingAA = aa + smear * sz * 0.62;
    float wingTilt = 0.55;
    vec2  lpL = rot(lp - vec2(-sz * 0.78, 0.0),  wingTilt);
    vec2  lpR = rot(lp - vec2( sz * 0.78, 0.0), -wingTilt);
    float wL = lobe(lpL, wr, wingAA);
    float wR = lobe(lpR, wr, wingAA);
    // slim furred body down the middle
    float bodyM = lobe(lp, vec2(sz * 0.28, sz * 1.05), aa);
    float moth  = max(max(wL, wR), bodyM);

    // accumulate silhouette coverage (occludes the glass)
    occl = max(occl, moth);

    // --- soft enlarged shadow blob cast on the pane toward the lamp ---
    // the closer the moth to the lamp (and during a bump), the bigger/softer it
    // grows — shadow centre offset slightly away from the lamp.
    float toLamp = length(pos - lampP) / (wWid * 0.6);
    float near   = exp(-toLamp * toLamp * 0.9);          // 1 when over the lamp
    float swell  = sz * (2.2 + 2.8 * near + 1.6 * bump);
    vec2  sOff   = normalize(pos - lampP + 1e-3) * sz * 0.6;
    float sd2    = length(q - (pos + sOff)) / swell;
    float blob   = exp(-sd2 * sd2 * 1.3) * (0.18 + 0.55 * near + 0.25 * bump);
    shadow = max(shadow, blob * live);
  }

  // compose: lit glass, minus soft shadow blobs, minus hard silhouettes.
  // shadow darkens the glass gently; silhouettes punch it to near-black.
  float litVal = light * (1.0 - shadow * 0.85);
  litVal *= (1.0 - occl * 0.97);

  // --- colour the glass: warm candle-lit window from the palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  // warm window hue: lean on the warm/gold palette entry, with a cooler rim.
  // pick the warmer of the four by luminance-weighted toward red; blend by height
  // so the sill is warmer and the arch a touch cooler (candle vs sky spill).
  vec3 warm = c3 * 0.6 + c0 * 0.4;     // base warm glow
  vec3 cool = c2 * 0.5 + c1 * 0.5;     // cool rim toward the top
  vec3 glassCol = mix(warm, cool, smoothstep(0.45, 1.0, uv.y) * 0.5);
  // lamp heart glows a little hotter (toward the brightest warm)
  glassCol = mix(glassCol, c3 * 0.7 + vec3(0.18), lampGlow * 0.5);

  vec3 col = BG;
  // the window itself, as emitted surface light (not a point glow)
  col += glassCol * litVal * 1.25;

  // a whisper of spill into the surrounding dark so the pane doesn't read cut-out
  float spill = (1.0 - smoothstep(0.0, wWid * 0.55, max(sdPane, 0.0))) * (1.0 - pane);
  col += glassCol * spill * 0.05 * (0.6 + 0.4 * lampGlow);

  // subtle frame vignette keeps the night field deep at the edges
  vec2  vn = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.0, length(vn));
  col *= mix(0.82, 1.0, vign);

  col = max(col, BG * 0.6);
  gl_FragColor = vec4(col, 1.0);
}
