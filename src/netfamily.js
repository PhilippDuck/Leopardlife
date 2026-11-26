// LeoLife – Online-Spiel: Die Familie der anderen Geräte ist zu sehen. Jedes Gerät rechnet seine eigene Familie (Partner und
// Elterntiere am Bau, Junge im Bau und die mitlaufenden, family.js) und schickt, wo sie gerade sind; die anderen zeigen sie
// als Modelle an (geglättet wie die Leoparden der anderen, net.js). Angreifen oder füttern lassen sie sich dort nicht.
import { scene } from './engine.js';
import { CUBSPEC, familyModels } from './family.js';
import { animLegs, buildQuad } from './models.js';
import { net, netSend, onNet } from './net.js';
import { JAG, dropModel } from './player.js';

/** Lage senden so oft (ms); Fell und Art alle FAM_PROFILE_MS */
const FAM_MS=1000/6, FAM_PROFILE_MS=2000;
/** Anzeige so weit in der Vergangenheit, dass zwei Stände zum Überblenden da sind; ohne Stand so lange zeigen */
const FAM_INTERP=250, FAM_STALE=3000;
const famR2=v=>Math.round(v*100)/100;
let famAt=0, famProfAt=0;
/** Familie der anderen: Gerät:Schlüssel → {g, furKey, cub, buf, seen} */
const shown=new Map();

function sendFamily(now){
  if(now<famAt) return; famAt=now+FAM_MS;
  const list=familyModels();
  if(now>=famProfAt){ famProfAt=now+FAM_PROFILE_MS; netSend({t:'fp',a:list.map(e=>[e.k,e.cub?1:0,e.fur||null])}); }
  netSend({t:'fm',a:list.map(e=>{ const g=e.g; return [e.k,famR2(g.position.x),famR2(g.position.y),famR2(g.position.z),famR2(g.rotation.y),famR2(g.scale.x),famR2(g.rotation.z)]; })});
}
function dropShown(k){ const e=shown.get(k); if(!e) return; dropModel(e.g); shown.delete(k); }
onNet('fp',m=>{
  if(!Array.isArray(m.a)) return;
  for(const d of m.a){ if(!Array.isArray(d)||typeof d[0]!=='string') continue;
    const k=m.from+':'+d[0], fur=d[2]&&typeof d[2]==='object'?d[2]:null, fk=JSON.stringify(fur), cub=!!d[1];
    let e=shown.get(k);
    if(e&&(e.furKey!==fk||e.cub!==cub)){ dropModel(e.g); e.g=null; }
    if(!e){ e={g:null,furKey:'',cub,buf:[],seen:0,ph:0}; shown.set(k,e); }
    if(!e.g){ e.g=buildQuad(cub?CUBSPEC:JAG,fur); e.g.visible=false; scene.add(e.g); e.furKey=fk; e.cub=cub; } }
});
onNet('fm',m=>{
  if(!Array.isArray(m.a)) return;
  const now=performance.now(), seen=new Set();
  for(const s of m.a){ if(!Array.isArray(s)||typeof s[0]!=='string'||!s.slice(1).every(v=>typeof v==='number'&&Number.isFinite(v))) continue;
    const k=m.from+':'+s[0]; seen.add(k); const e=shown.get(k); if(!e) continue;   // Fell kommt mit dem nächsten fp
    e.buf.push({t:now,s}); if(e.buf.length>8) e.buf.shift(); e.seen=now; }
  for(const k of [...shown.keys()]) if(k.startsWith(m.from+':')&&!seen.has(k)) dropShown(k);   // nicht mehr zu sehen (z. B. Junges übernommen)
});
const mixF=(a,b,u)=>a+(b-a)*u;
function mixA(a,b,u){ let d=b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return a+d*u; }
function showFamily(dt,now){
  const rt=now-FAM_INTERP;
  for(const [k,e] of [...shown]){
    const peer=+k.split(':')[0];
    if(!net.peers.has(peer)||now-e.seen>FAM_STALE){ if(!net.peers.has(peer)) dropShown(k); else if(e.g) e.g.visible=false; continue; }
    const b=e.buf, g=e.g; if(!g||!b.length) continue;
    let A=b[0], B=b[0];
    for(let i=b.length-1;i>=0;i--){ if(b[i].t<=rt){ A=b[i]; B=b[i+1]||b[i]; break; } }
    while(b.length>2&&b[1].t<=rt) b.shift();
    const u=B.t>A.t?Math.max(0,Math.min(1,(rt-A.t)/(B.t-A.t))):1, p=A.s, q=B.s;
    const ox=g.position.x, oz=g.position.z;
    g.position.set(mixF(p[1],q[1],u),mixF(p[2],q[2],u),mixF(p[3],q[3],u));
    g.rotation.set(0,mixA(p[4],q[4],u),mixF(p[6],q[6],u)); g.scale.setScalar(mixF(p[5],q[5],u));
    const v=dt>0&&g.visible?Math.hypot(g.position.x-ox,g.position.z-oz)/dt:0;
    e.ph+=dt*(4+v*2.2); animLegs(g,e.ph,v>0.3?Math.min(0.9,0.3+v*0.06):0.03);
    g.visible=true;
  }
}
/** Jedes Bild: eigene Familie senden, die der anderen bewegen */
function updateNetFamily(dt,now){
  const on=net.state==='online'&&net.peers.size>0;
  if(on) sendFamily(now);
  else if(shown.size){ for(const k of [...shown.keys()]) dropShown(k); return; }
  if(shown.size) showFamily(dt,now);
}

export { shown as famShown, updateNetFamily };
