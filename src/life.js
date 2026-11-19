// LeopardLife – Lebenslauf: Hunger, Altern, Fressen aus dem Vorrat.
import { dead, hurtPlayer } from './actions.js';
import { snd } from './audio.js';
import { P } from './player.js';
import { D, DIE_AT, OLD_AT, S, has, maxHp, pScale } from './save.js';
import { G } from './state.js';
import { floatText, toast } from './ui.js';

/* ---------- Lebenslauf: eigener Hunger, Altern, Fressen aus dem Vorrat ---------- */
G.lineageEnd=false; G.lastCause='';
function eatFood(){ if(S.food<=0) return; S.food--; S.hunger=Math.min(100,S.hunger+12); P.hp=Math.min(maxHp(),P.hp+maxHp()*0.05); snd.eat(); floatText('gefressen',P.x,P.camY+1.6*pScale(),P.z,'#e0a060'); }
function updateLife(dt){
  if(dead) return;
  S.hunger=Math.max(0,S.hunger-dt*(100/420)*(has('genug')?0.75:1)*D().hunger);
  if(S.hunger<20&&S.food>0){ S.food--; S.hunger=Math.min(100,S.hunger+12); }   // Notration aus dem Vorrat
  if(S.hunger<=0){ P.hp-=maxHp()*0.015*dt; if(P.hp<=0){ hurtPlayer(1e9,{sp:{id:'hunger',n:'Hunger'}},true); return; } }
  if(S.lvl>=8){
    const a0=S.age, D=DIE_AT(); S.age+=dt;
    if(a0<OLD_AT&&S.age>=OLD_AT) toast('Du wirst alt: Tempo und Kraft lassen nach. Sorge für Nachwuchs, damit deine Linie weiterlebt.','#f2b84b');
    if(a0<D-90&&S.age>=D-90) toast('Deine Kräfte schwinden. Dir bleibt nicht mehr viel Zeit.','#ff8a70');
    if(S.age>=D) hurtPlayer(1e9,{sp:{id:'age',n:'Alter'}},true);
  }
}

export { updateLife };
