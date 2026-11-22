// LeopardLife – Partner und Elterntiere am Bau: verteidigen, Futter bringen, beschützen; Wechsel ins Junge.
import { gainXp } from './actions.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { REGIONS, TRAITS } from './data.js';
import { puff } from './effects.js';
import { canvas, scene } from './engine.js';
import { CUB_HOME, cub, endRaid } from './family.js';
import { touchUI } from './input.js';
import { animLegs, buildQuad } from './models.js';
import { P, dropModel, players, rebuildPlayer } from './player.js';
import { S, fresh, has, inheritTrait, maxHp, maxSt, save, xpNeed } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { toast } from './ui.js';
import { $, rnd } from './util.js';
import { recordAncestor } from './carcass.js';
import { moveAnimal } from './ai.js';
import { updateUI } from './hud.js';
import { mateBecomeCub, newId, takeFromLitter } from './kinship.js';
import { nameOf, tell } from './coop.js';
import { SWITCH_AT, applyLearned, canSwitch, canSwitchFor, cubSpot, dropFollower, followerOf, heirLevel, kidInfo, kidOf } from './cubfollow.js';

/* Familienmitglieder: Partner (Platz 0) und Elterntiere (Plätze 1, 2) leben am Bau, verteidigen das Junge
   und versorgen und beschützen den Spieler, solange er selbst noch nicht ausgewachsen ist. Sie können endgültig sterben. */
const fam=animals.filter(a=>a.sp.friend), FAM_HP=220;
let feedT=rnd(40,70);
const famRole=i=>i===0?(S.partner?'partner':null):i===1?(S.p1?'p1':null):i===2?(S.p2?'p2':null):null;
const canMate=()=>S.lvl>=8&&!kidOf(P)&&!(S.preg>0);   // wer schon ein eigenes Junges hat, sucht keinen Partner
const kidMode=()=>S.lvl<8&&(S.p1||S.p2);
function famHome(a){ const an=Math.random()*6.283, r=rnd(5,20); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(4,10); }
/** Fell von Familienmitglied i (0 Partner, 1/2 Elterntiere) setzen und merken, damit es wie der Leopard aussieht, der es war */
function famFur(i,fur){
  const a=fam[i]; if(!fur) return; S.famFur=S.famFur||[null,null,null]; S.famFur[i]=Object.assign({},fur);
  if(a.fur===fur) return; const vis=a.g.visible, pos=a.g.position.clone(), rot=a.g.rotation.y;
  dropModel(a.g); a.fur=S.famFur[i]; a.g=buildQuad(a.sp.m,a.fur); a.g.scale.setScalar(a.sp.size); a.g.position.copy(pos); a.g.rotation.y=rot; a.g.visible=vis; scene.add(a.g);
}
function famPlace(a,x,z,fur){ if(fur) famFur(fam.indexOf(a),fur); a.x=x; a.z=z; a.fhp=FAM_HP; a.feeding=false; a.famOn=true; a.cd=0; a.fcombat=0; a.idle=0; famHome(a); }
function famDie(a){
  const i=fam.indexOf(a); if(i===0&&S.tree&&S.tree[S.partnerId]) S.tree[S.partnerId].c='im Kampf gestorben';
  if(i===0) S.partner=false; else if(i===1) S.p1=false; else S.p2=false;
  a.famOn=false; a.g.visible=false; save(); snd.death(); puff(a.x,H(a.x,a.z)+1,a.z,0xe0a23c,10,0.8);
  toast(i===0?'Dein Partner ist im Kampf gestorben.':'Eines deiner Elterntiere ist im Kampf gestorben.','#ff8a70');
}
function famHurt(a,d){ if(!a.famOn) return; a.fhp-=d; a.fcombat=4; puff(a.x,H(a.x,a.z)+1,a.z,0xc0392b,3,0.4); if(a.fhp<=0) famDie(a); }
function famKill(t){ t.dead=true; t.g.visible=false; t.respawn=rnd(18,30); t.foe=null; if(G.raider===t) G.raider=null; puff(t.x,H(t.x,t.z)+t.sp.size*0.7,t.z,t.sp.m.col,10,0.5+t.sp.size*0.5); }
function famTarget(a,role){
  let best=null, bd=1e9;
  for(const o of animals){ if(o.dead||o.state!=='fightFam') continue; const d=Math.hypot(o.x-a.x,o.z-a.z); if((o.foe===a||d<60)&&d<bd){ bd=d; best=o; } }
  if(best) return best;
  if(G.raider&&!G.raider.pAway&&S.cub&&Math.hypot(G.raider.x-cub.x,G.raider.z-cub.z)<16) return G.raider;
  const kids=youngPlayers();
  if(role!=='partner'&&kids.length){
    bd=130;
    for(const o of animals){
      if(o.dead||o.state!=='chase') continue;
      // nur bei großer Gefahr für ein junges Familienmitglied: Verfolger ist nah oder dessen Leben niedrig
      if(!kids.some(p=>p.hp<maxHp(p.L)*0.6||Math.hypot(o.x-p.x,o.z-p.z)<25)) continue;
      const d=Math.hypot(o.x-a.x,o.z-a.z); if(d<bd){ bd=d; best=o; }
    }
  }
  return best;
}
/** Junge Spieler der Familie (unter Stufe 8), um die sich die Elterntiere kümmern */
const youngPlayers=()=>(S.p1||S.p2)?players.filter(p=>!p.dead&&p.L.lvl<8):[];
/** Elterntier a übergibt Beute an Spieler p */
function deliverFood(a,p=P){
  const L=p.L; p.hp=Math.min(maxHp(L),p.hp+maxHp(L)*0.5); L.hunger=Math.min(100,L.hunger+60); snd.eat(); puff(p.x,p.y+1,p.z,0xff7ab8,8,0.4);
  tell(p,'Ein Elterntier bringt dir Beute: Leben aufgefüllt, Erfahrung erhalten.','#ff9ad0');
  gainXp(Math.round(xpNeed(L.lvl)*0.35),p);
}
function famStep(a,dt,role){
  a.g.visible=true; a.cd-=dt;
  if(a.fcombat>0) a.fcombat-=dt; else if(a.fhp<FAM_HP) a.fhp=Math.min(FAM_HP,a.fhp+dt*3);
  const t=famTarget(a,role);
  if(t){
    const dx=t.x-a.x, dz=t.z-a.z, d=Math.hypot(dx,dz);
    if(d>t.rad+1.4) moveAnimal(a,dx,dz,14,dt);
    else {
      a.g.rotation.y=Math.atan2(dx,dz); animLegs(a.g,a.ph,0.05);
      if(a.cd<=0){
        a.cd=1.0; a.fcombat=4; t.hp-=18; puff(t.x,H(t.x,t.z)+t.sp.size,t.z,0xc0392b,4,0.5); if(Math.hypot(P.x-a.x,P.z-a.z)<70) snd.hit();
        if(t.hp<=0) famKill(t);
        else if(t.hp<t.sp.hp*0.35){ t.state='flee'; t.fleeT=0; t.scared=15; t.aggro=0; t.foe=null; if(G.raider===t) G.raider=null; }
        else if(t.state!=='fightFam'){ t.state='fightFam'; t.foe=a; t.aggro=0; if(G.raider===t) G.raider=null; }
      }
    }
  } else if(a.feeding){
    const T=a.feedFor||P, dx=T.x-a.x, dz=T.z-a.z, d=Math.hypot(dx,dz);
    if(players.indexOf(T)<0||T.L.lvl>=8){ a.feeding=false; famHome(a); }   // ausgestiegen oder inzwischen groß
    else if(T.dead||T.tree!=null&&d<4){ animLegs(a.g,a.ph,0.03); }
    else if(d>3) moveAnimal(a,dx,dz,9.5,dt); else { a.feeding=false; deliverFood(a,T); famHome(a); }
  } else {
    a.timer-=dt; if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ famHome(a); a.idle=rnd(1,5); }
    if(a.idle>0){ a.idle-=dt; animLegs(a.g,a.ph,0.03); }
    else moveAnimal(a,a.tx-a.x,a.tz-a.z,Math.hypot(a.x-CUB_HOME.x,a.z-CUB_HOME.z)>32?8:2,dt);
  }
  a.g.position.set(a.x,H(a.x,a.z),a.z);
}
function updateFamily(dt){
  for(let i=0;i<3;i++){ const a=fam[i], r=famRole(i); if(r&&!a.famOn) famPlace(a,CUB_HOME.x+rnd(-9,9),CUB_HOME.z+rnd(-9,9),S.famFur&&S.famFur[i]); if(!r) a.famOn=false; }
  // Elterntiere bringen jungen Spielern ab und zu Beute: dem hungrigsten, das nächste freie Elterntier läuft los
  const kids=youngPlayers();
  if(kids.length){
    feedT-=dt*(kids.length>1?1.6:1);
    if(feedT<=0){ feedT=rnd(70,110); const T=kids.slice().sort((x,y)=>x.L.hunger-y.L.hunger)[0];
      let b=null, bd=1e9; for(let i=1;i<3;i++){ const a=fam[i]; if(!a.famOn||a.feeding) continue; const d=Math.hypot(a.x-T.x,a.z-T.z); if(d<bd){ bd=d; b=a; } }
      if(b){ b.feeding=true; b.feedFor=T; } }
  }
}
// Wechsel ins Junge: freiwillig (das alte Ich bleibt als Elterntier) oder nach dem Tod
function becomeCub(vol){
  recordAncestor(vol?'zog sein Junges groß und lebt als Elterntier weiter':G.lastCause);
  // Tod vor „halbstark“: der Partner zieht das Junge allein groß – Zeitsprung auf 50 %, aber ohne das, was du ihm beigebracht hättest
  { const k=kidOf(P); if(!vol&&k&&k.grow<SWITCH_AT) k.grow=SWITCH_AT; }
  const ki=kidInfo(P), hl=heirLevel(), ox=P.x, oz=P.z, hadPartner=S.partner&&fam[0].famOn, mateParent=S.p2&&fam[2].famOn, myFur=S.fur?Object.assign({},S.fur):{albino:false,melan:false,l:1,s:1,sn:1,ss:1};
  S.p1=!!vol; S.p2=!!hadPartner||!!mateParent; S.partner=false;
  if(hadPartner) famPlace(fam[2],fam[0].x,fam[0].z,fam[0].fur); else if(!mateParent) fam[2].famOn=false;
  if(S.p1) famPlace(fam[1],ox,oz,myFur); else fam[1].famOn=false;
  fam[0].famOn=false;
  inheritTrait(S,ki.trait);   // neu dazu oder, wenn schon vorhanden, verstärkt
  S.a=fresh().a; S.b=fresh().b; S.pts=0;   // Eigenschaften, Fähigkeiten und Punkte werden nicht vererbt – dafür Erbe und Ahnenkraft
  const got=applyLearned(P,S); if(S.cub.learn) delete S.cub.learn[1]; { const fo=followerOf(P); if(fo) dropFollower(fo); }   // dafür, was es bei dir gelernt hat
  S.fur=ki.fur||null;
  { const ng=(S.gen||1)+1, nr=Object.values(REGIONS).find(r=>r.gen===ng&&!r.soon); if(nr) setTimeout(()=>toast('Deine Linie ist stark genug: '+nr.n+' ist jetzt erreichbar (Menü → Gebiete).','#9be07f'),2600); }
  const cg=ki.gen||((S.gen||1)+1);
  S.parents=(ki.parents||[S.id]).slice(); S.id=newId();   // neue Kennung: das Junge ist ein eigener Leopard, verwandt mit seinen Eltern und Geschwistern
  S.lvl=hl; S.xp=0; S.gen=Math.max(S.gen||1,cg); takeFromLitter(P); S.preg=0; S.partnerPlayer=false; S.hunger=80; S.age=0; S.kills=0; if(G.raider&&!S.cub) endRaid(G.raider);
  feedT=rnd(30,50); save(); rebuildPlayer();
  return got;
}
function playAsCub(){
  const sp=cubSpot(P), cx=sp.x, cz=sp.z, got=becomeCub(true);
  P.tree=null; P.safe=false; P.dropY=0; P.upNow=0; P.pounce=0; P.x=cx; P.z=cz; P.hp=maxHp(); P.st=maxSt(); P.sneak=false;
  toast('Generation '+S.gen+': Du spielst jetzt als dein Junges.'+(got.length?' Gelernt: '+got.join(', ')+'.':'')+' Deine Eltern bringen dir Futter und beschützen dich bei großer Gefahr.','#ff9ad0');
  updateUI();
}
function unpause(){ G.paused=false; if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } }
$('btnStayAdult').onclick=()=>{ $('birth').style.display='none'; unpause(); };
// Allein: wählen und weiter. Gemeinsam: das Fenster bleibt offen, bis alle entschieden haben (Fertig = alle übrigen bleiben erwachsen)
$('btnBeCub').onclick=()=>{
  if(players.length<2){ $('birth').style.display='none'; playAsCub(); unpause(); return; }
  playAsCub(); const b=$('btnBeCub'); b.textContent='✓ Spieler 1 spielt als Junges'; b.disabled=true; renderBirthChoices();
};
/** Geburtsfenster im gemeinsamen Spiel: für jeden Mitspieler ein Knopf „als Junges spielen“, solange noch Junge im Wurf sind */
function renderBirthChoices(){
  // Wechseln geht erst, wenn das Junge halbstark ist (Lehrzeit) – das Geburtsfenster erklärt nur noch den Weg dahin
  $('birthMates').style.display='none'; $('btnBeCub').style.display='none'; $('btnStayAdult').textContent='Weiter'; if(!canSwitch()) return;
  const box=$('birthMates'), coop=players.length>1; box.style.display=coop?'flex':'none';
  $('btnStayAdult').textContent=coop?'Fertig – weiterspielen':'Als Erwachsener weiter';
  if(!coop) return;
  if(!$('btnBeCub').disabled) $('btnBeCub').textContent='Spieler 1 als Junges spielen';
  box.innerHTML='';
  for(const q of players){ if(q===P) continue; const b=document.createElement('button');
    const done=q.cubDone===S.cub||(!S.cub&&q.cubDone);
    b.textContent=done?'✓ '+nameOf(q)+' spielt als Junges':nameOf(q)+' als Junges spielen'; b.disabled=!!done||!S.cub||!(S.cub.n>0);
    b.style.cssText='background:#d86fa8;color:#2a0a1c';
    b.onclick=()=>{ const c=S.cub; if(mateBecomeCub(q)){ q.cubDone=c||true; } renderBirthChoices(); };
    box.appendChild(b); }
  if(S.cub&&!(S.cub.n>0)) $('btnBeCub').disabled=true;
}
G.cubArm=false;
$('btnMenuCub').onclick=()=>{
  if(!S.cub) return;
  if(!canSwitchFor(P)) return;
  if(!G.cubArm){ G.cubArm=true; $('btnMenuCub').textContent='Wirklich? Du startest als Junges auf Stufe '+heirLevel(P); return; }
  G.cubArm=false; $('menu').style.display='none'; playAsCub(); unpause();
};

export { canMate, fam, famHurt, famRole, famStep, kidMode, updateFamily };
export { playAsCub, becomeCub, famFur, famPlace, renderBirthChoices };
