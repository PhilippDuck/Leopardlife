// LeoLife – Termitenfresser: Erdferkel und Schuppentier.
// Abends und nachts ziehen sie von Termitenhügel zu Termitenhügel und graben dort nach Termiten (Staub fliegt). Tagsüber schlafen sie
// zusammengerollt an einem Hügel. Beim Graben und Schlafen sind sie abgelenkt und bemerken einen Leoparden erst spät.
// Das Erdferkel flieht, wenn es dich bemerkt. Das Schuppentier rollt sich zu einer Panzerkugel ein: Dann gleitet jeder Biss ab.
// Es entrollt sich erst wieder, wenn niemand mehr nahe ist; geduckte Leoparden stören dabei nur aus nächster Nähe.
import { moveAnimal } from './ai.js';
import { dayF } from './daynight.js';
import { puff } from './effects.js';
import { actors } from './player.js';
import { MOUNDS } from './props.js';
import { H } from './terrain.js';
import { rnd } from './util.js';
import { setBall, setPose } from './termitepose.js';

const SEEK_R=90;                 // so weit suchen sie nach einem Termitenhügel
const active=()=>dayF<0.45;      // Dämmerung und Nacht
const DUST=0x9c7b54;

/** Nächster Termitenhügel (ohne skip) */
function nearMound(a,skip){
  let best=null, bd=SEEK_R;
  for(const m of MOUNDS){ if(m===skip) continue; const d=Math.hypot(m.x-a.x,m.z-a.z); if(d<bd){ bd=d; best=m; } }
  return best;
}
/** Graben: Vorderbeine scharren abwechselnd, ab und zu fliegt Erde */
function digAnim(a,dt){
  a.ph+=dt*11; const L=a.g.userData.legs;
  if(L.length>=4){ L[0].rotation.x=-0.5+Math.sin(a.ph)*0.6; L[1].rotation.x=-0.5+Math.sin(a.ph+Math.PI)*0.6; L[2].rotation.x=0; L[3].rotation.x=0; }
  a.dustT=(a.dustT||0)-dt;
  if(a.dustT<=0){ a.dustT=rnd(0.45,0.8); const r=a.g.rotation.y, f=a.rad*0.9;
    puff(a.x+Math.sin(r)*f,H(a.x,a.z)+0.15,a.z+Math.cos(r)*f,DUST,2,0.09*a.sp.size/0.5); }
}

/**
 * Ein Bild für einen erwachsenen Termitenfresser im Zustand 'wander'.
 * @returns {boolean} true, wenn diese Funktion das Tier in diesem Bild steuert (sonst läuft das gewöhnliche Umherstreifen)
 */
function termiteStep(a,dt){
  if(a.juv) return false;
  const act=active();
  if(a.tWait>0){ a.tWait-=dt; setPose(a,null); return false; }
  if(a.tpose==='sleep'){ if(!act) return true; setPose(a,null); a.tM=null; a.tWait=rnd(2,5); return false; }   // wacht in der Dämmerung auf
  if(a.tpose==='dig'){ a.digT-=dt; digAnim(a,dt); if(a.digT>0) return true;
    setPose(a,null); a.tDone=a.tM; a.tM=null; a.tWait=rnd(5,12); return false; }   // satt an diesem Hügel: ein Stück weiter
  if(!a.tM||MOUNDS.indexOf(a.tM)<0){ a.tM=nearMound(a,act?a.tDone:null); a.tGo=0; if(!a.tM) return false; }
  const m=a.tM, ex=a.x-m.x, ez=a.z-m.z, e=Math.hypot(ex,ez)||1, r=m.r+a.rad*0.9+0.15;
  const tx=m.x+ex/e*r, tz=m.z+ez/e*r, d=Math.hypot(tx-a.x,tz-a.z);
  if(d>0.7){
    a.tGo+=dt; if(a.tGo>45){ a.tDone=m; a.tM=null; a.tWait=rnd(8,15); return false; }   // kommt nicht hin: anderen Hügel suchen
    moveAnimal(a,tx-a.x,tz-a.z,a.sp.spd*0.3,dt); return true;   // gemächlich, Nase am Boden
  }
  a.g.rotation.y=Math.atan2(m.x-a.x,m.z-a.z);
  if(act){ setPose(a,'dig'); a.digT=rnd(12,25); a.dustT=0; } else setPose(a,'sleep');
  return true;
}
/** Wahrnehmung beim Graben und Schlafen eingeschränkt: Faktor auf die Reichweite */
function termiteSense(a){ return a.tpose==='dig'?0.5:a.tpose==='sleep'?0.3:1; }

/** Schuppentier rollt sich ein */
function rollUp(a){ setPose(a,null); setBall(a,true); a.state='roll'; a.rollT=rnd(7,12); a.tM=null; a.sus=0; a.near=false; }
/**
 * Schuppentier eingerollt (oder gerade aufgeschreckt): bleibt liegen, bis niemand mehr nahe ist.
 * @returns {boolean} true, solange es eingerollt ist
 */
function rollStep(a,dt){
  if(a.state==='flee') rollUp(a);   // statt zu fliehen: einrollen
  if(a.state!=='roll') return false;
  a.rollT-=dt;
  if(a.rollT<=0){
    let calm=true;
    for(const p of actors()){ if(p.dead) continue; if(Math.hypot(p.x-a.x,p.z-a.z)<(p.sneak?3.5:12)){ calm=false; break; } }
    if(calm){ setBall(a,false); a.state='wander'; a.timer=0; a.sus=0; a.tWait=rnd(1,3); }
    else a.rollT=rnd(1,2);
  }
  return true;
}

/** Zustand als Bits für das Online-Spiel: 32 eingerollt, 64 gräbt, 128 schläft */
function termiteBits(a){ return (a.rolled?32:0)|(a.tpose==='dig'?64:0)|(a.tpose==='sleep'?128:0); }
/** Gast: Haltung aus den Bits des Gastgebers */
function termiteGuest(a,bits,dt){
  setBall(a,!!(bits&32));
  setPose(a,bits&64?'dig':bits&128?'sleep':null);
  if(a.tpose==='dig') digAnim(a,dt);
}

export { setPose as termitePose, rollStep, rollUp, termiteBits, termiteGuest, termiteSense, termiteStep };
