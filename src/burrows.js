// LeoLife – Warzenschweine und ihre Baue: Bei Gefahr rennen sie mit steil aufgestelltem Schwanz zum Bau und verschwinden darin,
// nachts schlafen sie dort. Sie kommen erst wieder heraus, wenn niemand in der Nähe ist – wer geduckt wartet, kann sie abpassen.
import { moveAnimal } from './ai.js';
import { animals } from './animals.js';
import { dayF } from './daynight.js';
import { scene } from './engine.js';
import { players } from './player.js';
import { H, PONDS, pondAt } from './terrain.js';
import { rnd } from './util.js';

const BURROW_N=7, FLEE_R=45, ENTER_R=1.1;
const BURROWS=[];
const moundMat=new THREE.MeshLambertMaterial({color:0x8a6a48}), holeMat=new THREE.MeshBasicMaterial({color:0x1a120c});
const moundGeo=new THREE.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI/2), holeGeo=new THREE.CircleGeometry(0.42,12);
function addBurrow(x,z){
  const y=H(x,z), ry=Math.random()*6.283, g=new THREE.Group();
  const m=new THREE.Mesh(moundGeo,moundMat); m.scale.set(1.5,0.32,1.2); m.receiveShadow=true; g.add(m);
  const hole=new THREE.Mesh(holeGeo,holeMat); hole.position.set(0,0.14,1.05); hole.rotation.x=-0.35; g.add(hole);   // Eingang an der Vorderseite
  g.position.set(x,y-0.05,z); g.rotation.y=ry; scene.add(g);
  BURROWS.push({x:x+Math.sin(ry)*1.3,z:z+Math.cos(ry)*1.3,g});   // Eingangspunkt
}
for(let i=0,t=0;BURROWS.length<BURROW_N&&t<200;t++){
  const r=rnd(55,195), an=Math.random()*6.283, x=Math.cos(an)*r, z=Math.sin(an)*r;
  if(pondAt(x,z,1.8)||Math.hypot(x-7,z-5)<25||BURROWS.some(b=>Math.hypot(b.x-x,b.z-z)<30)) continue;
  addBurrow(x,z); i++;
}
/** Nächster Bau des Tiers; wer weit weg wieder auftaucht, sucht sich einen neuen */
function homeOf(a){
  if(a.home&&Math.hypot(a.home.x-a.x,a.home.z-a.z)<70) return a.home;
  let best=null,bd=1e9; for(const b of BURROWS){ const d=Math.hypot(b.x-a.x,b.z-a.z); if(d<bd){ bd=d; best=b; } }
  a.home=best; return best;
}
const night=()=>dayF<0.22;
/** Ist es draußen ruhig genug? Schleichende Leoparden fallen erst aus der Nähe auf. */
function calmAt(b){
  for(const p of players){ if(p.dead) continue; const d=Math.hypot(p.x-b.x,p.z-b.z); if(d<(p.sneak?4:14)) return false; }
  for(const o of animals){ if(o.dead||!o.sp.pred||o.sp.croc||o.sp.friend) continue; if(Math.hypot(o.x-b.x,o.z-b.z)<14) return false; }
  return true;
}
function enter(a,b){
  a.burrowed=b; a.inT=rnd(18,35); a.state='wander'; a.g.visible=false;
  a.x=a.z=1e6;   // im Bau: aus der Welt genommen, damit keine Jagd, Anzeige oder Herde es mehr findet
}
function leave(a){
  const b=a.burrowed; a.burrowed=null; const an=Math.random()*6.283;
  a.x=b.x+Math.cos(an)*0.8; a.z=b.z+Math.sin(an)*0.8; a.tx=a.x; a.tz=a.z; a.timer=0; a.state='wander'; a.sus=0;
  a.g.position.set(a.x,H(a.x,a.z),a.z);
}
/** Tier im Bau: wartet, bis die Zeit um und es draußen ruhig ist (nachts bleibt es drin). Gibt true zurück, solange es drin ist. */
function burrowWait(a,dt){
  if(!a.burrowed) return false;
  a.g.visible=false;
  const mom=a.juv&&a.mom&&!a.mom.dead?a.mom:null;
  if(mom){ if(!mom.burrowed&&Math.hypot(mom.x-a.burrowed.x,mom.z-a.burrowed.z)<6) leave(a); return !!a.burrowed; }   // Junge kommen mit der Mutter heraus
  a.inT-=dt;
  if(a.inT<=0&&!night()&&calmAt(a.burrowed)) leave(a);
  return !!a.burrowed;
}
/** Zum Bau laufen: auf der Flucht, nachts, oder als Junges, wenn die Mutter schon drin ist. Gibt true zurück, wenn es das Tier steuert. */
function burrowSeek(a,dt){
  if(a.world) return false;   // Baue gibt es nur im eigenen Gebiet
  const mom=a.juv&&a.mom&&!a.mom.dead?a.mom:null;
  let b=null, fast=true;
  if(mom&&mom.burrowed) b=mom.burrowed;
  else if(a.state==='flee'){ const h=homeOf(a); if(h&&Math.hypot(h.x-a.x,h.z-a.z)<FLEE_R) b=h; }
  else if(a.state==='wander'&&night()&&!mom){ const h=homeOf(a); if(h&&Math.hypot(h.x-a.x,h.z-a.z)<FLEE_R*2){ b=h; fast=false; } }
  const tail=a.g.userData.tail; if(tail) tail.rotation.x=b&&fast||a.state==='flee'?1.45:0.5;   // auf der Flucht steht der Schwanz senkrecht
  if(!b) return false;
  const dx=b.x-a.x, dz=b.z-a.z, d=Math.hypot(dx,dz);
  if(d<ENTER_R+a.rad*0.5){ enter(a,b); return true; }
  const spd=a.sp.spd*(fast?1:0.35);
  moveAnimal(a,dx,dz,spd,dt);
  a.g.position.set(a.x,H(a.x,a.z),a.z);
  return true;
}

export { BURROWS, burrowSeek, burrowWait };
