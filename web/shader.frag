// web (Loom) -- a dew-strung orb web seen close and at an angle, the way a macro
// lens catches it at dawn. The web is built as faceted capture passes (straight
// chords between irregular radial spokes) winding out from a single off-centre
// hub, but you barely see the silk: every thread is a dense STRING OF DEW PEARLS,
// and a shallow depth of field holds one band in sharp focus while the rest melts
// into soft glowing bokeh. The whole sheet is foreshortened by perspective and
// sags under gravity; the pearls glint awake in a slow chase out from the hub.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spokes;      // radial silk spokes                       (default 16)
uniform float u_spacing;     // gap between capture passes, css px        (default 26)
uniform float u_beads;       // dew pearls per capture gap (string density) (default 1.4)
uniform float u_facet;       // 0 round .. 1 angular chord capture thread  (default 0.85)
uniform float u_spiral;      // 0 rings .. 1 winding capture spiral        (default 0.6)
uniform float u_sag;         // gravity droop of the hung web             (default 0.35)
uniform float u_tilt;        // perspective foreshortening of the sheet    (default 0.55)
uniform float u_dof;         // depth-of-field bokeh strength             (default 1.0)
uniform float u_focal;       // screen height of the in-focus band         (default 0.12)
uniform float u_backlight;   // soft bespoke backlight glow               (default 0.4)
uniform float u_glintSpeed;  // dew chase rate                            (default 0.5)

const vec3  BG       = vec3(0.026, 0.028, 0.039); // near-black night base
const float TAU      = 6.2831853;
const float PI       = 3.14159265;
const float MAX_SPK  = 26.0;
const float MAX_RING = 26.0;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i, vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float spokeAngle(float i, float cell) {
  float jitter = (hash11(i * 3.17 + 1.0) - 0.5) * cell * 0.5;
  return i * cell + jitter - PI;
}
float spokeReach(float i, float scale) {
  return scale * (0.6 + 0.6 * hash11(i * 7.3 + 4.0));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;
  float scale = min(res.x, res.y);

  // screen coord centred, square units; y up
  vec2 uvc = (fc - 0.5 * res) / scale;

  // --- depth of field: distance from a horizontal in-focus band gives a blur
  // amount 0 (sharp) .. 1 (full bokeh). The focal band can be placed up/down. ---
  float focalY = u_focal;
  float blur = clamp(abs(uvc.y - focalY) * (0.4 + u_dof * 3.2), 0.0, 1.0);
  blur = pow(blur, 0.85);

  // --- perspective: foreshorten the web plane so it recedes toward the top ---
  float depth = 1.0 + u_tilt * (uvc.y - focalY);
  vec2  webuv = uvc / max(depth, 0.25);

  // hub off-centre (down-left in web space), in px-like units
  vec2 hub = vec2(-0.13, 0.10);
  vec2 p0  = (webuv - hub) * scale;

  // tremble (small, scaled down when far/blurred so it reads as one sheet)
  float trAmp = 2.2 * pr * (1.0 - 0.5 * blur);
  vec2 sway = vec2(sin(t * 0.5 + 1.3), cos(t * 0.45)) * 0.8;
  vec2 nz = vec2(vnoise(p0 * 0.01 + vec2(0.0, t * 0.3)),
                 vnoise(p0 * 0.01 + vec2(7.0, t * 0.26))) - 0.5;
  p0 += (sway + nz) * trAmp;

  // gravity sag: droop downward, more at the periphery
  float r0 = length(p0);
  p0.y += u_sag * 0.5 * (r0 * r0) / scale;

  float r   = length(p0);
  float ang = atan(p0.y, p0.x);

  float refScale = scale / (max(pr, 1.0) * 400.0);
  float ringGap = max(u_spacing, 6.0) * refScale * pr;

  float nSpk = clamp(floor(u_spokes + 0.5), 5.0, MAX_SPK);
  float cell = TAU / nSpk;

  // bracketing spokes for the faceted capture chord
  float sf = (ang + PI) / cell;
  float iA = floor(sf);
  float aA = spokeAngle(mod(iA, nSpk), cell);
  float aB = spokeAngle(mod(iA + 1.0, nSpk), cell);
  if (aB < aA) aB += TAU;
  float angU = ang < aA ? ang + TAU : ang;
  float tSec = clamp((angU - aA) / max(aB - aA, 1e-3), 0.0, 1.0);

  // nearest spoke (for spoke pearls) + its reach
  float spokeDist = 1e9, spokeIdx = 0.0, spokeAng = 0.0, spokeRchN = scale;
  for (float i = 0.0; i < MAX_SPK; i += 1.0) {
    if (i >= nSpk) break;
    float a = spokeAngle(i, cell);
    vec2 dir = vec2(cos(a), sin(a));
    float along = dot(p0, dir);
    float reach = spokeReach(i, scale);
    float perp  = abs(dot(p0, vec2(-dir.y, dir.x)));
    float d = (along > 0.0 && along < reach) ? perp : 1e9;
    if (d < spokeDist) { spokeDist = d; spokeIdx = i; spokeAng = a; spokeRchN = reach; }
  }

  // faceted capture pass radius at this angle
  float halfSec = 0.5 * (aB - aA);
  float midSec  = 0.5 * (aA + aB);
  float bow = mix(1.0, cos(halfSec) / max(cos(angU - midSec), 0.25), clamp(u_facet, 0.0, 1.0));
  // fade capture beads out where the chord math degrades (fragment beyond the
  // sector, where the bow denominator would clamp and smear the disc)
  float sectorValid = smoothstep(0.26, 0.45, cos(angU - midSec));
  float phase = ((angU + PI) / TAU) * clamp(u_spiral, 0.0, 1.0);
  float unit  = ringGap * bow;
  float kRing = floor(r / unit - phase + 0.5);
  float passR = (kRing + phase) * unit;
  float ringDist = abs(r - passR);

  float sectorReach = mix(spokeReach(mod(iA, nSpk), scale),
                          spokeReach(mod(iA + 1.0, nSpk), scale), tSec);
  float inner = smoothstep(ringGap * 0.5, ringGap * 1.25, r);
  float outer = 1.0 - smoothstep(sectorReach, sectorReach + ringGap * 1.5, r);
  float webMask = inner * outer;

  // --- dew pearls strung along the threads ---
  // A bokeh disc must stay SMALLER than the gap between pearls so neighbours do
  // not merge into a mosaic. Sharp pearls are tiny points; as blur rises each
  // grows into a soft round disc with a bright rim, dims, and a share of pearls
  // drop out so the out-of-focus field reads as scattered bokeh, not a grid.
  float beadGap = ringGap / max(u_beads, 0.3);          // arclength between pearls
  float Rsharp  = 1.6 * pr;
  float Rbokeh  = beadGap * 0.42;                       // capped below the spacing
  float beadR   = mix(Rsharp, Rbokeh, blur);
  float beadAmp = mix(1.0, 0.32, blur);                 // energy spreads when blurred

  // Each pearl is masked by the radius of its OWN centre, not the fragment, and
  // the fade is widened by the bokeh radius -- so a whole disc fades in or out
  // together instead of being sliced into a hard edge at the web boundary.
  float fade = beadR + ringGap * 0.6;

  // Sum the few nearest pearls along each thread (not just the single nearest)
  // and reconstruct each bead centre as a real 2D point, so large bokeh discs
  // overlap smoothly instead of snapping into blocky nearest-pearl cells.
  // beads sit on the SMOOTH spiral (the facet bow only bends the faint silk, not
  // the bead centres) and are splatted over a fixed 3x3 ring-by-arc neighbourhood
  // of fixed-point centres, so every disc is round and overlaps cleanly.
  float capBead = 0.0;
  float kc = floor(r / ringGap - phase + 0.5);
  float capId0 = floor(angU * passR / beadGap + 0.5);   // id for the glint chase
  for (float dk = -1.0; dk <= 1.0; dk += 1.0) {
    float Rk = (kc + dk + phase) * ringGap;
    if (Rk < ringGap * 0.4) continue;
    float jc = floor(angU * Rk / beadGap + 0.5);
    for (float dj = -1.0; dj <= 1.0; dj += 1.0) {
      float aBead = (jc + dj) * beadGap / max(Rk, 1.0);
      float d = length(p0 - Rk * vec2(cos(aBead), sin(aBead)));
      float rimX = (d - beadR * 0.8) / (beadR * 0.2 + 1e-3);
      capBead += mix(exp(-(d * d) / (Rsharp * Rsharp)),
                     smoothstep(beadR, beadR * 0.55, d) + 0.7 * exp(-rimX * rimX), blur);
    }
  }
  float capInner = smoothstep(ringGap * 0.5 - fade, ringGap * 1.25, r);
  float capOuter = 1.0 - smoothstep(sectorReach - fade, sectorReach + fade, r);
  float seamFade = smoothstep(0.0, 0.4, PI - abs(ang));   // hide the spiral seam
  capBead *= capInner * capOuter * sectorValid * seamFade;

  float spkBead = 0.0;
  float spkId0 = floor(r / beadGap + 0.5);
  for (float j = -1.0; j <= 1.0; j += 1.0) {
    float id = spkId0 + j;
    float rad = id * beadGap;
    float d = length(p0 - rad * vec2(cos(spokeAng), sin(spokeAng)));
    float rimX = (d - beadR * 0.8) / (beadR * 0.2 + 1e-3);
    float disc = mix(exp(-(d * d) / (Rsharp * Rsharp)),
                     smoothstep(beadR, beadR * 0.55, d) + 0.7 * exp(-rimX * rimX), blur);
    float inR = smoothstep(ringGap * 0.5 - fade, ringGap * 1.25, rad)
              * (1.0 - smoothstep(spokeRchN - fade, spokeRchN + fade, rad));
    spkBead += disc * inR;
  }

  float bead = max(capBead, spkBead);

  // faint silk underneath, fading out when out of focus (only bokeh dew remains)
  float silkSharp = (1.0 - blur);
  float spokeStroke = (1.0 - smoothstep(0.0, 1.6 * pr, spokeDist))
                    * (1.0 - smoothstep(spokeRchN, spokeRchN + ringGap, r)) * inner;
  float ringStroke  = (1.0 - smoothstep(0.0, 1.6 * pr, ringDist)) * webMask;
  float silkAmt = (spokeStroke + ringStroke) * silkSharp;

  // glint chase out from the hub, keyed to which pearl this is
  float angN = spokeIdx / nSpk;
  float beadId = capId0 + kRing * 3.0;
  float glint = 0.5 + 0.5 * sin(beadId * 0.7 + kRing * 1.1 + angN * 3.0
                                - t * u_glintSpeed * TAU * 0.22);
  glint = pow(glint, 2.5);
  float beadLight = mix(0.3, 1.0, glint);

  // palette
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  float hue = fract(kRing * 0.1 + angN * 0.5 + t * 0.01) * 4.0;
  float w0 = wheelW(hue, 0.0), w1 = wheelW(hue, 1.0), w2 = wheelW(hue, 2.0), w3 = wheelW(hue, 3.0);
  vec3 dewCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
  vec3 silkCol = mix(c0, c2, 0.5);

  // --- compose ---
  // soft bespoke backlight: a cool wash with a warm bloom, no gradient-mesh
  float warm = exp(-length(uvc - vec2(0.12, 0.18)) * 1.7);
  vec3 backCol = mix(c0 * 0.5, c3 * 0.6, warm);
  vec3 col = BG + backCol * u_backlight * (0.06 + 0.10 * warm);

  col += silkCol * silkAmt * 0.5;
  col += dewCol * bead * beadLight * beadAmp * 2.4;       // pearl body
  col += vec3(1.0) * bead * pow(glint, 3.0) * beadAmp * (1.0 - 0.7 * blur) * 0.7; // sharp glint core

  // exposure tonemap so dense pearls saturate to colour, not white
  col = vec3(1.0) - exp(-col * 1.2);

  // gentle vignette
  float vign = 0.82 + 0.18 * (1.0 - smoothstep(0.45, 1.2, length(uvc)));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
