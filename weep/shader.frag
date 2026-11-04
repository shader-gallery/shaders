// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Rain on a night window - beaded drops and slow stick-slip runnels on a misted
// pane, a wet street of lamps and cars far out of focus beyond, an underlit
// cloud deck over the skyline. Each drop is a little lens that pulls a sharp,
// inverted bead of the city through the mist.
precision highp float;

uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, unused
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rain;   // how many drops bead the glass          (default 0.7)
uniform float u_fog;    // condensation mist on the pane           (default 0.55)
uniform float u_blur;   // how far out of focus the city sits      (default 0.6)
uniform float u_flow;   // runnel slide speed                      (default 0.6)

vec3 c0, c1, c2, c3;
vec3 d0, d1, d2, d3;
float gT;

// a deep, saturated version of a pastel theme colour (cube keeps the hue, drops the grey)
vec3 deep(vec3 c){ vec3 k = c * c * c; return k / max(max(k.r, max(k.g, k.b)), 1e-3); }

float h21(vec2 p){
  vec3 q = fract(vec3(p.xyx) * vec3(0.1379, 0.1627, 0.1213));
  q += dot(q, q.yzx + 27.17);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = p * 2.03 + vec2(7.1, 3.7);
    a *= 0.5;
  }
  return v;
}

// soft out-of-focus light: a disc with a brighter rim and a faint core
vec3 bokeh(vec2 p, vec2 c, float sharpR, float b, vec3 tint){
  float rr = sharpR + b;
  float d = length(p - c);
  float disc = smoothstep(rr, rr * 0.82 - 0.001, d);
  float rim = 0.7 + 0.3 * smoothstep(rr * 0.4, rr * 0.95, d);
  float amp = clamp(sharpR * 1.6 / rr, 0.12, 1.0);
  float core = exp(-d * d / max(sharpR * sharpR * 4.0, 1e-6)) * (1.0 - amp);
  return tint * (disc * rim * amp + core * 0.6);
}

// one row of buildings: rgb = window glow, a = silhouette mask
vec4 skyline(vec2 p, float b, float cw, float base, float tall, float seed){
  vec4 acc = vec4(0.0);
  float ci = floor(p.x / cw);
  for (int k = -1; k <= 1; k++){
    float id = ci + float(k);
    float hb = h21(vec2(id, seed));
    float w0 = id * cw + cw * 0.08 * hb;
    float w1 = (id + 1.0) * cw - cw * 0.1 * h21(vec2(id, seed + 3.0));
    float top = base + tall * (0.25 + 0.75 * hb * hb);
    float mx = smoothstep(w0 - b, w0 + b, p.x) * smoothstep(w1 + b, w1 - b, p.x);
    float my = smoothstep(top + b, top - b, p.y);
    float m = mx * my;
    // windows: sharp grid when near focus, an even glow when blurred
    vec2 ws = vec2(cw * 0.16, cw * 0.22);
    vec2 wc = floor(p / ws);
    float lit = step(0.62 + 0.2 * hb, h21(wc + seed * 13.0));
    vec2 wf = fract(p / ws);
    float pane = smoothstep(0.42, 0.3, abs(wf.x - 0.5)) * smoothstep(0.38, 0.26, abs(wf.y - 0.5));
    float sharp = clamp(1.0 - b / 0.018, 0.0, 1.0);
    float glow = mix(0.18 * (0.5 + hb), lit * pane, sharp);
    vec3 wt = mix(c0, c3, h21(vec2(id, seed + 9.0)));
    wt = mix(wt, c2, step(0.85, h21(wc + 2.0)) * sharp);
    acc.rgb += wt * glow * m * smoothstep(top, top - cw * 0.3, p.y);
    acc.a = max(acc.a, m);
  }
  return acc;
}

// the night city beyond the glass, rendered with focus blur b (uv units)
vec3 city(vec2 p, float b){
  float t = gT;
  float hz = -0.06;
  vec2 vp = vec2(0.30, hz);

  // sky: deep blue at the zenith, the city glow pooling lilac-pink at the horizon
  float up = clamp((p.y - hz) / 0.6, 0.0, 1.0);
  vec3 col = mix(d1 * 0.11 + d2 * 0.07, d0 * 0.022 + d1 * 0.008, smoothstep(0.0, 0.75, up));

  // a low cloud deck lit from beneath by the streets
  vec2 cq = vec2(p.x * 1.8 + t * 0.03, p.y * 4.5 - t * 0.008);
  float cl = fbm(cq + 0.4 * vec2(fbm(cq * 1.7 + 5.0), 0.0));
  float deck = smoothstep(0.42, 0.72, cl) * smoothstep(0.02, 0.2, p.y);
  float under = smoothstep(0.55, 0.05, p.y);
  vec3 cloudCol = mix(mix(d0, d1, 0.5 + 0.5 * under), d2, under * cl) * (0.05 + 0.3 * under) * (0.4 + 0.9 * cl);
  col = mix(col, cloudCol, deck * 0.9);

  // far skyline, then a nearer, taller block on the left third
  vec4 far = skyline(p, b, 0.05, hz, 0.16, 1.0);
  col = mix(col, d0 * 0.02, far.a);
  col += far.rgb * 0.8;
  vec4 nearB = skyline(p * vec2(1.0, 1.0) + vec2(0.0, 0.0), b, 0.13, hz - 0.05, 0.42, 5.0);
  float nearZone = smoothstep(-0.1, -0.3, p.x);
  col = mix(col, d0 * 0.012 + d1 * 0.006, nearB.a * nearZone);
  col += nearB.rgb * nearZone * 1.2;

  // wet street below the horizon
  if (p.y < hz){
    float gy = hz - p.y;
    col = mix(col, d0 * 0.03 + d1 * 0.012, smoothstep(0.0, 0.02 + b, gy));
  }

  // street lamps receding toward the vanishing point, with wet-road streaks
  for (int i = 0; i < 7; i++){
    float z = 1.0 + float(i) * 0.85;
    for (int s = 0; s < 2; s++){
      float side = float(s) * 2.0 - 1.0;
      vec2 lp = vp + vec2(side * 0.95, 0.32) / z * 0.55;
      float fi = float(i);
      vec3 tint = (s == 0 ? mix(c2, c1, step(4.5, fi) * 0.5) : mix(c3, c0, fract(fi * 0.5) * 2.0)) * (1.4 - 0.1 * fi);
      col += bokeh(p, lp, 0.012 / z, b * (0.55 + 0.6 / z), tint);
      // reflection on the wet street under each lamp
      float ry = vp.y - 0.42 / z * 0.55;
      float dx = p.x - lp.x;
      float sw = 0.006 / z + b * 0.22;
      float streak = exp(-dx * dx / (sw * sw)) * smoothstep(ry + 0.01, ry - 0.02, p.y)
                   * exp(-max(ry - p.y, 0.0) * 2.2 * sqrt(z));
      col += tint * streak * 0.38;
    }
  }

  // traffic: tail lights going away on the right lane, headlights coming on the left
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float za = 1.0 + mod(t * 0.35 + fk * 2.4, 7.2);
    float fa = smoothstep(1.0, 1.8, za) * smoothstep(8.2, 6.0, za);
    for (int e = 0; e < 2; e++){
      float ex = float(e) * 0.16 - 0.08;
      vec2 tl = vp + vec2(0.3 + ex, -0.3) / za * 0.55;
      col += bokeh(p, tl, 0.007 / za, b * 0.8, c2 * vec3(1.3, 0.75, 0.9) * 1.3) * fa;
      float zb = 8.2 - mod(t * 0.28 + fk * 2.7 + 1.1, 7.2);
      float fb = smoothstep(1.0, 1.8, zb) * smoothstep(8.2, 6.0, zb);
      vec2 hl = vp + vec2(-0.3 + ex, -0.3) / zb * 0.55;
      col += bokeh(p, hl, 0.008 / zb, b * 0.8, mix(c0, vec3(1.0), 0.55) * 1.2) * fb;
    }
  }

  // scattered signs and windows across the middle distance
  vec2 gs = vec2(0.085, 0.07);
  vec2 gi = floor(p / gs);
  for (int j = 0; j < 9; j++){
    vec2 cid = gi + vec2(float(j - (j / 3) * 3) - 1.0, float(j / 3) - 1.0);
    float hh = h21(cid + 31.0);
    vec2 cc = (cid + 0.2 + 0.6 * vec2(hh, h21(cid + 57.0))) * gs;
    float band = smoothstep(0.16, 0.05, abs(cc.y - 0.02));
    if (hh < 0.32 && band > 0.0){
      float pick = h21(cid + 91.0);
      vec3 tint = mix(mix(c3, c0, smoothstep(0.2, 0.5, pick)), c1, smoothstep(0.6, 0.9, pick));
      float tw = 0.75 + 0.25 * sin(t * (0.3 + hh) + hh * 40.0);
      col += bokeh(p, cc, 0.004 + 0.006 * hh, b * (0.7 + 0.6 * pick), tint) * band * tw * 0.7;
    }
  }
  return col;
}

// glass coordinates of a runnel path for column i at height y
float pathX(float i, float y, float W){
  float hc = h21(vec2(i, 7.3));
  return (i + 0.5) * W + (hc - 0.5) * 0.25 * W
       + 0.010 * sin(y * 7.0 + hc * 20.0) + 0.004 * sin(y * 19.0 + hc * 9.0);
}

// lower edge position of the sliding drop in column i (stick-slip, never reverses)
float slideY(float i){
  float hc = h21(vec2(i, 7.3));
  float v = (0.035 + 0.05 * h21(vec2(i, 1.1))) * u_flow;
  float w = 0.7 + 0.8 * h21(vec2(i, 2.9));
  float s = v * gT - 0.85 * v * sin(w * gT + hc * 6.0) / w;
  return 0.62 - mod(s + hc * 2.2, 2.2);
}

// how much the runnel behind each sliding drop has wiped the glass
vec2 trailMask(vec2 p){
  const float W = 0.095;
  float ci = floor(p.x / W);
  float m = 0.0, edge = 0.0;
  for (int k = -1; k <= 1; k++){
    float i = ci + float(k);
    if (h21(vec2(i, 4.4)) > 0.3 + 0.6 * u_rain) continue;
    float yd = slideY(i);
    float r = 0.017 + 0.013 * h21(vec2(i, 5.5));
    float dx = p.x - pathX(i, p.y, W);
    float age = p.y - yd;
    float tw = r * 0.75;
    float fade = step(0.0, age) * exp(-age * 0.9);
    float f = smoothstep(tw, tw * 0.3, abs(dx)) * fade;
    m = max(m, f);
    // the wet meniscus line along each side of the runnel
    float ed = abs(abs(dx) - tw * 0.8);
    edge = max(edge, smoothstep(tw * 0.28, 0.0, ed) * fade);
  }
  return vec2(m, edge);
}

float smaxk(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

// height of the water on the glass
float waterH(vec2 p){
  float hgt = 0.0;
  float tr = 0.0;

  // sliding drops with beads left along their runnels
  const float W = 0.095;
  float ci = floor(p.x / W);
  for (int k = -1; k <= 1; k++){
    float i = ci + float(k);
    if (h21(vec2(i, 4.4)) > 0.3 + 0.6 * u_rain) continue;
    float yd = slideY(i);
    float r = 0.017 + 0.013 * h21(vec2(i, 5.5));
    vec2 c = vec2(pathX(i, yd + r, W), yd + r);
    vec2 d = p - c;
    d.y *= d.y > 0.0 ? 0.55 : 1.05;
    float q = 1.0 - dot(d, d) / (r * r);
    if (q > 0.0) hgt = smaxk(hgt, r * sqrt(q), 0.003);
    // thin wet film along the runnel
    float age = p.y - yd;
    float dx = p.x - pathX(i, p.y, W);
    float tw = r * 0.4;
    float film = max(1.0 - dx * dx / (tw * tw), 0.0) * step(0.0, age) * exp(-age * 1.2);
    tr = max(tr, film);
    hgt = max(hgt, film * 0.0012);
    // beads stranded on the runnel
    float bc = 0.03;
    float kk = floor(p.y / bc);
    float hb = h21(vec2(i * 3.1, kk));
    if (hb < 0.55){
      float by = (kk + 0.25 + 0.5 * h21(vec2(kk, i))) * bc;
      vec2 bp = vec2(pathX(i, by, W) + (hb - 0.27) * 0.01, by);
      float br = 0.0025 + 0.005 * h21(vec2(kk, i + 2.0));
      br *= smoothstep(yd + r, yd + r + 0.04, by) * exp(-max(by - yd, 0.0) * 0.8);
      vec2 bd = p - bp;
      float bq = 1.0 - dot(bd, bd) / max(br * br, 1e-7);
      if (bq > 0.0) hgt = smaxk(hgt, br * sqrt(bq), 0.0015);
    }
  }

  // static beaded drops, two sizes, slowly swelling and evaporating
  for (int L = 0; L < 2; L++){
    float g = L == 0 ? 0.05 : 0.021;
    float rMax = L == 0 ? 0.017 : 0.0065;
    float dens = (L == 0 ? 0.55 : 0.8) * u_rain;
    vec2 gi = floor(p / g);
    for (int j = 0; j < 9; j++){
      vec2 cid = gi + vec2(float(j - (j / 3) * 3) - 1.0, float(j / 3) - 1.0);
      float sp = 0.025 + 0.02 * h21(cid + float(L) * 17.0);
      float lph = gT * sp + h21(cid + 3.3 + float(L));
      float cyc = floor(lph);
      float life = fract(lph);
      vec2 sd = cid + cyc * vec2(0.37, 0.71) + float(L) * 9.0;
      float ex = h21(sd);
      if (ex > dens) continue;
      vec2 c = (cid + 0.15 + 0.7 * vec2(h21(sd + 1.7), h21(sd + 4.1))) * g;
      float r = rMax * (0.35 + 0.65 * h21(sd + 8.8));
      r *= smoothstep(0.0, 0.25, life) * smoothstep(1.0, 0.75, life);
      vec2 d = p - c;
      d.x *= 1.0 + 0.25 * (h21(sd + 2.2) - 0.5);
      d.y *= d.y < 0.0 ? 0.92 : 1.08;
      float q = 1.0 - dot(d, d) / max(r * r, 1e-7);
      if (q > 0.0) hgt = smaxk(hgt, r * sqrt(q) * (1.0 - tr), 0.002);
    }
  }
  return hgt;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  d0 = deep(c0); d1 = deep(c1); d2 = deep(c2); d3 = deep(c3);
  gT = u_time;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float px = 1.0 / u_resolution.y;

  // water heightfield and its slope
  float e = 0.0012;
  float h = waterH(uv);
  float hx = waterH(uv + vec2(e, 0.0));
  float hy = waterH(uv + vec2(0.0, e));
  vec2 g = vec2(hx - h, hy - h) / e;
  float gl = length(g);
  g *= min(1.0, 3.5 / max(gl, 1e-4));

  float drop = smoothstep(0.0012, 0.0012 + max(3.0 * px * 1.5, 0.002), h);
  vec2 trm = trailMask(uv);
  float tr = trm.x;
  float clear = max(drop, tr);

  // condensation: patchy, thicker toward the sill, wiped where water has run
  float mist = fbm(uv * vec2(2.5, 4.0) + vec2(0.0, gT * 0.01));
  float fogL = clamp(u_fog * (0.55 + 0.7 * mist) * (0.75 + 0.45 * smoothstep(0.5, -0.5, uv.y)), 0.0, 1.0);
  fogL *= 1.0 - clear;

  float baseBlur = 0.006 + 0.05 * u_blur;
  float blur = mix(baseBlur + 0.04 * fogL, baseBlur * 0.5, drop);

  // each drop is a lens: the city behind it arrives bent and flipped
  vec2 q = uv + g * 0.07 * drop;
  vec3 col = city(q, blur);

  // drop shading: dark meniscus at the steep rim, a lamp glint near the top
  vec3 n = normalize(vec3(-g * 0.5, 1.0));
  col *= 1.0 - drop * smoothstep(2.2, 3.5, gl) * 0.55;
  col = col * (1.0 + drop * 0.6) + drop * (d0 * 0.02 + d1 * 0.015);
  vec3 Ld = normalize(vec3(-0.35, 0.55, 0.75));
  float spec = pow(max(dot(n, Ld), 0.0), 45.0) * drop;
  col += mix(c2, vec3(1.0), 0.5) * spec * 0.7;
  // a cool sheen from the sky wraps the upper shoulder of each bead
  col += mix(c0, c3, 0.4) * 0.05 * drop * smoothstep(0.3, 2.5, g.y);
  // light gathered at the lower lip of each drop
  col += mix(c2, c3, smoothstep(-0.3, 0.3, uv.x)) * 0.1 * drop * smoothstep(0.4, 2.5, -g.y);

  // runnel edges catch the street light
  col += mix(c3, c2, smoothstep(-0.4, 0.5, uv.x)) * trm.y * (1.0 - drop) * 0.07;

  // misted glass: the city dims into a milky veil with fine frost grain
  float grain = vnoise(uv * 380.0) * 0.5 + vnoise(uv * 170.0 + 3.0) * 0.5;
  vec3 veil = col * 0.62 + (d0 * 0.6 + d1 * 0.4) * (0.02 + 0.02 * grain) + d2 * 0.012 * mist;
  col = mix(col, veil, fogL);

  gl_FragColor = vec4(col, 1.0);
}
