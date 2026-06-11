// strider (Wake) — five water striders skating across still black water. Each is
// a tight cluster of four bright dimple-lenses (light bent through a depressed
// meniscus: a bright point ringed by a dark refractive rim). Behind each trails
// a spreading V-wake — two faint diverging arms crossed by fine ripple
// striations that fade astern. Palette colours are assigned per strider by hash
// and bleed softly into the wake, so the water reads as black glass scratched by
// four-colour light. Motion is stroke-and-coast: a quick skating pulse every
// few seconds then a long decelerating glide, dimples flaring at each stroke.
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
uniform float u_glideSpeed;   // stroke-and-coast travel rate of every strider (default 0.5)
uniform float u_wakeLength;    // css-px the V-wake persists astern, *u_pixelRatio (default 200)
uniform float u_dimpleSize;    // css-px radius of each foot's dimple-lens, *u_pixelRatio (default 6)

const vec3  BG       = vec3(0.030, 0.032, 0.040); // near-black water ~#080810
const float NSTRIDER = 5.0;
const float LOOPT    = 96.0;   // seamless period (seconds) of the wandering paths
const float TWO_PI   = 6.2831853;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// per-strider colour: blend the four palette entries by a hashed phase
vec3 striderColor(float h, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s  = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// stroke-and-coast scalar phase: position along a wandering loop. We integrate a
// stroke-and-coast *speed* into the angular phase so each path advances in quick
// pulses then long glides. Built from summed sines of the loop time => seamless.
// Returns the loop position in [0,1)-ish for use as a sine argument.
float strokePhase(float lt, float seed) {
  // base loop angle advances once per LOOPT (continuous, seamless)
  float a = lt;
  // stroke-and-coast accent: bursts of forward motion. cos of a few harmonics,
  // rectified so it's mostly near zero (coast) with sharp positive flares
  // (strokes). Integral of a rectified ripple stays seamless over the loop.
  float ripple = 0.5 + 0.5 * sin(lt * 8.0 + seed * 6.28);
  ripple = ripple * ripple; // sharpen the flare
  return a + ripple * 0.06;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // palette fallback (headless contexts can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  // device-px sizes from css params
  float wakeLen = max(u_wakeLength, 1.0) * pr;
  float dimpleR = max(u_dimpleSize, 0.5) * pr;
  float minDim  = min(res.x, res.y);

  // seamless loop time. glideSpeed scales how far along the loop we travel;
  // at 0 the striders hover (no advance) leaving only faint residual ripples.
  float lt = (t / LOOPT) * TWO_PI;

  // accumulate over the striders (constant loop bound, GLSL ES 1.00 safe)
  for (float i = 0.0; i < NSTRIDER; i += 1.0) {
    float fi   = i;
    float seed = fi * 1.3713;
    // hashed personality
    float hx = fract(sin(seed * 12.9898) * 43758.5453);
    float hy = fract(sin(seed * 78.233 + 1.7) * 24634.6345);
    float hh = fract(sin(seed * 39.425 + 4.1) * 51237.1234); // colour hash

    // ---- wandering closed path (summed sines => seamless over LOOPT) ----
    // phase advances with stroke-and-coast; glideSpeed scales the *travel*
    float adv = strokePhase(lt, seed) * u_glideSpeed;
    // path centre + amplitudes spread across the frame, per-strider distinct
    vec2 amp = vec2(0.30 + 0.10 * hx, 0.22 + 0.10 * hy) * minDim;
    vec2 ph  = vec2(seed * 2.1, seed * 1.3 + 2.0);
    // two summed harmonics per axis for an organic non-elliptical wander
    vec2 pos;
    pos.x = sin(adv * 1.0 + ph.x) * 0.7 + sin(adv * 2.0 + ph.x * 1.7) * 0.3;
    pos.y = cos(adv * 1.0 + ph.y) * 0.7 + cos(adv * 3.0 + ph.y * 1.3) * 0.3;
    vec2 P = ctr + pos * amp + vec2((hx - 0.5), (hy - 0.5)) * 0.18 * minDim;

    // velocity direction = analytic derivative of the path wrt adv
    vec2 vel;
    vel.x = (cos(adv * 1.0 + ph.x) * 0.7 + cos(adv * 2.0 + ph.x * 1.7) * 0.6);
    vel.y = (-sin(adv * 1.0 + ph.y) * 0.7 - sin(adv * 3.0 + ph.y * 1.3) * 0.9);
    float speedMag = length(vel);
    vec2 dir = vel / max(speedMag, 1e-3);    // heading
    vec2 nrm = vec2(-dir.y, dir.x);          // left normal

    // stroke flare: bright at the instant of each skating pulse
    float ripple = 0.5 + 0.5 * sin(lt * 8.0 + seed * 6.28);
    float strokeFlare = pow(ripple, 4.0);    // 0..1 sharp pulse
    // when hovering (glideSpeed~0) keep a faint residual shimmer
    float liveness = mix(0.18, 1.0, clamp(u_glideSpeed, 0.0, 1.0));

    vec3 sc = striderColor(hh, c0, c1, c2, c3);

    // ---- local frame of this strider ----
    vec2 q  = fc - P;
    float along = dot(q, -dir);  // distance ASTERN (positive behind the strider)
    float lateral = dot(q, nrm); // signed sideways distance

    // ================= V-WAKE (Kelvin arms + striations) =================
    if (along > 0.0) {
      float astern = along;
      // overall fade with distance astern (quadratic-ish so the wake dissolves
      // smoothly into black well within wakeLen, never a hard searchlight beam)
      float fnorm = astern / wakeLen;
      float fade  = exp(-fnorm * fnorm * 2.2) * exp(-fnorm * 0.6);
      // Kelvin half-angle ~19.5deg => arm slope. distance to the two arms.
      float slope  = 0.34;
      float armOff = abs(lateral) - slope * astern;
      // arm thickens astern AND softens with the same fade so it spreads, not laser
      float armW   = (2.6 + 0.05 * astern / pr) * pr;
      float arm    = exp(-armOff * armOff / (armW * armW));
      // suppress the region OUTSIDE the V (lateral spread beyond the arm)
      arm *= 1.0 - smoothstep(armW * 1.2, armW * 4.0, armOff);
      // fine transverse ripple striations crossing the wake, fading astern.
      // phase locked to the path so they stream and dissolve (no pop/reset).
      float striPhase = astern / (7.0 * pr) - t * (1.0 + u_glideSpeed * 1.4) - lt * 4.0;
      float stri = 0.5 + 0.5 * sin(striPhase);
      stri = stri * stri;                      // sharpen the crests
      // striations fill the inner V, widening astern, brightest near the strider
      float halfw = slope * astern + 5.0 * pr; // inner-V half-width
      float band  = 1.0 - smoothstep(halfw * 0.7, halfw * 1.15, abs(lateral));
      float striation = stri * band * exp(-fnorm * fnorm * 3.2);

      float wake = arm * 0.85 + striation * 0.55;
      wake *= fade;
      // near-wake flares with each stroke
      wake *= (0.5 + 1.0 * strokeFlare * exp(-fnorm * 2.2));
      col += sc * wake * 0.5 * liveness;
    }

    // ================= DIMPLE-LENS FEET (cluster of four) =================
    // four feet around the body in the local (dir,nrm) frame: two fore, two aft,
    // splayed sideways like a strider's stance.
    // cluster splay grows with dimple size so bigger lenses sit in a wider stance
    float stance = mix(0.65, 1.45, clamp((u_dimpleSize - 2.0) / 12.0, 0.0, 1.0));
    for (float f = 0.0; f < 4.0; f += 1.0) {
      float ff = f;
      // foot offsets in css px (fore/aft x side)
      float fore = (ff < 2.0) ? 4.5 : -4.5;          // front pair vs rear pair
      float side = (mod(ff, 2.0) < 0.5) ? 5.5 : -5.5; // left vs right
      // mid pair sits wider; tweak rear splay a touch
      side *= (ff < 2.0) ? 1.0 : 1.35;
      vec2 footPos = P + dir * (fore * stance * pr) + nrm * (side * stance * pr);
      vec2 d = fc - footPos;
      float r = length(d);
      // dimple-lens: bright core, dark refractive rim, faint outer ring
      float core = exp(-r * r / (dimpleR * dimpleR * 0.5));
      float rim  = exp(-pow(r - dimpleR, 2.0) / (dimpleR * dimpleR * 0.22));
      float lens = core * 1.4 - rim * 0.55; // subtract rim => dark meniscus edge
      lens = max(lens, 0.0);
      // soft surface-tension halo: light scattered on the depressed meniscus,
      // its reach grows with the dimple radius (wider lens => wider glow)
      float halo = exp(-r * r / (dimpleR * dimpleR * 3.0));
      float bri = 0.6 + 1.1 * strokeFlare;  // feet flare at each stroke
      col += sc * lens * bri * liveness * 1.1;
      col += sc * halo * 0.20 * (0.5 + 0.7 * strokeFlare) * liveness;
      // tiny dark rim explicitly darkens the water just outside the bright point
      col -= sc * rim * 0.10 * (0.4 + 0.6 * liveness);
    }
  }

  // keep water from going negative where rims subtract
  col = max(col, BG * 0.6);

  // gentle radial vignette: dark edges, luminous centre
  float vign = 1.0 - smoothstep(0.35, 1.15, length((fc - ctr) / res));
  col *= mix(0.78, 1.0, vign);

  // subtle filmic-ish rolloff so bright stroke flares don't clip harshly
  col = col / (1.0 + col * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
