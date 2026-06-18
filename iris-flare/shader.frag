// flare (Rosette) — an off-centre solar-flare iris filling the frame: the radial
// pattern is anchored on a focal point pushed off-centre (rule-of-thirds), so
// the frame reads composed rather than as a lone centred disc. Wispy streamers
// erupt from a hot core like solar prominences, longer and brighter across the
// open side of the frame, shorter behind, all flickering on their own phases. A
// broad warm glow spreads from the focal point so the far corners never go
// dead-black. Colour blends cyclically through the palette by angle around the
// focal point; the core whitens at its hottest.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_streams;  // number of flare streamers around the focal point (default 90)
uniform float u_offset;   // how far the focal point sits off-centre, 0..1     (default 0.34)
uniform float u_flicker;  // streamer flicker rate                             (default 0.5)
uniform float u_heat;     // hot-core radius, css px (×pixelRatio)             (default 75)

const vec3  BG   = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU  = 6.28318530718;

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float mn  = min(res.x, res.y);

  // guard params against the unfed-uniform = 0.0 case so extremes/headless stay sane
  float streamCount = max(u_streams, 8.0);
  float offset      = clamp(u_offset, 0.0, 1.0);
  float flickRate   = max(u_flicker, 0.0);
  float heatR       = max(u_heat, 15.0) * pr;

  // --- focal point pushed off-centre toward the upper-left third ---
  // direction is fixed (composed framing); magnitude is the offset param.
  vec2  dir   = normalize(vec2(-0.72, 0.69));
  vec2  focal = res * 0.5 + dir * (offset * 0.55 * mn);

  // --- polar coordinates centred on the focal point ---
  vec2  d    = fc - focal;
  float ang  = atan(d.y, d.x);          // -PI..PI
  float rad  = length(d);
  // normalise against the farthest corner from the focal point so the open
  // side of the frame reads as 0..~1 and the pattern reaches every corner
  float maxR = length(res) * 0.5 + offset * 0.55 * mn;
  float outward = clamp(rad / maxR, 0.0, 1.0);

  float spin = t * 0.01;

  // ====================================================================
  // STREAMER FIELD
  // Continuous streamer index in angle; keep the two nearest crisp. Each
  // streamer has a hashed reach and flicker. The reach is biased by the
  // streamer direction so prominences on the open side (away from the
  // offset) run long, and those behind the focal point stay short.
  // ====================================================================
  float sa  = (ang / TAU + 0.5 + spin) * streamCount;
  float si0 = floor(sa);
  float si1 = si0 + 1.0;

  // the open direction is opposite the focal offset
  vec2 openDir = -dir;

  float streamLum = 0.0;
  float colAngle  = ang;
  for (int k = 0; k < 2; k++) {
    float si  = (k == 0) ? si0 : si1;
    float siw = mod(si, streamCount);
    float h   = hash11(siw + 1.0);
    float h2  = hash11(siw + 53.0);

    // wispy sideways wander so streamers curl like prominences
    float wander = 0.18 * sin(outward * 4.0 + h * TAU + t * flickRate * 0.4);
    float sd     = sa - (si + 0.5 + wander);
    float across = exp(-pow(sd / 0.55, 2.0));

    // streamer aim direction (unit vector at this streamer angle)
    float sAng   = (siw / streamCount - 0.5 + spin) * TAU;
    vec2  sVec   = vec2(cos(sAng), sin(sAng));
    float openness = 0.5 + 0.5 * dot(sVec, openDir);   // 1 on the open side, 0 behind

    // reach: long on the open side, short behind; hashed per streamer
    float reach  = mix(0.34, 1.2, mix(h, 1.0, 0.45 * openness));
    float along  = (1.0 - smoothstep(reach * 0.4, reach, outward));

    // flicker on each streamer own phase (phase-continuous)
    float fl     = 0.55 + 0.45 * sin(t * flickRate * TAU * (0.5 + h2) + h * TAU);
    float sb     = 0.4 + 0.6 * hash11(siw + 97.0);

    float lum = across * along * fl * sb;
    if (lum > streamLum) {
      streamLum = lum;
      colAngle = sAng;
    }
  }

  // ====================================================================
  // PALETTE: colour by streamer angle, blending the four hues cyclically
  // ====================================================================
  float hue = (colAngle / TAU + 0.5) + t * 0.008;
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 flareCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // HOT CORE & BROAD GLOW at the focal point
  // ====================================================================
  float core   = exp(-pow(rad / heatR, 2.0));            // tight white-hot focal point
  float corona = exp(-pow(rad / (heatR * 4.5), 2.0));    // broad warm halo

  float radialFall = mix(1.3, 0.4, smoothstep(0.0, 0.55, outward));

  vec3 col = BG;
  // streamers, whitened toward the hot core
  vec3 streamTint = mix(flareCol, vec3(1.0), core * 0.8);
  col += streamTint * streamLum * radialFall * 0.95;
  // broad warm corona so the far field never reads dead-black
  col += flareCol * corona * 0.16;
  // the white-hot focal core
  col += mix(flareCol, vec3(1.0), 0.8) * core * 1.3;

  // a very soft global warm lift biased toward the open side so the big empty
  // frame area carries some colour (keyed low so it never greys out the black)
  float openLift = 0.022 * (0.5 + 0.5 * dot(normalize(d + 1e-3), openDir));
  col += flareCol * openLift * (1.0 - outward * 0.5);

  // settle the very corners (light touch — streamers must reach the edge)
  float vign = 1.0 - 0.3 * smoothstep(0.75, 1.25, outward);
  col *= vign;

  // gentle tone shaping
  col = col / (1.0 + col * 0.30);

  gl_FragColor = vec4(col, 1.0);
}
