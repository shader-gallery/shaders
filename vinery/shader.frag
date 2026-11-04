// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// a tomato house at night seen through its fogged steel-framed wall. Inside, the
// air is a cold moonlit blue: tall vines climb their strings in rows that recede
// down the aisle, heating pipes run along the floor, and sodium lamps hang above
// the crop, lighting the upper leaves from above and glowing through them. On the
// near glass, beads hold small inverted lamps and drops slip down in fits and
// starts, leaving cleared wet trails that open sharp windows onto the crop.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fog;    // condensation density on the glass (default 0.42)
uniform float u_beads;  // bead size on the glass (default 1.0)
uniform float u_run;    // speed of the running drops (default 0.14)
uniform float u_panes;  // panes across the frame height (default 2.4)

float h21(vec2 p) { return fract(sin(dot(p, vec2(27.619, 71.443))) * 5273.917); }
vec2 h22(vec2 p) { return vec2(h21(p), h21(p + vec2(11.37, 6.83))); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i); float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0)); float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.11 + vec2(7.3, 12.9); a *= 0.5; }
  return s;
}

const vec2 VP = vec2(0.22, 0.03);
const float ROOF = 0.78;
const float LAMPY = 0.46;
const float FLOOR = 0.62;
const float ROWS = 0.8;

const vec3 NIGHT = vec3(0.004, 0.014, 0.045);
const vec3 BLUE = vec3(0.03, 0.10, 0.30);
const vec3 COLDHI = vec3(0.55, 0.74, 1.0);

// one slice of the crop rows at depth z: vines on strings with lobed leaves
vec4 plant(vec2 q, float z, float li, float px0, float t, vec3 cA, vec3 cB, vec3 cC, vec3 cD) {
  vec2 r = q - VP;
  float wx = r.x * z; float wy = r.y * z;
  float k = floor(wx / ROWS);
  float X = (k + 0.5) * ROWS;
  float u = wx - X;
  float hk = h21(vec2(k + 3.0, li * 7.3 + 1.0));
  float hk2 = h21(vec2(k * 1.7, li * 2.1 + 5.0));
  float present = step(0.1, hk) * step(0.3, abs(X));
  float top = 0.02 + 0.3 * hk2;
  float px = px0 * z;
  float sway = 0.018 * sin(t * 0.35 + hk * 6.0 + wy * 1.5);
  float us = 0.03 * sin(wy * 5.0 + hk * 20.0) + sway * smoothstep(-FLOOR, top, wy);

  // stem, and the string that carries it up to the wire
  float stem = (1.0 - smoothstep(0.007, 0.007 + px, abs(u - us))) * step(-FLOOR, wy) * smoothstep(top + 0.02 + px, top - 0.02 - px, wy);
  float str = (1.0 - smoothstep(0.0015, 0.0015 + px, abs(u - sway))) * smoothstep(top - px, top + px, wy) * step(wy, LAMPY - 0.03) * 0.35 * smoothstep(3.0, 1.5, z);

  float m = 0.0; float la = 0.0; float lc = 0.0; float lsd = 0.0;
  float sp = 0.095;
  float j0 = floor(wy / sp);
  for (int o = -1; o <= 2; o++) {
    float j = j0 + float(o);
    float yj = (j + 0.5) * sp;
    float hj = h21(vec2(j * 1.3, k + li * 3.0));
    float side = mod(j, 2.0) < 0.5 ? 1.0 : -1.0;
    if (hj > 0.82) side = -side;
    float ang = 0.45 - 0.75 * hj + 0.05 * sin(t * 0.5 + j);
    vec2 dir = vec2(side * cos(ang), sin(ang));
    vec2 up = side * vec2(-dir.y, dir.x);
    vec2 base = vec2(0.03 * sin(yj * 5.0 + hk * 20.0) + sway, yj);
    vec2 d = vec2(u, wy) - base;
    float L = 0.24 * (0.7 + 0.6 * h21(vec2(j, k * 2.3 + li))) * (0.45 + 0.55 * smoothstep(top + 0.05, top - 0.35, yj));
    float a = dot(d, dir) / L;
    float c = dot(d, up) / L + 0.32 * a * a;
    float w = 0.48 * sqrt(clamp(a, 0.0, 1.0)) * (1.0 - a);
    w *= (0.72 + 0.28 * sin(a * 10.0 + hj * 5.0)) * (1.0 + 0.1 * sin(a * 41.0 + hj * 9.0));
    float sd = (w - abs(c)) * L;
    float lm = smoothstep(-px, px, sd) * smoothstep(top + 0.06, top - 0.02, yj) * step(-FLOOR + 0.12, yj);
    if (lm > m) { la = a; lc = c; lsd = sd / L; }
    m = max(m, lm);
  }
  float alpha = max(max(m, stem), str) * present;

  // light falls from the lamps above: warm on top, blue shade below
  float illum = exp(-max(LAMPY - wy, 0.0) * 1.7);
  float vein = (1.0 - smoothstep(0.0, 0.035, abs(lc))) + (1.0 - smoothstep(0.0, 0.12, abs(fract(la * 5.0 - abs(lc) * 3.0) - 0.5))) * 0.6;
  float tex = vn(vec2(la * 9.0, lc * 14.0) + hk * 30.0);
  vec3 body = NIGHT * 1.2 + BLUE * 0.42 * (1.0 - illum) * (0.5 + 0.7 * tex) * (1.0 - 0.5 * clamp(vein, 0.0, 1.0));
  float tissue = (0.5 + 0.5 * tex) * (1.0 - 0.6 * clamp(vein, 0.0, 1.0));
  float il2 = illum * illum;
  vec3 glow = mix(cA, cC, il2 * illum) * il2 * 1.3 * tissue;
  vec3 col = body + glow * 1.1;
  float rim = (1.0 - smoothstep(0.0, 0.06, lsd)) * smoothstep(-0.05, 0.1, lc);
  col += mix(COLDHI * 0.3, cB * 0.9, illum) * rim * m;
  vec3 stc = NIGHT + cD * 0.25 * illum;
  col = mix(col, stc, max(stem, str) * (1.0 - m));
  // depth haze in the cold air
  float hz = 1.0 - exp(-z * 0.16);
  col = mix(col, BLUE * 0.32 + cD * 0.04, hz * 0.8);
  return vec4(col, alpha);
}

// what lies behind the glass, b = blur radius in frame units
vec3 scene(vec2 q, float b, float t, vec3 cA, vec3 cB, vec3 cC, vec3 cD) {
  vec2 r = q - VP;
  float aa0 = b + 0.0015;
  float air = exp(-length(r * vec2(0.8, 1.5)) * 2.2);
  vec3 col = NIGHT + BLUE * (0.25 + 0.6 * air) * smoothstep(-0.7, 0.4, q.y);

  // glass roof: night sky, dark rafters and purlins catching lamp light below
  if (r.y > 0.0) {
    float z = ROOF / max(r.y, 0.003);
    float X = r.x * z;
    col += BLUE * 0.3 * smoothstep(0.0, 0.35, r.y);
    float du = abs(fract(X / ROWS) - 0.5) * ROWS / z;
    float raf = 1.0 - smoothstep(0.012 / z, 0.012 / z + aa0, du);
    float zk = 1.5 * floor(z / 1.5 + 0.5);
    float dp = abs(r.y - ROOF / max(zk, 0.1));
    float pur = (1.0 - smoothstep(0.008 / max(zk, 0.1), 0.008 / max(zk, 0.1) + aa0, dp)) * step(0.5, zk);
    float beam = max(raf, pur) * step(0.6, z);
    col = mix(col, NIGHT * 0.6 + cA * 0.07 * exp(-z * 0.15), beam * 0.85);
  }

  // concrete aisle, wet, with heating pipe rails along each row
  if (r.y < 0.0) {
    float z = FLOOR / max(-r.y, 0.003);
    float X = r.x * z;
    float wet = vn(vec2(X * 5.0, z * 1.5));
    col = NIGHT * 0.9 + BLUE * 0.12 * exp(-z * 0.1);
    float lane = exp(-pow(abs(fract(X / ROWS + 0.5) - 0.5) * ROWS * 6.0, 2.0));
    col += cA * 0.05 * lane * smoothstep(0.4, 0.8, wet) * exp(-z * 0.15) + BLUE * 0.05 * wet * lane;
    for (int i = 0; i < 4; i++) {
      float Xp = (float(i) - 1.5) * ROWS;
      for (int s = 0; s < 2; s++) {
        float xo = Xp + (float(s) - 0.5) * 0.36;
        float yo = FLOOR - 0.07;
        float zp = yo / max(-r.y, 0.003);
        float dd = abs(r.x - xo / zp);
        float pw = 0.01 / zp;
        float pm = 1.0 - smoothstep(pw, pw + aa0, dd);
        float sh = 1.0 - smoothstep(0.0, pw + aa0, dd + pw * 0.5);
        col = mix(col, NIGHT * 0.7 + (cB * 0.12 * sh + COLDHI * 0.03 * sh) * exp(-zp * 0.15), pm);
      }
    }
  }

  // sodium lamps hung in rows above the crop
  for (int i = 0; i < 4; i++) {
    float X = (float(i) - 1.5) * ROWS;
    for (int k = 0; k < 6; k++) {
      float fi = float(i * 6 + k);
      float z = 1.05 + float(k) * 1.5 + 0.4 * fract(float(i) * 0.61);
      vec2 s = VP + vec2(X + 0.015 * sin(t * 0.31 + fi * 1.9), LAMPY) / z;
      vec2 d = q - s;
      float rx = 0.07 / z; float ry = 0.016 / z;
      float sx = rx * rx + b * b; float sy = ry * ry + b * b;
      float core = exp(-d.x * d.x / sx - d.y * d.y / sy) * rx * ry / sqrt(sx * sy);
      float hx = rx * 4.5 + b; float hy = ry * 9.0 + b;
      float halo = exp(-d.x * d.x / (hx * hx) - d.y * d.y / (hy * hy));
      float dy = -d.y;
      float cw = rx * 0.8 + max(dy, 0.0) * 0.5 + b + 1e-4;
      float cone = exp(-d.x * d.x / (cw * cw)) * smoothstep(0.0, 0.02 / z + b, dy) * exp(-max(dy, 0.0) * z * 1.6);
      float sharp = 1.0 - smoothstep(0.004, 0.025, b);
      float hood = (1.0 - smoothstep(rx * 1.05, rx * 1.2, abs(d.x))) * step(0.0, d.y) * (1.0 - smoothstep(ry * 1.2, ry * 2.4, d.y));
      col *= 1.0 - 0.85 * hood * sharp;
      float dep = smoothstep(1.0, 8.0, z);
      vec3 lc = mix(mix(cC, cB, smoothstep(0.0, 0.4, dep)), cA, smoothstep(0.4, 1.0, dep));
      float pw = 1.0 / (1.0 + 0.15 * z);
      col += lc * pw * (core * 3.6 + halo * 0.6 + cone * 0.16);
    }
  }

  // crop slices, far to near
  vec4 s5 = plant(q, 7.0, 5.0, aa0, t, cA, cB, cC, cD); col = mix(col, s5.rgb, s5.a);
  vec4 s4 = plant(q, 4.6, 4.0, aa0, t, cA, cB, cC, cD); col = mix(col, s4.rgb, s4.a);
  vec4 s3 = plant(q, 3.0, 3.0, aa0, t, cA, cB, cC, cD); col = mix(col, s3.rgb, s3.a);
  vec4 s2 = plant(q, 1.95, 2.0, aa0, t, cA, cB, cC, cD); col = mix(col, s2.rgb, s2.a);
  vec4 s1 = plant(q, 1.3, 1.0, aa0, t, cA, cB, cC, cD); col = mix(col, s1.rgb, s1.a);
  vec4 s0 = plant(q, 0.82, 0.0, aa0, t, cA, cB, cC, cD); col = mix(col, s0.rgb, s0.a);
  return col;
}

// one scale of beads: xy = lens normal, z = radius, w = presence
vec4 bead(vec2 x, float cs, float seed, float cover, float sz) {
  vec2 g = x / cs; vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
  vec2 h = h22(id + seed);
  float h3 = h21(id * 1.41 + seed + 3.7);
  float h4 = h21(id + seed * 2.9 + 8.3);
  vec2 e = (fr - (h - 0.5) * 0.5) * cs;
  e.y *= e.y > 0.0 ? 1.15 : 0.88;
  float r = cs * min(sz * (0.07 + 0.2 * h3 * h3), 0.24);
  float ang = atan(e.y, e.x);
  r *= 1.0 + 0.07 * sin(ang * 3.0 + h3 * 17.0) + 0.04 * sin(ang * 5.0 + h4 * 23.0);
  return vec4(e / r, r, step(h4, cover));
}

void main() {
  vec2 res = u_resolution;
  float mn = min(res.x, res.y);
  float pr = max(u_pixelRatio, 1.0);
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / mn;
  float t = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float aa = 1.2 * pr / mn;
  float n = max(u_panes, 1.5);
  vec2 cell = vec2(0.9 / n, 1.5 / n);
  vec2 uv = p + vec2(0.11, 0.23);
  vec2 gid = floor(uv / cell);
  vec2 f = uv / cell - gid;
  float hp = h21(gid + 2.0);

  // condensation, heavier toward the bottom of each pane where it pools
  float fq = fbm(p * 2.4 + gid * 1.9 + vec2(0.0, t * 0.015));
  float fogf = clamp(u_fog * (0.6 + 0.6 * hp) * (0.45 + 0.95 * fq) * (1.15 - 0.4 * f.y), 0.0, 1.0);
  float cover = 0.15 + 0.85 * fogf;
  float sz = max(u_beads, 0.2);

  vec4 bA = bead(p, 0.075, 1.0, cover * 0.75, sz);
  vec4 bB = bead(p + vec2(3.7, 1.9), 0.036, 5.0, cover, sz);
  vec4 bC = bead(p + vec2(7.1, 2.3), 0.016, 9.0, cover, sz);
  float lA = length(bA.xy); float lB = length(bB.xy); float lC = length(bC.xy);
  float mA = (1.0 - smoothstep(1.0 - aa / bA.z, 1.0, lA)) * bA.w;
  float mB = (1.0 - smoothstep(1.0 - aa / bB.z, 1.0, lB)) * bB.w * (1.0 - mA);
  float mC = (1.0 - smoothstep(1.0 - aa / bC.z, 1.0, lC)) * bC.w * (1.0 - mA) * (1.0 - mB);
  vec2 nrm = bA.xy * mA + bB.xy * mB + bC.xy * mC;
  float rad = bA.z * mA + bB.z * mB + bC.z * mC;
  float dm = mA + mB + mC;
  float halo = max((1.0 - smoothstep(1.0, 1.6, lA)) * bA.w, (1.0 - smoothstep(1.0, 1.6, lB)) * bB.w);

  // running drops, per pane, in fits and starts
  float x = f.x * cell.x;
  float cw = 0.045;
  float cid = floor(x / cw);
  float xw = fract(x / cw) - 0.5;
  vec2 sk = vec2(cid, gid.x * 5.0 + gid.y * 11.0);
  float sd = h21(sk + 0.5);
  float sd2 = h21(sk + 8.5);
  float live = step(0.5, sd);
  float ph = fract(sd * 7.31 + t * u_run * (0.5 + 0.8 * sd2) * 0.6);
  float v = ph * 5.0;
  v = floor(v) + smoothstep(0.25, 1.0, fract(v));
  float head = (1.0 - v / 5.0) * cell.y;
  float yy = f.y * cell.y;
  float dh = yy - head;
  float al = smoothstep(0.0, 0.06, ph) * smoothstep(1.0, 0.9, ph) * live;
  float wig = (vn(vec2(yy * 22.0, sd * 50.0)) - 0.5) * 0.45 + (vn(vec2(yy * 70.0, sd * 13.0)) - 0.5) * 0.12;
  float xw2 = xw + wig;
  float tl = cell.y * (0.4 + 0.55 * sd2);
  float tw = 0.14 + 0.03 * sin(yy * 90.0 + sd * 20.0);
  float tin = smoothstep(0.0, 0.006, dh) * (1.0 - smoothstep(tl * 0.5, tl, dh)) * al;
  float trail = tin * (1.0 - smoothstep(tw - 0.03, tw, abs(xw2)));
  float edge = tin * smoothstep(tw - 0.05, tw - 0.01, abs(xw2)) * (1.0 - smoothstep(tw - 0.01, tw + 0.02, abs(xw2)));
  float sy = yy / 0.014;
  float sid = floor(sy);
  float sh = h21(vec2(sid, cid + gid.x * 3.0));
  vec2 sdv = vec2(xw2 * cw - (sh - 0.5) * 0.06 * cw, (fract(sy) - 0.5) * 0.014);
  float srr = 0.0018 + 0.0022 * h21(vec2(sid * 1.3, cid));
  float sl = length(sdv) / srr;
  float sm = (1.0 - smoothstep(0.75, 1.0, sl)) * step(0.55, sh) * trail * step(0.02, dh);
  float rd = (0.0075 + 0.004 * sd2) * sz;
  vec2 hv = vec2(xw2 * cw, dh);
  hv.y *= hv.y > 0.0 ? 0.55 : 1.05;
  float hl = length(hv) / rd;
  float hm = (1.0 - smoothstep(1.0 - aa / rd, 1.0, hl)) * al;
  nrm = mix(nrm, hv / rd, hm);
  rad = mix(rad, rd, hm);
  nrm = mix(nrm, sdv / srr, sm * (1.0 - hm));
  rad = mix(rad, srr, sm * (1.0 - hm));
  float mAll = max(max(dm * (1.0 - trail), hm), sm);
  float clr = max(trail, 0.0);

  // fogged view, and the inverted view each lens holds
  float bFog = 0.006 + 0.06 * fogf * (1.0 - 0.5 * halo);
  float bc = mix(bFog, 0.002, clr);
  vec3 fogS = scene(p, bc, t, c0, c1, c2, c3);
  vec2 ctr = p - nrm * rad;
  vec3 lensS = scene(ctr - nrm * 0.16, 0.006, t, c0, c1, c2, c3);
  float l = length(nrm);
  vec3 glass = mix(fogS, lensS * 1.15, mAll);

  // mist: scatters lamp light warm and the night blue cold
  float fm2 = (1.0 - clr) * (1.0 - mAll) * fogf;
  float mist = vn(p * 240.0 + gid * 3.0);
  float lum = dot(fogS, vec3(0.3, 0.55, 0.15));
  glass *= mix(1.0, 0.8 + 0.3 * mist, fm2);
  glass += c2 * smoothstep(0.8, 0.96, mist) * 0.35 * lum * fm2;
  glass += BLUE * 0.09 * fogf * (1.0 - clr) * (0.6 + 0.4 * fq);

  // lens edge: dark refraction band, a caustic crescent below, cold glints above
  float band = smoothstep(0.55, 0.97, l);
  glass *= 1.0 - 0.75 * band * mAll;
  float caus = smoothstep(0.5, 0.82, l) * (1.0 - smoothstep(0.84, 0.97, l)) * smoothstep(0.1, 0.8, -nrm.y);
  glass += mix(c1, c2, 0.5) * caus * mAll * (0.12 + 1.5 * lum);
  float gl1 = 1.0 - smoothstep(0.0, 0.2, length(nrm - vec2(-0.32, 0.5)));
  float gl2 = 1.0 - smoothstep(0.0, 0.1, length(nrm - vec2(0.42, 0.28)));
  glass += COLDHI * (gl1 * 0.5 + gl2 * 0.22) * mAll;
  glass += c1 * edge * (0.05 + 0.8 * lum);
  glass *= 1.0 - 0.3 * edge * (1.0 - lum);
  glass *= 0.85 + 0.3 * hp;

  // steel frame, cold moonlit outer edges, warm spill from inside
  float bwx = 0.010; float bwy = 0.012;
  float dxe = min(f.x, 1.0 - f.x) * cell.x;
  float dye = min(f.y, 1.0 - f.y) * cell.y;
  float mx = 1.0 - smoothstep(bwx - aa, bwx + aa, dxe);
  float my = 1.0 - smoothstep(bwy - aa, bwy + aa, dye);
  float fmask = max(mx, my);
  float ex = smoothstep(bwx * 0.4, bwx, dxe);
  float ey = smoothstep(bwy * 0.4, bwy, dye);
  float rimC = max(ex * step(0.5, f.x) * mx, ey * (1.0 - step(0.5, f.y)) * my);
  float rimW = max(ex * (1.0 - step(0.5, f.x)) * mx, ey * step(0.5, f.y) * my);
  float wv = mx / (mx + my + 0.001);
  float streak = mix(vn(vec2(p.x * 9.0, p.y * 500.0)), vn(vec2(p.x * 500.0, p.y * 9.0)), wv);
  vec3 steel = NIGHT * 1.6 + COLDHI * 0.3 * rimC;
  steel += fogS * 0.9 * rimW + c3 * 0.04 * rimW;
  steel *= 0.7 + 0.55 * streak;
  float dEdge = min(dxe - bwx, dye - bwy);
  glass *= mix(0.6, 1.0, smoothstep(0.0, 0.035, dEdge));
  float pool = (1.0 - smoothstep(0.0, 0.012, (f.y * cell.y) - bwy)) * step(bwy, f.y * cell.y);
  glass += c1 * pool * (0.04 + 0.6 * lum) * (0.6 + 0.4 * vn(vec2(p.x * 60.0, 1.0)));
  vec3 col = mix(glass, steel, fmask);

  // bolts at the crossings
  vec2 gp = (f - floor(f + 0.5)) * cell;
  float bd = length(gp);
  float br = 0.0065;
  float bm = 1.0 - smoothstep(br - aa, br + aa, bd);
  float bh = smoothstep(0.2, 0.95, dot(gp, vec2(-0.7, 0.7)) / br);
  vec3 bcol = NIGHT * 2.0 + COLDHI * 0.3 * bh + c3 * 0.06 * (1.0 - bh);
  col = mix(col, bcol, bm);

  // near-white lamp cores, soft shoulder
  float mxc = max(col.r, max(col.g, col.b));
  col = mix(col, vec3(1.0, 0.96, 0.86) * mxc, smoothstep(0.7, 1.6, mxc) * 0.5);
  col = col / (1.0 + 0.22 * col);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
