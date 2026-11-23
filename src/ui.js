// LeoLife – Meldungen (mit Warteschlange) und schwebende Texte.
import { camera } from './engine.js';
import { G } from './state.js';
import { $ } from './util.js';
import { emit } from './events.js';
import { P, players } from './player.js';

/* ---------- UI ---------- */
G.toastT=0;
// Meldungen bleiben je nach Länge 3 bis 10 Sekunden stehen (etwa Lesetempo). Kommt eine neue, wird die alte nach kurzer Zeit abgelöst statt sofort überschrieben.
const toastQ=[]; G.toastShown=0;
/** Zeigt eine Meldung bei Spieler 1; ohne solo auch in den Ausschnitten der Mitspieler (coop.js hört auf das Ereignis toast). */
function showToast(t,c,solo){ const el=$('toast'); el.textContent=t; el.style.color=c||'#fff'; el.style.opacity='1'; G.toastT=Math.max(3,Math.min(10,1.2+t.length/14)); G.toastShown=0; if(!solo) emit('toast',t,c); }
/** Meldung in die Warteschlange. solo: nur für Spieler 1 (Hinweise zu seinen eigenen Aktionen) */
function toast(t,c,solo){
  if(G.toastT>0){ if($('toast').textContent===t) return; if(!toastQ.some(q=>q[0]===t)) toastQ.push([t,c,solo]); if(toastQ.length>4) toastQ.shift(); G.toastT=Math.min(G.toastT,Math.max(0.4,2.2-G.toastShown)); return; }
  showToast(t,c,solo);
}
const v3=new THREE.Vector3();
/** Schwebender Text an der Weltposition x,y,z – in jedem Spieler-Ausschnitt, in dem die Stelle zu sehen ist */
function floatText(txt,x,y,z,c){
  for(const p of players){
    const frame=p===P?$('ph0'):p.hud; if(!frame) continue;
    v3.set(x,y,z).project(p.camera||camera); if(v3.z>1||Math.abs(v3.x)>1.1||Math.abs(v3.y)>1.1) continue;
    const W=frame.clientWidth||window.innerWidth, Hh=frame.clientHeight||window.innerHeight;
    const el=document.createElement('div'); el.className='float'; el.textContent=txt; el.style.color=c||'#fff';
    el.style.left=((v3.x*0.5+0.5)*W-20)+'px'; el.style.top=((-v3.y*0.5+0.5)*Hh-20)+'px';
    frame.appendChild(el);
    requestAnimationFrame(()=>{ el.style.transform='translateY(-60px)'; el.style.opacity='0'; });
    setTimeout(()=>el.remove(),1050);
  }
}

export { floatText, showToast, toast, toastQ };
