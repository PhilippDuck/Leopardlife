// LeopardLife – Controller-Steuerung (Xbox-Belegung) und Menübedienung per Controller.
import { doClimb, doPounce, doRoar } from './actions.js';
import { doContext } from './family.js';
import { inputMode, setInputMode } from './input.js';
import { toggleMenu } from './menu.js';
import { P } from './player.js';
import { toggleSkills } from './skills.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { $ } from './util.js';

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

export { padSprint, padUI, padX, padY, pollPads };
