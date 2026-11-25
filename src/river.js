// LeoLife – Flüsse und Seen: Wasserflächen je Abschnitt, Krokodile an den Furten und in den Gumpen, Krokodile und Nilpferde im See.
// Verlauf, Gefälle, Gelände und Tiefe: terrain.js (riverNear).
import { CHUNK, chunkRng } from './chunks.js';
import { scene } from './engine.js';
import { H, RIV_FORD, RIV_HEAD, RIV_LAKE, WATER_D, fordX, registerCull, riverNear, unregisterCull, waters } from './terrain.js';
import { SPECIES } from './data.js';
import { buildCroc, makeFur } from './models.js';
import { animals, placeAnimal } from './animals.js';
import { dropModel } from './player.js';
import { endCarcass } from './carcass.js';
import { spawnPondHippos } from './worldcontent.js';

/** Abstand der Stützstellen der Wasserfläche entlang des Flusses (m) */
const RIV_STEP=2;
/** So weit neben der Furtmitte lauert ein Krokodil (dort ist es schon tief genug zum Abtauchen) */
const FORD_CROC_OFF=12;
/** Anteil der Furten mit Krokodil; Anteil der Gumpen (breit und tief) mit Krokodil */
const FORD_CROC_CHANCE=0.4, POOL_CROC_CHANCE=0.6;
/** Krokodile je See (von–bis) und Anteil der Seen mit Nilpferden */
const LAKE_CROCS=[2,4], LAKE_HIPPO_CHANCE=0.75;
const riverMat=new THREE.MeshPhongMaterial({color:0x4d9db3,transparent:true,opacity:0.74,shininess:120,specular:0xffffff});
let riverAnimalId=300000;

/** Wasserfläche des Flusses von x0 bis x0+CHUNK, soweit dort Flussbett ist: ein Band entlang der Mitte, etwas breiter als die Rinne
    (die Ufer verdecken den Rand). Endet knapp im See; null, wenn im Abschnitt kein Fluss läuft. */
function riverStrip(x0,cz){
  const zMid=(cz+0.5)*CHUNK, pos=[], idx=[]; let cols=0;
  for(let i=0;i<=CHUNK/RIV_STEP;i++){
    const x=x0+i*RIV_STEP, r=riverNear(x,zMid);
    if(r.w<0.05||r.u>RIV_LAKE-r.lr+2||Math.floor(r.zc/CHUNK)!==cz&&Math.floor((r.zc+r.w)/CHUNK)!==cz&&Math.floor((r.zc-r.w)/CHUNK)!==cz){ cols=0; continue; }
    const y=r.L-WATER_D, nx=-r.s/r.k, nz=1/r.k, w=r.w*1.05, base=pos.length/3;
    [-1,0,1].forEach(side=>pos.push(x+nx*w*side,y,r.zc+nz*w*side));
    if(cols>0) for(let j=0;j<2;j++){ const a=base-3+j, b=base+j; idx.push(a,a+1,b, a+1,b+1,b); }
    cols++;
  }
  if(!idx.length) return null;
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Krokodil, das im Fluss bei x lauert. Sein „Wasserloch“ ist ein Stück Fluss. */
function riverCroc(x,zMid){
  const r=riverNear(x,zMid), pond={x,z:r.zc,r:r.w*r.k,L:r.L,murky:false,river:true,n:r.n,ford:r.ford};
  return lurkingCroc(pond,pond.x,pond.z);
}
function lurkingCroc(pond,x,z){
  const sp=SPECIES.find(s=>s.id==='croc'), fur=makeFur(), g=buildCroc(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g);
  const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:riverAnimalId++,world:true};
  placeAnimal(a);
  a.pond=pond; a.x=x; a.z=z; a.tx=a.x; a.tz=a.z; a.state='lurk'; a.g.position.set(a.x,H(a.x,a.z),a.z);
  animals.push(a); return a;
}
/** Liegt x im Flussbett (nicht im schmalen Oberlauf, nicht im See)? */
function inBed(x,zMid){ const r=riverNear(x,zMid); return r.u>=RIV_HEAD&&r.u<=RIV_LAKE-1.3*r.lr; }
/** Abschnitt füllen: Wasserfläche des Flusses, Krokodile an Furten und in Gumpen, der See (falls seine Mitte hier liegt) mit seinen Tieren */
function fillRiver(chunk){
  const x0=chunk.cx*CHUNK, zMid=(chunk.cz+0.5)*CHUNK, crocs=[], parts=[], random=chunkRng(chunk.cx+5101,chunk.cz-881);
  const g=riverStrip(x0,chunk.cz);
  if(g){
    const mesh=new THREE.Mesh(g,riverMat); mesh.userData.y=0; mesh.receiveShadow=true; scene.add(mesh); waters.push(mesh);
    const r=riverNear(x0+CHUNK/2,zMid), n=r.n; parts.push({mesh,g,cull:registerCull(mesh,x0+CHUNK/2,r.zc,CHUNK*0.75)});
    // Furten (cos=1) und Gumpen (cos=−1) in diesem Abschnitt; nur wo die Flussmitte im Abschnitt liegt
    for(let k=Math.floor((x0+n*2.3*RIV_FORD/6.2832)/RIV_FORD)-1;;k++){
      const fx=fordX(n,k), px=fx+RIV_FORD/2; if(fx>=x0+CHUNK&&px>=x0+CHUNK) break;
      if(fx>=x0&&fx<x0+CHUNK&&inBed(fx,zMid)&&Math.floor(riverNear(fx,zMid).zc/CHUNK)===chunk.cz&&random()<FORD_CROC_CHANCE) crocs.push(riverCroc(fx+(random()<0.5?-1:1)*FORD_CROC_OFF,zMid));
      if(px>=x0&&px<x0+CHUNK&&inBed(px,zMid)&&Math.floor(riverNear(px,zMid).zc/CHUNK)===chunk.cz&&random()<POOL_CROC_CHANCE) crocs.push(riverCroc(px+(random()-0.5)*14,zMid));
    }
  }
  // Der See: Wasserfläche, Krokodile verteilt im Wasser, oft eine Gruppe Nilpferde
  const lake=riverNear(x0+CHUNK/2,zMid).seg.pond;
  let pod=[];
  if(Math.floor(lake.x/CHUNK)===chunk.cx&&Math.floor(lake.z/CHUNK)===chunk.cz){
    const lg=new THREE.CircleGeometry(lake.r,72); lg.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(lg,riverMat); mesh.position.set(lake.x,lake.L-WATER_D,lake.z); mesh.userData.y=lake.L-WATER_D; mesh.receiveShadow=true;
    scene.add(mesh); waters.push(mesh); parts.push({mesh,g:lg,cull:registerCull(mesh,lake.x,lake.z,lake.r)});
    const lr=chunkRng(chunk.cx-4421,chunk.cz+1297), nc=LAKE_CROCS[0]+Math.floor(lr()*(LAKE_CROCS[1]-LAKE_CROCS[0]+1));
    for(let i=0;i<nc;i++){ const an=lr()*6.283, rr=lake.r*(0.35+lr()*0.4); crocs.push(lurkingCroc(lake,lake.x+Math.cos(an)*rr,lake.z+Math.sin(an)*rr)); }
    pod=spawnPondHippos(chunk,lake,LAKE_HIPPO_CHANCE);
  }
  if(!parts.length&&!crocs.length) return;
  chunk.content.push({drop(){
    for(const a of [...crocs,...pod]){ if(a.carc) endCarcass(a); dropModel(a.g); const i=animals.indexOf(a); if(i>=0) animals.splice(i,1); }
    for(const p of parts){ unregisterCull(p.cull); scene.remove(p.mesh); waters.splice(waters.indexOf(p.mesh),1); p.g.dispose(); }
  }});
}

export { fillRiver };
