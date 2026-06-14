precision highp float;

// Gather — one dominant mother pool with three small satellite droplets that
// orbit on individually phased cycles, drift in, neck, get swallowed (her mass
// swells), then are reluctantly shed back out along a new bearing. All four are
// kernels in one summed smooth-min field, so necks bulge and pinch visibly.
// Family: Mercury. Quicksilver and lamp-wax in the dark.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device px (unused here)
//   u_pixelRatio  devicePixelRatio of the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_motherSize;  // base radius of the central pool, css px (default 190)
uniform float u_orbitSpeed;  // satellite circling / gulp cadence       (default 0.35)
uniform float u_gulpFlash;   // colour-3 bloom at swallow & shed         (default 1.0)

// field state shared with field()/gradient
vec2  gM, gS0, gS1, gS2;        // kernel centres (mother + 3 satellites)
float gRM, gRS0, gRS1, gRS2;    // kernel radii
float gK;                       // smooth-min reach

// polynomial smooth minimum — bodies bulge toward each other, neck, fuse
float smin2(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// summed smooth-min iso field: signed distance to the fused silhouette
float field(vec2 p) {
  float d  = length(p - gM)  - gRM;
  float s0 = length(p - gS0) - gRS0;
  float s1 = length(p - gS1) - gRS1;
  float s2 = length(p - gS2) - gRS2;
  d = smin2(d, s0, gK);
  d = smin2(d, s1, gK);
  d = smin2(d, s2, gK);
  return d;
}

float gauss(float x, float c, float w) {
  float u = (x - c) / w;
  return exp(-u * u);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr   = max(u_pixelRatio, 0.25);
  vec2  pc   = (gl_FragCoord.xy - 0.5 * u_resolution) / pr;  // css px, centered
  vec2  resC = u_resolution / pr;
  float minR = 0.5 * min(resC.x, resC.y);

  float S     = max(u_motherSize, 1.0);          // css-px mother radius scale
  float speed = max(u_orbitSpeed, 0.001);
  float T     = u_time * speed;

  // mother sits just off-center, drifting gently (phase-continuous)
  vec2 mother = vec2(-0.05, 0.04) * S
              + vec2(sin(T * 0.17), sin(T * 0.131 + 1.1)) * 0.04 * S;

  // --- per-satellite cycle: each runs its own long private period, offset so
  // events never synchronize. cyc in 0..1: drift-in, hang, neck, gulp, wobble,
  // settle, reluctant shed back out. ---
  // packed constants for the 3 satellites (period, phase, hue-orbit, base radius)
  const float PER0 = 17.0, PER1 = 23.0, PER2 = 29.0;     // long private periods
  const float OFF0 = 0.00, OFF1 = 0.41, OFF2 = 0.73;     // de-synchronizing offsets
  const float BR0  = 0.34, BR1  = 0.30, BR2  = 0.27;     // satellite base radii (xS)
  const float DIR0 = 0.0,  DIR1  = 2.30, DIR2 = 4.30;    // incoming bearing (rad)
  const float SHD0 = 1.7,  SHD1  = 3.9,  SHD2 = 5.6;     // shed bearing (rad)

  // mother accumulates swallowed mass; total liquid area stays plausible
  float massM = 0.0;

  // we compute each satellite inline (no dynamic indexing). Helper macro pattern
  // is unrolled by hand below.

  // ---- satellite 0 ----
  float cyc0  = fract(T / PER0 + OFF0);
  // orbit radius breathes in/out over the cycle; closes to ~0 at swallow window
  float close0 = smoothstep(0.10, 0.45, cyc0) * (1.0 - smoothstep(0.45, 0.50, cyc0));
  // swallowed band: fully absorbed across [0.45 .. 0.66], shed back [0.66 .. 0.90]
  float swal0 = smoothstep(0.45, 0.50, cyc0) * (1.0 - smoothstep(0.66, 0.90, cyc0));
  float orad0 = mix(1.18, 0.62, smoothstep(0.06, 0.45, cyc0))
              * (1.0 - swal0);                       // collapses to mother when eaten
  // breathing of the apogee over a long offset cycle
  orad0 *= 1.0 + 0.14 * sin(T * 0.07 + 0.0);
  float oang0 = mix(DIR0, SHD0, smoothstep(0.50, 0.92, cyc0)) + 0.20 * sin(T * 0.05);
  vec2  sp0   = mother + vec2(cos(oang0), sin(oang0)) * orad0 * S;
  float srad0 = BR0 * (1.0 - 0.55 * swal0);          // shrinks as it is absorbed
  massM += swal0 * BR0 * BR0;                        // its area pours into mother

  // ---- satellite 1 ----
  float cyc1  = fract(T / PER1 + OFF1);
  float swal1 = smoothstep(0.45, 0.50, cyc1) * (1.0 - smoothstep(0.66, 0.90, cyc1));
  float orad1 = mix(1.22, 0.60, smoothstep(0.06, 0.45, cyc1)) * (1.0 - swal1);
  orad1 *= 1.0 + 0.14 * sin(T * 0.061 + 2.1);
  float oang1 = mix(DIR1, SHD1, smoothstep(0.50, 0.92, cyc1)) + 0.20 * sin(T * 0.043 + 1.0);
  vec2  sp1   = mother + vec2(cos(oang1), sin(oang1)) * orad1 * S;
  float srad1 = BR1 * (1.0 - 0.55 * swal1);
  massM += swal1 * BR1 * BR1;

  // ---- satellite 2 ----
  float cyc2  = fract(T / PER2 + OFF2);
  float swal2 = smoothstep(0.45, 0.50, cyc2) * (1.0 - smoothstep(0.66, 0.90, cyc2));
  float orad2 = mix(1.26, 0.58, smoothstep(0.06, 0.45, cyc2)) * (1.0 - swal2);
  orad2 *= 1.0 + 0.14 * sin(T * 0.053 + 4.4);
  float oang2 = mix(DIR2, SHD2, smoothstep(0.50, 0.92, cyc2)) + 0.20 * sin(T * 0.037 + 2.0);
  vec2  sp2   = mother + vec2(cos(oang2), sin(oang2)) * orad2 * S;
  float srad2 = BR2 * (1.0 - 0.55 * swal2);
  massM += swal2 * BR2 * BR2;

  // mother swells with conserved mass; settling wobble after each swallow
  float wobAmt = (swal0 + swal1 + swal2);
  float motherBaseR = sqrt(0.62 * 0.62 + massM);     // area-conserving radius growth
  // long settling wobble of the swollen mother (subtle radial breathing)
  motherBaseR *= 1.0 + 0.03 * wobAmt * sin(T * 2.3);

  // pack into field globals
  gM   = mother;
  gRM  = motherBaseR * S;
  gS0  = sp0;  gRS0 = srad0 * S;
  gS1  = sp1;  gRS1 = srad1 * S;
  gS2  = sp2;  gRS2 = srad2 * S;
  gK   = 0.30 * S;                                   // smooth-min reach (necks)

  float d = field(pc);

  // --- per-kernel dominance weights for hue blending (mother vs satellites) ---
  float dM  = length(pc - gM)  - gRM;
  float dS0 = length(pc - gS0) - gRS0;
  float dS1 = length(pc - gS1) - gRS1;
  float dS2 = length(pc - gS2) - gRS2;
  // closeness weights: nearest surface dominates the local hue
  float wM  = exp(-max(dM,  -gRM) / (0.35 * S));
  float wS0 = exp(-max(dS0, -gRS0) / (0.35 * S));
  float wS1 = exp(-max(dS1, -gRS1) / (0.35 * S));
  float wS2 = exp(-max(dS2, -gRS2) / (0.35 * S));
  float wSat = wS0 + wS1 + wS2;
  float satFrac = wSat / max(wM + wSat, 1e-4);       // 1 = pure satellite hue

  // gradient of the field for the directional rim highlight
  float e = 2.0;
  vec2 g = vec2(field(pc + vec2(e, 0.0)) - field(pc - vec2(e, 0.0)),
                field(pc + vec2(0.0, e)) - field(pc - vec2(0.0, e)));
  vec2 n = g / max(length(g), 1e-4);

  // --- compose ---
  vec3 bg = vec3(0.035, 0.035, 0.043);
  float vig = 1.0 - 0.32 * smoothstep(0.35, 1.15, length(pc) / minR);
  vec3 col = bg * vig;

  float aa = 1.5;
  float body = smoothstep(aa, -aa, d);

  // interior: dark liquid mirror with a faint cool interior sheen.
  // mother tinted c0 deepening toward c1 at her core; satellites carry c2.
  float depth = exp(min(d, 0.0) / (0.20 * S));       // 1 deep inside, ->0 at surface
  vec3 motherTint = mix(c0 * 0.10, c1 * 0.14, depth); // deepens toward c1 at core
  vec3 satTint    = c2 * (0.07 + 0.06 * depth);
  float yrel = (pc.y - gM.y) / max(gRM, 1.0);
  float sheen = smoothstep(0.55, -0.95, yrel);
  vec3 interior = bg * 0.85
                + mix(motherTint, satTint, satFrac)
                + c2 * 0.05 * sheen * depth;
  col = mix(col, interior, body);

  // thin bright gradient-derived rim, lit from upper-left. hue: mother c0->c1,
  // satellites c2; rim brightens with the surface normal facing the light.
  float lightAmt = max(dot(n, normalize(vec2(-0.42, 0.86))), 0.0);
  float specW = 0.30 + 0.70 * lightAmt * lightAmt;
  float rim = exp(-(d * d) / (2.4 * 2.4));
  vec3 motherRim = mix(c0, c1, 0.35 + 0.4 * depth);
  vec3 rimCol = mix(motherRim, c2, satFrac);
  col += rimCol * rim * specW * 1.15;

  // very soft halo so the dark around the bodies breathes
  float halo = exp(-max(d, 0.0) / (0.30 * S)) * (1.0 - body);
  col += rimCol * halo * 0.05;

  // --- the gulp: hot c3 bloom at the neck at each swallow AND each shed ---
  // event windows per satellite: swallow near cyc~0.475, shed near cyc~0.78
  float fz0 = (gauss(cyc0, 0.475, 0.020) + gauss(cyc0, 0.80, 0.024));
  float fz1 = (gauss(cyc1, 0.475, 0.020) + gauss(cyc1, 0.80, 0.024));
  float fz2 = (gauss(cyc2, 0.475, 0.020) + gauss(cyc2, 0.80, 0.024));

  // neck point of each satellite = midway along the line to the mother surface
  vec3 flash = vec3(0.0);
  // satellite 0
  {
    vec2 dv = gS0 - gM; float sl = max(length(dv), 1.0);
    float tn = clamp((gRM + 0.5 * (sl - gRM - gRS0)) / sl, 0.0, 1.0);
    vec2 nk = gM + dv * tn; float fd = length(pc - nk);
    flash += c3 * fz0 * (0.65 * exp(-(fd*fd)/(0.30*S*0.30*S))
                       + 0.60 * exp(-(fd*fd)/(0.12*S*0.12*S)));
  }
  // satellite 1
  {
    vec2 dv = gS1 - gM; float sl = max(length(dv), 1.0);
    float tn = clamp((gRM + 0.5 * (sl - gRM - gRS1)) / sl, 0.0, 1.0);
    vec2 nk = gM + dv * tn; float fd = length(pc - nk);
    flash += c3 * fz1 * (0.65 * exp(-(fd*fd)/(0.30*S*0.30*S))
                       + 0.60 * exp(-(fd*fd)/(0.12*S*0.12*S)));
  }
  // satellite 2
  {
    vec2 dv = gS2 - gM; float sl = max(length(dv), 1.0);
    float tn = clamp((gRM + 0.5 * (sl - gRM - gRS2)) / sl, 0.0, 1.0);
    vec2 nk = gM + dv * tn; float fd = length(pc - nk);
    flash += c3 * fz2 * (0.65 * exp(-(fd*fd)/(0.30*S*0.30*S))
                       + 0.60 * exp(-(fd*fd)/(0.12*S*0.12*S)));
  }
  col += flash * u_gulpFlash;
  // the rim catches the flash too
  col += c3 * (fz0 + fz1 + fz2) * rim * 0.5 * u_gulpFlash;

  // --- depth-of-field background: soft defocused blobs of the same liquid format
  // drift behind the subject for depth + to fill the dark (replaces the backdrop),
  // gated behind the solid body so the subject stays crisp against the blur. ---
  vec3 dofBg = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + 1.0;
    vec2  seed = vec2(fract(sin(fi * 91.7) * 4373.0), fract(sin(fi * 47.3) * 9277.0));
    vec2  obp  = (seed - 0.5) * resC * 0.98;
    obp += vec2(sin(u_time * 0.15 + fi), cos(u_time * 0.12 + fi * 1.6)) * minR * 0.12;
    float orad = (0.16 + 0.22 * fract(sin(fi * 23.1) * 1731.0)) * minR;
    float od   = length(pc - obp);
    float disc = smoothstep(orad, orad * 0.5, od);
    float ring = exp(-pow((od - orad * 0.9) / (orad * 0.16), 2.0));
    vec3  oc   = mix(mix(c0, c2, fract(sin(fi * 5.5) * 331.0)), c1, 0.30);
    dofBg += oc * (disc * 0.55 + ring * 0.85);
  }
  col += dofBg * 0.060 * (1.0 - body);

  // soft tone map keeps flashes hot without clipping, then dither
  col = 1.0 - exp(-col);
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
