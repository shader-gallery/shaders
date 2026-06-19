// seine (Strand) - a drift-net billowing in a slow current. A square mesh of
// cords spans the whole frame, each knot tied to its grid neighbours, and a
// rolling flow field pushes the whole net into sagging swells - it bellies toward
// you and falls away, the near folds brightening while the far ones sink. The
// topology is fixed (a true net, not chance proximity), so it always reads as one
// continuous web drifting underwater. Open cords; the mesh openings stay empty.
// (ASCII-only comments: the headless poster compiler is fussy about apostrophes.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cell;    // mesh spacing, css px                 (default 64)
uniform float u_billow;  // how far the net swells                (default 0.55)
uniform float u_flow;    // current speed                         (default 0.4)
uniform float u_sag;     // near/far brightness swing             (default 0.7)
uniform float u_line;    // cord half-width, css px               (default 1.2)
uniform float u_hue;     // hue spread across the net             (default 1.0)
uniform float u_glow;    // soft halo strength                    (default 0.7)

const vec3 BG = vec3(0.035, 0.035, 0.043);

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

// per-knot displacement + depth from a rolling flow field. neighbours share the
// field so the net stays connected and billows coherently.
vec2 g_disp;
float g_z;
void knot(vec2 id, float spacing, float amp, float t, float kf) {
  vec2 rest = id * spacing;
  float a = rest.x * kf, b = rest.y * kf;
  g_disp = amp * vec2(sin(b + t * 0.9) + 0.5 * sin(a * 0.7 - t * 0.6),
                      cos(a + t * 0.8) + 0.5 * cos(b * 0.8 + t * 0.5));
  g_z = sin(a * 0.6 + b * 0.6 + t * 0.7) * 0.5 + 0.5;     // 0 far .. 1 near
}
vec2 knotPos(vec2 id, float spacing, float amp, float t, float kf) {
  knot(id, spacing, amp, t, kf);
  return id * spacing + g_disp;
}

float segGlow(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0), 0.0, 1.0);
  return length(pa - ba * h) / max(w, 0.5);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time * max(u_flow, 0.0);

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float spacing = max(u_cell, 18.0) * refScale * pr;
  float lw  = max(u_line, 0.3) * refScale * pr;
  float amp = spacing * clamp(u_billow, 0.0, 0.9);
  float kf  = 6.2831853 / (spacing * 6.0);              // flow wavelength ~6 cells

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 baseId = floor(fc / spacing);
  vec3 acc = vec3(0.0);

  // walk a 4x4 block of knots around the fragment; draw the cord to each knot's
  // +x and +y neighbour so the whole net is covered with no gaps.
  for (int j = -1; j <= 2; j++) {
    for (int i = -1; i <= 2; i++) {
      vec2 id = baseId + vec2(float(i), float(j));
      vec2 p0 = knotPos(id,                 spacing, amp, t, kf); float z0 = g_z;
      vec2 px = knotPos(id + vec2(1.0,0.0), spacing, amp, t, kf); float zx = g_z;
      vec2 py = knotPos(id + vec2(0.0,1.0), spacing, amp, t, kf); float zy = g_z;

      // horizontal cord
      float gh = segGlow(fc, p0, px, lw);
      float ch = smoothstep(1.0, 0.0, gh);
      float hh = lw / (gh * lw + lw * 1.3); hh = hh * hh * 0.5 * u_glow;
      float zh = 0.5 * (z0 + zx);
      float brH = mix(1.0 - clamp(u_sag,0.0,1.0), 1.0, zh);
      acc += wheelCol((id.x + id.y) * 0.05 * u_hue + zh * 0.25 + u_time * 0.01, c0, c1, c2, c3)
             * (ch + hh) * brH;

      // vertical cord
      float gv = segGlow(fc, p0, py, lw);
      float cv = smoothstep(1.0, 0.0, gv);
      float hv = lw / (gv * lw + lw * 1.3); hv = hv * hv * 0.5 * u_glow;
      float zv = 0.5 * (z0 + zy);
      float brV = mix(1.0 - clamp(u_sag,0.0,1.0), 1.0, zv);
      acc += wheelCol((id.x + id.y) * 0.05 * u_hue + 0.5 + zv * 0.25 + u_time * 0.01, c0, c1, c2, c3)
             * (cv + hv) * brV;

      // knot bead, brighter where the net bellies toward you
      float dn = length(fc - p0);
      acc += wheelCol((id.x + id.y) * 0.05 * u_hue, c0, c1, c2, c3)
             * exp(-pow(dn / (lw * 2.6), 2.0)) * (0.3 + 0.7 * z0);
    }
  }

  acc = vec3(1.0) - exp(-acc * 1.2);
  gl_FragColor = vec4(BG + acc, 1.0);
}
