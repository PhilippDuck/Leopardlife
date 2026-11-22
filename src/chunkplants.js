// Vegetation außerhalb des Startgebiets. Baumplätze erst freigeben, wenn kein Tier mehr darauf sitzt.
import { CHUNK } from './chunks.js';
import { scene } from './engine.js';
import { H, WORLD, addCol, addSight, removeCol, removeSight, registerCull, unregisterCull } from './terrain.js';
import { trees, setTree, fadedTrees, patches, tallGeo, tallMat } from './vegetation.js';
import { players } from './player.js';
import { followers } from './cubfollow.js';
import { animals } from './animals.js';
import { QUAL } from './data.js';
import { quality } from './quality.js';

const freeSlots=[];
const barkGeo=new THREE.CylinderGeometry(0.7,1,1,7);
const crownGeo=new THREE.IcosahedronGeometry(1,1);
const barkMat=new THREE.MeshLambertMaterial({color:0x705538});
const crownMat=new THREE.MeshLambertMaterial({color:0x658443});
const bushMat=new THREE.MeshLambertMaterial({color:0x788f43});

function fillPlants(chunk){
  const rng=chunk.rng, slots=[], cleanup=[];
  const ox=chunk.cx*CHUNK, oz=chunk.cz*CHUNK;
  const place=(margin)=>({x:ox+margin+rng()*(CHUNK-2*margin),z:oz+margin+rng()*(CHUNK-2*margin)});
  const outside=p=>Math.hypot(p.x,p.z)>WORLD+5;
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
    const trunks=new THREE.InstancedMesh(barkGeo,barkMat,stems.length);
    const crowns=new THREE.InstancedMesh(crownGeo,crownMat,stems.length);
    show(trunks); show(crowns);
    stems.forEach(({x,z},i)=>{
      const h=4+rng()*2, radius=2.5+rng();
      function part(mesh,w,height,y){
        const m=new THREE.Matrix4().makeScale(w,height,w);
        m.setPosition(0,y,0);
        return {mesh,i,m};
      }
      const slot=freeSlots.pop()??trees.length;
      trees[slot]={x,z,y:H(x,z),f:1,cx:0,cy:h,cz:0,rx:radius,ry:1,tr:0.38,perch:[0,h,0],
        parts:[part(trunks,0.38,h,h/2),part(crowns,radius,1,h)]};
      slots.push(slot);
      setTree(slot);
      const collider=addCol(x,z,0.48,false);
      cleanup.push(()=>{ removeCol(collider); fadedTrees.delete(slot); delete trees[slot]; freeSlots.push(slot); });
      sight(x,z,0.53,h,0.55);
    });
  }
  const shrubs=Array.from({length:5},()=>place(2)).filter(outside);
  if(shrubs.length){
    const mesh=new THREE.InstancedMesh(crownGeo,bushMat,shrubs.length);
    shrubs.forEach(({x,z},i)=>{
      const r=1+rng(), h=0.6+rng()*0.5;
      const m=new THREE.Matrix4().makeScale(r,h,r);
      m.setPosition(x,H(x,z)+h*0.6,z); mesh.setMatrixAt(i,m);
      sight(x,z,r,h*1.6,0.8);
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
      pos.push(x,H(x,z),z); rotations.push(rng()*2*Math.PI,0.75+rng()*0.45); hues.push(rng());
    }
  }
  if(hues.length){
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',tallGeo[0].g.attributes.position.clone());
    g.setAttribute('iPos',new THREE.InstancedBufferAttribute(new Float32Array(pos),3));
    g.setAttribute('iRS',new THREE.InstancedBufferAttribute(new Float32Array(rotations),2));
    g.setAttribute('iHue',new THREE.InstancedBufferAttribute(new Float32Array(hues),1));
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
