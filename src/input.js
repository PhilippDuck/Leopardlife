// LeoLife – Eingabe über Tastatur, Maus und Touch, Umschalten der Anzeige je nach zuletzt benutzter Eingabe.
import { canvas } from './engine.js';
import { P } from './player.js';
import { S } from './save.js';
import { G } from './state.js';
import { $ } from './util.js';
import { toggleSkills } from './skills.js';
import { closeCtrl, closeGuide, closeSettings, ctrlOpen, guideOpen, menuOpen, renderKeys, settingsOpen, toggleMenu } from './menu.js';
import { closeRegions, regionsOpen } from './regions.js';
import { closeOnline, onlineOpen } from './net.js';
import { doClimb, doPounce, doRoar } from './actions.js';
import { doContext } from './family.js';
import { bookOpen, closeBook } from './carcass.js';
import { closeLex, lexOpen } from './lexicon.js';
import { padSynth } from './gamepad.js';
import { updateUI } from './hud.js';
import { pingMates } from './coop.js';

/* ---------- Eingabe ---------- */
const keys={}; G.paused=true; G.started=false;
G.joyX=0; G.joyY=0; G.tSprint=false;
window.addEventListener('keydown',e=>{
  if(/** @type {HTMLElement} */(e.target)?.tagName==='INPUT'&&e.code!=='Escape') return;   // Tippen in ein Eingabefeld (Online spielen) steuert nicht das Spiel
  if(P.skOpen&&e.code!=='Tab'&&e.code!=='KeyK'){ if(e.code==='Escape') toggleSkills(P); return; }   // eigene Entwicklung offen (gemeinsames Spiel)
  if(e.code==='Tab'){ e.preventDefault(); if(G.started) toggleSkills(); return; }
  if(e.code==='Escape'&&ctrlOpen()){ closeCtrl(); return; }
  if(e.code==='Escape'&&guideOpen()){ closeGuide(); return; }
  if(e.code==='Escape'){ if(!G.started) return; if(bookOpen()){ closeBook(); return; } if(lexOpen()){ closeLex(); return; } if(settingsOpen()){ closeSettings(); return; } if(regionsOpen()){ closeRegions(); return; } if(onlineOpen()){ closeOnline(); return; } if($('skills').style.display!=='none'){ toggleSkills(); return; } if(menuOpen()&&performance.now()-G.menuT<350) return; toggleMenu(); return; }
  if(!G.started) return;
  if(e.code==='KeyK'){ toggleSkills(); return; }
  if(G.paused) return;
  keys[e.code]=true;
  if(e.code==='Space'){ e.preventDefault(); doPounce(); }
  if(e.code==='KeyC'){ P.sneak=!P.sneak; }
  if(e.code==='KeyR'){ doRoar(); }
  if(e.code==='KeyE'){ doClimb(); }
  if(e.code==='KeyF'){ doContext(); }
  if(e.code==='KeyQ'){ pingMates(P); }   // Mitspieler markieren
});
window.addEventListener('keyup',e=>{ keys[e.code]=false; });
window.addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; });
G.drag=false; let dragMoved=0, lx=0, ly=0;
canvas.addEventListener('mousedown',e=>{ if(G.paused||touchUI()) return; G.drag=true; dragMoved=0; lx=e.clientX; ly=e.clientY;
  if(document.pointerLockElement===canvas){ if(e.button===0) doPounce(); }
  else { try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(err){} } });
window.addEventListener('mouseup',e=>{ if(G.drag&&!touchUI()&&dragMoved<6&&e.button===0&&!G.paused&&document.pointerLockElement!==canvas&&e.target===canvas) doPounce(); G.drag=false; });
window.addEventListener('mousemove',e=>{
  if(G.paused) return;
  if(document.pointerLockElement===canvas){ P.cam.yaw-=e.movementX*0.0028; P.cam.pitch=Math.max(0.08,Math.min(1.25,P.cam.pitch+e.movementY*0.0022)); }
  else if(G.drag){ const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY; dragMoved+=Math.abs(dx)+Math.abs(dy); P.cam.yaw-=dx*0.005; P.cam.pitch=Math.max(0.08,Math.min(1.25,P.cam.pitch+dy*0.004)); }
});
window.addEventListener('wheel',e=>{ if(G.paused) return; e.preventDefault(); P.cam.zoom=Math.max(0.45,Math.min(2.6,P.cam.zoom*(e.deltaY>0?1.12:1/1.12))); },{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

/* Touch */
const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
// Ein Gerät mit Maus (PC, Laptop mit Touchscreen) startet mit Tastatur-Anzeige; danach zählt die zuletzt benutzte Eingabe
const finePointer=!!(window.matchMedia&&window.matchMedia('(hover: hover) and (pointer: fine)').matches);
let inputMode=(isTouch&&!finePointer)?'touch':'kb', tapLearned=0;
try{ tapLearned=+localStorage.getItem('jaguar-taps')||0; }catch(e){}
const touchUI=()=>inputMode==='touch';
function setInputMode(m){
  inputMode=m; const t=m==='touch';
  $('touch').style.display=t?'block':'none'; $('cds').style.display=t?'none':'';
  document.querySelectorAll('#cds .kh').forEach((el,i)=>{ el.textContent=(m==='pad'?['RT','LB','Ⓨ']:['Leertaste','R','E'])[i]; });
  renderKeys(); if(typeof updateUI==='function'&&S) updateUI();
}
window.addEventListener('keydown',()=>{ if(!padSynth&&inputMode!=='kb') setInputMode('kb'); },true);
window.addEventListener('pointerdown',e=>{ const m=e.pointerType==='touch'?'touch':e.pointerType==='mouse'?'kb':null; if(m&&m!==inputMode) setInputMode(m); },true);
window.addEventListener('touchstart',()=>{ if(inputMode!=='touch') setInputMode('touch'); },{capture:true,passive:true});
if(isTouch){
  // Linke Bildschirmhälfte = Bewegung: der Joystick entsteht dort, wo der Daumen aufsetzt. Rechte Hälfte = Kamera.
  let joyId=null, camId=null, cx=0, cy=0, jx0=0, jy0=0, jr=50, tapT=0, tapX=0, tapY=0;
  const joy=$('joy'), knob=$('knob');
  canvas.addEventListener('touchstart',e=>{ e.preventDefault(); for(const t of e.changedTouches){
    if(t.clientX<window.innerWidth/2&&joyId===null){
      joyId=t.identifier; jx0=t.clientX; jy0=t.clientY; const w=joy.offsetWidth; jr=w*0.42;
      joy.style.left=(jx0-w/2)+'px'; joy.style.top=(jy0-w/2)+'px'; joy.style.bottom='auto'; joy.classList.add('act');
    } else if(camId===null){
      camId=t.identifier; cx=t.clientX; cy=t.clientY;
      // Doppeltippen rechts = Sprungangriff
      const now=performance.now();
      if(now-tapT<330&&Math.hypot(cx-tapX,cy-tapY)<70){ tapT=0;
        if(!G.paused){ const rp=document.createElement('div'); rp.className='ripple'; rp.style.left=cx+'px'; rp.style.top=cy+'px'; document.body.appendChild(rp); setTimeout(()=>rp.remove(),500);
          doPounce(); tapLearned++; try{ localStorage.setItem('jaguar-taps',String(tapLearned)); }catch(e){} } }
      else { tapT=now; tapX=cx; tapY=cy; }
    }
  } },{passive:false});
  window.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){
    if(t.identifier===joyId){ let dx=(t.clientX-jx0)/jr, dy=(t.clientY-jy0)/jr; const l=Math.hypot(dx,dy); if(l>1){dx/=l;dy/=l;} G.joyX=dx; G.joyY=dy; knob.style.transform='translate('+dx*jr*0.8+'px,'+dy*jr*0.8+'px)'; }
    else if(t.identifier===camId){ P.cam.yaw-=(t.clientX-cx)*0.006; P.cam.pitch=Math.max(0.08,Math.min(1.25,P.cam.pitch+(t.clientY-cy)*0.005)); cx=t.clientX; cy=t.clientY; }
  } },{passive:false});
  const end=e=>{ for(const t of e.changedTouches){
    if(t.identifier===joyId){ joyId=null; G.joyX=G.joyY=0; knob.style.transform=''; joy.style.left=''; joy.style.top=''; joy.style.bottom=''; joy.classList.remove('act'); }
    if(t.identifier===camId) camId=null; } };
  window.addEventListener('touchend',end); window.addEventListener('touchcancel',end);
  const tap=(id,fn)=>$(id).addEventListener('touchstart',e=>{ e.preventDefault(); e.stopPropagation(); if(!G.paused) fn(); },{passive:false});
  tap('tbE',()=>doClimb()); tap('tbF',()=>doContext()); tap('tbR',()=>doRoar());
  tap('tbS',()=>{ G.tSprint=!G.tSprint; $('tbS').classList.toggle('on',G.tSprint); });
  tap('tbC',()=>{ P.sneak=!P.sneak; });
}

export { inputMode, keys, setInputMode, tapLearned, touchUI };
