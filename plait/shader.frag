// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// plait (Strand) - a woven braid of glowing cords. A bundle of strands runs the
// width of the frame, each weaving up and down on a phase-shifted sine so the
// neighbours cross over and under one another like a plaited rope. At every
// crossing the strand whose phase is rising rides in front (brighter, with the
// one behind dipping into shadow), which sells the woven over-under depth. The
// whole braid travels slowly sideways. Open cords only - the gaps stay empty.
// (ASCII-only comments: the headless poster compiler is fussy about apostrophes.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_strands;   // cords in the braid                 (default 9)
uniform float u_weave;     // crossings across the width          (default 5)
uniform float u_amp;       // weave height vs strand spacing       (default 0.95)
uniform float u_travel;    // sideways travel speed                (default 0.4)
uniform float u_line;      // cord half-width, css px              (default 2.2)
uniform float u_hue;       // hue spread across the braid          (default 1.0)
uniform float u_glow;      // soft halo strength                   (default 0.7)

const vec3 BG = vec3(0.035, 0.035, 0.043);
const int  MAXS = 24;      // hard loop bound; u_strands gates it live

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
  float lw  = max(u_line, 0.5) * refScale * pr;
  float nS  = max(floor(u_strands + 0.5), 2.0);
  float band = res.y * 1.05;                          // overscan so the weave reaches top + bottom edges
  float spacing = band / (nS + 1.0);
  float amp  = spacing * clamp(u_amp, 0.0, 1.6);
  float k    = 6.2831853 * max(u_weave, 0.5) / res.x; // spatial frequency across width
  float ph   = t * u_travel * 0.6;                    // sideways travel

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // composite the strands front-to-back using their sine depth z (>0 = in front).
  // we keep a running colour and an occlusion mask: a nearer cord paints over the
  // accumulated colour where it covers, so crossings read as genuine over/under.
  vec3  col  = BG;
  float topZ = -2.0;

  float baseY = res.y * 0.5;                           // centred; band overscans to both edges
  for (int j = 0; j < MAXS; j++) {
    if (float(j) >= nS) break;
    float fj = float(j);
    float centre = baseY + (fj - (nS - 1.0) * 0.5) * spacing;
    // slow large-scale undulation so the whole braid billows instead of sitting as a rigid grid
    centre += res.y * 0.05 * sin(fc.x * (2.2 / res.x) + t * 0.18 + fj * 0.4);
    float phase  = k * fc.x + ph + fj * (3.14159265 * 0.66);   // neighbour offset -> weave
    float y = centre + amp * sin(phase);
    float z = cos(phase);                               // depth: rising edge rides in front
    float dy = abs(fc.y - y);
    // account for the cord slope so the stroke keeps even width on the diagonals
    float slope = amp * k * cos(phase);
    float dperp = dy / sqrt(1.0 + slope * slope);
    // rounded tube: a soft body plus a bright sheen line down the centre so each
    // cord reads as a 3D rope catching light, not a flat stripe.
    float body  = smoothstep(lw, lw * 0.2, dperp);
    float sheen = smoothstep(lw * 0.5, 0.0, dperp);
    float halo  = lw / (dperp + lw * 1.3); halo = halo * halo * 0.5 * u_glow;
    if (body + halo < 0.003) continue;

    vec3 cc = wheelCol(fj / nS * u_hue + fc.x / res.x * 0.18 * u_hue + t * 0.02, c0, c1, c2, c3);
    float shade = 0.42 + 0.58 * z;                      // front of the weave is brighter
    vec3 emit = cc * (body * shade + halo * (0.4 + 0.3 * z))
              + mix(cc, vec3(1.0), 0.5) * sheen * (0.35 + 0.45 * z);

    if (z >= topZ) {
      // this cord is in front here: cast a shadow gap onto whatever sits behind,
      // then paint the rope over it so the over-under interlace reads strongly.
      col = mix(col, BG * 0.45, body * 0.85);
      col += emit;
      topZ = mix(topZ, z, body);
    } else {
      // behind the current front cord: dimmed, and its core occluded by the front
      col += emit * 0.28;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
