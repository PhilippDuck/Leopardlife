// LeopardLife – Warnvögel: Perlhühner und Madenhacker verraten Jäger – dich, aber auch Raubtiere, die dir gefährlich werden.
import { animals } from './animals.js';
import { snd } from './audio.js';
import { startFlee } from './carcass.js';
import { tell } from './coop.js';
import { scene } from './engine.js';
import { players } from './player.js';
import { H, WORLD, pondAt } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';

const MAT={}; const wM=c=>MAT[c]||(MAT[c]=new THREE.MeshLambertMaterial({color:c}));
function wbox(w,h,d,c,x,y,z,par){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wM(c)); m.position.set(x,y,z); par.add(m); return m; }
function wball(r,c,x,y,z,sx,sy,sz,par){ const m=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),wM(c)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); par.add(m); return m; }
/** Lautstärke eines Geräuschs bei (x,z): nach dem nächsten Spieler */
const volAt=(x,z,r)=>{ let d=1e9; for(const p of players) d=Math.min(d,Math.hypot(p.x-x,p.z-z)); return Math.max(0,1-d/r); };
const nearestPlayer=(x,z)=>{ let b=null,bd=1e9; for(const p of players){ if(p.dead) continue; const d=Math.hypot(p.x-x,p.z-z); if(d<bd){ bd=d; b=p; } } return b?{p:b,d:bd}:null; };

/* ---------- Perlhühner ----------
   Kleine Trupps picken im Gras. Kommt ein Jäger zu nahe (ein Leopard, der nicht schleicht, früher; ein Raubtier sowieso),
   flattern sie laut gackernd auf und rennen davon – und alles Wild in der Nähe ist gewarnt. Trupps, die weit weg sind,
   ziehen in die Nähe eines Spielers um, damit es auch in der weiten Welt welche gibt. */
const FLOCKS=6, fowl=[];
function buildFowl(){
  const g=new THREE.Group(), body=new THREE.Group(); g.add(body);
  wball(0.17,0x39404c,0,0.24,0,1,0.85,1.25,body);                                    // runder, dunkler Körper
  for(let i=0;i<10;i++){ const a=i*2.4, y=0.24+Math.sin(i*1.7)*0.08; wbox(0.025,0.025,0.025,0xe8ecf2,Math.cos(a)*0.15,y+0.06,Math.sin(a)*0.18,body); }   // weiße Tupfen
  wbox(0.14,0.05,0.12,0x2c323c,0,0.27,-0.2,body);                                    // Schwanz
  const head=new THREE.Group(); head.position.set(0,0.36,0.17); body.add(head);
  wbox(0.04,0.12,0.04,0x5d86c4,0,-0.02,0,head);                                      // nackter, blauer Hals
  wball(0.05,0x5d86c4,0,0.05,0.02,1,1,1.1,head);
  wbox(0.03,0.05,0.03,0xc9a46a,0,0.11,0,head);                                       // Helm
  wbox(0.025,0.025,0.05,0xd8c49a,0,0.04,0.07,head);                                  // Schnabel
  wbox(0.04,0.035,0.02,0xc03a2e,0,0.0,0.055,head);                                   // roter Kehllappen
  const legs=[1,-1].map(s=>wbox(0.025,0.14,0.025,0x6e6a66,s*0.06,0.07,0,g));
  g.scale.setScalar(1.35); g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); scene.add(g);
  return {g,body,head,legs};
}
function placeFlock(f,near){
  let x,z,t=0;
  do{ if(near){ const a=Math.random()*6.283, r=rnd(70,140); x=near.x+Math.cos(a)*r; z=near.z+Math.sin(a)*r; }
      else { const a=Math.random()*6.283, r=rnd(25,WORLD-20); x=Math.cos(a)*r; z=Math.sin(a)*r; } }
  while((pondAt(x,z,1.6)||players.some(p=>Math.hypot(p.x-x,p.z-z)<45))&&++t<20);
  f.x=x; f.z=z; f.alarmT=0; f.calmT=0;
  for(const b of f.birds){ b.x=x+rnd(-3,3); b.z=z+rnd(-3,3); b.tx=b.x; b.tz=b.z; b.alt=0; b.vy=0; b.state='peck'; b.t=rnd(0,3); b.head=Math.random()*6.283; }
}
for(let i=0;i<FLOCKS;i++){ const n=4+Math.floor(Math.random()*4), f={birds:Array.from({length:n},()=>({m:buildFowl()}))}; placeFlock(f,null); fowl.push(f); }

/** Wer stört den Trupp? Spieler (schleichend erst aus der Nähe) oder ein Raubtier */
function fowlThreat(f){
  for(const p of players){ if(p.dead||p.tree!=null) continue; const d=Math.hypot(p.x-f.x,p.z-f.z); if(d<(p.sneak?4.5:10)) return p; }
  for(const a of animals){ if(a.dead||!a.sp.pred||a.sp.croc||a.sp.friend||!a.g.visible) continue; if(Math.hypot(a.x-f.x,a.z-f.z)<11) return a; }
  return null;
}
function fowlAlarm(f,who){
  f.alarmT=3.5; f.calmT=rnd(8,12);
  const ax=who.x-f.x, az=who.z-f.z, al=Math.hypot(ax,az)||1;
  for(const b of f.birds){ b.state='flee'; b.vy=rnd(3.5,5); b.dx=-ax/al+rnd(-0.5,0.5); b.dz=-az/al+rnd(-0.5,0.5); }
  snd.cackle(volAt(f.x,f.z,90));
  floatText('Alarm!',f.x,H(f.x,f.z)+1.4,f.z,'#e8ecf2');
  // gewarnt: Wild in der Nähe flieht
  for(const a of animals){ if(a.dead||a.sp.pred||a.sp.fight||a.sp.friend||a.sp.croc||a.sp.snake||a.state!=='wander') continue; if(Math.hypot(a.x-f.x,a.z-f.z)<32) startFlee(a); }
  const now=performance.now();
  if(!players.includes(who)){   // ein Raubtier hat sie aufgescheucht: Hinweis an Spieler in Hörweite
    for(const p of players) if(!p.dead&&Math.hypot(p.x-f.x,p.z-f.z)<70&&now-(p.fowlMsgAt||-1e9)>60000){ p.fowlMsgAt=now; tell(p,'Perlhühner schlagen Alarm – dort ist ein '+who.sp.n+'!','#e8ecf2'); }
  } else if(now-(who.fowlMsgAt||-1e9)>90000){ who.fowlMsgAt=now; tell(who,'Die Perlhühner haben dich verraten – schleichend kommst du näher heran.','#e8ecf2'); }
}
function updateFowl(f,dt){
  const near=nearestPlayer(f.x,f.z);
  if(!near||near.d>260){ placeFlock(f,players[Math.floor(Math.random()*players.length)]); return; }
  const vis=near.d<150;
  if(f.alarmT>0) f.alarmT-=dt; else if(f.calmT>0) f.calmT-=dt;
  else { const w=fowlThreat(f); if(w) fowlAlarm(f,w); }
  let cx=0, cz=0;
  for(const b of f.birds){
    const m=b.m; b.t+=dt;
    if(b.state==='flee'){
      const sp=b.alt>0.05?7:5.5; b.x+=b.dx*sp*dt; b.z+=b.dz*sp*dt; b.head=Math.atan2(b.dx,b.dz);
      b.vy-=9*dt; b.alt=Math.max(0,b.alt+b.vy*dt); if(b.alt<=0) b.vy=0;
      m.legs.forEach((l,i)=>l.rotation.x=Math.sin(b.t*22+i*3)*0.7);
      m.body.rotation.x=-0.15; m.head.rotation.x=-0.2;
      if(f.alarmT<=0&&b.alt<=0){ b.state='peck'; b.tx=b.x; b.tz=b.z; }
    } else {
      // picken: kurze Schritte, Kopf runter, ab und zu umschauen
      if(b.t>rnd(1.5,4)){ b.t=0; b.tx=f.x+rnd(-3.5,3.5); b.tz=f.z+rnd(-3.5,3.5); }
      const dx=b.tx-b.x, dz=b.tz-b.z, d=Math.hypot(dx,dz);
      if(d>0.15){ const s=Math.min(d,dt*0.9); b.x+=dx/d*s; b.z+=dz/d*s; b.head+=(Math.atan2(dx,dz)-b.head)*Math.min(1,dt*5); m.legs.forEach((l,i)=>l.rotation.x=Math.sin(b.t*12+i*3)*0.5); }
      else m.legs.forEach(l=>l.rotation.x=0);
      const peck=Math.max(0,Math.sin(b.t*5+b.head*3)); m.head.rotation.x=0.9*peck; m.body.rotation.x=0.25*peck;
    }
    cx+=b.x; cz+=b.z;
    m.g.visible=vis; if(vis){ m.g.position.set(b.x,H(b.x,b.z)+b.alt,b.z); m.g.rotation.y=b.head; }
  }
  f.x=cx/f.birds.length; f.z=cz/f.birds.length;
}

/* ---------- Madenhacker ----------
   Kleine braune Vögel mit rotem Schnabel sitzen auf dem Rücken großer Huftiere. Kommt ein Leopard zu nahe, fliegen sie
   zischend auf – und ihr Wirt flieht. Wer schleicht, kommt dichter heran. */
const OX_MAX=12, oxen=[];
const HOSTS={deer:1,anti:1,gnu:1,giant:1};
function buildOx(){
  const g=new THREE.Group();
  wball(0.06,0x7a5a3c,0,0,0,1,0.9,1.5,g); wball(0.04,0x8a6a48,0,0.035,0.08,1,1,1,g);
  wbox(0.015,0.015,0.05,0xd23a2a,0,0.03,0.13,g); wbox(0.05,0.012,0.06,0x5c4128,0,0.0,-0.1,g);
  const wl=wbox(0.12,0.01,0.05,0x6a4e34,0.07,0.02,0,g), wr=wbox(0.12,0.01,0.05,0x6a4e34,-0.07,0.02,0,g); wl.visible=wr.visible=false;
  g.scale.setScalar(1.6); g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); g.visible=false; scene.add(g);
  return {g,wl,wr};
}
/** Sitzplatz auf dem Rücken des Wirts (Weltkoordinaten) */
function backSeat(o){
  const h=o.host, s=h.sp.size*(h.juv?0.55:1), ry=h.g.rotation.y, off=o.slot*0.35-0.15;
  return {x:h.x+Math.sin(ry)*off*s, z:h.z+Math.cos(ry)*off*s, y:H(h.x,h.z)+s*(h.sp.id==='giant'?1.0:1.12), ry};
}
function updateOxpeckers(dt){
  // neue Vögel für sichtbare große Huftiere in Spielernähe
  if(oxen.filter(o=>o.on).length<OX_MAX&&Math.random()<dt*2){
    const cand=animals.filter(a=>!a.dead&&!a.juv&&HOSTS[a.sp.id]&&a.g.visible&&a.state!=='flee'&&a.oxp==null&&players.some(p=>Math.hypot(p.x-a.x,p.z-a.z)<70));
    if(cand.length){ const h=cand[Math.floor(Math.random()*cand.length)];
      if(Math.random()<0.4){ const n=1+(Math.random()<0.4?1:0); h.oxp=n;
        for(let i=0;i<n;i++){ let o=oxen.find(q=>!q.on); if(!o){ o={m:buildOx()}; oxen.push(o); } Object.assign(o,{on:true,host:h,slot:i,state:'sit',t:rnd(0,2),x:h.x,z:h.z,y:0,ry:0,away:0}); } }
      else h.oxp=0; } }
  const now=performance.now();
  for(const o of oxen){ if(!o.on) continue;
    const h=o.host, m=o.m; o.t+=dt;
    if(h.dead||!h.g.visible||h.held){ o.state='leave'; }
    if(o.state==='sit'){
      const seat=backSeat(o); o.x=seat.x; o.z=seat.z; o.y=seat.y+Math.abs(Math.sin(o.t*3))*0.03*(Math.sin(o.t*0.7)>0.6?1:0); o.ry=seat.ry+Math.sin(o.t*0.5)*0.6;
      m.wl.visible=m.wr.visible=false;
      // Jäger zu nahe: aufschrecken, der Wirt flieht
      const np=nearestPlayer(h.x,h.z);
      if(np&&np.p.tree==null&&np.d<(np.p.sneak?7:13)){
        for(const q of oxen) if(q.on&&q.host===h){ q.state='fly'; q.t=0; q.away=rnd(12,20); }
        snd.hiss(volAt(h.x,h.z,60)); floatText('tsss',h.x,H(h.x,h.z)+h.sp.size*1.8,h.z,'#d8c09a');
        if(h.state==='wander'||h.state==='drink') startFlee(h);
        if(now-(np.p.oxMsgAt||-1e9)>120000){ np.p.oxMsgAt=now; tell(np.p,'Madenhacker warnen ihren Wirt – schleich dich langsamer an.','#d8c09a'); }
      }
    } else if(o.state==='fly'){
      // kreisen über dem Wirt, bis sich alles beruhigt hat, dann wieder landen
      const a=o.t*2.4+o.slot*3; o.x=h.x+Math.cos(a)*3; o.z=h.z+Math.sin(a)*3; o.y=H(h.x,h.z)+h.sp.size*1.4+2.5+Math.sin(o.t*3)*0.4; o.ry=a+Math.PI/2;
      m.wl.visible=m.wr.visible=true; const f=Math.sin(o.t*30)*0.7; m.wl.rotation.z=f; m.wr.rotation.z=-f;
      o.away-=dt; if(o.away<=0&&h.state==='wander'){ o.state='sit'; }
    } else {
      o.y+=dt*4; o.x+=Math.sin(o.ry)*6*dt; o.z+=Math.cos(o.ry)*6*dt; m.wl.visible=m.wr.visible=true; const f=Math.sin(o.t*30)*0.7; m.wl.rotation.z=f; m.wr.rotation.z=-f;
      if(o.t>6||o.state==='leave'&&o.y>H(o.x,o.z)+25){ o.on=false; m.g.visible=false; if(h.oxp!=null) h.oxp=null; continue; }
    }
    m.g.visible=true; m.g.position.set(o.x,o.y,o.z); m.g.rotation.y=o.ry;
  }
  // Wirte ohne Vögel geben ihren Platz nach einer Weile wieder frei (damit später neue kommen können)
  for(const a of animals) if(a.oxp===0&&Math.random()<dt*0.01) a.oxp=null;
}

function updateWildBirds(dt){
  for(const f of fowl) updateFowl(f,dt);
  updateOxpeckers(dt);
}

export { updateWildBirds };
