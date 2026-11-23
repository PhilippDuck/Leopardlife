// LeopardLife – Lebenslauf: Hunger, Altern, Fressen aus dem Vorrat.
import { hurtPlayer } from './actions.js';
import { snd } from './audio.js';
import { P, players, rebuildPlayer } from './player.js';
import { DIE_AT, OLD_AT, S, fresh, hungerRate, maxHp, maxSt, pScale, save, thirstRate } from './save.js';
import { W } from './weather.js';
import { G } from './state.js';
import { floatText, toast } from './ui.js';
import { newMate, tell } from './coop.js';
import { SWITCH_AT, canSwitchFor, cubSpot, hasOwnCub, kidOf } from './cubfollow.js';
import { ensureKin, mateBecomeCub, newId } from './kinship.js';
import { recordAncestor } from './carcass.js';
import { becomeCub } from './kin.js';

/* ---------- Lebenslauf: eigener Hunger, Altern, Fressen aus dem Vorrat ---------- */
G.lineageEnd=false; G.lastCause='';
function eatFood(){ if(S.food<=0) return; S.food--; S.hunger=Math.min(100,S.hunger+12); P.hp=Math.min(maxHp(),P.hp+maxHp()*0.05); snd.eat(); floatText('gefressen',P.x,P.camY+1.6*pScale(),P.z,'#e0a060'); }
/** Mitspieler stirbt an Altersschwäche: mit eigenem Jungen lebt er darin weiter (vor „halbstark“: Zeitsprung ohne Gelerntes), sonst neuer Leopard */
function mateDiesOfAge(p){
  if(hasOwnCub(p)){ const c=S.cub, k=kidOf(p); if(k.grow<SWITCH_AT){ k.grow=SWITCH_AT; if(c.learn) delete c.learn[p.num]; }
    if(mateBecomeCub(p)){ tell(p,'Dein Leopard ist an Altersschwäche gestorben – du lebst in deinem Jungen weiter.','#ff9ad0'); return; } }
  const L=newMate(p.num); L.id=newId(); L.parents=[]; ensureKin(L); S.mates[p.num]=L; p.L=L; p.fur=L.fur; rebuildPlayer(p); p.hp=maxHp(L); save();
  tell(p,'Dein Leopard hat das Ende seiner Lebenszeit erreicht. Ohne eigenes Junges beginnst du als neuer Leopard (Stufe '+L.lvl+', '+L.pts+' Punkte zum Verteilen).','#ff8a70');
}
/**
 * Splitscreen: Spieler 1 stirbt an Altersschwäche. Nicht zu Boden gehen (Wiederbeleben würde ihn sofort wieder sterben lassen),
 * sondern gleich weiterleben: im eigenen Jungen (vor „halbstark“ als Zeitsprung ohne Gelerntes) oder als neuer Leopard.
 */
function p1DiesOfAge(){
  G.lastCause='an Altersschwäche gestorben';
  if(hasOwnCub(P)){ const sp=cubSpot(P); becomeCub(false);
    Object.assign(P,{x:sp.x,z:sp.z,dead:false,downT:null,tree:null,drag:null,eatC:null,bite:null}); P.hp=maxHp(); P.st=maxSt(); P.g.rotation.z=0;
    tell(P,'Dein Leopard ist an Altersschwäche gestorben – du lebst in deinem Jungen weiter (Generation '+S.gen+').','#ff9ad0'); return; }
  recordAncestor(G.lastCause);
  const lvl=Math.max(1,...players.filter(q=>q!==P).map(q=>q.L.lvl)), f=fresh();
  Object.assign(S,{lvl,xp:0,pts:2*(lvl-1),a:f.a,b:f.b,traits:[],age:0,hunger:100,thirst:100,kills:0,partner:false,p1:false,p2:false});
  S.id=newId(); S.parents=[]; ensureKin(S); rebuildPlayer(); P.hp=maxHp(); P.st=maxSt(); save();
  tell(P,'Dein Leopard hat das Ende seiner Lebenszeit erreicht. Ohne eigenes Junges beginnst du als neuer Leopard (Stufe '+lvl+', '+S.pts+' Punkte zum Verteilen).','#ff8a70');
}
/** Durst von Spieler p: sinkt mit der Zeit (bei Regen langsamer), warnt einmal, wenn es knapp wird */
function thirstStep(p,dt){
  const L=p.L; if(L.thirst==null) L.thirst=100;   // alte Spielstände
  const t0=L.thirst; L.thirst=Math.max(0,t0-dt*thirstRate(L,W.rain));
  if(t0>=25&&L.thirst<25) tell(p,'Du hast Durst – such ein Wasserloch und trink (Aktionstaste am Ufer). Achte auf Krokodile!','#7fc8e8');
  if(t0>0&&L.thirst<=0) tell(p,'⚠ Du verdurstest! Trink sofort.','#ff5a3a');
}
function updateLife(dt){
  // Mitspieler: eigener Hunger (satt werden sie durch eigene Beute); Altern und Erbe betreffen nur die Linie von Spieler 1
  for(const p of players){ if(p===P||p.dead) continue; const L=p.L;
    if(canSwitchFor(p)&&!p.cubReadyNotice){ p.cubReadyNotice=true; tell(p,'Dein Junges ist halbstark. Im Entwicklungsfenster kannst du jetzt als Junges weiterspielen. Wenn du erwachsen bleibst, wechselst du erst am Ende deiner Lebenszeit.','#ff9ad0'); }
    L.hunger=Math.max(0,L.hunger-dt*hungerRate(L)); thirstStep(p,dt);
    if(L.hunger<=0){ p.hp-=maxHp(L)*0.015*dt; if(p.hp<=0) hurtPlayer(1e9,{sp:{id:'hunger',n:'Hunger'}},true,p); }
    if(!p.dead&&L.thirst<=0){ p.hp-=maxHp(L)*0.02*dt; if(p.hp<=0) hurtPlayer(1e9,{sp:{id:'thirst',n:'Durst'}},true,p); }
    // Mitspieler altern genauso; am Ende lebt er in seinem Jungen weiter oder beginnt als neuer Leopard
    if(L.lvl>=8){ const a0=L.age||0, Dm=DIE_AT(L); L.age=a0+dt;
      if(a0<OLD_AT&&L.age>=OLD_AT) tell(p,'Du wirst alt: Tempo und Kraft lassen nach. Sorge für Nachwuchs.','#f2b84b');
      if(a0<Dm-90&&L.age>=Dm-90) tell(p,'Deine Kräfte schwinden. Dir bleibt nicht mehr viel Zeit.','#ff8a70');
      if(L.age>=Dm) mateDiesOfAge(p); } }
  if(P.dead) return;
  if(canSwitchFor(P)&&!P.cubReadyNotice){ P.cubReadyNotice=true; toast('Dein Junges ist halbstark. Im Menü kannst du jetzt als Junges weiterspielen. Wenn du erwachsen bleibst, wechselst du erst am Ende deiner Lebenszeit.','#ff9ad0'); }
  S.hunger=Math.max(0,S.hunger-dt*hungerRate()); thirstStep(P,dt);
  if(S.hunger<20&&S.food>0){ S.food--; S.hunger=Math.min(100,S.hunger+12); }   // Notration aus dem Vorrat
  if(S.hunger<=0){ P.hp-=maxHp()*0.015*dt; if(P.hp<=0){ hurtPlayer(1e9,{sp:{id:'hunger',n:'Hunger'}},true); return; } }
  if(S.thirst<=0){ P.hp-=maxHp()*0.02*dt; if(P.hp<=0){ hurtPlayer(1e9,{sp:{id:'thirst',n:'Durst'}},true); return; } }
  if(S.lvl>=8){
    const a0=S.age, D=DIE_AT(); S.age+=dt;
    if(a0<OLD_AT&&S.age>=OLD_AT) toast('Du wirst alt: Tempo und Kraft lassen nach. Sorge für Nachwuchs, damit deine Linie weiterlebt.','#f2b84b');
    if(a0<D-90&&S.age>=D-90) toast('Deine Kräfte schwinden. Dir bleibt nicht mehr viel Zeit.','#ff8a70');
    if(S.age>=D){ if(players.length>1) p1DiesOfAge(); else hurtPlayer(1e9,{sp:{id:'age',n:'Alter'}},true); }   // im Splitscreen kein „Am Boden“: Alter lässt sich nicht wiederbeleben
  }
}

export { updateLife };
export { eatFood };
