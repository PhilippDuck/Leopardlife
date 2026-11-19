// LeopardLife – Partnersuche, Paarung, Junges (Füttern, Wachsen, Überfälle) und Weiterleben als Junges.
import { animals, placeAnimal } from './animals.js';
import { snd } from './audio.js';
import { ICOL, QUAL, TRAITS, ico } from './data.js';
import { puff } from './effects.js';
import { scene } from './engine.js';
import { keys } from './input.js';
import { animLegs, buildQuad, furName, makeFur } from './models.js';
import { P, dropModel, players } from './player.js';
import { quality } from './quality.js';
import { D, S, has, save } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { $, rnd } from './util.js';
import { canMate, fam, famPlace, renderBirthChoices } from './kin.js';
import { eatFood } from './life.js';
import { canSleepNow, sleepOnTree } from './daynight.js';
import { nearCarcass, recordPartner, takeMeat } from './carcass.js';
import { goalEvent } from './goals.js';
import { moveAnimal } from './ai.js';
import { nameOf, viewMin } from './coop.js';
import { canPair, ensureKin, litterLeaves, litterSize, newId, pairCandidate, pairPlayers, related } from './kinship.js';

/* ---------- Familie: Partner, Junges, Futter, Überfälle ---------- */
const FOOD_MAX=20, CUB_HOME={x:7,z:5};
const cub={x:7,z:5,tx:7,tz:5,t:0,ph:0,mewT:6,saveT:10};
let cubG=null;
const CUBSPEC={col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.5,ears:0.17,tail:1.0,tailTip:0x2a1c10,spots:1};
function rebuildCub(){ dropModel(cubG); cubG=buildQuad(CUBSPEC,(S.cub&&S.cub.fur)||null); cubG.userData.blob.visible=!QUAL[quality].sh; cubG.visible=false; scene.add(cubG); }
rebuildCub();
G.raider=null; G.raidT=rnd(90,130)*D().raid; G.heirPending=false;
const cubGrown=()=>!!S.cub&&S.cub.grow>=1;
const seeking=()=>canMate()&&!S.partner;
const heirLevel=()=>1+Math.floor(Math.min(1,S.cub.grow)*7);
function nearestMate(){ let b=null, bd=1e9; for(const a of (S.partner?[fam[0]]:fam.slice(3))){ if(S.partner&&!a.famOn) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; b=a; } } return b?{a:b,d:bd}:null; }
function context(){
  if(P.dead||G.paused) return null;
  if(P.tree!=null) return (P.safe&&P.climbT>=1&&canSleepNow())?{label:P.wantSleep?'Wartet auf die anderen …':players.some(o=>o!==P&&o.wantSleep)?'Schlafen (die anderen warten)':'Schlafen',fn:()=>sleepOnTree(P)}:null;
  if(S.cub&&!cubGrown()&&S.food>0&&S.cub.full<97&&Math.hypot(cub.x-P.x,cub.z-P.z)<4.5) return {label:'Füttern',fn:feedCub};
  { const cc=nearCarcass(); if(cc){ if(S.cub&&S.cub.grow<1&&S.food<FOOD_MAX) return {label:'Fleisch mitnehmen',fn:()=>takeMeat(cc,true)}; if(S.hunger<90&&P.eatC!==cc) return {label:'Fressen ('+cc.carc.meat+' Bissen übrig)',fn:()=>takeMeat(cc,false)}; } }
  if(S.food>0&&S.hunger<50) return {label:'Fressen',fn:eatFood};
  { const q=pairCandidate(P); if(q){ if(canPair(P,q)) return {label:'Paaren mit '+nameOf(q),fn:()=>pairPlayers(P,q)}; if(related(P.L,q.L)&&canMate()) return {label:'Verwandt – keine Paarung',fn:()=>pairPlayers(P,q)}; } }
  if(canMate()){ const m=nearestMate(); if(m&&m.d<4.5) return {label:'Paaren',fn:()=>mateWith(m.a)}; }
  return null;
}
function doContext(){ const c=context(); if(c) c.fn(); }
/** Fell eines Jungen: Mischung aus den Fellen der Eltern mit etwas Zufall; Albino und Schwarz bleiben selten, schwarze Eltern vererben öfter */
function cubFur(ids){
  const fs=[S,...Object.values(S.mates||{})].filter(L=>L&&L.id&&ids.indexOf(L.id)>=0&&L.fur).map(L=>L.fur);
  if(fs.length<2&&S.partner&&fam[0].fur) fs.push(fam[0].fur);
  const f=makeFur(); if(!fs.length) return f;
  const mix=k=>{ const v=fs.reduce((x,o)=>x+(o[k]||1),0)/fs.length; return v*(0.92+Math.random()*0.16); };
  f.l=mix('l'); f.s=mix('s'); f.sn=mix('sn'); f.ss=mix('ss');
  if(!f.albino&&!f.melan&&fs.some(o=>o.melan)&&Math.random()<0.25) f.melan=true;
  return f;
}
function mateWith(a){
  if(!S.partner){ S.partner=true; S.partnerId=newId(); famPlace(fam[0],a.x,a.z,a.fur); recordPartner(S.partnerId,a.fur,S.gen||1); if(a!==fam[0]) placeAnimal(a); }   // der gewählte Leopard (mit seinem Fell) bleibt als Partner   // der gewählte Leopard bleibt als Partner (fremd, eigene Kennung)
  S.preg=25; save(); snd.purr();
  puff(P.x,P.y+1.2,P.z,0xff7ab8,8,0.45); puff(a.x,H(a.x,a.z)+1.2,a.z,0xff7ab8,8,0.45);
  toast('Ihr habt euch gepaart. Dein Partner bleibt bei dir; im Bau kommt bald euer Junges zur Welt.','#ff9ad0');
}
function feedCub(){
  const c=S.cub, n=Math.min(S.food,Math.ceil((100-c.full)/12)); if(n<=0) return;
  const was=c.grow;
  goalEvent('feed',n); S.food-=n; c.full=Math.min(100,c.full+n*12); c.hp=Math.min(1,c.hp+n*0.08); c.grow=Math.min(1,c.grow+n*0.025);
  puff(cub.x,H(cub.x,cub.z)+0.8,cub.z,0xff7ab8,8,0.4); snd.eat();
  floatText('+'+n+' Futter',cub.x,H(cub.x,cub.z)+1.2,cub.z,'#ff9ad0');
  if(was<1&&c.grow>=1){ toast('Dein Junges ist ausgewachsen! Es braucht kein Futter mehr und ist dein Erbe.','#ff9ad0'); snd.level(); if(G.raider) endRaid(G.raider); }
  save();
}
function cubDies(how){
  S.cub=null; S.food=0; if(G.raider) endRaid(G.raider); save(); snd.death();
  toast('Dein Junges '+how+'. Du kannst dir wieder einen Partner suchen.','#ff8a70');
}
function endRaid(a){ a.state='wander'; a.timer=0; a.sus=0; a.scared=8; if(G.raider===a) G.raider=null; }
function startRaid(){
  G.raidT=rnd(120,200)*D().raid;
  const cand=animals.filter(a=>!a.dead&&(a.sp.id==='jack'||a.sp.id==='hyena')&&a.state==='wander'&&Math.hypot(a.x-P.x,a.z-P.z)>80);
  if(!cand.length){ G.raidT=20; return; }
  const a=cand[Math.floor(Math.random()*cand.length)];
  let an=Math.random()*6.283;
  if(Math.hypot(P.x-CUB_HOME.x,P.z-CUB_HOME.z)<110) an=Math.atan2(CUB_HOME.z-P.z,CUB_HOME.x-P.x)+rnd(-0.7,0.7);   // kommt von der dem Spieler abgewandten Seite
  a.x=CUB_HOME.x+Math.cos(an)*75; a.z=CUB_HOME.z+Math.sin(an)*75;
  a.state='raid'; a.found=false; a.raidS=0; a.roll=0; a.timer=0; a.sus=0; a.stun=0; a.aggro=0; a.hp=a.sp.hp;
  // Familienmitglieder am Bau sind nicht immer da: bei jedem zweiten Überfall sind sie auf der Jagd
  const guards=fam.slice(0,3).some(f=>f.famOn); a.pAway=!guards||Math.random()<0.5;
  G.raider=a; snd.alert();
  toast('Achtung: Ein'+(a.sp.id==='hyena'?'e ':' ')+a.sp.n+' schleicht sich an dein Junges heran!'+(guards?(a.pAway?' Deine Familie ist auf der Jagd – du musst selbst eingreifen.':' Deine Familie am Bau stellt sich ihm entgegen.'):''),'#ff8a70');
}
function raidStep(a,dt){
  const sp=a.sp, c=S.cub;
  if(!c||c.grow>=1){ endRaid(a); return; }
  const cx=cub.x-a.x, cz=cub.z-a.z, cd=Math.hypot(cx,cz);
  if(!a.found){
    if(cd>10) moveAnimal(a,cx,cz,sp.spd*0.65,dt);
    else {
      a.raidS+=dt; a.timer-=dt;
      if(a.timer<=0){ const an=Math.random()*6.283, r=rnd(3,9); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(1.5,3); }
      moveAnimal(a,a.tx-a.x,a.tz-a.z,sp.spd*0.3,dt);
      // Ein sattes Junges bleibt still und wird selten gefunden, ein hungriges ruft und verrät sich
      a.roll+=dt; if(a.roll>=1){ a.roll=0; if(Math.random()<0.02+0.12*(1-c.full/100)){ a.found=true; snd.alert(); toast('Dein Junges wurde entdeckt – vertreib den Räuber!','#ff8a70'); } }
      if(!a.found&&a.raidS>22){ endRaid(a); toast('Der Räuber hat dein Junges nicht gefunden und zieht ab.','#9be07f'); }
    }
  } else if(cd>a.rad+0.7) moveAnimal(a,cx,cz,sp.spd*0.85,dt);
  else {
    animLegs(a.g,a.ph,0.05);
    if(a.cd<=0){ a.cd=1.2; c.hp-=0.07; puff(cub.x,H(cub.x,cub.z)+0.5,cub.z,0xc0392b,4,0.4); if(Math.hypot(P.x-cub.x,P.z-cub.z)<70) snd.mew(); if(c.hp<=0) cubDies('wurde getötet'); }
  }
}
function updateCub(dt){
  if(G.raider&&(G.raider.dead||G.raider.state!=='raid')) G.raider=null;
  if(S.preg>0){ S.preg-=dt; if(S.preg<=0){ S.preg=0; { const ks=Object.keys(TRAITS).filter(t=>!has(t)); S.cub={full:70,grow:0,hp:1,trait:ks[Math.floor(Math.random()*ks.length)],n:litterSize(),gen:(S.gen||1)+1,parents:(S.litterParents||[ensureKin(S).id,S.partnerId||'wild']).slice()}; S.cub.fur=cubFur(S.cub.parents); S.litterParents=null; if(S.cub.trait==='dunkel'&&!S.cub.fur.albino) S.cub.fur.l=Math.min(S.cub.fur.l,0.66); rebuildCub();
      $('birthTrait').innerHTML=ico(S.cub.trait,ICOL.t,16)+' Erbanlage: '+TRAITS[S.cub.trait][0]+' ('+TRAITS[S.cub.trait][1]+') · Fell: '+furName(S.cub.fur); } cub.x=CUB_HOME.x; cub.z=CUB_HOME.z; cub.t=0; G.raidT=rnd(90,130)*D().raid; save(); snd.mew();
    $('birthTitle').textContent=S.cub.n>1?'Euer Wurf ist geboren: '+S.cub.n+' Junge':'Dein Junges ist geboren';
    $('birthCoop').style.display=S.cub.n>1?'block':'none';
    { const b=$('btnBeCub'); b.disabled=false; b.textContent='Als Junges spielen'; } renderBirthChoices();
    $('birth').style.display='flex'; G.paused=true; for(const k in keys) keys[k]=false; G.joyX=G.joyY=0; if(document.exitPointerLock) document.exitPointerLock(); } }
  const c=S.cub; if(!c){ cubG.visible=false; return; }
  cubG.visible=true;
  if(c.grow>=1&&c.taken){ litterLeaves(); cubG.visible=false; return; }   // übrige Geschwister eines Spieler-Jungen ziehen weiter
  if(c.grow<1){
    c.full=Math.max(0,c.full-dt*0.28*D().hunger);
    if(c.full<=0){ c.hp-=dt*0.012; if(c.hp<=0){ cubDies('ist verhungert'); return; } }
    else if(c.hp<1&&!G.raider) c.hp=Math.min(1,c.hp+dt*0.01);
    if(c.full<25){ cub.mewT-=dt; if(cub.mewT<=0){ cub.mewT=rnd(6,11); if(Math.hypot(P.x-cub.x,P.z-cub.z)<60) snd.mew(); } }
    G.raidT-=dt; if(G.raidT<=0&&!G.raider) startRaid();
  }
  cub.t-=dt; if(cub.t<=0){ const an=Math.random()*6.283, r=rnd(0,4); cub.tx=CUB_HOME.x+Math.cos(an)*r; cub.tz=CUB_HOME.z+Math.sin(an)*r; cub.t=rnd(3,9); }
  const dx=cub.tx-cub.x, dz=cub.tz-cub.z, d=Math.hypot(dx,dz);
  if(d>0.3){ const v=1.3*dt/d; cub.x+=dx*v; cub.z+=dz*v; cubG.rotation.y=Math.atan2(dx,dz); cub.ph+=dt*9; animLegs(cubG,cub.ph,0.45); } else animLegs(cubG,cub.ph,0.03);
  cubG.scale.setScalar(0.26+0.74*Math.min(1,c.grow)); cubG.position.set(cub.x,H(cub.x,cub.z),cub.z);
  cub.saveT-=dt; if(cub.saveT<=0){ cub.saveT=10; save(); }
}
// Partnersuche: Pfeil und Hinweis nur in den ersten 15 s, danach nur noch der rosa Punkt auf der Spürkarte
let seekT=0;
function updateFamArrow(dt){
  if(canMate()) seekT+=dt||0; else seekT=0;
  const el=$('famArrow'); let tx=null, tz=null;
  if(S.cub&&!cubGrown()&&(G.raider||S.cub.full<20)){ tx=cub.x; tz=cub.z; }
  else if(canMate()&&seekT<15){ const m=nearestMate(); if(m){ tx=m.a.x; tz=m.a.z; } }
  if(tx===null||Math.hypot(tx-P.x,tz-P.z)<9){ el.style.display='none'; return; }
  const dx=tx-P.x, dz=tz-P.z, s=Math.sin(P.cam.yaw), c=Math.cos(P.cam.yaw), ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c)), R=viewMin(P)*0.27;
  el.style.display='block'; el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale(0.8)';
}

export { CUB_HOME, FOOD_MAX, context, cub, doContext, endRaid, heirLevel, raidStep, seekT, seeking, updateCub, updateFamArrow };
export { rebuildCub, feedCub };
