// LeopardLife – Aktionen des Leoparden: Sprung, Klettern, Brüllen, Treffer austeilen und einstecken, Tod und Neubeginn.
import { animals, placeAnimal } from './animals.js';
import { initAudio, snd, tone } from './audio.js';
import { DAT, FOOD } from './data.js';
import { puff } from './effects.js';
import { canvas } from './engine.js';
import { keys, touchUI } from './input.js';
import { P, START_ROT, START_YAW, rebuildPlayer } from './player.js';
import { reloadWorld } from './regions.js';
import { D, REG, REG_ID, S, beaten, dmg, maxHp, maxSt, pScale, resetState, save, xpNeed } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { $, rnd } from './util.js';
import { trees } from './vegetation.js';
import { FOOD_MAX, cub, heirLevel, rebuildCub } from './family.js';
import { becomeCub } from './kin.js';
import { dayF } from './daynight.js';
import { archiveLine, makeCarcass, recordAncestor, startFlee } from './carcass.js';
import { goalEvent } from './goals.js';
import { padUI, rumble } from './gamepad.js';
import { updateUI, updateWarn } from './hud.js';

/* ---------- Aktionen ---------- */
/** Index des nächsten erreichbaren Baums für Spieler p, sonst -1. */
function nearestTree(p=P){
  let bi=-1, bd=1e9; for(let i=0;i<trees.length;i++){ const t=trees[i], d=Math.hypot(t.x-p.x,t.z-p.z); if(d<bd){ bd=d; bi=i; } }
  return bd<3.4+pScale()*0.8?bi:-1;
}
function leaveTree(p,rate){ p.dropY=p.upNow; p.dropRate=rate; p.tree=null; p.safe=false; p.upNow=0; }
/** Klettern bzw. vom Baum herunter für Spieler p. Fähigkeiten und Ausdauer-Anzeige gelten noch gemeinsam. */
function doClimb(p=P){
  if(G.paused||p.pounce>0) return;
  if(p.tree!=null){ leaveTree(p,24); p.x+=Math.sin(p.rot)*1.6; p.z+=Math.cos(p.rot)*1.6; snd.step(0.25); return; }
  if(S.b.climb<1){ toast('Klettern ist noch nicht gelernt (Tab)','#b9b7a6'); return; }
  const i=nearestTree(p); if(i<0){ toast('Kein Baum in Reichweite','#b9b7a6'); return; }
  const cost=45-5*(S.b.climb-1); if(p.st<cost){ noStamina(); return; } p.st-=cost;
  goalEvent('climb',1); p.tree=i; p.climbT=0; p.fromX=p.x; p.fromZ=p.z; p.sneak=false; p.dropY=0; snd.climb();
}
G.noStT=0;
function noStamina(){
  const r=$('stRing'); r.classList.remove('flash'); void r.getBoundingClientRect(); r.classList.add('flash');
  $('crossMsg').style.opacity=1; G.noStT=1.1; tone(140,0.12,'square',0.1,100);
}
/** Sprungangriff von Spieler p in Blickrichtung seiner Kamera (vom Baum: Sprung nach unten). */
function doPounce(p=P){
  if(G.paused||p.pounce>0||p.pcd>0) return;
  if(p.tree!=null&&p.climbT<1) return;
  if(p.st<15){ noStamina(); return; }
  p.leap=false;
  if(p.tree!=null){ if(p.climbT<1) return; const h=p.upNow; p.leap=true; leaveTree(p,1); p.dropRate=h/(0.55+0.04*S.b.jmp); }
  p.st-=15; p.pounce=(p.leap?0.55:0.38)+0.04*S.b.jmp; p.pT=p.pounce; p.pcd=1.3-0.2*S.b.jmp; p.hit=false; snd.pounce();
  p.rot=Math.atan2(-Math.sin(p.cam.yaw),-Math.cos(p.cam.yaw));
}
/** Brüllen von Spieler p: Raubtiere fliehen, Beute erstarrt. */
function doRoar(p=P){
  if(G.paused) return;
  if(S.b.roar<1){ toast('Brüllen ist noch nicht gelernt (Tab)','#b9b7a6'); return; }
  if(p.rcd>0) return;
  p.rcd=22-3*S.b.roar; const R=16+7*S.b.roar;
  puff(p.x,p.y+1,p.z,0xffffff,10,0.6); toast('ROAAAR!','#f2b84b'); snd.roar();
  animals.forEach(a=>{ if(a.dead) return; const d=Math.hypot(a.x-p.x,a.z-p.z); if(d>R) return;
    if(a.sp.pred){ if(!a.sp.hunt||S.lvl+2*S.b.roar>=a.sp.hunt-3){ a.state='flee'; a.fleeT=0; a.aggro=0; a.scared=5; } }
    else if(!a.sp.boss&&!a.sp.friend){ a.stun=1.2+0.5*S.b.roar; } });
}
function gainXp(n){
  const lv0=S.lvl; S.xp+=n; let up=false;
  while(S.xp>=xpNeed(S.lvl)){ S.xp-=xpNeed(S.lvl); S.lvl++; S.pts+=2; up=true; }
  if(up){ P.hp=maxHp(); toast('Stufe '+S.lvl+'! Du wächst. +2 Punkte (Tab)','#f2b84b'); puff(P.x,P.y+1,P.z,0xf2b84b,14,0.7); snd.level();
    if(lv0<8&&S.lvl>=8&&!S.cub) setTimeout(()=>toast('Du bist ausgewachsen. Andere Leoparden streifen jetzt umher – du findest sie als rosa Punkte auf der Spürkarte.','#ff9ad0'),3200); }
  save();
}
let dead=false;
function hurtPlayer(d,a,force){
  if(dead||(P.safe&&!force)) return;
  if(!force) d*=D().dmg;
  snd.hurt();
  P.hp-=d; P.combatT=5; P.cam.shake=Math.max(P.cam.shake,Math.min(0.6,0.15+d/maxHp())); if(padUI()) rumble(Math.min(1,0.35+d/maxHp()),0.5,220); $('hurt').style.opacity=0.8; P.hurtT=0.25;
  floatText('-'+Math.round(d),P.x,P.camY+1.5*pScale(),P.z,'#ff7a5c');
  if(P.hp<=0){
    P.hp=0; G.heirPending=!!S.cub; G.lineageEnd=!S.cub&&(a.sp.id==='age'||D().perma); let lost=0; if(!G.heirPending&&!G.lineageEnd){ lost=Math.floor(S.xp*D().xpLoss); S.xp-=lost; } save();
    dead=true; G.paused=true; P.pounce=0; for(const k in keys) keys[k]=false; G.drag=false;
    if(document.exitPointerLock) document.exitPointerLock();
    P.g.rotation.z=Math.PI/2; P.g.position.y=P.y+0.25*pScale();
    snd.death();
    const fem=(a.sp.id==='hyena'||a.sp.id==='giant');
    G.lastCause=a.sp.id==='hunger'?'verhungert':a.sp.id==='age'?'an Altersschwäche gestorben':'von '+(DAT[a.sp.id]||'einem '+a.sp.n)+' getötet';
    const cause=a.sp.id==='hunger'?'Du bist verhungert.':a.sp.id==='age'?'Du bist an Altersschwäche gestorben.':'Ein'+(fem?'e ':' ')+a.sp.n+' hat dich erwischt.';
    $('deadTxt').textContent=cause+(lost>0?' Du verlierst '+lost+' Erfahrung.':'')+' Stufe, Eigenschaften und Fähigkeiten bleiben dir erhalten.';
    $('deadTip').textContent=a.sp.hunt&&S.lvl<a.sp.hunt
      ? 'Tipp: '+(a.sp.id==='jack'?'Schakale':a.sp.id==='hyena'?'Hyänen':'Löwen')+' jagen dich bis Stufe '+a.sp.hunt+'. Schleiche (C) ins hohe Gras, bis sie dich verlieren.'
      : 'Tipp: Dieses Tier wehrt sich. Greife aus dem Hinterhalt an und zieh dich zurück, wenn dein Leben knapp wird.';
    if(G.heirPending){
      $('deadTxt').textContent=cause+' Aber dein Junges lebt: Du spielst als dein Junges weiter (Stufe '+heirLevel()+'). Es erbt die Erbanlagen deiner Linie und 10 % deiner Punkte.';
      $('deadTip').textContent='Je mehr du es gefüttert hast, desto größer startet es.';
      $('btnRespawn').textContent='Als Junges weiterleben';
    } else $('btnRespawn').textContent='Im Bau neu erwachen';
    if(a.sp.id==='hunger'&&!G.heirPending) $('deadTip').textContent='Tipp: Erlegte Beute macht satt. Hast du ein Junges, wandert sie in den Vorrat – friss mit F daraus, wenn du hungrig bist.';
    if(G.lineageEnd){
      $('deadTxt').textContent=(a.sp.id==='age'?'Du bist an Altersschwäche gestorben und hast keinen Nachwuchs.':cause+' Auf „Schwer" gibt es ohne Nachwuchs kein Zurück.')+' Deine Blutlinie endet in Generation '+(S.gen||1)+'.';
      $('deadTip').textContent='Beim nächsten Mal: Ab Stufe 8 einen Partner suchen und rechtzeitig ein Junges großziehen.';
      $('btnRespawn').textContent='Neue Blutlinie beginnen';
    }
    $('hurt').style.opacity=0.55; $('dead').style.display='flex'; updateUI();
  }
}
function respawn(){
  let sx=2, sz=2;
  if(G.heirPending&&S.cub){
    sx=cub.x; sz=cub.z; becomeCub(false);
    toast('Generation '+S.gen+': Du bist jetzt dein Junges – mit den Erbanlagen deiner Linie und 10 % der Punkte.'+(S.p2?' Dein anderes Elterntier sorgt weiter für dich.':''),'#ff9ad0');
  }
  else if(G.lineageEnd){ recordAncestor(G.lastCause); archiveLine(); const df=S.diff; resetState(); S.diff=df; save(); if(REG_ID!=='savanne'){ reloadWorld(false); return; } rebuildPlayer(); rebuildCub(); animals.forEach(placeAnimal); G.raider=null; toast('Eine neue Blutlinie beginnt.','#f2b84b'); }
  else S.hunger=Math.max(S.hunger,70);
  G.heirPending=false; G.lineageEnd=false;
  P.tree=null; P.safe=false; P.dropY=0; P.upNow=0; P.x=sx; P.z=sz; P.rot=START_ROT; P.cam.yaw=START_YAW; P.hp=maxHp(); P.st=maxSt(); P.pounce=0; P.pcd=0; P.sneak=false; P.combatT=0; P.g.rotation.z=0;
  animals.forEach(o=>{ o.aggro=0; o.sus=0; o.near=false; if(o.state==='chase'){ o.state='wander'; o.timer=0; } });
  updateWarn(0); $('hurt').style.opacity=0; $('dead').style.display='none'; dead=false; G.paused=false; initAudio(); snd.click();
  if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
}
$('btnRespawn').onclick=respawn;
/** Spieler p trifft Tier a: Schaden, Hinterhalt, Beute, Erfahrung (Erfahrung und Stufe sind noch gemeinsam). */
function hitAnimal(a,p=P){
  let d=dmg(), amb=false;
  if(a.state==='wander'||a.state==='lurk'||a.stun>0){ d*=2+0.6*S.b.amb; amb=true; }
  if(p.leap){ d*=1.25+0.25*S.b.climb; p.leap=false; floatText('Sprung vom Baum!',p.x,p.camY+2*pScale(),p.z,'#9be07f'); }
  d=Math.round(d*rnd(0.9,1.1));
  a.hp-=d; p.combatT=5;
  floatText((amb?'Hinterhalt! ':'')+'-'+d,a.x,H(a.x,a.z)+a.sp.size*1.8,a.z,amb?'#f2b84b':'#fff');
  puff(a.x,H(a.x,a.z)+a.sp.size,a.z,0xc0392b,4,0.5);
  G.lastHit=a; G.lastHitT=6; snd.hit(); if(amb){ snd.ambush(); goalEvent('amb',1); if(padUI()) rumble(0.25,0.6,120); G.slowT=Math.max(G.slowT,0.16); p.cam.shake=Math.max(p.cam.shake,0.3*pScale()); }
  if(a.hp<=0){ snd.kill(); if(padUI()) rumble(0.5,0.8,180); G.slowT=Math.max(G.slowT,0.22); p.cam.shake=Math.max(p.cam.shake,0.4*pScale()); }
  if(a.hp<=0){
    a.dead=true; a.respawn=rnd(18,30); S.kills=(S.kills||0)+1; goalEvent('kill',1,{sp:a.sp.id,night:dayF<0.5,herd:!!a.herd});
    { const n=FOOD[a.sp.id]||1, now=n>=4?Math.ceil(n/2):n; let rest=now;
      if(S.cub&&S.cub.grow<1){ const k=Math.min(FOOD_MAX-S.food,now); S.food+=k; rest=n-k; if(k>0) floatText('+'+k+' Futter im Vorrat',a.x,H(a.x,a.z)+a.sp.size*1.2,a.z,'#ff9ad0'); }
      if(rest>0) S.hunger=Math.min(100,S.hunger+rest*10);
      if(n>=4) makeCarcass(a,n-now); else a.g.visible=false; }
    puff(a.x,H(a.x,a.z)+a.sp.size*0.7,a.z,a.sp.m.col,10,0.5+a.sp.size*0.5);
    p.hp=Math.min(maxHp(),p.hp+maxHp()*0.25+a.sp.xp*0.1);
    const xpv=a.sp.xp*(a.fur&&a.fur.albino?2:1); if(a.fur&&a.fur.albino) toast('Seltene Beute: ein Albino! Doppelte Erfahrung.','#f2b84b');
    floatText('+'+xpv+' EP',p.x,p.y+2*pScale(),p.z,'#8ad4ef');
    gainXp(xpv);
    if(a.sp.boss&&!beaten(REG_ID)){ S.beat=Object.assign({},S.beat,{[REG_ID]:true}); if(REG_ID==='savanne') S.won=true; save(); $('winTitle').textContent=REG.winT; $('winText').textContent=REG.winX; setTimeout(()=>{ snd.win(); $('win').style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); },900); }
  } else if(a.sp.fight){ a.state='chase'; a.aggro=10; a.scared=0; }
  else startFlee(a);
}
G.lastHit=null; G.lastHitT=0;

export { dead, doClimb, doPounce, doRoar, gainXp, hitAnimal, hurtPlayer, nearestTree };
export { respawn };
