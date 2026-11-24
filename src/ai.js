// LeoLife – Tierverhalten: Rudeljagd, Flucht, Angriff, Herden.
import { hitAnimal, hurtPlayer } from './actions.js';
import { animals, placeAnimal } from './animals.js';
import { snd } from './audio.js';
import { endCarcass, herdLead, makeCarcass, startFlee } from './carcass.js';
import { FOOD } from './data.js';
import { dayF } from './daynight.js';
import { SMART, windMulDir } from './engine.js';
import { raidStep, seeking } from './family.js';
import { fam, famHurt, famRole, famStep } from './kin.js';
import { animLegs } from './models.js';
import { P, players } from './player.js';
import { VIEW_D } from './quality.js';
import { D, S, pScale } from './save.js';
import { G } from './state.js';
import { H, PONDS, WORLD, collide, nearestPond, samePond } from './terrain.js';
import { addTrack } from './tracks.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';
import { crocStep } from './crocodile.js';
import { snakeStep } from './snake.js';
import { tell } from './coop.js';
import { syncOrbs } from './effects.js';
import { growlAt } from './calls.js';
import { weakRecover, woundSlow, woundTick, woundTrail } from './bite.js';
import { eventStep } from './worldevents.js';
import { burrowSeek, burrowWait } from './burrows.js';
import { hearR, visibility } from './vision.js';
import { baboonStep } from './baboons.js';

/* Rudel: Hyänen und Schakale rufen ihre Artgenossen zur Jagd (je nach Schwierigkeit) */
const PACK={hyena:1,jack:1};
function recruitPack(a){ if(!PACK[a.sp.id]) return; const sm=SMART(); if(!sm) return;
  for(const o of animals){ if(o!==a&&!o.dead&&o.sp===a.sp&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<45&&Math.random()<sm){ o.state='chase'; o.lost=0; o.sus=0; o.aggro=2; } } }

/* ---------- KI ---------- */
function moveAnimal(a,dx,dz,spd,dt){
  if(a.wound){ spd*=woundSlow(a); woundTrail(a,spd*dt); }
  if(a.juv) spd*=0.85;
  const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
  a.x+=dx*spd*dt; a.z+=dz*spd*dt;
  const r=Math.hypot(a.x,a.z); if(!a.world&&r>WORLD){ a.x*=WORLD/r; a.z*=WORLD/r; }
  const cc=collide(a.x,a.z,a.rad*0.55,false); a.x=cc.x; a.z=cc.z;
  if(!a.sp.friend){ a.trk=(a.trk||0)+spd*dt; if(a.trk>0.9+a.sp.size*1.2){ a.trk=0; if(players.some(p=>Math.abs(a.x-p.x)<70&&Math.abs(a.z-p.z)<70)){ a.tside=-(a.tside||1); addTrack(a,a.tside); } } }
  let tr=Math.atan2(dx,dz), df=tr-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  a.g.rotation.y+=df*Math.min(1,dt*8);
  a.ph+=dt*(6+spd*1.3); animLegs(a.g,a.ph,Math.min(0.9,0.25+spd*0.05));
}
/** Sprungtreffer: trifft irgendein Spieler mit seinem Sprung das Tier a? */
function pounceHits(a){
  for(const p of players){ if(p.pounce>0&&!p.hit&&Math.hypot(p.x-a.x,p.z-a.z)<a.rad+0.5+pScale(p.L)*0.8){ p.hit=true; p.pounce=Math.min(p.pounce,0.08); hitAnimal(a,p); return; } }
}
function nearestDist(a){ let m=1e9; for(const p of players) m=Math.min(m,Math.hypot(p.x-a.x,p.z-a.z)); return m; }
/**
 * Wählt, auf welchen Spieler Tier a reagiert: bei Jagd den bisherigen, sonst den nächsten lebenden.
 * @returns {import('./player.js').Player}
 */
function targetOf(a){
  const t=a.tgt;
  if(t&&!t.dead&&players.indexOf(t)>=0&&(a.state==='chase'||a.state==='lunge')) return t;
  let best=P, bd=1e9;
  for(const p of players){ if(p.dead) continue; const d=(p.x-a.x)*(p.x-a.x)+(p.z-a.z)*(p.z-a.z); if(d<bd){ bd=d; best=p; } }
  return a.tgt=best;
}
/** Beutetiere suchen bei Durst Wasser und trinken dort automatisch. */
function animalWater(a,dt){
  a.thirst=Math.max(0,(a.thirst==null?100:a.thirst)-dt*(100/700));
  if(a.state==='flee'||a.state==='chase'||a.state==='lunge'||a.state==='scav'||a.sp.human) return false;
  if(a.state!=='drink'&&a.thirst<24){
    const q=nearestPond(a.x,a.z); if(!q) return false;
    a.drinkPond=q; const an=Math.atan2(a.z-q.z,a.x-q.x); a.drinkX=q.x+Math.cos(an)*q.r*0.93; a.drinkZ=q.z+Math.sin(an)*q.r*0.93; a.state='drink';
  }
  if(a.state!=='drink') return false;
  const q=a.drinkPond;
  if(!q){ a.state='wander'; return false; }
  const dx=a.drinkX-a.x,dz=a.drinkZ-a.z,d=Math.hypot(dx,dz);
  if(d>2.1) moveAnimal(a,dx,dz,Math.min(a.sp.spd*0.45,4.5),dt);
  else { a.thirst=Math.min(100,a.thirst+24*dt); a.g.rotation.y=Math.atan2(q.x-a.x,q.z-a.z); animLegs(a.g,a.ph,0.03);
    if(a.thirst>=94){ a.thirst=100; a.drinkPond=null; a.state='wander'; a.timer=0; } }
  return true;
}
/** Wehrhafte Eltern: kommt Spieler T einem ihrer Jungen zu nahe, greifen sie an (true = Angriff begonnen). */
function guardYoung(a,T){
  if(!a.sp.guard||!a.kids||a.juv||a.gcd>0||T.safe||T.dead||T.tree!=null) return false;
  for(const k of a.kids){ if(k.dead||Math.hypot(k.x-a.x,k.z-a.z)>22) continue;
    const kd=Math.hypot(T.x-k.x,T.z-k.z);
    if(kd<(T.sneak?5:8)){
      a.state='chase'; a.tgt=T; a.aggro=4.5; a.lost=0; a.sus=0; a.gcd=14; snd.alert(); if(a.sp.pred) growlAt(a);
      floatText('!',a.x,H(a.x,a.z)+a.sp.size*2.2,a.z,'#ff5a3c');
      for(const o of a.kids) if(!o.dead) startFlee(o);
      const now=performance.now(); if(now-(T.guardMsgAt||-1e9)>40000){ T.guardMsgAt=now; tell(T,'Vorsicht – ein Elterntier ('+a.sp.n+') verteidigt sein Junges!','#ff8a70'); }
      return true; } }
  return false;
}
/** Ein Bild Tierverhalten für Tier a. Das Tier reagiert auf den Spieler T aus targetOf (Tarnung T.stealth). */
function updateAnimal(a,dt){
  const T=targetOf(a), stealth=T.stealth==null?1:T.stealth;
  if(a.dead){
    if(a.carc){ a.carc.t-=dt; if(a.carc.t<=0||a.carc.meat<=0){ endCarcass(a); a.g.visible=false; a.g.rotation.z=0; } else syncOrbs(a.carc.orbs,a.carc.meat,a.carc.t,performance.now()/1000); return; }
    if(a.world) return;
    if(a.temp){ a.gone=true; return; }   // Ereignistiere kommen nicht wieder
    a.respawn-=dt; if(a.respawn<=0) placeAnimal(a); return; }
  if(a.held){ a.ph+=dt*14; animLegs(a.g,a.ph,0.5); return; }   // festgebissen: zappelt, bewegt sich nicht
  if(a.wound) woundTick(a,dt); if(a.dead) return;
  if(a.sp.burrow&&burrowWait(a,dt)) return;   // Warzenschwein im Bau
  const sp=a.sp, dx=T.x-a.x, dz=T.z-a.z, d=Math.hypot(dx,dz);
  if(sp.friend){
    const fi=fam.indexOf(a);
    if(fi<3){ const r=famRole(fi); if(!r||!a.famOn){ a.g.visible=false; return; } famStep(a,dt,r); return; }
    if(!seeking()){ a.g.visible=false; return; }
  }
  const dv=players.length>1?nearestDist(a):d;
  if(a.ev&&a.stun<=0&&eventStep(a,dt,moveAnimal)){ a.g.visible=dv<=VIEW_D&&!a.gone; a.g.position.set(a.x,H(a.x,a.z),a.z); pounceHits(a); return; }   // Ereignis steuert das Tier (auch außer Sicht)
  if(sp.snake){ a.g.visible=dv<=VIEW_D; if(dv>VIEW_D+20) return; snakeStep(a,dt,d,dx,dz,T); pounceHits(a); return; }
  if(!a.sp.croc&&!a.sp.friend&&!a.sp.human&&!a.juv&&!a.bab&&animalWater(a,dt)){ a.g.visible=dv<=VIEW_D; a.g.position.set(a.x,H(a.x,a.z),a.z); return; }
  if(dv>VIEW_D&&a!==G.raider){ a.g.visible=false; return; } a.g.visible=dv<=VIEW_D;
  if(a.sp.burrow&&!(a.stun>0)&&burrowSeek(a,dt)){ pounceHits(a); return; }   // läuft zum Bau
  if(sp.baboon&&baboonStep(a,dt)){ if(!(a.up>0.3)) pounceHits(a); return; }   // Pavian: Baum, Alarm, Drohen
  a.cd-=dt; if(a.scared>0) a.scared-=dt; if(a.gcd>0) a.gcd-=dt;
  const hostile=sp.hunt&&!a.juv&&T.L.lvl<sp.hunt&&!(a.scared>0);
  // Wahrnehmung: Reichweite (Art, Tarnung, Schwierigkeit, Nacht, Wind) × was das Tier wirklich sieht (vision.js) – Hören geht rundum
  const reach0=sp.sense*stealth*D().sense*(sp.pred?1+0.25*(1-dayF):1.1)*(d>0.1?windMulDir(-dx/d,-dz/d):1);
  const detect=d<reach0*1.35?Math.max(reach0*visibility(a,T,dt),hearR(T)):Math.max(reach0,hearR(T));
  if(sp.croc){ const prey=!(a.rest>0)&&animals.filter(o=>o!==a&&!o.dead&&o.state==='drink'&&samePond(o.drinkPond,a.pond)&&Math.hypot(o.x-a.pond.x,o.z-a.pond.z)<a.pond.r+8).sort((x,y)=>Math.hypot(x.x-a.x,x.z-a.z)-Math.hypot(y.x-a.x,y.z-a.z))[0];
    if(a.stun>0) a.stun-=dt; else crocStep(a,dt,d,dx,dz,stealth*D().sense,hostile,T,prey);
    if(prey&&prey.crocKilled){ prey.crocKilled=false; prey.respawn=rnd(18,30); makeCarcass(prey,FOOD[prey.sp.id]||1);
      // die anderen am Ufer erschrecken und fliehen; sie kommen erst später durstig wieder
      for(const o of animals) if(o!==prey&&!o.dead&&o.state==='drink'&&samePond(o.drinkPond,a.pond)){ o.state='flee'; o.fleeT=0; o.drinkPond=null; o.thirst=Math.min(o.thirst,40); } }
    pounceHits(a);
    return; }
  if(a.stun>0){ a.stun-=dt; animLegs(a.g,a.ph,0.05); if(a.stun<=0) weakRecover(a); }
  else if(a.state==='wander'&&guardYoung(a,T)){ /* Elterntier geht auf den Spieler los */ }
  else if(a.state==='wander'){
    a.timer-=dt;
    const mom=a.juv&&a.mom&&!a.mom.dead?a.mom:null;
    if(mom&&mom.state==='flee') startFlee(a);
    if(mom&&(a.timer<=0||Math.hypot(mom.x-a.x,mom.z-a.z)>5)&&Math.hypot(a.tx-mom.x,a.tz-mom.z)>3.5){ a.tx=mom.x+rnd(-2.5,2.5); a.tz=mom.z+rnd(-2.5,2.5); a.timer=rnd(1,2.5); a.idle=0; }
    if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=rnd(4,16); a.tx=a.x+Math.cos(an)*r; a.tz=a.z+Math.sin(an)*r;
      const cr=Math.hypot(a.tx,a.tz); if(!a.world&&(cr<sp.ring[0]||cr>sp.ring[1])){ const k=(sp.ring[0]+sp.ring[1])/2/(cr||1); a.tx=a.x+(a.tx*k-a.x)*0.3; a.tz=a.z+(a.tz*k-a.z)*0.3; }
      a.timer=rnd(3,8); a.idle=Math.random()<0.4?rnd(1,3):0;
      if(a.herd){ const L=herdLead(a); if(L!==a){ a.tx=L.x+rnd(-7,7); a.tz=L.z+rnd(-7,7); a.timer=rnd(2,5); } } }
    const farH=mom?Math.hypot(mom.x-a.x,mom.z-a.z)>6:a.herd&&Math.hypot(herdLead(a).x-a.x,herdLead(a).z-a.z)>16;
    if(a.idle>0&&!farH){ a.idle-=dt; animLegs(a.g,a.ph,0.03); } else moveAnimal(a,a.tx-a.x,a.tz-a.z,sp.spd*(farH?0.6:0.28),dt);
    a.near=false;
    if(hostile){
      a.near=d<detect*1.6+8;
      if(d<detect){
        if(a.sus<=0) snd.notice();
        a.sus+=dt*(0.3+0.85*(1-d/detect));
        if(a.sus>=1){ a.sus=0; a.near=false; a.state='chase'; a.lost=0; snd.alert(); if(sp.pred) growlAt(a); recruitPack(a); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
      } else a.sus=Math.max(0,a.sus-dt*0.35);
    } else {
      a.sus=0;
      if(d<detect&&(!sp.fight||(a.juv&&d<detect*0.6)||(sp.pred&&T.L.lvl>=sp.hunt+2&&d<detect*0.5))) startFlee(a);
    }
  }
  else if(a.state==='raid'){ raidStep(a,dt); }
  else if(a.state==='scav'){
    const c=a.carc;
    if(!c||!c.carc||c.carc.tree!=null){ a.state='wander'; a.timer=0; a.carc=null; }   // im Baum kommen sie nicht heran
    else { const cx=c.x-a.x, cz=c.z-a.z, cd=Math.hypot(cx,cz), pd=Math.hypot(T.x-c.x,T.z-c.z);
      if(hostile&&!T.safe&&cd<25&&(pd<10||d<detect)){ a.state='chase'; a.lost=0; a.aggro=4; a.carc=null; snd.alert(); growlAt(a); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
      else if(!hostile&&d<9){ a.carc=null; startFlee(a); }          // vor einem starken Jäger weichen Aasfresser zurück
      else if(cd>c.rad+1.3) moveAnimal(a,cx,cz,sp.spd*0.75,dt);
      else { a.g.rotation.y=Math.atan2(cx,cz); animLegs(a.g,a.ph,0.04); a.eatT+=dt; if(a.eatT>3){ a.eatT=0; c.carc.meat--; } } }
  }
  else if(a.state==='fightFam'){
    const f=a.foe;
    if(!f||!f.famOn){ a.state='wander'; a.timer=0; a.foe=null; }
    else { const fx=f.x-a.x, fz=f.z-a.z, fd=Math.hypot(fx,fz);
      if(fd>a.rad+1.6) moveAnimal(a,fx,fz,sp.spd,dt); else { animLegs(a.g,a.ph,0.05); if(a.cd<=0){ a.cd=1.1; famHurt(f,sp.dmg||6); } } }
  }
  else if(a.state==='flee'){
    a.sus=0; a.near=false;
    a.fleeT+=dt; const tired=a.fleeT>6?0.72:1;
    let fx=-dx, fz=-dz; const r=Math.hypot(a.x,a.z);
    if(!sp.fight&&SMART()>0&&d>0.1){   // Haken schlagen: abrupt die Seite wechseln und ein Stück schräg weglaufen
      a.zzT=(a.zzT||0)-dt;
      if(a.zzT<=0){ a.zzT=rnd(1.4,4)*(0.8+sp.size*0.4);   // selten und zufällig: oft geradeaus, ab und zu ein Haken zu einer beliebigen Seite
        if(Math.random()<0.55*SMART()){ a.zzSide=Math.random()<0.5?1:-1; a.zzA=rnd(0.6,1.1); a.zzT=rnd(0.5,1.1); } else { a.zzSide=1; a.zzA=0; } }
      const th=a.zzSide*a.zzA, c=Math.cos(th), sn=Math.sin(th), ux=fx/d, uz=fz/d; fx=ux*c-uz*sn; fz=ux*sn+uz*c; }
    if(!a.world&&r>WORLD-25){ fx+=-a.z*1.5*(a.side||(a.side=Math.random()<.5?1:-1))-a.x*0.5; fz+=a.x*1.5*a.side-a.z*0.5; }
    moveAnimal(a,fx,fz,sp.spd*tired,dt);
    if(d>Math.max(detect,sp.sense*0.6)*2+18||a.fleeT>22){ a.state='wander'; a.timer=0; }
  }
  else if(a.state==='chase'){
    if(T.safe){
      a.aggro=0; a.lost+=dt;
      if(d>a.rad+3.5) moveAnimal(a,dx,dz,sp.spd*0.6,dt); else animLegs(a.g,a.ph,0.05);
      if(a.lost>({easy:2.5,normal:6,hard:12})[S.diff]){ a.state='wander'; a.timer=0; a.sus=0; a.scared=6; snd.lost(); floatText('?',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ddd'); }
      a.g.position.set(a.x,H(a.x,a.z),a.z); return;
    }
    if(a.aggro>0) a.aggro-=dt;
    const reach=a.rad+0.5+pScale(T.L)*0.7;
    let tx=dx, tz=dz;
    if(PACK[sp.id]&&SMART()>0&&d>6){   // Rudel kreist dich ein: jedes Tier nähert sich von einer anderen Seite
      const all=animals.filter(o=>!o.dead&&o.sp===sp&&o.state==='chase'&&Math.hypot(o.x-T.x,o.z-T.z)<40);
      if(all.length>1){ all.sort((p,q)=>p.uid-q.uid); const off=(all.indexOf(a)-(all.length-1)/2)*1.25*SMART();
        const ang=Math.atan2(a.x-T.x,a.z-T.z)+off*Math.min(1,(d-6)/10); tx=T.x+Math.sin(ang)*4-a.x; tz=T.z+Math.cos(ang)*4-a.z; } }
    if(d>reach*0.8) moveAnimal(a,tx,tz,sp.spd,dt); else animLegs(a.g,a.ph,0.05);
    if(d<reach&&a.cd<=0){ a.cd=1.1; hurtPlayer(sp.dmg||sp.gdmg||6,a,false,T); a.g.userData.inner.position.z=0.3; }
    if(a.aggro<=0){
      if(!hostile){ a.state='wander'; a.timer=0; }
      else { if(d>detect) a.lost+=dt; else a.lost=0; if(a.lost>3.5||d>75){ a.state='wander'; a.timer=0; if(d<50) snd.lost(); if(d<50) floatText('?',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ddd'); } }
    }
  }
  const inn=a.g.userData.inner; inn.position.z*=0.85;
  a.g.position.set(a.x,H(a.x,a.z),a.z);
  // Sprungtreffer
  if(!sp.friend) pounceHits(a);
}

export { moveAnimal, updateAnimal };
