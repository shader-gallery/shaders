// medusa (Bloom) — three-to-four translucent jellyfish bells crossing a
// near-black water gradient at staggered depths. Each bell is a soft dome SDF
// with a brighter contraction rim, tinted by blending two adjacent palette
// colours by depth and phase, and trails four faded analytic tentacle curves
// into darkness. The bells are the only light source: every contraction flares
// the rim and pumps a soft glow through the dome, with a small forward hop, then
// a long relaxed glide-and-sink. Lanes wrap far offscreen, bells faded to
// nothing near the edges, so there is no visible reset.
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
uniform float u_pulseSpeed;    // contraction-cycle rate scale   (default 0.7)
uniform float u_bellSize;      // dome radius in CSS px          (default 110)
uniform float u_tentacleLag;   // tentacle phase lag, 0..1 pulse (default 0.45)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   NBELLS   = 4;       // structured organisms, fixed count
const int   NTENT    = 5;       // tentacle curves hanging per bell
const float TWO_PI   = 6.2831853;

// palette globals (filled with fallback in main)
vec3 P0, P1, P2, P3;

// blend two adjacent palette entries on a 0..4 wheel by fractional position
vec3 paletteMix(float s) {
  s = fract(s) * 4.0;
  float i = floor(s);
  float f = s - i;
  vec3 a = P0, b = P1;
  if (i > 2.5)      { a = P3; b = P0; }
  else if (i > 1.5) { a = P2; b = P3; }
  else if (i > 0.5) { a = P1; b = P2; }
  return mix(a, b, f);
}

// smooth hop/pulse waveform from a 0..1 cycle phase: a quick contraction spike
// near phase 0 then a long relaxed tail. Returns 0..1 (1 = full contraction).
float pulseWave(float ph) {
  ph = fract(ph);
  // sharp rise, slow decay — exp-shaped spike at the start of the cycle
  float spike = exp(-ph * 6.0);
  float tail  = exp(-fract(ph + 0.0) * 1.2) * 0.15;
  return clamp(spike + tail, 0.0, 1.0);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized vertical for the water gradient (0 top .. 1 bottom)
  float vy = fc.y / max(res.y, 1.0);

  // --- near-black water gradient: a touch of deep blue up top, blacker below ---
  vec3 col = BG;
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  P0 = c0; P1 = c1; P2 = c2; P3 = c3;

  // deep-water tint: faintly lit near the top, sinking to black
  vec3 deep = mix(P0, P2, 0.5);
  col += deep * (smoothstep(0.0, 1.0, 1.0 - vy)) * 0.022;

  float pulseSpeed = max(u_pulseSpeed, 0.01);
  float bellR      = max(u_bellSize, 1.0) * pr;          // dome radius, device px
  float lag        = clamp(u_tentacleLag, 0.0, 1.0);

  // accumulate glow from each bell (additive over the dark water)
  for (int bi = 0; bi < NBELLS; bi++) {
    float fbi = float(bi);

    // per-bell deterministic constants (depth, lane, period, phase offset)
    float depth   = fract(fbi * 0.2637 + 0.15);            // 0 far .. 1 near
    float period  = mix(9.0, 5.0, fract(fbi * 0.4115 + 0.3)); // 5..9 s cycle
    float phOff   = fract(fbi * 0.7321 + 0.11);
    float laneAng = mix(-0.45, 0.45, fract(fbi * 0.5550 + 0.2)); // diagonal lane slope
    float laneY0  = mix(0.18, 0.82, fract(fbi * 0.3170 + 0.05)); // lane vertical anchor

    // depth scales the body: far bells smaller and dimmer
    float dscale  = mix(0.55, 1.15, depth);
    float rad     = bellR * dscale;

    // --- drift along a slow diagonal lane, wrapping far offscreen ---
    float driftSp = mix(0.018, 0.040, depth) * pulseSpeed; // near bells swim faster
    float lane    = fract(t * driftSp + phOff);            // 0..1 across the lane
    // travel from well left of screen to well right (wrap hidden by edge fade)
    float margin  = rad * 2.2 + res.x * 0.25;
    float cx      = mix(-margin, res.x + margin, lane);
    float cy      = laneY0 * res.y + (cx - res.x * 0.5) * laneAng
                    + sin(t * 0.25 * pulseSpeed + fbi * 2.1) * rad * 0.25;

    // contraction cycle phase, plus a forward hop on each contraction
    float cyc     = t / period * pulseSpeed + phOff;
    float contract = pulseWave(cyc);                       // 0..1
    // small forward hop: nudge centre along travel direction at contraction
    vec2  travel  = normalize(vec2(1.0, laneAng));
    vec2  center  = vec2(cx, cy) + travel * contract * rad * 0.35;

    // edge fade: bells faded to nothing near left/right edges (no visible reset)
    float edgeFade = smoothstep(0.0, 0.18, lane) * smoothstep(1.0, 0.82, lane);

    // local coords relative to the bell centre
    // local coords; y up. ny>0 is ABOVE centre (the dome cap), ny<0 is BELOW
    // centre (where tentacles hang).
    vec2 q = fc - center;

    // --- dome: an ellipse; we keep only the UPPER cap as a rounded bell and
    // a bright contraction rim around its lower circumference. ---
    float squash = mix(1.0, 0.80, contract);     // vertical squash on contraction
    float widen  = mix(1.0, 1.14, contract);     // bell flares wider as it pumps
    vec2  e = vec2(q.x / (rad * widen), q.y / (rad * squash));
    float rr = length(e);                        // 1.0 at the dome rim
    float ny = q.y / rad;                         // signed normalized height

    // soft inner glow filling the dome, pumped by contraction
    float inner = smoothstep(1.0, 0.0, rr);
    // brighter rim band right at rr ~ 1 (the contraction signature)
    float rim = smoothstep(0.20, 0.0, abs(rr - 0.90));
    // keep the dome to the upper cap: full above centre, fading just below it so
    // the rim wraps around the bottom edge of the bell like a real medusa.
    float cap = smoothstep(-0.45, 0.15, ny);      // 0 well below centre, 1 at/above
    // bloom halo around the whole bell
    float halo = exp(-rr * rr * 1.1);

    // tint: blend adjacent palette colours by depth + slow phase
    float hue = depth * 1.3 + cyc * 0.05 + fbi * 0.9;
    vec3 tint = paletteMix(hue);

    float pump = mix(0.35, 1.0, contract);       // glow swells on contraction
    float brightness = mix(0.55, 1.0, depth) * edgeFade;

    vec3 bellCol = vec3(0.0);
    bellCol += tint * inner * cap * 0.42 * pump;                   // dome body glow
    bellCol += tint * rim * cap * (0.55 + 1.5 * contract);        // flaring rim
    bellCol += tint * halo * cap * 0.16 * pump;                    // bloom halo
    col += bellCol * brightness;

    // --- tentacles: NTENT thin analytic curves hanging DOWN from the bell rim,
    // whipping a settable phase behind the bell's contraction. The whip is driven
    // by a CONTINUOUS lagged cycle so the sway is always legible and TENTACLE_LAG
    // visibly slides the curve's deflection relative to the bell. ---
    float tentPh    = pulseWave(cyc - lag * 0.5);  // lagged contraction brightener
    float whipAmp   = 0.60 + 0.35 * contract;      // wider whip during a pulse
    float tentLen   = rad * 2.8;                   // hang length follows bell size

    for (int ti = 0; ti < NTENT; ti++) {
      float fti = float(ti);
      // root spread across the bell underside
      float spread = (fti / float(NTENT - 1) - 0.5);    // -0.5 .. 0.5
      float rootX  = spread * rad * 1.05;
      // s: 0 at the root (just below the bell), 1 at the trailing tip below
      float s = clamp((-q.y - rad * 0.25) / tentLen, 0.0, 1.0);
      // whip as a traveling wave down the tentacle: the phase at depth s trails
      // the bell's contraction by (lag * s) of a full pulse, so at lag=0 the whole
      // strand moves rigidly with the bell and at lag=1 the tip drags a full pulse
      // behind the root — a visibly curvier S-shape that lags the contraction.
      float swing = sin((cyc - lag * s) * TWO_PI + fti * 1.7 + fbi * 0.6);
      float wav = swing * (0.25 + 0.85 * s);
      float curveX = center.x + rootX
                   + wav * rad * whipAmp * s
                   + travel.x * contract * rad * 0.35;  // follow the hop
      float dx = fc.x - curveX;
      float thick = (1.8 + 1.3 * (1.0 - s)) * pr;        // thinner toward tip
      float line = exp(-(dx * dx) / (thick * thick));
      // only below the bell, within hang range
      float band = smoothstep(0.05, -0.05, ny);          // 1 below centre
      float fade = (1.0 - s);                             // trail into darkness
      col += tint * line * band * fade * fade * 0.30 * edgeFade
             * mix(0.5, 1.0, depth) * (0.55 + 0.9 * tentPh);
    }
  }

  // gentle global vignette keeps the frame composed and edges dark
  vec2 uv = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 0.95, length(uv));
  col *= mix(0.75, 1.0, vign);

  // soft tonemap to avoid blown highlights on overlapping bells
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
