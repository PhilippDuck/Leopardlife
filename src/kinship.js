// LeopardLife – Verwandtschaft und Familie im gemeinsamen Spiel: wer mit wem verwandt ist, Spieler als Paar, Wurf mit einem Jungen je Spieler.
// Regel: Verwandte paaren sich nie (Eltern/Kinder, Geschwister, Großeltern/Enkel, Tante/Onkel mit Nichte/Neffe). Cousins dürfen. Wer neu einsteigt, ist fremd.
import { snd } from './audio.js';
import { nameOf, tell } from './coop.js';
import { TRAITS } from './data.js';
import { puff } from './effects.js';
import { FOOD_MAX, cub, feedCub, mateWild, nearCub, nearestWild, offerText, playerSeeks } from './family.js';
import { fam, famPlace } from './kin.js';
import { makeFur } from './models.js';
import { P, players, rebuildPlayer } from './player.js';
import { S, fresh, inheritTrait, maxHp, maxSt, save } from './save.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { rnd } from './util.js';
import { carcassContext, nearCarcass, recordAncestor, takeMeat } from './carcass.js';
import { canSleepNow, sleepOnTree } from './daynight.js';
import { applyLearned, canSwitch, canSwitchFor, cubFollowContext, denFull, dropFollower, followerOf, heirLevel, kidInfo, kidOf, kidsOf, markTaken, numOf } from './cubfollow.js';

/** Neue Kennung für einen Leoparden */
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
/** Sorgt dafür, dass ein Leopard eine Kennung und eine Elternliste hat (ältere Spielstände). */
function ensureKin(L){ if(!L.id) L.id=newId(); if(!Array.isArray(L.parents)) L.parents=[]; return L; }

/**
 * Sind die Leoparden A und B zu nah verwandt für eine Paarung? Siehe Regel oben; Cousins zählen nicht.
 * @param {{id?:string, parents?:string[]}} A
 * @param {{id?:string, parents?:string[]}} B
 */
function related(A,B){
  if(!A||!B||!A.id||!B.id) return false;
  if(A.id===B.id) return true;
  const ok=x=>x&&x!=='wild', pa=(A.parents||[]).filter(ok), pb=(B.parents||[]).filter(ok), has=(l,x)=>l.indexOf(x)>=0, meet=(l,m)=>l.some(x=>has(m,x));
  if(has(pa,B.id)||has(pb,A.id)||meet(pa,pb)) return true;            // Eltern und Kind, Geschwister
  const ga=pa.flatMap(parentsOf).filter(ok), gb=pb.flatMap(parentsOf).filter(ok);
  if(has(ga,B.id)||has(gb,A.id)) return true;                          // Großeltern und Enkel
  return meet(pa,gb)||meet(pb,ga);                                     // Tante/Onkel und Nichte/Neffe; Cousins dürfen
}
/** Eltern eines Leoparden der Familie über seine Kennung (lebende Spieler und Ahnenbuch) */
function parentsOf(id){
  if(S.id===id) return S.parents||[];
  for(const k in (S.mates||{})) if(S.mates[k].id===id) return S.mates[k].parents||[];
  const e=(S.anc||[]).find(x=>x.i===id); return e&&e.p?e.p:[];
}
/** Erbe aus einer Paarung zweier Spieler: am liebsten eine Anlage, die beide haben (wird verstärkt), sonst eine des anderen */
function playerOffer(p,q){ const a=p.L.traits||[], b=q.L.traits||[], both=a.filter(t=>b.indexOf(t)>=0), pool=both.length?both:b.length?b:a;
  if(pool.length) return pool[Math.floor(Math.random()*pool.length)]; const ks=Object.keys(TRAITS); return ks[Math.floor(Math.random()*ks.length)]; }
/** Können sich die Spieler p und q paaren? Beide ausgewachsen, nicht verwandt, kein Junges und keine Trächtigkeit in der Familie. */
function canPair(p,q){
  return p!==q&&!p.dead&&!q.dead&&p.L.lvl>=8&&q.L.lvl>=8&&!kidOf(p)&&!kidOf(q)&&!(S.preg>0)&&!related(p.L,q.L);
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
  S.preg=25; S.litterParents=[ensureKin(p.L).id,ensureKin(q.L).id]; S.partnerPlayer=true; S.litterTrait=playerOffer(p,q); save(); snd.purr();
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
  const c=S.cub; if(!c||!(c.n>0)||p===P||!canSwitchFor(p)) return false;
  const L=p.L, old=ensureKin(L);
  // Erbanlagen vom Elternteil, der dieser Spieler war (sonst von Spieler 1), plus die des Wurfs – doppelte werden verstärkt.
  // Eigenschafts- und Fähigkeitspunkte werden nicht vererbt (dafür gibt es Erbe und Ahnenkraft).
  const ki=kidInfo(p), par=(ki.parents||[]).indexOf(L.id)>=0?L:S, kid={traits:(par.traits||[]).slice(),tlv:Object.assign({},par.tlv||{})}; inheritTrait(kid,ki.trait);
  const nl={id:newId(),parents:(ki.parents||[]).slice(),lvl:heirLevel(p),xp:0,pts:0,a:fresh().a,b:fresh().b,traits:kid.traits,tlv:kid.tlv,fur:ki.fur?Object.assign({},ki.fur):makeFur(),hunger:80,age:0,kills:0,gen:ki.gen||((S.gen||1)+1)};
  const got=applyLearned(p,nl), fo=followerOf(p), fx=fo?fo.x:cub.x, fz=fo?fo.z:cub.z; if(fo) dropFollower(fo); if(c.learn) delete c.learn[p.num];
  recordAncestor('zog sein Junges groß und lebt als Elterntier weiter',L,nameOf(p));
  S.mates[p.num]=nl; p.L=nl; p.fur=nl.fur; rebuildPlayer(p);
  // Der alte Leopard bleibt als Elterntier am Bau (Platz 2), falls frei
  if(!S.p2){ S.p2=true; famPlace(fam[2],p.x,p.z,old.fur||{albino:false,melan:false,l:1,s:1,sn:1,ss:1}); }
  p.x=fx+rnd(-1,1); p.z=fz+rnd(-1,1); p.tree=null; p.safe=false; p.pounce=0; p.hp=maxHp(nl); p.st=maxSt(nl);
  takeFromLitter(p);
  if((nl.gen||1)>(S.gen||1)) S.gen=nl.gen;
  save(); snd.mew();
  toast(nameOf(p)+' spielt jetzt als Junges (Generation '+nl.gen+'). '+(got.length?'Gelernt: '+got.join(', ')+'. ':'')+(old.lvl>=8?'Sein alter Leopard bleibt als Elterntier am Bau.':''),'#ff9ad0');
  return true;
}
/** Ein Junges wurde von einem Spieler übernommen: Wurf verkleinern, ohne weitere Junge endet die Aufzucht. */
function takeFromLitter(p){ const c=S.cub; if(!c) return; markTaken(p); delete kidsOf(c)[numOf(p)]; c.n=(c.n||1)-1; c.taken=true; if(c.n<=0){ S.cub=null; S.food=0; } }
/** Übrig gebliebene Junge eines Wurfs, aus dem schon ein Spieler stammt, wandern ab, wenn sie groß sind. */
function litterLeaves(){ toast('Dein übriges Geschwister ist groß geworden und wandert ab, um ein eigenes Revier zu suchen.','#ff9ad0'); S.cub=null; S.food=0; save(); }

/** Was die Aktionstaste von Mitspieler p gerade tun würde (für den Hinweis unter dem Fadenkreuz), sonst null. */
function mateContextInfo(p){
  if(p.dead||G.paused) return null;
  { const cx=carcassContext(p); if(cx) return {label:cx.label}; }
  if(p.tree!=null) return (p.safe&&p.climbT>=1&&canSleepNow())?{label:p.wantSleep?'Wartet auf die anderen …':'Schlafen'}:null;
  const q=pairCandidate(p); if(q&&canPair(p,q)) return {label:'Paaren mit '+nameOf(q)};   // Erbe zeigt das Geburtsfenster
  { const cf=cubFollowContext(p); if(cf) return {label:cf.label}; }
  if(playerSeeks(p)){ const m=nearestWild(p); if(m&&m.d<4.5) return {label:'Paaren · Erbe: '+offerText(m.a.trait,p.L)}; }
  if(S.cub&&S.cub.grow<1&&S.food>0&&denFull()<97&&nearCub(p)) return {label:'Füttern'};
  return null;
}
/** Aktionstaste eines Mitspielers (X antippen): paaren, Junges füttern. */
function mateContext(p){
  if(p.dead||G.paused) return;
  { const cx=carcassContext(p); if(cx){ cx.fn(); return; } }
  if(p.tree!=null){ if(p.safe&&p.climbT>=1&&canSleepNow()&&!p.wantSleep) sleepOnTree(p); return; }
  const q=pairCandidate(p); if(q&&canPair(p,q)){ pairPlayers(p,q); return; }
  if(q&&related(p.L,q.L)&&p.L.lvl>=8&&!S.cub&&!(S.preg>0)){ tell(p,'Ihr seid verwandt – Verwandte paaren sich nicht.','#ff9ad0'); return; }
  { const cf=cubFollowContext(p); if(cf){ cf.fn(); return; } }
  if(playerSeeks(p)){ const m=nearestWild(p); if(m&&m.d<4.5){ mateWild(p,m.a); return; } }
  if(S.cub&&S.cub.grow<1&&S.food>0&&denFull()<97&&nearCub(p)){ feedCub(); return; }
}

ensureKin(S);

export { mateContextInfo, newId, ensureKin, related, canPair, pairCandidate, pairPlayers, litterSize, mateBecomeCub, takeFromLitter, litterLeaves, mateContext };
