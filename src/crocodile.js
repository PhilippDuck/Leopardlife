// LeopardLife – Krokodile: lauern im Wasser und schnellen hervor.
import { hurtPlayer } from './actions.js';
import { moveAnimal } from './ai.js';
import { snd } from './audio.js';
import { puff } from './effects.js';
import { P } from './player.js';
import { pScale } from './save.js';
import { H, WATER_D } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';

/* ---------- Krokodile: lauern abgetaucht im Wasser, schnellen hervor, wenn du zu nah kommst, und ziehen sich danach zurück ---------- */
/** @param {import('./player.js').Player} [T] Spieler, auf den das Krokodil reagiert */
function crocStep(a,dt,d,dx,dz,stealth,hostile,T=P){
  const sp=a.sp, p=a.pond, wl=p.L-WATER_D;
  if(a.state==='lunge'){
    a.lt-=dt; moveAnimal(a,dx,dz,12+2*sp.size,dt);
    if(d<a.rad+0.9+pScale(T.L)*0.6&&a.cd<=0&&!T.safe){ a.cd=1.6; hurtPlayer(sp.dmg,a,false,T); a.lt=Math.min(a.lt,0.25); }
    if(a.lt<=0) a.state='return';
  } else if(a.state==='lurk'){
    a.timer-=dt;
    if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=Math.random()*p.r*0.65; a.tx=p.x+Math.cos(an)*r; a.tz=p.z+Math.sin(an)*r; a.timer=rnd(6,14); }
    moveAnimal(a,a.tx-a.x,a.tz-a.z,0.6,dt);
    a.near=hostile&&d<20;
    const reach=(4.5+2.5*sp.size)*Math.max(0.55,stealth);
    if(hostile&&!T.safe&&!T.dead&&a.cd<=0&&d<reach){ a.state='lunge'; a.lt=0.9; snd.croc(); puff(a.x,wl+0.3,a.z,0xd8ecf2,10,0.5); floatText('!',a.x,wl+sp.size*1.5,a.z,'#ff5a3c'); }
    if(d<30&&Math.random()<dt*0.6) puff(a.x+rnd(-0.6,0.6),wl+0.05,a.z+rnd(-0.6,0.6),0xe0f0f4,2,0.15);   // Luftblasen
  } else {
    const hx=p.x-a.x, hz=p.z-a.z, hd=Math.hypot(hx,hz);
    if(a.state==='chase'&&hd<p.r+14&&!T.safe&&!T.dead){   // angegriffen: verteidigt sich kurz am Ufer
      if(d>a.rad+1) moveAnimal(a,dx,dz,sp.spd*1.6,dt); else if(a.cd<=0){ a.cd=1.3; hurtPlayer(sp.dmg*0.7,a); }
      a.aggro-=dt; if(a.aggro<=0) a.state='return';
    } else if(hd>p.r*0.5) moveAnimal(a,hx,hz,sp.spd*(a.state==='flee'?1.6:1),dt);
    else { a.state='lurk'; a.timer=0; }
  }
  const inW=Math.hypot(a.x-p.x,a.z-p.z)<p.r*0.95, gy=H(a.x,a.z);
  a.g.position.set(a.x,inW&&a.state==='lurk'?Math.max(gy,wl-0.22*sp.size):gy,a.z);
}

export { crocStep };
