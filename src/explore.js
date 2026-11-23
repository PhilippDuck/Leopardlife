// LeoLife – Erkunden: Wer ein Wasserloch zum ersten Mal erreicht, bekommt Erfahrung.
import { gainXp } from './actions.js';
import { tell } from './coop.js';
import { players } from './player.js';
import { REG_ID, S, pScale, save } from './save.js';
import { PONDS } from './terrain.js';
import { floatText } from './ui.js';

const XP_POND=20;
let tick=0;
function updateExplore(dt){
  tick-=dt; if(tick>0) return; tick=0.5;
  const found=S.found||(S.found={});
  for(const p of players){
    if(p.dead) continue;
    PONDS.forEach((q,i)=>{
      const k=REG_ID+':'+i; if(found[k]||Math.hypot(p.x-q.x,p.z-q.z)>q.r+6) return;
      found[k]=1; save();
      floatText('Neues Wasserloch! +'+XP_POND+' EP',p.x,p.y+2*pScale(p.L),p.z,'#7fc8e8');
      tell(p,q.murky?'Du hast einen trüben Tümpel entdeckt – sei hier besonders vorsichtig.':'Du hast ein neues Wasserloch entdeckt.','#7fc8e8');
      gainXp(XP_POND,p);
    });
  }
}

export { updateExplore };
