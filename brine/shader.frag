// brine (Shoal) — a brinicle forest: a ceiling of supercold descending brine
// fingers hangs from the top edge, a field of translucent crystalline columns of
// varying width and length receding into depth. Each catches tiny facet glints,
// is dressed in delicate frost feathers fanning from its flanks, and carries a
// refractive shimmer streaming down its interior as the supercold brine sinks.
// Nearer fingers are wider and brighter, farther ones slimmer and dimmer; a
// frosted ice band caps them along the top. Everywhere between: deep cold water.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_streamSpeed;  // downward interior shimmer rate, paces glints (default 0.4)
uniform float u_column;       // typical finger width in CSS px, scaled by pixelRatio (default 60)
uniform float u_feather;      // frost-feather fan extent (default 1)
uniform float u_density;      // how tightly the fingers crowd the frame (default 1)

const vec3  BG  = vec3(0.030, 0.034, 0.046); // deep cold water
const int   NCOL = 13;                        // brinicle fingers across the frame

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// One brinicle finger hanging from the top edge at fractional x = cx, with the
// given half-width (px), tip depth (yT 0..1 from top), random seed and a depth
// dimmer (nearer = brighter). Returns additive glowing colour for this pixel.
vec3 finger(vec2 uv, float yT, vec2 res, float pr, float t, float speed,
            float cx, float halfW, float tipY, float seed, float dim,
            float feath, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float dxPx = (uv.x - cx) * res.x / pr;     // px from this finger's axis

  // hanging finger geometry: wide at the frozen ceiling, tapering steadily to a
  // sharp point — the unmistakable silhouette of an icicle (the clearest read).
  float along = clamp(yT / max(tipY, 0.001), 0.0, 1.0);  // 0 top .. 1 tip
  float taper = mix(1.0, 0.10, pow(along, 1.3));
  float wHere = halfW * taper;

  float dn = dxPx / max(wHere, 0.5);         // -1..1 across the finger
  float belowTip = step(yT, tipY + 0.001);
  float colMask = (1.0 - smoothstep(0.78, 1.06, abs(dn))) * belowTip;

  // faceted crystalline walls
  float facetN = 5.0;
  float facetPhase = dn * facetN;
  float facet = abs(fract(facetPhase) - 0.5) * 2.0;
  float facetRidge = smoothstep(0.55, 1.0, facet);

  // tint grading along the finger; then pulled strongly toward icy white-blue so
  // the fingers unambiguously read as translucent ICE rather than abstract neon
  // tubes (a faint palette hue survives so the theme still tints the frost).
  float s = fract(along * 0.85 + 0.05 + seed * 0.13) * 4.0;
  float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
  vec3 iceTint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  iceTint = mix(iceTint, vec3(0.70, 0.85, 1.0), 0.60);

  float bodyThick = 1.0 - smoothstep(0.0, 1.04, abs(dn));
  float facetShade = mix(0.78, 1.0, 1.0 - facet);

  // refractive shimmer streaming down the interior
  float shimPhase = (along * 4.5 + facetPhase * 0.15 + seed) - t * speed * 2.2;
  float shimmer = pow(0.5 + 0.5 * sin(shimPhase * 6.2831853), 1.6);
  float shim2 = 0.5 + 0.5 * sin((along * 2.2 - t * speed * 1.1 + seed) * 6.2831853);

  // facet glints flaring as the shimmer sweeps past
  float fid = floor(facetPhase);
  float cellH = floor(along * 14.0);
  float glintJit = hash11(fid * 3.7 + cellH * 1.3 + seed * 9.0);
  float seamDist = abs(facet - 1.0);
  float seamSpark = exp(-seamDist * seamDist * 26.0);
  float glintEnv = pow(0.5 + 0.5*sin((along*9.0 - t*speed*2.2 + glintJit*6.2831853)*6.2831853), 8.0);
  float glint = seamSpark * glintEnv * colMask * step(0.35, glintJit);

  vec3 col = vec3(0.0);
  float bodyLum = bodyThick * colMask * facetShade * (0.20 + 0.22*shim2 + 0.52*shimmer);
  col += iceTint * bodyLum;
  col += iceTint * facetRidge * colMask * 0.07 * (0.5 + 0.5*shimmer);
  col += mix(iceTint, vec3(0.9,0.95,1.0), 0.6) * glint * 0.9;

  // cold rim highlight on the edges (glassy ice catches a bright outline)
  float rim = smoothstep(0.60, 0.82, abs(dn)) * (1.0 - smoothstep(0.82, 1.05, abs(dn))) * belowTip;
  col += mix(iceTint, vec3(0.85,0.92,1.0), 0.6) * rim * 0.55 * (0.6 + 0.4*shimmer);
  // a wet glassy specular stripe just off the centre line so each icicle reads as
  // a rounded translucent rod of ice catching the light
  float spec = exp(-pow((dn + 0.32) / 0.22, 2.0)) * colMask;
  col += vec3(0.9, 0.95, 1.0) * spec * 0.35 * (0.5 + 0.5*shimmer);

  // frost feathers fanning from the flanks
  if (feath > 0.001) {
    float side = sign(dxPx);
    float edgePx = abs(dxPx) - wHere;
    float rows = 9.0;
    float rowF = along * rows;
    float row = floor(rowF);
    float rowFrac = fract(rowF);
    float ph = hash11(row*2.0 + (side*0.5+0.5) + seed) * 6.2831853;
    float rate = 0.55 + hash11(row + 17.0 + seed) * 0.6;
    float breathe = 0.5 + 0.5 * sin(t * speed * 1.3 * rate + ph);
    float reachPx = halfW * (0.6 + 1.5 * breathe) * feath;
    float outward = edgePx / max(reachPx, 1.0);
    float vy = rowFrac - 0.5;
    float frondCoord = edgePx * 0.14 + vy * 7.0;
    float frond = abs(fract(frondCoord) - 0.5) * 2.0;
    float lace = smoothstep(0.28, 0.92, frond);
    float rib = exp(-vy*vy*30.0);
    float fanProfile = 1.0 - smoothstep(0.0, 1.0, outward);
    float rowMask = 1.0 - abs(vy)*2.0;
    float feathField = fanProfile * rowMask * step(0.0, edgePx) * belowTip;
    feathField *= mix(0.20, 1.0, max(lace, rib));
    vec3 frostCol = mix(iceTint, vec3(0.78,0.88,1.0), 0.5);
    col += frostCol * feathField * 0.30 * (0.6 + 0.4*shimmer);
    float fglint = pow(lace, 4.0) * feathField * glintEnv;
    col += vec3(0.85,0.92,1.0) * fglint * 0.35;
  }

  return col * dim;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec2  uv  = fc / res;       // 0..1, y up
  float yT  = 1.0 - uv.y;     // 0 top, 1 bottom

  float speed    = max(u_streamSpeed, 0.0);
  float baseHalf = max(u_column, 1.0) * 0.5;
  float feath    = clamp(u_feather, 0.0, 2.0);
  float dens     = clamp(u_density, 0.4, 2.0);

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  // faint downwelling cold gradient + a hint of distant haze so the water
  // between fingers isn't dead-flat black
  vec3 coolWash = mix(c0, c2, 0.5);
  col += coolWash * 0.020 * smoothstep(1.0, 0.0, yT);   // brighter near ceiling

  // ---- the brinicle forest: many fingers across the frame, depth-sorted -----
  // draw back (dim, slim) fingers first, front (bright, wide) last so additive
  // glow reads layered. Each slot jittered in x; depth from a hash.
  for (int i = 0; i < NCOL; i++) {
    float fi = float(i);
    float h1 = hash11(fi*1.7 + 0.3);    // depth
    float h2 = hash11(fi*2.3 + 1.1);    // x jitter
    float h3 = hash11(fi*3.1 + 2.7);    // tip depth
    float depth = h1;
    float slot  = (fi + 0.5) / float(NCOL);
    float cx    = slot + (h2 - 0.5) * (0.85 / float(NCOL));
    float halfW = baseHalf * mix(0.45, 1.25, depth) * dens;
    float tipY  = mix(0.34, 0.92, h3);
    float dim   = mix(0.42, 1.0, depth);
    col += finger(uv, yT, res, pr, t, speed, cx, halfW, tipY, fi*5.0, dim,
                  feath, c0, c1, c2, c3);
  }

  // ---- frosted ice ceiling capping the fingers along the top edge ----------
  float ceil = smoothstep(0.16, 0.0, yT);               // 0..1 toward the top
  // crystalline speckle along the ceiling so it reads as frozen, not a bar
  float speck = hash11(floor(uv.x * res.x / (10.0*pr)) + floor(yT*res.y/(10.0*pr))*3.7);
  col += coolWash * ceil * 0.10;
  col += mix(coolWash, vec3(0.85,0.92,1.0), 0.5) * ceil * step(0.86, speck) * 0.5;

  // gentle vignette so the frame edges stay composed
  vec2 vc = uv - vec2(0.5, 0.5);
  float vign = 1.0 - smoothstep(0.55, 1.12, length(vc * vec2(1.05, 1.0)));
  col *= mix(0.80, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
