// LeopardLife – Einstieg: Hauptschleife (Bild für Bild: Spieler, Tiere, Kamera, Anzeige) und Spielstart.
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
import { canMate, fam, famHurt, famRole, famStep, kidMode, updateFamily } from './kin.js';
import { updateLife } from './life.js';
import { clockStr, dayF, updateDayNight } from './daynight.js';
import { esc, herdLead, startFlee } from './carcass.js';
import { W, updateWeather } from './weather.js';
import { goalEvent, newGoals, renderGoals } from './goals.js';
import { addTrack, updateTracks } from './tracks.js';
import { moveAnimal, updateAnimal } from './ai.js';
import { setHide } from './hide.js';
import { perfTick, setResLabel } from './perf.js';
import { padSprint, padUI, padX, padY, pollPads } from './gamepad.js';
import { drawRadar, updateCamera, updateCross, updateUI, updateWarn } from './hud.js';
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



/* ---------- Hauptschleife ---------- */
G.last=performance.now(); G.uiT=0;


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
  if(keys.ArrowLeft) P.cam.yaw+=dt*2; if(keys.ArrowRight) P.cam.yaw-=dt*2;
  if(keys.ArrowUp) P.cam.pitch=Math.max(0.08,P.cam.pitch-dt); if(keys.ArrowDown) P.cam.pitch=Math.min(1.25,P.cam.pitch+dt);
  // Bewegung
  let fw=(keys.KeyW?1:0)-(keys.KeyS?1:0)-G.joyY-padY, rt=(keys.KeyD?1:0)-(keys.KeyA?1:0)+G.joyX+padX;
  const il=Math.hypot(fw,rt); if(il>1){ fw/=il; rt/=il; }
  const s=Math.sin(P.cam.yaw), c=Math.cos(P.cam.yaw);
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

applyQuality();
setInputMode(inputMode); setResLabel(); if(!S.goals) newGoals();
updateUI();
drawRadar();
requestAnimationFrame(frame);

