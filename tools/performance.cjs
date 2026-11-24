// Local-only instrumentation; production sources and service worker stay unchanged.
const {chromium}=require('playwright');
const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const seconds=Number(process.env.PERF_SECONDS||10), software=process.env.PERF_GPU!=='hardware';
if(!Number.isFinite(seconds)||seconds<1||seconds>120) throw Error('PERF_SECONDS must be 1..120');
const width=Number(process.env.PERF_WIDTH||1280),height=Number(process.env.PERF_HEIGHT||720);
if(![width,height].every(n=>Number.isInteger(n)&&n>=160&&n<=7680))throw Error('Invalid viewport');
const quality=process.env.PERF_QUALITY||'low';
if(!['low','high','ultra'].includes(quality))throw Error('Invalid PERF_QUALITY');
const sections={'ai.js':['updateAnimal'],'chunks.js':['updateChunks'],'vegetation.js':['updateTrees'],'hud.js':['drawRadar','updateUI','updateWarn','updateCross'],'coop.js':['updateCoopHud','renderAll']};
function instrument(name,source){
  for(const fn of sections[name]||[]){
    const marker='function '+fn+'(';
    if(source.split(marker).length!==2) throw Error('Instrumentation marker changed: '+fn);
    source=source.replace(marker,'function __original_'+fn+'(');
    source+=`\nfunction ${fn}(...args){ const b=window.__bench; if(!b?.active)return __original_${fn}(...args); const t=performance.now(); try{return __original_${fn}(...args);}finally{b.cpu['${fn}']=(b.cpu['${fn}']||0)+performance.now()-t;} }\n`;
  }
  if(name==='main.js'){
    for(const marker of ['function frame(now){','  renderAll();']) if(!source.includes(marker))throw Error('Frame marker changed');
    source=source.replace('function frame(now){','function frame(now){ window.__bench.begin(now);');
    source=source.replace('  renderAll();','  renderAll(); window.__bench.end(renderer);');
    source+="\nimport {joinPlayer as benchJoin} from './coop.js'; window.__bench.modules={P,players,G,animals,renderer,H,joinPlayer:benchJoin};\n";
  }
  return source;
}
const server=http.createServer((req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    let data=fs.readFileSync(file);
    if(file.endsWith('.js'))data=instrument(path.basename(file),data.toString());
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(data);
  }catch(e){res.writeHead(404);res.end(String(e));}
});
function stats(values){const a=values.slice().sort((a,b)=>a-b);const p=q=>a[Math.max(0,Math.ceil(a.length*q)-1)]??null;return {n:a.length,median:p(.5),p95:p(.95),p99:p(.99),max:a.at(-1)??null};}
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:process.env.PERF_HEADED!=='1',args:software?['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']:[]});
 const report={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),version:fs.readFileSync(path.join(root,'src/version.js'),'utf8').trim(),host:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model},browser:browser.version(),software,seconds,viewport:{width,height},quality,autoResolution:false,seed:12345,gpuTime:'Not measured: CPU render submission is not GPU time',scenarios:[]};
 for(const scenario of ['idle-1','explore-1','animals-1','idle-2','idle-3','idle-4','pause-1']){
  console.error('Preparing',scenario);
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(quality=>{
   let seed=12345;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
   localStorage.setItem('jaguar-gfx2',quality);localStorage.setItem('jaguar-autores','0');localStorage.setItem('jaguar-save-v1',JSON.stringify({lvl:1,seed:12345}));
   window.__bench={active:false,cpu:{},rows:[],last:null,begin(now){if(!this.active)return;this.cpu={};this.interval=this.last===null?null:now-this.last;this.last=now;this.start=performance.now();this.before?.(now);},end(renderer){if(!this.active)return;this.rows.push({interval:this.interval,work:performance.now()-this.start,cpu:this.cpu,calls:renderer.info.render.calls});renderer.info.reset();}};
  },quality);
  await page.goto('http://127.0.0.1:'+server.address().port+'/?test');
  console.error('Loaded',scenario);await page.click('#btnPlay');console.error('Started',scenario);
  const setup=await page.evaluate(scenario=>{
   const {P,players,joinPlayer,G,animals,renderer,H}=window.__bench.modules;
   const count=Number(scenario.slice(-1));
   const pads=Array.from({length:count-1},(_,index)=>({index,connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}));
   navigator.getGamepads=()=>pads;for(const pad of pads)joinPlayer(pad.index,pad);
   renderer.info.autoReset=false;window.__bench.renderer=renderer;
   if(scenario==='animals-1')animals.filter(a=>!a.dead&&!a.sp.friend).forEach((a,i)=>{a.x=P.x+Math.cos(i)* (18+i%30);a.z=P.z+Math.sin(i)*(18+i%30);});
   if(scenario==='pause-1')G.paused=true;
   if(scenario==='explore-1'){let last;window.__bench.before=now=>{const dt=last===undefined?0:Math.min(.1,(now-last)/1000);last=now;P.x+=dt*18;P.y=H(P.x,P.z);P.camY=P.y;};}
   // Keep the synthetic benchmark alive without disabling AI or HUD work.
   const before=window.__bench.before;window.__bench.before=now=>{before?.(now);for(const p of players){p.hp=10000;p.L.hunger=100;p.L.thirst=100;}};
   const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {players:players.length,animals:animals.length,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  },scenario);
  if(setup.players!==Number(scenario.slice(-1)))throw Error('Player setup failed: '+scenario);
  console.error('Configured',scenario);await page.waitForTimeout(2000);
  await page.evaluate(()=>{window.__bench.renderer.info.reset();window.__bench.active=true;});
  await page.waitForTimeout(seconds*1000);
  const rows=await page.evaluate(()=>{window.__bench.active=false;return window.__bench.rows;});
  if(errors.length||rows.length<2)throw Error(scenario+': '+JSON.stringify(errors)+' frames='+rows.length);
  const names=[...new Set(rows.flatMap(r=>Object.keys(r.cpu)))];
  report.scenarios.push({name:scenario,...setup,frames:rows.length,warning:rows.length<100?'Too few frames for reliable tail percentiles':null,intervalMs:stats(rows.map(r=>r.interval).filter(v=>v!==null)),workMs:stats(rows.map(r=>r.work)),drawCalls:stats(rows.map(r=>r.calls)),cpuMs:Object.fromEntries(names.map(n=>[n,stats(rows.map(r=>r.cpu[n]||0))]))});
  console.error(scenario,JSON.stringify(report.scenarios.at(-1).intervalMs));await context.close();
 }
 const output=path.resolve(process.argv[2]||'performance-results.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(output);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
