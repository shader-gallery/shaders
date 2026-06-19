// relay (Current) — a loom of fibre-optic strands carrying light. Thin dim fibres
// run the height of the frame, and bright pulses race along them like data down
// glass, each a sharp head trailing a glowing comet tail. Every strand runs at its
// own speed and direction so the traffic is asynchronous — some pulses climbing,
// some falling, the strands lit in palette hues. Carrier carried a waveform in the
// shape of the line; relay carries it as light travelling along a straight thread.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four strand colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spacing; // px between strands, css                       (default 26)
uniform float u_thick;   // strand/pulse half-width in CSS px             (default 1.8)
uniform float u_speed;   // pulse travel speed                            (default 0.5)
uniform float u_rate;    // pulses per strand height (traffic density)     (default 2.0)
uniform float u_trail;   // comet tail length                            (default 0.5)
uniform float u_glow;    // emission                                      (default 1.0)
uniform float u_fibre;   // brightness of the resting fibre between pulses (default 0.25)

const vec3  BG  = vec3(0.035, 0.035, 0.043);
const float TAU = 6.2831853;

float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

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
  float spacing  = max(u_spacing, 8.0) * refScale * pr;
  float thick    = max(u_thick, 0.4) * refScale * pr;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t     = u_time;
  float glow  = max(u_glow, 0.0);
  float yN    = fc.y / res.y;
  float rate  = max(u_rate, 0.2);
  float trail = max(u_trail, 0.02);

  vec3 col = BG;

  float cell = floor(fc.x / spacing);
  for (int k = -1; k <= 1; k++) {
    float id = cell + float(k);
    float r1 = hash11(id * 1.7 + 0.3);   // colour / speed jitter
    float r2 = hash11(id * 2.9 + 5.1);   // phase
    float r3 = hash11(id * 3.7 + 9.2);   // second-pulse phase
    float baseX = (id + 0.5) * spacing + (r1 - 0.5) * spacing * 0.2;
    float dir   = r1 < 0.5 ? 1.0 : -1.0; // some climb, some fall
    float spd   = u_speed * (0.6 + 0.8 * r2);

    float d = abs(fc.x - baseX);
    float line = 1.0 - smoothstep(thick, thick + 2.0 * pr, d);
    float halo = exp(-d / (7.0 * pr));

    // two comet pulses per strand: head sharp, tail trailing behind by `trail`
    float ph1 = fract(yN * rate - dir * t * spd + r2);
    float ph2 = fract(yN * rate - dir * t * spd + r3 + 0.5);
    // distance "behind" the head (comet trails toward increasing ph)
    float comet1 = exp(-ph1 / trail) + 0.9 * exp(-(1.0 - ph1) / (trail * 0.18));
    float comet2 = exp(-ph2 / trail) + 0.9 * exp(-(1.0 - ph2) / (trail * 0.18));
    float pulse  = max(comet1, comet2);

    // strand brightness: a dim resting fibre plus the bright travelling pulses
    float bright = u_fibre * 0.6 + pulse * (0.6 + 0.8 * r3);

    vec3 tint = tint4(c0, c1, c2, c3, fract(baseX / res.x + r1 * 0.15));
    col += tint * line * bright * glow;
    col += tint * halo * bright * 0.3 * glow;
  }

  // faint strand-coloured wash so the gaps are not dead-black
  vec3 washCol = tint4(c0, c1, c2, c3, fc.x / res.x);
  col += washCol * 0.025 * glow;

  col = col / (col + vec3(0.9)) * 1.5;

  vec2 uvc = fc / res - 0.5;
  float vign = 1.0 - smoothstep(0.55, 1.08, length(uvc * vec2(1.0, 1.05)));
  col *= mix(0.8, 1.0, vign);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
