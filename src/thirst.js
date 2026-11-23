// LeopardLife – Durst: am Ufer eines Wasserlochs trinken (Aktionstaste). Wer trinkt, hat den Kopf unten – Krokodile nutzen das.
import { animals } from './animals.js';
import { snd } from './audio.js';
import { puff } from './effects.js';
import { goalEvent } from './goals.js';
import { pScale } from './save.js';
import { PONDS, WATER_D } from './terrain.js';
import { floatText } from './ui.js';

/** Wasser je Sekunde beim Trinken */
const DRINK_RATE=22;
/** Wasserloch, an dessen Ufer (oder im flachen Wasser) Spieler p steht, sonst null. Die Wasserlinie liegt bei etwa 0,78 × Radius. */
function shoreOf(p){
  for(const q of PONDS){ const d=Math.hypot(p.x-q.x,p.z-q.z); if(d<q.r*0.98) return q; }
  return null;
}
/** Kontextaktion „Trinken“ für Spieler p, sonst null */
function drinkContext(p){
  if(p.dead||p.tree!=null||p.drag||p.drinking||p.pounce>0) return null;
  const L=p.L; if((L.thirst??100)>=95) return null;
  const q=shoreOf(p); if(!q) return null;
  return {label:'Trinken',fn:()=>startDrink(p,q)};
}
/** Spieler p beginnt zu trinken: dreht sich zum Wasser, senkt den Kopf */
function startDrink(p,q){
  p.drinking=q; p.drinkT=0; p.drinkHp=p.hp; p.rot=Math.atan2(q.x-p.x,q.z-p.z); p.eatC=null;
}
/** Trinken läuft: füllt Wasser auf, kleine Wellen und Schlabbern. Endet bei Bewegung, Treffer, voll oder weg vom Ufer. */
function updateDrinking(p,dt){
  const q=p.drinking; if(!q) return;
  const L=p.L, moving=Math.hypot(p.ctl.fw,p.ctl.rt)>0.1;
  const hit=p.hp<(p.drinkHp??p.hp)-0.5; p.drinkHp=p.hp;   // ein Treffer reißt den Kopf hoch
  if(p.dead||moving||hit||p.tree!=null||p.pounce>0||shoreOf(p)!==q){ p.drinking=null; return; }
  L.thirst=Math.min(100,(L.thirst??100)+DRINK_RATE*dt);
  p.drinkT+=dt;
  if(p.drinkT>=0.45){ p.drinkT=0; snd.lap();
    const r=0.9*pScale(L); puff(p.x+Math.sin(p.rot)*r,q.L-WATER_D+0.04,p.z+Math.cos(p.rot)*r,0xd8ecf2,2,0.12); }
  if(L.thirst>=100){ p.drinking=null; floatText('getrunken',p.x,p.y+1.6*pScale(L),p.z,'#7fc8e8'); if(animals.some(a=>a.sp.croc&&!a.dead&&a.pond===q)) goalEvent('crocDrink',1); }
}

export { drinkContext, shoreOf, updateDrinking };
