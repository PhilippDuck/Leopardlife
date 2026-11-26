// LeoLife – Online-Spiel Teil 2: eine gemeinsame Tierwelt. Der Gastgeber berechnet Tiere, Wetter, Wind, Tageszeit und
// Ereignisse (seine Tier-KI sieht die Leoparden der Gäste als ghosts, siehe player.js/net.js) und schickt regelmäßig, was
// in der Nähe der Gäste lebt. Die Gäste rechnen davon nichts selbst (NET_GUEST in save.js), sondern zeigen die Tiere an:
// Sie legen sie anhand ihrer Nummer an, bewegen sie geglättet und nehmen sie wieder weg. Die eigene Familie (Partner,
// Junge) bleibt auf jedem Gerät für sich. Greift ein Tier des Gastgebers einen Gast an, geht der Treffer an dessen Gerät.
import { hurtPlayer } from './actions.js';
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
/** Zustand als Bits: 1 sichtbar, 2 tot, 4 jagt/greift an, 8 flieht */
function bitsOf(a){ return (a.g.visible?1:0)|(a.dead?2:0)|(a.state==='chase'||a.state==='lunge'?4:0)|(a.state==='flee'?8:0); }
/** Wen jagt das Tier? Gerät·8 + Spielernummer, wenn es einen Gast ist, sonst 0 */
function tgtOf(a){ const t=a.tgt; return t&&t.ghost&&(a.state==='chase'||a.state==='lunge')?t.peer*8+t.num:0; }
function hostSend(now){
  if(now<wdAt) return; wdAt=now+WD_MS;
  const add=[], st=[], seen=new Set();
  for(const a of animals){
    if(a.sp.friend||a.gone||!a.g||!nearGuest(a)) continue;
    const id=nidOf(a); seen.add(id);
    const fresh=!sentAnimals.has(id);
    if(fresh){ sentAnimals.set(id,a); add.push([id,a.sp.id,rd2(a.g.scale.x)]); }
    // Sichtbare Tiere: wo das Modell steht (Pavian im Baum, Krokodil abgetaucht); unsichtbare: nur die Lage (Modell ruht dann)
    const g=a.g, inr=g.userData.inner, vis=g.visible;
    const s=[id,rd2(vis?g.position.x:a.x),rd2(g.position.y),rd2(vis?g.position.z:a.z),rd2(g.rotation.y),rd2(g.rotation.x),rd2(g.rotation.z),
      rd2((a.ph||0)%PH_WRAP),bitsOf(a),tgtOf(a),inr?rd2(inr.position.z):0];
    // Unverändert (ruht, frisst, lauert) oder unsichtbar: nur jede IDLE_MS
    const last=a.netLast, same=last&&last[1]===s[1]&&last[3]===s[3]&&last[4]===s[4]&&last[6]===s[6]&&last[8]===s[8]&&last[9]===s[9];
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
function parkAnimal(a){ a.g.visible=false; a.x=a.z=1e6; a.nb=null; a.tgt=null; }
function dropMirror(id){
  const a=mirror.get(id); if(!a) return; mirror.delete(id);
  if(!a.net){ parkAnimal(a); return; }
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
    if(a) mirror.set(id,a);
  }
  if(Array.isArray(m.a)) for(const s of m.a){
    if(!Array.isArray(s)||s.length<11||!s.every(isNum)) continue;
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
const mix=(a,b,u)=>a+(b-a)*u;
function mixAng(a,b,u){ let d=b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return a+d*u; }
/** Gast, jedes Bild: Tiere zwischen den letzten beiden Ständen des Gastgebers bewegen */
function guestAnimals(dt,now){
  const rt=now-WD_INTERP;
  for(const a of animals){
    if(a.sp.friend) continue;   // die eigene Familie rechnet jedes Gerät selbst
    const b=a.nb;
    if(!b||!b.length||now-a.nseen>WD_STALE){ if(a.x!==1e6||a.g.visible) parkAnimal(a); continue; }
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
    if(!a.dead){ const v=ox===1e6||dt<=0?0:Math.hypot(a.x-ox,a.z-oz)/dt; animLegs(g,a.ph,v>0.3?Math.min(0.9,0.25+v*0.05):0.03); }
  }
}

/** Jedes Bild (auch in der Pause, damit die Welt der Gäste nicht stehen bleibt) */
function updateNetWorld(dt,now){
  if(NET_GUEST){ guestAnimals(dt,now); return; }
  if(net.state==='online'&&net.role==='host'&&net.peers.size) hostSend(now);
  else if(sentAnimals.size) sentAnimals.clear();
}

export { START_N, mirror, updateNetWorld };
