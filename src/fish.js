// Kleine Fischschwärme in flachem Wasser; ein Sprung in Ufernähe kann einen Fisch als Notmahlzeit fangen.
import { scene } from './engine.js';
import { P, players } from './player.js';
import { G } from './state.js';
import { H, PONDS, WATER_D, waterDepth, registerCull, unregisterCull } from './terrain.js';
import { floatText } from './ui.js';

const schools=[];
const up=new THREE.Vector3(0,1,0);
const fishGeo=new THREE.SphereGeometry(1,7,5);
fishGeo.scale(0.15,0.11,0.42);
const tailGeo=new THREE.ConeGeometry(0.16,0.25,4); tailGeo.rotateX(Math.PI/2); tailGeo.translate(0,0,-0.23);
const fishMat=new THREE.MeshLambertMaterial({color:0x344a42,transparent:true,opacity:0.82});
const rippleGeo=new THREE.RingGeometry(0.16,0.21,10); rippleGeo.rotateX(-Math.PI/2);
const rippleMat=new THREE.MeshBasicMaterial({color:0x9ed7ce,transparent:true,opacity:0.26,side:THREE.DoubleSide});
const hash=(x,z,i)=>{ const v=Math.sin(x*12.9898+z*78.233+i*41.17)*43758.5453; return v-Math.floor(v); };

function createSchool(pond){
  if(!pond||!pond.r||pond.r<3) return null;
  let state=pond._fishSchool;
  if(!state){
    if(hash(pond.x,pond.z,19)>0.72) return null;
    const n=2+Math.floor(hash(pond.z,pond.x,23)*4), fish=[];
    for(let i=0;i<n;i++){
      const a=hash(pond.x,pond.z,i+1)*Math.PI*2, r=pond.r*(0.43+0.25*hash(pond.z,pond.x,i+9));
      fish.push({x:pond.x+Math.cos(a)*r,z:pond.z+Math.sin(a)*r,phase:hash(pond.x,pond.z,i+33)*6.28,dir:hash(pond.z,pond.x,i+45)*6.28});
    }
    state=pond._fishSchool={fish,scaredUntil:0};
  }
  if(!state.fish.length) return null;
  const group=new THREE.Group(), mesh=new THREE.InstancedMesh(fishGeo,fishMat,state.fish.length), tail=new THREE.InstancedMesh(tailGeo,fishMat,state.fish.length), ripples=new THREE.InstancedMesh(rippleGeo,rippleMat,state.fish.length);
  group.add(mesh,tail,ripples); scene.add(group);
  const school={pond,state,group,mesh,tail,ripples,cull:registerCull(group,pond.x,pond.z,pond.r+2)}; schools.push(school); updateSchool(school,performance.now());
  return {drop(){ const i=schools.indexOf(school); if(i>=0) schools.splice(i,1); unregisterCull(school.cull); scene.remove(group); }};
}

const mat=new THREE.Matrix4(), pos=new THREE.Vector3(), scale=new THREE.Vector3(), quat=new THREE.Quaternion();
function updateSchool(school,now){
  const {pond,state}=school, live=state.fish;
  school.mesh.count=school.tail.count=school.ripples.count=live.length;
  for(let i=0;i<live.length;i++){
    const f=live[i], t=now*0.00065+f.phase, x=f.x+Math.sin(t)*0.45, z=f.z+Math.cos(t*0.8)*0.35, y=Math.min(pond.L-WATER_D-0.08,H(x,z)+0.22);
    const angle=f.dir+Math.sin(t*0.45)*0.3; quat.setFromAxisAngle(up,angle);
    mat.compose(pos.set(x,y,z),quat,scale.set(1,1,1)); school.mesh.setMatrixAt(i,mat);
    mat.compose(pos.set(x-Math.sin(angle)*0.24,y,z-Math.cos(angle)*0.24),quat,scale.set(0.72,0.72,0.72)); school.tail.setMatrixAt(i,mat);
    const pulse=0.8+0.2*Math.sin(t*1.7); mat.compose(pos.set(x,pond.L-WATER_D+0.015,z),quat,scale.set(pulse,pulse,pulse)); school.ripples.setMatrixAt(i,mat);
  }
  school.mesh.instanceMatrix.needsUpdate=true; school.tail.instanceMatrix.needsUpdate=true; school.ripples.instanceMatrix.needsUpdate=true;
}
function updateFish(now){
  for(const school of schools){
    const {pond,state}=school;
    if(now>=state.scaredUntil){
      const intruder=players.find(p=>!p.dead&&p.tree==null&&Math.hypot(p.x-pond.x,p.z-pond.z)<(p.sneak?3.4:5.5));
      if(intruder){
        state.scaredUntil=now+(intruder.sneak?650:1500);
        for(const f of state.fish){ f.x=pond.x+(f.x-pond.x)*0.72; f.z=pond.z+(f.z-pond.z)*0.72; f.dir=Math.atan2(pond.x-f.x,pond.z-f.z); }
      }
    }
    updateSchool(school,now);
  }
}
function nearestSchool(p,includeScared=false){
  let best=null,bd=Infinity;
  for(const s of schools){ if(!s.state.fish.length||(!includeScared&&nowScared(s))) continue; const d=Math.hypot(p.x-s.pond.x,p.z-s.pond.z); if(d<bd){best=s;bd=d;} }
  return best&&bd<10?best:null;
}
function nowScared(s){ return performance.now()<s.state.scaredUntil; }
function fishContext(p=P){
  const s=nearestSchool(p,true);
  if(!s||p.dead||p.tree!=null||p.drag||p.pounce>0||G.paused) return null;
  return {label:'Fische fangen · springen'};
}
/** Wird von der Sprungaktion aufgerufen. Nur nahe dem Schwarm und im flachen Wasser gibt es eine Fangchance. */
function tryFishCatch(p=P){
  if(p.dead||p.tree!=null||G.paused) return false;
  const now=performance.now(); if(now<(p.fishTryAt||0)) return false;
  const s=nearestSchool(p); if(!s) return false;
  const dx=Math.sin(p.rot), dz=Math.cos(p.rot), tx=p.x+dx*3.2, tz=p.z+dz*3.2;
  const d=Math.min(Math.hypot(p.x-s.pond.x,p.z-s.pond.z),Math.hypot(tx-s.pond.x,tz-s.pond.z));
  if(d>8||waterDepth(tx,tz)>1.45||waterDepth(tx,tz)<0.03){ p.fishTryAt=now+1500; return false; }
  p.fishTryAt=now+2500;
  if(Math.random()<(p.sneak?0.48:0.28)){
    s.state.fish.pop(); s.mesh.count=s.tail.count=s.ripples.count=s.state.fish.length;
    if(!s.state.fish.length) s.state.scaredUntil=now+30000;
    return true;
  }
  s.state.scaredUntil=now+1600;
  floatText('Die Fische sind ausgewichen',p.x,p.y+1.4,p.z,'#9ed7ce');
  return false;
}

PONDS.forEach(createSchool);

export { createSchool, fishContext, tryFishCatch, updateFish };
