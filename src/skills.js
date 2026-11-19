// LeopardLife – Entwicklungsfenster: Eigenschaften, Fähigkeiten, Erbanlagen, Ahnenkraft.
import { snd } from './audio.js';
import { ABIL, ATTR, ICOL, TRAITS, ico } from './data.js';
import { keys } from './input.js';
import { P, players } from './player.js';
import { S, ancF, attrCap, save } from './save.js';
import { G } from './state.js';
import { $ } from './util.js';
import { menuOpen } from './menu.js';
import { sleeping } from './daynight.js';
import { heirLevel } from './family.js';
import { mateBecomeCub } from './kinship.js';
import { animals } from './animals.js';
import { cloneWithClasses, tell } from './coop.js';

/* Icons für Eigenschaften, Fähigkeiten und Erbanlagen: 24er-Raster, Strichzeichnung in der jeweiligen Farbe */
/** Wessen Entwicklung gerade offen ist: Spieler 1 oder ein Mitspieler */
let skP=P;
/** Entwicklung von Spieler p in das Fenster root zeichnen (null: das große Fenster, sonst sein eigenes im gemeinsamen Spiel) */
function renderSkills(p=skP,root=null){
  const L=p.L, g=id=>root?root.querySelector('.s-'+id):$(id);
  g('skWho').textContent=p===P?(players.length>1?' · Spieler 1':''):' · Spieler '+(p.num||2);
  { const b=g('btnSkCub'), ok=p!==P&&!!S.cub&&S.cub.n>0; b.style.display=ok?'block':'none'; if(ok&&!p.cubArm) b.textContent='Als Junges weiterspielen (Stufe '+heirLevel()+', Generation '+(S.cub.gen||'?')+')'; }
  g('skPts').textContent=L.pts+' Punkt'+(L.pts===1?'':'e');
  const row=(it,val,max,cost,grp,cap)=>{ const act=Math.min(val,cap), rest=val-act;
    return '<div class="skill wi">'+ico(it.k,ICOL[grp])+'<div><b>'+it.n+'</b><small>'+it.d+'</small></div><span class="pips">'+'●'.repeat(act)+'<span style="color:#7fb4d8">'+'●'.repeat(rest)+'</span><span style="opacity:.25">'+'●'.repeat(max-val)+'</span></span><button data-g="'+grp+'" data-k="'+it.k+'" '+((L.pts<cost||val>=max||val>=cap)?'disabled':'')+'>+</button></div>'; };
  const cap=Math.min(10,attrCap(L));
  g('skA').innerHTML=ATTR.map(a=>row(a,L.a[a.k],10,1,'a',cap)).join('')+'<div style="font-size:11.5px;color:var(--mut);padding-top:6px">Wirksam sind höchstens '+cap+' Ränge je Eigenschaft (Stufe + 2).</div>';
  g('skB').innerHTML=ABIL.map(a=>row(a,L.b[a.k],3,2,'b',3)).join('');
  g('skT').innerHTML=L.traits.length?L.traits.map(t=>'<div class="skill wt">'+ico(t,ICOL.t)+'<div><b>'+TRAITS[t][0]+'</b><small>'+TRAITS[t][1]+'</small></div></div>').join(''):'<div style="font-size:12px;color:var(--mut);padding:6px 0">Noch keine. Jedes Junge bekommt bei der Geburt eine Erbanlage und gibt sie an die nächste Generation weiter.</div>';
  if((S.gen||1)>1) g('skT').insertAdjacentHTML('afterbegin','<div class="skill wt">'+ico('anc',ICOL.anc)+'<div><b>Ahnenkraft · Generation '+S.gen+'</b><small>+'+Math.round((ancF()-1)*100)+' % Leben, Ausdauer und Schaden, +'+Math.round((ancF()-1)*50)+' % Tempo</small></div></div>');
}
/** Klick in einem Entwicklungsfenster von Spieler p: Punkt verteilen, ins Junge wechseln oder schließen */
function skillClick(e,p,root){
  const t=/** @type {HTMLElement} */(e.target);
  if(root&&t.closest('.s-btnClose')){ toggleSkills(p); return; }
  if(root&&t.closest('.s-btnSkCub')){ cubSwitch(p,root); return; }
  const b=/** @type {HTMLElement} */(t.closest('button[data-k]')); if(!b) return;
  const L=p.L, g=b.dataset.g,k=b.dataset.k,cost=g==='a'?1:2,max=g==='a'?10:3;
  if(L.pts>=cost&&L[g][k]<max&&(g!=='a'||L.a[k]<attrCap(L))){ L[g][k]++; L.pts-=cost; snd.click(); if(k==='vit') p.hp+=15; save(); renderSkills(p,root); }
}
$('skills').addEventListener('click',e=>skillClick(e,skP,null));
/**
 * Öffnet bzw. schließt die Entwicklung von Spieler p.
 * Allein: großes Fenster, das Spiel pausiert. Gemeinsam: eigenes Fenster im Ausschnitt des Spielers, das Spiel läuft weiter
 * und nur sein Leopard steht still – deshalb nicht, solange ihn ein Raubtier jagt.
 */
function toggleSkills(p=P){
  if(players.length>1){ toggleSkillPanel(p); return; }
  if(sleeping||(p===P&&P.dead)||$('win').style.display==='flex'||$('birth').style.display==='flex'||menuOpen()) return; const el=$('skills'); const open=el.style.display==='none';
  if(open){ skP=p; G.ovPad=p===P?null:p.pad; renderSkills(p,null); el.style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); for(const k in keys) keys[k]=false; }
  else { el.style.display='none'; G.paused=false; G.ovPad=null; skP=P; } }
/** Eigenes Entwicklungsfenster eines Spielers im gemeinsamen Spiel (wird beim ersten Öffnen gebaut) */
function panelFor(p){
  if(p.skPanel) return p.skPanel;
  const el=cloneWithClasses(/** @type {HTMLElement} */($('skills').querySelector('.card')),'s-');
  el.classList.add('skp'); el.addEventListener('click',e=>skillClick(e,p,el));
  q0(el,'.s-btnClose').textContent='Schließen'+(p===P?' (Tab)':' (Back)');
  (p===P?$('ph0'):p.hud).appendChild(el); p.skPanel=el; return el;
}
const q0=(el,s)=>/** @type {HTMLElement} */(el.querySelector(s));
function toggleSkillPanel(p){
  if(p.skOpen){ p.skOpen=false; if(p.skPanel) p.skPanel.style.display='none'; return; }
  if(p.dead||sleeping) return;
  if(animals.some(a=>!a.dead&&(a.state==='chase'||a.state==='lunge')&&a.tgt===p&&Math.hypot(a.x-p.x,a.z-p.z)<45)){
    tell(p,'Du wirst gejagt – bring dich erst in Sicherheit, z. B. auf einem Baum.','#ff8a70'); return; }
  const el=panelFor(p); renderSkills(p,el); el.style.display='block'; el.scrollTop=0; p.skOpen=true; p.skF=-1;
  p.ctl.fw=p.ctl.rt=0; p.ctl.sprint=false;
  if(p===P){ for(const k in keys) keys[k]=false; if(document.exitPointerLock) document.exitPointerLock(); }
  if(!p.safe) tell(p,'Das Spiel läuft weiter – auf einem Baum bist du dabei sicher.','#b9b7a6');
}
/** Ins Junge wechseln (zweimal drücken zum Bestätigen) */
function cubSwitch(p,root){
  const b=root?q0(root,'.s-btnSkCub'):$('btnSkCub');
  if(!p.cubArm){ p.cubArm=true; b.textContent='Wirklich? Du startest neu als Junges'; return; }
  p.cubArm=false; toggleSkills(p); mateBecomeCub(p);
}
$('btnClose').onclick=()=>toggleSkills(skP);
// Mitspieler wechselt ins Junge des aktuellen Wurfs (zweimal drücken zum Bestätigen)
$('btnSkCub').onclick=()=>cubSwitch(skP,null);

export { toggleSkills, renderSkills };
