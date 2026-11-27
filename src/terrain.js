// LeoLife – Gelände: Höhenformel und Wasserlöcher, Kacheln mit Sichtbarkeitsprüfung, Boden, fernes Umland, Wasser und Hindernisse (Kollision).
import { camera, scene } from './engine.js';
import { REG, WORLD_SEED } from './save.js';
import { GLSL_SNOISE, seeded, snoise } from './noise.js';
import { G } from './state.js';
import { rnd } from './util.js';

// Radius der begehbaren Welt in Metern
const WORLD=235;
/* Gelände: Hügel aus Simplex-Rauschen (drei Lagen, verschoben durch den Weltsamen) + flache Wasserlöcher.
   Dieselbe Formel steht als GLSL im Gras-Shader. Um den Bau herum wird das Gelände sanft eingeebnet. */
const _rs=seeded(WORLD_SEED), NO=[0,1,2].map(()=>[(_rs()-0.5)*400,(_rs()-0.5)*400]);
const Hn=(x,z)=>6.2*snoise(x*0.0062+NO[0][0],z*0.0062+NO[0][1])+2.0*snoise(x*0.021+NO[1][0],z*0.021+NO[1][1])+0.6*snoise(x*0.065+NO[2][0],z*0.065+NO[2][1]);
const DEN_H=Hn(7,5);
function H0(x,z){ const h=Hn(x,z), d=Math.hypot(x-7,z-5); if(d>=22) return h; let w=Math.min(1,(22-d)/12); w=w*w*(3-2*w); return h+(DEN_H-h)*w*0.85; }
// Feuchte Landschaften kehren außerhalb des Startgebiets in großen zusammenhängenden Flächen wieder.
function moisture(x,z){
  return Math.max(0,Math.min(1,0.5+1.3*snoise(x/420+NO[0][0],z/420+NO[0][1])));
}
/** Feuchte Senken mit Schilf: fest aus Weltsamen und Position abgeleitet, weich begrenzt statt harter Biome-Kante. */
function swampFactor(x,z){
  const wet=moisture(x,z), detail=0.5+0.5*snoise(x/95+NO[1][0],z/95+NO[1][1]);
  const smooth=(a,b,v)=>{ const t=Math.max(0,Math.min(1,(v-a)/(b-a))); return t*t*(3-2*t); };
  const regional=REG.n==='Sumpf'?0.5:0;
  return Math.max(regional,smooth(0.72,0.9,wet)*smooth(0.18,0.55,detail));
}
function dryness(x,z){
  const distance=Math.hypot(x,z);
  const original=Math.min(1,Math.max(0,(distance-60)/130));
  const blend=Math.min(1,Math.max(0,(distance-WORLD)/160));
  return original*(1-blend)+(1-moisture(x,z))*blend;
}
/* Flüsse: schlängeln sich von West nach Ost durch Startgebiet und weite Welt, einer alle RIV_GAP Meter (in z).
   Jeder Abschnitt (RIV_SEG Meter) beginnt an einer Quelle, fällt in Fließrichtung stetig und mündet in einen großen See
   ohne Abfluss; dahinter steigt das Land bis zur nächsten Quelle wieder an (dort ist kein Fluss). Das Gefälle ist ungleich:
   An den Furten (Stromschnellen) ist es steil und der Fluss flach, in den Gumpen dazwischen fast eben, breit und tief.
   Um Fluss und See liegt eine flache Aue, die sanft in die Hügel übergeht. Dieselben Formeln stehen als GLSL im Gras-Shader (GLSL_RIVER). */
const RIV_Z0=REG.riverZ??92, RIV_GAP=1100, RIV_FORD=210, RIV_W=5.5, RIV_BANK=2.6;
/** Abschnitt Quelle bis nächste Quelle; Quelle bis Seemitte; schmaler Oberlauf; Breite der Aue neben dem Wasser; so weit hinter der Quelle ist die Aue voll da */
const RIV_SEG=2000, RIV_LAKE=1700, RIV_HEAD=180, RIV_VALLEY=130, RIV_VHEAD=260;
/** Stromschnellen: an den Furten fällt der Fluss (1+RIV_RAP)-mal so steil wie im Mittel, in den Gumpen (1−RIV_RAP)-mal */
const RIV_RAP=0.85;
/** Tiefe der Seemitte unter der Uferkante */
const LAKE_D=3.4;
/** Mindestabstand eines Tümpels der weiten Welt zum Rand von Fluss oder See */
const RIV_POND_GAP=24*1.5+42+6;
const TAU=6.283185307;
const rfract=v=>v-Math.floor(v);
const smooth01=v=>v<=0?0:v>=1?1:v*v*(3-2*v);
/** Quelle des Abschnitts m von Fluss n liegt bei x = m·RIV_SEG + rivOff(n) */
const rivOff=n=>RIV_SEG*rfract(0.37+n*0.618034);
/** Flussmitte z bei x; amp wächst zum See hin (stärkere Mäander im flachen Unterlauf) */
const rivZ=(x,n,amp)=>RIV_Z0+n*RIV_GAP+amp*(13*Math.sin(x/71+n*1.7)+6*Math.sin(x/29+n*0.9+2));
/** Stammfunktion des Gefälles: Ableitung 1+RIV_RAP·cos(Furtphase) > 0, also fällt der Pegel nur */
const rivG=(x,n)=>x+RIV_RAP*RIV_FORD/TAU*Math.sin(x*TAU/RIV_FORD+n*2.3);
/** Seeradius des Abschnitts (ohne große Faktoren im sin, damit GLSL genau dasselbe rechnet) */
const lakeR=(n,m)=>62+22*(0.5+0.5*Math.sin(n*2.1+m*1.37));
/** Daten eines Abschnitts: Quelle (xs, zs, Pegel Ls), See (xl, zl, R, Pegel Ll), ab xe steht der Fluss auf Seehöhe. Fest je (n,m). */
const segCache=new Map();
function rivSeg(n,m){
  const key=n*65536+m; let s=segCache.get(key); if(s) return s;
  const xs=m*RIV_SEG+rivOff(n), xl=xs+RIV_LAKE, zs=rivZ(xs,n,1), zl=rivZ(xl,n,1.7), R=lakeR(n,m);
  const Ls=H0(xs,zs)-0.3, Ll=Math.min(6.2*snoise(xl*0.0062+NO[0][0],zl*0.0062+NO[0][1])-2.5,Ls-3.5), xe=xl-0.8*R;
  s={n,m,xs,zs,Ls,xl,zl,R,Ll,xe,g0:rivG(xs,n),gt:rivG(xe,n)-rivG(xs,n),pond:{x:xl,z:zl,r:R,L:Ll,murky:false,lake:true,n,m}};
  segCache.set(key,s); return s;
}
/** Nächster Fluss bei x,z (geteiltes Objekt, sofort auslesen): n Nummer, m Abschnitt, u Abstand zur Quelle (in x), zc Mitte bei x,
    s Steigung der Mitte, k Streckung, d seitlicher Abstand zur Mitte (hinter der Seemitte: Abstand zur Seemitte), cd wie d, aber nur
    wo Flussbett ist (sonst 1e9), ford/pool 0…1 (Mitte einer Furt/Gumpe), w halbe Breite, D Tiefe, L Pegel (Uferkante), See: lx, lz,
    lr Radius, ll Pegel, ld Abstand zur Mitte; e Abstand zum Rand von Fluss oder See; Aue: vw Gewicht, vt Zielhöhe; seg Abschnittsdaten */
const _rv={n:0,m:0,u:0,zc:0,s:0,k:1,d:0,cd:1e9,ford:0,pool:0,w:RIV_W,D:2,L:0,lx:0,lz:0,lr:0,ll:0,ld:1e9,e:1e9,vw:0,vt:0,seg:/** @type {any} */(null)};
function riverNear(x,z){
  const n=Math.round((z-RIV_Z0)/RIV_GAP), m=Math.floor((x-rivOff(n))/RIV_SEG), sg=rivSeg(n,m), u=x-sg.xs, R=sg.R;
  const amp=1+0.7*Math.min(1,u/RIV_LAKE), a=x/71+n*1.7, b=x/29+n*0.9+2, mw=13*Math.sin(a)+6*Math.sin(b);
  const zc=RIV_Z0+n*RIV_GAP+amp*mw, s=amp*(13/71*Math.cos(a)+6/29*Math.cos(b))+(u<RIV_LAKE?0.7/RIV_LAKE*mw:0), k=Math.sqrt(1+s*s);
  const c=Math.cos(x*TAU/RIV_FORD+n*2.3), fp=1-smooth01((u-(RIV_LAKE-1.3*R))/(0.5*R)), ford=(c>0?Math.pow(c,10):0)*fp, pool=(c<0?Math.pow(-c,4):0)*fp, head=smooth01(u/RIV_HEAD);
  const bed=u<=RIV_LAKE, w=bed?(RIV_W+1.5*ford+4*pool)*head:0, ld=Math.hypot(x-sg.xl,z-sg.zl), cd=bed?Math.abs(z-zc)/k:1e9, e=Math.min(cd-w,ld-R);
  const L=x<sg.xe?sg.Ls-(sg.Ls-sg.Ll)*(rivG(x,n)-sg.g0)/sg.gt:sg.Ll, vh=bed?smooth01(u/RIV_VHEAD):1;
  _rv.n=n; _rv.m=m; _rv.u=u; _rv.zc=zc; _rv.s=s; _rv.k=k; _rv.cd=cd; _rv.d=bed?cd:ld; _rv.ford=ford; _rv.pool=pool; _rv.w=w; _rv.D=(2-1.4*ford+0.9*pool)*(0.3+0.7*head); _rv.L=L;
  _rv.lx=sg.xl; _rv.lz=sg.zl; _rv.lr=R; _rv.ll=sg.Ll; _rv.ld=ld; _rv.e=e; _rv.seg=sg;
  _rv.vw=e>=RIV_VALLEY?0:vh*(1-smooth01((e-4)/(RIV_VALLEY*(0.35+0.65*vh)-4))); _rv.vt=L+0.5+0.03*Math.max(0,e);
  return _rv;
}
/** Pegel (Uferkante) des Flusses bei x,z; das Wasser steht WATER_D darunter */
const riverLevel=(x,z)=>riverNear(x,z).L;
/** Mitte der Furt k des Flusses n (x); die Furten liegen bei cos(…)=1, die Gumpen genau dazwischen */
const fordX=(n,k)=>(k*TAU-n*2.3)*RIV_FORD/TAU;
/** Der Fluss bei x,z als „Wasserloch“ (Mitte auf der Flusslinie, Radius = halbe Breite), wenn die Stelle innerhalb m × Breite liegt */
function riverPond(x,z,m){
  const r=riverNear(x,z); if(r.w<0.3||r.cd>=r.w*(m||1)) return null;
  return {x,z:r.zc,r:r.w*r.k,L:r.L,murky:false,river:true,n:r.n,ford:r.ford};
}
/** Der See bei x,z (fest je Abschnitt), wenn die Stelle innerhalb m × Radius liegt */
function lakePond(x,z,m){ const r=riverNear(x,z); return r.ld<r.lr*(m||1)?r.seg.pond:null; }
/** Stellen von Fluss und See für die Spürkarte im Umkreis R um x,z (Kreise entlang der Mitte) */
function riverMarks(x,z,R){
  const out=[]; for(let i=Math.floor((x-R)/4)*4;i<=x+R;i+=4){ const r=riverNear(i,z); if(r.w>0.5&&Math.abs(r.zc-z)<R+r.w) out.push({x:i,z:r.zc,r:r.w*0.9}); }
  for(const dx of [-R,0,R]){ const r=riverNear(x+dx,z), p=r.seg.pond; if(Math.hypot(p.x-x,p.z-z)<R+p.r&&!out.includes(p)) out.push(p); }
  return out;
}
/** Abstand zum Rand von Fluss oder See (negativ im Wasser) */
const riverEdge=(x,z)=>riverNear(x,z).e;
/** Gelände mit Aue, aber ohne Wasserbecken (Pegel der Wasserlöcher) */
function Hv(x,z){ const r=riverNear(x,z), h=H0(x,z); return r.vw>0?h+(r.vt-h)*r.vw:h; }
// Jedes zweite Wasserloch ist ein trüber Tümpel: braunes Wasser, in dem man ein abgetauchtes Krokodil nicht sieht.
const PONDS=REG.ponds.map((p,i)=>({x:p[0],z:p[1],r:p[2],L:Hv(p[0],p[1]),murky:i%2===1||swampFactor(p[0],p[1])>0.4}));
const wpCache=new Map();
function worldPond(x,z){
  const gx=Math.floor(x/256), gz=Math.floor(z/256), key=gx*100003+gz;
  if(wpCache.has(key)) return wpCache.get(key);
  const px=(gx+0.5)*256, pz=(gz+0.5)*256;
  let p=null;
  if(!(Math.hypot(px,pz)<WORLD+50||moisture(px,pz)<0.62||riverEdge(px,pz)<RIV_POND_GAP)){
    const h=Math.sin(px*12.9898+pz*78.233)*43758.5453;   // fest je Tümpel: gut die Hälfte ist trüb
    p={x:px,z:pz,r:14+moisture(px,pz)*10,L:Hv(px,pz),murky:h-Math.floor(h)<0.45+0.35*swampFactor(px,pz)};
  }
  wpCache.set(key,p); return p;
}
const streamedPonds=[];
function basin(h,x,z,p){
  const d=Math.hypot(x-p.x,z-p.z);
  if(d>=p.r*1.5) return h;
  let w=Math.min(1,(p.r*1.5-d)/(p.r*0.6)); w=w*w*(3-2*w);
  const q=d/p.r, target=d<p.r?p.L-(1-q*q):p.L;
  return h+(target-h)*w;
}
const WATER_D=0.4;
function H(x,z){
  const extra=worldPond(x,z);   // vor riverNear: worldPond fragt beim ersten Mal selbst riverNear ab
  const r=riverNear(x,z), cd=r.cd, W=r.w, D=r.D, L=r.L, ld=r.ld, R=r.lr, Ll=r.ll;
  let h=H0(x,z); if(r.vw>0) h+=(r.vt-h)*r.vw;
  for(let i=0;i<PONDS.length;i++){
    const p=PONDS[i], d=Math.hypot(x-p.x,z-p.z);
    if(d<p.r*1.5){ let w=(p.r*1.5-d)/(p.r*0.6); if(w>1) w=1; w=w*w*(3-2*w); const q=d/p.r; const t=d<p.r?p.L-(1-q*q):p.L; h+=(t-h)*w; }
  }
  if(extra) h=basin(h,x,z,extra);
  if(cd<W*RIV_BANK){ const t=smooth01((W*RIV_BANK-cd)/(W*1.4)), q=cd/W, target=cd<W?L-D*(1-q*q):L; h+=(target-h)*t; }
  if(ld<R*1.5){ const t=smooth01((R*1.5-ld)/(R*0.5)), q=ld/R, target=ld<R?Ll-LAKE_D*(1-q*q):Math.min(Ll,h); h+=(target-h)*t; }
  return h;
}
/** Dasselbe Wasserloch? (am Fluss: dieselbe Stelle ± 20 m) */
const samePond=(a,b)=>!!a&&!!b&&(a.river||b.river?!!a.river&&!!b.river&&a.n===b.n&&Math.abs(a.x-b.x)<20:a.x===b.x&&a.z===b.z);
function pondAt(x,z,m){
  for(let i=0;i<PONDS.length;i++){ const p=PONDS[i]; if(Math.hypot(x-p.x,z-p.z)<p.r*(m||1)) return p; }
  const extra=worldPond(x,z); if(extra&&Math.hypot(x-extra.x,z-extra.z)<extra.r*(m||1)) return extra;
  return lakePond(x,z,m)||riverPond(x,z,m);
}
/** Nächstes Wasserloch, auch in der gestreamten weiten Welt, am Fluss die nächste Stelle, sonst der See */
function nearestPond(x,z){
  let best=null,bd=Infinity; const check=p=>{ if(!p) return; const d=(x-p.x)*(x-p.x)+(z-p.z)*(z-p.z); if(d<bd){bd=d;best=p;} };
  PONDS.forEach(check);
  const gx=Math.floor(x/256),gz=Math.floor(z/256);
  for(let i=gx-2;i<=gx+2;i++) for(let j=gz-2;j<=gz+2;j++) check(worldPond((i+0.5)*256,(j+0.5)*256));
  { const r=riverNear(x,z); if(r.ld<500) check(r.seg.pond); if(r.cd<300&&r.w>1) check({x,z:r.zc,r:r.w*r.k,L:r.L,murky:false,river:true,n:r.n,ford:r.ford}); }
  return best;
}
function inWater(x,z){ const p=pondAt(x,z,1); return !!p&&H(x,z)<p.L-WATER_D-0.05; }
/** Ab dieser Wassertiefe muss man schwimmen (nur in Fluss und See so tief; Herden gehen nicht hinein) */
const RIV_SWIM=0.75;
/** Wassertiefe in Fluss oder See bei x,z (0 außerhalb) */
function riverDepth(x,z){ const r=riverNear(x,z), lake=r.ld<r.lr; if(!lake&&r.cd>=r.w) return 0; const L=lake?r.ll:r.L; return Math.max(0,L-WATER_D-H(x,z)); }
/** Wassertiefe bei x,z (0 an Land) */
function waterDepth(x,z){ const p=pondAt(x,z,1); return p?Math.max(0,p.L-WATER_D-H(x,z)):0; }
const f6=v=>v.toFixed(6);
/** Flüsse und Seen als GLSL (wie riverNear und H); braucht snoise und H0. riverAt liefert dieselben Werte wie riverNear
    (cd, w, D, L, ld, lr, ll, e, vw, vt); weit weg von Wasser (e ≥ RIV_VALLEY) ohne Rauschen und ohne Pegel. */
const GLSL_RIVER='float rivS(float v){ v=clamp(v,0.0,1.0); return v*v*(3.0-2.0*v); }\n'+
  'float rivZ(float x,float n,float amp){ return '+f6(RIV_Z0)+'+n*'+f6(RIV_GAP)+'+amp*(13.0*sin(x/71.0+n*1.7)+6.0*sin(x/29.0+n*0.9+2.0)); }\n'+
  'float rivG(float x,float n){ return x+'+f6(RIV_RAP*RIV_FORD/TAU)+'*sin(x*'+f6(TAU/RIV_FORD)+'+n*2.3); }\n'+
  'void riverAt(vec2 p,out float cd,out float w,out float D,out float L,out float ld,out float R,out float ll,out float e,out float vw,out float vt){\n'+
  '  float n=floor((p.y-'+f6(RIV_Z0)+')/'+f6(RIV_GAP)+'+0.5); float off='+f6(RIV_SEG)+'*fract(0.37+n*0.618034); float m=floor((p.x-off)/'+f6(RIV_SEG)+');\n'+
  '  float xs=m*'+f6(RIV_SEG)+'+off; float u=p.x-xs; float xl=xs+'+f6(RIV_LAKE)+'; float zl=rivZ(xl,n,1.7); R=62.0+22.0*(0.5+0.5*sin(n*2.1+m*1.37)); ld=distance(p,vec2(xl,zl));\n'+
  '  float amp=1.0+0.7*min(1.0,u/'+f6(RIV_LAKE)+'); float a=p.x/71.0+n*1.7; float b=p.x/29.0+n*0.9+2.0; float mw=13.0*sin(a)+6.0*sin(b);\n'+
  '  float zc='+f6(RIV_Z0)+'+n*'+f6(RIV_GAP)+'+amp*mw; float s=amp*(13.0/71.0*cos(a)+6.0/29.0*cos(b))+(u<'+f6(RIV_LAKE)+'?'+f6(0.7/RIV_LAKE)+'*mw:0.0);\n'+
  '  float c=cos(p.x*'+f6(TAU/RIV_FORD)+'+n*2.3); float fp=1.0-rivS((u-('+f6(RIV_LAKE)+'-1.3*R))/(0.5*R)); float ford=(c>0.0?pow(c,10.0):0.0)*fp; float pool=(c<0.0?pow(-c,4.0):0.0)*fp; float head=rivS(u/'+f6(RIV_HEAD)+');\n'+
  '  bool bed=u<='+f6(RIV_LAKE)+'; w=bed?('+f6(RIV_W)+'+1.5*ford+4.0*pool)*head:0.0; D=(2.0-1.4*ford+0.9*pool)*(0.3+0.7*head); cd=bed?abs(p.y-zc)/sqrt(1.0+s*s):1e9; e=min(cd-w,ld-R);\n'+
  '  L=0.0; ll=0.0; vw=0.0; vt=0.0; if(e>='+f6(RIV_VALLEY)+') return;\n'+
  '  float Ls=H0(vec2(xs,rivZ(xs,n,1.0)))-0.3; ll=min(6.2*snoise(vec2(xl*0.0062+'+f6(NO[0][0])+',zl*0.0062+'+f6(NO[0][1])+'))-2.5,Ls-3.5); float xe=xl-0.8*R;\n'+
  '  L=p.x<xe?Ls-(Ls-ll)*(rivG(p.x,n)-rivG(xs,n))/(rivG(xe,n)-rivG(xs,n)):ll; float vh=bed?rivS(u/'+f6(RIV_VHEAD)+'):1.0;\n'+
  '  vw=vh*(1.0-rivS((e-4.0)/('+f6(RIV_VALLEY)+'*(0.35+0.65*vh)-4.0))); vt=L+0.5+0.03*max(0.0,e); }\n'+
  'float riverEdge(vec2 p){ float cd,w,D,L,ld,R,ll,e,vw,vt; riverAt(p,cd,w,D,L,ld,R,ll,e,vw,vt); return e; }\n'+
  'float Hv(vec2 p){ float cd,w,D,L,ld,R,ll,e,vw,vt; riverAt(p,cd,w,D,L,ld,R,ll,e,vw,vt); float h=H0(p); return h+(vt-h)*vw; }\n';
/** Trockenheit wie dryness() als GLSL (braucht GLSL_H wegen snoise): Bodengras färbt sich wie der Boden darunter */
const GLSL_DRY='float dryG(vec2 p){ float d=length(p); float o=clamp((d-60.0)/130.0,0.0,1.0); float b=clamp((d-'+WORLD.toFixed(1)+')/160.0,0.0,1.0);\n'+
  '  float m=clamp(0.5+1.3*snoise(p/420.0+vec2('+f6(NO[0][0])+','+f6(NO[0][1])+')),0.0,1.0); return o*(1.0-b)+(1.0-m)*b; }\n';
const GLSL_H=GLSL_SNOISE+'float H0(vec2 p){ float h=6.2*snoise(p*0.0062+vec2('+f6(NO[0][0])+','+f6(NO[0][1])+'))+2.0*snoise(p*0.021+vec2('+f6(NO[1][0])+','+f6(NO[1][1])+'))+0.6*snoise(p*0.065+vec2('+f6(NO[2][0])+','+f6(NO[2][1])+'));\n'+
  '  float d=distance(p,vec2(7.0,5.0)); float w=clamp((22.0-d)/12.0,0.0,1.0); w=w*w*(3.0-2.0*w); return h+('+f6(DEN_H)+'-h)*w*0.85; }\n'+
  'float moisture(vec2 p){return clamp(0.5+1.3*snoise(p/420.0+vec2('+f6(NO[0][0])+','+f6(NO[0][1])+')),0.0,1.0); }\n'+
  GLSL_RIVER+
  'float worldBasin(vec2 p,float h){vec2 center=(floor(p/256.0)+0.5)*256.0; float wet=moisture(center); if(length(center)<'+(WORLD+50).toFixed(1)+'||wet<0.62||riverEdge(center)<'+f6(RIV_POND_GAP)+')return h; float r=14.0+wet*10.0; float d=distance(p,center); if(d>=r*1.5)return h; float w=clamp((r*1.5-d)/(r*0.6),0.0,1.0); w=w*w*(3.0-2.0*w); float q=d/r; float level=Hv(center); float target=d<r?level-(1.0-q*q):level; return h+(target-h)*w; }\n'+
  'float Hh(vec2 p){ float cd,W,D,L,ld,R,ll,e,vw,vt; riverAt(p,cd,W,D,L,ld,R,ll,e,vw,vt); float h=H0(p); h+=(vt-h)*vw; float d; float w; float u; float t;\n'+
  PONDS.map(p=>'  d=distance(p,vec2('+p.x.toFixed(2)+','+p.z.toFixed(2)+')); if(d<'+(p.r*1.5).toFixed(2)+'){ w=clamp(('+(p.r*1.5).toFixed(2)+'-d)/'+(p.r*0.6).toFixed(2)+',0.0,1.0); w=w*w*(3.0-2.0*w); u=d/'+p.r.toFixed(2)+'; t=d<'+p.r.toFixed(2)+'?'+p.L.toFixed(4)+'-(1.0-u*u):'+p.L.toFixed(4)+'; h+=(t-h)*w; }\n').join('')+
  '  h=worldBasin(p,h);\n'+
  '  if(cd<W*'+f6(RIV_BANK)+'){ t=rivS((W*'+f6(RIV_BANK)+'-cd)/(W*1.4)); u=cd/W; h+=((cd<W?L-D*(1.0-u*u):L)-h)*t; }\n'+
  '  if(ld<R*1.5){ t=rivS((R*1.5-ld)/(R*0.5)); u=ld/R; h+=((ld<R?ll-'+f6(LAKE_D)+'*(1.0-u*u):min(ll,h))-h)*t; }\n'+
  '  return h; }\n';
const GLSL_PONDMASK=PONDS.map(p=>'  if(distance(w,vec2('+p.x.toFixed(2)+','+p.z.toFixed(2)+'))<'+(p.r*0.93).toFixed(2)+') fade=0.0;\n').join('')+
  // Tümpel der weiten Welt (wie worldPond): je 256-m-Feld höchstens einer, in der Feldmitte, nur wo es feucht genug ist
  '  { vec2 pc=(floor(w/256.0)+0.5)*256.0; float pm=moisture(pc); if(length(pc)>='+(WORLD+50).toFixed(1)+'&&pm>=0.62&&riverEdge(pc)>='+f6(RIV_POND_GAP)+'&&distance(w,pc)<(14.0+pm*10.0)*0.93) fade=0.0; }\n'+
  '  { float cd,rw,D,L,ld,R,ll,e,vw,vt; riverAt(w,cd,rw,D,L,ld,R,ll,e,vw,vt); if(cd<rw*0.93||ld<R*0.93) fade=0.0; }\n';
const vnoise=(x,z)=>Math.sin(x*0.11+Math.sin(z*0.07)*2.1)*Math.cos(z*0.13+Math.sin(x*0.05)*1.7)*0.5+Math.sin(x*0.31-z*0.27)*0.25+Math.sin(x*0.53+z*0.61)*0.12;


/* Kacheln: Boden, Bäume, Büsche, Felsen und hohes Gras sind in 100-m-Felder aufgeteilt. Pro Bild wird nur gezeichnet,
   was im Blickfeld und vor der Nebelgrenze liegt (mit Zugabe, damit Schatten von knapp außerhalb nicht fehlen). */
const TILE=100, TN=6, TOFF=300;
const tileOf=(x,z)=>Math.max(0,Math.min(TN-1,Math.floor((x+TOFF)/TILE)))*TN+Math.max(0,Math.min(TN-1,Math.floor((z+TOFF)/TILE)));
const tileCenter=k=>({x:Math.floor(k/TN)*TILE-TOFF+TILE/2,z:(k%TN)*TILE-TOFF+TILE/2});
/** @type {((cam:any)=>void)|null} */
let viewHook=null;
/** Etwas, das jeder Ansicht folgen soll (Fernlandschaft, Berge), vor dem Zeichnen jeder Ansicht aufrufen */
function onView(fn){ viewHook=fn; }
const cullList=[], _fr=new THREE.Frustum(), _pm=new THREE.Matrix4(), _sp=new THREE.Sphere();
function registerTile(mesh,k,r){ const c=tileCenter(k); mesh.frustumCulled=false; cullList.push({mesh,s:new THREE.Sphere(new THREE.Vector3(c.x,H(c.x,c.z)+5,c.z),r)}); }
/** Beliebiges Stück (z. B. Chunk-Boden) in die Sichtprüfung aufnehmen; liefert den Eintrag zum späteren Verschieben/Entfernen */
function registerCull(mesh,x,z,r){ mesh.frustumCulled=false; const e={mesh,s:new THREE.Sphere(new THREE.Vector3(x,H(x,z)+5,z),r)}; cullList.push(e); return e; }
function unregisterCull(e){ const i=cullList.indexOf(e); if(i>=0) cullList.splice(i,1); }
/** Blendet Kacheln außerhalb des Sichtfelds von cam aus (beim Splitscreen vor jedem Ausschnitt). */
function cullTiles(cam=camera){
  if(viewHook) viewHook(cam);
  cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  const far=scene.fog.far+10;
  for(let i=0;i<cullList.length;i++){ const t=cullList[i]; _sp.center.copy(t.s.center); _sp.radius=t.s.radius+35;
    t.mesh.visible=t.s.center.distanceTo(cam.position)-t.s.radius<far&&_fr.intersectsSphere(_sp); }
}
const hash2=(x,z)=>{ const h=Math.sin(x*12.9898+z*78.233)*43758.5453; return h-Math.floor(h); };

/* Boden: siehe chunks.js (mitwandernde Bodenstücke je Chunk) */

/* Fernes Umland und Berge am Horizont: siehe chunks.js (folgen der Kamera) */

/* Wasserlöcher */
const waters=[];
PONDS.forEach(p=>{
  const g=new THREE.CircleGeometry(p.r,48); g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,p.murky?new THREE.MeshPhongMaterial({color:0x6e6a3c,transparent:true,opacity:0.96,shininess:40,specular:0x8a8a70})
    :new THREE.MeshPhongMaterial({color:0x4d9db3,transparent:true,opacity:0.74,shininess:120,specular:0xffffff}));
  m.position.set(p.x,p.L-WATER_D,p.z); m.userData.y=p.L-WATER_D; m.receiveShadow=true; scene.add(m); waters.push(m);
});

/* Hindernisse: Kreis-Kollider in einem Raster ohne Rand (Zellen nach Bedarf). low = niedrig, kann im Sprung überquert werden */
const CG=8, colGrid=new Map();
const cKey=(i,j)=>i*1000003+j;
function addCol(x,z,r,low){
  const c={x,z,r,low:!!low}, m=r+2.5;
  const x0=Math.floor((x-m)/CG), x1=Math.floor((x+m)/CG), z0=Math.floor((z-m)/CG), z1=Math.floor((z+m)/CG);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=cKey(i,j); let L=colGrid.get(k); if(!L) colGrid.set(k,L=[]); L.push(c); }
  return c;
}
/** Kollider wieder entfernen (wenn ein Chunk entladen wird) */
function removeCol(c){ removeFromGrid(colGrid,c,c.r+2.5); }
function removeSight(o){ removeFromGrid(sightGrid,o,o.r); }
function removeFromGrid(grid,c,m){
  const  x0=Math.floor((c.x-m)/CG), x1=Math.floor((c.x+m)/CG), z0=Math.floor((c.z-m)/CG), z1=Math.floor((c.z+m)/CG);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=cKey(i,j), L=grid.get(k); if(!L) continue; const n=L.indexOf(c); if(n>=0) L.splice(n,1); if(!L.length) grid.delete(k); }
}
/* Sichthindernisse (Felsen, Büsche, Baumstämme): Kreis mit Höhe und Deckkraft 0…1, im selben Rasterprinzip */
const sightGrid=new Map();
function addSight(x,z,r,h,op){
  const o={x,z,r,top:H(x,z)+h,op}, x0=Math.floor((x-r)/CG), x1=Math.floor((x+r)/CG), z0=Math.floor((z-r)/CG), z1=Math.floor((z+r)/CG);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=cKey(i,j); let L=sightGrid.get(k); if(!L) sightGrid.set(k,L=[]); L.push(o); }
  return o;
}
/** Hindernisse in der Rasterzelle von (x,z) */
const sightAt=(x,z)=>sightGrid.get(cKey(Math.floor(x/CG),Math.floor(z/CG)));
const _col={x:0,z:0};
function collide(x,z,rad,skipLow){
  const L=colGrid.get(cKey(Math.floor(x/CG),Math.floor(z/CG)));
  if(L){
    for(let k=0;k<L.length;k++){
      const c=L[k]; if(skipLow&&c.low) continue;
      const dx=x-c.x, dz=z-c.z, m=c.r+rad, d2=dx*dx+dz*dz;
      if(d2<m*m){ const d=Math.sqrt(d2); if(d<1e-4){ x=c.x+m; } else { x=c.x+dx/d*m; z=c.z+dz/d*m; } }
    }
  }
  _col.x=x; _col.z=z; return _col;
}

export { LAKE_D, RIV_SWIM, RIV_HEAD, RIV_LAKE, riverEdge, lakePond, Hv, riverDepth, RIV_FORD, fordX, riverLevel, riverMarks, riverNear, waterDepth, samePond, GLSL_DRY, moisture, swampFactor, dryness, worldPond, streamedPonds, removeSight, addSight, sightAt, GLSL_H, GLSL_PONDMASK, H, H0, PONDS, WATER_D, WORLD, addCol, collide, cullTiles, hash2, inWater, nearestPond, onView, pondAt, registerCull, registerTile, removeCol, tileOf, unregisterCull, vnoise, waters };
