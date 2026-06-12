precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glitch;         // corruption intensity                 (default 0.6)
uniform float u_rate;           // how often new glitch frames hit       (default 7)
uniform float u_split;          // RGB channel-split amount              (default 0.5)
uniform float u_blocks;         // base block-field coarseness           (default 14)
uniform float u_mouseInfluence; // pointer adds a tear at its row         (default 0.0)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash1(float n){ return fract(sin(n * 91.345) * 43758.5453); }

vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x){
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(c3, c0, smoothstep(0.0, 0.34, x));
  a = mix(a, c1, smoothstep(0.34, 0.67, x));
  a = mix(a, c2, smoothstep(0.67, 1.0, x));
  return a;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  // discrete glitch frames: the corruption re-randomises in steps, not smoothly
  float frame = floor(u_time * max(u_rate, 0.5));
  float gAmt = clamp(u_glitch, 0.0, 1.0);

  // horizontal tear bands — each band gets a random horizontal shift this frame
  float bandN = 14.0;
  float band = floor(uv.y * bandN);
  float tornBand = step(1.0 - 0.55 * gAmt, hash(vec2(band, frame)));
  float shift = (hash(vec2(band + 3.0, frame)) - 0.5) * gAmt * 0.5 * tornBand;

  vec2 m = u_mouse / u_resolution;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  shift += mAmt * step(abs(uv.y - m.y), 1.5 / bandN) * (hash(vec2(band, frame + 9.0)) - 0.5) * 0.6;

  vec2 suv = vec2(fract(uv.x + shift), uv.y);

  // a finer block-shuffle on the most corrupted frames
  float blocks = max(u_blocks, 3.0);
  vec2 blk = floor(suv * blocks);
  float jump = step(0.82, hash(blk + frame * 0.7)) * gAmt;
  suv.x = fract(suv.x + jump * (hash(blk + frame) - 0.5) * 0.3);

  // themed blocky content with an RGB channel split (sideways chroma break)
  float sp = u_split * (0.01 + 0.05 * gAmt);
  float bands = fract(suv.x * 1.5 + suv.y * 0.4 + 0.15 * sin(frame));
  vec3 cR = ramp(c0, c1, c2, c3, fract(bands + sp));
  vec3 cG = ramp(c0, c1, c2, c3, bands);
  vec3 cB = ramp(c0, c1, c2, c3, fract(bands - sp));
  float tex = 0.7 + 0.5 * hash(floor(suv * vec2(blocks * 1.6, blocks)));
  vec3 col = vec3(cR.r, cG.g, cB.b) * tex;

  // bright scan tear lines + dropout on torn bands
  col += vec3(1.0) * tornBand * step(0.97, hash(vec2(band + 5.0, frame))) * 0.6;
  col *= 1.0 - 0.5 * tornBand * step(0.93, hash(vec2(band + 11.0, frame)));   // black dropout

  // faint dark base so quiet frames aren't flat
  col = max(col, c3 * 0.05);

  gl_FragColor = vec4(col, 1.0);
}
