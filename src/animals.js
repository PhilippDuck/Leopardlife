// LeopardLife – Alle Tiere der Welt: Anlegen pro Gebiet, Platzieren und Herden bilden.
import { SPECIES, TRAITS } from './data.js';
import { scene } from './engine.js';
import { buildQuad, makeFur } from './models.js';
import { P } from './player.js';
import { REG } from './save.js';
import { PONDS } from './terrain.js';
import { rnd } from './util.js';
import { dropOrbs } from './effects.js';

/* ---------- Tierarten ---------- */
// ring: Abstand vom Zentrum. hunt: jagt Spieler unter dieser Stufe. fight: wehrt sich.
const animals=[];
function placeAnimal(a){
  const sp=a.sp; let x,z,tries=0;
  do{ const r=rnd(sp.ring[0],sp.ring[1]), an=Math.random()*6.283; x=Math.cos(an)*r; z=Math.sin(an)*r; tries++; }
  while(tries<20 && Math.hypot(x-P.x,z-P.z)<45);
  if(a.herd){ for(const m of a.herd){ if(m!==a&&!m.dead&&Math.hypot(m.x-P.x,m.z-P.z)>45){ x=m.x+rnd(-6,6); z=m.z+rnd(-6,6); break; } } }
  if(sp.croc&&PONDS.length){ a.pond=sp.boss?PONDS.reduce((m,q)=>q.r>m.r?q:m):PONDS[Math.floor(Math.random()*PONDS.length)]; const an=Math.random()*6.283, rr=Math.random()*a.pond.r*0.5; x=a.pond.x+Math.cos(an)*rr; z=a.pond.z+Math.sin(an)*rr; }
  if(a.carc&&a.carc.orbs) dropOrbs(a.carc.orbs); a.carc=null; a.g.rotation.z=0;
  a.x=x; a.z=z; a.hp=sp.hp; a.state='wander'; a.tx=x; a.tz=z; a.timer=0; a.aggro=0; a.lost=0; a.fleeT=0; a.cd=0; a.stun=0; a.sus=0; a.near=false; a.dead=false; a.ph=Math.random()*6; if(sp.croc) a.state='lurk';
  if(sp.friend){ const ks=Object.keys(TRAITS); a.trait=ks[Math.floor(Math.random()*ks.length)]; }   // Erbanlage, die dieser Leopard weitergeben würde
  a.g.visible=true;
}
SPECIES.forEach(sp=>{ const cnt=(REG.counts&&REG.counts[sp.id]!==undefined)?REG.counts[sp.id]:sp.count; for(let i=0;i<cnt;i++){ const fur=makeFur(), g=buildQuad(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g); const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:animals.length}; placeAnimal(a); animals.push(a); } });
['capy','deer','anti'].forEach(id=>{ const L=animals.filter(a=>a.sp.id===id);
  for(let i=0;i<L.length;){ const n=Math.min(L.length-i,3+Math.floor(Math.random()*2)), grp=L.slice(i,i+n);
    grp.forEach((a,j)=>{ a.herd=grp; if(j>0){ a.x=grp[0].x+rnd(-6,6); a.z=grp[0].z+rnd(-6,6); a.tx=a.x; a.tz=a.z; } }); i+=n; } });

export { animals, placeAnimal };
