// brine (Shoal) — a brinicle: an icy finger of descending supercold brine hangs
// off-centre from the top edge. A translucent crystalline column with faceted
// walls catches tiny glints, dressed in delicate frost feathers fanning from its
// flanks, ending in the lower third above a small frosted patch of glowing
// seabed. Everywhere else: near-black still water. A refractive shimmer streams
// down the column interior, a faint glassy wisp sinks tip-to-floor, the frost
// feathers breathe, and facet glints flare and die as the shimmer passes.
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
uniform float u_streamSpeed;  // downward interior shimmer + wisp rate, paces glints (default 0.4)
uniform float u_column;       // icy column width in CSS px, scaled by pixelRatio  (default 64)
uniform float u_feather;      // frost-feather fan extent (default 1)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black still water ~#09090B
const float COL_X    = 0.40;   // column horizontal centre, fraction of width (off-centre)
const float TIP_Y    = 0.66;   // column tip, fraction of height from top (lower third)
const float PATCH_Y  = 0.86;   // frosted seabed patch centre, fraction from top

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// hash for facet glint jitter
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalised aspect-aware coords: x scaled so column width reads in px
  vec2  uv  = fc / res;                 // 0..1, y up
  float yT  = 1.0 - uv.y;               // 0 at top, 1 at bottom
  float colX = COL_X;
  // horizontal distance from column axis in CSS px
  float dxPx = (uv.x - colX) * res.x / pr;

  float speed = max(u_streamSpeed, 0.0);
  float halfW = max(u_column, 1.0) * 0.5;   // column half-width in CSS px

  vec3 col = BG;

  // --- palette with house fallback ---
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ===== the icy column =====
  // The column hangs from the top (yT=0) to its tip (yT=TIP_Y). It tapers
  // slightly toward the tip so it reads as a hanging finger.
  float topY = 0.0;
  float tipY = TIP_Y;
  float along = clamp((yT - topY) / (tipY - topY), 0.0, 1.0); // 0 top .. 1 tip
  // taper: full width at top, ~55% at tip, with a rounded tip
  float taper = mix(1.0, 0.55, along);
  // round the very tip
  float tipRound = 1.0 - smoothstep(0.82, 1.0, along);
  float wHere = halfW * taper * mix(0.35, 1.0, tipRound);

  // within column mask (only above the tip)
  float dn = dxPx / max(wHere, 0.5);     // -1..1 across the column
  float belowTip = step(yT, tipY + 0.001);
  float colMask = (1.0 - smoothstep(0.78, 1.06, abs(dn))) * belowTip;

  // faceted walls: vertical-ish facets across the column give crystalline ridges
  float facetN = 5.0;
  float facetPhase = dn * facetN;
  float facet = abs(fract(facetPhase) - 0.5) * 2.0;   // 0 at facet centre, 1 at seam
  float facetRidge = smoothstep(0.55, 1.0, facet);    // bright seams between facets

  // translucent body: cold tint grading along the column length
  float gl = along;
  float s = fract(gl * 0.85 + 0.05) * 4.0;
  float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
  vec3 iceTint = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // body glow: brighter toward the axis (translucent thickness), soft edges.
  // a faint per-facet shading so the solid reads as faceted, not a flat slab.
  float bodyThick = (1.0 - smoothstep(0.0, 1.04, abs(dn)));
  float facetShade = mix(0.78, 1.0, 1.0 - facet);     // facet centres a touch brighter
  float body = bodyThick * colMask;

  // --- refractive shimmer streaming DOWN the interior ---
  // broad travelling bands along the column length; phase advances downward over
  // time so the supercold brine reads as sinking through the glass.
  float shimPhase = (along * 4.5 + facetPhase * 0.15) - t * speed * 2.2;
  float shimmer = 0.5 + 0.5 * sin(shimPhase * 6.2831853);
  shimmer = pow(shimmer, 1.6);
  // secondary slower shimmer so it never reads as one clean band
  float shim2 = 0.5 + 0.5 * sin((along * 2.2 - t * speed * 1.1) * 6.2831853);

  // --- facet glints: small sparks on facet seams that flare and die as the
  // shimmer band sweeps past their height (a discrete spark per facet x cell) ---
  float fid = floor(facetPhase);                      // stable per-facet id
  float cellH = floor(along * 14.0);                  // height cell
  float glintJit = hash11(fid * 3.7 + cellH * 1.3);
  float seamDist = abs(facet - 1.0);                  // 0 exactly on a seam
  float seamSpark = exp(-seamDist * seamDist * 26.0);
  // flare timed to the shimmer reaching this cell, jittered per spark
  float glintEnv = pow(0.5 + 0.5*sin((along*9.0 - t*speed*2.2 + glintJit*6.2831853)*6.2831853), 8.0);
  float glint = seamSpark * glintEnv * colMask * step(0.35, glintJit);

  // assemble column colour — solid translucent body dominates, glints accent.
  // bright descending shimmer bands ride down the interior (the sinking brine).
  float bodyLum = body * facetShade * (0.18 + 0.22*shim2 + 0.50*shimmer);
  col += iceTint * bodyLum;
  // faint facet seams as crystalline structure
  col += iceTint * facetRidge * colMask * 0.07 * (0.5 + 0.5*shimmer);
  // bright glints (whitish-cold)
  col += mix(iceTint, vec3(0.9,0.95,1.0), 0.6) * glint * 0.9;
  // cold rim highlight on the column edges
  float rim = smoothstep(0.60, 0.82, abs(dn)) * (1.0 - smoothstep(0.82, 1.05, abs(dn))) * belowTip;
  col += mix(iceTint, vec3(0.8,0.9,1.0), 0.5) * rim * 0.40 * (0.6 + 0.4*shimmer);

  // ===== frost feathers fanning from the flanks =====
  // feathers extend horizontally from the column edge; their reach breathes on
  // slow incommensurate sines (per-feather), and overall extent scales w/ u_feather.
  float feath = clamp(u_feather, 0.0, 2.0);
  if (feath > 0.001) {
    // outward distance from the column edge, in CSS px (sign = which flank)
    float side = sign(dxPx);
    float edgePx = abs(dxPx) - wHere;            // 0 at edge, + outward
    // feathers grouped in rows down the column; each row is one fan
    float rows = 10.0;
    float rowF = along * rows;
    float row = floor(rowF);
    float rowFrac = fract(rowF);
    // each row breathes on its own slow incommensurate sine
    float ph = hash11(row*2.0 + (side*0.5+0.5)) * 6.2831853;
    float rate = 0.55 + hash11(row + 17.0) * 0.6;
    float breathe = 0.5 + 0.5 * sin(t * speed * 1.3 * rate + ph);
    // max reach in CSS px, grown by u_feather and the row's breath
    float reachPx = halfW * (0.7 + 1.8 * breathe) * feath;
    float outward = edgePx / max(reachPx, 1.0);  // 0..1 across the fan
    // fronds sweep down-and-out: angle the lace so it fans below the row centre
    float vy = (rowFrac - 0.5);                  // -0.5..0.5 within the row band
    float frondCoord = edgePx * 0.14 + vy * 7.0; // diagonal lace coordinate
    float frond = abs(fract(frondCoord) - 0.5) * 2.0;
    float lace = smoothstep(0.28, 0.92, frond);  // thin bright frond strands
    // central rib of each fan plus the lacy strands
    float rib = exp(-vy*vy*30.0);
    // taper the fan to a point: thinner the farther out, fade at fan edges
    float fanProfile = (1.0 - smoothstep(0.0, 1.0, outward));
    float rowMask = 1.0 - abs(vy)*2.0;           // densest at row centre
    float feathField = fanProfile * rowMask * step(0.0, edgePx) * belowTip;
    feathField *= mix(0.20, 1.0, max(lace, rib)); // lacy strands + central rib
    // delicate, cold, slightly dimmer than the body
    vec3 frostCol = mix(iceTint, vec3(0.78,0.88,1.0), 0.5);
    col += frostCol * feathField * 0.34 * (0.6 + 0.4*shimmer);
    // tiny frost glints riding the strands as the shimmer passes
    float fglint = pow(lace, 4.0) * feathField * glintEnv;
    col += vec3(0.85,0.92,1.0) * fglint * 0.40;
  }

  // ===== faint glassy wisp sinking tip -> floor =====
  // a continuous descending wisp below the tip; fades in/out at both ends so
  // respawns are invisible. Unbounded-domain drift via mod on a long period.
  {
    float floorY = PATCH_Y;
    // wisp travels from tip down to the patch, position drifts downward
    float span = floorY - tipY;
    float wp = fract(t * speed * 0.10);            // 0..1 continuous
    float wispY = tipY + wp * (span + 0.10);       // overshoots a touch
    float wdx = (uv.x - colX) * res.x / pr;
    // gentle horizontal sway as it sinks
    float sway = sin(wp * 6.2831853 * 1.5 + t*0.3) * halfW * 0.25;
    float wDist = (wdx - sway) / max(halfW*0.6, 1.0);
    float wVert = (yT - wispY);
    // soft vertical blob, elongated
    float wisp = exp(-wDist*wDist) * exp(-(wVert*wVert)/0.0009);
    // fade in at top of travel, out at bottom (invisible respawn)
    float fade = smoothstep(0.0, 0.12, wp) * (1.0 - smoothstep(0.82, 1.0, wp));
    wisp *= fade * step(yT, floorY + 0.05) * step(tipY, yT + 0.02);
    col += mix(iceTint, vec3(0.8,0.9,1.0), 0.5) * wisp * 0.30;
  }

  // ===== frosted seabed patch (contrasting hue) =====
  {
    float patchY = PATCH_Y;
    float pdx = (uv.x - colX) * res.x / pr;
    float patchW = halfW * 2.4;                     // patch is wider than column
    float pX = pdx / max(patchW, 1.0);
    float pY = (yT - patchY) / 0.10;
    // soft elliptical glow hugging the floor
    float patchGlow = exp(-(pX*pX)) * exp(-(pY*pY));
    // contrasting hue: pick a palette entry offset from the column tip tint
    float ps = fract(gl*0.85 + 0.05 + 0.5) * 4.0;
    float p0=wheelW(ps,0.0),p1=wheelW(ps,1.0),p2=wheelW(ps,2.0),p3=wheelW(ps,3.0);
    vec3 patchTint = (c0*p0+c1*p1+c2*p2+c3*p3)/max(p0+p1+p2+p3,0.001);
    // faint breathing of the pooled brine glow
    float pool = 0.6 + 0.4*sin(t*speed*0.8 + 1.7);
    col += patchTint * patchGlow * 0.42 * pool;
    // crystalline frost speckle: soft round glints scattered on the patch,
    // each a smooth gaussian so it reads as ice grains, not blocky pixels.
    vec2 g = vec2(pdx, (yT - patchY) * res.y / pr);     // patch-local px
    vec2 celld = floor(g / 9.0);
    vec2 fcd = fract(g / 9.0) - 0.5;
    float jx = hash11(celld.x*1.7 + celld.y*4.1);
    float jy = hash11(celld.x*2.3 + celld.y*1.9 + 7.0);
    vec2 jc = (vec2(jx, jy) - 0.5) * 0.7;
    float gd = length(fcd - jc);
    float grain = exp(-gd*gd*40.0) * step(0.74, hash11(celld.x*5.3 + celld.y*3.1 + 2.0));
    col += mix(patchTint, vec3(0.85,0.92,1.0), 0.5) * grain * patchGlow * 0.7 * pool;
  }

  // gentle vignette so the frame edges stay near-black and composed
  vec2 vc = uv - vec2(colX, 0.5);
  float vign = 1.0 - smoothstep(0.45, 1.05, length(vc * vec2(1.1, 1.0)) * 1.3);
  col *= mix(0.75, 1.0, vign);

  // subtle cold ambient so deep water isn't dead-flat black
  col += BG * 0.4;

  gl_FragColor = vec4(col, 1.0);
}
