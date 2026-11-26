// LeoLife – Einstieg: Hauptschleife (Bild für Bild: Spieler, Tiere, Kamera, Anzeige) und Spielstart.
// Wird Schritt für Schritt in Module nach Zuständigkeit aufgeteilt.
import { ATTR, ABIL, TRAITS, DIFF, REGIONS, QUAL, SPECIES, FOOD, DAT, ART, ICONS, ICOL, ico } from './data.js';
import { $, rnd } from './util.js';
import { G } from './state.js';
import { AC, ambTick, hasSample, initAudio, master, musicTick, nbuf, setListeners, snd, tone } from './audio.js';
import { D, DIE_AT, NET_GUEST, OLD_AT, REG, REG_ID, S, ancF, at, attrCap, baseSpeed, beaten, dmg, fresh, has, maxHp, maxSt, oldF, pScale, resetState, save, xpNeed } from './save.js';
import { HORIZON, SMART, SUN_OFF, camera, canvas, grassLight, hemi, renderer, resize, scene, sun, windMulDir, windU } from './engine.js';
import { cloudMat, clouds, sky, starMat, stars } from './sky.js';
import { GLSL_H, GLSL_PONDMASK, H, PONDS, WATER_D, WORLD, addCol, collide, cullTiles, inWater, pondAt, registerTile, tileOf, waters } from './terrain.js';
import { _tm, _tv, inGrass, leafGeoHi, leafGeoLo, leafMeshes, leafTime, patches, tallGeo, tallMat, trees, updateTrees } from './vegetation.js';
import { PX_BASE, VIEW_D, applyQuality, blobs, quality } from './quality.js';
import { animLegs, buildQuad, furColor, furName, makeFur } from './models.js';
import { P, START_ROT, START_YAW, dropModel, players, rebuildPlayer } from './player.js';
import { animals, placeAnimal } from './animals.js';
import { puff, puffs, updateFx } from './effects.js';
import { inputMode, keys, setInputMode, tapLearned, touchUI } from './input.js';
import { floatText, showToast, toast, toastQ } from './ui.js';
import { toggleSkills } from './skills.js';
import { hudExp, menuOpen, renderKeys, showDiff, toggleMenu, xb } from './menu.js';
import { reloadWorld } from './regions.js';
import { doClimb, doPounce, doRoar, gainXp, hitAnimal, hurtPlayer, nearestTree } from './actions.js';
import { CUB_HOME, FOOD_MAX, context, cub, doContext, endRaid, raidStep, seekT, seeking, updateCub, updateFamArrow } from './family.js';
import { canMate, fam, famHurt, famRole, famStep, kidMode, updateFamily } from './kin.js';
import { updateLife } from './life.js';
import { clockStr, dayF, updateDayNight } from './daynight.js';
import { esc, herdLead, startFlee, updateDrag, updateEating } from './carcass.js';
import { W, updateWeather } from './weather.js';
import { goalEvent, newGoals, renderGoals } from './goals.js';
import { addTrack, updateTracks } from './tracks.js';
import { moveAnimal, updateAnimal } from './ai.js';
import { setHide } from './hide.js';
import { perfTick, setResLabel } from './perf.js';
import { padSprint, padUI, padX, padY, pollPads } from './gamepad.js';
import { drawRadar, updateCamera, updateCross, updateUI, updateWarn } from './hud.js';
import { readControls } from './controls.js';
import { stepPlayer } from './move.js';
import { renderAll, updateCoop, updateCoopHud } from './coop.js';
import { updateCalls } from './calls.js';
import { updateTutorial } from './tutorial.js';
import { updateTitle } from './title.js';
import { updateBite } from './bite.js';
import { updateFollowers } from './cubfollow.js';
import { eventsVisual, guestEvents, updateEvents } from './worldevents.js';
import { updateChunks } from './chunks.js';
import { updateWatchers } from './vision.js';
import { fillWater, updateWorldContent } from './worldcontent.js';
import { fillPlants } from './chunkplants.js';
import { fillKopje } from './kopje.js';
import { fillRiver } from './river.js';
import { onChunkFill } from './chunks.js';
import { APP_VERSION } from './version.js';
import { updateDrinking } from './thirst.js';
import { updateBirds } from './birds.js';
import { updateWildBirds } from './wildbirds.js';
import { updateBaboons } from './baboons.js';
import { updateInsects } from './insects.js';
import { updateLexicon } from './lexicon.js';
import { updateVenom } from './snake.js';
import { updateExplore } from './explore.js';
import { net, remotes, updateNet } from './net.js';
import { mirror, updateNetWorld } from './networld.js';
onChunkFill(fillWater);
onChunkFill(fillPlants);
onChunkFill(fillKopje);
onChunkFill(fillRiver);
document.querySelectorAll('[data-app-version]').forEach(el=>{ el.textContent='Version '+APP_VERSION; });
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }
if(typeof THREE==='undefined'){ $('err').textContent='Three.js konnte nicht geladen werden. Bitte Seite neu laden.'; $('btnPlay').disabled=true; throw new Error('three.js fehlt'); }



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
  // Zeitlupe nach Hinterhalt/Beute verlangsamt die ganze Welt – im gemeinsamen Spiel nicht (die anderen spielen ja weiter)
  if(G.slowT>0){ G.slowT-=dt; if(players.length===1) dt*=0.25; }
  if(!G.paused) step(dt);
  else if(hostLive()) worldStep(dt);   // Online-Gastgeber mit Gästen: Pause, Menü, Schlaf oder Tod halten die Welt der anderen nicht an
  for(const p of players) updateCamera(p,p.camera); updateTrees(dt,players.map(p=>({camera:p.camera,p}))); updateEnv(dt,now); eventsVisual(); updateTitle(dt); musicTick(); ambTick(dayF,W.rain,W.storm,S.tod*24,players.some(p=>animals.some(a=>!a.dead&&(a.state==='chase'||a.state==='lunge')&&a.tgt===p)));
  updateChunks(dt); updateWorldContent(dt); updateNet(now); updateNetWorld(G.paused?0:dt,now);
  renderAll();
}
/** Gastgeber im Online-Spiel mit mindestens einem Gast im Raum */
const hostLive=()=>net.state==='online'&&net.role==='host'&&net.peers.size>0;
/** Nur die Welt weiterrechnen (Tiere, Wetter, Tageszeit, Ereignisse), nicht die eigenen Leoparden – sie sind in der Pause sicher (hurtPlayer) */
function worldStep(dt){
  updateWeather(dt);
  for(let i=0;i<animals.length;i++) updateAnimal(animals[i],dt);
  updateBirds(dt); updateWildBirds(dt); updateBaboons(dt); updateEvents(dt);
  if(G.started) updateDayNight(dt);
  tickPuffs(dt); updateFx(dt);
}
function tickPuffs(dt){
  for(let i=puffs.length-1;i>=0;i--){ const p=puffs[i]; p.t-=dt; p.vy-=12*dt; p.m.position.x+=p.vx*dt; p.m.position.y+=p.vy*dt; p.m.position.z+=p.vz*dt; p.m.material.opacity=Math.max(0,p.t/0.7); if(p.t<=0){ scene.remove(p.m); p.m.material.dispose(); puffs.splice(i,1); } }
}
function step(dt){
  for(const p of players) readControls(p,dt);
  for(const p of players) if(!p.dead) stepPlayer(p,dt);
  for(const p of players){ updateEating(p,dt); updateDrinking(p,dt); updateDrag(p,dt); }
  updateBite(dt);
  updateTutorial(dt);
  updateCoop(dt);
  G.birdT-=dt; if(G.birdT<=0){ G.birdT=rnd(4,11); if(dayF>0.45&&W.rain<0.5&&!hasSample('birdA')) snd.bird(); }   // Synth-Vögel nur, solange die Vogel-Aufnahmen fehlen
  updateWeather(dt);
  // Gast im Online-Spiel: Tiere (außer der eigenen Familie), Paviantrupps und Ereignisse berechnet der Gastgeber (networld.js)
  for(let i=0;i<animals.length;i++){ const a=animals[i]; if(!NET_GUEST||a.sp.friend) updateAnimal(a,dt); }
  updateBirds(dt); updateWildBirds(dt); if(!NET_GUEST) updateBaboons(dt); updateInsects(dt); updateLexicon(dt); updateVenom(dt); updateExplore(dt);
  if(NET_GUEST) guestEvents(dt); else updateEvents(dt);
  updateWatchers();
  setListeners(players.map(p=>({x:p.x,z:p.z,yaw:p.cam.yaw}))); updateCalls(dt);
  tickPuffs(dt); updateFx(dt);
  if(G.toastT>0){ G.toastT-=dt; G.toastShown+=dt; if(G.toastT<=0){ if(toastQ.length){ const q=toastQ.shift(); showToast(q[0],q[1],q[2]); } else $('toast').style.opacity=0; } }
  if(G.lastHitT>0) G.lastHitT-=dt;
  updateWarn(dt); updateCross(); updateTracks(dt); updateFamily(dt); updateCub(dt); updateFollowers(dt); updateFamArrow(dt); updateLife(dt); updateDayNight(dt);
  if(G.noStT>0){ G.noStT-=dt; if(G.noStT<=0) $('crossMsg').style.opacity=0; }
  G.uiT-=dt; if(G.uiT<=0){ G.uiT=0.1; updateUI(); }
  drawRadar(); updateCoopHud(dt);
}

// Für Browsertests (tools/*.py mit ?test): Spielzustand zum Nachsehen
if(typeof location!=='undefined'&&location.search.includes('test')) window['__leopard']={G,players,S,animals,net,remotes,mirror,frame};

applyQuality();
setInputMode(inputMode); setResLabel(); if(!S.goals) newGoals();
updateUI();
drawRadar();
requestAnimationFrame(frame);

