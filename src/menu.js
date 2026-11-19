// LeopardLife – Pausenmenü, Einstellungen, Steuerungsliste, Neustart.
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
import { respawn } from './actions.js';
import { rebuildCub } from './family.js';
import { clockStr, sleeping } from './daynight.js';
import { bookOpen } from './carcass.js';
import { padUI } from './gamepad.js';
import { updateUI } from './hud.js';
import { newGoals } from './goals.js';
import { ensureKin } from './kinship.js';

/* Pausenmenü (Esc oder Menü-Knopf) */
G.menuT=0; let hadLock=false, restartArm=false;
function menuOpen(){ return $('menu').style.display==='flex'; }
function toggleMenu(){
  if(bookOpen()||settingsOpen()||regionsOpen()||sleeping||!G.started||P.dead||$('win').style.display==='flex'||$('birth').style.display==='flex'||$('skills').style.display!=='none') return;
  const el=$('menu');
  if(!menuOpen()){
    $('menuInfo').textContent='Gebiet: '+REG.n+' · Schwierigkeit: '+D().n+' · Uhrzeit '+clockStr()+(D().perma?' · ohne Nachwuchs endgültig':'');
    G.cubArm=false; $('btnMenuCub').style.display=S.cub?'block':'none'; $('btnMenuCub').textContent='Als Junges weiterspielen';
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
function renderKeys(){ $('keysMode').textContent=padUI()?'Xbox-Controller':touchUI()?'Touch':'Tastatur und Maus';
  $('keysBox').innerHTML=(padUI()?[
  ['Linker Stick','Laufen'],['Rechter Stick','Kamera und Fadenkreuz drehen'],['LT oder linken Stick drücken','Sprinten (kostet Ausdauer)'],
  ['RT oder Ⓐ','Sprungangriff in Richtung Fadenkreuz'],['Ⓑ','Schleichen an/aus'],['Ⓧ','Aktion: paaren, füttern, fressen, schlafen'],['Ⓨ','Auf einen Baum klettern / herunter'],
  ['LB','Brüllen'],['Rechten Stick drücken','Kamera hinter den Leoparden'],['Steuerkreuz ↑ ↓','Zoomen'],['Steuerkreuz ←','Mitspieler kurz markieren'],['Ⓧ halten','Mitspieler am Boden wiederbeleben'],['Menü-Taste ☰','Pause-Menü'],['Ansicht-Taste ⧉','Eigenschaften & Fähigkeiten'],
  ['In Menüs','Steuerkreuz wählt, Ⓐ bestätigt, Ⓑ zurück']
]:touchUI()?[
  ['Linke Bildschirmhälfte','Laufen – der Joystick entsteht, wo der Daumen aufsetzt'],
  ['Rechte Hälfte ziehen','Kamera und Fadenkreuz drehen'],
  ['Rechts doppeltippen','Sprungangriff in Richtung Fadenkreuz'],
  ['Sprint','Sprinten an/aus (kostet Ausdauer)'],['Schleichen','Schleichen an/aus'],
  ['Brüllen','Raubtiere verjagen (Fähigkeit)'],['Klettern','Auf einen Baum / herunter (Fähigkeit)'],
  ['Rosa Knopf','Paaren, füttern, fressen oder schlafen – erscheint nur, wenn es gerade möglich ist'],
  ['Goldene Punkte-Anzeige','Eigenschaften & Fähigkeiten'],['☰ Menü','Pause-Menü']
]:[
  ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>','Laufen'],['<kbd>Maus</kbd> / <kbd>←</kbd><kbd>→</kbd>','Kamera und Fadenkreuz drehen'],['<kbd>Mausrad</kbd>','Zoomen'],
  ['<kbd>Shift</kbd>','Sprinten (kostet Ausdauer)'],['<kbd>C</kbd>','Schleichen an/aus'],['<kbd>Leertaste</kbd> / <kbd>Klick</kbd>','Sprungangriff in Richtung Fadenkreuz'],
  ['<kbd>R</kbd>','Brüllen (Fähigkeit)'],['<kbd>E</kbd>','Auf einen Baum klettern / herunter (Fähigkeit)'],['<kbd>F</kbd>','Paaren / Junges füttern / fressen / Fleisch mitnehmen / schlafen'],['<kbd>Q</kbd>','Mitspieler kurz markieren (gemeinsames Spiel)'],
  ['<kbd>Tab</kbd> / <kbd>K</kbd>','Eigenschaften & Fähigkeiten'],['<kbd>Esc</kbd>','Pause-Menü']
]).map(r=>'<span>'+xb(r[0])+'</span><span>'+r[1]+'</span>').join(''); }
// (Die Liste wird beim Start über setInputMode() gefüllt, sobald die Eingabeart feststeht.)
$('keysMode').textContent='';
$('menuBtn').onclick=toggleMenu; $('btnResume').onclick=toggleMenu;
$('btnMenuSkills').onclick=()=>{ const p=players.find(o=>o!==P&&o.pad===G.ovPad)||P; toggleMenu(); toggleSkills(p); };
$('btnRestart').onclick=()=>{
  if(!restartArm){ restartArm=true; $('btnRestart').textContent='Wirklich? Stufe und Fähigkeiten gehen verloren'; return; }
  resetState(); save(); if(REG_ID!=='savanne'){ reloadWorld(true); return; }
  rebuildPlayer(); rebuildCub(); $('menu').style.display='none'; respawn(); animals.forEach(placeAnimal); G.raider=null; G.lastHit=null; G.lastHitT=0; updateUI();
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
$('btnPlay').onclick=()=>{ try{ if(!localStorage.getItem('jaguar-windtip')){ localStorage.setItem('jaguar-windtip','1'); setTimeout(()=>toast('Achte auf den Wind (blauer Pfeil an der Spürkarte): Weht er von dir zu einem Tier, wittert es dich früher.','#96cdff'),8000); } }catch(e){} initAudio(); $('start').style.display='none'; $('diffRow').style.display='none'; save(); G.paused=false; G.started=true; if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } };
let resetArm=false;
function showDiff(){ $('diffRow').style.display='block'; document.querySelectorAll('.diffb').forEach((/** @type {HTMLElement} */ b)=>b.classList.toggle('on',b.dataset.d===S.diff)); $('diffTxt').textContent=D().d; }
document.querySelectorAll('.diffb').forEach((/** @type {HTMLElement} */ b)=>b.addEventListener('click',()=>{ S.diff=b.dataset.d; showDiff(); }));
if($('btnReset').style.display==='none') showDiff();
$('btnReset').onclick=()=>{ if(!resetArm){ resetArm=true; $('btnReset').textContent='Wirklich? Fortschritt löschen'; return; } resetState(); save(); if(REG_ID!=='savanne'){ reloadWorld(true); return; } rebuildPlayer(); rebuildCub(); P.hp=maxHp(); P.st=maxSt(); $('btnReset').style.display='none'; $('btnPlay').textContent='Spielen'; showDiff(); };

/* Einstellungsfenster */
function openSettings(){ renderKeys(); $('menu').style.display='none'; $('settings').style.display='flex'; }
function closeSettings(){ $('settings').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const settingsOpen=()=>$('settings').style.display==='flex';
$('btnSettings').onclick=openSettings; $('btnSetBack').onclick=closeSettings;

export { hudExp, menuOpen, renderKeys, showDiff, toggleMenu, xb, closeSettings, settingsOpen };
