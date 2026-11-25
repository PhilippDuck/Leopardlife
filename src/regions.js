// LeoLife – Gebiete-Fenster und Wandern zwischen Gebieten.
import { REGIONS } from './data.js';
import { showDiff } from './menu.js';
import { REG_ID, S, beaten, save } from './save.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { $ } from './util.js';
import { onlineActive } from './net.js';

/* Gebiete wechseln (lädt die Seite mit der neuen Karte neu) */
function reloadWorld(showDiffAfter){
  save(); try{ if(showDiffAfter) sessionStorage.setItem('jaguar-showdiff','1'); }catch(e){}
  try{ location.reload(); }catch(e){ toast('Bitte lade die Seite neu, um das Gebiet zu wechseln.','#f2b84b'); }
}
let travelArm=null;
function renderRegions(){
  $('regList').innerHTML=Object.keys(REGIONS).map(id=>{ const r=REGIONS[id], open=!r.soon&&(S.gen||1)>=r.gen, here=id===REG_ID;
    const st=here?'<span style="color:#9be07f">Hier bist du</span>':r.soon?'<span style="color:var(--mut)">kommt bald · ab Generation '+r.gen+'</span>':open?'<span style="color:var(--gold)">offen</span>':'<span style="color:var(--mut)">ab Generation '+r.gen+'</span>';
    return '<div class="skill"><div><b>'+r.n+(beaten(id)?' · abgeschlossen':'')+'</b><small>'+r.d+(r.boss?' Endgegner: '+r.boss+'.':'')+'</small><small>'+st+'</small></div><span></span>'+
      (open&&!here?'<button data-r="'+id+'">'+(travelArm===id?'Wirklich wandern?':'Hinwandern')+'</button>':'<span></span>')+'</div>'; }).join('');
}
$('regList').addEventListener('click',e=>{ const b=e.target.closest('button[data-r]'); if(!b) return; const id=b.dataset.r;
  if(onlineActive()){ toast('Im Online-Spiel bleibt ihr im Gebiet des Gastgebers. Verlasse zuerst den Raum.','#f2b84b'); return; }
  if(travelArm!==id){ travelArm=id; renderRegions(); return; }
  S.region=id; reloadWorld(false); });
function openRegions(){ travelArm=null; renderRegions(); $('menu').style.display='none'; $('regions').style.display='flex'; }
function closeRegions(){ $('regions').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const regionsOpen=()=>$('regions').style.display==='flex';
$('btnRegions').onclick=openRegions; $('btnRegBack').onclick=closeRegions;
try{ if(sessionStorage.getItem('jaguar-showdiff')){ sessionStorage.removeItem('jaguar-showdiff'); $('btnPlay').textContent='Spielen'; $('btnReset').style.display='none'; showDiff(); } }catch(e){}


$('btnWin').onclick=()=>{ $('win').style.display='none'; G.paused=false; };

export { reloadWorld };
export { closeRegions, regionsOpen };
