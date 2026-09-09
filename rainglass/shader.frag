// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// rainglass (Veil) - rain on a window at night. Behind the glass is a lit
// field the eye never sees sharply: a dark ground, a horizon of street lights
// and scattered bokeh discs, built analytically from small additive light
// sources so the same field can be drawn at any defocus. The pane is fogged,
// so the field is drawn very soft and lifted by a grey haze. On the glass sit
// three kinds of water. Running drops fall in tall lattice columns, each one
// wiggling as it goes, stalling and darting the way a runner does on real
// glass, and leaving a trail of small beads above it plus a wiped streak
// where the fog has been cleared and the lights behind come back into focus.
// Static beads sit on a finer lattice, swelling slowly as new drops form and
// vanishing where a runner has just passed through. Every drop is a lens: it
// shows the lit field sharp and inverted through its own bulge, with a dark
// refractive rim and one tight highlight from the light above the window.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rain;     // how much water is on the glass          (default 1.0)
uniform float u_speed;    // fall speed of the runners               (default 0.5)
uniform float u_fog;      // condensation on the pane                (default 0.7)
uniform float u_refract;  // lens strength of the drops              (default 1.0)
uniform float u_smear;    // per-drop motion smear                    (default 0.6)
uniform float u_lights;   // density of the lights behind the glass  (default 1.0)

vec3 P0, P1, P2, P3;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec3 hash23(vec2 p) {
  float a = hash21(p);
  float b = hash21(p + vec2(17.3, 9.1));
  float c = hash21(p + vec2(41.7, 23.9));
  return vec3(a, b, c);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// a palette pick by a random key, with a little brightness spread
vec3 lightCol(float k) {
  float x = floor(fract(k) * 4.0);
  vec3 c = P0;
  c = mix(c, P1, step(0.5, x));
  c = mix(c, P2, step(1.5, x));
  c = mix(c, P3, step(2.5, x));
  // lights are near white at the core, so lift toward white a touch
  return mix(c, vec3(1.0), 0.10);
}

// one defocused point light seen through the glass: a disc that grows and
// softens with defocus, with the slightly bright rim a lens iris leaves.
// dist in frame units; base is the sharp point size; soft is 0 (in focus)
// to 1 (fogged)
float bokeh(float dist, float base, float soft) {
  float r  = base * (1.0 + 7.0 * soft);
  float w  = base * (0.6 + 6.0 * soft);
  float disc = 1.0 - smoothstep(r - w, r + w, dist);
  disc *= 0.75 + 0.45 * (1.0 - smoothstep(0.0, r + w, dist));
  float rim  = smoothstep(r - w * 2.5, r, dist) * (1.0 - smoothstep(r, r + w, dist));
  // energy conservation: the bigger the disc, the dimmer it is
  float gain = 1.0 / (1.0 + 4.5 * soft);
  return (disc + rim * 0.5 * soft) * gain;
}

// the lit field behind the pane at frame point p, drawn at defocus soft
vec3 litField(vec2 p, float soft, float t, float dens) {
  // ground: night dark, a low band of glow where the street is
  vec3 deep = vec3(0.016, 0.018, 0.026) + mix(vec3(luma(P3)), P3, 0.5) * 0.035;
  vec3 glow = mix(vec3(luma(P0)), P0, 0.6) * 0.20;
  float street = exp(-abs(p.y - 0.34) * 3.0);
  vec3 col = deep + glow * street * 0.7 + P1 * 0.03 * smoothstep(0.7, 0.0, p.y);

  // horizon of street lights: a 1D lattice along x just above the street
  {
    float sx = p.x * 9.0;
    float ix = floor(sx);
    for (int k = -1; k <= 1; k++) {
      float i  = ix + float(k);
      vec3  n  = hash23(vec2(i, 3.0));
      if (n.z > 0.45 + 0.5 * dens) continue;
      vec2  c  = vec2((i + 0.5 + (n.x - 0.5) * 0.7) / 9.0, 0.36 + (n.y - 0.5) * 0.05);
      float tw = 0.85 + 0.15 * sin(t * 1.7 + n.x * 20.0);
      col += lightCol(n.y * 3.7 + 0.1) * bokeh(length(p - c), 0.006, soft) * 2.4 * tw;
    }
  }
  // scattered lights across the whole field, two lattice layers
  for (int ly = 0; ly < 2; ly++) {
    float sc = ly == 0 ? 3.5 : 7.0;
    vec2  o  = ly == 0 ? vec2(0.31, 0.17) : vec2(0.73, 0.52);
    float ymax = ly == 0 ? 0.9 : 0.62;
    vec2  g  = p * sc + o;
    vec2  ig = floor(g);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 id = ig + vec2(float(x), float(y));
        vec3 n  = hash23(id + float(ly) * 11.0);
        // fewer lights high up in the dark; more near the street
        vec2 c = (id + 0.5 + (n.xy - 0.5) * 0.8 - o) / sc;
        float keep = 0.25 * dens * (1.0 + 1.5 * smoothstep(ymax, 0.2, c.y));
        if (n.z > keep) continue;
        float base = 0.004 + 0.006 * fract(n.x * 7.0);
        float tw = 0.8 + 0.2 * sin(t * (0.9 + n.y) + n.x * 30.0);
        col += lightCol(n.z * 9.3 + n.x) * bokeh(length(p - c), base, soft) * 1.9 * tw;
      }
    }
  }
  return col;
}

// ---- the water --------------------------------------------------------------

// fraction of a runner cycle spent creeping down before it lets go and darts.
// Lower means more runners are mid-dart at any instant, so more of them show a
// smear. The climb amplitude below is solved from this, so the two stay in step.
const float RISE = 0.78;

// the dwell-then-dart curve a runner follows across its cycle. Pulled out of
// runners so the runner own speed can be sampled from it by finite difference.
float dwell(float ph) {
  return clamp(ph / RISE, 0.0, 1.0) * smoothstep(1.0, RISE, ph);
}

// running drops in tall lattice columns. p is in frame units. Returns the
// drop mask, the wiped-trail mask, and the lens offset (xy) in .zw
vec4 runners(vec2 p, float t, float scale, float seed, float amount, float smear) {
  vec2 cellAsp = vec2(1.0, 2.6);                 // cells are tall and narrow
  vec2 st = p * scale / cellAsp;
  st.y += t * 0.36;                              // the lattice scrolls down
  st.x += seed;
  vec2 id = floor(st);
  vec3 n  = hash23(id + seed * 7.0);
  vec2 f  = st - id;
  float on = step(n.z, amount);

  // the runner: an x that wiggles as it descends, a y that stalls and darts
  float x = (n.x - 0.5) * 0.5;
  float wy = st.y * 7.0;
  x += sin(wy + sin(wy * 0.7 + n.y * 6.28)) * (0.5 - abs(x)) * 0.35 * (n.y - 0.5) * 2.0;
  float cyc = 0.42 * (0.7 + 0.3 * n.x);          // cycles per unit t, per runner
  float ph  = fract(t * cyc + n.z);
  // Dwell then dart, and it must NEVER read as a drop crawling up the glass.
  // The lattice scrolls down at 0.36 per unit t; the local y climbs against it,
  // so the climb rate has to stay strictly under 0.36 at every instant. The
  // rise is therefore LINEAR (a smoothstep rise peaks at 1.5x its own average,
  // which is what let fast runners out-climb the scroll and drift upward), and
  // the amplitude is solved from RISE and this runner own cycle rate so the
  // climb is always 0.8 of the scroll. Net: every runner creeps down through the dwell,
  // then the smooth fall lets it dart down the cell.
  float amp = RISE * 0.36 * 0.8 / cyc;
  float saw = dwell(ph);
  float y   = -0.5 * amp + amp * saw;
  vec2 dp = vec2(x, y);

  // how fast this runner is going down the glass right now: the lattice carries
  // it down at 0.36 while its own dwell climbs against that. Creeping through
  // the dwell gives about 0.07, the dart gives well over 2, so the two states
  // are far enough apart to drive a per-drop smear.
  float e    = 0.004;
  float dsaw = (dwell(fract(ph + e)) - dwell(fract(ph - e))) / (2.0 * e);
  float spd  = max(0.36 - amp * dsaw * cyc, 0.0);

  // main drop: a teardrop, rounder below, drawn out above
  vec2 d = (f - 0.5 - dp) * cellAsp;
  d.y *= 1.0 + 0.5 * smoothstep(0.0, 0.5, d.y) * (0.5 + 0.5 * on);
  // squared weighting so most runners are small and a big one is occasional
  float rad = 0.11 + 0.13 * n.y * n.y;
  // per-drop smear: the faster it runs, the further its tail is drawn out
  // behind it (upward, since it runs down), so a darting drop reads as a
  // streak while a stalled one stays round
  float tail = 1.0 + smear * (0.30 + spd * 1.6);
  d.y /= mix(1.0, tail, step(0.0, d.y));
  float dl = length(d);
  float drop = (1.0 - smoothstep(rad * 0.85, rad, dl)) * on;
  vec2  off  = d / rad * drop;

  // trail of small beads above the runner, along its wiggle
  float ty = fract(st.y * 6.0 + n.z * 3.0) - 0.5;
  float above = smoothstep(0.0, 0.05, f.y - 0.5 - y - rad * 0.5);
  vec2 td = vec2((f.x - 0.5 - x) * cellAsp.x, ty / 6.0 * cellAsp.y);
  float trad = rad * (0.30 + 0.25 * hash21(id + floor(st.y * 6.0 + n.z * 3.0)));
  float tl = length(td);
  float bead = (1.0 - smoothstep(trad * 0.8, trad, tl)) * above * on;
  bead *= smoothstep(1.0, 0.4, f.y - 0.5 - y);   // beads dry up far behind
  off += td / trad * bead * 0.6;

  // the wiped streak the runner has cleared behind it
  float dx  = (f.x - 0.5 - x) * cellAsp.x;
  float reach = 1.1 * (1.0 + 0.6 * smear * spd);       // a fast runner wets further back
  float age = clamp((f.y - 0.5 - y) / reach, 0.0, 1.0); // 0 at the drop, 1 far above
  float ww  = rad * (0.9 - 0.45 * age);                    // the streak narrows as it dries
  float we  = smoothstep(ww * 0.5, ww, abs(dx));
  float fade = above * on * (1.0 - age * age) * smoothstep(1.0, 0.8, f.y);
  float wipe = (1.0 - we) * fade;
  // the wet channel bends light a little at its two edges
  off += vec2(sign(dx) * we * (1.0 - we) * 0.6, 0.0) * fade;

  return vec4(max(drop, bead), wipe, off);
}

// static beads on a fine lattice, swelling as they form. returns mask, offset
vec3 beads(vec2 p, float t, float scale, float seed, float amount) {
  vec2 st = p * scale + seed;
  vec2 id = floor(st);
  vec3 n  = hash23(id + seed * 3.1);
  vec2 f  = st - id - 0.5;
  float on = step(n.z, amount);
  vec2  c  = (n.xy - 0.5) * 0.5;
  float grow = 0.55 + 0.45 * sin(t * 0.25 + n.x * 6.28 + n.y * 3.0);
  float rad = (0.10 + 0.20 * fract(n.z * 5.0)) * grow;
  vec2 d = f - c;
  float m = (1.0 - smoothstep(rad * 0.8, rad, length(d))) * on;
  return vec3(m, d / rad * m);
}

void main() {
  P0 = u_palette[0]; P1 = u_palette[1]; P2 = u_palette[2]; P3 = u_palette[3];
  if (dot(P0,P0)+dot(P1,P1)+dot(P2,P2)+dot(P3,P3) < 1e-5) {
    P0 = vec3(0.231,0.510,0.965); P1 = vec3(0.659,0.333,0.969);
    P2 = vec3(0.133,0.827,0.933); P3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  uv     = gl_FragCoord.xy / res;
  vec2  p      = vec2(uv.x * aspect, uv.y);       // frame units, height 1
  float t      = u_time * clamp(u_speed, 0.0, 3.0);
  float rain   = clamp(u_rain, 0.0, 1.5);
  float fog    = clamp(u_fog, 0.0, 1.0);
  float lens   = clamp(u_refract, 0.0, 2.0);
  float dens   = clamp(u_lights, 0.2, 2.0);

  // ---- water on the glass: two runner lattices, two bead lattices
  float smear = clamp(u_smear, 0.0, 2.0);
  vec4 r1 = runners(p, t,        5.0, 0.0, 0.62 * rain, smear);
  vec4 r2 = runners(p, t * 0.8,  9.0, 3.7, 0.55 * rain, smear);
  float wipe = max(r1.y, r2.y);
  vec3 b1 = beads(p, t, 20.0, 1.3, 0.62 * rain);
  vec3 b2 = beads(p, t, 34.0, 5.9, 0.44 * rain);
  // a runner passing through takes the beads with it
  float clear = 1.0 - wipe * 0.9 - max(r1.x, r2.x);
  b1.x *= clamp(clear, 0.0, 1.0);
  b2.x *= clamp(clear, 0.0, 1.0);

  float drop = max(max(r1.x, r2.x), max(b1.x, b2.x));
  vec2  off  = r1.zw + r2.zw * 0.8 + b1.yz * 0.55 + b2.yz * 0.35;

  // ---- defocus: fog blurs the pane, wiped streaks clear it, drops focus it
  float soft = fog * (1.0 - 0.55 * wipe);
  soft = mix(soft, 0.16, drop);

  // lens: the drop shows the field inverted through its bulge, so the offset
  // points back across the drop centre and reaches well past the drop
  vec2 look = p - off * (0.42 * lens + 0.02);

  vec3 col = litField(look, soft, t, dens);

  // ---- the fog haze lifts the blacks and greys the colour; wiped away where
  // the runners have cleared it
  float haze = fog * (1.0 - 0.6 * wipe) * (1.0 - drop);
  vec3  hazeCol = mix(vec3(luma(P2)), P2, 0.12) * 0.075;
  col = mix(col, vec3(luma(col)), 0.30 * haze);
  col += hazeCol * haze;
  // condensation grain on the fogged glass
  float grain = hash21(floor(gl_FragCoord.xy / max(u_pixelRatio, 0.5) * 0.5));
  col *= 1.0 - 0.06 * haze * grain;

  // ---- drop shading: dark refractive rim, sky glint, a tight highlight
  float ol = length(off);
  vec3  N  = normalize(vec3(off * 0.9, max(1.0 - ol * ol * 0.6, 0.15)));
  vec3  L  = normalize(vec3(-0.35, 0.75, 0.55));
  vec3  H  = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndh = max(dot(N, H), 0.0);
  float s8 = ndh * ndh; s8 *= s8; s8 *= s8;
  float s64 = s8 * s8; s64 *= s64; s64 *= s64;
  float rim = smoothstep(0.68, 1.0, ol) * drop;
  col *= (1.0 + 0.6 * drop) * (1.0 - 0.5 * rim);
  // the pane glow above the window reflects in the upper face of each drop
  col += (P2 * 0.4 + 0.1) * 0.10 * drop * smoothstep(-0.2, 0.9, off.y) * (1.0 - rim);
  col += (P2 * 0.5 + 0.5) * s64 * 0.9 * drop;
  col += P1 * 0.08 * s8 * drop;
  // beads catch the street glow on their lower edge
  col += P0 * 0.06 * drop * smoothstep(0.2, 0.9, -off.y) * (1.0 - rim);

  gl_FragColor = vec4(col, 1.0);
}
