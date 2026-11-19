// LeopardLife – Partner und Elterntiere am Bau: verteidigen, Futter bringen, beschützen; Wechsel ins Junge.
import { dead, gainXp } from './actions.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { REGIONS, TRAITS } from './data.js';
import { puff } from './effects.js';
import { canvas } from './engine.js';
import { CUB_HOME, cub, endRaid, heirLevel } from './family.js';
import { touchUI } from './input.js';
import { updateUI } from './main.js';
import { animLegs } from './models.js';
import { P, rebuildPlayer } from './player.js';
import { S, fresh, has, maxHp, maxSt, save, xpNeed } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { toast } from './ui.js';
import { $, rnd } from './util.js';
import { recordAncestor } from './carcass.js';
import { moveAnimal } from './ai.js';

/* Familienmitglieder: Partner (Platz 0) und Elterntiere (Plätze 1, 2) leben am Bau, verteidigen das Junge
   und versorgen und beschützen den Spieler, solange er selbst noch nicht ausgewachsen ist. Sie können endgültig sterben. */
const fam=animals.filter(a=>a.sp.friend), FAM_HP=220;
let feedT=rnd(40,70);
const famRole=i=>i===0?(S.partner?'partner':null):i===1?(S.p1?'p1':null):i===2?(S.p2?'p2':null):null;
const canMate=()=>S.lvl>=8&&!S.cub&&!(S.preg>0);
const kidMode=()=>S.lvl<8&&(S.p1||S.p2);
function famHome(a){ const an=Math.random()*6.283, r=rnd(5,20); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(4,10); }
function famPlace(a,x,z){ a.x=x; a.z=z; a.fhp=FAM_HP; a.feeding=false; a.famOn=true; a.cd=0; a.fcombat=0; a.idle=0; famHome(a); }
function famDie(a){
  const i=fam.indexOf(a); if(i===0) S.partner=false; else if(i===1) S.p1=false; else S.p2=false;
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
  if(role!=='partner'&&S.lvl<8&&!dead){
    bd=130;
    for(const o of animals){
      if(o.dead||o.state!=='chase') continue;
      const dp=Math.hypot(o.x-P.x,o.z-P.z); if(!(P.hp<maxHp()*0.6||dp<25)) continue;   // nur bei großer Gefahr: Verfolger ist nah oder das Leben niedrig
      const d=Math.hypot(o.x-a.x,o.z-a.z); if(d<bd){ bd=d; best=o; }
    }
  }
  return best;
}
function deliverFood(a){
  P.hp=Math.min(maxHp(),P.hp+maxHp()*0.5); S.hunger=Math.min(100,S.hunger+60); snd.eat(); puff(P.x,P.y+1,P.z,0xff7ab8,8,0.4);
  toast('Ein Elterntier bringt dir Beute: Leben aufgefüllt, Erfahrung erhalten.','#ff9ad0');
  gainXp(Math.round(xpNeed(S.lvl)*0.35));
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
    const dx=P.x-a.x, dz=P.z-a.z, d=Math.hypot(dx,dz);
    if(dead||P.tree!=null&&d<4){ animLegs(a.g,a.ph,0.03); }
    else if(d>3) moveAnimal(a,dx,dz,9.5,dt); else { a.feeding=false; deliverFood(a); famHome(a); }
  } else {
    a.timer-=dt; if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ famHome(a); a.idle=rnd(1,5); }
    if(a.idle>0){ a.idle-=dt; animLegs(a.g,a.ph,0.03); }
    else moveAnimal(a,a.tx-a.x,a.tz-a.z,Math.hypot(a.x-CUB_HOME.x,a.z-CUB_HOME.z)>32?8:2,dt);
  }
  a.g.position.set(a.x,H(a.x,a.z),a.z);
}
function updateFamily(dt){
  for(let i=0;i<3;i++){ const a=fam[i], r=famRole(i); if(r&&!a.famOn) famPlace(a,CUB_HOME.x+rnd(-9,9),CUB_HOME.z+rnd(-9,9)); if(!r) a.famOn=false; }
  if(kidMode()&&!dead){
    feedT-=dt;
    if(feedT<=0){ feedT=rnd(70,110); let b=null, bd=1e9; for(let i=1;i<3;i++){ const a=fam[i]; if(!a.famOn||a.feeding) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; b=a; } } if(b) b.feeding=true; }
  }
}
// Wechsel ins Junge: freiwillig (das alte Ich bleibt als Elterntier) oder nach dem Tod
function becomeCub(vol){
  recordAncestor(vol?'zog sein Junges groß und lebt als Elterntier weiter':G.lastCause);
  const hl=heirLevel(), ox=P.x, oz=P.z, hadPartner=S.partner&&fam[0].famOn;
  S.p1=!!vol; S.p2=!!hadPartner; S.partner=false;
  if(S.p2) famPlace(fam[2],fam[0].x,fam[0].z); else fam[2].famOn=false;
  if(S.p1) famPlace(fam[1],ox,oz); else fam[1].famOn=false;
  fam[0].famOn=false;
  if(S.cub.trait&&TRAITS[S.cub.trait]&&!has(S.cub.trait)) S.traits=S.traits.concat(S.cub.trait).slice(-3);
  { const sum=o=>Object.keys(o).reduce((x,k)=>x+o[k],0), total=sum(S.a)+2*sum(S.b)+S.pts;   // Eigenschaften und Fähigkeiten werden nicht vererbt, nur 10 % der Punkte
    S.a=fresh().a; S.b=fresh().b; S.pts=Math.round(total*0.1); }
  S.fur=S.cub.fur||null;
  { const ng=(S.gen||1)+1, nr=Object.values(REGIONS).find(r=>r.gen===ng&&!r.soon); if(nr) setTimeout(()=>toast('Deine Linie ist stark genug: '+nr.n+' ist jetzt erreichbar (Menü → Gebiete).','#9be07f'),2600); }
  S.lvl=hl; S.xp=0; S.gen=(S.gen||1)+1; S.cub=null; S.food=0; S.preg=0; S.hunger=80; S.age=0; S.kills=0; if(G.raider) endRaid(G.raider);
  feedT=rnd(30,50); save(); rebuildPlayer();
}
function playAsCub(){
  const cx=cub.x, cz=cub.z; becomeCub(true);
  P.tree=null; P.safe=false; P.dropY=0; P.upNow=0; P.pounce=0; P.x=cx; P.z=cz; P.hp=maxHp(); P.st=maxSt(); P.sneak=false;
  toast('Generation '+S.gen+': Du spielst jetzt als dein Junges. Deine Eltern bringen dir Futter und beschützen dich bei großer Gefahr.','#ff9ad0');
  updateUI();
}
function unpause(){ G.paused=false; if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } }
$('btnStayAdult').onclick=()=>{ $('birth').style.display='none'; unpause(); };
$('btnBeCub').onclick=()=>{ $('birth').style.display='none'; playAsCub(); unpause(); };
G.cubArm=false;
$('btnMenuCub').onclick=()=>{
  if(!S.cub) return;
  if(!G.cubArm){ G.cubArm=true; $('btnMenuCub').textContent='Wirklich? Du startest als Junges auf Stufe '+heirLevel(); return; }
  G.cubArm=false; $('menu').style.display='none'; playAsCub(); unpause();
};

export { canMate, fam, famHurt, famRole, famStep, kidMode, updateFamily };
