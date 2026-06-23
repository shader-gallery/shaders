// portiere (Veil) - two sheer curtain panels parted down the middle, each
// gathered into vertical folds that sway and fan toward the outer edges while a
// soft seam of light spills through the gap where they meet. The folds are
// translucent ridges of glow over near-black; the parting breathes slowly open
// and shut. Comments ASCII only (the headless poster compiler is fussy - no
// apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_parting; // how far the curtains stand open 0..1   (default 0.22)
uniform float u_folds;   // vertical gathers per panel               (default 9)
uniform float u_sway;    // how much the folds wave and breathe 0..1 (default 0.5)
uniform float u_drape;   // vertical hang / scallop of the cloth 0..1 (default 0.5)
uniform float u_glow;    // translucent glow strength 0..1            (default 0.6)
uniform float u_speed;   // sway / breathing speed                    (default 0.26)
uniform float u_hue;     // hue spread across the cloth 0..2          (default 1.44)
uniform float u_sharp;   // fold crispness 0 soft .. 1 razor          (default 0.45)

const float PI = 3.14159265359;

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

void main(){
  vec2  fc =gl_FragCoord.xy;
  vec2  res=u_resolution;
  float t  =u_time;

  float nx=(fc.x-0.5*res.x)/(0.5*res.x);   // -1..1 across width
  float ny=(fc.y-0.5*res.y)/(0.5*res.y);   // -1..1 up
  float side=nx<0.0?-1.0:1.0;
  float ax =abs(nx);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  // the parting breathes slowly open and shut
  float breathe=0.85+0.15*sin(t*0.2*max(u_speed,0.0));
  float gap=(0.03+0.5*clamp(u_parting,0.0,1.0))*breathe;
  // scalloped inner edge so the hem of each panel is not a straight cut
  gap*=1.0+0.10*u_drape*sin(ny*4.0+t*u_speed*0.4);

  float into=ax-gap;                         // >0 inside the cloth

  // vertical gathers: a folded coordinate that fans out away from the gap. the
  // folds wobble in y so the cloth hangs and sways instead of ruling straight.
  float folds=max(u_folds,1.0);
  float wob=u_sway*0.18*sin(ny*3.0+t*u_speed*0.6+side*0.7);
  float phase=folds*(into+wob)*PI;
  float ridge=0.5+0.5*sin(phase);
  ridge=pow(ridge,mix(1.6,6.0,clamp(u_sharp,0.0,1.0))); // crisp the fold crests

  float cloth=smoothstep(-0.005,0.04,into);  // cloth begins at the gap edge
  float outer=1.0-smoothstep(0.72,1.08,ax);  // panels dissolve toward the edges
  float drape=0.55+0.45*sin(ny*1.4+0.3+0.2*sin(t*0.15)); // soft vertical hang
  drape=mix(1.0,drape,clamp(u_drape,0.0,1.0));

  float hue=0.12*into*u_hue+0.18*ny+t*0.02+side*0.05;
  vec3  clothCol=wheelCol(hue,c0,c1,c2,c3);
  float lum=ridge*cloth*outer*drape*(0.45+0.7*u_glow);

  // the two panels simply meet down the middle - no light bar in the gap
  vec3 col=clothCol*lum;

  // faint lit ground so the black is a lit room, not a void
  float vr=length(vec2(nx,ny))*0.7;
  col+=wheelCol(0.6+vr*0.3+t*0.01,c0,c1,c2,c3)*0.07;

  float vign=1.0-smoothstep(0.75,1.4,length(vec2(nx,ny)));
  col*=mix(0.82,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
