// LeopardLife – Festbeißen: Springt ein Leopard aus der Deckung auf große Beute, beißt er sich fest. Ein Punkt pendelt über
// einen Balken; im richtigen Moment drücken (Sprung-Taste: Leertaste/Klick, RT/Ⓐ, Doppeltipp). Je näher an der Mitte,
// desto besser der Biss. Nach 3–5 Bissen entscheidet der Durchschnitt: erlegt – oder das Tier reißt sich los, blutet,
// wird langsamer und erliegt je nach Schwere der Wunden später (Blutspur!). Ganz leichte Wunden heilen wieder.
import { snd } from './audio.js';
import { hEl, tell } from './coop.js';
import { bloodDrop, puff } from './effects.js';
import { players, P } from './player.js';
import { has } from './save.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { animals } from './animals.js';
import { rnd } from './util.js';
import { hurtPlayer, killAnimal } from './actions.js';
import { padUI } from './gamepad.js';
import { touchUI } from './input.js';

/** Festbeißen bei jedem Tier, das ein Biss nicht sofort erledigt (d = Schaden dieses Bisses) – außer Leoparden und Krokodilen im Wasser */
const fights=a=>!!(a.sp.pred||a.sp.fight);
const bitable=(a,d)=>!a.sp.friend&&!a.sp.croc&&a.hp>d;
/** Festbeißen beginnen (statt eines normalen Treffers) */
function startBite(p,a,d){
  // je zäher das Tier im Verhältnis zu deinem Biss, desto mehr Bisse (3–5) und desto schneller der Punkt
  const tough=a.hp/Math.max(1,d), n=3+(tough>2.5?1:0)+(tough>5?1:0);
  p.bite={a,n,combo:0,round:0,pos:Math.random(),dir:1,speed:0.85+Math.min(0.6,tough*0.06),scores:[],idle:0};
  a.held=p; p.pounce=0; p.combatT=5;
  p.x=a.x-Math.sin(a.g.rotation.y)*(a.rad*0.6); p.z=a.z-Math.cos(a.g.rotation.y)*(a.rad*0.6); p.rot=a.g.rotation.y;
  snd.hit(); puff(a.x,H(a.x,a.z)+a.sp.size,a.z,0xc0392b,6,0.5);
  biteUi(p); hEl(p,'bite').style.display='block';
}
/** Druck auf die Sprung-Taste während des Festbeißens: Treffer bewerten */
function biteHit(p){
  const b=p.bite; if(!b) return;
  const acc=Math.max(0,1-Math.abs(b.pos-0.5)*2.2);   // 1 = genau Mitte
  b.scores.push(acc); b.round++; b.idle=0;
  const a=b.a, y=H(a.x,a.z)+a.sp.size*1.6;
  b.combo=acc>0.65?(b.combo||0)+1:0;
  const word=(acc>0.9?'Perfekt!':acc>0.65?'Gut!':acc>0.3?'Knapp':'Daneben')+(b.combo>1?' ×'+b.combo:'');
  floatText(word,a.x,y,a.z,acc>0.9?'#f2b84b':acc>0.65?'#9be07f':acc>0.3?'#e0c060':'#ff7a5a');
  snd.bite(acc,b.combo);
  // gute Bisse fühlen sich nach Erfolg an: goldene Funken, Balken leuchtet auf, kein Wackeln; nur Fehlbisse rütteln
  if(acc>0.65){ puff(a.x,y-0.5,a.z,acc>0.9?0xf2b84b:0x9be07f,4+Math.round(acc*5),0.55); puff(a.x,y-0.8,a.z,0xc0392b,2,0.3); }
  else { puff(a.x,y-0.7,a.z,0x8a7a60,3,0.35); if(acc<0.3) p.cam.shake=Math.max(p.cam.shake,0.15); }
  flash(p,acc>0.9?'f1':acc>0.65?'f2':acc>0.3?'f3':'f4');
  if(p.pad!=null||padUI()) buzzP(p,acc);
  if(fights(a)&&acc<0.65) counter(p,a,acc);   // Raubtiere und Kämpfer beißen bei schwachen Bissen zurück
  if(p.dead||!p.bite) return;
  if(acc<(fights(a)?0.3:0.15)&&b.round<b.n){ endBite(p,true); return; }   // ganz daneben: das Tier reißt sich los (Wehrhafte schon eher)   // ganz daneben: das Tier reißt sich sofort los
  b.speed*=1.18;   // Punkt läuft in seiner Richtung weiter, nur schneller
  if(b.round>=b.n) endBite(p,false); else biteUi(p);
}
/** Gegenbiss eines wehrhaften Tieres: je schlechter dein Biss, desto eher und härter */
function counter(p,a,acc){
  if(Math.random()>0.45+(0.65-acc)*0.8) return;
  const y=H(a.x,a.z)+a.sp.size*1.9;
  floatText('Gegenbiss!',a.x,y,a.z,'#ff5a3a'); puff(p.x,y-0.8,p.z,0xc0392b,5,0.5);
  hurtPlayer((a.sp.dmg||10)*(0.35+(0.65-acc)*0.6),a,false,p);
}
/** Balken kurz aufleuchten lassen (CSS-Klasse neu starten) */
function flash(p,c){ const el=hEl(p,'bite'); el.classList.remove('f1','f2','f3','f4'); void el.offsetWidth; el.classList.add(c); }
function buzzP(p,acc){ try{ const g=navigator.getGamepads&&navigator.getGamepads()[p.pad!=null?p.pad:0]; const h=g&&g.vibrationActuator; if(h) h.playEffect('dual-rumble',acc>0.65?{duration:70,strongMagnitude:0.15,weakMagnitude:0.5+acc*0.4}:{duration:160,strongMagnitude:0.5,weakMagnitude:0.2}); }catch(e){} }
/** Ende: erlegt oder verwundet entkommen */
function endBite(p,broke){
  const b=p.bite; p.bite=null; hEl(p,'bite').style.display='none';
  const a=b.a; a.held=null; if(a.dead) return;
  const avg=b.scores.reduce((x,y)=>x+y,0)/b.n;   // nicht mehr geschaffte Bisse zählen als 0
  const chance=Math.max(0.03,Math.min(0.97,avg*1.15+(has('kiefer',p.L)?0.08:0)+Math.min(0.1,(p.L.lvl-(a.sp.hunt||a.sp.lvl||1))*0.02)-(a.sp.boss?0.12:0)-(fights(a)?0.1:0)));
  if(!broke&&Math.random()<chance){ killAnimal(a,p); return; }
  // losgerissen: blutet je nach Schwere; leicht verletzt heilt es wieder
  a.wound={sev:avg,t:0,die:avg<0.28?0:14+(1-avg)*70,heal:30,by:p,acc:0};
  a.hp=Math.max(1,Math.round(a.hp*(1-avg*0.6)));
  if(a.sp.fight||a.sp.pred){ a.state='chase'; a.aggro=10; a.scared=0; a.lost=0; } else { a.state='flee'; a.fleeT=0; }   // Raubtiere und Kämpfer wehren sich
  toast(a.wound.die?(a.sp.n+' hat sich losgerissen und blutet stark – folge der Blutspur!'):(a.sp.n+' hat sich losgerissen – nur eine leichte Wunde.'),a.wound.die?'#ff7a5a':'#b9b7a6');
}
/** Balken zeichnen: Punkt, Zielzone, Runden */
function biteUi(p){
  const b=p.bite; if(!b) return;
  hEl(p,'biteDot').style.left=(b.pos*100)+'%';
  const res=1-b.scores.reduce((x,y)=>x+y,0)/b.n; hEl(p,'biteRes').style.width=Math.max(0,res*100)+'%';
  hEl(p,'biteRounds').textContent=Array.from({length:b.n},(_,i)=>i<b.scores.length?(b.scores[i]>0.65?'●':'◐'):'○').join(' ');
  const k=p!==P||padUI()?'RT / Ⓐ':touchUI()?'tippen':'Leertaste / Klick';
  hEl(p,'biteHint').textContent=(fights(b.a)?'Es wehrt sich! ':'Festgebissen! ')+'In der Mitte drücken ('+k+')';
}
/** Jedes Bild: Punkt pendeln lassen, Leopard am Tier halten; Wunden bluten und schwächen */
function updateBite(dt){
  for(const p of players){ const b=p.bite; if(!b) continue;
    const a=b.a; if(p.dead||a.dead){ p.bite=null; a.held=null; hEl(p,'bite').style.display='none'; continue; }
    b.pos+=b.dir*b.speed*dt; if(b.pos>1){ b.pos=2-b.pos; b.dir=-1; } if(b.pos<0){ b.pos=-b.pos; b.dir=1; }
    b.idle+=dt; if(b.idle>3.5){ b.scores.push(0); b.round++; b.idle=0; if(fights(a)) counter(p,a,0); if(p.dead||!p.bite) continue; if(b.round>=b.n){ endBite(p,false); continue; } }   // zu lange gewartet: Biss verpasst
    // das Tier zappelt, der Leopard hängt dran
    a.g.rotation.y+=Math.sin(performance.now()/90)*0.02; a.g.position.y=H(a.x,a.z)+Math.abs(Math.sin(performance.now()/120))*0.08;
    p.x=a.x-Math.sin(a.g.rotation.y)*(a.rad*0.6); p.z=a.z-Math.cos(a.g.rotation.y)*(a.rad*0.6); p.rot=a.g.rotation.y;
    biteUi(p);
  }
}
/** Wie stark eine Wunde bremst: 1 = gar nicht, bis 0,35 kurz vor dem Tod */
function woundSlow(a){ const w=a.wound; if(!w) return 1; if(!w.die) return 0.85; return 1-0.65*Math.min(1,w.t/w.die); }
/** Jedes Bild für ein verwundetes Tier: Zeit läuft; leichte Wunden heilen, schwere führen zum Tod */
function woundTick(a,dt){
  const w=a.wound; if(!w) return; w.t+=dt;
  if(!w.die){ if(w.t>w.heal) a.wound=null; return; }
  // Wunde ausgeblutet: das Tier bricht erschöpft zusammen – den letzten Biss musst du selbst setzen (Blutspur folgen)
  if(w.t>=w.die){ a.wound=null; a.hp=1; a.stun=45; a.weak=true; a.state='wander'; a.held=null; a.g.rotation.z=0.5;
    const by=w.by&&players.indexOf(w.by)>=0?w.by:P;
    if(!by.dead) tell(by,a.sp.n+' ist erschöpft zusammengebrochen – folge der Blutspur und gib ihm den Rest!','#f2b84b'); }
}
/** Ein zusammengebrochenes Tier, zu dem keiner kam, rappelt sich wieder auf (mit wenig Leben) */
function weakRecover(a){ if(!a.weak) return; a.weak=false; a.g.rotation.z=0; a.hp=Math.max(a.hp,Math.round(a.sp.hp*0.4)); a.state='flee'; a.fleeT=0; }
/** Spieler p ist gestorben: seine Wunden zählen nicht mehr – verletzte Tiere erholen sich, statt ihm später zuzufallen */
function forgetWounds(p){ for(const a of animals){ if(a.wound&&a.wound.by===p){ a.wound.die=0; a.wound.t=0; } if(a.weak){ a.stun=0; weakRecover(a); } } }
/** Beim Laufen eines verwundeten Tieres: Blutstropfen auf den Boden */
function woundTrail(a,dist){
  const w=a.wound; if(!w) return; w.acc+=dist;
  if(w.acc>(w.die?1.1:2.2)){ w.acc=0; bloodDrop(a.x+rnd(-0.3,0.3),a.z+rnd(-0.3,0.3),w.die?1:0.6); }
}

export { biteHit, bitable, endBite, forgetWounds, startBite, updateBite, weakRecover, woundSlow, woundTick, woundTrail };
