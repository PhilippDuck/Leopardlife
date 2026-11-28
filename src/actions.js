// LeoLife – Aktionen des Leoparden: Sprung, Klettern, Brüllen, Treffer austeilen und einstecken, Tod und Neubeginn.
import { animals, placeAnimal } from './animals.js';
import { climbStop, initAudio, snd, snd3d, tone } from './audio.js';
import { DAT, FOOD } from './data.js';
import { puff, roarFx } from './effects.js';
import { canvas } from './engine.js';
import { keys, touchUI } from './input.js';
import { P, START_ROT, START_YAW, players, rebuildPlayer } from './player.js';
import { reloadWorld } from './regions.js';
import { D, REG, REG_ID, S, beaten, dmg, maxHp, maxSt, pScale, resetState, save, xpNeed } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { $, rnd } from './util.js';
import { trees } from './vegetation.js';
import { FOOD_MAX, cub, rebuildCub } from './family.js';
import { becomeCub } from './kin.js';
import { dayF } from './daynight.js';
import { archiveLine, carcassToTree, makeCarcass, recordAncestor, startFlee, takeMeat } from './carcass.js';
import { goalEvent } from './goals.js';
import { padUI, rumble } from './gamepad.js';
import { updateUI, updateWarn } from './hud.js';
import { downPlayer, hEl, othersAlive, resetMates, tell } from './coop.js';
import { emit } from './events.js';
import { toggleSkills } from './skills.js';
import { assistBite, bitable, biteHit, forgetWounds, startBite } from './bite.js';
import { SWITCH_AT, cubLearn, cubSpot, growOf, hasOwnCub, heirLevel } from './cubfollow.js';
import { humanHit } from './worldevents.js';
import { tryFishCatch } from './fish.js';

/* ---------- Aktionen ---------- */
/** Index des nächsten erreichbaren Baums für Spieler p, sonst -1. */
function nearestTree(p=P){
  // Felsplateau und Höhle: reach = wie weit der Fels um den Punkt reicht (man steht an der Wand, nicht in der Mitte)
  let bi=-1, bd=1e9; for(let i=0;i<trees.length;i++){ const t=trees[i]; if(!t) continue; const d=Math.hypot(t.x-p.x,t.z-p.z)-(t.reach||0); if(d<bd){ bd=d; bi=i; } }
  return bd<3.4+pScale(p.L)*0.8?bi:-1;
}
function leaveTree(p,rate){ p.tOff=null; climbStop(); p.dropY=p.upNow; p.dropRate=rate; p.tree=null; p.safe=false; p.upNow=0; }
/** Klettern bzw. vom Baum herunter für Spieler p. Fähigkeiten und Ausdauer-Anzeige gelten noch gemeinsam. */
function doClimb(p=P){
  if(p.dead) return;
  if(G.paused||p.pounce>0) return;
  if(p.tree!=null){ const t=trees[p.tree]; leaveTree(p,24);
    if(t&&t.cave){ p.dropY=0; p.x=t.x+t.out[0]*1.5; p.z=t.z+t.out[1]*1.5; p.rot=Math.atan2(t.out[0],t.out[1]); }   // aus der Höhle hinaus
    else if(t&&t.kopje){ const a=Math.atan2(p.x-t.x,p.z-t.z), r=t.reach+1.2; p.x=t.x+Math.sin(a)*r; p.z=t.z+Math.cos(a)*r; p.rot=a; }   // vom Felsen an der Wand hinunter
    else { p.x+=Math.sin(p.rot)*1.6; p.z+=Math.cos(p.rot)*1.6; }
    snd.step(0.25); return; }
  const i=nearestTree(p), t=i>=0?trees[i]:null;
  const low=!!(t&&t.kopje&&t.kopje.small);   // kleine Felsgruppe: hinaufspringen geht auch ohne Klettern-Fähigkeit
  if(p.L.b.climb<1&&!(t&&t.cave)&&!low){ tell(p,'Klettern ist noch nicht gelernt (Tab)','#b9b7a6'); return; }
  if(!t){ tell(p,'Kein Baum in Reichweite','#b9b7a6'); return; }
  const cost=t.cave?5:low?15+(p.drag?15:0):45-5*(p.L.b.climb-1)+(p.drag?20:0); if(p.st<cost){ noStamina(p); return; } p.st-=cost;   // in die Höhle: kaum Ausdauer
  if(p.drag) carcassToTree(p,i);   // die Beute kommt mit hinauf (bzw. in die Höhle)
  if(!t.cave){ goalEvent('climb',1); cubLearn(p,'tree'); }
  p.tree=i; p.climbT=0; p.fromX=p.x; p.fromZ=p.z; p.sneak=false; p.dropY=0; if(t.cave) snd.step(0.15); else snd.climb();
}
G.noStT=0;
/** Ausdauerring blinkt und der Hinweis 'Zu wenig Ausdauer' erscheint bei Spieler p */
function noStamina(p=P){
  const r=hEl(p,'stRing'); r.classList.remove('flash'); void r.getBoundingClientRect(); r.classList.add('flash');
  const m=hEl(p,'crossMsg'); m.textContent='Zu wenig Ausdauer'; m.style.opacity='1'; if(p===P) G.noStT=1.1; else p.noStT=1.1; tone(140,0.12,'square',0.1,100);
}
/** Sprungangriff von Spieler p in Blickrichtung seiner Kamera (vom Baum: Sprung nach unten). */
function doPounce(p=P){
  if(p.dead) return;
  if(p.bite){ biteHit(p); return; }   // festgebissen: die Sprung-Taste beißt zu
  if(G.paused||p.pounce>0||p.pcd>0||p.drag) return;
  if(p.tree!=null&&p.climbT<1) return;
  if(p.st<15){ noStamina(p); return; }
  p.leap=false;
  if(assistBite(p)) return;
  if(p.tree!=null){ if(p.climbT<1) return; const h=p.upNow; p.leap=true; leaveTree(p,1); p.dropRate=h/(0.55+0.04*p.L.b.jmp); }
  p.st-=15; p.pounce=(p.leap?0.55:0.38)+0.04*p.L.b.jmp; p.pT=p.pounce; p.pcd=1.3-0.2*p.L.b.jmp; p.hit=false; snd.pounce();
  if(!pounceRun(p)) p.rot=Math.atan2(-Math.sin(p.cam.yaw),-Math.cos(p.cam.yaw));   // sonst: in die Richtung, in die er gerade läuft bzw. schaut
  if(tryFishCatch(p)){
    p.L.hunger=Math.min(100,p.L.hunger+12); floatText('Fisch gefangen · +12 Sättigung',p.x,p.y+1.8*pScale(p.L),p.z,'#9ed7ce');
    tell(p,'Ein kleiner Fisch – nicht viel, aber besser als nichts. +2 EP','#9ed7ce'); gainXp(2,p);
    if(G.discoverFish) G.discoverFish(p); save();
  }
}
/** Richtung des Sprungangriffs je Spieler: zum Fadenkreuz (Kamera) oder in die aktuelle Laufrichtung. Jeder stellt es für sich ein (gespeichert je Spielernummer). */
const pKey=p=>'jaguar-pounce'+((p.num||1)>1?'-'+p.num:'');
function pounceRun(p=P){ if(p.pounceRun==null){ try{ p.pounceRun=localStorage.getItem(pKey(p))==='run'; }catch(e){ p.pounceRun=false; } } return p.pounceRun; }
function togglePounce(p=P){ p.pounceRun=!pounceRun(p); try{ localStorage.setItem(pKey(p),p.pounceRun?'run':'aim'); }catch(e){} setPounceLabel(); }
const pounceLabel=p=>'Sprungangriff: '+(pounceRun(p)?'in Laufrichtung':'zum Fadenkreuz');
function setPounceLabel(){ $('btnPounceDir').textContent=pounceLabel(P)+(players.length>1?' (Spieler 1)':''); }
setPounceLabel();
$('btnPounceDir').onclick=()=>togglePounce(P);
/** Brüllen von Spieler p: Raubtiere fliehen, Beute erstarrt. */
function doRoar(p=P){
  if(p.dead) return;
  if(G.paused) return;
  if(p.L.b.roar<1){ tell(p,'Brüllen ist noch nicht gelernt (Tab)','#b9b7a6'); return; }
  if(p.rcd>0) return;
  p.rcd=22-3*p.L.b.roar; const R=16+7*p.L.b.roar;
  const sc=p.g?p.g.scale.x:1; roarFx(p.x,p.camY||p.y,p.z,p.rot,sc,R); p.cam.shake=Math.max(p.cam.shake,0.35); buzz(p,0.6,0.9,600); p.roarT=0.9;
  tell(p,'ROAAAR!','#f2b84b'); snd.roar();
  const n=roarAt(p.x,p.z,R,p.L.lvl,p.L.b.roar); if(n) goalEvent('roar',n);
  if(G.netRoar) G.netRoar(p,R);   // Online-Gast: die Tiere rechnet der Gastgeber
}
/** Brüllen bei x,z mit Reichweite R (Stufe lvl, Brüllen-Stufe rl): Raubtiere fliehen, Beute erstarrt. Gibt die Zahl der vertriebenen Raubtiere zurück. */
function roarAt(x,z,R,lvl,rl){
  let n=0;
  animals.forEach(a=>{ if(a.dead) return; const d=Math.hypot(a.x-x,a.z-z); if(d>R) return;
    if(a.sp.pred){ if(!a.sp.hunt||lvl+2*rl>=a.sp.hunt-3){ a.state='flee'; a.fleeT=0; a.aggro=0; a.scared=5; n++; } }
    else if(!a.sp.boss&&!a.sp.friend&&!a.sp.elephant){ a.stun=1.2+0.5*rl; } });
  return n;
}
/**
 * Spieler p bekommt n Erfahrung; Stufenaufstieg gibt 2 Punkte für die Entwicklung.
 * Im gemeinsamen Spiel wird die Erfahrung gleichmäßig auf alle Spieler verteilt.
 */
function gainXp(n,p=P){
  if(p&&p.ghost) return;   // Erfahrung bekommt ein anderes Gerät selbst
  if(players.length>1){ const share=n/players.length; for(const q of players) gainXpOne(share,q); return; }
  gainXpOne(n,p);
}
function gainXpOne(n,p){
  const L=p.L, lv0=L.lvl; L.xp+=n; let up=false;
  while(L.xp>=xpNeed(L.lvl)){ L.xp-=xpNeed(L.lvl); L.lvl++; L.pts+=2; up=true; }
  if(up){ p.hp=maxHp(L); tell(p,'Stufe '+L.lvl+'! Du wächst. +2 Punkte (Tab)','#f2b84b'); puff(p.x,p.y+1,p.z,0xf2b84b,14,0.7); snd.level();
    if(p===P&&lv0<8&&L.lvl>=8&&!S.cub) setTimeout(()=>toast('Du bist ausgewachsen. Andere Leoparden streifen jetzt umher – du findest sie als rosa Punkte auf der Spürkarte.','#ff9ad0'),3200); }
  save();
}
/** Vibration am Controller von Spieler p */
function buzz(p,strong,weak,ms){ if(p===P){ if(padUI()) rumble(strong,weak,ms); } else if(p.pad!=null) rumble(strong,weak,ms,p.pad); }
/** Spieler p erleidet d Schaden durch a (a.sp beschreibt die Ursache). force: auch auf dem Baum bzw. ohne Schwierigkeitsfaktor. */
function hurtPlayer(d,a,force,p=P){
  if(p.ghost){ if(G.ghostHurt) G.ghostHurt(p,d,a,force); return; }   // Leopard eines anderen Geräts (Online-Spiel): Treffer geht dorthin
  if(p.dead||(p.safe&&!force)) return;
  if(G.paused) return;   // Pause (online läuft die Welt beim Gastgeber weiter): der eigene Leopard ist sicher
  if(!force) d*=D().dmg;
  if(dayF<0.5) p.nightHurt=true;   // für „Nacht ohne Verletzung“ (lexicon.js)
  snd.hurt();
  if(p.skOpen) toggleSkills(p);   // angegriffen: Entwicklung zu, damit man reagieren kann
  p.hp-=d; p.combatT=5; p.cam.shake=Math.max(p.cam.shake,Math.min(0.6,0.15+d/maxHp(p.L)));
  buzz(p,Math.min(1,0.35+d/maxHp(p.L)),0.5,220); hEl(p,'hurt').style.opacity='0.8';
  p.hurtT=0.25;
  floatText('-'+Math.round(d),p.x,p.camY+1.5*pScale(p.L),p.z,'#ff7a5c');
  if(p.hp<=0){
    // Koop: zu Boden gehen, solange ein anderer noch steht (online auch auf einem anderen Gerät);
    // fällt der Letzte am Gerät, endet es für alle hier wie im Einzelspiel (über Spieler 1)
    if(othersAlive(p)){ downPlayer(p,a); return; }
    if(players.length>1){ p.dead=true; p.downT=null; die(P,a); return; }
    die(p,a);
  }
}
/** Endgültiger Tod (Einzelspiel bzw. alle Spieler am Boden): Todesfenster, Erbe, Ende der Blutlinie. */
function die(p,a){
  {
    p.hp=0; p.downT=null; G.heirPending=hasOwnCub(P); G.lineageEnd=!S.cub&&(a.sp.id==='age'||D().perma); let lost=0; if(!G.heirPending&&!G.lineageEnd){ lost=Math.floor(S.xp*D().xpLoss); S.xp-=lost; } save();
    p.dead=true; G.paused=true; p.pounce=0; for(const k in keys) keys[k]=false; G.drag=false;
    if(document.exitPointerLock) document.exitPointerLock();
    p.g.rotation.z=Math.PI/2; p.g.position.y=p.y+0.25*pScale();
    snd.death();
    const fem=(a.sp.id==='hyena'||a.sp.id==='giant'||a.sp.id==='snake'||a.sp.id==='anti');
    G.lastCause=a.sp.id==='hunger'?'verhungert':a.sp.id==='thirst'?'verdurstet':a.sp.id==='age'?'an Altersschwäche gestorben':'von '+(DAT[a.sp.id]||'einem '+a.sp.n)+' getötet';
    const cause=a.sp.id==='hunger'?'Du bist verhungert.':a.sp.id==='thirst'?'Du bist verdurstet.':a.sp.id==='age'?'Du bist an Altersschwäche gestorben.':'Ein'+(fem?'e ':' ')+a.sp.n+' hat dich erwischt.';
    $('deadTxt').textContent=cause+(lost>0?' Du verlierst '+lost+' Erfahrung.':'')+' Stufe, Eigenschaften und Fähigkeiten bleiben dir erhalten.';
    $('deadTip').textContent=a.sp.snake
      ? 'Tipp: Puffottern liegen still im Gras und zischen, bevor sie beißen. Hörst du das Zischen, geh langsam zurück – schleichend bemerkst du sie früher.'
      : a.sp.hippo
      ? 'Tipp: Nilpferde greifen an, wer zwischen sie und ihr Wasser gerät oder ihnen zu nahe kommt. Nachts grasen sie am Ufer – mach einen Bogen um sie, und weich zur Seite aus, wenn eines das Maul aufreißt.'
      : a.sp.elephant
      ? 'Tipp: Elefanten drohen, bevor sie angreifen – gespreizte Ohren und Trompeten heißen: langsam zurück. Wer näher kommt oder stehen bleibt, wird niedergetrampelt. Ein Baum rettet dich.'
      : a.sp.guard&&!(a.sp.hunt&&S.lvl<a.sp.hunt)
      ? 'Tipp: Elterntiere verteidigen ihre Jungen. Halte Abstand zu den Kleinen oder lock die Mutter erst weg.'
      : a.sp.croc
      ? 'Tipp: Krokodile lauern abgetaucht im Wasserloch – nur Luftblasen verraten sie. Trink dort, wo keine aufsteigen, und spring zurück, sobald das Wasser aufschäumt.'
      : a.sp.hunt&&S.lvl<a.sp.hunt
      ? 'Tipp: '+(a.sp.id==='jack'?'Schakale':a.sp.id==='hyena'?'Hyänen':'Löwen')+' jagen dich bis Stufe '+a.sp.hunt+'. Schleiche (C) ins hohe Gras, bis sie dich verlieren.'
      : 'Tipp: Dieses Tier wehrt sich. Greife aus dem Hinterhalt an und zieh dich zurück, wenn dein Leben knapp wird.';
    if(G.heirPending){
      const early=growOf(P)<SWITCH_AT, hl=early?1+Math.floor(SWITCH_AT*7):heirLevel(P);
      $('deadTxt').textContent=cause+(early?' Dein Partner zieht dein Junges allein groß – du spielst als halbstarkes Junges weiter (Stufe '+hl+'), aber ohne das, was du ihm hättest beibringen können.':' Aber dein Junges lebt: Du spielst als dein Junges weiter (Stufe '+hl+') – mit allem, was es bei dir gelernt hat.');
      $('deadTip').textContent='Je größer es ist und je mehr es bei dir gelernt hat, desto stärker startet es.';
      $('btnRespawn').textContent='Als Junges weiterleben';
    } else $('btnRespawn').textContent='Im Bau neu erwachen';
    if(a.sp.id==='thirst'&&!G.heirPending) $('deadTip').textContent='Tipp: Trink regelmäßig an einem Wasserloch (Aktionstaste am Ufer) – aber nicht dort, wo Luftblasen aufsteigen.';
    if(a.sp.id==='hunger'&&!G.heirPending) $('deadTip').textContent='Tipp: Erlegte Beute bleibt liegen – friss mit der Aktionstaste davon, sobald du hungrig bist.';
    if(G.lineageEnd){
      $('deadTxt').textContent=(a.sp.id==='age'?'Du bist an Altersschwäche gestorben und hast keinen Nachwuchs.':cause+' Auf „Schwer" gibt es ohne Nachwuchs kein Zurück.')+' Deine Blutlinie endet in Generation '+(S.gen||1)+'.';
      $('deadTip').textContent='Beim nächsten Mal: Ab Stufe 8 einen Partner suchen und rechtzeitig ein Junges großziehen.';
      $('btnRespawn').textContent='Neue Blutlinie beginnen';
    }
    $('hurt').style.opacity=0.55; $('dead').style.display='flex'; updateUI();
  }
}
/** Spieler p erwacht neu (im Bau, als Junges oder mit neuer Blutlinie). */
function respawn(p=P){
  let sx=2, sz=2, newLine=false;
  if(G.heirPending&&S.cub){
    { const sp=cubSpot(P); sx=sp.x; sz=sp.z; } becomeCub(false);
    toast('Generation '+S.gen+': Du bist jetzt dein Junges – mit den Erbanlagen deiner Linie und 10 % der Punkte.'+(S.p2?' Dein anderes Elterntier sorgt weiter für dich.':''),'#ff9ad0');
  }
  else if(G.lineageEnd){ recordAncestor(G.lastCause); archiveLine(); const df=S.diff; resetState(); S.diff=df; save(); if(REG_ID!=='savanne'){ reloadWorld(false); return; } rebuildPlayer(); rebuildCub(); animals.forEach(placeAnimal); G.raider=null; newLine=true; toast('Eine neue Blutlinie beginnt.','#f2b84b'); }
  else { S.hunger=Math.max(S.hunger,70); S.thirst=Math.max(S.thirst??100,70); }
  G.heirPending=false; G.lineageEnd=false; forgetWounds(p);
  p.tree=null; p.safe=false; p.dropY=0; p.upNow=0; p.x=sx; p.z=sz; p.rot=START_ROT; p.cam.yaw=START_YAW; p.hp=maxHp(); p.st=maxSt(); p.pounce=0; p.pcd=0; p.sneak=false; p.combatT=0; p.g.rotation.z=0;
  animals.forEach(o=>{ o.aggro=0; o.sus=0; o.near=false; if(o.state==='chase'){ o.state='wander'; o.timer=0; } });
  updateWarn(0); $('hurt').style.opacity=0; $('crossMsg').style.opacity='0'; p.downT=null; $('dead').style.display='none'; p.dead=false; G.paused=false; initAudio(); snd.click();
  if(newLine) resetMates();   // neue Blutlinie: auch die Mitspieler fangen neu an
  emit('respawn');
  if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
}
$('btnRespawn').onclick=()=>respawn();
/**
 * Spieler p trifft Tier a: Schaden, Hinterhalt, Beute, Erfahrung (Erfahrung und Stufe sind noch gemeinsam).
 * Online beim Gastgeber kann p auch der Leopard eines Gastes sein (Ghost): Schaden kommt dann aus seiner Nachricht (atkD),
 * was er sieht und hört, schickt G.ghostHitFx an sein Gerät.
 */
function hitAnimal(a,p=P){
  if(a.sp.human){ humanHit(a,p); return; }   // Wilderer: verletzen und vertreiben, nicht erlegen
  if(a.rolled){   // eingerolltes Schuppentier: Der Biss gleitet am Panzer ab
    p.combatT=5; if(!p.ghost){ floatText('Panzer! Der Biss gleitet ab',a.x,H(a.x,a.z)+a.sp.size*2,a.z,'#ddd'); snd.hit(); }
    a.rollT=Math.max(a.rollT||0,rnd(6,10)); return; }
  painCry(a);
  let d=p.ghost?p.atkD:dmg(p.L), amb=false; const leap=!!p.leap;
  // Hinterhalt – auch bei Tieren auf der Flucht vor dem Feuer und bei ziehenden Gnus (sie achten nicht auf dich)
  if(a.state==='wander'||a.state==='lurk'||a.stun>0||a.ev==='fire'||a.ev==='migr'){ d*=2+0.6*p.L.b.amb; amb=true; }
  if(leap){ d*=1.25+0.25*p.L.b.climb; p.leap=false; }
  d=Math.round(d*rnd(0.9,1.1));
  a.hp-=d; p.combatT=5;
  puff(a.x,H(a.x,a.z)+a.sp.size,a.z,0xc0392b,4,0.5);
  // aus dem Hinterhalt auf ein Tier, das dieser Biss nicht erledigt: festbeißen (das Minispiel entscheidet)
  const bite=amb&&a.hp>0&&!a.held&&!players.some(o=>o.bite)&&bitable(a,0);
  if(bite) a.hp+=d;   // überlebt den Biss: festbeißen
  if(p.ghost){ if(G.ghostHitFx) G.ghostHitFx(p,a,d,amb,leap,bite); } else hitFx(a,p,d,amb,leap);
  if(bite){ if(p.ghost){ a.held=p; a.heldAt=performance.now(); } else startBite(p,a,d); return; }
  if(a.wound) a.hp-=Math.round(d*0.5);   // verwundete Beute ist leichter zu erlegen
  if(a.hp<=0){ killAnimal(a,p); return; }
  if(a===G.raider&&!a.raidXp){ a.raidXp=true; tell(p,'Du stellst dich dem Räuber am Bau! +40 EP','#9be07f'); gainXp(40,p); }
  if(a.juv){ startFlee(a); defendYoung(a,p); return; }
  if(a.sp.snake){ a.state='chase'; a.aggro=6; return; }
  if(a.sp.fight){ a.state='chase'; a.aggro=10; a.scared=0; }
  else startFlee(a);
}
/** Was Spieler p bei seinem Treffer auf a sieht, hört und lernt (online auch auf dem Gerät eines Gastes, mit dem Tier vom Gastgeber) */
function hitFx(a,p,d,amb,leap){
  if(leap) floatText('Sprung vom Baum!',p.x,p.camY+2*pScale(p.L),p.z,'#9be07f');
  floatText((amb?'Hinterhalt! ':'')+'-'+d,a.x,H(a.x,a.z)+a.sp.size*1.8,a.z,amb?'#f2b84b':'#fff');
  G.lastHit=a; G.lastHitT=6; snd.hit(); if(amb){ snd.ambush(); goalEvent('amb',1); buzz(p,0.25,0.6,120); G.slowT=Math.max(G.slowT,0.16); p.cam.shake=Math.max(p.cam.shake,0.3*pScale(p.L)); }
  if(amb) cubLearn(p,'amb');
}
/** Junges a wurde von Spieler p angegriffen: Mutter und wehrhafte Artgenossen in der Nähe gehen auf ihn los */
function defendYoung(kid,p){
  for(const o of animals){ if(o.dead||o.juv||o.sp!==kid.sp||!o.sp.guard||o.held) continue;
    if(o!==kid.mom&&Math.hypot(o.x-kid.x,o.z-kid.z)>30) continue;
    o.state='chase'; o.tgt=p; o.aggro=6; o.lost=0; o.scared=0; o.gcd=12; floatText('!',o.x,H(o.x,o.z)+o.sp.size*2.2,o.z,'#ff5a3c'); }
}
/** Tier a ist erlegt (von Spieler p); fromWounds: an seinen Wunden gestorben, während der Jäger anderswo ist */
/** Getroffene Beute schreit: Hase und Maus quieken, Wild- und Warzenschwein quieken laut */
function painCry(a){
  const id=a.sp.id;
  if(id==='hase'||id==='maus') snd3d(['squeak'],a.x,a.z,id==='maus'?0.3:0.5,35,id==='maus'?rnd(1.35,1.6):rnd(0.95,1.15));
  else if(id==='boar'||id==='wart') snd3d(['boarSqueal'],a.x,a.z,0.55,60,id==='wart'?rnd(1.05,1.2):rnd(0.9,1.02));
  else if(id==='erdf') snd3d(['boarSqueal'],a.x,a.z,0.45,50,rnd(0.75,0.85));
}
function killAnimal(a,p=P,fromWounds){
  if(a.dead) return;
  a.wound=null; a.held=null;
  a.dead=true; a.respawn=rnd(18,30);
  // Jede Beute bleibt als Kadaver mit einer Kugel je Bissen liegen: Fressen ist eine bewusste Entscheidung (Aktionstaste)
  makeCarcass(a,a.juv?Math.max(1,Math.ceil((FOOD[a.sp.id]||1)*0.4)):FOOD[a.sp.id]||1);
  puff(a.x,H(a.x,a.z)+a.sp.size*0.7,a.z,a.sp.m.col,10,0.5+a.sp.size*0.5);
  const xpv=Math.round(a.sp.xp*(a.juv?0.4:1))*(a.fur&&a.fur.albino?2:1);
  if(p.ghost){ if(G.ghostKill) G.ghostKill(p,a,xpv,!!(a.fur&&a.fur.albino)); return; }   // Gast: Belohnung auf seinem Gerät
  killRewards(a,p,fromWounds,xpv,!!(a.fur&&a.fur.albino));
}
/** Was Spieler p für das Erlegen von a bekommt: Erfahrung, Leben, Ziele, Lernen fürs Junge, Sieg über den Herrscher */
function killRewards(a,p,fromWounds,xpv,albino){
  if(!fromWounds&&!p.dead) cubLearn(p,'kill');
  if(!fromWounds){ snd.kill(); buzz(p,0.5,0.8,180); G.slowT=Math.max(G.slowT,0.22); p.cam.shake=Math.max(p.cam.shake,0.4*pScale(p.L)); }
  {
    p.L.kills=(p.L.kills||0)+1; goalEvent('kill',1,{sp:a.sp.id,night:dayF<0.5,herd:!!a.herd});
    if(fromWounds) tell(p,a.sp.n+': an den Wunden verendet – folge der Blutspur zum Kadaver!','#f2b84b');
    p.hp=Math.min(maxHp(p.L),p.hp+maxHp(p.L)*0.25+a.sp.xp*0.1);
    if(albino) tell(p,'Seltene Beute: ein Albino! Doppelte Erfahrung.','#f2b84b');
    floatText('+'+xpv+' EP',p.x,p.y+2*pScale(p.L),p.z,'#8ad4ef');
    gainXp(xpv,p);
    if(a.sp.boss&&!beaten(REG_ID)){ S.beat=Object.assign({},S.beat,{[REG_ID]:true}); if(REG_ID==='savanne') S.won=true; save(); $('winTitle').textContent=REG.winT; $('winText').textContent=REG.winX; setTimeout(()=>{ snd.win(); $('win').style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); },900); }
  }
}
G.lastHit=null; G.lastHitT=0;

export { hitFx, killAnimal, killRewards, roarAt };
export { doClimb, doPounce, pounceLabel, pounceRun, setPounceLabel, togglePounce, doRoar, gainXp, hitAnimal, hurtPlayer, nearestTree };
export { respawn };
