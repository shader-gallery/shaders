// chalice (Knell) — one singing bowl seen straight down, a modest vessel centred
// in a generous field of near-black floor. A soft elliptical ground shadow pools
// beneath its lower flank, grounding it as an object resting in a room. The thick
// bronze rim flexes in a cos(4*theta) standing wave rendered as ENVELOPE not
// motion: its four antinode arcs are the dominant light, swelling with warm
// palette colour 3 glow and a slight radial thickening, while the eight nodal
// points between them stay thin, dark and pinned. The captive pool inside carries
// only a quiet secondary murmur — faint concentric standing ripples driven by the
// rim, hue running c0 at centre through c1 to c2 near the rim, visible only while
// amplitude lasts. Between strikes the bowl rests as a dim circular outline over
// its shadow, holding black water.
//
// Motion: most excitations are strikes that flood rim+pool and ring down
// exponentially; occasionally the excitation swells in slowly (a mallet circling
// the rim) before its decay. Mid-decay the rim mode melts by crossfade from four
// antinodes toward six, the pool ripples re-spacing smoothly beneath it. Waves
// stand in place and die away; nothing travels, nothing repeats on a metronome.
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
uniform float u_bowlSize;      // CSS-px radius of the bowl, *u_pixelRatio (default 180)
uniform float u_strikeGap;     // mean seconds between excitations          (default 13)
uniform float u_ringTime;      // sustain of rim+pool after a strike, sec    (default 8)
uniform float u_rippleDetail;  // scales the pool ripple wavenumber          (default 1)

const vec3  BG     = vec3(0.028, 0.026, 0.033); // near-black bronze-dark floor
const float POOLK  = 9.0;   // base pool ripple wavenumber (broad standing rings)
const float TWO_PI = 6.2831853;

// hash a strike index -> [0,1)
float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // work in device px relative to centre; bowl is sized in CSS px * pr so it
  // looks identical at any DPR and stays well under half the frame.
  vec2  p   = fc - ctr;
  // CSS-px radius scaled to the buffer; an extra 0.62 keeps the vessel modest so
  // even at the largest BOWL_SIZE it leaves a generous dark margin around it.
  float R   = max(u_bowlSize, 40.0) * pr * 0.78; // bowl outer rim radius (guard min)
  float r   = length(p) / R;                  // 0 at centre, 1 at the rim
  float ang = atan(p.y, p.x);

  vec3 col = BG;

  // ---- palette with house fallback (headless can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float aa = 2.0 / R;   // ~2px antialias in r-space

  // ---- ground shadow: a soft ellipse pooled beneath the bowl's lower flank ----
  // offset downward (-y is down in screen space here since fc.y grows up), wider
  // than tall, anchoring the bowl as an object resting in a room.
  vec2  sp = (p - vec2(0.0, -0.42 * R)) / R;
  sp.y /= 0.55;                               // squash vertically -> ellipse
  float shadowD = length(sp);
  float shadow  = smoothstep(1.55, 0.20, shadowD); // 1 in the pool, 0 outside
  col *= 1.0 - 0.82 * shadow;                 // darken the floor under the bowl

  // ---- strike scheduler: exponential ring-down, hash-jittered start times ----
  // Walk a constant window of strike slots. Each slot has a jittered time so no
  // two ring-downs land on a beat. Some excitations are slow swells (a mallet
  // circling the rim) instead of an instant strike, chosen by hash.
  float gap  = max(u_strikeGap, 2.0);
  float ring = max(u_ringTime, 1.0);
  float idxNow = floor(t / gap);

  float env     = 0.0;   // overall ring-down envelope (rim + pool amplitude)
  float meltMix = 0.0;   // amplitude-weighted melt 4->6 antinodes (0..1)
  for (int i = 0; i < 4; i++) {
    float k   = idxNow - float(i);
    float jit = (hash11(k) - 0.5) * gap * 0.6;
    float st  = k * gap + jit;
    float dt  = t - st;
    if (dt > 0.0) {
      // strike (fast attack) vs slow rim-rub swell, chosen per strike by hash
      float slow   = step(0.62, hash11(k + 3.0));        // ~38% are slow swells
      float atkT   = mix(0.18, ring * 0.55, slow);       // attack time
      float attack = smoothstep(0.0, atkT, dt);
      float decay  = exp(-max(dt - atkT, 0.0) / ring);   // ring-down after attack
      float amp    = 0.75 + 0.5 * hash11(k + 7.0);
      float e      = attack * decay * amp;
      env += e;
      // mid-decay melt: the four antinodes crossfade toward six as the strike
      // ages. Weighted by this strike's live amplitude so it reads on the strong
      // one, and per-strike hash sets how far it melts.
      float age  = smoothstep(0.0, ring * 0.5, dt);      // melt engages mid-ring
      float dest = hash11(k + 11.0);                     // how far this strike melts
      meltMix += e * age * dest;
    }
  }
  meltMix = clamp(meltMix / max(env, 0.001), 0.0, 1.0);

  // residual: a faint always-present breathing so the bowl never goes fully dead
  float residual = 0.06 + 0.03 * sin(t * 0.4);
  // antinode regions tremble with glow: a small in-place amplitude oscillation
  // (the vibration itself, NOT travel) so the live arcs shimmer while ringing.
  float tremble = 1.0 + 0.22 * sin(t * 7.3) * smoothstep(0.0, 0.4, env)
                      + 0.10 * sin(t * 2.1);
  float amp = (env + residual) * tremble;

  // ---- the bowl: rim band + captive pool, masked to a disc ----
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);     // solid bowl disc
  // rim band: a thick annulus near r=1 (the bronze rim that flexes)
  float rimBand = smoothstep(0.66, 0.80, r) * (1.0 - smoothstep(0.985, 1.0 + aa, r));

  // --- rim standing wave: cos(4*theta) melting toward cos(6*theta) ---
  // |cos(N*theta)| gives N antinode arcs with dark nodal points between; we
  // crossfade the 4-lobe and 6-lobe envelopes by meltMix. Rendered as glow
  // envelope (no angular travel) plus a slight radial thickening at antinodes.
  float lobe4 = abs(cos(2.0 * ang));   // 4 antinode arcs around the circle
  float lobe6 = abs(cos(3.0 * ang));   // melts toward 6 antinode arcs
  float lobe  = mix(lobe4, lobe6, meltMix);
  // sharpen hard: the four bright arcs dominate, the nodal pinches between them
  // go thin and dark — the four-arc signature must read even at tile size.
  // pow(lobe,4.5) compresses the bright lobes; the extra smoothstep gate forces
  // the band to truly break at the eight nodal points rather than only dimming.
  float arc = pow(lobe, 4.5);
  float arcGate = smoothstep(0.22, 0.58, lobe);   // hard nodal break: rim vanishes between arcs
  arc *= arcGate;
  // antinode arcs bulge radially inward where bright; the band itself vanishes at
  // the nodal pinches so the four arcs read as four arcs, not a continuous ring.
  float rimThick = smoothstep(0.60 - 0.12 * arc, 0.80, r)
                 * (1.0 - smoothstep(0.985, 1.0 + aa, r))
                 * arcGate;                         // pinch the band shut at nodes
  float rimGlow = rimThick * arc * amp;

  // --- captive pool: faint concentric standing ripples, held below the arcs ---
  // |cos(k*r)| standing rings driven by the rim; wavenumber scales continuously
  // with RIPPLE_DETAIL. Confined to the pool interior (inside the rim band).
  float poolMask = 1.0 - smoothstep(0.58, 0.74, r);          // inside the rim
  float kk   = POOLK * clamp(u_rippleDetail, 0.25, 3.0);
  // ring spacing re-spaces gently with the melt so the pool answers the rim
  float kr   = kk * (1.0 + 0.18 * meltMix);
  float rings = abs(cos(kr * r));
  rings = pow(rings, 2.0);   // crisp standing rings with dark nulls between peaks
  // ripples decay toward the centre slightly and fade with amplitude; an extra
  // taper near the rim keeps the outer cyan ring from crowding/out-glowing the
  // four rim arcs (spec: pool held well below the arcs' brightness).
  float poolTaper = 1.0 - smoothstep(0.40, 0.62, r);
  float pool = rings * poolMask * (amp + 0.08)
             * (0.50 + 0.50 * smoothstep(0.0, 0.5, r)) * (0.35 + 0.65 * poolTaper);

  // ---- hue: pool runs c0 (centre) -> c1 -> c2 (near rim); rim arcs are c3 ----
  vec3 poolHue;
  float rp = clamp(r / 0.70, 0.0, 1.0);
  if (rp < 0.5) {
    poolHue = mix(c0, c1, rp / 0.5);
  } else {
    poolHue = mix(c1, c2, (rp - 0.5) / 0.5);
  }
  // warm bronze rim: colour 3, brightening to near-bronze-white at peak strike
  float strikeWarm = clamp(env * 0.8, 0.0, 1.0);
  vec3  rimHue = mix(c3, mix(c3, vec3(1.0, 0.80, 0.46), 0.55), strikeWarm);

  // compose: rim arcs dominate, pool is a quiet murmur underneath. The four arcs
  // must clearly out-glow the pool (spec: arcs are the image's dominant light,
  // pool held well below), so rim weight is raised and pool weight cut.
  col += rimHue  * rimGlow * 1.55 * inside;
  col += poolHue * pool    * 0.46 * inside;

  // a thin always-present rim outline so the resting bowl reads over its shadow.
  // Kept dim and slightly arc-modulated so it never competes with the four arcs.
  float outline = (1.0 - smoothstep(0.0, 0.040, abs(r - 0.95)));
  col += rimHue * outline * (0.07 + 0.10 * amp) * (0.4 + 0.6 * arc) * inside;

  // soft inner bloom on the rim arcs so the bronze catches light beyond the band;
  // gated by arc so it pools at the four antinodes rather than ringing the bowl
  float bloom = exp(-abs(r - 0.82) / 0.08) * arc * amp;
  col += rimHue * bloom * 0.20 * inside;

  // ---- generous dark margin: vignette the floor toward black at the edges ----
  float vign = 1.0 - smoothstep(0.55, 1.15, length(p / (min(res.x, res.y) * 0.5)));
  col *= mix(0.55, 1.0, vign);

  // gentle tonemap to tame the brightest antinode arcs without washing out
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
