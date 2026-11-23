// LeopardLife – Vögel der Savanne: Geier kreisen über Kadavern, landen und fressen davon.
import { animals } from './animals.js';
import { P } from './player.js';
import { scene } from './engine.js';
import { H } from './terrain.js';
import { rnd } from './util.js';

const COUNT=5, vultures=[];
function wing(side,mat){
  const s=new THREE.Shape(); s.moveTo(0,0); s.lineTo(side*1.5,0.28); s.lineTo(side*2.7,0.22); s.lineTo(side*2.15,-0.18); s.lineTo(side*1.85,-0.04); s.lineTo(side*1.55,-0.3); s.lineTo(side*1.32,-0.1); s.lineTo(side*1.02,-0.36); s.lineTo(side*0.76,-0.12); s.lineTo(side*0.32,-0.08); s.closePath();
  const g=new THREE.Mesh(new THREE.ShapeGeometry(s),mat); g.rotation.x=-Math.PI/2; g.castShadow=false; return g;
}
function makeVulture(i){
  const root=new THREE.Group(), dark=new THREE.MeshStandardMaterial({color:0x342d26,roughness:0.9,side:THREE.DoubleSide}), pale=new THREE.MeshStandardMaterial({color:0x796b57,roughness:0.85}), headMat=new THREE.MeshStandardMaterial({color:0xb4a07c,roughness:0.8}), beakMat=new THREE.MeshStandardMaterial({color:0xc4a13c,roughness:0.7});
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.34,8,6),dark); body.scale.set(1.55,0.75,0.9); root.add(body);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.15,0.48,6),headMat); neck.position.set(0,0.23,0.29); neck.rotation.x=-0.65; root.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.13,7,5),headMat); head.position.set(0,0.46,0.46); root.add(head);
  const beak=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.2,5),beakMat); beak.position.set(0,0.42,0.62); beak.rotation.x=-Math.PI/2; root.add(beak);
  const left=wing(-1,dark),right=wing(1,dark); left.position.set(-0.22,0.13,0); right.position.set(0.22,0.13,0); root.add(left,right);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.65,5),pale); tail.position.set(0,0,-0.55); tail.rotation.x=-Math.PI/2; root.add(tail);
  root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.frustumCulled=false;}}); scene.add(root);
  const an=i*2.4,r=45+i*9; return {g:root,left,right,x:P.x+Math.cos(an)*r,z:P.z+Math.sin(an)*r,alt:18+i%3*2,angle:an,r,phase:i*1.7,state:'air',target:null,wait:rnd(1,8),eat:0,landX:0,landZ:0};
}
for(let i=0;i<COUNT;i++) vultures.push(makeVulture(i));

function chooseCarcass(v){
  let best=null,bd=Infinity;
  for(const a of animals){ if(!a.dead||!a.carc||a.carc.meat<=0||a.carc.tree!=null) continue;
    const assigned=vultures.filter(o=>o.target===a&&o.state!=='air').length; if(assigned>=3) continue;
    const d=Math.hypot(a.x-v.x,a.z-v.z); if(d<bd){bd=d;best=a;} }
  return best;
}
function updateVulture(v,dt){
  if(!v.target||!v.target.dead||!v.target.carc||v.target.carc.meat<=0||v.target.carc.tree!=null){ v.target=chooseCarcass(v); v.state='air'; v.wait=rnd(2,8); }
  const c=v.target;
  if(c){
    if(v.state==='air') v.state='circle';
    if(v.state==='circle'){
      v.angle+=dt*0.34; const tx=c.x+Math.cos(v.angle)*9,tz=c.z+Math.sin(v.angle)*9;
      v.x+=(tx-v.x)*Math.min(1,dt*0.8); v.z+=(tz-v.z)*Math.min(1,dt*0.8); v.alt=14+Math.sin(v.angle*2+v.phase)*1.8; v.wait-=dt;
      if(v.wait<=0){v.state='land';v.landX=c.x+Math.cos(v.angle)*2.8;v.landZ=c.z+Math.sin(v.angle)*2.8;}
    } else if(v.state==='land'){
      const dx=v.landX-v.x,dz=v.landZ-v.z,d=Math.hypot(dx,dz); if(d>0.4){const step=Math.min(d,dt*2.8);v.x+=dx/d*step;v.z+=dz/d*step;v.alt=Math.max(0,v.alt-dt*5);}
      else {v.state='feed';v.alt=0;v.eat=0;}
    } else if(v.state==='feed'){
      if(Math.hypot(v.x-c.x,v.z-c.z)>5){v.state='air';}
      else {v.eat+=dt;c.carc.t=Math.max(c.carc.t,25);if(v.eat>=2.8){v.eat=0;c.carc.meat=Math.max(0,c.carc.meat-1);}}
    }
  } else {
    v.angle+=dt*0.045; const cx=P.x+Math.cos(v.phase)*26,cz=P.z+Math.sin(v.phase)*26,tx=cx+Math.cos(v.angle)*v.r,tz=cz+Math.sin(v.angle)*v.r;
    v.x+=(tx-v.x)*Math.min(1,dt*0.45);v.z+=(tz-v.z)*Math.min(1,dt*0.45);v.alt=20+Math.sin(v.angle+v.phase)*2;
  }
  v.g.position.set(v.x,H(v.x,v.z)+(v.alt>0?v.alt:0.35),v.z); v.g.rotation.y=Math.atan2(c?c.x-v.x:P.x-v.x,c?c.z-v.z:P.z-v.z);
  const flap=v.state==='feed'?0:Math.sin(performance.now()/75+v.phase)*0.55;
  v.left.rotation.x=-Math.PI/2+flap;v.right.rotation.x=-Math.PI/2-flap;
  if(v.state==='feed') v.g.rotation.x=0.12; else v.g.rotation.x=0;
}
function updateBirds(dt){ for(const v of vultures) updateVulture(v,dt); }

export { updateBirds };
