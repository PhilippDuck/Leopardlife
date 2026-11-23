// Vegetation außerhalb des Startgebiets. Baumplätze erst freigeben, wenn kein Tier mehr darauf sitzt.
import { CHUNK } from './chunks.js';
import { scene } from './engine.js';
import { H, WORLD, dryness, pondAt, addCol, addSight, removeCol, removeSight, registerCull, unregisterCull } from './terrain.js';
import { dryBushGeometry, dryBushColor, shrubKind, bushGeometry, bushMaterial, bushColor, makeTree, woodMeshes, leafMeshes, leafGeoHi, leafGeoLo, trees, setTree, fadedTrees, patches, tallGeo, tallMat } from './vegetation.js';
import { players } from './player.js';
import { followers } from './cubfollow.js';
import { animals } from './animals.js';
import { QUAL } from './data.js';
import { quality } from './quality.js';

const freeSlots=[];
const rockGeometry=new THREE.DodecahedronGeometry(1,0);
const vegetationBushes={geometry:bushGeometry,material:bushMaterial};

function fillPlants(chunk){
  const rng=chunk.rng, slots=[], cleanup=[];
  const ox=chunk.cx*CHUNK, oz=chunk.cz*CHUNK;
  const place=(margin)=>({x:ox+margin+rng()*(CHUNK-2*margin),z:oz+margin+rng()*(CHUNK-2*margin)});
  const outside=p=>Math.hypot(p.x,p.z)>WORLD+5&&!pondAt(p.x,p.z,1.5);
  function show(mesh){
    scene.add(mesh);
    const cull=registerCull(mesh,ox+CHUNK/2,oz+CHUNK/2,55);
    cleanup.push(()=>{ unregisterCull(cull); scene.remove(mesh); mesh.dispose?.(); });
  }
  function sight(x,z,r,h,opacity){
    const obstacle=addSight(x,z,r,h,opacity);
    cleanup.push(()=>removeSight(obstacle));
  }
  const stems=Array.from({length:3},()=>place(4)).filter(outside);
  if(stems.length){
    const generated=stems.map(({x,z})=>makeTree({x,z,sav:dryness(x,z)>0.45},rng));
    const parts=generated.flatMap(t=>t.parts);
    const trunks=new THREE.InstancedMesh(woodMeshes[0].geometry,woodMeshes[0].material,parts.filter(p=>!p.leaf).length);
    const crowns=new THREE.InstancedMesh(quality==='low'?leafGeoLo:leafGeoHi,leafMeshes[0].material,parts.filter(p=>p.leaf).length);
    if(crowns.count>0){
      leafMeshes.push(crowns);
      cleanup.push(()=>leafMeshes.splice(leafMeshes.indexOf(crowns),1));
      show(crowns);
    }
    trunks.castShadow=crowns.castShadow=true;
    trunks.receiveShadow=crowns.receiveShadow=true;
    show(trunks);
    let woodIndex=0, leafIndex=0;
    const color=new THREE.Color();
    generated.forEach(tree=>{
      for(const part of tree.parts){
        part.mesh=part.leaf?crowns:trunks;
        part.i=part.leaf?leafIndex++:woodIndex++;
        part.mesh.setColorAt(part.i,color.setHex(part.c));
      }
      const slot=freeSlots.pop()??trees.length;
      trees[slot]=tree;
      slots.push(slot);
      setTree(slot);
      const collider=addCol(tree.x,tree.z,tree.tr+0.1,false);
      cleanup.push(()=>{ removeCol(collider); fadedTrees.delete(slot); delete trees[slot]; freeSlots.push(slot); });
      sight(tree.x,tree.z,tree.tr+0.15,6,0.55);
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
      if(pondAt(x,z,1.05)) continue;
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
export { fillPlants };
