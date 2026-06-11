// rotunda (Plinth) — the inside of a ruined circular temple. A ring of solid
// cylinder-SDF columns surrounds the viewer; a per-column hash snaps some to
// stumps. The eye sits between the ring and a low central altar block and orbits
// it slowly, so near columns process leftward as solid black bars while the far
// picket counter-drifts rightward — opposed parallax streams in one shot. Fog
// pours through the gaps (palette c1 over the c0 base), column flanks take c2
// rims, and a single c3 ember rests on the altar. The world never stirs; only
// the eye moves through space.
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
uniform float u_orbitSpeed;  // camera circling speed around the altar (default 0.25)
uniform float u_ruinAmount;  // fraction of columns broken to stumps     (default 0.45)
uniform float u_fogDensity;  // thickness of glowing haze beyond ring    (default 1.0)
uniform float u_emberGlow;   // brightness of warm light on the altar    (default 0.5)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float NSECTORS    = 24.0;   // columns folded into this many azimuth sectors
const float RING_R      = 6.0;    // radius of the column ring
const float COL_R       = 0.42;   // column shaft radius
const float ALTAR_R     = 1.15;   // central altar block half-size
const int   MAX_STEPS   = 90;     // fixed-step march bound (constant)
const float MAX_DIST    = 34.0;   // far march bound
const float EPS         = 0.0025; // surface hit epsilon

// cheap hash for per-sector ruin/height decisions
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

// cyclic triangular weight for a palette entry on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// rounded box SDF (the altar)
float sdBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// capped vertical cylinder of radius ra, from y=0 up to y=h
float sdCylY(vec3 p, float ra, float h) {
  vec2 d = vec2(length(p.xz) - ra, max(p.y - h, -p.y));
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// the static world: ring of columns (folded azimuth) + altar.
// returns distance; sets matId (1 = column, 2 = altar) and the column's
// world height fraction in hOut for rim shading.
float mapWorld(vec3 p, out float matId, out float hOut) {
  matId = 0.0;
  hOut = 0.0;

  // ---- ring of columns by azimuth folding ----
  // sector index around the ring, folded so one cylinder repeats NSECTORS times
  float ang  = atan(p.z, p.x);                 // -pi..pi
  float sect = floor((ang / 6.2831853 + 0.5) * NSECTORS);
  float a0   = (sect + 0.5) / NSECTORS * 6.2831853 - 3.14159265; // sector centre
  vec2  cdir = vec2(cos(a0), sin(a0));
  vec3  cpos = vec3(cdir.x * RING_R, 0.0, cdir.y * RING_R);

  // per-column hash: height + whether it is broken to a stump
  float h    = hash11(sect + 3.0);
  float ruin = hash11(sect * 1.7 + 11.0);
  // full columns rise toward an implied vanished roof; ruined ones snap to stumps
  float full = 6.5 + h * 2.0;
  float stub = 0.7 + h * 1.1;
  float broken = step(ruin, u_ruinAmount);
  float colH = mix(full, stub, broken);

  // broken capitals: a slightly fatter rounded cap chunk sits where the column
  // shears off, catching the most rim light overhead
  vec3 lp = p - cpos;
  float shaft = sdCylY(lp, COL_R, colH);
  float capWob = (hash11(sect * 2.3 + 5.0) - 0.5) * 0.18;
  float cap = sdBox(lp - vec3(0.0, colH, 0.0), vec3(COL_R + 0.16, 0.18 + capWob, COL_R + 0.16), 0.07);
  float colD = min(shaft, cap);

  // ---- central altar block ----
  float altarD = sdBox(p - vec3(0.0, 0.42, 0.0), vec3(ALTAR_R, 0.42, ALTAR_R), 0.10);

  // ---- ground plane (the temple floor) ----
  float groundD = p.y;

  float d = colD;
  matId = 1.0;
  hOut = clamp(p.y / max(colH, 0.001), 0.0, 1.0);
  if (altarD < d) {
    d = altarD;
    matId = 2.0;
    hOut = 0.0;
  }
  if (groundD < d) {
    d = groundD;
    matId = 3.0;
    hOut = 0.0;
  }
  return d;
}

// finite-difference normal
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  float m; float h;
  return normalize(vec3(
    mapWorld(p + e.xyy, m, h) - mapWorld(p - e.xyy, m, h),
    mapWorld(p + e.yxy, m, h) - mapWorld(p - e.yxy, m, h),
    mapWorld(p + e.yyx, m, h) - mapWorld(p - e.yyx, m, h)));
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized screen coords, aspect-correct, centred
  vec2 uv = (fc - 0.5 * res) / res.y;

  // palette with midnight fallback (headless can leave u_palette zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // ---- camera orbits the altar slowly, inside the ring ----
  // eye sits between the altar and the column ring, looking outward-tangent so
  // the near arc of the ring sweeps one way and the far arc counter-drifts.
  float orbit = t * u_orbitSpeed * 0.35;
  float camR  = RING_R * 0.46;                 // well inside the ring
  vec3  ro = vec3(cos(orbit) * camR, 2.4, sin(orbit) * camR);
  // look along the orbit tangent but biased inward toward the altar, so the low
  // central altar (with its ember) sits in the foreground while the ring wraps
  // behind it: near columns sweep one way, the far picket counter-drifts.
  vec3 tang = vec3(-sin(orbit), 0.0, cos(orbit));   // orbit tangent (eye sweep)
  vec3 inw  = vec3(-cos(orbit), 0.0, -sin(orbit));  // toward the altar/centre
  vec3  ta = ro + normalize(tang * 0.86 + inw * 0.42) + vec3(0.0, -0.30, 0.0);

  // camera basis
  vec3 fwd = normalize(ta - ro);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up  = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x * rgt + uv.y * up + 1.25 * fwd);  // wider lens for ring depth

  // ---- fixed-step sphere march with constant bounds ----
  float dist = 0.0;
  float matId = 0.0;
  float hOut = 0.0;
  float hitM = 0.0;
  float hitH = 0.0;
  bool  hit  = false;
  vec3  pos  = ro;
  for (int i = 0; i < MAX_STEPS; i++) {
    pos = ro + rd * dist;
    float d = mapWorld(pos, matId, hOut);
    if (d < EPS) { hit = true; hitM = matId; hitH = hOut; break; }
    dist += d;
    if (dist > MAX_DIST) break;
  }

  // ---- fog: glowing haze beyond the ring (c1 over c0 base) ----
  // depth-driven brume that breathes through the gaps as the eye orbits. Kept
  // dim and low so the scene reads near-black with luminous haze, not washed.
  float fd = min(dist, MAX_DIST);
  float breathe = 0.5 + 0.5 * sin(t * 0.4 + atan(rd.z, rd.x) * 2.0);
  float fogAmt = 1.0 - exp(-max(fd - 3.0, 0.0) * 0.030 * u_fogDensity * (0.7 + 0.5 * breathe));
  // vertical gradient: glow pools low through the gaps, fades dark toward the roof
  float vgrad = smoothstep(0.55, -0.35, rd.y);
  vec3 fogCol = mix(c0 * 0.10, c1 * 0.62, vgrad);
  vec3 col = mix(BG, fogCol, fogAmt);

  if (hit) {
    vec3 n = calcNormal(pos);
    // key light from above-ahead (implied open roof) + soft ambient
    vec3 ldir = normalize(vec3(0.25, 0.85, 0.15));
    float diff = max(dot(n, ldir), 0.0);
    float amb  = 0.12 + 0.08 * (n.y * 0.5 + 0.5);

    // rim where mass meets glow: flanks catch c2 against the fog
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);

    if (hitM > 2.5) {
      // temple floor: mute dark stone, slightly warmed near the altar ember
      // warm pool of ember light spilling onto the floor around the altar
      float near = exp(-dot(pos.xz, pos.xz) / 11.0);
      vec3 floorCol = mix(c0 * 0.11, c3 * 0.22, near * (0.35 + u_emberGlow * 0.55));
      col = floorCol * (amb + diff * 0.22);
      // sink the floor into fog with distance so it never reads as a hard plane
      float gFog = 1.0 - exp(-max(dist - 3.5, 0.0) * 0.050 * u_fogDensity);
      col = mix(col, fogCol, clamp(gFog, 0.0, 0.94));
    } else if (hitM > 1.5) {
      // altar: mute dark stone with a single quiet warm ember (c3) on top
      vec3 stone = mix(c0 * 0.16, c2 * 0.10, n.y * 0.5 + 0.5);
      float emb = exp(-dot(pos.xz, pos.xz) / (ALTAR_R * ALTAR_R * 0.7));
      emb *= smoothstep(0.45, 0.84, pos.y);     // glow rests on the altar's top face
      vec3 ember = c3 * emb * (0.7 + u_emberGlow * 2.2);
      col = stone * (amb + diff * 0.35) + ember;
      col += c2 * rim * 0.16;
      float aFog = 1.0 - exp(-max(dist - 2.0, 0.0) * 0.045 * u_fogDensity);
      col = mix(col, fogCol, aFog * 0.7);
    } else {
      // columns: solid, ancient, near-black mass. Near columns read as black
      // bars; far ones half-lost in fog. Rim of c2 where flank meets the brume.
      vec3 shaftCol = c0 * 0.10;
      col = shaftCol * (amb + diff * 0.30);
      // broken capitals (high on the column) catch the most rim light
      float capBoost = smoothstep(0.7, 1.0, hitH);
      col += c2 * rim * (0.45 + 0.85 * capBoost);
      // a faint hue trace by azimuth so the picket isn't monochrome
      float s = fract(atan(pos.z, pos.x) / 6.2831853 + 0.5 + t * 0.01) * 4.0;
      float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
      vec3 tint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
      col += tint * rim * 0.10;

      // distance fog over the solid so far columns sink into the haze
      float colFog = 1.0 - exp(-max(dist - 2.0, 0.0) * 0.045 * u_fogDensity);
      col = mix(col, fogCol, colFog * 0.92);
    }
  }

  // a low warm wash bleeding up from the altar ember into the near air: glow
  // pools where rays graze the central altar, fading with depth and looking down
  vec3 toCtr = normalize(vec3(-ro.x, 0.0, -ro.z));
  float aim  = max(dot(rd, toCtr), 0.0);
  float altarGlow = u_emberGlow * 0.16 * pow(aim, 3.0) * smoothstep(0.35, -0.5, rd.y)
                  * exp(-max(fd - 1.5, 0.0) * 0.18);
  col += c3 * altarGlow;

  // gentle filmic-ish tone curve + vignette for composed framing
  col = col / (col + vec3(0.85)) * 1.55;
  float vign = 1.0 - 0.42 * dot(uv, uv);
  col *= vign;

  // subtle dithered grain to kill banding in the fog gradient
  float grain = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.012;

  col = max(col, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
