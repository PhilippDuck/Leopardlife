// LeopardLife – Spiellogik (Einstiegsmodul).
// Wird Schritt für Schritt in Module nach Zuständigkeit aufgeteilt.
import { ATTR, ABIL, TRAITS, DIFF, REGIONS, QUAL, SPECIES, FOOD, DAT, ART, ICONS, ICOL, ico } from './data.js';
import { $, rnd } from './util.js';
import { G } from './state.js';
import { AC, master, nbuf, initAudio, tone, snd, musicTick } from './audio.js';
import { D, DIE_AT, OLD_AT, REG, REG_ID, S, ancF, at, attrCap, baseSpeed, beaten, dmg, fresh, has, maxHp, maxSt, oldF, pScale, resetState, save, xpNeed } from './save.js';
import { HORIZON, SMART, SUN_OFF, camera, canvas, grassLight, hemi, renderer, resize, scene, sun, windMulDir, windU } from './engine.js';
import { cloudMat, clouds, sky, starMat, stars } from './sky.js';
import { GLSL_H, GLSL_PONDMASK, H, PONDS, WATER_D, WORLD, addCol, collide, cullTiles, inWater, pondAt, registerTile, tileOf, waters } from './terrain.js';
import { _tm, _tv, inGrass, leafGeoHi, leafGeoLo, leafMeshes, leafTime, patches, tallGeo, tallMat, trees, updateTrees } from './vegetation.js';
import { PX_BASE, VIEW_D, applyQuality, blobs, quality } from './quality.js';
import { animLegs, buildQuad, furColor, furName, makeFur } from './models.js';
import { P, START_ROT, START_YAW, dropModel, rebuildPlayer } from './player.js';
import { animals, placeAnimal } from './animals.js';
import { puff, puffs } from './effects.js';
import { inputMode, keys, setInputMode, tapLearned, touchUI } from './input.js';
import { floatText, showToast, toast, toastQ } from './ui.js';
import { toggleSkills } from './skills.js';
import { hudExp, menuOpen, renderKeys, showDiff, toggleMenu, xb } from './menu.js';
import { reloadWorld } from './regions.js';
import { dead, doClimb, doPounce, doRoar, gainXp, hitAnimal, hurtPlayer, nearestTree } from './actions.js';
import { CUB_HOME, FOOD_MAX, context, cub, doContext, endRaid, heirLevel, raidStep, seekT, seeking, updateCub, updateFamArrow } from './family.js';
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }
if(!window.THREE){ $('err').textContent='Three.js konnte nicht geladen werden. Bitte Seite neu laden.'; $('btnPlay').disabled=true; throw new Error('three.js fehlt'); }



function updateEnv(dt,now){
  sun.position.set(P.x+SUN_OFF.x,P.y+SUN_OFF.y,P.z+SUN_OFF.z); sun.target.position.set(P.x,P.y,P.z);
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  const t=now/1000; leafTime.value=t;
  G.windT-=dt; if(G.windT<=0){ G.windTarget=G.windAng+rnd(-1.3,1.3); G.windT=rnd(60,150); }
  G.windAng+=(G.windTarget-G.windAng)*Math.min(1,dt*0.05); windU.value.set(Math.sin(G.windAng),Math.cos(G.windAng));
  G.grassMat.uniforms.uP.value.set(P.x,P.z); G.grassMat.uniforms.uTime.value=t;
  tallMat.uniforms.uP.value.set(P.x,P.z); tallMat.uniforms.uTime.value=t; tallMat.uniforms.uR.value=P.tree!=null?0.01:1.1+pScale()*1.1;
  for(let i=0;i<clouds.length;i++){ const c=clouds[i]; c.position.x+=windU.value.x*c.userData.v*dt; c.position.z+=windU.value.y*c.userData.v*dt; if(c.position.x>500) c.position.x=-500; if(c.position.x<-500) c.position.x=500; if(c.position.z>500) c.position.z=-500; if(c.position.z<-500) c.position.z=500; }
  for(let i=0;i<waters.length;i++){ const w=waters[i]; w.position.y=w.userData.y+Math.sin(t*0.8+i)*0.03; }
}


/* Familienmitglieder: Partner (Platz 0) und Elterntiere (Plätze 1, 2) leben am Bau, verteidigen das Junge
   und versorgen und beschützen den Spieler, solange er selbst noch nicht ausgewachsen ist. Sie können endgültig sterben. */
const fam=animals.filter(a=>a.sp.friend), FAM_HP=220;
let feedT=rnd(40,70);
const famRole=i=>i===0?(S.partner?'partner':null):i===1?(S.p1?'p1':null):i===2?(S.p2?'p2':null):null;
const canMate=()=>S.lvl>=8&&!S.cub&&!(S.preg>0);
const kidMode=()=>S.lvl<8&&(S.p1||S.p2);
function famHome(a){ const an=Math.random()*6.283, r=rnd(5,20); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(4,10); }
function famPlace(a,x,z){ a.x=x; a.z=z; a.fhp=FAM_HP; a.feeding=false; a.famOn=true; a.cd=0; a.fcombat=0; a.idle=0; famHome(a); }
function famDie(a){
  const i=fam.indexOf(a); if(i===0) S.partner=false; else if(i===1) S.p1=false; else S.p2=false;
  a.famOn=false; a.g.visible=false; save(); snd.death(); puff(a.x,H(a.x,a.z)+1,a.z,0xe0a23c,10,0.8);
  toast(i===0?'Dein Partner ist im Kampf gestorben.':'Eines deiner Elterntiere ist im Kampf gestorben.','#ff8a70');
}
function famHurt(a,d){ if(!a.famOn) return; a.fhp-=d; a.fcombat=4; puff(a.x,H(a.x,a.z)+1,a.z,0xc0392b,3,0.4); if(a.fhp<=0) famDie(a); }
function famKill(t){ t.dead=true; t.g.visible=false; t.respawn=rnd(18,30); t.foe=null; if(G.raider===t) G.raider=null; puff(t.x,H(t.x,t.z)+t.sp.size*0.7,t.z,t.sp.m.col,10,0.5+t.sp.size*0.5); }
function famTarget(a,role){
  let best=null, bd=1e9;
  for(const o of animals){ if(o.dead||o.state!=='fightFam') continue; const d=Math.hypot(o.x-a.x,o.z-a.z); if((o.foe===a||d<60)&&d<bd){ bd=d; best=o; } }
  if(best) return best;
  if(G.raider&&!G.raider.pAway&&S.cub&&Math.hypot(G.raider.x-cub.x,G.raider.z-cub.z)<16) return G.raider;
  if(role!=='partner'&&S.lvl<8&&!dead){
    bd=130;
    for(const o of animals){
      if(o.dead||o.state!=='chase') continue;
      const dp=Math.hypot(o.x-P.x,o.z-P.z); if(!(P.hp<maxHp()*0.6||dp<25)) continue;   // nur bei großer Gefahr: Verfolger ist nah oder das Leben niedrig
      const d=Math.hypot(o.x-a.x,o.z-a.z); if(d<bd){ bd=d; best=o; }
    }
  }
  return best;
}
function deliverFood(a){
  P.hp=Math.min(maxHp(),P.hp+maxHp()*0.5); S.hunger=Math.min(100,S.hunger+60); snd.eat(); puff(P.x,P.y+1,P.z,0xff7ab8,8,0.4);
  toast('Ein Elterntier bringt dir Beute: Leben aufgefüllt, Erfahrung erhalten.','#ff9ad0');
  gainXp(Math.round(xpNeed(S.lvl)*0.35));
}
function famStep(a,dt,role){
  a.g.visible=true; a.cd-=dt;
  if(a.fcombat>0) a.fcombat-=dt; else if(a.fhp<FAM_HP) a.fhp=Math.min(FAM_HP,a.fhp+dt*3);
  const t=famTarget(a,role);
  if(t){
    const dx=t.x-a.x, dz=t.z-a.z, d=Math.hypot(dx,dz);
    if(d>t.rad+1.4) moveAnimal(a,dx,dz,14,dt);
    else {
      a.g.rotation.y=Math.atan2(dx,dz); animLegs(a.g,a.ph,0.05);
      if(a.cd<=0){
        a.cd=1.0; a.fcombat=4; t.hp-=18; puff(t.x,H(t.x,t.z)+t.sp.size,t.z,0xc0392b,4,0.5); if(Math.hypot(P.x-a.x,P.z-a.z)<70) snd.hit();
        if(t.hp<=0) famKill(t);
        else if(t.hp<t.sp.hp*0.35){ t.state='flee'; t.fleeT=0; t.scared=15; t.aggro=0; t.foe=null; if(G.raider===t) G.raider=null; }
        else if(t.state!=='fightFam'){ t.state='fightFam'; t.foe=a; t.aggro=0; if(G.raider===t) G.raider=null; }
      }
    }
  } else if(a.feeding){
    const dx=P.x-a.x, dz=P.z-a.z, d=Math.hypot(dx,dz);
    if(dead||P.tree!=null&&d<4){ animLegs(a.g,a.ph,0.03); }
    else if(d>3) moveAnimal(a,dx,dz,9.5,dt); else { a.feeding=false; deliverFood(a); famHome(a); }
  } else {
    a.timer-=dt; if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ famHome(a); a.idle=rnd(1,5); }
    if(a.idle>0){ a.idle-=dt; animLegs(a.g,a.ph,0.03); }
    else moveAnimal(a,a.tx-a.x,a.tz-a.z,Math.hypot(a.x-CUB_HOME.x,a.z-CUB_HOME.z)>32?8:2,dt);
  }
  a.g.position.set(a.x,H(a.x,a.z),a.z);
}
function updateFamily(dt){
  for(let i=0;i<3;i++){ const a=fam[i], r=famRole(i); if(r&&!a.famOn) famPlace(a,CUB_HOME.x+rnd(-9,9),CUB_HOME.z+rnd(-9,9)); if(!r) a.famOn=false; }
  if(kidMode()&&!dead){
    feedT-=dt;
    if(feedT<=0){ feedT=rnd(70,110); let b=null, bd=1e9; for(let i=1;i<3;i++){ const a=fam[i]; if(!a.famOn||a.feeding) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; b=a; } } if(b) b.feeding=true; }
  }
}
// Wechsel ins Junge: freiwillig (das alte Ich bleibt als Elterntier) oder nach dem Tod
function becomeCub(vol){
  recordAncestor(vol?'zog sein Junges groß und lebt als Elterntier weiter':G.lastCause);
  const hl=heirLevel(), ox=P.x, oz=P.z, hadPartner=S.partner&&fam[0].famOn;
  S.p1=!!vol; S.p2=!!hadPartner; S.partner=false;
  if(S.p2) famPlace(fam[2],fam[0].x,fam[0].z); else fam[2].famOn=false;
  if(S.p1) famPlace(fam[1],ox,oz); else fam[1].famOn=false;
  fam[0].famOn=false;
  if(S.cub.trait&&TRAITS[S.cub.trait]&&!has(S.cub.trait)) S.traits=S.traits.concat(S.cub.trait).slice(-3);
  { const sum=o=>Object.keys(o).reduce((x,k)=>x+o[k],0), total=sum(S.a)+2*sum(S.b)+S.pts;   // Eigenschaften und Fähigkeiten werden nicht vererbt, nur 10 % der Punkte
    S.a=fresh().a; S.b=fresh().b; S.pts=Math.round(total*0.1); }
  S.fur=S.cub.fur||null;
  { const ng=(S.gen||1)+1, nr=Object.values(REGIONS).find(r=>r.gen===ng&&!r.soon); if(nr) setTimeout(()=>toast('Deine Linie ist stark genug: '+nr.n+' ist jetzt erreichbar (Menü → Gebiete).','#9be07f'),2600); }
  S.lvl=hl; S.xp=0; S.gen=(S.gen||1)+1; S.cub=null; S.food=0; S.preg=0; S.hunger=80; S.age=0; S.kills=0; if(G.raider) endRaid(G.raider);
  feedT=rnd(30,50); save(); rebuildPlayer();
}
function playAsCub(){
  const cx=cub.x, cz=cub.z; becomeCub(true);
  P.tree=null; P.safe=false; P.dropY=0; P.upNow=0; P.pounce=0; P.x=cx; P.z=cz; P.hp=maxHp(); P.st=maxSt(); P.sneak=false;
  toast('Generation '+S.gen+': Du spielst jetzt als dein Junges. Deine Eltern bringen dir Futter und beschützen dich bei großer Gefahr.','#ff9ad0');
  updateUI();
}
function unpause(){ G.paused=false; if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } }
$('btnStayAdult').onclick=()=>{ $('birth').style.display='none'; unpause(); };
$('btnBeCub').onclick=()=>{ $('birth').style.display='none'; playAsCub(); unpause(); };
G.cubArm=false;
$('btnMenuCub').onclick=()=>{
  if(!S.cub) return;
  if(!G.cubArm){ G.cubArm=true; $('btnMenuCub').textContent='Wirklich? Du startest als Junges auf Stufe '+heirLevel(); return; }
  G.cubArm=false; $('menu').style.display='none'; playAsCub(); unpause();
};

/* ---------- Lebenslauf: eigener Hunger, Altern, Fressen aus dem Vorrat ---------- */
G.lineageEnd=false; G.lastCause='';
function eatFood(){ if(S.food<=0) return; S.food--; S.hunger=Math.min(100,S.hunger+12); P.hp=Math.min(maxHp(),P.hp+maxHp()*0.05); snd.eat(); floatText('gefressen',P.x,P.camY+1.6*pScale(),P.z,'#e0a060'); }
function updateLife(dt){
  if(dead) return;
  S.hunger=Math.max(0,S.hunger-dt*(100/420)*(has('genug')?0.75:1)*D().hunger);
  if(S.hunger<20&&S.food>0){ S.food--; S.hunger=Math.min(100,S.hunger+12); }   // Notration aus dem Vorrat
  if(S.hunger<=0){ P.hp-=maxHp()*0.015*dt; if(P.hp<=0){ hurtPlayer(1e9,{sp:{id:'hunger',n:'Hunger'}},true); return; } }
  if(S.lvl>=8){
    const a0=S.age, D=DIE_AT(); S.age+=dt;
    if(a0<OLD_AT&&S.age>=OLD_AT) toast('Du wirst alt: Tempo und Kraft lassen nach. Sorge für Nachwuchs, damit deine Linie weiterlebt.','#f2b84b');
    if(a0<D-90&&S.age>=D-90) toast('Deine Kräfte schwinden. Dir bleibt nicht mehr viel Zeit.','#ff8a70');
    if(S.age>=D) hurtPlayer(1e9,{sp:{id:'age',n:'Alter'}},true);
  }
}

/* ---------- Tag und Nacht ---------- */
// S.tod: 0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 = Mittag, 0.75 = Sonnenuntergang. Ein ganzer Tag dauert DAY_LEN Sekunden.
const DAY_LEN=480;
let dayF=1, nightToastDone=false, sleeping=false, sleepCount=0;
try{ sleepCount=+localStorage.getItem('jaguar-sleeps')||0; }catch(e){}
const C_DAY_TOP=new THREE.Color(0x3f8fd6), C_DAY_HOR=new THREE.Color(HORIZON), C_NIGHT_TOP=new THREE.Color(0x040814), C_NIGHT_HOR=new THREE.Color(0x101a2e), C_DUSK=new THREE.Color(0xf08a4a);
const C_SUN=new THREE.Color(0xffe6b8), C_SUNLOW=new THREE.Color(0xff9a55), C_MOON=new THREE.Color(0x9fb4ff);
const C_HEMI_D=new THREE.Color(0xd4ecff), C_HEMI_N=new THREE.Color(0x46588a), C_HEMI_NV=new THREE.Color(0x5f9a78), C_GND_D=new THREE.Color(0x6f7a48), C_GND_N=new THREE.Color(0x1a2018);
const _c1=new THREE.Color(), _c2=new THREE.Color();
const clockStr=()=>{ const m=Math.floor(S.tod*1440); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
const canSleepNow=()=>S.tod>0.72||S.tod<0.22;
function updateDayNight(dt){
  if(dt>0){ const t0=S.tod; S.tod=(S.tod+dt/DAY_LEN)%1; if(t0<0.25&&S.tod>=0.25){ S.day=(S.day||0)+1; newGoals(); setTimeout(()=>toast('Ein neuer Tag – neue Tagesziele.','#9be07f'),400); } }
  const a=(S.tod-0.25)*2*Math.PI, el=Math.sin(a), NV=S.b.night||0;
  let d=Math.max(0,Math.min(1,(el+0.1)/0.35)); dayF=d*d*(3-2*d);
  const duskF=Math.max(0,1-Math.abs(el)/0.3);
  const nl=0.2+0.15*NV, L=nl+(1-nl)*dayF;
  // Licht kommt am Tag von der Sonne, nachts vom Mond (gegenüber); flach stehendes Licht wird begrenzt, damit Schatten nicht ausufern
  const s=el>=0?1:-1; SUN_OFF.set(Math.cos(a)*s,Math.max(Math.abs(el),0.35),0.45).normalize().multiplyScalar(90);
  sun.intensity=dayF*1.0+(1-dayF)*(0.22+0.07*NV);
  _c1.copy(C_SUN).lerp(C_SUNLOW,duskF*0.8); sun.color.copy(C_MOON).lerp(_c1,dayF);
  hemi.intensity=0.72*L;
  _c2.copy(C_HEMI_N).lerp(C_HEMI_NV,NV/3); hemi.color.copy(_c2).lerp(C_HEMI_D,dayF); hemi.groundColor.copy(C_GND_N).lerp(C_GND_D,dayF);
  const u=sky.material.uniforms, nb=1+0.6*NV;
  _c1.copy(C_NIGHT_TOP).multiplyScalar(nb); u.top.value.copy(_c1).lerp(C_DAY_TOP,dayF);
  _c2.copy(C_NIGHT_HOR).multiplyScalar(nb); u.hor.value.copy(_c2).lerp(C_DAY_HOR,dayF).lerp(C_DUSK,duskF*0.5);
  u.sunDir.value.copy(SUN_OFF).normalize();
  u.sunCol.value.setRGB(0.45,0.55,0.75).lerp(_c1.setRGB(1,0.86,0.6),dayF);
  scene.background.copy(u.hor.value); scene.fog.color.copy(u.hor.value);
  const fn=0.45+0.17*NV, fm=fn+(1-fn)*dayF; scene.fog.near=G.FOG_BASE[0]*fm; scene.fog.far=G.FOG_BASE[1]*fm;
  starMat.opacity=(1-dayF)*0.9;
  cloudMat.color.setRGB(0.18,0.22,0.32).lerp(_c1.setRGB(1,1,1),dayF).lerp(C_DUSK,duskF*0.35);
  if(G.farMount) G.farMount.material.color.setRGB(0.25+0.75*dayF,0.28+0.72*dayF,0.36+0.64*dayF);
  const gl=grassLight.value; gl.set(0.62,0.72,1.0).multiplyScalar(L*1.15).lerp(_c1.setRGB(1,1,1),dayF);
  // Regen dunkelt ab und verkürzt die Sicht, Blitze hellen kurz auf
  if(W.rain>0||W.flash>0){ const r=W.rain, f=W.flash;
    sun.intensity*=1-0.75*r; hemi.intensity=hemi.intensity*(1-0.35*r)+f*1.6;
    _c1.setRGB(0.36,0.4,0.46).multiplyScalar(0.3+0.7*Math.max(dayF,0.15)); u.top.value.lerp(_c1,r*0.75); u.hor.value.lerp(_c1,r*0.6);
    _c2.setRGB(0.85,0.88,1); u.top.value.lerp(_c2,f*0.7); u.hor.value.lerp(_c2,f*0.6);
    scene.background.copy(u.hor.value); scene.fog.color.copy(u.hor.value);
    scene.fog.near*=1-0.5*r; scene.fog.far*=1-0.45*r;
    cloudMat.color.multiplyScalar(1-0.55*r); grassLight.value.multiplyScalar(1-0.3*r+f*0.8); }
  if(!dayF&&!nightToastDone&&G.started&&!G.paused){ nightToastDone=true;
    toast('Die Nacht bricht herein: Du bist schwerer zu sehen, aber Raubtiere sind wachsamer.'+(S.b.climb&&sleepCount<2?(padUI()?' Auf einem Baum kannst du mit Ⓧ bis zum Morgen schlafen.':touchUI()?' Auf einem Baum kannst du mit dem rosa Knopf bis zum Morgen schlafen.':' Auf einem Baum kannst du mit F bis zum Morgen schlafen.'):''),'#9fb4ff'); }
  if(dayF>0.9) nightToastDone=false;
}
function sleepOnTree(){
  if(sleeping) return;
  sleeping=true; G.paused=true; for(const k in keys) keys[k]=false; G.joyX=G.joyY=0;
  const fx=$('sleepFx'); fx.style.display='flex'; requestAnimationFrame(()=>{ fx.style.opacity=1; });
  setTimeout(()=>{
    const skip=((0.27-S.tod)+1)%1, secs=skip*DAY_LEN;
    S.tod=0.27; S.day=(S.day||0)+1; newGoals(); P.hp=maxHp(); P.st=maxSt(); sleepCount++; try{ localStorage.setItem('jaguar-sleeps',String(sleepCount)); }catch(e){}
    S.hunger=Math.max(5,Math.min(S.hunger-45,30));   // man wacht hungrig auf
    if(S.lvl>=8) S.age+=secs;
    if(S.cub&&S.cub.grow<1) S.cub.full=Math.max(8,S.cub.full-secs*0.28*D().hunger);
    if(S.preg>0) S.preg=Math.max(0.1,S.preg-secs);
    G.raidT=rnd(90,130)*D().raid; if(G.raider) endRaid(G.raider);
    animals.forEach(o=>{ o.aggro=0; o.sus=0; if(o.state==='chase'){ o.state='wander'; o.timer=0; } });
    updateDayNight(0); save(); updateUI();
    fx.style.opacity=0;
    setTimeout(()=>{ fx.style.display='none'; sleeping=false; if(G.started&&!menuOpen()&&$('skills').style.display==='none') G.paused=false;
      toast('Du wachst bei Sonnenaufgang auf – ausgeruht, aber hungrig.','#f2b84b'); },900);
  },1700);
}

/* ---------- Kadaver, Aasfresser, Herden, Ahnenbuch ---------- */
// Größere Beute bleibt als Kadaver liegen: Du frisst gleich die Hälfte, der Rest bleibt für später – und lockt Hyänen und Schakale an.
function makeCarcass(a,meat){
  a.carc={t:55,meat}; a.g.visible=true; a.g.rotation.z=Math.PI/2;
  a.g.position.set(a.x,H(a.x,a.z)+a.sp.size*0.22,a.z); animLegs(a.g,0,0);
  const sc=animals.filter(o=>!o.dead&&(o.sp.id==='hyena'||o.sp.id==='jack')&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<150)
    .sort((p,q)=>(p.sp.id==='hyena'?0:1)-(q.sp.id==='hyena'?0:1)||Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z)).slice(0,2);
  sc.forEach(o=>{ o.state='scav'; o.carc=a; o.eatT=0; o.sus=0; });
  if(sc.length&&Math.hypot(P.x-a.x,P.z-a.z)<80){ const hy=sc[0].sp.id==='hyena';
    setTimeout(()=>toast((hy?'Hyänen':'Schakale')+' haben die Beute gewittert und kommen!'+(sc[0].sp.hunt&&S.lvl<sc[0].sp.hunt?' Nimm dir, was du brauchst, und verschwinde.':''),'#f2b84b'),1200); }
}
function nearCarcass(){ for(const a of animals){ if(a.carc&&a.carc.meat>0&&Math.hypot(a.x-P.x,a.z-P.z)<a.rad+2.6) return a; } return null; }
function takeMeat(c,store){
  const n=store?Math.min(c.carc.meat,FOOD_MAX-S.food):Math.min(c.carc.meat,Math.max(1,Math.ceil((100-S.hunger)/10)));
  if(n<=0) return;
  if(store) S.food+=n; else { S.hunger=Math.min(100,S.hunger+n*10); P.hp=Math.min(maxHp(),P.hp+maxHp()*0.05*n); }
  c.carc.meat-=n; snd.eat(); if(!store) goalEvent('meat',1); puff(c.x,H(c.x,c.z)+0.6,c.z,0xc0392b,5,0.4);
  floatText(store?'+'+n+' Futter im Vorrat':'gefressen',c.x,H(c.x,c.z)+1.4,c.z,store?'#ff9ad0':'#e0a060');
}
// Herden: Wasserschweine, Hirsche und Antilopen ziehen in Gruppen. Flieht eines, fliehen die Nachbarn mit.
const herdLead=a=>{ for(const m of a.herd) if(!m.dead) return m; return a; };
function startFlee(a){
  a.state='flee'; a.fleeT=0;
  if(a.herd) for(const m of a.herd) if(m!==a&&!m.dead&&m.state==='wander'&&Math.hypot(m.x-a.x,m.z-a.z)<40){ m.state='flee'; m.fleeT=0; m.sus=0; }
}
// Ahnenbuch: jede Generation der Blutlinie mit Fell, Erbanlagen, Stufe, Beute und Schicksal
function recordAncestor(cause){ S.anc=(S.anc||[]).concat({g:S.gen||1,l:S.lvl,f:S.fur?Object.assign({},S.fur):null,t:S.traits.slice(),k:S.kills||0,c:cause}).slice(-40); }
function archiveLine(){
  let L=[]; try{ L=JSON.parse(localStorage.getItem('jaguar-lines')||'[]'); }catch(e){}
  L.unshift({g:S.gen||1,d:S.diff,at:Date.now()}); try{ localStorage.setItem('jaguar-lines',JSON.stringify(L.slice(0,10))); }catch(e){}
}
const hex6=n=>'#'+n.toString(16).padStart(6,'0');
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderBook(){
  const row=(e,me)=>{ const col=e.f?furColor(0xe0a23c,e.f):0xe0a23c;
    return '<div class="anc"><span class="sw" style="background:'+hex6(col)+'"></span><div><b>Generation '+e.g+(me?' · du':'')+'</b>'+
      '<small>Stufe '+e.l+' · Fell: '+esc(furName(e.f))+' · '+e.k+' Beutetier'+(e.k===1?'':'e')+'</small>'+
      '<small>'+(e.t.length?e.t.map(t=>'<span class="tchip">'+ico(t,ICOL.t,13)+(TRAITS[t]?TRAITS[t][0]:t)+'</span>').join(''):'Erbanlagen: keine')+'</small>'+
      '<small style="color:'+(me?'#9be07f':'var(--txt)')+'">'+esc(e.c)+'</small></div></div>'; };
  const cur={g:S.gen||1,l:S.lvl,f:S.fur,t:S.traits,k:S.kills||0,c:'lebt'};
  $('bookList').innerHTML=row(cur,true)+(S.anc||[]).slice().reverse().map(e=>row(e,false)).join('');
  let L=[]; try{ L=JSON.parse(localStorage.getItem('jaguar-lines')||'[]'); }catch(e){}
  $('bookLines').innerHTML=L.length?L.map(l=>'<div style="font-size:12px;color:var(--mut);padding:2px 0">Endete in Generation '+l.g+' · '+(DIFF[l.d]?DIFF[l.d].n:'Normal')+' · '+new Date(l.at).toLocaleDateString('de-DE')+'</div>').join(''):'<div style="font-size:12px;color:var(--mut)">Noch keine.</div>';
}
function openBook(){ renderBook(); $('menu').style.display='none'; $('book').style.display='flex'; }
function closeBook(){ $('book').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const bookOpen=()=>$('book').style.display==='flex';
$('btnBook').onclick=openBook;
function openSettings(){ renderKeys(); $('menu').style.display='none'; $('settings').style.display='flex'; }
function closeSettings(){ $('settings').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const settingsOpen=()=>$('settings').style.display==='flex';
$('btnSettings').onclick=openSettings; $('btnSetBack').onclick=closeSettings; $('btnBookBack').onclick=closeBook;

/* ---------- Wetter: Regen und Gewitter ---------- */
// W.rain: 0 = trocken, 1 = Starkregen. Regen dunkelt ab, verkürzt die Sicht und übertönt deine Schritte (schwerer zu entdecken).
const W={rain:0,target:0,storm:false,t:rnd(90,180),flash:0,lightT:6};
let rainGain=null;
const rainMat=new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, fog:false,
  uniforms:{uCam:{value:new THREE.Vector3()},uTime:{value:0},uOp:{value:0},uWind:windU},
  vertexShader:'attribute float aEnd; uniform vec2 uWind; uniform vec3 uCam; uniform float uTime; varying float vA;\nvoid main(){ vec3 o=position; float S=70.0; float Hh=38.0; vec3 p;\n'+
    ' p.x=uCam.x-S*0.5+mod(o.x*S-(uCam.x-S*0.5),S); p.z=uCam.z-S*0.5+mod(o.z*S-(uCam.z-S*0.5),S);\n'+
    ' p.y=uCam.y-Hh*0.45+mod(o.y*Hh-uTime*24.0,Hh)+aEnd*1.1; p.xz+=uWind*aEnd*0.4; vA=aEnd;\n'+
    ' gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0); }',
  fragmentShader:'uniform float uOp; varying float vA; void main(){ gl_FragColor=vec4(0.78,0.83,0.92,uOp*(0.25+0.45*vA)); }'
});
(function(){
  const N=3200, pos=new Float32Array(N*6), end=new Float32Array(N*2);
  for(let i=0;i<N;i++){ const x=Math.random(), y=Math.random(), z=Math.random(); pos.set([x,y,z,x,y,z],i*6); end[i*2]=1; end[i*2+1]=0; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('aEnd',new THREE.BufferAttribute(end,1));
  const m=new THREE.LineSegments(g,rainMat); m.frustumCulled=false; m.renderOrder=5; scene.add(m);
})();
function updateWeather(dt){
  W.t-=dt;
  if(W.t<=0){
    if(W.target>0){ W.target=0; W.storm=false; W.t=rnd(150,300); }
    else if(Math.random()<0.45){ W.target=rnd(0.6,1); W.storm=Math.random()<0.45; W.t=rnd(60,140); W.lightT=rnd(4,9);
      toast(W.storm?'Ein Gewitter zieht auf! Donner und Regen übertönen deine Schritte.':'Es beginnt zu regnen – der Regen übertönt deine Schritte.','#9fc0e0'); }
    else W.t=rnd(60,140);
  }
  W.rain+=Math.max(-dt*0.06,Math.min(dt*0.06,W.target-W.rain));
  if(W.flash>0) W.flash=Math.max(0,W.flash-dt*4);
  if(W.storm&&W.rain>0.5){ W.lightT-=dt;
    if(W.lightT<=0){ W.lightT=rnd(5,14); W.flash=1; setTimeout(()=>snd.thunder(),rnd(500,2400));
      // Donner schreckt Beute in der Nähe auf
      for(const a of animals){ if(!a.dead&&!a.sp.fight&&a.state==='wander'&&Math.hypot(a.x-P.x,a.z-P.z)<60&&Math.random()<0.5) startFlee(a); } } }
  rainMat.uniforms.uOp.value=W.rain*0.85; rainMat.uniforms.uCam.value.copy(camera.position); rainMat.uniforms.uTime.value+=dt;
  if(AC&&master&&!rainGain){ try{ const s=AC.createBufferSource(); s.buffer=nbuf; s.loop=true; const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1700; f.Q.value=0.5;
    rainGain=AC.createGain(); rainGain.gain.value=0; s.connect(f); f.connect(rainGain); rainGain.connect(master); s.start(); }catch(e){} }
  if(rainGain) rainGain.gain.setTargetAtTime(W.rain*0.16,AC.currentTime,0.4);
}

/* ---------- Tagesziele ---------- */
// Zu jedem Sonnenaufgang drei neue Aufgaben; jede bringt einen Teil der nächsten Stufe als Bonus-Erfahrung.
const PREY_BY_LVL=l=>{ const L=l<3?['hase','maus']:l<6?['capy','hase']:l<9?['boar','deer','capy']:l<12?['deer','anti','boar']:['anti','lion','hyena','croc']; const f=L.filter(id=>animals.some(a=>a.sp.id===id)); return f.length?f:['hase']; };
function spName(id){ const sp=SPECIES.find(x=>x.id===id); return sp?sp.n:id; }
function newGoals(){
  const pool=[];
  const n=3+Math.floor(Math.random()*3); pool.push({id:'kill',text:'Erlege '+n+' Beutetiere',need:n});
  const pr=PREY_BY_LVL(S.lvl), sp=pr[Math.floor(Math.random()*pr.length)]; pool.push({id:'sp:'+sp,text:'Erlege '+(ART[sp]||'ein')+' '+spName(sp),need:1});
  pool.push({id:'night',text:'Erlege nachts ein Tier',need:1});
  pool.push({id:'amb',text:'Lande 2 Treffer aus dem Hinterhalt',need:2});
  pool.push({id:'herd',text:'Erlege ein Tier aus einer Herde',need:1});
  pool.push({id:'meat',text:'Friss an einem Kadaver',need:1});
  if(S.lvl<12) pool.push({id:'hide',text:'Bleib 20 s versteckt, während ein Raubtier in der Nähe ist',need:20});
  if(S.b.climb) pool.push({id:'climb',text:'Klettere auf 3 Bäume',need:3});
  if(S.cub&&S.cub.grow<1) pool.push({id:'feed',text:'Bring deinem Jungen 6 Portionen Futter',need:6});
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)), t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
  S.goals={day:S.day||0,list:pool.slice(0,3).map(g=>Object.assign(g,{have:0,done:false}))};
  goalHtml=''; save();
}
function goalEvent(type,n,extra){
  if(!S.goals) return;
  for(const g of S.goals.list){
    if(g.done) continue;
    let add=0;
    if(type==='kill'){ if(g.id==='kill') add=1; else if(g.id==='sp:'+extra.sp) add=1; else if(g.id==='night'&&extra.night) add=1; else if(g.id==='herd'&&extra.herd) add=1; }
    else if(type===g.id) add=n||1;
    if(!add) continue;
    g.have=Math.min(g.need,g.have+add);
    if(g.have>=g.need){ g.done=true; const xp=Math.round(xpNeed(S.lvl)*0.3); snd.level();
      toast('Tagesziel erfüllt: '+g.text+' · +'+xp+' EP','#9be07f'); gainXp(xp); }
    goalHtml=''; save();
  }
}
let goalHtml='';
function renderGoals(){
  const el=$('goalBox'); if(!S.goals) newGoals();
  const L=S.goals.list, dn=L.filter(g=>g.done).length;
  const h='<div class="gh">Tagesziele '+dn+'/'+L.length+'</div>'+L.map(g=>'<div class="gl'+(g.done?' done':'')+'"><span>'+(g.done?'✔':'○')+'</span><span>'+g.text+(g.done||g.need<2?'':' ('+Math.floor(g.have)+'/'+g.need+')')+'</span></div>').join('');
  if(h!==goalHtml){ goalHtml=h; el.innerHTML=h; } el.style.display='block';
}

/* ---------- Spuren: Tiere hinterlassen Fährten; mit Witterung bleiben sie länger sichtbar. Raubtier-Fährten sind rötlich. ---------- */
const TRACK_N=500, _c3=new THREE.Color(), _tz=new THREE.Matrix4().makeScale(0,0,0), _tq2=new THREE.Quaternion(), _tY=new THREE.Vector3(0,1,0);
const trackMesh=(()=>{ const g=new THREE.CircleGeometry(1,7); g.rotateX(-Math.PI/2);
  const m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),TRACK_N);
  for(let i=0;i<TRACK_N;i++){ m.setMatrixAt(i,_tz); m.setColorAt(i,_c3.setHex(0x3a2a18)); }
  m.frustumCulled=false; m.renderOrder=1; scene.add(m); return m; })();
const tracks=new Array(TRACK_N).fill(null); let trackI=0, trackUpd=0;
const trackLife=()=>25+20*S.b.nose+(has('nase')?15:0);
function addTrack(a,side){
  const ang=a.g.rotation.y, s=a.sp.size, off=0.2*s*side, x=a.x+Math.cos(ang)*off, z=a.z-Math.sin(ang)*off;
  const pred=!!(a.sp.hunt&&S.lvl<a.sp.hunt);
  tracks[trackI]={x,z,y:H(x,z)+0.05,s:0.08+0.12*s,rot:ang,t:0};
  trackMesh.setColorAt(trackI,_c3.setHex(pred?0x6a1c10:0x3a2a18)); trackMesh.instanceColor.needsUpdate=true;
  trackI=(trackI+1)%TRACK_N;
}
function updateTracks(dt){
  trackUpd+=dt; if(trackUpd<0.2) return; const el=trackUpd; trackUpd=0;
  const life=trackLife(); let ch=false;
  for(let i=0;i<TRACK_N;i++){ const t=tracks[i]; if(!t) continue; t.t+=el; ch=true;
    if(t.t>=life){ tracks[i]=null; trackMesh.setMatrixAt(i,_tz); continue; }
    const f=Math.min(1,(life-t.t)/6)*t.s; _tq2.setFromAxisAngle(_tY,t.rot);
    _tm.compose(_tv.set(t.x,t.y,t.z),_tq2,_ts2.set(f*0.7,1,f)); trackMesh.setMatrixAt(i,_tm); }
  if(ch) trackMesh.instanceMatrix.needsUpdate=true;
}
const _ts2=new THREE.Vector3();

/* ---------- Trefferfeedback und Jagd-Ansicht ---------- */
// slowT: kurze Zeitlupe nach Hinterhalt und Beute; shakeA: Kamerawackeln; huntF: Kamera rückt beim Schleichen näher
G.slowT=0; G.shakeA=0; G.huntF=0;

/* ---------- Krokodile: lauern abgetaucht im Wasser, schnellen hervor, wenn du zu nah kommst, und ziehen sich danach zurück ---------- */
function crocStep(a,dt,d,dx,dz,stealth,hostile){
  const sp=a.sp, p=a.pond, wl=p.L-WATER_D;
  if(a.state==='lunge'){
    a.lt-=dt; moveAnimal(a,dx,dz,12+2*sp.size,dt);
    if(d<a.rad+0.9+pScale()*0.6&&a.cd<=0&&!P.safe){ a.cd=1.6; hurtPlayer(sp.dmg,a); a.lt=Math.min(a.lt,0.25); }
    if(a.lt<=0) a.state='return';
  } else if(a.state==='lurk'){
    a.timer-=dt;
    if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=Math.random()*p.r*0.65; a.tx=p.x+Math.cos(an)*r; a.tz=p.z+Math.sin(an)*r; a.timer=rnd(6,14); }
    moveAnimal(a,a.tx-a.x,a.tz-a.z,0.6,dt);
    a.near=hostile&&d<20;
    const reach=(4.5+2.5*sp.size)*Math.max(0.55,stealth);
    if(hostile&&!P.safe&&!dead&&a.cd<=0&&d<reach){ a.state='lunge'; a.lt=0.9; snd.croc(); puff(a.x,wl+0.3,a.z,0xd8ecf2,10,0.5); floatText('!',a.x,wl+sp.size*1.5,a.z,'#ff5a3c'); }
    if(d<30&&Math.random()<dt*0.6) puff(a.x+rnd(-0.6,0.6),wl+0.05,a.z+rnd(-0.6,0.6),0xe0f0f4,2,0.15);   // Luftblasen
  } else {
    const hx=p.x-a.x, hz=p.z-a.z, hd=Math.hypot(hx,hz);
    if(a.state==='chase'&&hd<p.r+14&&!P.safe&&!dead){   // angegriffen: verteidigt sich kurz am Ufer
      if(d>a.rad+1) moveAnimal(a,dx,dz,sp.spd*1.6,dt); else if(a.cd<=0){ a.cd=1.3; hurtPlayer(sp.dmg*0.7,a); }
      a.aggro-=dt; if(a.aggro<=0) a.state='return';
    } else if(hd>p.r*0.5) moveAnimal(a,hx,hz,sp.spd*(a.state==='flee'?1.6:1),dt);
    else { a.state='lurk'; a.timer=0; }
  }
  const inW=Math.hypot(a.x-p.x,a.z-p.z)<p.r*0.95, gy=H(a.x,a.z);
  a.g.position.set(a.x,inW&&a.state==='lurk'?Math.max(gy,wl-0.22*sp.size):gy,a.z);
}

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
  if(!a.sp.friend){ a.trk=(a.trk||0)+spd*dt; if(a.trk>0.9+a.sp.size*1.2){ a.trk=0; if(Math.abs(a.x-P.x)<70&&Math.abs(a.z-P.z)<70){ a.tside=-(a.tside||1); addTrack(a,a.tside); } } }
  let tr=Math.atan2(dx,dz), df=tr-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  a.g.rotation.y+=df*Math.min(1,dt*8);
  a.ph+=dt*(6+spd*1.3); animLegs(a.g,a.ph,Math.min(0.9,0.25+spd*0.05));
}
function updateAnimal(a,dt,stealth){
  if(a.dead){
    if(a.carc){ a.carc.t-=dt; if(a.carc.t<=0||a.carc.meat<=0){ a.carc=null; a.g.visible=false; a.g.rotation.z=0; } return; }
    a.respawn-=dt; if(a.respawn<=0) placeAnimal(a); return; }
  const sp=a.sp, dx=P.x-a.x, dz=P.z-a.z, d=Math.hypot(dx,dz);
  if(sp.friend){
    const fi=fam.indexOf(a);
    if(fi<3){ const r=famRole(fi); if(!r||!a.famOn){ a.g.visible=false; return; } famStep(a,dt,r); return; }
    if(!seeking()){ a.g.visible=false; return; }
  }
  if(d>VIEW_D&&a!==G.raider){ a.g.visible=false; return; } a.g.visible=d<=VIEW_D;
  a.cd-=dt; if(a.scared>0) a.scared-=dt;
  const hostile=sp.hunt&&S.lvl<sp.hunt&&!(a.scared>0);
  const detect=sp.sense*stealth*D().sense*(sp.pred?1+0.25*(1-dayF):1)*(d>0.1?windMulDir(-dx/d,-dz/d):1);
  if(sp.croc){ if(a.stun>0) a.stun-=dt; else crocStep(a,dt,d,dx,dz,stealth*D().sense,hostile);
    if(P.pounce>0&&!P.hit&&d<a.rad+0.5+pScale()*0.8){ P.hit=true; P.pounce=Math.min(P.pounce,0.08); hitAnimal(a); }
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
    else { const cx=c.x-a.x, cz=c.z-a.z, cd=Math.hypot(cx,cz), pd=Math.hypot(P.x-c.x,P.z-c.z);
      if(hostile&&!P.safe&&cd<25&&(pd<10||d<detect)){ a.state='chase'; a.lost=0; a.aggro=4; a.carc=null; snd.alert(); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
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
    if(P.safe){
      a.aggro=0; a.lost+=dt;
      if(d>a.rad+3.5) moveAnimal(a,dx,dz,sp.spd*0.6,dt); else animLegs(a.g,a.ph,0.05);
      if(a.lost>({easy:2.5,normal:6,hard:12})[S.diff]){ a.state='wander'; a.timer=0; a.sus=0; a.scared=6; snd.lost(); floatText('?',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ddd'); }
      a.g.position.set(a.x,H(a.x,a.z),a.z); return;
    }
    if(a.aggro>0) a.aggro-=dt;
    const reach=a.rad+0.5+pScale()*0.7;
    let tx=dx, tz=dz;
    if(PACK[sp.id]&&SMART()>0&&d>6){   // Rudel kreist dich ein: jedes Tier nähert sich von einer anderen Seite
      const all=animals.filter(o=>!o.dead&&o.sp===sp&&o.state==='chase'&&Math.hypot(o.x-P.x,o.z-P.z)<40);
      if(all.length>1){ all.sort((p,q)=>p.uid-q.uid); const off=(all.indexOf(a)-(all.length-1)/2)*1.25*SMART();
        const ang=Math.atan2(a.x-P.x,a.z-P.z)+off*Math.min(1,(d-6)/10); tx=P.x+Math.sin(ang)*4-a.x; tz=P.z+Math.cos(ang)*4-a.z; } }
    if(d>reach*0.8) moveAnimal(a,tx,tz,sp.spd,dt); else animLegs(a.g,a.ph,0.05);
    if(d<reach&&a.cd<=0){ a.cd=1.1; hurtPlayer(sp.dmg,a); a.g.userData.inner.position.z=0.3; }
    if(a.aggro<=0){
      if(!hostile){ a.state='wander'; a.timer=0; }
      else { if(d>detect) a.lost+=dt; else a.lost=0; if(a.lost>3.5||d>75){ a.state='wander'; a.timer=0; if(d<50) snd.lost(); if(d<50) floatText('?',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ddd'); } }
    }
  }
  const inn=a.g.userData.inner; inn.position.z*=0.85;
  a.g.position.set(a.x,H(a.x,a.z),a.z);
  // Sprungtreffer
  if(P.pounce>0&&!P.hit&&!sp.friend&&d<a.rad+0.5+pScale()*0.8){ P.hit=true; P.pounce=Math.min(P.pounce,0.08); hitAnimal(a); }
}

/* Versteck-Anzeige: Auge am Fadenkreuz + dunkler Bildrand. 0 = sichtbar, 1 = schwerer zu sehen, 2 = versteckt */
const EYES=[
  '<svg viewBox="0 0 24 24"><path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 12 H22 Q12 21 2 12 Z"/><path d="M8.8 12 A3.2 3.2 0 0 0 15.2 12 Z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 11 Q12 19 22 11"/><path d="M6 15.5 L4.5 18 M12 17 V20 M18 15.5 L19.5 18"/></svg>'
];
function setHide(lv){
  const e=$('eye'); e.innerHTML=EYES[lv]; e.style.color=lv===2?'#8fe07a':lv===1?'#f2b84b':'#fff'; e.style.opacity=lv===0?0:1;
  $('hideV').style.opacity=lv===2?1:lv===1?0.4:0;
  if(lv===2&&P.hideLv!==2) snd.rustle();
  P.hideLv=lv;
}
setHide(0);

/* ---------- Hauptschleife ---------- */
const rc=$('rc').getContext('2d');
G.last=performance.now(); G.uiT=0;
/* Leistung: Schattenkarte nur jedes zweite Bild, Auflösung passt sich der Bildrate an, Bildrate auf Wunsch anzeigen */
let autoRes=true, showFps=false, fpsN=0, fpsT=0, fpsVal=0, shadowTick=0;
try{ autoRes=localStorage.getItem('jaguar-autores')!=='0'; showFps=localStorage.getItem('jaguar-fps')==='1'; }catch(e){}
function setResLabel(){ $('btnAutoRes').textContent='Auflösung automatisch: '+(autoRes?'an':'aus'); $('btnFps').textContent='Bildrate anzeigen: '+(showFps?'an':'aus'); $('fps').style.display=showFps?'block':'none'; }
$('btnAutoRes').onclick=()=>{ autoRes=!autoRes; if(!autoRes){ G.pxScale=1; renderer.setPixelRatio(PX_BASE); } try{ localStorage.setItem('jaguar-autores',autoRes?'1':'0'); }catch(e){} setResLabel(); };
$('btnFps').onclick=()=>{ showFps=!showFps; try{ localStorage.setItem('jaguar-fps',showFps?'1':'0'); }catch(e){} setResLabel(); };
function perfTick(now){
  if(renderer.shadowMap.enabled&&sun.castShadow){ shadowTick++; if(shadowTick%2===0) renderer.shadowMap.needsUpdate=true; }
  if(!fpsT){ fpsT=now; fpsN=0; return; }
  fpsN++; const el=now-fpsT;
  if(el>=2000){
    if(el<4000){   // nach langer Pause (Tab im Hintergrund) nicht messen
      fpsVal=fpsN*1000/el;
      if(autoRes&&!G.paused){
        if(fpsVal<48&&G.pxScale>0.55){ G.pxScale=Math.max(0.55,G.pxScale-0.1); renderer.setPixelRatio(PX_BASE*G.pxScale); }
        else if(fpsVal>57&&G.pxScale<1){ G.pxScale=Math.min(1,G.pxScale+0.05); renderer.setPixelRatio(PX_BASE*G.pxScale); }
      }
      if(showFps) $('fps').textContent=Math.round(fpsVal)+' Bilder/s · Auflösung '+Math.round(G.pxScale*100)+' %';
    }
    fpsT=now; fpsN=0;
  }
}
/* ---------- Controller-Steuerung (Gamepad, Standardbelegung wie Xbox/PlayStation) ----------
   Linker Stick laufen · rechter Stick Kamera · A Sprung · B Schleichen · X Aktion · Y Klettern · LB Brüllen · RT/L3 Sprinten
   R3 Kamera hinter den Leoparden · Steuerkreuz hoch/runter Zoom · Start Menü · Back/Select Entwicklung.
   In Menüs: Steuerkreuz oder Stick wählt, A bestätigt, B geht zurück. Später steuert Controller N den Spieler N. */
let padX=0, padY=0, padSprint=false, padIdx=-1, padSynth=false, padNavT=0, padFocusEl=null;
const padPrev=[];
function padUI(){ return inputMode==='pad'; }   // als Funktion, weil die Anzeige sie schon vor diesem Abschnitt braucht
const PADDZ=0.2, pdz=v=>Math.abs(v)<PADDZ?0:(v-Math.sign(v)*PADDZ)/(1-PADDZ);
function rumble(strong,weak,ms){ try{ const gp=padIdx>=0&&navigator.getGamepads()[padIdx]; if(gp&&gp.vibrationActuator){ const r=gp.vibrationActuator.playEffect('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak}); if(r&&r.catch) r.catch(()=>{}); } }catch(e){} }
function pressKey(code){ padSynth=true; try{ window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code})); }catch(e){} padSynth=false; }
function topOverlay(){ for(const id of ['birth','dead','win','settings','regions','book','skills','menu','start']){ const el=$(id); if(el&&getComputedStyle(el).display!=='none') return el; } return null; }
function padButtons(ov){ return Array.from(ov.querySelectorAll('button,summary')).filter(b=>!b.disabled&&b.offsetParent!==null); }
function setPadFocus(el){ if(padFocusEl) padFocusEl.classList.remove('padf'); padFocusEl=el; if(el){ el.classList.add('padf'); try{ el.scrollIntoView({block:'nearest'}); }catch(e){} } }
function pollPads(dt){
  let gps; try{ gps=navigator.getGamepads?Array.from(navigator.getGamepads()):[]; }catch(e){ return; }
  for(const g of gps){ if(g&&g.connected&&g.index!==padIdx&&(g.buttons.some(b=>b.pressed)||g.axes.some(a=>Math.abs(a)>0.35))) padIdx=g.index; }
  const gp=padIdx>=0?gps[padIdx]:null;
  if(!gp){ padX=padY=0; padSprint=false; return; }
  const prev=padPrev[gp.index]||(padPrev[gp.index]=[]), B=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed), hit=i=>B(i)&&!prev[i];
  if(inputMode!=='pad'&&(gp.buttons.some(b=>b.pressed)||gp.axes.some(a=>Math.abs(a)>0.35))) setInputMode('pad');
  const ov=topOverlay();
  if(ov){
    padX=padY=0; padSprint=false;
    const btns=padButtons(ov); if(padFocusEl&&btns.indexOf(padFocusEl)<0) setPadFocus(null);
    const v=pdz(gp.axes[1]||0); padNavT-=dt; if(Math.abs(v)<0.3) padNavT=0;
    const up=hit(12)||(v<-0.6&&padNavT<=0), down=hit(13)||(v>0.6&&padNavT<=0);
    if((up||down)&&btns.length){ let i=btns.indexOf(padFocusEl); i=i<0?0:(i+(down?1:-1)+btns.length)%btns.length; setPadFocus(btns[i]); if(Math.abs(v)>0.6) padNavT=0.22; }
    if(hit(0)){ if(padFocusEl) padFocusEl.click(); else if(btns.length) setPadFocus(btns[0]); }
    if(hit(1)){ if(ov.id==='menu') toggleMenu(); else pressKey('Escape'); }
    if(hit(9)&&ov.id==='menu') toggleMenu();
    if(hit(8)&&ov.id==='skills') toggleSkills();
  } else {
    setPadFocus(null);
    padX=pdz(gp.axes[0]||0); padY=pdz(gp.axes[1]||0);
    padSprint=B(10)||!!(gp.buttons[7]&&gp.buttons[7].value>0.3);
    if(!G.paused){
      G.camYaw-=pdz(gp.axes[2]||0)*dt*2.8; G.camPitch=Math.max(0.08,Math.min(1.25,G.camPitch+pdz(gp.axes[3]||0)*dt*1.8));
      if(hit(0)) doPounce();
      if(hit(1)) P.sneak=!P.sneak;
      if(hit(2)) doContext();
      if(hit(3)) doClimb();
      if(hit(4)) doRoar();
      if(hit(11)) G.camYaw=P.rot+Math.PI;
      if(hit(12)) G.camZoom=Math.max(0.45,G.camZoom/1.15);
      if(hit(13)) G.camZoom=Math.min(2.6,G.camZoom*1.15);
    }
    if(hit(9)&&G.started) toggleMenu();
    if(hit(8)&&G.started) toggleSkills();
  }
  for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i);
}
window.addEventListener('gamepadconnected',e=>{ toast('Controller verbunden: '+String(e.gamepad.id||'').split('(')[0].trim().slice(0,40),'#9be07f'); });
window.addEventListener('gamepaddisconnected',e=>{ if(e.gamepad.index===padIdx){ padIdx=-1; padX=padY=0; toast('Controller getrennt','#f2b84b'); } });

function frame(now){
  requestAnimationFrame(frame); perfTick(now);
  let dt=Math.min(0.05,(now-G.last)/1000); G.last=now;
  pollPads(dt);
  if(G.slowT>0){ G.slowT-=dt; dt*=0.25; }
  if(!G.paused) step(dt);
  updateCamera(); updateTrees(dt); updateEnv(dt,now); musicTick(); cullTiles();
  renderer.render(scene,camera);
}
function step(dt){
  // Kameratasten
  if(keys.ArrowLeft) G.camYaw+=dt*2; if(keys.ArrowRight) G.camYaw-=dt*2;
  if(keys.ArrowUp) G.camPitch=Math.max(0.08,G.camPitch-dt); if(keys.ArrowDown) G.camPitch=Math.min(1.25,G.camPitch+dt);
  // Bewegung
  let fw=(keys.KeyW?1:0)-(keys.KeyS?1:0)-G.joyY-padY, rt=(keys.KeyD?1:0)-(keys.KeyA?1:0)+G.joyX+padX;
  const il=Math.hypot(fw,rt); if(il>1){ fw/=il; rt/=il; }
  const s=Math.sin(G.camYaw), c=Math.cos(G.camYaw);
  let mx=-s*fw+c*rt, mz=-c*fw-s*rt;
  const moving=il>0.1&&P.tree==null;
  const wantSprint=(keys.ShiftLeft||keys.ShiftRight||G.tSprint||padSprint)&&moving&&!P.sneak;
  let sprint=wantSprint&&P.st>1;
  let spd=baseSpeed()*(sprint?1.6:P.sneak?0.45:1); if(P.wet) spd*=0.65;
  if(sprint) P.st-=20*dt; else P.st=Math.min(maxSt(),P.st+(12+2*at('sta'))*(S.hunger<25?0.5:1)*(moving?0.7:1.3)*dt);
  if(P.st<=1&&G.tSprint){ G.tSprint=false; $('tbS').classList.remove('on'); }
  const sc=pScale();
  if(P.tree!=null){
    const t=trees[P.tree]; P.climbT=Math.min(1,P.climbT+dt/(1.3-0.3*S.b.climb));
    const e=P.climbT*P.climbT*(3-2*P.climbT);
    const tx=t.x+t.perch[0], tz=t.z+t.perch[2]; P.x=P.fromX+(tx-P.fromX)*e; P.z=P.fromZ+(tz-P.fromZ)*e;
    if(P.climbT<1){ P.rot=Math.atan2(tx-P.fromX,tz-P.fromZ); P.walkT+=dt*14; }
    P.safe=P.climbT>0.5;
  } else if(P.pounce>0){
    P.pounce-=dt; if(P.pounce<=0) P.leap=false; const ps=19+3*S.b.jmp+baseSpeed()*0.5;
    P.x+=Math.sin(P.rot)*ps*dt; P.z+=Math.cos(P.rot)*ps*dt;
  } else if(moving){
    P.x+=mx*spd*dt; P.z+=mz*spd*dt;
    let tr=Math.atan2(mx,mz), df=tr-P.rot; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283; P.rot+=df*Math.min(1,dt*12);
  }
  const pr=Math.hypot(P.x,P.z); if(pr>WORLD){ P.x*=WORLD/pr; P.z*=WORLD/pr; }
  if(P.tree==null){ const c=collide(P.x,P.z,0.3+0.4*sc,P.pounce>0); P.x=c.x; P.z=c.z; }
  P.pcd=Math.max(0,P.pcd-dt); P.rcd=Math.max(0,P.rcd-dt); P.combatT=Math.max(0,P.combatT-dt);
  if(P.combatT<=0&&S.hunger>25) P.hp=Math.min(maxHp(),P.hp+maxHp()*0.015*dt);
  if(P.hurtT>0){ P.hurtT-=dt; if(P.hurtT<=0) $('hurt').style.opacity=0; }
  const jump=P.pounce>0?Math.sin(Math.PI*(1-P.pounce/P.pT))*1.1*sc:0;
  P.y=H(P.x,P.z);
  let up=0;
  if(P.tree!=null){ const t=trees[P.tree], e=P.climbT*P.climbT*(3-2*P.climbT); up=(t.y+t.perch[1]-P.y)*e; P.upNow=up; }
  else if(P.dropY>0){ P.dropY=Math.max(0,P.dropY-P.dropRate*dt); up=P.dropY; }
  P.camY=P.y+up;
  const climbing=P.tree!=null&&P.climbT<1;
  const g=P.g; g.scale.setScalar(sc); g.position.set(P.x,P.y+jump+up,P.z); g.rotation.y=P.rot;
  g.userData.inner.position.y+=(((P.sneak&&P.pounce<=0)?-0.16:0)-g.userData.inner.position.y)*Math.min(1,dt*10);
  g.userData.inner.rotation.x=climbing?-1.1:P.pounce>0?(P.leap?0.35:-0.3):0;
  if(climbing) animLegs(g,P.walkT,0.7); else if(moving||P.pounce>0){ P.walkT+=dt*(5+spd*1.4); animLegs(g,P.walkT,P.pounce>0?1.1:sprint?0.85:P.sneak?0.3:0.55); } else animLegs(g,P.walkT,0.02);
  if(moving&&P.pounce<=0){ P.stepT=(P.stepT||0)-dt*(sprint?1.7:P.sneak?0.55:1); if(P.stepT<=0){ P.stepT=0.3; if(P.wet) snd.splash(); else snd.step(P.sneak?0.04:sprint?0.2:0.12); } }
  G.birdT-=dt; if(G.birdT<=0){ G.birdT=rnd(4,11); snd.bird(); }
  // Tarnung
  const grass=inGrass(P.x,P.z); P.wet=P.tree==null&&inWater(P.x,P.z);
  let st=1; if(P.sneak) st*=0.5; if(sprint) st*=1.3; if(grass) st*=P.sneak?0.3:(0.32+0.38*Math.min(1,(S.lvl-1)/7)); st*=(1-0.05*at('cam'))*(has('dunkel')?0.8:1)*(S.fur&&S.fur.albino?1.15:S.fur&&S.fur.melan?0.9:1); st*=0.8+0.025*S.lvl; st*=0.7+0.3*dayF; st*=1-0.25*W.rain; if(P.safe) st=0;
  P.hidden=st; P.grass=grass;
  { const lv=(P.safe||(grass&&(P.sneak||S.lvl<4)))?2:(grass||P.sneak)?1:0; if(lv!==P.hideLv) setHide(lv);
    if(lv===2&&S.goals&&S.goals.list.some(g=>g.id==='hide'&&!g.done)&&animals.some(a=>!a.dead&&a.sp.hunt&&S.lvl<a.sp.hunt&&Math.hypot(a.x-P.x,a.z-P.z)<25)) goalEvent('hide',dt); }
  updateWeather(dt);
  for(let i=0;i<animals.length;i++) updateAnimal(animals[i],dt,st);
  for(let i=puffs.length-1;i>=0;i--){ const p=puffs[i]; p.t-=dt; p.vy-=12*dt; p.m.position.x+=p.vx*dt; p.m.position.y+=p.vy*dt; p.m.position.z+=p.vz*dt; p.m.material.opacity=Math.max(0,p.t/0.7); if(p.t<=0){ scene.remove(p.m); p.m.material.dispose(); puffs.splice(i,1); } }
  if(G.toastT>0){ G.toastT-=dt; G.toastShown+=dt; if(G.toastT<=0){ if(toastQ.length){ const q=toastQ.shift(); showToast(q[0],q[1]); } else $('toast').style.opacity=0; } }
  if(G.lastHitT>0) G.lastHitT-=dt;
  updateWarn(dt); updateCross(); updateTracks(dt); updateFamily(dt); updateCub(dt); updateFamArrow(dt); updateLife(dt); updateDayNight(dt);
  if(G.noStT>0){ G.noStT-=dt; if(G.noStT<=0) $('crossMsg').style.opacity=0; }
  G.uiT-=dt; if(G.uiT<=0){ G.uiT=0.1; updateUI(); }
  drawRadar();
}
const waPool=[]; let beatT=0;
function updateWarn(dt){
  const ring=$('warnRing'), R=Math.min(window.innerWidth,window.innerHeight)*0.33, s=Math.sin(G.camYaw), c=Math.cos(G.camYaw);
  let n=0, top=null, topV=-1, maxSus=0;
  for(const a of animals){
    if(a.dead||!a.sp.fight) continue;
    const chase=a.state==='chase'||a.state==='lunge';
    let v; if(chase) v=2; else if(a.state==='wander'&&a.sus>0) v=a.sus; else if(a.state==='wander'&&a.near) v=0; else if(a.state==='scav'&&a.sp.hunt&&S.lvl<a.sp.hunt&&Math.hypot(a.x-P.x,a.z-P.z)<90) v=0.3; else if(a.state==='lurk'&&a.near) v=0; else continue;
    const dx=a.x-P.x, dz=a.z-P.z, d=Math.hypot(dx,dz); if(chase&&d>80) continue;
    const ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c));
    let el=waPool[n]; if(!el){ el=document.createElement('div'); el.className='wa'; ring.appendChild(el); waPool.push(el); } n++;
    el.style.display='block';
    el.style.borderBottomColor=chase?'#ff4a30':'hsl('+(48-34*v)+',92%,'+(60-6*v)+'%)';
    el.classList.toggle('ch',chase);
    el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale('+(chase?1.25:0.75+0.5*v)+')';
    const pr=v+(1-Math.min(d,100)/1000);
    if(pr>topV){ topV=pr; top=a; top._v=v; top._d=d; }
    if(!chase&&v>maxSus) maxSus=v;
  }
  for(let i=n;i<waPool.length;i++) waPool[i].style.display='none';
  const w=$('warn');
  if(top){
    const v=top._v, nm=top.sp.n, m=Math.round(top._d)+' m';
    w.style.display='block'; $('warnBar').style.display=(v>0&&v<2)?'block':'none';
    if(v>=2){ $('warnTxt').textContent='⚠ '+nm+' jagt dich! ('+m+')'; w.style.color='#ff6a50'; }
    else if(v>0){ $('warnTxt').textContent='⚠ '+nm+' wird misstrauisch – zieh dich zurück! ('+m+')'; w.style.color='#ffb04a'; $('bW').style.width=(v*100)+'%'; }
    else { $('warnTxt').textContent=nm+' in der Nähe – noch unbemerkt ('+m+')'; w.style.color='#f2d04b'; }
  } else w.style.display='none';
  beatT-=dt; if(maxSus>0&&beatT<=0){ beatT=0.95-0.6*maxSus; snd.beat(maxSus); }
}
function updateCamera(){
  G.huntF+=(((P.sneak&&P.tree==null&&!dead&&!G.paused)?1:0)-G.huntF)*0.06;
  const sc=pScale(), dist=(5+sc*6.5)*G.camZoom*(1-0.3*G.huntF), ty=P.camY+sc*1.1+dist*0.16;
  const fov=60-8*G.huntF; if(Math.abs(camera.fov-fov)>0.05){ camera.fov=fov; camera.updateProjectionMatrix(); }
  const cp=Math.cos(G.camPitch);
  let cx=P.x+Math.sin(G.camYaw)*dist*cp, cz=P.z+Math.cos(G.camYaw)*dist*cp, cy=ty+Math.sin(G.camPitch)*dist;
  cy=Math.max(cy,H(cx,cz)+0.6);
  if(G.shakeA>0){ cx+=(Math.random()-0.5)*G.shakeA; cy+=(Math.random()-0.5)*G.shakeA; cz+=(Math.random()-0.5)*G.shakeA; G.shakeA=Math.max(0,G.shakeA*0.86-0.005); }
  camera.position.set(cx,cy,cz); camera.lookAt(P.x,ty,P.z);
}
function updateCross(){
  // Fadenkreuz leuchtet, wenn ein Tier in Sprungrichtung und -reichweite ist
  const fx=-Math.sin(G.camYaw), fz=-Math.cos(G.camYaw), sc=pScale();
  const range=(19+3*S.b.jmp+baseSpeed()*0.5)*(0.38+0.04*S.b.jmp);
  let on=false;
  for(const a of animals){ if(a.dead||a.sp.friend||!a.g.visible) continue; const dx=a.x-P.x, dz=a.z-P.z, along=dx*fx+dz*fz;
    if(along<0||along>range+a.rad) continue; const side=Math.abs(dx*fz-dz*fx);
    if(side<a.rad+0.5+sc*0.8){ on=true; break; } }
  const low=P.st<15, cr=$('cross'), ring=$('stRing'), fr=Math.max(0,Math.min(1,P.st/maxSt()));
  cr.classList.toggle('on',on&&P.pcd<=0&&!low); cr.classList.toggle('no',low);
  $('stArc').style.strokeDashoffset=169.65*(1-fr);
  ring.classList.toggle('low',low);
  ring.style.opacity=low?1:Math.max(0,Math.min(1,(0.5-fr)/0.2))*0.9;
}
function updateUI(){
  $('lvl').textContent='Stufe '+S.lvl+(S.gen>1?' · Gen. '+S.gen:'');
  renderGoals();
  $('size').textContent=(W.rain>0.3?(W.storm?'⛈ ':'☔ '):dayF>0.5?'☀ ':'☾ ')+clockStr()+' · '+(S.lvl<4?'Jungtier':S.lvl<8?'Halbstark':oldF()>0?'Alt':S.lvl<12?'Ausgewachsen':'Alpha')+(S.lvl>=8?' · noch '+Math.max(1,Math.ceil((DIE_AT()-S.age)/60))+' min':'');
  $('bHu').style.width=S.hunger+'%'; $('bHu').classList.toggle('low',S.hunger<25); $('tHu').textContent=S.hunger<=0?'verhungert!':S.hunger<25?'hungrig':Math.round(S.hunger)+' %';
  const mh=maxHp(), ms=maxSt(), xn=xpNeed(S.lvl);
  $('bHp').style.width=Math.max(0,P.hp/mh*100)+'%'; $('tHp').textContent=Math.ceil(P.hp)+' / '+mh;
  $('bSt').style.width=Math.max(0,P.st/ms*100)+'%'; $('tSt').textContent=Math.floor(P.st)+' / '+ms;
  $('bXp').style.width=(S.xp/xn*100)+'%'; $('tXp').textContent=S.xp+' / '+xn;
  const stEl=$('status');
  const nt=(S.b.climb>0&&P.tree==null)?nearestTree():-1;
  const sm=(touchUI()||padUI()||window.innerWidth<=820||window.innerHeight<=520)&&!hudExp;
  const setSt=(long,short,col)=>{ stEl.textContent='● '+(sm?short:long); stEl.style.color=col; };
  const ctx=context();
  if(ctx) setSt('F: '+ctx.label,ctx.label+' möglich','#ff9ad0');
  else if(P.tree!=null){ if(P.safe) setSt('Sicher auf dem Baum – E: runter · Leertaste: Sprung von oben','Sicher auf dem Baum','var(--green)'); else setSt('Klettert …','Klettert …','var(--green)'); }
  else if(nt>=0) setSt('Baum in Reichweite – E zum Klettern','Baum: klettern','var(--green)');
  else if(P.grass&&(P.sneak||S.lvl<4)) setSt(P.sneak?'Versteckt im hohen Gras':'Versteckt im hohen Gras – als Jungtier auch ohne Schleichen','Versteckt','var(--green)');
  else if(P.grass) setSt('Im Gras – schleiche (C), um dich zu verstecken','Im Gras – schleichen!','var(--mut)');
  else if(P.sneak) setSt('Schleicht','Schleicht','var(--gold)');
  else setSt('Sichtbar','Sichtbar','var(--mut)');
  // Familie
  const cb=$('cubBox'), cu=S.cub;
  const kid=kidMode();
  if(cu||S.preg>0||(canMate()&&seekT<15)||kid){
    cb.style.display='block'; $('cubBars').style.display=cu&&cu.grow<1?'block':'none'; let msg='';
    if(cu&&cu.grow<1){
      $('cubT').textContent='Junges · satt '+Math.round(cu.full)+' % · groß '+Math.round(cu.grow*100)+' %'; $('foodT').textContent='Futter '+S.food+'/'+FOOD_MAX;
      $('bCf').style.width=cu.full+'%'; $('bCg').style.width=(cu.grow*100)+'%';
      msg=G.raider?(G.raider.found?'⚠ Dein Junges wird angegriffen!':'⚠ Räuber sucht dein Junges!'):cu.hp<1?'Leben des Jungen: '+Math.max(0,Math.round(cu.hp*100))+' %':cu.full<25?'Dein Junges hat Hunger':'';
    } else if(cu){ $('cubT').textContent='Nachwuchs ausgewachsen'; $('foodT').textContent='dein Erbe'; }
    else if(S.preg>0){ $('cubT').textContent='Junges kommt bald im Bau zur Welt'; $('foodT').textContent=''; }
    else if(canMate()){ $('cubT').textContent=S.partner?'Dein Partner wartet':'Partner suchen'; $('foodT').textContent='rosa Punkt auf der Spürkarte'; }
    else { $('cubT').textContent='Eltern: '+((S.p1?1:0)+(S.p2?1:0)); $('foodT').textContent='bringen Futter'; }
    $('cubMsg').textContent=msg;
  } else cb.style.display='none';
  if(touchUI()){ const fb=$('tbF'); fb.style.display=ctx?'block':'none'; if(ctx) fb.textContent=ctx.label; }
  const ch=$('ctxHint'); ch.style.display=ctx?'block':'none'; if(ctx) ch.innerHTML=padUI()?xb('Ⓧ')+' – '+esc(ctx.label):touchUI()?'Rosa Knopf: '+esc(ctx.label):'F – '+esc(ctx.label);
  $('tapHelp').style.display=(touchUI()&&G.started&&!G.paused&&tapLearned<2)?'block':'none';
  const pe=$('pts'); if(S.pts>0){ pe.style.display='block'; pe.textContent=S.pts+' Punkt'+(S.pts===1?'':'e')+(sm?' ▸':' zu vergeben – Tab'); } else pe.style.display='none';
  $('cdP').style.width=(1-P.pcd/1.3)*100+'%';
  $('cdRbox').style.opacity=S.b.roar?1:0.35; $('cdR').style.width=S.b.roar?(1-P.rcd/(22-3*S.b.roar))*100+'%':'0%';
  $('cdEbox').style.opacity=S.b.climb?1:0.35; $('cdE').style.width=(P.tree!=null?P.climbT*100:nt>=0?100:0)+'%';
  if(touchUI()){ $('tbE').style.opacity=S.b.climb?1:0.35; $('tbE').classList.toggle('on',P.tree!=null); $('tbC').classList.toggle('on',P.sneak); $('tbR').style.opacity=S.b.roar?1:0.35; }
  // Ziel
  let best=null, bd=28;
  if(G.lastHitT>0&&G.lastHit&&!G.lastHit.dead) best=G.lastHit;
  else for(const a of animals){ if(a.dead||!a.g.visible) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; best=a; } }
  const te=$('target');
  if(best){ te.style.display='block'; $('tName').textContent=(best.fur&&best.fur.albino?'Albino-':'')+best.sp.n; $('bT').style.width=Math.max(0,best.hp/best.sp.hp*100)+'%';
    const tg=$('tTag'); const hostile=best.sp.hunt&&S.lvl<best.sp.hunt;
    if(best.sp.friend){ const fi=fam.indexOf(best); tg.textContent=fi===0?'· dein Partner':fi<3?'· dein Elterntier':'· Artgenosse'; tg.style.color='#ff9ad0'; }
    else if(hostile){ tg.textContent='· Gefahr – jagt dich!'; tg.style.color='var(--red)'; }
    else if(best.sp.fight){ tg.textContent='· wehrt sich'; tg.style.color='var(--gold)'; }
    else { tg.textContent='· Beute'; tg.style.color='var(--green)'; }
  } else te.style.display='none';
}
/* Spürkarte: Gras, Wasser und Bau sind einmal in ein großes Hintergrundbild gezeichnet; pro Bild wird nur noch dieses
   verschoben und gedreht und die Tiere in vier Farbgruppen darübergelegt. Wird jedes Bild neu gezeichnet statt 10-mal pro Sekunde. */
const radarBg=document.createElement('canvas'), RB=2, RW=256;   // 2 Pixel pro Meter, Welt von -256 bis 256
radarBg.width=radarBg.height=RW*2*RB;
(function(){ const c=radarBg.getContext('2d'); c.scale(RB,RB); c.translate(RW,RW);
  c.fillStyle='rgba(120,190,90,.35)'; c.beginPath(); for(const p of patches){ c.moveTo(p.x+p.r,p.z); c.arc(p.x,p.z,p.r,0,6.283); } c.fill();
  c.fillStyle='rgba(90,160,200,.55)'; c.beginPath(); for(const p of PONDS){ c.moveTo(p.x+p.r,p.z); c.arc(p.x,p.z,p.r,0,6.283); } c.fill();
  c.fillStyle='#ddd'; c.fillRect(-5,-5,10,10);
})();
let radarPx=0; const RADAR_COL=['#ff7ab8','#ff5a3c','#f2b84b','#9be07f'];
function drawRadar(){
  const cv=$('rc'), css=cv.clientWidth||140, want=Math.round(css*Math.min(window.devicePixelRatio||1,2));
  if(want>0&&want!==radarPx){ radarPx=want; cv.width=cv.height=want; }
  const W=cv.width||280, R=45+22*S.b.nose+(has('nase')?25:0), k=W/2/R, sc=W/280;
  rc.setTransform(1,0,0,1,0,0); rc.clearRect(0,0,W,W); rc.fillStyle='rgba(30,50,25,.55)'; rc.fillRect(0,0,W,W);
  rc.save(); rc.translate(W/2,W/2); rc.rotate(G.camYaw);
  rc.save(); rc.scale(k/RB,k/RB); rc.drawImage(radarBg,-(P.x+RW)*RB,-(P.z+RW)*RB); rc.restore();
  if(S.cub){ const dx=cub.x-P.x, dz=cub.z-P.z; if(dx*dx+dz*dz<R*R){ rc.fillStyle='#ff7ab8'; rc.fillRect(dx*k-6*sc,dz*k-6*sc,12*sc,12*sc); } }
  for(let g=0;g<4;g++){
    rc.fillStyle=RADAR_COL[g]; rc.beginPath(); let any=false;
    for(let i=0;i<animals.length;i++){ const a=animals[i]; if(a.dead||(a.sp.friend&&!a.g.visible)) continue; if(a.state==='lurk'&&Math.abs(a.x-P.x)+Math.abs(a.z-P.z)>18) continue;
      const hostile=a.sp.hunt&&S.lvl<a.sp.hunt, grp=a.sp.friend?0:hostile?1:a.sp.fight?2:3; if(grp!==g) continue;
      const dx=a.x-P.x, dz=a.z-P.z; if(dx*dx+dz*dz>R*R) continue;
      const r=Math.max(4,a.sp.size*6)*sc; rc.moveTo(dx*k+r,dz*k); rc.arc(dx*k,dz*k,r,0,6.283); any=true; }
    if(any) rc.fill();
  }
  rc.fillStyle='#b07040'; for(const a of animals){ if(!a.carc) continue; const dx=a.x-P.x, dz=a.z-P.z; if(dx*dx+dz*dz<R*R) rc.fillRect(dx*k-4*sc,dz*k-4*sc,8*sc,8*sc); }
  rc.restore();
  // Wahrnehmungskreis: ab hier bemerken dich Raubtiere (rot) bzw. Beute (grün); schrumpft beim Schleichen und im Gras
  let sense=0; for(const sp of SPECIES){ if(sp.hunt&&S.lvl<sp.hunt&&sp.sense>sense) sense=sp.sense; }
  const danger=sense>0; if(!danger) sense=24;
  const base=sense*P.hidden*D().sense;
  rc.save(); rc.translate(W/2,W/2); rc.rotate(G.camYaw);
  if(base*k>3){ rc.strokeStyle=danger?'rgba(255,110,80,.9)':'rgba(155,224,127,.9)'; rc.lineWidth=3*sc; rc.setLineDash([9*sc,7*sc]); rc.beginPath();
    for(let i=0;i<=48;i++){ const t=i/48*6.283, ux=Math.cos(t), uz=Math.sin(t), r=Math.min(base*windMulDir(ux,uz),R)*k; if(i) rc.lineTo(ux*r,uz*r); else rc.moveTo(ux*r,uz*r); }
    rc.stroke(); rc.setLineDash([]); }
  // Windpfeil am Rand: zeigt, wohin der Wind weht
  { const wx=windU.value.x, wz=windU.value.y, rr=W*0.4, bx=-wx*rr, bz=-wz*rr, px=-wz, pz=wx, L=14*sc;
    rc.fillStyle='rgba(150,205,255,.95)'; rc.beginPath(); rc.moveTo(bx+wx*L,bz+wz*L); rc.lineTo(bx+px*L*0.55,bz+pz*L*0.55); rc.lineTo(bx-px*L*0.55,bz-pz*L*0.55); rc.fill(); }
  rc.restore();
  rc.fillStyle='#fff'; rc.beginPath(); rc.moveTo(W/2,W/2-11*sc); rc.lineTo(W/2+7*sc,W/2+8*sc); rc.lineTo(W/2-7*sc,W/2+8*sc); rc.fill();
}
applyQuality();
setInputMode(inputMode); setResLabel(); if(!S.goals) newGoals();
updateUI();
drawRadar();
requestAnimationFrame(frame);

// Von anderen Modulen zur Laufzeit benutzt
export { archiveLine, becomeCub, bookOpen, canMate, canSleepNow, clockStr, closeBook, closeSettings, dayF, eatFood, fam, famPlace, goalEvent, makeCarcass, moveAnimal, nearCarcass, padSynth, padUI, recordAncestor, rumble, settingsOpen, sleepOnTree, sleeping, startFlee, takeMeat, updateDayNight, updateUI, updateWarn };
