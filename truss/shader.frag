// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// A night greenhouse seen through its fogged side wall. Rows of tomato vines climb strings
// toward lattice girders, lit by alternating rose LED bars and amber sodium lamps, bay after
// bay into blue night. The whole interior stays soft behind the condensation; beads swell,
// sag and slide on the glass, each one a tiny inverted lens, and drops run down clear tracks.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest (unused)
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fog;    // density of the condensation film and how soft the hall looks (default 0.75)
uniform float u_lamps;  // strength of the grow lamps and their glow in the haze (default 1.0)
uniform float u_drift;  // speed of the glide down the aisle and of the beads swelling (default 0.4)
uniform float u_runs;   // how many drops break loose and run down the glass (default 0.8)

vec3 P0; vec3 P1; vec3 P2; vec3 P3;
float T;
vec2 VP;

float hash(vec2 p){
  vec3 q = fract(p.xyx * vec3(0.2731, 0.3567, 0.1919));
  q += dot(q, q.zyx + 23.71);
  return fract((q.x + q.z) * q.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), e = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, e, w.x), w.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  mat2 m = mat2(0.79, 0.61, -0.61, 0.79);
  for (int i = 0; i < 5; i++){
    s += a * vnoise(p);
    p = m * p * 2.11 + vec2(3.7, 8.9);
    a *= 0.5;
  }
  return s;
}
float tri(float x){ return abs(fract(x) - 0.5) * 2.0; }

// one tomato leaf on a vine: base point, outward side, length; returns coverage and midrib
vec2 leafShape(vec2 q, vec2 base, float side, float len, float tilt, float ew){
  vec2 dir = normalize(vec2(side * 0.85, tilt));
  vec2 v = q - base;
  float al = dot(v, dir);
  float pe = dot(v, vec2(-dir.y, dir.x));
  float t = clamp(al / len, 0.0, 1.0);
  // droop toward the tip
  pe += side * t * t * len * 0.35;
  // serrated pinnate edge: lobes along the blade
  float lobe = 0.75 + 0.25 * abs(sin(t * 18.0));
  float w = len * 0.42 * sqrt(max(t * (1.0 - t), 0.0)) * 2.0 * lobe;
  float dIn = max(abs(pe) - w, max(-al, al - len));
  float cov = 1.0 - smoothstep(-ew, ew, dIn);
  float rib = (1.0 - smoothstep(0.0, 0.004 + ew, abs(pe))) * cov;
  return vec2(cov, rib);
}

// the hall behind the wall; bw is the softness of every edge, glow returns scattered lamp light
vec3 scene(vec2 p, float bw, float px, out vec3 glow){
  glow = vec3(0.0);
  vec2 d = p - VP;
  float ay = max(abs(d.y), 1e-4);
  float ax = max(abs(d.x), 1e-4);
  float zr = d.y > 0.0 ? 0.34 / ay : 0.36 / ay;
  float zw = 0.80 / ax;
  float zb = min(min(zr, zw), 8.0);
  bool wall = zw < zr;
  float u = wall ? d.y * zw : d.x * zr;
  float fogd = 1.0 - exp(-zb * 0.28);

  // night sky through the far roof, deep blue with cloud, roof glazing bars fading off
  vec3 col = P3 * 0.06 + P0 * 0.24 * smoothstep(-0.05, 0.6, d.y);
  col += P0 * 0.10 * fbm(vec2(u * 1.3, zb * 0.6) + T * 0.01) * step(0.0, d.y) * (1.0 - fogd);
  float rb = abs(fract(u * 3.7 + 0.5) - 0.5) / (3.7 * zb);
  col = mix(col, P3 * 0.10, (1.0 - smoothstep(0.001, 0.003 + bw, rb)) * (1.0 - fogd) * step(0.0, d.y));
  col *= step(-0.02, d.y) + (1.0 - step(-0.02, d.y)) * 0.55;
  vec3 hz = P3 * 0.07 + P0 * 0.16;
  col = mix(col, hz, fogd * 0.8);
  // far end of the hall glowing through haze
  float far = exp(-dot(d, d) * 22.0);
  col += (P1 * 0.30 + P2 * 0.30) * far * u_lamps;
  glow += (P1 * 0.18 + P2 * 0.12) * exp(-dot(d, d) * 7.0) * u_lamps;
  float dcur = zb;

  float tw = T * u_drift * 0.06;
  float ph = fract(tw);
  float base = floor(tw);
  for (int i = 0; i < 7; i++){
    float k = 6.0 - float(i);
    float z = 0.30 * exp(0.40 * (k + 1.0 - ph));
    float id = k + base;
    float s = 0.5 / z;
    vec2 q = d / s;
    float ew = (px + bw) / s;
    float fa = smoothstep(0.38, 0.58, z) * (1.0 - smoothstep(4.2, 5.3, z));
    float side = q.x < 0.0 ? -1.0 : 1.0;
    float axq = abs(q.x);

    // this bay burns either rose LED bars or amber sodium lamps
    float kind = step(0.5, hash(vec2(id, 1.9)));
    vec3 lampC = mix(P1 * 1.25 + P0 * 0.15, P2 * 1.15, kind) * (0.85 + 0.3 * hash(vec2(id, side + 4.0)));
    float lx = side * 0.95;
    vec2 ld = q - vec2(lx, 0.37);
    float below = max(-ld.y, 0.0);
    float cone = (1.0 - smoothstep(0.0, 0.22 + 0.55 * below, abs(ld.x))) * step(ld.y, 0.0) * exp(-below * 1.3);
    float halo = exp(-dot(ld, ld) * 12.0);
    vec3 scat = lampC * (cone * 0.9 + halo * 0.9) * u_lamps;

    // haze between this bay and what lies behind it, lamp tinted near the lamps, blue elsewhere
    float hA = 1.0 - exp(-max(min(dcur - z, 0.49 * z), 0.0) * 0.6);
    col = mix(col, P3 * 0.06 + P0 * 0.13 + scat * 0.9, hA * fa);
    vec2 ls = p - (VP + s * vec2(lx, 0.37));
    glow += lampC * u_lamps * fa * 0.32 * exp(-dot(ls, ls) / (0.002 + 0.035 * s * s));

    // wet concrete aisle floor with long lamp reflections
    float floorA = 1.0 - smoothstep(-0.70 - ew, -0.70 + ew, q.y);
    float refl = exp(-(axq - 0.95) * (axq - 0.95) * 14.0) * (0.5 + 0.5 * vnoise(vec2(q.x * 3.0, q.y * 14.0 + id)));
    vec3 lc = P3 * 0.07 + P0 * 0.04 + lampC * 0.22 * refl * u_lamps;

    // bench top under the vines
    float benchA = smoothstep(0.36 - ew, 0.36 + ew, axq) * (1.0 - smoothstep(1.56 - ew, 1.56 + ew, axq));
    float benchY = -0.42;
    float trough = (1.0 - smoothstep(benchY - ew, benchY + ew, q.y)) * benchA;
    float lightF = exp(-(axq - 0.95) * (axq - 0.95) * 1.6) * u_lamps;
    vec3 troughC = P3 * 0.05 + lampC * 0.10 * lightF * smoothstep(-0.52, -0.43, q.y);
    troughC += P0 * 0.12 * (1.0 - smoothstep(0.0, 0.012 + ew, abs(q.y - benchY + 0.008)));
    lc = mix(lc, troughC, trough * (1.0 - floorA));

    // tomato vines climbing strings: stems of varying height carrying alternate leaves
    float cwv = 0.22;
    float cix = floor(q.x / cwv);
    float hv = hash(vec2(cix, id + 2.3));
    float sx = (cix + 0.5 + 0.15 * (hv - 0.5)) * cwv;
    float vineOn = step(0.10, hv) * benchA * step(0.40, abs(sx)) * step(abs(sx), 1.50);
    float topV = 0.06 + 0.30 * hash(vec2(cix, id + 7.1));
    float sway = 0.012 * sin(T * 0.40 + id * 1.3 + cix * 0.9);
    float bend = sway * smoothstep(benchY, topV, q.y);
    float stemA = (1.0 - smoothstep(0.004, 0.004 + ew, abs(q.x - sx - bend))) * step(benchY, q.y) * step(q.y, topV + 0.02);
    float stringA = (1.0 - smoothstep(0.0015, 0.0015 + ew, abs(q.x - sx))) * step(topV, q.y) * step(q.y, 0.47) * 0.5;
    float leafA = 0.0;
    float ribA = 0.0;
    float ly = (q.y - benchY) / 0.075;
    float li0 = floor(ly);
    for (int r = 0; r < 6; r++){
      // three leaf rows around this height, each with a leaf to either side of the stem
      float li = li0 + 1.0 - floor(float(r) * 0.5);
      float lside = mod(float(r), 2.0) * 2.0 - 1.0;
      float hl = hash(vec2(cix * 3.1 + li + lside * 0.37, id + 5.5));
      float by = benchY + (li + 0.2 + 0.6 * hl) * 0.075;
      float onL = step(benchY + 0.03, by) * step(by, topV + 0.01) * step(0.2, hl);
      float lbend = sway * smoothstep(benchY, topV, by);
      float hk = hash(vec2(li * 1.7 + lside, cix + id * 0.3));
      float len = (0.050 + 0.050 * hk) * (0.75 + 0.35 * smoothstep(benchY, topV, by));
      vec2 lf = leafShape(q, vec2(sx + lbend, by), lside, len, 0.05 + 0.60 * hl, ew);
      leafA = max(leafA, lf.x * onL);
      ribA = max(ribA, lf.y * onL);
    }
    float plantA = max(max(stemA, leafA), stringA) * vineOn;
    float up = smoothstep(benchY, 0.30, q.y);
    // leaves are dark against the lit haze; only the topmost catch the lamp, translucent at the rim
    vec3 plantC = P3 * 0.020 + P0 * 0.025 * (1.0 - up);
    plantC += lampC * 0.30 * up * up * up * lightF * (0.5 + 0.5 * vnoise(q * 40.0 + id));
    plantC += lampC * 0.18 * lightF * leafA * (1.0 - smoothstep(0.0, 0.6, ribA + 0.3)) * up;
    plantC = mix(plantC, P3 * 0.015, ribA * 0.7);
    lc = mix(lc, plantC, plantA * (1.0 - floorA));

    // steel: outer posts, lattice girder, Venlo roof ridges, lamp hangers
    float th = 0.018;
    float inSpan = 1.0 - smoothstep(1.62, 1.62 + ew, axq);
    float roofY = 0.56 + 0.20 * (1.0 - tri((q.x + 1.62) / 0.81));
    float dPost = abs(axq - 1.62) + max(q.y - roofY, 0.0) + max(-0.70 - q.y, 0.0);
    float dTop = abs(q.y - 0.56);
    float dBot = abs(q.y - 0.48);
    float dWeb = abs(q.y - (0.48 + 0.08 * tri(q.x / 0.2))) * 0.62 + max(abs(q.y - 0.52) - 0.04, 0.0);
    float dRoof = abs(q.y - roofY) * 0.9;
    float dS = min(min(dTop, dBot * 1.25), min(dWeb * 1.6, dRoof));
    dS += (1.0 - inSpan) * 10.0;
    dS = min(dS, dPost * 0.8);
    float steelA = 1.0 - smoothstep(th - ew, th + ew, dS);
    float dWire = abs(q.x - lx) + max(abs(q.y - 0.43) - 0.05, 0.0);
    steelA = max(steelA, (1.0 - smoothstep(0.004 - ew, 0.004 + ew, dWire)) * 0.8);
    vec3 steel = P3 * 0.05 + P0 * 0.08 * exp(-dS * dS / (th * th)) * step(0.5, q.y);
    steel += lampC * 0.30 * u_lamps * exp(-abs(axq - 0.95) * 2.0) * (1.0 - smoothstep(0.45, 0.62, q.y));
    lc = mix(lc, steel, steelA);

    // lamp bodies: a long LED bar or a short sodium reflector with a hot bulb
    vec2 lsz = mix(vec2(0.22, 0.012), vec2(0.09, 0.028), kind);
    vec2 lb = abs(ld) - lsz;
    float dL = length(max(lb, 0.0)) + min(max(lb.x, lb.y), 0.0);
    float lampA = 1.0 - smoothstep(-ew, ew, dL);
    float hot = mix((1.0 - smoothstep(0.0, 0.008 + ew, abs(ld.y + 0.008))) * (1.0 - smoothstep(0.18, 0.22, abs(ld.x))),
                    exp(-dot(ld + vec2(0.0, 0.03), ld + vec2(0.0, 0.03)) * 1500.0), kind);
    vec3 lampBody = P3 * 0.05 + mix(lampC, vec3(1.0), 0.35 * hot) * (0.12 + 2.2 * hot) * u_lamps;
    lc = mix(lc, lampBody, lampA);

    float paint = max(max(floorA, trough), max(max(plantA, steelA), lampA)) * fa;
    col = mix(col, lc, paint);
    dcur = mix(dcur, z, paint);
    col += lampC * u_lamps * fa * 0.40 * exp(-dot(ld * vec2(0.8, 2.0), ld * vec2(0.8, 2.0)) * 70.0);
  }
  return col;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // raise each theme colour to a power so soft dusk tones become saturated light, not mauve mud
  P0 = pow(c0, vec3(2.3)) * 2.2; P1 = pow(c1, vec3(2.3)) * 2.2;
  P2 = pow(c2, vec3(2.3)) * 1.9; P3 = pow(c3, vec3(2.3)) * 2.2;
  T = u_time;

  vec2 res = u_resolution;
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float px = 1.0 / res.y;
  VP = vec2(-0.17 * aspect, 0.44);
  float fog = clamp(u_fog, 0.0, 1.0);

  // glazing bars and one transom of the near wall
  float bx = 0.37;
  float gx = (p.x + 0.09) / bx;
  float cx = fract(gx + 0.5) - 0.5;
  float dV = abs(cx) * bx;
  float trY = 0.27;
  float dH = abs(p.y - trY);
  vec2 pane = vec2(floor(gx + 0.5), step(trY, p.y));
  float nearBar = exp(-min(dV, dH) * 30.0);

  // drops that break loose and run, leaving a clear wandering track
  float cw = 1.0 / 12.0;
  float rc = floor(p.x / cw);
  float h1 = hash(vec2(rc, 41.0)), h2 = hash(vec2(rc, 7.7)), h3 = hash(vec2(rc, 19.3));
  float act = step(h1, 0.15 + 0.35 * clamp(u_runs, 0.0, 1.5));
  float fc = fract(T * (0.022 + 0.035 * h2) * u_runs + h3);
  float headY = 1.08 - fc * 1.3;
  float rx = (rc + 0.25 + 0.5 * h2) * cw + 0.012 * (vnoise(vec2(p.y * 5.0, rc * 3.0)) - 0.5);
  float dx = abs(p.x - rx);
  float trW = 0.0028 + 0.0018 * h3;
  float env = sin(3.14159 * fc) * act;
  float trail = (1.0 - smoothstep(trW - px, trW + px, dx)) * step(headY, p.y) * exp(-(p.y - headY) * 1.4) * env;
  vec2 hd = (p - vec2(rx, headY - trW)) * vec2(1.0, 0.7);
  float hR = trW * 2.4;
  float headA = (1.0 - smoothstep(hR - px, hR + px, length(hd))) * env;
  float wipe = (1.0 - smoothstep(trW * 2.0, trW * 4.0, dx)) * step(headY, p.y) * env;

  // condensation film, thicker toward the bars and the bottom of each pane
  float fb = fbm(p * vec2(3.0, 4.2) + vec2(0.0, T * 0.010) + pane * 3.1);
  float fine = vnoise(p * 110.0 + pane * 7.0);
  float lowP = 1.0 - smoothstep(0.0, 0.5, p.y - mix(0.0, trY, pane.y));
  float cond = fog * smoothstep(0.10, 0.80, 0.25 + fb * 0.75 + 0.25 * nearBar + 0.15 * lowP + 0.08 * fine);

  // beads at two sizes: each swells, sags and slides away, then a new one forms
  float inB = 0.0, rimM = 0.0, specM = 0.0, crescM = 0.0;
  vec2 lensP = p;
  for (int j = 0; j < 2; j++){
    float fj = float(j);
    float sc = j == 0 ? 19.0 : 42.0;
    vec2 sh = vec2(fj * 17.3, fj * 5.1);
    vec2 g = p * sc + sh;
    vec2 ci = floor(g);
    vec2 cf = fract(g) - 0.5;
    float hb = hash(ci + fj * 31.7);
    float on = step(0.42, hash(ci + 2.9));
    float bph = fract(T * u_drift * (0.05 + 0.07 * hash(ci + 7.7)) + hb);
    float grow = smoothstep(0.0, 0.7, bph) * (1.0 - smoothstep(0.90, 1.0, bph));
    float rad = (0.09 + 0.24 * hb) * sqrt(grow) * on;
    vec2 off = (vec2(hash(ci + 5.3), hash(ci + 9.1)) - 0.5) * 0.36;
    off.y -= smoothstep(0.72, 1.0, bph) * 0.20;
    vec2 b = cf - off;
    b.y *= b.y < 0.0 ? 0.82 : 1.05;
    float r = length(b);
    float e = 1.5 * px * sc;
    float m = (1.0 - smoothstep(rad - e, rad, r)) * smoothstep(0.2, 0.5, cond / max(fog, 0.05)) * (1.0 - wipe);
    if (m > inB){
      inB = m;
      vec2 cen = (ci + 0.5 + off - sh) / sc;
      lensP = cen - (p - cen) * 7.0;
      rimM = smoothstep(rad * 0.5, rad, r) * m;
      crescM = smoothstep(rad * 0.3, rad * 0.85, -b.y) * smoothstep(rad * 0.45, rad * 0.9, r) * m;
      vec2 hv = b - vec2(-0.33, 0.36) * rad;
      specM = exp(-dot(hv, hv) / (rad * rad * 0.03 + 1e-5)) * m;
    }
  }
  float clearT = max(trail, headA);
  lensP = mix(lensP, p, step(inB, 0.01));

  // the hall seen through fog stays soft everywhere; beads and tracks show it a little clearer
  vec3 gF, gS;
  float blur = 0.005 + 0.016 * fog;
  vec3 soft = scene(p, blur, px, gF);
  vec3 clear = scene(lensP, 0.006, px, gS);

  vec3 film = soft * 0.62 + gF * 0.70 + P0 * 0.05 * (0.6 + 0.8 * fine) + P1 * 0.012 * fb;
  vec3 col = mix(soft, film, cond);
  col = mix(col, clear, max(inB * 0.9, clearT));
  col *= 1.0 - 0.30 * rimM;
  col += (gF * 1.5 + P2 * 0.03) * crescM;
  col += (gF * 1.4 + mix(P2, vec3(1.0), 0.5) * 0.10) * specM;
  col += (gS * 1.2 + P2 * 0.05) * headA * 0.6;
  col += (gF * 0.9 + P0 * 0.04) * trail * smoothstep(0.4, 1.0, dx / trW);

  // water rims along the bars catch the light, then the steel itself, backlit with a cold top edge
  float wb = 0.008;
  float mv = (dV - wb - 0.0025) / 0.0016;
  float mh = (p.y - trY - wb - 0.003) / 0.0018;
  float meniscus = exp(-mv * mv) + exp(-mh * mh);
  col += (gF * 0.9 + P0 * 0.04) * meniscus * fog;
  float dBar = min(dV - wb, dH - wb * 1.4);
  float barA = 1.0 - smoothstep(-px, px, dBar);
  float cs = clamp(cx * bx / wb, -1.0, 1.0);
  vec3 steel = P3 * 0.04 + P0 * 0.07 * smoothstep(0.1, 0.9, cs) + gF * 0.25 * (1.0 - abs(cs));
  float boltY = fract(p.y * 7.0 + pane.x * 0.37);
  float bolt = (1.0 - smoothstep(0.0025, 0.0025 + px, length(vec2(cx * bx, (boltY - 0.5) / 7.0)))) * step(wb * 1.4, dH);
  steel += P0 * 0.10 * bolt;
  col = mix(col, steel, barA);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
