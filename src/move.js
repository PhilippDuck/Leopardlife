// LeopardLife – Bewegung eines Leoparden pro Bild: Laufen, Sprinten, Sprung, Klettern, Kollision, Tarnung.
// Arbeitet auf dem übergebenen Spieler p (Position, Kamera, Steuerwunsch p.ctl), nicht fest auf dem einen Spieler.
import { animals } from './animals.js';
import { snd } from './audio.js';
import { dayF } from './daynight.js';
import { goalEvent } from './goals.js';
import { setHide } from './hide.js';
import { animLegs } from './models.js';
import { S, at, baseSpeed, has, maxHp, maxSt, pScale } from './save.js';
import { G } from './state.js';
import { H, WORLD, collide, inWater } from './terrain.js';
import { inGrass, trees } from './vegetation.js';
import { W } from './weather.js';
import { $ } from './util.js';

/** Bewegt Spieler p um dt Sekunden. Gibt die Tarnung zurück (0 = unsichtbar, 1 = normal sichtbar). */
/** @param {import('./player.js').Player} p */
function stepPlayer(p,dt){
  const fw=p.ctl.fw, rt=p.ctl.rt, il=Math.hypot(fw,rt);
  const s=Math.sin(p.cam.yaw), c=Math.cos(p.cam.yaw);
  let mx=-s*fw+c*rt, mz=-c*fw-s*rt;
  const moving=il>0.1&&p.tree==null;
  // Sprinten geht auch aus dem Schleichen heraus: solange Sprint gehalten wird, wird gesprintet, danach schleicht er weiter
  const wantSprint=p.ctl.sprint&&moving;
  let sprint=wantSprint&&p.st>1;
  const sneak=p.sneak&&!sprint;   // beim Sprinten ruht das Schleichen
  let spd=baseSpeed()*(sprint?1.6:sneak?0.45:1); if(p.wet) spd*=0.65;
  if(sprint) p.st-=20*dt; else p.st=Math.min(maxSt(),p.st+(12+2*at('sta'))*(S.hunger<25?0.5:1)*(moving?0.7:1.3)*dt);
  if(p.st<=1&&G.tSprint){ G.tSprint=false; $('tbS').classList.remove('on'); }
  const sc=pScale();
  if(p.tree!=null){
    const t=trees[p.tree]; p.climbT=Math.min(1,p.climbT+dt/(1.3-0.3*S.b.climb));
    const e=p.climbT*p.climbT*(3-2*p.climbT);
    const tx=t.x+t.perch[0], tz=t.z+t.perch[2]; p.x=p.fromX+(tx-p.fromX)*e; p.z=p.fromZ+(tz-p.fromZ)*e;
    if(p.climbT<1){ p.rot=Math.atan2(tx-p.fromX,tz-p.fromZ); p.walkT+=dt*14; }
    p.safe=p.climbT>0.5;
  } else if(p.pounce>0){
    p.pounce-=dt; if(p.pounce<=0) p.leap=false; const ps=19+3*S.b.jmp+baseSpeed()*0.5;
    p.x+=Math.sin(p.rot)*ps*dt; p.z+=Math.cos(p.rot)*ps*dt;
  } else if(moving){
    p.x+=mx*spd*dt; p.z+=mz*spd*dt;
    let tr=Math.atan2(mx,mz), df=tr-p.rot; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283; p.rot+=df*Math.min(1,dt*12);
  }
  const pr=Math.hypot(p.x,p.z); if(pr>WORLD){ p.x*=WORLD/pr; p.z*=WORLD/pr; }
  if(p.tree==null){ const c=collide(p.x,p.z,0.3+0.4*sc,p.pounce>0); p.x=c.x; p.z=c.z; }
  p.pcd=Math.max(0,p.pcd-dt); p.rcd=Math.max(0,p.rcd-dt); p.combatT=Math.max(0,p.combatT-dt);
  if(p.combatT<=0&&S.hunger>25) p.hp=Math.min(maxHp(),p.hp+maxHp()*0.015*dt);
  if(p.hurtT>0){ p.hurtT-=dt; if(p.hurtT<=0) $('hurt').style.opacity=0; }
  const jump=p.pounce>0?Math.sin(Math.PI*(1-p.pounce/p.pT))*1.1*sc:0;
  p.y=H(p.x,p.z);
  let up=0;
  if(p.tree!=null){ const t=trees[p.tree], e=p.climbT*p.climbT*(3-2*p.climbT); up=(t.y+t.perch[1]-p.y)*e; p.upNow=up; }
  else if(p.dropY>0){ p.dropY=Math.max(0,p.dropY-p.dropRate*dt); up=p.dropY; }
  p.camY=p.y+up;
  const climbing=p.tree!=null&&p.climbT<1;
  const g=p.g; g.scale.setScalar(sc); g.position.set(p.x,p.y+jump+up,p.z); g.rotation.y=p.rot;
  g.userData.inner.position.y+=(((sneak&&p.pounce<=0)?-0.16:0)-g.userData.inner.position.y)*Math.min(1,dt*10);
  g.userData.inner.rotation.x=climbing?-1.1:p.pounce>0?(p.leap?0.35:-0.3):0;
  if(climbing) animLegs(g,p.walkT,0.7); else if(moving||p.pounce>0){ p.walkT+=dt*(5+spd*1.4); animLegs(g,p.walkT,p.pounce>0?1.1:sprint?0.85:sneak?0.3:0.55); } else animLegs(g,p.walkT,0.02);
  if(moving&&p.pounce<=0){ p.stepT=(p.stepT||0)-dt*(sprint?1.7:sneak?0.55:1); if(p.stepT<=0){ p.stepT=0.3; if(p.wet) snd.splash(); else snd.step(sneak?0.04:sprint?0.2:0.12); } }
  // Tarnung
  const grass=inGrass(p.x,p.z); p.wet=p.tree==null&&inWater(p.x,p.z);
  let st=1; if(sneak) st*=0.5; if(sprint) st*=1.3; if(grass) st*=sneak?0.3:(0.32+0.38*Math.min(1,(S.lvl-1)/7)); st*=(1-0.05*at('cam'))*(has('dunkel')?0.8:1)*(S.fur&&S.fur.albino?1.15:S.fur&&S.fur.melan?0.9:1); st*=0.8+0.025*S.lvl; st*=0.7+0.3*dayF; st*=1-0.25*W.rain; if(p.safe) st=0;
  p.hidden=st; p.grass=grass;
  { const lv=(p.safe||(grass&&(sneak||S.lvl<4)))?2:(grass||sneak)?1:0; if(lv!==p.hideLv) setHide(lv);
    if(lv===2&&S.goals&&S.goals.list.some(g=>g.id==='hide'&&!g.done)&&animals.some(a=>!a.dead&&a.sp.hunt&&S.lvl<a.sp.hunt&&Math.hypot(a.x-p.x,a.z-p.z)<25)) goalEvent('hide',dt); }
  return st;
}

export { stepPlayer };
