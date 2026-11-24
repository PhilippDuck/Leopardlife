// LeoLife – Paviane: Trupps aus Männchen, Weibchen und Jungen. Sie suchen am Boden nach Futter und ruhen und schlafen
// in ihrem Baum. Bei Gefahr bellen sie Alarm – dann flieht auch das Wild in der Nähe. Einen Leoparden in ihrem Baum
// dulden sie nicht: Die Männchen klettern hinauf und greifen an. „Baum = sicher“ gilt bei Pavianen nicht.
import { hurtPlayer } from './actions.js';
import { moveAnimal } from './ai.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { tell } from './coop.js';
import { dayF } from './daynight.js';
import { goalEvent } from './goals.js';
import { animLegs } from './models.js';
import { players } from './player.js';
import { D } from './save.js';
import { H } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';
import { trees } from './vegetation.js';

const TROOPS=[];
const BAB_ALARM_R=15, BAB_SNEAK_R=6;   // so nah kommt ein Leopard am Boden, bis der Trupp bellt (schleichend / normal)
const BAB_PRED_R=18;                   // andere Raubtiere fallen ihnen schon von weiter auf
const BAB_FEAR_R=26;                   // solange die Gefahr näher ist, bleibt der Trupp in Alarm
const BAB_WARN_R=35;                   // so weit hört das Wild den Warnruf
const BAB_TREE_R=24;                   // ein Leopard in einem Baum so nah am Trupp wird angegriffen
const BAB_HOME_R=50;                   // so weit laufen sie höchstens zu ihrem Baum
const BAB_MOB_MAX=25;                  // so lange halten die Männchen einen Angriff im Baum durch, dann geben sie auf
const babNight=()=>dayF<0.22;

/** Lautstärke eines Geräuschs bei (x,z) nach dem nächsten Spieler */
function babVol(x,z,r){ let d=1e9; for(const p of players) d=Math.min(d,Math.hypot(p.x-x,p.z-z)); return Math.max(0,1-d/r); }

/** Trupp des Pavians a. Er entsteht beim ersten Aufruf aus der Herde; Junge gehören zum Trupp ihrer Mutter.
    Ein bis zwei Erwachsene ohne Junge werden Männchen: größer und mit hellem Mantel. */
function troopOf(a){
  if(a.troop) return a.troop;
  if(a.juv){ const m=a.mom; return m&&!m.juv?(a.troop=troopOf(m)):null; }
  const herd=a.herd||[a];
  let tr=herd.troop;
  if(!tr){
    tr={herd,all:[],cx:a.x,cz:a.z,alarmT:0,calmT:0,barkT:0,homeT:0,threat:null,home:null,homeI:-1,mobCd:0,mobP:null,goal:false};
    herd.troop=tr; TROOPS.push(tr);
    const free=herd.filter(m=>!m.kids||!m.kids.length).reverse(), nM=herd.length>=6?2:1;
    for(const m of free.slice(0,nM)){ m.male=true; m.g.scale.setScalar(m.sp.size*1.15); m.rad=m.sp.size*1.15*0.8+0.25; if(m.g.userData.mane) m.g.userData.mane.visible=true; }
  }
  return a.troop=tr;
}
/** Schlafbaum des Trupps: der nächste Baum bei der Truppmitte (neu gesucht, wenn er verschwunden oder zu weit weg ist) */
function homeTree(tr){
  if(tr.home&&trees[tr.homeI]===tr.home&&Math.hypot(tr.home.x-tr.cx,tr.home.z-tr.cz)<70) return tr.home;
  tr.home=null; tr.homeI=-1;
  if(tr.homeT>0) return null;   // ohne Baum in der Nähe erst in zwei Sekunden wieder suchen
  tr.homeT=2; let bi=-1, bd=60;
  for(let i=0;i<trees.length;i++){ const t=trees[i]; if(!t||!t.perch) continue; const d=Math.hypot(t.x-tr.cx,t.z-tr.cz); if(d<bd){ bd=d; bi=i; } }
  tr.homeI=bi; tr.home=bi>=0?trees[bi]:null; return tr.home;
}
const leopardIn=i=>players.some(p=>!p.dead&&p.tree===i&&p.climbT>0.3);
function bark(tr,v,text){
  snd.bark(babVol(tr.cx,tr.cz,110)*v);
  if(text){ const m=tr.all.find(a=>!a.dead&&a.male)||tr.all.find(a=>!a.dead); if(m) floatText('Wahu!',m.x,(m.g.position.y||H(m.x,m.z))+m.sp.size*2,m.z,'#e0cf9a'); }
}

/* ---------- Alarm ---------- */
/** Wer bedroht den Trupp? Ein Leopard am Boden (schleichend erst aus der Nähe) oder ein anderes Raubtier */
function troopThreat(tr){
  for(const p of players){ if(p.dead||p.tree!=null) continue; const r=(p.sneak?BAB_SNEAK_R:BAB_ALARM_R)*(p.stealth==null?1:p.stealth);
    for(const a of tr.all) if(!a.dead&&Math.hypot(p.x-a.x,p.z-a.z)<r) return p; }
  for(const o of animals){ if(o.dead||!o.sp.pred||o.sp.croc||o.sp.friend||o.sp.snake||!o.g.visible) continue;
    if(Math.hypot(o.x-tr.cx,o.z-tr.cz)<BAB_PRED_R) return o; }
  return null;
}
/** Warnruf: der Trupp bellt, das Wild in der Nähe flieht, Weibchen und Junge flüchten in den Baum. Die Männchen bleiben
    vor einem Leoparden stehen und drohen; vor anderen Raubtieren klettern auch sie hinauf. */
function troopAlarm(tr,who){
  tr.alarmT=8; tr.threat=who; tr.barkT=rnd(2.5,4);
  bark(tr,1,true);
  for(const a of animals){ if(a.dead||a.sp.pred||a.sp.fight||a.sp.friend||a.sp.croc||a.sp.snake||a.state!=='wander') continue;
    if(Math.hypot(a.x-tr.cx,a.z-tr.cz)<BAB_WARN_R){ a.state='flee'; a.fleeT=0; } }
  const leo=players.includes(who);
  for(const a of tr.all){ if(a.dead||a.held||a.juv||a.bab==='mob'||a.state==='chase') continue;
    if(a.male&&leo) continue;
    if(!goPerch(a,tr,rnd(10,18),true)&&!a.bab){ a.state='flee'; a.fleeT=0; } }
  const now=performance.now();
  if(leo){ if(now-(who.babMsgAt||-1e9)>90000){ who.babMsgAt=now; tell(who,'Die Paviane bellen Alarm – das Wild in der Nähe ist gewarnt. Schleichend kommst du näher heran.','#e0cf9a'); } }
  else for(const p of players) if(!p.dead&&Math.hypot(p.x-tr.cx,p.z-tr.cz)<80&&now-(p.babMsgAt||-1e9)>60000){ p.babMsgAt=now; tell(p,'Paviane bellen Alarm – dort ist ein '+who.sp.n+'!','#e0cf9a'); }
}

/* ---------- Baum: hinauf, sitzen, hinunter ---------- */
/** Pavian a läuft zum Baum des Trupps und klettert hinauf (fast: auf der Flucht). false, wenn kein Baum erreichbar ist. */
function goPerch(a,tr,time,fast){
  const t=homeTree(tr);
  if(!t||a.bab||Math.hypot(t.x-a.x,t.z-a.z)>BAB_HOME_R||leopardIn(tr.homeI)) return false;
  a.bab='perch'; a.perchI=tr.homeI; a.perchT=time; a.fast=fast; a.up=0; a.state='wander'; a.idle=0;
  return true;
}
/** Sitzplatz eines Pavians in der Krone (fest je Tier, damit sie sich verteilen) */
function perchSpot(a,t){
  const k=a.uid*2.39996, r=Math.min(1.7,(t.rx||2)*0.45)*(0.55+0.45*((a.uid%3)/2));
  a.sx=t.x+t.perch[0]*0.5+Math.cos(k)*r; a.sz=t.z+t.perch[2]*0.5+Math.sin(k)*r; a.sy=t.y+t.perch[1]*(0.78+0.1*(a.uid%3));
}
/** Zum Stamm von Baum t laufen. true: angekommen, das Klettern beginnt. */
function toTrunk(a,t,spd,dt){
  const dx=t.x-a.x, dz=t.z-a.z, d=Math.hypot(dx,dz);
  if(d>(t.tr||0.3)+a.rad+1.3){ moveAnimal(a,dx,dz,spd,dt); a.g.position.set(a.x,H(a.x,a.z),a.z); return false; }
  a.bx=a.x; a.bz=a.z; a.up=0.001; return true;
}
/** Zwischen Stamm (am Boden) und Sitzplatz (a.sx, a.sy, a.sz) nach Kletterfortschritt a.up stellen */
function placeClimb(a,dt){
  const u=a.up, e=u*u*(3-2*u), gy=H(a.bx,a.bz);
  a.x=a.bx+(a.sx-a.bx)*e; a.z=a.bz+(a.sz-a.bz)*e;
  a.g.position.set(a.x,gy+(a.sy-gy)*u,a.z);
  if(u<1){ a.ph+=dt*9; animLegs(a.g,a.ph,0.45); }
}
function downStep(a,dt){
  a.up-=dt/0.9;
  if(a.up<=0){ a.up=0; a.bab=null; a.state='wander'; a.timer=0; a.g.position.set(a.x,H(a.x,a.z),a.z);
    const after=a.after; a.after=null;
    if(after==='flee'){ a.state='flee'; a.fleeT=0; }
    else if(after&&!after.dead&&after.tree==null&&Math.hypot(after.x-a.x,after.z-a.z)<14){ a.state='chase'; a.tgt=after; a.aggro=4; a.lost=0; }
    return false; }
  placeClimb(a,dt); return true;
}
function perchStep(a,tr,dt){
  const t=trees[a.perchI];
  if(!t){ a.up=0; a.bab=null; return false; }   // Baum ist mit seinem Abschnitt verschwunden
  const m=a.juv?a.mom:null;
  a.perchT-=dt;
  const stay=a.juv?!!(m&&!m.dead&&m.bab==='perch'):(a.perchT>0||tr.alarmT>0||babNight());
  if(leopardIn(a.perchI)&&!a.male){ a.bab='down'; a.after='flee'; return downStep(a,dt); }   // ein Leopard im eigenen Baum: hinunter und weg
  if(!stay&&(a.up>=1||a.up<=0)){ if(a.up<=0){ a.bab=null; return false; } a.bab='down'; return downStep(a,dt); }
  perchSpot(a,t);
  if(!(a.up>0)){ if(!toTrunk(a,t,a.sp.spd*(a.fast?1:0.35),dt)) return true; }
  else a.up=Math.min(1,a.up+dt/1.3);
  placeClimb(a,dt);
  if(a.up>=1){ animLegs(a.g,a.ph,0); a.g.rotation.y=Math.atan2(a.sx-t.x,a.sz-t.z); }   // sitzt und schaut hinaus
  return true;
}

/* ---------- Angriff auf einen Leoparden im Baum ---------- */
function startMob(tr,p){
  const ms=tr.all.filter(a=>a.male&&!a.dead&&!a.held&&!(a.stun>0)&&a.bab!=='mob'&&a.bab!=='down'&&a.state!=='chase');
  if(!ms.length) return;
  for(const a of ms){
    if(a.bab==='perch'&&a.up>0&&a.perchI!==p.tree){ a.bab='down'; a.after=null; continue; }   // sitzt in einem anderen Baum: erst hinunter
    if(!(a.bab==='perch'&&a.up>0)) a.up=0;                                                      // im selben Baum klettert es gleich weiter
    a.bab='mob'; a.mobP=p; a.mobI=p.tree; a.mobT=0; a.bcd=rnd(0.4,1); a.fast=true; }
  tr.mobP=p; tr.goal=false; tr.alarmT=Math.max(tr.alarmT,8); tr.threat=p;
  bark(tr,1,true);
  // wer schon im selben Baum sitzt, flieht
  for(const a of tr.all) if(!a.male&&a.bab==='perch'&&a.perchI===p.tree){ a.bab='down'; a.after='flee'; }
  const now=performance.now();
  if(now-(p.babMobAt||-1e9)>60000){ p.babMobAt=now; tell(p,'Paviane! Die Männchen klettern zu dir herauf – hier ist der Baum nicht sicher. Brüll sie an oder spring hinunter.','#ff8a70'); }
}
/** Angriff beenden. why: 'gone' (Leopard ist weg), 'held' (Leopard hat sich behauptet) oder 'scared' (vertrieben) */
function endMob(a,tr,why){
  const p=a.mobP; a.mobP=null;
  a.after=why==='gone'?p:why==='scared'?'flee':null;
  a.bab=a.up>0?'down':null;
  if(!a.bab&&a.after){ a.up=0.001; a.bab='down'; a.bx=a.x; a.bz=a.z; a.sx=a.x; a.sz=a.z; a.sy=H(a.x,a.z); }
  if(why!=='gone'){ tr.mobCd=30;
    if(p&&!tr.goal&&p.tree!=null&&!p.dead){ tr.goal=true; goalEvent('babTree',1); tell(p,why==='scared'?'Du hast die Paviane vertrieben.':'Die Paviane geben auf – du hast dich im Baum behauptet.','#9be07f'); } }
}
function mobStep(a,tr,dt){
  const p=a.mobP, t=trees[a.mobI]; a.mobT+=dt;
  if(!p||p.dead||p.tree!==a.mobI||!t){ endMob(a,tr,'gone'); return a.bab?downStep(a,dt):false; }
  if(a.mobT>BAB_MOB_MAX){ for(const o of tr.all) if(o.bab==='mob') endMob(o,tr,'held'); return a.bab?downStep(a,dt):false; }
  // Platz neben dem Leoparden
  const k=a.uid*2.39996; a.sx=p.x+Math.cos(k)*1.15; a.sz=p.z+Math.sin(k)*1.15; a.sy=t.y+t.perch[1];
  if(!(a.up>0)){ if(!toTrunk(a,t,a.sp.spd,dt)) return true; }
  else a.up=Math.min(1,a.up+dt/0.9);
  placeClimb(a,dt);
  const inn=a.g.userData.inner; inn.position.z*=0.85;
  if(a.up>=1){
    a.g.rotation.y=Math.atan2(p.x-a.x,p.z-a.z); a.ph+=dt*3; animLegs(a.g,a.ph,0.08);   // steht drohend
    a.bcd-=dt;
    if(a.bcd<=0){ a.bcd=rnd(1.6,2.2); inn.position.z=0.3; snd.bark(babVol(a.x,a.z,80)*0.8); hurtPlayer((a.sp.dmg||7)*D().dmg,a,true,p); }   // force: auch oben im Baum
  }
  return true;
}

/* ---------- Am Boden: Männchen drohen ---------- */
function threaten(a,tr,dt){
  const p=tr.threat; if(a.gcd>0) a.gcd-=dt;
  if(!p||p.dead||p.tree!=null||a.stun>0) return false;
  const dx=p.x-a.x, dz=p.z-a.z, d=Math.hypot(dx,dz);
  const kidNear=tr.all.some(k=>k.juv&&!k.dead&&Math.hypot(k.x-p.x,k.z-p.z)<8);
  if((d<7||kidNear)&&!(a.gcd>0)){   // zu nah oder bei den Jungen: das Männchen greift an
    a.state='chase'; a.tgt=p; a.aggro=3.5; a.lost=0; a.gcd=6; snd.alert(); floatText('!',a.x,H(a.x,a.z)+a.sp.size*2.2,a.z,'#ff5a3c'); return false; }
  if(d>12) moveAnimal(a,dx,dz,a.sp.spd*0.5,dt);
  else { a.g.rotation.y=Math.atan2(dx,dz); a.ph+=dt*2; animLegs(a.g,a.ph,0.08); }   // aufgerichtet, dem Leoparden zugewandt
  a.g.position.set(a.x,H(a.x,a.z),a.z);
  return true;
}

/** Ein Bild Pavianverhalten (aus updateAnimal). true: das Tier ist damit fertig, false: das übliche Verhalten läuft weiter. */
function baboonStep(a,dt){
  const tr=troopOf(a); if(!tr) return false;
  if(a.bab&&a.state==='chase'&&!(a.up>0)) a.bab=null;   // am Boden gebissen: wehrt sich
  if(a.bab&&a.stun>0){ a.stun-=dt;                       // angebrüllt
    if(a.bab==='mob') endMob(a,tr,'scared');
    else if(a.bab==='perch'){ animLegs(a.g,a.ph,0); return true; } }
  if(a.juv&&a.mom&&!a.mom.dead&&a.mom.bab==='perch'&&!a.bab&&a.state!=='chase'){ a.bab='perch'; a.perchI=a.mom.perchI; a.up=0; a.fast=a.mom.fast; }   // Junge folgen der Mutter
  if(a.bab==='mob') return mobStep(a,tr,dt);
  if(a.bab==='down') return downStep(a,dt);
  if(a.bab==='perch') return perchStep(a,tr,dt);
  if(a.juv||a.state!=='wander') return false;
  if(a.male&&tr.alarmT>0&&players.includes(tr.threat)) return threaten(a,tr,dt);
  // nachts schlafen sie im Baum, am Tag ruhen einzelne ab und zu darin
  if(babNight()?goPerch(a,tr,rnd(5,10),false):Math.random()<dt/90&&goPerch(a,tr,rnd(12,25),false)) return perchStep(a,tr,dt);
  return false;
}

let babTick=0;
/** Trupps: Mitglieder, Mitte, Schlafbaum, Alarm und Angriff auf Leoparden im Baum */
function updateBaboons(dt){
  babTick-=dt;
  if(babTick<=0){ babTick=1;
    for(const a of animals) if(a.sp.baboon) troopOf(a);
    for(let i=TROOPS.length-1;i>=0;i--){ const tr=TROOPS[i]; tr.all=animals.filter(a=>a.troop===tr); if(!tr.all.length) TROOPS.splice(i,1); } }
  for(const tr of TROOPS){
    let cx=0, cz=0, n=0;
    for(const a of tr.all){ if(a.dead){ if(a.bab){ a.up=0; a.bab=null; a.mobP=null; } continue; } if(a.bab==='mob') continue; cx+=a.x; cz+=a.z; n++; }
    if(!n) continue;
    if(tr.homeT>0) tr.homeT-=dt;
    tr.cx=cx/n; tr.cz=cz/n; homeTree(tr);
    if(tr.mobCd>0) tr.mobCd-=dt;
    else if(!tr.all.some(a=>a.bab==='mob')) for(const p of players){
      if(p.dead||p.tree==null||p.climbT<0.5) continue; const t=trees[p.tree]; if(!t) continue;
      if(p.tree===tr.homeI||Math.hypot(t.x-tr.cx,t.z-tr.cz)<BAB_TREE_R){ startMob(tr,p); break; } }
    if(tr.alarmT>0){
      tr.alarmT-=dt; const w=tr.threat;
      if(w&&!w.dead&&Math.hypot(w.x-tr.cx,w.z-tr.cz)<BAB_FEAR_R){ tr.alarmT=Math.max(tr.alarmT,2); tr.barkT-=dt; if(tr.barkT<=0){ tr.barkT=rnd(2.5,4.5); bark(tr,0.6,false); } }
      if(tr.alarmT<=0){ tr.threat=null; tr.calmT=rnd(4,7); }
    }
    else if(tr.calmT>0) tr.calmT-=dt;
    else { const w=troopThreat(tr); if(w) troopAlarm(tr,w); }
  }
}

export { TROOPS, baboonStep, troopOf, updateBaboons };
