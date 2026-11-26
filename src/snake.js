// LeoLife – Schlangen (Puffottern): liegen getarnt im Gras, warnen zischend und beißen, wenn man sie übersieht.
import { hurtPlayer } from './actions.js';
import { snd, snd3d } from './audio.js';
import { tell } from './coop.js';
import { puff } from './effects.js';
import { animSnake } from './models.js';
import { players } from './player.js';
import { pScale } from './save.js';
import { H } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';

/* lurk:   liegt still und eingerollt, nur ab und zu züngelt sie – auf der Spürkarte erst aus der Nähe sichtbar
   warn:   jemand kommt nahe – sie hebt den Kopf, zischt und züngelt (das Zeichen, umzukehren)
   strike: schnellt vor und beißt; das Gift wirkt einige Sekunden nach
   chase:  angegriffen – verteidigt sich aus kurzer Distanz und kriecht sonst davon
   Wer schleicht, tritt nicht auf sie: die Warnung kommt dann früher, und sie beißt erst aus kürzerer Distanz. */
const WARN_R=5.5, BITE_R=2.3;

/** Kriechen: Schlangen schlängeln langsam, ohne Beinanimation */
function crawl(a,dx,dz,spd,dt){
  const l=Math.hypot(dx,dz)||1; a.x+=dx/l*spd*dt; a.z+=dz/l*spd*dt;
  let df=Math.atan2(dx,dz)-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  a.g.rotation.y+=df*Math.min(1,dt*4); a.ph+=dt*(3+spd*2); animSnake(a.g,a.ph,0.8);
}

/** @param {import('./player.js').Player} T nächster Spieler */
function snakeStep(a,dt,d,dx,dz,T){
  const u=a.g.userData, s=a.sp;
  const sneaking=!!T.sneak, warnR=WARN_R*(sneaking?1.2:1), biteR=BITE_R*(sneaking?0.7:1)+pScale(T.L)*0.3;
  const reachable=!T.safe&&!T.dead&&T.tree==null;
  let lift=0;
  a.cd-=dt;
  if(a.state==='strike'){
    a.lt-=dt; lift=0.9;
    if(a.lt<=0.15&&!a.bit){ a.bit=true;
      if(reachable&&d<biteR+0.8){ snd.snap(); hurtPlayer(s.dmg,a,false,T); envenom(T); puff(T.x,H(T.x,T.z)+0.4,T.z,0x7a9b3a,6,0.3); } }
    if(a.lt<=0){ a.state=a.aggro>0?'chase':'warn'; a.cd=1.8; }
  } else if(a.state==='chase'){
    a.aggro-=dt;
    if(reachable&&d<biteR+0.4&&a.cd<=0) startStrike(a);
    else if(d<9) crawl(a,-dx,-dz,s.spd,dt);
    else animSnake(a.g,a.ph+=dt,0.1);
    if(a.aggro<=0||d>14){ a.state='lurk'; a.aggro=0; }
    lift=0.5;
  } else if(a.state==='warn'){
    lift=0.7; a.g.rotation.y+=(Math.atan2(dx,dz)-a.g.rotation.y)*Math.min(1,dt*3);
    a.hissT=(a.hissT||0)-dt;
    if(a.hissT<=0){ a.hissT=rnd(1.3,2.1); if(!snd3d(['snakeHiss'],a.x,a.z,0.9,35,rnd(0.92,1.1))) snd.notice(); floatText('ssss',a.x,H(a.x,a.z)+0.6,a.z,'#c8d68a'); }
    if(!a.told||a.told!==T){ a.told=T; tell(T,'Eine Puffotter zischt im Gras – geh langsam zurück oder greif sie gezielt an.','#c8d68a'); }
    if(reachable&&d<biteR&&a.cd<=0) startStrike(a);
    if(d>warnR+2||!reachable){ a.state='lurk'; a.told=null; }
    animSnake(a.g,a.ph+=dt*2,0.05);
  } else {
    a.state='lurk';
    // ab und zu ein Stück weiterkriechen, sonst still liegen
    a.timer-=dt;
    if(a.timer<=0){ a.timer=rnd(10,24); const an=Math.random()*6.283; a.tx=a.x+Math.cos(an)*rnd(2,6); a.tz=a.z+Math.sin(an)*rnd(2,6); }
    const tx=a.tx-a.x, tz=a.tz-a.z;
    if(Math.hypot(tx,tz)>0.6&&a.timer<6) crawl(a,tx,tz,s.spd*0.35,dt); else animSnake(a.g,a.ph+=dt*0.5,0);
    if(reachable&&d<warnR) { a.state='warn'; a.hissT=0; }
    // gelegentliches Züngeln verrät sie aus der Nähe
    if(d<12&&Math.random()<dt*0.5) a.flick=0.35;
  }
  a.flick=Math.max(0,(a.flick||0)-dt); u.tongue.visible=a.state==='warn'?Math.sin(performance.now()/90)>0:a.flick>0;
  u.head.rotation.x+=(-lift*0.6-u.head.rotation.x)*Math.min(1,dt*10);
  u.head.position.y=0.09+lift*0.22;
  const k=a.state==='strike'?Math.sin(Math.max(0,a.lt)/0.35*Math.PI)*0.35:0;
  u.head.position.z=0.05+k;
  a.g.position.set(a.x,H(a.x,a.z),a.z);
}
function startStrike(a){ a.state='strike'; a.lt=0.35; a.bit=false; if(!snd3d(['snakeHiss'],a.x,a.z,1.2,35,rnd(1.15,1.3))) snd.croc(); }

/* ---------- Gift: wirkt einige Sekunden nach ---------- */
function envenom(p){
  if(p.ghost) return;   // Gift: das andere Gerät vergiftet seinen Leoparden selbst (networld.js)
  const first=!(p.venom>0); p.venom=Math.min(14,(p.venom||0)+7);
  if(first){ floatText('Gift!',p.x,p.y+1.8*pScale(p.L),p.z,'#9bd24a'); tell(p,'Gebissen! Das Gift brennt noch eine Weile – halt dich von Gefahren fern.','#9bd24a'); }
}
const VENOM={sp:{id:'snake',n:'Puffotter'}};
function updateVenom(dt){
  for(const p of players){
    if(!(p.venom>0)||p.dead) continue;
    p.venom-=dt; p.hp-=1.6*dt;
    if(Math.random()<dt*2) puff(p.x,p.y+0.6*pScale(p.L),p.z,0x9bd24a,1,0.15);
    if(p.hp<=0){ p.venom=0; hurtPlayer(1e9,VENOM,true,p); }
  }
}

export { envenom, snakeStep, updateVenom };
