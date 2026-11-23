// LeopardLife – Controller-Steuerung (Xbox-Belegung) und Menübedienung per Controller.
import { doClimb, doPounce, doRoar } from './actions.js';
import { doContext } from './family.js';
import { inputMode, setInputMode } from './input.js';
import { toggleMenu } from './menu.js';
import { P, players } from './player.js';
import { toggleSkills } from './skills.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { $ } from './util.js';
import { MAX_PLAYERS, joinPlayer, disconnectPlayer, padTaken, panelNav, pingMates, pollCoop } from './coop.js';
import { titleOn } from './title.js';

/* ---------- Controller-Steuerung (Gamepad, Standardbelegung wie Xbox/PlayStation) ----------
   Linker Stick laufen · rechter Stick Kamera · RT (oder A) Sprung · B Schleichen · X Aktion · Y Klettern · LB Brüllen · LT/L3 Sprinten
   R3 Kamera hinter den Leoparden · Steuerkreuz hoch/runter Zoom · Start Menü · Back/Select Entwicklung.
   In Menüs: Steuerkreuz oder Stick wählt, A bestätigt, B geht zurück. Später steuert Controller N den Spieler N. */
let padX=0, padY=0, padSprint=false, padAct=false, padIdx=-1, padSynth=false, padNavT=0, padFocusEl=null;
const padPrev=[], joinPrev=[], holdA=[]; let hintT=-1e9;
/** Controller i bedient ab jetzt das offene Fenster; seine gerade gedrückten Tasten zählen dort nicht als neuer Druck. */
function claimOverlay(i,gp){ G.ovPad=i; padPrev[i]=gp.buttons.map(b=>!!b.pressed); }
function padUI(){ return inputMode==='pad'; }   // als Funktion, weil die Anzeige sie schon vor diesem Abschnitt braucht
const PADDZ=0.2, pdz=v=>Math.abs(v)<PADDZ?0:(v-Math.sign(v)*PADDZ)/(1-PADDZ);
/** Vibration am Controller idx (Standard: der von Spieler 1) */
function rumble(strong,weak,ms,idx=padIdx){ try{ const gp=idx>=0&&navigator.getGamepads()[idx]; if(gp&&gp.vibrationActuator){ const r=gp.vibrationActuator.playEffect('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak}); if(r&&r.catch) r.catch(()=>{}); } }catch(e){} }
function pressKey(code){ padSynth=true; try{ window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code})); }catch(e){} padSynth=false; }
function topOverlay(){ for(const id of ['ctrlView','guide','birth','dead','win','settings','regions','book','lex','skills','menu','start']){ const el=$(id); if(el&&getComputedStyle(el).display!=='none') return el; } return null; }
function padButtons(ov){ return Array.from(ov.querySelectorAll('button,summary')).filter(b=>!b.disabled&&b.offsetParent!==null); }
function setPadFocus(el){ if(padFocusEl) padFocusEl.classList.remove('padf'); padFocusEl=el; if(el){ el.classList.add('padf'); try{ el.scrollIntoView({block:'nearest'}); }catch(e){} } }
function pollPads(dt){
  let gps; try{ gps=navigator.getGamepads?Array.from(navigator.getGamepads()):[]; }catch(e){ return; }
  // Freie Controller: Start im laufenden Spiel = Mitspieler steigt ein; sonst übernimmt Spieler 1 den Controller, wenn er noch keinen hat
  const cur=padIdx>=0?gps[padIdx]:null;
  for(const g of gps){
    if(!g||!g.connected||g.index===padIdx||padTaken(g.index)) continue;
    const startDown=!!(g.buttons[9]&&g.buttons[9].pressed), was=joinPrev[g.index]; joinPrev[g.index]=startDown;
    if(startDown&&!was&&((G.started&&!topOverlay())||titleOn())&&(cur||inputMode!=='pad')){   // auch schon auf dem Startbildschirm
      if(players.length<MAX_PLAYERS){ joinPlayer(g.index,g); continue; } }
    const active=g.buttons.some((b,i)=>b.pressed&&i!==9)||g.axes.some(a=>Math.abs(a)>0.35);
    // Spieler 1 an Tastatur/Maus/Touch: ein freier Controller gehört nicht automatisch ihm.
    // Start = mitspielen; Ⓐ 2 s halten = Spieler 1 übernimmt diesen Controller.
    if(!cur&&G.started&&inputMode!=='pad'&&!topOverlay()){
      const aDown=!!(g.buttons[0]&&g.buttons[0].pressed), now=performance.now();
      if(aDown){ if(!holdA[g.index]) holdA[g.index]=now; else if(now-holdA[g.index]>2000){ holdA[g.index]=0; padIdx=g.index; setInputMode('pad'); toast('Spieler 1 spielt jetzt mit diesem Controller.','#9be07f'); continue; } }
      else holdA[g.index]=0;
      if(active&&now-hintT>6000){ hintT=now; toast('Freier Controller: Start = mitspielen · Ⓐ 2 s halten = Spieler 1 nimmt ihn','#b9b7a6'); }
      continue;
    }
    if(!cur&&active) padIdx=g.index;
  }
  pollCoop(dt,gps);
  const ov0=G.ovPad!=null?topOverlay():null; if(G.ovPad!=null&&!ov0) G.ovPad=null;
  // Ein Fenster, das ein Mitspieler geöffnet hat, bedient dessen Controller
  const gp=ov0&&G.ovPad!=null&&gps[G.ovPad]?gps[G.ovPad]:padIdx>=0?gps[padIdx]:null;
  if(!gp){ padX=padY=0; padSprint=false; padAct=false; return; }
  const prev=padPrev[gp.index]||(padPrev[gp.index]=[]), B=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed), hit=i=>B(i)&&!prev[i];
  if(inputMode!=='pad'&&(gp.buttons.some(b=>b.pressed)||gp.axes.some(a=>Math.abs(a)>0.35))) setInputMode('pad');
  const ov=topOverlay();
  if(ov){
    padX=padY=0; padSprint=false; padAct=false;
    const btns=padButtons(ov); if(padFocusEl&&btns.indexOf(padFocusEl)<0) setPadFocus(null);
    const v=pdz(gp.axes[1]||0); padNavT-=dt; if(Math.abs(v)<0.3) padNavT=0;
    const up=hit(12)||(v<-0.6&&padNavT<=0), down=hit(13)||(v>0.6&&padNavT<=0);
    if((up||down)&&btns.length){ let i=btns.indexOf(padFocusEl); i=i<0?0:(i+(down?1:-1)+btns.length)%btns.length; setPadFocus(btns[i]); if(Math.abs(v)>0.6) padNavT=0.22; }
    if(hit(0)){ if(padFocusEl) padFocusEl.click(); else if(btns.length) setPadFocus(btns[0]); }
    if(hit(1)){ if(ov.id==='menu') toggleMenu(); else if(ov.id==='skills') toggleSkills(players.find(p=>p.pad===G.ovPad)||P); else pressKey('Escape'); }
    if(hit(9)&&ov.id==='menu') toggleMenu();
    if(gp.index!==padIdx){ for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i); return; }   // Mitspieler-Controller: nur Fenster bedienen
    if(hit(8)&&ov.id==='skills') toggleSkills(players.find(p=>p.pad===G.ovPad)||P);
  } else {
    setPadFocus(null);
    if(P.skOpen){ padX=padY=0; padSprint=false; padAct=false; panelNav(P,gp,hit,dt); for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i); return; }   // eigene Entwicklung offen (gemeinsames Spiel)
    padX=pdz(gp.axes[0]||0); padY=pdz(gp.axes[1]||0);
    padSprint=B(10)||!!(gp.buttons[6]&&gp.buttons[6].value>0.3); padAct=B(2);   // LT oder linken Stick drücken: sprinten
    if(!G.paused&&!P.dead){
      P.cam.yaw-=pdz(gp.axes[2]||0)*dt*2.8; P.cam.pitch=Math.max(0.08,Math.min(1.25,P.cam.pitch+pdz(gp.axes[3]||0)*dt*1.8));
      if(hit(0)||hit(7)) doPounce();   // RT oder Ⓐ: Sprungangriff
      if(hit(1)) P.sneak=!P.sneak;
      if(hit(2)) doContext();
      if(hit(3)) doClimb();
      if(hit(4)) doRoar();
      if(hit(11)) P.cam.yaw=P.rot+Math.PI;
      if(hit(14)) pingMates(P);   // Steuerkreuz links: Mitspieler markieren
      if(hit(12)) P.cam.zoom=Math.max(0.45,P.cam.zoom/1.15);
      if(hit(13)) P.cam.zoom=Math.min(2.6,P.cam.zoom*1.15);
    }
    if(hit(9)&&G.started) toggleMenu();
    if(hit(8)&&G.started) toggleSkills();
  }
  for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i);
}
window.addEventListener('gamepadconnected',e=>{ const extra=G.started&&padIdx>=0&&e.gamepad.index!==padIdx?' – Start drücken zum Mitspielen':'';
  toast('Controller verbunden: '+String(e.gamepad.id||'').split('(')[0].trim().slice(0,40)+extra,'#9be07f'); });
window.addEventListener('gamepaddisconnected',e=>{ const m=players.find(p=>p!==P&&p.pad===e.gamepad.index); if(m) disconnectPlayer(m);
  if(e.gamepad.index===padIdx){ padIdx=-1; padX=padY=0; toast('Controller getrennt','#f2b84b'); } });

export { claimOverlay, padAct, padSprint, padUI, padX, padY, pdz, pollPads };
export { padSynth, rumble, setPadFocus };
