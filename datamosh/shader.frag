// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// datamosh (Glitch) - a video stream whose keyframes have been cut out, so the
// decoder keeps applying motion vectors to picture data it should have thrown
// away. Underneath is a slow piece of footage: a dusk sky with a lit band on
// the horizon, cloud shading, two drifting lights and a low skyline. It is
// decoded at a stuttering frame rate onto a macroblock grid. Regions of that
// grid break: a block either HOLDS the stale colour it had seconds ago,
// flattened to one macroblock, or SLIDES, dragging the old picture along a
// quantised region motion vector and smearing it into a streak that grows the
// longer it goes without a clean frame. Regions refresh on their own clocks
// and break again, so the damage crawls. On top: luma posterised to a few
// levels, coarse chroma steps, DCT basis ringing inside blocks that carry a
// hard edge, and faint macroblock seams. Single pass, no feedback: the stale
// picture is the same scene evaluated at an earlier time.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_block;    // macroblock size, css px                (default 14)
uniform float u_damage;   // fraction of the picture that is broken (default 0.62)
uniform float u_smear;    // drag length of sliding blocks          (default 1.0)
uniform float u_bitrate;  // 1 is clean, 0 is a starved encoder     (default 0.4)
uniform float u_speed;    // playback rate                          (default 1.0)

const int   NS  = 8;      // taps along the smear
const float PI  = 3.14159265;
const float K   = 7.0;    // seconds a region goes between clean frames

vec3  c0, c1, c2, c3;
vec3  night;
float aspect;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + vec2(41.3, 17.9)));
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

// the footage. p is frame-relative: x centred and aspect-corrected, y 0..1.
// Deliberately cheap (two noise reads) because the smear taps it eight times.
// Kept dark: the lit band and the two lights are the only bright things.
vec3 scene(vec2 p, float t) {
  float n  = vnoise(vec2(p.x * 1.6 + t * 0.040, p.y * 2.6 + t * 0.015));
  float n2 = vnoise(vec2(p.x * 4.2 - t * 0.030, p.y * 6.0 + 5.0) + n * 1.5);
  float cloud = n * 0.65 + n2 * 0.35;
  float y = p.y;
  // dark zenith falling into a lit band low on the frame
  float band = exp(-abs(y - 0.36) * 5.0);
  vec3 col = night * (0.8 + 0.4 * (1.0 - y));
  col += c1 * band * (0.18 + 0.30 * cloud);
  col += c2 * band * band * 0.22;
  // cloud bellies shade the glow
  col *= 0.70 + 0.55 * cloud;
  // two drifting lights, one cool and one warm, on different orbits
  vec2 b1 = vec2(0.30 * aspect * sin(t * 0.11), 0.62 + 0.08 * cos(t * 0.07));
  vec2 b2 = vec2(0.28 * aspect * cos(t * 0.08 + 1.0), 0.47 + 0.10 * sin(t * 0.13));
  vec2 d1 = p - b1, d2 = p - b2;
  col += c0 * exp(-dot(d1, d1) * 9.0) * 0.45;
  col += c2 * exp(-dot(d2, d2) * 22.0) * 0.50;
  // a scatter of stars: the hard points that smear into lines once moshed
  vec2  sg = floor(p * 90.0);
  vec2  sf = fract(p * 90.0) - 0.5;
  float sh = hash21(sg + 0.7);
  float star = step(0.955, sh) * smoothstep(0.30, 0.05, length(sf)) * smoothstep(0.30, 0.80, y);
  col += mix(c2, vec3(1.0), 0.5) * star * 0.7;
  // the city: a hazed far row of towers and a dark near row, each pricked
  // with grids of lit windows. Those hard little rectangles are what the
  // mosh drags into streaks, so they carry the piece.
  float fx   = p.x * 6.0 + 0.3;
  float fid  = floor(fx);
  float fh   = hash21(vec2(fid, 4.0));
  float fTop = 0.17 + 0.25 * fh * fh;
  float far  = smoothstep(fTop + 0.004, fTop - 0.004, y);
  vec3  farCol = mix(night * 0.9 + c1 * 0.04, col, 0.40);
  vec2  fwc  = vec2(fx * 5.0, y * 72.0);
  vec2  fwf  = fract(fwc);
  float fwin = step(0.74, hash21(floor(fwc) + 2.2))
             * step(0.30, fwf.x) * step(fwf.x, 0.62) * step(0.35, fwf.y) * step(fwf.y, 0.65);
  farCol += c2 * fwin * 0.30 * step(y, fTop - 0.012);
  col = mix(col, farCol, far);
  float nx   = p.x * 9.0;
  float nid  = floor(nx);
  float nh   = hash21(vec2(nid, 1.0));
  float nTop = 0.06 + 0.26 * nh * nh;
  float near = smoothstep(nTop + 0.003, nTop - 0.003, y);
  vec3  nearCol = night * 0.5 + c3 * 0.04;
  vec2  nwc  = vec2(nx * 6.0, y * 84.0);
  vec2  nwf  = fract(nwc);
  float nwh  = hash21(floor(nwc) + 3.3);
  float nwin = step(0.62, nwh)
             * step(0.28, nwf.x) * step(nwf.x, 0.66) * step(0.30, nwf.y) * step(nwf.y, 0.68);
  nwin *= step(y, nTop - 0.012);
  vec3  winCol = mix(c2, c0, step(0.92, nwh)) * (0.45 + 0.55 * hash21(floor(nwc) + 9.1));
  nearCol += winCol * nwin * 0.85;
  col = mix(col, nearCol, near);
  return col;
}

void main() {
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // the dark of the footage: a desaturated deep tone pulled toward the 4th pole
  night = mix(vec3(0.045, 0.050, 0.066), c3, 0.16);

  float pr  = max(u_pixelRatio, 0.5);
  vec2  res = u_resolution;
  vec2  fc  = gl_FragCoord.xy;
  aspect    = res.x / res.y;
  float t   = u_time * clamp(u_speed, 0.0, 3.0) + 13.0;   // start mid-mosh
  float dmg = clamp(u_damage, 0.0, 1.0);
  float smr = max(u_smear, 0.0);
  float starve = 1.0 - clamp(u_bitrate, 0.0, 1.0);

  // ---- the decode: a stuttering frame clock and a macroblock grid
  float fps = 12.0;
  float tq  = floor(t * fps) / fps;
  float B   = max(u_block, 4.0) * pr;
  vec2  bq  = floor(fc / B);              // macroblock index
  vec2  bf  = fract(fc / B);              // position inside the block
  vec2  bcp = (bq + 0.5) * B;             // block centre, device px
  vec2  rq  = floor(bq / 6.0);            // 6x6 block regions share a vector
  vec2  P   = vec2((fc.x / res.x - 0.5) * aspect, fc.y / res.y);
  vec2  Pc  = vec2((bcp.x / res.x - 0.5) * aspect, bcp.y / res.y);

  // ---- the damage clock. A smooth field over the block grid says when each
  // part of the picture last saw a clean frame, so refresh fronts crawl across
  // the picture as organic contours, not rectangles. Blocks sit a few frames
  // apart on that clock so the picture tears at macroblock seams.
  float hb   = hash21(bq + 7.7);
  float hb2  = hash21(bq * 1.7 + 2.3);
  float phF  = vnoise(bq * 0.055 + 31.0);
  float ph   = t + phF * K * 1.6 + hb * K * 0.025;
  float slot = floor(ph / K);
  float age  = floor(mod(ph, K) * fps) / fps;
  // motion vectors: a smooth vector field over the grid, re-rolled per slot,
  // quantised to quarter-pel steps and biased sideways the way a pan is
  vec2  mv   = vec2(vnoise(bq * 0.05 + slot * 7.3 + 2.0), vnoise(bq * 0.05 + 50.0 + slot * 3.1)) - 0.5;
  mv  = mv * vec2(0.34, 0.10) + vec2(0.08, -0.01) * sign(phF - 0.5);
  mv  = floor(mv * 48.0) / 48.0;
  vec2  mvd  = normalize(mv + vec2(1e-4, 0.0));

  // ---- which blocks are broken: a slow blobby field over the block grid so
  // damage arrives in coherent patches, salted per block so the patches have
  // ragged staircase edges and holes of intact picture inside them
  float field = vnoise(bq * 0.06 + vec2(slot * 3.7, 9.0) + t * 0.02);
  field += (hb2 - 0.5) * 0.22;
  float broken = step(mix(0.88, 0.12, dmg), field);
  // inside the damage, clumps of blocks HOLD stale colour; the rest slide
  float hfield = vnoise(bq * 0.21 + vec2(5.0, slot * 2.1) + 11.0);
  float hold   = broken * step(0.76, hfield + (hb - 0.5) * 0.15);
  float slide  = broken * (1.0 - hold);

  // ---- assemble the block. Broken blocks show the picture from the time of
  // their last clean frame. Sliding blocks drag it along the motion vector
  // and STRETCH it: the decoder keeps re-applying the same vector, so the
  // picture piles up into long streaks along the motion direction, growing
  // as the block ages. A directional blur along the vector softens the
  // streak the way accumulated residuals do.
  float tSrc   = mix(tq, tq - age, broken);
  float grow   = 1.0 - exp(-age * 0.5);
  vec2  anchor = vec2(0.0, 0.5);
  vec2  drag   = mv * grow * K * smr * 0.7;
  float along  = dot(P - anchor, mvd);
  float squash = 0.7 * grow * min(smr, 1.0);
  vec2  Ps     = P - mvd * along * squash - drag;
  vec2  Pb     = mix(P, Ps, slide);
  // held blocks are one flat macroblock of an old frame
  Pb = mix(Pb, Pc, hold);
  vec2  blur   = mvd * (0.02 + length(drag) * 0.6) * slide;

  vec3 col = vec3(0.0);
  for (int i = 0; i < NS; i++) {
    float s = (float(i) + 0.5) / float(NS) - 0.5;
    col += scene(Pb - blur * s, tSrc);
  }
  col /= float(NS);
  // block-centre sample of the same picture: the coarse chroma reference
  // and the measure of how much edge the block carries
  vec3 colC = scene(Pb + (Pc - P), tSrc);

  // held blocks keep a stale tint: colour from the old frame, slightly
  // shifted toward the first pole the way a wrong reference frame reads
  col = mix(col, mix(col, c0, 0.22) * 0.9, hold);
  // sliding blocks brighten a little with age: P-frame residuals accumulate
  col *= 1.0 + 0.15 * slide * grow;

  // ---- codec look: posterised luma, coarse chroma, ringing, seams
  float L  = luma(col);
  float Lc = luma(colC);
  vec3  ch = col - L;
  vec3  chC = colC - Lc;
  float levels = mix(64.0, 9.0, starve * (0.55 + 0.45 * broken));
  // DCT basis ringing: a low-order cosine pair inside the block, only where
  // the block carries an edge (a starved encoder cannot afford the detail)
  float kx = 1.0 + floor(hb * 2.0), ky = 1.0 + floor(hb2 * 2.0);
  float basis = cos(PI * kx * bf.x) * cos(PI * ky * bf.y);
  float edgeW = smoothstep(0.02, 0.14, abs(L - Lc)) * (0.4 + 0.6 * broken);
  L += basis * starve * 0.06 * edgeW;
  float Lq = floor(L * levels + 0.5) / levels;
  L = mix(L, Lq, 0.6 + 0.4 * starve);
  // chroma at 4:2:0: pulled toward the block-centre chroma in stepped values
  float cstep = mix(64.0, 12.0, starve);
  ch = mix(ch, chC, 0.45 * starve + 0.15 * broken);
  ch = floor(ch * cstep + 0.5) / cstep;
  col = L + ch;

  // macroblock seams: a one-pixel darkening on the borders of broken blocks,
  // plus a faint bright tear along sliding ones
  vec2  eb   = min(bf, 1.0 - bf) * B;
  float seam = 1.0 - smoothstep(0.0, 1.2 * pr, min(eb.x, eb.y));
  col *= 1.0 - seam * (0.03 + 0.10 * starve) * broken;
  col += seam * slide * c2 * 0.06 * grow;

  // a whisper of mosquito noise around the broken patches
  float mosq = hash21(fc / pr + floor(tq * 60.0)) - 0.5;
  col += mosq * 0.025 * starve * (0.3 + broken);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
