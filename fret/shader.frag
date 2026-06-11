// fret (Burnish) — a Greek-key meander engraved as a continuous band around the
// frame's perimeter. Square-wave key cells are built from mod-folded rectilinear
// SDF strokes; a second fainter inner band doubles the ornament. The center is
// left deep and empty — a quiet field the foreground can own. The engraving never
// moves: a small specular glint travels the fret's closed rectilinear path at
// constant speed, cornering crisply and trailing a soft afterglow. Light is the
// only ink.
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
uniform float u_runSpeed;   // glint pace around the border circuit (default 0.5)
uniform float u_keySize;    // Greek-key cell size, css px            (default 32)
uniform float u_tail;       // afterglow length, fraction of circuit  (default 0.18)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float MARGIN_CSS = 46.0;  // gap from screen edge to the outer band
const float STROKE_CSS = 2.2;   // half-thickness of the engraved groove

// rounded-box signed distance (outside positive)
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// signed distance to one Greek-key meander unit drawn along a horizontal track.
// The track runs left->right at local y=0; `x` is distance along the track, `y`
// is perpendicular offset (positive = toward the interior of the frame). `cell`
// is the key cell size, `arm` the half-thickness of the groove, `depth` how far
// the key teeth reach inward. Built from mod-folded rectilinear strokes.
float keyStroke(float x, float y, float cell, float arm, float depth) {
  // fold x into one cell, centred
  float xc = mod(x, cell) - cell * 0.5;
  // the spine: a continuous line running along the track
  float d = abs(y) - arm;
  d = max(d, abs(xc) - cell * 0.5 - arm); // clamp spine to the cell (it's continuous, keep)
  d = abs(y) - arm;                       // spine is fully continuous along x

  // the inward tooth: a vertical stroke rising from the spine at the cell centre
  float dv = max(abs(xc) - arm, max(-y - arm, y - depth));
  d = min(d, dv);

  // the hook: a short horizontal return near the top of the tooth, offset to one
  // side so the teeth read as interlocking square spirals (the Greek key motif)
  float hookY = depth - cell * 0.30;
  float dh = max(abs(y - hookY) - arm, max(xc - arm, -(xc) - cell * 0.30 - arm));
  d = min(d, dh);

  // a second inner spine running parallel, closing the spiral into the key shape
  float inY = depth - cell * 0.30;
  float dspine2 = abs(y - 0.0) - arm; // (kept as part of base spine)
  // inner short verticals between teeth give the meander its square-wave rhythm
  float xc2 = mod(x + cell * 0.5, cell) - cell * 0.5;
  float dv2 = max(abs(xc2) - arm, max(-y - arm, y - (depth - cell * 0.30) - arm));
  d = min(d, dv2);

  return d;
}

// Distance to the fret band drawn around a rectangle of half-size `b` centred at
// origin, with band perpendicular thickness controlled by `depth`. Returns the
// meander SDF and writes the fragment's arc-length position along the perimeter
// (0..perim) into `arc`, plus the total perimeter into `perim`.
void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // --- palette with house fallback ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float margin = MARGIN_CSS * pr;
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = max(u_keySize, 8.0) * refScale * pr;     // guard against tiny/zero cell
  float arm    = STROKE_CSS * pr;
  float depth  = cell * 0.62;                   // how far key teeth reach inward

  // centred coordinates; work against a rectangle whose outer edge sits `margin`
  // inside the screen. b = half-size of the rectangle's outer track.
  vec2 p = fc - ctr;
  vec2 b = ctr - vec2(margin);
  b = max(b, vec2(cell * 2.0)); // keep the frame sane on tiny buffers

  // For a perimeter band we map every fragment to the nearest of the four sides,
  // unfolding that side into a (along, perp) local frame. perp>0 = toward interior.
  // Determine which side via the dominant axis of the box gradient.
  vec2 ap = abs(p);
  // distance from the outer rectangle edge, signed: <0 inside the rectangle
  float sdOuter = sdBox(p, b);

  // pick side: compare how close we are to vertical vs horizontal edges
  float dx = b.x - ap.x; // gap to the left/right edge
  float dy = b.y - ap.y; // gap to the top/bottom edge

  // local along-track (s) and perpendicular (n, positive toward centre) coords,
  // plus the arc-length offset of this side's start, going clockwise from top-left.
  float s, n, arcBase, sideLen;
  float perimW = 2.0 * b.x; // top/bottom run length (full width of track)
  float perimH = 2.0 * b.y; // left/right run length
  float perim  = 2.0 * (perimW + perimH);

  if (dy <= dx) {
    // top or bottom edge dominates (closer to a horizontal side)
    if (p.y >= 0.0) {
      // TOP side: travel left->right along +x
      s = p.x + b.x;            // 0 at top-left corner
      n = b.y - p.y;            // 0 at outer edge, grows toward interior
      arcBase = 0.0;
      sideLen = perimW;
    } else {
      // BOTTOM side: travel right->left so the loop stays clockwise
      s = b.x - p.x;
      n = b.y + p.y;
      arcBase = perimW + perimH;
      sideLen = perimW;
    }
  } else {
    if (p.x >= 0.0) {
      // RIGHT side: travel top->bottom
      s = b.y - p.y;
      n = b.x - p.x;
      arcBase = perimW;
      sideLen = perimH;
    } else {
      // LEFT side: travel bottom->top
      s = b.y + p.y;
      n = b.x + p.x;
      arcBase = perimW + perimH + perimW;
      sideLen = perimH;
    }
  }

  // --- outer meander band ---
  float dOuter = keyStroke(s, n, cell, arm, depth);
  // soft anti-aliased engraved stroke
  float strokeO = 1.0 - smoothstep(0.0, arm + pr * 1.3, dOuter);

  // --- inner fainter band: same meander pushed further toward centre, mirrored ---
  float innerOff = depth + cell * 0.55;
  float dInner = keyStroke(s + cell * 0.5, n - innerOff, cell, arm * 0.85, depth * 0.72);
  float strokeI = 1.0 - smoothstep(0.0, arm + pr * 1.3, dInner);

  // keep both bands confined to the border region (mask off the empty centre and
  // anything outside the outer rectangle)
  float bandMask = step(n, innerOff + depth * 0.72 + cell * 0.2) * step(-pr * 2.0, n) *
                   step(sdOuter, arm + pr * 2.0);
  strokeO *= bandMask;
  strokeI *= bandMask;

  // colour steps through the palette per cell along the circuit (ornament tint)
  float arc = arcBase + clamp(s, 0.0, sideLen);
  float cellIdx = floor(arc / cell);
  float ks = fract(cellIdx * 0.137 + 0.05) * 4.0;
  float w0 = wheelW(ks, 0.0), w1 = wheelW(ks, 1.0), w2 = wheelW(ks, 2.0), w3 = wheelW(ks, 3.0);
  vec3 tint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // the fret sits barely above black: a dim etched tint
  col += tint * strokeO * 0.11;
  col += tint * strokeI * 0.07;

  // --- the travelling glint: a specular point sweeping the closed circuit ---
  // glint position in arc-length (loops seamlessly: mod by perim)
  float glintPos = mod(t * u_runSpeed * 0.18 * perim, perim);
  // signed arc gap to the glint, taking the shorter way around the loop
  float gap = arc - glintPos;
  gap = gap - perim * floor(gap / perim + 0.5); // wrap into [-perim/2, perim/2]

  float tail = max(u_tail, 0.0001) * perim;     // afterglow length in arc-units
  // bright head, soft trailing afterglow behind the glint (gap<0 = behind)
  float head = exp(-gap * gap / (cell * cell * 0.45));         // crisp specular core
  float behind = max(0.0, -gap);                               // only trails behind
  float trail = exp(-behind / tail) * smoothstep(perim * 0.5, 0.0, behind);
  float glint = head + trail * 0.6;

  // glint only lights the engraving it passes over (both bands), brightest on outer
  float litO = strokeO * glint;
  float litI = strokeI * glint * 0.6;

  // specular hue: the local tint pushed toward white at the very core
  vec3 spec = mix(tint, vec3(1.0), clamp(head, 0.0, 1.0) * 0.7);
  col += spec * litO * 1.5;
  col += spec * litI * 1.1;

  // a rare bright punctuation as the glint rounds a corner (orbit glints)
  float cornerT = fract(glintPos / perim * 4.0);
  float cornerPulse = smoothstep(0.0, 0.06, cornerT) * smoothstep(0.18, 0.06, cornerT);
  col += spec * litO * cornerPulse * 1.2;

  // faint bloom around the lit stroke so the metal catches light
  float bloomO = exp(-abs(dOuter) / (arm * 4.0)) * glint * bandMask;
  col += spec * bloomO * 0.35;

  // gentle vignette to deepen the empty centre and frame corners evenly
  float vign = 1.0 - smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= mix(0.85, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
