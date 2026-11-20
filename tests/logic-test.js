// Logiktest für LeopardLife: führt das Spielskript ohne Browser und ohne three.js aus.
require('./check-imports.js');
require('./check-names.js');
require('./typecheck.js');
// THREE, DOM und Audio werden durch Platzhalter ersetzt; geprüft wird die Spiellogik
// (Jagd, Familie, Tag/Nacht, Wetter, Ziele, Klettern, Schwierigkeit …). Aufruf: node tests/logic-test.js
// Führt das Spielskript mit Platzhaltern für THREE und DOM aus, um Laufzeitfehler (ReferenceError, TypeError) zu finden.
const fs=require('fs');
const path=require('path');
// Spielskript aus src/main.js holen; importierte Module werden eingefügt (einfacher Bündler für den Test)
const included=new Set();
function bundle(file){
  if(included.has(file)) return '';
  included.add(file);
  const c=fs.readFileSync(file,'utf8');
  return c.replace(/^import \{[^}]*\} from '\.\/([\w-]+\.js)';\n/mg,(m,f)=>bundle(path.join(path.dirname(file),f)))
          .replace(/^export \{[^}]*\};?\n?/mg,'').replace(/^export /mg,'');
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
const body=code+'\n;globalThis.__trees=trees;globalThis.__T={G,W:()=>W,startFlee,unpause:()=>{G.paused=false;},dayF:()=>dayF,fogFar:()=>scene.fog.far,ctx:()=>context(),maxHp,paused:()=>G.paused,S:()=>S,P,animals,step,updateUI,doContext,startRaid,cub,hurtPlayer,respawn,gainXp,doPounce,doClimb,doRoar,hitAnimal,toggleMenu,toggleSkills,resetSkills,startBite,biteHit,cubFollowContext,cubLearn,updateFollowers,followers,learnOf,canSwitch,woundTick,forgetWounds,resetMates,inheritTrait,goalEvent,newGoals,togglePounce,pounceRun,raider:()=>G.raider,setQ:q=>{quality=q;applyQuality();},dead:()=>P.dead,frame,makePlayer,players,stepPlayer,readControls,updateCoop,hurtPlayer,copyLeopard,maxHpOf:maxHp,related,canPair,pairPlayers,mateBecomeCub,updateCub,becomeCub,ensureKin,newId,warnArrows,updateFamily,fam,mateContext,mateContextInfo,makeCarcass,takeMeat,updateEating,carcassContext,updateDrag,carcassToTree,nearCarcass,endCarcass,updateCoopHud,sleepOnTree,sleepingNow:()=>sleeping};';
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
// Zustand prüfen: Kein Zahlenwert in G darf NaN sein (z. B. ein Zähler im falschen Objekt)
{ const bad=Object.keys(T.G).filter(k=>typeof T.G[k]==='number'&&isNaN(T.G[k]));
  if(bad.length){ console.log('FEHLER: NaN in G:',bad.join(',')); process.exit(1); }
  console.log('G geprüft:',Object.keys(T.G).length,'Felder, birdT =',T.G.birdT.toFixed(1)); }
// Zweiter Leopard: unabhängig von Spieler 1 steuerbar, bewegbar und verletzbar (Grundlage für Splitscreen)
{ const P=T.P; T.unpause(); if(P.dead) T.respawn();
  const Q=T.makePlayer({source:'test',x:40,z:-40,fur:null}); T.players.push(Q);
  const before={px:P.x,pz:P.z,php:P.hp,qx:Q.x,qz:Q.z};
  Q.ctl.fw=1; Q.ctl.rt=0; Q.ctl.sprint=false; Q.cam.yaw=0;
  for(let i=0;i<30;i++){ T.readControls(Q,1/30); T.stepPlayer(Q,1/30); }
  const qd=Math.hypot(Q.x-before.qx,Q.z-before.qz);
  if(!(qd>2)) { console.log('FEHLER: zweiter Spieler bewegt sich nicht',qd); process.exit(1); }
  if(Q.ctl.fw!==1) { console.log('FEHLER: Steuerung des zweiten Spielers überschrieben'); process.exit(1); }
  if(P.x!==before.px||P.z!==before.pz) { console.log('FEHLER: Spieler 1 hat sich mitbewegt'); process.exit(1); }
  Q.st=100; Q.pcd=0; T.doPounce(Q); if(!(Q.pounce>0)||P.pounce>0) { console.log('FEHLER: Sprung des zweiten Spielers'); process.exit(1); }
  const hp0=Q.hp; T.hurtPlayer(3,{sp:{id:'jack',n:'Schakal'}},true,Q);
  if(!(Q.hp<hp0)||P.hp!==before.php) { console.log('FEHLER: Schaden landet beim falschen Spieler'); process.exit(1); }
  if(Q.cam===P.cam||Q.ctl===P.ctl) { console.log('FEHLER: Spieler teilen Kamera oder Steuerung'); process.exit(1); }
  console.log('zweiter Spieler: bewegt',qd.toFixed(1),'m, Sprung ok, Schaden',(hp0-Q.hp).toFixed(1),'nur bei ihm');
  T.players.pop(); }
// Koop: am Boden, Wiederbeleben durch Mitspieler, Erwachen im Bau, alle am Boden = Tod wie im Einzelspiel
{ const P=T.P; if(P.dead) T.respawn(); T.unpause();
  const Q=T.makePlayer({source:'test',x:P.x+1,z:P.z,fur:null}); T.players.push(Q);
  const lion={sp:{id:'lion',n:'Löwe',hunt:99}};
  T.hurtPlayer(9999,lion,true,Q);
  if(!Q.dead||!(Q.downT>0)||P.dead||T.G.paused) { console.log('FEHLER: Mitspieler sollte am Boden liegen, Spiel weiterlaufen'); process.exit(1); }
  P.ctl.act=true; for(let i=0;i<40;i++) T.updateCoop(0.1); P.ctl.act=false;
  if(Q.dead||!(Q.hp>0)) { console.log('FEHLER: Wiederbeleben hat nicht geklappt'); process.exit(1); }
  T.hurtPlayer(9999,lion,true,Q); for(let i=0;i<620;i++) T.updateCoop(0.1);
  if(Q.dead||Math.hypot(Q.x-2,Q.z-2)>0.01) { console.log('FEHLER: Erwachen im Bau nach Ablauf'); process.exit(1); }
  T.hurtPlayer(9999,lion,true,P); for(let i=0;i<3;i++){ T.updateCoop(0.1); T.updateCoopHud(0.1); } T.hurtPlayer(9999,lion,true,Q);
  if(!P.dead||!T.G.paused) { console.log('FEHLER: alle am Boden sollte das Todesfenster öffnen'); process.exit(1); }
  T.respawn();
  if(P.dead||Q.dead) { console.log('FEHLER: nach dem Neuerwachen sollten alle stehen'); process.exit(1); }
  for(let i=0;i<3;i++) T.updateCoopHud(0.1);
  if(String(el('crossMsg').style.opacity)!=='0'||P.downT!=null) { console.log('FEHLER: Hinweis Am Boden bleibt nach dem gemeinsamen Tod stehen'); process.exit(1); }
  console.log('Koop: am Boden, Wiederbeleben, Bau, gemeinsamer Tod ok');
  T.players.pop(); T.unpause(); }
// Gemeinsames Spiel: Erfahrung wird geteilt (beide steigen auf), Eigenschaften bleiben je Leopard getrennt
{ const P=T.P, S=T.S(); const lv=S.lvl, str=S.a.str, keep={lvl:S.lvl,xp:S.xp,pts:S.pts};
  const Q=T.makePlayer({source:'test',x:P.x+3,z:P.z,fur:null,L:T.copyLeopard(S)}); T.players.push(Q);
  T.gainXp(5000,Q);
  if(!(Q.L.lvl>lv)||!(S.lvl>lv)) { console.log('FEHLER: Erfahrung sollte im gemeinsamen Spiel geteilt werden',Q.L.lvl,S.lvl); process.exit(1); }
  Q.L.a.str++;
  if(Q.L.a===S.a||S.a.str!==str) { console.log('FEHLER: Mitspieler teilt Eigenschaften mit Spieler 1'); process.exit(1); }
  console.log('Erfahrung geteilt: Spieler 2 Stufe',Q.L.lvl,'· Spieler 1 Stufe',S.lvl,'· Eigenschaften getrennt');
  Object.assign(S,keep); P.hp=Math.min(P.hp,T.maxHp()); T.players.pop(); }
// Familie im gemeinsamen Spiel: Fremde paaren sich, Wurf mit einem Jungen je Spieler, danach sind die Jungen Geschwister
{ const P=T.P, S=T.S(); if(P.dead) T.respawn(); T.unpause();
  // Grundregeln der Verwandtschaft
  const a={id:'a',parents:[]}, b={id:'b',parents:[]}, c1={id:'c1',parents:['a','b']}, c2={id:'c2',parents:['a','x']};
  if(T.related(a,b)||!T.related(a,c1)||!T.related(c1,c2)||T.related(b,c2)) { console.log('FEHLER: Verwandtschaftsregeln'); process.exit(1); }
  S.cub=null; S.preg=0; S.lvl=8;
  const Q=T.makePlayer({source:'test',x:P.x+1,z:P.z,fur:null,L:T.ensureKin(Object.assign(T.copyLeopard(S),{id:T.newId(),parents:[],lvl:8}))}); Q.num=2; S.mates[2]=Q.L; T.players.push(Q);
  if(!T.canPair(P,Q)) { console.log('FEHLER: Fremde sollten sich paaren können'); process.exit(1); }
  T.pairPlayers(P,Q); if(!(S.preg>0)) { console.log('FEHLER: keine Trächtigkeit nach Paarung'); process.exit(1); }
  const pId=S.id, qId=Q.L.id;
  for(let i=0;i<40&&!S.cub;i++) T.updateCub(1); T.unpause(); el('birth').style.display='none';
  if(!S.cub||S.cub.n!==2||S.cub.parents.join()!==[pId,qId].join()) { console.log('FEHLER: Wurf',JSON.stringify(S.cub)); process.exit(1); }
  const gen0=S.gen||1;
  if(T.mateBecomeCub(Q)){ console.log('FEHLER: Wechsel ins Junge vor halbstark'); process.exit(1); }
  S.cub.grow=0.5;
  if(!T.mateBecomeCub(Q)||S.cub.n!==1||Q.L.gen!==gen0+1||Q.L.parents.join()!==[pId,qId].join()) { console.log('FEHLER: Mitspieler als Junges',JSON.stringify(Q.L)); process.exit(1); }
  T.becomeCub(true);
  if(S.cub||S.gen!==gen0+1||!T.related(S,Q.L)||S.id===pId) { console.log('FEHLER: Spieler 1 als Junges / Geschwister'); process.exit(1); }
  S.lvl=8; Q.L.lvl=8;
  if(T.canPair(P,Q)) { console.log('FEHLER: Geschwister dürfen sich nicht paaren'); process.exit(1); }
  console.log('Familie: Fremde paaren sich, Wurf mit 2 Jungen, beide als Junge (Generation',S.gen+'), jetzt Geschwister – keine Paarung');
  T.players.pop(); delete S.mates[2]; }
// Warnpfeile je Spieler: ein Raubtier, das Spieler 2 jagt, warnt nur Spieler 2
{ const P=T.P; if(P.dead) T.respawn(); T.unpause();
  const Q=T.makePlayer({source:'test',x:P.x+30,z:P.z,fur:null,L:T.copyLeopard(T.S())}); T.players.push(Q);
  const a=T.animals.find(o=>!o.dead&&o.sp.fight&&!o.sp.friend); const st=[a.state,a.tgt,a.x,a.z];
  a.state='chase'; a.tgt=Q; a.x=Q.x+10; a.z=Q.z;
  const ring={appendChild(){}}, wP=T.warnArrows(P,ring,[],100), wQ=T.warnArrows(Q,ring,[],100);
  [a.state,a.tgt,a.x,a.z]=st;
  if(wP.top===a||wQ.top!==a) { console.log('FEHLER: Warnung beim falschen Spieler'); process.exit(1); }
  console.log('Warnpfeile: '+a.sp.n+' jagt Spieler 2 → nur Spieler 2 gewarnt');
  T.players.pop(); }
// Elterntiere versorgen auch ein Mitspieler-Junges (Spieler 1 ist erwachsen)
{ const P=T.P, S=T.S(); if(P.dead) T.respawn(); T.unpause(); const keep=[S.p1,S.lvl];
  S.p1=true; S.lvl=9;
  const Q=T.makePlayer({source:'test',x:P.x+5,z:P.z,fur:null,L:Object.assign(T.copyLeopard(S),{lvl:2,hunger:20})}); T.players.push(Q);
  T.fam.forEach(f=>{ f.feeding=false; f.feedFor=null; });
  for(let i=0;i<300&&!T.fam.some(f=>f.feeding);i++) T.updateFamily(1);
  const f=T.fam.find(f=>f.feeding), ok=!!f&&f.feedFor===Q;
  [S.p1,S.lvl]=keep; T.players.pop(); T.fam.forEach(x=>{ x.feeding=false; x.feedFor=null; });
  if(!ok) { console.log('FEHLER: Elterntier sollte zum Mitspieler-Jungen laufen'); process.exit(1); }
  console.log('Elterntiere: Futter für das Mitspieler-Junge unterwegs'); }
// Ahnenbuch zeigt Mitspieler mit Verwandtschaft zu Spieler 1
{ const S=T.S(); const keep=S.mates; S.mates={2:Object.assign(T.copyLeopard(S),{id:'m2',parents:[]})};
  el('btnBook').onclick(); const html=String(el('bookList').innerHTML); S.mates=keep; el('book').style.display='none';
  if(html.indexOf('Spieler 2')<0||html.indexOf('nicht verwandt mit Spieler 1')<0) { console.log('FEHLER: Ahnenbuch ohne Mitspieler'); process.exit(1); }
  console.log('Ahnenbuch: Mitspieler mit Verwandtschaft eingetragen'); }
// Schleichen + Sprint gehalten: es wird gesprintet, nach dem Loslassen wieder geschlichen
{ const P=T.P; const run=(spr)=>{ const Q=T.makePlayer({source:'test',x:60,z:-60,fur:null}); Q.sneak=true; Q.cam.yaw=0; Q.ctl.fw=1; Q.ctl.rt=0; Q.ctl.sprint=spr;
    const x0=Q.x,z0=Q.z; for(let i=0;i<20;i++) T.stepPlayer(Q,1/30); const d=Math.hypot(Q.x-x0,Q.z-z0); Q.ctl.sprint=false; T.stepPlayer(Q,1/30); return [d,Q.sneak]; };
  const [ds]=run(false), [dr,still]=run(true);
  if(!(dr>ds*2)||!still) { console.log('FEHLER: Sprint aus dem Schleichen',ds.toFixed(2),dr.toFixed(2),still); process.exit(1); }
  console.log('Schleichen+Sprint: '+dr.toFixed(1)+' m statt '+ds.toFixed(1)+' m, danach wieder Schleichen'); }
// Mitspieler können an einem Kadaver fressen, den ein anderer gerissen hat
{ const P=T.P; if(P.dead) T.respawn(); T.unpause();
  const Q=T.makePlayer({source:'test',x:P.x+40,z:P.z,fur:null,L:Object.assign(T.copyLeopard(T.S()),{hunger:30})}); T.players.push(Q);
  const a=T.animals.find(o=>!o.dead&&!o.sp.friend&&(o.sp.id==='deer'||o.sp.size>0.8))||T.animals.find(o=>!o.dead&&!o.sp.friend);
  const keep=[a.x,a.z,a.dead,a.carc]; a.dead=true; a.x=Q.x+1; a.z=Q.z; T.makeCarcass(a,4);
  const orbs=a.carc.orbs?4:0;
  const info=T.mateContextInfo(Q); T.mateContext(Q); Q.ctl.fw=Q.ctl.rt=0;
  for(let i=0;i<3;i++) T.updateEating(Q,0.75); const fed=Q.L.hunger, left=a.carc.meat;
  // ein zweiter Spieler frisst am selben Kadaver mit
  P.x=a.x-1; P.z=a.z; const h1=P.L.hunger=50; T.takeMeat(a,false,P); P.ctl.fw=P.ctl.rt=0; T.updateEating(P,0.75);
  const both=P.L.hunger>h1&&a.carc.meat===left-1;
  // laufen bricht das Fressen ab
  Q.ctl.fw=1; T.updateEating(Q,0.75); const stopped=Q.eatC==null; Q.ctl.fw=0; P.eatC=null;
  T.endCarcass(a); a.carc=keep[3]; a.dead=keep[2]; a.x=keep[0]; a.z=keep[1]; T.players.pop();
  if(!info||!/^Fressen/.test(info.label)||orbs!==4||fed!==60||left!==1||!both||!stopped) { console.log('FEHLER: Kadaver-Bissen',info,orbs,fed,left,both,stopped); process.exit(1); }
  console.log('Kadaver: 4 Kugeln, Spieler 2 frisst 3 Bissen ('+fed+' % satt), Spieler 1 frisst mit, Laufen bricht ab'); }
// Gemeinsam schlafen: erst wenn alle wollen (zuletzt im Test, weil der Schlaf das Spiel kurz anhält)
{ const P=T.P, S=T.S(); if(P.dead) T.respawn(); T.unpause(); S.tod=0.9;
  const Q=T.makePlayer({source:'test',x:P.x+3,z:P.z,fur:null,L:T.copyLeopard(S)}); Q.num=2; T.players.push(Q);
  for(const [p,i] of [[P,0],[Q,1]]){ p.tree=i; p.safe=true; p.climbT=1; }
  T.sleepOnTree(P);
  if(T.sleepingNow()||!P.wantSleep) { console.log('FEHLER: Spieler 1 sollte auf Spieler 2 warten'); process.exit(1); }
  const info=T.mateContextInfo(Q); T.mateContext(Q);
  if(!(Math.abs(S.tod-0.27)<0.01)) { console.log('FEHLER: Schlaf sollte beginnen, wenn beide wollen',info,S.tod); process.exit(1); }
  console.log('Schlafen: Spieler 1 wartet, Spieler 2 wählt „'+info.label+'" → beide schlafen bis zum Morgen');
  for(const p of [P,Q]){ p.tree=null; p.safe=false; } }
{ const P=T.P, L=P.L; P.dead=false; P.skOpen=false; if(T.paused()) T.unpause(); L.pts=5; const a0=L.a.str, b0=L.b.nose;
  P.skSnap={a:{...L.a},b:{...L.b}}; L.a.str++; L.pts--; L.b.nose++; L.pts-=2; L.pts+=2; /* zwischendurch neu verdient */
  T.resetSkills(P,null);
  if(L.a.str!==a0||L.b.nose!==b0||L.pts!==7){ console.log('FEHLER: Zurücksetzen',L.a.str,a0,L.b.nose,b0,L.pts); process.exit(1); }
  T.resetSkills(P,null); if(L.pts!==7){ console.log('FEHLER: doppeltes Zurücksetzen erstattet erneut'); process.exit(1); }
  console.log('Entwicklung: Auswahl zurückgesetzt, 3 Punkte erstattet, neu verdiente bleiben'); }
{ const S=T.S(), F=T.fam; const savedCub=S.cub, savedFur=S.fur;
  S.fur={albino:false,melan:false,l:0.71,s:1,sn:1,ss:1}; S.partner=true; F[0].famOn=true; F[0].fur={albino:false,melan:true,l:0.9,s:1,sn:1,ss:1};
  S.cub={full:70,grow:1,hp:1,n:2,gen:(S.gen||1)+1,parents:[S.id,'x'],fur:{albino:false,melan:false,l:1,s:1,sn:1,ss:1}};
  T.becomeCub(true);
  const ok=F[1].fur.l===0.71&&F[2].fur.melan===true&&!F[1].fur.albino&&S.famFur&&S.famFur[1].l===0.71;
  if(!ok){ console.log('FEHLER: Elterntiere haben falsches Fell',F[1].fur,F[2].fur); process.exit(1); }
  console.log('Elterntiere behalten ihr Fell: altes Ich und Partner'); }
{ const S=T.S(), sv=[S.anc,S.id,S.parents,S.mates];
  S.anc=[{i:'G1',p:[]},{i:'G2',p:[]},{i:'C1',p:['G1','G2']},{i:'C2',p:['G1','G2']},{i:'X',p:[]},{i:'Y',p:[]}]; S.id='zz'; S.parents=[]; S.mates={};
  const L=(id,p)=>({id,parents:p}), cousinA=L('K1',['C1','X']), cousinB=L('K2',['C2','Y']);
  const r=[T.related(cousinA,cousinB), T.related(L('C2',['G1','G2']),cousinA), T.related(L('G1',[]),cousinA), T.related(L('C1',['G1','G2']),L('C2',['G1','G2']))];
  S.anc=sv[0]; S.id=sv[1]; S.parents=sv[2]; S.mates=sv[3];
  if(r.join()!=='false,true,true,true'){ console.log('FEHLER: Verwandtschaft',r); process.exit(1); }
  console.log('Verwandtschaft: Cousins dürfen, Tante/Neffe, Großeltern und Geschwister nicht'); }
{ const P=T.P, Q=T.makePlayer({source:'test',x:P.x+5,z:P.z,fur:null}); Q.num=2;
  const a0=T.pounceRun(P); T.togglePounce(Q);
  Q.rot=0.7; Q.cam.yaw=2.2; Q.pcd=0; Q.pounce=0; Q.st=100; Q.dead=false; T.unpause(); T.doPounce(Q);
  const ok=T.pounceRun(Q)!==a0&&T.pounceRun(P)===a0&&(T.pounceRun(Q)?Math.abs(Q.rot-0.7)<1e-9:Math.abs(Q.rot-0.7)>0.01);
  T.togglePounce(Q);
  if(!ok){ console.log('FEHLER: Sprungrichtung je Spieler',T.pounceRun(P),T.pounceRun(Q),Q.rot); process.exit(1); }
  console.log('Sprungrichtung: jeder Spieler stellt sie für sich ein'); }
{ const P=T.P, a=T.animals.find(o=>o.sp.id==='deer'&&!o.dead)||T.animals.find(o=>o.sp.id==='anti'&&!o.dead);
  const keep=[a.x,a.z,a.dead,a.carc,a.state]; a.dead=true; a.x=P.x+1.2; a.z=P.z; T.makeCarcass(a,5);
  P.L.hunger=95; P.dead=false; P.tree=null; P.drag=null; P.eatC=null; P.ctl.fw=P.ctl.rt=0; P.st=100; P.hurtT=0;
  const c1=T.carcassContext(P); c1&&c1.fn(); const grabbed=P.drag===a;
  P.ctl.fw=1; T.updateDrag(P,0.5); P.ctl.fw=0; const drained=P.st<100;
  T.carcassToTree(P,0); P.tree=0; P.climbT=1;
  const inTree=a.carc.tree===0&&P.drag==null, reach=T.nearCarcass(P)===a; P.tree=null; const unreach=T.nearCarcass(P)!==a;
  T.endCarcass(a); a.carc=keep[3]; a.dead=keep[2]; a.x=keep[0]; a.z=keep[1]; a.state=keep[4];
  if(!c1||!/packen/.test(c1.label)||!grabbed||!drained||!inTree||!reach||!unreach){ console.log('FEHLER: Beute ziehen',c1&&c1.label,grabbed,drained,inTree,reach,unreach); process.exit(1); }
  console.log('Beute ziehen: packen, Ausdauer sinkt, mit in den Baum, nur von oben erreichbar'); }
{ const S=T.S(), P=T.P; const pts0=P.L.pts, keep=[S.goals,S.goalStreak];
  S.goalStreak=2; S.goals={day:S.day,list:[{id:'roar',text:'a',need:1,have:0,done:false,xp:1},{id:'treeEat',text:'b',need:1,have:0,done:false,xp:1},{id:'stalk',text:'c',need:3,have:0,done:false,xp:1}]};
  T.goalEvent('roar',1); T.goalEvent('treeEat',1); T.goalEvent('stalk',1); T.goalEvent('stalk',1); const mid=P.L.pts; T.goalEvent('stalk',1);
  const got=P.L.pts-pts0, streak=S.goalStreak;
  S.goals.list[0].done=false; T.newGoals(); const reset=S.goalStreak;
  P.L.pts=pts0; S.goals=keep[0]; S.goalStreak=keep[1];
  if(mid!==pts0||got!==2||streak!==3||reset!==0){ console.log('FEHLER: Tagesziele-Bonus',mid,pts0,got,streak,reset); process.exit(1); }
  console.log('Tagesziele: alle drei → Punkt, dritter Serientag → 2 Punkte, verpasster Tag → Serie 0'); }
{ const S=T.S(), keep=[S.traits.slice(),Object.assign({},S.tlv||{})];
  S.traits=['zaeh']; S.tlv={}; const h1=T.maxHp(); T.inheritTrait(S,'zaeh'); const h2=T.maxHp(); const lv2=S.tlv.zaeh;
  T.inheritTrait(S,'flink'); T.inheritTrait(S,'nase'); T.inheritTrait(S,'lunge'); const drop=S.traits.join(), gone=S.tlv.zaeh;
  S.traits=keep[0]; S.tlv=keep[1];
  if(lv2!==2||!(h2>h1)||drop!=='flink,nase,lunge'||gone!==undefined){ console.log('FEHLER: Erbanlagen',lv2,h1,h2,drop,gone); process.exit(1); }
  console.log('Erbanlagen: doppelte werden verstärkt (mehr Leben), höchstens drei'); }
{ const P=T.P, a=T.animals.find(o=>o.sp.id==='anti'&&!o.dead)||T.animals.find(o=>o.sp.id==='deer'&&!o.dead), keep=[a.x,a.z,a.hp,a.state];
  P.dead=false; P.bite=null; a.held=null; a.wound=null;
  T.startBite(P,a,20); const held=a.held===P&&!!P.bite, n=P.bite.n;
  for(let i=0;i<n;i++){ P.bite.pos=0.27; T.biteHit(P); }   // mittelmäßig: kein sicherer Treffer
  const r1=a.dead?'tot':a.wound?'verwundet':'?';
  let died=false; if(a.wound&&a.wound.die){ T.woundTick(a,a.wound.die+1); const weak=a.weak&&a.hp===1&&a.stun>0&&!a.dead; a.state='wander'; T.hitAnimal(a,P); died=weak&&a.dead&&!!a.carc; a.weak=false; a.stun=0; a.g.rotation.z=0; }
  if(a.carc) T.endCarcass(a); a.dead=false; a.x=keep[0]; a.z=keep[1]; a.hp=keep[2]; a.state=keep[3]; a.wound=null;
  if(!held||n<3||!(r1==='tot'||(r1==='verwundet'&&died))){ console.log('FEHLER: Festbeißen',held,n,r1,died); process.exit(1); }
  console.log('Festbeißen: '+n+' Bisse, Ergebnis '+r1+(died?', ausgeblutet zusammengebrochen, mit letztem Biss erlegt':'')); }
{ const P=T.P, a=T.animals.find(o=>(o.sp.id==='hyena'||o.sp.id==='boar')&&!o.dead), keep=[a.x,a.z,a.hp,a.state,a.aggro];
  let hurt=false, chase=false; const hp0=P.hp;
  for(let k=0;k<6&&!hurt;k++){ P.dead=false; P.hp=hp0; P.bite=null; P.safe=false; a.held=null; a.wound=null; a.hp=keep[2];
    T.startBite(P,a,5); P.bite.pos=0; T.biteHit(P); hurt=P.hp<hp0; chase=a.state==='chase'; }
  P.hp=hp0; P.bite=null; a.held=null; a.wound=null; a.x=keep[0]; a.z=keep[1]; a.hp=keep[2]; a.state=keep[3]; a.aggro=keep[4];
  if(!hurt||!chase){ console.log('FEHLER: Gegenbiss',hurt,chase); process.exit(1); }
  console.log('Festbeißen bei '+a.sp.n+': Fehlbiss → Gegenbiss und Angriff'); }
{ const P=T.P, a=T.animals.find(o=>o.sp.id==='deer'&&!o.dead);
  a.wound={sev:0.5,t:0,die:20,heal:30,by:P,acc:0}; T.forgetWounds(P); const healed=a.wound&&a.wound.die===0; a.wound=null;
  if(!healed){ console.log('FEHLER: Wunden nach Tod'); process.exit(1); }
  console.log('Tod des Jägers: seine Wunden heilen, kein geschenkter Kill'); }
{ const S=T.S(); const p2=T.players.find(o=>o!==T.P);
  if(p2){ p2.L.lvl=3; T.resetMates(); const ok=p2.L.lvl===S.lvl&&S.mates[p2.num]===p2.L;
    if(!ok){ console.log('FEHLER: Neustart Mitspieler',p2.L.lvl,S.lvl); process.exit(1); }
    console.log('Neustart: Mitspieler fängt ebenfalls neu an (Stufe '+p2.L.lvl+')'); } else console.log('Neustart Mitspieler: kein Mitspieler im Test (übersprungen)'); }
{ const S=T.S(), P=T.P, keep=S.cub; const fam=T.cub;
  S.cub={full:90,grow:0.3,hp:1,trait:'flink',n:1,gen:(S.gen||1)+1,parents:[S.id,'wild'],stage:1}; S.food=0;
  P.dead=false; P.tree=null; P.x=fam.x+1; P.z=fam.z; const ctx=T.cubFollowContext(P); const lab=ctx&&ctx.label; if(ctx) ctx.fn();
  const fo=T.followers.length===1;
  P.x+=20; for(let i=0;i<60;i++) T.updateFollowers(0.1); const f=T.followers[0]; const near=f&&Math.hypot(f.x-P.x,f.z-P.z)<6;
  for(let i=0;i<3;i++) T.cubLearn(P,'amb'); T.cubLearn(P,'kill'); const l=T.learnOf(P), g=S.cub.grow;
  S.cub=null; T.updateFollowers(0.1); const gone=T.followers.length===0; S.cub=keep;
  if(lab!=='Junges mitnehmen'||!fo||!near||l.amb!==3||!(g>0.3)||!gone){ console.log('FEHLER: Lehrzeit',lab,fo,near,JSON.stringify(l),g,gone); process.exit(1); }
  console.log('Lehrzeit: Junges mitnehmen, folgt ('+Math.hypot(f.x-P.x,f.z-P.z).toFixed(1)+' m), lernt Hinterhalt 3/3, wächst auf '+Math.round(g*100)+' %'); }
{ const S=T.S(), P=T.P, keep=[S.cub,S.food]; const a=T.animals.find(o=>o.sp.id==='deer'&&!o.dead), k2=[a.x,a.z];
  S.cub={full:50,grow:0.2,hp:1,trait:'flink',n:1,gen:2,parents:[S.id,'wild']}; S.food=0;
  P.dead=false; P.tree=null; P.st=100; P.hurtT=0; P.x=8; P.z=7; a.dead=true; a.x=8; a.z=8; T.makeCarcass(a,8); P.drag=a; P.ctl.fw=0; P.ctl.rt=0;
  T.updateDrag(P,0.1); const food=S.food, freed=!P.drag, gone=!a.carc;
  S.cub=keep[0]; S.food=keep[1]; if(a.carc) T.endCarcass(a); a.dead=false; a.x=k2[0]; a.z=k2[1]; a.g.visible=true; P.drag=null;
  if(food!==8||!freed||!gone){ console.log('FEHLER: Beute zum Bau',food,freed,gone); process.exit(1); }
  console.log('Beute zum Bau gezogen: +'+food+' Futter im Vorrat'); }
console.log('ALL OK');
