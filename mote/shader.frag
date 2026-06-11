// mote (Shoal) — silt motes caught in a slow eddy. Hash-seeded specks orbit an
// off-center vortex whose core stays dark; inner motes circle faster than outer
// ones, so loose clumps stretch into spiral arcs that wind and shear around the
// hub. Each speck is a tiny soft dot, elongated along its travel, graded by depth
// and hue-tinted by orbital radius. Beyond the eddy rim a few stray motes hang in
// near-black stillness. The dark hub drifts on a slow Lissajous so nothing sits
// dead-centered.
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
uniform float u_moteSize;  // css-px size of a silt speck   (default 3)   [MOTE_CSS]
uniform float u_spin;      // eddy rotation rate            (default 0.3) [SPIN]
uniform float u_winding;   // inner-vs-outer speed gradient (default 1)   [WINDING]
uniform float u_eddy;      // css-px radius of the eddy      (default 380) [EDDY_CSS]

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU      = 6.2831853;

// cheap 2D hash -> 0..1
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
vec2  hash21(float n) { return fract(sin(vec2(n, n + 1.7)) * vec2(43758.5453, 22578.1459)); }

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

  // palette with midnight fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // sizes in device px (guard against a 0 param: keep specks visible)
  float eddyR = max(u_eddy, 1.0) * pr;     // eddy radius
  float spin  = u_spin;                     // 0 => nearly motionless (safe)
  float wind  = u_winding;
  float msize = max(u_moteSize, 0.4) * pr;  // speck core size

  // off-center hub drifting on a slow Lissajous of incommensurate sines, so the
  // composition never sits dead-centered.
  vec2 drift = vec2(
    sin(t * 0.043) * 0.16 + cos(t * 0.071) * 0.05,
    cos(t * 0.037) * 0.13 + sin(t * 0.061) * 0.06
  );
  vec2 hub = res * (vec2(0.5) + vec2(-0.10, 0.06) + drift);

  vec3 col = BG;

  // Per-pixel core mask: 1 at the hub, fading to 0 by ~1/3 of the eddy radius.
  // We compute it up front so each mote's contribution can be faded to ~0 inside
  // the dark eye AT THE MOTE LEVEL — this stops elongated inner specks from
  // leaving pale streaks across the hub (the post-hoc darkening alone couldn't
  // fully suppress the bright end of a streak that reaches into the core).
  float rhPix = length(fc - hub) / eddyR;
  float coreMask = 1.0 - smoothstep(0.0, 0.34, rhPix); // 1 at hub .. 0 by ~1/3 R
  float moteKeep = 1.0 - coreMask;                      // 0 in core, 1 outside

  // Accumulate motes. Each mote has a fixed seed radius/angle; we rotate its
  // angle by an amount that grows as radius shrinks (differential rotation),
  // plus a low brownian shimmer. We render in DEPTH LAYERS back-to-front so
  // brightness grades by layer; faint deep motes first, bright near ones last.
  const int LAYERS = 4;
  const int PER_LAYER = 90; // motes per depth layer (constant loop bound)

  for (int L = 0; L < LAYERS; L++) {
    float fl     = float(L);
    float depth  = fl / float(LAYERS - 1);        // 0 (back) .. 1 (front)
    float lbright = mix(0.42, 1.05, depth);       // near motes brighter
    float lsize   = mix(0.78, 1.18, depth);       // slight size grade by depth
    float lseed   = fl * 131.7;

    for (int i = 0; i < PER_LAYER; i++) {
      float id = float(i) + lseed;
      vec2  h  = hash21(id * 1.31 + 3.0);
      // seed orbital radius: bias toward the rim (sqrt) but allow a stray tail
      float rr0 = h.x;
      float r01 = sqrt(rr0);                       // normalized 0..1 within eddy
      // a fraction of motes are strays beyond the rim, hanging near-still
      float stray = step(0.92, hash11(id * 7.7 + 1.0));
      float radNorm = mix(r01, 1.15 + 0.5 * hash11(id * 5.3), stray);
      float rad = radNorm * eddyR;                 // device-px orbital radius

      float a0 = h.y * TAU;                         // seed angle

      // differential rotation: angular speed ~ 1/(rad) so inner circle faster.
      // WINDING scales how steeply speed falls with radius (shears arms).
      float rN = max(radNorm, 0.04);
      float omega = spin * (0.25 + wind * (0.55 / rN));
      // strays barely move
      omega *= mix(1.0, 0.05, stray);
      float ang = a0 + t * omega;

      // low-amplitude brownian shimmer per mote (two slow incommensurate sines)
      float sh = (0.6 + 0.4 * depth);
      vec2 shimmer = vec2(
        sin(t * (0.7 + h.x * 0.5) + id * 2.1),
        cos(t * (0.6 + h.y * 0.5) + id * 1.3)
      ) * (msize * 1.4 * sh);

      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 pos = hub + dir * rad + shimmer;

      // vector from this mote to the pixel
      vec2 d = fc - pos;

      // elongate along direction of travel (tangent to the orbit).
      vec2 tang = vec2(-dir.y, dir.x);              // unit tangent
      float along = dot(d, tang);
      float across = dot(d, dir);
      // stretch factor grows with how fast the mote travels (inner = longer).
      // scale by absolute spin too, so a lively whirl streaks the specks into
      // arcs while a suspended eddy keeps them round points.
      float travel = clamp(omega, 0.0, 3.0) * (1.0 - stray);
      float stretch = 1.0 + 1.9 * travel;          // cap arc elongation
      stretch = min(stretch, 4.5);                  // never an unbounded streak
      float es = msize * lsize;
      float q = (along * along) / (es * es * stretch * stretch)
              + (across * across) / (es * es);

      // soft speck: gaussian-ish falloff. A touch tighter (1.85 vs 1.6) so the
      // largest moteSize stays a defined floater instead of an over-blurred smear.
      float speck = exp(-q * 1.85);

      // hue tinted by orbital radius (palette wheel), with a slow global roll
      float s = fract(radNorm * 0.85 + 0.12 + t * 0.01) * 4.0;
      float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
      vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
      // push tint a touch off grey toward its dominant hue so the palette (and a
      // re-theme) reads clearly even at small mote footprints, without a wash.
      tint = mix(vec3(dot(tint, vec3(0.333))), tint, 1.4);
      tint = max(tint, 0.0);

      // fade strays toward dimness so they read as still dust; a faint glint on
      // the faster (more elongated) motes so a lively whirl reads brighter.
      float strayDim = mix(1.0, 0.55, stray);
      float glint = 1.0 + 0.35 * clamp(travel, 0.0, 1.5);
      // Fade each speck to ~0 inside the core radius (moteKeep) so no elongated
      // inner streak survives across the dark hub — the eye stays clean.
      col += tint * speck * lbright * strayDim * glint * moteKeep * 0.52;
    }
  }

  // The dark hub now stays dark intrinsically (no motes contribute inside the
  // core mask). Keep a gentle residual darkening to firm up the very centre
  // against any stray BG/rim lift, then add a faint cool rim just outside it.
  float rh = rhPix;
  float core = coreMask;
  col *= mix(1.0, 0.35, core);                    // light firming, not the fix
  // a faint cool rim just outside the dark core hints at the bent light
  float rim = exp(-pow((rh - 0.30) * 4.0, 2.0)) * (1.0 - core);
  col += (c2 * 0.5 + c0 * 0.5) * rim * 0.05;

  // radial vignette keeps frame edges dark and composition contained
  float vign = 1.0 - smoothstep(0.55, 1.25, length((fc - res * 0.5) / res));
  col *= vign;

  // gentle tone curve to keep accents luminous without blowing out
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
