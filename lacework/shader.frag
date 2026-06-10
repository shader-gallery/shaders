// lacework (Loom) — a dark field of dots that morph into crosses as a radial
// wave passes through them, lit by four drifting glow blobs and tinted by
// angle so the grid reads as a faint rainbow. GLSL port of the Hedge
// whats-new hero (reimagined as a seamless loop, no one-shot intro).
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

const float BG          = 0.039;   // #0A -> ~0.04
const float SPACING_CSS = 30.0;    // px between dots
const float DOT_CSS     = 1.5;     // dot radius
const float ARM_CSS     = 4.0;     // cross arm length at full morph
const float THICK_CSS   = 1.2;     // cross thickness at full morph
const float WAVELEN_CSS = 220.0;   // radial wavelength
const float WAVE_SPEED  = 0.6;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// thin plus/cross: union of a horizontal and a vertical bar
float sdCross(vec2 p, float arm, float th) {
  p = abs(p);
  float horiz = max(p.x - arm, p.y - th);
  float vert  = max(p.y - arm, p.x - th);
  return min(horiz, vert);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = vec3(BG, BG, 0.047);

  // --- four drifting radial glow blobs ---
  vec2 p0 = vec2(res.x * (0.30 + 0.20 * sin(t * 0.7)), res.y * (0.35 + 0.15 * cos(t * 0.5)));
  vec2 p1 = vec2(res.x * (0.70 + 0.15 * cos(t * 0.6)), res.y * (0.50 + 0.15 * sin(t * 0.8)));
  vec2 p2 = vec2(res.x * (0.20 + 0.15 * sin(t * 0.4)), res.y * (0.70 + 0.10 * cos(t * 0.9)));
  vec2 p3 = vec2(res.x * (0.75 + 0.10 * sin(t * 0.5)), res.y * (0.20 + 0.10 * cos(t * 0.7)));
  float R = max(res.x, res.y);
  col += u_palette[0] * 0.22 * smoothstep(R * 0.60, 0.0, distance(fc, p0));
  col += u_palette[1] * 0.18 * smoothstep(R * 0.55, 0.0, distance(fc, p1));
  col += u_palette[2] * 0.14 * smoothstep(R * 0.45, 0.0, distance(fc, p2));
  col += u_palette[3] * 0.10 * smoothstep(R * 0.35, 0.0, distance(fc, p3));

  // --- dot grid, in device pixels ---
  float spacing = SPACING_CSS * pr;
  vec2  cellId  = floor(fc / spacing);
  vec2  local   = (fc - (cellId + 0.5) * spacing);   // offset from this cell's centre
  vec2  dotCtr  = (cellId + 0.5) * spacing;

  // radial wave -> morph amount m in 0..1
  float dCtr = distance(dotCtr, ctr);
  float wave = sin((dCtr / (WAVELEN_CSS * pr)) * 6.2831853 - t * WAVE_SPEED);
  float m    = max(0.0, wave);

  // shape morph: shrinking dot blended into a growing cross
  float dotR  = mix(DOT_CSS, 0.0, m) * pr;
  float arm   = mix(DOT_CSS, ARM_CSS, m) * pr;
  float thick = mix(DOT_CSS, THICK_CSS, m) * pr;
  float dDot   = sdCircle(local, dotR);
  float dCross = sdCross(local, arm, thick);
  float shape  = mix(dDot, dCross, smoothstep(0.15, 0.85, m));
  float mask   = 1.0 - smoothstep(-pr, pr, shape);

  // rainbow tint by angle from centre, brightness from morph + radial falloff
  vec2  d     = dotCtr - ctr;
  float hue   = (atan(d.y, d.x) + 3.14159265) / 6.2831853;
  vec3  dotCol = vec3(
    0.40 + m * 0.47 + hue * 0.23,
    0.47 + m * 0.16 - hue * 0.16,
    0.78 + m * 0.21 + (1.0 - hue) * 0.16
  );
  float radial  = 0.24 - (dCtr / length(ctr)) * 0.06;
  float opacity = clamp(radial + m * 0.18, 0.0, 1.0);

  col += dotCol * mask * opacity;

  gl_FragColor = vec4(col, 1.0);
}
