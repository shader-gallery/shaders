// spore (Bloom) — tiny bioluminescent points climb slow helices around three or
// four invisible vertical axes spread across the frame, rendered at three depth
// layers (nearer spores larger and brighter, farther ones dim and small) over a
// near-black water column with a faint depth gradient. Colours sit in the
// teal–violet half of the palette, blended per spore by hash. Each spore swings
// around its axis tracing a glinting sine, rising steadily while fading in near
// the bottom and out near the top of its own long private cycle — hiding the
// vertical wrap entirely.
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
uniform float u_riseSpeed;     // vertical climb rate along the helices  (default 0.35)
uniform float u_helixRadius;   // helix orbit radius, css px             (default 60)
uniform float u_sporeSize;     // glow radius of nearest layer, css px   (default 3)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// number of vertical helix axes spread across the frame
const int   AXES         = 4;
// spores per axis per depth layer
const int   PER_AXIS     = 9;
const int   LAYERS       = 3;

// hash helpers (no textures)
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // teal–violet half of the palette: bias toward the cooler entries
  vec3 tealA   = c2;                 // teal
  vec3 tealB   = mix(c2, c0, 0.5);   // teal-blue
  vec3 violetA = c1;                 // violet
  vec3 violetB = mix(c1, c0, 0.4);   // blue-violet

  // near-black water column with a faint vertical depth gradient
  float depthY = fc.y / res.y;
  vec3 col = BG + vec3(0.006, 0.010, 0.022) * (1.0 - depthY);
  // subtle horizontal centre lift so the column reads as water, not a flat field
  float colCenter = 1.0 - smoothstep(0.0, 0.75, abs(fc.x / res.x - 0.5));
  col += vec3(0.004, 0.008, 0.016) * colCenter * (1.0 - depthY) * 0.6;

  float radius = max(u_helixRadius, 1.0) * pr;   // helix orbit radius
  float size   = max(u_sporeSize, 0.5)  * pr;    // nearest-layer glow radius
  float rise   = u_riseSpeed;                    // climb rate; swing scales with it

  // accumulate additive glow from every spore
  vec3 glow = vec3(0.0);

  for (int a = 0; a < AXES; a++) {
    float fa = float(a);
    // axis x position spread across the frame (kept off the very edges)
    float ax = (fa + 0.5) / float(AXES);
    ax += (hash11(fa * 7.7) - 0.5) * 0.12;       // slight jitter so it isn't a ruler
    float axisX = ax * res.x;
    // per-axis swing direction & phase
    float spin  = (hash11(fa * 3.1) > 0.5) ? 1.0 : -1.0;
    float axPhase = hash11(fa * 13.3) * 6.2831853;

    for (int L = 0; L < LAYERS; L++) {
      float fL = float(L);
      // depth: 0 = nearest (big, bright), toward 1 = far (small, dim)
      float depth = fL / float(LAYERS - 1);
      float dScale = mix(1.0, 0.42, depth);      // size/brightness falloff
      float dRad   = mix(1.0, 0.6, depth) * radius;
      // far layers swing a touch faster (parallax illusion handled by phase only)

      for (int s = 0; s < PER_AXIS; s++) {
        float fs = float(s);
        vec2  seed = vec2(fa * 4.0 + fL, fs);
        float h0 = hash21(seed);
        float h1 = hash21(seed + 17.0);
        float h2 = hash21(seed + 41.0);

        // each spore on its own long private cycle; rise advances the phase
        float speed = rise * (0.6 + 0.5 * h1);   // per-spore climb speed
        float cyc   = fract(h0 + t * speed * 0.12);  // 0..1 up the column

        // vertical position climbs with cyc; fade in near bottom, out near top
        float yPx = cyc * (res.y + 2.0 * dRad) - dRad;
        // orbital swing — rate scales with rise so the helix keeps its pitch
        float ang = axPhase + spin * (cyc * 6.2831853 * (2.0 + h2 * 1.5)
                                       + h2 * 6.2831853);
        float xPx = axisX + cos(ang) * dRad;
        // depth-cue: orbit also nudges apparent size as the spore crosses front/back
        float frontness = 0.5 + 0.5 * sin(ang);  // 1 when swinging toward viewer

        vec2 pos = vec2(xPx, yPx);
        vec2 d   = fc - pos;
        float r2 = dot(d, d);

        // private fade: brightest mid-cycle, fading near both ends to hide wrap
        float fade = smoothstep(0.0, 0.18, cyc) * (1.0 - smoothstep(0.82, 1.0, cyc));
        // gentle per-spore breathing on a long cycle
        float breathe = 0.7 + 0.3 * sin(t * (0.3 + h1 * 0.4) + h0 * 6.2831853);

        // glow radius for this spore (depth + frontness modulated)
        float gr = size * dScale * (0.8 + 0.4 * frontness);
        gr = max(gr, 0.6 * pr);
        float core = exp(-r2 / (gr * gr));
        float halo = exp(-r2 / (gr * gr * 7.0));
        float bright = (core * 1.0 + halo * 0.35) * fade * breathe;
        bright *= mix(0.35, 1.0, 1.0 - depth);   // far layers dimmer

        // per-spore colour from the teal–violet half, chosen by hash
        float hueSel = hash21(seed + 5.0);
        vec3 cc = mix(mix(tealA, tealB, h0), mix(violetB, violetA, h2), hueSel);

        glow += cc * bright;
      }
    }
  }

  col += glow * 1.25;

  // soft vignette keeps the column edges dark
  vec2 uv = fc / res;
  float vign = 1.0 - smoothstep(0.45, 1.15, length((uv - 0.5) * vec2(1.05, 0.9)));
  col *= mix(0.78, 1.0, vign);

  // gentle tonemap so dense overlaps don't blow out to flat white
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
