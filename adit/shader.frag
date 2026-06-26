// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// adit (Delve) - looking into a timbered mine gallery from just inside its mouth,
// the bore running away on a raking diagonal. The black vanishing depth is pinned
// in the lower-right third of the frame (never centred), so the composition reads
// as an off-axis glance down the drift. Sparse skeletal support frames - two posts
// and a cap beam, sheared hard trapezoidal by the oblique view (near-left post
// tall, far-right post short) - repeat in an exponential scale series toward that
// off-centre depth: each frame is a thick soft-edged timber-stroke outline of a
// sheared quad, evaluated for a small constant number of nearest scale layers, with
// bare hints of rock wall (faint FBM dust) in the gaps. A pair of thin glowing rails
// crossed by dim sleepers converges on the same depth, anchoring the floor plane.
// Under each cap beam hangs one small warm lamp - the brightest thing on its frame
// and the first thing the depth fog takes. Timber tint blends through the four
// palette colours by frame-depth phase; lamps and rails lean on the warmest hue;
// the gallery's end is held at true black. Frames, rails and sleepers all shrink
// inward down the scale axis toward the off-centre depth - receding away, never
// approaching, the log-periodic wrap hidden under the edge fade at birth and the
// fog at death. Nothing rotates and nothing translates; scale-travel is the only verb.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_descentSpeed;  // scale-octaves/sec the timber frames recede   (default 0.1)
uniform float u_frameDensity;  // timber frames per scale octave                (default 2)
uniform float u_timberWidth;   // stroke width of posts & cap beam, css px      (default 5)
uniform float u_lampGlow;      // brightness of the hanging lamp per frame       (default 0.9)
uniform float u_vanishX;       // vanishing-point x, short-axis units            (default 0.50)
uniform float u_vanishY;       // vanishing-point y, short-axis units            (default -0.44)
uniform float u_shear;         // raking obliqueness of the portal verticals     (default 0.72)
uniform float u_railGlow;      // brightness of the floor rails + bloom          (default 0.6)
uniform float u_brace;         // cribbing brace strength, 0 = clean portals      (default 0)
uniform float u_roll;          // static bank rotation about the vanishing point  (default 0, deg)
uniform float u_rollSpeed;     // continuous roll drift                           (default 0, rad/sec)
uniform float u_mouseShift;    // how far the vanishing point follows the cursor  (default 0.35)

const vec3  BG     = vec3(0.030, 0.030, 0.038); // near-black gallery base
const float TWO_PI = 6.28318531;

// how many scale layers we evaluate at once (constant loop bound, GLSL ES 1.00).
// Frames live on a log-periodic ladder; this window covers the few nearest rungs
// either side of the camera so birth + death always have a partner to cross-fade.
const int LAYERS = 7;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// value-noise + small FBM for faint rock-wall dust
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { s += amp * vnoise(p); p *= 2.03; amp *= 0.5; }
  return s;
}

// distance to a line segment a-b
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float pr  = u_pixelRatio;

  // ---- palette fallback (headless contexts can leave u_palette zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // warmest palette hue, for lamps + rails (pick the most reddish/yellow entry by
  // a luma-weighted r+g vs b score so it works across all three themes)
  float sc0 = c0.r + c0.g - c0.b, sc1 = c1.r + c1.g - c1.b;
  float sc2 = c2.r + c2.g - c2.b, sc3 = c3.r + c3.g - c3.b;
  vec3 warm = c0; float sw = sc0;
  if (sc1 > sw) { warm = c1; sw = sc1; }
  if (sc2 > sw) { warm = c2; sw = sc2; }
  if (sc3 > sw) { warm = c3; sw = sc3; }

  // params (guarded so the full slider range is safe)
  float speed   = u_descentSpeed;                       // octaves/sec
  float density = clamp(u_frameDensity, 1.0, 4.0);      // frames per octave
  float timberW = max(u_timberWidth, 0.5) * pr;         // stroke half-ish width, device px
  float lampK   = max(u_lampGlow, 0.0);
  float railK   = max(u_railGlow, 0.0);

  // ---- composition: vanishing point pinned in the lower-right third ----
  // normalise to short axis so the framing is aspect-stable; y up.
  float minRes = min(res.x, res.y);
  vec2  p   = (fc - 0.5 * res) / (minRes * 0.5);        // ~[-1,1] short axis, y up in math
  // place the depth focus decisively in the lower-right third: +x right, -y down
  // mouse eye-shift -> resolved to a per-layer PARALLAX below (not a global translate):
  // subtracting a constant in each layer's local frame shifts it on screen by ~rK, so
  // NEAR frames (large rK) slide far more than the deep ones — a real look-around.
  vec2  mraw = u_mouse;
  if (dot(mraw, mraw) < 1.0) mraw = 0.5 * res;          // no pointer -> centre, no shift
  vec2  mN  = (mraw - 0.5 * res) / (minRes * 0.5);
  vec2  vp  = vec2(u_vanishX, u_vanishY);               // fixed off-centre vanishing point
  vec2  q   = p - vp;                                    // vector from the bore depth
  // roll the whole gallery about the vanishing point (static bank + slow drift)
  float roll = radians(u_roll) + t * u_rollSpeed;
  float cR = cos(roll), sR = sin(roll);
  mat2  Rot = mat2(cR, -sR, sR, cR);
  q = Rot * q;
  vec2  parallax = (Rot * mN) * (0.12 * max(u_mouseShift, 0.0));
  float r   = length(q) + 1e-4;                          // radial distance from depth
  float ang = atan(q.y, q.x);                            // direction around the bore

  vec3 col = BG;

  // ---- faint rock-wall dust filling the gaps (log-polar so it travels too) ----
  // map to log-radius + angle, drift inward with the descent so the walls flow
  // toward the depth like everything else.
  float lr   = log(r);
  float flow = t * speed * 0.5;
  float wall = fbm(vec2(ang * 1.6, (lr) * 3.0 + flow) * 1.7);
  wall = pow(wall, 1.7);
  // dust dims hard toward the depth (true black at the end) and toward the rim
  float wallDepth = smoothstep(0.02, 0.5, r);
  vec3  wallHue   = mix(c0, c1, 0.5 + 0.35 * sin(lr * 1.3));
  col += wallHue * wall * 0.045 * wallDepth;

  // log-period: one frame every (1/density) octaves of radius. The ladder rung
  // index for radius r, advancing with time so rungs slide inward (toward depth).
  // depth grows as r shrinks; subtract the descent so frames march into the bore.
  float ringScale = density;                  // rungs per natural-log-octave-ish
  float depth = -lr * ringScale + t * speed * ringScale;

  // ---- floor: a pair of glowing rails + dim sleepers converging on the depth ----
  // Both rails are straight rays radiating OUT of the vanishing point toward the
  // lower-left mouth (so they converge exactly on the bore depth), at two angles
  // straddling the floor centreline. Sleepers are log-periodic ticks across them.
  {
    // floor centreline aims from the depth toward the lower-left (the mouth/floor)
    float floorDir = radians(208.0);            // down-left direction in p-space
    float da = ang - floorDir;
    da = atan(sin(da), cos(da));                // wrap to [-pi,pi]
    // the two rails sit a small angle either side of the centreline (the gauge)
    float railHalf = 0.205;                     // half-gauge in radians
    float dCL = abs(da + railHalf);             // distance to left rail
    float dCR = abs(da - railHalf);             // distance to right rail
    float railAA = 0.012 + 0.020 * r;           // rails widen slightly as they near
    float railL = 1.0 - smoothstep(0.0, railAA, dCL);
    float railR = 1.0 - smoothstep(0.0, railAA, dCR);
    float rail  = max(railL, railR);
    // floor wedge: only the cone around the centreline, fading to the sides
    float floorMask = 1.0 - smoothstep(railHalf * 1.1, railHalf * 2.6, abs(da));
    // sleepers: log-periodic crossings on the same cadence as the frame ladder,
    // only between the two rails
    float between = 1.0 - smoothstep(railHalf * 0.85, railHalf * 1.15, abs(da));
    float slp = abs(fract(depth) - 0.5) * 2.0;  // 0..1, 0 at a sleeper line
    float sleeper = (1.0 - smoothstep(0.0, 0.22, slp)) * between;
    // depth fog: rails are born near the rim and drown toward the bore depth
    float floorFog = smoothstep(0.02, 0.30, r) * smoothstep(1.45, 0.55, r);
    rail    *= floorFog;
    sleeper *= floorFog;
    col += warm * rail * railK;
    col += mix(warm, c2, 0.5) * sleeper * 0.22 * floorFog;
    // soft rail bloom along the two rays
    float railBloom = exp(-min(dCL, dCR) / max(railAA, 1e-3) * 1.0);
    col += warm * railBloom * 0.2 * railK * floorMask * floorFog;
  }

  // ---- the timber frame ladder: a constant window of scale layers ----
  // For each layer we reconstruct that frame's radius from its rung index and
  // draw a sheared trapezoidal portal (two posts + cap beam) in screen space,
  // plus a hanging lamp under the beam. Nearest layers occlude farther via a
  // simple painter blend weighted by birth/death fades.
  float baseRung = floor(depth);
  for (int k = 0; k < LAYERS; k++) {
    // layer rung index, spanning a few rungs straddling the camera
    float rung = baseRung - float(k) + 3.0;
    // continuous "age" of this rung relative to now: 0 at the rung centre,
    // grows outward. Used for birth (large r, +) and death (small r, -) fades.
    float age = depth - rung;                   // >0 means we are past it (deeper)
    // radius at which this frame sits right now (invert the depth mapping)
    float lrK = (t * speed * ringScale - rung) / ringScale;
    float rK  = exp(lrK);
    // skip frames far outside the visible band (cheap: just let fades zero them)
    // frame scale in short-axis units = rK; draw its portal as an SDF in the
    // direction-normalised local frame. We work directly in p-space: the portal
    // is a fixed shape scaled by rK and anchored at the vanishing point vp.
    vec2 lp = q / rK - parallax;                 // local coords + per-layer parallax

    // sheared trapezoidal portal: a quad outline. In local space the portal is a
    // rectangle from (-PX..PX) x (FLOOR..TOP); we shear x by height to fake the
    // raking oblique view (near-left post leans, far-right post short). Because the
    // whole thing is anchored at the lower-right vp, the global series already
    // converges off-centre; the shear adds the trapezoidal raking read.
    // raking oblique portal: the near-LEFT side of every frame is tall + wide,
    // the far-RIGHT side short + close-in, so the gallery reads as an off-axis
    // glance down the drift rather than a centred avenue.
    float PXL   = 0.78;                          // near-left half-width (wide)
    float PXR   = 0.46;                          // far-right half-width (close in)
    float TOP   = 0.92;                          // near-left cap height (local +y)
    float FLOORY= -0.46;                         // floor line (local -y)
    // shear: shift x strongly as a function of y so verticals rake hard
    float shear = u_shear;
    vec2  sp = lp;
    sp.x -= shear * sp.y;
    // post x positions; near-left taller + wider, far-right much shorter
    float postLx = -PXL, postRx = PXR;
    float topL = TOP, topR = TOP * 0.46;         // far-right post much shorter
    // stroke half-width in local units (timberW is device px; convert via rK)
    float lw = (timberW / (minRes * 0.5)) / rK;
    // segment SDFs: left post, right post, cap beam across the tops
    vec2 Lb = vec2(postLx, FLOORY), Lt = vec2(postLx, topL);
    vec2 Rb = vec2(postRx, FLOORY), Rt = vec2(postRx, topR);
    float dPostL = sdSeg(sp, Lb, Lt);
    float dPostR = sdSeg(sp, Rb, Rt);
    float dBeam  = sdSeg(sp, vec2(postLx, topL), vec2(postRx, topR));
    // optional cribbing brace: one diagonal per frame, alternating by rung parity
    float dBraceA = sdSeg(sp, Lb, Rt);
    float dBraceB = sdSeg(sp, Rb, Lt);
    float dBrace  = mix(dBraceA, dBraceB, step(0.5, mod(rung, 2.0)));
    float dTimber = min(min(dPostL, dPostR), dBeam);
    // soft-edged timber stroke (anti-aliased), width in local units
    float aa = lw * 0.9 + 0.004;
    float timber = 1.0 - smoothstep(lw, lw + aa, dTimber);

    // ---- birth / death fades that hide the log-periodic wrap ----
    // birth: frame appears at the rim (large rK) faded in from zero
    float birth = smoothstep(1.9, 1.1, rK);      // fade in as it shrinks below ~1.9
    // death: frame drowns in the focal fog near the depth (small rK -> 0)
    float death = smoothstep(0.012, 0.10, rK);   // fade out into true black
    float vis   = birth * death;
    if (vis <= 0.001) { continue; }

    // ---- timber colour: blend through palette by frame-depth phase ----
    float ph = rung * (0.62 / density) + 0.13;
    float s  = fract(ph) * 4.0;
    float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
    vec3  tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
    // timber faces stay dim; a soft inner bloom gives the thick-soft-edged read
    float bloom = exp(-dTimber / max(lw * 2.2, 1e-3));
    vec3  timberCol = tint * (timber * 0.55 + bloom * 0.14);
    // cribbing braces ride dimmer than the structural posts/beam, gated by u_brace
    float braceStroke = (1.0 - smoothstep(lw, lw + aa, dBrace)) * clamp(u_brace, 0.0, 1.0);
    timberCol += tint * braceStroke * 0.42;

    // ---- hanging lamp: a warm glow dot just under the cap-beam centre ----
    // anchor at the beam midpoint, dropped a little along local -y
    vec2 beamMid = vec2(0.0, mix(topL, topR, 0.5) - 0.12);
    // undo the shear sampling: lamp lives in the same sheared frame as the timber
    vec2 lampLocal = sp - beamMid;
    float lampD = length(lampLocal * vec2(1.0, 1.2));
    float lampCore = exp(-lampD * lampD / 0.0042);
    float lampHalo = exp(-lampD / 0.16);
    // the lamp is the first thing the fog takes: dim it faster than the timber
    float lampFog = smoothstep(0.05, 0.34, rK);
    vec3  lampCol = warm * (lampCore * 1.7 + lampHalo * 0.55) * lampK * lampFog;

    // composite this layer; nearer (larger rK) layers paint over farther ones via
    // simple over-blend weighted by visibility (cheap painter order: k ascending
    // is far->near because rung decreases with k... so accumulate additively for
    // the glow and alpha-cover for the opaque timber).
    vec3 layerCol = timberCol + lampCol;
    col += layerCol * vis;
  }

  // ---- global focal fog: true black held at the bore depth ----
  float focus = smoothstep(0.0, 0.085, r);       // 0 at the exact vanishing point
  col *= focus;

  // ---- vignette: keep the frame edges dark, the drift luminous ----
  float vign = 1.0 - smoothstep(0.62, 1.35, length(p));
  col *= mix(0.55, 1.0, vign);

  // whisper of dither against fog banding
  col += (hash11(dot(fc, vec2(0.137, 0.711)) + t) - 0.5) * 0.006;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
