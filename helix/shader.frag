// helix (Filament) - a rack of glowing LED tubes wound as double helices that
// run left to right across the frame. Each band stacks a few sinusoidal strands
// phase-offset so they weave over and under; the strand riding in front glows
// brighter than the one passing behind, so the flat sines read as twisting
// cable. A charge pulse streams along every tube and optional ladder rungs tie
// the paired strands like a stretched-out strand of DNA. Hue turns slowly along
// the length. Comments ASCII only (the headless poster compiler is fussy - no
// apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // helix wavelength in CSS px        (default 150)
uniform float u_amp;     // strand swing amplitude in CSS px  (default 26)
uniform float u_line;    // tube core weight in CSS px        (default 3.0)
uniform float u_glow;    // halo / glow strength 0..1         (default 0.7)
uniform float u_strands; // strands woven per band (integer)  (default 2)
uniform float u_flow;    // speed of the charge along tubes   (default 0.6)
uniform float u_rungs;   // ladder cross-tie strength 0..1    (default 0.35)
uniform float u_twist;   // hue turns along the length, 1=base(default 1)
uniform float u_gap;     // extra space between bands, CSS px (default 0)
uniform float u_rotate;  // lean of the whole rack, degrees   (default -45)
uniform float u_blur;    // halo softness 0 crisp .. 1 hazy   (default 0.3)

const float TAU = 6.28318530718;
const float PI  = 3.14159265359;

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

void main(){
  float pr =u_pixelRatio;
  vec2  fc =gl_FragCoord.xy;
  vec2  res=u_resolution;
  float t  =u_time;
  float mn =min(res.x,res.y);
  float refScale=mn/(max(pr,1.0)*400.0);

  // lean the whole rack about screen centre
  vec2  p=fc-res*0.5;
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  p=vec2(ca*p.x+sa*p.y,-sa*p.x+ca*p.y);

  float wl   =max(u_scale,20.0)*refScale*pr;            // wavelength, device px
  float amp  =max(u_amp,2.0)*refScale*pr;               // amplitude, device px
  float lw   =max(u_line,0.5)*refScale*pr;              // tube weight, device px
  float bandH=amp*2.0+lw*6.0+max(u_gap,0.0)*refScale*pr;// row pitch

  // which stacked band this pixel belongs to + local y within it
  float bandIdx=floor(p.y/bandH+0.5);
  float ly     =p.y-bandIdx*bandH;

  float kx   =TAU/wl;                                    // spatial frequency
  float phase=p.x*kx-t*u_flow*0.6+bandIdx*1.7;           // travel + per-band offset
  float strands=max(floor(u_strands+0.5),1.0);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  vec3 col=vec3(0.0);

  // weave the strands. depth = how far forward this strand rides right now;
  // a forward strand is drawn brighter so the crossing reads as over/under.
  for (int s=0;s<4;s++){
    if (float(s)>=strands) break;
    float so   =float(s)/strands*TAU;
    float yc   =amp*sin(phase+so);
    float depth=0.5+0.5*cos(phase+so);                  // 1 front .. 0 back
    float slope=amp*kx*cos(phase+so);
    float dist =abs(ly-yc)/sqrt(1.0+slope*slope);       // perpendicular-ish dist
    float core =smoothstep(lw,lw*0.3,dist);
    // halo spread is decoupled from core weight: widen the tube with u_line while
    // u_blur alone decides how soft the surrounding glow reads.
    float spread=mix(0.7,3.5,clamp(u_blur,0.0,1.0));
    float halo =lw/(dist+lw*spread); halo=halo*halo*(0.3+0.7*u_glow);

    float bead =0.5+0.5*sin(phase-t*u_flow*2.0+so);     // charge running the tube
    bead=pow(bead,3.0);

    float hue  =p.x/wl*0.5*u_twist+so*0.05+t*0.02;
    vec3  cc   =wheelCol(hue,c0,c1,c2,c3);
    float lum  =core*(0.8+0.7*bead)+halo*(0.55+0.5*bead);
    lum*=mix(0.32,1.0,depth);                            // back strands recede
    col+=cc*lum;
  }

  // ladder rungs: faint vertical ties between the first two strands, spaced one
  // per half wavelength, only spanning the gap between those two strand centres.
  if (u_rungs>0.001 && strands>=2.0){
    float y0=amp*sin(phase);
    float y1=amp*sin(phase+TAU/strands);
    float ridx=floor(p.x*kx/PI+0.5);
    float rxc =ridx*PI/kx;                               // nearest rung x, device px
    float rdx =abs(p.x-rxc);
    float ylo =min(y0,y1), yhi=max(y0,y1);
    float inY =smoothstep(lw,lw*0.4,ly-ylo)*smoothstep(lw,lw*0.4,yhi-ly);
    float rcore=smoothstep(lw*0.9,lw*0.3,rdx)*inY;
    float rhue =p.x/wl*0.5*u_twist+0.5+t*0.02;
    col+=wheelCol(rhue,c0,c1,c2,c3)*rcore*clamp(u_rungs,0.0,1.0)*(0.4+0.4*u_glow);
  }

  // dim luminous ground so bands sit in a lit field, not pure black
  float vr=length((fc-res*0.5)/res);
  col+=wheelCol(0.55+vr*0.3+t*0.01,c0,c1,c2,c3)*0.12;

  float vign=1.0-smoothstep(0.7,1.35,vr);
  col*=mix(0.85,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
