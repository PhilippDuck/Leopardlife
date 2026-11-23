// LeoLife – Pausenmenü, Einstellungen, Steuerungsliste, Neustart.
import { animals, placeAnimal } from './animals.js';
import { initAudio, snd } from './audio.js';
import { canvas } from './engine.js';
import { keys, touchUI } from './input.js';
import { P, players, rebuildPlayer } from './player.js';
import { D, REG, REG_ID, S, maxHp, maxSt, resetState, save } from './save.js';
import { toggleSkills } from './skills.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { $ } from './util.js';
import { regionsOpen, reloadWorld } from './regions.js';
import { respawn, setPounceLabel } from './actions.js';
import { rebuildCub } from './family.js';
import { clockStr, sleeping } from './daynight.js';
import { bookOpen } from './carcass.js';
import { lexOpen } from './lexicon.js';
import { padUI } from './gamepad.js';
import { updateUI } from './hud.js';
import { newGoals } from './goals.js';
import { ensureKin } from './kinship.js';
import { startTutorial } from './tutorial.js';
import { ctrlArt } from './ctrlart.js';
import { leaveTitle } from './title.js';
import { resetMates } from './coop.js';
import { canSwitch, canSwitchFor, growOf, hasOwnCub } from './cubfollow.js';

/* Pausenmenü (Esc oder Menü-Knopf) */
G.menuT=0; let hadLock=false, restartArm=false;
function menuOpen(){ return $('menu').style.display==='flex'; }
function toggleMenu(){
  if(ctrlOpen()||guideOpen()||bookOpen()||lexOpen()||settingsOpen()||regionsOpen()||sleeping||!G.started||P.dead||$('win').style.display==='flex'||$('birth').style.display==='flex'||$('skills').style.display!=='none') return;
  const el=$('menu');
  if(!menuOpen()){
    $('menuInfo').textContent='Gebiet: '+REG.n+' · Schwierigkeit: '+D().n+' · Uhrzeit '+clockStr()+(D().perma?' · ohne Nachwuchs endgültig':'');
    G.cubArm=false; { const b=/** @type {HTMLButtonElement} */($('btnMenuCub')), ok=canSwitchFor(P); b.style.display=hasOwnCub(P)?'block':'none'; b.disabled=!ok; b.textContent=ok?'Als Junges weiterspielen':'Als Junges weiterspielen (ab 50 % groß – jetzt '+Math.round(growOf(P)*100)+' %)'; }
    el.style.display='flex'; G.paused=true; G.menuT=performance.now(); restartArm=false; $('btnRestart').textContent='Neustart (Fortschritt löschen)';
    for(const k in keys) keys[k]=false; G.drag=false; G.joyX=G.joyY=0; if(document.exitPointerLock) document.exitPointerLock();
  } else {
    el.style.display='none'; G.paused=false;
    if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
  }
}
let hudExp=false;
$('hud').addEventListener('click',e=>{ if(e.target.closest('#pts')) return; hudExp=!hudExp; $('hud').classList.toggle('exp',hudExp); $('hudTog').textContent=hudExp?'▴':'▾'; updateUI(); });
const XB={'Ⓐ':'#5fbf4a','Ⓑ':'#e0533d','Ⓧ':'#3f8fe0','Ⓨ':'#f2c230'};
const xb=t=>t.replace(/[ⒶⒷⓍⓎ]/g,c=>'<b style="color:'+XB[c]+';font-size:1.15em">'+c+'</b>');
/** Steuerung als Bild (ctrlart.js) mit Reitern Tastatur / Controller / Touch; zeigt zuerst, was zuletzt benutzt wurde */
let keysTab=null;
/** großes Fenster mit dem Steuerungsbild (vom Startbildschirm und aus den Einstellungen) */
function openCtrl(){ keysTab=null; renderKeys(); $('ctrlView').style.display='flex'; }
function closeCtrl(){ $('ctrlView').style.display='none'; }
const ctrlOpen=()=>$('ctrlView').style.display==='flex';
$('btnCtrlSet').onclick=openCtrl; $('btnCtrlMenu').onclick=openCtrl; $('btnCtrlBack').onclick=closeCtrl;
/** Spielanleitung (aus dem Pause-Menü) */
function openGuide(){ $('guide').style.display='flex'; }
function closeGuide(){ $('guide').style.display='none'; }
const guideOpen=()=>$('guide').style.display==='flex';
$('btnGuide').onclick=openGuide; $('btnGuideBack').onclick=closeGuide;
function renderKeys(){
  const cur=padUI()?'p':touchUI()?'t':'k', m=keysTab||cur;
  $('keysMode').textContent=padUI()?'Xbox-Controller':touchUI()?'Touch':'Tastatur und Maus';
  { const el=$('keysBox');
    el.innerHTML='<div class="ktabs">'+[['k','Tastatur & Maus'],['p','Controller'],['t','Touch']].map(([k,l])=>'<button class="sec'+(k===m?' on':'')+'" data-m="'+k+'">'+l+'</button>').join('')+'</div>'+ctrlArt(m);
    el.querySelectorAll('.ktabs button').forEach(b=>b.onclick=e=>{ e.stopPropagation(); keysTab=/** @type {HTMLElement} */(b).dataset.m; renderKeys(); }); }
}
// (Die Liste wird beim Start über setInputMode() gefüllt, sobald die Eingabeart feststeht.)
$('keysMode').textContent='';
$('menuBtn').onclick=toggleMenu; $('btnResume').onclick=toggleMenu;
$('btnMenuSkills').onclick=()=>{ const p=players.find(o=>o!==P&&o.pad===G.ovPad)||P; toggleMenu(); toggleSkills(p); };
$('btnRestart').onclick=()=>{
  if(!restartArm){ restartArm=true; $('btnRestart').textContent='Wirklich? Stufe und Fähigkeiten gehen verloren'; return; }
  resetState(); save(); if(REG_ID!=='savanne'){ reloadWorld(true); return; }
  rebuildPlayer(); rebuildCub(); $('menu').style.display='none'; respawn(); resetMates(); animals.forEach(placeAnimal); G.raider=null; G.lastHit=null; G.lastHitT=0; updateUI();
  // zurück zum Startbildschirm, um die Schwierigkeit zu wählen
  G.started=false; G.paused=true; if(document.exitPointerLock) document.exitPointerLock();
  $('btnPlay').textContent='Spielen'; $('btnReset').style.display='none'; showDiff(); $('start').style.display='flex';
};
// Esc beendet im Browser zuerst die Mausfixierung; dann öffnet sich das Menü darüber
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas){ hadLock=true; return; }
  if(hadLock&&G.started&&!G.paused&&!menuOpen()&&!P.skOpen){ hadLock=false; toggleMenu(); }   // eigene Entwicklung offen: Maus gewollt frei, kein Pausemenü
  hadLock=false;
}); $('pts').onclick=()=>toggleSkills();
$('btnPlay').onclick=()=>{ initAudio(); leaveTitle(); $('start').style.display='none'; $('diffRow').style.display='none'; save(); G.paused=false; G.started=true; startTutorial(); if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } };
let resetArm=false;
function showDiff(){ $('diffRow').style.display='block'; document.querySelectorAll('.diffb').forEach((/** @type {HTMLElement} */ b)=>b.classList.toggle('on',b.dataset.d===S.diff)); $('diffTxt').textContent=D().d; }
document.querySelectorAll('.diffb').forEach((/** @type {HTMLElement} */ b)=>b.addEventListener('click',()=>{ S.diff=b.dataset.d; showDiff(); }));
if($('btnReset').style.display==='none') showDiff();
$('btnReset').onclick=()=>{ if(!resetArm){ resetArm=true; $('btnReset').textContent='Wirklich? Fortschritt löschen'; return; } resetState(); save(); if(REG_ID!=='savanne'){ reloadWorld(true); return; } rebuildPlayer(); rebuildCub(); P.hp=maxHp(); P.st=maxSt(); resetMates(); $('btnReset').style.display='none'; $('btnPlay').textContent='Spielen'; showDiff(); };

/* Einstellungsfenster */
function openSettings(){ setPounceLabel(); renderKeys(); $('menu').style.display='none'; $('settings').style.display='flex'; }
function closeSettings(){ $('settings').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const settingsOpen=()=>$('settings').style.display==='flex';
$('btnSettings').onclick=openSettings; $('btnSetBack').onclick=closeSettings;

export { closeCtrl, closeGuide, ctrlOpen, guideOpen };
export { hudExp, menuOpen, renderKeys, showDiff, toggleMenu, xb, closeSettings, settingsOpen };
