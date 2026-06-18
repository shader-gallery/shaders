// aperture (Rosette) — a mechanical-diaphragm iris filling the frame: the soft
// fibers of the base iris are replaced by hard straight-edged camera blades that
// overlap into a spiralling polygon and open and close on a slow breath. The
// blade leading edges form an N-gon aperture at the centre (the dark
// protagonist, the inverse direction from a soft pupil); each blade face is a
// faintly graded metal leaf with a luminous machined edge where it laps the
// next. Colour flows continuously through the palette by angle — a cool metallic
// wash — with the blade metal filling the frame edge to edge, no dead sclera.
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
uniform float u_blades;      // number of diaphragm blades                (default 9)
uniform float u_aperture;    // mean opening radius, css px (×pixelRatio)  (default 95)
uniform float u_breathSpeed; // open/close cycle rate                      (default 0.06)
uniform float u_overlap;     // blade tilt / how much leaves spiral-lap    (default 0.5)

const vec3  BG   = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU  = 6.28318530718;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
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
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params against the unfed-uniform = 0.0 case so extremes/headless stay sane
  float bladeCount = max(u_blades, 3.0);
  float apertMean  = max(u_aperture, 20.0) * pr;
  float breathRate = max(u_breathSpeed, 0.0);
  float overlap    = clamp(u_overlap, 0.0, 1.0);

  // --- polar coordinates centred on the diaphragm ---
  vec2  d    = fc - ctr;
  float ang  = atan(d.y, d.x);          // -PI..PI
  float rad  = length(d);
  float maxR = length(res) * 0.5;       // half-diagonal: outward==1 at the corner
  float outward = clamp(rad / maxR, 0.0, 1.0);

  // breathing aperture: opens and closes, phase-continuous
  float breath = sin(t * breathRate * TAU);
  float apert  = apertMean * (1.0 + 0.40 * breath);

  // slow rotation of the whole diaphragm
  float spin = t * 0.03;

  // ====================================================================
  // BLADE GEOMETRY
  // Fold the angle into one blade sector. The blade straight leading edge
  // is a chord at perpendicular distance `apert` from centre; an overlap
  // tilt shifts the chord off the sector bisector so successive blades lap
  // each other into a spiralling polygon (a real diaphragm, not a static
  // N-gon). edgeR is this pixel's radius to that leading edge.
  // ====================================================================
  float sector = TAU / bladeCount;
  float ba     = ang + spin;
  float seg    = floor(ba / sector + 0.5);   // nearest blade index
  float rel    = ba - seg * sector;          // -sector/2 .. sector/2 within the blade
  float tilt   = overlap * sector * 0.5;     // chord offset → spiral lap

  // perpendicular-distance polygon edge along this direction
  float edgeR  = apert / max(cos(clamp(rel - tilt, -sector, sector)), 0.2);

  vec3  col = BG;

  // anti-aliased aperture mask: 0 inside the opening, 1 out on the blades
  float aa       = 2.0 * pr;
  float bladeM   = smoothstep(edgeR - aa, edgeR + aa, rad);

  // ====================================================================
  // PALETTE: continuous hue by angle (NOT per-blade, to avoid colour blocks)
  // ====================================================================
  float hue = (ang / TAU + 0.5) + t * 0.01;
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 metalCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // BLADE FACE SHADING
  // - a faint graded metal face, brighter toward the aperture, dimmer out
  // - a luminous machined highlight right along the leading edge
  // - a darker lap-seam between adjacent blades (the sector boundary)
  // - per-blade brightness jitter so the metal is not mechanically flat
  // ====================================================================
  float depth   = (rad - edgeR) / max(maxR - edgeR, 1.0);   // 0 at edge → 1 at corner
  float face    = (0.5 - 0.34 * smoothstep(0.0, 0.85, depth)); // graded metal face
  float bladeJit = 0.82 + 0.18 * hash11(seg + 3.0);
  // luminous machined edge: a thin bright line on the lit side of each blade
  float edgeGlow = exp(-pow((rad - edgeR) / (5.0 * pr), 2.0));
  // lap seam between blades: darken near the sector boundary
  float seam    = smoothstep(sector * 0.5, sector * 0.5 - 0.06, abs(rel));

  vec3 blade = metalCol * face * bladeJit;
  blade += metalCol * edgeGlow * 0.9;             // bright machined rim
  blade *= mix(0.6, 1.0, seam);                   // dark lap line at the overlap

  col = mix(col, blade, bladeM);

  // ====================================================================
  // APERTURE OPENING: the dark polygon hole at the centre, with a faint
  // luminous inner lip that catches the breath (the dark protagonist).
  // ====================================================================
  float lip = exp(-pow((rad - edgeR) / (7.0 * pr), 2.0)) * (1.0 - bladeM);
  col += metalCol * lip * 0.3 * (0.6 + 0.4 * (0.5 + 0.5 * breath));
  // crush any stray light inside the opening so it stays a true dark hole
  float inside = 1.0 - smoothstep(edgeR - 6.0 * pr, edgeR - 1.0 * pr, rad);
  col *= mix(1.0, 0.06, inside);

  // settle the very corners so framing stays composed
  float vign = 1.0 - 0.4 * smoothstep(0.62, 1.18, outward);
  col *= vign;

  // gentle tone shaping
  col = col / (1.0 + col * 0.32);

  gl_FragColor = vec4(col, 1.0);
}
