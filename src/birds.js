// LeoLife – Geier: kommen erst, wenn irgendwo ein Kadaver liegt, kreisen lange darüber, landen nacheinander und fressen.
// Wer sich nähert, verscheucht sie – sie kreisen dann wieder, bis die Luft rein ist. So kann man sich den Kadaver sichern.
import { animals } from './animals.js';
import { scene } from './engine.js';
import { players } from './player.js';
import { H } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';

const MAX=7;                      // höchstens so viele Geier gleichzeitig in der Welt
const CIRCLE_T=[30,50];           // so lange kreisen sie, bevor der erste landet (Sekunden)
const ARRIVE_T=[15,35];           // so lange nach dem Tod eines Tieres, bis die ersten am Himmel auftauchen
const vultures=[];

/* ---------- Modell ----------
   Weißrückengeier im Blockstil der übrigen Tiere: dunkelbrauner Körper, heller Halskragen, nackter rosa-grauer Kopf mit dunklem
   Hakenschnabel, breite Flügel mit hellem Band auf der Unterseite und gespreizten Handschwingen („Fingern“), kurzer breiter Schwanz.
   Vorn ist +z. Flügel: Schultergelenk (wing) und Handgelenk (outer) – zum Anlegen schwenken beide nach hinten. */
const VMAT={}; const vM=c=>VMAT[c]||(VMAT[c]=new THREE.MeshLambertMaterial({color:c}));
function vbox(w,h,d,c,x,y,z,par){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),vM(c)); m.position.set(x,y,z); par.add(m); return m; }
const VC={body:0x3a3029,back:0x5e4d3c,ruff:0xe6dccb,skin:0xb98f86,beak:0x2a2622,band:0x9c8b72,feather:0x241e19,leg:0x6d6a66};
function makeWing(side,root){
  const wing=new THREE.Group(); wing.position.set(side*0.17,0.1,0.06); root.add(wing);
  vbox(0.78,0.05,0.46,VC.body,side*0.39,0,0,wing);                 // Armflügel
  vbox(0.7,0.02,0.16,VC.band,side*0.38,-0.03,-0.08,wing);          // helles Band unten
  vbox(0.62,0.03,0.18,VC.back,side*0.35,0.03,0.13,wing);           // Deckfedern
  const outer=new THREE.Group(); outer.position.set(side*0.78,0,0); wing.add(outer);
  vbox(0.42,0.04,0.38,VC.body,side*0.21,0,-0.02,outer);            // Handflügel
  for(let i=0;i<5;i++){ const f=vbox(0.36,0.02,0.07,VC.feather,0,0,0,outer);   // gespreizte Handschwingen
    const a=(i-2)*0.17; f.position.set(side*(0.5+Math.cos(a)*0.08),0,0.12-i*0.075); f.rotation.y=-side*a; }
  return {wing,outer};
}
function buildVulture(){
  const g=new THREE.Group(), root=new THREE.Group(); g.add(root);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.3,10,8),vM(VC.body)); body.scale.set(0.8,0.68,1.55); root.add(body);
  const back=new THREE.Mesh(new THREE.SphereGeometry(0.26,10,6),vM(VC.back)); back.scale.set(0.82,0.4,1.3); back.position.set(0,0.1,-0.02); root.add(back);
  const ruff=new THREE.Mesh(new THREE.SphereGeometry(0.15,10,8),vM(VC.ruff)); ruff.scale.set(1.25,0.95,0.85); ruff.position.set(0,0.08,0.38); root.add(ruff);
  vbox(0.36,0.04,0.34,VC.feather,0,0.02,-0.58,root); vbox(0.26,0.03,0.12,VC.body,0,0.03,-0.4,root);   // Schwanz
  const neck=new THREE.Group(); neck.position.set(0,0.1,0.42); root.add(neck);
  const nk=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.06,0.3,6),vM(VC.skin)); nk.rotation.x=Math.PI/2; nk.position.z=0.14; neck.add(nk);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.085,8,6),vM(VC.skin)); head.scale.set(0.9,0.85,1.2); head.position.set(0,0.02,0.32); neck.add(head);
  vbox(0.05,0.06,0.1,VC.beak,0,0.0,0.43,neck); vbox(0.04,0.05,0.04,VC.beak,0,-0.035,0.47,neck);   // Hakenschnabel
  [1,-1].forEach(s=>vbox(0.02,0.022,0.022,0x111111,s*0.06,0.04,0.35,neck));                 // Augen
  const L=makeWing(1,root), R=makeWing(-1,root);
  const legs=[1,-1].map(s=>{ const l=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,0.34,5),vM(VC.leg)); l.position.set(s*0.1,-0.3,0.02); root.add(l); return l; });
  const sh=new THREE.Mesh(new THREE.CircleGeometry(0.5,10),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:0.2,depthWrite:false})); sh.rotation.x=-Math.PI/2; scene.add(sh);
  g.traverse(o=>{ if(o.isMesh){ o.castShadow=false; } });
  g.scale.setScalar(0.8); g.visible=false; sh.visible=false; scene.add(g);
  return {g,root,neck,L,R,legs,sh};
}
/** Flügelhaltung: spread 0 = angelegt, 1 = ausgebreitet; lift = Flügelschlag/V-Stellung (Bogenmaß) */
function pose(m,spread,lift){
  for(const [w,s] of [[m.L,1],[m.R,-1]]){
    w.wing.rotation.y=s*(1.35*(1-spread)); w.outer.rotation.y=s*(2.75*(1-spread));
    w.wing.rotation.z=s*lift*(0.3+0.7*spread); w.outer.rotation.z=s*lift*0.5*spread;
  }
}

/* ---------- Verhalten ----------
   in:     fliegt von weit her auf den Kadaver zu
   circle: kreist lange und sinkt langsam; landet erst, wenn niemand am Kadaver ist
   land:   gleitet in einer flachen Bahn herunter (nacheinander, nicht alle gleichzeitig)
   feed:   frisst mit halb geöffneten Flügeln, hüpft ab und zu um den Kadaver
   flee:   aufgescheucht – flattert hoch und kreist wieder
   leave:  fliegt davon und verschwindet */
function spawn(c,i){
  let v=vultures.find(o=>!o.on);
  if(!v){ if(vultures.length>=MAX) return; v={m:buildVulture()}; vultures.push(v); }
  const an=Math.random()*6.283, r=rnd(110,140);
  Object.assign(v,{on:true,c,x:c.x+Math.cos(an)*r,z:c.z+Math.sin(an)*r,alt:rnd(32,40),state:'in',head:an+Math.PI,bank:0,
    rad:rnd(9,14),dir:Math.random()<0.5?1:-1,ang:an,circleT:rnd(CIRCLE_T[0],CIRCLE_T[1])+i*rnd(6,12),waitT:0,eat:0,ph:Math.random()*6,
    hopT:rnd(2,5),lx:0,lz:0,flap:0,pitch:0,peck:0,delay:i*rnd(2,5)});
  v.m.g.visible=v.m.sh.visible=false;
}
const onGround=c=>c&&c.dead&&c.carc&&c.carc.meat>0&&c.carc.tree==null;
/** Ist jemand am Kadaver, der die Geier fernhält? (Spieler, Aasfresser, Raubtiere; wer Beute zieht, sowieso) */
function threat(c,r){
  for(const p of players){ if(p.dead) continue; if(p.drag===c) return true; if(p.tree==null&&Math.hypot(p.x-c.x,p.z-c.z)<r) return true; }
  for(const a of animals){ if(a.dead||!(a.sp.pred||a.state==='scav')||a.sp.croc||a.sp.friend) continue; if(Math.hypot(a.x-c.x,a.z-c.z)<r*0.8) return true; }
  return false;
}
/** Verscheucht ein Spieler einen fressenden Geier? Laufen und Springen schrecken früher als Schleichen. */
function scaredBy(v){
  for(const p of players){ if(p.dead||p.tree!=null) continue; const d=Math.hypot(p.x-v.x,p.z-v.z);
    if(d<(p.pounce>0?11:p.sneak?3.5:7.5)) return p; }
  for(const a of animals){ if(!a.dead&&(a.sp.pred||a.state==='scav')&&!a.sp.croc&&!a.sp.friend&&Math.hypot(a.x-v.x,a.z-v.z)<4) return a; }
  return null;
}
function steer(v,tx,tz,spd,dt){
  const dx=tx-v.x, dz=tz-v.z, d=Math.hypot(dx,dz); if(d<1e-3) return d;
  const want=Math.atan2(dx,dz); let df=want-v.head; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  const turn=Math.max(-1.6,Math.min(1.6,df*2.2)); v.head+=turn*dt; v.bank+=(-turn*0.35-v.bank)*Math.min(1,dt*3);
  const s=Math.min(spd*dt,d); v.x+=Math.sin(v.head)*s; v.z+=Math.cos(v.head)*s; return d;
}
function scare(v,who){
  for(const o of vultures) if(o.on&&o.c===v.c&&(o.state==='feed'||o.state==='land')){ o.state='flee'; o.flap=1.2; o.circleT=rnd(25,40); }
  const c=v.c, now=performance.now();
  if(players.includes(who)&&now-(c.vultMsgAt||-1e9)>8000){ c.vultMsgAt=now; floatText('Geier verscheucht!',c.x,H(c.x,c.z)+2.2,c.z,'#e0c08a'); }
}
function updateVulture(v,dt){
  const c=v.c, valid=onGround(c);
  if(!valid&&v.state!=='leave'){ v.state='leave'; }
  if(v.delay>0){ v.delay-=dt; return; }
  let spread=1, lift=0.12, spd=0;
  if(v.state==='in'){
    spd=13; steer(v,c.x+Math.cos(v.ang)*v.rad,c.z+Math.sin(v.ang)*v.rad,spd,dt); v.alt+=(28-v.alt)*Math.min(1,dt*0.2);
    if(Math.hypot(c.x-v.x,c.z-v.z)<v.rad+10){ v.state='circle'; v.ang=Math.atan2(v.z-c.z,v.x-c.x); }
  } else if(v.state==='circle'||v.state==='flee'){
    // gemächliche Kreise im Aufwind; die Höhe sinkt mit der Zeit, bei Gefahr steigen sie wieder
    const danger=threat(c,14);
    if(v.state==='flee'){ v.alt+=dt*6; v.flap=Math.max(v.flap,0.7); if(v.alt>=14) v.state='circle'; }
    v.ang+=v.dir*dt*7/v.rad; spd=8;
    steer(v,c.x+Math.cos(v.ang)*v.rad,c.z+Math.sin(v.ang)*v.rad,spd,dt);
    if(danger){ v.waitT+=dt; v.circleT=Math.max(v.circleT,8); }
    else v.circleT-=dt;
    const goal=danger?22:Math.max(10,10+v.circleT*0.4);
    if(v.state==='circle') v.alt+=(goal-v.alt)*Math.min(1,dt*0.15);
    if(v.waitT>120){ v.state='leave'; }
    // landen: nur wenn die Luft rein ist und gerade kein anderer im Landeanflug ist
    else if(v.state==='circle'&&v.circleT<=0&&!danger&&!vultures.some(o=>o.on&&o!==v&&o.c===c&&o.state==='land')){
      const a=Math.random()*6.283, r=rnd(1.5,2.4); v.lx=c.x+Math.cos(a)*r; v.lz=c.z+Math.sin(a)*r; v.state='land'; }
  } else if(v.state==='land'){
    const d=Math.hypot(v.lx-v.x,v.lz-v.z);
    spd=Math.max(3,Math.min(9,d*0.5)); steer(v,v.lx,v.lz,spd,dt); v.alt+=(Math.max(0,(d-0.4)*0.55)-v.alt)*Math.min(1,dt*1.5);
    if(d<6) v.flap=Math.max(v.flap,0.9);   // Abbremsen mit kräftigen Schlägen
    if(threat(c,9)) { v.state='flee'; v.flap=1.2; }
    else if(d<0.35){ v.state='feed'; v.alt=0; v.eat=0; v.x=v.lx; v.z=v.lz; }
  } else if(v.state==='feed'){
    const who=scaredBy(v); if(who){ scare(v,who); }
    else {
      // dem Kadaver zugewandt, Flügel halb geöffnet über der Beute („Manteln“), pickt und reißt
      const want=Math.atan2(c.x-v.x,c.z-v.z); let df=want-v.head; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283; v.head+=df*Math.min(1,dt*4); v.bank*=0.9;
      spread=0.35+0.1*Math.sin(v.ph*0.7); lift=0.25; v.peck=Math.max(0,Math.sin(v.ph*3.4));
      v.hopT-=dt; if(v.hopT<=0){ v.hopT=rnd(3,7); const a=Math.random()*6.283, r=rnd(1.4,2.4); v.lx=c.x+Math.cos(a)*r; v.lz=c.z+Math.sin(a)*r; }
      const hd=Math.hypot(v.lx-v.x,v.lz-v.z); if(hd>0.15){ const s=Math.min(hd,dt*2); v.x+=(v.lx-v.x)/hd*s; v.z+=(v.lz-v.z)/hd*s; v.alt=Math.abs(Math.sin(v.ph*6))*0.15; spread=0.7; v.flap=Math.max(v.flap,0.3); } else v.alt=0;
      v.eat+=dt; c.carc.t=Math.max(c.carc.t,30);
      if(v.eat>=7){ v.eat=0; c.carc.meat=Math.max(0,c.carc.meat-1); }
    }
  } else if(v.state==='leave'){
    spd=12; v.alt+=dt*3; v.head+=dt*0.05; v.bank*=0.95; v.x+=Math.sin(v.head)*spd*dt; v.z+=Math.cos(v.head)*spd*dt;
    if(players.every(p=>Math.hypot(p.x-v.x,p.z-v.z)>170)){ v.on=false; v.c=null; v.m.g.visible=v.m.sh.visible=false; return; }
  }
  v.ph+=dt*(spd>0?2:1);
  // Fliegen: Geier segeln fast nur, mit leichter V-Stellung; geschlagen wird beim Starten, Landen und Aufsteigen
  v.flap=Math.max(0,v.flap-dt*0.6);
  const air=v.alt>0.05||v.state!=='feed', beat=v.flap>0?Math.sin(v.ph*7)*0.7*Math.min(1,v.flap):0;
  if(v.state==='feed'&&v.alt<0.05&&v.flap<=0) pose(v.m,spread,lift); else pose(v.m,1,(air?0.1:0.25)+beat);
  const m=v.m, gy=H(v.x,v.z), sit=v.state==='feed';
  m.g.visible=true; m.g.position.set(v.x,gy+(sit?0.36:0.3)+v.alt,v.z); m.g.rotation.set(0,v.head,0);
  m.root.rotation.set(sit?-0.3:0,0,sit?0:v.bank);
  m.neck.rotation.x=sit?0.35+v.peck*0.7:0.25;
  m.legs.forEach(l=>l.visible=v.alt<3);
  m.sh.visible=v.alt<25; m.sh.position.set(v.x,gy+0.05,v.z); const k=Math.max(0.3,1-v.alt/25); m.sh.scale.set(k*(sit?0.8:1.8),k*(sit?0.8:1.8),1); m.sh.material.opacity=0.22*k;
}
function updateBirds(dt){
  for(const a of animals){
    if(!onGround(a)) continue;
    const mine=vultures.filter(v=>v.on&&v.c===a);
    if(mine.length) a.carc.t=Math.max(a.carc.t,30);   // liegt, bis die Geier fertig sind (oder sie aufgeben)
    if(a.vultC!==a.carc){ a.vultC=a.carc; a.vultT=rnd(ARRIVE_T[0],ARRIVE_T[1]); }    // neuer Kadaver: Geier kommen erst nach einer Weile
    if(a.vultT>0){ a.vultT-=dt; if(a.vultT<=0){
      const free=MAX-vultures.filter(v=>v.on).length, meat=a.carc.meat, n=Math.min(free,meat>=8?3+(Math.random()<0.4?1:0):meat>=3?2:1);
      for(let i=0;i<n;i++) spawn(a,i); } }
  }
  for(const v of vultures) if(v.on) updateVulture(v,dt);
}

export { updateBirds };
