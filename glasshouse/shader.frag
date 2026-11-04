// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Greenhouse at night. Seen from outside at a slant, a steel framed glass
// wall recedes to the right. Behind the fogged panes rows of magenta and
// violet grow lights hang over benches of backlit plants, with warm sodium
// lamps between them. Condensation beads on the glass, each bead a small lens
// that shows the room sharp and upside down, and drops run down the panes
// leaving clear trails that slowly fog over again. The wet path in front
// mirrors the glow, and the sky above the eave is lit by it.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fog;     // density of the condensation fog on the glass  (default 1.0)
uniform float u_drip;    // how many drops run down the panes             (default 1.0)
uniform float u_lights;  // brightness of the grow lights inside          (default 1.0)

const float CA = 0.866;    // wall direction, cos and sin of its turn
const float SA = 0.5;
const float SILL = -0.36;  // heights on the wall, eye level at 0
const float EAVE = 0.45;
const float FOOT = -0.55;
const float BAY = 0.36;    // mullion spacing along the wall
const float MID = 0.06;    // height of the glazing bar
const float D0 = 1.3;      // distance from the eye to the wall

vec3 c0, c1, c2, c3;
float gT, gL;

float hs(vec2 p) {
  return fract(sin(dot(p, vec2(41.73, 289.17))) * 51731.37);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x),
             mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(0.6, 0.8, -0.8, 0.6) * p * 2.07 + vec2(3.1, 5.3);
    a *= 0.5;
  }
  return s;
}

// a plane parallel to the wall, set back by b: depth along screen column sx,
// and the coordinate along the wall it meets there
float planeZ(float sx, float b, out float u) {
  u = (sx * (D0 + b * CA) + b * SA) / max(CA - sx * SA, 0.05);
  return D0 + u * SA + b * CA;
}

// the room behind the glass; bl 0 is sharp, 1 is fully diffused by fog
vec3 interior(vec2 s, float bl) {
  vec3 col = c0 * 0.02;
  // humid air lit by the lamps
  col += (c0 * 0.07 + c1 * 0.04) * exp(-(s.y - 0.1) * (s.y - 0.1) * 12.0) * gL;
  float u, Z;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float b = 2.6 - 0.75 * fk;       // far rows first
    float ri = 3.0 - fk;
    Z = planeZ(s.x, b, u);
    vec3 tint = mod(ri, 2.0) < 0.5 ? mix(c1, c0, 0.3) : mix(c0, c1, 0.2);
    if (ri > 2.5) tint = mix(c2, c0, 0.45);
    // bar fixtures along the row with gaps between them
    float fu = fract(u / 0.62 + ri * 0.37);
    float on = smoothstep(0.0, 0.03, fu) * smoothstep(0.82, 0.79, fu);
    on = mix(on, 0.7, bl);
    float dy = s.y - 0.33 / Z;
    float w0 = 0.012 / Z;
    float w = w0 + 0.035 * bl;
    float glow = exp(-dy * dy / (w * w)) * sqrt(w0 / w);
    vec3 hot = mix(tint, vec3(1.0, 0.92, 0.98), 0.45);
    col += (hot * glow * 1.5 + tint * 0.04 * exp(-abs(dy) / (0.04 + 0.1 * bl))) * on * gL;
    // light falling from the bar into the haze
    float cone = smoothstep(0.0, -0.03, dy) * exp(dy * 2.5 * Z);
    col += tint * 0.05 * cone * (0.4 + 0.6 * on) * gL / Z;

    // sodium lamps hang between the second and third rows
    if (k == 1) {
      float lu = (fract(u / 0.9 + 0.2) - 0.5) * 0.9;
      vec2 dl = vec2(lu, s.y * Z - 0.42) / Z;
      float ws = 0.009 + 0.045 * bl;
      float lg = exp(-dot(dl, dl) / (ws * ws)) * sqrt(0.009 / ws);
      float lg4 = lg * lg; lg4 *= lg4;
      col += (c3 * lg * 1.5 + mix(c3, vec3(1.0, 0.97, 0.85), 0.5) * lg4 * 1.2 + c3 * 0.22 * exp(-length(dl) * 6.0)) * gL;
    }

    // plants on the bench: scalloped leaf tops of varied height
    float y = s.y * Z;
    float lob = abs(sin(u * 13.0 + 4.0 * vn(vec2(u * 3.0, ri))));
    float lob2 = abs(sin(u * 31.0 + 6.0 * vn(vec2(u * 7.0, ri + 5.0))));
    float ht = -0.04 + 0.16 * vn(vec2(u * 2.2, ri * 7.0))
             + 0.045 * lob * (0.4 + vn(vec2(u * 6.0, ri + 3.0))) + 0.015 * lob2;
    float ew = (0.0025 + 0.05 * bl) * Z;
    float m = smoothstep(ew, -ew, y - ht);
    float d = max(ht - y, 0.0);
    float leaf = vn(vec2(u * 38.0, y * 30.0)) * vn(vec2(u * 11.0 + y * 9.0, ri));
    vec3 pc = c0 * 0.012 + c1 * 0.006;
    float sod = smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(u * 6.98 + 2.2));
    vec3 lit = mix(mix(tint, c1, 0.3), c3, 0.55 * sod);
    pc += lit * (0.45 * exp(-d * 50.0) + 0.4 * leaf * exp(-d * 5.0) + 0.06 * exp(-d * 1.5)) * gL / (0.4 + 0.4 * Z);
    // the aluminium edge of the bench
    float be = y + 0.29;
    pc += c2 * 0.18 * exp(-be * be * 9000.0 / (1.0 + 40.0 * bl)) * gL / Z;
    // far rows sit deeper in the haze
    pc += (c0 * 0.05 + c1 * 0.025) * smoothstep(0.5, 3.0, b) * gL;
    col = mix(col, pc, m);
  }
  return col;
}

// soft glow of the wall seen in the wet path
vec3 paneGlow(float u, float v) {
  float inWall = smoothstep(SILL, SILL + 0.03, v) * smoothstep(EAVE, EAVE - 0.03, v);
  float dm = abs(u - BAY * floor(u / BAY + 0.5));
  float gap = smoothstep(0.012, 0.03, dm);
  float band = 0.35 + 0.8 * exp(-(v - 0.22) * (v - 0.22) * 12.0);
  vec3 t = mix(c0, c1, 0.5 + 0.3 * sin(u * 3.0));
  return t * 0.22 * band * gap * inWall * gL;
}

// a steel member: t runs across it from -1 to 1
vec3 steel(float t, float along, float glow) {
  float wear = fbm(vec2(along * 18.0, t * 1.5 + along * 2.0));
  vec3 col = (c0 * 0.035 + c2 * 0.01) * (0.6 + 0.8 * wear);
  float edge = smoothstep(0.5, 0.95, abs(t));
  col += mix(c1, c0, 0.4) * edge * 0.6 * glow;
  // the face toward the viewer takes the cool night sky
  col += c2 * 0.06 * (1.0 - smoothstep(-1.0, 0.2, t)) * (0.5 + wear);
  return col;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = max(u_resolution, vec2(1.0));
  vec2 s = (gl_FragCoord.xy - 0.5 * res) / res.y;
  gT = u_time;
  gL = clamp(u_lights, 0.4, 1.8);
  float fogA = clamp(u_fog, 0.0, 1.5);
  float drip = clamp(u_drip, 0.0, 2.0);
  float px = 1.0 / res.y;

  float u;
  float Zw = planeZ(s.x, 0.0, u);
  float v = s.y * Zw;
  float fe = 1.5 * px * Zw;

  vec3 col;
  if (v > EAVE) {
    // night sky over the eave, lit from below by the glow of the glass
    float e = s.y;
    col = mix(c1 * 0.09 + c0 * 0.06, c0 * 0.03, smoothstep(0.15, 0.6, e));
    float cl = fbm(vec2(s.x * 2.2 - gT * 0.012, e * 5.0 + 2.0));
    float lo = smoothstep(0.75, 0.15, e);
    col += mix(c2 * 0.07 + c0 * 0.04, c1 * 0.1 + c3 * 0.03, lo) * smoothstep(0.42, 0.8, cl) * (0.5 + 0.5 * lo) * gL;
    col += c1 * 0.05 * exp(-(v - EAVE) * 6.0) * gL;
  } else if (v > SILL) {
    // glass wall
    vec2 w = vec2(u, v);
    vec2 pid = vec2(floor(u / BAY + 0.5), step(MID, v));
    float dm = u - pid.x * BAY;
    float fog = fogA * (0.5 + 0.5 * fbm(w * vec2(2.5, 3.5) + 2.0));
    // some panes have been wiped or run clear, others are milky
    fog *= (0.8 + 0.2 * smoothstep(0.3, -0.35, v)) * mix(0.35, 1.15, smoothstep(0.15, 0.5, hs(pid + 3.0)));
    fog += fogA * 0.25 * smoothstep(0.06, 0.015, abs(dm));
    float fogc = clamp(fog, 0.0, 1.0) * 0.9;

    // a drop running down this column, leaving a clear trail
    float trail = 0.0, head = 0.0, swept = 0.0;
    vec2 hn = vec2(0.0);
    float cw = 0.05;
    float ci = floor(u / cw);
    float h = hs(vec2(ci, 3.7));
    if (h < 0.3 * drip) {
      float sp = 0.035 + 0.04 * hs(vec2(ci, 5.1));
      float ph = fract(gT * sp + h * 13.0);
      float top = EAVE - 0.02 - 0.25 * hs(vec2(ci, 8.3));
      float vh = top - ph * (top - SILL);
      float cx = (ci + 0.5) * cw + 0.014 * (vn(vec2(v * 7.0, ci)) - 0.5)
               + 0.006 * (vn(vec2(v * 23.0, ci + 4.0)) - 0.5);
      float env = smoothstep(0.0, 0.04, ph) * smoothstep(1.0, 0.9, ph);
      float wid = 0.0035 + 0.0025 * vn(vec2(v * 15.0, ci + 9.0));
      float age = max(v - vh, 0.0) / max((top - SILL) * sp, 1e-3);
      float above = smoothstep(vh - 0.002, vh + 0.002, v) * smoothstep(top + 0.01, top - 0.01, v);
      trail = (1.0 - smoothstep(wid, wid + fe, abs(u - cx))) * above * exp(-age * 0.06) * env;
      swept = (1.0 - smoothstep(wid * 2.5, wid * 3.5, abs(u - cx))) * above * env;
      vec2 dh = vec2(u - cx, v - vh - 0.005);
      dh.y *= dh.y > 0.0 ? 0.55 : 1.1;
      float lh = length(dh) / 0.009;
      head = (1.0 - smoothstep(0.85, 1.0, lh)) * env;
      hn = dh / 0.009;
    }

    // beads of condensation at two sizes, each a small lens
    float bead = 0.0, lr = 0.0;
    vec2 bn = vec2(0.0);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float sc = k == 0 ? 0.034 : 0.016;
      vec2 q = w / sc + fk * 7.3;
      vec2 id = floor(q), f = fract(q) - 0.5;
      float hb = hs(id + 1.7 * fk);
      if (hb > (k == 0 ? 0.45 : 0.62) + 0.3 * (1.0 - min(fogA, 1.0))) {
        vec2 c = (vec2(hs(id + 2.3), hs(id + 4.9)) - 0.5) * 0.4;
        float r = 0.12 + 0.26 * hs(id + 6.1) * hs(id + 6.1);
        vec2 d = f - c;
        d.y *= d.y < 0.0 ? 0.82 : 1.1;
        float l = length(d) / r;
        float mb = (1.0 - smoothstep(0.85, 1.0 + fe / (sc * r), l)) * (1.0 - swept);
        if (mb > bead) { bead = mb; bn = d / r; lr = l; }
      }
    }
    float lens = max(bead, head);
    vec2 nrm = head > bead ? hn : bn;
    if (head > bead) lr = length(hn);
    vec2 off = -nrm * 0.05 * lens / Zw;
    float clear = max(trail, lens);

    vec3 Ib = interior(s, fogc);
    float fl = dot(Ib, vec3(0.3, 0.5, 0.2));
    float stp = vn(w * 120.0);
    vec3 fogT = mix(c0, c1, 0.35 + 0.35 * sin(u * 2.0 + v * 3.0));
    vec3 glass = Ib * (1.0 - 0.3 * fogc) + fogT * fl * 0.7 * fogc * (0.75 + 0.5 * stp);
    // the fog holds a little of the light even below the canopy
    glass += fogT * fogc * 0.035 * gL * (0.7 + 0.6 * stp) * smoothstep(-0.5, 0.2, v);
    if (clear > 0.001) {
      vec3 Is = interior(s + off, 0.0);
      // dark rim where light bends away at the edge of a bead
      Is *= 1.0 - 0.75 * smoothstep(0.55, 0.98, lr) * lens;
      float spec = exp(-dot(nrm - vec2(-0.35, 0.45), nrm - vec2(-0.35, 0.45)) * 30.0);
      float caus = exp(-dot(nrm - vec2(0.2, -0.55), nrm - vec2(0.2, -0.55)) * 10.0);
      Is += (mix(c2, vec3(1.0), 0.4) * 0.35 * spec + c1 * caus * fl * 2.5) * lens;
      glass = mix(glass, Is, clear);
    }
    // a faint cool sheen and grime on the outer face
    glass += c2 * 0.02 * (0.4 + fbm(w * 1.5 + 9.0));
    glass *= 0.85 + 0.15 * smoothstep(SILL, SILL + 0.12, v);
    col = glass;

    // the steel frame: mullions, glazing bar, bolts
    float mw = 0.013;
    float mm = 1.0 - smoothstep(mw, mw + fe, abs(dm));
    float glw = min(fl * 3.0, 1.2);
    col = mix(col, steel(dm / mw, v, glw), mm);
    float gbw = 0.007;
    float gm = (1.0 - smoothstep(gbw, gbw + fe, abs(v - MID))) * (1.0 - mm);
    col = mix(col, steel((v - MID) / gbw, u * 0.5, glw), gm);
    vec2 bd = vec2(dm, v - MID);
    float bo = length(bd) / 0.009;
    if (bo < 1.0) {
      float bm = 1.0 - smoothstep(0.75, 1.0, bo);
      vec3 bc = c0 * 0.03 + c2 * 0.12 * smoothstep(0.2, -0.6, bd.x / 0.009 - bd.y / 0.009) * (1.0 - bo)
              + mix(c1, c0, 0.4) * 0.3 * glw * smoothstep(0.5, 0.9, bo);
      col = mix(col, bc, bm);
    }
    // the sill rail
    float sr = (v - SILL) / 0.02;
    if (sr < 1.0) col = mix(col, steel(sr * 2.0 - 1.0, u, glw), 1.0 - smoothstep(0.85, 1.0, sr));
    // the eave gutter
    float er = (v - (EAVE - 0.035)) / 0.035;
    if (er > -0.1) {
      vec3 gc = c0 * 0.03 + c2 * 0.05 * fbm(vec2(u * 12.0, 1.0));
      gc += c2 * 0.25 * exp(-(er - 0.95) * (er - 0.95) * 300.0);
      gc += mix(c1, c0, 0.4) * 0.25 * exp(-er * er * 120.0) * glw;
      col = mix(col, gc, smoothstep(-0.1, 0.05, er));
    }
  } else if (v > FOOT) {
    // concrete block knee wall
    float bk = v - FOOT;
    vec2 bq = vec2(u / 0.4 + 0.5 * floor(bk / 0.095), bk / 0.095);
    vec2 bf = fract(bq);
    float mort = smoothstep(0.0, 0.04, bf.x) * smoothstep(1.0, 0.96, bf.x)
               * smoothstep(0.0, 0.08, bf.y) * smoothstep(1.0, 0.92, bf.y);
    vec3 pc = (c0 * 0.03 + c1 * 0.008) * (0.7 + 0.6 * fbm(vec2(u * 20.0, v * 20.0)))
            * (0.8 + 0.4 * hs(floor(bq)));
    pc = mix(c0 * 0.008, pc, mort);
    pc += mix(c1, c0, 0.4) * 0.09 * gL * exp((v - SILL) * 22.0);
    col = pc;
  } else {
    // wet gravel path; puddles mirror the glowing wall
    float Zg = FOOT / min(s.y, -1e-3);
    vec2 gp = vec2(s.x * Zg, Zg);
    float wet = smoothstep(0.42, 0.58, fbm(gp * vec2(1.6, 2.4) + 3.0));
    float rip = vn(gp * 9.0 + vec2(0.0, gT * 0.3)) - 0.5;
    float vr = 2.0 * FOOT - v;
    vec3 rf = paneGlow(u + rip * mix(0.08, 0.02, wet), vr + rip * 0.05 * (1.0 - wet));
    vec3 gc = c0 * 0.02;
    float gv = vn(gp * 40.0);
    gc += mix(c0, c1, gv) * 0.04 * smoothstep(0.6, 0.9, gv) * (1.0 - wet);
    gc += rf * mix(0.35, 1.3, wet);
    gc += mix(c1, c0, 0.5) * 0.09 * gL * exp(-(FOOT - v) * 5.0);
    col = gc;
  }

  gl_FragColor = vec4(col, 1.0);
}
