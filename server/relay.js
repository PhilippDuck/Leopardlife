// LeoLife – Relay für das Online-Spiel: verwaltet Räume und leitet Nachrichten zwischen den Geräten weiter.
// Der Server rechnet nichts vom Spiel; ein Browser im Raum ist der Gastgeber (Host).
//
// Ablauf (JSON über WebSocket):
//   Gerät → Relay  {t:'hello', v:1, key, name, create:true, world:{seed,region}}   Raum öffnen (wird Host)
//                  {t:'hello', v:1, key, name, room:'ABCD'}                        Raum beitreten
//   Relay → Gerät  {t:'welcome', id, room, host, world, peers:[{id,name}]}
//                  {t:'join', id, name} · {t:'leave', id} · {t:'end', why} · {t:'error', code, msg}
//   danach: jede Nachricht {t:…} geht an alle anderen im Raum (mit from:id), mit to:id nur an diesen einen.
'use strict';
const http=require('http');
const crypto=require('crypto');
const { WebSocketServer }=require('ws');

const num=(v,d)=>{ const n=parseInt(v,10); return Number.isFinite(n)&&n>0?n:d; };
const CFG={
  port:num(process.env.PORT,8080),
  key:process.env.RELAY_KEY||'',
  open:process.env.RELAY_OPEN==='1',            // ohne Schlüssel und ohne ALLOWED_ORIGINS erlauben (nur zum Ausprobieren im Heimnetz)
  maxPeers:num(process.env.MAX_PEERS,8),        // Geräte je Raum (jedes Gerät kann bis zu 4 Splitscreen-Spieler haben)
  maxRooms:num(process.env.MAX_ROOMS,50),
  maxMsg:num(process.env.MAX_MSG_BYTES,32768),
  rate:num(process.env.MAX_MSG_PER_SEC,60),     // Nachrichten je Sekunde und Gerät (kurz darf es doppelt so viel sein)
  origins:(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),
};
const PROTOCOL=1, HELLO_MS=20000, PING_MS=20000;   // Anmeldefrist großzügig: langsame Handys brauchen nach dem Laden der Welt etwas
const ROOM_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Schlüssel vergleichen, ohne über die Laufzeit etwas zu verraten */
function keyOk(k,cfg){
  if(!cfg.key) return true;   // ohne Schlüssel schützen Herkunft, Raumcode und Grenzen
  if(typeof k!=='string') return false;
  const a=crypto.createHash('sha256').update(k).digest(), b=crypto.createHash('sha256').update(cfg.key).digest();
  return crypto.timingSafeEqual(a,b);
}
const cleanName=n=>(typeof n==='string'?n:'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,24)||'Leopard';
function newRoomCode(rooms){
  for(let t=0;t<100;t++){ let c=''; for(let i=0;i<4;i++) c+=ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)]; if(!rooms.has(c)) return c; }
  return null;
}
function cleanWorld(w){
  if(!w||typeof w!=='object') return null;
  const seed=Number(w.seed); if(!Number.isInteger(seed)||seed<=0||seed>0xffffffff) return null;
  const region=typeof w.region==='string'&&/^[a-z0-9_-]{1,24}$/.test(w.region)?w.region:'savanne';
  return {seed,region};
}

/**
 * Startet das Relay. Gibt {server, wss, rooms, close} zurück (für Tests).
 * @param {Partial<typeof CFG>} [over] Einstellungen überschreiben
 */
function startRelay(over={}){
  const cfg=Object.assign({},CFG,over);
  // Der Schlüssel ist freiwillig, wenn nur bestimmte Webseiten verbinden dürfen (ein Schlüssel im öffentlichen Spielcode schützt nichts).
  if(!cfg.key&&!cfg.open&&!cfg.origins.length) throw new Error('Setze ALLOWED_ORIGINS (z. B. https://philippduck.github.io) oder RELAY_KEY (oder RELAY_OPEN=1 nur zum Ausprobieren).');
  /** @type {Map<string,{code:string, host:number, world:any, peers:Map<number,any>}>} */
  const rooms=new Map();
  let nextId=1;

  const server=http.createServer((req,res)=>{
    res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
    res.end(req.url==='/health'?'ok':'LeoLife-Relay läuft. Räume: '+rooms.size+'\n');
  });
  const wss=new WebSocketServer({server,maxPayload:cfg.maxMsg,
    verifyClient:(info)=>!cfg.origins.length||cfg.origins.includes(info.origin)});

  const send=(ws,o)=>{ if(ws.readyState===1) ws.send(typeof o==='string'?o:JSON.stringify(o)); };
  function fail(ws,code,msg){ send(ws,{t:'error',code,msg}); ws.close(4000,code); }
  function leave(ws){
    const r=ws.room&&rooms.get(ws.room); if(!r) return; ws.room=null;
    r.peers.delete(ws.id);
    if(ws.id===r.host){
      rooms.delete(r.code);
      for(const p of r.peers.values()){ send(p,{t:'end',why:'host'}); p.room=null; p.close(1000,'host'); }
      log('Raum '+r.code+' beendet (Host weg)');
    } else {
      for(const p of r.peers.values()) send(p,{t:'leave',id:ws.id});
      log('Raum '+r.code+': '+ws.name+' weg ('+r.peers.size+' übrig)');
    }
  }
  function hello(ws,m){
    if(m.v!==PROTOCOL) return fail(ws,'version','Spiel und Server passen nicht zusammen. Bitte das Spiel bzw. den Server aktualisieren.');
    if(!keyOk(m.key,cfg)) return fail(ws,'key','Falscher Schlüssel.');
    ws.name=cleanName(m.name);
    let r;
    if(m.create){
      const world=cleanWorld(m.world); if(!world) return fail(ws,'world','Ungültige Welt.');
      if(rooms.size>=cfg.maxRooms) return fail(ws,'full','Der Server hat gerade zu viele Räume.');
      const code=newRoomCode(rooms); if(!code) return fail(ws,'full','Kein Raumcode frei.');
      r={code,host:ws.id,world,peers:new Map()}; rooms.set(code,r);
      log('Raum '+code+' geöffnet von '+ws.name);
    } else {
      const code=typeof m.room==='string'?m.room.trim().toUpperCase():'';
      r=rooms.get(code); if(!r) return fail(ws,'room','Diesen Raum gibt es nicht.');
      if(r.peers.size>=cfg.maxPeers) return fail(ws,'full','Der Raum ist voll.');
      for(const p of r.peers.values()) send(p,{t:'join',id:ws.id,name:ws.name});
      log('Raum '+code+': '+ws.name+' dabei');
    }
    r.peers.set(ws.id,ws); ws.room=r.code;
    send(ws,{t:'welcome',id:ws.id,room:r.code,host:r.host,world:r.world,peers:[...r.peers.values()].filter(p=>p!==ws).map(p=>({id:p.id,name:p.name}))});
  }

  wss.on('connection',(ws)=>{
    ws.id=nextId++; ws.room=null; ws.name=''; ws.alive=true; ws.tokens=cfg.rate*2; ws.tokT=Date.now(); ws.over=0;
    const helloT=setTimeout(()=>{ if(!ws.room) fail(ws,'timeout','Keine Anmeldung.'); },HELLO_MS);
    ws.on('pong',()=>{ ws.alive=true; });
    ws.on('message',(data,isBinary)=>{
      if(isBinary) return fail(ws,'format','Nur Text.');
      // Begrenzung: Eimer mit cfg.rate Marken je Sekunde, höchstens doppelt so viele auf Vorrat
      const now=Date.now(); ws.tokens=Math.min(cfg.rate*2,ws.tokens+(now-ws.tokT)/1000*cfg.rate); ws.tokT=now;
      if(ws.tokens<1){ if(++ws.over>cfg.rate*5) fail(ws,'rate','Zu viele Nachrichten.'); return; }
      ws.tokens-=1;
      let m; try{ m=JSON.parse(String(data)); }catch(e){ return fail(ws,'format','Ungültige Nachricht.'); }
      if(!m||typeof m!=='object'||typeof m.t!=='string') return;
      if(!ws.room){ if(m.t==='hello'){ clearTimeout(helloT); hello(ws,m); } return; }
      if(m.t==='hello') return;
      // Latenzprobe bleibt beim Absender und wird nicht an den Raum weitergeleitet.
      if(m.t==='ping'){ if(typeof m.c==='number'&&Number.isFinite(m.c)) send(ws,{t:'pong',c:m.c}); return; }
      const r=rooms.get(ws.room); if(!r) return;
      m.from=ws.id; const to=m.to; delete m.to; const out=JSON.stringify(m);
      if(to!==undefined){ const p=r.peers.get(to); if(p) send(p,out); return; }
      for(const p of r.peers.values()) if(p!==ws) send(p,out);
    });
    ws.on('close',()=>{ clearTimeout(helloT); leave(ws); });
    ws.on('error',()=>{});
  });

  // Tote Verbindungen (Handy im Schlaf, WLAN weg) erkennen und aufräumen
  const ping=setInterval(()=>{ for(const ws of wss.clients){ if(!ws.alive){ ws.terminate(); continue; } ws.alive=false; try{ ws.ping(); }catch(e){} } },PING_MS);
  wss.on('close',()=>clearInterval(ping));

  return { server, wss, rooms, listen:(port=cfg.port)=>new Promise(res=>server.listen(port,()=>res(server.address().port))),
    close:()=>new Promise(res=>{ clearInterval(ping); for(const ws of wss.clients) ws.terminate(); wss.close(()=>server.close(()=>res()));}) };
}

let quiet=false;
function log(s){ if(!quiet) console.log(new Date().toISOString()+' '+s); }

if(require.main===module){
  try{
    const r=startRelay();
    r.listen().then(p=>log('LeoLife-Relay hört auf Port '+p+(CFG.key?' · mit Schlüssel':'')+(CFG.origins.length?' · erlaubte Herkunft: '+CFG.origins.join(', '):'')));
    const stop=()=>{ log('Beende …'); r.close().then(()=>process.exit(0)); };
    process.on('SIGTERM',stop); process.on('SIGINT',stop);
  }catch(e){ console.error(e.message); process.exit(1); }
}

module.exports={ startRelay, setQuiet:(q)=>{ quiet=q; } };
