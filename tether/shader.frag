// tether (Wake) — a harbour at night. A waterfront of moored lights rides along
// the far shore: dozens of glowing buoy- and dock-lamps strung across the frame
// just above the waterline, each throwing a long shimmering reflection straight
// down the black water below. The lights bob gently on the swell and their
// mirrored streaks break into horizontal ripple bands as the surface stirs — a
// slow living current, never a hard reset. Bright leashed embers reflected on
// dark glass.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_swellSpeed;   // rate of the bob + reflection shimmer   (default 0.5)
uniform float u_reflection;   // length/strength of the water reflections (default 1)
uniform float u_buoyGlow;     // css-px buoy glow size                   (default 7)
uniform float u_density;      // how many lights line the shore 0..1     (default 0.8)

const vec3  BG    = vec3(0.024, 0.027, 0.038); // near-black harbour water
const int   N     = 34;       // candidate lights along the shore
const float TAU   = 6.2831853;
const float WY    = -0.02;    // waterline height (uv units, y up)

// cheap hash -> 0..1
float h11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  float S      = min(res.x, res.y);
  vec2  uv     = (fc - 0.5 * res) / S;     // ~ -aspect/2..aspect/2 , -0.5..0.5
  float aspect = res.x / res.y;

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float glow = max(u_buoyGlow, 1.0) * pr / S;     // buoy size in uv units
  float spd  = max(u_swellSpeed, 0.0);
  float refl = clamp(u_reflection, 0.0, 2.0);
  float dens = clamp(u_density, 0.0, 1.0);
  float halfW = 0.5 * aspect - 0.04;

  vec3 col = BG;

  // ---- sky / shore wash above the waterline + dark water below -------------
  float aboveWater = smoothstep(WY - 0.01, WY + 0.01, uv.y);
  vec3 shoreCol = mix(c0, c1, 0.5);
  // faint distant shore glow hugging the waterline (the lit far bank)
  float shoreGlow = exp(-max(uv.y - WY, 0.0) / 0.22) * aboveWater;
  col += shoreCol * shoreGlow * 0.06;
  // a barely-there cool wash on the water so it isn't dead flat
  col += mix(c0, c2, 0.5) * (1.0 - aboveWater) * 0.02
         * (0.6 + 0.4 * sin(uv.x * 6.0 - t * spd * 0.5));

  float depth = WY - uv.y;                  // >0 below the waterline (the water)

  for (int i = 0; i < N; i++) {
    float fi = float(i);
    // present? density gates how many candidate lamps are lit
    float present = step(h11(fi * 1.7 + 0.5), dens + 0.08);
    if (present < 0.5) continue;

    // even spread across the shore with a hash jitter so it reads as a strung
    // waterfront, not a regular comb
    float jx = (h11(fi * 2.3 + 1.1) - 0.5) * (2.0 * halfW / float(N)) * 1.6;
    float lx = mix(-halfW, halfW, (fi + 0.5) / float(N)) + jx;
    // height above the waterline: most lamps hug the shore, a few ride higher
    // (further-back tiers / masts). power-bias toward the waterline.
    float hb = h11(fi * 3.1 + 2.7);
    float ly = WY + 0.015 + pow(hb, 1.7) * 0.40;
    // a few foreground buoys sit just above the water, larger + brighter
    float fg = step(0.82, h11(fi * 4.3 + 0.3));
    float sz = glow * mix(0.8, 1.0, h11(fi * 5.1 + 4.0)) * (fg > 0.5 ? 1.7 : 1.0);

    // gentle bob on the swell
    float bob = 0.010 * sin(TAU * t * spd * (0.18 + 0.10 * h11(fi*7.9)) + fi * 2.1);
    ly += bob;

    // per-lamp colour, dealt round-robin so the waterfront is multi-hued
    float pick = h11(fi * 4.9 + 1.3);
    vec3  hue = pick < 0.25 ? c0 : (pick < 0.5 ? c1 : (pick < 0.75 ? c2 : c3));
    // foreground buoys lean warm so they pop forward
    if (fg > 0.5) hue = mix(hue, c3, 0.4);

    vec2 lp = vec2(lx, ly);

    // ---- the lamp glow core ----
    vec2  rq = uv - lp;
    float d2 = dot(rq, rq);
    float core = exp(-d2 / (sz * sz * 0.45));
    float halo = exp(-d2 / (sz * sz * 4.0));
    col += hue * (core * 1.5 + halo * 0.45);
    col += vec3(core * core) * 0.6;          // white-hot centre

    // ---- vertical reflection streamed straight down the water -------------
    if (depth > 0.0) {
      float dx = uv.x - lx;
      // horizontal spread of the reflection (a defined streak, widens slightly
      // with depth as the surface scatters it)
      float wq = sz * (0.6 + 1.4 * (depth / 0.5));
      float streakX = exp(-(dx * dx) / (wq * wq * 0.5));
      // reflection length tied to the lamp's height above water * the param
      float lh = max(ly - WY, 0.02);
      float reflLen = (0.10 + lh * 1.4) * (0.4 + refl);
      float vert = exp(-depth / reflLen);
      // bright near-surface lobe just under the waterline
      float lobe = exp(-depth / (reflLen * 0.32));
      // horizontal ripple bands marching down = the stirred surface
      float shim = 0.55 + 0.45 * sin(depth * (60.0 + 30.0 * h11(fi*6.1))
                                     - t * spd * 2.4 + fi * 2.1);
      float reflAmt = (vert * 0.7 + lobe * 0.6) * streakX * shim;
      col += hue * reflAmt * 0.7;
    }
  }

  // a crisp glint line right on the waterline where the shore meets the water
  float waterline = exp(-pow((uv.y - WY) / 0.006, 2.0));
  col += shoreCol * waterline * 0.10;

  // radial vignette keeps edges as dark water
  float vign = 1.0 - smoothstep(0.55, 1.18, length(uv * vec2(1.0 / max(aspect,1.0), 1.0)) * 2.0);
  col *= mix(0.80, 1.0, vign);

  // gentle filmic-ish roll so bright lamps don't clip harshly
  col = col / (1.0 + col * 0.42);

  gl_FragColor = vec4(col, 1.0);
}
