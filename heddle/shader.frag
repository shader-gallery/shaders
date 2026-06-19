// heddle (Current) — a warp under the loom hand. Fine vertical threads are
// gathered into bright pleats and drawn apart into dark sheds: a smocking gather
// crowds the threads where it pinches and opens them where it releases, and the
// gather lines waver down the height and travel slowly sideways so the pleats
// breathe open and shut. Threads crowd luminous at the folds and thin into shadow
// between. A warp like the warp shader, gathered into pleats instead of rippled.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four thread colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spacing; // px between threads, css                       (default 11)
uniform float u_thick;   // thread half-width in CSS px                   (default 1.3)
uniform float u_gather;  // how hard the pleats pinch the threads          (default 0.7)
uniform float u_pleats;  // number of pleats across the frame              (default 5)
uniform float u_waver;   // vertical waver of the gather lines             (default 0.5)
uniform float u_speed;   // sideways travel of the pleats (breathing)      (default 0.3)
uniform float u_glow;    // overall thread emission                       (default 1.0)

const vec3  BG  = vec3(0.035, 0.035, 0.043);
const float TAU = 6.2831853;

vec3 tint4(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x) {
  float s = clamp(x, 0.0, 1.0) * 3.0;
  vec3 c = c0;
  c = mix(c, c1, smoothstep(0.0, 1.0, s));
  c = mix(c, c2, smoothstep(1.0, 2.0, s));
  c = mix(c, c3, smoothstep(2.0, 3.0, s));
  return c;
}

void main() {
  float pr  = max(u_pixelRatio, 0.0001);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  float refScale = min(res.x, res.y) / (pr * 400.0);
  float spacing  = max(u_spacing, 5.0) * refScale * pr;
  float thick    = max(u_thick, 0.4) * refScale * pr;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t      = u_time;
  float glow   = max(u_glow, 0.0);
  float pleats = max(u_pleats, 1.0);
  float gather = max(u_gather, 0.0);

  float xN = fc.x / spacing;     // thread index coordinate
  float yN = fc.y / res.y;

  // the gather phase: pleats across the frame, wavering down the height and
  // travelling sideways. period (in thread units) = total threads / pleats.
  float totalThreads = res.x / spacing;
  float period = totalThreads / pleats;
  float waver  = u_waver * sin(yN * TAU * 1.5 - t * 0.4);
  float phase  = xN / period - t * u_speed * 0.2 + waver * 0.3;

  // warped thread coordinate: gather bunches threads where the sine compresses.
  // amplitude in thread units; keep |dw/dx| > 0 so threads never fold over.
  float amp = gather * 0.85;     // <1 keeps the mapping monotonic (no crossings)
  float w   = xN + amp * (period / TAU) * sin(TAU * phase);

  // local thread crowding = dw/dxN -> bright where threads pinch into a pleat
  float dwdx = 1.0 + amp * cos(TAU * phase);
  float crowd = clamp(dwdx, 0.0, 2.0);

  // thread line in the warped coordinate (AA width in w units)
  float tf = abs(fract(w) - 0.5) * 2.0;            // 0 on a thread, 1 between
  float wWidth = thick / spacing * 2.0 * max(dwdx, 0.2); // keep px width ~constant
  float core = smoothstep(wWidth, 0.0, tf);
  float halo = smoothstep(min(wWidth * 4.0, 1.0), 0.0, tf) * 0.35;

  // pleat brightness: crowded folds blaze, open sheds fall dark
  float pleatLit = 0.18 + 1.6 * smoothstep(0.5, 1.85, crowd);

  // colour by pleat position so folds progress through the palette
  vec3 tint = tint4(c0, c1, c2, c3, fract(phase));

  vec3 col = BG;
  col += tint * (core * 0.95 + halo * 0.22) * pleatLit * glow;

  // faint fold-coloured wash so the open sheds are not dead-black
  col += tint * (0.02 + 0.05 * smoothstep(0.4, 1.7, crowd)) * glow;

  col = col / (col + vec3(0.92)) * 1.45;

  vec2 uvc = fc / res - 0.5;
  float vign = 1.0 - smoothstep(0.5, 1.05, length(uvc * vec2(1.0, 1.05)));
  col *= mix(0.8, 1.0, vign);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
