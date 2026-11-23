// Integrationstest mit echtem WebGL. Benötigt Playwright und dessen Chromium.
// Aufruf: node tests/world-browser.cjs
const { chromium }=require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  fs.readFile(file,(error,data)=>{res.statusCode=error?404:200;res.end(error?'missing':data);});
});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(()=>{localStorage.setItem('jaguar-gfx2','low');localStorage.setItem('jaguar-save-v1',JSON.stringify({lvl:1,seed:12345}));});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForTimeout(1500);
 await page.click('#btnPlay');
 await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 console.log('Startbildschirm und Spiel geladen');
 const result=await page.evaluate(async()=>{
   const {P,players}=await import('./src/player.js');
   const {G}=await import('./src/state.js');
   const terrain=await import('./src/terrain.js');
   const {loadAllNow,chunks}=await import('./src/chunks.js');
   const {updateWorldContent}=await import('./src/worldcontent.js');
   const {animals}=await import('./src/animals.js');
   const {moveAnimal}=await import('./src/ai.js');
   const {S}=await import('./src/save.js');
   G.paused=true;
   let wet,dry,pond;
   for(let x=400;x<5000;x+=128)for(let z=400;z<2000;z+=128){
     if(terrain.dryness(x,z)<0.15)wet={x,z};
     if(terrain.dryness(x,z)>0.85)dry={x,z};
     pond=pond||terrain.worldPond(x,z);
   }
   if(!wet||!dry||!pond)throw Error('Landscape variety missing');
   P.x=pond.x; P.z=pond.z; loadAllNow(); updateWorldContent(2);
   if(Math.abs(terrain.H(pond.x-0.001,pond.z)-terrain.H(pond.x+0.001,pond.z))>0.01)throw Error('Water seam at chunk boundary');
   const water={inWater:terrain.inWater(P.x,P.z),rendered:terrain.streamedPonds.some(p=>p.x===P.x&&p.z===P.z),height:terrain.H(P.x,P.z),level:pond.L};
   const group=animals.filter(a=>a.world);
   if(!group.length)throw Error('No world animals');
   const a=group.find(animal=>animal.herd)||group[0], before={x:a.x,z:a.z};moveAnimal(a,1,0,5,1);
   if(Math.hypot(a.x,a.z)<=235||Math.hypot(a.x-before.x,a.z-before.z)>20)throw Error('Animal returned to old boundary');
   const huntedKey=Math.floor(before.x/64)+','+Math.floor(before.z/64);
   a.dead=true; a.carc=null; updateWorldContent(2);
   const cooldown=Object.keys(S.worldHunts||{}).length;
   const next=group.find(animal=>animal!==a&&animal.herd===a.herd);
   if(next&&a.herd){S.worldHunts[huntedKey]=Date.now()-1;next.dead=true;next.carc=null;updateWorldContent(2);
     if(S.worldHunts[huntedKey]<=Date.now())throw Error('Later kill did not renew cooldown');
   }
   const {joinPlayer,leavePlayer}=await import('./src/coop.js');
   const mate=joinPlayer(42,{buttons:[]});
   mate.x=a.x;mate.z=a.z;
   P.x=6000;P.z=6000;loadAllNow();updateWorldContent(2);
   if(!animals.includes(a))throw Error('Herd disappeared near second player');
   leavePlayer(mate);

   const counts=[];
   for(let i=0;i<3;i++){
     P.x=6000+i*800;P.z=6000;loadAllNow();updateWorldContent(2);
     counts.push({chunks:chunks.size,animals:animals.filter(a=>a.world).length,water:terrain.streamedPonds.length});
   }
   P.x=pond.x;P.z=pond.z;loadAllNow();updateWorldContent(2);
   if(animals.some(animal=>animal.world&&Math.floor(animal.x/64)+','+Math.floor(animal.z/64)===huntedKey))throw Error('Hunted herd respawned immediately');
   const countBefore=animals.length;
   updateWorldContent(2);
   if(countBefore!==animals.length)throw Error('Duplicate population');
   if(new Set(terrain.streamedPonds.map(p=>p.x+','+p.z)).size!==terrain.streamedPonds.length)throw Error('Duplicate water');
   return {wet,dry,water,cooldown,counts,waterAgain:terrain.H(P.x,P.z)};
 });
 console.log('Weltprüfung abgeschlossen');
 assert.equal(result.water.inWater,true);
 assert.equal(result.water.rendered,true);
 assert.equal(result.water.height,result.waterAgain);
 assert.ok(result.cooldown>0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify(result,null,2));
 await browser.close();server.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();server.close();process.exitCode=1;});
