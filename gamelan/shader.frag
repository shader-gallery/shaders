// gamelan (Knell) - a full-width rank of struck metallophone bars, edge to edge
// across the frame, lengths graded so the tops form a ragged skyline. Every bar
// rings in its free-bar standing-wave modes: bright antinodes, pinned dark nodes,
// and a travelling flare that climbs the bar on each hash-scheduled strike. A
// persistent baseline glow keeps the whole wall lit so it resonates rather than
// flickers. Bars take graded palette hues left to right. Dense, no dead-black.
// Comments are 7-bit ASCII on purpose (headless-gl poster compiler is fussy).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_strikeGap;  // mean seconds between strikes on a bar  (default 5)
uniform float u_ringTime;   // ring/decay time after a strike (s)     (default 6)
uniform float u_barWidth;   // bar width in CSS px (sets how many)    (default 26)
uniform float u_overtone;   // higher-mode shimmer content 0..1       (default 0.5)

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;
  float PI  = 3.14159265;

  // bar lattice across the full width
  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float barW = max(u_barWidth, 8.0) * refScale * pr;
  float bx   = fc.x / barW;
  float bar  = floor(bx);
  float within = fract(bx);                 // 0..1 across one bar
  float seed = hash11(bar + 0.5);

  // thin gap between bars -> rounded slab body
  float body = smoothstep(0.03, 0.10, within) * smoothstep(0.03, 0.10, 1.0 - within);

  // each bar a graded length, so the tops make a ragged skyline (varied heights)
  float barLen = 0.62 + 0.36 * hash11(bar * 1.7 + 3.1);
  float yy = fc.y / res.y;                   // 0 bottom .. 1 top
  float topSoft = 1.0 - smoothstep(barLen - 0.02, barLen + 0.01, yy);  // fade at the tip
  float onBar = body * topSoft;

  // standing-wave modes along the bar length: antinodes glow, nodes pinned dark
  float yn = clamp(yy / max(barLen, 0.05), 0.0, 1.0);
  float modeN = 2.0 + floor(2.0 + u_overtone * 4.0 + seed * 2.0);
  float anti = abs(sin(yn * PI * modeN));
  // add a faint second overtone for shimmer
  float anti2 = abs(sin(yn * PI * (modeN + 3.0) + t * 0.6));
  float wave = mix(anti, anti * (0.6 + 0.4 * anti2), u_overtone);

  // hash-scheduled strike envelope: energy flares to 1 at strike, decays over ring
  float gap = max(u_strikeGap, 1.0) * (0.6 + 0.9 * seed);
  float k = fract(t / gap + seed * 9.0);     // 0 just struck .. 1 about to strike
  float decay = exp(-k * gap / max(u_ringTime, 0.5) * 1.6);
  float energy = decay;                      // 0..1

  // travelling flare climbing the bar right after a strike
  float climb = k * 1.6;                      // wave-front height over the cycle
  float flare = exp(-pow((yn - climb) * 5.0, 2.0)) * smoothstep(0.5, 0.0, k);

  // persistent baseline so the wall always resonates (never gappy flicker)
  float lit = (0.34 + 0.66 * energy) * wave + flare * 0.9;

  // --- palette ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // hue graded across the rank, nudged by strike so a struck bar warms up
  float hue = bar / max(res.x / barW, 1.0) + 0.08 * energy + seed * 0.06;
  vec3 barCol = wheelCol(hue, c0, c1, c2, c3);

  vec3 col = barCol * lit * onBar;
  // edge sheen on the bar sides for a metal read
  float sheen = (smoothstep(0.10, 0.16, within) * smoothstep(0.30, 0.16, within)
               + smoothstep(0.84, 0.90, within) * smoothstep(0.70, 0.84, within));
  col += barCol * sheen * onBar * (0.18 + 0.5 * energy);

  // soft floor tint so the gaps and dark tips do not read as dead-black
  col += barCol * 0.05 * body + 0.02 * vec3(0.10, 0.12, 0.20);

  // gentle vignette
  float vign = 1.0 - smoothstep(0.62, 1.28, length((fc - ctr) / res));
  col *= mix(0.84, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
