// LeoLife – Versteck-Anzeige am Fadenkreuz und dunkler Bildrand.
import { P } from './player.js';
import { $ } from './util.js';
import { hEl } from './coop.js';

/* Versteck-Anzeige: Auge am Fadenkreuz + dunkler Bildrand. 0 = sichtbar, 1 = schwerer zu sehen, 2 = versteckt */
const EYES=[
  '<svg viewBox="0 0 24 24"><path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 12 H22 Q12 21 2 12 Z"/><path d="M8.8 12 A3.2 3.2 0 0 0 15.2 12 Z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 11 Q12 19 22 11"/><path d="M6 15.5 L4.5 18 M12 17 V20 M18 15.5 L19.5 18"/></svg>'
];
/** Versteck-Stufe lv für Spieler p anzeigen: Auge am Fadenkreuz und grüner Schleier in seinem Ausschnitt */
function setHide(lv,p=P){
  const e=hEl(p,'eye'); e.innerHTML=EYES[lv]; e.style.color=lv===2?'#8fe07a':lv===1?'#f2b84b':'#fff'; e.style.opacity=String(lv===0?0:1);
  hEl(p,'hideV').style.opacity=String(lv===2?1:lv===1?0.4:0);
  p.hideLv=lv;
}
setHide(0);

export { setHide };
