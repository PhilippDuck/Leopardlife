// LeoLife – Umgebungsgeräusche, die an Orten hängen: Fluss am Wasser, Frösche nachts an Wasserlöchern und Fluss,
// Prasseln beim Steppenbrand. Gehört wird vom nächsten Spieler aus (wie bei den Tierrufen).
import { setEnvLoops } from './audio.js';
import { dayF } from './daynight.js';
import { players } from './player.js';
import { pondAt, riverNear } from './terrain.js';
import { EV } from './worldevents.js';

const near=(e,far)=>Math.max(0,Math.min(1,1-e/far));
let envT=0;
/** Alle 0,25 s: wie nah ist der nächste Spieler an Fluss, Wasser und Feuerfront? */
function updateEnvSound(dt){
  envT-=dt; if(envT>0) return; envT=0.25;
  let river=0, water=0, fire=0;
  for(const p of players){
    const rv=riverNear(p.x,p.z), e=rv.e;
    river=Math.max(river,near(e,45)*(rv.ford>0.3?1.2:1));
    water=Math.max(water,near(e,60),pondAt(p.x,p.z,3.5)?1:pondAt(p.x,p.z,6)?0.5:0);
    if(EV.on==='fire'){ const d=Math.abs((p.x*EV.dir.x+p.z*EV.dir.z)-EV.s); fire=Math.max(fire,near(d,140)); }
  }
  const night=Math.max(0,Math.min(1,(0.55-dayF)/0.35));
  setEnvLoops({river:0.5*river*river,frogs:0.32*water*night,fire:0.9*fire*fire});
}
export { updateEnvSound };
