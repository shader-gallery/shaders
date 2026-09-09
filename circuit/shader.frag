// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// circuit (Trace) - a printed circuit board seen straight down under a raking
// light. The ground is solder mask over bare fibreglass, so the glass weave
// shows through as a faint checker of tows. Copper is routed the way a real
// autorouter lays it: the board is split into square regions, each region
// routes horizontally or vertically, and inside a region parallel bundles of
// one to five traces run in lanes, jogging together at 45 degrees between
// straight runs. Every bundle ends in a row of through-hole pads with drill
// holes (pin one square, a silkscreen outline and a dot-matrix designator
// beside it) or in a row of small vias. Lanes with no bundle carry two-pad
// SMD footprints with their silkscreen box. Traces under the mask are shaded
// as low ridges with a lit top edge and a darker meniscus; pads are tinned
// domes with an annular ring and a dark hole. The perpendicular bottom layer
// shows through the mask as a faint darker shadow. Light pulses race along
// one trace of each bundle with a comet tail and a soft halo on the mask, and
// a slow broad gloss sweeps the board. Everything is built from lane and
// block arithmetic: no feature-point cells anywhere.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_pitch;    // trace pitch in css px                 (default 8)
uniform float u_speed;    // pulse travel speed                    (default 1.0)
uniform float u_density;  // fraction of lanes carrying a bundle   (default 0.8)
uniform float u_glow;     // pulse brightness                      (default 1.0)
uniform float u_weave;    // fibreglass weave and mask texture     (default 1.0)

const float TAU = 6.28318530718;
const float LH  = 6.0;    // lane height, pitch units
const float B   = 30.0;   // region and block size, pitch units (5 lanes)
const float L   = 6.0;    // jog segment length, pitch units

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// three-input hash for (lane, block, seed) style lookups
float h3(float a, float b, float c) {
  return hash21(vec2(a * 1.37 + c * 0.713, b * 2.93 + c * 0.291) + 0.5);
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

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// segment base row for jog segment k of a run: quantised to whole pitches so
// every jog is an exact 45 degree diagonal
float rowOf(float lane, float blk, float k, float seed, float free) {
  return 0.5 + floor(h3(lane, blk * 17.0 + k, seed + 5.0) * (free + 0.999));
}

// two-character dot-matrix designator. p in cell units, 7 x 5 cells
float glyph(vec2 p, float seed) {
  if (p.x < 0.0 || p.x >= 7.0 || p.y < 0.0 || p.y >= 5.0) return 0.0;
  vec2 c = floor(p);
  if (c.x > 2.5 && c.x < 3.5) return 0.0;            // gap between characters
  float on = step(hash21(c + seed * 7.7), 0.56);
  vec2 f = fract(p) - 0.5;
  float cell = 1.0 - smoothstep(0.30, 0.42, max(abs(f.x), abs(f.y)));
  return on * cell;
}

// one row of round pads at x = px, rows py0 .. py0 + n - 1, accumulating into
// the pad layers. sq marks the first pad square (pin one).
void padRow(vec2 p, float px, float py0, float n, float R, float Rd, float sq,
            float aa, vec2 lgt,
            inout float padCov, inout float padShade, inout float drill,
            inout float drillLit, inout float ring, inout float padDist) {
  float jj = clamp(floor(p.y - py0 + 0.5), 0.0, n - 1.0);
  vec2  d2 = vec2(p.x - px, p.y - py0 - jj);
  float isSq = sq * step(jj, 0.5);
  float dist = mix(length(d2), max(abs(d2.x), abs(d2.y)), isSq);
  float pc   = 1.0 - smoothstep(R - aa, R + aa, dist);
  // tinned dome: lit toward the light, a darker rim just inside the edge
  vec2  nd   = d2 / R;
  float dl   = dot(nd, lgt) * 0.8;
  float sh   = 0.82 + 0.30 * dl + 0.30 * smoothstep(0.45, 0.85, dl)
             - 0.30 * smoothstep(0.72, 1.0, dist / R);
  padShade = mix(padShade, sh, pc);
  padCov   = max(padCov, pc);
  float dd = length(d2);
  float dc = 1.0 - smoothstep(Rd - aa, Rd + aa, dd);
  drill    = max(drill, dc);
  // the far wall of the hole catches light
  float lit = smoothstep(0.55, 1.0, dd / Rd) * max(-dot(d2 / max(dd, 1e-4), lgt), 0.0);
  drillLit = max(drillLit, lit * dc);
  ring     = max(ring, smoothstep(R, R + 0.03, dist) - smoothstep(R + 0.05, R + 0.22, dist));
  padDist  = min(padDist, dist - R);
}

// One routing family: horizontal lanes of trace bundles in q space. Called a
// second time with q.yx for the vertical family. lgt is the 2d light direction
// expressed in this frame.
void family(vec2 q, float seed, float aa, float t, float dens, float spd, vec2 lgt,
            out float cov, out float shade, out float ring,
            out float padCov, out float padShade, out float drill, out float drillLit,
            out float silk, out float pulse, out float halo) {
  cov = 0.0; shade = 0.0; ring = 0.0; padCov = 0.0; padShade = 0.0;
  drill = 0.0; drillLit = 0.0; silk = 0.0; pulse = 0.0; halo = 0.0;
  float padDist = 10.0;

  float lane = floor(q.y / LH);
  float y0   = q.y - lane * LH;
  float blk  = floor(q.x / B);
  float xl0  = q.x - blk * B;

  float hA = h3(lane, blk, seed);
  float hB = h3(lane, blk, seed + 1.0);
  float hC = h3(lane, blk, seed + 2.0);
  float hD = h3(lane, blk, seed + 3.0);
  float hE = h3(lane, blk, seed + 4.0);

  if (hA > dens) {
    // ---- empty lane: up to three SMD two-pad footprints with silkscreen box
    float slotW = B / 3.0;
    float slot  = floor(xl0 / slotW);
    float sx    = xl0 - slot * slotW;
    float s1 = h3(lane, blk * 3.0 + slot, seed + 8.0);
    float s2 = h3(lane, blk * 3.0 + slot, seed + 9.0);
    float s3 = h3(lane, blk * 3.0 + slot, seed + 10.0);
    if (s1 > 0.34) return;
    vec2 c = vec2(slotW * 0.5 + (s2 - 0.5) * 3.5, LH * 0.5 + (s3 - 0.5) * 1.8);
    vec2 p = vec2(sx, y0) - c;
    vec2 lg = lgt;
    if (s2 > 0.5) { p = p.yx; lg = lgt.yx; }
    float pd = sdBox(vec2(abs(p.x) - 0.9, p.y), vec2(0.42, 0.55));
    float pc = 1.0 - smoothstep(-aa, aa, pd);
    padCov   = pc;
    padShade = 0.92 + 0.10 * dot(vec2(sign(p.x), 0.0), lg)
             - 0.22 * smoothstep(-0.14, 0.0, pd);
    ring     = smoothstep(0.0, 0.03, pd) - smoothstep(0.05, 0.2, pd);
    float sd = abs(sdBox(p, vec2(1.85, 0.95)));
    silk = (1.0 - smoothstep(0.07, 0.07 + aa, sd)) * smoothstep(0.12, 0.28, pd);
    return;
  }

  // ---- a bundle: n parallel traces, thick single power trace 30% of the time
  float thick = step(hB, 0.24);
  float n  = mix(2.0 + floor((hB - 0.24) / 0.76 * 3.999), 1.0, thick);
  float xa = 3.4 + hC * 3.6;              // run start, block-local
  float xb = B - (2.2 + hD * 3.3);        // run end
  float runLen = xb - xa;
  float xl = xl0 - xa;                    // run-local x
  float K  = floor(runLen / L);           // full jog segments in the run
  float k  = floor(xl / L);
  float f  = xl - k * L;
  float free = LH - (n - 1.0) - 1.0;      // rows the bundle can wander over
  float k0 = clamp(k, 0.0, K - 1.0);
  float k1 = clamp(k + 1.0, 0.0, K - 1.0);
  float yk  = rowOf(lane, blk, k0, seed, free);
  float yk1 = rowOf(lane, blk, k1, seed, free);
  float dlt = yk1 - yk;
  float xr  = L - abs(dlt);               // the jog starts here in the segment
  float s   = 0.0;
  float yc  = yk;
  if (f > xr) { s = sign(dlt); yc = yk + s * (f - xr); }

  // distance to the nearest trace of the bundle
  float dy = y0 - yc;
  float j  = clamp(floor(dy + 0.5), 0.0, n - 1.0);
  float dj = dy - j;
  float dperp = abs(dj) / sqrt(1.0 + s * s);
  float w  = mix(0.15, 0.40, thick);
  float inRun = step(0.0, xl) * step(xl, runLen);
  cov = (1.0 - smoothstep(w - aa, w + aa, dperp)) * inRun;
  vec2  nrm  = normalize(vec2(-s, 1.0)) * sign(dj);
  float edge = smoothstep(w * 0.3, w, dperp);
  shade = dot(nrm, lgt) * edge * cov;
  ring  = (smoothstep(w, w + 0.02, dperp) - smoothstep(w + 0.04, w + 0.18, dperp)) * inRun;

  // ---- terminations: header pad rows (with pin one square) or via rows
  float isHdr = step(hE, 0.55);
  float R  = mix(0.30, mix(0.42, 0.62, thick), isHdr);
  float Rd = mix(0.13, mix(0.19, 0.30, thick), isHdr);
  float yS = rowOf(lane, blk, 0.0, seed, free);
  float yE = rowOf(lane, blk, K - 1.0, seed, free);
  vec2 p = vec2(xl, y0);
  padRow(p, 0.0,    yS, n, R, Rd, isHdr, aa, lgt, padCov, padShade, drill, drillLit, ring, padDist);
  padRow(p, runLen, yE, n, R, Rd, 0.0,   aa, lgt, padCov, padShade, drill, drillLit, ring, padDist);

  // ---- silkscreen: outline boxes round header rows plus a designator
  if (isHdr > 0.5) {
    float hh = (n - 1.0) * 0.5 + 0.8;
    float b0 = abs(sdBox(p - vec2(0.0,    yS + (n - 1.0) * 0.5), vec2(0.8, hh)));
    float b1 = abs(sdBox(p - vec2(runLen, yE + (n - 1.0) * 0.5), vec2(0.8, hh)));
    float bx = min(b0, b1);
    silk = (1.0 - smoothstep(0.07, 0.07 + aa, bx)) * smoothstep(0.08, 0.22, padDist);
    vec2 gp = (p - vec2(-3.3, yS + (n - 1.0) * 0.5 - 0.8)) / 0.32;
    silk = max(silk, glyph(gp, lane * 3.1 + blk * 7.3 + seed));
  }

  // ---- the pulse: one trace of the bundle carries a travelling light
  float hP  = h3(lane, blk, seed + 6.0);
  float hQ  = h3(lane, blk, seed + 7.0);
  float pj  = min(floor(hP * n), n - 1.0);
  float dir = step(0.5, hQ) * 2.0 - 1.0;
  float C   = runLen + 28.0 + hP * 36.0;          // cycle includes dark time
  float ph  = fract(t * 14.0 * spd / C + hQ) * C; // distance travelled
  float xh  = mix(runLen - ph, ph, step(0.0, dir));
  float behind  = (xh - xl) * dir;
  float onTrace = step(abs(j - pj), 0.5) * cov;
  float alive   = step(ph, runLen + 10.0);
  pulse = exp(-max(behind, 0.0) * 0.18) * step(0.0, behind) * onTrace * alive;
  float yrow = yc + pj;
  vec2  hd   = vec2(xl - xh, y0 - yrow);
  halo = exp(-dot(hd, hd) * 1.6) * step(ph, runLen + 0.3);
  // wider bundles carry a second pulse on another trace, the other way
  if (n > 2.5) {
    float pj2  = mod(pj + 1.0 + floor(hQ * (n - 1.0)), n);
    float ph2  = fract(t * 11.0 * spd / C + hP * 0.61) * C;
    float xh2  = mix(ph2, runLen - ph2, step(0.0, dir));
    float bh2  = (xl - xh2) * dir;
    float on2  = step(abs(j - pj2), 0.5) * cov;
    pulse = max(pulse, exp(-max(bh2, 0.0) * 0.18) * step(0.0, bh2) * on2 * step(ph2, runLen + 10.0));
    vec2 hd2 = vec2(xl - xh2, y0 - (yc + pj2));
    halo = max(halo, exp(-dot(hd2, hd2) * 1.6) * step(ph2, runLen + 0.3));
  }
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr       = max(u_pixelRatio, 0.5);
  vec2  res      = u_resolution;
  float refScale = pow(max(min(res.x, res.y) / (pr * 400.0), 1.0), 0.6);
  float unit     = max(u_pitch, 3.0) * refScale * pr;   // device px per pitch
  vec2  q        = gl_FragCoord.xy / unit;
  float aa       = 0.8 / unit;
  float t        = u_time;
  float dens     = clamp(u_density, 0.0, 1.0);
  float spd      = clamp(u_speed, 0.0, 4.0);
  float glow     = clamp(u_glow, 0.0, 3.0);
  float wv       = clamp(u_weave, 0.0, 2.0);
  vec2  uv       = gl_FragCoord.xy / res;

  // light from the upper left, raking
  vec2 lgt = normalize(vec2(-0.55, 0.83));

  // ---- region orientation: each B x B square routes one way on top
  vec2  rid = floor(q / B);
  float isH = step(hash21(rid + 3.7), 0.52);

  float covH, shH, rgH, pcH, psH, drH, dlH, skH, puH, haH;
  float covV, shV, rgV, pcV, psV, drV, dlV, skV, puV, haV;
  family(q,    1.0, aa, t, dens, spd, lgt,    covH, shH, rgH, pcH, psH, drH, dlH, skH, puH, haH);
  family(q.yx, 2.0, aa, t, dens, spd, lgt.yx, covV, shV, rgV, pcV, psV, drV, dlV, skV, puV, haV);

  float cov   = mix(covV, covH, isH);
  float shade = mix(shV,  shH,  isH);
  float ring  = mix(rgV,  rgH,  isH);
  float padC  = mix(pcV,  pcH,  isH);
  float padS  = mix(psV,  psH,  isH);
  float drill = mix(drV,  drH,  isH);
  float drLit = mix(dlV,  dlH,  isH);
  float silk  = mix(skV,  skH,  isH);
  float pulse = mix(puV,  puH,  isH);
  float halo  = mix(haV,  haH,  isH);
  // the other family is the bottom copper, a shadow through the laminate
  float ghost = mix(covH, covV, isH) * 0.55 + mix(pcH, pcV, isH) * 0.35;

  // ---- materials, all tinted from the palette
  float l0 = luma(c0), l1 = luma(c1), l2 = luma(c2);
  vec3 maskBase = mix(vec3(l0), c0, 0.75) * 0.37;
  vec3 traceCol = mix(maskBase * 2.1, mix(vec3(l1), c1, 0.8), 0.20);
  vec3 metal    = mix(vec3(l2), c2, 0.50) * 1.05;
  vec3 silkCol  = mix(vec3(0.93), c2, 0.06);
  vec3 pulseCol = mix(c2, vec3(1.0), 0.35);

  // ---- the ground: mask over glass. Weave of tows, fine fibres within tows,
  // slow mottle in the mask thickness
  float tow  = 1.7;
  float wx   = sin(q.x * TAU / tow), wy = sin(q.y * TAU / tow);
  float chk  = wx * wx - wy * wy;                       // over and under tows
  float fibA = sin(q.y * TAU / 0.21) * step(0.0, chk);   // fibres run along each tow
  float fibB = sin(q.x * TAU / 0.21) * step(chk, 0.0);
  float weave = chk * 0.085 + (fibA + fibB) * 0.022;
  float mottle = vnoise(q * 0.22 + 7.0) - 0.5;
  vec3 ground = maskBase * (1.0 + wv * (weave + mottle * 0.16) + 0.06 * (uv.y - 0.5));

  // ---- composite, bottom up
  vec3 col = ground;
  col = mix(col, maskBase * 0.62, ghost);                       // bottom copper shadow
  col *= 1.0 - 0.28 * ring;                                     // mask meniscus, ring openings
  vec3 tc = traceCol * (1.0 + 0.45 * shade);
  float sp = max(shade, 0.0); sp = sp * sp;
  tc += 0.10 * sp;                                              // gloss on the lit edge
  col = mix(col, tc, cov);
  col = mix(col, metal * padS, padC);
  vec3 hole = mix(vec3(0.03), metal * 0.55, drLit);
  col = mix(col, hole, drill);
  col = mix(col, silkCol, silk * 0.92);

  // ---- pulses: the trace heats toward the light, tail and halo add glow
  col = mix(col, pulseCol, pulse * 0.85 * min(glow, 1.0));
  col += pulseCol * (pulse * 0.6 + halo * 0.9) * glow;

  // ---- the raking light itself: brighter toward the lamp in the upper left,
  // a broad gloss band sweeping slowly across the mask, and a soft seat
  vec2  vq  = uv - 0.5;
  float lamp = dot(vq, vec2(-0.6, 0.8));
  col *= 1.0 + 0.32 * lamp;
  float gl = uv.x * 0.7 + uv.y * 0.5 - 0.35 - 0.3 * sin(t * 0.11);
  col += mix(vec3(1.0), c2, 0.3) * 0.05 * exp(-gl * gl * 9.0);
  col *= 1.0 - 0.18 * smoothstep(0.5, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
