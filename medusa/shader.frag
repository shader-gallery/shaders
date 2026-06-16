// medusa (Bloom) — drifting sea-nettle jellyfish. Each is a translucent domed
// bell marked with radial stripes and a dark scalloped margin, a frilly ruffled
// column of oral arms, and a long curtain of fine tentacles streaming below and
// swaying on a slow continuous current. There is NO contraction pulse — the
// jellies simply sink and drift, trailing their arms, looping with no reset.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_driftSpeed;    // drift + sway speed                (default 0.6)
uniform float u_bellSize;      // bell radius in CSS px             (default 150)
uniform float u_count;         // how many jellyfish, 1..6          (default 3)
uniform float u_brightness;    // overall emission                  (default 1.3)
uniform float u_tentacleFlow;  // tentacle / oral-arm sway amount   (default 0.6)
uniform float u_glow;          // colored water atmosphere fill     (default 0.8)
uniform float u_colorSpread;   // jelly-to-jelly hue variety        (default 0.85)
uniform float u_saturation;    // jelly colour vividness            (default 1.2)
uniform float u_stripes;       // radial bell-stripe density        (default 14)
uniform float u_tentacles;     // tentacle curtain density          (default 16)

const vec3  BG  = vec3(0.02, 0.03, 0.06); // deep-water base
const int   NJ  = 6;                       // max jellies (count-gated)
const float PI  = 3.14159265;

vec3 P0, P1, P2, P3;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(11.0, 7.0); a *= 0.5; }
  return s;
}
// blend two adjacent palette entries on a 0..4 wheel
vec3 paletteMix(float s) {
  s = fract(s) * 4.0;
  float i = floor(s), f = s - i;
  vec3 a = P0, b = P1;
  if (i > 2.5)      { a = P3; b = P0; }
  else if (i > 1.5) { a = P2; b = P3; }
  else if (i > 0.5) { a = P1; b = P2; }
  return mix(a, b, f);
}

void main() {
  float pr = u_pixelRatio;
  vec2  fc = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t  = u_time * max(u_driftSpeed, 0.0);
  float vy = fc.y / max(res.y, 1.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  P0 = c0; P1 = c1; P2 = c2; P3 = c3;

  // --- deep water + slow drifting colored atmosphere (brighter near surface) ---
  vec3 col = BG;
  vec3 atm = mix(P0, P2, 0.5 + 0.4 * sin(fc.x / res.x * 2.4 + t * 0.12));
  float colm = 0.5 + 0.5 * sin(fc.x / res.x * 7.0 + t * 0.1);   // god-ray banding
  col += atm * u_glow * (0.06 + 0.05 * colm) * (0.3 + 0.85 * vy);

  float bellR   = max(u_bellSize, 1.0) * pr;
  float stripeN = max(u_stripes, 1.0);
  float tentN   = max(u_tentacles, 3.0);

  for (int i = 0; i < NJ; i++) {
    float fi = float(i);
    if (fi > u_count - 0.5) continue;

    float depth  = fract(fi * 0.2637 + 0.15);
    float phase  = fi * 2.3993;
    float laneX  = mix(0.16, 0.84, fract(fi * 0.4115 + 0.13));
    float laneY  = mix(0.46, 0.66, fract(fi * 0.5300 + 0.27));
    float rad    = bellR * mix(0.62, 1.12, depth);

    // calm continuous motion: the jellies stay in frame, gently bobbing and
    // drifting sideways on the current (no pulse, no sink-through).
    float cx     = laneX * res.x + sin(t * 0.09 + phase) * rad * 0.7;
    float cy     = laneY * res.y + sin(t * 0.16 + phase * 1.3) * rad * 0.45;
    float vfade  = 1.0;

    // cheap cull: this jelly only touches a column from bell-top to tentacle-tips
    if (abs(fc.x - cx) > rad * 1.7) continue;
    if (fc.y > cy + rad * 1.35) continue;
    if (fc.y < cy - rad * 8.5) continue;

    vec2 b = (fc - vec2(cx, cy)) / rad;     // bell radii; b.y up, apex at +1

    // per-jelly colour
    float hbase = fract(fi * 0.9 + depth * 0.3);
    float hue   = 0.5 + (hbase - 0.5) * u_colorSpread + t * 0.01;
    vec3  tint  = paletteMix(hue);
    float blum  = dot(tint, vec3(0.299, 0.587, 0.114));
    tint = clamp(mix(vec3(blum), tint, u_saturation), 0.0, 1.0);
    float em = mix(0.85, 1.2, depth) * clamp(u_brightness, 0.0, 3.0) * vfade;

    vec3 jc = vec3(0.0);

    // ---- BELL: upper dome with radial stripes + dark scalloped margin --------
    float ny = b.y;                                   // 0 at margin .. 1 at apex
    float bellW = 1.18;
    float hw = bellW * sqrt(max(1.0 - ny * ny, 0.0)); // ellipse half-width
    // scalloped lower margin: the bell bottom is a wavy lobed curve, not a flat cut
    float marg = 0.055 * sin(b.x / max(bellW, 0.1) * PI * (stripeN * 0.5));
    float dome = smoothstep(0.05, -0.02, abs(b.x) - hw)
               * smoothstep(1.04, 0.97, ny)
               * smoothstep(-0.10 + marg, 0.03 + marg, ny);
    float phi = atan(b.x, max(ny, 0.02));             // angle from apex
    float stripe = pow(0.5 + 0.5 * sin(phi * stripeN), 1.6);
    float apex = smoothstep(0.15, 1.0, ny);
    vec3  domeCol = tint * (0.32 + 0.9 * stripe) * (0.55 + 0.6 * apex);
    // bright thin rim along the dome outline
    float rim = smoothstep(0.07, 0.0, abs(abs(b.x) - hw)) * smoothstep(-0.04, 0.12, ny) * step(ny, 1.02);
    // scalloped frilly margin: a lobed bright band riding the lower bell edge
    float lobe = 0.5 + 0.5 * sin(phi * stripeN * 1.4);
    float frill = smoothstep(0.15 + marg, marg, ny) * smoothstep(-0.18 + marg, -0.02 + marg, ny);
    // halo
    float rr = length(vec2(b.x / bellW, ny));
    jc += domeCol * dome * 0.75;
    jc += mix(tint, vec3(1.0), 0.30) * rim * 0.55;
    jc += mix(tint, vec3(1.0), 0.15) * frill * (0.25 + 0.85 * lobe) * 0.7;   // scalloped frill
    jc += tint * exp(-rr * rr * 1.3) * 0.12 * smoothstep(-0.25, 0.1, ny);

    // ---- ORAL ARMS: frilly ruffled pale column hanging below the bell --------
    float armY = -b.y;                                 // 0 at margin, grows downward
    if (armY > -0.05 && armY < 2.3) {
      float aw  = max(0.92 * smoothstep(2.3, 0.0, armY) * (0.55 + 0.45 * sin(armY * 4.0 - t * 0.5)), 0.05);
      float ruf = fbm(vec2(b.x * 3.5 + sin(armY * 5.0 + t * 0.4) * 0.3, armY * 3.2 - t * 0.25));
      float arm = smoothstep(aw, aw * 0.1, abs(b.x))
                * smoothstep(2.3, 0.1, armY) * smoothstep(-0.05, 0.30, armY);
      arm *= 0.35 + 1.0 * ruf;                         // lacy texture
      jc += mix(tint, vec3(1.0), 0.55) * arm * 0.42;
    }

    // ---- TENTACLES: long fine curtain streaming below, swaying continuously --
    float td = armY;                                   // depth below margin (down +)
    if (td > 0.0 && td < 8.5) {
      float spacing = 2.0 * bellW / tentN;
      float strand  = floor(b.x / spacing + 0.5);
      float sx      = strand * spacing + (hash21(vec2(strand, fi)) - 0.5) * spacing * 0.35;
      if (abs(sx) < bellW * 1.06) {
        float h    = hash21(vec2(strand + 7.0, fi));
        float len  = 4.5 + 3.5 * h;                    // per-strand length (radii)
        float sway = u_tentacleFlow * sin(td * 1.15 - t * 1.1 + strand * 0.7 + phase);
        float cxs  = sx + sway * (0.10 + 0.14 * td);   // curve grows with depth
        float dxt  = b.x - cxs;
        float thick = 0.009 + 0.005 * h;
        float line = exp(-dxt * dxt / (thick * thick));
        float taper = smoothstep(len, len * 0.2, td) * smoothstep(0.0, 0.18, td);
        jc += tint * line * taper * 0.36;
      }
    }

    col += jc * em;
  }

  // vignette + soft tonemap
  vec2 uv = (fc - res * 0.5) / res;
  col *= mix(0.78, 1.0, 1.0 - smoothstep(0.45, 0.95, length(uv)));
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
