// LeopardLife – Meldungen (mit Warteschlange) und schwebende Texte.
import { camera } from './engine.js';
import { G } from './state.js';
import { $ } from './util.js';

/* ---------- UI ---------- */
G.toastT=0;
// Meldungen bleiben je nach Länge 3 bis 10 Sekunden stehen (etwa Lesetempo). Kommt eine neue, wird die alte nach kurzer Zeit abgelöst statt sofort überschrieben.
const toastQ=[]; G.toastShown=0;
function showToast(t,c){ const el=$('toast'); el.textContent=t; el.style.color=c||'#fff'; el.style.opacity=1; G.toastT=Math.max(3,Math.min(10,1.2+t.length/14)); G.toastShown=0; }
function toast(t,c){
  if(G.toastT>0){ if($('toast').textContent===t) return; if(!toastQ.some(q=>q[0]===t)) toastQ.push([t,c]); if(toastQ.length>4) toastQ.shift(); G.toastT=Math.min(G.toastT,Math.max(0.4,2.2-G.toastShown)); return; }
  showToast(t,c);
}
const v3=new THREE.Vector3();
function floatText(txt,x,y,z,c){
  v3.set(x,y,z).project(camera); if(v3.z>1) return;
  const el=document.createElement('div'); el.className='float'; el.textContent=txt; el.style.color=c||'#fff';
  el.style.left=((v3.x*0.5+0.5)*window.innerWidth-20)+'px'; el.style.top=((-v3.y*0.5+0.5)*window.innerHeight-20)+'px';
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.transform='translateY(-60px)'; el.style.opacity=0; });
  setTimeout(()=>el.remove(),1050);
}

export { floatText, showToast, toast, toastQ };
