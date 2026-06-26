// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// argyle (Filament) - two families of diagonal glowing tubes crossing into a
// diamond weave, one family riding brighter over the other so the lattice reads
// as woven cord. Charge travels each diagonal; hue shifts diamond to diamond
// over a semi-lit ground. Comments short/ASCII (the headless-gl poster compiler
// is fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // diamond size in CSS px         (default 42)
uniform float u_line;    // tube core weight in CSS px      (default 2.4)
uniform float u_flow;    // speed of the travelling charge  (default 0.2)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.45)
uniform float u_rotate;  // weave orientation, degrees      (default 0)
uniform float u_seed;    // reshuffles the per-diamond hues (default 0)
uniform float u_blend;   // 0 = hard per-diamond colours, 1 = blended (default 1)
uniform float u_jitter;  // per-cord position scatter 0..1  (default 0)
uniform float u_depth;   // per-cord depth spread 0..1      (default 0)
uniform float u_fill;    // density of filled diamonds 0..1 (default 0)
uniform float u_fillSize; // filled-diamond size within cell (default 0.8)
uniform float u_fade;    // squares breathe in/out 0..1     (default 0)
uniform float u_offset;  // squares slide off-centre 0..1   (default 0)

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
  // rotate the weave about screen centre (u_rotate in degrees) - a diagonal
  // diamond weave at 0, an upright basket weave near 45
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  vec2  pp=fc-ctr;
  vec2  uv=vec2(ca*pp.x+sa*pp.y, -sa*pp.x+ca*pp.y)/cell;

  // two diagonal coordinate families
  float du=uv.x+uv.y, dv=uv.x-uv.y;
  float lw=max(u_line,0.5)*refScale*pr/cell;
  vec2 K1=u_seed*vec2(1.7,2.3), K2=u_seed*vec2(2.3,1.1);

  // nearest cord in each family: each cord may be jittered off its nominal line
  // and carries its own depth, so scan the three nearest in du and dv
  float duId=0.0; float d1=1e9;
  for (int i=-1;i<=1;i++){
    float n=floor(du)+float(i);
    float lu=n+0.5+(hash21(vec2(n,3.0)+K1)-0.5)*u_jitter*0.9;
    float dd=abs(du-lu);
    if (dd<d1){ d1=dd; duId=n; }
  }
  float dvId=0.0; float d2=1e9;
  for (int i=-1;i<=1;i++){
    float m=floor(dv)+float(i);
    float lv=m+0.5+(hash21(vec2(7.0,m)+K2)-0.5)*u_jitter*0.9;
    float dd=abs(dv-lv);
    if (dd<d2){ d2=dd; dvId=m; }
  }

  float depth1=1.0-hash21(vec2(duId,11.0)+K1)*u_depth*0.7;
  float depth2=1.0-hash21(vec2(13.0,dvId)+K2)*u_depth*0.7;
  float lw1=lw*mix(0.6,1.0,depth1), lw2=lw*mix(0.6,1.0,depth2);
  float pd1=d1*0.70710678, pd2=d2*0.70710678;   // perpendicular distance, cell units
  float core1=smoothstep(lw1,lw1*0.25,pd1), core2=smoothstep(lw2,lw2*0.25,pd2);
  float halo1=lw1/(pd1+lw1*1.4); halo1=halo1*halo1*(0.4+0.7*u_glow);
  float halo2=lw2/(pd2+lw2*1.4); halo2=halo2*halo2*(0.4+0.7*u_glow);
  float w1=(pd1<pd2)?1.0:0.78, w2=(pd2<pd1)?1.0:0.78;   // over/under shading

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  // hue: u_blend crossfades from the hard per-diamond step (colour switches at
  // every diamond a cord crosses) to a continuous bilinear field across (du,dv)
  vec2 ip=floor(vec2(du,dv)), fp=fract(vec2(du,dv));
  vec2 sp=fp*fp*(3.0-2.0*fp);
  float g00=hash21(ip+K1), g10=hash21(ip+vec2(1.0,0.0)+K1);
  float g01=hash21(ip+vec2(0.0,1.0)+K1), g11=hash21(ip+vec2(1.0,1.0)+K1);
  float gcell=mix(mix(g00,g10,sp.x),mix(g01,g11,sp.x),sp.y);
  float hueStep=(ip.x+ip.y)*0.12 + g00*0.10;
  float hueSmooth=(du+dv)*0.12 + gcell*0.10;
  float hue=mix(hueStep,hueSmooth,u_blend)+t*0.02;
  vec3 pathCol=wheelCol(hue,c0,c1,c2,c3);

  // charge travels each diagonal (du family +, dv family -)
  float pulse1=pow(0.5+0.5*sin(6.2831853*(du*0.5 - t*u_flow*0.5)),3.0);
  float pulse2=pow(0.5+0.5*sin(6.2831853*(-dv*0.5 - t*u_flow*0.5)),3.0);
  float lit1=(core1*(0.85+1.0*pulse1)+halo1*(0.7+0.6*pulse1))*depth1*w1;
  float lit2=(core2*(0.85+1.0*pulse2)+halo2*(0.7+0.6*pulse2))*depth2*w2;

  // random filled diamonds: each cell may fill as a solid glowing block, classic
  // argyle style. u_offset slides the block from its cell centre (0) toward the
  // cord crossing at its corner (1, lined up directly under where the lines
  // cross). Because an offset block sits over a CORNER it spans four cells, so we
  // scan the 3x3 neighbourhood and add each filled block whole - otherwise the
  // block gets clipped to the cell it nominally belongs to.
  float r=0.46*clamp(u_fillSize,0.0,1.0);
  vec2 base=floor(vec2(du,dv)+0.5);
  vec3 fillCol=vec3(0.0);
  for (int gi=-1;gi<=1;gi++){
    for (int gj=-1;gj<=1;gj++){
      vec2 cId=base+vec2(float(gi),float(gj));
      float fl=step(1.0-u_fill, hash21(cId+u_seed*vec2(3.7,1.9)));
      vec2 anchor=cId+vec2(0.5,0.5)*u_offset;
      float e=max(abs(du-anchor.x),abs(dv-anchor.y));
      float s=smoothstep(r,r-0.07,e)*fl;
      float cd=1.0-hash21(cId+u_seed*vec2(1.3,2.7))*u_depth*0.7;
      float fph=hash21(cId+u_seed*vec2(5.1,2.9));
      float fd=mix(1.0,0.5+0.5*sin(6.2831853*(t*0.12+fph)),u_fade);
      float chue=dot(cId,vec2(0.12,0.12))+hash21(cId+K1)*0.12+t*0.02;
      fillCol+=wheelCol(chue,c0,c1,c2,c3)*(s*cd*fd);
    }
  }
  vec3 fillAdd=fillCol*(0.30+0.45*u_glow);

  float rr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+rr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+fillAdd;
  col+=pathCol*max(lit1,lit2);
  col+=pathCol*max(core1*w1,core2*w2)*max(pulse1,pulse2)*0.7;

  float vign=1.0-smoothstep(0.7,1.35,rr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
