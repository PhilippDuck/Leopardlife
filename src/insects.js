// LeoLife – Insekten: Fliegenschwärme über Kadavern (ein Zeichen für Aas) und Glühwürmchen in grünen Nächten.
import { animals } from './animals.js';
import { dayF } from './daynight.js';
import { scene } from './engine.js';
import { players } from './player.js';
import { H, dryness, pondAt } from './terrain.js';

/** Runde, weiche Punktform (sonst zeichnet WebGL Punkte als Quadrate) */
function dotTex(soft){
  const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d'), g=x.createRadialGradient(16,16,0,16,16,16);
  if(soft){ g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.25,'rgba(255,255,255,0.8)'); g.addColorStop(1,'rgba(255,255,255,0)'); }
  else { g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.55,'rgba(255,255,255,1)'); g.addColorStop(0.7,'rgba(255,255,255,0)'); }
  x.fillStyle=g; x.fillRect(0,0,32,32); const t=new THREE.CanvasTexture(c); return t;
}
/* ---------- Fliegen ----------
   Liegt ein Kadaver eine Weile, sammeln sich Fliegen darüber: ein summender schwarzer Schwarm, der zeigt, wo Aas liegt. */
const FLY_N=24, FLY_AFTER=12;
const flyMat=new THREE.PointsMaterial({color:0x111111,size:0.12,sizeAttenuation:true,transparent:true,opacity:0.9,depthWrite:false,map:dotTex(false),alphaTest:0.3});
const swarms=new Map();
function makeSwarm(){
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(FLY_N*3),3));
  const pts=new THREE.Points(g,flyMat); pts.frustumCulled=false; scene.add(pts);
  return {pts,ph:Array.from({length:FLY_N},()=>[Math.random()*6.283,0.6+Math.random()*1.4,0.3+Math.random()*0.6,Math.random()*6.283])};
}
function updateFlies(dt,t){
  for(const a of animals){
    const has=a.dead&&a.carc&&a.carc.meat>0;
    if(!has){ const s=swarms.get(a); if(s){ scene.remove(s.pts); s.pts.geometry.dispose(); swarms.delete(a); } a.flyT=0; continue; }
    a.flyT=(a.flyT||0)+dt; if(a.flyT<FLY_AFTER) continue;
    let s=swarms.get(a); if(!s){ s=makeSwarm(); swarms.set(a,s); }
    const near=players.some(p=>Math.hypot(p.x-a.x,p.z-a.z)<60); s.pts.visible=near; if(!near) continue;
    const tr=a.carc.tree!=null, y0=tr?a.g.position.y+0.4:H(a.x,a.z)+a.sp.size*0.5+0.2, k=Math.min(1,(a.flyT-FLY_AFTER)/10);
    const arr=s.pts.geometry.attributes.position.array;
    for(let i=0;i<FLY_N;i++){ const [p0,sp,r,q]=s.ph[i], u=t*sp*3+p0;
      arr[i*3]=a.x+Math.cos(u)*r*(0.6+0.4*Math.sin(u*2.3+q))*(0.4+0.6*k);
      arr[i*3+1]=y0+Math.sin(u*1.7+q)*0.25+0.3*Math.sin(u*0.5);
      arr[i*3+2]=a.z+Math.sin(u*1.3)*r*(0.6+0.4*Math.cos(u*1.9+q))*(0.4+0.6*k); }
    s.pts.geometry.attributes.position.needsUpdate=true;
  }
}

/* ---------- Glühwürmchen ----------
   Nachts blinken über feuchtem Gras und an Wasserlöchern kleine Lichter, im trockenen Land kaum welche.
   Die Punkte liegen fest in der Welt (wiederholtes Raster) und wandern mit dem Spieler mit, wie das Bodengras. */
const FF_N=130, FF_S=38;
const ffGeo=new THREE.BufferGeometry();
ffGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(FF_N*3),3));
ffGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(FF_N*3),3));
const ffMat=new THREE.PointsMaterial({size:0.55,sizeAttenuation:true,map:dotTex(true),vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
const ffClouds=[];   // je Spieler eine Wolke
const ffSeed=Array.from({length:FF_N},()=>[Math.random(),Math.random(),Math.random()*6.283,0.4+Math.random()*1.6]);
function updateFireflies(t){
  const night=Math.max(0,Math.min(1,(0.4-dayF)/0.3));
  while(ffClouds.length<players.length){ const g=ffGeo.clone(), pts=new THREE.Points(g,ffMat); pts.frustumCulled=false; scene.add(pts); ffClouds.push(pts); }
  ffClouds.forEach((pts,j)=>{
    const p=players[j]; pts.visible=!!p&&night>0.02; if(!pts.visible) return;
    const pos=pts.geometry.attributes.position.array, col=pts.geometry.attributes.color.array;
    for(let i=0;i<FF_N;i++){ const [ox,oz,ph,sp]=ffSeed[i];
      const bx=ox*FF_S, bz=oz*FF_S, x=bx+FF_S*Math.floor((p.x-bx)/FF_S+0.5)+Math.sin(t*0.3*sp+ph)*1.5, z=bz+FF_S*Math.floor((p.z-bz)/FF_S+0.5)+Math.cos(t*0.25*sp+ph)*1.5;
      const wet=pondAt(x,z,2.2)?1:Math.max(0,1-dryness(x,z)*1.6);
      const blink=Math.max(0,Math.sin(t*sp*1.7+ph*3))**3, v=night*wet*blink;
      pos[i*3]=x; pos[i*3+1]=H(x,z)+0.5+Math.sin(t*sp+ph)*0.35; pos[i*3+2]=z;
      col[i*3]=0.75*v; col[i*3+1]=1.0*v; col[i*3+2]=0.35*v; }
    pts.geometry.attributes.position.needsUpdate=true; pts.geometry.attributes.color.needsUpdate=true;
  });
}

function updateInsects(dt){ const t=performance.now()/1000; updateFlies(dt,t); updateFireflies(t); }

export { updateInsects };
