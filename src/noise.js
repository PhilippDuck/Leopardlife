// LeopardLife – Gelände-Rauschen: 2D-Simplex-Rauschen (nach Stefan Gustavson / Ashima Arts, MIT) –
// in JavaScript und als GLSL-Text mit denselben Rechenschritten, damit Boden (JS) und Gras-Shader (GPU) dieselbe Höhe ergeben.
// Der Weltsamen verschiebt die Rauschfelder: jede Welt hat ihre eigene Landschaft, ohne Wiederholungen.

const mod289=x=>x-Math.floor(x/289)*289;
const permute=x=>mod289((x*34+1)*x);
const fract=x=>x-Math.floor(x);
const C0=0.211324865405187, C1=0.366025403784439, C2=-0.577350269189626, C3=0.024390243902439;
/** Simplex-Rauschen -1…1 */
function snoise(vx,vy){
  const s=(vx+vy)*C1; let ix=Math.floor(vx+s), iy=Math.floor(vy+s);
  const t=(ix+iy)*C0, x0=vx-ix+t, y0=vy-iy+t;
  const i1x=x0>y0?1:0, i1y=x0>y0?0:1;
  const x1=x0+C0-i1x, y1=y0+C0-i1y, x2=x0+C2, y2=y0+C2;
  ix=mod289(ix); iy=mod289(iy);
  const p0=permute(permute(iy)+ix), p1=permute(permute(iy+i1y)+ix+i1x), p2=permute(permute(iy+1)+ix+1);
  let m0=Math.max(0.5-(x0*x0+y0*y0),0), m1=Math.max(0.5-(x1*x1+y1*y1),0), m2=Math.max(0.5-(x2*x2+y2*y2),0);
  m0*=m0; m0*=m0; m1*=m1; m1*=m1; m2*=m2; m2*=m2;
  const gx0=2*fract(p0*C3)-1, gx1=2*fract(p1*C3)-1, gx2=2*fract(p2*C3)-1;
  const h0=Math.abs(gx0)-0.5, h1=Math.abs(gx1)-0.5, h2=Math.abs(gx2)-0.5;
  const a0=gx0-Math.floor(gx0+0.5), a1=gx1-Math.floor(gx1+0.5), a2=gx2-Math.floor(gx2+0.5);
  m0*=1.79284291400159-0.85373472095314*(a0*a0+h0*h0);
  m1*=1.79284291400159-0.85373472095314*(a1*a1+h1*h1);
  m2*=1.79284291400159-0.85373472095314*(a2*a2+h2*h2);
  return 130*(m0*(a0*x0+h0*y0)+m1*(a1*x1+h1*y1)+m2*(a2*x2+h2*y2));
}
const GLSL_SNOISE=`
vec3 nzPermute(vec3 x){ return mod(((x*34.0)+1.0)*x,289.0); }
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=mod(i,289.0);
  vec3 p=nzPermute(nzPermute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
`;

/** Kleiner Zufallsgenerator aus dem Samen (immer dieselbe Folge für denselben Samen) */
function seeded(seed){ let a=(seed>>>0)||1; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

export { GLSL_SNOISE, seeded, snoise };
