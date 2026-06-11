// murmur (Gyre) — a single starling murmuration wheels through a near-black dusk:
// a few hundred individually visible dots fly as one cohesive elongated body that
// stretches, necks down, folds back over itself, and snaps into new shapes the way
// real flocks do. The flock's centroid wanders the frame on incommensurate sine
// frequencies; the body morphs via curl noise in flock-local space; banking flashes
// the leading edge a step brighter and hue-shifts it through the palette. Everything
// outside the body is empty darkness — 70-80% of the frame stays clear.
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
uniform float u_flightSpeed; // travel rate of the flock around the frame (default 0.3)
uniform float u_flockSize;   // css-px length of the flock body, scaled by pr (default 360)
uniform float u_dotSize;     // css-px size of each bird dot, scaled by pr (default 2)
uniform float u_shapeshift;  // amplitude of body folding/necking (default 1.2)

const vec3  BG       = vec3(0.030, 0.031, 0.040); // near-black dusk base
const float TWO_PI   = 6.2831853;

// hash helpers (no textures) -------------------------------------------------
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
vec2  hash21(float n) {
  return fract(sin(vec2(n, n + 1.7)) * vec2(43758.5453123, 22578.145912));
}

// cheap value-noise gradient field for a curl-like swirl ----------------------
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i + vec2(0.0, 0.0), vec2(127.1, 311.7)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// curl of the noise field -> divergence-free swirl (the "current") -----------
vec2 curl(vec2 p) {
  float e = 0.35;
  float n1 = vnoise(p + vec2(0.0,  e));
  float n2 = vnoise(p - vec2(0.0,  e));
  float n3 = vnoise(p + vec2(e,  0.0));
  float n4 = vnoise(p - vec2(e,  0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;
  float mdim = min(res.x, res.y);

  // palette fallback (headless contexts can leave u_palette zeroed) ----------
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- flock centroid: smooth wandering on incommensurate sine freqs -------
  // continuous unbounded phase -> flight never visibly repeats or resets.
  float sp   = max(u_flightSpeed, 0.0);
  float ph   = t * sp;
  // amplitude keeps the flock comfortably inside the frame
  vec2  amp  = vec2(res.x * 0.32, res.y * 0.30);
  vec2  cen  = ctr + vec2(
                 amp.x * sin(ph * 0.41 + 0.0) + amp.x * 0.34 * sin(ph * 0.97 + 1.3),
                 amp.y * sin(ph * 0.53 + 2.1) + amp.y * 0.32 * sin(ph * 1.13 + 0.4));

  // heading = velocity direction of the centroid (analytic derivative) --------
  vec2  vel  = vec2(
                 amp.x * (0.41 * cos(ph * 0.41) + 0.34 * 0.97 * cos(ph * 0.97 + 1.3)),
                 amp.y * (0.53 * cos(ph * 0.53 + 2.1) + 0.32 * 1.13 * cos(ph * 1.13 + 0.4)));
  vec2  fwd  = normalize(vel + vec2(1e-4, 0.0));
  vec2  side = vec2(-fwd.y, fwd.x);

  // banking: signed curvature ~ rate of turn of the heading -------------------
  float bank = amp.x * (-0.41*0.41*sin(ph*0.41) - 0.34*0.97*0.97*sin(ph*0.97+1.3)) * side.x
             + amp.y * (-0.53*0.53*sin(ph*0.53+2.1) - 0.32*1.13*1.13*sin(ph*1.13+0.4)) * side.y;
  bank = clamp(bank / (mdim * 0.9), -1.0, 1.0);

  // ---- flock-local coordinates (rotate world into heading frame) -----------
  vec2  rel  = fc - cen;
  vec2  lp   = vec2(dot(rel, fwd), dot(rel, side)); // (along, across) in device px

  float bodyLen = max(u_flockSize, 60.0) * pr;      // long axis
  float bodyWid = bodyLen * 0.34;                    // base short axis

  // ---- domain-warp the local space so the body folds/necks (Gyre churn) ----
  // curl noise advects the body shape; phase drifts so it morphs continuously.
  vec2  nq   = lp / (bodyLen * 0.5);
  float warpA = 0.55 * u_shapeshift;
  vec2  cw1  = curl(nq * 1.3 + vec2(0.0, t * 0.18 * sp + t * 0.05));
  vec2  cw2  = curl(nq * 2.7 - vec2(t * 0.11, t * 0.07 * sp));
  vec2  warp = (cw1 + 0.5 * cw2) * warpA;
  vec2  q    = nq + warp;

  // sinuous ribbon: necking along the body via a folded sine of the long axis
  float along = q.x;                       // -1..1-ish along body
  float neck  = 0.62 + 0.38 * cos(along * 3.1 + warp.y * 1.6 + t * 0.3 * sp);
  neck        = mix(1.0, neck, clamp(u_shapeshift * 0.7, 0.0, 1.0));

  // ---- flock density field: smooth elongated blob, then carve hard edge ----
  float ax = q.x;
  float ay = q.y / max(neck, 0.18);
  float r2 = ax * ax * 1.0 + ay * ay * 2.6;   // elongated ellipse in warped space
  float body = 1.0 - smoothstep(0.55, 1.02, r2); // crisp density edge

  // a folded second lobe so the ribbon can split & merge under high shapeshift
  float lobePhase = t * 0.23 * sp;
  vec2  q2 = q - vec2(0.9 * sin(lobePhase) * u_shapeshift, 0.5 * cos(lobePhase*1.3));
  float r2b = q2.x*q2.x*1.4 + q2.y*q2.y*3.0;
  float body2 = (1.0 - smoothstep(0.5, 0.95, r2b)) * smoothstep(0.6, 1.6, u_shapeshift);
  body = max(body, body2 * 0.85);

  // ---- discrete birds: a dot grid sampled only where the body is present ---
  // countable hard dots, NOT a luminous pool. Dot cell ~ bird spacing.
  float dotCss = max(u_dotSize, 0.5);
  float cell   = max(dotCss * 4.4, 3.0) * pr;       // spacing between birds
  // jitter the grid in flock-local space so dots don't read as a lattice
  vec2  gcoord = lp;                                 // already local px
  vec2  cid    = floor(gcoord / cell);
  vec2  jit    = (hash21(dot(cid, vec2(31.7, 12.3))) - 0.5) * cell * 0.85;
  vec2  bcenter= (cid + 0.5) * cell + jit;
  float ddist  = length(gcoord - bcenter);
  float dotR   = dotCss * pr * 0.5;
  float dotV   = 1.0 - smoothstep(dotR, dotR + pr * 1.3, ddist);

  // each bird has its own faint flutter so specks twinkle between maneuvers
  float bseed  = hash11(dot(cid, vec2(7.3, 19.1)));
  float flutter= 0.55 + 0.45 * sin(t * (2.0 + bseed * 3.0) * (0.4 + sp) + bseed * TWO_PI);

  // compression on the turn: birds bunch toward the banking side of the body
  float compress = 1.0 + 0.6 * bank * (q.y);        // denser where bank pushes
  float present  = body * clamp(compress, 0.4, 1.7);

  // leading edge flash: brightest at the front of the body, stepped on bank ---
  float lead   = smoothstep(-0.1, 0.9, q.x);        // 0 at tail, 1 at nose
  float bankAbs= abs(bank);
  float flash  = mix(0.5, 1.0, lead) + bankAbs * 0.9 * lead; // step brighter on bank

  // overall bird intensity: dot * inside-body * flutter * flash ---------------
  float birdMask = dotV * smoothstep(0.04, 0.32, present);
  float bird = birdMask * flash * mix(0.35, 1.0, flutter);

  // ---- colour: hue rolls along the body and shifts with bank direction -----
  float hueS = (q.x * 0.7 + 2.0) + bank * 1.1 + t * 0.03;
  float s    = fract(hueS * 0.25) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);
  // leading-edge hue brightens / shifts a step toward the warm accent on bank
  hue = mix(hue, c3 * 0.6 + hue * 0.7, clamp(bankAbs * lead, 0.0, 0.6));

  // ---- compose: near-black base + the flock body only ----------------------
  vec3 col = BG;
  col += hue * bird * 1.35;
  // a soft body halo so the silhouette has presence without becoming a pool.
  // keep it faint and confined to the body interior so the warp cells never
  // read as a blocky fill — the dots carry the form.
  float halo = body * body * 0.065;
  col += hue * halo;

  // gentle vignette to keep edges dark and the dusk composed
  float vign = 1.0 - 0.5 * smoothstep(0.55, 1.15, length((fc - ctr) / res));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
