// Integrationstest Online-Spiel: lokales Relay, zwei Browser mit verschiedenen Welten.
// Teil 1: Gerät A öffnet einen Raum, Gerät B tritt bei, lädt die Welt von A und sieht A laufen (und umgekehrt).
// Teil 2: B zeigt die Tiere, die Tageszeit, das Wetter und das Ereignis von A; ein Tier von A greift den Leoparden von B an.
// Benötigt Playwright mit Chromium und `npm install` in server/. Aufruf: node tests/online-browser.cjs
const { chromium }=require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const { startRelay, setQuiet }=require('../server/relay.js');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  fs.readFile(file,(error,data)=>{res.statusCode=error?404:200;res.end(error?'missing':data);});
});
const step=t=>console.log(new Date().toISOString().slice(11,19)+' '+t);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const browsers=[]; let relay; const errors=[];
(async()=>{
  setQuiet(true);
  relay=startRelay({key:'test-geheim'}); const rport=await relay.listen(0);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/index.html?test';

  async function device(name,seed){
    // Jedes Gerät mit eigenem Browser: Ein gemeinsamer Software-Grafikprozess würde vom laufenden Spiel des anderen blockiert
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
    browsers.push(browser);
    const ctx=await browser.newContext({viewport:{width:Number(process.env.SHOT_W||400),height:Number(process.env.SHOT_H||225)}});
    const page=await ctx.newPage();
    // Ohne Grafikkarte ist das Zeichnen zu langsam für zwei Geräte: Die Hauptschleife bleibt aus, nur das Netz wird
    // regelmäßig aktualisiert (dieselbe Funktion, die sonst jedes Bild läuft)
    await page.addInitScript(()=>{ window.requestAnimationFrame=()=>0;
      addEventListener('load',()=>{ Promise.all([import('./src/net.js'),import('./src/networld.js')]).then(([m,w])=>setInterval(()=>{ const now=performance.now(); m.updateNet(now); w.updateNetWorld(0.05,now); },50)); }); });
    await page.addInitScript(([seed,name,rport])=>{
      if(localStorage.getItem('jaguar-save-v1')) return;
      localStorage.setItem('jaguar-gfx2','low');
      localStorage.setItem('jaguar-save-v1',JSON.stringify({lvl:3,seed}));
      localStorage.setItem('leolife-online',JSON.stringify({url:'ws://127.0.0.1:'+rport,key:'test-geheim',name}));
    },[seed,name,rport]);
    page.on('pageerror',e=>errors.push(name+': '+e.stack));
    page.on('console',m=>{ if(m.type()==='error') errors.push(name+': '+m.text()); });
    step(name+': lädt'); await page.goto(url); await page.waitForTimeout(1500);
    step(name+': Start'); await page.click('#btnPlay'); await page.waitForTimeout(500);
    return page;
  }
  // Pause-Menü öffnen und darin „Online spielen“
  const openOnline=page=>page.evaluate(()=>{ document.getElementById('menu').style.display='flex'; document.getElementById('btnOnline').click(); });
  // Warten, bis fn() in der Seite wahr ist (übersteht Neuladen; ohne Hauptschleife gibt es keine Bilder zum Abfragen)
  async function until(page,fn,ms=120000){ const end=Date.now()+ms;
    for(;;){ try{ if(await page.evaluate(fn)) return; }catch(e){} if(Date.now()>end) throw new Error('Zeitüberschreitung: '+fn); await wait(200); } }
  const press=(page,id)=>page.evaluate(id=>document.getElementById(id).click(),id);
  const treesOf=page=>page.evaluate(async()=>{ const {trees}=await import('./src/vegetation.js'); return trees.slice(0,40).map(t=>t&&[Math.round(t.x*100),Math.round(t.z*100)]); });
  const seedOf=page=>page.evaluate(async()=>(await import('./src/save.js')).WORLD_SEED);

  const A=await device('Anna',1111), B=await device('Ben',2222);
  step('beide Geräte bereit');
  assert.notDeepEqual(await treesOf(A),await treesOf(B),'verschiedene Welten vor dem Beitritt');

  // Zwei Ladevorgänge derselben Welt ergeben dieselben Bäume
  const before=await treesOf(A); await A.reload(); await A.waitForTimeout(1500); await A.click('#btnPlay');
  assert.deepEqual(await treesOf(A),before,'Landschaft hängt nur vom Weltsamen ab');

  // A öffnet einen Raum
  await openOnline(A); await press(A,'btnOnHost');
  await until(A,()=>window.__leopard.net.state==='online');
  const room=await A.evaluate(()=>window.__leopard.net.room);
  assert.match(room,/^[A-Z]{4}$/);
  console.log('Raum geöffnet: '+room);

  // B tritt bei: lädt neu in die Welt von A und verbindet sich von selbst wieder
  await openOnline(B);
  await B.fill('#onName','Bennie'); await B.fill('#onName','Ben');   // Name wird beim Tippen gemerkt
  assert.equal(await B.evaluate(()=>JSON.parse(localStorage.getItem('leolife-online')).name),'Ben');
  await B.fill('#onCode',room.toLowerCase()); await press(B,'btnOnJoin');
  await until(B,()=>window.__leopard&&window.__leopard.net.state==='online'&&sessionStorage.getItem('leolife-net')!==null);
  assert.equal(await seedOf(B),1111,'B spielt mit dem Weltsamen von A');
  assert.deepEqual(await treesOf(B),await treesOf(A),'B hat dieselben Bäume wie A');
  console.log('B ist in der Welt von A');
  // Eigener Spielstand von B bleibt unverändert
  assert.equal(await B.evaluate(()=>JSON.parse(localStorage.getItem('jaguar-save-v1')).seed),2222);

  // Nach dem Neuladen steht B auf dem Startbildschirm im Online-Fenster: Raumcode und „Spielen“
  assert.ok(await B.evaluate(()=>document.getElementById('online').style.display==='flex'&&document.getElementById('btnOnPlay').style.display!=='none'),'Online-Fenster mit „Spielen“ nach dem Beitritt');
  await press(B,'btnOnPlay');
  assert.ok(await B.evaluate(()=>window.__leopard&&document.getElementById('online').style.display==='none'&&document.getElementById('start').style.display==='none'),'B ist im Spiel');
  // A läuft ein Stück, B sieht ihn dort
  await A.evaluate(()=>{ window.__leopard.players[0].g.position.set(20,3,14); });
  await wait(1200);
  const seenByB=await B.evaluate(()=>[...window.__leopard.remotes.values()].map(r=>({x:r.g.position.x,z:r.g.position.z,vis:r.g.visible,label:r.labelTxt})));
  const posA=await A.evaluate(()=>{ const p=window.__leopard.players[0]; return {x:p.g.position.x,z:p.g.position.z}; });
  assert.equal(seenByB.length,1,'B sieht genau einen anderen Leoparden');
  assert.ok(Math.hypot(seenByB[0].x-posA.x,seenByB[0].z-posA.z)<0.5,'Position von A kommt bei B an '+JSON.stringify([seenByB[0],posA]));
  assert.ok(seenByB[0].vis,'sichtbar'); assert.match(seenByB[0].label,/^Anna · Stufe 3$/);
  const seenByA=await A.evaluate(()=>[...window.__leopard.remotes.values()].map(r=>r.labelTxt));
  assert.deepEqual(seenByA,['Ben · Stufe 3']);
  console.log('Beide sehen sich: '+JSON.stringify(seenByB[0]));
  if(process.env.SHOT_DIR){   // Bild von B: der Leopard von A mit Namen (ein einzelnes Bild zeichnen)
    await B.evaluate(async()=>{ const {renderer,scene,camera}=await import('./src/engine.js'); const r=[...window.__leopard.remotes.values()][0].g.position;
      camera.position.set(r.x-4,r.y+2.2,r.z-4); camera.lookAt(r.x,r.y+0.6,r.z); renderer.render(scene,camera); });
    await B.screenshot({path:path.join(process.env.SHOT_DIR,'online-b-sieht-a.png')});
  }

  // Teil 2: Tiere von A erscheinen bei B an derselben Stelle (die eigene Tierwelt von B läuft nicht).
  // Ohne Hauptschleife steht bei A kein Modell an seiner Stelle: einmal hinstellen und sichtbar machen
  await A.evaluate(()=>{ for(const a of window.__leopard.animals){ a.g.position.set(a.x,a.g.position.y,a.z); a.g.visible=true; } });
  await until(B,()=>window.__leopard.mirror.size>0); await wait(1500);
  const pairs=await B.evaluate(()=>[...window.__leopard.mirror.entries()].filter(([,a])=>a.x!==1e6).slice(0,5).map(([id,a])=>[id,a.x,a.z,a.sp.id]));
  assert.ok(pairs.length>0,'B zeigt Tiere von A');
  const onA=await A.evaluate(ids=>ids.map(id=>{ const a=window.__leopard.animals.find(o=>o.nid===id); return a&&[a.x,a.z,a.sp.id]; }),pairs.map(p=>p[0]));
  pairs.forEach((p,i)=>{ assert.ok(onA[i],'Tier '+p[0]+' gibt es bei A'); assert.equal(onA[i][2],p[3]); assert.ok(Math.hypot(onA[i][0]-p[1],onA[i][1]-p[2])<0.1,'gleiche Stelle '+JSON.stringify([p,onA[i]])); });
  console.log('B zeigt '+await B.evaluate(()=>window.__leopard.mirror.size)+' Tiere von A an denselben Stellen');
  // Tageszeit, Wetter und Steppenbrand kommen von A
  await A.evaluate(async()=>{ const {W}=await import('./src/weather.js'); const {startEvent}=await import('./src/worldevents.js');
    window.__leopard.S.tod=0.9; W.target=1; W.storm=true; startEvent('fire'); });
  await until(B,async()=>{ const {W}=await import('./src/weather.js'); const {EV}=await import('./src/worldevents.js'); const S=window.__leopard.S;
    return Math.abs(S.tod-0.9)<0.01&&W.target===1&&W.storm&&EV.on==='fire'; });
  const ownTod=await B.evaluate(async()=>{ (await import('./src/save.js')).save(); return JSON.parse(localStorage.getItem('jaguar-save-v1')).tod; });
  assert.notEqual(ownTod,0.9,'die Tageszeit des Gastgebers kommt nicht in den Spielstand von B');
  console.log('Tageszeit, Gewitter und Steppenbrand von A sind bei B angekommen');
  // Eine Hyäne von A greift den Leoparden von B an: A rechnet, der Schaden kommt auf dem Gerät von B an
  const hp0=await B.evaluate(()=>window['__hp0']=window.__leopard.players[0].hp);
  await A.evaluate(async()=>{ const {ghosts}=await import('./src/player.js'); const {updateAnimal}=await import('./src/ai.js');
    const gh=ghosts[0], h=window.__leopard.animals.find(a=>a.sp.id==='hyena'&&!a.dead);
    h.x=gh.x+0.6; h.z=gh.z; h.state='chase'; h.tgt=gh; h.aggro=5; h.cd=0; h.stun=0; h.wound=null; h.held=null; h.ev=null;
    updateAnimal(h,0.05); });
  await until(B,()=>window.__leopard.players[0].hp<window['__hp0'],20000).catch(()=>{});
  const hp1=await B.evaluate(()=>window.__leopard.players[0].hp);
  assert.ok(hp1<hp0,'Biss der Hyäne kommt bei B an ('+hp0+' → '+hp1+')');
  console.log('Hyäne von A beißt Ben: Leben '+Math.round(hp0)+' → '+Math.round(hp1));
  const traffic=await A.evaluate(async()=>{ const {traffic}=await import('./src/net.js'); return Math.round(traffic.upRate); });
  console.log('Gastgeber sendet etwa '+(traffic/1024).toFixed(1)+' kB/s (Tiere stehen hier still)');
  // Rechenzeit beim Gastgeber: ein vollständiger Stand aller Tiere in der Nähe von B
  const ms=await A.evaluate(async()=>{ const w=await import('./src/networld.js'); let t=0; for(let i=0;i<40;i++){ for(const a of window.__leopard.animals) a.netAt=-1e9;
    const t0=performance.now(); w.updateNetWorld(0.05,1e12+i*1000); t+=performance.now()-t0; } return t/40; });
  console.log('Gastgeber: ein Stand aller Tiere kostet '+ms.toFixed(2)+' ms');

  // B verlässt den Raum: A entfernt Ben, B kehrt in die eigene Welt zurück
  await openOnline(B); await press(B,'btnOnLeave');
  await until(A,()=>window.__leopard.remotes.size===0);
  await until(B,async()=>(await import('./src/save.js')).WORLD_SEED===2222);
  console.log('B ist zurück in der eigenen Welt');

  assert.deepEqual(errors,[],'keine Fehler in der Konsole');
  console.log('Online-Test OK');
})().catch(e=>{ console.error('FEHLER:',e); if(errors.length) console.error(errors.join('\n')); process.exitCode=1; }).finally(async()=>{ for(const b of browsers) await b.close(); if(relay) await relay.close(); server.close(); });
