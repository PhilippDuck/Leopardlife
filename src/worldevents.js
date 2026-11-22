// LeopardLife – Zufällige Ereignisse (ohne Ansage – man bekommt sie im Spiel mit; nur direkte Gefahr wird gemeldet), damit die Savanne jedes Mal anders verläuft:
//   Gnu-Wanderung  – eine große Herde zieht quer durchs Gebiet, Löwen folgen ihr, in Panik trampeln die Gnus alles nieder.
//   Steppenbrand   – eine Feuerfront wandert mit dem Wind über die Karte; Tiere fliehen kopflos (leichte Beute),
//                    danach ist das hohe Gras abgebrannt (kaum Deckung), bis es nachwächst. Sicher: Bäume, Wasser, der Bau.
//   Rivale         – ein fremder Leopard dringt ins Revier ein, klaut Beute und bedroht die Jungen im Bau.
import { gainXp, hurtPlayer } from './actions.js';
import { animals, placeAnimal } from './animals.js';
import { gunshot, snd, snd3d } from './audio.js';
import { growlAt } from './calls.js';
import { FOOD, SPECIES } from './data.js';
import { scene, windU } from './engine.js';
import { CUB_HOME } from './family.js';
import { denKids, kidDies } from './cubfollow.js';
import { animLegs, buildQuad, makeFur } from './models.js';
import { P, players } from './player.js';
import { H, WORLD, pondAt } from './terrain.js';
import { floatText, toast } from './ui.js';
import { rnd } from './util.js';
import { patches, tallGeo } from './vegetation.js';
import { tutActive } from './tutorial.js';
import { tell } from './coop.js';
import { makeCarcass } from './carcass.js';
import { puff } from './effects.js';
import { goalEvent } from './goals.js';
import { dmg } from './save.js';
import { hearR, visibility } from './vision.js';

/** @type {{on:string|null,t:number,next:number,last:string,dir:{x:number,z:number},s:number,herd:any[],rival:any,panic:number,burnT:number,regrow:number,lionT:number,kidT:number,home:{x:number,z:number}|null}} */
const EV={on:null,t:0,next:rnd(150,240),last:'',dir:{x:1,z:0},s:0,herd:[],rival:null,panic:0,burnT:0,regrow:0,lionT:0,kidT:0,home:null};
const spOf=id=>SPECIES.find(s=>s.id===id);
const maxLvl=()=>Math.max(...players.map(p=>p.L.lvl));

/** Tier nur für die Dauer eines Ereignisses anlegen (verschwindet danach wieder) */
function spawnTemp(sp,x,z,model){
  const fur=model?null:makeFur(), g=model||buildQuad(sp.m,fur); if(!model) g.scale.setScalar(sp.size); scene.add(g);
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

/* ---------- Wilderer ---------- */
/** Einfache Menschenfigur (Beine/Arme passen zu animLegs: 0/3 und 1/2 schwingen gegengleich) mit Gewehr */
function buildHuman(){
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const M=c=>new THREE.MeshLambertMaterial({color:c}), cloth=M(0x5f5a36), skin=M(0x7a4e33), dark=M(0x2b2a24), hat=M(0x4c4229);
  const box=(w,h,d,m,x,y,z)=>{ const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); o.position.set(x,y,z); o.castShadow=true; return o; };
  const limb=(w,h,m,x,y)=>{ const piv=new THREE.Group(); piv.position.set(x,y,0); const o=box(w,h,w,m,0,-h/2,0); piv.add(o); inner.add(piv); return piv; };
  const legL=limb(0.16,0.86,dark,-0.12,0.88), legR=limb(0.16,0.86,dark,0.12,0.88), armL=limb(0.12,0.6,cloth,-0.3,1.45), armR=limb(0.12,0.6,cloth,0.3,1.45);
  inner.add(box(0.48,0.62,0.27,cloth,0,1.2,0));
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.15,10,8),skin); head.position.set(0,1.68,0); inner.add(head);
  const brim=new THREE.Mesh(new THREE.CylinderGeometry(0.27,0.27,0.03,12),hat); brim.position.set(0,1.79,0); inner.add(brim);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,0.14,10),hat); top.position.set(0,1.86,0); inner.add(top);
  const gun=new THREE.Group(); gun.add(box(0.05,0.06,1.05,dark,0,0,0.3)); gun.add(box(0.07,0.13,0.28,M(0x5a3a22),0,-0.04,-0.18)); gun.position.set(0.18,1.38,0.12); inner.add(gun);
  g.userData={inner,legs:[legL,armR,armL,legR],gun}; return g;
}
/** Sieht der Wilderer w Spieler p? (Tarnung, Gras, Schleichen und Baum verstecken) */
function seesPlayer(w,p,dt=0.1){ if(p.dead) return false; const d=Math.hypot(p.x-w.x,p.z-w.z); if(d>60) return false; return d<55*Math.max(0.25,p.stealth==null?1:p.stealth)*visibility(w,p,dt)||d<hearR(p); }
function fire(w,tx,tz){
  gunshot(w.x,w.z); const gy=H(w.x,w.z)+1.4, a=Math.atan2(tx-w.x,tz-w.z);
  puff(w.x+Math.sin(a)*0.9,gy,w.z+Math.cos(a)*0.9,0xffd27a,5,0.25); puff(w.x+Math.sin(a)*1.1,gy+0.1,w.z+Math.cos(a)*1.1,0x9a958a,4,0.45);
  for(const o of animals){ if(o.dead||o.sp.friend||o.sp.human||o.sp.croc) continue; if(Math.hypot(o.x-w.x,o.z-w.z)<90&&o.state!=='chase'&&!o.ev){ o.state='flee'; o.fleeT=0; o.sus=0; } }   // der Knall scheucht alles auf
}
/** Wilderer-Verhalten: streift umher, schießt auf Wild, zielt auf entdeckte Leoparden */
function poachStep(a,dt,move){
  a.shotT-=dt;
  // ein Leopard in Sicht? zielen und schießen
  let tgt=a.aimAt&&!a.aimAt.dead&&a.aimAt.L&&seesPlayer(a,a.aimAt,dt)?a.aimAt:null;
  if(!tgt) for(const p of players) if(seesPlayer(a,p,dt)){ tgt=p; break; }
  if(tgt){ if(a.aimAt!==tgt){ a.aimAt=tgt; a.aimT=0; }
    a.g.rotation.y=Math.atan2(tgt.x-a.x,tgt.z-a.z); a.aimT+=dt; a.g.userData.gun.rotation.x=-0.05;
    if(a.aimT>1.5&&a.shotT<=0){ a.shotT=rnd(3,4.5); a.aimT=0.3; fire(a,tgt.x,tgt.z);
      const mov=Math.hypot(tgt.ctl.fw,tgt.ctl.rt)>0.2, chance=0.7-(mov?0.25:0)-(tgt.sneak?0.15:0)-(tgt.tree!=null?0.2:0);
      if(Math.random()<chance){ hurtPlayer(a.sp.dmg,a,false,tgt); floatText('Schuss!',tgt.x,tgt.y+2,tgt.z,'#ff5a3a'); } else floatText('daneben',tgt.x,tgt.y+2,tgt.z,'#ddd'); }
    animLegs(a.g,a.ph,0.02); return true; }
  a.aimAt=null; a.aimT=0;
  // Wild in Reichweite? stehen bleiben, zielen, schießen
  if(a.shotT<=0){ let prey=null, bd=70; for(const o of animals){ if(o.dead||o.sp.friend||o.sp.human||o.sp.croc||o.held) continue; const d=Math.hypot(o.x-a.x,o.z-a.z); if(d<bd){ bd=d; prey=o; } }
    if(prey){ a.g.rotation.y=Math.atan2(prey.x-a.x,prey.z-a.z); a.prey=prey; a.preyT=(a.preyT||0)+dt; animLegs(a.g,a.ph,0.02);
      if(a.preyT>1.6){ a.preyT=0; a.shotT=rnd(12,22); fire(a,prey.x,prey.z);
        if(Math.random()<0.75&&!prey.dead){ prey.dead=true; prey.state='wander'; prey.respawn=rnd(60,120); prey.wound=null; makeCarcass(prey,FOOD[prey.sp.id]||3); } }
      return true; }
    a.shotT=rnd(3,6); }
  // umherstreifen um ihr Lager
  const h=EV.home||{x:a.x,z:a.z};
  if(Math.hypot(a.tx-a.x,a.tz-a.z)<2){ a.tx=h.x+rnd(-45,45); a.tz=h.z+rnd(-45,45); }
  move(a,a.tx-a.x,a.tz-a.z,2.2,dt); a.g.userData.gun.rotation.x=0.5;
  return true;
}
/** Ein Leopard greift einen Wilderer an: verletzt ihn; ab etwa der Hälfte ergreift er die Flucht (Wilderer werden vertrieben, nicht erlegt) */
function humanHit(a,p){
  let d=dmg(p.L); const amb=a.aimAt!==p&&!a.prey; if(amb) d*=1.6; d=Math.round(d*rnd(0.9,1.1));
  a.hp-=d; p.combatT=5; snd.hit(); puff(a.x,H(a.x,a.z)+1.2,a.z,0x9a958a,4,0.4);
  floatText((amb?'Überrascht! ':'')+'-'+d,a.x,H(a.x,a.z)+2.2,a.z,amb?'#f2b84b':'#fff');
  if(a.hp<=a.sp.hp*0.45&&a.ev==='poach'){ a.ev='leave'; floatText('Vertrieben!',a.x,H(a.x,a.z)+2.6,a.z,'#9be07f'); gainXp(Math.round(a.sp.xp*0.6),p); }
  else if(a.ev==='poach'){ a.aimAt=p; a.aimT=0.9; a.shotT=Math.min(a.shotT,0.6); }
}

/* ---------- Start der Ereignisse ---------- */
const EV_NAMES={migr:'Gnu-Wanderung',fire:'Steppenbrand',rival:'Rivale',poach:'Wilderer'};
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
  if(id==='poach'){
    const sp=spOf('poacher'), q=players[Math.floor(Math.random()*players.length)], an=Math.random()*6.283, r=rnd(95,130), hx=q.x+Math.cos(an)*r, hz=q.z+Math.sin(an)*r, n=Math.random()<0.35?3:2;
    EV.herd=[]; EV.home={x:hx,z:hz};
    for(let i=0;i<n;i++){ const a=spawnTemp(sp,hx+rnd(-8,8),hz+rnd(-8,8),buildHuman()); a.ev='poach'; a.rad=0.45; a.shotT=rnd(4,10); a.aimT=0; a.aimAt=null; a.tx=a.x; a.tz=a.z; EV.herd.push(a); }
  }
  if(id==='rival'){
    const sp=spOf('rival'), q=frontPt(-(WORLD-25),rnd(-60,60)), a=spawnTemp(sp,q.x,q.z); a.ev='rival'; a.hp=Math.round(170+22*maxLvl()); a.maxHp=a.hp; EV.rival=a; EV.kidT=0;
    growlAt(a);
  }
}
function endEvent(msg,col){
  const id=EV.on; EV.on=null; EV.next=rnd(300,480);   // keine Ansage: Ereignisse bekommt man im Spiel selbst mit
  if(id==='fire'){ burnGrass(false); fireFx(false); EV.regrow=240; for(const a of animals) if(a.ev==='fire') a.ev=null; }
  if(id==='migr'||id==='poach') for(const a of EV.herd) if(!a.dead) a.ev='leave';
  if(id==='rival'&&EV.rival&&!EV.rival.dead) EV.rival.ev='leave';
}

/* ---------- Verhalten der Ereignistiere (aus der Tier-KI aufgerufen) ---------- */
/**
 * Übernimmt die Bewegung von Tier a während eines Ereignisses. true = erledigt (die KI macht nur noch Position und Sprungtreffer).
 * @returns {boolean}
 */
function eventStep(a,dt,move){
  const sp=a.sp;
  if(a.ev==='leave'){   // von den Spielern weg und außer Sicht verschwinden
    let q=players[0], qd=1e9; for(const p of players){ const d=Math.hypot(p.x-a.x,p.z-a.z); if(d<qd){ qd=d; q=p; } }
    const dx=a.x-q.x, dz=a.z-q.z; move(a,dx||1,dz,sp.human?6.5:sp.spd*0.8,dt);
    if(qd>175||(!sp.human&&!a.temp&&Math.hypot(a.x,a.z)>WORLD-6)){ a.ev=null; if(a.temp){ a.gone=true; a.dead=true; a.g.visible=false; } } return true; }
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
  if(a.ev==='poach') return poachStep(a,dt,move);
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
    const pool=['migr','rival','poach'].concat(EV.regrow>0?[]:['fire']).filter(id=>id!==EV.last&&(id!=='rival'||maxLvl()>=5)&&(id!=='poach'||maxLvl()>=3));
    startEvent(pool[Math.floor(Math.random()*pool.length)]); return; }
  EV.t+=dt;
  if(EV.on==='migr'){
    EV.panic=Math.max(0,EV.panic-dt);
    // Löwen folgen der Herde
    EV.lionT-=dt; const live=EV.herd.filter(a=>!a.dead);
    if(EV.lionT<=0&&live.length){ EV.lionT=3; const c=live[0]; for(const l of animals) if(!l.dead&&l.sp.id==='lion'&&l.state==='wander'){ l.tx=c.x+rnd(-25,25); l.tz=c.z+rnd(-25,25); l.timer=3.5; } }
    if(!live.length||EV.t>240) endEvent(live.length?'Die Gnus sind weitergezogen.':'Die Gnu-Herde hat die Savanne verlassen.','#b9b7a6');
  }
  if(EV.on==='poach'){
    for(const a of EV.herd) if(a.ev==='poach'&&(a.stun>0||a.scared>0)){ a.stun=0; a.ev='leave'; floatText('Vertrieben!',a.x,H(a.x,a.z)+2.2,a.z,'#9be07f'); }   // Brüllen verscheucht sie
    if(EV.herd.every(a=>a.ev!=='poach')||EV.t>210) endEvent();
  }
  if(EV.on==='fire'){
    EV.s+=dt*3.6; drawFire();
    // Tiere vor der Front fliehen kopflos
    for(const a of animals){ if(a.dead||a.ev||a.sp.croc||a.sp.friend||a.held) continue; const d=along(a.x,a.z)-EV.s; if(d>0&&d<70){ a.ev='fire'; a.state='wander'; a.sus=0; } }
    // Flammen verbrennen, wer drinsteht
    for(const p of players){ if(p.dead||safeFromFire(p)) continue; const d=along(p.x,p.z)-EV.s;
      if(d<0.5&&d>-5){ p.fireT=(p.fireT||0)-dt; if(p.fireT<=0){ p.fireT=0.45; hurtPlayer(6,{sp:{id:'fire',n:'Feuer',dmg:6}},true,p); floatText('Feuer!',p.x,p.y+2,p.z,'#ff8a3a'); } }
    }
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
          players.forEach(p=>tell(p,'Der Rivale greift die Jungen im Bau an!','#ff5a3a'));
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

export { humanHit, EV, eventOn, eventStep, eventsVisual, startEvent, endEvent, updateEvents, EV_NAMES };
