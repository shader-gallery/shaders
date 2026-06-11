// brae (Sough) — a near-black hillside climbs diagonally across the frame
// under a thin moonglow band that hugs the slope. The crest is a dense fringe
// of grass-blade silhouettes; episodic gust fronts run the edge as a traveling
// seam of rim-light, tips bowing into the glow and ringing back to dark behind
// the front. Between gusts the crest is a still torn-paper silhouette and the
// band breathes almost imperceptibly. The hill interior stays empty and dark.
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
uniform float u_gustRate;     // how often gust fronts run the crest   (default 0.45)
uniform float u_fringeHeight; // blade fringe length, css px, *u_pixelRatio in code (default 28)
uniform float u_bend;         // tip bow distance + rim-light strength (default 1)
uniform float u_moonGlow;     // brightness of the sky band            (default 0.8)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // house near-black
const float SPACING_CSS = 2.6;   // blade root spacing along the crest, css px
const float RING1_CSS   = 185.0; // primary gust ripple length, css px
const float RING2_CSS   = 130.0; // secondary gust ripple length, css px
const float BAND_CSS    = 70.0;  // moonglow band thickness hugging the slope
const float HALO_CSS    = 240.0; // wide faint halo above the band

float hash11(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
float hash12(vec2 p)  { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// 1d value noise for the torn thicket silhouette along the crest
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));
}

// crest height (device px) at device x: a hillside climbing left to right,
// with gentle organic undulation so the edge reads as ground, not a ruler
float crestY(float x) {
  float xc = x / u_pixelRatio;
  float y  = u_resolution.y * (0.30 + 0.26 * x / u_resolution.x);
  y += u_pixelRatio * (6.0 * sin(xc * 0.012 + 1.0)
                     + 3.4 * sin(xc * 0.029 + 4.2)
                     + 1.7 * sin(xc * 0.063 + 2.0));
  return y;
}

// damped bow-and-spring-back behind a traveling front; v = distance behind
// the front in ripple lengths. First lobe is the big bow, later lobes are the
// overshoot ringing back toward rest. Zero ahead of the front.
float ringResp(float v) {
  return exp(-v * 2.3) * sin(v * 8.0) * smoothstep(0.0, 0.05, v);
}

// signed gust excitation at css position xc (first-lobe peak about +0.7).
// Staggered fronts sweep well past both edges before wrapping, so the phase
// wrap happens entirely off-screen and the loop never visibly resets. A third
// front fades in at high gust rates, and the ambient whisper between gusts
// grows with the rate so a windier field never fully settles.
float gustField(float xc) {
  float Wc  = u_resolution.x / max(u_pixelRatio, 0.001);
  float cyc = u_gustRate * 0.1429; // cycles per second (rate / 7)
  float f1  = (fract(u_time * cyc + 0.321) * 2.6 - 0.15) * Wc;
  float f2  = (fract(u_time * cyc * 0.83 + 0.77) * 2.6 - 0.15) * Wc;
  float f3  = (fract(u_time * cyc * 1.27 + 0.802) * 2.6 - 0.15) * Wc;
  float b   = ringResp((f1 - xc) / RING1_CSS);
  b += 0.65 * ringResp((f2 - xc) / RING2_CSS);
  b += 0.45 * smoothstep(0.6, 1.4, u_gustRate) * ringResp((f3 - xc) / RING2_CSS);
  b += (0.030 + 0.050 * u_gustRate) * sin(u_time * 0.6 + xc * 0.05);
  return b;
}

// smooth lobe-free energy envelope trailing each front: a wide, soft swell of
// disturbed air used to let the moonglow band breathe around a passing gust
float frontEnv(float v) { return exp(-v * 1.1) * smoothstep(0.0, 0.25, v); }
float gustEnv(float xc) {
  float Wc  = u_resolution.x / max(u_pixelRatio, 0.001);
  float cyc = u_gustRate * 0.1429;
  float f1  = (fract(u_time * cyc + 0.321) * 2.6 - 0.15) * Wc;
  float f2  = (fract(u_time * cyc * 0.83 + 0.77) * 2.6 - 0.15) * Wc;
  float f3  = (fract(u_time * cyc * 1.27 + 0.802) * 2.6 - 0.15) * Wc;
  float e = frontEnv((f1 - xc) / (RING1_CSS * 2.2));
  e += 0.65 * frontEnv((f2 - xc) / (RING2_CSS * 2.2));
  e += 0.45 * smoothstep(0.6, 1.4, u_gustRate) * frontEnv((f3 - xc) / (RING2_CSS * 2.2));
  return e;
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // Theme colours come from u_palette. Some headless poster contexts can not
  // bind a vec3[] uniform, leaving it all-zero; fall back to midnight hues.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float fHc   = max(u_fringeHeight, 2.0); // css fringe height (guards 0)
  float fH    = fHc * pr;                 // device px
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cellW = SPACING_CSS * refScale * pr;

  float yC = crestY(fc.x);
  float d  = fc.y - yC;  // device px above the local crest line
  float dc = d / pr;     // css px above the crest

  // gust excitation under this column (shared by bloom, thicket and blades)
  float gE  = gustField(fc.x / pr);
  float bnE = abs(gE) * u_bend;

  // ---- sky: very dark, carrying only a low moonglow band on the slope ----
  float breathe = 0.88 + 0.12 * sin(t * 0.31 + 1.0);
  float dcp  = max(dc, 0.0);
  float band = exp(-dcp / BAND_CSS);
  float halo = exp(-dcp / HALO_CSS);
  vec3  bandMix = mix(c0, c1, 0.5 + 0.5 * sin(fc.x / pr * 0.0021 + t * 0.045));
  // the passing front stirs the air and the band catches it: a wide soft
  // swell of moonglow rides with each gust and fades in the becalmed stretches
  float scatter = smoothstep(0.10, 0.75, gustEnv(fc.x / pr) * u_bend);
  vec3  sky = BG * 0.92 + bandMix * (band * 0.40 + halo * 0.10)
            * u_moonGlow * breathe * (1.0 + 0.40 * scatter);

  // faint atmospheric bloom kissing the seam where tips are catching light;
  // ceilinged just above the fringe so the open sky never picks up shafts
  vec3  seamGlow = mix(c2, c3, smoothstep(0.60, 1.15, bnE));
  float bloomCap = 1.0 - smoothstep(fHc * 0.9, fHc * 1.8, dcp);
  sky += seamGlow * (smoothstep(0.15, 0.75, bnE) * exp(-dcp / 22.0) * bloomCap * 0.12);

  // ---- hill mass: near-black, a held breath beneath the active edge ----
  vec3 hill = vec3(0.010, 0.011, 0.015);
  hill += bandMix * 0.05 * u_moonGlow * exp(min(dc, 0.0) / 7.0); // faint crest kiss
  hill *= 1.0 - 0.35 * clamp(-dc / (res.y / pr * 0.8), 0.0, 1.0);

  float hillM = 1.0 - smoothstep(-0.8 * pr, 0.8 * pr, d);
  vec3  col   = mix(sky, hill, hillM);

  // ---- the blade fringe: all the action lives on this one boundary ----
  float aTot = 0.0;
  vec3  rim  = vec3(0.0);
  if (d > -9.0 * pr && d < fH + 10.0 * pr) {
    // rough inverse of the bend so a small root neighbourhood is enough
    float qn   = clamp(d / (0.86 * fH), 0.0, 1.0);
    float amp  = 0.55 * fHc * u_bend;                  // tip travel scale, css
    float offA = gE * amp * qn * qn;                   // css estimate
    float cell = floor((fc.x - offA * pr) / cellW);

    // dense torn thicket along the crest base, swaying gently with the field
    float xt = fc.x / pr - offA * 0.5;
    float th = fHc * (0.10 + 0.50 * (0.55 * vnoise(xt * 0.55)
                                   + 0.33 * vnoise(xt * 1.7 + 13.7)
                                   + 0.12 * vnoise(xt * 5.1 + 71.3)));
    float aTh = 1.0 - smoothstep(th - 1.2, th + 1.2, dc);
    aTot = max(aTot, aTh);
    // a whisper of edge light on the thicket only while the field is bent
    rim += seamGlow * (exp(-abs(dc - th) / 1.4) * smoothstep(0.10, 0.60, bnE) * 0.10);

    for (int k = -5; k <= 5; k++) {
      float i  = cell + float(k);
      float hA = hash11(i);          // root jitter
      float hB = hash11(i + 57.1);   // blade length
      float hC = hash11(i + 113.7);  // static lean
      float hD = hash11(i + 211.3);  // stiffness
      float hE = hash11(i + 331.9);  // width

      float xr = (i + 0.5 + (hA - 0.5) * 0.7) * cellW; // root x, device px
      float Hi = fH * (0.65 + 0.35 * hB);              // blade length
      float yR = crestY(xr);
      float dL = fc.y - yR;                            // height above this root
      float q  = clamp(dL / Hi, 0.0, 1.1);

      // bend: gust field sampled at the root, tips travel, roots never move
      float g    = gustField(xr / pr) * (0.85 + 0.30 * hD);
      float bow  = g * amp * pr;          // tip offset, device px
      float lean = (hC - 0.5) * 3.0 * pr; // small static individual lean
      float off  = bow * q * q + lean * q;

      float dxB = fc.x - (xr + off);
      float hw  = (0.45 + 0.55 * hE) * pr * mix(1.0, 0.22, q); // tapering blade
      float a   = 1.0 - smoothstep(hw - 0.7 * pr, hw + 0.7 * pr, abs(dxB));
      a *= smoothstep(-1.5 * pr, 0.5 * pr, dL);                // root gate
      a *= 1.0 - smoothstep(Hi - 1.5 * pr, Hi + 0.5 * pr, dL); // tip fade
      aTot = max(aTot, a);

      // rim-light only while bent: the crest sparkles where and while it bends
      float bn   = abs(g) * u_bend;
      float gate = smoothstep(0.05, 0.45, bn);
      float tipW = smoothstep(0.10, 0.65, q);
      vec3  lit  = mix(c2, c3, smoothstep(0.60, 1.15, bn)); // glints flick to c3
      rim += lit * (a * tipW * gate * (0.50 + 0.55 * min(bn, 1.4)));

      // seed-head glint riding the very tip, drooping as the blade bows
      float drop = 0.35 * bow * bow / max(Hi, 1.0);
      vec2  tv   = vec2(fc.x - (xr + bow + lean), fc.y - (yR + Hi - drop));
      float sr   = 2.4 * pr;
      float seed = exp(-dot(tv, tv) / (sr * sr));
      rim += lit * (seed * gate * 0.8);
    }
  }

  vec3 bladeCol = vec3(0.008, 0.009, 0.012); // blades read as silhouette
  col = mix(col, bladeCol, aTot);
  // soft-knee the rim so stacked glints stay hued instead of clipping white
  float rl = max(max(rim.r, rim.g), rim.b);
  col += rim * (0.9 / (1.0 + 0.30 * rl));

  // gentle corner vignette + dither so the band gradients never step
  vec2  ctr = res * 0.5;
  float r   = length((fc - ctr) / res);
  col *= 1.0 - 0.30 * smoothstep(0.38, 0.78, r);
  col += (hash12(fc) - 0.5) * 0.007;

  gl_FragColor = vec4(col, 1.0);
}
