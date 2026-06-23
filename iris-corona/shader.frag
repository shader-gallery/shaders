// iris-corona (Rosette) - a breathing iris ringed by a corona of wavering radial
// flame tongues. A soft luminous pupil blooms at the centre; out of it licks a
// crown of thick tapering tongues whose tips waver and flicker on per-tongue
// phases, like a slow solar corona seen edge on. Colour blends cyclically through
// the palette by angle. Distinct from the spoke-thin burst and the hair-thin fila
// siblings - these are fat, soft, living tongues. Comments ASCII only (the
// headless poster compiler is fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_tongues;  // number of flame tongues in the crown (default 28)
uniform float u_reach;    // how far the tongues lick out, css px  (default 150)
uniform float u_waver;    // how much tips waver and flicker 0..1   (default 0.6)
uniform float u_core;     // luminous pupil radius, css px          (default 70)
uniform float u_glow;     // overall glow strength 0..1             (default 0.7)
uniform float u_drift;    // rotation / shimmer speed               (default 0.03)
uniform float u_hue;      // hue turns around the circle 0..3       (default 1.01)
uniform float u_size;     // overall scale, 1=base, fills viewport  (default 1.8)

const float TAU = 6.28318530718;

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}
float hash11(float n){ return fract(sin(n*12.9898)*43758.5453); }

void main(){
  float pr =u_pixelRatio;
  vec2  fc =gl_FragCoord.xy;
  vec2  res=u_resolution;
  float t  =u_time;
  vec2  ctr=res*0.5;

  vec2  d=fc-ctr;
  float ang=atan(d.y,d.x);
  float rad=length(d);
  float sz   =clamp(u_size,0.2,3.0);
  float coreR=max(u_core,12.0)*pr*sz;
  float reach=max(u_reach,30.0)*pr*sz;

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  float spin=t*u_drift*0.15;
  float N=max(floor(u_tongues+0.5),3.0);

  // continuous tongue index around the circle; evaluate the nearest tongue and
  // its two neighbours so a fat tongue stays smooth without dynamic indexing.
  float fa=(ang/TAU+0.5+spin)*N;
  float base=floor(fa);

  float lum=0.0;
  float colAng=ang;
  for (int k=-1;k<=1;k++){
    float idx=base+float(k);
    float center=(idx+0.5)/N;                  // tongue centre in 0..1 angle
    float da=(fa/N)-center;                     // signed angular offset (cycles)
    da=da-floor(da+0.5);                        // wrap to -0.5..0.5 of a cell
    float across=abs(da)*N;                     // 0 at tongue spine, 1 at its edge

    // each tongue has its own length, width and flicker phase
    float h0=hash11(idx*1.7), h1=hash11(idx*3.1+0.5), h2=hash11(idx*5.3+0.2);
    float flick=0.5+0.5*sin(t*(0.6+1.2*h1)+h0*TAU);
    float len=reach*(0.6+0.5*h0)*mix(1.0,flick,clamp(u_waver,0.0,1.0));
    float width=0.35+0.4*h2;                    // tongue half width (in cell units)

    // taper: bright at the root, narrowing to a wavering tip
    float along=clamp((rad-coreR)/max(len,1.0),0.0,1.0);
    float taper=1.0-smoothstep(0.0,1.0,along);
    float wobble=u_waver*0.25*sin(along*6.0+t*(1.0+h1*2.0)+h0*TAU);
    float prof=smoothstep(width*taper+abs(wobble),0.0,across);
    float body=prof*taper*step(rad,coreR+len);
    lum+=body;
    if (k==0) colAng=ang;
  }
  lum*=(0.5+0.8*u_glow);

  // luminous pupil at the centre - kept modest so it does not blow out to white
  float core=exp(-rad/coreR)*0.7 + smoothstep(coreR,coreR*0.2,rad)*0.32;

  float hue=(ang/TAU+0.5)*u_hue+t*0.03;
  vec3  col=wheelCol(hue,c0,c1,c2,c3)*lum;
  col+=wheelCol(0.5+t*0.04,c0,c1,c2,c3)*core*(0.4+0.5*u_glow);

  // faint outer halo so the corona fades into a lit field
  col+=wheelCol(0.62+t*0.01,c0,c1,c2,c3)*0.05*smoothstep(reach*2.2,0.0,rad);

  gl_FragColor=vec4(col,1.0);
}
