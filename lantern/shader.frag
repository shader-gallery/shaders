// lantern (Bloom) — bioluminescent orbs: several soft radial glow orbs in
// palette colours drifting slowly over dark water, added together so overlaps
// bloom brighter, each gently breathing in size and brightness. Deep-sea,
// hypnotic, luminous. The motion is built from looping sin/cos drifts so the
// piece returns to itself with no visible jump.
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

const float BG = 0.035;   // deep-water base, ~#09090B

// Read a palette entry. Some hosts can't bind a vec3[] uniform (it arrives as
// all-zero); when the whole palette reads black we fall back to the canonical
// "midnight" palette so the piece stays lit and on-theme. When the host does
// supply colours, those are used verbatim — so the gallery stays re-themeable.
vec3 pal(int i) {
  vec3 c = i == 0 ? u_palette[0] : i == 1 ? u_palette[1]
         : i == 2 ? u_palette[2] : u_palette[3];
  vec3 sum = u_palette[0] + u_palette[1] + u_palette[2] + u_palette[3];
  if (dot(sum, sum) < 1e-5) {
    if (i == 0) return vec3(0.231, 0.510, 0.965);
    if (i == 1) return vec3(0.659, 0.333, 0.969);
    if (i == 2) return vec3(0.133, 0.827, 0.933);
    return vec3(0.957, 0.247, 0.369);
  }
  return c;
}

// soft radial glow: a bright luminous core plus a contained bloom tail
float orb(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  float core = exp(-d * d / (r * r * 0.12));   // tight bright nucleus
  float halo = exp(-d * d / (r * r * 1.1));    // soft surrounding bloom
  return core * 1.6 + halo * 0.35;
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / res.y;   // y in -0.5..0.5
  float t   = u_time;

  // faint depth gradient + slow caustic shimmer so the water isn't flat
  float depth   = 0.018 * (1.0 - uv.y * 0.6);
  float shimmer = 0.010 * (0.5 + 0.5 * sin(uv.x * 3.0 + t * 0.25))
                        * (0.5 + 0.5 * sin(uv.y * 2.3 - t * 0.20));
  vec3 col = vec3(BG) + vec3(0.02, 0.03, 0.05) * (depth + shimmer);

  // six orbs, each anchored in frame and wandering on a small looping orbit,
  // cycling through the four palette colours.
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ph = fi * 1.2566;
    float sp = 0.09 + 0.035 * fi;

    vec2 anchor = vec2(0.62 * sin(fi * 2.3 + 0.7),
                       0.34 * cos(fi * 1.7 + 1.1));
    vec2 c = anchor + vec2(
      0.28 * sin(t * sp + ph) + 0.12 * cos(t * sp * 0.6 + ph * 1.7),
      0.24 * cos(t * sp * 0.8 + ph * 1.3) + 0.10 * sin(t * sp * 0.5 + ph)
    );

    // breathing brightness + radius, out of phase per orb
    float br = 0.5 + 0.5 * sin(t * (0.35 + 0.05 * fi) + ph * 2.0);
    float r  = mix(0.16, 0.28, 0.5 + 0.5 * sin(t * 0.3 + ph));
    float g  = orb(uv, c, r) * mix(0.55, 1.0, br);

    // blend two adjacent palette entries so all four hues are used and the
    // school slowly shifts colour over time
    float sel = mod(fi + t * 0.05, 4.0);
    vec3  cc  = mix(pal(int(sel)), pal(int(mod(sel + 1.0, 4.0))), fract(sel));

    col += cc * g * 0.55;
  }

  // faint pointer-following lantern so the field reacts when hovered
  vec2 m = (u_mouse - 0.5 * res) / res.y;
  if (dot(m, m) > 0.0001) {
    col += pal(2) * orb(uv, m, 0.22) * 0.22;
  }

  // tone curve: overlaps keep glowing without blowing to white, while the
  // deep base is preserved so orbs read as light sources on dark water
  col = col / (col + vec3(0.9));
  col = pow(col, vec3(0.9));

  gl_FragColor = vec4(col, 1.0);
}
