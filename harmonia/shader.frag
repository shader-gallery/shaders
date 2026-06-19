// harmonia (Strand) - modular times-table string art. N points are spaced evenly
// round a circle and each point i is strung with a straight chord to point
// (i * multiplier) mod N. The dense overlap of those chords traces the classic
// envelope curves of the times tables - the cardioid (x2), nephroid (x3) and the
// higher roses - and as the multiplier drifts the envelope morphs smoothly from
// one figure into the next. Only straight strands are drawn; the curves are an
// illusion of their tangents.
// (ASCII-only comments: the headless poster compiler is fussy about apostrophes.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_points;      // points round the circle            (default 90)
uniform float u_multiplier;  // base times-table multiplier         (default 2.0)
uniform float u_morph;       // how far the multiplier breathes      (default 0.5)
uniform float u_line;        // chord half-width, css px             (default 0.9)
uniform float u_tint;        // white(0)..full palette(1) chords     (default 1.0)
uniform float u_radius;      // circle radius, fraction of frame     (default 0.46)
uniform float u_glow;        // soft halo strength                   (default 0.7)

const vec3 BG = vec3(0.035, 0.035, 0.043);
const int  MAXP = 150;       // hard loop bound; u_points gates it live

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float lw  = max(u_line, 0.3) * refScale * pr;
  float nP  = max(floor(u_points + 0.5), 6.0);
  float R   = min(res.x, res.y) * 0.5 * clamp(u_radius, 0.15, 0.82);
  vec2  ctr = res * vec2(0.5, 0.5);

  // multiplier breathes around its base so the envelope morphs cardioid <-> rose
  // (continuous, no reset). slow whole-figure spin keeps it alive when morph is 0.
  float mult = u_multiplier + u_morph * 3.0 * sin(t * 0.07);
  float spin = t * 0.011;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 acc = vec3(0.0);
  float TWO = 6.2831853;

  for (int i = 0; i < MAXP; i++) {
    if (float(i) >= nP) break;
    float fi = float(i);
    float aA = TWO * fi / nP + spin;
    float aB = TWO * (fi * mult) / nP + spin;     // fractional index = smooth morph
    vec2 A = ctr + R * vec2(cos(aA), sin(aA));
    vec2 B = ctr + R * vec2(cos(aB), sin(aB));
    float d = segDist(fc, A, B);
    float core = smoothstep(lw, 0.0, d);
    float halo = lw / (d + lw * 1.4);
    halo = halo * halo * 0.5;
    vec3 cc = wheelCol(fi / nP + t * 0.008, c0, c1, c2, c3);
    vec3 lc = mix(vec3(1.0), cc, clamp(u_tint, 0.0, 1.0));
    acc += lc * (core + halo * u_glow) * 0.42;
  }

  // --- background web: a second, wider times-table figure laid on an ellipse
  // matched to the frame, so its faint chords sweep the whole rectangle (and the
  // corners the central circle leaves dark). A different multiplier and a slow
  // counter-drift keep it reading as a separate, deeper layer behind the figure.
  vec2  erad  = res * 0.66;
  float nP2   = 64.0;
  float mult2 = 3.0 + u_morph * 2.0 * sin(t * 0.05 + 1.7);
  float spin2 = -t * 0.007;
  vec3  bg    = vec3(0.0);
  for (int i = 0; i < 64; i++) {
    float fi = float(i);
    float aA = TWO * fi / nP2 + spin2;
    float aB = TWO * (fi * mult2) / nP2 + spin2;
    vec2 A = ctr + erad * vec2(cos(aA), sin(aA));
    vec2 B = ctr + erad * vec2(cos(aB), sin(aB));
    float d = segDist(fc, A, B);
    float core = smoothstep(lw * 1.5, 0.0, d);
    vec3 cc = wheelCol(fi / nP2 + 0.3 + t * 0.005, c0, c1, c2, c3);
    bg += mix(vec3(1.0), cc, clamp(u_tint, 0.0, 1.0)) * core * 0.13;
  }
  acc += bg;

  // tonemap so the busy overlap saturates to colour, not a white disc
  acc = vec3(1.0) - exp(-acc * 1.1);

  vec3 col = BG + acc;
  gl_FragColor = vec4(col, 1.0);
}
