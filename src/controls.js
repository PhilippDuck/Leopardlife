// LeopardLife – Steuerquellen: übersetzen Tastatur, Maus, Touch oder Controller in den Steuerwunsch eines Spielers.
// p.ctl.source sagt, woher ein Spieler gesteuert wird. 'local' = alles zusammen (Einzelspieler).
// Für Splitscreen kommen später 'pad0' … 'pad3' dazu: dann liest jeder Spieler nur seinen Controller.
import { padAct, padSprint, padX, padY } from './gamepad.js';
import { keys } from './input.js';
import { G } from './state.js';

/** Liest die Eingaben für Spieler p und schreibt p.ctl (fw/rt: Laufrichtung -1…1, sprint) sowie die Kameratasten. */
/** @param {import('./player.js').Player} p */
function readControls(p,dt){
  const c=p.ctl;
  if(c.source!=='local') return;   // andere Quellen (Controller N, Test) füllen p.ctl selbst
  if(p.skOpen){ c.fw=c.rt=0; c.sprint=false; c.act=false; return; }   // Entwicklung offen: der Leopard steht still
  // Kameratasten
  if(keys.ArrowLeft) p.cam.yaw+=dt*2; if(keys.ArrowRight) p.cam.yaw-=dt*2;
  if(keys.ArrowUp) p.cam.pitch=Math.max(0.08,p.cam.pitch-dt); if(keys.ArrowDown) p.cam.pitch=Math.min(1.25,p.cam.pitch+dt);
  // Bewegung
  let fw=(keys.KeyW?1:0)-(keys.KeyS?1:0)-G.joyY-padY, rt=(keys.KeyD?1:0)-(keys.KeyA?1:0)+G.joyX+padX;
  const il=Math.hypot(fw,rt); if(il>1){ fw/=il; rt/=il; }
  c.fw=fw; c.rt=rt; c.sprint=!!(keys.ShiftLeft||keys.ShiftRight||G.tSprint||padSprint); c.act=!!(keys.KeyF||padAct);
}

export { readControls };
