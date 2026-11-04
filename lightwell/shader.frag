// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Lightwell - looking up through a slot canyon. Four curved sandstone walls nest
// toward a bright meandering slit of sky. Each wall carries broad flowing ledges
// and fine cross-bedded laminae that interlock in zigzag teeth, with glittering
// mica grains and lit seams. Light bounces down from the slit: edges catch it,
// a hazy shaft slants across the middle distance and a slow golden-angle head
// of out-of-focus dust turns inside the shaft in front of the farther walls.
precision highp float;

uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest (unused)
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;   // height of the broad sandstone ledges in css px at the reference frame (default 46)
uniform float u_lock;    // depth of the zigzag teeth where ledges and fine laminae interlock (default 0.8)
uniform float u_bounce;  // strength of the light bouncing down from the slit onto the walls (default 1.0)
uniform float u_drift;   // speed of the slow drift of teeth, haze and dust (default 0.8)

vec3 C0, C1, C2, C3;
float TT, DR, X0;

float h21(vec2 p){
  p = fract(p * vec2(0.3719, 0.8153));
  p += dot(p, p.yx + vec2(5.19, 3.73));
  return fract((p.x * 1.7 + p.y) * (p.y + 0.61) * 11.3 + p.x * 2.3);
}
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 3; i++){
    s += a * vn(p);
    p = p * 2.03 + vec2(3.7, 8.3);
    a *= 0.5;
  }
  return s;
}
float rr(float x, float s){
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h21(vec2(i, s)), h21(vec2(i + 1.0, s)), f);
}
float tri(float x){ return abs(fract(x) * 2.0 - 1.0); }

// dark navy to theme blue, violet, cyan and a pale cyan-white peak
vec3 ramp(float k){
  k = clamp(k, 0.0, 1.0) * 4.0;
  vec3 c = mix(vec3(0.0), C0 * 0.5, clamp(k, 0.0, 1.0));
  c = mix(c, C1 * 0.85, clamp(k - 1.0, 0.0, 1.0));
  c = mix(c, C2, clamp(k - 2.0, 0.0, 1.0));
  c = mix(c, mix(C2, vec3(1.0), 0.65), clamp(k - 3.0, 0.0, 1.0));
  return c;
}

// centre line of the opening in wall fi (0 = farthest, 3 = nearest)
float slitC(float fi, float y){
  float z = fi / 3.0;
  return X0 + 0.16 * y - (z - 0.4) * 0.09
       + (0.08 + 0.04 * z) * sin(y * (2.2 - 0.6 * z) + fi * 1.9 + TT * 0.045)
       + 0.035 * sin(y * 5.7 + fi * 3.1 - TT * 0.06);
}
// half width of the opening: lens shaped, eroded, wider on nearer walls
float slitW(float fi, float y){
  float z = fi / 3.0;
  float base = mix(0.07, 0.46, z * z * 0.6 + z * 0.4);
  float yy = y - 0.04 - 0.10 * sin(fi * 2.3 + TT * 0.03);
  float bump = 1.0 - smoothstep(0.15, 0.7 + 0.5 * z, abs(yy));
  float er = rr(y * (5.0 + 3.0 * z) + fi * 7.0 + 31.0, fi + 5.0) * 0.6
           + rr(y * 17.0 + fi * 3.0 + 41.0, fi + 9.0) * 0.4;
  return base * (0.3 + 0.7 * bump) * (0.78 + 0.44 * er);
}

void main(){
  C0 = u_palette[0]; C1 = u_palette[1]; C2 = u_palette[2]; C3 = u_palette[3];
  if (dot(C0,C0)+dot(C1,C1)+dot(C2,C2)+dot(C3,C3) < 1e-5) {
    C0 = vec3(0.231,0.510,0.965); C1 = vec3(0.659,0.333,0.969);
    C2 = vec3(0.133,0.827,0.933); C3 = vec3(0.957,0.247,0.369);
  }
  vec2 res = max(u_resolution, vec2(1.0));
  float mn = min(res.x, res.y);
  float AR = res.x / res.y;
  float pr = max(u_pixelRatio, 1.0);
  vec2 q = (gl_FragCoord.xy - 0.5 * res) / mn;
  TT = u_time;
  DR = TT * 0.02 * (0.25 + u_drift);
  float aa = 1.5 * pr / mn;
  X0 = 0.13 * AR + 0.02;

  // sky seen through the slit: cyan-white at the top, deeper blue low, soft cirrus
  float sy = clamp(q.y * 0.8 + 0.5, 0.0, 1.0);
  vec2 sdv = q - vec2(X0 + 0.08, 0.40);
  float glare = exp(-dot(sdv, sdv) * 5.0);
  float cl = fbm(vec2(q.x * 2.2 + DR * 5.0, q.y * 11.0 - TT * 0.01));
  vec3 col = mix(C0 * 0.7, mix(C2, vec3(1.0), 0.5), sy * sy * (0.6 + 0.5 * cl));
  col = col * 0.9 + mix(C2, vec3(1.0), 0.7) * glare * 0.7;
  col *= 0.93 + 0.07 * sin(TT * 0.2);

  // slanted shaft of bounced light falling from the top of the slit
  vec2 P0 = vec2(X0 + 0.06, 0.42);
  vec2 dB = normalize(vec2(-0.42, -1.0));
  vec2 rp = q - P0;
  float along = dot(rp, dB);
  float perp = rp.x * dB.y - rp.y * dB.x;
  float wb = 0.03 + 0.17 * max(along, 0.0);
  float beam = exp(-(perp / wb) * (perp / wb)) * smoothstep(-0.02, 0.12, along) * exp(-max(along, 0.0) * 0.9);
  float streak = 0.55 + 0.9 * vn(vec2(perp * 22.0 + DR * 8.0, along * 3.0 - TT * 0.05));
  float beamV = beam * streak * 0.42;

  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float z = fi / 3.0;
    float soft = (1.0 - z) * (1.0 - z);
    float blur = aa + 0.012 * soft;
    float cx = slitC(fi, q.y);
    float hw = slitW(fi, q.y);
    float e = q.x - cx;
    float d = abs(e) - hw;
    float dd = max(d, 0.0);
    float a = smoothstep(-blur, blur, d);

    // flowing strata coordinate: dipping beds that bow upward away from the slit
    float bh = max(u_scale, 20.0) / 400.0 * mix(0.8, 1.7, z);
    float dip = 0.2 * cos(fi * 1.9 + 0.5);
    float wy = q.y + dip * e + 0.26 * dd * dd
             + 0.09 * sin(q.x * 3.0 + fi * 2.1 + TT * 0.04)
             + 0.045 * sin(q.x * 8.0 - q.y * 3.0 + fi * 1.3 - TT * 0.05);

    // bounce light: strongest near the slit edge and high up, plus the shaft
    float nr = exp(-dd * mix(8.0, 4.5, z));
    float topL = smoothstep(-0.55, 0.45, q.y);
    float illum = u_bounce * (0.22 + nr * (0.55 + 0.7 * topL) + 0.9 * beamV * (1.0 - 0.5 * z));
    float warm = nr * (1.0 - smoothstep(-0.5, 0.15, q.y)) * u_bounce;

    // broad structure: rounded ledges with a lit crest and a shadowed underside
    float bi = wy / bh;
    float ib = floor(bi);
    float fr = bi - ib;
    float hb = h21(vec2(ib, fi * 3.0 + 1.0));
    float ledge = smoothstep(0.0, 0.25, fr) * (1.0 - 0.95 * smoothstep(0.72, 1.0, fr));
    float cr = (fr - 0.78) / 0.07;
    float crest = exp(-cr * cr);
    float flute = vn(vec2(e * 9.0 + fi * 5.0, wy * 2.0));
    float gr = fbm(vec2(q.x * 12.0 + fi * 7.0, wy * 20.0));
    float lL = (0.2 + 0.9 * ledge) * (0.65 + 0.7 * hb) * (0.7 + 0.5 * flute) * (0.8 + 0.4 * gr);
    lL += 0.5 * crest * (0.3 + nr);
    vec3 colL = ramp(lL * illum * 0.75) * (0.7 + 0.6 * mix(C0, C1, hb));
    colL += C3 * warm * (0.15 + 0.5 * ledge) * 0.5 * (0.6 + 0.8 * hb);

    // fine structure: cross-bedded laminae with glittering mica grains
    float pfy = (wy * 0.9 + e * 0.55) / (bh * 0.28);
    float lam = tri(pfy);
    float fw = min(aa * 3.0 / (bh * 0.28), 0.4);
    float lamL = 1.0 - smoothstep(0.3, 0.4 + fw, lam);
    float lF = (0.25 + 0.7 * lamL) * (0.7 + 0.5 * vn(vec2(pfy * 0.35, e * 14.0 + fi)));
    vec2 gp = vec2(e, wy) / 0.012;
    vec2 gi = floor(gp);
    float gh = h21(gi + fi * 13.0);
    float gdist = length(gp - gi - 0.5);
    float twk = 0.5 + 0.5 * sin(TT * (1.0 + gh * 2.0) + gh * 60.0);
    float spark = smoothstep(0.84, 1.0, gh) * (1.0 - smoothstep(0.1, 0.38, gdist)) * twk;
    vec3 colF = ramp(lF * illum * 0.8 + 0.04) * mix(vec3(1.0), C2 * 1.3, 0.4);
    colF += mix(C2, vec3(1.0), 0.45) * spark * u_bounce * (0.3 + nr) * (1.0 - 0.6 * soft);

    // dovetail bands: broad and fine structures alternate with zigzag teeth
    float Bh = bh * 3.2;
    float tp = Bh * 1.25;
    float s = wy / Bh + 0.35 + u_lock * tri((q.x + DR * mix(0.5, 2.5, z) + fi * 1.3) / tp);
    float w = abs(fract(s * 0.5) * 2.0 - 1.0);
    float gs = length(vec2(1.0 / Bh, 2.0 * u_lock / tp));
    float aw = min((aa * 1.5 + 0.3 * blur) * gs, 0.45);
    float mL = smoothstep(0.5 - aw, 0.5 + aw, w);
    vec3 lay = mix(colF, colL, mL);

    // lit seam along every joint, warmer low where the floor reflects
    float sm = 1.0 - smoothstep(0.0, aw + 0.05, abs(w - 0.5));
    lay += mix(C2, vec3(1.0), 0.35) * sm * (0.18 + 0.3 * nr) * u_bounce * (1.0 - 0.7 * soft);
    lay += C3 * sm * warm * 0.3;

    // occlusion near the edge of the wall in front
    float shade = 1.0;
    if (fi < 2.5) {
      float cn = slitC(fi + 1.0, q.y);
      float hn = slitW(fi + 1.0, q.y);
      float dN = hn - abs(q.x - cn);
      shade = mix(0.35, 1.0, smoothstep(0.0, 0.14, dN));
    }
    lay *= shade;

    // blue atmosphere on the far walls
    vec3 haze = mix(C0 * 0.30, C1 * 0.30 + C0 * 0.2, smoothstep(-0.4, 0.4, q.y));
    lay = mix(lay, haze, 0.45 * soft);

    // bright lit edge of the wall, strongest high up near the sky
    float rw = aa * 2.0 + blur * 1.2;
    float rim = 1.0 - smoothstep(0.0, rw, abs(d));
    lay += mix(C2, vec3(1.0), 0.4) * rim * u_bounce * (0.25 + 0.55 * topL) * (0.5 + 0.5 * z);

    // light spilling into the opening over whatever lies behind
    float mist = fbm(vec2(q.x * 1.6 + fi * 3.0 + DR * (fi - 1.5) * 3.0, q.y * 2.2 - TT * 0.015));
    vec3 gcol = mix(C2, C1, 0.25 + 0.5 * z);
    vec3 glow = gcol * exp(-max(-d, 0.0) * mix(5.0, 9.0, z)) * (0.08 + 0.3 * mist) * (0.4 + 0.8 * topL) * u_bounce;
    col += glow * (1.0 - a);

    col = mix(col, lay, a);

    if (i == 1) {
      col += (mix(C2, vec3(1.0), 0.35) * 0.6 + C1 * 0.2) * beamV * u_bounce * 0.55;
    }

    if (i == 2) {
      // dust turning in the shaft: golden-angle head of out-of-focus discs
      vec2 cM = P0 + dB * 0.55 + vec2(0.04 * sin(TT * 0.11), 0.03 * cos(TT * 0.09));
      float rotM = TT * 0.10 * (0.4 + u_drift * 0.6) + 0.7;
      float bestM = 1e9;
      float biM = 0.0;
      for (int k = 0; k < 44; k++) {
        float fk = float(k);
        float an = fk * 2.39996 + rotM;
        float rad = sqrt(fk) * 0.052;
        vec2 sd = cM + vec2(cos(an) * 0.8, sin(an) * 1.35) * rad;
        vec2 dv = q - sd;
        float d2 = dot(dv, dv);
        if (d2 < bestM) { bestM = d2; biM = fk; }
      }
      float hk = h21(vec2(biM, 4.7));
      float dR = 0.052 * (0.28 + 0.4 * hk);
      float rM = sqrt(bestM) / dR;
      float sft = 0.12 + 1.2 * aa / dR;
      float dsc = 1.0 - smoothstep(1.0 - sft, 1.0 + sft, rM);
      float rimM = smoothstep(0.55, 1.0, rM);
      float twm = 0.6 + 0.4 * sin(TT * (0.5 + hk) + biM * 1.7);
      float fade = 1.0 - 0.8 * smoothstep(30.0, 44.0, biM);
      vec3 mc = mix(mix(C2, vec3(1.0), 0.4), C3, 0.35 * hk) * (0.35 + 0.65 * rimM);
      col += mc * dsc * (0.12 + 1.3 * beam) * twm * fade * 0.5 * u_bounce;
    }
  }

  col = 1.0 - exp(-col * 1.25);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
