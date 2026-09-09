// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// plumage (Filament) - the back of a bird seen close: rows of contour
// feathers overlapping like shingles, each one a tapered vane with a pale
// rachis down its middle and fine parallel barbs angled off it toward the
// tip. The layout is an offset row lattice, rows rooted higher on the body
// lie in front, so what shows of every feather is its tip and the outer two
// thirds of its vane, with its root hidden under the row above. Coverage is
// composited front to back through up to nine candidate feathers per pixel,
// and every feather in front casts a soft contact shadow onto the one below
// along its outline. Vanes split where barbs have come unhooked, opening
// V-shaped gaps that show the feather beneath. Each barb is shaded as a tiny
// ridge, the vane arches across its width, and the colour is structural:
// an iridescent ramp through the palette driven by the angle between the
// arched surface and the light, with a Kajiya-Kay anisotropic sheen running
// along the barbs. A sweeping light and a slow ruffle wave travelling across
// the plumage keep the sheen moving from feather to feather.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_rows;     // feather rows across the frame height  (default 6)
uniform float u_barb;     // barb spacing in css px                 (default 3.2)
uniform float u_sheen;    // iridescence and anisotropic gloss      (default 1.0)
uniform float u_ruffle;   // depth of the ruffle wave               (default 0.6)
uniform float u_speed;    // light sweep and ruffle speed           (default 0.35)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float PI = 3.14159265;
const float BARB_COT = 1.43;    // cot of the barb angle, ~35 deg off the rachis
const float BARB_SIN = 0.574;
const float BARB_COS = 0.819;

vec3 c0, c1, c2, c3;

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

// structural colour: a closed ramp through the four palette poles
vec3 irid(float ph) {
  float x = fract(ph) * 4.0;
  vec3 a = mix(c0, c1, smoothstep(0.0, 1.0, x));
  a = mix(a, c2, smoothstep(1.0, 2.0, x));
  a = mix(a, c3, smoothstep(2.0, 3.0, x));
  a = mix(a, c0, smoothstep(3.0, 4.0, x));
  return a;
}

// vane half-width along the feather, tv = 0 at the root, 1 at the tip.
// A rounded tip, widest just past the middle, narrowing into the hidden root.
float vaneW(float tv, float W) {
  float x = clamp(tv, 0.0, 1.0);
  float s = sin(PI * pow(x, 0.7));
  return W * pow(max(s, 0.0), 0.55);
}

// one candidate feather. lp is the local frame: u across (0 at the rachis),
// v along, from the root downward. Returns the outline distance, the split
// gap coverage (0 solid .. 1 open gap), and the barb phase for shading.
float featherD(vec2 lp, float L, float W, float id, float N, float fuzz,
               out float gap, out float sBarb) {
  float tv = lp.y / L;
  float w  = vaneW(tv, W) * (1.0 + 0.06 * fuzz);
  float au = abs(lp.x);
  float d  = max(au - w, max(lp.y - L, -lp.y));
  // barb coordinate: constant along one barb, increasing toward the tip
  sBarb = lp.y - au * BARB_COT;
  // splits: every few barbs a group may have come unhooked. The gap opens
  // from part way out along the vane and widens toward the edge.
  float grp   = sBarb * N / 3.0;
  float gi    = floor(grp);
  float hs    = hash21(vec2(gi, id));
  float start = 0.30 + 0.45 * hash21(vec2(gi, id + 7.0));
  float open  = smoothstep(start, 1.0, au / max(w, 1e-4));
  float gw    = step(hs, 0.17) * open * 0.38;
  float gf    = fract(grp);
  gap = smoothstep(gw, gw - 0.10, gf) * step(0.001, gw);
  return d;
}

// shade the picked feather at local lp with front-shadow distance frontOut
vec3 shadeFeather(vec2 lp, float d, float sBarb, float L, float W, float H,
                  float id, float N, float barbVis, float ruffle, vec2 body,
                  float frontOut, vec3 Ldir, float sheen, float t) {
  float tv  = clamp(lp.y / L, 0.0, 1.0);
  float w   = max(vaneW(tv, W), 1e-4);
  float au  = abs(lp.x);
  float su  = sign(lp.x + 1e-6);

  // the vane arches across its width and lifts toward the tip; the ruffle
  // wave rocks the whole feather
  float arch = 0.55 * lp.x / W;
  float lift = 0.22 * tv + ruffle;
  // the body under the plumage curves away on both sides, so the whole
  // feather tilts with it
  vec3 n = vec3(-arch + body.x + 0.6 * ruffle, lift + body.y, 1.0);

  // barbs: tiny ridges perpendicular to the barb direction
  float bf     = fract(sBarb * N);
  float across = (bf - 0.5) * 2.0;
  vec2  perp   = vec2(BARB_COS, su * BARB_SIN);
  n.xy += perp * across * 0.55 * barbVis;
  n = normalize(n);
  float ridge  = 1.0 - across * across;
  float hb     = hash21(vec2(floor(sBarb * N), id + 3.0));
  float barbTone = mix(1.0, (0.86 + 0.28 * hb) * (0.80 + 0.25 * ridge), barbVis);

  vec3  V    = vec3(0.0, 0.0, 1.0);
  vec3  Hh   = normalize(Ldir + V);
  float diff = clamp(dot(n, Ldir), 0.0, 1.0);

  // structural colour: hue slides with the viewing angle across the arch,
  // with the light angle, and a touch per feather so neighbours differ
  float ph = 2.4 * (1.0 - n.z) + 1.0 * diff + 0.12 * hash21(vec2(id, 1.7))
           + 0.45 * tv + t * 0.02;
  vec3 col = irid(ph * sheen + 0.15);
  vec3 dark = vec3(luma(col)) * 0.35 + col * 0.10;
  col = mix(dark, col, 0.20 + 0.80 * diff);
  col *= (0.26 + 0.95 * diff) * barbTone;

  // Kajiya-Kay sheen along the barb tangent: a bright band that crosses the
  // vane where the barbs catch the light
  vec3  T     = normalize(vec3(su * BARB_SIN, -BARB_COS, 0.15 * across * barbVis));
  float tdh   = dot(T, Hh);
  float s2    = max(1.0 - tdh * tdh, 0.0);
  float spec  = s2 * s2; spec *= spec; spec *= spec; spec *= spec;   // ^16
  spec *= spec; spec *= spec;                                       // ^64
  spec *= diff * 0.7 + 0.3;
  // the sheen is itself coloured: the film shifts hue at the highlight
  vec3 sheenCol = mix(irid(ph * sheen + 0.42), vec3(1.0), 0.14);
  col += sheenCol * spec * 1.1 * sheen * (0.6 + 0.4 * ridge);

  // rachis: a pale glossy shaft that tapers to the tip, with a groove beside it
  float rw     = W * 0.085 * (1.0 - 0.55 * tv);
  float shaft  = 1.0 - smoothstep(rw * 0.8, rw * 1.2, au);
  float groove = smoothstep(rw * 0.9, rw * 1.6, au) * (1.0 - smoothstep(rw * 1.6, rw * 3.2, au));
  vec3  nS     = normalize(vec3(lp.x / rw, lift * 0.5, 0.8));
  float dS     = clamp(dot(nS, Ldir), 0.0, 1.0);
  float sS     = clamp(dot(nS, Hh), 0.0, 1.0);
  sS = sS * sS; sS = sS * sS; sS = sS * sS; sS = sS * sS;
  vec3  shaftCol = mix(vec3(luma(col)), vec3(0.92, 0.88, 0.80), 0.55) * (0.35 + 0.65 * dS)
                 + vec3(0.6) * sS * sheen;
  col = mix(col, shaftCol, shaft * (1.0 - smoothstep(0.92, 1.0, tv)));
  col *= 1.0 - 0.28 * groove;

  // the vane edge: barb tips thin out, a hair darker and fuzzier
  float edge = 1.0 - smoothstep(-0.10 * W, -0.01 * W, d);
  col *= 1.0 - 0.30 * edge;

  // contact shadow from whatever feather lies in front of this one
  float ao = 1.0 - 0.70 * exp(-max(frontOut, 0.0) / (0.07 * H));
  col *= ao;
  return col;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  vec2  uv     = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float sheen  = clamp(u_sheen, 0.0, 2.0);
  float rufAmt = clamp(u_ruffle, 0.0, 1.5);
  float upx    = 2.0 / res.y;                    // frame units per device px

  // frame coords, height = 2
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;

  // ---- the body: a gentle curve so the rows sweep rather than rule
  vec2 pb = p;
  pb.x += 0.10 * sin(p.y * 1.4 + 0.6) + 0.05 * sin(p.y * 3.1 + 2.0);
  pb.y += 0.05 * sin(p.x * 1.1 + 1.3);
  float fuzz = vnoise(p * 40.0 + 11.0) - 0.5;   // edge raggedness
  // body curvature: the plumage lies over a folded wing, two soft ridges
  // across the frame and a slower roll top to bottom, so the sheen breaks
  // into more than one lit band with shadowed hollows between
  vec2 body = vec2(1.05 * sin(p.x * 2.6 + p.y * 1.5 + 0.4) + 0.35 * sin(p.x * 0.7 - 0.5),
                   0.30 * sin(p.y * 0.9 - 0.3) + 0.12 * sin(p.x * 1.3 + p.y * 2.1));

  // optional pointer: a fingertip parting the plumage. Zero at rest.
  vec2  m   = (u_mouse / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mOn = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float mRuf = mOn * 0.5 * exp(-dot(pb - m, pb - m) * 6.0);

  // ---- lattice
  float rows = clamp(u_rows, 3.0, 14.0);
  float H = 2.0 / rows;                          // row spacing
  float L = 2.25 * H;                            // feather length
  float C = 0.82 * H;                            // column spacing
  float W = 0.67 * C;                            // vane half-width
  float barbPx = max(u_barb, 1.0) * pr;
  float N = 1.0 / (barbPx * upx);                // barbs per frame unit
  float barbVis = smoothstep(1.4, 2.6, barbPx);  // fade barbs below the pixel

  float r0 = ceil(pb.y / H);                     // nearest row rooted at or above

  // sweeping light: a lamp travelling over the body, so the sheen band lives
  // where the local barb angle meets it and slides from feather to feather
  vec2 lampPos = vec2(1.1 * sin(t * 0.33 + 2.7), 0.45 + 0.45 * cos(t * 0.27));
  vec3 Ldir = normalize(vec3(lampPos - pb * 0.45, 1.05));

  // ---- composite front to back. Rows further up the body are in front;
  // within a row the right-hand feather lies on the left one.
  vec3  acc = vec3(0.0);
  float A   = 0.0;
  float frontOut = 10.0;

  for (int j = 2; j >= 0; j--) {
    float r  = r0 + float(j);
    float yr = r * H;                             // root height of this row
    float off = 0.5 * C * mod(r, 2.0);
    float i0 = floor((pb.x - off) / C);
    for (int k = 1; k >= -1; k--) {
      float i  = i0 + float(k);
      vec2  id2 = vec2(i, r);
      float id  = hash21(id2 * 1.73 + 0.31) * 97.0;
      float xc  = (i + 0.5) * C + off;
      // per-feather jitter and the ruffle wave lifting it
      float jx  = (hash21(id2 + 5.0) - 0.5) * 0.10 * C;
      float wave = sin(pb.x * 1.6 - yr * 1.1 - t * 1.1 + id * 0.05);
      float ruffle = rufAmt * 0.35 * (0.5 + 0.5 * wave) + mRuf;
      vec2  lp  = vec2(pb.x - xc - jx, yr - pb.y + ruffle * 0.10 * H);
      float gap, sBarb;
      float d = featherD(lp, L, W, id, N, fuzz, gap, sBarb);
      float aa = upx * 0.9;
      float cover = (1.0 - smoothstep(-aa, aa, d)) * (1.0 - gap);
      float cA = cover * (1.0 - A);
      if (cA > 0.002) {
        vec3 fc = shadeFeather(lp, d, sBarb, L, W, H, id, N, barbVis, ruffle,
                               body, frontOut, Ldir, sheen, t);
        acc += fc * cA;
        A   += cA;
      }
      // this feather now shadows everything behind it: inside a split gap it
      // still casts, as the gap is a narrow slot
      float dEff = max(d, gap * 0.006);
      frontOut = min(frontOut, dEff);
    }
  }

  // ---- whatever shows through: the down beneath, dark and soft
  vec3 down = mix(c3, c0, 0.5) * 0.10 * (0.7 + 0.3 * vnoise(p * 60.0));
  down *= 1.0 - 0.5 * exp(-max(frontOut, 0.0) / (0.05 * H));
  vec3 col = acc + down * (1.0 - A);

  // seat the body: light falls off toward the frame edges
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.30 * smoothstep(0.30, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
