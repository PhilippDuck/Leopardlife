// LeoLife – Tiere untereinander: Beutetiere fürchten Raubtiere und fliehen vor ihnen, hungrige Raubtiere jagen Beute
// (Schakale und Hyänen im Rudel), stärkere Raubtiere verjagen schwächere – auch von ihrer Beute.
// Rangordnung: Schakal < Hyäne < fremder Leopard < Löwe; vor Elefanten weichen alle Raubtiere.
// Läuft nur für Tiere in Sichtweite der Spieler (die KI rechnet entfernte Tiere nicht), alle ~0,5 s je Tier.
import { animals } from './animals.js';
import { makeCarcass, startFlee } from './carcass.js';
import { growlAt } from './calls.js';
import { FOOD } from './data.js';
import { rnd } from './util.js';

/** Rang der Raubtiere (und Elefant): wer höher steht, verjagt die anderen */
const FOE_RANK={jack:1,hyena:2,rival:2.5,lion:3,ele:5};
/** Rudeljäger rufen Artgenossen in der Nähe zur selben Beute */
const HUNT_PACK={jack:1,hyena:1};
/** Wie groß die Beute eines Raubtiers höchstens sein darf (Körpergröße im Verhältnis) */
const PREY_SIZE=1.3;
const foeRank=a=>FOE_RANK[a.sp.id]||0;
/** Nimmt an diesem Miteinander teil (keine Ereignistiere, Spielerfamilie, Menschen, Wassertiere, Schlangen, Paviane) */
const takesPart=o=>!o.dead&&!o.hidden&&!o.held&&!o.ev&&!o.sp.friend&&!o.sp.human&&!o.sp.croc&&!o.sp.hippo&&!o.sp.snake&&!o.bab&&o.g.visible;
/** Beutetier: kein Raubtier, kein Elefant, kein Riese */
const isPrey=o=>!o.sp.pred&&!o.sp.elephant&&!o.sp.boss&&!o.sp.baboon;
/** Raubtier, das bei diesem Miteinander jagt und verjagt (Krokodile haben ihr eigenes Verhalten) */
const isHunter=o=>o.sp.pred&&!o.sp.croc;

/** Tier a flieht vor src (einem anderen Tier); die Herde flieht mit */
function fleeFromAnimal(a,src){
  startFlee(a); a.fleeFrom=src; a.sus=0;
  if(a.herd) for(const m of a.herd) if(m!==a&&!m.dead&&m.state==='flee'&&!m.fleeFrom) m.fleeFrom=src;
  if(a.kids) for(const k of a.kids) if(!k.dead){ startFlee(k); k.fleeFrom=src; }
}
/** Raubtier a beginnt die Jagd auf prey (Rudel: Artgenossen in der Nähe jagen mit) */
function startHunt(a,prey){
  a.state='hunt'; a.prey=prey; a.huntT=0; a.carc=null;
  if(HUNT_PACK[a.sp.id]) for(const o of animals) if(o!==a&&o.sp===a.sp&&takesPart(o)&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<35){ o.state='hunt'; o.prey=prey; o.huntT=0; }
}

/**
 * Alle ~0,5 s für Tier a (im Zustand wander oder scav): fliehen, verjagen, jagen. true = Zustand geändert.
 * Hunger: a.hungerT zählt herunter; erst dann sucht ein Raubtier Beute (nach einer Mahlzeit lange satt).
 */
function socialScan(a,dt){
  a.socT=(a.socT??Math.random()*0.5)-dt; if(a.hungerT==null) a.hungerT=rnd(20,90);
  if(isHunter(a)&&a.state==='wander') a.hungerT-=dt;
  if(a.socT>0||!takesPart(a)) return false;
  a.socT=rnd(0.4,0.6);
  const me=foeRank(a), prey=isPrey(a), eating=a.state==='scav';
  let foe=null, fd=1e9, food=null, bd=1e9;
  for(const o of animals){
    if(o===a||!takesPart(o)) continue;
    const dx=o.x-a.x, dz=o.z-a.z; if(Math.abs(dx)>40||Math.abs(dz)>40) continue;
    const d=Math.hypot(dx,dz), r=foeRank(o);
    if(prey&&isHunter(o)){   // Beutetier: sieht es ein Raubtier, das nicht gerade frisst, flieht es (vor dem Jäger, der es verfolgt, früher)
      const fear=Math.min(28,a.sp.sense*0.9)*(o.state==='hunt'&&o.prey===a?1.6:o.state==='scav'?0.45:1);
      if(d<fear&&d<fd){ fd=d; foe=o; } }
    else if(!prey&&r>me&&me>0){   // Raubtier: vor stärkeren weichen (Elefanten nur von nah)
      const fear=o.sp.elephant?12:o.state==='hunt'||o.state==='chase'?24:16;
      if(d<fear&&d<fd){ fd=d; foe=o; } }
    if(isHunter(a)&&!eating&&a.hungerT<=0&&isPrey(o)&&o.sp.size<=a.sp.size*PREY_SIZE&&d<30&&d<bd){ bd=d; food=o; }
  }
  if(foe){
    if(eating){ a.state='wander'; a.carc=null; a.timer=0; }   // vom Kadaver verjagt
    if(!prey&&!foe.sp.elephant&&Math.random()<0.5) growlAt(foe);
    fleeFromAnimal(a,foe); return true; }
  if(food){ startHunt(a,food); return true; }
  return false;
}

/** Ein Bild Jagd: Raubtier a verfolgt a.prey; eingeholt wird sie erlegt und gefressen. move: moveAnimal der KI */
function huntStep(a,dt,move){
  const o=a.prey; a.huntT+=dt;
  const gone=!o||o.dead||o.hidden||o.held||o.ev||!o.g.visible;
  const dx=gone?0:o.x-a.x, dz=gone?0:o.z-a.z, d=Math.hypot(dx,dz);
  if(gone||a.huntT>(HUNT_PACK[a.sp.id]?18:12)||d>45){   // entkommen, zu weit, zu lange: aufgeben, bald wieder hungrig
    a.state='wander'; a.timer=0; a.prey=null; a.hungerT=rnd(25,60); return; }
  if(o.state!=='flee') fleeFromAnimal(o,a);
  // Löwen und Leoparden pirschen erst heran und spurten dann, Hunde und Hyänen hetzen ausdauernd
  const spd=a.sp.spd*(d>14&&!HUNT_PACK[a.sp.id]?0.7:1)*(a.huntT>8?0.85:1);
  move(a,dx,dz,spd,dt);
  if(d<a.rad+o.rad+0.5){
    o.dead=true; o.state='wander'; o.wound=null; o.fleeFrom=null; o.respawn=rnd(60,120); makeCarcass(o,FOOD[o.sp.id]||1);
    for(const m of animals) if(m.state==='hunt'&&m.prey===o){ m.state='scav'; m.carc=o; m.eatT=0; m.prey=null; m.hungerT=rnd(120,240); }   // das Rudel frisst gemeinsam
    if(Math.random()<0.6) growlAt(a);
  }
}

export { huntStep, socialScan };
