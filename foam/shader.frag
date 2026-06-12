// foam (Wake) — rafts of sea foam on black water, seen from directly above.
// Each raft is a loose cluster of glowing bubble rings: thin circular outlines,
// each with one bright specular point on its rim, packed dense at the cluster
// core and thinning to stray singletons at the edges. Bubbles take palette
// colours by hash; larger rings are dimmer, fine small rings brightest. Every
// bubble lives a hash-staggered lifecycle — swell from a point, ride at fixed
// diameter, then pop in a quick rim-flash that collapses inward and scatters a
// few tiny sparkles. The rafts themselves drift, shear, and regather along a
// closed summed-sine current loop, so the froth churns forever with no reset.
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
uniform float u_bubbleSize;  // characteristic bubble ring radius, css px (default 11)
uniform float u_popRate;     // lifecycle turnover speed (default 0.6)
uniform float u_driftSpeed;  // raft current-loop drift + shear rate (default 0.3)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // near-black water ~#09090B
const float TAU = 6.2831853;

// --- hashing (no textures) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0))) * 43758.5453;
  return fract(vec2(n, n * 1.37));
}

// value noise + small fbm for the frothy foam substrate
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int o = 0; o < 4; o++) { s += a * vnoise(p); p = p * 2.03 + vec2(7.3, 1.1); a *= 0.5; }
  return s;
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// summed-sine closed current loop: where the rafts have drifted to by time t.
vec2 currentLoop(float t) {
  vec2 o = vec2(0.0);
  o += vec2(sin(t * 0.31), cos(t * 0.27)) * 46.0;
  o += vec2(cos(t * 0.17 + 1.3), sin(t * 0.21 + 0.6)) * 30.0;
  o += vec2(sin(t * 0.43 + 2.1), cos(t * 0.39 + 0.2)) * 16.0;
  return o;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params against catastrophic extremes (uniforms can arrive 0.0)
  float bubR  = max(u_bubbleSize, 1.0) * pr;     // ring radius in device px
  float popK  = max(u_popRate, 0.0);             // lifecycle speed
  float drift = max(u_driftSpeed, 0.0);          // current speed

  // Cell grid: each cell may host one bubble; sized so bubbles pack
  // shoulder-to-shoulder in dense raft cores.
  float cell = bubR * 2.6;

  // Drift carries the whole foam field along the current loop; a low-freq shear
  // twists sample coords so rafts pull apart and regather, not slide rigidly.
  vec2 dr = currentLoop(t * drift) * pr;
  float shang = sin((fc.y - ctr.y) / res.y * 2.3 + t * drift * 0.5) * 0.18 * drift;
  float cs = cos(shang), sn = sin(shang);
  vec2 sp = mat2(cs, -sn, sn, cs) * (fc - ctr);
  vec2 samp = sp + ctr - dr;

  // --- raft centres ride the current loop on offset phases ---
  vec2 r0 = ctr + currentLoop(t * drift + 0.0) * pr * 1.1 + vec2(-0.18,  0.10) * res;
  vec2 r1 = ctr + currentLoop(t * drift + 2.4) * pr * 0.9 + vec2( 0.22, -0.16) * res;
  vec2 r2 = ctr + currentLoop(t * drift + 4.8) * pr * 1.0 + vec2( 0.02,  0.20) * res;
  float ra = min(res.x, res.y);

  vec3 col = BG;

  // four palette-intensity accumulators (resolved to colours after the loop)
  vec4 hueI = vec4(0.0);   // intensity routed to c0,c1,c2,c3

  vec2 baseCell = floor(samp / cell);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = baseCell + vec2(float(i), float(j));
      vec2 h2  = hash22(cid);
      float hp = hash21(cid + 7.1);          // lifecycle phase seed
      float hs = hash21(cid * 1.7 + 3.3);     // size class seed
      float hc = hash21(cid * 2.3 + 11.0);    // colour seed
      float hk = hash21(cid * 0.7 + 19.0);    // raft-cull seed

      // cell-local bubble centre in sample space, jittered within the cell
      vec2 bSamp = (cid + 0.15 + 0.7 * h2) * cell;
      // un-shear / un-drift back to screen space for the actual ring draw
      vec2 bscreen = bSamp + dr;

      // raft membership: keep a bubble only if its hash is under local density.
      float bd0 = exp(-dot(bscreen - r0, bscreen - r0) / (ra * ra * 0.078));
      float bd1 = exp(-dot(bscreen - r1, bscreen - r1) / (ra * ra * 0.088));
      float bd2 = exp(-dot(bscreen - r2, bscreen - r2) / (ra * ra * 0.066));
      float bdens = clamp(bd0 * 1.05 + bd1 * 1.0 + bd2 * 0.95, 0.0, 1.5);
      if (hk > bdens * 1.18) continue;

      // size class: small rings brightest, large dimmer & rarer
      float sizeF  = mix(0.5, 1.5, hs * hs);   // biased toward smaller
      float rad    = bubR * sizeF;
      float bright = mix(1.2, 0.42, smoothstep(0.5, 1.5, sizeF));

      // --- hash-staggered lifecycle: swell -> ride -> pop (collapse) -> gone ---
      // popRate sets both turnover speed AND how much of each cycle is spent in
      // active transition vs. steady riding: at low rate bubbles ride long (the
      // field stays full of calm full rings), at high rate the ride window
      // shrinks and a "gone" gap opens, so at any instant more bubbles are
      // caught mid-swell/mid-pop and some cells sit empty — the rafts fizz.
      float period = mix(7.0, 14.0, hp) / max(popK, 0.05);
      float life   = fract(t / period + hp);   // 0..1
      // fizz: 0 at calm popRate, ~1 at high — drives shorter ride + bigger gap
      float fizz   = smoothstep(0.2, 1.6, popK);
      float popEnd = mix(0.985, 0.40, fizz);    // pop finishes earlier when fizzy
      float swEnd  = 0.18;

      float swell   = smoothstep(0.0, swEnd, life);
      float ridePop = 1.0 - smoothstep(popEnd - 0.12, popEnd, life);
      float alive   = swell * ridePop;
      if (alive < 0.01) continue;

      float popT     = smoothstep(popEnd - 0.13, popEnd - 0.01, life); // ride..popped
      float collapse = 1.0 - popT * 0.85;                // shrink inward on pop
      float growR    = mix(0.15, 1.0, smoothstep(0.0, swEnd, life));
      float r        = rad * growR * collapse;

      float flash = exp(-pow((life - (popEnd - 0.09)) / 0.035, 2.0)); // rim-flash

      // --- ring outline ---
      vec2  d    = fc - bscreen;
      float dist = length(d);
      float lineW = max(1.0 * pr, rad * 0.11);
      float ring  = 1.0 - smoothstep(0.0, lineW, abs(dist - r));

      // single specular point on the rim, slowly wandering
      float ang     = atan(d.y, d.x);
      float specAng = (h2.x * 2.0 - 1.0) * 3.14159 + life * 0.6;
      float specD   = abs(atan(sin(ang - specAng), cos(ang - specAng)));
      float onRim   = 1.0 - smoothstep(0.0, lineW * 1.7, abs(dist - r));
      float spec    = onRim * exp(-pow(specD / 0.30, 2.0));

      // --- pop sparkles: 3 tiny points scattering inward->out on collapse ---
      float spark = 0.0;
      for (int s = 0; s < 3; s++) {
        vec2  sh  = hash22(cid * 3.7 + float(s) * 17.0 + 1.0) * 2.0 - 1.0;
        vec2  sp2 = bscreen + sh * rad * (0.25 + popT * 0.85);
        float sz  = (0.9 + 0.6 * hash21(cid + float(s) * 5.0)) * pr;
        float sd  = length(fc - sp2);
        spark += exp(-pow(sd / sz, 2.0)) * popT * (1.0 - popT) * 4.0;
      }

      // total intensity from this bubble; fizzy rafts read brighter at the rim
      // because more bubbles are caught flashing/sparkling at the pop moment.
      float popBoost = 1.0 + fizz * 0.8;
      float ringI = ring * 0.85 + spec * 1.5
                  + (spark + flash * ring * 1.3) * popBoost;
      ringI *= alive * bright;

      // four-colour froth: route intensity to palette slots by hashed hue
      float s4 = hc * 4.0;
      vec4  w  = vec4(wheelW(s4, 0.0), wheelW(s4, 1.0),
                      wheelW(s4, 2.0), wheelW(s4, 3.0));
      w /= max(w.x + w.y + w.z + w.w, 0.001);
      hueI += w * ringI;
    }
  }

  // Theme colours; fall back to midnight in zeroed headless contexts.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec3 foam = c0 * hueI.x + c1 * hueI.y + c2 * hueI.z + c3 * hueI.w;

  // raft density field (also used to gate the frothy substrate)
  float d0 = exp(-dot(fc - r0, fc - r0) / (ra * ra * 0.078));
  float d1 = exp(-dot(fc - r1, fc - r1) / (ra * ra * 0.088));
  float d2 = exp(-dot(fc - r2, fc - r2) / (ra * ra * 0.066));
  float raftDens = clamp(d0 * 1.05 + d1 * 1.0 + d2 * 0.95, 0.0, 1.5);

  // frothy foam substrate: a soft cellular fbm bed inside the rafts so the
  // bubbles sit on a churning mass of foam and the rafts read as froth, not a
  // scatter of lonely rings on black. Drifts with the field (samp coords).
  float froTex = fbm(samp / (cell * 1.1) + 3.0);
  froTex = pow(clamp(froTex * froTex + 0.15 * fbm(samp / (cell * 0.45)), 0.0, 1.0), 1.3);
  float froth = froTex * smoothstep(0.12, 0.9, raftDens);
  vec3  frothCol = mix(c2, c0, 0.4);
  col += mix(frothCol, vec3(1.0), 0.25) * froth * 0.22;

  // faint dark-water sheen beneath the rafts so foam reads as resting on glass
  col += (c2 * 0.45 + c0 * 0.55) * raftDens * 0.05;

  col += foam;

  // gentle vignette keeps the tile edges dark, the foam luminous
  float vign = 1.0 - smoothstep(0.35, 1.18, length((fc - ctr) / res));
  col *= mix(0.80, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
