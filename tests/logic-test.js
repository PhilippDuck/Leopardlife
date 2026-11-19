// Logiktest für LeopardLife: führt das Spielskript ohne Browser und ohne three.js aus.
// THREE, DOM und Audio werden durch Platzhalter ersetzt; geprüft wird die Spiellogik
// (Jagd, Familie, Tag/Nacht, Wetter, Ziele, Klettern, Schwierigkeit …). Aufruf: node tests/logic-test.js
// Führt das Spielskript mit Platzhaltern für THREE und DOM aus, um Laufzeitfehler (ReferenceError, TypeError) zu finden.
const fs=require('fs');
const path=require('path');
// Spielskript aus src/main.js holen; importierte Module werden eingefügt (einfacher Bündler für den Test)
function bundle(file){
  const c=fs.readFileSync(file,'utf8');
  return c.replace(/^import \{[^}]*\} from '\.\/([\w-]+\.js)';\n/mg,(m,f)=>bundle(path.join(path.dirname(file),f)).replace(/^export /mg,'')+'\n');
}
const code=bundle(path.join(__dirname,'..','src','main.js'));
function U(name){ const store={}; const f=function(){};
  return new Proxy(f,{
    get(t,k){ if(k===Symbol.toPrimitive) return ()=>0; if(k===Symbol.iterator) return function*(){}; if(k==='then') return undefined; if(!(k in store)) store[k]=U(name+'.'+String(k)); return store[k]; },
    set(t,k,v){ store[k]=v; return true; }, has(){ return false; }, apply(){ return U(name+'()'); }, construct(){ return U('new '+name); } }); }
const els={}, handlers={};
function el(id){ if(!els[id]){ els[id]=U('#'+id); els[id].id=id; if(['skills','menu','win','dead','birth','start','diffRow','sleepFx','book'].includes(id)) els[id].style.display='none'; } return els[id]; }
const ls={};
if(process.argv[2]) ls['jaguar-save-v1']=process.argv[2];
let ACs=null; const ACstub=function(){ const o=U('ac'); o.currentTime=0; o.state='running'; o.sampleRate=100; let n=0; o.createOscillator=()=>{ n++; return U('osc'); }; o.count=()=>n; ACs=o; return o; };
const win={ AudioContext:ACstub, innerWidth:1280, innerHeight:720, devicePixelRatio:1, THREE:U('THREE'), addEventListener(t,fn){ (handlers[t]=handlers[t]||[]).push(fn); } };
const doc={ querySelectorAll:()=>[], getElementById:el, addEventListener(){}, createElement(){ return U('el'); }, body:U('body'), pointerLockElement:null, exitPointerLock(){} };
let raf=null;
const g={ window:win, document:doc, navigator:{maxTouchPoints:0}, localStorage:{getItem:k=>(k in ls?ls[k]:null),setItem:(k,v)=>{ls[k]=String(v);}}, THREE:win.THREE,
  requestAnimationFrame:fn=>{ if(fn.name==='frame') raf=fn; else fn(); }, setTimeout:fn=>{ fn(); } };
const body=code.replace(/\}\)\(\);\s*$/, ';globalThis.__trees=trees;globalThis.__T={W:()=>W,startFlee,unpause:()=>{G.paused=false;},dayF:()=>dayF,fogFar:()=>scene.fog.far,ctx:()=>context(),maxHp,paused:()=>G.paused,S:()=>S,P,animals,step,updateUI,doContext,startRaid,cub,hurtPlayer,respawn,gainXp,doPounce,doClimb,doRoar,hitAnimal,toggleMenu,toggleSkills,raider:()=>G.raider,setQ:q=>{quality=q;applyQuality();},dead:()=>dead,frame};})();');
if(body===code) throw new Error('hook not inserted');
new Function(...Object.keys(g), body)(...Object.values(g));
const T=globalThis.__T; const rnd2=()=>Math.random()*8-4; const localStorageDump=()=>ls['jaguar-lines'];
els.btnPlay.onclick();
let t=1000; const run=n=>{ for(let i=0;i<n;i++){ t+=33; if(ACs) ACs.currentTime=t/1000; raf(t); } };
run(120);
const key=c=>handlers.keydown.forEach(h=>h({code:c,preventDefault(){}}));
['low','high','ultra'].forEach(q=>{ T.setQ(q); run(20); });
key('KeyW'); run(60); key('Space'); run(30); key('KeyC'); key('KeyR'); key('KeyE'); key('KeyF'); run(30);
console.log('start ok, lvl',T.S().lvl,'animals',T.animals.length);
// Stufe 8 erreichen -> Partner sichtbar
T.gainXp(5000); run(10);
console.log('lvl',T.S().lvl,'mates visible',T.animals.filter(a=>a.sp.friend&&a.g.visible===true).length,'of',T.animals.filter(a=>a.sp.friend).length);
const m=T.animals.find(a=>a.sp.friend&&a.g.visible===true); T.P.x=m.x+1; T.P.z=m.z+1; run(3); key('KeyF'); run(3);
console.log('preg',T.S().preg.toFixed(1));
run(900);
console.log('birth dialog',els.birth.style.display,'partner',T.S().partner);
els.btnStayAdult.onclick(); run(30);
console.log('cub',JSON.stringify(T.S().cub));
const famV=()=>T.animals.filter(a=>a.sp.friend).map(a=>(a.g.visible===true?'V':'-')+(a.famOn?'F':'')).join(' ');
console.log('fam bodies',famV());
const prey=T.animals.find(a=>a.sp.id==='deer'); prey.hp=1; T.hitAnimal(prey); console.log('food',T.S().food);
T.P.x=T.cub.x+1; T.P.z=T.cub.z+1; run(3); key('KeyF'); run(3);
console.log('after feed',JSON.stringify(T.S().cub),'food',T.S().food);
// Überfall: Partner verteidigt
T.P.x=150; T.P.z=150; run(5); T.startRaid(); const rd=T.raider(); console.log('raider',rd.sp.n,'hp',rd.hp);
for(let i=0;i<8;i++){ run(150); console.log(' t+'+((i+1)*5)+'s raider state',rd.state,'hp',rd.hp,'dead',rd.dead,'cub hp',T.S().cub&&T.S().cub.hp.toFixed(2),'partner',T.S().partner); }
// freiwillig ins Junge wechseln (Menü)
key('Escape'); els.btnMenuCub.onclick(); els.btnMenuCub.onclick(); run(30);
console.log('as cub: lvl',T.S().lvl,'gen',T.S().gen,'p1',T.S().p1,'p2',T.S().p2,'partner',T.S().partner,'fam',famV());
// Futterlieferung abwarten
const xp0=T.S().xp, l0=T.S().lvl; run(1800); console.log('after 60s: lvl',T.S().lvl,'xp',T.S().xp,'(was',l0,xp0+')');
// große Gefahr: Schakal jagt, Leben niedrig
const j=T.animals.find(a=>a.sp.id==='jack'&&!a.dead); T.P.x=30; T.P.z=30; j.x=48; j.z=30; j.state='chase'; j.lost=0; j.hp=j.sp.hp; T.P.hp=30;
for(let i=0;i<6;i++){ run(30); console.log(' danger t+'+(i+1)+'s jackal',j.state,'hp',j.hp,'dead',j.dead,'player hp',Math.round(T.P.hp),'dead',T.dead(),'parents',T.S().p1,T.S().p2); if(T.dead()) T.respawn(); }
// Löwe gegen Eltern
const li=T.animals.find(a=>a.sp.id==='lion'&&!a.dead); T.P.x=30; T.P.z=30; li.x=50; li.z=30; li.state='chase'; li.lost=0; li.hp=li.sp.hp;
for(let i=0;i<8;i++){ run(60); T.P.hp=30; console.log(' lion t+'+((i+1)*2)+'s',li.state,'hp',li.hp,'dead',li.dead,'parents',T.S().p1,T.S().p2); if(T.dead()) T.respawn(); }
// Tod mit Jungem
T.S().lvl=9; T.S().cub={full:80,grow:0.5,hp:1}; T.S().partner=true; run(5);
const pred=T.animals.find(a=>a.sp.id==='lion'); T.hurtPlayer(99999,pred); console.log('dead',T.dead(),'btn',els.btnRespawn.textContent);
T.respawn(); run(30);
console.log('after death: lvl',T.S().lvl,'gen',T.S().gen,'p1',T.S().p1,'p2',T.S().p2,'fam',famV());
T.hurtPlayer(99999,pred); T.respawn(); run(30);
key('Escape'); key('Escape'); key('Tab'); key('Tab'); run(10);
T.updateUI();
if(els.menu.style.display==='flex') els.btnResume.onclick();
if(els.skills.style.display!=='none') key('Tab');
// Hunger
T.S().hunger=0.3; T.S().food=0; T.P.hp=3; run(400); console.log('starve: dead',T.dead(),'|',els.deadTxt.textContent,'| btn',els.btnRespawn.textContent); if(T.dead()) T.respawn(); run(5);
console.log(' after: hunger',Math.round(T.S().hunger),'lvl',T.S().lvl);
// Beute macht satt
T.S().hunger=30; const pr2=T.animals.find(a=>a.sp.id==='hase'&&!a.dead); pr2.hp=1; T.hitAnimal(pr2); console.log('eat hare: hunger',Math.round(T.S().hunger));
// Alter mit Jungem -> Erbanlage
T.S().lvl=9; T.S().a.str=10; T.S().cub={full:80,grow:0.3,hp:1,trait:'flink'}; T.S().age=1799.8; run(30);
console.log('age death: dead',T.dead(),'|',els.deadTxt.textContent); T.respawn(); run(5);
console.log(' heir: lvl',T.S().lvl,'gen',T.S().gen,'traits',JSON.stringify(T.S().traits),'str stored',T.S().a.str,'age',Math.round(T.S().age));
// Alter ohne Junges -> Blutlinie endet
T.S().lvl=9; T.S().cub=null; T.S().age=1799.8; run(30);
console.log('lineage: dead',T.dead(),'|',els.deadTxt.textContent,'| btn',els.btnRespawn.textContent); T.respawn(); run(5);
console.log(' new line: lvl',T.S().lvl,'gen',T.S().gen,'traits',JSON.stringify(T.S().traits));
key('Tab'); key('Tab'); run(5);
els.btnMusic.onclick(); run(60); els.btnMusic.onclick(); run(60);
console.log('audio nodes created',ACs&&ACs.count());
// Klettern-Test
{ const S0=T.S(); S0.b.climb=1; if(T.dead()) T.respawn(); if(els.menu.style.display==='flex') els.btnResume.onclick();
  const tr=globalThis.__trees; let ok=0;
  for(const ti of [0,5,tr.length-1]){ const t=tr[ti]; T.P.x=t.x+1.2; T.P.z=t.z+0.8; T.P.tree=null; run(2); key('KeyE'); run(60);
    console.log('climb tree',ti,'perch y',t.perch[1].toFixed(1),'height gained',(T.P.camY-T.P.y).toFixed(1),'safe',T.P.safe); if(T.P.camY-T.P.y>2) ok++; key('KeyE'); run(40); }
  console.log('climbs ok',ok,'of 3'); }
// Tag-Nacht-Test
{ if(T.dead()) T.respawn(); if(els.menu.style.display==='flex') els.btnResume.onclick();
  const S0=T.S(); S0.tod=0.7; run(5); const d1=T.dayF(); S0.tod=0.95; run(5); const d2=T.dayF();
  console.log('dayF evening',d1.toFixed(2),'midnight',d2.toFixed(2),'fog far',T.fogFar().toFixed(0));
  S0.b.night=3; run(3); console.log(' fog far with night vision 3',T.fogFar().toFixed(0));
  // Schlafen auf dem Baum
  const t=globalThis.__trees[3]; T.P.x=t.x+1; T.P.z=t.z+1; T.P.tree=null; S0.hunger=80; run(2); key('KeyE'); run(60);
  console.log(' on tree safe',T.P.safe,'context',T.ctx()&&T.ctx().label); key('KeyF'); run(5);
  console.log(' after sleep: tod',S0.tod.toFixed(2),'hunger',Math.round(S0.hunger),'hp full',T.P.hp===T.maxHp(),'paused',T.paused());
  key('KeyE'); run(30);
  // Schwer: Tod ohne Nachwuchs ist endgültig
  S0.diff='hard'; S0.cub=null; S0.preg=0; S0.lvl=6; S0.gen=2; const pred=T.animals.find(a=>a.sp.id==='lion');
  T.hurtPlayer(99999,pred); console.log('hard death:',els.deadTxt.textContent,'| btn',els.btnRespawn.textContent);
  T.respawn(); run(5); console.log(' after: lvl',T.S().lvl,'gen',T.S().gen,'diff',T.S().diff);
  // Leicht: kein Erfahrungsverlust, weniger Schaden
  T.S().diff='easy'; T.S().xp=10; const hp0=T.P.hp; T.hurtPlayer(10,pred); console.log('easy: dmg taken',(hp0-T.P.hp).toFixed(1));
  T.hurtPlayer(99999,pred); console.log(' easy death xp',T.S().xp,'|',els.deadTxt.textContent); T.respawn(); run(5);
  // Neustart aus dem Menü -> Startbildschirm mit Schwierigkeit
  key('Escape'); els.btnRestart.onclick(); els.btnRestart.onclick(); console.log('restart: start shown',els.start.style.display,'diffRow',els.diffRow.style.display);
  els.btnPlay.onclick(); run(5); console.log(' playing again paused',T.paused());
}
// Eingabe-Test
{ const kb=()=>els.touch.style.display; handlers.pointerdown.forEach(f=>f({pointerType:'touch'})); run(2);
  console.log('after touch: touch UI',kb(),'cds',JSON.stringify(els.cds.style.display));
  handlers.keydown.forEach(f=>f({code:'KeyW',preventDefault(){}})); run(2);
  console.log('after key: touch UI',kb(),'cds',JSON.stringify(els.cds.style.display)); }
// Kadaver-Test
{ if(T.dead()) T.respawn(); for(const id of ['start','menu','skills']) els[id].style.display='none'; T.unpause();
  const S0=T.S(); S0.diff='normal'; S0.lvl=3; S0.cub=null; S0.hunger=40; const kills0=S0.kills;
  const deer=T.animals.find(a=>a.sp.id==='deer'&&!a.dead); T.P.x=deer.x+1; T.P.z=deer.z; deer.hp=1; T.hitAnimal(deer);
  console.log('deer killed: carcass',JSON.stringify(deer.carc),'hunger',Math.round(S0.hunger),'kills',S0.kills-kills0,'visible',deer.g.visible);
  const sc=T.animals.filter(a=>a.state==='scav'); console.log(' scavengers lured',sc.map(a=>a.sp.n).join(','));
  console.log(' context near carcass',T.ctx()&&T.ctx().label); key('KeyF'); run(2); console.log(' after eating: hunger',Math.round(S0.hunger),'meat left',deer.carc&&deer.carc.meat);
  T.P.x=deer.x+60; T.P.z=deer.z+60; S0.lvl=9; run(900);
  console.log(' after 30s: carcass',deer.carc?JSON.stringify(deer.carc):'gone','scav states',sc.map(a=>a.state).join(','));
  // Herde: ein Tier flieht, die anderen auch
  const h0=T.animals.find(a=>a.herd&&a.herd.length>2&&!a.dead&&a.herd.every(m=>!m.dead));
  h0.herd.forEach(m=>{ m.state='wander'; m.x=h0.x+rnd2(); m.z=h0.z+rnd2(); }); T.P.x=h0.x+80; T.P.z=h0.z; run(1);
  T.startFlee(h0); console.log('herd of',h0.herd.length,h0.sp.n,'states',h0.herd.map(m=>m.state).join(','));
  // Ahnenbuch
  els.btnBook.onclick(); console.log('book open',els.book.style.display,'html length',String(els.bookList.innerHTML).length); els.btnBookBack.onclick();
  S0.diff='hard'; S0.cub=null; S0.preg=0; const pred=T.animals.find(a=>a.sp.id==='lion'); T.hurtPlayer(99999,pred); T.respawn(); run(2);
  console.log('after lineage end: lines',localStorageDump());
}
// Wetter-Test
{ if(T.dead()) T.respawn(); for(const id of ['start','menu','skills','book']) els[id].style.display='none'; T.unpause();
  const S0=T.S(); console.log('goals',JSON.stringify(S0.goals&&S0.goals.list.map(g=>g.text)));
  const Wt=T.W(); Wt.t=0; Wt.target=0; let tries=0; while(!(Wt.target>0)&&tries<40){ Wt.t=0; run(1); tries++; }
  console.log('rain started after',tries,'tries, storm',Wt.storm); run(600); console.log(' rain level',Wt.rain.toFixed(2),'fog far',T.fogFar().toFixed(0));
  Wt.storm=true; Wt.lightT=0; run(2); console.log(' flash',Wt.flash.toFixed(2));
  // Ziele: töten zählt
  S0.goals={day:1,list:[{id:'kill',text:'Erlege 2 Beutetiere',need:2,have:0,done:false},{id:'amb',text:'Hinterhalt',need:1,have:0,done:false},{id:'climb',text:'Klettern',need:1,have:0,done:false}]};
  const xp0=S0.xp, l0=S0.lvl; for(let i=0;i<2;i++){ const pr=T.animals.find(a=>a.sp.id==='hase'&&!a.dead); pr.state='wander'; pr.hp=1; T.hitAnimal(pr); }
  console.log(' goals after 2 kills',S0.goals.list.map(g=>g.id+':'+g.have+(g.done?'✔':'')).join(' '),'xp',l0+'/'+xp0,'->',S0.lvl+'/'+S0.xp);
  S0.tod=0.24999; run(2); console.log(' new day',S0.day,'goals',S0.goals.list.map(g=>g.id).join(','));
}
console.log('ALL OK');
