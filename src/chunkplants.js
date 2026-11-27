// Vegetation außerhalb des Startgebiets. Baumplätze erst freigeben, wenn kein Tier mehr darauf sitzt.
import { CHUNK } from './chunks.js';
import { scene } from './engine.js';
import { H, WORLD, dryness, pondAt, addCol, addSight, removeCol, removeSight, registerCull, unregisterCull } from './terrain.js';
import { dryBushGeometry, dryBushColor, shrubKind, bushGeometry, bushMaterial, bushColor, makeTree, treeKinds, leafMeshes, leafGeoLo, trees, setTree, patches, tallGeo, tallMat, treeSlot, releaseTree } from './vegetation.js';
import { kopjeNear } from './kopjesites.js';
import { reedMesh, reedPatches, reedSpots } from './reeds.js';
import { players } from './player.js';
import { followers } from './cubfollow.js';
import { animals } from './animals.js';
import { QUAL } from './data.js';
import { quality } from './quality.js';
import { seeded } from './noise.js';
import { WORLD_SEED } from './save.js';

const rockGeometry=new THREE.DodecahedronGeometry(1,0);
const vegetationBushes={geometry:bushGeometry,material:bushMaterial};
/** Anteil der Abschnitte mit einem Affenbrotbaum (nur im Trockenen) */
const BAOBAB_CHANCE=0.07;
/** Eigener Zufall je Abschnitt für den Affenbrotbaum, damit die übrige Bepflanzung gleich bleibt */
const baobabRng=(cx,cz)=>seeded((WORLD_SEED^Math.imul(cx,0x2c1b3c6d)^Math.imul(cz,0x297a2d39)^0x5bd1e995)>>>0);
/** Platz für einen Affenbrotbaum in Abschnitt cx/cz oder null (deterministisch aus Weltsamen und Koordinaten) */
function baobabSpot(cx,cz){
  const r=baobabRng(cx,cz); if(r()>=BAOBAB_CHANCE) return null;
  const x=cx*CHUNK+12+r()*(CHUNK-24), z=cz*CHUNK+12+r()*(CHUNK-24);
  return Math.hypot(x,z)>WORLD+20&&dryness(x,z)>0.3&&!pondAt(x,z,1.8)&&!kopjeNear(x,z,8)?{x,z,baobab:true,rng:r}:null;   // r baut danach auch den Baum
}

function fillPlants(chunk){
  const rng=chunk.rng, slots=[], cleanup=[];
  const ox=chunk.cx*CHUNK, oz=chunk.cz*CHUNK;
  const place=(margin)=>({x:ox+margin+rng()*(CHUNK-2*margin),z:oz+margin+rng()*(CHUNK-2*margin)});
  const outside=p=>Math.hypot(p.x,p.z)>WORLD+5&&!pondAt(p.x,p.z,1.5)&&!kopjeNear(p.x,p.z,2);
  function show(mesh){
    scene.add(mesh);
    const cull=registerCull(mesh,ox+CHUNK/2,oz+CHUNK/2,55);
    cleanup.push(()=>{ unregisterCull(cull); scene.remove(mesh); mesh.dispose?.(); });
  }
  function sight(x,z,r,h,opacity){
    const obstacle=addSight(x,z,r,h,opacity);
    cleanup.push(()=>removeSight(obstacle));
  }
  const baobab=baobabSpot(chunk.cx,chunk.cz);   // liegt nie auf einem Felsplateau (baobabSpot)
  const stems=Array.from({length:3},()=>place(4)).filter(outside).filter(p=>!baobab||Math.hypot(p.x-baobab.x,p.z-baobab.z)>8);
  if(stems.length||baobab){
    const generated=stems.map(({x,z})=>makeTree({x,z,sav:dryness(x,z)>0.45},rng));
    if(baobab) generated.push(makeTree(baobab,baobab.rng));
    // Je Teil-Sorte ein Instanz-Modell (Zylinder, Laubballen, Akazien-Modell …)
    const parts=generated.flatMap(t=>t.parts), meshes={}, counts={};
    for(const part of parts) counts[part.kind]=(counts[part.kind]||0)+1;
    for(const kind in counts){
      const K=treeKinds[kind], mesh=meshes[kind]=new THREE.InstancedMesh(kind==='leaf'&&quality==='low'?leafGeoLo:K.geo,K.mat,counts[kind]);
      mesh.castShadow=mesh.receiveShadow=true;
      if(kind==='leaf'){ leafMeshes.push(mesh); cleanup.push(()=>leafMeshes.splice(leafMeshes.indexOf(mesh),1)); }   // Qualität tauscht die Laubform
      show(mesh);
      counts[kind]=0;
    }
    const color=new THREE.Color();
    generated.forEach(tree=>{
      for(const part of tree.parts){
        part.mesh=meshes[part.kind];
        part.i=counts[part.kind]++;
        part.mesh.setColorAt(part.i,color.setHex(part.c));
      }
      const slot=treeSlot();
      trees[slot]=tree;
      slots.push(slot);
      setTree(slot);
      const collider=addCol(tree.x,tree.z,tree.tr+0.1,false);
      cleanup.push(()=>{ removeCol(collider); releaseTree(slot); });
      sight(tree.x,tree.z,tree.tr+0.15,tree.baobab?8:6,tree.baobab?1:0.55);
    });
  }
  // Buschplätze je nach Trockenheit: grüne Büsche, vertrocknete Büsche oder Steine
  const kinds={green:[],dry:[],rock:[]};
  for(const p of Array.from({length:18},()=>place(2)).filter(outside)){ const k=shrubKind(dryness(p.x,p.z),rng); if(k) kinds[k].push(p); }
  const shrubs=kinds.green;
  if(kinds.dry.length){
    const mesh=new THREE.InstancedMesh(dryBushGeometry,vegetationBushes.material,kinds.dry.length), color=new THREE.Color();
    kinds.dry.forEach(({x,z},i)=>{ const k=0.6+rng()*0.45, sy=0.6+rng()*0.4;
      mesh.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,H(x,z)-0.05,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rng()*6.28,0)),new THREE.Vector3(k,sy,k)));
      const t=dryBushColor(rng); mesh.setColorAt(i,color.setHSL(t.h,t.s,t.l)); sight(x,z,k*0.8,sy*0.9,0.35); });
    mesh.castShadow=true; show(mesh);
  }
  if(kinds.rock.length){
    const mesh=new THREE.InstancedMesh(rockGeometry,vegetationBushes.material,kinds.rock.length), color=new THREE.Color();
    kinds.rock.forEach(({x,z},i)=>{ const sy=0.25+rng()*0.45, sx=0.4+rng()*0.8, sz=0.4+rng()*0.8;
      mesh.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(x,H(x,z)+sy*0.25,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rng()*6.28,0)),new THREE.Vector3(sx,sy,sz)));
      mesh.setColorAt(i,color.setHSL(0.07+rng()*0.04,0.06+rng()*0.08,0.45+rng()*0.15));
      if(sy>0.45&&sx+sz>1.4){ const c=addCol(x,z,(sx+sz)*0.4,true); cleanup.push(()=>removeCol(c)); }
      if(sy>0.4) sight(x,z,(sx+sz)*0.42,sy*0.95,1); });
    mesh.castShadow=true; mesh.receiveShadow=true; show(mesh);
  }
  if(shrubs.length){
    const mesh=new THREE.InstancedMesh(vegetationBushes.geometry,vegetationBushes.material,shrubs.length);
    const color=new THREE.Color();
    shrubs.forEach(({x,z},i)=>{
      const savanna=Math.hypot(x,z)>WORLD+180, sy=0.5+rng()*0.45;
      const sx=0.8+rng()*0.9, sz=0.8+rng()*0.9;
      const m=new THREE.Matrix4().compose(new THREE.Vector3(x,H(x,z)+sy*0.45,z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rng()*6.28,0)),
        new THREE.Vector3(sx,sy,sz));
      mesh.setMatrixAt(i,m);
      const tint=bushColor(savanna,rng);
      mesh.setColorAt(i,color.setHSL(tint.h,tint.s,tint.l));
      const radius=(sx+sz)*0.42;
      sight(x,z,radius,sy*0.9,0.8);
    });
    show(mesh);
  }
  // Schilf nur am Ufer von Wasserlöchern, Fluss und See, in feuchten Gegenden dichter (reeds.js).
  // Verstecke aus allen Plätzen, damit sie auf jedem Gerät gleich sind; gezeichnet wird auf „niedrig“ nur jeder zweite Büschel.
  const reeds=reedSpots(ox,oz,ox+CHUNK,oz+CHUNK,rng,(x,z)=>Math.hypot(x,z)<WORLD+3);
  if(reeds.length){
    show(reedMesh(quality==='low'?reeds.filter((_,i)=>i%2===0):reeds,rng));
    for(const patch of reedPatches(reeds)){ patches.push(patch); cleanup.push(()=>patches.splice(patches.indexOf(patch),1)); }
  }
  const pos=[], rotations=[], hues=[];
  for(let i=0;i<2;i++){
    const center=place(7);
    if(!outside(center)) continue;
    const patch={...center,r:4+rng()*2};
    patches.push(patch);
    cleanup.push(()=>patches.splice(patches.indexOf(patch),1));
    for(let j=0;j<patch.r*patch.r*4;j++){
      const angle=rng()*2*Math.PI, distance=Math.sqrt(rng())*patch.r;
      const x=center.x+Math.cos(angle)*distance, z=center.z+Math.sin(angle)*distance;
      if(pondAt(x,z,1.05)||kopjeNear(x,z)) continue;
      pos.push(x,H(x,z),z); rotations.push(rng()*2*Math.PI,0.75+rng()*0.45); hues.push(rng());
    }
  }
  if(hues.length){
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',tallGeo[0].g.attributes.position.clone());
    g.setAttribute('iPos',new THREE.InstancedBufferAttribute(new Float32Array(pos),3));
    g.setAttribute('iRS',new THREE.InstancedBufferAttribute(new Float32Array(rotations),2));
    g.setAttribute('iHue',new THREE.InstancedBufferAttribute(new Float32Array(hues),1));
    g.setAttribute('iDry',new THREE.InstancedBufferAttribute(new Float32Array(pos.length/3).map((_,i)=>dryness(pos[i*3],pos[i*3+2])),1));
    const entry={g,n:hues.length};
    tallGeo.push(entry); g.instanceCount=Math.floor(entry.n*QUAL[quality].tall);
    show(new THREE.Mesh(g,tallMat));
    cleanup.push(()=>{ tallGeo.splice(tallGeo.indexOf(entry),1); g.dispose(); });
  }
  if(cleanup.length) chunk.content.push({
    inUse:()=>slots.length>0&&(players.some(p=>slots.includes(p.tree))||
      followers.some(f=>slots.includes(f.tree)||slots.includes(f.waitTree))||
      animals.some(a=>a.carc&&slots.includes(a.carc.tree))),
    drop:()=>{ for(const fn of cleanup) fn(); }
  });
}
export { fillPlants, baobabSpot };
