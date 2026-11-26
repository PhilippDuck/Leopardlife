// Wasser und Tiergruppen in nachgeladenen Abschnitten.
import { chunks, CHUNK, chunkRng } from './chunks.js';
import { worldPond, streamedPonds, waters, WATER_D, WORLD, H, pondAt, dryness, registerCull, unregisterCull } from './terrain.js';
import { scene } from './engine.js';
import { HIPPO_POND_R, animals, placeAnimal } from './animals.js';
import { SPECIES } from './data.js';
import { buildBaboon, buildCroc, buildElephant, buildHippo, buildQuad, buildSnake, makeFur } from './models.js';
import { actors, dropModel } from './player.js';
import { NET_GUEST, S, save } from './save.js';
import { endCarcass } from './carcass.js';

function fillWater(chunk){
  const x=chunk.cx*CHUNK, z=chunk.cz*CHUNK;
  const pond=worldPond(x,z);
  if(!pond||Math.floor(pond.x/CHUNK)!==chunk.cx||Math.floor(pond.z/CHUNK)!==chunk.cz) return;
  const geometry=new THREE.CircleGeometry(pond.r,48);
  geometry.rotateX(-Math.PI/2);
  const material=pond.murky?new THREE.MeshPhongMaterial({color:0x6e6a3c,transparent:true,opacity:0.96,shininess:40,specular:0x8a8a70})
    :new THREE.MeshPhongMaterial({color:0x4d9db3,transparent:true,opacity:0.74,shininess:120,specular:0xffffff});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(pond.x,pond.L-WATER_D,pond.z);
  mesh.userData.y=pond.L-WATER_D;
  mesh.receiveShadow=true;
  scene.add(mesh); waters.push(mesh); streamedPonds.push(pond);
  const cull=registerCull(mesh,pond.x,pond.z,pond.r);
  const croc=spawnPondCroc(chunk,pond), pod=spawnPondHippos(chunk,pond);
  chunk.content.push({drop(){
    for(const a of croc?[croc,...pod]:pod){ if(a.carc) endCarcass(a); dropModel(a.g); const i=animals.indexOf(a); if(i>=0) animals.splice(i,1); }
    unregisterCull(cull); scene.remove(mesh);
    waters.splice(waters.indexOf(mesh),1); streamedPonds.splice(streamedPonds.indexOf(pond),1);
    geometry.dispose(); material.dispose();
  }});
}

/** Krokodil im Tümpel eines gestreamten Abschnitts (in gut der Hälfte der Tümpel, fest je Tümpel). Wie im Startgebiet:
    lauert abgetaucht, im trüben Wasser unsichtbar, greift Trinkende an. Verschwindet mit dem Abschnitt. */
function spawnPondCroc(chunk,pond){
  if(NET_GUEST) return null;   // Gast im Online-Spiel: Tiere kommen vom Gastgeber
  const random=chunkRng(chunk.cx-7919,chunk.cz+3571);
  if(random()>0.6) return null;
  const sp=SPECIES.find(s=>s.id==='croc'), fur=makeFur(), g=buildCroc(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g);
  const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:worldAnimalId++,world:true};
  placeAnimal(a);
  const an=random()*6.283, rr=random()*pond.r*0.5;
  a.pond=pond; a.x=pond.x+Math.cos(an)*rr; a.z=pond.z+Math.sin(an)*rr; a.tx=a.x; a.tz=a.z; a.state='lurk';
  animals.push(a); return a;
}
/** Nilpferde in großen Tümpeln der weiten Welt (in gut einem Drittel, fest je Tümpel; Seen: chance): zwei bis vier, oft mit einem Jungen.
    Tagsüber im Wasser, nachts grasen sie am Ufer. Verschwinden mit dem Abschnitt. */
function spawnPondHippos(chunk,pond,chance=0.38){
  if(NET_GUEST) return [];
  const random=chunkRng(chunk.cx+6113,chunk.cz-2203);
  if(pond.r<HIPPO_POND_R||random()>chance) return [];
  const sp=SPECIES.find(s=>s.id==='hippo'), n=2+Math.floor(random()*3), pod=[];
  const add=mom=>{ const k=mom?W_JUV:1, fur=makeFur(), g=buildHippo(sp.m,fur); g.scale.setScalar(sp.size*k); scene.add(g);
    const a={sp,g,fur,rad:sp.size*k*0.8+0.25,uid:worldAnimalId++,world:true,pond};
    if(mom){ a.juv=true; a.mom=mom; (mom.kids||(mom.kids=[])).push(a); }
    placeAnimal(a); animals.push(a); pod.push(a); };
  for(let i=0;i<n;i++) add(null);
  if(random()<0.6) add(pod[0]);
  return pod;
}
const worldHerds=new Map();
let worldAnimalId=100000, worldContentTimer=0;
/* Was in der weiten Welt lebt: je nach Trockenheit eine andere Mischung (Gewicht, Gruppengröße von–bis).
   Große Räuber und Riesenantilopen nur weit draußen und selten. */
const WILD_WET=[['deer',3,3,5],['boar',2,2,3],['capy',2,3,5],['hase',2,1,2],['gnu',1,5,8],['baboon',1,5,7],['ele',0.4,3,6],['hyena',1,2,3],['jack',0.7,2,3],['snake',0.7,1,1]];
const WILD_DRY=[['anti',3,3,5],['gnu',2,5,8],['hase',1.5,1,2],['wart',1.5,2,4],['baboon',0.7,5,7],['ele',0.6,3,6],['jack',1,2,3],['hyena',1.2,2,3],['snake',1,1,1],['giant',0.25,1,1],['lion',0.3,1,2]];
const FAR_ONLY={giant:600,lion:520};   // Mindestabstand zur Weltmitte
const W_JUV=0.55;   // wie JUV in animals.js
function pickWild(random,x,z){
  const list=(dryness(x,z)>0.5?WILD_DRY:WILD_WET).filter(([id])=>!FAR_ONLY[id]||Math.hypot(x,z)>FAR_ONLY[id]);
  let r=random()*list.reduce((s,e)=>s+e[1],0);
  for(const e of list){ r-=e[1]; if(r<=0) return e; }
  return list[0];
}
function makeWorldAnimal(sp,x,z,mom){
  const fur=makeFur(), g=sp.snake?buildSnake(sp.m,fur):sp.baboon?buildBaboon(sp.m,fur):sp.elephant?buildElephant(sp.m,fur):buildQuad(sp.m,fur), k=mom?W_JUV:1;
  g.scale.setScalar(sp.size*k); scene.add(g);
  const a={sp,g,fur,rad:sp.size*k*0.8+0.25,uid:worldAnimalId++,world:true};
  if(mom){ a.juv=true; a.mom=mom; (mom.kids||(mom.kids=[])).push(a); }
  placeAnimal(a);
  a.x=x; a.z=z; a.tx=x; a.tz=z; a.g.position.set(x,H(x,z),z);
  animals.push(a); return a;
}
function spawnWorldHerd(chunk,now){
  if(worldHerds.has(chunk.key)) return;
  if(S.worldHunts&&S.worldHunts[chunk.key]>now) return;
  const random=chunkRng(chunk.cx+104729,chunk.cz-13007);
  if(random()>0.3) return;
  const x=(chunk.cx+0.5)*CHUNK, z=(chunk.cz+0.5)*CHUNK;
  if(Math.hypot(x,z)<WORLD+40||pondAt(x,z,1.6)) return;
  // Tiere entstehen erst mit Abstand zu jedem Spieler.
  if(actors().some(p=>Math.hypot(p.x-x,p.z-z)<65)) return;
  const [id,,lo,hi]=pickWild(random,x,z);
  const sp=SPECIES.find(species=>species.id===id);
  const group=[], count=lo+Math.floor(random()*(hi-lo+1)), spread=sp.snake?0:4+count*2;
  for(let i=0;i<count;i++) group.push(makeWorldAnimal(sp,x+(random()-0.5)*spread,z+(random()-0.5)*spread,null));
  // Junge: in gut der Hälfte der Gruppen, bei Arten, die welche haben
  if(sp.young&&random()<0.6){ const n=1+Math.floor(random()*Math.min(sp.young,2));
    for(let i=0;i<n;i++){ const mom=group[i%group.length]; group.push(makeWorldAnimal(sp,mom.x+(random()-0.5)*3,mom.z+(random()-0.5)*3,mom)); } }
  if(!sp.pred&&!sp.snake){ const adults=group.filter(a=>!a.juv); for(const animal of adults) animal.herd=adults; }   // Junge folgen der Mutter, nicht der Herde
  worldHerds.set(chunk.key,{group,deadCount:0});
}
function updateWorldContent(dt){
  if(NET_GUEST) return;
  worldContentTimer-=dt;
  if(worldContentTimer>0) return;
  worldContentTimer=1;
  const now=Date.now();
  let changed=false;
  for(const [key,entry] of worldHerds){
    const deadCount=entry.group.filter(a=>a.dead).length;
    if(deadCount>entry.deadCount){
      entry.deadCount=deadCount;
      S.worldHunts=S.worldHunts||{};
      S.worldHunts[key]=now+5*60*1000;
      changed=true;
    }
    const nearby=entry.group.some(a=>actors().some(p=>Math.hypot(p.x-a.x,p.z-a.z)<400||p.drag===a||p.bite===a)||a.held||a.carc?.tree!=null);
    const depleted=entry.group.every(a=>a.dead&&!a.carc);
    const replenished=depleted&&(!S.worldHunts?.[key]||S.worldHunts[key]<=now);
    if(nearby&&!replenished) continue;
    for(const animal of entry.group){
      if(animal.carc) endCarcass(animal);
      dropModel(animal.g);
      animals.splice(animals.indexOf(animal),1);
      animal.g.traverse(o=>{ if(o.isMesh&&o!==animal.g.userData.blob){ o.geometry?.dispose(); } });
      animal.fur?.dispose?.();
    }
    worldHerds.delete(key);
  }
  for(const key in S.worldHunts||{}) if(S.worldHunts[key]<=now){ delete S.worldHunts[key]; changed=true; }
  if(changed) save();
  for(const chunk of chunks.values()) spawnWorldHerd(chunk,now);
}
export { fillWater, spawnPondHippos, updateWorldContent };
