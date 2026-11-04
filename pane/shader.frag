// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Rain on a night window at dusk. Beyond the glass a city sits out of focus:
// a skyline against the last indigo light, windows, street lamps and slow car
// lights opened into seven sided aperture discs. On the glass, beads of rain
// each hold a sharp inverted miniature of the city, runnels slip down along
// meandering paths leaving clear wet streaks and stranded droplets through
// the condensation, and a painted mullion frames the right third.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rain;    // drop density and runnel speed            (default 1.0)
uniform float u_blur;    // defocus of the city beyond the glass      (default 1.0)
uniform float u_glow;    // brightness of the city lights             (default 1.0)

const float TAU = 6.2831853;
const float MX  = 0.33;      // mullion centre, frame units
const float MW  = 0.034;     // mullion half width

vec3 c0, c1, c2, c3;
float gT;

float hq(vec2 p) {
  return fract(sin(dot(p, vec2(57.913, 213.47))) * 41729.37);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hq(i), hq(i + vec2(1.0, 0.0)), f.x),
             mix(hq(i + vec2(0.0, 1.0)), hq(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(0.79, 0.61, -0.61, 0.79) * p * 2.11 + vec2(3.7, 1.2);
    a *= 0.5;
  }
  return s;
}

// seven blade aperture, 1.0 on the outline
float hept(vec2 q) {
  float seg = TAU / 7.0;
  float a = atan(q.y, q.x) + 0.35;
  float m = mod(a, seg) - seg * 0.5;
  return length(q) * cos(m) / cos(seg * 0.5);
}

// skyline height at x: a near row of blocks and a taller far row
float skyline(vec2 p, float soft) {
  float x = p.x;
  float b1 = floor(x / 0.085 + 0.3);
  float h1 = -0.16 + 0.17 * hq(vec2(b1, 2.0)) * hq(vec2(b1, 5.0) ) + 0.05 * hq(vec2(b1, 9.0));
  float b2 = floor(x / 0.05 + 7.1);
  float h2 = -0.08 + 0.2 * pow(hq(vec2(b2, 4.0)), 3.0);
  // a slim tower left of the mullion with a stepped crown
  float tw = 1.0 - smoothstep(0.018, 0.024 + soft, abs(x + 0.24));
  float tw2 = 1.0 - smoothstep(0.008, 0.012 + soft, abs(x + 0.24));
  float h = max(max(h1, h2), max(0.2 * tw, 0.27 * tw2));
  return h;
}

// city lights: one layer of out of focus discs
vec3 bokeh(vec2 p, float cs, float seed, float b, float dens) {
  vec3 acc = vec3(0.0);
  vec2 id = floor(p / cs);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = id + vec2(float(i), float(j));
      float h = hq(cid + seed);
      vec2 c = (cid + 0.5 + (vec2(hq(cid + seed + 3.1), hq(cid + seed + 7.7)) - 0.5) * 0.8) * cs;
      float top = skyline(c, 0.0) + 0.01;
      if (h < dens && c.y < top) {
        float hs = hq(cid + seed + 11.3);
        float r = cs * (0.2 + 0.3 * hs) * mix(0.16, 1.0, b);
        float d = hept((p - c) / r);
        float e = mix(0.5, 0.07, clamp(b, 0.0, 1.0));
        float disc = 1.0 - smoothstep(1.0 - e, 1.0 + e * 0.5, d);
        float ring = smoothstep(0.55, 0.98, d) * disc;
        float hc = hq(cid + seed + 17.9);
        vec3 col = hc < 0.42 ? c2 : (hc < 0.68 ? c1 : (hc < 0.88 ? c0 : mix(c2, vec3(1.0, 0.95, 0.88), 0.55)));
        float amp = mix(3.0, 0.85, clamp(b, 0.0, 1.0)) * (0.35 + 0.65 * hs);
        amp *= 0.82 + 0.18 * sin(gT * (0.2 + hs * 0.4) + h * 40.0);
        // lights low in the frame are warmer street level, higher are windows
        acc += col * col * (disc * 0.7 + ring * 0.7) * amp * 1.3;
      }
    }
  }
  return acc;
}

// the city beyond the glass, b is the defocus amount 0 sharp .. 1 soft
vec3 city(vec2 p, float b) {
  float soft = 0.004 + 0.05 * b;
  // dusk sky, indigo high, mauve and peach haze over the roofs
  float y = p.y;
  vec3 col = mix(c1 * 0.2 + c0 * 0.06, c1 * 0.2 + c0 * 0.1, smoothstep(-0.1, 0.06, y));
  col = mix(col, c0 * 0.17, smoothstep(0.02, 0.22, y));
  // a thin band of peach sodium glow sitting on the roofs
  col += c2 * c2 * 0.35 * exp(-abs(y + 0.04) * 22.0);
  col = mix(col, c3 * 0.13 + c0 * 0.03, smoothstep(0.2, 0.55, y));
  // low rain cloud underlit by the city, drifting
  float cl = fbm(vec2(p.x * 1.3 - gT * 0.012, y * 3.2 + 2.0));
  col += (c1 * 0.09 + c0 * 0.06) * smoothstep(0.4, 0.75, cl) * smoothstep(0.05, 0.3, y) * (1.2 - y);

  float sk = skyline(p, soft);
  float bld = 1.0 - smoothstep(sk - soft, sk + soft, y);
  vec3 wall = c3 * 0.05 + c0 * 0.012;
  // lit office windows, their pattern melting into a glow as focus softens
  vec2 wc = vec2(p.x / 0.011, p.y / 0.016);
  vec2 wi = floor(wc);
  vec2 wf = fract(wc) - 0.5;
  float wl = step(0.72, hq(wi + 41.0)) * (1.0 - smoothstep(0.25, 0.4, max(abs(wf.x), abs(wf.y) * 0.8)));
  vec3 wcol = mix(c2, c1, step(0.6, hq(wi + 43.0)));
  float bw = clamp(b * 1.6, 0.0, 1.0);
  wall += wcol * mix(wl * 0.7, 0.07, bw) * smoothstep(sk - 0.01, sk - 0.03, y);
  col = mix(col, wall, bld);
  // aviation light on the tower
  vec2 tl = p - vec2(-0.24, 0.28);
  float blink = 0.5 + 0.5 * sin(gT * 1.1);
  col += c1 * 0.9 * blink * exp(-dot(tl, tl) / (0.00003 + 0.0004 * b * b));

  // the street: a wet road band with lamps and car lights
  float road = smoothstep(-0.27, -0.33, y);
  col = mix(col, c3 * 0.03 + c1 * 0.025, road);

  float g = clamp(u_glow, 0.3, 2.0);
  vec3 L = vec3(0.0);
  L += bokeh(p, 0.16, 1.7, b, 0.45);
  L += bokeh(p + vec2(0.05, 0.02), 0.095, 9.3, b, 0.4) * 0.75;
  L += bokeh(p + vec2(0.02, 0.06), 0.055, 23.1, b, 0.35) * 0.55;

  // cars crossing at street level, head and tail lights
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float dir = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
    float sp = 0.035 + 0.02 * hq(vec2(fk, 31.0));
    float cx = (fract(hq(vec2(fk, 37.0)) + gT * sp) * 2.8 - 1.4) * dir;
    float cy = -0.3 + 0.025 * dir;
    vec3 cc = dir > 0.0 ? mix(c2, vec3(1.0, 0.95, 0.85), 0.4) : c1 * 1.2;
    float r = 0.02 * mix(0.2, 1.0, b);
    for (int m = 0; m < 2; m++) {
      vec2 q = (p - vec2(cx + float(m) * 0.03, cy)) / r;
      float d = hept(q);
      float e = mix(0.5, 0.07, clamp(b, 0.0, 1.0));
      L += cc * (1.0 - smoothstep(1.0 - e, 1.0 + e * 0.5, d)) * mix(2.0, 0.6, b);
    }
  }
  // glow pooled in the road under the lights
  col += (c2 * 0.08 + c1 * 0.04) * road * (0.6 + 0.4 * vn(vec2(p.x * 6.0, 1.0)));
  col += L * g * 0.55;
  return col;
}

// drop accumulator
vec2 gN;     // drop normal xy
float gCov;  // drop coverage 0..1
float gH;    // drop height at the pixel
float gR;    // drop radius
float gWet;  // wet streak, clears the mist

void bead(vec2 q, float r) {
  float d2 = dot(q, q);
  if (d2 < 1.0) {
    float hgt = sqrt(1.0 - d2);
    float a = smoothstep(1.0, 0.9, d2);
    // where beads overlap, the taller water surface wins
    if (hgt * r > gH * gR) {
      gN = q; gH = hgt; gCov = a; gR = r;
    }
  }
}

// beads resting on the glass, landing and drying on their own clocks
void beads(vec2 p, float cs, float seed, float dens) {
  vec2 g = p / cs;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hq(id + seed);
  if (h > dens) return;
  float ph = fract(gT * (0.025 + 0.02 * hq(id + seed + 2.0)) + h * 9.0);
  float life = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.6, 1.0, ph));
  float rr = (0.14 + 0.24 * hq(id + seed + 5.0)) * (0.5 + 0.5 * life);
  vec2 c = (vec2(hq(id + seed + 7.0), hq(id + seed + 8.0)) - 0.5) * (0.9 - 2.0 * rr);
  vec2 q = (f - c) / rr;
  // sag under their own weight, and a wobbly outline
  q.y *= q.y > 0.0 ? 1.18 : 0.94;
  float an = atan(q.y, q.x);
  q *= 1.0 + 0.07 * sin(an * 3.0 + h * 20.0) + 0.04 * sin(an * 5.0 + h * 7.0);
  if (life > 0.02) bead(q, rr * cs);
}

// runnels: a fat drop slips down a fixed meandering path in each lane
void runnels(vec2 p, float rain) {
  float cw = 0.13;
  float lane = floor(p.x / cw + 0.5);
  for (int k = -1; k <= 1; k++) {
    float ln = lane + float(k);
    float h = hq(vec2(ln, 71.0));
    if (h > 0.25 + 0.4 * rain) continue;
    float sp = (0.045 + 0.05 * hq(vec2(ln, 73.0))) * (0.4 + 0.6 * rain);
    float fr = fract(gT * sp + h * 13.0);
    float yh = 0.72 - (fr + 0.02 * sin(fr * 37.0)) * 1.6;
    float pathX = ln * cw + 0.03 * sin(p.y * 7.0 + h * 6.0) + 0.012 * sin(p.y * 19.0 + h * 2.0);
    float dx = p.x - pathX;
    if (abs(dx) > 0.06) continue;
    float fade = 1.0 - smoothstep(0.7, 0.95, fr);
    // head drop, its tail drawn upward
    float rh = 0.021 + 0.012 * hq(vec2(ln, 79.0));
    vec2 q = vec2(dx, p.y - yh) / rh;
    q.y *= q.y > 0.0 ? 0.62 : 1.05;
    bead(q, rh);
    // wet streak and stranded droplets above the head
    float dy = p.y - yh;
    if (dy > 0.0) {
      float wv = 0.011 * (1.0 - smoothstep(0.0, 0.7, dy)) + 0.003;
      float st = (1.0 - smoothstep(wv * 0.6, wv, abs(dx))) * exp(-dy * 1.6) * fade;
      gWet = max(gWet, st);
      float tc = 0.028;
      float tid = floor(p.y / tc);
      float th = hq(vec2(ln * 3.1, tid));
      float ty = (tid + 0.5) * tc;
      if (th < 0.55 && ty > yh + 0.03) {
        float tr = (0.0035 + 0.005 * hq(vec2(ln, tid + 0.5))) * fade * exp(-(ty - yh) * 1.2);
        vec2 tq = vec2(dx - (th - 0.27) * 0.01, p.y - ty) / max(tr, 1e-4);
        if (tr > 0.0015) bead(tq, tr);
      }
    }
  }
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  gT = u_time;
  float rain = clamp(u_rain, 0.2, 2.0);
  float blur = clamp(u_blur, 0.2, 1.6);

  // drops on the glass
  gN = vec2(0.0); gCov = 0.0; gH = 0.0; gR = 0.0; gWet = 0.0;
  runnels(p, rain);
  beads(p, 0.06, 3.0, 0.22 * rain);
  beads(p + vec2(0.017, 0.031), 0.034, 13.0, 0.3 * rain);
  beads(p + vec2(0.009, 0.004), 0.019, 29.0, 0.22 * rain);

  // each drop is a little fisheye: it shows the city inverted and sharper,
  // squeezed toward the lit street band behind it
  vec2 bp = p;
  float bb = blur;
  if (gCov > 0.0) {
    bp = vec2(p.x - gN.x * 0.12, mix(p.y, -0.15, 0.55) - gN.y * 0.11);
    bb = 0.25 + blur * 0.12;
  }
  vec3 col = city(bp, bb);

  // condensation mist over the lower glass, cleared by water
  float mist = (0.35 + 0.65 * smoothstep(0.45, -0.5, p.y)) * (0.5 + 0.5 * fbm(p * 7.0 + 3.0));
  mist *= (1.0 - gWet) * (1.0 - gCov);
  vec3 haze = c1 * 0.08 + c0 * 0.05 + c2 * 0.02;
  col = mix(col, col * 0.5 + haze, mist * 0.75);
  // clear water in the streaks shows the lights crisper, edges catch light
  col *= 1.0 + 0.3 * gWet;
  col += (c2 * 0.05 + c0 * 0.03) * smoothstep(0.1, 0.5, gWet) * (1.0 - smoothstep(0.6, 0.95, gWet));

  if (gCov > 0.0) {
    // dark rim where the lens bends light out of view, bright lower lip
    float rim = smoothstep(0.0, 0.5, gH);
    vec3 dc = col * (0.2 + 1.1 * rim);
    float lip = smoothstep(0.35, 0.95, -gN.y) * (1.0 - smoothstep(0.0, 0.45, gH));
    dc += (c2 * 0.5 + c1 * 0.2) * lip * 0.5;
    // highlight from the street lamp up to the left
    vec3 n3 = normalize(vec3(gN, gH + 0.25));
    vec3 hv = normalize(vec3(-0.45, 0.55, 1.0) + vec3(0.0, 0.0, 1.0));
    float sp = pow(max(dot(n3, hv), 0.0), 60.0);
    dc += mix(c2, vec3(1.0), 0.5) * sp * 0.8;
    col = mix(col, dc, gCov);
  }

  // painted transom low across the pane, top bevel lit, drops pooled on it
  float tv = (p.y + 0.4) / 0.03;
  float tm = 1.0 - smoothstep(0.95, 1.05, abs(tv));
  if (tm > 0.0) {
    float tg = fbm(vec2(p.x * 50.0, tv * 2.0));
    vec3 tc = c3 * (0.06 + 0.05 * tg) + c0 * 0.015;
    float topB = smoothstep(0.45, 0.95, tv);
    tc += (c1 * 0.26 + c2 * 0.2) * topB * (0.5 + 0.5 * vn(vec2(p.x * 9.0, 2.0)));
    // beads of condensation along the top edge, each catching a point of light
    float bx = fract(p.x / 0.021 + 0.5 * hq(vec2(floor(p.x / 0.021), 5.0))) - 0.5;
    float bead2 = (1.0 - smoothstep(0.18, 0.32, length(vec2(bx, (tv - 0.82) * 0.9))))
                * step(0.4, hq(vec2(floor(p.x / 0.021), 9.0)));
    tc = mix(tc, c3 * 0.03, bead2 * 0.6);
    tc += mix(c2, vec3(1.0), 0.4) * bead2 * smoothstep(0.1, -0.1, bx) * smoothstep(0.75, 0.95, tv) * 0.6;
    float under = smoothstep(-0.5, -0.95, tv);
    tc *= 1.0 - 0.5 * under;
    float teu = (tv - 0.97) * 12.0;
    tc += c2 * 0.3 * exp(-teu * teu);
    col = mix(col, tc, tm);
  }
  // a soft putty shadow just above and below the transom
  col *= 1.0 - 0.45 * exp(-max(abs(tv) - 1.0, 0.0) * 2.5) * step(1.0, abs(tv));

  // painted mullion on the right third, bevelled, catching city light
  float u = (p.x - MX) / MW;
  float m = 1.0 - smoothstep(0.96, 1.04, abs(u));
  if (m > 0.0) {
    float bev = smoothstep(0.55, 1.0, abs(u));
    float face = sign(u);
    float grainV = fbm(vec2(u * 3.0, p.y * 60.0)) ;
    float chip = smoothstep(0.62, 0.7, fbm(vec2(u * 2.0, p.y * 14.0 + 4.0)));
    vec3 mc = c3 * (0.06 + 0.06 * grainV) + c0 * 0.015;
    // left bevel faces the cool city, right bevel the warm lamps
    mc += c0 * 0.3 * bev * step(face, 0.0) * (0.6 + 0.4 * smoothstep(-0.5, 0.2, p.y));
    mc += c2 * c2 * 0.45 * bev * step(0.0, face) * (0.4 + 0.6 * smoothstep(0.5, -0.4, p.y));
    mc += c1 * 0.05 * chip;
    float eu = (abs(u) - 0.97) * 14.0;
    float edgeL = exp(-eu * eu);
    mc += mix(c0, c2, step(0.0, face)) * edgeL * 0.4;
    col = mix(col, mc, m);
  }

  gl_FragColor = vec4(col, 1.0);
}
