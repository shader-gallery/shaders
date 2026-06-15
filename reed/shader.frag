// reed (Filament) - a palisade of vertical glowing tubes, like an upright LED
// strip or an equalizer at rest. Each reed holds its own palette hue and a
// bright pulse of charge rises continuously up its length over a semi-lit
// ground. Comments short/ASCII on purpose (the headless-gl poster compiler is
// fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // reed spacing in CSS px        (default 34)
uniform float u_line;    // tube core weight in CSS px     (default 4.8)
uniform float u_flow;    // speed of the rising charge     (default 0.15)
uniform float u_glow;    // halo / glow strength 0..1      (default 0.16)
uniform float u_rotate;  // orientation of the palisade, degrees (default 0)
uniform float u_seed;    // reshuffles the per-reed hues   (default 0)
uniform float u_angle;   // per-reed lean randomization 0..1 (default 0)
uniform float u_depth;   // per-reed depth spread 0..1       (default 0)

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
  // rotate the whole palisade about screen centre (u_rotate in degrees) so the
  // reeds can stand upright, lie flat, or lean at any angle
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  vec2  pp=fc-ctr;
  vec2  uv=vec2(ca*pp.x+sa*pp.y, -sa*pp.x+ca*pp.y)/cell;

  float colId=floor(uv.x);
  float lwBase=max(u_line,0.5)*refScale*pr/cell;

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  // Each reed gets its own lean (u_angle) and depth (u_depth). A leaning reed
  // drifts across columns with height, so sample a span of neighbours and add
  // their glow - near reeds (depth~1) read brighter and fatter, far ones dimmer
  // and thinner, giving a scattered field with depth. u_angle=u_depth=0 returns
  // the clean upright palisade.
  vec3 reeds=vec3(0.0);
  for (int k=-3;k<=3;k++){
    float j=colId+float(k);
    float ha=hash21(vec2(j,11.0)+u_seed*vec2(1.7,2.3));   // lean
    float hd=hash21(vec2(j,23.0)+u_seed*vec2(2.3,1.1));   // depth
    float hh=hash21(vec2(j, 7.0)+u_seed*vec2(1.7,2.3));   // hue (matches old)
    float aj=(ha-0.5)*u_angle*0.45;                       // lean in radians
    float depth=1.0-hd*u_depth*0.7;                       // 1 near .. lower far
    float cx=j+0.5;
    vec2 dir=vec2(sin(aj),cos(aj));
    float perp =abs((uv.x-cx)*dir.y - uv.y*dir.x);        // distance to the reed
    float along=(uv.x-cx)*dir.x + uv.y*dir.y;             // position up the reed
    float lwj=lwBase*mix(0.6,1.0,depth);                  // far reeds thinner
    float corej=smoothstep(lwj,lwj*0.25,perp);
    float haloj=lwj/(perp+lwj*1.4); haloj=haloj*haloj*(0.4+0.7*u_glow);
    float hue=j*0.13+hh*0.1+t*0.02;
    vec3 pc=wheelCol(hue,c0,c1,c2,c3);
    float phase=along*0.5 - t*u_flow*0.5 + j*0.37;
    float pls=0.5+0.5*sin(6.2831853*phase); pls=pow(pls,3.0);
    float litj=(corej*(0.85+1.0*pls)+haloj*(0.7+0.6*pls))*depth;
    reeds+=pc*litj;
    reeds+=pc*corej*pls*0.7*depth;
  }

  float rr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+rr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+reeds;

  float vign=1.0-smoothstep(0.7,1.35,rr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
