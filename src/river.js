// LeoLife – Flüsse: Wasserfläche je Abschnitt und Krokodile, die an den Furten lauern. Verlauf, Gelände und Tiefe: terrain.js (riverNear).
import { CHUNK, chunkRng } from './chunks.js';
import { scene } from './engine.js';
import { H, RIV_FORD, WATER_D, fordX, registerCull, riverLevel, riverNear, unregisterCull, waters } from './terrain.js';
import { SPECIES } from './data.js';
import { buildCroc, makeFur } from './models.js';
import { animals, placeAnimal } from './animals.js';
import { dropModel } from './player.js';
import { endCarcass } from './carcass.js';

/** Abstand der Stützstellen der Wasserfläche entlang des Flusses (m) */
const RIV_STEP=2;
/** So weit neben der Furtmitte lauert ein Krokodil (dort ist es schon tief genug zum Abtauchen) */
const FORD_CROC_OFF=12;
/** Anteil der Furten mit Krokodil */
const FORD_CROC_CHANCE=0.55;
const riverMat=new THREE.MeshPhongMaterial({color:0x4d9db3,transparent:true,opacity:0.74,shininess:120,specular:0xffffff});
let riverAnimalId=300000;

/** Nummer des Flusses, der bei x durch den Abschnitt (cx,cz) läuft, sonst null */
function riverIn(cx,cz,x){
  const r=riverNear(x,(cz+0.5)*CHUNK); return Math.floor(r.zc/CHUNK)===cz?r.n:null;
}
/** Wasserfläche des Flusses von x0 bis x0+CHUNK: ein Band entlang der Mitte, etwas breiter als die Rinne (die Ufer verdecken den Rand) */
function riverStrip(x0,zMid){
  const cols=CHUNK/RIV_STEP+1, pos=new Float32Array(cols*3*3), idx=[];
  for(let i=0;i<cols;i++){
    const x=x0+i*RIV_STEP, r=riverNear(x,zMid), y=riverLevel(x,r.zc)-WATER_D, nx=-r.s/r.k, nz=1/r.k, w=r.w*1.05;
    [-1,0,1].forEach((side,j)=>{ const o=(i*3+j)*3; pos[o]=x+nx*w*side; pos[o+1]=y; pos[o+2]=r.zc+nz*w*side; });
    if(i>0) for(let j=0;j<2;j++){ const a=(i-1)*3+j, b=i*3+j; idx.push(a,a+1,b, a+1,b+1,b); }
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Krokodil, das neben einer Furt im tiefen Wasser lauert. Sein „Wasserloch“ ist ein Stück Fluss. */
function fordCroc(x,zMid){
  const r=riverNear(x,zMid), pond={x,z:r.zc,r:r.w*r.k,L:riverLevel(x,r.zc),murky:false,river:true,n:r.n,ford:r.ford};
  const sp=SPECIES.find(s=>s.id==='croc'), fur=makeFur(), g=buildCroc(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g);
  const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:riverAnimalId++,world:true};
  placeAnimal(a);
  a.pond=pond; a.x=pond.x; a.z=pond.z; a.tx=a.x; a.tz=a.z; a.state='lurk'; a.g.position.set(a.x,H(a.x,a.z),a.z);
  animals.push(a); return a;
}
/** Abschnitt füllen: Wasserfläche des Flusses (falls einer hindurchläuft) und Krokodile an den Furten darin */
function fillRiver(chunk){
  const x0=chunk.cx*CHUNK, zMid=(chunk.cz+0.5)*CHUNK, n=riverIn(chunk.cx,chunk.cz,x0+CHUNK/2);
  if(n==null) return;
  const g=riverStrip(x0,zMid), mesh=new THREE.Mesh(g,riverMat);
  mesh.userData.y=0; mesh.receiveShadow=true; scene.add(mesh); waters.push(mesh);
  const zc=riverNear(x0+CHUNK/2,zMid).zc, cull=registerCull(mesh,x0+CHUNK/2,zc,CHUNK*0.75);
  const crocs=[], random=chunkRng(chunk.cx+5101,chunk.cz-881);
  for(let k=Math.ceil((x0+n*2.3*RIV_FORD/6.2832)/RIV_FORD);;k++){ const fx=fordX(n,k); if(fx>=x0+CHUNK) break; if(fx<x0) continue;
    if(random()<FORD_CROC_CHANCE) crocs.push(fordCroc(fx+(random()<0.5?-1:1)*FORD_CROC_OFF,zMid)); }
  chunk.content.push({drop(){
    for(const a of crocs){ if(a.carc) endCarcass(a); dropModel(a.g); const i=animals.indexOf(a); if(i>=0) animals.splice(i,1); }
    unregisterCull(cull); scene.remove(mesh); waters.splice(waters.indexOf(mesh),1); g.dispose();
  }});
}

export { fillRiver };
