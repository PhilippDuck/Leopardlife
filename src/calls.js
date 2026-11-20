// LeopardLife – Tierrufe aus der Umgebung: Hyänen kichern, Löwen brüllen in der Ferne, Schakale heulen nachts.
// Jeder Ruf kommt aus der Richtung des Tieres und wird mit der Entfernung leiser (snd3d in audio.js).
import { animals } from './animals.js';
import { snd3d } from './audio.js';
import { dayF } from './daynight.js';
import { W } from './weather.js';
import { rnd } from './util.js';

// je Art: Aufnahmen, Lautstärke, Hörweite, Abstand zwischen Rufen (s), wann (Nachtanteil 0…1 → Faktor für die Häufigkeit)
const CALLS={
  hyena:{ks:['hyenaA','hyenaB'],vol:0.45,maxD:170,gap:[14,40],when:n=>0.5+n},
  lion:{ks:['lion'],vol:0.55,maxD:320,gap:[40,110],when:n=>0.25+1.2*n},
  jack:{ks:['jackalA','jackalB'],vol:0.8,maxD:220,gap:[25,60],when:n=>n>0.4?n:0}
};
/** Jedes Bild: Rufe der Tiere zu zufälligen Zeiten (nicht im Starkregen) */
function updateCalls(dt){
  const night=1-dayF, wet=W.rain>0.5;
  for(const a of animals){
    const c=CALLS[a.sp.id]; if(!c||a.dead) continue;
    if(a.callT==null) a.callT=rnd(c.gap[0],c.gap[1]);
    a.callT-=dt; if(a.callT>0) continue;
    const f=c.when(night); a.callT=rnd(c.gap[0],c.gap[1])/Math.max(0.2,f);
    if(f<=0.05||wet) continue;
    snd3d(c.ks,a.x,a.z,c.vol,c.maxD);
  }
}
/** Ein Raubtier beginnt die Jagd auf einen Spieler: Knurren aus seiner Richtung */
function growlAt(a){ snd3d(['growlA','growlB'],a.x,a.z,1.2,90,a.sp.size>1.2?rnd(0.8,0.9):rnd(0.95,1.15)); }
/** Beute hat einen Leoparden entdeckt: Alarmschnauben (nicht bei Mäusen und Hasen) */
function alarmAt(a){ if(a.sp.size<0.5||a.sp.pred) return; snd3d('alarm',a.x,a.z,0.9,120,a.sp.size>1.5?0.8:rnd(0.95,1.12)); }
/** Hyänen haben einen Kadaver gewittert: bald kichern sie */
function callSoon(a){ a.callT=rnd(0.5,2.5); }

export { alarmAt, callSoon, growlAt, updateCalls };
