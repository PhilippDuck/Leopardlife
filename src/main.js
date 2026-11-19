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
import { canMate, fam, famHurt, famRole, famStep, kidMode, updateFamily } from './kin.js';
import { updateLife } from './life.js';
import { clockStr, dayF, updateDayNight } from './daynight.js';
import { esc, herdLead, startFlee } from './carcass.js';
import { W, updateWeather } from './weather.js';
import { goalEvent, newGoals, renderGoals } from './goals.js';
import { addTrack, updateTracks } from './tracks.js';
import { moveAnimal, updateAnimal } from './ai.js';
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
export { crocStep, padSynth, padUI, rumble, updateUI, updateWarn };
