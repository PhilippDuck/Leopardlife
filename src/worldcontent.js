// Wasser und Tiergruppen in nachgeladenen Abschnitten.
import { chunks, CHUNK, chunkRng } from './chunks.js';
import { worldPond, streamedPonds, waters, WATER_D, WORLD, H, pondAt, dryness, registerCull, unregisterCull } from './terrain.js';
import { scene } from './engine.js';
import { animals, placeAnimal } from './animals.js';
import { SPECIES } from './data.js';
import { buildCroc, buildQuad, makeFur } from './models.js';
import { players, dropModel } from './player.js';
import { S, save } from './save.js';
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
  const croc=spawnPondCroc(chunk,pond);
  chunk.content.push({drop(){
    if(croc){ if(croc.carc) endCarcass(croc); dropModel(croc.g); const i=animals.indexOf(croc); if(i>=0) animals.splice(i,1); }
    unregisterCull(cull); scene.remove(mesh);
    waters.splice(waters.indexOf(mesh),1); streamedPonds.splice(streamedPonds.indexOf(pond),1);
    geometry.dispose(); material.dispose();
  }});
}

/** Krokodil im Tümpel eines gestreamten Abschnitts (in gut der Hälfte der Tümpel, fest je Tümpel). Wie im Startgebiet:
    lauert abgetaucht, im trüben Wasser unsichtbar, greift Trinkende an. Verschwindet mit dem Abschnitt. */
function spawnPondCroc(chunk,pond){
  const random=chunkRng(chunk.cx-7919,chunk.cz+3571);
  if(random()>0.6) return null;
  const sp=SPECIES.find(s=>s.id==='croc'), fur=makeFur(), g=buildCroc(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g);
  const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:worldAnimalId++,world:true};
  placeAnimal(a);
  const an=random()*6.283, rr=random()*pond.r*0.5;
  a.pond=pond; a.x=pond.x+Math.cos(an)*rr; a.z=pond.z+Math.sin(an)*rr; a.tx=a.x; a.tz=a.z; a.state='lurk';
  animals.push(a); return a;
}
const worldHerds=new Map();
let worldAnimalId=100000, worldContentTimer=0;
function spawnWorldHerd(chunk,now){
  if(worldHerds.has(chunk.key)) return;
  if(S.worldHunts&&S.worldHunts[chunk.key]>now) return;
  const random=chunkRng(chunk.cx+104729,chunk.cz-13007);
  if(random()>0.16) return;
  const x=(chunk.cx+0.5)*CHUNK, z=(chunk.cz+0.5)*CHUNK;
  if(Math.hypot(x,z)<WORLD+40||pondAt(x,z,1.6)) return;
  // Tiere entstehen erst mit Abstand zu jedem Spieler.
  if(players.some(p=>Math.hypot(p.x-x,p.z-z)<65)) return;
  const predator=random()<0.16;
  const id=predator?'hyena':dryness(x,z)>0.5?'anti':'deer';
  const sp=SPECIES.find(species=>species.id===id);
  const group=[];
  const count=predator?2:3+Math.floor(random()*2);
  for(let i=0;i<count;i++){
    const fur=makeFur(), g=buildQuad(sp.m,fur);
    g.scale.setScalar(sp.size); scene.add(g);
    const animal={sp,g,fur,rad:sp.size*0.8+0.25,uid:worldAnimalId++,world:true};
    placeAnimal(animal);
    animal.x=x+(random()-0.5)*12; animal.z=z+(random()-0.5)*12;
    animal.tx=animal.x; animal.tz=animal.z;
    animal.g.position.set(animal.x,H(animal.x,animal.z),animal.z);
    group.push(animal); animals.push(animal);
  }
  if(!predator) for(const animal of group) animal.herd=group;
  worldHerds.set(chunk.key,{group,deadCount:0});
}
function updateWorldContent(dt){
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
    const nearby=entry.group.some(a=>players.some(p=>Math.hypot(p.x-a.x,p.z-a.z)<400||p.drag===a||p.bite===a)||a.held||a.carc?.tree!=null);
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
export { fillWater, updateWorldContent };
