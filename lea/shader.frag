// lea (Sough) — a meadow seen from directly above: a jittered grid of short
// grass-tuft strokes, each a tiny capsule whose direction and length encode the
// lean of the tuft beneath it. At rest the strokes contract to near-points,
// almost black, with only a sparse hash of paler tips keeping the field
// readable. When a gust band sweeps across, the strokes inside it stretch and
// swing to point downwind, far tips brightening — the front reads as a
// travelling band of combed, glowing dashes with calm dark meadow on either
// side. Hue comes from a slow large-scale positional field blending all four
// palette colours, so each passing front lights a different region in a
// different blend. The wind heading drifts continuously and gust arrivals are
// aperiodic, so no two crossings repeat; between bands the meadow lies still.
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
uniform float u_spacing;   // css-px spacing of the tuft grid (default 14)
uniform float u_gustRate;  // how often gust bands cross       (default 0.5)
uniform float u_lean;      // how far tufts stretch downwind    (default 1)
uniform float u_tipGlow;   // brightness of leaning tips        (default 1)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float REST_CSS    = 1.6;   // half-length of a tuft stroke at rest
const float MAX_LEN_CSS = 9.0;   // extra half-length added when fully leaned
const float STROKE_CSS  = 1.15;  // half-thickness of a tuft capsule

// hash helpers (no textures): cheap value noise from sin-dot scrambles
float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// smooth 1D value noise on a float coordinate
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  float a = hash11(i), b = hash11(i + 1.0);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u);
}

// distance from point p to a capsule (segment a->b) — used to draw each stroke
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 4.0) * refScale * pr;
  float rest    = REST_CSS * pr;
  float maxLen  = MAX_LEN_CSS * pr;
  float thick   = STROKE_CSS * pr;

  // --- wind heading drifts continuously (slow veer), never repeating ---
  float heading = 0.55 + 0.9 * sin(t * 0.035) + 0.4 * sin(t * 0.017 + 1.3);
  vec2  wind    = vec2(cos(heading), sin(heading));   // downwind direction
  vec2  across  = vec2(-wind.y, wind.x);              // band travels along wind

  // signed distance (in css px) of a point along the wind axis, centred
  float axis = dot(fc - ctr, wind);

  // --- gust front: an aperiodic travelling band along the wind axis ---
  // band centre marches downwind; speed/spacing jittered by 1D noise so
  // arrivals are irregular. A single soft band gives "front then long calm".
  float bandSpanCss = 460.0 + 160.0 * vnoise(t * 0.07);   // width of the lit band
  float bandSpan    = bandSpanCss * pr;
  // travel distance accumulates with gust rate; phase wraps over a long period
  float march   = t * u_gustRate * 240.0 * pr;
  // wrap the axis into a long repeating corridor much larger than the band so
  // the calm between fronts dominates and the wrap is hidden in darkness
  float period  = bandSpan * 4.2;
  float ph      = axis + march;
  float local   = mod(ph, period) - period * 0.5; // -p/2..p/2, 0 at band centre
  // aperiodic jitter: nudge the band centre by noise keyed to which corridor
  float corridor = floor((axis + march) / period);
  local += (vnoise(corridor * 1.7 + 11.0) - 0.5) * bandSpan * 1.1;

  // gust envelope: a smooth hump, ~1 at the front, 0 in the calm
  float env = exp(-local * local / (bandSpan * bandSpan * 0.10));
  // secondary fainter trailing front so a region occasionally gets two passes
  float local2 = mod(ph + period * 0.5, period) - period * 0.5;
  local2 += (vnoise((corridor + 1.0) * 1.7 + 11.0) - 0.5) * bandSpan * 1.1;
  float env2 = exp(-local2 * local2 / (bandSpan * bandSpan * 0.06)) * 0.45;
  float gust = clamp(env + env2, 0.0, 1.0);

  // spring-back overshoot: just behind the front the tufts whip slightly
  // against the wind before settling (sign flips on the trailing edge)
  float overshoot = -0.30 * exp(-local * local / (bandSpan * bandSpan * 0.020))
                          * smoothstep(0.0, bandSpan * 0.25, local);

  // --- search the 3x3 neighbourhood of tuft cells; draw the nearest strokes ---
  vec2 cell0 = floor(fc / spacing);
  float best  = 1e9;   // nearest capsule distance (px)
  float bestL = 0.0;   // lean fraction of the nearest tuft (0 rest .. 1 leaned)
  vec2  bestRoot = ctr;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = cell0 + vec2(float(i), float(j));
      // jittered root position inside the cell (rooted point never moves)
      vec2 jit = vec2(hash21(cid + 3.1), hash21(cid + 7.7));
      vec2 root = (cid + 0.2 + 0.6 * jit) * spacing;

      // how much THIS tuft leans = gust strength sampled at its root
      float ra   = dot(root - ctr, wind);
      float rl   = mod(ra + march, period) - period * 0.5;
      rl += (vnoise(floor((ra + march) / period) * 1.7 + 11.0) - 0.5) * bandSpan * 1.1;
      float rgust = exp(-rl * rl / (bandSpan * bandSpan * 0.10));
      float rl2  = mod(ra + march + period * 0.5, period) - period * 0.5;
      rl2 += (vnoise((floor((ra + march) / period) + 1.0) * 1.7 + 11.0) - 0.5) * bandSpan * 1.1;
      rgust += exp(-rl2 * rl2 / (bandSpan * bandSpan * 0.06)) * 0.45;
      float ro    = -0.30 * exp(-rl * rl / (bandSpan * bandSpan * 0.020))
                          * smoothstep(0.0, bandSpan * 0.25, rl);
      float leanF = clamp(rgust, 0.0, 1.0);

      // per-tuft length: near-point at rest, stretched downwind when gusted.
      // a little phase scatter so the comb isn't perfectly uniform
      float scatter = 0.7 + 0.6 * hash21(cid + 5.5);
      float len = rest + (leanF * u_lean) * maxLen * scatter;
      // overshoot leans the tip slightly against the wind on the trailing edge
      vec2 dir = normalize(wind + across * (ro * scatter) + across * (hash21(cid + 9.2) - 0.5) * 0.10);
      vec2 tip = root + dir * len;

      float d = sdSegment(fc, root, tip);
      if (d < best) {
        best = d;
        bestL = leanF;
        bestRoot = root;
      }
    }
  }

  // anti-aliased capsule stroke
  float aa     = pr * 1.1;
  float stroke = 1.0 - smoothstep(thick - aa, thick + aa, best);

  // tip brightening: along a leaned stroke the far end glows; encode with the
  // lean fraction so calm strokes stay near-black dots and only lit fronts pop.
  // (best is distance; we fade glow with the tuft's lean, plus a faint base.)
  float tipFactor = mix(0.18, 1.0, bestL);

  // --- hue: slow large-scale positional field blending all four palette cols ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec2 fld = bestRoot / res;
  float k  = fld.x * 1.3 + fld.y * 0.8 + t * 0.013
           + 0.25 * sin(fld.y * 6.2831 + t * 0.05);
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // sparse paler-tip hash so the calm field stays faintly readable
  float restHash = step(0.86, hash21(floor(bestRoot / spacing) + 1.3));

  // compose: stroke body (dim) + lean-driven tip glow (bright)
  float bodyAmt = stroke * (0.10 + 0.10 * restHash);
  float glowAmt = stroke * tipFactor * u_tipGlow * 0.95 * smoothstep(0.0, 1.0, bestL);

  col += hue * bodyAmt;
  col += hue * glowAmt;

  // soft bloom around lit strokes so fronts read as luminous, not hard dashes
  float bloom = exp(-best / (thick * 4.0)) * bestL * u_tipGlow;
  col += hue * bloom * 0.28;

  // gentle vignette to compose the framing
  float vign = 1.0 - smoothstep(0.45, 1.15, length((fc - ctr) / res));
  col *= mix(0.8, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
