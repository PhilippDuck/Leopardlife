// LeopardLife – Partnersuche, Paarung, Junges (Füttern, Wachsen, Überfälle) und Weiterleben als Junges.
import { animals, placeAnimal } from './animals.js';
import { snd, snd3d } from './audio.js';
import { ICOL, QUAL, TRAITS, ico } from './data.js';
import { puff } from './effects.js';
import { scene } from './engine.js';
import { keys } from './input.js';
import { animLegs, buildQuad, furName, makeFur } from './models.js';
import { P, dropModel, players } from './player.js';
import { quality } from './quality.js';
import { D, S, has, save, tlvOf } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { $, rnd } from './util.js';
import { canMate, fam, famPlace, renderBirthChoices } from './kin.js';
import { eatFood } from './life.js';
import { canSleepNow, sleepOnTree } from './daynight.js';
import { carcassContext, endCarcass, nearCarcass, recordPartner, takeMeat } from './carcass.js';
import { goalEvent } from './goals.js';
import { moveAnimal } from './ai.js';
import { nameOf, tell, viewMin } from './coop.js';
import { canPair, ensureKin, litterLeaves, litterSize, newId, pairCandidate, pairPlayers, related } from './kinship.js';
import { DEN_CAP, SWITCH_AT, cubFollowContext, denCount, denFull, denKids, followerOf, hasOwnCub, kidDies, kidOf, kidsOf, numOf, syncLitter, tickKids } from './cubfollow.js';
import { drinkContext } from './thirst.js';

/* ---------- Familie: Partner, Junges, Futter, Überfälle ---------- */
const FOOD_MAX=20, CUB_HOME={x:7,z:5};
const cub={x:7,z:5,tx:7,tz:5,t:0,ph:0,mewT:6,saveT:10,away:false};
let cubG=null;
const CUBSPEC={col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.5,ears:0.17,tail:1.0,tailTip:0x2a1c10,spots:1};
const sibG=[];   // Geschwister im Bau: je Junges im Wurf ein eigenes Modell (das erste ist cubG)
function rebuildCub(){ dropModel(cubG); cubG=buildQuad(CUBSPEC,(S.cub&&S.cub.fur)||null); cubG.userData.blob.visible=!QUAL[quality].sh; cubG.visible=false; scene.add(cubG);
  while(sibG.length) dropModel(sibG.pop());
  for(let i=1;i<4;i++){ const g=buildQuad(CUBSPEC,(S.cub&&S.cub.fur)?Object.assign({},S.cub.fur,{l:S.cub.fur.l*(0.94+i*0.04)}):null); g.userData.blob.visible=!QUAL[quality].sh; g.visible=false; scene.add(g); sibG.push(g); } }
/** Geschwister neben dem ersten Jungen im Bau zeigen: so viele, wie noch im Bau sind */
function updateSibs(c,dt){
  const dk=c?denKids():[], n=dk.length;
  sibG.forEach((g,i)=>{ const on=i+1<n; g.visible=on; if(!on) return;
    const an=i*2.1+0.6+Math.sin(performance.now()/4000+i)*0.3, x=cub.x+Math.sin(an)*1.1, z=cub.z+Math.cos(an)*1.1;
    g.scale.setScalar(0.34+0.66*Math.min(1,dk[i+1][1].grow)); g.position.set(x,H(x,z),z); g.rotation.y=an+Math.PI+Math.sin(performance.now()/1500+i)*0.4;
    animLegs(g,performance.now()/700+i,0.04); });
}
rebuildCub();
G.raider=null; G.raidT=rnd(90,130)*D().raid; G.heirPending=false;
const cubGrown=()=>!!S.cub&&Object.values(kidsOf()).every(k=>k.grow>=1);
/** Sucht Spieler p gerade einen Partner? (ab Stufe 8, kein Wurf unterwegs; Spieler 1 nicht, wenn sein Partner schon am Bau ist) */
const playerSeeks=p=>!!p&&!p.dead&&p.L.lvl>=8&&!kidOf(p)&&!(S.preg>0)&&(p!==P||!S.partner);
/** Wilde Leoparden zeigen sich, solange irgendein Spieler einen Partner sucht */
const seeking=()=>players.some(playerSeeks);
/** Nächster wilder Leopard bei Spieler p */
function nearestWild(p){ let b=null, bd=1e9; for(const a of fam.slice(3)){ if(!a.g.visible) continue; const d=Math.hypot(a.x-p.x,a.z-p.z); if(d<bd){ bd=d; b=a; } } return b?{a:b,d:bd}:null; }
/** Mitspieler p paart sich mit einem wilden Leoparden: der Wurf kommt im gemeinsamen Bau zur Welt, der Wilde zieht weiter */
function mateWild(p,a){
  if(!playerSeeks(p)) return;
  const wid=newId(); S.litterTrait=a.trait||''; S.litterParents=[ensureKin(p.L).id,wid]; S.preg=25;
  recordPartner(wid,a.fur,p.L.gen||1); save(); snd.purr();
  puff(p.x,p.y+1.2,p.z,0xff7ab8,8,0.45); puff(a.x,H(a.x,a.z)+1.2,a.z,0xff7ab8,8,0.45); placeAnimal(a);
  toast(nameOf(p)+' hat sich mit einem wilden Leoparden gepaart. Im Bau kommt bald der Wurf zur Welt.','#ff9ad0');
}
/** Spieler p ist nah genug an einem Jungen zum Füttern: am Bau oder bei seinem mitlaufenden */
const nearCub=p=>(denCount()>0&&Math.hypot(cub.x-p.x,cub.z-p.z)<4.5)||(()=>{ const f=followerOf(p); return !!f&&Math.hypot(f.x-p.x,f.z-p.z)<4.5; })();
function nearestMate(){ let b=null, bd=1e9; for(const a of (S.partner?[fam[0]]:fam.slice(3))){ if(S.partner&&!a.famOn) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; b=a; } } return b?{a:b,d:bd}:null; }
function context(){
  if(P.dead||G.paused) return null;
  { const cx=carcassContext(P); if(cx) return cx; }
  if(P.tree!=null) return (P.safe&&P.climbT>=1&&canSleepNow())?{label:P.wantSleep?'Wartet auf die anderen …':players.some(o=>o!==P&&o.wantSleep)?'Schlafen (die anderen warten)':'Schlafen',fn:()=>sleepOnTree(P)}:null;
  { const cf=cubFollowContext(P); if(cf) return cf; }
  if(S.cub&&!cubGrown()&&S.food>0&&denFull()<97&&nearCub(P)) return {label:'Füttern (Rest im Vorrat)',fn:feedCub};   // alte Spielstände: übrig gebliebener Vorrat
  if(S.food>0&&S.hunger<50) return {label:'Fressen',fn:eatFood};
  { const dr=drinkContext(P); if(dr) return dr; }
  { const q=pairCandidate(P); if(q){ if(canPair(P,q)) return {label:'Paaren mit '+nameOf(q),fn:()=>pairPlayers(P,q)}; if(related(P.L,q.L)&&canMate()) return {label:'Verwandt – keine Paarung',fn:()=>pairPlayers(P,q)}; } }
  if(canMate()){ const m=nearestMate(); if(m){ mateNotice(m);
    if(m.d<4.5){ const t=offerOf(m.a); return {label:'Paaren · Erbe: '+offerText(t),fn:()=>mateWith(m.a)}; } } }
  return null;
}
/** Erbanlage, die ein Leopard dem Jungen mitgeben würde: der eigene Partner seine gemerkte, ein wilder seine eigene */
function offerOf(a){ return a===fam[0]&&S.partner&&S.partnerTrait?S.partnerTrait:a.trait; }
/** „Flinke Läufe (+10 % Tempo)“ bzw. „… – hast du auch: verstärkt zu II“ */
function offerText(t,L=S){ if(!t||!TRAITS[t]) return 'unbekannt'; const lv=tlvOf(t,L);
  return TRAITS[t][0]+(lv>=3?' (hast du schon ganz stark)':lv>0?' – hast du auch: Junges erbt sie verstärkt ('+['','','II','III'][lv+1]+')':' ('+TRAITS[t][1]+')'); }
/** Wilder Leopard in der Nähe: einmal sagen, welches Erbe er mitbringt – so kann man sich den Partner aussuchen */
const seenMate=new Map();
function mateNotice(m){
  if(m.d>22||!m.a.trait) return; const now=performance.now(), last=seenMate.get(m.a)||0; if(now-last<90000) return; seenMate.set(m.a,now);
  toast('Leopard in der Nähe · Erbe: '+offerText(offerOf(m.a)),'#ff9ad0');
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
  S.litterTrait=offerOf(a)||'';
  if(!S.partner){ S.partner=true; S.partnerId=newId(); S.partnerTrait=a.trait||''; famPlace(fam[0],a.x,a.z,a.fur); recordPartner(S.partnerId,a.fur,S.gen||1); if(a!==fam[0]) placeAnimal(a); }   // der gewählte Leopard (mit seinem Fell) bleibt als Partner   // der gewählte Leopard bleibt als Partner (fremd, eigene Kennung)
  S.preg=25; save(); snd.purr();
  puff(P.x,P.y+1.2,P.z,0xff7ab8,8,0.45); puff(a.x,H(a.x,a.z)+1.2,a.z,0xff7ab8,8,0.45);
  toast('Ihr habt euch gepaart. Dein Partner bleibt bei dir; im Bau kommt bald euer Junges zur Welt.','#ff9ad0');
}
/** Kadaver mit Fleisch auf dem Boden am Bau (für die Jungen erreichbar), sonst null */
function denCarcass(){ let b=null, bd=14; for(const a of animals){ if(!a.dead||!a.carc||a.carc.meat<=0||a.carc.tree!=null) continue; const d=Math.hypot(a.x-CUB_HOME.x,a.z-CUB_HOME.z); if(d<bd){ bd=d; b=a; } } return b; }
/** Ein Junges im Bau nimmt einen Bissen vom Kadaver a: satt, wächst (im Bau bis 35 %, danach weiter ab halbstark) */
function cubEats(c,a){
  a.carc.meat--; goalEvent('feed',1);
  const kid=denKids().map(([,k])=>k).filter(k=>k.grow<1).sort((x,y)=>x.full-y.full)[0];   // das hungrigste frisst
  if(kid){ kid.full=Math.min(100,kid.full+12); kid.hp=Math.min(1,kid.hp+0.08); kid.grow=Math.min(kid.grow<SWITCH_AT?Math.max(kid.grow,DEN_CAP):1,kid.grow+0.025); }
  puff(a.x,H(a.x,a.z)+0.5,a.z,0xc0392b,3,0.3); snd3d(['eat'],cub.x,cub.z,0.6,40,1.35);
  if(a.carc.meat<=0){ endCarcass(a); a.g.visible=false; a.g.rotation.z=0; }
}
function feedCub(){
  const c=S.cub, n=Math.min(S.food,Math.ceil((100-denFull())/12)); if(n<=0) return;
  goalEvent('feed',n); S.food-=n; denKids().forEach(([,k])=>{ k.full=Math.min(100,k.full+n*12); k.hp=Math.min(1,k.hp+n*0.08); k.grow=Math.min(k.grow<SWITCH_AT?Math.max(k.grow,DEN_CAP):1,k.grow+n*0.025); });   // im Bau nur bis 35 %, den Rest bis halbstark lernt es auf der Jagd
  puff(cub.x,H(cub.x,cub.z)+0.8,cub.z,0xff7ab8,8,0.4); snd.eat();
  floatText('+'+n+' Futter',cub.x,H(cub.x,cub.z)+1.2,cub.z,'#ff9ad0');
  save();
}
function cubDies(how){
  const n=(S.cub&&S.cub.n)||1; S.cub=null; S.food=0; if(G.raider) endRaid(G.raider); save(); snd.death();
  const plural=n>1?how.replace(/^ist /,'sind ').replace(/^wurde /,'wurden '):'', msg=(n>1?'Eure Jungen '+plural:'Dein Junges '+how)+'. Ihr könnt euch wieder einen Partner suchen.';
  toast(msg,'#ff8a70'); players.forEach(q=>tell(q,msg,'#ff8a70'));
}
function endRaid(a){ a.state='wander'; a.timer=0; a.sus=0; a.scared=8; if(G.raider===a) G.raider=null; }
function startRaid(){
  G.raidT=rnd(120,200)*D().raid;
  if(denCount()<=0){ G.raidT=30; return; }   // alle Jungen sind unterwegs
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
  if(!c||c.grow>=1||denCount()<=0){ endRaid(a); return; }
  const cx=cub.x-a.x, cz=cub.z-a.z, cd=Math.hypot(cx,cz);
  if(!a.found){
    if(cd>10) moveAnimal(a,cx,cz,sp.spd*0.65,dt);
    else {
      a.raidS+=dt; a.timer-=dt;
      if(a.timer<=0){ const an=Math.random()*6.283, r=rnd(3,9); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(1.5,3); }
      moveAnimal(a,a.tx-a.x,a.tz-a.z,sp.spd*0.3,dt);
      // Ein sattes Junges bleibt still und wird selten gefunden, ein hungriges ruft und verrät sich
      a.roll+=dt; if(a.roll>=1){ a.roll=0; if(Math.random()<0.02+0.12*(1-denFull()/100)){ a.found=true; snd.alert(); toast('Dein Junges wurde entdeckt – vertreib den Räuber!','#ff8a70'); } }
      if(!a.found&&a.raidS>22){ endRaid(a); toast('Der Räuber hat dein Junges nicht gefunden und zieht ab.','#9be07f'); }
    }
  } else if(cd>a.rad+0.7) moveAnimal(a,cx,cz,sp.spd*0.85,dt);
  else {
    animLegs(a.g,a.ph,0.05);
    if(a.cd<=0){ a.cd=1.2; puff(cub.x,H(cub.x,cub.z)+0.5,cub.z,0xc0392b,4,0.4); snd3d(['mew'],cub.x,cub.z,1.3,90,1.3);
      for(const [k,kid] of denKids()){ kid.hp-=0.07; if(kid.hp<=0) kidDies(k,'wurde im Bau von einem Räuber getötet'); } }
  }
}
/**
 * Geburt: Jeder Spieler, der gerade kein eigenes Junges hat, bekommt eins. Gibt es schon Junge (z. B. das der Mitspielerin),
 * kommen die neuen dazu – mit eigener Größe, Erbanlage und Herkunft.
 */
function birth(){
  const ks=Object.keys(TRAITS).filter(t=>!has(t)), tr=S.litterTrait&&TRAITS[S.litterTrait]?S.litterTrait:ks[Math.floor(Math.random()*ks.length)]; S.litterTrait='';
  const parents=(S.litterParents||[ensureKin(S).id,S.partnerId||'wild']).slice(); S.litterParents=null;
  const pg=players.filter(q=>parents.indexOf(q.L.id)>=0).map(q=>q.L.gen||1), gen=1+(pg.length?Math.max(...pg):(S.gen||1));
  const fur=cubFur(parents); if(tr==='dunkel'&&!fur.albino) fur.l=Math.min(fur.l,0.66);
  // Nur Spieler, deren Leopard tatsächlich zu dieser Paarung gehört, erhalten ein Junges.
  let who=players.filter(q=>parents.indexOf(q.L.id)>=0&&!kidOf(q)); if(!who.length) who=[P];
  if(!S.cub){ S.cub={full:70,grow:0,hp:1,trait:tr,n:0,gen,parents,fur,kids:{}}; cub.x=CUB_HOME.x; cub.z=CUB_HOME.z; cub.t=0; G.raidT=rnd(90,130)*D().raid; }
  const c=S.cub; kidsOf(c);
  for(const q of who){ const k=numOf(q); c.kids[k]={full:70,hp:1,grow:0,stage:0,trait:tr,gen,parents:parents.slice(),fur:Object.assign({},fur)}; if(c.took) delete c.took[k]; }
  syncLitter(); rebuildCub(); save(); snd.mew();
  const n=who.length;
  $('birthTrait').innerHTML=ico(tr,ICOL.t,16)+' Erbanlage: '+offerText(tr)+' · Fell: '+furName(fur);
  $('birthTitle').textContent=n>1?'Euer Wurf ist geboren: '+n+' Junge':(players.length>1?'Neues Junges für '+nameOf(who[0])+' ist geboren':'Dein Junges ist geboren');
  $('birthCoop').style.display=n>1?'block':'none';
  { const b=$('btnBeCub'); b.disabled=false; b.textContent='Als Junges spielen'; } renderBirthChoices();
  $('birth').style.display='flex'; G.paused=true; for(const k in keys) keys[k]=false; G.joyX=G.joyY=0; if(document.exitPointerLock) document.exitPointerLock();
}
function updateCub(dt){
  if(G.raider&&(G.raider.dead||G.raider.state!=='raid')) G.raider=null;
  if(S.preg>0){ S.preg-=dt; if(S.preg<=0){ S.preg=0; birth(); } }
  const c=S.cub; if(!c){ cubG.visible=false; updateSibs(null,dt); return; }
  syncLitter(); cubG.visible=denCount()>0;
  if(c.grow>=1&&c.taken&&!players.some(q=>hasOwnCub(q))){ litterLeaves(); cubG.visible=false; updateSibs(null,dt); return; }   // übrige Geschwister eines Spieler-Jungen ziehen weiter
  if(c.grow<1){
    tickKids(dt); if(!S.cub) return;   // jedes Junge hat eigenen Hunger (warnt seinen Spieler, verhungert einzeln)
    // Miauen (aus Richtung Bau): hungrig oft und laut, sonst ab und zu leise, wenn jemand in der Nähe ist; begrüßt Heimkehrer
    if(denCount()>0){ const nd=Math.min(...players.map(q=>Math.hypot(q.x-cub.x,q.z-cub.z)));
      cub.mewT-=dt;
      if(cub.mewT<=0){ const hungry=denFull()<25; cub.mewT=hungry?rnd(5,9):rnd(12,25);
        if(hungry||nd<30) snd3d(['mew'],cub.x,cub.z,hungry?1.3:0.75,hungry?90:40,rnd(1.05,1.35)); }
      if(cub.away&&nd<10){ snd3d(['mew'],cub.x,cub.z,1.1,40,rnd(1.15,1.4)); setTimeout(()=>snd3d(['mew'],cub.x+0.8,cub.z,1,40,rnd(1.2,1.45)),380); }
      cub.away=nd>40; }
    G.raidT-=dt; if(G.raidT<=0&&!G.raider) startRaid();
  }
  // Hungrig und Beute am Bau: zum Kadaver laufen und selbst fressen (Bissen für Bissen, die Kugeln verschwinden)
  const food=c.grow<1&&denFull()<92?denCarcass():null;
  if(food){ cub.tx=food.x+Math.sin(cub.t*3)*0.4; cub.tz=food.z+Math.cos(cub.t*3)*0.4; cub.eatT=(cub.eatT||0)-dt;
    if(Math.hypot(food.x-cub.x,food.z-cub.z)<food.rad+1.2&&cub.eatT<=0){ cub.eatT=2.4/Math.max(1,denCount()); cubEats(c,food); } }
  else { cub.t-=dt; if(cub.t<=0){ const an=Math.random()*6.283, r=rnd(0,1.8); cub.tx=CUB_HOME.x+Math.cos(an)*r; cub.tz=CUB_HOME.z+Math.sin(an)*r; cub.t=rnd(3,9); } }
  const dx=cub.tx-cub.x, dz=cub.tz-cub.z, d=Math.hypot(dx,dz);
  if(d>0.3){ const v=1.3*dt/d; cub.x+=dx*v; cub.z+=dz*v; cubG.rotation.y=Math.atan2(dx,dz); cub.ph+=dt*9; animLegs(cubG,cub.ph,0.45); } else animLegs(cubG,cub.ph,0.03);
  { const d0=denKids()[0]; cubG.scale.setScalar(0.34+0.66*Math.min(1,d0?d0[1].grow:c.grow)); } cubG.position.set(cub.x,H(cub.x,cub.z),cub.z); updateSibs(c,dt);
  cub.saveT-=dt; if(cub.saveT<=0){ cub.saveT=10; save(); }
}
// Partnersuche: Pfeil und Hinweis nur in den ersten 15 s, danach nur noch der rosa Punkt auf der Spürkarte
let seekT=0;
function updateFamArrow(dt){
  if(canMate()) seekT+=dt||0; else seekT=0;
  const el=$('famArrow'); let tx=null, tz=null;
  if(S.cub&&!cubGrown()&&(G.raider||denFull()<20)){ tx=cub.x; tz=cub.z; }
  else if(canMate()&&seekT<15){ const m=nearestMate(); if(m){ tx=m.a.x; tz=m.a.z; } }
  if(tx===null||Math.hypot(tx-P.x,tz-P.z)<9){ el.style.display='none'; return; }
  const dx=tx-P.x, dz=tz-P.z, s=Math.sin(P.cam.yaw), c=Math.cos(P.cam.yaw), ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c)), R=viewMin(P)*0.27;
  el.style.display='block'; el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale(0.8)';
}

export { offerText };
export { mateWild, nearestWild, playerSeeks, cubDies, nearCub, CUB_HOME, FOOD_MAX, context, cub, doContext, endRaid, raidStep, seekT, seeking, updateCub, updateFamArrow };
export { rebuildCub, feedCub };
