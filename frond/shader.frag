// frond (Smolder) — REFRAMED as a POTHOS VINE (Epipremnum aureum): instead of one
// burning leaf, a lush curtain of many SMALL heart-shaped leaves trailing down
// several wandering vines, filling the frame. frond's identity is kept but minted
// small x many: each leaf carries a glowing midrib + herringbone veins (cool) and
// a glowing margin rim (warm) — the blue-vein / red-margin contrast of the original
// — plus cream variegation patches. The vines hang and sway; stems thread through
// the leaf bases so the leaves sit ON the vine. Leaves are luminous and composited
// additively so overlapping foliage reads as depth. Fully themeable: foliage,
// veins, margin and variegation all derive from u_palette.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_leafSize;     // leaf radius in CSS px (default 34)
uniform float u_leafDensity;  // how full the curtain is, 0..1 (default 0.7)
uniform float u_veinGlow;     // brightness of the cool midrib/herringbone veins (default 0.7)
uniform float u_marginGlow;   // brightness of the warm glowing leaf margin (default 0.6)
uniform float u_sway;         // wind sway amount of the vines, 0..1 (default 0.5)
uniform float u_variegation;  // cream variegation patch amount, 0..1 (default 0.5)

const vec3  BG  = vec3(0.018, 0.026, 0.024); // deep foliage near-black (green-ish)
const float TAU = 6.28318530718;
const int   VINES  = 6;
const int   LEAVES = 9;

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
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

// distance to a line segment a->b
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

// position of vine `fv` at param s in [0,1] (top -> bottom), with its tangent.
// Vines hang downward across the full height and wander horizontally; the wander
// breathes in time so the whole curtain sways.
vec2 vinePoint(float fv, float s, float t, float sway, vec2 res, out vec2 tang) {
  float h0 = hash11(fv * 1.7 + 1.0);
  float h1 = hash11(fv * 2.3 + 4.0);
  float startX = (fv + 0.5) / float(VINES) * res.x + (h0 - 0.5) * res.x * 0.10;
  float amp    = res.x * (0.06 + 0.10 * h1);
  float freq   = 1.3 + 1.4 * h0;
  float phase  = fv * 2.1 + t * (0.15 + 0.25 * sway);
  float y = s * res.y * 1.18 - 0.12 * res.y;
  float wob = sin(s * freq * 3.14159 + phase) + 0.4 * sin(s * freq * 6.3 + phase * 1.7);
  float x = startX + amp * wob * (0.5 + 0.8 * sway);
  // tangent via small finite difference in s
  float dy = res.y * 1.18 / 64.0;
  float s2 = s + 1.0 / 64.0;
  float wob2 = sin(s2 * freq * 3.14159 + phase) + 0.4 * sin(s2 * freq * 6.3 + phase * 1.7);
  float x2 = startX + amp * wob2 * (0.5 + 0.8 * sway);
  tang = normalize(vec2(x2 - x, dy));
  return vec2(x, y);
}

// heart / cordate implicit in leaf-local coords (cleft up toward the petiole,
// tip pointing down/away). f < 0 inside; |f| small near the outline.
float heartField(vec2 p) {
  // classic heart: lobes at +y, cusp at -y. p already scaled to ~unit heart.
  float x = p.x, y = p.y;
  float a = x * x + y * y - 1.0;
  return a * a * a - x * x * y * y * y;
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr   = max(u_pixelRatio, 0.25);
  vec2  cssP = gl_FragCoord.xy / pr;
  vec2  res  = max(u_resolution / pr, vec2(1.0));
  float t    = u_time;

  float leafR  = max(u_leafSize, 6.0);
  float dens   = clamp(u_leafDensity, 0.0, 1.0);
  float vGlow  = clamp(u_veinGlow, 0.0, 1.5);
  float mGlow  = clamp(u_marginGlow, 0.0, 1.5);
  float sway   = clamp(u_sway, 0.0, 1.0);
  float varieg = clamp(u_variegation, 0.0, 1.0);

  // foliage / vein / margin / variegation colours, all palette-derived
  vec3 foliage  = c2 * 0.42 + c0 * 0.10;          // luminous deep leaf
  vec3 veinCol  = c0 * 0.85 + c2 * 0.20;          // cool veins (frond's blue vein)
  vec3 marginC  = c3 * 0.95 + c1 * 0.15;          // warm margin (frond's red margin)
  vec3 varCol   = c2 * 0.7  + vec3(0.35);         // pale cream variegation
  vec3 stemCol  = c2 * 0.5  + c0 * 0.18;

  vec3 col = vec3(0.0);

  // how many leaves per vine are active (density scales the curtain)
  float activeLeaves = mix(3.0, float(LEAVES), dens);

  for (int vi = 0; vi < VINES; vi++) {
    float fv = float(vi);
    // skip a couple of vines at low density
    if (fv > mix(2.5, float(VINES), dens)) continue;

    vec2 prevAttach = vec2(0.0);
    bool havePrev = false;

    for (int li = 0; li < LEAVES; li++) {
      float fl = float(li);
      if (fl >= activeLeaves) break;

      float s = (fl + 0.6) / float(LEAVES);
      vec2 tang;
      vec2 P = vinePoint(fv, s, t, sway, res, tang);
      vec2 nrm = vec2(-tang.y, tang.x);          // perpendicular to the vine

      // ---- stem segment connecting consecutive attach points
      if (havePrev) {
        float ds = sdSeg(cssP, prevAttach, P);
        float stem = exp(-ds * ds / (leafR * leafR * 0.018)); // ~0.13*leafR wide
        col += stemCol * stem * 0.85;
      }
      prevAttach = P;
      havePrev = true;

      // per-leaf randomness
      float hSide = hash11(fv * 7.0 + fl * 3.1);
      float side  = (mod(fl, 2.0) < 1.0) ? 1.0 : -1.0; // alternate sides
      float hSize = 0.7 + 0.6 * hash11(fv * 5.0 + fl * 1.7);
      float hDep  = hash11(fv * 11.0 + fl * 2.3);       // pseudo-depth 0..1
      float lr    = leafR * hSize * (0.7 + 0.5 * hDep); // nearer (big) .. farther (small)

      // leaf centre: offset off the vine on its alternating side, on a short petiole
      vec2 petioleDir = normalize(nrm * side + tang * 0.35);
      vec2 ctr = P + petioleDir * lr * 1.05;

      // quick bounding reject
      vec2 rel = cssP - ctr;
      if (dot(rel, rel) > lr * lr * 2.9) continue;

      // leaf-local frame: tip points outward (away from vine), cleft toward vine.
      // local +y = from tip toward cleft = -petioleDir.
      vec2 up = -petioleDir;
      vec2 rt = vec2(up.y, -up.x);
      // gentle per-leaf sway rotation
      float wob = sin(t * (0.8 + hSide) + fv * 2.0 + fl) * 0.12 * sway;
      float cw = cos(wob), sw = sin(wob);
      vec2 upr = vec2(up.x * cw - up.y * sw, up.x * sw + up.y * cw);
      vec2 rtr = vec2(upr.y, -upr.x);
      vec2 q = vec2(dot(rel, rtr), dot(rel, upr)) / lr; // leaf-local, ~unit heart

      // shape the heart: shift down so cleft sits near the petiole, scale to taste
      vec2 hp = vec2(q.x * 1.02, (q.y) * 1.12 + 0.42);
      float f = heartField(hp);

      float cov  = smoothstep(0.10, -0.26, f);       // leaf body coverage
      if (cov < 0.003) continue;
      float depthDim = 0.55 + 0.6 * hDep;            // far leaves dimmer

      // margin rim: a band hugging the outline (|f| ~ 0), inside the leaf
      float rim = exp(-f * f / 0.020) * smoothstep(0.16, -0.05, f);

      // veins in leaf-local space: midrib (x~0) + herringbone laterals
      float midrib = exp(-hp.x * hp.x / 0.010);
      float herb   = abs(hp.x) * 2.3 - hp.y;         // diagonal coordinate
      float lp     = fract(herb * 2.2) - 0.5;        // (avoid pow(neg,..) -> NaN)
      float lat    = exp(-(lp * lp) / 0.012);
      lat *= smoothstep(0.9, 0.2, abs(hp.x));        // fade laterals at the edge
      float veins  = max(midrib, lat * 0.7) * cov;

      // variegation: warm cream blotches keyed to a per-leaf noise field
      float vg = vnoise(q * 3.0 + vec2(fv * 4.0, fl * 2.0));
      float varMask = smoothstep(0.6, 0.85, vg) * varieg * cov;

      // assemble the leaf (additive, luminous) — body more solid so leaves read
      // as foliage rather than wireframe; veins/margin ride on top.
      vec3 leaf = foliage * cov * 0.95;
      leaf += varCol  * varMask * 0.55;
      leaf += veinCol * veins * vGlow * 0.8;
      leaf += marginC * rim * mGlow * 0.95;

      col += leaf * depthDim;
    }
  }

  // base: deep-foliage tint behind everything so gaps read as shadowed leaves,
  // not flat black (the post backdrop adds a further palette wash).
  col += BG + foliage * 0.10;

  // gentle vignette to seat the curtain
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  col *= 1.0 - 0.30 * smoothstep(0.45, 1.12, length(uv - 0.5) * 1.40);

  // soft filmic rolloff so dense overlaps don't clip flat
  col = col / (1.0 + col * 0.40);

  // tiny dither to keep gradients band-free
  col += (hash21(gl_FragCoord.xy + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
