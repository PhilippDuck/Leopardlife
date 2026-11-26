// LeoLife – Online-Spiel: Zusammenspiel über Geräte wie im Splitscreen. Die Leoparden der anderen Geräte stehen als
// Einträge in netMates (coop.js): Markieren (Q / Steuerkreuz links ruft auch die anderen), am Boden liegen und von einem
// Mitspieler eines anderen Geräts wiederbelebt werden (X/F halten, net.js schickt das mit) und gemeinsam schlafen
// (der Gastgeber lässt die Nacht vergehen, die Gäste schlafen mit). Brüllen hören alle (networld.js).
// Dazu Paaren (jeder bekommt auf seinem Gerät einen Wurf) und gemeinsames Festbeißen (die Hilfe zählt beim Beißenden).
import { snd } from './audio.js';
import { helpBite } from './bite.js';
import { netMates, tell } from './coop.js';
import { kidOf } from './cubfollow.js';
import { canPair, ensureKin, pairRemote } from './kinship.js';
import { doSleep } from './daynight.js';
import { net, netSend, onNet, ownName, remotes } from './net.js';
import { players } from './player.js';
import { NET_GUEST, S } from './save.js';
import { G } from './state.js';
import { toast } from './ui.js';

/** Einträge je Leopard eines anderen Geräts (Schlüssel wie remotes: Gerät:Spielernummer) */
const mates=new Map();
let mateList=[];
const online=()=>net.state==='online'&&net.peers.size>0;
netMates.list=()=>mateList;
netMates.myName=()=>net.state==='online'?ownName():null;
netMates.onPing=p=>netSend({t:'ping',pn:p.num||1});
G.netSleep=()=>{ if(!NET_GUEST&&net.role==='host') netSend({t:'sleep'}); };
/** Was die anderen fürs Paaren wissen müssen (geht mit dem Profil, net.js) */
const mateInfo=p=>{ const L=ensureKin(p.L); return {id:L.id,par:(L.parents||[]).slice(0,2),tr:(L.traits||[]).slice(0,8),gen:L.gen||1,busy:kidOf(p)||S.preg>0?1:0}; };
G.profileExtra=mateInfo;
netMates.onAssist=(p,q)=>netSend({t:'assist',to:q.peer,tn:q.num,pn:p.num||1});
netMates.onPair=(p,q)=>{ netSend({t:'pair',to:q.peer,tn:q.num,pn:p.num||1,m:mateInfo(p),fur:p.saveFur?(S.fur||null):p.fur||null}); tell(p,'Du gehst auf '+q.name+' zu …','#ff9ad0'); };

/** Jedes Bild (auch in der Pause): Einträge aus dem neuesten Stand der anderen Geräte; Meldungen bei Wechseln */
function updateNetCoop(dt){
  if(!online()){ if(mateList.length){ mates.clear(); mateList=[]; } return; }
  const now=performance.now(), out=[];
  for(const [k,r] of remotes){
    const b=r.buf; if(!b.length) continue; const s=b[b.length-1].s; if(s.length<20) continue;
    let q=mates.get(k); if(!q){ q={remote:true,key:k,peer:r.peer,num:r.num,L:{lvl:1},pingT:0,wasDown:false,wasSleep:false,helpAt:0}; mates.set(k,q); }
    const bits=s[16];
    q.name=(net.peers.get(r.peer)?.name||'Leopard')+(r.num>1?' ('+r.num+')':'');
    q.x=s[17]; q.z=s[18]; q.y=r.g?r.g.position.y:s[19]; q.L.lvl=s[13];
    q.dead=!!(bits&8); q.downT=bits&32?1:null; q.helping=!!(bits&64); q.wantSleep=!!(bits&128); q.biting=!!(bits&256); q.revT=s[20]||0;
    const kin=r.kin; if(kin&&typeof kin.id==='string'){ q.L.id=kin.id; q.L.parents=Array.isArray(kin.par)?kin.par.filter(x=>typeof x==='string'):[]; q.L.traits=Array.isArray(kin.tr)?kin.tr.filter(x=>typeof x==='string'):[]; q.L.gen=+kin.gen||1; q.busy=!!kin.busy; }
    q.fur=r.fur||null;
    if(q.pingT>0) q.pingT-=dt;
    if(players.some(p=>p.helping&&p.reviveNear===q)) q.helpAt=now;
    if(q.downT!=null&&!q.wasDown) toast(q.name+' ist am Boden! Hin und X (bzw. F) halten zum Wiederbeleben.','#ff8a70');
    if(q.wasDown&&q.downT==null&&!q.dead&&now-q.helpAt<3000) toast('Du hast '+q.name+' wiederbelebt.','#9be07f');
    if(q.wantSleep&&!q.wasSleep&&!players.every(p=>p.dead||p.wantSleep)) toast(q.name+' will schlafen: klettere auf einen Baum und wähle Schlafen.','#9fb4ff');
    q.wasDown=q.downT!=null; q.wasSleep=q.wantSleep;
    out.push(q);
  }
  for(const k of [...mates.keys()]) if(!remotes.has(k)) mates.delete(k);
  mateList=out;
}
/** Ein anderes Gerät ruft (markiert): sein Leopard ist für einige Sekunden markiert */
onNet('ping',m=>{ const q=mates.get(m.from+':'+m.pn); if(!q) return; q.pingT=6; snd.click(); toast(q.name+' ruft dich – folge der Markierung.','#ffd27a'); });
/** Ein Mitspieler eines anderen Geräts greift das Tier an, an dem sich ein eigener Spieler festgebissen hat */
onNet('assist',m=>{ const p=players.find(o=>(o.num||1)===m.tn); if(p&&p.bite&&mates.has(m.from+':'+m.pn)) helpBite(p); });
/** Paaren: Anfrage eines anderen Geräts – passt es, bekommt der eigene Spieler einen Wurf, und das andere Gerät erfährt es */
onNet('pair',m=>{
  const p=players.find(o=>(o.num||1)===m.tn), q=mates.get(m.from+':'+m.pn), info=m.m;
  if(!p||!q||!info||typeof info.id!=='string') return;
  const ok=canPair(p,q);
  netSend({t:'paired',to:m.from,tn:m.pn,pn:p.num||1,ok:ok?1:0,m:mateInfo(p),fur:p.saveFur?(S.fur||null):p.fur||null});
  if(ok) pairRemote(p,{id:info.id,traits:q.L.traits,fur:m.fur&&typeof m.fur==='object'?m.fur:null,gen:q.L.gen,name:q.name});
});
onNet('paired',m=>{
  const p=players.find(o=>(o.num||1)===m.tn), q=mates.get(m.from+':'+m.pn); if(!p||!q) return;
  if(!m.ok){ tell(p,q.name+' kann sich gerade nicht paaren (Nachwuchs unterwegs, verwandt oder noch nicht ausgewachsen).','#ff9ad0'); return; }
  if(!m.m||typeof m.m.id!=='string'||S.preg>0) return;
  pairRemote(p,{id:m.m.id,traits:Array.isArray(m.m.tr)?m.m.tr:[],fur:m.fur&&typeof m.fur==='object'?m.fur:null,gen:+m.m.gen||1,name:q.name});
});
/** Gastgeber lässt die Nacht vergehen: Gäste schlafen mit (Tageszeit kommt danach wieder von ihm) */
onNet('sleep',m=>{ if(NET_GUEST&&m.from===net.host) doSleep(); });

export { updateNetCoop };
