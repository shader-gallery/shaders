// skein (Filament) - rows of horizontal glowing tubes that undulate across the
// frame like a hank of ribbon cable, each row on its own sine and its own hue.
// Charge streams along the cables over a semi-lit ground. Comments short/ASCII
// (the headless-gl poster compiler is fussy - no apostrophes, no pow of a
// negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // row spacing in CSS px          (default 56)
uniform float u_line;    // tube core weight in CSS px      (default 3.0)
uniform float u_flow;    // speed of the streaming charge   (default 0.6)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.7)
uniform float u_wave;    // undulation amplitude 0..0.5     (default 0.3)
uniform float u_waveSpeed; // undulation travel speed        (default 0.7)
uniform float u_rotate;  // spin the ribbon, degrees         (default 0)
uniform float u_scatter; // per-row vertical jitter 0..1     (default 0)
uniform float u_depth;   // per-row near/far spread 0..1     (default 0)
uniform float u_seed;    // pattern re-roll                  (default 0)

float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

void main(){
  float pr=u_pixelRatio;
  vec2  fc=gl_FragCoord.xy;
  vec2  res=u_resolution;
  vec2  ctr=res*0.5;
  float t=u_time;

  float refScale=min(res.x,res.y)/(max(pr,1.0)*400.0);
  float cell=max(u_scale,8.0)*refScale*pr;
  // optional rotation of the whole ribbon about screen centre
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  vec2  pp=fc-ctr;
  vec2  uv=vec2(ca*pp.x+sa*pp.y,-sa*pp.x+ca*pp.y)/cell;
  vec2  sd=vec2(u_seed*31.7,u_seed*17.3);

  // nearest of three candidate rows (own row and its two neighbours); each row is
  // jittered vertically by Scatter and undulates on its own phase
  float best=1e3, bestId=0.0;
  for (int k=-1;k<=1;k++){
    float yId=floor(uv.y)+float(k);
    float jit=(hash21(vec2(yId,5.0)+sd)-0.5)*u_scatter*0.7;
    float wave=u_wave*sin(uv.x*1.2 + yId*1.7 + u_seed*1.37 + t*u_waveSpeed);
    float cy=yId+0.5+jit+wave;
    float dd=abs(uv.y-cy);
    if (dd<best){ best=dd; bestId=yId; }
  }
  float d=best;

  // each row carries a Depth: far rows read dimmer and thinner
  float depth=1.0-hash21(vec2(bestId,11.0)+sd)*u_depth*0.7;
  float lw=max(u_line,0.5)*refScale*pr/cell*mix(0.6,1.0,depth);
  float core=smoothstep(lw,lw*0.25,d);
  float halo=lw/(d+lw*1.4);
  halo=halo*halo*(0.4+0.7*u_glow);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  float hue=bestId*0.14+hash21(vec2(bestId,3.0)+sd)*0.1+t*0.02;
  vec3 pathCol=wheelCol(hue,c0,c1,c2,c3);

  // charge streams along the cable, alternate rows running opposite ways
  float dirn=mod(bestId,2.0)<0.5?1.0:-1.0;
  float phase=uv.x*0.5*dirn - t*u_flow*0.5 + bestId*0.5;
  float pulse=0.5+0.5*sin(6.2831853*phase);
  pulse=pow(pulse,3.0);

  float lit=(core*(0.85+1.0*pulse)+halo*(0.7+0.6*pulse))*depth;

  float rr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+rr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+pathCol*lit;
  col+=pathCol*core*pulse*0.7;

  float vign=1.0-smoothstep(0.7,1.35,rr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
