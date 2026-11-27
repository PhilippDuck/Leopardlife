// LeoLife – Kleinigkeiten am Wasser: Trockenrisse im Schlamm um Wasserlöcher im Trockenen und Gischt an den Furten des Flusses.
import { scene } from './engine.js';
import { H, PONDS, WATER_D, dryness, fordX, registerTile, riverNear, tileOf } from './terrain.js';
import { seeded } from './noise.js';

/* ---------- Trockenrisse ---------- */
/** Textur: dunkle Risse (Grenzen zwischen Schollen) auf halbdurchsichtigem Schlamm, nahtlos kachelbar */
const crackTex=(function(){
  const N=128, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const ctx=cv.getContext('2d'); if(!ctx||!ctx.createImageData) return null;
  const img=ctx.createImageData(N,N), r=seeded(0x63726b), pts=[];
  for(let i=0;i<26;i++){ const x=r()*N, y=r()*N; for(const ox of [-N,0,N]) for(const oy of [-N,0,N]) pts.push([x+ox,y+oy]); }
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    let d1=1e9, d2=1e9; for(const p of pts){ const d=(p[0]-x)*(p[0]-x)+(p[1]-y)*(p[1]-y); if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }
    const edge=Math.sqrt(d2)-Math.sqrt(d1), o=(y*N+x)*4, crack=edge<1.6;
    img.data[o]=crack?62:150; img.data[o+1]=crack?46:122; img.data[o+2]=crack?32:86; img.data[o+3]=crack?215:70;
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
})();
const crackMat=new THREE.MeshLambertMaterial({map:crackTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
/** Ring aus rissigem Schlamm um das Wasserloch p (vom Wasserrand nach außen, Außenkante unregelmäßig) */
function crackRing(p){
  const n=40, rings=4, pos=[], uv=[], idx=[], r=seeded(Math.floor(p.x*7+p.z*13)>>>0);
  const outer=Array.from({length:n},()=>1.12+r()*0.16);
  for(let j=0;j<=rings;j++) for(let i=0;i<n;i++){
    const a=i/n*6.283, f=0.78+(outer[i]-0.78)*j/rings, x=p.x+Math.cos(a)*p.r*f, z=p.z+Math.sin(a)*p.r*f;
    pos.push(x,Math.max(H(x,z),p.L-WATER_D)+0.04,z); uv.push(x/6,z/6);
  }
  for(let j=0;j<rings;j++) for(let i=0;i<n;i++){ const a=j*n+i, b=j*n+(i+1)%n, c=a+n, d=b+n; idx.push(a,c,b, b,c,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
if(crackTex) for(const p of PONDS){
  if(dryness(p.x,p.z)<0.4) continue;
  const m=new THREE.Mesh(crackRing(p),crackMat); m.receiveShadow=true; registerTile(m,tileOf(p.x,p.z),p.r*1.5+10); scene.add(m);
}

/* ---------- Gischt an den Furten ---------- */
const SPRAY_N=90;
const sprayGeo=new THREE.BufferGeometry(), sprayPos=new Float32Array(SPRAY_N*3).fill(-1000);
sprayGeo.setAttribute('position',new THREE.BufferAttribute(sprayPos,3));
const spray=new THREE.Points(sprayGeo,new THREE.PointsMaterial({color:0xf4fbff,size:0.22,transparent:true,opacity:0.75,depthWrite:false}));
spray.frustumCulled=false; scene.add(spray);
const sprayDrops=Array.from({length:SPRAY_N},()=>({x:0,y:-1000,z:0,vx:0,vy:0,vz:0,life:0}));
let ford=null, fordCheck=0;
/** Gischt an der nächsten Furt beim Spieler p (bis 70 m) */
function updateSpray(dt,p){
  fordCheck-=dt;
  if(fordCheck<=0){ fordCheck=1;
    ford=null; const r=riverNear(p.x,p.z), n=r.n;
    if(r.cd<120){ const k=Math.round(((p.x)*6.283/210+n*2.3)/6.283), fx=fordX(n,k);
      if(Math.abs(fx-p.x)<70){ const f=riverNear(fx,p.z); if(f.ford>0.6&&f.w>1.5) ford={x:fx,zc:f.zc,w:f.w,y:f.L-WATER_D}; } }
  }
  for(let i=0;i<SPRAY_N;i++){
    const d=sprayDrops[i];
    d.life-=dt;
    if(d.life<=0){
      if(!ford){ d.y=-1000; }
      else { d.x=ford.x+(Math.random()-0.5)*5; d.z=ford.zc+(Math.random()*2-1)*ford.w*0.9; d.y=ford.y+0.05; d.vx=0.6+Math.random()*1.2; d.vy=0.8+Math.random()*1.1; d.vz=(Math.random()-0.5)*0.6; d.life=0.5+Math.random()*0.9; }
    } else { d.x+=d.vx*dt; d.y+=d.vy*dt; d.z+=d.vz*dt; d.vy-=4.5*dt; }
    sprayPos[i*3]=d.x; sprayPos[i*3+1]=d.y; sprayPos[i*3+2]=d.z;
  }
  sprayGeo.attributes.position.needsUpdate=true;
}

export { updateSpray };
