// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Rain on a night window: beaded drops and slow winding runnels on misted glass in front,
// a painted glazing bar in silhouette, and beyond it an out-of-focus city in layers of
// bokeh separated by drifting haze and motes. Every drop and runnel refracts the blurred
// city, inverted and sharper than the fogged pane around it.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest (unused)
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rain;   // how many drops bead the glass (default 1.0)
uniform float u_mist;   // condensation fogging the pane (default 0.7)
uniform float u_haze;   // haze and motes hanging between the city layers (default 0.8)
uniform float u_drift;  // speed of runnels, traffic and haze (default 1.0)

vec3 c0, c1, c2, c3;
vec3 EMB = vec3(0.060, 0.012, 0.016); // ember-dark night air, the warm shadow

float h21(vec2 p){ return fract(sin(dot(p, vec2(41.37, 289.11))) * 5831.77); }
float vn(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(1.58, 1.21, -1.21, 1.58) * p + vec2(5.3, 2.9);
    a *= 0.5;
  }
  return s;
}

// one out-of-focus light: soft disc with a brighter rim and a mottled interior
float bokeh(vec2 d, float r, float soft, float seed){
  float x = length(d) / r;
  float body = smoothstep(1.0 + soft, 1.0 - soft, x);
  float rim = exp(-(1.0 - x) * (1.0 - x) / (0.03 + soft * 0.2));
  float mott = 0.8 + 0.2 * vn(d / r * 3.0 + seed * 17.0);
  return body * (0.55 + 0.45 * rim) * mott;
}

// a layer of bokeh lights; depth k sets size, count and colour
vec3 bokehLayer(vec2 q, float cell, float rmin, float rmax, float blur, float k, float t, vec3 ca, vec3 cb, float gain){
  vec3 acc = vec3(0.0);
  vec2 g = q / cell;
  vec2 id0 = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(float(i), float(j));
      float h = h21(id + k * 31.0);
      float h2 = h21(id + k * 31.0 + 7.7);
      // lights cluster low, in the street and lower storeys
      float yc = (id.y + 0.5) * cell;
      float allow = smoothstep(0.25, -0.05, yc) * step(0.35, h);
      vec2 c = (id + 0.5 + (vec2(h, h2) - 0.5) * 0.7) * cell;
      c.x += 0.004 * sin(t * 0.3 + h * 9.0);
      float r = mix(rmin, rmax, h2 * h2);
      float tw = 0.8 + 0.2 * sin(t * (0.4 + h) + h2 * 20.0);
      vec3 col = mix(ca, cb, fract(h * 3.7));
      col = mix(col, c2, step(0.85, h2) * 0.7);
      acc += col * bokeh(q - c, r, 0.08 + blur * 0.35, h) * allow * tw * (0.5 + 0.7 * h2) * (1.0 + 0.45 * step(0.85, h2));
    }
  }
  return acc * gain;
}

// the blurred city beyond the glass; blur widens every light
vec3 city(vec2 q, float blur, float t){
  float dr = t * u_drift;
  // sky: ember-dark overhead, mint skyglow low over the roofs
  vec3 col = EMB * (1.1 + 0.6 * q.y);
  col += c3 * 0.22 * exp(-max(q.y + 0.02, 0.0) * 3.5);
  // low rain cloud, lit from beneath by the city, drifting over the roofs
  float cl = fbm(vec2(q.x * 1.6 + dr * 0.012, q.y * 3.2 - 1.0));
  float under = smoothstep(0.55, 0.05, q.y);
  col += (c3 * 0.30 * under + c0 * 0.10 * under * under + EMB * 1.2 * (1.0 - under)) * smoothstep(0.35, 0.85, cl) * smoothstep(-0.05, 0.2, q.y);

  // far towers: soft silhouettes of varied width, gaps between, lit windows blurred to glows
  float bx = q.x * 7.0 + 3.0 + 0.35 * vn(vec2(q.x * 4.0, 5.0));
  float bid = floor(bx);
  float bh = h21(vec2(bid, 3.0));
  float bfr = fract(bx);
  float bed = 0.06 + blur * 0.12;
  float exists = step(0.22, bh) * smoothstep(0.0, bed, bfr) * smoothstep(1.0, 1.0 - bed, bfr);
  float top = -0.02 + 0.30 * bh * bh + 0.04 * step(0.5, fract(bx * 2.0)) * step(0.6, bh);
  float bsil = smoothstep(top + 0.01 + blur * 0.04, top - 0.01 - blur * 0.04, q.y) * exists;
  col = mix(col, EMB * 0.45 + c3 * 0.04, bsil * 0.9);
  float rows = 30.0 + 20.0 * fract(bh * 5.3);
  vec2 wg = vec2((bx - bid) * (5.0 + floor(bh * 4.0)), q.y * rows);
  vec2 wi = floor(wg);
  vec2 wf = fract(wg) - 0.5;
  float lit = step(0.7, h21(wi + bid * 7.0)) * (0.5 + 0.5 * h21(wi + 3.1));
  float win = smoothstep(0.5 + blur * 0.55, 0.05, length(wf * vec2(1.0, 1.3)));
  col += mix(c3, c1, h21(wi + 5.0)) * win * lit * bsil * 0.32;
  // a warm aviation lamp on the tallest roofs, the only warm light in the night
  vec2 al = vec2(q.x * 7.0 + 3.0 - bid - 0.5, q.y - top - 0.012);
  al.x /= 7.0;
  float av = exists * step(0.75, bh) * (0.55 + 0.45 * sin(t * 0.8 + bid));
  col += vec3(1.0, 0.32, 0.18) * 0.7 * av * exp(-dot(al, al) / (0.00006 + blur * 0.0002));

  // haze bank between the towers and the street
  float hz = fbm(vec2(q.x * 2.2 + dr * 0.025, q.y * 4.0 - dr * 0.01));
  vec3 hazeC = mix(c3 * 0.35, EMB * 2.0, smoothstep(-0.1, 0.35, q.y));
  col = mix(col, hazeC, u_haze * 0.45 * hz * smoothstep(0.4, -0.2, q.y));

  // street: a slow line of traffic light pairs
  float ty = -0.27 + 0.01 * sin(q.x * 2.0);
  vec2 tq = vec2(q.x + dr * 0.035, q.y - ty);
  float tid = floor(tq.x / 0.11);
  float th = h21(vec2(tid, 9.0));
  vec2 tc = vec2((tid + 0.5) * 0.11 + (th - 0.5) * 0.04, 0.0);
  float tr = 0.016 + 0.01 * th;
  vec3 tcol = mix(c0, c1, th);
  col += tcol * bokeh(tq - tc - vec2(0.012, 0.0), tr, 0.1 + blur * 0.35, th) * step(0.3, th) * 0.6;
  col += tcol * bokeh(tq - tc + vec2(0.012, 0.0), tr, 0.1 + blur * 0.35, th + 1.0) * step(0.3, th) * 0.6;
  // glow of the wet street below the traffic
  col += c3 * 0.10 * exp(-abs(q.y + 0.33) * 9.0) * (0.7 + 0.3 * vn(vec2(q.x * 6.0 + dr * 0.05, 2.0)));

  // mid layer of street lamps and shopfronts
  col += bokehLayer(q + vec2(dr * 0.004, 0.0), 0.11, 0.022, 0.05, blur, 1.0, t, c0, c1, 0.9);

  // second haze veil and drifting motes lit by the city
  float hz2 = fbm(vec2(q.x * 1.4 - dr * 0.018, q.y * 2.5 + 4.0));
  col = mix(col, c3 * 0.22 + EMB, u_haze * 0.30 * hz2);
  for (int kk = 0; kk < 2; kk++) {
    float k = float(kk);
    vec2 mg = q * (16.0 + 10.0 * k) + vec2(dr * (0.08 + 0.05 * k), -dr * 0.03);
    vec2 mi = floor(mg);
    vec2 mf = fract(mg) - 0.5;
    float mh = h21(mi + k * 13.0);
    vec2 mo = (vec2(mh, h21(mi + 2.2)) - 0.5) * 0.6;
    float mote = smoothstep(0.08 + 0.04 * k, 0.0, length(mf - mo)) * step(0.7, mh);
    col += mix(c1, c2, mh) * mote * u_haze * 0.25 * (0.6 + 0.4 * sin(t * 0.5 + mh * 30.0)) * smoothstep(0.35, -0.3, q.y);
  }

  // near, huge, dim discs of lights right behind the glass
  col += bokehLayer(q + vec2(-dr * 0.002, 0.03), 0.30, 0.07, 0.13, blur * 0.5 + 0.5, 2.0, t, c3, c0, 0.22);
  return col;
}

void main(){
  vec3 p0 = u_palette[0], p1 = u_palette[1], p2 = u_palette[2], p3 = u_palette[3];
  c0 = p0; c1 = p1; c2 = p2; c3 = p3;
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution;
  float asp = res.x / res.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float px = 1.0 / res.y;
  float t = u_time;
  float dr = t * u_drift;
  float rain = max(u_rain, 0.0);

  vec2 off = vec2(0.0);   // refraction offset into the city
  float dropM = 0.0;      // how much of this pixel is under water
  float clear = 0.0;      // water wipes the mist away
  float spec = 0.0;       // glints on drop crowns
  float rimDark = 0.0;    // dark meniscus edges
  float edgeLit = 0.0;    // lower lip of each drop catching the skyglow

  // beaded drops at two scales, each one irregular
  for (int kk = 0; kk < 2; kk++) {
    float k = float(kk);
    float sc = 7.0 + 13.0 * k;
    vec2 g = p * sc + vec2(k * 3.7, k * 1.3);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = h21(id + k * 9.0);
    float h2 = h21(id + k * 9.0 + 4.4);
    float present = step(1.0 - rain * (0.55 - 0.15 * k), h);
    vec2 cc = (vec2(h2, fract(h * 7.3)) - 0.5) * 0.4;
    vec2 d = f - cc;
    d.y *= d.y > 0.0 ? 1.25 : 0.88;
    float ang = atan(d.y, d.x);
    float r = (0.12 + 0.16 * h2) * (1.0 + 0.12 * (vn(vec2(ang * 1.6 + h * 40.0, h2 * 9.0)) - 0.5));
    float x = length(d) / r;
    float m = smoothstep(1.0, 1.0 - 3.0 * px * sc / r, x) * present;
    vec2 n = d / r;
    off += -n * (r / sc) * 3.2 * m;
    dropM = max(dropM, m);
    clear = max(clear, smoothstep(1.6, 1.0, x) * present);
    spec += m * exp(-dot(n - vec2(-0.35, 0.4), n - vec2(-0.35, 0.4)) * 30.0);
    rimDark = max(rimDark, m * smoothstep(0.7, 1.0, x));
    edgeLit += m * smoothstep(0.55, 0.95, x) * smoothstep(0.1, -0.7, n.y) * (0.5 + 0.5 * h2);
  }

  // runnels: slow winding trails with a heavy drop at the head
  for (int kk = 0; kk < 4; kk++) {
    float k = float(kk);
    float seed = h21(vec2(k, 2.0));
    float x0 = (-0.45 + 0.32 * k + 0.08 * seed) * asp;
    float xr = x0 + 0.035 * sin(p.y * (3.0 + seed * 3.0) + k) + 0.03 * (vn(vec2(p.y * 6.0, k * 7.0)) - 0.5);
    float sp = 0.022 + 0.014 * seed;
    float ph = fract(dr * sp + seed);
    float headY = 0.7 - ph * 1.6;
    float age = p.y - headY;
    float trail = step(0.0, age) * exp(-age * 1.3) * smoothstep(0.0, 0.04, ph) ;
    float w = (0.006 + 0.007 * vn(vec2(p.y * 14.0, k))) * (0.6 + 0.4 * exp(-age * 3.0));
    float dx = p.x - xr;
    float tm = smoothstep(w, w - 2.0 * px, abs(dx)) * trail * min(rain * 1.5, 1.0);
    off += vec2(-dx * 4.0, 0.0) * tm;
    edgeLit += tm * smoothstep(0.5, 1.0, abs(dx) / max(w, 1e-4)) * 0.8;
    dropM = max(dropM, tm);
    clear = max(clear, smoothstep(w * 4.0, w, abs(dx)) * trail * min(rain * 1.5, 1.0));
    // beads left behind along the trail
    float by = fract(p.y * 18.0 + k * 0.37);
    float bh = h21(vec2(floor(p.y * 18.0 + k * 0.37), k));
    vec2 bd = vec2(dx, (by - 0.5) / 18.0);
    float br = (0.003 + 0.006 * bh) * step(0.55, bh);
    float bm = smoothstep(br, br - 2.0 * px, length(bd)) * step(0.0, age) * min(rain * 1.5, 1.0);
    off += -bd * 1.5 * bm;
    dropM = max(dropM, bm);
    // the head drop
    vec2 hd = vec2(p.x - xr, (p.y - headY) * 0.8);
    float hr = 0.016 + 0.006 * seed;
    float hx = length(hd) / hr;
    float hm = smoothstep(1.0, 1.0 - 3.0 * px / hr, hx) * min(rain * 1.5, 1.0);
    vec2 hn = hd / hr;
    off += -hn * hr * 3.2 * hm;
    edgeLit += hm * smoothstep(0.55, 0.95, hx) * smoothstep(0.1, -0.7, hn.y);
    dropM = max(dropM, hm);
    clear = max(clear, smoothstep(1.8, 1.0, hx) * min(rain * 1.5, 1.0));
    spec += hm * exp(-dot(hn - vec2(-0.35, 0.4), hn - vec2(-0.35, 0.4)) * 30.0);
    rimDark = max(rimDark, hm * smoothstep(0.7, 1.0, hx));
  }

  // condensation: patchy fog on the pane, wiped clear by water
  float mistField = 0.55 + 0.45 * fbm(p * 3.0 + vec2(0.0, dr * 0.004));
  float mist = clamp(u_mist * mistField * (1.0 - clear), 0.0, 1.0);
  float blur = mix(0.35 + 0.65 * mist, 0.1, dropM);

  vec2 q = p + off;
  vec3 col = city(q, blur, t);

  // fog scatters the city light and lifts the pane a little
  float micro = vn(p * 260.0);
  col = mix(col, col * 0.75 + col * col * 1.5 + EMB * 0.6 * (0.8 + 0.4 * micro), mist * 0.55);

  // water: darker meniscus edge, bright crown glint
  col *= (1.0 + 0.25 * dropM) * (1.0 - 0.45 * rimDark);
  col += mix(c3, c1, 0.5) * edgeLit * 0.35;
  col += mix(c1, c2, 0.7) * spec * 1.1;

  // painted glazing bar on the left third and the transom low down
  float bxp = p.x + asp * 0.5 - asp * 0.30;
  float vb = abs(bxp) - 0.028;
  float ty = p.y + 0.36;
  float hb = abs(ty) - 0.022;
  float bar = min(vb, hb);
  float barM = smoothstep(1.5 * px, -1.5 * px, bar);
  // bevel: distance in from the bar edge, lit from the city on the right
  float inV = clamp(-vb / 0.028, 0.0, 1.0);
  float bev = smoothstep(0.0, 0.35, -bar / 0.028);
  float lightSide = vb < hb ? smoothstep(-0.028, 0.028, bxp) : smoothstep(0.022, -0.022, ty);
  float wood = vn(vec2(p.x * 20.0, p.y * 400.0) + vec2(0.0, 0.0)) * 0.5 + vn(p * 90.0) * 0.5;
  vec3 paint = EMB * (0.6 + 0.9 * wood);
  paint += c3 * 0.30 * (1.0 - bev) * (0.3 + 0.7 * lightSide);
  float edgeLine = exp(-max(-bar, 0.0) / 0.0035) * (0.25 + 0.75 * lightSide);
  paint += mix(c1, c2, 0.5) * 0.45 * edgeLine * (0.7 + 0.3 * vn(p * 40.0));
  paint *= 0.75 + 0.25 * inV;
  // chipped paint showing pale primer here and there
  paint += c3 * 0.10 * smoothstep(0.72, 0.8, vn(p * 55.0 + 3.0)) * bev;
  col = mix(col, paint, barM);

  gl_FragColor = vec4(col, 1.0);
}
