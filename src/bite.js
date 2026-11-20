// LeopardLife – Festbeißen: Springt ein Leopard aus der Deckung auf große Beute, beißt er sich fest. Ein Punkt pendelt über
// einen Balken; im richtigen Moment drücken (Sprung-Taste: Leertaste/Klick, RT/Ⓐ, Doppeltipp). Je näher an der Mitte,
// desto besser der Biss. Nach 3–5 Bissen entscheidet der Durchschnitt: erlegt – oder das Tier reißt sich los, blutet,
// wird langsamer und erliegt je nach Schwere der Wunden später (Blutspur!). Ganz leichte Wunden heilen wieder.
import { snd } from './audio.js';
import { hEl } from './coop.js';
import { FOOD } from './data.js';
import { bloodDrop, puff } from './effects.js';
import { players, P } from './player.js';
import { has } from './save.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { rnd } from './util.js';
import { killAnimal } from './actions.js';
import { padUI } from './gamepad.js';
import { touchUI } from './input.js';

/** Große Beute, bei der man sich festbeißt: ab Hirschgröße, keine Raubtiere und keine Kämpfer */
const bitable=a=>!a.sp.pred&&!a.sp.fight&&!a.sp.friend&&(FOOD[a.sp.id]||0)>=6;
/** Festbeißen beginnen (statt eines normalen Treffers) */
function startBite(p,a){
  const big=FOOD[a.sp.id]||6, n=3+(big>=10?1:0)+(big>=20?1:0);
  p.bite={a,n,round:0,pos:Math.random(),dir:1,speed:0.9+big*0.02,scores:[],idle:0};
  a.held=p; a.state='flee'; p.pounce=0; p.combatT=5;
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
  const word=acc>0.9?'Perfekt!':acc>0.65?'Gut':acc>0.3?'Knapp':'Daneben';
  floatText(word,a.x,y,a.z,acc>0.9?'#f2b84b':acc>0.65?'#9be07f':acc>0.3?'#e0c060':'#ff7a5a');
  snd.hit(); puff(a.x,y-0.6,a.z,0xc0392b,3+Math.round(acc*4),0.4);
  p.cam.shake=Math.max(p.cam.shake,0.12+acc*0.25); if(p.pad!=null||padUI()) buzzP(p,acc);
  if(acc<0.15&&b.round<b.n){ endBite(p,true); return; }   // ganz daneben: das Tier reißt sich sofort los
  b.speed*=1.18; b.dir=Math.random()<0.5?1:-1;
  if(b.round>=b.n) endBite(p,false); else biteUi(p);
}
function buzzP(p,acc){ try{ const g=navigator.getGamepads&&navigator.getGamepads()[p.pad!=null?p.pad:0]; const h=g&&g.vibrationActuator; if(h) h.playEffect('dual-rumble',{duration:90+acc*120,strongMagnitude:0.3+acc*0.6,weakMagnitude:0.4}); }catch(e){} }
/** Ende: erlegt oder verwundet entkommen */
function endBite(p,broke){
  const b=p.bite; p.bite=null; hEl(p,'bite').style.display='none';
  const a=b.a; a.held=null; if(a.dead) return;
  const avg=b.scores.reduce((x,y)=>x+y,0)/b.n;   // nicht mehr geschaffte Bisse zählen als 0
  const chance=Math.max(0.03,Math.min(0.97,avg*1.15+(has('kiefer',p.L)?0.08:0)+Math.min(0.1,(p.L.lvl-(a.sp.hunt||a.sp.lvl||1))*0.02)-(FOOD[a.sp.id]>=20?0.12:0)));
  if(!broke&&Math.random()<chance){ killAnimal(a,p); return; }
  // losgerissen: blutet je nach Schwere; leicht verletzt heilt es wieder
  a.wound={sev:avg,t:0,die:avg<0.28?0:14+(1-avg)*70,heal:30,by:p,acc:0};
  a.hp=Math.max(1,Math.round(a.hp*(1-avg*0.6)));
  a.state='flee'; a.fleeT=0;
  toast(a.wound.die?(a.sp.n+' hat sich losgerissen und blutet stark – folge der Blutspur!'):(a.sp.n+' hat sich losgerissen – nur eine leichte Wunde.'),a.wound.die?'#ff7a5a':'#b9b7a6');
}
/** Balken zeichnen: Punkt, Zielzone, Runden */
function biteUi(p){
  const b=p.bite; if(!b) return;
  hEl(p,'biteDot').style.left=(b.pos*100)+'%';
  hEl(p,'biteRounds').textContent=Array.from({length:b.n},(_,i)=>i<b.scores.length?(b.scores[i]>0.65?'●':'◐'):'○').join(' ');
  const k=p!==P||padUI()?'RT / Ⓐ':touchUI()?'tippen':'Leertaste / Klick';
  hEl(p,'biteHint').textContent='Festgebissen! In der Mitte drücken ('+k+')';
}
/** Jedes Bild: Punkt pendeln lassen, Leopard am Tier halten; Wunden bluten und schwächen */
function updateBite(dt){
  for(const p of players){ const b=p.bite; if(!b) continue;
    const a=b.a; if(p.dead||a.dead){ p.bite=null; a.held=null; hEl(p,'bite').style.display='none'; continue; }
    b.pos+=b.dir*b.speed*dt; if(b.pos>1){ b.pos=2-b.pos; b.dir=-1; } if(b.pos<0){ b.pos=-b.pos; b.dir=1; }
    b.idle+=dt; if(b.idle>3.5){ b.scores.push(0); b.round++; b.idle=0; if(b.round>=b.n){ endBite(p,false); continue; } }   // zu lange gewartet: Biss verpasst
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
  if(w.t>=w.die){ const by=w.by&&players.indexOf(w.by)>=0?w.by:P; a.wound=null; killAnimal(a,by,true); }
}
/** Beim Laufen eines verwundeten Tieres: Blutstropfen auf den Boden */
function woundTrail(a,dist){
  const w=a.wound; if(!w) return; w.acc+=dist;
  if(w.acc>(w.die?1.1:2.2)){ w.acc=0; bloodDrop(a.x+rnd(-0.3,0.3),a.z+rnd(-0.3,0.3),w.die?1:0.6); }
}

export { biteHit, bitable, endBite, startBite, updateBite, woundSlow, woundTick, woundTrail };
