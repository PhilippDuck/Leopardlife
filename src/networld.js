// LeoLife – Online-Spiel Teil 2: eine gemeinsame Tierwelt. Der Gastgeber berechnet Tiere, Wetter, Wind, Tageszeit und
// Ereignisse (seine Tier-KI sieht die Leoparden der Gäste als ghosts, siehe player.js/net.js) und schickt regelmäßig, was
// in der Nähe der Gäste lebt. Die Gäste rechnen davon nichts selbst (NET_GUEST in save.js), sondern zeigen die Tiere an:
// Sie legen sie anhand ihrer Nummer an, bewegen sie geglättet und nehmen sie wieder weg. Die eigene Familie (Partner,
// Junge) bleibt auf jedem Gerät für sich. Greift ein Tier des Gastgebers einen Gast an, geht der Treffer an dessen Gerät.
// Teil 3: Gäste jagen mit. Ihr Sprung trifft beim Gast, die Nachricht geht an den Gastgeber; er rechnet Schaden, Hinterhalt,
// Festbeißen und Tod (actions.js mit dem Ghost als Jäger) und schickt zurück, was der Gast sieht und bekommt. Kadaver liegen
// beim Gastgeber; Fressen, Ziehen, auf den Baum bringen und Brüllen eines Gastes gehen als Nachricht an ihn.
import { hitAnimal, hitFx, hurtPlayer, killAnimal, killRewards, gainXp, roarAt } from './actions.js';
import { breakFree, startBite } from './bite.js';
import { endCarcass, placeInTree } from './carcass.js';
import { tell } from './coop.js';
import { bloodDrop, meatOrbs, syncOrbs } from './effects.js';
import { dmg, pScale } from './save.js';
import { H } from './terrain.js';
import { trees } from './vegetation.js';
import { animals } from './animals.js';
import { SPECIES } from './data.js';
import { scene } from './engine.js';
import { buildHuman } from './human.js';
import { animLegs, buildBaboon, buildCroc, buildElephant, buildHippo, buildQuad, buildSnake, makeFur } from './models.js';
import { joinHooks, net, netSend, onNet } from './net.js';
import { dropModel, ghosts, players } from './player.js';
import { NET_GUEST, S } from './save.js';
import { envenom } from './snake.js';
import { G } from './state.js';
import { setWeather, W } from './weather.js';
import { EV, applyEvent } from './worldevents.js';

/** Tiere so oft je Sekunde senden; Tageszeit, Wetter, Wind und Ereignis alle ENV_MS */
const WD_MS=100, ENV_MS=1000;
/** Ruhende oder unsichtbare Tiere nur so oft auffrischen (spart den Großteil der Daten) */
const IDLE_MS=1000;
/** Tiere bis zu diesem Abstand von einem Gast werden geschickt (Meter, etwas mehr als die größte Sichtweite) */
const NET_R=170;
/** Gast: Tiere so weit in der Vergangenheit zeigen, dass immer zwei Stände zum Überblenden da sind */
const WD_INTERP=150;
/** Gast: ohne neuen Stand so lange weiter zeigen, danach ausblenden */
const WD_STALE=2500;
/** Laufphase wird modulo PH_WRAP gesendet (kleine Zahlen) */
const PH_WRAP=Math.PI*20;
/** Die Tiere des Startgebiets haben auf allen Geräten dieselbe Nummer (gleiche Art an gleicher Stelle der Liste) */
const START_N=animals.length;

const rd2=v=>Math.round(v*100)/100;
/** Nummer eines Tieres im Netz: Startgebiet wie uid, alle anderen (weite Welt, Ereignisse) fortlaufend ab 1 000 000 */
let nextNid=1e6;
const nidOf=a=>a.nid??(a.nid=(!a.world&&!a.temp&&a.uid<START_N)?a.uid:nextNid++);

/* ---------- Gastgeber ---------- */
let wdAt=0, envAt=0;
/** Tiere, die die Gäste schon kennen: Nummer → Tier */
const sentAnimals=new Map();
/** Neues Gerät im Raum: alles noch einmal vollständig schicken */
joinHooks.push(()=>{ sentAnimals.clear(); envAt=0; });
function nearGuest(a){ for(const gh of ghosts){ const dx=gh.x-a.x, dz=gh.z-a.z; if(dx*dx+dz*dz<NET_R*NET_R) return true; } return false; }
/** Zustand als Bits: 1 sichtbar, 2 tot, 4 jagt/greift an, 8 flieht, 16 blutet (Blutspur) */
function bitsOf(a){ return (a.g.visible?1:0)|(a.dead?2:0)|(a.state==='chase'||a.state==='lunge'?4:0)|(a.state==='flee'?8:0)|(a.wound&&a.wound.die?16:0); }
/** Ein Gast hält das Tier fest bzw. zieht den Kadaver – nur so lange, wie es den Gast noch gibt und er sich meldet */
const HOLD_MS=30000, DRAG_MS=5000;
function releaseStale(a,now){
  if(a.held&&a.held.ghost&&(ghosts.indexOf(a.held)<0||now-(a.heldAt||0)>HOLD_MS)) a.held=null;
  if(a.netDrag&&(ghosts.indexOf(a.netDrag)<0||now-(a.dragAt||0)>DRAG_MS)) a.netDrag=null;
}
/** Wen jagt das Tier? Gerät·8 + Spielernummer, wenn es einen Gast ist, sonst 0 */
function tgtOf(a){ const t=a.tgt; return t&&t.ghost&&(a.state==='chase'||a.state==='lunge')?t.peer*8+t.num:0; }
function hostSend(now){
  if(now<wdAt) return; wdAt=now+WD_MS;
  const add=[], st=[], seen=new Set();
  for(const a of animals){
    if((a.held&&a.held.ghost)||a.netDrag) releaseStale(a,now);   // auch wenn der Gast schon weg ist
    if(a.sp.friend||a.gone||!a.g||!nearGuest(a)) continue;
    const id=nidOf(a); seen.add(id);
    const fresh=!sentAnimals.has(id);
    if(fresh){ sentAnimals.set(id,a); add.push([id,a.sp.id,rd2(a.g.scale.x)]); }
    // Sichtbare Tiere: wo das Modell steht (Pavian im Baum, Krokodil abgetaucht); unsichtbare: nur die Lage (Modell ruht dann)
    const g=a.g, inr=g.userData.inner, vis=g.visible;
    const s=[id,rd2(vis?g.position.x:a.x),rd2(g.position.y),rd2(vis?g.position.z:a.z),rd2(g.rotation.y),rd2(g.rotation.x),rd2(g.rotation.z),
      rd2((a.ph||0)%PH_WRAP),bitsOf(a),tgtOf(a),inr?rd2(inr.position.z):0,
      a.carc?a.carc.meat:-1,a.carc&&a.carc.tree!=null?1:0];   // Kadaver: Bissen übrig (-1 = keiner), im Baum
    // Unverändert (ruht, frisst, lauert) oder unsichtbar: nur jede IDLE_MS
    const last=a.netLast, same=last&&last[1]===s[1]&&last[3]===s[3]&&last[4]===s[4]&&last[6]===s[6]&&last[8]===s[8]&&last[9]===s[9]&&last[11]===s[11]&&last[12]===s[12];
    if(!fresh&&(same||!vis)&&now-a.netAt<IDLE_MS) continue;
    a.netLast=s; a.netAt=now; st.push(s);
  }
  const del=[]; for(const id of sentAnimals.keys()) if(!seen.has(id)){ sentAnimals.delete(id); del.push(id); }
  /** @type {any} */ const m={t:'wd',a:st};
  if(add.length) m.n=add;
  if(del.length) m.x=del;
  if(now>=envAt){ envAt=now+ENV_MS;
    m.e=[Math.round(S.tod*1e5)/1e5,rd2(W.rain),rd2(W.target),W.storm?1:0,rd2(G.windAng||0),EV.on||'',rd2(EV.s||0),rd2(EV.dir.x),rd2(EV.dir.z)]; }
  netSend(m);
}
/** Ein Tier des Gastgebers trifft den Leoparden eines Gastes: Schaden geht an dessen Gerät (dort mit eigener Schwierigkeit) */
G.ghostHurt=(gh,d,a,force)=>{
  const sp=a&&a.sp, id=sp&&animals.indexOf(a)>=0?nidOf(a):-1;
  netSend({t:'hit',to:gh.peer,n:gh.num,d:rd2(d),f:force?1:0,a:id,sp:sp?sp.id:'',v:sp&&sp.snake?1:0});
};

/** Leopard eines Gastes zur Nachricht m (Absender und Spielernummer) */
const ghostOf=m=>ghosts.find(g=>g.peer===m.from&&g.num===m.pn)||null;
const hostHas=m=>!NET_GUEST&&net.role==='host'&&isNum(m.n);
/** Was ein Gast bei seinem Treffer sieht und hört (Schaden, Hinterhalt, Festbeißen) */
G.ghostHitFx=(gh,a,d,amb,leap,bite)=>netSend({t:'hr',to:gh.peer,pn:gh.num,n:nidOf(a),d,am:amb?1:0,lp:leap?1:0,b:bite?1:0,hp:Math.max(0,Math.round(a.hp))});
/** Ein Gast hat ein Tier erlegt: Erfahrung und Belohnung auf seinem Gerät */
G.ghostKill=(gh,a,xp,albino)=>netSend({t:'kl',to:gh.peer,pn:gh.num,n:nidOf(a),xp,al:albino?1:0});
G.ghostXp=(gh,xp,txt)=>netSend({t:'xp',to:gh.peer,pn:gh.num,xp,tx:txt});
/** Gast springt ein Tier an: d = sein Grundschaden, am/cl = Hinterhalt- und Kletterstufe, lp = Sprung vom Baum */
onNet('atk',m=>{
  if(!hostHas(m)||!isNum(m.d)) return;
  const a=sentAnimals.get(m.n), gh=ghostOf(m); if(!a||!gh||a.dead||a.held||gh.dead) return;
  if(Math.hypot(gh.x-a.x,gh.z-a.z)>a.rad+8) return;   // zu weit weg (alter Stand): nicht werten
  gh.atkD=Math.max(0,Math.min(400,m.d)); gh.L.b={amb:+m.am||0,climb:+m.cl||0}; gh.leap=!!m.lp;
  hitAnimal(a,/** @type {any} */(gh));
});
/** Gast: Festbeißen vorbei – erlegt (k) oder losgerissen mit Bisswert avg */
onNet('bend',m=>{
  if(!hostHas(m)) return;
  const a=sentAnimals.get(m.n), gh=ghostOf(m); if(!a||!gh||a.dead) return;
  a.held=null;
  if(m.k) killAnimal(a,/** @type {any} */(gh)); else breakFree(a,gh,Math.max(0,Math.min(1,+m.avg||0)));
});
onNet('roar',m=>{
  if(NET_GUEST||net.role!=='host'||![m.x,m.z,m.R,m.lvl,m.rl].every(isNum)) return;
  roarAt(m.x,m.z,Math.min(60,m.R),m.lvl,m.rl);
});
/** Kadaver: Bissen gefressen, gepackt, gezogen, losgelassen, in einen Baum gebracht */
onNet('eat',m=>{ if(!hostHas(m)) return; const a=sentAnimals.get(m.n); if(a&&a.carc&&a.carc.meat>0) a.carc.meat--; });
onNet('grab',m=>{ if(!hostHas(m)) return; const a=sentAnimals.get(m.n), gh=ghostOf(m); if(a&&a.carc&&gh&&a.carc.tree==null){ a.netDrag=gh; a.dragAt=performance.now(); } });
onNet('drg',m=>{
  if(!hostHas(m)||!isNum(m.x)||!isNum(m.z)) return;
  const a=sentAnimals.get(m.n), gh=ghostOf(m); if(!a||!a.carc||a.netDrag!==gh) return;
  a.dragAt=performance.now(); a.x=m.x; a.z=m.z;
  const gy=H(a.x,a.z); a.g.position.set(a.x,gy+a.sp.size*0.22,a.z); if(isNum(m.ry)) a.g.rotation.y=m.ry;
  const o=a.carc.orbs; o.position.x=a.x; o.position.z=a.z; o.userData.y0=gy+a.sp.size*1.4+0.6;
});
onNet('drop',m=>{ if(!hostHas(m)) return; const a=sentAnimals.get(m.n); if(a) a.netDrag=null; });
onNet('tree',m=>{
  if(!hostHas(m)||!isNum(m.tx)||!isNum(m.tz)) return;
  const a=sentAnimals.get(m.n); if(!a||!a.carc||a.carc.tree!=null) return;
  const i=treeAt(m.tx,m.tz,1.5); if(i>=0) placeInTree(a,i);
});
/** Baum an der Stelle x,z (Bäume tragen auf den Geräten verschiedene Nummern, die Lage ist gleich) */
function treeAt(x,z,r){ let bi=-1, bd=r*r; for(let i=0;i<trees.length;i++){ const t=trees[i]; if(!t) continue; const d=(t.x-x)**2+(t.z-z)**2; if(d<bd){ bd=d; bi=i; } } return bi; }

/* ---------- Gast ---------- */
/** Vom Gastgeber gezeigte Tiere: Nummer → Tier */
const mirror=new Map();
const fromHost=m=>NET_GUEST&&m.from===net.host;
function buildFor(sp,fur){ return sp.human?buildHuman():sp.croc?buildCroc(sp.m,fur):sp.snake?buildSnake(sp.m,fur):sp.baboon?buildBaboon(sp.m,fur)
  :sp.elephant?buildElephant(sp.m,fur):sp.hippo?buildHippo(sp.m,fur):buildQuad(sp.m,fur); }
/** Tier anlegen, das es auf diesem Gerät noch nicht gibt (weite Welt, Ereignisse) */
function makeMirror(id,spId,scale){
  const sp=SPECIES.find(s=>s.id===spId); if(!sp) return null;
  const fur=sp.human?null:makeFur(), g=buildFor(sp,fur);
  if(!sp.human) g.scale.setScalar(scale>0?scale:sp.size); g.visible=false; scene.add(g);
  const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:id,nid:id,world:true,net:true,juv:scale>0&&scale<sp.size*0.8,
    x:1e6,z:1e6,tx:0,tz:0,hp:sp.hp,state:'wander',dead:false,carc:null,ph:0,timer:0,cd:0,stun:0,sus:0,aggro:0,thirst:100};
  animals.push(a); return a;
}
/** Nicht (mehr) vom Gastgeber gezeigt: ausblenden und weit weg parken, damit nichts mehr darauf reagiert */
function parkAnimal(a){ if(a.carc) endCarcass(a); a.g.visible=false; a.x=a.z=1e6; a.nb=null; a.tgt=null; }
function dropMirror(id){
  const a=mirror.get(id); if(!a) return; mirror.delete(id);
  if(!a.net){ parkAnimal(a); return; }
  if(a.carc) endCarcass(a);
  dropModel(a.g); a.g.traverse(o=>{ if(o.isMesh&&o!==a.g.userData.blob) o.geometry?.dispose(); }); a.fur?.dispose?.();
  const i=animals.indexOf(a); if(i>=0) animals.splice(i,1);
}
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
onNet('wd',m=>{
  if(!fromHost(m)) return;
  const now=performance.now();
  if(Array.isArray(m.x)) for(const id of m.x) dropMirror(id);
  if(Array.isArray(m.n)) for(const d of m.n){
    if(!Array.isArray(d)||!isNum(d[0])||mirror.has(d[0])) continue;
    const id=d[0], own=id<START_N?animals[id]:null;
    const a=own&&own.uid===id&&!own.world&&!own.temp&&!own.sp.friend?own:makeMirror(id,String(d[1]),+d[2]);
    if(a){ a.nid=id; mirror.set(id,a); }   // Nummer auch bei eigenen Tieren des Startgebiets: Angriffe und Kadaver gehen damit an den Gastgeber
  }
  if(Array.isArray(m.a)) for(const s of m.a){
    if(!Array.isArray(s)||s.length<13||!s.every(isNum)) continue;
    const a=mirror.get(s[0]); if(!a) continue;
    const b=a.nb||(a.nb=[]); b.push({t:now,s}); if(b.length>8) b.shift(); a.nseen=now;
  }
  if(Array.isArray(m.e)&&m.e.length>=9){ const e=m.e;
    if(isNum(e[0])) S.tod=((e[0]%1)+1)%1;
    setWeather(+e[1]||0,+e[2]||0,!!e[3]);
    if(isNum(e[4])){ G.windTarget=e[4]; G.windT=1e9; }
    applyEvent(typeof e[5]==='string'?e[5]:'',+e[6]||0,+e[7]||1,+e[8]||0);
  }
});
onNet('hit',m=>{
  if(!fromHost(m)||!isNum(m.d)) return;
  const p=players.find(q=>(q.num||1)===m.n); if(!p) return;
  const a=mirror.get(m.a)||{sp:SPECIES.find(s=>s.id===m.sp)||{id:String(m.sp||'tier'),n:'Tier'}};
  hurtPlayer(m.d,a,!!m.f,p);
  if(m.v) envenom(p);
});
/** Eigener Spieler zur Nachricht des Gastgebers */
const ownOf=m=>players.find(q=>(q.num||1)===m.pn)||null;
onNet('hr',m=>{
  if(!fromHost(m)||!isNum(m.d)) return;
  const a=mirror.get(m.n), p=ownOf(m); if(!a||!p) return;
  if(isNum(m.hp)) a.hp=m.hp;
  hitFx(a,p,m.d,!!m.am,!!m.lp);
  if(m.b&&!p.dead&&!p.bite) startBite(p,a,m.d);
});
onNet('kl',m=>{
  if(!fromHost(m)||!isNum(m.xp)) return;
  const a=mirror.get(m.n), p=ownOf(m); if(!a||!p) return;
  killRewards(a,p,false,m.xp,!!m.al);
});
onNet('xp',m=>{
  if(!fromHost(m)||!isNum(m.xp)) return;
  const p=ownOf(m); if(!p) return;
  if(typeof m.tx==='string') tell(p,m.tx.slice(0,60)+' +'+m.xp+' EP','#9be07f');
  gainXp(m.xp,p);
});
const toHostMsg=o=>netSend(Object.assign({to:net.host},o));
if(NET_GUEST){
  G.netBiteEnd=(p,a,kill,avg)=>toHostMsg({t:'bend',n:a.nid,pn:p.num||1,k:kill?1:0,avg:rd2(avg)});
  G.netRoar=(p,R)=>toHostMsg({t:'roar',x:rd2(p.x),z:rd2(p.z),R,lvl:p.L.lvl,rl:p.L.b.roar});
  G.carcNet=(kind,c,i)=>{
    const p=players.find(o=>o.drag===c||o.eatC===c)||players[0];
    if(kind==='eat') c.carc.lockT=performance.now()+800;   // eigener Bissen zählt sofort; der Gastgeber bestätigt
    if(kind==='tree'){ const t=trees[i]; toHostMsg({t:'tree',n:c.nid,pn:p.num||1,tx:rd2(t.x),tz:rd2(t.z)}); c.carc.lockT=performance.now()+1500; return; }
    if(kind==='drop') c.dragSent=0;
    toHostMsg({t:kind,n:c.nid,pn:p.num||1});
  };
}
/** Gast: Sprung eines eigenen Spielers trifft ein Tier des Gastgebers → Angriff an ihn */
function guestPounce(a){
  for(const p of players){ if(p.pounce>0&&!p.hit&&!p.dead&&Math.hypot(p.x-a.x,p.z-a.z)<a.rad+0.5+pScale(p.L)*0.8){
    p.hit=true; p.pounce=Math.min(p.pounce,0.08);
    toHostMsg({t:'atk',n:a.nid,pn:p.num||1,d:rd2(dmg(p.L)),am:p.L.b.amb,cl:p.L.b.climb,lp:p.leap?1:0}); p.leap=false; return; } }
}
/** Gast: Kadaver nach dem Stand des Gastgebers (q[11] Bissen, q[12] im Baum) anlegen, auffrischen, entfernen */
function guestCarcass(a,q,now,mine){
  const meat=q[11];
  if(meat<0){ if(a.carc) endCarcass(a); return; }
  const tree=!!q[12];
  if(!a.carc){ a.carc={t:1e9,meat,tree:null,orbs:meatOrbs(meat,a.x,0,a.z)}; }
  const c=a.carc;
  if(!(c.lockT>now)||meat<c.meat) c.meat=meat;
  if(tree&&c.tree==null) c.tree=treeAt(a.x,a.z,4);
  if(!tree&&!(c.lockT>now)) c.tree=null;
  if(!mine){ const o=c.orbs; o.position.x=a.x; o.position.z=a.z;
    o.userData.y0=c.tree!=null&&c.tree>=0?a.g.position.y+0.05+a.sp.size*0.9+0.9:H(a.x,a.z)+a.sp.size*1.4+0.6; }
  syncOrbs(c.orbs,c.meat,c.t,now/1000);
}
let dragAt=0;
const mix=(a,b,u)=>a+(b-a)*u;
function mixAng(a,b,u){ let d=b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return a+d*u; }
/** Gast, jedes Bild: Tiere zwischen den letzten beiden Ständen des Gastgebers bewegen */
function guestAnimals(dt,now){
  const rt=now-WD_INTERP;
  for(const a of animals){
    if(a.sp.friend) continue;   // die eigene Familie rechnet jedes Gerät selbst
    const b=a.nb;
    if(!b||!b.length||now-a.nseen>WD_STALE){ if(a.x!==1e6||a.g.visible) parkAnimal(a); continue; }
    // Kadaver, den ein eigener Spieler zieht: Lage rechnet dieses Gerät (updateDrag) und meldet sie dem Gastgeber
    const mine=players.find(p=>p.drag===a);
    if(mine){ guestCarcass(a,b[b.length-1].s,now,true);
      if(now>=dragAt){ dragAt=now+WD_MS; toHostMsg({t:'drg',n:a.nid,pn:mine.num||1,x:rd2(a.x),z:rd2(a.z),ry:rd2(a.g.rotation.y)}); }
      continue; }
    let A=b[0], B=b[0];
    for(let i=b.length-1;i>=0;i--){ if(b[i].t<=rt){ A=b[i]; B=b[i+1]||b[i]; break; } }
    while(b.length>2&&b[1].t<=rt) b.shift();
    const u=B.t>A.t?Math.max(0,Math.min(1,(rt-A.t)/(B.t-A.t))):1, p=A.s, q=B.s, g=a.g;
    const ox=a.x, oz=a.z;
    a.x=mix(p[1],q[1],u); a.z=mix(p[3],q[3],u);
    g.position.set(a.x,mix(p[2],q[2],u),a.z);
    g.rotation.set(mix(p[5],q[5],u),mixAng(p[4],q[4],u),mix(p[6],q[6],u));
    let pa=p[7], pb=q[7]; if(pb<pa-PH_WRAP/2) pb+=PH_WRAP;
    a.ph=mix(pa,pb,u);
    const inr=g.userData.inner; if(inr) inr.position.z=mix(p[10],q[10],u);
    const bits=q[8];
    a.dead=!!(bits&2); a.state=bits&4?'chase':bits&8?'flee':'wander'; g.visible=!!(bits&1);
    const t=q[9]; a.tgt=t&&Math.floor(t/8)===net.id?players.find(o=>(o.num||1)===t%8)||null:null;
    if(!a.dead){ const v=ox===1e6||dt<=0?0:Math.hypot(a.x-ox,a.z-oz)/dt; animLegs(g,a.ph,v>0.3?Math.min(0.9,0.25+v*0.05):0.03);
      // verwundet: Blutspur wie beim Gastgeber
      if(bits&16&&ox!==1e6){ a.bleed=(a.bleed||0)+Math.hypot(a.x-ox,a.z-oz); if(a.bleed>1.1){ a.bleed=0; bloodDrop(a.x+(Math.random()-0.5)*0.6,a.z+(Math.random()-0.5)*0.6,1); } }
      if(g.visible) guestPounce(a); }
    guestCarcass(a,q,now,false);
  }
}

/** Jedes Bild (auch in der Pause, damit die Welt der Gäste nicht stehen bleibt) */
function updateNetWorld(dt,now){
  if(NET_GUEST){ guestAnimals(dt,now); return; }
  if(net.state==='online'&&net.role==='host'&&net.peers.size) hostSend(now);
  else if(sentAnimals.size) sentAnimals.clear();
}

export { START_N, mirror, updateNetWorld };
