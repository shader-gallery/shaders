// wisp (Bloom) — a dense swarm of pale teardrop flames drifting over dark marsh
// water. Rendered as a jittered grid of cells (3x3 neighbourhood per pixel) so the
// count scales to a frame-filling field of will-o'-the-wisps. Each flame is a
// vertical SDF teardrop softened by FBM interior flicker that gutters like a flame
// in wind, drifts slowly within its cell on incommensurate sines, and drags a
// short tapering tail. Cool palette tints, each a little different. A barely-there
// mist band breathes along the bottom edge. All motion loops with no reset.
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
uniform float u_wanderSpeed;  // drift speed of each flame within its cell (default 0.4)
uniform float u_flameSize;    // teardrop height, css px                   (default 64)
uniform float u_count;        // flames across the frame (field density)   (default 9)
uniform float u_flicker;      // FBM interior flicker amplitude            (default 0.8)
uniform float u_glow;         // breathing marsh-gas atmosphere fill       (default 0.7)
uniform float u_colorSpread;  // per-flame hue variety across the palette   (default 0.68)
uniform float u_brightness;   // overall flame emission multiplier         (default 1.0)
uniform float u_saturation;   // flame colour vividness                    (default 1.25)

const vec3  BG = vec3(0.026, 0.028, 0.036); // near-black marsh base
const float TWO_PI = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return s;
}

// teardrop flame field: rounded bulb at the bottom tapering to a tip at the top.
// p is flame-local (y up, ~1.0 == one flame height). wob widens/narrows for flicker.
float teardrop(vec2 p, float wob) {
  float y = p.y;
  float h = clamp((y + 0.5), 0.0, 1.0);
  float w = pow(1.0 - h, 0.85) * sqrt(clamp(h * 4.0, 0.0, 1.0)) * 0.34;
  w *= 1.0 + wob;
  w = max(w, 0.010);
  float baseRound = 1.0 - smoothstep(0.0, 0.14, -p.y - 0.36);
  float d = abs(p.x) / w;
  float body = (1.0 - smoothstep(0.55, 1.05, d)) * baseRound;
  body *= (1.0 - smoothstep(0.40, 0.55, y));
  return body;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float across  = clamp(u_count, 3.0, 20.0);
  float cell    = res.x / across;                  // square cell in device px
  float flameH  = max(u_flameSize, 4.0) * pr;      // constant physical size
  float ds      = t * (0.10 + u_wanderSpeed * 0.55);

  vec2 g = fc / cell;
  vec2 base = floor(g);

  vec3 col = BG;

  // breathing marsh-gas atmosphere: a low-freq colour field so the frame is
  // never dead black between flames. Brighter low (over the water), drifting.
  float yb0 = fc.y / res.y;
  float marsh = 1.0 - smoothstep(0.0, 1.05, yb0);
  vec2  hp = fc / res * vec2(3.0, 2.2) + vec2(t * 0.03, t * 0.05);
  float hz = fbm(hp);
  vec3  atmCol = mix(c0, c2, 0.5 + 0.4 * sin(t * 0.11 + fc.x / res.x * 3.0));
  atmCol = mix(atmCol, c1, 0.25 * hz);
  col += atmCol * u_glow * (0.05 + 0.13 * hz) * (0.45 + 0.75 * marsh);

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cid = base + vec2(float(dx), float(dy));
      float h0 = hash21(cid + 0.5);
      float h1 = hash21(cid + 9.1);
      float h2 = hash21(cid + 17.7);
      float h3 = hash21(cid + 23.3);

      // flame drifts slowly within (and a little beyond) its cell
      vec2 drift = vec2(sin(ds * 0.7 + h0 * TWO_PI) * 0.55 + sin(ds * 0.29 + h1 * TWO_PI) * 0.22,
                        cos(ds * 0.6 + h2 * TWO_PI) * 0.45 + sin(ds * 0.21 + h3 * TWO_PI) * 0.18);
      // static per-cell jitter (break the grid) + slow drift
      vec2 center = (cid + vec2(0.5)) * cell
                  + (vec2(h2, h3) - 0.5) * cell * 0.8
                  + drift * cell * 0.55;

      float fh = flameH * (0.6 + 0.95 * h1);         // per-flame size variation
      vec2 local = (fc - center) / fh;
      if (dot(local, local) > 5.0) continue;          // cheap bound (halo fits 3x3)

      // per-flame tint across the FULL palette (varied, not just cool); spread
      // controls how far apart the flame hues range.
      float hue = mod((0.5 + (fract(h0 * 3.1 + h1 * 0.7) - 0.5) * u_colorSpread) * 4.0, 4.0);
      float w0 = wheelW(hue,0.0), w1 = wheelW(hue,1.0), w2 = wheelW(hue,2.0), w3 = wheelW(hue,3.0);
      vec3 tint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
      float tlum = dot(tint, vec3(0.299, 0.587, 0.114));
      tint = clamp(mix(vec3(tlum), tint, u_saturation), 0.0, 1.0);  // vividness

      // guttering flicker
      vec2 fcoord = local * vec2(3.2, 2.4) + vec2(h0 * 30.0, -t * (2.2 + u_flicker * 2.4));
      float fb  = fbm(fcoord);
      float fb2 = fbm(fcoord * 1.9 + vec2(3.0, -t * (1.0 + u_flicker)));
      float lick = (fb - 0.5) * u_flicker * 0.42 * clamp(local.y + 0.5, 0.0, 1.2);
      vec2 flLocal = local; flLocal.x -= lick;
      float wob = (fb2 - 0.5) * (0.16 + u_flicker * 0.85);
      float body = teardrop(flLocal, wob);
      float interior = mix(1.0, (0.58 + 0.42 * fb) * (1.0 - u_flicker * 0.45 * (0.5 - fb2)),
                           clamp(u_flicker * 0.7, 0.0, 1.0));
      body *= max(interior, 0.0);

      float swell = 0.6 + 0.4 * sin(t * (0.5 + h3) + h0 * TWO_PI);

      // hot core in the bulb + broad soft halo (the glowing-orb read)
      vec2 cc = local - vec2(0.0, -0.22);
      float core = exp(-dot(cc, cc) * 11.0);
      vec2 hc = local * vec2(1.2, 0.95) - vec2(0.0, -0.05);
      float halo = exp(-dot(hc, hc) * 2.1);

      // short tapering tail below the bulb (cheap; no path resample)
      float tailLen = 1.16;                           // fixed (param removed)
      float ty = (-local.y - 0.3) / tailLen;          // 0 at base .. 1 at tail end
      float tail = smoothstep(0.0, 0.06, ty) * (1.0 - smoothstep(0.0, 1.0, ty));
      tail *= exp(-local.x * local.x / 0.012);
      float bead = 0.5 + 0.5 * sin(ty * 9.0 - t * 2.0 + h0 * TWO_PI);

      vec3 em = vec3(0.0);
      em += tint * body * 2.0 * swell;
      em += mix(tint, vec3(1.0), 0.55) * body * core * 1.5 * swell;
      em += tint * halo * 0.55 * swell;
      em += tint * tail * bead * 0.20 * swell;     // faint path trace, not a streak
      col += em * u_brightness;
    }
  }

  // barely-there mist band along the bottom edge
  float yb = fc.y / res.y;
  float mistBand = (1.0 - smoothstep(0.0, 0.22, yb));
  float mistTex = fbm(vec2(fc.x / res.x * 5.0, t * 0.06)) * 0.6 + 0.4;
  col += mix(c2, c0, 0.5) * 0.10 * mistBand * mistTex * (0.6 + 0.4 * sin(t * 0.23));

  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.74, 1.0, vign);
  col = col / (1.0 + col * 0.55);

  gl_FragColor = vec4(col, 1.0);
}
