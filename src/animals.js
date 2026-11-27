// LeoLife – Alle Tiere der Welt: Anlegen pro Gebiet, Platzieren und Herden bilden.
import { SPECIES, TRAITS } from './data.js';
import { scene } from './engine.js';
import { buildBaboon, buildCroc, buildElephant, buildHippo, buildQuad, buildSnake, makeFur } from './models.js';
import { P } from './player.js';
import { REG } from './save.js';
import { PONDS } from './terrain.js';
import { rnd } from './util.js';
import { dropOrbs } from './effects.js';

/* ---------- Tierarten ---------- */
// ring: Abstand vom Zentrum. hunt: jagt Spieler unter dieser Stufe. fight: wehrt sich.
const animals=[];
const HIPPO_POND_R=18;   // Nilpferde leben nur in Wasserlöchern ab diesem Radius
/** Großes Wasserloch für ein Nilpferd im Startgebiet: verteilt auf die großen Wasserlöcher, das größte zuerst */
function hippoPond(a){
  const big=PONDS.filter(q=>q.r>=HIPPO_POND_R), pool=big.length?big:PONDS.slice().sort((x,y)=>y.r-x.r).slice(0,1);
  const n=q=>animals.filter(o=>o!==a&&o.sp.hippo&&!o.juv&&o.pond===q).length;
  return pool.slice().sort((x,y)=>n(x)-n(y)||y.r-x.r)[0];
}
const JUV=0.55, JUV_HP=0.35;   // Jungtiere: Größe und Lebenspunkte im Verhältnis zu den Eltern
function placeAnimal(a){
  const sp=a.sp; let x,z,tries=0;
  do{ const r=rnd(sp.ring[0],sp.ring[1]), an=Math.random()*6.283; x=Math.cos(an)*r; z=Math.sin(an)*r; tries++; }
  while(tries<20 && Math.hypot(x-P.x,z-P.z)<45);
  if(a.juv){ const mom=a.mom&&!a.mom.dead?a.mom:animals.find(o=>o.sp===sp&&!o.juv&&!o.dead);   // Junge bleiben bei ihrer Mutter
    if(mom){ if(mom!==a.mom){ if(a.mom&&a.mom.kids) a.mom.kids=a.mom.kids.filter(k=>k!==a); a.mom=mom; (mom.kids||(mom.kids=[])).push(a); } x=mom.x+rnd(-3,3); z=mom.z+rnd(-3,3); } }
  if(a.herd){ for(const m of a.herd){ if(m!==a&&!m.dead&&Math.hypot(m.x-P.x,m.z-P.z)>45){ x=m.x+rnd(-6,6); z=m.z+rnd(-6,6); break; } } }
  if(sp.croc&&PONDS.length){ const free=PONDS.filter(q=>!animals.some(o=>o!==a&&o.sp.croc&&o.pond===q)), pool=free.length?free:PONDS;   // möglichst jedes Krokodil in einem eigenen Wasserloch
    a.pond=sp.boss?PONDS.reduce((m,q)=>q.r>m.r?q:m):pool[Math.floor(Math.random()*pool.length)]; const an=Math.random()*6.283, rr=Math.random()*a.pond.r*0.5; x=a.pond.x+Math.cos(an)*rr; z=a.pond.z+Math.sin(an)*rr; }
  if(sp.hippo&&PONDS.length){   // Nilpferde: nur in großen Wasserlöchern, Junge bei der Mutter
    a.pond=a.juv&&a.mom&&a.mom.pond?a.mom.pond:a.world&&a.pond?a.pond:hippoPond(a);
    if(a.pond){ const an=Math.random()*6.283, rr=Math.random()*a.pond.r*0.5; x=a.pond.x+Math.cos(an)*rr; z=a.pond.z+Math.sin(an)*rr; } }
  if(a.carc&&a.carc.orbs) dropOrbs(a.carc.orbs); a.carc=null; a.g.rotation.z=0;
  a.x=x; a.z=z; a.hp=sp.hp*(a.juv?JUV_HP:1); a.thirst=100; a.drinkPond=null; a.state='wander'; a.tx=x; a.tz=z; a.timer=0; a.aggro=0; a.lost=0; a.fleeT=0; a.cd=0; a.rest=0; a.stun=0; a.sus=0; a.near=false; a.dead=false; a.sy=null; a.ph=Math.random()*6; if(sp.croc||sp.snake) a.state='lurk'; if(sp.hippo){ a.state='wade'; a.idle=0; a.calmT=0; }
  if(sp.friend){ const ks=Object.keys(TRAITS); a.trait=ks[Math.floor(Math.random()*ks.length)]; }   // Erbanlage, die dieser Leopard weitergeben würde
  a.g.visible=true;
}
SPECIES.forEach(sp=>{ const cnt=(REG.counts&&REG.counts[sp.id]!==undefined)?REG.counts[sp.id]:sp.count, population=cnt>0?Math.max(1,Math.floor(cnt*0.8)):0; for(let i=0;i<population;i++){ const fur=makeFur(), g=sp.croc?buildCroc(sp.m,fur):sp.snake?buildSnake(sp.m,fur):sp.baboon?buildBaboon(sp.m,fur):sp.elephant?buildElephant(sp.m,fur):sp.hippo?buildHippo(sp.m,fur):buildQuad(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g); const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:animals.length}; placeAnimal(a); animals.push(a); } });
// Herden; Arten mit sp.troop (Paviane, Elefanten) bilden größere Gruppen
SPECIES.filter(sp=>sp.troop||['capy','deer','anti'].includes(sp.id)).forEach(sp=>{ const L=animals.filter(a=>a.sp===sp), [lo,hi]=sp.troop||[3,4];
  for(let i=0;i<L.length;){ let n=Math.min(L.length-i,lo+Math.floor(Math.random()*(hi-lo+1))); if(sp.troop&&L.length-i-n<lo) n=L.length-i; const grp=L.slice(i,i+n);
    grp.forEach((a,j)=>{ a.herd=grp; if(j>0){ a.x=grp[0].x+rnd(-6,6); a.z=grp[0].z+rnd(-6,6); a.tx=a.x; a.tz=a.z; } }); i+=n; } });

/* Jungtiere: folgen ihrer Mutter. Wehrhafte Eltern (sp.guard) verteidigen sie – wer den Kleinen zu nahe kommt, wird angegriffen. */
SPECIES.forEach(sp=>{ if(!sp.young) return; const moms=animals.filter(a=>a.sp===sp&&!a.juv); if(!moms.length) return;
  const n=Math.min(sp.young,moms.length+1);
  // Junge gleichmäßig über die Mütter (und so über alle Herden) verteilen
  for(let i=0;i<n;i++){ const mom=moms[Math.floor(i*moms.length/n)%moms.length], fur=makeFur(), g=sp.baboon?buildBaboon(sp.m,fur):sp.elephant?buildElephant(sp.m,fur):sp.hippo?buildHippo(sp.m,fur):buildQuad(sp.m,fur); g.scale.setScalar(sp.size*JUV); scene.add(g);
    const a={sp,g,fur,rad:sp.size*JUV*0.8+0.25,uid:animals.length,juv:true,mom}; (mom.kids||(mom.kids=[])).push(a); placeAnimal(a); animals.push(a); } });

export { HIPPO_POND_R, animals, placeAnimal };
