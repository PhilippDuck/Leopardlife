// Logiktest für LeoLife: führt das Spielskript ohne Browser und ohne three.js aus.
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
const body=code+'\n;globalThis.__trees=trees;globalThis.__T={assistBite,disconnectPlayer,pollCoop,leavePlayer,G,makeTree,fillPlants,baobabSpot,riverNear,riverDepth,riverEdge,lakePond,RIV_LAKE,RIV_HEAD,fordX,fillRiver,RIV_SWIM,pondAt,worldPond,moveAnimal,samePond,waterDepth,homeKopjes,worldKopje,fillKopje,denCave,cubState:()=>cub,kopjeNear,CUB_HOME,chunkRng,sightAt,W:()=>W,startFlee,unpause:()=>{G.paused=false;},dayF:()=>dayF,fogFar:()=>scene.fog.far,ctx:()=>context(),maxHp,paused:()=>G.paused,S:()=>S,P,animals,step,updateUI,doContext,startRaid,cub,hurtPlayer,respawn,gainXp,doPounce,doClimb,doRoar,hitAnimal,toggleMenu,toggleSkills,resetSkills,startBite,biteHit,H,visibility,lineOfSight,addSight,hearR,startEvent,endEvent,EV,updateEvents,eventOn,inGrass,patches,updateAnimal,WORLD,kidOf,kidsOf,tickKids,updateLife,playerSeeks,canSwitchFor,markTaken,cubFollowContext,cubLearn,updateFollowers,followers,learnOf,canSwitch,woundTick,forgetWounds,resetMates,inheritTrait,goalEvent,newGoals,togglePounce,pounceRun,raider:()=>G.raider,setQ:q=>{quality=q;applyQuality();},dead:()=>P.dead,frame,makePlayer,players,stepPlayer,readControls,updateCoop,hurtPlayer,copyLeopard,maxHpOf:maxHp,related,canPair,pairPlayers,mateBecomeCub,updateCub,becomeCub,ensureKin,newId,warnArrows,updateFamily,fam,mateContext,mateContextInfo,makeCarcass,takeMeat,updateEating,carcassContext,updateDrag,carcassToTree,nearCarcass,endCarcass,updateCoopHud,sleepOnTree,sleepingNow:()=>sleeping,PONDS,drinkContext,updateDrinking,hungerRate,crocStep,BURROWS,updateLexicon,lexIds,fowl,oxen,fowlSpots,oxpeckerSpots,vultureSpots,TROOPS,troopOf,updateBaboons,eleThreat,WATER_D,hippoThreat};';
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
const m=T.animals.find(a=>a.sp.friend&&a.g.visible===true); T.P.tree=null; T.P.safe=false; T.P.x=m.x+1; T.P.z=m.z+1; run(3); key('KeyF'); run(3);   // (am Start kann er schon in die Bau-Höhle gegangen sein)
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
  Object.values(T.kidsOf()).forEach(k=>{ k.grow=0.5; });
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
  for(let i=0;i<3;i++) T.cubLearn(P,'amb'); T.cubLearn(P,'kill'); const l=T.learnOf(P), g=T.kidOf(P).grow;
  S.cub=null; T.updateFollowers(0.1); const gone=T.followers.length===0; S.cub=keep;
  if(lab!=='Junges mitnehmen'||!fo||!near||l.amb!==3||!(g>0.3)||!gone){ console.log('FEHLER: Lehrzeit',lab,fo,near,JSON.stringify(l),g,gone); process.exit(1); }
  console.log('Lehrzeit: Junges mitnehmen, folgt ('+Math.hypot(f.x-P.x,f.z-P.z).toFixed(1)+' m), lernt Hinterhalt 3/3, wächst auf '+Math.round(g*100)+' %'); }
{ const S=T.S(), P=T.P, keep=[S.cub,S.food]; const a=T.animals.find(o=>o.sp.id==='deer'&&!o.dead), k2=[a.x,a.z];
  S.cub={full:50,grow:0.2,hp:1,trait:'flink',n:1,gen:2,parents:[S.id,'wild']}; S.food=0;
  // Neben dem Bau abgelegt zählt nicht – erst in der Höhle (am Eingang E): dort fressen die Jungen selbst
  const dc=T.denCave(), di=globalThis.__trees.indexOf(dc);
  P.dead=false; P.tree=null; P.st=100; P.hurtT=0; P.x=dc.x+dc.out[0]*1.5; P.z=dc.z+dc.out[1]*1.5; a.dead=true; a.x=P.x+dc.out[0]; a.z=P.z+dc.out[1]; T.makeCarcass(a,8); P.drag=a; P.ctl.fw=0; P.ctl.rt=0;
  T.updateDrag(P,0.1); const outsideNo=!a.carc.den&&P.drag===a;
  P.L.b.climb=0; T.doClimb(P); const inDen=P.tree===di&&!P.drag&&!!a.carc.den&&a.carc.tree===di, f0=S.cub.full;
  P.tree=null; P.x=60; P.z=60; for(let i=0;i<160;i++) T.updateCub(0.1); const ate=a.carc?8-a.carc.meat:8, f1=S.cub.full, cin=T.cubState().inside;
  S.cub=keep[0]; S.food=keep[1]; if(a.carc) T.endCarcass(a); a.dead=false; a.x=k2[0]; a.z=k2[1]; a.g.visible=true; P.drag=null; P.L.b.climb=1;
  if(!outsideNo||!inDen||!(ate>=2)){ console.log('FEHLER: Beute in den Bau',outsideNo,inDen,ate,f0,f1,cin); process.exit(1); }
  console.log('Beute in die Bau-Höhle gebracht: liegt im Raum, die Jungen gehen hinein und fressen selbst ('+ate+' Bissen in 16 s)'); }
{ const S=T.S(), P=T.P, keep=S.cub; const Q={num:2};
  S.cub={full:90,grow:0.6,hp:1,trait:'flink',n:2,gen:2,parents:[S.id,'wild']};
  const a1=T.canSwitchFor(P)&&T.canSwitchFor(Q); T.markTaken(P); S.cub.n=1; const a2=!T.canSwitchFor(P)&&T.canSwitchFor(Q);
  S.cub=keep;
  if(!a1||!a2){ console.log('FEHLER: eigenes Junges je Spieler',a1,a2); process.exit(1); }
  console.log('Wurf zu zweit: jeder übernimmt nur sein eigenes Junges'); }
{ const S=T.S(), keep=[S.cub,S.preg]; const Q=T.players.find(o=>o!==T.P);
  if(Q){ S.cub=null; S.preg=0; Q.dead=false; Q.L.lvl=12; Q.L.age=0; const seeks=T.playerSeeks(Q);
    const id0=Q.L.id; Q.L.age=1e6; T.updateLife(0.1); const reborn=Q.L.id!==id0&&Q.L.age===0;
    S.cub=keep[0]; S.preg=keep[1];
    if(!seeks||!reborn){ console.log('FEHLER: Mitspieler altert/sucht Partner',seeks,reborn); process.exit(1); }
    console.log('Mitspieler: sucht selbst Partner, altert und beginnt ohne Nachwuchs neu'); } }
{ const S=T.S(), P=T.P, keep=S.cub;
  S.cub={grow:0.3,n:2,gen:2,parents:[S.id,'wild'],kids:{1:{full:80,hp:1},2:{full:0,hp:0.05}}};
  for(let i=0;i<10;i++) T.tickKids(0.5);
  const ok=!!S.cub&&!!S.cub.kids[1]&&!S.cub.kids[2]&&S.cub.n===1&&S.cub.kids[1].full<80&&T.kidOf(P)===S.cub.kids[1];
  S.cub=keep;
  if(!ok){ console.log('FEHLER: getrennter Hunger'); process.exit(1); }
  console.log('Getrennter Hunger: ein Junges verhungert, das andere lebt weiter'); }
{ const S=T.S(), P=T.P, Q=T.players.find(o=>o!==P);
  if(Q){ const keep=JSON.stringify(S), cub=S.cub; S.cub=null; S.preg=0; P.dead=false; Q.dead=false; Q.L.lvl=9; S.lvl=12; S.age=1e9; const id0=S.id;
    T.updateLife(0.1); const ok=!P.dead&&S.age===0&&S.id!==id0&&S.lvl===9&&S.pts===16;
    Q.L.age=1e9; T.updateLife(0.1); const okQ=!Q.dead&&Q.L.age===0&&Q.L.pts>0;
    Object.assign(S,JSON.parse(keep)); S.cub=cub;
    if(!ok||!okQ){ console.log('FEHLER: Altersschwäche im Splitscreen',ok,okQ,S.lvl); process.exit(1); }
    console.log('Splitscreen: Tod durch Alter ohne Endlosschleife – neuer Leopard mit Punkten (Spieler 1 und 2)'); } }
{ const P=T.P, keep=[P.x,P.z,P.sneak,P.dead,P.tree], b=T.BURROWS[0];
  // Warzenschwein: flieht in den Bau, bleibt drin, solange ein Leopard nah ist, kommt danach wieder heraus
  const away=T.players.filter(o=>o!==P).map(o=>[o,o.x,o.z]); for(const [o] of away){ o.x=b.x+5000; o.z=b.z; }   // nur Spieler 1 zählt
  for(const o of T.animals) if(o.sp.pred&&!o.sp.friend&&Math.hypot(o.x-b.x,o.z-b.z)<20){ o.x+=40; o.z+=40; }
  const w=T.animals.find(a=>a.sp.id==='wart'&&!a.juv&&!a.dead); P.dead=false; P.tree=null; P.sneak=false;
  for(const o of T.animals) if(o.sp.pred&&!o.sp.friend&&!o.sp.croc&&Math.hypot(o.x-b.x,o.z-b.z)<40){ o.x=b.x+300; o.z=b.z; }   // Raubtiere weg, sonst bleibt es zufällig im Bau
  w.x=b.x+10; w.z=b.z; w.home=b; w.burrowed=null; P.x=b.x+30; P.z=b.z; T.startFlee(w);
  for(let i=0;i<60&&!w.burrowed;i++) T.updateAnimal(w,0.1);
  const inside=w.burrowed===b;
  P.x=b.x+5; for(let i=0;i<500;i++) T.updateAnimal(w,0.1);
  const stays=w.burrowed===b;
  P.x=b.x+80; const others=T.players.filter(q=>q!==P).map(q=>[q,q.x,q.z]); others.forEach(([q])=>{ q.x=P.x; q.z=P.z; });
  for(const o of T.animals) if(o.sp.pred&&!o.sp.croc&&!o.sp.friend&&Math.hypot(o.x-b.x,o.z-b.z)<20){ o.x=b.x+120; o.z=b.z; }   // zufällige Raubtiere am Bau wegschaffen
  for(let i=0;i<10;i++) T.updateAnimal(w,0.1);
  others.forEach(([q,x,z])=>{ q.x=x; q.z=z; });
  const out=T.dayF()<0.22||(!w.burrowed&&Math.hypot(w.x-b.x,w.z-b.z)<4);
  [P.x,P.z,P.sneak,P.dead,P.tree]=keep;
  for(const [o,x,z] of away){ o.x=x; o.z=z; }
  if(!inside||!stays||!out){ console.log('FEHLER: Warzenschwein-Bau',inside,stays,out); process.exit(1); }
  console.log('Warzenschwein: flieht in den Bau, wartet, bis die Luft rein ist, und kommt wieder heraus'); }
{ const P=T.P, keep=[P.x,P.z,P.sneak,P.dead,P.tree,P.hp,P.climbT,P.safe], trees=globalThis.__trees;
  // Paviane: Trupp mit Männchen und Jungen; Warnruf lässt Wild fliehen; Männchen greifen einen Leoparden im Baum an; Junge sind Beute
  T.updateBaboons(1.1);
  const tr=T.TROOPS.find(t=>t.all.some(a=>!a.world)), size=tr.all.length, males=tr.all.filter(a=>a.male).length, kids=tr.all.filter(a=>a.juv).length;
  if(size<5||size>10||!males||!kids){ console.log('FEHLER: Paviantrupp',size,males,kids); process.exit(1); }
  const alive=()=>tr.all.filter(a=>!a.dead), lead=alive().find(a=>!a.juv), calm=()=>{ for(const a of tr.all){ a.bab=null; a.up=0; a.mobP=null; a.state='wander'; a.stun=0; a.gcd=0; } tr.alarmT=0; tr.calmT=0; tr.mobCd=0; tr.threat=null; };
  const others=T.players.filter(o=>o!==P).map(o=>[o,o.x,o.z,o.tree]); for(const [o] of others){ o.x=P.x+5000; o.z=P.z; o.tree=null; }
  calm(); for(const a of alive()){ a.x=lead.x+Math.random()*4-2; a.z=lead.z+Math.random()*4-2; }
  // Warnruf: ein Leopard am Boden kommt zu nahe
  const deer=T.animals.find(a=>a.sp.id==='deer'&&!a.dead&&!a.juv&&!a.world); deer.x=lead.x+14; deer.z=lead.z; deer.state='wander';
  P.dead=false; P.tree=null; P.sneak=false; P.stealth=1; P.x=lead.x-9; P.z=lead.z;
  T.updateBaboons(0.1);
  const warned=tr.alarmT>0&&tr.threat===P&&deer.state==='flee', hide=alive().some(a=>!a.male&&!a.juv&&(a.bab==='perch'||a.state==='flee'));
  if(!warned||!hide){ console.log('FEHLER: Pavian-Warnruf',tr.alarmT,deer.state,hide); process.exit(1); }
  // Bedrohen: Leopard sitzt im Baum des Trupps – die Männchen klettern hinauf und beißen trotz „sicher“
  calm(); let ti=tr.homeI; if(ti<0){ let bd=1e9; trees.forEach((t,i)=>{ if(t&&t.perch){ const d=Math.hypot(t.x-lead.x,t.z-lead.z); if(d<bd){ bd=d; ti=i; } } }); }
  const t=trees[ti]; for(const a of alive()){ a.x=t.x+6+Math.random()*4; a.z=t.z+Math.random()*4-2; }
  P.tree=ti; P.climbT=1; P.safe=true; P.x=t.x+t.perch[0]; P.z=t.z+t.perch[2];
  let lost=0, up=0;
  for(let i=0;i<300;i++){ P.hp=T.maxHp(); T.updateBaboons(0.1); for(const a of tr.all) T.updateAnimal(a,0.1); lost+=T.maxHp()-P.hp; up=Math.max(up,...tr.all.filter(a=>a.male).map(a=>a.up||0)); }
  P.hp=T.maxHp();
  if(lost<=0||up<1||!tr.goal||tr.all.some(a=>a.bab==='mob')){ console.log('FEHLER: Paviane im Baum',lost,up,tr.goal); process.exit(1); }
  // Junge sind Beute
  calm(); P.tree=null; P.safe=false; const kid=alive().find(a=>a.juv); kid.hp=1; T.hitAnimal(kid);
  if(!kid.dead||!kid.carc){ console.log('FEHLER: Pavianjunges als Beute'); process.exit(1); }
  T.endCarcass(kid); kid.respawn=0;
  for(const [o,x,z,tr0] of others){ o.x=x; o.z=z; o.tree=tr0; }
  [P.x,P.z,P.sneak,P.dead,P.tree,P.hp,P.climbT,P.safe]=keep;
  console.log('Paviane: Trupp von '+size+' mit '+males+' Männchen und '+kids+' Jungen, Warnruf lässt Wild fliehen, Männchen greifen im Baum an ('+Math.round(lost)+' Schaden), geben nach 25 s auf, Junge sind Beute'); }
{ const P=T.P, keep=[P.x,P.z,P.sneak,P.dead,P.tree,P.hp,P.safe];
  // Elefanten: Herde mit Jungen; zu nah – Drohen (Ohren, Trompeten), zurückweichen beruhigt, wer bleibt, wird niedergetrampelt
  const herd=T.animals.filter(a=>a.sp.elephant&&!a.world&&!a.dead), adults=herd.filter(a=>!a.juv), kids=herd.filter(a=>a.juv);
  if(adults.length<4||!kids.length||adults.some(a=>a.herd!==adults[0].herd)){ console.log('FEHLER: Elefantenherde',adults.length,kids.length); process.exit(1); }
  const others=T.players.filter(o=>o!==P).map(o=>[o,o.x,o.z]); for(const [o] of others){ o.x=P.x+5000; o.z=P.z; }
  const lead=adults[0], reset=()=>{ for(const a of herd){ a.state='wander'; a.calmT=0; a.cd=0; a.stun=0; a.x=lead.x+(a===lead?0:30+Math.random()*4); a.z=lead.z+(a===lead?0:30); a.g.userData.alarm=0; } };
  P.dead=false; P.tree=null; P.safe=false; P.sneak=false; P.stealth=1;
  const run=n=>{ let st=new Set(); for(let i=0;i<n;i++){ for(const a of herd) T.updateAnimal(a,0.1); st.add(lead.state); } return st; };
  // 1) zu nah, dann zurückweichen: Drohen ohne Angriff
  reset(); P.x=lead.x+17; P.z=lead.z; P.hp=T.maxHp(); run(5);
  const threat=lead.state==='threat', ears=lead.g.userData.alarm>0.3, alert=herd.some(a=>a!==lead&&!a.juv&&a.state==='alert');
  P.x=lead.x+45; const st1=run(40), hp1=P.hp;
  if(!threat||!ears||!alert||st1.has('charge')||hp1<T.maxHp()){ console.log('FEHLER: Elefant droht',threat,ears,alert,[...st1],hp1); process.exit(1); }
  // 2) näher kommen: Angriff und Trampeln
  reset(); P.x=lead.x+17; P.z=lead.z; P.hp=T.maxHp(); run(15); P.x=lead.x+7; P.z=lead.z; let charged=false;
  for(let i=0;i<60;i++){ P.hp=Math.max(P.hp,1); for(const a of herd) T.updateAnimal(a,0.1); charged=charged||lead.state==='charge'; }
  const lost=T.maxHp()-P.hp;
  if(!charged||lost<=0){ console.log('FEHLER: Elefant greift an',charged,lost); process.exit(1); }
  // 3) schleichend mit Abstand: kein Drohen
  reset(); P.sneak=true; P.x=lead.x+16; P.z=lead.z; if(T.eleThreat(lead,P,16)){ console.log('FEHLER: Elefant droht schleichendem Leoparden auf 16 m'); process.exit(1); }
  reset(); P.sneak=false; P.hp=T.maxHp();
  for(const [o,x,z] of others){ o.x=x; o.z=z; }
  [P.x,P.z,P.sneak,P.dead,P.tree,P.hp,P.safe]=keep;
  console.log('Elefanten: Herde von '+adults.length+' mit '+kids.length+' Jungen, Drohen (Ohren, Herde schaut), Zurückweichen beruhigt, Näherkommen wird niedergetrampelt ('+Math.round(lost)+' Schaden), schleichend mit Abstand unbemerkt'); }
{ const P=T.P, S=T.S(), keep=[P.x,P.z,P.sneak,P.dead,P.tree,P.hp,P.safe,S.tod];
  // Nilpferde: nur in großen Wasserlöchern; tagsüber abgetaucht im Wasser, nachts grasend am Ufer; Angriff auf wer zwischen ihnen und dem Wasser steht
  const hs=T.animals.filter(a=>a.sp.hippo&&!a.world&&!a.dead), calf=hs.find(a=>a.juv), h=hs.find(a=>!a.juv), p=h.pond, wl=p.L-T.WATER_D;
  if(hs.length<3||!calf||hs.some(a=>!a.pond||a.pond.r<18)){ console.log('FEHLER: Nilpferde im Wasserloch',hs.length,!!calf); process.exit(1); }
  const others=T.players.filter(o=>o!==P).map(o=>[o,o.x,o.z]); for(const [o] of others){ o.x=P.x+5000; o.z=P.z; }
  P.dead=false; P.tree=null; P.safe=false; P.sneak=false; P.stealth=1; P.hp=T.maxHp();
  const away=()=>{ P.x=p.x+p.r+60; P.z=p.z; };
  const run=(n,a=h)=>{ for(let i=0;i<n;i++){ P.hp=Math.max(P.hp,1); T.updateAnimal(a,0.1); } };
  // Tag: im Wasser, nur Augen und Rücken über der Wasserlinie
  S.tod=0.5; away(); h.state='wade'; h.x=p.x; h.z=p.z; h.sy=null; h.calmT=0; run(80);
  const inW=Math.hypot(h.x-p.x,h.z-p.z)<p.r, low=h.sy<wl-0.6;
  if(h.state!=='wade'||!inW||!low){ console.log('FEHLER: Nilpferd tagsüber',h.state,inW,h.sy,wl); process.exit(1); }
  // Nacht: steigt ans Ufer und grast
  S.tod=0.95; let land=0; for(let i=0;i<900;i++){ away(); run(1); if(Math.hypot(h.x-p.x,h.z-p.z)>p.r+1) land++; }
  if(h.state!=='graze'||land<100){ console.log('FEHLER: Nilpferd nachts',h.state,land); process.exit(1); }
  // Zwischen Nilpferd und Wasser: droht, stürmt los und beißt
  const ux=(p.x-h.x)/Math.hypot(p.x-h.x,p.z-h.z), uz=(p.z-h.z)/Math.hypot(p.x-h.x,p.z-h.z);
  P.x=h.x+ux*9; P.z=h.z+uz*9; P.hp=T.maxHp(); h.calmT=0; h.cd=0; const hp0=P.hp; let gaped=false, charged=false;
  for(let i=0;i<60;i++){ T.updateAnimal(h,0.1); gaped=gaped||h.state==='gape'; charged=charged||h.state==='charge'; }
  const lost=hp0-P.hp;
  if(!gaped||!charged||lost<=0){ console.log('FEHLER: Nilpferd-Angriff',gaped,charged,lost); process.exit(1); }
  // Seitlich mit Abstand vorbei: kein Angriff
  P.hp=T.maxHp(); h.state='graze'; h.calmT=0; const sx=-uz, sz=ux; P.x=h.x+sx*11; P.z=h.z+sz*11;
  const why=T.hippoThreat(h,P,p,Math.hypot(P.x-h.x,P.z-h.z));
  if(why){ console.log('FEHLER: Nilpferd greift seitlich an',why); process.exit(1); }
  // Keine normale Beute: ein Biss löst keinen Festbiss aus, das Nilpferd wehrt sich
  h.state='graze'; P.x=h.x+2; P.z=h.z; P.hp=T.maxHp(); h.cd=0; T.hitAnimal(h); const fights=h.state==='chase'&&!h.dead&&!h.held; T.updateAnimal(h,0.1);
  if(!fights||!(h.state==='charge'||P.hp<T.maxHp())){ console.log('FEHLER: Nilpferd wehrt sich nicht',h.state); process.exit(1); }
  h.state='wade'; h.hp=h.sp.hp; h.calmT=0; P.hp=T.maxHp();
  for(const [o,x,z] of others){ o.x=x; o.z=z; }
  [P.x,P.z,P.sneak,P.dead,P.tree,P.hp,P.safe,S.tod]=keep;
  console.log('Nilpferde: '+hs.length+' in großen Wasserlöchern (mit Jungem), tagsüber abgetaucht, nachts '+Math.round(land/9)+' % der Zeit am Ufer, Angriff zwischen Tier und Wasser ('+Math.round(lost)+' Schaden), seitlich vorbei sicher, wehrt sich gegen Bisse'); }
{ const P=T.P, n0=T.animals.length, keepP=[P.x,P.z,P.hp,P.dead,P.tree];
  // Gnu-Wanderung: Herde zieht los, Panik bei Nähe, verlässt am Ende die Welt
  T.startEvent('migr'); const herd=T.animals.filter(a=>a.ev==='migr'), h0=herd.length, a0=herd[0], f0=a0.x*T.EV.dir.x+a0.z*T.EV.dir.z;
  P.x=500; P.z=500; for(let i=0;i<50;i++){ for(const a of herd) T.updateAnimal(a,0.1); T.updateEvents(0.1); }
  const moved=(a0.x*T.EV.dir.x+a0.z*T.EV.dir.z)-f0;
  T.endEvent(); T.players.forEach(q=>{ q.x=500; q.z=500; }); for(let i=0;i<400;i++){ for(const a of T.animals.slice()) if(a.temp) T.updateAnimal(a,0.1); T.updateEvents(0.1); }
  const left=T.animals.filter(a=>a.sp.id==='gnu'&&!a.world).length;
  if(!(h0>=14)||!(moved>15)||left!==0||T.animals.length!==n0){ console.log('FEHLER: Gnu-Wanderung',h0,moved,left,T.animals.length,n0); process.exit(1); }
  console.log('Gnu-Wanderung: '+h0+' Gnus ziehen ('+moved.toFixed(0)+' m in 5 s) und verlassen danach die Welt');
  // Steppenbrand: Tiere vor der Front fliehen, Feuer verletzt, Gras brennt ab und wächst nach
  T.startEvent('fire'); const d=T.EV.dir; T.EV.s=0; P.dead=false; P.tree=null; P.hp=200; P.x=d.x*-1+(-d.z)*40; P.z=d.z*-1+d.x*40;
  const prey=T.animals.find(a=>!a.dead&&!a.sp.croc&&!a.sp.friend&&!a.ev); prey.x=d.x*30+(-d.z)*20; prey.z=d.z*30+d.x*20; prey.dead=false;
  T.updateEvents(0.1); const flees=prey.ev==='fire'; const hp0=P.hp; for(let i=0;i<10;i++) T.updateEvents(0.1); const burnt=P.hp<hp0;
  T.EV.s=T.WORLD+20; T.updateEvents(0.1); const anyBurnt=T.patches.some(p=>p.burnt), off=!T.eventOn();
  T.EV.regrow=0.05; T.updateEvents(0.1); const regrown=!T.patches.some(p=>p.burnt);
  if(!flees||!burnt||!anyBurnt||!off||!regrown){ console.log('FEHLER: Steppenbrand',flees,burnt,anyBurnt,off,regrown); process.exit(1); }
  console.log('Steppenbrand: Tiere fliehen, Flammen verletzen, Gras brennt ab und wächst nach');
  // Rivale: kommt, wird besiegt, Ereignis endet
  T.EV.next=0; T.EV.last='fire'; T.startEvent('rival'); const r=T.EV.rival, hpR=r.hp;
  r.hp=1; T.hitAnimal(r,P); T.updateEvents(0.1); const won=!T.eventOn();
  for(let i=0;i<3000&&T.animals.includes(r);i++){ T.updateAnimal(r,0.1); T.updateEvents(0.1); }
  if(!(hpR>170)||!won||T.animals.includes(r)){ console.log('FEHLER: Rivale',hpR,won); process.exit(1); }
  console.log('Rivale: Leben '+hpR+', besiegt → Ereignis vorbei, Kadaver verschwindet später');
  P.x=keepP[0]; P.z=keepP[1]; P.hp=keepP[2]; P.dead=keepP[3]; P.tree=keepP[4]; T.EV.on=null; }
{ const S=T.S(), P=T.P, Q=T.players.find(o=>o!==P);
  if(Q){ const snap=JSON.stringify(S), qL=Q.L;
    // Spielerin 2 hat ihr Junges verloren, Spieler 1 hat noch seins: sie kann neuen Nachwuchs bekommen
    Q.dead=false; P.dead=false; Q.L.lvl=10; S.lvl=10; S.preg=0; S.cub={grow:0.6,n:1,gen:2,parents:[S.id,'wild'],trait:'flink',kids:{1:{full:80,hp:1,grow:0.6}}};
    const qs=T.playerSeeks(Q), ps=T.playerSeeks(P);
    S.litterParents=[Q.L.id,'wild']; S.preg=0.5; T.updateCub(1); T.unpause(); el('birth').style.display='none';
    const k=S.cub.kids, ok1=qs&&!ps&&k[1]&&k[1].grow===0.6&&k[2]&&k[2].grow===0&&S.cub.n===2;
    // ausgewachsenes eigenes Junges: am Bau zweimal drücken = übernehmen
    k[1].grow=1; P.tree=null; P.x=T.cub.x+1; P.z=T.cub.z; const gen0=S.gen||1; const c1=T.cubFollowContext(P); const lab=c1&&c1.label; c1&&c1.fn(); const c2=T.cubFollowContext(P); c2&&c2.fn();
    const ok2=/weiterspielen/.test(lab||'')&&S.lvl===8&&!T.kidOf(P)&&!!S.cub&&!!S.cub.kids[2];
    Object.keys(S).forEach(x=>delete S[x]); Object.assign(S,JSON.parse(snap)); Q.L=qL; P.swArm=0; T.rebuildPlayer&&0;
    if(!ok1||!ok2){ console.log('FEHLER: eigener Nachwuchs / Übernehmen',ok1,ok2,lab); process.exit(1); }
    console.log('Eigener Nachwuchs neben vorhandenem Jungen; ausgewachsenes Junges am Bau übernehmen ('+lab+')'); } }
{ const S=T.S(), P=T.P, keep=S.cub;
  S.cub={grow:0.3,n:1,gen:2,parents:[S.id,'wild'],trait:'flink',kids:{1:{full:90,hp:1,grow:0.3}}};
  P.dead=false; P.tree=null; P.x=T.cub.x+1; P.z=T.cub.z; const ctx=T.cubFollowContext(P); ctx&&ctx.fn(); const f=T.followers[0];
  const ti=globalThis.__trees.findIndex(t=>Math.hypot(t.x-P.x,t.z-P.z)<60); P.tree=ti; P.climbT=1; P.safe=true; const t=globalThis.__trees[ti]; P.x=t.x; P.z=t.z;
  for(let i=0;i<120;i++) T.updateFollowers(0.1); const up=f&&f.up===1&&f.tree===ti;
  P.tree=null; P.safe=false; for(let i=0;i<40;i++) T.updateFollowers(0.1); const down=f&&f.up===0&&f.tree==null;
  S.cub=null; T.updateFollowers(0.1); S.cub=keep;
  if(!up||!down){ console.log('FEHLER: Junges klettert mit',up,down); process.exit(1); }
  console.log('Junges klettert mit auf den Baum und wieder herunter'); }
{ const P=T.P, n0=T.animals.length; T.EV.on=null; P.dead=false; P.tree=null; P.hp=999; P.sneak=false; P.stealth=1; P.x=0; P.z=0;
  T.startEvent('poach'); const ws=T.animals.filter(a=>a.sp.id==='poacher'), w=ws[0];
  w.x=P.x+25; w.z=P.z; w.shotT=0; const hp0=P.hp; let shots=0;
  for(let i=0;i<120;i++){ for(const o of ws) T.updateAnimal(o,0.1); T.updateEvents(0.1); if(w.aimT<0.4&&w.shotT>2) shots++; }
  const hurtOrShot=P.hp<hp0||shots>0;
  w.hp=w.sp.hp; for(let i=0;i<20&&w.ev==='poach';i++) T.hitAnimal(w,P); const gone=w.ev==='leave'&&!w.dead;
  T.endEvent(); T.players.forEach(q=>{ q.x=5000; q.z=0; }); for(let i=0;i<300;i++){ for(const o of T.animals.slice()) if(o.temp) T.updateAnimal(o,0.1); T.updateEvents(0.1); }
  const cleaned=!T.animals.some(a=>a.sp.id==='poacher'); if(!cleaned) console.log(T.animals.filter(a=>a.sp.id==='poacher').map(a=>[a.ev,a.dead,a.stun,a.gone,a.held,Math.round(Math.hypot(a.x-P.x,a.z-P.z))].join('/'))); P.x=0; P.hp=200;
  if(ws.length<2||!hurtOrShot||!gone||!cleaned){ console.log('FEHLER: Wilderer',ws.length,hurtOrShot,gone,cleaned); process.exit(1); }
  console.log('Wilderer: '+ws.length+' streifen umher, schießen auf den Leoparden, lassen sich vertreiben, verschwinden danach'); }
{ const P=T.P, a=T.animals.find(o=>o.sp.id==='anti'&&!o.dead), k=[a.x,a.z,a.g.rotation.y,a.idle,a.state,P.x,P.z,P.sneak,P.tree];
  { let bx=4000; for(let i=0;i<200;i++){ const x=4000+i*37; if(T.lineOfSight(x,T.H(x,4000)+1.3,4000,x,T.H(x,4015)+0.5,4015)===1&&T.lineOfSight(x,T.H(x,4000)+1.3,4000,x,T.H(x,3985)+0.5,3985)===1){ bx=x; break; } } a.x=bx; a.z=4000; } a.g.rotation.y=0; a.idle=0; a.state='wander'; a.watch=false; P.tree=null; P.sneak=false;
  const at=(x,z)=>{ P.x=a.x+x; P.z=a.z+z; a.visT=0; return T.visibility(a,P,0.3); };
  const front=at(0,15), behind=at(0,-15);
  a.idle=2; const grazing=at(0,15); a.idle=0;
  T.addSight(a.x,a.z+8,2.2,3,1); const rock=at(0,15);
  P.noise=26; const hear=T.hearR(P); P.noise=0;
  a.x=k[0]; a.z=k[1]; a.g.rotation.y=k[2]; a.idle=k[3]; a.state=k[4]; P.x=k[5]; P.z=k[6]; P.sneak=k[7]; P.tree=k[8]; a.visT=0;
  if(!(front>0.9)||!(behind<0.35)||!(grazing<front*0.7)||rock!==0||!(hear>20)){ console.log('FEHLER: Sehen',front,behind,grazing,rock,hear); process.exit(1); }
  console.log('Sehen: vorne '+front.toFixed(2)+', von hinten '+behind.toFixed(2)+', grasend '+grazing.toFixed(2)+', hinter Fels '+rock+', Rennen hört man '+hear.toFixed(0)+' m weit'); }
{ const P=T.P, S=T.S(), q=T.PONDS[0];
  // Durst sinkt, am Ufer trinken füllt auf
  P.dead=false; P.tree=null; P.safe=false; P.hp=T.maxHp(); S.thirst=60; T.updateLife(3); const fell=S.thirst<60;
  for(const a of T.animals) if(a.sp.croc){ a.x=q.x+500; a.z=q.z; a.cd=99; }   // Krokodile weg
  P.x=q.x+q.r*0.85; P.z=q.z; P.ctl.fw=P.ctl.rt=0; const ctx=T.drinkContext(P); if(ctx) ctx.fn();
  for(let i=0;i<40;i++) T.updateDrinking(P,0.1); const drank=S.thirst>90;
  P.x=0; P.z=0; const noCtx=!T.drinkContext(P);
  // Genügsamer Magen: weniger Hunger je Rang
  const h0=T.hungerRate(); S.a.sat=4; const h4=T.hungerRate(); S.a.sat=0;
  // Krokodil greift einen trinkenden Leoparden am Ufer an – auch einen großen
  const c=T.animals.find(a=>a.sp.croc); c.pond=q; c.x=q.x; c.z=q.z; c.state='lurk'; c.cd=0; c.scared=0; c.stun=0;
  const lv=S.lvl; S.lvl=20; P.hp=9999; P.x=q.x+q.r*0.85; P.z=q.z; S.thirst=30; T.drinkContext(P).fn(); const hp0=P.hp; let states=new Set();
  for(let i=0;i<200&&P.hp>=hp0;i++){ const dx=P.x-c.x, dz=P.z-c.z; c.cd-=0.05; T.crocStep(c,0.05,Math.hypot(dx,dz),dx,dz,1,false,P); states.add(c.state); }
  const bitten=P.hp<hp0; S.lvl=lv; P.hp=T.maxHp(); P.drinking=null; P.x=0; P.z=0; c.x=q.x; c.z=q.z; c.state='lurk';
  if(!fell||!ctx||!drank||!noCtx||!(h4<h0*0.85)||!bitten||!states.has('stalk')||!states.has('rise')){ console.log('FEHLER: Durst/Krokodil',fell,!!ctx,drank,noCtx,h0,h4,bitten,[...states]); process.exit(1); }
  console.log('Durst: sinkt, am Ufer getrunken; Genügsamer Magen '+(h4/h0*100).toFixed(0)+' % Hunger; Krokodil schleicht heran und beißt ('+[...states].join(' → ')+')'); }
// Ein besetzter Baum behält seinen Platz, während ein anderer Abschnitt entladen wird.
{
  const assert=require('node:assert/strict');
  const trees=globalThis.__trees;
  function load(cx){
    const c={cx,cz:-30,rng:T.chunkRng(cx,-30),content:[]};
    T.fillPlants(c);
    return c.content[0];
  }
  for(const sav of [true,false]){
    const a=T.makeTree({x:300,z:400,sav},T.chunkRng(8,9));
    const b=T.makeTree({x:300,z:400,sav},T.chunkRng(8,9));
    assert.deepEqual(a.perch,b.perch);
    assert.deepEqual(a.parts.map(p=>p.leaf),b.parts.map(p=>p.leaf));
    assert.ok(a.parts.length>5);
  }
  const first=load(40), second=load(41);
  const tree=trees.find(t=>t&&Math.floor(t.x/64)===41);
  const index=trees.indexOf(tree);
  const mate={tree:index}, cub={tree:index};
  T.players.push(mate); T.followers.push(cub);
  assert.ok(second.inUse());
  first.drop();
  assert.equal(trees[index],tree);
  T.players.pop();
  assert.ok(second.inUse());
  T.followers.pop();
  assert.ok(!second.inUse());
  second.drop();
  assert.ok(!T.sightAt(tree.x,tree.z)?.some(o=>o.x===tree.x&&o.z===tree.z));
  const again=load(41);
  assert.equal(trees.filter(t=>t&&t.x===tree.x&&t.z===tree.z).length,1);
  assert.ok(T.patches.some(p=>Math.floor(p.x/64)===41&&T.inGrass(p.x,p.z)));
  again.drop();
  assert.ok(!T.patches.some(p=>Math.floor(p.x/64)===41));
  console.log('Chunk-Pflanzen: Koop-Baum stabil, Deckung entladen, gleicher Standort bei Rückkehr');
}
// Affenbrotbäume: im Startgebiet und selten in der weiten Welt, dick, hoch und kletterbar.
{
  const assert=require('node:assert/strict');
  const trees=globalThis.__trees, bao=trees.filter(t=>t&&t.baobab);
  assert.ok(bao.length>=1,'kein Affenbrotbaum im Startgebiet');
  const a=T.makeTree({x:500,z:500,baobab:true},T.chunkRng(3,4)), b=T.makeTree({x:500,z:500,baobab:true},T.chunkRng(3,4));
  assert.deepEqual(a.perch,b.perch); assert.ok(a.baobab&&a.tr>1.5&&a.perch[1]>7,'Affenbrotbaum zu klein');
  // Klettern wie bei anderen Bäumen
  const S0=T.S(); S0.b.climb=1; if(T.dead()) T.respawn(); if(els.menu.style.display==='flex') els.btnResume.onclick();
  const t=bao[0], ti=trees.indexOf(t); T.P.tree=null; T.P.drag=null; T.P.x=t.x+t.tr+0.9; T.P.z=t.z; T.P.st=T.P.st+100; run(2); key('KeyE'); run(90);
  assert.equal(T.P.tree,ti,'Affenbrotbaum nicht erklettert'); assert.ok(T.P.safe&&T.P.camY-T.P.y>6,'oben nicht angekommen');
  key('KeyE'); run(40); assert.equal(T.P.tree,null);
  // Weite Welt: selten, aber vorhanden, an derselben Stelle beim Wiederladen
  let found=null, n=0; for(let cx=10;cx<70;cx++) for(let cz=-40;cz<-20;cz++){ const s=T.baobabSpot(cx,cz); if(s){ n++; if(!found) found={cx,cz,s}; } }
  assert.ok(found,'kein Affenbrotbaum in der weiten Welt'); assert.ok(n<120,'zu viele Affenbrotbäume: '+n);
  const c={cx:found.cx,cz:found.cz,rng:T.chunkRng(found.cx,found.cz),content:[]}; T.fillPlants(c);
  const w=trees.find(t=>t&&t.baobab&&t.x===found.s.x&&t.z===found.s.z); assert.ok(w,'Affenbrotbaum nicht gepflanzt');
  c.content[0].drop(); assert.ok(!trees.includes(w));
  console.log('Affenbrotbäume: '+bao.length+' im Startgebiet, '+n+' von 1200 Abschnitten, kletterbar (Höhe '+t.perch[1].toFixed(1)+' m)');
}
// Felsplateaus (Kopjes): im Startgebiet und in der weiten Welt, kletterbar, Höhle zum Verstecken, Schlafen und als Bau.
{
  const assert=require('node:assert/strict');
  const trees=globalThis.__trees, S0=T.S();
  assert.ok(T.homeKopjes.length>=1,'kein Felsplateau im Startgebiet'); T.G.raider=null; T.G.raidT=1e9;
  const k=T.homeKopjes[0], top=trees.findIndex(t=>t&&t.kopje===k&&!t.cave), cave=trees.findIndex(t=>t&&t.kopje===k&&t.cave);
  assert.ok(top>=0&&cave>=0,'Felsplateau ohne Kletterplatz oder Höhle');
  assert.ok(!trees.some(t=>t&&!t.kopje&&Math.hypot(t.x-k.x,t.z-k.z)<k.R),'Baum wächst im Felsen');
  assert.ok(!T.patches.some(p=>Math.hypot(p.x-k.x,p.z-k.z)<k.R),'hohes Gras im Felsen');
  // Kollision: man läuft nicht durch den Felsen
  T.P.tree=null; T.P.drag=null; T.P.x=k.x+k.R+3; T.P.z=k.z; run(2);
  for(let i=0;i<30;i++){ T.P.rot=0; T.P.x-=0.4; run(1); }
  assert.ok(Math.hypot(T.P.x-k.x,T.P.z-k.z)>k.R*0.85,'durch den Felsen gelaufen');
  // Hinaufklettern: oben sicher, auf Höhe der Fläche; von dort herunter landet man neben dem Felsen
  S0.b.climb=1; if(T.dead()) T.respawn(); if(els.menu.style.display==='flex') els.btnResume.onclick();
  const a=k.cave+Math.PI; T.P.x=k.x+Math.sin(a)*(k.R+1.2); T.P.z=k.z+Math.cos(a)*(k.R+1.2); T.P.st+=100; run(2); key('KeyE'); run(90);
  assert.equal(T.P.tree,top,'Felsplateau nicht erklettert'); assert.ok(T.P.safe&&Math.abs(T.P.camY-T.P.y-k.top)<1.5,'oben nicht angekommen');
  key('KeyE'); run(40); assert.equal(T.P.tree,null); assert.ok(Math.hypot(T.P.x-k.x,T.P.z-k.z)>k.R,'nach dem Abstieg im Felsen');
  // Höhle: auch ohne Klettern; drinnen versteckt und sicher, nachts kann man dort schlafen
  S0.b.climb=0; const ct=trees[cave]; T.P.x=ct.x+ct.out[0]*1.6; T.P.z=ct.z+ct.out[1]*1.6; run(2); key('KeyE'); run(60);
  assert.equal(T.P.tree,cave,'nicht in die Höhle gegangen'); assert.ok(T.P.safe&&T.P.stealth===0,'in der Höhle nicht versteckt');
  // Bau verlegen (die Jungen ziehen mit), dann schlafen
  assert.equal(T.ctx()&&T.ctx().label,'Bau in diese Höhle verlegen'); key('KeyF'); run(2);
  assert.ok(Math.hypot(T.CUB_HOME.x-ct.x,T.CUB_HOME.z-ct.z)<3,'Bau nicht verlegt'); assert.ok(S0.den,'Bau nicht gespeichert');
  S0.tod=0.9; run(2); assert.equal(T.ctx()&&T.ctx().label,'Schlafen'); key('KeyF'); run(5); assert.ok(S0.tod>0.25&&S0.tod<0.3||T.P.wantSleep,'in der Höhle nicht geschlafen');   // im Koop wartet man auf die anderen
  key('KeyE'); run(10); assert.equal(T.P.tree,null); assert.ok(Math.hypot(T.P.x-ct.x,T.P.z-ct.z)>1,'nicht aus der Höhle gekommen');
  T.P.x=7; T.P.z=5; run(2); assert.equal(T.ctx()&&T.ctx().label,'Bau hierher zurückverlegen'); key('KeyF'); run(2);
  assert.ok(!S0.den&&T.CUB_HOME.x===7&&T.CUB_HOME.z===5,'Bau nicht zurückverlegt');
  // Weite Welt: selten, fest je Abschnitt, mit dem Abschnitt geladen und entfernt
  let found=null, n=0, ns=0; for(let cx=10;cx<70;cx++) for(let cz=-40;cz<-20;cz++){ const s=T.worldKopje(cx,cz); if(s&&s.small) ns++; else if(s){ n++; if(!found) found={cx,cz,s}; } }
  assert.ok(found,'kein Felsplateau in der weiten Welt'); assert.ok(n<200,'zu viele Felsplateaus: '+n); assert.ok(ns>0&&ns<350,'kleine Felsgruppen: '+ns);
  assert.equal(T.kopjeNear(found.s.x,found.s.z),found.s);
  const before=trees.filter(Boolean).length, c={cx:found.cx,cz:found.cz,content:[]}; T.fillKopje(c);
  assert.equal(trees.filter(t=>t&&t.kopje===found.s).length,2,'Felsplateau der weiten Welt nicht aufgebaut');
  c.content.forEach(it=>it.drop()); assert.equal(trees.filter(Boolean).length,before,'Felsplateau nicht entfernt');
  // Kleine Felsgruppe: ohne Höhle, auch ohne Klettern-Fähigkeit erklimmbar, oben sicher
  const small=T.homeKopjes.filter(o=>o.small); assert.ok(small.length>=4,'zu wenige kleine Felsgruppen im Startgebiet: '+small.length);
  assert.ok(T.homeKopjes.filter(o=>!o.small).length>=3,'zu wenige Felsplateaus im Startgebiet');
  { const sk=small[0], st=trees.findIndex(t=>t&&t.kopje===sk);
    assert.equal(trees.filter(t=>t&&t.kopje===sk).length,1,'kleine Felsgruppe mit Höhle');
    assert.ok(!trees.some(t=>t&&!t.kopje&&Math.hypot(t.x-sk.x,t.z-sk.z)<sk.R),'Baum wächst in der Felsgruppe');
    S0.b.climb=0; T.P.tree=null; T.P.x=sk.x+sk.R+1.0; T.P.z=sk.z; T.P.st+=100; run(2); key('KeyE'); run(90);
    assert.equal(T.P.tree,st,'kleine Felsgruppe ohne Klettern nicht erklommen'); assert.ok(T.P.safe,'auf der Felsgruppe nicht sicher');
    key('KeyE'); run(40); assert.equal(T.P.tree,null); S0.b.climb=1; }
  console.log('Felsplateaus: '+T.homeKopjes.filter(o=>!o.small).length+' im Startgebiet, '+n+' von 1200 Abschnitten, kletterbar (Höhe '+k.top.toFixed(1)+' m), Höhle als Versteck, Schlafplatz und Bau; '+small.length+' kleine Felsgruppen im Startgebiet, '+ns+' in der weiten Welt, ohne Klettern erklimmbar');
}
// Fluss mit Furten: durchs Startgebiet und die weite Welt; tief (schwimmen, Herden bleiben draußen), an den Furten flach.
// Er fließt nur bergab: von einer Quelle bis in einen großen See ohne Abfluss; dahinter bis zur nächsten Quelle kein Fluss.
{
  const assert=require('node:assert/strict');
  const S0=T.S(); if(T.dead()) T.respawn(); if(els.menu.style.display==='flex') els.btnResume.onclick();
  const r0={...T.riverNear(0,0)}, n=r0.n, zc=x=>T.riverNear(x,r0.zc).zc;
  assert.ok(Math.abs(r0.zc)<200,'kein Fluss im Startgebiet'); assert.ok(r0.w>4,'Fluss im Startgebiet zu schmal'); assert.ok(T.riverEdge(7,5)>40,'Fluss zu nah am Bau');
  for(const p of T.PONDS) assert.ok(T.riverEdge(p.x,p.z)>p.r*1.5+6,'Fluss läuft durch ein Wasserloch');
  for(const k of T.homeKopjes) assert.ok(T.riverEdge(k.x,k.z)>k.R+10,'Felsplateau im Fluss');
  for(let i=-40;i<40;i++) for(let j=-40;j<40;j++){ const k=T.worldKopje(i,j); if(k) assert.ok(T.riverEdge(k.x,k.z)>k.R+10,'Felsplateau im Fluss'); }
  for(let i=-30;i<30;i++) for(let j=-30;j<30;j++){ const q=T.worldPond(i*256+128,j*256+128); if(q) assert.ok(T.riverEdge(q.x,q.z)>q.r*1.5+12,'Fluss läuft durch einen Tümpel'); }
  // Gefälle: der Pegel steigt in Fließrichtung (West → Ost) nie, von der Quelle bis zum See; das Gelände springt nirgends
  let segs=0, drop=0;
  for(let nn=-3;nn<=3;nn++){ const z=r0.zc+(nn-n)*1100;
    for(let m=-2;m<=2;m++){ const s0={...T.riverNear(m*2000+1000,z)}, xs=s0.seg.xs; let last=Infinity;
      for(let x=xs-300;x<xs+2000;x+=1){ const r=T.riverNear(x,z); if(r.m===s0.seg.m&&r.u<=T.RIV_LAKE){ assert.ok(r.L<=last+1e-9,'Fluss fließt bergauf bei x '+(x-xs)+' (m '+r.m+'/'+s0.seg.m+', u '+r.u+')'); last=r.L; } }
      // Stetigkeit: an Quelle, Seemitte und Abschnittsgrenze ändert sich das Gelände auf 5 cm um höchstens wenige Zentimeter
      for(const x of [xs,xs+T.RIV_HEAD,s0.seg.xe,s0.seg.xl,xs+2000]) for(let dz=-200;dz<=200;dz+=2.5){ const zz=s0.seg.zl+dz;
        assert.ok(Math.abs(T.H(x-0.025,zz)-T.H(x+0.025,zz))<0.08,'Gelände springt bei x '+(x-xs)+', dz '+dz+': '+(T.H(x-0.025,zz)-T.H(x+0.025,zz)).toFixed(2)); }
      const sg=s0.seg; assert.ok(sg.Ls-sg.Ll>=3.49,'zu wenig Gefälle'); drop+=sg.Ls-sg.Ll; segs++;
      // See: groß und tief, Wasser für Durst; dahinter bis zur nächsten Quelle trockenes Land
      const lake=T.lakePond(sg.xl,sg.zl,1); assert.ok(lake&&lake.lake&&lake.r>=60,'kein See am Flussende');
      assert.ok(T.riverDepth(sg.xl,sg.zl)>2.5,'See nicht tief'); assert.equal(T.pondAt(sg.xl,sg.zl,1),lake);
      for(let x=sg.xl+sg.R+5;x<xs+2000;x+=10) for(const dz of [-30,0,30]) assert.equal(T.riverDepth(x,sg.zl+dz),0,'Fluss hinter dem See');
      // Aue: neben dem Fluss liegt das Ufer knapp über dem Wasser, nicht in einer Schlucht und nicht auf einem Damm
      for(let x=xs+400;x<sg.xl-sg.R-50;x+=37){ const r={...T.riverNear(x,z)}, bank=T.H(x,r.zc+r.w*r.k*2+3); assert.ok(bank>r.L-0.2&&bank<r.L+2.2,'Ufer bei '+(x-xs)+': '+(bank-r.L).toFixed(2)); }
    } }
  // Tiefe: zwischen den Furten (Gumpe: breit und tief) schwimmen, in der Furt waten
  const fx=T.fordX(n,0), deepX=fx+105;
  assert.ok(T.riverDepth(fx,zc(fx))>0.05&&T.riverDepth(fx,zc(fx))<T.RIV_SWIM,'Furt nicht flach: '+T.riverDepth(fx,zc(fx)).toFixed(2));
  assert.ok(T.riverDepth(deepX,zc(deepX))>1.8,'Gumpe nicht tief genug'); assert.ok(T.riverNear(deepX,r0.zc).w>T.riverNear(fx,r0.zc).w+2,'Gumpe nicht breiter als die Furt');
  const q=T.pondAt(deepX,zc(deepX),1); assert.ok(q&&q.river,'Fluss ist kein Wasser'); assert.ok(T.samePond(q,T.pondAt(deepX+5,zc(deepX+5),1)));
  // Leopard: schwimmt im Tiefen (langsam, Kopf über Wasser), trinkt am Ufer
  T.P.tree=null; T.P.drag=null; T.P.x=deepX; T.P.z=zc(deepX); run(3);
  assert.ok(T.P.swim&&T.P.wet,'schwimmt nicht'); assert.ok(T.P.y>T.H(T.P.x,T.P.z)+0.8,'taucht unter');
  const side={...T.riverNear(deepX,zc(deepX))}; T.P.z=zc(deepX)+side.w*side.k*0.93; T.P.x=deepX; S0.thirst=40; run(2);
  assert.equal(T.drinkContext(T.P)?.label,'Trinken','am Fluss kann man nicht trinken'); assert.ok(!T.P.swim);
  // Herde: geht nicht ins Tiefe, sondern am Ufer entlang zur Furt und dort hinüber
  const deer=T.animals.find(a=>a.sp.id==='deer'&&!a.dead); const bank=z=>zc(deer.x)-(side.w*side.k+1.5);
  deer.x=fx+60; deer.z=bank(); const far=zc(fx+60)+30; let maxD=0;
  for(let i=0;i<1200&&deer.z<zc(deer.x)+side.w;i++){ T.moveAnimal(deer,0,far-deer.z,4,0.05); maxD=Math.max(maxD,T.riverDepth(deer.x,deer.z)); }
  assert.ok(maxD<=T.RIV_SWIM+0.01,'Herdentier im tiefen Wasser: '+maxD.toFixed(2));
  assert.ok(deer.z>zc(deer.x)&&Math.abs(deer.x-fx)<20,'nicht an der Furt hinüber: x '+(deer.x-fx).toFixed(1));
  // Auf der Flucht schwimmt es dagegen direkt hinüber (langsamer), statt am Ufer hängen zu bleiben; der Blick geht in die Laufrichtung
  { deer.x=deepX; deer.z=bank(); deer.state='flee'; const z0=deer.z; let deep=0, n2=0;
    for(;n2<1200&&deer.z<zc(deer.x)+side.w*side.k+1;n2++){ T.moveAnimal(deer,0,far-deer.z,4,0.05); deep=Math.max(deep,T.riverDepth(deer.x,deer.z)); }
    assert.ok(deep>T.RIV_SWIM,'Fliehendes Tier schwimmt nicht durchs Tiefe: '+deep.toFixed(2));
    assert.ok(Math.abs(deer.x-deepX)<5&&deer.z>zc(deer.x),'nicht direkt hinübergeschwommen');
    assert.ok(Math.abs(Math.sin(deer.g.rotation.y))<0.3&&Math.cos(deer.g.rotation.y)>0.9,'Blick nicht in Laufrichtung');
    deer.state='wander'; }
  // Abschnitte mit Furt: Wasserfläche (wo Flussbett ist), Krokodile lauern an Furten und in Gumpen, alles verschwindet mit dem Abschnitt
  let crocs=0, built=0, inBed=0;
  for(let k=1;k<40;k++){ const x=T.fordX(n,k), r={...T.riverNear(x,r0.zc)}, bed=r.u>=T.RIV_HEAD&&r.u<=T.RIV_LAKE-1.3*r.lr, dry=r.cd>1e8;
    const cx=Math.floor(x/64), cz=Math.floor(zc(x)/64), before=T.animals.length, c={cx,cz,content:[]};
    if(bed) inBed++; T.fillRiver(c); if(c.content.length&&bed) built++; if(dry&&r.ld>r.lr*1.6&&r.u<2000-70) assert.equal(c.content.length,0,'Fluss in der Lücke hinter dem See: u '+r.u.toFixed(0)+' ld '+r.ld.toFixed(0)+' R '+r.lr.toFixed(0)+' cx '+cx+' lake '+(r.lx/64).toFixed(1));
    const cr=T.animals.slice(before).filter(a=>a.sp.croc);
    for(const a of cr){ crocs++; assert.ok((a.pond.river||a.pond.lake)&&T.riverDepth(a.x,a.z)>0.6,'Krokodil nicht im tiefen Wasser'); }
    c.content.forEach(it=>it.drop()); assert.equal(T.animals.length,before); }
  assert.ok(inBed>=20&&built===inBed&&crocs>5,'Furten: '+built+'/'+inBed+' Abschnitte, '+crocs+' Krokodile');
  // See-Abschnitt: Wasserfläche, mehrere Krokodile im See, oft Nilpferde; Herdentiere laufen am Ufer entlang statt hinein
  { const sg=T.riverNear(0,r0.zc).seg, c={cx:Math.floor(sg.xl/64),cz:Math.floor(sg.zl/64),content:[]}, before=T.animals.length;
    T.fillRiver(c); const added=T.animals.slice(before), lc=added.filter(a=>a.sp.croc&&a.pond.lake);
    assert.ok(lc.length>=2&&lc.every(a=>T.riverDepth(a.x,a.z)>0.8),'keine Krokodile im See'); assert.ok(added.filter(a=>a.sp.hippo).every(a=>a.pond.lake));
    const deer=T.animals.find(a=>a.sp.id==='deer'&&!a.dead); deer.x=sg.xl-sg.R-1; deer.z=sg.zl; let maxD=0;
    for(let i=0;i<400;i++){ T.moveAnimal(deer,1,0,4,0.05); maxD=Math.max(maxD,T.riverDepth(deer.x,deer.z)); }
    assert.ok(maxD<=T.RIV_SWIM+0.01,'Herdentier schwimmt in den See: '+maxD.toFixed(2));
    c.content.forEach(it=>it.drop()); assert.equal(T.animals.length,before);
    console.log('See: Radius '+sg.R.toFixed(0)+' m, '+lc.length+' Krokodile, '+added.filter(a=>a.sp.hippo).length+' Nilpferde; Gefälle im Mittel '+(drop/segs).toFixed(1)+' m je Abschnitt'); }
  console.log('Fluss: Furten alle 210 m (Tiefe '+T.riverDepth(fx,zc(fx)).toFixed(2)+' m, Gumpe '+T.riverDepth(deepX,zc(deepX)).toFixed(1)+' m), schwimmen, trinken, Herde quert an der Furt, '+crocs+' Krokodile an Furten und Gumpen');
}
console.log('ALL OK');

// Controllerverlust: Frist, Wiederverbindung und endgültiges Entfernen.
{
 const p=T.makePlayer({L:T.copyLeopard(T.S())}); p.pad=7; p.num=2; T.players.push(p);
 T.disconnectPlayer(p);
 if(!p.reconnectUntil||!T.players.includes(p)) throw Error('Keine Wiederverbindungsfrist');
 const gps=[]; gps[7]={connected:true,buttons:Array.from({length:16},()=>({pressed:false})),axes:[0,0,0,0]};
 T.pollCoop(0.016,gps);
 if(p.reconnectUntil||!T.players.includes(p)) throw Error('Wiederverbindung fehlgeschlagen');
 T.disconnectPlayer(p); p.reconnectUntil=performance.now()-1; T.pollCoop(0.016,[]);
 if(T.players.includes(p)) throw Error('Frist entfernt Spieler nicht');
}
// Unterstützung: nur in Reichweite, höchstens einmal pro Runde, begrenzter Bonus.
{
 const a=T.animals.find(a=>a.sp.id==='deer'), p=T.makePlayer({L:T.copyLeopard(T.S())});
 T.players.push(p); p.dead=false; T.P.dead=false; T.P.bite={a,round:0}; p.x=a.x+100; p.z=a.z;
 if(T.assistBite(p)) throw Error('Fernunterstützung');
 p.x=a.x; if(!T.assistBite(p)||T.P.bite.help!==0.05) throw Error('Kein Koop-Bonus');
 T.assistBite(p); if(T.P.bite.help!==0.05) throw Error('Bonus durch Tastenspam');
 for(let i=1;i<8;i++){ T.P.bite.round=i; T.assistBite(p); }
 if(T.P.bite.help!==0.2) throw Error('Bonus nicht begrenzt');
 T.P.bite=null; T.players.splice(T.players.indexOf(p),1);
}
console.log('Controller-Wiederverbindung und Koop-Jagd OK');

// Auch wenn nur Gnu-Wanderungen freigeschaltet sind, bleibt die Auswahl gültig.
{
 const old=T.players.map(p=>[p,p.L.lvl,p.tut]); for(const p of T.players){ p.L.lvl=1; p.tut=null; } T.P.dead=false;
 T.EV.on=null; T.EV.last='migr'; T.EV.next=0; T.EV.fireCooldown=0;
 T.updateEvents(0);
 if(T.EV.on!=='migr') throw Error('Frühes Ereignis ungültig oder Feuer zu früh');
 T.endEvent(); for(const [p,lvl,tut] of old){ p.L.lvl=lvl; p.tut=tut; }
 T.startEvent('fire'); if(T.EV.fireCooldown!==900) throw Error('Feuerpause fehlt'); T.endEvent();
}
console.log('Ereignis-Auswahl und Feuerpause OK');
// Lexikon: Vögel zählen mit, werden beim ersten deutlichen Sehen entdeckt (+10 EP), alte Spielstände bleiben gültig.
{
 const S=T.S(), P=T.P;
 for(const id of ['vulture','fowl','oxpecker']) if(!T.lexIds.includes(id)) throw Error('Vogel fehlt im Lexikon: '+id);
 S.lex={maus:1}; P.dead=false; P.tree=null;   // alter Spielstand ohne Vogeleinträge
 const f=T.fowl[0]; for(const b of f.birds) b.m.g.visible=false;
 for(const o of T.oxen) o.m.g.visible=false;
 P.x=f.birds[0].x+3; P.z=f.birds[0].z; T.updateLexicon(1);
 if(S.lex.fowl) throw Error('Unsichtbare Perlhühner entdeckt');
 for(const b of f.birds) b.m.g.visible=true;
 P.x=f.birds[0].x+60; T.updateLexicon(1);
 if(S.lex.fowl) throw Error('Perlhühner aus der Ferne entdeckt');
 const xp0=S.xp, lv0=S.lvl; P.x=f.birds[0].x+3; T.updateLexicon(1);
 if(S.lex.fowl!==1||!S.lex.maus) throw Error('Perlhühner nicht entdeckt');
 if(S.xp===xp0&&S.lvl===lv0) throw Error('Keine EP für Perlhühner');
 const xp1=S.xp, lv1=S.lvl; T.updateLexicon(1);
 if(S.lex.vulture||S.lex.oxpecker) throw Error('Vogel ohne Sichtung entdeckt');
 if(!T.fowlSpots().length||T.vultureSpots().some(v=>!isFinite(v.x))) throw Error('Vogelpositionen fehlerhaft');
 console.log('Lexikon-Vögel: '+T.lexIds.length+' Einträge, Perlhühner nah und sichtbar entdeckt, alter Spielstand OK');
}
