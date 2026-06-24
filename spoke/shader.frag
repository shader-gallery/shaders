// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// spoke (Filament) - a starburst of glowing tubes radiating from the centre,
// charge shooting outward along each ray while the hue steps spoke to spoke.
// A semi-lit ground fills the wedges between. Comments short/ASCII (the
// headless-gl poster compiler is fussy - no apostrophes, no pow of a negative
// base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // reference scale in CSS px      (default 80)
uniform float u_line;    // tube core weight in CSS px      (default 3.0)
uniform float u_flow;    // speed of the outward charge     (default 0.6)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.7)
uniform float u_spokes;  // number of rays                  (default 24)
uniform float u_colorBlend; // 0 stepped (seam) .. 1 seamless (default 0)
uniform float u_fill;    // density of lit beads on the rays (default 0)
uniform float u_fillSize;// bead size within its cell       (default 0.7)
uniform float u_fade;    // beads twinkle 0..1              (default 0)
uniform float u_seed;    // pattern re-roll for the beads   (default 0)
uniform float u_centerX; // hub x, short-axis units         (default 0)
uniform float u_centerY; // hub y, short-axis units         (default 0)
uniform float u_rotate;  // spin the starburst, degrees     (default 0)
uniform float u_tilt;    // fore/back perspective tilt -1..1 (default 0)
uniform float u_skew;    // left/right lean -1..1           (default 0)

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
  vec2  sctr=res*0.5;                                  // screen centre (vignette/ground)
  float mn=min(res.x,res.y);
  vec2  octr=sctr+vec2(u_centerX,u_centerY)*(0.5*mn);  // movable hub
  float t=u_time;

  float refScale=mn/(max(pr,1.0)*400.0);
  float cell=max(u_scale,8.0)*refScale*pr;

  // place the hub, spin it, then a perspective-ish shear so the flat burst can
  // read as a fan lying back in space (skew leans with height, tilt rocks with
  // width).
  vec2  p=fc-octr;
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa2=sin(rad);
  p=vec2(ca*p.x+sa2*p.y,-sa2*p.x+ca*p.y);
  float nx=p.x/(0.5*mn), ny=p.y/(0.5*mn);
  p.x*=1.0+u_skew*ny;
  p.y*=1.0+u_tilt*nx-u_skew*0.18*ny;
  vec2  uv=p/cell;

  float rr=length(uv);
  float ang=atan(uv.y,uv.x);
  float N=max(u_spokes,3.0);

  float sa=ang/6.2831853*N;
  float sp=abs(fract(sa+0.5)-0.5);
  float d=sp*(6.2831853/N)*rr;          // angular ray -> spatial distance
  float spokeId=floor(sa+0.5);
  float sidFrac=spokeId/N;              // -0.5..0.5, wraps by 1 across -x ray

  float lw=max(u_line,0.5)*refScale*pr/cell;
  float core=smoothstep(lw,lw*0.25,d);
  float halo=lw/(d+lw*1.4);
  halo=halo*halo*(0.4+0.7*u_glow);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  // hue steps spoke to spoke. The plain spokeId step leaves a colour seam on the
  // -x ray, where spokeId wraps from +N/2 to -N/2 and the hue jumps by N*0.12.
  // The seamless target keeps the per-ray steps but advances an integer 3 wheels
  // around the whole burst (sidFrac wraps by 1, so 3*sidFrac wraps by 3). Crossfade
  // the two in colour space so the seam shrinks smoothly to nothing.
  float hr=rr*0.05+t*0.02;
  vec3 colSeam=wheelCol(spokeId*0.12+hr,c0,c1,c2,c3);
  vec3 colCont=wheelCol(sidFrac*3.0+hr,c0,c1,c2,c3);
  vec3 pathCol=mix(colSeam,colCont,u_colorBlend);

  // charge shoots outward along each ray, neighbours staggered. The stagger uses
  // sidFrac*10 (an integer 10 turns around the burst) so the pulse phase is
  // continuous across the -x ray instead of jumping like spokeId*0.4 did.
  float phase=rr - t*u_flow*0.5 + sidFrac*10.0;
  float pulse=0.5+0.5*sin(6.2831853*phase);
  pulse=pow(pulse,3.0);

  float lit=core*(0.85+1.0*pulse)+halo*(0.7+0.6*pulse);
  float fade=smoothstep(0.04,0.5,rr);   // hide the hub where rays converge
  lit*=fade;

  // lit beads riding the rays: each cell is one ray crossed with one radial
  // segment; a fraction light as soft dots centred on the tube. The ray index is
  // wrapped mod N so the -x ray gets one stable id and its beads dont split.
  float beadR=3.5;                                     // beads per unit radius
  float rid=floor(rr*beadR+0.5);
  float sidW=mod(spokeId,N);
  vec2  cid=vec2(sidW,rid);
  vec2  sd=vec2(u_seed*31.7,u_seed*17.3);
  float roff=rr-rid/beadR;                             // radial offset, uv units
  float fitR=0.5/beadR;
  float frad=clamp(u_fillSize,0.0,1.0)*fitR;
  float fmask=step(1.0-u_fill, hash21(cid+sd+vec2(3.7,1.9)));
  float fs=smoothstep(frad,frad-0.03,length(vec2(roff,d)))*fmask;
  float fph=hash21(cid+sd+vec2(5.1,2.9));
  float fd=mix(1.0,0.5+0.5*sin(6.2831853*(t*0.12+fph)),u_fade);
  vec3 fillAdd=pathCol*(fs*fd*fade)*(0.40+0.45*u_glow);

  float vr=length((fc-sctr)/res);
  vec3 ground=wheelCol(0.55+vr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+fillAdd+pathCol*lit;
  col+=pathCol*core*pulse*0.7*fade;

  float vign=1.0-smoothstep(0.7,1.35,vr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
