// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// orbweb (Strand) - a frontal orb-weaver spider web. Radial spokes fan out from
// an off-centre hub all the way to the frame edges; between them the capture
// thread winds out as straight sag-chords (the angular look that tells a real web
// apart from a radar target), spiralling slowly. Dew beads catch the light and
// slide along the threads, and a soft breeze sways the whole web. Open strands
// only - the wedges between threads are never filled.
// (ASCII-only comments: the headless poster compiler treats apostrophes as
//  char-literals even inside // lines.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spokes;     // number of radial spokes              (default 18)
uniform float u_rings;      // capture-thread spacing, css px        (default 34)
uniform float u_spiral;     // how far the capture thread spirals    (default 0.5)
uniform float u_sway;       // breeze sway amplitude + speed         (default 0.5)
uniform float u_line;       // thread half-width, css px             (default 1.0)
uniform float u_glint;      // dew-bead glint travel speed           (default 0.4)
uniform float u_hue;        // hue spread across the web             (default 1.0)
uniform float u_mouseInfluence; // pointer pull on the hub          (default 0.0)

const vec3  BG       = vec3(0.035, 0.035, 0.043);

float hash11(float p) { p = fract(p * 0.2317); p *= p + 23.19; p *= p + p; return fract(p); }

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float lw   = max(u_line, 0.3) * refScale * pr;          // thread half-width, device px
  float ring = max(u_rings, 6.0) * refScale * pr;         // capture-thread radial pitch
  float nS   = max(floor(u_spokes + 0.5), 3.0);
  float da   = 6.2831853 / nS;                            // angle between spokes

  // hub off-centre (rule of thirds), with a gentle breeze sway and optional pull
  vec2 hub = res * vec2(0.385, 0.560);
  float swA = u_sway * min(res.x, res.y) * 0.018;
  hub += vec2(sin(t * 0.31 * (0.5 + u_sway)), cos(t * 0.23 * (0.5 + u_sway))) * swA;
  if (u_mouse.x + u_mouse.y > 1.0) hub += (u_mouse - hub) * 0.25 * clamp(u_mouseInfluence, 0.0, 1.0);

  vec2  d  = fc - hub;
  float r  = length(d);
  float ang = atan(d.y, d.x);

  // slow rotation of the whole web (phase-continuous)
  float rot = t * 0.04 * (0.4 + u_sway);
  float aR  = ang + rot;

  // local wedge angle: offset from the nearest spoke, plus a tiny per-spoke jitter
  float kIdx = floor(aR / da + 0.5);
  float jit  = (hash11(kIdx * 1.7 + 3.1) - 0.5) * da * 0.28;        // uneven spokes
  float phi  = aR - (kIdx * da + jit);                              // -da/2 .. da/2

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 acc = vec3(0.0);

  // --- radial spokes: perpendicular distance to the nearest spoke line is r*sin(phi).
  // fade in past a small hub radius so the centre is not a bright blob.
  float spokePerp = abs(r * sin(phi));
  float spoke = smoothstep(lw * 1.6, 0.0, spokePerp);
  float hubFade = smoothstep(ring * 0.35, ring * 1.1, r);
  spoke *= hubFade;
  vec3 spokeCol = wheelCol(kIdx * 0.05 * u_hue + 0.0 + t * 0.01, c0, c1, c2, c3);
  acc += spokeCol * spoke * 1.05;

  // --- capture thread: straight sag-chords between adjacent spokes. The chord that
  // crosses ring m sits at radial distance Rm*cos(da/2)/cos(phi); normalising r by
  // that factor turns the family of chords into evenly spaced integers, minus a
  // spiral term so the thread winds outward instead of closing into rings.
  float chordR = r * cos(phi) / max(cos(da * 0.5), 0.2);
  float fieldR = chordR / ring - u_spiral * (aR / 6.2831853);
  float ringDist = abs(fract(fieldR + 0.5) - 0.5) * ring;          // px to nearest chord
  float capFade = smoothstep(ring * 0.6, ring * 1.4, r);           // no capture thread at the very hub
  float cap = smoothstep(lw * 1.3, 0.0, ringDist) * capFade;
  float ri = floor(fieldR + 0.5);
  vec3 capCol = wheelCol(ri * 0.08 * u_hue + 0.5 + t * 0.012, c0, c1, c2, c3);
  acc += capCol * cap * 0.92;

  // --- dew beads: bright droplets riding the capture thread, sliding along the
  // wedge. Placed where a chord crosses near a spoke-ish parameter, glinting in time.
  float along = fract(phi / da + 0.5);                             // 0..1 across the wedge
  float beadPhase = fract(ri * 0.37 + kIdx * 0.13 - t * u_glint * 0.25);
  float bq = (along - beadPhase) * 6.0;                // (x*x, not pow: neg base -> NaN in ANGLE)
  float bead = exp(-bq * bq);
  float onThread = max(cap, spoke * 0.6);
  acc += wheelCol(ri * 0.08 * u_hue + 0.5, c0, c1, c2, c3) * bead * onThread * 1.6;

  // bright hub knot where the spokes converge
  acc += spokeCol * exp(-pow(r / (ring * 0.7), 2.0)) * 0.35;

  // tonemap so dense thread crossings stay coloured rather than blowing to white
  acc = vec3(1.0) - exp(-acc * 1.25);

  vec3 col = BG + acc;
  gl_FragColor = vec4(col, 1.0);
}
