// LeoLife – Online-Spiel über mehrere Geräte (Teil 1): Verbindung zum Relay-Server (server/relay.js), Räume,
// gemeinsame Welt und die Leoparden der anderen Geräte. Ein Gerät öffnet einen Raum (Gastgeber), die anderen treten mit dem
// Raumcode bei und spielen in der Welt des Gastgebers (Weltsamen und Gebiet, siehe save.js). Tiere, Wetter, Tageszeit und
// Ereignisse berechnet der Gastgeber für alle (networld.js); dafür sieht seine Tier-KI die Leoparden der Gäste als ghosts.
import { QUAL } from './data.js';
import { scene } from './engine.js';
import { animLegs, buildQuad } from './models.js';
import { JAG, dropModel, ghosts, players } from './player.js';
import { quality } from './quality.js';
import { NET_KEY, NET_WORLD, REG_ID, S, WORLD_SEED, save } from './save.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { $ } from './util.js';

/** Version der Nachrichten; muss zum Relay passen */
const NET_PROTOCOL=1;
/** Stand der eigenen Leoparden so oft je Sekunde senden; Name, Fell und Stufe alle PROFILE_MS */
const SEND_MS=1000/12, PROFILE_MS=2000;
/** Andere Leoparden werden so weit in der Vergangenheit gezeigt, damit immer zwei Stände zum Überblenden da sind */
const INTERP_MS=150;
/** Ohne neuen Stand so lange ausgeblendet bzw. entfernt */
const STALE_MS=4000, GONE_MS=12000;
/** Laufzyklus wird modulo WALK_WRAP gesendet (kleine Zahlen) */
const WALK_WRAP=Math.PI*20;
const ONLINE_CFG='leolife-online';

/**
 * Zustand der Verbindung.
 * @type {{ws:WebSocket|null, state:'off'|'connecting'|'online', role:''|'host'|'guest', room:string, id:number, host:number,
 *   peers:Map<number,{name:string}>, sendAt:number, profAt:number, retry:boolean, want:{create?:boolean,room?:string}|null}}
 */
const net={ws:null,state:'off',role:'',room:'',id:0,host:0,peers:new Map(),sendAt:0,profAt:0,retry:false,want:null};
/**
 * Leoparden der anderen Geräte, Schlüssel 'Gerät:Spielernummer'.
 * @typedef {{key:string, peer:number, num:number, g:any, label:{c:HTMLCanvasElement,tex:any,sp:any}, labelTxt:string, furKey:string,
 *   buf:{t:number,s:number[]}[], seenT:number, ghost:import('./player.js').Ghost|null, fur?:any, kin?:any}} Remote
 * @type {Map<string,Remote>}
 */
const remotes=new Map();
/** Weitere Nachrichtenarten (networld.js): Typ → Behandlung; nur von Geräten im Raum */
const netHandlers={};
/** @param {string} type @param {(m:any)=>void} fn */
function onNet(type,fn){ netHandlers[type]=fn; }
/** Aufgerufen, wenn ein Gerät dazukommt (z. B. damit der Gastgeber ihm den ganzen Stand schickt) */
const joinHooks=[];
/** Datenmenge: gesendete und empfangene Bytes, je Sekunde gemittelt (Anzeige im Online-Fenster) */
const traffic={up:0,down:0,upRate:0,downRate:0,t:0};

/* ---------- Einstellungen (Server, Schlüssel, Name) ---------- */
/** Standard-Server; unter „Eigener Server“ lässt sich ein anderer eintragen (gespeichert wird nur eine Abweichung) */
const DEFAULT_RELAY='wss://leolife.duck-box.de';
function onlineCfg(){ try{ return Object.assign({url:'',key:'',name:''},JSON.parse(localStorage.getItem(ONLINE_CFG)||'{}')); }catch(e){ return {url:'',key:'',name:''}; } }
function storeCfg(c){ try{ localStorage.setItem(ONLINE_CFG,JSON.stringify(c)); }catch(e){} }
/** Server-Adresse vereinheitlichen: ohne Schema wss://, http(s):// wird zu ws(s):// */
function wsUrl(u){
  u=(u||'').trim(); if(!u) return '';
  if(/^https?:\/\//i.test(u)) u=u.replace(/^http/i,'ws');
  else if(!/^wss?:\/\//i.test(u)) u='wss://'+u;
  return u;
}
function readForm(){
  const own=wsUrl(/** @type {HTMLInputElement} */($('onUrl')).value);
  const c={url:own===DEFAULT_RELAY?'':own,key:/** @type {HTMLInputElement} */($('onKey')).value,
    name:/** @type {HTMLInputElement} */($('onName')).value.trim().slice(0,24)};
  storeCfg(c); return withDefault(c);
}
const withDefault=c=>Object.assign({},c,{url:c.url||DEFAULT_RELAY});

/* ---------- Sitzung: Welt des Gastgebers über ein Neuladen hinweg ---------- */
/** @returns {{world?:{seed:number,region:string}, room?:string, rejoin?:boolean}|null} */
function session(){ try{ return JSON.parse(sessionStorage.getItem(NET_KEY)||'null'); }catch(e){ return null; } }
function setSession(o){ try{ if(o) sessionStorage.setItem(NET_KEY,JSON.stringify(o)); else sessionStorage.removeItem(NET_KEY); }catch(e){} }
/** Zurück in die eigene Welt (lädt neu, wenn gerade die Welt des Gastgebers geladen ist) */
function backToOwnWorld(msg){
  setSession(null);
  if(!NET_WORLD) return;
  save(); toast(msg+' Du kehrst in deine eigene Welt zurück …','#f2b84b');
  setTimeout(()=>{ try{ location.reload(); }catch(e){} },2500);
}

/* ---------- Verbindung ---------- */
const onlineActive=()=>net.state!=='off';
/**
 * @param {{create?:boolean, room?:string}} want Raum öffnen oder diesem beitreten
 * @param {{url:string,key:string,name:string}} [c] Server, Schlüssel, Name (Standard: aus dem Fenster)
 */
function connect(want,c=readForm()){
  if(location.protocol==='https:'&&c.url.startsWith('ws://')){ status('Diese Seite läuft über https – der Server braucht eine wss://-Adresse.'); return; }
  if(!want.create&&!/^[A-Za-z]{4}$/.test(want.room||'')){ status('Der Raumcode hat 4 Buchstaben.'); return; }
  closeSocket();
  /** @type {WebSocket} */ let ws;
  try{ ws=new WebSocket(c.url); }catch(e){ status('Die Server-Adresse ist ungültig.'); return; }
  net.ws=ws; net.state='connecting'; net.want=want; status('Verbinde …'); renderOnline();
  ws.onopen=()=>{
    const hello={t:'hello',v:NET_PROTOCOL,key:c.key,name:c.name||'Leopard'};
    ws.send(JSON.stringify(want.create?Object.assign(hello,{create:true,world:{seed:WORLD_SEED,region:REG_ID}}):Object.assign(hello,{room:want.room.toUpperCase()})));
  };
  ws.onmessage=e=>{ if(ws!==net.ws) return; traffic.down+=String(e.data).length; let m; try{ m=JSON.parse(String(e.data)); }catch(err){ return; } onMessage(m); };
  ws.onclose=()=>{ if(ws===net.ws) dropped(); };
  ws.onerror=()=>{};
}
/** Verbindung schließen, ohne dass das als Abbruch zählt */
function closeSocket(){ const ws=net.ws; net.ws=null; if(ws){ try{ ws.close(1000); }catch(e){} } }
function reset(){ closeSocket(); net.state='off'; net.role=''; net.room=''; net.id=0; net.host=0; net.peers.clear(); net.want=null; for(const k of [...remotes.keys()]) dropRemote(k); ghosts.length=0; }
function netSend(o){ const ws=net.ws; if(ws&&ws.readyState===1&&net.state==='online'){ const s=JSON.stringify(o); traffic.up+=s.length; ws.send(s); } }

/** Verbindung unerwartet weg */
function dropped(){
  const was=net.state, want=net.want, role=want&&!want.create?'guest':'host';
  reset();
  if(was==='connecting'&&!net.retry){ status('Keine Verbindung zum Server. Bitte später noch einmal versuchen'+($('onAdv').hasAttribute('open')||onlineCfg().url?' oder die Server-Adresse prüfen.':'.')); if(session()?.rejoin) backToOwnWorld('Der Raum ist nicht erreichbar.'); renderOnline(); return; }
  // Gast: einmal still neu verbinden (kurzer Aussetzer im WLAN)
  if(was==='online'&&role==='guest'&&!net.retry){ net.retry=true; status('Verbindung verloren – verbinde neu …'); setTimeout(()=>connect(want,onlineCfg()),1500); renderOnline(); return; }
  net.retry=false;
  toast(role==='host'?'Verbindung zum Server verloren – der Raum ist geschlossen.':'Verbindung zum Raum verloren.','#f2b84b');
  status('Nicht verbunden.'); renderOnline();
  if(role==='guest') backToOwnWorld('Die Verbindung ist weg.');
}

function onMessage(m){
  switch(m.t){
    case 'welcome': {
      net.retry=false;
      const w=m.world||{}, guest=m.host!==m.id;
      if(guest&&(!NET_WORLD||w.seed!==WORLD_SEED||w.region!==REG_ID)){
        // In die Welt des Gastgebers neu laden (auch bei gleichem Samen: als Gast läuft die eigene Tierwelt nicht),
        // danach tritt das Spiel von selbst wieder bei
        setSession({world:{seed:w.seed,region:w.region},room:m.room,rejoin:true});
        closeSocket(); net.state='off'; save(); status('Lade die Welt des Gastgebers …'); renderOnline();
        setTimeout(()=>{ try{ location.reload(); }catch(e){} },300);
        return;
      }
      net.state='online'; net.role=guest?'guest':'host'; net.room=m.room; net.id=m.id; net.host=m.host;
      net.peers.clear(); for(const p of m.peers||[]) net.peers.set(p.id,{name:p.name});
      if(guest&&NET_WORLD) setSession({world:NET_WORLD,room:m.room,rejoin:true});
      net.profAt=0; status(''); renderOnline();
      toast(guest?'Online im Raum '+m.room+' – '+[...net.peers.values()].map(p=>p.name).join(', '):'Raum '+m.room+' ist offen. Gib den Code an deine Mitspieler weiter.','#9be07f');
      return;
    }
    case 'join': net.peers.set(m.id,{name:m.name}); net.profAt=0; for(const f of joinHooks) f(m.id); toast(m.name+' ist online dabei.','#9be07f'); renderOnline(); return;
    case 'leave': { const p=net.peers.get(m.id); net.peers.delete(m.id); dropPeer(m.id); if(p) toast(p.name+' hat den Raum verlassen.','#b9b7a6'); renderOnline(); return; }
    case 'end': reset(); status('Der Gastgeber hat den Raum geschlossen.'); toast('Der Gastgeber hat den Raum geschlossen.','#f2b84b'); renderOnline(); backToOwnWorld('Der Raum ist zu Ende.'); return;
    case 'error': {
      const rejoin=session()?.rejoin; reset(); net.retry=false; status(m.msg||'Fehler.'); renderOnline();
      if(rejoin) backToOwnWorld(m.msg||'Der Raum ist nicht mehr da.');
      return;
    }
    case 'st': if(net.peers.has(m.from)&&Array.isArray(m.p)) onState(m.from,m.p); return;
    case 'pf': if(net.peers.has(m.from)&&Array.isArray(m.p)) onProfile(m.from,m.p); return;
    default: { const h=netHandlers[m.t]; if(h&&net.peers.has(m.from)) h(m); }
  }
}

/** Raum verlassen (Knopf) */
function leaveRoom(){
  const guest=net.role==='guest'; reset(); net.retry=false; status(''); renderOnline();
  if(guest) backToOwnWorld('Du hast den Raum verlassen.'); else setSession(null);
}

/* ---------- Eigene Leoparden senden ---------- */
const r2=v=>Math.round(v*100)/100;
function sendState(){
  const list=[];
  for(const p of players){ const g=p.g; if(!g) continue; const inr=g.userData.inner;
    // 0–12: Modell; 13–16: was die Tiere des Gastgebers wahrnehmen (Stufe, Tarnung, Geräusch, Zustand als Bits)
    // 32 am Boden (wartet aufs Wiederbeleben), 64 hält X/F neben einem Leoparden dieses Empfängers am Boden, 128 will schlafen
    const bits=(p.safe?1:0)|(p.sneak?2:0)|(p.tree!=null?4:0)|(p.dead?8:0)|(p.drinking?16:0)|(p.dead&&p.downT!=null?32:0)|(p.helping?64:0)|(p.wantSleep?128:0)|(p.bite?256:0);   // 256 hat sich festgebissen
    list.push([p.num||1,r2(g.position.x),r2(g.position.y),r2(g.position.z),r2(g.rotation.y),r2(g.rotation.x),r2(g.rotation.z),r2(g.scale.x),
      r2(inr.position.y),r2(inr.rotation.x),r2((p.walkT||0)%WALK_WRAP),r2(p.legA??0.02),g.visible?1:0,
      p.L.lvl,r2(p.stealth??1),r2(p.noise||0),bits,r2(p.x),r2(p.z),r2(p.y),r2(p.revT||0)]); }
  netSend({t:'st',p:list});
}
function sendProfile(){
  const c=onlineCfg();
  // 4. Feld: Herkunft und Familie (Kennung, Eltern, Erbanlagen, schon Nachwuchs) fürs Paaren über Geräte (netcoop.js)
  netSend({t:'pf',name:c.name||'Leopard',p:players.map(p=>[p.num||1,p.saveFur?(S.fur||null):p.fur,p.L.lvl,G.profileExtra?G.profileExtra(p):null])});
}

/* ---------- Leoparden der anderen Geräte ---------- */
function makeLabel(){
  const c=document.createElement('canvas'); c.width=256; c.height=64;
  const tex=new THREE.CanvasTexture(c);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true,fog:false}));
  sp.scale.set(2.6,0.65,1); sp.renderOrder=10; scene.add(sp);
  return {c,tex,sp};
}
function drawLabel(r,txt){
  if(r.labelTxt===txt) return; r.labelTxt=txt;
  const x=r.label.c.getContext('2d'); if(!x) return;
  x.clearRect(0,0,256,64); x.font='bold 28px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  x.lineWidth=6; x.strokeStyle='rgba(0,0,0,.8)'; x.strokeText(txt,128,32,250); x.fillStyle='#ffd27a'; x.fillText(txt,128,32,250);
  r.label.tex.needsUpdate=true;
}
function buildRemoteModel(r,fur){ if(r.g) dropModel(r.g); r.g=buildQuad(JAG,fur||null); r.g.userData.blob.visible=!QUAL[quality].sh; r.g.visible=false; scene.add(r.g); }
/** @returns {Remote} */
function addRemote(key,peer,num){
  /** @type {Remote} */
  const r={key,peer,num,g:null,label:makeLabel(),labelTxt:'',furKey:'null',buf:[],seenT:0,ghost:null};
  buildRemoteModel(r,null); remotes.set(key,r); nameRemote(r,0); return r;
}
function nameRemote(r,lvl){ const n=net.peers.get(r.peer)?.name||'Leopard'; drawLabel(r,(r.num>1?n+' ('+r.num+')':n)+(lvl?' · Stufe '+lvl:'')); }
function dropRemote(key){ const r=remotes.get(key); if(!r) return; dropModel(r.g); if(r.ghost){ const i=ghosts.indexOf(r.ghost); if(i>=0) ghosts.splice(i,1); } scene.remove(r.label.sp); r.label.tex.dispose(); r.label.sp.material.dispose(); remotes.delete(key); }
function dropPeer(id){ for(const [k,r] of [...remotes]) if(r.peer===id) dropRemote(k); }
function onState(from,list){
  const now=performance.now(), seen=new Set();
  for(const s of list){
    if(!Array.isArray(s)||s.length<13||!s.every(v=>typeof v==='number'&&Number.isFinite(v))) continue;
    const key=from+':'+s[0]; seen.add(key);
    const r=remotes.get(key)||addRemote(key,from,s[0]);
    r.buf.push({t:now,s}); if(r.buf.length>10) r.buf.shift(); r.seenT=now;
    if(net.role==='host'&&s.length>=20) ghostFrom(r,s);
  }
  for(const [k,r] of [...remotes]) if(r.peer===from&&!seen.has(k)) dropRemote(k);   // ein Splitscreen-Mitspieler dort ist ausgestiegen
}
function onProfile(from,list){
  for(const e of list){ if(!Array.isArray(e)) continue; const r=remotes.get(from+':'+e[0]); if(!r) continue;
    const fur=e[1]&&typeof e[1]==='object'?e[1]:null, fk=JSON.stringify(fur);
    if(fk!==r.furKey){ r.furKey=fk; buildRemoteModel(r,fur); }
    nameRemote(r,typeof e[2]==='number'?e[2]:0);
    r.fur=fur; r.kin=e[3]&&typeof e[3]==='object'?e[3]:null; }
}
/** Gastgeber: Leopard eines Gastes für die eigene Tier-KI auf den neuesten Stand bringen (ohne Verzögerung) */
function ghostFrom(r,s){
  let gh=r.ghost;
  if(!gh){ gh=r.ghost={ghost:true,peer:r.peer,num:r.num,x:0,y:0,z:0,L:{lvl:1},stealth:1,noise:0,safe:false,sneak:false,tree:null,dead:false,drinking:false,upNow:0,camY:0}; ghosts.push(gh); }
  const b=s[16];
  gh.x=s[17]; gh.z=s[18]; gh.y=s[19]; gh.camY=s[2]; gh.L.lvl=s[13]; gh.stealth=s[14]; gh.noise=s[15];
  gh.safe=!!(b&1); gh.sneak=!!(b&2); gh.tree=b&4?0:null; gh.dead=!!(b&8); gh.drinking=!!(b&16); gh.upNow=b&4?s[2]-s[19]:0;
}
const lerp=(a,b,u)=>a+(b-a)*u;
function lerpAng(a,b,u){ let d=b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return a+d*u; }
function updateRemotes(now){
  const rt=now-INTERP_MS;
  for(const [k,r] of [...remotes]){
    if(now-r.seenT>GONE_MS){ dropRemote(k); continue; }
    const b=r.buf; if(!b.length) continue;
    let A=b[0], B=b[0];
    for(let i=b.length-1;i>=0;i--){ if(b[i].t<=rt){ A=b[i]; B=b[i+1]||b[i]; break; } }
    while(b.length>2&&b[1].t<=rt) b.shift();   // ältere Stände braucht es nicht mehr
    const u=B.t>A.t?Math.max(0,Math.min(1,(rt-A.t)/(B.t-A.t))):1, a=A.s, s=B.s;
    let wa=a[10], wb=s[10]; if(wb<wa-WALK_WRAP/2) wb+=WALK_WRAP;
    const g=r.g, inr=g.userData.inner;
    g.position.set(lerp(a[1],s[1],u),lerp(a[2],s[2],u),lerp(a[3],s[3],u));
    g.rotation.set(lerp(a[5],s[5],u),lerpAng(a[4],s[4],u),lerp(a[6],s[6],u));
    g.scale.setScalar(lerp(a[7],s[7],u));
    inr.position.y=lerp(a[8],s[8],u); inr.rotation.x=lerp(a[9],s[9],u);
    animLegs(g,lerp(wa,wb,u),lerp(a[11],s[11],u));
    g.visible=s[12]===1&&now-r.seenT<STALE_MS;
    r.label.sp.visible=g.visible; r.label.sp.position.set(g.position.x,g.position.y+0.9+g.scale.x*0.9,g.position.z);
  }
}

/** Jedes Bild (auch in der Pause): senden und die anderen Leoparden bewegen */
function updateNet(now){
  if(now-traffic.t>=1000){ const k=1000/Math.max(1000,now-traffic.t||1000); traffic.upRate=traffic.up*k; traffic.downRate=traffic.down*k; traffic.up=traffic.down=0; traffic.t=now; if(onlineOpen()) renderOnline(); }
  if(net.state==='online'&&net.peers.size){
    if(now>=net.sendAt){ net.sendAt=now+SEND_MS; sendState(); }
    if(now>=net.profAt){ net.profAt=now+PROFILE_MS; sendProfile(); }
  }
  if(remotes.size) updateRemotes(now);
}

/* ---------- Fenster „Online spielen“ ---------- */
function status(t){ $('onStatus').textContent=t; }
function renderOnline(){
  const on=net.state==='online';
  $('onSetup').style.display=net.state==='off'?'':'none';
  $('onWait').style.display=net.state==='connecting'?'':'none';
  $('onLive').style.display=on?'':'none';
  if(on){
    $('onRoom').textContent=net.room;
    $('onRole').textContent=net.role==='host'?'Du bist Gastgeber. Mitspieler treten mit diesem Code bei.':'Du spielst in der Welt des Gastgebers.';
    const names=[...net.peers.entries()].map(([id,p])=>p.name+(id===net.host?' (Gastgeber)':''));
    $('onPeers').textContent=names.length?'Dabei: '+names.join(', '):'Noch niemand dabei.';
    $('btnOnPlay').style.display=G.started?'none':'';
    $('onTraffic').textContent='Daten: ↑ '+(traffic.upRate/1024).toFixed(1)+' kB/s · ↓ '+(traffic.downRate/1024).toFixed(1)+' kB/s';
  }
  $('btnOnline').textContent=on?'Online · Raum '+net.room:'Online spielen';
}
/** Von wo das Fenster geöffnet wurde: Pause-Menü oder Startbildschirm (der bleibt dann unsichtbar darunter) */
let onFromStart=false;
function openOnline(){
  const c=onlineCfg();
  /** @type {HTMLInputElement} */($('onUrl')).value=c.url; /** @type {HTMLInputElement} */($('onKey')).value=c.key;
  /** @type {HTMLInputElement} */($('onUrl')).placeholder=DEFAULT_RELAY;
  if(c.url||c.key) $('onAdv').setAttribute('open','');
  /** @type {HTMLInputElement} */($('onName')).value=c.name;
  onFromStart=!G.started;
  if(onFromStart) $('start').classList.add('under'); else $('menu').style.display='none';
  renderOnline(); $('online').style.display='flex';
}
function closeOnline(){
  $('online').style.display='none';
  if(onFromStart){ onFromStart=false; $('start').classList.remove('under'); return; }
  $('menu').style.display='flex'; G.menuT=performance.now();
}
const onlineOpen=()=>$('online').style.display==='flex';
$('btnOnline').onclick=openOnline; $('btnStartOnline').onclick=openOnline; $('btnOnBack').onclick=closeOnline;
// Vom Startbildschirm aus: Raum ist offen bzw. beigetreten, jetzt ins Spiel (wie der Knopf „Spielen“ dort)
$('btnOnPlay').onclick=()=>{ closeOnline(); $('btnPlay').click(); };
// Den Namen gleich beim Tippen merken, nicht erst beim Verbinden
$('onName').addEventListener('input',()=>storeCfg(Object.assign(onlineCfg(),{name:/** @type {HTMLInputElement} */($('onName')).value.trim().slice(0,24)})));
$('btnOnHost').onclick=()=>connect({create:true});
$('btnOnJoin').onclick=()=>connect({room:/** @type {HTMLInputElement} */($('onCode')).value.trim()});
$('btnOnLeave').onclick=leaveRoom;
$('btnOnCancel').onclick=()=>{ reset(); status(''); renderOnline(); };

// Nach dem Neuladen in die Welt des Gastgebers: selbst wieder beitreten
// (vor dem Spielstart: das Fenster zeigt dann Raum und „Spielen“)
{ const ses=session(); if(ses&&ses.rejoin&&ses.room) setTimeout(()=>{ if(!G.started) openOnline(); connect({room:ses.room},withDefault(onlineCfg())); },300); }

/** Eigener Name im Online-Spiel */
const ownName=()=>onlineCfg().name||'Leopard';
export { ownName, closeOnline, joinHooks, netSend, onNet, onlineActive, onlineOpen, remotes, net, traffic, updateNet, wsUrl };
