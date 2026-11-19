// LeopardLife – Entwicklungsfenster: Eigenschaften, Fähigkeiten, Erbanlagen, Ahnenkraft.
import { snd } from './audio.js';
import { ABIL, ATTR, ICOL, TRAITS, ico } from './data.js';
import { keys } from './input.js';
import { P } from './player.js';
import { S, ancF, attrCap, save } from './save.js';
import { G } from './state.js';
import { $ } from './util.js';
import { menuOpen } from './menu.js';
import { sleeping } from './daynight.js';
import { heirLevel } from './family.js';
import { mateBecomeCub } from './kinship.js';

/* Icons für Eigenschaften, Fähigkeiten und Erbanlagen: 24er-Raster, Strichzeichnung in der jeweiligen Farbe */
/** Wessen Entwicklung gerade offen ist: Spieler 1 oder ein Mitspieler */
let skP=P;
function renderSkills(){
  const L=skP.L;
  $('skWho').textContent=skP===P?'':' · Spieler '+(skP.num||2);
  { const b=$('btnSkCub'), ok=skP!==P&&!!S.cub&&S.cub.n>0; b.style.display=ok?'block':'none'; if(ok&&!cubArm) b.textContent='Als Junges weiterspielen (Stufe '+heirLevel()+', Generation '+(S.cub.gen||'?')+')'; }
  $('skPts').textContent=L.pts+' Punkt'+(L.pts===1?'':'e');
  const row=(it,val,max,cost,grp,cap)=>{ const act=Math.min(val,cap), rest=val-act;
    return '<div class="skill wi">'+ico(it.k,ICOL[grp])+'<div><b>'+it.n+'</b><small>'+it.d+'</small></div><span class="pips">'+'●'.repeat(act)+'<span style="color:#7fb4d8">'+'●'.repeat(rest)+'</span><span style="opacity:.25">'+'●'.repeat(max-val)+'</span></span><button data-g="'+grp+'" data-k="'+it.k+'" '+((L.pts<cost||val>=max||val>=cap)?'disabled':'')+'>+</button></div>'; };
  const cap=Math.min(10,attrCap(L));
  $('skA').innerHTML=ATTR.map(a=>row(a,L.a[a.k],10,1,'a',cap)).join('')+'<div style="font-size:11.5px;color:var(--mut);padding-top:6px">Wirksam sind höchstens '+cap+' Ränge je Eigenschaft (Stufe + 2).</div>';
  $('skB').innerHTML=ABIL.map(a=>row(a,L.b[a.k],3,2,'b',3)).join('');
  $('skT').innerHTML=L.traits.length?L.traits.map(t=>'<div class="skill wt">'+ico(t,ICOL.t)+'<div><b>'+TRAITS[t][0]+'</b><small>'+TRAITS[t][1]+'</small></div></div>').join(''):'<div style="font-size:12px;color:var(--mut);padding:6px 0">Noch keine. Jedes Junge bekommt bei der Geburt eine Erbanlage und gibt sie an die nächste Generation weiter.</div>';
  if((S.gen||1)>1) $('skT').insertAdjacentHTML('afterbegin','<div class="skill wt">'+ico('anc',ICOL.anc)+'<div><b>Ahnenkraft · Generation '+S.gen+'</b><small>+'+Math.round((ancF()-1)*100)+' % Leben, Ausdauer und Schaden, +'+Math.round((ancF()-1)*50)+' % Tempo</small></div></div>');
}
$('skills').addEventListener('click',e=>{ const b=e.target.closest('button[data-k]'); if(!b) return; const L=skP.L, g=b.dataset.g,k=b.dataset.k,cost=g==='a'?1:2,max=g==='a'?10:3;
  if(L.pts>=cost&&L[g][k]<max&&(g!=='a'||L.a[k]<attrCap(L))){ L[g][k]++; L.pts-=cost; snd.click(); if(k==='vit') skP.hp+=15; save(); renderSkills(); } });
/** Öffnet bzw. schließt die Entwicklung von Spieler p (Mitspieler bedienen sie mit ihrem Controller). */
function toggleSkills(p=P){ if(sleeping||(p===P&&P.dead)||$('win').style.display==='flex'||$('birth').style.display==='flex'||menuOpen()) return; const el=$('skills'); const open=el.style.display==='none';
  if(open){ skP=p; G.ovPad=p===P?null:p.pad; renderSkills(); el.style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); for(const k in keys) keys[k]=false; }
  else { el.style.display='none'; G.paused=false; G.ovPad=null; skP=P; } }
$('btnClose').onclick=()=>toggleSkills(skP);
// Mitspieler wechselt ins Junge des aktuellen Wurfs (zweimal drücken zum Bestätigen)
let cubArm=false;
$('btnSkCub').onclick=()=>{ if(!cubArm){ cubArm=true; $('btnSkCub').textContent='Wirklich? Du startest neu als Junges'; return; } cubArm=false; const p=skP; toggleSkills(p); mateBecomeCub(p); };

export { toggleSkills };
