// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// obsidian (Burnish) - a face of black volcanic glass, freshly broken, filling
// the frame. Glass does not break along grain, it breaks conchoidally: each
// blow drives a shell-shaped fracture out from its point of percussion, and the
// scar it leaves carries concentric ripple ribs (Wallner lines) that fan out
// from that point, tight near the bulb of percussion and spreading as they
// travel. The surface here is built as exactly that: a base slab plus eight
// fracture shells, each a tilted plane restricted to a fan of directions from
// its own percussion point, ending on a curved hinge, and carrying its own
// family of bent ribs plus fine radial hackle. Shells are laid down in strike
// order, each later flake taking the face inside its fan, so the visible
// break lines all radiate from percussion points as curved rays and arcs,
// and the planes stack as layers. No cells, no nearest-point gather: only
// ridge families and planes.
// Shading is real glass in a dark studio: a near-black body with smoky flow
// banding, a Fresnel skin reflecting one big soft-box (a plane tipped toward
// it goes lit grey, a plane tipped away drops to black, one sitting across
// its edge shows every rib as a band), two narrow strip lights that circle
// and draw bright arcs across the ribbed fans, tight speculars sparking on
// the rib crests, and hard bright hairlines wherever a flake edge breaks the
// face, the razor edges obsidian is known for. Palette tints the studio and
// the smoke in the glass, so the stone stays black in every theme and only
// its reflections change colour.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // fracture scale, frame-relative            (default 0.6)
uniform float u_ripple;   // height of the conchoidal ribs             (default 1.0)
uniform float u_sweep;    // speed the studio lights circle            (default 0.25)
uniform float u_gloss;    // reflection and specular strength          (default 1.0)
uniform float u_tint;     // palette colour in reflections and smoke   (default 0.6)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;
const int   NSHELL = 8;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// shortest signed angular distance
float wrapAng(float a) { return a - TAU * floor((a + PI) / TAU); }

// one fracture shell. k selects a fixed percussion point, fan direction,
// reach and tilt so the composition is stable; the ribs are the conchoidal
// ripple family around that point. Writes the shell height in frame units
// and its coverage mask (1 inside the fan, 0 outside, a hairline between).
// Everything inside is sine-modulated rather than noise-sampled: the face is
// evaluated three times per pixel for the normal, so a shell has to be cheap.
void shell(vec2 p, float k, float ripAmt, out float h, out float inside) {
  // fixed layout, in strike order. Tilts are chosen against the soft-box so
  // the frame carries a mix of lit, graded and dark planes.
  vec2  c    = vec2(0.0);
  float fanDir = 0.0, fanW = 1.0, base = 0.0, freq = 0.0, amp = 0.0, reach = 4.0;
  vec2  g    = vec2(0.0);
  if (k < 0.5)      { c = vec2(-3.20,  1.30); fanDir = -0.45; fanW = 0.80; base = 0.30; g = vec2( 0.02, -0.16); freq = 12.0; amp = 0.0060; reach = 5.2; }
  else if (k < 1.5) { c = vec2( 3.10, -1.60); fanDir =  2.60; fanW = 0.75; base = 0.25; g = vec2( 0.00,  0.10); freq = 15.0; amp = 0.0050; reach = 4.6; }
  else if (k < 2.5) { c = vec2( 0.60,  2.40); fanDir = -1.75; fanW = 0.55; base = 0.33; g = vec2( 0.06, -0.05); freq = 17.0; amp = 0.0042; reach = 3.3; }
  else if (k < 3.5) { c = vec2(-1.40, -2.50); fanDir =  1.30; fanW = 0.50; base = 0.28; g = vec2(-0.05, -0.20); freq = 18.0; amp = 0.0040; reach = 3.1; }
  else if (k < 4.5) { c = vec2( 3.40,  1.20); fanDir =  3.00; fanW = 0.50; base = 0.22; g = vec2( 0.10,  0.06); freq = 10.0; amp = 0.0068; reach = 3.6; }
  else if (k < 5.5) { c = vec2(-3.50, -0.40); fanDir =  0.15; fanW = 0.42; base = 0.27; g = vec2(-0.02, -0.04); freq = 14.0; amp = 0.0048; reach = 3.0; }
  // two small flakes struck inside the face, short reach: little scars
  else if (k < 6.5) { c = vec2( 0.90, -0.30); fanDir = -2.40; fanW = 0.60; base = 0.20; g = vec2( 0.05, -0.12); freq = 19.0; amp = 0.0026; reach = 1.4; }
  else              { c = vec2(-1.50,  0.80); fanDir = -0.30; fanW = 0.50; base = 0.18; g = vec2(-0.03,  0.08); freq = 21.0; amp = 0.0024; reach = 1.2; }

  vec2  d   = p - c;
  float r   = length(d);
  // angle measured from the fan direction, so the atan branch cut sits
  // behind the percussion point, outside the fan, and never crosses a shell
  float ang = wrapAng(atan(d.y, d.x) - fanDir);
  float da  = abs(ang);
  // the fan edge wanders so the break line is a curve, not a ruled ray
  // (a spatial wobble, so divided by r to become an angle)
  float wob = (0.11 * sin(r * 3.7 + k * 2.1) + 0.05 * sin(r * 8.9 + k * 5.3 + 1.0)
            + 0.02 * sin(r * 17.0 + k)) / max(r, 0.3);
  // the break itself is a hairline: constant width in frame units
  float ew = 0.006 / max(r, 0.15);
  inside = smoothstep(fanW + wob + ew, fanW + wob - ew, da);
  // the fracture ran out and hinged off along a curved arc
  float hinge = reach + 0.12 * sin(ang * 4.0 + k * 1.7) + 0.05 * sin(ang * 11.0 - k);
  inside *= smoothstep(hinge + 0.006, hinge - 0.006, r);
  // the platform: right at the percussion point a little of the old face
  // survives, so the scar opens from a rounded notch instead of a needle tip
  inside *= smoothstep(0.10, 0.116, r);

  // tilted plane with a slight bulb of percussion near the point
  h = base + dot(g, d) + 0.05 * exp(-r * 1.6);

  // conchoidal ribs: concentric around the percussion point, spacing opening
  // out with distance, amplitude fading as the fracture ran out of energy.
  // The rings bend and kink along their length and swell and fade in
  // strength around the fan, so no two arcs are alike.
  float ph  = freq * (0.55 * sqrt(r + 0.01) + 0.45 * r) + k * 1.3;
  ph += 0.6 * sin(r * 1.3 + ang * 0.7 + k * 2.0);                     // spacing drifts
  ph += 0.45 * sin(ang * 2.2 + r * 0.9 + k * 3.0) + 0.18 * sin(ang * 7.0 - r * 2.3 + k);
  float rib = sin(ph * TAU) + 0.38 * sin(ph * TAU * 2.0 + 0.9);
  float ribAmp = 0.55 + 0.45 * sin(ang * 3.5 + r * 1.5 + k * 4.0);
  float ribEnv = exp(-r * 0.28) * (0.35 + 0.65 * smoothstep(0.0, 0.25, r));
  h += ripAmt * amp * 0.7 * rib * ribEnv * ribAmp;
  // hackle: fine radial striations running with the fracture, strongest
  // toward the fan edges where the crack curled
  float hackle = sin(ang * 41.0 + 1.6 * sin(ang * 13.0 + r * 2.0 + k)) * sin(r * 5.0 + ang * 3.0);
  h += ripAmt * 0.0012 * hackle * (0.3 + 0.7 * smoothstep(fanW * 0.4, fanW, da));
}

// the whole face: the base slab, then every shell laid down in strike order.
// edge accumulates the break hairlines.
float face(vec2 p, float ripAmt, out float edge) {
  // the base slab: the older outer surface, a slow glassy undulation with a
  // broad shallow rib family of its own from some long-gone blow
  float h = 0.36 + 0.03 * (vnoise(p * 0.9 + 21.0) - 0.5) + 0.012 * (vnoise(p * 2.7 + 4.0) - 0.5);
  float rb = length(p - vec2(-0.6, -2.4));
  h += ripAmt * 0.0035 * sin(rb * 9.0 * TAU * 0.35 + 1.0) * exp(-rb * 0.3);
  edge = 0.0;
  for (int i = 0; i < NSHELL; i++) {
    float hk, inside;
    shell(p, float(i), ripAmt, hk, inside);
    h = mix(h, hk, inside);
    // a later flake covers the break lines of everything beneath it
    edge = max(edge * (1.0 - inside), 4.0 * inside * (1.0 - inside));
  }
  return h;
}

// studio environment seen in direction R
vec3 studio(vec3 R, float t, vec3 skyCol, vec3 floorCol, vec3 stripA, vec3 stripB) {
  float up = R.y;
  // a dark room: black floor, a dim dome, a thin glow at the horizon
  vec3 env = mix(floorCol, skyCol * 0.45, smoothstep(-0.25, 0.9, up));
  env += skyCol * 0.9 * exp(-abs(up + 0.05) * 12.0);
  // the big soft-box above the camera. Its edge is soft but real: a plane
  // tipped toward it goes a smooth lit grey, a plane tipped away drops to the
  // dark room, and the ribs show as bands wherever a shell sits across the
  // edge of the box. The box drifts slowly, so which planes are lit changes.
  vec3  db = normalize(vec3(0.22 * sin(t * 0.3), 0.42 + 0.14 * cos(t * 0.23), 0.9));
  float box = smoothstep(0.55, 0.95, dot(R, db));
  env += skyCol * 2.5 * box;
  // strip lights: long narrow soft-boxes. Each is a great-circle band through
  // a direction that circles with time, so the arcs sweep across the ribs
  float a1 = t * 0.5 + 0.8;
  vec3  d1 = normalize(vec3(cos(a1) * 0.8, 0.55, sin(a1) * 0.8));
  vec3  n1 = normalize(cross(d1, vec3(sin(a1 * 0.7), 0.2, cos(a1 * 0.7))));
  float band1 = exp(-dot(R, n1) * dot(R, n1) * 120.0) * smoothstep(0.35, 0.85, dot(R, d1));
  float a2 = -t * 0.35 + 3.4;
  vec3  d2 = normalize(vec3(cos(a2) * 0.9, 0.35, sin(a2) * 0.9));
  vec3  n2 = normalize(cross(d2, vec3(0.1, 1.0, -0.3)));
  float band2 = exp(-dot(R, n2) * dot(R, n2) * 220.0) * smoothstep(0.30, 0.80, dot(R, d2));
  env += stripA * band1 * 2.2 + stripB * band2 * 1.7;
  return env;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  vec2  fc     = gl_FragCoord.xy;
  float aspect = res.x / res.y;
  float t      = u_time * clamp(u_sweep, 0.0, 3.0);
  float gloss  = clamp(u_gloss, 0.0, 2.0);
  float tint   = clamp(u_tint, 0.0, 1.0);
  float ripAmt = clamp(u_ripple, 0.0, 3.0);
  float scl    = 1.0 / max(u_scale, 0.2);

  // frame coords: x in -aspect..aspect, y in -1..1, then the fracture scale
  vec2 pf = (fc / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  vec2 p  = pf * scl;

  // ---- the surface and its finite-difference normal. e is about 1.2 device
  // px in frame units so rib crests and flake edges stay crisp
  float e  = 2.4 / res.y * scl;
  float edge, e1, e2;
  float h  = face(p, ripAmt, edge);
  float hx = face(p + vec2(e, 0.0), ripAmt, e1);
  float hy = face(p + vec2(0.0, e), ripAmt, e2);
  vec2  sl = vec2(hx - h, hy - h) / e;
  vec3  N  = normalize(vec3(-sl, 1.0));
  float steep = length(sl);
  // flake edges: the fan hairlines, plus anywhere the face steps steeply
  edge = max(edge, smoothstep(1.5, 5.0, steep));
  // depth cue: lower planes are deeper cuts, a faint darkening in the scars
  float depth = clamp((0.36 - h) * 4.0, 0.0, 1.0);

  // ---- view and lights
  vec3 V = normalize(vec3(-pf * 0.28, 2.3));
  // key light circles slowly; the pointer can drag it, zero at rest
  float ka = t * 0.4;
  vec2  lp = vec2(cos(ka) * 1.3 * aspect, sin(ka * 0.8) * 0.9);
  vec2  mp = (u_mouse / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  lp = mix(lp, mp, mAmt * 0.55);
  vec3 L = normalize(vec3(lp - pf, 1.6));
  vec3 H = normalize(L + V);

  // ---- palette-derived studio colours. Everything is normalised on
  // luminance and pulled toward grey by (1 - tint) so the glass stays black
  // and neutral palettes give plain silver reflections.
  vec3 skyT   = mix(c0, c2, 0.5);
  skyT   = mix(vec3(1.0), skyT / max(luma(skyT), 0.2), 0.6 * tint);
  vec3 stripT = mix(vec3(1.0), c1 / max(luma(c1), 0.2), 0.7 * tint);
  vec3 stripU = mix(vec3(1.0), c2 / max(luma(c2), 0.2), 0.7 * tint);
  vec3 smokeT = mix(vec3(1.0), c3 / max(luma(c3), 0.2), tint);
  vec3 skyCol   = skyT * 0.40;
  vec3 floorCol = smokeT * 0.02;

  // ---- fresnel (glass, n ~ 1.5, F0 = 0.04) with the usual Schlick tail,
  // lifted a little so the face stays readable in a dark room
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float f1  = 1.0 - ndv;
  float f2  = f1 * f1;
  float fres = 0.06 + 0.94 * f2 * f2 * f1;

  // ---- the glass body: near black, with smoky flow bands frozen in the melt
  // (obsidian flow banding), seen faintly through the surface, and a little
  // translucency where a flake edge thins the glass
  vec2  fq   = vec2(p.x * 0.7 + p.y * 0.35, p.y * 0.7 - p.x * 0.35);
  float flow = vnoise(vec2(fq.x * 1.4, fq.y * 9.0) + vec2(0.0, 2.0 * vnoise(fq * 1.3 + 9.0)));
  flow = smoothstep(0.35, 0.75, flow);
  vec3  body = vec3(0.018, 0.018, 0.021) + smokeT * (0.02 + 0.045 * flow);
  body *= 1.0 - 0.25 * depth;
  body += smokeT * 0.08 * edge;

  // ---- reflection of the studio
  vec3 R   = reflect(-V, N);
  vec3 env = studio(R, t, skyCol, floorCol, stripT, stripU);
  vec3 col = body * (1.0 - fres) + env * fres * gloss * 1.9;

  // ---- key specular: a tight lobe that sparks on the rib crests, plus a
  // broader satin lobe that shows the rib shading across the fans
  float ndh = clamp(dot(N, H), 0.0, 1.0);
  float s2 = ndh * ndh, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s32 = s16 * s16;
  float s64 = s32 * s32, s256 = s64 * s64; s256 *= s256;
  float ndl = clamp(dot(N, L), 0.0, 1.0);
  float vdh = clamp(dot(V, H), 0.0, 1.0);
  float fh  = 1.0 - vdh; float fh2 = fh * fh;
  float fSpec = 0.04 + 0.96 * fh2 * fh2 * fh;
  vec3  keyCol = mix(vec3(1.0), stripT, 0.35);
  col += keyCol * gloss * (s256 * 1.4 + s32 * 0.12) * fSpec * 14.0 * ndl;
  col += keyCol * gloss * s8 * 0.02 * ndl;

  // ---- flake-edge glints: the broken edge is a bright hairline wherever it
  // faces any light at all, the sharp signature of knapped glass
  float edgeLit = 0.35 + 0.65 * clamp(dot(N, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0);
  col += mix(vec3(1.0), skyT, 0.4) * edge * edgeLit * gloss * 0.55;

  // seat it: the face darkens toward the corners like a stone in a dim room
  vec2  vq = fc / res - 0.5;
  col *= 1.0 - 0.22 * smoothstep(0.3, 0.95, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
