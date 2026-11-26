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
      addEventListener('load',()=>{ Promise.all([import('./src/net.js'),import('./src/networld.js'),import('./src/netcoop.js'),import('./src/netfamily.js')]).then(([m,w,c,f])=>setInterval(()=>{ const now=performance.now(); m.updateNet(now); c.updateNetCoop(0.05); f.updateNetFamily(0.05,now); w.updateNetWorld(0.05,now); },50)); }); });
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
  // Teil 3: B jagt Tiere von A. Beute neben B stellen; B springt, A rechnet und schickt Treffer, Erfahrung und Kadaver
  const preyAt=(page,hp,off)=>page.evaluate(async([hp,off])=>{ const {ghosts}=await import('./src/player.js'); const {FOOD}=await import('./src/data.js'); const gh=ghosts[0];
    const a=window.__leopard.animals.find(o=>!o.dead&&!o.carc&&!o.sp.pred&&!o.sp.fight&&!o.sp.friend&&!o.sp.human&&!o.sp.croc&&!o.sp.snake&&!o.sp.hippo&&!o.sp.elephant&&!o.sp.boss&&!o.herd&&!o.juv&&(FOOD[o.sp.id]||0)>=2&&(FOOD[o.sp.id]||0)<=10&&!o.netUsed);
    a.netUsed=true; a.x=gh.x+off; a.z=gh.z+1; a.g.position.set(a.x,a.g.position.y,a.z); a.g.visible=true; a.state='wander'; a.hp=hp; a.stun=0; a.wound=null; a.held=null; a.ev=null; a.netAt=-1e9;
    return [a.nid,a.x,a.z]; },[hp,off]);
  // warten, bis B das Tier an der neuen Stelle zeigt
  const seenAt=(id,x,z)=>until(B,new Function('const a=window.__leopard.mirror.get('+id+'); return !!a&&a.g.visible&&Math.hypot(a.x-('+x+'),a.z-('+z+'))<0.2;'),20000);
  const pounceOn=(id)=>B.evaluate(id=>{ const p=window.__leopard.players[0], a=window.__leopard.mirror.get(id); p.x=a.x; p.z=a.z-0.5; p.pounce=0.3; p.hit=false; p.dead=false; },id);
  const B0=await B.evaluate(()=>{ const p=window.__leopard.players[0]; return {xp:p.L.xp,lvl:p.L.lvl,k:p.L.kills||0}; });
  const [kid,kx,kz]=await preyAt(A,1,0); await seenAt(kid,kx,kz);
  await pounceOn(kid);
  await until(A,new Function('return window.__leopard.animals.find(o=>o.nid==='+kid+').dead'),20000).catch(async e=>{
    console.log('B:',JSON.stringify(await B.evaluate(id=>{ const p=window.__leopard.players[0], a=window.__leopard.mirror.get(id); return {px:p.x,pz:p.z,pounce:p.pounce,hit:p.hit,ax:a.x,az:a.z,vis:a.g.visible,dead:a.dead}; },kid)));
    console.log('A:',JSON.stringify(await A.evaluate(async id=>{ const {ghosts}=await import('./src/player.js'); const a=window.__leopard.animals.find(o=>o.nid===id); return {gh:ghosts.map(g=>[g.peer,g.num,g.x,g.z,g.dead,g.atkD]),ax:a.x,az:a.z,hp:a.hp,held:!!a.held,dead:a.dead}; },kid)));
    throw e; });
  await until(B,()=>{ const p=window.__leopard.players[0]; return (p.L.kills||0)>0; },20000);
  const B1=await B.evaluate(()=>{ const p=window.__leopard.players[0]; return {xp:p.L.xp,lvl:p.L.lvl,k:p.L.kills||0}; });
  assert.ok(B1.k===B0.k+1&&(B1.xp!==B0.xp||B1.lvl>B0.lvl),'B bekommt die Beute angerechnet '+JSON.stringify([B0,B1]));
  // Der Kadaver liegt auch bei B; B frisst einen Bissen, A zieht ihn ab
  await until(B,new Function('const a=window.__leopard.mirror.get('+kid+'); return a&&a.carc&&a.carc.meat>0;'),20000);
  const meat0=await A.evaluate(id=>window.__leopard.animals.find(o=>o.nid===id).carc.meat,kid);
  await B.evaluate(async id=>{ const {takeMeat,updateEating}=await import('./src/carcass.js'); const p=window.__leopard.players[0], a=window.__leopard.mirror.get(id);
    p.x=a.x; p.z=a.z-1; p.tree=null; p.ctl={fw:0,rt:0}; p.L.hunger=40; takeMeat(a,false,p); updateEating(p,1); },kid);
  await until(A,new Function('return window.__leopard.animals.find(o=>o.nid==='+kid+').carc.meat==='+(meat0-1)),20000);
  console.log('B erlegt '+await A.evaluate(id=>window.__leopard.animals.find(o=>o.nid===id).sp.n,kid)+' von A: +EP bei B, Kadaver bei beiden, Bissen '+meat0+' → '+(meat0-1));
  // B packt den Kadaver und zieht ihn: A sieht ihn an der neuen Stelle
  const dragTo=await B.evaluate(async id=>{ const {carcassContext,updateDrag}=await import('./src/carcass.js'); const p=window.__leopard.players[0], a=window.__leopard.mirror.get(id);
    p.L.hunger=100; p.st=100; p.hurtT=0; const cx=carcassContext(p); cx.fn(); p.rot=0; p.x=a.x; p.z=a.z+3; p.ctl={fw:1,rt:0};
    for(let i=0;i<20;i++) updateDrag(p,0.1); return {ok:p.drag===a,x:a.x,z:a.z}; },kid);
  assert.ok(dragTo.ok,'B zieht den Kadaver');
  await until(A,new Function('const a=window.__leopard.animals.find(o=>o.nid==='+kid+'); return Math.hypot(a.x-'+dragTo.x+',a.z-'+dragTo.z+')<0.3&&a.netDrag;'),20000);
  await B.evaluate(async()=>{ const {dropCarcass}=await import('./src/carcass.js'); dropCarcass(window.__leopard.players[0]); });
  await until(A,new Function('return !window.__leopard.animals.find(o=>o.nid==='+kid+').netDrag'),20000);
  console.log('B zieht den Kadaver, A sieht ihn mitwandern');
  // Festbeißen: zähe Beute überlebt den Hinterhalt, B beißt sich fest, reißt sich los → bei A verwundet und auf der Flucht
  const [bid,bx,bz]=await preyAt(A,400,4); await seenAt(bid,bx,bz);
  await pounceOn(bid);
  await until(B,()=>!!window.__leopard.players[0].bite,20000).catch(async e=>{
    console.log('A:',JSON.stringify(await A.evaluate(async id=>{ const {ghosts}=await import('./src/player.js'); const a=window.__leopard.animals.find(o=>o.nid===id); return {sp:a.sp.id,st:a.state,hp:a.hp,held:!!a.held,dead:a.dead,x:a.x,z:a.z,gh:ghosts.map(g=>[g.x,g.z,g.dead,g.atkD])}; },bid)));
    console.log('B:',JSON.stringify(await B.evaluate(id=>{ const p=window.__leopard.players[0], a=window.__leopard.mirror.get(id); return {px:p.x,pz:p.z,hit:p.hit,pounce:p.pounce,dead:p.dead,drag:!!p.drag,ax:a&&a.x,az:a&&a.z}; },bid)));
    throw e; });
  await until(A,new Function('return !!window.__leopard.animals.find(o=>o.nid==='+bid+').held'),20000);
  await B.evaluate(async()=>{ const {endBite}=await import('./src/bite.js'); endBite(window.__leopard.players[0],true); });
  await until(A,new Function('const a=window.__leopard.animals.find(o=>o.nid==='+bid+'); return !a.held&&a.wound&&a.state==="flee";'),20000);
  console.log('B beißt sich fest, das Tier reißt sich bei A verwundet los');
  // Brüllen von B vertreibt eine Hyäne von A
  await A.evaluate(async()=>{ const {ghosts}=await import('./src/player.js'); const gh=ghosts[0], h=window.__leopard.animals.find(a=>a.sp.id==='hyena'&&!a.dead);
    h.x=gh.x+5; h.z=gh.z; h.state='wander'; h.scared=0; });
  await B.evaluate(async()=>{ const {doRoar}=await import('./src/actions.js'); const p=window.__leopard.players[0]; p.L.b.roar=1; p.rcd=0; p.dead=false; doRoar(p); });
  await until(A,()=>{ const h=window.__leopard.animals.find(a=>a.sp.id==='hyena'&&!a.dead&&a.scared>0); return !!h; },20000);
  console.log('Brüllen von B vertreibt die Hyäne bei A');

  // Koop über Geräte: B ruft (Markierung bei A), B geht zu Boden statt zu sterben, A belebt B wieder, gemeinsam schlafen
  await B.evaluate(async()=>{ const {pingMates}=await import('./src/coop.js'); pingMates(window.__leopard.players[0]); });
  await until(A,async()=>(await import('./src/coop.js')).netMates.list().some(q=>q.pingT>0),20000);
  await B.evaluate(async()=>{ const {hurtPlayer}=await import('./src/actions.js'); const p=window.__leopard.players[0]; p.safe=false; p.tree=null; p.dead=false; window.__leopard.G.paused=false;
    hurtPlayer(p.hp+50,{sp:{id:'hyena',n:'Hyäne'}},true,p); });
  const down=await B.evaluate(()=>{ const p=window.__leopard.players[0]; return {dead:p.dead,downT:p.downT,deadScreen:document.getElementById('dead').style.display}; });
  assert.ok(down.dead&&down.downT>0&&down.deadScreen!=='flex','B ist am Boden statt tot '+JSON.stringify(down));
  await until(A,async()=>(await import('./src/coop.js')).netMates.list().some(q=>q.downT!=null),20000);
  // A stellt sich daneben und hält die Aktionstaste; beide Geräte rechnen ihr Koop-Bild (ohne Hauptschleife von Hand)
  await A.evaluate(async()=>{ const {netMates}=await import('./src/coop.js'); const q=netMates.list()[0], P=window.__leopard.players[0]; P.dead=false; P.x=q.x+1; P.z=q.z; P.ctl.act=true;
    window.__coopT=setInterval(async()=>(await import('./src/coop.js')).updateCoop(0.1),100); });
  await B.evaluate(()=>{ window.__coopT=setInterval(async()=>(await import('./src/coop.js')).updateCoop(0.1),100); });
  await until(B,()=>!window.__leopard.players[0].dead,30000);
  await A.evaluate(()=>{ clearInterval(window.__coopT); window.__leopard.players[0].ctl.act=false; }); await B.evaluate(()=>clearInterval(window.__coopT));
  console.log('Koop online: B ruft A, B geht zu Boden, A belebt B wieder');
  // Gemeinsames Festbeißen: A hat sich festgebissen, B springt dazu – die Hilfe zählt bei A
  await A.evaluate(()=>{ const L=window.__leopard, P=L.players[0], a=L.animals.find(o=>!o.dead&&!o.sp.friend); P.dead=false; P.bite={a,n:3,combo:0,round:0,pos:0.5,dir:1,speed:1,scores:[],idle:0}; });
  await until(B,async()=>(await import('./src/coop.js')).netMates.list().some(q=>q.biting),20000);
  await B.evaluate(async()=>{ const {netMates}=await import('./src/coop.js'); const {assistBite}=await import('./src/bite.js'); const q=netMates.list()[0], P=window.__leopard.players[0]; P.dead=false; P.x=q.x+1; P.z=q.z; assistBite(P); });
  await until(A,()=>window.__leopard.players[0].bite.help>0,20000);
  await A.evaluate(()=>{ window.__leopard.players[0].bite=null; });
  console.log('B hilft beim Festbeißen von A: +5 % bei A');
  // Familie der anderen: A hat einen Partner am Bau – B sieht ihn an derselben Stelle
  const famAt=await A.evaluate(async()=>{ const {fam}=await import('./src/kin.js'); const S=window.__leopard.S, P=window.__leopard.players[0], a=fam[0];
    S.partner=true; a.famOn=true; a.dead=false; a.x=P.x+3; a.z=P.z; a.g.position.set(a.x,a.g.position.y,a.z); a.g.visible=true; return [a.x,a.z]; });
  await until(B,new Function('return (async()=>{ const {famShown}=await import("./src/netfamily.js"); return [...famShown.values()].some(e=>e.g&&e.g.visible&&Math.hypot(e.g.position.x-('+famAt[0]+'),e.g.position.z-('+famAt[1]+'))<0.3); })()'),20000);
  console.log('B sieht den Partner von A am Bau');
  // Paaren über Geräte: beide ausgewachsen, nicht verwandt – jeder bekommt einen Wurf mit beiden als Eltern
  for(const pg of [A,B]) await pg.evaluate(()=>{ const S=window.__leopard.S, P=window.__leopard.players[0]; S.lvl=Math.max(S.lvl,8); S.preg=0; S.cub=null; P.dead=false; });
  for(const pg of [A,B]) await until(pg,async()=>(await import('./src/coop.js')).netMates.list().some(q=>q.L.id&&q.L.lvl>=8&&!q.busy),20000);   // beide kennen den anderen schon als ausgewachsen
  const idA=await A.evaluate(()=>window.__leopard.S.id), idB=await B.evaluate(()=>window.__leopard.S.id);
  await B.evaluate(async()=>{ const {netMates}=await import('./src/coop.js'); const {pairPlayers}=await import('./src/kinship.js'); const q=netMates.list()[0], P=window.__leopard.players[0]; P.x=q.x+1; P.z=q.z; pairPlayers(P,q); });
  const diag=pg=>pg.evaluate(async()=>{ const {netMates}=await import('./src/coop.js'); const {canPair,related}=await import('./src/kinship.js'); const {kidOf}=await import('./src/cubfollow.js'); const q=netMates.list()[0], P=window.__leopard.players[0], S=window.__leopard.S;
    return {can:canPair(P,q),rel:related(P.L,q.L),qL:q.L,busy:q.busy,qdead:q.dead,lvl:P.L.lvl,dead:P.dead,kid:!!kidOf(P),preg:S.preg,id:S.id,toast:document.getElementById('toast').textContent}; });
  await until(A,()=>window.__leopard.S.preg>0,20000).catch(async e=>{ console.log('A:',JSON.stringify(await diag(A))); console.log('B:',JSON.stringify(await diag(B))); throw e; });
  await until(B,()=>window.__leopard.S.preg>0,20000);
  const lpA=await A.evaluate(()=>window.__leopard.S.litterParents), lpB=await B.evaluate(()=>window.__leopard.S.litterParents);
  assert.deepEqual([...lpA].sort(),[idA,idB].sort(),'Wurf bei A mit beiden Eltern'); assert.deepEqual([...lpB].sort(),[idA,idB].sort(),'Wurf bei B mit beiden Eltern');
  for(const pg of [A,B]) await pg.evaluate(()=>{ const S=window.__leopard.S; S.preg=0; S.litterParents=null; S.partner=false; });
  console.log('A und B haben sich gepaart: Wurf auf beiden Geräten');
  // Gemeinsam schlafen: beide sicher auf einem Baum, nachts; B will zuerst, dann A – die Nacht vergeht für beide
  await A.evaluate(()=>{ window.__leopard.S.tod=0.9; });
  await until(B,()=>Math.abs(window.__leopard.S.tod-0.9)<0.02,20000);
  const day0=await B.evaluate(()=>window.__leopard.S.day||0);
  await B.evaluate(async()=>{ const {sleepOnTree}=await import('./src/daynight.js'); const p=window.__leopard.players[0]; p.tree=0; p.safe=true; p.climbT=1; sleepOnTree(p); });
  await until(A,async()=>(await import('./src/coop.js')).netMates.list().some(q=>q.wantSleep),20000);
  await A.evaluate(async()=>{ const {sleepOnTree}=await import('./src/daynight.js'); const p=window.__leopard.players[0]; p.tree=0; p.safe=true; p.climbT=1; sleepOnTree(p); });
  await until(B,new Function('const S=window.__leopard.S; return (S.day||0)>'+day0+'&&S.tod>0.25&&S.tod<0.4;'),20000);
  await wait(2500); assert.equal(await B.evaluate(()=>window.__leopard.S.day),day0+1,'genau ein neuer Tag bei B');
  await until(A,()=>{ const S=window.__leopard.S; return S.tod>0.25&&S.tod<0.4; },20000);
  await A.evaluate(()=>{ const p=window.__leopard.players[0]; p.tree=null; p.safe=false; window.__leopard.G.paused=false; });
  await B.evaluate(()=>{ const p=window.__leopard.players[0]; p.tree=null; p.safe=false; window.__leopard.G.paused=false; });
  console.log('Gemeinsam geschlafen: neuer Tag bei A und B (Tag '+day0+' → '+await B.evaluate(()=>window.__leopard.S.day)+')');

  // Pause beim Gastgeber: Mit Gast im Raum laufen die Tiere weiter, der eigene Leopard von A ist sicher
  const paused=await A.evaluate(async()=>{ const L=window.__leopard, {hurtPlayer}=await import('./src/actions.js');
    const a=L.animals.find(o=>!o.dead&&!o.sp.friend&&!o.held&&!o.sp.croc&&!o.sp.snake&&!o.carc&&o.g);
    a.state='flee'; a.fleeT=0; a.stun=0; a.wound=null; a.ev=null; const x0=a.x, z0=a.z;
    L.G.paused=true; const t0=performance.now(); L.frame(t0); L.frame(t0+50); L.frame(t0+100); L.frame(t0+150);
    const hp=L.players[0].hp; hurtPlayer(10,a,false,L.players[0]);
    const r={moved:Math.hypot(a.x-x0,a.z-z0),safe:L.players[0].hp===hp}; L.G.paused=false; return r; });
  assert.ok(paused.moved>0.1,'Tiere laufen in der Pause des Gastgebers weiter ('+paused.moved+' m)');
  assert.ok(paused.safe,'Leopard des Gastgebers ist in der Pause sicher');
  console.log('Pause bei A: Tiere laufen weiter ('+paused.moved.toFixed(1)+' m), A ist sicher');
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
