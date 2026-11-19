// LeopardLife – Tierverhalten: Rudeljagd, Flucht, Angriff, Herden.
import { hitAnimal, hurtPlayer } from './actions.js';
import { animals, placeAnimal } from './animals.js';
import { snd } from './audio.js';
import { herdLead, startFlee } from './carcass.js';
import { dayF } from './daynight.js';
import { SMART, windMulDir } from './engine.js';
import { raidStep, seeking } from './family.js';
import { fam, famHurt, famRole, famStep } from './kin.js';
import { animLegs } from './models.js';
import { P, players } from './player.js';
import { VIEW_D } from './quality.js';
import { D, S, pScale } from './save.js';
import { G } from './state.js';
import { H, WORLD, collide } from './terrain.js';
import { addTrack } from './tracks.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';
import { crocStep } from './crocodile.js';

/* Rudel: Hyänen und Schakale rufen ihre Artgenossen zur Jagd (je nach Schwierigkeit) */
const PACK={hyena:1,jack:1};
function recruitPack(a){ if(!PACK[a.sp.id]) return; const sm=SMART(); if(!sm) return;
  for(const o of animals){ if(o!==a&&!o.dead&&o.sp===a.sp&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<45&&Math.random()<sm){ o.state='chase'; o.lost=0; o.sus=0; o.aggro=2; } } }

/* ---------- KI ---------- */
function moveAnimal(a,dx,dz,spd,dt){
  const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
  a.x+=dx*spd*dt; a.z+=dz*spd*dt;
  const r=Math.hypot(a.x,a.z); if(r>WORLD){ a.x*=WORLD/r; a.z*=WORLD/r; }
  const cc=collide(a.x,a.z,a.rad*0.55,false); a.x=cc.x; a.z=cc.z;
  if(!a.sp.friend){ a.trk=(a.trk||0)+spd*dt; if(a.trk>0.9+a.sp.size*1.2){ a.trk=0; if(players.some(p=>Math.abs(a.x-p.x)<70&&Math.abs(a.z-p.z)<70)){ a.tside=-(a.tside||1); addTrack(a,a.tside); } } }
  let tr=Math.atan2(dx,dz), df=tr-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  a.g.rotation.y+=df*Math.min(1,dt*8);
  a.ph+=dt*(6+spd*1.3); animLegs(a.g,a.ph,Math.min(0.9,0.25+spd*0.05));
}
/** Sprungtreffer: trifft irgendein Spieler mit seinem Sprung das Tier a? */
function pounceHits(a){
  for(const p of players){ if(p.pounce>0&&!p.hit&&Math.hypot(p.x-a.x,p.z-a.z)<a.rad+0.5+pScale()*0.8){ p.hit=true; p.pounce=Math.min(p.pounce,0.08); hitAnimal(a,p); return; } }
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
/** Ein Bild Tierverhalten für Tier a. Das Tier reagiert auf den Spieler T aus targetOf (Tarnung T.stealth). */
function updateAnimal(a,dt){
  const T=targetOf(a), stealth=T.stealth==null?1:T.stealth;
  if(a.dead){
    if(a.carc){ a.carc.t-=dt; if(a.carc.t<=0||a.carc.meat<=0){ a.carc=null; a.g.visible=false; a.g.rotation.z=0; } return; }
    a.respawn-=dt; if(a.respawn<=0) placeAnimal(a); return; }
  const sp=a.sp, dx=T.x-a.x, dz=T.z-a.z, d=Math.hypot(dx,dz);
  if(sp.friend){
    const fi=fam.indexOf(a);
    if(fi<3){ const r=famRole(fi); if(!r||!a.famOn){ a.g.visible=false; return; } famStep(a,dt,r); return; }
    if(!seeking()){ a.g.visible=false; return; }
  }
  const dv=players.length>1?nearestDist(a):d;
  if(dv>VIEW_D&&a!==G.raider){ a.g.visible=false; return; } a.g.visible=dv<=VIEW_D;
  a.cd-=dt; if(a.scared>0) a.scared-=dt;
  const hostile=sp.hunt&&S.lvl<sp.hunt&&!(a.scared>0);
  const detect=sp.sense*stealth*D().sense*(sp.pred?1+0.25*(1-dayF):1)*(d>0.1?windMulDir(-dx/d,-dz/d):1);
  if(sp.croc){ if(a.stun>0) a.stun-=dt; else crocStep(a,dt,d,dx,dz,stealth*D().sense,hostile,T);
    pounceHits(a);
    return; }
  if(a.stun>0){ a.stun-=dt; animLegs(a.g,a.ph,0.05); }
  else if(a.state==='wander'){
    a.timer-=dt;
    if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=rnd(4,16); a.tx=a.x+Math.cos(an)*r; a.tz=a.z+Math.sin(an)*r;
      const cr=Math.hypot(a.tx,a.tz); if(cr<sp.ring[0]||cr>sp.ring[1]){ const k=(sp.ring[0]+sp.ring[1])/2/(cr||1); a.tx=a.x+(a.tx*k-a.x)*0.3; a.tz=a.z+(a.tz*k-a.z)*0.3; }
      a.timer=rnd(3,8); a.idle=Math.random()<0.4?rnd(1,3):0;
      if(a.herd){ const L=herdLead(a); if(L!==a){ a.tx=L.x+rnd(-7,7); a.tz=L.z+rnd(-7,7); a.timer=rnd(2,5); } } }
    const farH=a.herd&&Math.hypot(herdLead(a).x-a.x,herdLead(a).z-a.z)>16;
    if(a.idle>0&&!farH){ a.idle-=dt; animLegs(a.g,a.ph,0.03); } else moveAnimal(a,a.tx-a.x,a.tz-a.z,sp.spd*(farH?0.6:0.28),dt);
    a.near=false;
    if(hostile){
      a.near=d<detect*1.6+8;
      if(d<detect){
        if(a.sus<=0) snd.notice();
        a.sus+=dt*(0.3+0.85*(1-d/detect));
        if(a.sus>=1){ a.sus=0; a.near=false; a.state='chase'; a.lost=0; snd.alert(); recruitPack(a); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
      } else a.sus=Math.max(0,a.sus-dt*0.35);
    } else {
      a.sus=0;
      if(d<detect&&(!sp.fight||(sp.pred&&S.lvl>=sp.hunt+2&&d<detect*0.5))) startFlee(a);
    }
  }
  else if(a.state==='raid'){ raidStep(a,dt); }
  else if(a.state==='scav'){
    const c=a.carc;
    if(!c||!c.carc){ a.state='wander'; a.timer=0; a.carc=null; }
    else { const cx=c.x-a.x, cz=c.z-a.z, cd=Math.hypot(cx,cz), pd=Math.hypot(T.x-c.x,T.z-c.z);
      if(hostile&&!T.safe&&cd<25&&(pd<10||d<detect)){ a.state='chase'; a.lost=0; a.aggro=4; a.carc=null; snd.alert(); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
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
    if(r>WORLD-25){ fx+=-a.z*1.5*(a.side||(a.side=Math.random()<.5?1:-1))-a.x*0.5; fz+=a.x*1.5*a.side-a.z*0.5; }
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
    const reach=a.rad+0.5+pScale()*0.7;
    let tx=dx, tz=dz;
    if(PACK[sp.id]&&SMART()>0&&d>6){   // Rudel kreist dich ein: jedes Tier nähert sich von einer anderen Seite
      const all=animals.filter(o=>!o.dead&&o.sp===sp&&o.state==='chase'&&Math.hypot(o.x-T.x,o.z-T.z)<40);
      if(all.length>1){ all.sort((p,q)=>p.uid-q.uid); const off=(all.indexOf(a)-(all.length-1)/2)*1.25*SMART();
        const ang=Math.atan2(a.x-T.x,a.z-T.z)+off*Math.min(1,(d-6)/10); tx=T.x+Math.sin(ang)*4-a.x; tz=T.z+Math.cos(ang)*4-a.z; } }
    if(d>reach*0.8) moveAnimal(a,tx,tz,sp.spd,dt); else animLegs(a.g,a.ph,0.05);
    if(d<reach&&a.cd<=0){ a.cd=1.1; hurtPlayer(sp.dmg,a,false,T); a.g.userData.inner.position.z=0.3; }
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
