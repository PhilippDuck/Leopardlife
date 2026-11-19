// LeopardLife – Verwandtschaft und Familie im gemeinsamen Spiel: wer mit wem verwandt ist, Spieler als Paar, Wurf mit einem Jungen je Spieler.
// Regel: Verwandte paaren sich nie (Geschwister, Eltern und Kinder). Wer neu einsteigt, ist fremd; erst die Jungen sind verwandt.
import { snd } from './audio.js';
import { nameOf, tell } from './coop.js';
import { TRAITS } from './data.js';
import { puff } from './effects.js';
import { cub, feedCub, heirLevel } from './family.js';
import { fam, famPlace } from './kin.js';
import { makeFur } from './models.js';
import { P, players, rebuildPlayer } from './player.js';
import { S, fresh, maxHp, maxSt, save } from './save.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { rnd } from './util.js';
import { recordAncestor } from './carcass.js';

/** Neue Kennung für einen Leoparden */
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
/** Sorgt dafür, dass ein Leopard eine Kennung und eine Elternliste hat (ältere Spielstände). */
function ensureKin(L){ if(!L.id) L.id=newId(); if(!Array.isArray(L.parents)) L.parents=[]; return L; }

/**
 * Sind die Leoparden A und B verwandt? Dieselben, Eltern und Kind oder Geschwister (mindestens ein gemeinsames Elternteil).
 * @param {{id?:string, parents?:string[]}} A
 * @param {{id?:string, parents?:string[]}} B
 */
function related(A,B){
  if(!A||!B||!A.id||!B.id) return false;
  if(A.id===B.id) return true;
  const pa=A.parents||[], pb=B.parents||[];
  if(pa.indexOf(B.id)>=0||pb.indexOf(A.id)>=0) return true;
  return pa.some(x=>pb.indexOf(x)>=0);
}
/** Können sich die Spieler p und q paaren? Beide ausgewachsen, nicht verwandt, kein Junges und keine Trächtigkeit in der Familie. */
function canPair(p,q){
  return p!==q&&!p.dead&&!q.dead&&p.L.lvl>=8&&q.L.lvl>=8&&!S.cub&&!(S.preg>0)&&!related(p.L,q.L);
}
/** Nächster Mitspieler, mit dem sich p paaren könnte (höchstens 4,5 m entfernt). Meldet Verwandte einmal, statt still nichts zu tun. */
function pairCandidate(p){
  let best=null, bd=4.5;
  for(const q of players){ if(q===p||q.dead) continue; const d=Math.hypot(q.x-p.x,q.z-p.z); if(d<bd&&q.L.lvl>=8&&p.L.lvl>=8){ bd=d; best=q; } }
  return best;
}
/** Spieler p und q paaren sich: Der Wurf gehört der ganzen Familie und kommt im Bau zur Welt. */
function pairPlayers(p,q){
  if(!canPair(p,q)){ if(related(p.L,q.L)) tell(p,'Ihr seid verwandt – Verwandte paaren sich nicht. Sucht euch Partner außerhalb der Familie.','#ff9ad0'); return; }
  S.preg=25; S.litterParents=[ensureKin(p.L).id,ensureKin(q.L).id]; S.partnerPlayer=true; save(); snd.purr();
  for(const o of [p,q]) puff(o.x,o.y+1.2,o.z,0xff7ab8,8,0.45);
  toast(nameOf(p)+' und '+nameOf(q)+' haben sich gepaart. Im Bau kommt bald euer Wurf zur Welt – ein Junges für jeden, der will.','#ff9ad0');
}
/** Größe eines neuen Wurfs: im gemeinsamen Spiel mindestens ein Junges je Spieler (höchstens 4), sonst eins. */
const litterSize=()=>Math.min(4,Math.max(1,players.length));

/**
 * Mitspieler p spielt als ein Junges des aktuellen Wurfs weiter. Erbt wie im Einzelspiel nur Erbanlagen und 10 % der Punkte.
 * Sein bisheriger Leopard bleibt als Elterntier am Bau, wenn dort Platz ist.
 */
function mateBecomeCub(p){
  const c=S.cub; if(!c||!(c.n>0)||p===P) return false;
  const L=p.L, old=ensureKin(L);
  const sum=o=>Object.keys(o).reduce((x,k)=>x+o[k],0), total=sum(L.a)+2*sum(L.b)+L.pts;
  const traits=(S.traits||[]).slice(); if(c.trait&&TRAITS[c.trait]&&traits.indexOf(c.trait)<0) traits.push(c.trait);
  const nl={id:newId(),parents:(c.parents||[]).slice(),lvl:heirLevel(),xp:0,pts:Math.round(total*0.1),a:fresh().a,b:fresh().b,traits:traits.slice(-3),fur:makeFur(),hunger:80,age:0,kills:0,gen:c.gen||((S.gen||1)+1)};
  recordAncestor('zog sein Junges groß und lebt als Elterntier weiter',L,nameOf(p));
  S.mates[p.num]=nl; p.L=nl; p.fur=nl.fur; rebuildPlayer(p);
  // Der alte Leopard bleibt als Elterntier am Bau (Platz 2), falls frei
  if(!S.p2){ S.p2=true; famPlace(fam[2],p.x,p.z); }
  p.x=cub.x+rnd(-1,1); p.z=cub.z+rnd(-1,1); p.tree=null; p.safe=false; p.pounce=0; p.hp=maxHp(nl); p.st=maxSt(nl);
  takeFromLitter();
  if((nl.gen||1)>(S.gen||1)) S.gen=nl.gen;
  save(); snd.mew();
  toast(nameOf(p)+' spielt jetzt als Junges (Generation '+nl.gen+'). '+(old.lvl>=8?'Sein alter Leopard bleibt als Elterntier am Bau.':''),'#ff9ad0');
  return true;
}
/** Ein Junges wurde von einem Spieler übernommen: Wurf verkleinern, ohne weitere Junge endet die Aufzucht. */
function takeFromLitter(){ const c=S.cub; if(!c) return; c.n=(c.n||1)-1; c.taken=true; if(c.n<=0){ S.cub=null; S.food=0; } }
/** Übrig gebliebene Junge eines Wurfs, aus dem schon ein Spieler stammt, wandern ab, wenn sie groß sind. */
function litterLeaves(){ toast('Dein übriges Geschwister ist groß geworden und wandert ab, um ein eigenes Revier zu suchen.','#ff9ad0'); S.cub=null; S.food=0; save(); }

/** Was die Aktionstaste von Mitspieler p gerade tun würde (für den Hinweis unter dem Fadenkreuz), sonst null. */
function mateContextInfo(p){
  if(p.dead||G.paused) return null;
  const q=pairCandidate(p); if(q&&canPair(p,q)) return {label:'Paaren mit '+nameOf(q)};
  if(S.cub&&S.cub.grow<1&&S.food>0&&S.cub.full<97&&Math.hypot(cub.x-p.x,cub.z-p.z)<4.5) return {label:'Füttern'};
  return null;
}
/** Aktionstaste eines Mitspielers (X antippen): paaren, Junges füttern. */
function mateContext(p){
  if(p.dead||G.paused) return;
  const q=pairCandidate(p); if(q&&canPair(p,q)){ pairPlayers(p,q); return; }
  if(q&&related(p.L,q.L)&&p.L.lvl>=8&&!S.cub&&!(S.preg>0)){ tell(p,'Ihr seid verwandt – Verwandte paaren sich nicht.','#ff9ad0'); return; }
  if(S.cub&&S.cub.grow<1&&S.food>0&&S.cub.full<97&&Math.hypot(cub.x-p.x,cub.z-p.z)<4.5){ feedCub(); return; }
}

ensureKin(S);

export { mateContextInfo, newId, ensureKin, related, canPair, pairCandidate, pairPlayers, litterSize, mateBecomeCub, takeFromLitter, litterLeaves, mateContext };
