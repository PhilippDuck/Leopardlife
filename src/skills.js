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

/* Icons für Eigenschaften, Fähigkeiten und Erbanlagen: 24er-Raster, Strichzeichnung in der jeweiligen Farbe */
function renderSkills(){
  $('skPts').textContent=S.pts+' Punkt'+(S.pts===1?'':'e');
  const row=(it,val,max,cost,grp,cap)=>{ const act=Math.min(val,cap), rest=val-act;
    return '<div class="skill wi">'+ico(it.k,ICOL[grp])+'<div><b>'+it.n+'</b><small>'+it.d+'</small></div><span class="pips">'+'●'.repeat(act)+'<span style="color:#7fb4d8">'+'●'.repeat(rest)+'</span><span style="opacity:.25">'+'●'.repeat(max-val)+'</span></span><button data-g="'+grp+'" data-k="'+it.k+'" '+((S.pts<cost||val>=max||val>=cap)?'disabled':'')+'>+</button></div>'; };
  const cap=Math.min(10,attrCap());
  $('skA').innerHTML=ATTR.map(a=>row(a,S.a[a.k],10,1,'a',cap)).join('')+'<div style="font-size:11.5px;color:var(--mut);padding-top:6px">Wirksam sind höchstens '+cap+' Ränge je Eigenschaft (Stufe + 2).</div>';
  $('skB').innerHTML=ABIL.map(a=>row(a,S.b[a.k],3,2,'b',3)).join('');
  $('skT').innerHTML=S.traits.length?S.traits.map(t=>'<div class="skill wt">'+ico(t,ICOL.t)+'<div><b>'+TRAITS[t][0]+'</b><small>'+TRAITS[t][1]+'</small></div></div>').join(''):'<div style="font-size:12px;color:var(--mut);padding:6px 0">Noch keine. Jedes Junge bekommt bei der Geburt eine Erbanlage und gibt sie an die nächste Generation weiter.</div>';
  if((S.gen||1)>1) $('skT').insertAdjacentHTML('afterbegin','<div class="skill wt">'+ico('anc',ICOL.anc)+'<div><b>Ahnenkraft · Generation '+S.gen+'</b><small>+'+Math.round((ancF()-1)*100)+' % Leben, Ausdauer und Schaden, +'+Math.round((ancF()-1)*50)+' % Tempo</small></div></div>');
}
$('skills').addEventListener('click',e=>{ const b=e.target.closest('button[data-k]'); if(!b) return; const g=b.dataset.g,k=b.dataset.k,cost=g==='a'?1:2,max=g==='a'?10:3;
  if(S.pts>=cost&&S[g][k]<max&&(g!=='a'||S.a[k]<attrCap())){ S[g][k]++; S.pts-=cost; snd.click(); if(k==='vit') P.hp+=15; save(); renderSkills(); } });
function toggleSkills(){ if(sleeping||P.dead||$('win').style.display==='flex'||$('birth').style.display==='flex'||menuOpen()) return; const el=$('skills'); const open=el.style.display==='none'; if(open){ renderSkills(); el.style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); for(const k in keys) keys[k]=false; } else { el.style.display='none'; G.paused=false; } }
$('btnClose').onclick=toggleSkills;

export { toggleSkills };
