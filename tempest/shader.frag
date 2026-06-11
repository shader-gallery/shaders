// tempest (Gyre) — a storm bank of domain-warped FBM cloud fills the lower
// two-thirds of the frame, spending most of its life a charcoal half-step above
// the near-black sky. At hash-jittered intervals lightning ignites *inside* the
// bank at a hashed location, backlighting the mass so stacked billow silhouettes
// snap into view in negative, rim edges traced where density gradients face the
// buried light. No bolt is drawn — only the reveal. The flash core blooms in the
// palette's hottest colour and the afterglow cools through the others as it dies.
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
uniform float u_flashPeriod;  // avg seconds between lightning bursts  (default 11)
uniform float u_roilSpeed;    // cloud churn rate between flashes       (default 0.1)
uniform float u_afterglow;    // post-flash glow decay length, seconds  (default 1.2)
uniform float u_detail;       // css-px scale of dominant billows       (default 420)

const vec3  BG     = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const vec3  CHARC  = vec3(0.058, 0.060, 0.074); // charcoal cloud, a half-step up

// --- hash + value-noise + fbm ----------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return s;
}

// domain-warped density: continuous advection driven by drifting warp offsets
float cloudDensity(vec2 uv, float t, out vec2 grad) {
  vec2 d1 = vec2(t * 0.06, t * 0.021);
  vec2 q  = vec2(fbm(uv + d1), fbm(uv + vec2(5.2, 1.3) - d1 * 0.8));
  vec2 d2 = vec2(t * 0.035, -t * 0.028);
  vec2 r  = vec2(fbm(uv + 1.7 * q + d2), fbm(uv + 1.7 * q + vec2(8.3, 2.8) - d2));
  float e = 0.0025;
  // central value
  float base = fbm(uv + 2.4 * r);
  // cheap gradient (two extra warped samples) so we can trace rim edges
  float gx = fbm(uv + vec2(e, 0.0) + 2.4 * r) - base;
  float gy = fbm(uv + vec2(0.0, e) + 2.4 * r) - base;
  grad = vec2(gx, gy) / e;
  return base;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x in aspect units, y 0 (bottom) .. 1 (top)
  vec2 uvn = fc / res;
  float aspect = res.x / max(res.y, 1.0);
  vec2 p = vec2((uvn.x - 0.5) * aspect, uvn.y);

  // --- palette fallback (midnight) ------------------------------------------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- cloud bank -----------------------------------------------------------
  // detail scale: smaller u_detail (css-px) => finer scud => more noise cycles.
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float detail = max(u_detail, 1.0) * refScale * pr;
  float scale  = res.y / detail;          // noise cycles across the frame height
  float roil   = max(u_roilSpeed, 0.0);

  vec2 cuv = p * scale;
  vec2 grad;
  float dens = cloudDensity(cuv, t * roil * 6.0, grad);

  // confine the bank to the lower two-thirds: a soft top edge + thinning toward
  // the very bottom so the mass reads as a bank sitting on the horizon.
  float bankTop = smoothstep(0.78, 0.40, uvn.y);   // fades out above ~2/3
  float bankBot = smoothstep(0.0, 0.18, uvn.y);    // slight thinning at floor
  float bank    = bankTop * mix(0.55, 1.0, bankBot);
  // shape density into a cloud mass (0..1), modulated by bank envelope
  float mass = smoothstep(0.44, 0.72, dens) * bank;

  // base look: charcoal mass over near-black sky, barely visible at rest
  vec3 col = mix(BG, CHARC, mass);
  // faint vertical sky gradient so the top isn't dead flat
  col += BG * (1.0 - uvn.y) * 0.15;

  // --- lightning events -----------------------------------------------------
  // Each event occupies one "slot" of length ~u_flashPeriod. Slot index + a
  // per-slot hash jitter the actual fire time and re-hash the flash position.
  float period = max(u_flashPeriod, 0.5);
  float afterglow = max(u_afterglow, 0.05);

  vec3 flashCol = vec3(0.0);
  float litTotal = 0.0;

  // consider current + previous slot so a long afterglow can cross a boundary
  for (int k = 0; k < 2; k++) {
    float slot = floor(t / period) - float(k);
    float hT = hash21(vec2(slot, 3.17));        // when within the slot
    float hX = hash21(vec2(slot, 9.71));        // flash x position
    float hY = hash21(vec2(slot, 1.33));        // flash y position (within bank)
    float hI = 0.6 + 0.4 * hash21(vec2(slot, 7.45)); // intensity

    // fire time = slot start + jitter in [0.2 .. 0.8] of the period
    float fireT = (slot + mix(0.2, 0.8, hT)) * period;
    float dt = t - fireT;

    // flash envelope: a two-or-three flicker burst (< 1s) then smooth afterglow.
    // burst = fast decaying sum of close sub-pulses; glow = slow exp tail.
    float env = 0.0;
    if (dt >= 0.0) {
      // flicker burst (under a second)
      float nF = 2.0 + step(0.5, hash21(vec2(slot, 5.5))); // 2 or 3 flickers
      float burst = 0.0;
      // three potential flicker pulses, gated by nF
      burst += exp(-pow((dt - 0.02) / 0.045, 2.0));
      burst += 0.85 * exp(-pow((dt - 0.13) / 0.05, 2.0));
      burst += step(2.5, nF) * 0.7 * exp(-pow((dt - 0.26) / 0.06, 2.0));
      // smooth afterglow tail (couple seconds, scaled by u_afterglow)
      float glow = exp(-dt / afterglow);
      env = (burst * 0.9 + glow) * hI;
    }
    if (env <= 0.0005) continue;

    // flash source position inside the bank (lower-mid of frame)
    vec2 src = vec2((hX - 0.5) * aspect, mix(0.18, 0.50, hY));
    vec2 toSrc = src - p;
    float distToSrc = length(toSrc);

    // backlight falloff: a tight hot core at the buried source, a softer halo
    // spreading the glow, and a faint full-bank wash so distant billows still
    // get rim-lit. Three nested falloffs give the light real depth.
    float core = exp(-distToSrc * distToSrc * 9.0);   // tight ignition core
    float halo = exp(-distToSrc * 1.7);                // mid spread
    float wash = exp(-distToSrc * 0.7);                // broad backlight

    // occlusion: the light sits BEHIND the mass, so dense cloud blocks it and
    // billows read as crisp negative silhouettes. Sharper knee => snappier.
    // squared so a thin lit margin remains then density slams to opaque.
    float opacity  = smoothstep(0.43, 0.60, dens);
    opacity = opacity * opacity * bank;
    float transmit = 1.0 - opacity;

    // rim edges: where the density gradient faces the buried source, trace a
    // bright thin line on the lit edge of each billow silhouette.
    vec2  gdir = normalize(grad + 1e-4);
    vec2  ldir = normalize(toSrc + 1e-4);
    float facing = max(dot(gdir, ldir), 0.0);
    float gmag = length(grad);
    float rim = pow(facing, 1.5) * smoothstep(0.6, 3.0, gmag) * bank;

    // colour: core in the palette's hottest colour (c3), cooling through the
    // others as the afterglow dies. cool factor 0 (hot) .. 1 (cold/late).
    float cool = clamp(1.0 - env, 0.0, 1.0);
    vec3 hot  = c3;                       // hottest
    vec3 mid  = mix(c3, c1, 0.6);
    vec3 cold = mix(c1, c2, 0.7);
    vec3 tone = mix(hot, mix(mid, cold, cool), cool);

    // assemble this event's contribution. The hot core punches through nearly
    // unoccluded (the ignition point itself), while the halo/wash are gated by
    // transmit so the billows in front go black.
    float backlit = core * 1.6 + (halo * 0.7 + wash * 0.35) * transmit;
    float contrib = backlit * env;
    // core takes the hottest hue directly; spread cools toward the palette
    flashCol += hot * core * env * 1.6;
    flashCol += tone * (halo * 0.7 + wash * 0.35) * transmit * env;
    // rim trace, hotter near the source
    flashCol += mix(tone, hot, 0.5) * rim * env * (halo * 0.8 + 0.3) * 2.2;

    // faint sky bleed above the bank (the flash catches the sky a little)
    float skyBleed = wash * env * (1.0 - bankTop) * 0.16;
    flashCol += mix(tone, c2, 0.5) * skyBleed;

    litTotal += contrib;
  }

  col += flashCol;

  // gentle tone curve + vignette for composed framing
  vec2 vc = (fc / res - 0.5);
  vc.x *= aspect;
  float vign = 1.0 - smoothstep(0.55, 1.25, length(vc));
  col *= mix(0.82, 1.0, vign);

  // soft filmic-ish knee to keep the hot core from harsh clipping
  col = col / (1.0 + col * 0.35);
  col = pow(max(col, 0.0), vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
