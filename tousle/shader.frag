// tousle (Strand) - a full-frame field of fine threads combed roughly level but
// interweaving: each thread wanders by close to a full row-spacing so neighbours
// cross and tousle into a dense luminous hank that fills the frame edge to edge.
// Light runs along the threads and the whole field drifts. Distinct from the
// precise non-crossing oscilloscope traces - here the strands weave over one
// another. Open strands, no closed cells. Comments ASCII only (the headless
// poster compiler is fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_threads; // rows of thread across the frame        (default 34)
uniform float u_amp;     // interweave amount, in row spacings      (default 0.9)
uniform float u_line;    // thread weight in CSS px                 (default 1.6)
uniform float u_flow;    // drift + light-run speed                 (default 0.5)
uniform float u_curl;    // fine-curl complexity 0..1               (default 0.5)
uniform float u_glow;    // glow strength 0..1                      (default 0.55)
uniform float u_hue;     // hue spread across the frame 0..2        (default 1)
uniform float u_blur;    // halo softness 0 crisp .. 1 hazy         (default 0.3)
uniform float u_lean;    // diagonal lean of the combing, degrees   (default -12)

const float TAU = 6.28318530718;

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

  // lean: shear x with height so the whole comb runs slightly diagonal
  float ln=tan(clamp(u_lean,-40.0,40.0)*0.0174532925);
  float x =fc.x+ln*(fc.y-res.y*0.5);
  float y =fc.y;

  float N  =max(floor(u_threads+0.5),4.0);
  float sp =res.y/N;
  float amp=clamp(u_amp,0.0,2.0)*sp;
  float f1 =TAU/(320.0*refScale*pr);
  float f2 =TAU/(150.0*refScale*pr);
  float f3 =TAU/( 70.0*refScale*pr);
  float lw =max(u_line,0.4)*refScale*pr;
  float blur=mix(0.7,3.5,clamp(u_blur,0.0,1.0));

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  float baseK=floor(y/sp-0.5);
  vec3  col=vec3(0.0);

  // threads can wander ~a full spacing, so a pixel may belong to a thread a few
  // rows away - evaluate a 7-row window around the local baseline.
  for (int k=-3;k<=3;k++){
    float kk=baseK+float(k);
    float ph=kk*0.9;
    float disp=amp*( sin(x*f1+ph+t*u_flow*0.6)
                    +0.5 *sin(x*f2-ph*1.3+t*u_flow*0.4)
                    +0.35*u_curl*sin(x*f3+ph*0.7+t*u_flow*0.8) );
    float yk=(kk+0.5)*sp+disp;
    float d =abs(y-yk);
    float core=smoothstep(lw,lw*0.3,d);
    float halo=lw/(d+lw*blur); halo=halo*halo*(0.3+0.7*u_glow);

    float bead=0.5+0.5*sin(x*f2*0.6 - t*u_flow*2.0 + kk*1.3);
    bead=pow(bead,3.0);

    float hue=u_hue*((kk/N)*0.6 + (x/res.x)*0.2) + t*0.02;
    vec3  cc =wheelCol(hue,c0,c1,c2,c3);
    col+=cc*(core*(0.8+0.6*bead)+halo*(0.5+0.4*bead));
  }

  // faint lit ground so gaps between threads are a lit field, not pure black
  float vr=length((fc-res*0.5)/res);
  col+=wheelCol(0.6+vr*0.3+t*0.01,c0,c1,c2,c3)*0.05;
  col*=mix(1.0,0.82,smoothstep(0.7,1.3,vr));

  gl_FragColor=vec4(col,1.0);
}
