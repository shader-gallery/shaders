// oculus (Delve) — lying on the floor of a dark rotunda, looking straight up
// into a coffered dome that climbs toward a small night-black oculus at screen
// centre. The dome is a log-polar panel grid: a fixed number of angular columns
// crossed by log-spaced rows, each cell a rounded-rectangle coffer with a
// recessed near-black face and a bevel that catches an edge highlight on one
// consistent side, lit by a single unseen lamp far below (fixed screen-space
// light direction). Coffer faces blend through the four palette colours by row
// depth phase; the oculus itself stays pure black. The gaze rises: rows are born
// at the frame edge and compress row by row into the centre, falling upward —
// motion along the scale axis alone, the wrap hidden by log-periodic crossfade.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_riseSpeed;   // scale-octaves/sec the rows climb     (default 0.1)
uniform float u_columns;     // angular coffer columns (rounded)     (default 16)
uniform float u_bevelGlow;   // lamplit bevel highlight strength     (default 1.0)
uniform float u_centerX;     // oculus focal x offset, screen units  (default 0)
uniform float u_centerY;     // oculus focal y offset, screen units  (default 0)
uniform float u_warp;        // depth-varying angular twist          (default 0.25)
uniform float u_mouseShift;  // focal glides toward the pointer       (default 0.35)

const vec3  BG       = vec3(0.030, 0.030, 0.038); // near-black rotunda base
const float PI       = 3.14159265359;
const float TAU      = 6.28318530718;
const float ROWASPECT = 1.0; // log-radius height of one row vs one column step

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// rounded-rectangle signed distance (p relative to box centre, half-size b)
float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // position relative to dome centre (the oculus), aspect-corrected to circular
  // static movable focal, then a real DEPTH parallax from the mouse: outer (near)
  // coffers slide toward the pointer while the deep oculus holds.
  vec2  mraw = u_mouse;
  if (dot(mraw, mraw) < 1.0) mraw = ctr;
  vec2  mN    = (mraw - ctr) / min(res.x, res.y);
  vec2  p0 = (fc - ctr) / min(res.x, res.y) - vec2(u_centerX, u_centerY);
  float r0 = length(p0);
  vec2  parallax = mN * (0.15 * max(u_mouseShift, 0.0));
  vec2 p = p0 - parallax * smoothstep(0.0, 0.45, r0);
  float r = length(p);
  float ang = atan(p.y, p.x); // -PI..PI

  // --- log-polar mapping -----------------------------------------------------
  // radius axis -> logarithm so equal screen-octaves are equal steps; the dome
  // is self-similar in this space. Guard r>0 so the centre never blows up.
  float lr = log(max(r, 1e-4));
  ang += u_warp * 0.6 * sin(lr * 2.5 + t * 0.15);  // swirl that varies with depth

  // angular columns: a fixed (rounded) count wrapping the full circle.
  float cols = max(floor(u_columns + 0.5), 3.0);
  float colCoord = (ang / TAU + 0.5) * cols;   // 0..cols around the dome
  float colId    = floor(colCoord);
  float colF     = fract(colCoord);            // 0..1 within a column

  // row pitch in log-radius: scale it so a row is ~ROWASPECT of a column's
  // angular arc, keeping coffers roughly square in log-polar space.
  float colArc  = TAU / cols;                  // radians per column
  float rowPitch = colArc * ROWASPECT;         // log-radius per row

  // scale travel: rows climb toward the oculus. Adding to the row coordinate
  // marches the whole grid inward (radius shrinks as exp(-t)) — falling upward.
  float rise    = t * u_riseSpeed;
  float rowCoord = lr / rowPitch + rise;
  float rowId    = floor(rowCoord);
  float rowF     = fract(rowCoord);            // 0..1 within a row (0=outer edge)

  // --- coffer cell ----------------------------------------------------------
  // local cell coords in [-0.5,0.5]^2: x across the column, y along the row.
  vec2 cell = vec2(colF - 0.5, rowF - 0.5);

  // recessed rounded-rect coffer face. Half-size leaves a margin (the rib/gap
  // between coffers); rounding softens the corners.
  vec2  halfSz = vec2(0.40, 0.40);
  float round = 0.13;
  float sd = sdRoundRect(cell, halfSz, round);

  // anti-aliased edge width in cell units, scaled with how big a cell is on
  // screen (cells shrink toward the centre) so the stroke never aliases.
  // Computed analytically (no derivative extension): one screen pixel measured
  // in p-units is pxP; in log-radius that is pxP/r, in angle ~pxP/r. Convert
  // each to cell-units via the row/column pitch.
  float pxP   = 1.0 / min(res.x, res.y);
  float dRow  = (pxP / max(r, 1e-3)) / rowPitch;        // cell-units per pixel (row)
  float dCol  = (pxP / max(r, 1e-3)) * (cols / TAU);    // cell-units per pixel (col)
  float aa = clamp((dRow + dCol) * 1.3, 0.0025, 0.45);

  // face mask: inside the coffer (recessed face)
  float face = 1.0 - smoothstep(-aa, aa, sd);

  // --- bevel highlight, lit by a fixed screen-space lamp far below ----------
  // The lamp shines from one constant direction in cell space. The bevel is the
  // thin band just outside the face; its highlight is strongest where the
  // bevel's outward normal faces the lamp. We approximate the bevel normal by
  // the gradient direction of the rounded-rect field (= normalize(cell here)).
  // The bevel normal lives in cell space (x = tangential/angular, y = radial
  // outward). Map it into screen space through the local polar frame so the lamp
  // is a single FIXED screen-space direction (never moves), giving every coffer
  // around the dome a highlight on the same screen side.
  vec2 radial  = normalize(p + 1e-5);             // outward in screen space
  vec2 tangent = vec2(-radial.y, radial.x);       // +angle direction
  vec2 bevelN  = normalize(cell + 1e-4);          // cell-space rim normal
  vec2 bevelNS = bevelN.x * tangent + bevelN.y * radial; // -> screen space
  vec2 lampDir = normalize(vec2(0.30, 1.0));      // unseen lamp, fixed on screen
  float facing = max(dot(bevelNS, lampDir), 0.0);

  // bevel band: a soft ring hugging the coffer rim
  float bevel = (1.0 - smoothstep(0.0, aa * 2.5, abs(sd))) ;          // on the rim
  float bevelLit = bevel * pow(facing, 1.5);

  // --- depth phase: hue migrates ring by ring -------------------------------
  // colour cycles with absolute row depth; log-periodic so the wrap is hidden.
  // rowCoord increases inward, so subtract it for an inward-flowing colour roll.
  float phase = (-rowCoord) * 0.5 + 0.0;
  float s4 = fract(phase) * 4.0;
  float w0 = wheelW(s4, 0.0), w1 = wheelW(s4, 1.0), w2 = wheelW(s4, 2.0), w3 = wheelW(s4, 3.0);

  // palette with midnight fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 rowCol = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  // the bevel takes the row's *leading* colour (one step ahead on the wheel)
  float s4b = fract(phase + 0.25) * 4.0;
  float b0 = wheelW(s4b,0.0), b1 = wheelW(s4b,1.0), b2 = wheelW(s4b,2.0), b3 = wheelW(s4b,3.0);
  vec3 bevelCol = (c0*b0 + c1*b1 + c2*b2 + c3*b3) / max(b0+b1+b2+b3, 0.001);

  // --- depth darkening toward the oculus ------------------------------------
  // true black always waits at the centre: brightness fades to 0 as r -> 0.
  // Use the actual screen radius so the focal depth is a fixed dark pupil.
  float oculus = smoothstep(0.0, 0.16, r);     // 0 at centre -> dark oculus
  // and a gentle outer falloff so the frame edge isn't a hard line of coffers
  float edge   = 1.0 - smoothstep(0.62, 1.02, r);

  // faces sit barely above black; bevel highlight is the bright accent.
  float depthDim = oculus * edge;

  vec3 col = BG;
  // recessed coffer face — dim, hue by depth
  col += rowCol * face * 0.24 * depthDim;
  // a soft inner glow pooling in the coffer so faces read as concave wells
  float pool = (1.0 - smoothstep(0.0, 0.42, length(cell))) * face;
  col += rowCol * pool * 0.14 * depthDim;
  // the lamplit bevel — the signature edge highlight
  col += bevelCol * bevelLit * (0.80 * u_bevelGlow) * depthDim;
  // a whisper of bloom off the lit bevel
  col += bevelCol * bevel * pow(facing, 2.5) * 0.16 * u_bevelGlow * depthDim;

  // keep the dead centre pure black (the oculus)
  col *= smoothstep(0.0, 0.10, r);

  gl_FragColor = vec4(col, 1.0);
}
