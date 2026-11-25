// Test für das Relay: Raum öffnen, beitreten, weiterleiten, Schlüssel, voller Raum, Host verlässt den Raum.
// Aufruf: node server/test.js (braucht npm install in server/)
'use strict';
const assert=require('assert');
const WebSocket=require('ws');
const { startRelay, setQuiet }=require('./relay.js');
setQuiet(true);

function client(port){
  const ws=new WebSocket('ws://127.0.0.1:'+port), inbox=[], waiters=[];
  ws.on('message',d=>{ const m=JSON.parse(String(d)); const w=waiters.findIndex(x=>x.f(m)); if(w>=0) waiters.splice(w,1)[0].res(m); else inbox.push(m); });
  const closed=new Promise(res=>ws.on('close',(code)=>res(code)));
  return { ws, closed, open:new Promise(res=>ws.on('open',res)),
    send:o=>ws.send(JSON.stringify(o)),
    drain:f=>{ let n=0; for(let i=inbox.length-1;i>=0;i--) if(f(inbox[i])){ inbox.splice(i,1); n++; } return n; },
    next:(f=()=>true,ms=2000)=>{ const i=inbox.findIndex(f); if(i>=0) return Promise.resolve(inbox.splice(i,1)[0]);
      return new Promise((res,rej)=>{ const w={f,res}; waiters.push(w); setTimeout(()=>rej(new Error('Zeitüberschreitung')),ms); }); } };
}
const is=t=>m=>m.t===t;

(async()=>{
  assert.throws(()=>startRelay({key:'',open:false}),/RELAY_KEY/);
  const relay=startRelay({key:'geheim',maxPeers:2,rate:50});
  const port=await relay.listen(0);
  try{
    // Raum öffnen
    const a=client(port); await a.open;
    a.send({t:'hello',v:1,key:'geheim',name:'Anna',create:true,world:{seed:12345,region:'savanne'}});
    const wa=await a.next(is('welcome'));
    assert.match(wa.room,/^[A-Z]{4}$/); assert.strictEqual(wa.host,wa.id); assert.deepStrictEqual(wa.world,{seed:12345,region:'savanne'});

    // Falscher Schlüssel
    const x=client(port); await x.open; x.send({t:'hello',v:1,key:'falsch',name:'X',room:wa.room});
    assert.strictEqual((await x.next(is('error'))).code,'key'); await x.closed;

    // Unbekannter Raum
    const y=client(port); await y.open; y.send({t:'hello',v:1,key:'geheim',name:'Y',room:'ZZZZ'});
    assert.strictEqual((await y.next(is('error'))).code,'room'); await y.closed;

    // Beitreten: bekommt Welt und Mitspieler, Host erfährt davon
    const b=client(port); await b.open;
    b.send({t:'hello',v:1,key:'geheim',name:'  Ben<script>  ',room:wa.room.toLowerCase()});
    const wb=await b.next(is('welcome'));
    assert.strictEqual(wb.host,wa.id); assert.deepStrictEqual(wb.world,wa.world); assert.deepStrictEqual(wb.peers,[{id:wa.id,name:'Anna'}]);
    const j=await a.next(is('join')); assert.strictEqual(j.id,wb.id); assert.strictEqual(j.name,'Benscript');

    // Weiterleiten an alle und gezielt
    b.send({t:'pos',x:1}); const m1=await a.next(is('pos')); assert.strictEqual(m1.from,wb.id); assert.strictEqual(m1.x,1);
    a.send({t:'pm',to:wb.id,v:2}); const m2=await b.next(is('pm')); assert.strictEqual(m2.from,wa.id); assert.strictEqual(m2.to,undefined);

    // Raum voll (maxPeers 2)
    const c=client(port); await c.open; c.send({t:'hello',v:1,key:'geheim',name:'C',room:wa.room});
    assert.strictEqual((await c.next(is('error'))).code,'full'); await c.closed;

    // Zu viele Nachrichten: werden verworfen, Verbindung bleibt erst einmal
    for(let i=0;i<150;i++) b.send({t:'spam',i});
    // Eimer auffüllen lassen, dann eine Markierung: alles davor ist angekommen
    await new Promise(r=>setTimeout(r,1200)); b.send({t:'mark'}); await a.next(is('mark'),5000);
    const got=a.drain(is('spam'));
    assert.ok(got<150&&got>=95,'Begrenzung greift ('+got+' von 150)');

    // Mitspieler geht: Host bekommt leave
    b.ws.close(); const l=await a.next(is('leave')); assert.strictEqual(l.id,wb.id);

    // Host geht: Raum endet für alle
    const d=client(port); await d.open; d.send({t:'hello',v:1,key:'geheim',name:'D',room:wa.room}); await d.next(is('welcome'));
    a.ws.close(); assert.strictEqual((await d.next(is('end'))).why,'host'); await d.closed;
    assert.strictEqual(relay.rooms.size,0);

    // Falsche Protokollversion
    const v=client(port); await v.open; v.send({t:'hello',v:99,key:'geheim',name:'V',create:true,world:{seed:1}});
    assert.strictEqual((await v.next(is('error'))).code,'version');

    console.log('Relay-Test OK');
  } finally { await relay.close(); }
})().catch(e=>{ console.error('FEHLER:',e); process.exit(1); });
