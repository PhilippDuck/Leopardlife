// LeopardLife – Zufällige Ereignisse (ohne Ansage – man bekommt sie im Spiel mit; nur direkte Gefahr wird gemeldet), damit die Savanne jedes Mal anders verläuft:
//   Gnu-Wanderung  – eine große Herde zieht quer durchs Gebiet, Löwen folgen ihr, in Panik trampeln die Gnus alles nieder.
//   Steppenbrand   – eine Feuerfront wandert mit dem Wind über die Karte; Tiere fliehen kopflos (leichte Beute),
//                    danach ist das hohe Gras abgebrannt (kaum Deckung), bis es nachwächst. Sicher: Bäume, Wasser, der Bau.
//   Rivale         – ein fremder Leopard dringt ins Revier ein, klaut Beute und bedroht die Jungen im Bau.
import { hurtPlayer } from './actions.js';
import { animals, placeAnimal } from './animals.js';
import { snd, snd3d } from './audio.js';
import { growlAt } from './calls.js';
import { SPECIES } from './data.js';
import { scene, windU } from './engine.js';
import { CUB_HOME } from './family.js';
import { denKids, kidDies } from './cubfollow.js';
import { buildQuad, makeFur } from './models.js';
import { P, players } from './player.js';
import { H, WORLD, pondAt } from './terrain.js';
import { floatText, toast } from './ui.js';
import { rnd } from './util.js';
import { patches, tallGeo } from './vegetation.js';
import { tutActive } from './tutorial.js';
import { tell } from './coop.js';

/** @type {{on:string|null,t:number,next:number,last:string,dir:{x:number,z:number},s:number,herd:any[],rival:any,panic:number,burnT:number,regrow:number,lionT:number,kidT:number}} */
const EV={on:null,t:0,next:rnd(150,240),last:'',dir:{x:1,z:0},s:0,herd:[],rival:null,panic:0,burnT:0,regrow:0,lionT:0,kidT:0};
const spOf=id=>SPECIES.find(s=>s.id===id);
const maxLvl=()=>Math.max(...players.map(p=>p.L.lvl));

/** Tier nur für die Dauer eines Ereignisses anlegen (verschwindet danach wieder) */
function spawnTemp(sp,x,z){
  const fur=makeFur(), g=buildQuad(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g);
  const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:animals.length,temp:true}; placeAnimal(a);
  a.x=x; a.z=z; a.tx=x; a.tz=z; animals.push(a); return a;
}
/** Ereignistiere, die fertig sind (geflohen oder Kadaver aufgefressen), aus der Welt nehmen */
function sweepTemp(){
  for(let i=animals.length-1;i>=0;i--){ const a=animals[i]; if(!a.temp||!a.gone) continue;
    scene.remove(a.g); a.g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); animals.splice(i,1); }
}

/* ---------- Feuer: Flammen und Rauch als Partikel entlang der Front ---------- */
function dotTex(soft){ try{ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(soft?0.5:0.35,'rgba(255,255,255,'+(soft?0.5:0.7)+')'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }catch(e){ return null; } }
const FLAMES=260, SMOKE=110;
let flames=null, smoke=null;
function fireFx(on){
  if(on&&!flames){
    const mk=(n,size,col,add,op,soft)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
      const m=new THREE.Points(g,new THREE.PointsMaterial({size,color:col,map:dotTex(soft),transparent:true,opacity:op,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending}));
      m.frustumCulled=false; scene.add(m); return m; };
    flames=mk(FLAMES,3.4,0xff7a1e,true,0.9,false); smoke=mk(SMOKE,9,0x5a524a,false,0.32,true);
  }
  if(flames){ flames.visible=on; smoke.visible=on; }
}
/** Position auf der Front: s entlang der Windrichtung, u quer dazu */
const frontPt=(s,u)=>({x:EV.dir.x*s-EV.dir.z*u,z:EV.dir.z*s+EV.dir.x*u});
const along=(x,z)=>x*EV.dir.x+z*EV.dir.z;
const across=(x,z)=>-x*EV.dir.z+z*EV.dir.x;
const safeFromFire=p=>p.tree!=null||pondAt(p.x,p.z,0.3)||Math.hypot(p.x-CUB_HOME.x,p.z-CUB_HOME.z)<7;

function drawFire(){
  const fp=flames.geometry.attributes.position.array, sp=smoke.geometry.attributes.position.array, tm=performance.now()/1000;
  const centers=players.map(p=>across(p.x,p.z));
  for(let i=0;i<FLAMES;i++){ const u=centers[i%centers.length]+(((i*97)%FLAMES)/FLAMES-0.5)*220+Math.sin(tm*3+i)*1.5, s=EV.s-Math.abs(Math.sin(i*12.9+tm*2.3))*5;
    const q=frontPt(s,u), fl=Math.abs(Math.sin(tm*(5+i%7)+i)); const wet=pondAt(q.x,q.z,0.5)||Math.hypot(q.x,q.z)>WORLD;
    fp[i*3]=q.x; fp[i*3+1]=wet?-50:H(q.x,q.z)+0.3+fl*2.2; fp[i*3+2]=q.z; }
  for(let i=0;i<SMOKE;i++){ const u=centers[i%centers.length]+(((i*61)%SMOKE)/SMOKE-0.5)*240, k=((tm*0.15+i*0.37)%1), s=EV.s-4-k*30;
    const q=frontPt(s,u); sp[i*3]=q.x+windU.value.x*k*12; sp[i*3+1]=H(q.x,q.z)+2+k*16; sp[i*3+2]=q.z+windU.value.y*k*12; }
  flames.geometry.attributes.position.needsUpdate=true; smoke.geometry.attributes.position.needsUpdate=true;
  flames.material.opacity=0.75+Math.sin(tm*13)*0.15;
}
/** Hohes Gras hinter der Front abbrennen (Halme werden zu Stoppeln), Verstecke dort fallen weg */
function burnGrass(regrow){
  for(const t of tallGeo){ const pos=t.g.attributes.iPos.array, rs=t.g.attributes.iRS; let ch=false;
    if(!t.orig) t.orig=Float32Array.from(rs.array);
    for(let i=0;i<t.n;i++){ const y=i*2+1;
      if(regrow){ if(rs.array[y]!==t.orig[y]){ rs.array[y]=t.orig[y]; ch=true; } }
      else if(rs.array[y]===t.orig[y]&&along(pos[i*3],pos[i*3+2])<EV.s-2&&Math.hypot(pos[i*3]-CUB_HOME.x,pos[i*3+2]-CUB_HOME.z)>7){ rs.array[y]=0.1; ch=true; } }
    if(ch) rs.needsUpdate=true; }
  for(const p of patches){ if(regrow) p.burnt=false; else if(along(p.x,p.z)<EV.s-p.r&&Math.hypot(p.x-CUB_HOME.x,p.z-CUB_HOME.z)>7) p.burnt=true; }
}

/* ---------- Start der Ereignisse ---------- */
const EV_NAMES={migr:'Gnu-Wanderung',fire:'Steppenbrand',rival:'Rivale'};
function startEvent(id){
  EV.on=id; EV.t=0; EV.last=id; const an=Math.random()*6.283; EV.dir={x:Math.cos(an),z:Math.sin(an)}; snd.alert();
  if(id==='migr'){
    const sp=spOf('gnu'), n=14+Math.floor(Math.random()*6), side=rnd(-70,70); EV.herd=[]; EV.panic=0; EV.lionT=0;
    for(let i=0;i<n;i++){ const q=frontPt(-(WORLD-12)-rnd(0,26),side+rnd(-14,14)); const a=spawnTemp(sp,q.x,q.z); a.ev='migr'; a.gx=rnd(-6,6); EV.herd.push(a); }
  }
  if(id==='fire'){
    // die Front kommt mit dem Wind
    { const wx=windU.value.x||0, wz=windU.value.y||0, l=Math.hypot(wx,wz); if(l>0.1) EV.dir={x:wx/l,z:wz/l}; } EV.s=-(WORLD+5); EV.burnT=0; fireFx(true);
  }
  if(id==='rival'){
    const sp=spOf('rival'), q=frontPt(-(WORLD-25),rnd(-60,60)), a=spawnTemp(sp,q.x,q.z); a.ev='rival'; a.hp=Math.round(170+22*maxLvl()); a.maxHp=a.hp; EV.rival=a; EV.kidT=0;
    growlAt(a);
  }
}
function endEvent(msg,col){
  const id=EV.on; EV.on=null; EV.next=rnd(300,480);   // keine Ansage: Ereignisse bekommt man im Spiel selbst mit
  if(id==='fire'){ burnGrass(false); fireFx(false); EV.regrow=240; for(const a of animals) if(a.ev==='fire') a.ev=null; }
  if(id==='migr') for(const a of EV.herd) if(!a.dead) a.ev='leave';
  if(id==='rival'&&EV.rival&&!EV.rival.dead) EV.rival.ev='leave';
}

/* ---------- Verhalten der Ereignistiere (aus der Tier-KI aufgerufen) ---------- */
/**
 * Übernimmt die Bewegung von Tier a während eines Ereignisses. true = erledigt (die KI macht nur noch Position und Sprungtreffer).
 * @returns {boolean}
 */
function eventStep(a,dt,move){
  const sp=a.sp;
  if(a.ev==='leave'){   // zum nächsten Rand und verschwinden
    const r=Math.hypot(a.x,a.z)||1; move(a,a.x/r,a.z/r,sp.spd*0.8,dt);
    if(r>WORLD-6){ a.gone=true; a.dead=true; a.g.visible=false; } return true; }
  if(a.ev==='migr'){
    const pan=EV.panic>0, fwd=along(a.x,a.z);
    let mx=EV.dir.x, mz=EV.dir.z;
    const side=across(a.x,a.z)-across(EV.herd[0].x,EV.herd[0].z)-a.gx; mx+=EV.dir.z*side*0.03; mz-=EV.dir.x*side*0.03;
    if(!pan){ for(const p of players){ if(p.dead) continue; const d=Math.hypot(p.x-a.x,p.z-a.z); if(d<(p.sneak?5:13)){ EV.panic=7; snd3d(['alarm'],a.x,a.z,1,120,0.85); break; } } }
    if(a.hp<sp.hp) EV.panic=Math.max(EV.panic,5);
    move(a,mx,mz,pan?sp.spd:4.6,dt);
    if(pan){ a.cd-=dt; for(const p of players){ if(p.dead||p.tree!=null) continue; if(Math.hypot(p.x-a.x,p.z-a.z)<a.rad+0.7&&a.cd<=0){ a.cd=1.1; hurtPlayer(7,{sp:{id:'gnu',n:'Gnu',dmg:7}},false,p); floatText('Getrampelt!',p.x,p.y+2,p.z,'#ff7a5c'); } } }
    if(fwd>WORLD-10){ a.gone=true; a.dead=true; a.g.visible=false; }
    return true; }
  if(a.ev==='fire'){   // kopflos mit dem Wind davon
    const r=Math.hypot(a.x,a.z); let mx=EV.dir.x, mz=EV.dir.z; if(r>WORLD-20){ mx+=-a.z/r*0.9; mz+=a.x/r*0.9; }
    move(a,mx,mz,sp.spd*0.85,dt);
    if(along(a.x,a.z)<EV.s-1&&!pondAt(a.x,a.z,0.2)){ a.ev=null; if(a.temp){ a.gone=true; a.dead=true; a.g.visible=false; } else { a.dead=true; a.respawn=rnd(60,120); a.g.visible=false; } }   // von den Flammen eingeholt
    return true; }
  return false;
}

/* ---------- Pro Bild ---------- */
function updateEvents(dt){
  sweepTemp();
  if(EV.regrow>0){ EV.regrow-=dt; if(EV.regrow<=0){ burnGrass(true); } }
  if(!EV.on){
    if(players.some(p=>tutActive(p))) return;
    EV.next-=dt; if(EV.next>0||players.every(p=>p.dead)) return;
    const pool=['migr','rival'].concat(EV.regrow>0?[]:['fire']).filter(id=>id!==EV.last&&(id!=='rival'||maxLvl()>=5));
    startEvent(pool[Math.floor(Math.random()*pool.length)]); return; }
  EV.t+=dt;
  if(EV.on==='migr'){
    EV.panic=Math.max(0,EV.panic-dt);
    // Löwen folgen der Herde
    EV.lionT-=dt; const live=EV.herd.filter(a=>!a.dead);
    if(EV.lionT<=0&&live.length){ EV.lionT=3; const c=live[0]; for(const l of animals) if(!l.dead&&l.sp.id==='lion'&&l.state==='wander'){ l.tx=c.x+rnd(-25,25); l.tz=c.z+rnd(-25,25); l.timer=3.5; } }
    if(!live.length||EV.t>240) endEvent(live.length?'Die Gnus sind weitergezogen.':'Die Gnu-Herde hat die Savanne verlassen.','#b9b7a6');
  }
  if(EV.on==='fire'){
    EV.s+=dt*3.6; drawFire();
    // Tiere vor der Front fliehen kopflos
    for(const a of animals){ if(a.dead||a.ev||a.sp.croc||a.sp.friend||a.held) continue; const d=along(a.x,a.z)-EV.s; if(d>0&&d<70){ a.ev='fire'; a.state='wander'; a.sus=0; } }
    // Flammen verbrennen, wer drinsteht
    for(const p of players){ if(p.dead||safeFromFire(p)) continue; const d=along(p.x,p.z)-EV.s;
      if(d<0.5&&d>-5){ p.fireT=(p.fireT||0)-dt; if(p.fireT<=0){ p.fireT=0.45; hurtPlayer(6,{sp:{id:'fire',n:'Feuer',dmg:6}},true,p); floatText('Feuer!',p.x,p.y+2,p.z,'#ff8a3a'); } }
      else if(d>0&&d<25&&!p.fireWarn){ p.fireWarn=true; tell(p,'⚠ Die Flammen kommen! Lauf weg, durch sie hindurch, auf einen Baum oder ins Wasser.','#ff8a3a'); } }
    // leises Knistern in der Nähe
    EV.burnT-=dt; if(EV.burnT<=0){ EV.burnT=0.5; burnGrass(false); const p=players[0], q=frontPt(EV.s,across(p.x,p.z)); if(Math.abs(along(p.x,p.z)-EV.s)<80) snd3d(['gust'],q.x,q.z,0.7,120,0.6); }
    if(EV.s>WORLD+8){ players.forEach(p=>{ p.fireWarn=false; }); endEvent('Das Feuer ist erloschen. Das hohe Gras ist abgebrannt – kaum Deckung, bis es nachwächst.','#f2b84b'); }
  }
  if(EV.on==='rival'){
    const a=EV.rival;
    if(!a||a.dead){ endEvent('Der Rivale ist besiegt – euer Revier gehört wieder euch!','#9be07f'); return; }
    if(EV.t>260){ endEvent('Der fremde Leopard zieht weiter.','#b9b7a6'); return; }
    if(a.state==='wander'){
      // Ziel: Beute in der Nähe (klauen), sonst die Jungen im Bau
      let best=null, bd=110; for(const o of animals){ if(!o.dead||!o.carc||o.carc.meat<=0||o.carc.tree!=null) continue; const d=Math.hypot(o.x-a.x,o.z-a.z); if(d<bd){ bd=d; best=o; } }
      if(best&&bd<2.5+best.rad){ a.state='scav'; a.carc=best; a.eatT=0; }
      else if(best){ a.tx=best.x; a.tz=best.z; a.timer=1.5; }
      else { a.tx=CUB_HOME.x+rnd(-2,2); a.tz=CUB_HOME.z+rnd(-2,2); a.timer=1.5; }
      // am Bau: greift die Jungen an
      if(Math.hypot(a.x-CUB_HOME.x,a.z-CUB_HOME.z)<5){ const kids=denKids(); EV.kidT-=dt;
        if(kids.length&&EV.kidT<=0){ EV.kidT=1.5; growlAt(a); snd3d(['mew'],CUB_HOME.x,CUB_HOME.z,1.3,100,1.3);
          players.forEach(p=>tell(p,'⚠ Der Rivale greift die Jungen im Bau an!','#ff5a3a'));
          for(const [k,kid] of kids){ kid.hp-=0.09; if(kid.hp<=0) kidDies(k,'wurde vom Rivalen getötet'); } } }
    }
    // stark verletzt: flieht
    if(a.hp<a.maxHp*0.2&&a.ev==='rival'){ a.ev='leave'; endEvent('Der Rivale flieht verwundet – euer Revier gehört wieder euch!','#9be07f'); }
  }
}
/** Rauchschleier über der Welt, solange es brennt (nach der Tageszeit-Farbe aufrufen) */
function eventsVisual(){
  if(EV.on!=='fire') return; const p=P, d=Math.abs(along(p.x,p.z)-EV.s), k=Math.max(0,1-d/160)*0.45, c=new THREE.Color(0x8a6046);
  scene.fog.color.lerp(c,k); if(scene.background&&scene.background.lerp) scene.background.lerp(c,k*0.7);
}
/** Läuft gerade ein Ereignis? (für Tests und Anzeige) */
const eventOn=()=>EV.on;

export { EV, eventOn, eventStep, eventsVisual, startEvent, endEvent, updateEvents, EV_NAMES };
