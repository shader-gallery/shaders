precision highp float;

// casement — Umbra family. A casement window's light thrown across an interior
// wall: one large bright trapezoid divided by the dark cross of mullion bars into
// four panes, the whole figure sheared by projection from a light moving outside.
// Pane interiors blend c0->c2 over a barely-above-black FBM curtain; the mullion
// shadows' penumbra fringes carry c1; a sparse rim of c3 traces the leading edge
// where the light lands first. The penumbra math lives in the cross: as the
// source's incidence flattens, the mullion shadows broaden and their penumbrae
// melt, then sharpen as it passes head-on. The whole show is read in negative.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_traverseSpeed;  // speed of the outside light's arc / trapezoid glide (default 0.15)
uniform float u_shearRange;     // how steeply the projected window leans + stretches at extremes (default 0.8)
uniform float u_mullion;        // css-px width of the dark mullion bars (default 12)
uniform float u_penumbra;       // edge blur at the flattest incidence of the traverse (default 0.9)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black wall ~#09090B
const float TWO_PI   = 6.2831853;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(17.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr = max(u_pixelRatio, 1e-3);
  vec2  q  = gl_FragCoord.xy / pr;   // css-px coordinates
  vec2  R  = u_resolution / pr;      // css-px frame size
  float minR = max(min(R.x, R.y), 1.0);

  // ---- the unseen light eases along one continuous arc ----
  // A single phase drives the whole cycle; the grazing-sliver moment hides the
  // wrap. We never reset hard: every term is a phase-continuous sine/cosine.
  float ph    = u_time * u_traverseSpeed;        // arc phase
  float swing = sin(ph);                          // -1..1 lateral position of light
  float arc   = cos(ph);                          // companion -> incidence proxy

  // incidence: 1 = head-on (light square to the wall, sharp short shadows),
  // 0 = grazing (light flat, shadows long + soft). Flattest near |swing|=1.
  float incid = 0.5 + 0.5 * arc;                  // 0..1, head-on at arc=+1

  // ---- build the projected window frame in css space ----
  // Centre of the lit figure glides horizontally with the light, leaning toward
  // a corner at the extremes. Vertical centre dips slightly as it elongates.
  vec2  ctr   = vec2(0.5 * R.x + 0.30 * R.x * swing,
                     0.46 * R.y + 0.06 * R.y * arc);

  // base half-size of the trapezoid (a comfortable window on the wall)
  vec2  half0 = vec2(0.26, 0.30) * minR;

  // projective shear + stretch: the window leans and elongates toward a corner
  // as the source flattens. shr is the horizontal lean (px per px of height),
  // and the figure stretches along its glide direction while thinning across.
  float shr     = u_shearRange * swing;                       // lean amount
  float stretch = 1.0 + u_shearRange * 0.55 * abs(swing);     // elongate at extremes
  float thin    = 1.0 - 0.32 * abs(swing);                    // grazing sliver thins it

  // map the fragment into the window's local frame (undo lean + stretch/thin)
  vec2  d   = q - ctr;
  d.x      -= shr * d.y;                 // de-shear: vertical lines lean by shr
  d.x      /= max(stretch, 0.2);         // de-stretch along glide axis
  vec2  hw  = vec2(half0.x, half0.y * max(thin, 0.18));

  // ---- trapezoid membership: perspective taper makes it a true trapezoid ----
  // The top edge is narrower than the bottom (or vice versa) by the lean sign,
  // so the figure reads as a window seen in projection, not a plain rectangle.
  float vY      = clamp(d.y / max(hw.y, 1.0), -1.0, 1.0);     // -1 bottom .. +1 top
  float taper   = 1.0 + 0.28 * shr * vY;                      // width scale by row
  float halfX   = hw.x * clamp(taper, 0.25, 2.0);

  // soft edge falloff into the dark wall (anti-aliased trapezoid mask)
  float edgeSoft = (3.0 + 8.0 * (1.0 - incid));               // edges soften when flat
  float mx = 1.0 - smoothstep(halfX - edgeSoft, halfX + edgeSoft, abs(d.x));
  float my = 1.0 - smoothstep(hw.y - edgeSoft, hw.y + edgeSoft, abs(d.y));
  float pane = mx * my;                                       // 1 inside, 0 outside

  // normalised window coords for pane gradient + curtain (0..1 across, 0..1 up)
  vec2  uvw = vec2(0.5 + 0.5 * d.x / max(halfX, 1.0),
                   0.5 + 0.5 * d.y / max(hw.y, 1.0));

  // ---- mullion cross: two dark bars dividing the figure into four panes ----
  // Penumbra width is set by the incidence (implied occluder-to-source flatness):
  // razor near head-on, melting wide when the light grazes. Mullion bar half-width
  // scales with the figure (so a thinned sliver keeps proportionate bars).
  float mull   = max(u_mullion, 1.0) * (0.6 + 0.4 * stretch);
  // penumbra: grows as incidence flattens; u_penumbra scales the flat-incidence max
  float pen    = mull * (0.25 + u_penumbra * (0.4 + 2.6 * (1.0 - incid)));
  float penY   = pen * (1.0 + 0.5 * (1.0 - thin));            // horizontal bar a touch softer

  // distance from the cross centre lines, in the window's local (de-sheared) frame
  float dvx = abs(d.x);                  // distance to vertical mullion (centre)
  float dvy = abs(d.y);                  // distance to horizontal mullion (centre)
  // 1.0 deep in the mullion shadow -> 0.0 out on a lit pane
  float barV = 1.0 - smoothstep(mull - pen,  mull + pen,  dvx);
  float barH = 1.0 - smoothstep(mull - penY, mull + penY, dvy);
  float cross = max(barV, barH);                              // the dark cross
  cross *= pane;                                              // only within the figure

  // ---- pane interior: c0 -> c2 gradient over a faint FBM curtain ----
  // gradient runs diagonally across the window so the four panes read distinctly
  float grad   = clamp(0.5 + 0.42 * (uvw.x - 0.5) + 0.32 * (uvw.y - 0.5), 0.0, 1.0);
  vec3  paneCol = mix(c0, c2, grad);

  // barely-above-black curtain texture inside the panes (sheer fabric weave),
  // drifting very slowly so it breathes without reading as scrolling noise
  float curt = fbm(uvw * vec2(7.0, 11.0) + vec2(0.0, u_time * 0.04));
  float curtain = 0.78 + 0.30 * curt;                         // gentle multiplier

  // overall lit-figure brightness: brighter head-on, dimmer + spread when grazing
  float litLevel = 0.42 + 0.40 * incid;

  vec3 col = BG;

  // lit panes (figure minus the mullion cross), curtained
  float litPane = pane * (1.0 - cross);
  col += paneCol * litPane * litLevel * curtain;

  // ---- c1 penumbra fringe along the mullion shadow edges ----
  // peaks in the soft transition band of each bar; widens as the penumbra melts
  float fringeV = barV * (1.0 - barV) * 4.0;
  float fringeH = barH * (1.0 - barH) * 4.0;
  float fringe  = max(fringeV, fringeH) * pane;
  col += c1 * fringe * (0.22 + 0.55 * (1.0 - incid)) * (0.5 + 0.5 * litLevel);

  // faint c1 ambient bounce filling the deepest cross so it isn't dead-flat black
  col += c1 * cross * 0.05 * litLevel;

  // ---- c3 leading-edge rim: where the light lands first ----
  // The leading edge is the trapezoid side toward which the light is moving
  // (sign of swing). Trace a thin bright rim just inside that edge.
  float lead   = swing >= 0.0 ? 1.0 : -1.0;
  float edgeX  = halfX - abs(d.x);                            // distance inside from L/R edge
  float onLead = step(0.0, lead * d.x);                       // 1 on the leading side
  float rimW   = 2.5 + 3.0 * incid;                           // rim a touch tighter head-on
  float rim    = exp(-edgeX * edgeX / (rimW * rimW)) * onLead * pane;
  // also a faint rim along the top edge (light rakes down the wall)
  float edgeT  = hw.y - abs(d.y);
  float rimT   = exp(-edgeT * edgeT / (rimW * rimW)) * step(0.0, d.y) * pane;
  col += c3 * (rim + 0.6 * rimT) * (0.5 + 0.7 * incid);

  // faintest ambient bounce on the dark wall outside the figure (never pure black)
  float wallGlow = exp(-length(q - ctr) / (0.9 * minR)) * (1.0 - pane);
  col += c1 * wallGlow * 0.018;

  // gentle vignette to keep the framing composed and the wall edges dark
  vec2 uvn = gl_FragCoord.xy / u_resolution - 0.5;
  col *= 1.0 - 0.40 * dot(uvn, uvn) * 2.0;

  gl_FragColor = vec4(col, 1.0);
}
