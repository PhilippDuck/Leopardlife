// LeopardLife – Mitspieler am selben Gerät: Beitreten per Controller, geteiltes Bild, eigene Anzeige, am Boden und Wiederbeleben.
// Spieler 1 bleibt der „lokale" Spieler (Tastatur, Maus, Touch oder erster Controller) mit der großen Anzeige.
// Jeder weitere Spieler hat genau einen Controller (p.pad) und eine kleine Anzeige in seinem Bildausschnitt.
import { doClimb, doPounce, doRoar } from './actions.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { SUN_OFF, camera, renderer, resize, scene, sun } from './engine.js';
import { on } from './events.js';
import { claimOverlay, pdz } from './gamepad.js';
import { menuOpen, toggleMenu } from './menu.js';
import { P, dropModel, makePlayer, players } from './player.js';
import { S, copyLeopard, fresh, maxHp, maxSt, pScale, save } from './save.js';
import { sky, stars } from './sky.js';
import { G } from './state.js';
import { H, cullTiles } from './terrain.js';
import { toast } from './ui.js';
import { $ } from './util.js';
import { applyTreeView, tallMat } from './vegetation.js';
import { toggleSkills } from './skills.js';
import { ensureKin, mateContext, newId } from './kinship.js';
import { PCOL, drawRadar, updateCross, updateUI, updateWarn, warnArrows } from './hud.js';
import { esc } from './carcass.js';
import { sleepVotes } from './daynight.js';
import { startTutorial } from './tutorial.js';
import { renderPlayers, titleOn } from './title.js';

/** Höchstens so viele Spieler teilen sich den Bildschirm */
const MAX_PLAYERS=4;
/** Sekunden am Boden, bevor ein Spieler von selbst im Bau erwacht, und Haltezeit fürs Wiederbeleben */
const DOWN_TIME=60, REVIVE_TIME=3, REVIVE_DIST=3;
const NAMES=['Spieler 1','Spieler 2','Spieler 3','Spieler 4'];
// Fell der Mitspieler: deutlich unterscheidbar, aber natürlich (hell, dunkler, kräftig)
const FURS=[null,{l:1.12,s:0.8,sn:0.8,ss:1.2},{l:0.86,s:1.1,sn:1.4,ss:0.9},{l:1.02,s:1.25,sn:1.1,ss:1.35}];

/** Ein Spieler mit Controller i tritt bei (gp: dessen aktueller Zustand). Startet neben Spieler 1. */
function joinPlayer(i,gp){
  if(players.length>=MAX_PLAYERS||players.some(p=>p.pad===i)) return null;
  const num=firstFreeNum();
  const cam=new THREE.PerspectiveCamera(camera.fov,1,camera.near,camera.far);
  const ang=P.rot+Math.PI/2*(num%2?1:-1), r=2.5;
  // Eigene Werte: startet als Geschwister auf der Stufe von Spieler 1 und entwickelt sich ab dann selbst
  // Gespeicherte Werte dieses Platzes, sonst neu (Kopie von Spieler 1); liegen im Spielstand und werden mit ihm gespeichert
  S.mates=S.mates||{};
  // Neu: fremder Leopard auf der Stufe von Spieler 1, mit den Punkten, die er bis dahin bekommen hätte (2 je Stufe) – selbst verteilen.
  // Bekannt (gespeichert): hat Spieler 1 inzwischen allein weitergespielt, holt er die fehlenden Stufen samt Punkten auf.
  let L=S.mates[num];
  if(!L){ L=newMate(num); S.mates[num]=L; }
  else if(L.lvl<S.lvl){ L.pts+=2*(S.lvl-L.lvl); L.lvl=S.lvl; L.xp=0; }
  // Wer neu einsteigt, ist ein fremder Leopard (nicht verwandt) – erst eure Jungen sind miteinander verwandt
  if(!L.id||L.id===S.id){ L.id=newId(); L.parents=[]; } ensureKin(L); save();
  const p=makePlayer({source:'pad'+i,camera:cam,x:P.x+Math.sin(ang)*r,z:P.z+Math.cos(ang)*r,fur:L.fur||FURS[num-1],L});
  p.pad=i; p.num=num; p.padPrev=gp?gp.buttons.map(b=>!!b.pressed):[];   // der Start-Druck zum Einsteigen zählt nicht als Pause p.rot=P.rot; p.cam.yaw=P.cam.yaw; p.cam.pitch=P.cam.pitch;
  p.hud=makeHud(p); hEl(p,'tut').style.display='none'; startTutorial(p);   // eigene Einführung beim ersten Einstieg (oder weiter, wo er war)
  players.push(p); layoutChanged(); renderPlayers();
  toast(NAMES[num-1]+' ist dabei (Stufe '+L.lvl+')! '+(L.pts>0?L.pts+' Punkte verteilen mit Back · ':'Back: Entwicklung · ')+'Back halten: aussteigen','#9be07f'); snd.click();
  return p;
}
/** Werte eines neu einsteigenden Mitspielers: fremder Leopard auf der Stufe von Spieler 1 */
function newMate(num){ const L=copyLeopard(S); Object.assign(L,{a:fresh().a,b:fresh().b,traits:[],xp:0,pts:2*(S.lvl-1),fur:FURS[num-1],hunger:100,age:0,kills:0,gen:S.gen||1}); return L; }
/** Neustart / neue Blutlinie: alle Mitspieler fangen ebenfalls von vorn an (neue Werte im neuen Spielstand) und stehen bei Spieler 1 */
function resetMates(){
  S.mates={};
  players.forEach(p=>{ if(p===P) return;
    const L=newMate(p.num); L.id=newId(); L.parents=[]; ensureKin(L); S.mates[p.num]=L; p.L=L;
    const ang=P.rot+Math.PI/2*(p.num%2?1:-1); p.x=P.x+Math.sin(ang)*2.5; p.z=P.z+Math.cos(ang)*2.5;
    Object.assign(p,{dead:false,downT:null,tree:null,safe:false,drag:null,eatC:null,bite:null,pounce:0,combatT:0,sneak:false});
    p.hp=maxHp(L); p.st=maxSt(L); p.g.rotation.z=0; hEl(p,'hurt').style.opacity='0'; if(p.skOpen) toggleSkills(p); });
  save();
}
/** Spieler p steigt aus (Back zweimal oder Controller getrennt). */
function leavePlayer(p){
  if(p===P) return;
  const i=players.indexOf(p); if(i<0) return;
  players.splice(i,1); dropModel(p.g); if(p.hud) p.hud.remove(); renderPlayers();
  for(const a of animals) if(a.tgt===p) a.tgt=null;
  layoutChanged(); toast(NAMES[p.num-1]+' ist ausgestiegen.','#f2b84b');
}
function firstFreeNum(){ for(let n=2;n<=MAX_PLAYERS;n++) if(!players.some(p=>p.num===n)) return n; return MAX_PLAYERS; }

/* ---------- Bildaufteilung ---------- */
/** Bildausschnitte als Bruchteile [links, oben, breite, höhe] (oben = 0). 2 Spieler nebeneinander, ab 3 Viertel. */
function rectsFor(n){
  if(n<=1) return [[0,0,1,1]];
  if(n===2) return [[0,0,0.5,1],[0.5,0,0.5,1]];
  return [[0,0,0.5,0.5],[0.5,0,0.5,0.5],[0,0.5,0.5,0.5],[0.5,0.5,0.5,0.5]];
}
/** Kleinere Seite des Bildausschnitts von Spieler p in Pixeln (für Abstände von Warnpfeilen und Hinweisen). */
function viewMin(p){ const i=Math.max(0,players.indexOf(p)), q=rectsFor(players.length)[i]||[0,0,1,1]; return Math.min(q[2]*window.innerWidth,q[3]*window.innerHeight); }
function layoutChanged(){
  const n=players.length, R=rectsFor(n), split=n>1;
  document.body.classList.toggle('split',split); document.body.classList.toggle('quad',n>=3);
  // Jeder Spieler hat einen Anzeige-Rahmen über seinem Ausschnitt; Spieler 1 nutzt #ph0, Mitspieler eine Kopie
  players.forEach((p,i)=>{ const el=p===P?$('ph0'):p.hud; if(!el) return; const q=R[i]; Object.assign(el.style,{left:q[0]*100+'%',top:q[1]*100+'%',width:q[2]*100+'%',height:q[3]*100+'%'}); });
  const empty=$('splitEmpty'); if(empty){ empty.style.display=n===3?'flex':'none'; }
  if(!split){ renderer.setScissorTest(false); resize(); }
  for(const p of players) if(p.hud||p===P) updateUI(p);
}
const _sz=new THREE.Vector2();
/** Zeichnet das Bild: bei einem Spieler wie gewohnt, sonst ein Ausschnitt je Spieler mit eigener Kamera. */
function renderAll(){
  if(players.length===1||titleOn()){ applyTreeView(0); cullTiles(P.camera); renderer.render(scene,P.camera); return; }   // Startbildschirm: ein Bild für alle
  renderer.getSize(_sz); const W=_sz.x, Hh=_sz.y, R=rectsFor(players.length);
  // Schatten: liegen alle nah beieinander, reicht ein Schattenbild um die Mitte; sonst eins je Ausschnitt
  let mx=0,mz=0; for(const p of players){ mx+=p.x; mz+=p.z; } mx/=players.length; mz/=players.length;
  const spread=Math.max(...players.map(p=>Math.hypot(p.x-mx,p.z-mz)));
  const shadows=renderer.shadowMap.enabled&&sun.castShadow, perView=shadows&&spread>30;
  if(!perView) placeSun(mx,H(mx,mz),mz);
  renderer.setScissorTest(true);
  players.forEach((p,i)=>{
    const q=R[i], x=Math.round(q[0]*W), w=Math.round(q[2]*W), h=Math.round(q[3]*Hh), y=Math.round(Hh-(q[1]+q[3])*Hh);
    const cam=p.camera; if(Math.abs(cam.aspect-w/h)>1e-3){ cam.aspect=w/h; cam.updateProjectionMatrix(); }
    renderer.setViewport(x,y,w,h); renderer.setScissor(x,y,w,h);
    if(perView){ placeSun(p.x,p.y,p.z); renderer.shadowMap.needsUpdate=true; }
    viewSetup(p,cam); applyTreeView(i); cullTiles(cam); renderer.render(scene,cam);
  });
  if(players.length===3){ const q=R[3], x=Math.round(q[0]*W), w=Math.round(q[2]*W), h=Math.round(q[3]*Hh); renderer.setViewport(x,0,w,h); renderer.setScissor(x,0,w,h); renderer.setClearColor(0x0b0d08,1); renderer.clear(); }
  renderer.setScissorTest(false); renderer.setViewport(0,0,W,Hh); viewSetup(P,P.camera);
}
function placeSun(x,y,z){ sun.position.set(x+SUN_OFF.x,y+SUN_OFF.y,z+SUN_OFF.z); sun.target.position.set(x,y,z); sun.target.updateMatrixWorld(); }
/** Alles, was der Darstellung um einen Spieler herum folgt: Himmel, Grasfeld, Gras weicht dem Leoparden aus. */
function viewSetup(p,cam){
  sky.position.copy(cam.position); stars.position.copy(cam.position);
  if(G.grassMat) G.grassMat.uniforms.uP.value.set(p.x,p.z);
  tallMat.uniforms.uP.value.set(p.x,p.z); tallMat.uniforms.uR.value=p.tree!=null?0.01:1.1+pScale(p.L)*1.1;
}

/* ---------- Controller der Mitspieler ---------- */
/** Liest die Controller aller Mitspieler (Spieler 1 liest gamepad.js). gps: navigator.getGamepads() */
function pollCoop(dt,gps){
  for(const p of players.slice()){
    if(p===P||p.pad==null) continue;
    if(G.ovPad===p.pad&&topOverlayOpen()) continue;   // bedient gerade ein Fenster (gamepad.js)
    const gp=gps[p.pad], c=p.ctl;
    if(gp&&gp.connected&&p.skOpen){   // eigene Entwicklung offen: Controller bedient das Fenster, der Leopard steht still
      const prev=p.padPrev||(p.padPrev=[]), B=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed), hit=i=>B(i)&&!prev[i];
      c.fw=c.rt=0; c.sprint=false; c.act=false; panelNav(p,gp,hit,dt);
      for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i); continue; }
    if(!gp||!gp.connected){ c.fw=c.rt=0; c.sprint=false; c.act=false; continue; }
    const prev=p.padPrev||(p.padPrev=[]), B=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed), hit=i=>B(i)&&!prev[i];
    if(G.paused||!G.started||p.dead){ c.fw=c.rt=0; c.sprint=false; c.act=B(2); }
    else {
      let fw=-pdz(gp.axes[1]||0), rt=pdz(gp.axes[0]||0); const l=Math.hypot(fw,rt); if(l>1){ fw/=l; rt/=l; }
      c.fw=fw; c.rt=rt; c.sprint=B(10)||!!(gp.buttons[6]&&gp.buttons[6].value>0.3); c.act=B(2);   // LT/L3 sprinten
      p.cam.yaw-=pdz(gp.axes[2]||0)*dt*2.8; p.cam.pitch=Math.max(0.08,Math.min(1.25,p.cam.pitch+pdz(gp.axes[3]||0)*dt*1.8));
      if(hit(0)||hit(7)) doPounce(p);   // RT oder Ⓐ: Sprungangriff
      if(hit(1)) p.sneak=!p.sneak;
      if(hit(3)) doClimb(p);
      if(hit(4)) doRoar(p);
      if(hit(2)) mateContext(p);   // X antippen: paaren, Junges füttern (X halten: wiederbeleben)
      if(hit(11)) p.cam.yaw=p.rot+Math.PI;
      if(hit(14)) pingMates(p);   // Steuerkreuz links: Mitspieler markieren
      if(hit(12)) p.cam.zoom=Math.max(0.45,p.cam.zoom/1.15);
      if(hit(13)) p.cam.zoom=Math.min(2.6,p.cam.zoom*1.15);
    }
    if(hit(9)&&G.started&&!$('dead').style.display.includes('flex')){ toggleMenu(); if(menuOpen()) claimOverlay(p.pad,gp); }
    // Back kurz: eigene Entwicklung · Back halten: aussteigen
    // Haltezeit in echter Zeit (dt ist pro Bild gedeckelt und liefe bei wenigen Bildern pro Sekunde zu langsam)
    if(B(8)){ const now=performance.now(); if(!prev[8]) p.leaveAt=now; p.leaveT=(now-p.leaveAt)/1000; if(p.leaveT>=1.5){ leavePlayer(p); continue; } if(p.leaveT>0.35) mateToast(p,'Halten zum Aussteigen …','#f2b84b'); }
    else { if(prev[8]&&(p.leaveT||0)<0.35&&G.started&&!G.paused) toggleSkills(p); p.leaveT=0; }
    for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i);
  }
}
const topOverlayOpen=()=>['skills','menu','settings','regions','book','guide','ctrlView'].some(id=>$(id)&&$(id).style.display==='flex');
/** Eigenes Entwicklungsfenster mit dem Controller bedienen: Steuerkreuz/Stick wählt, Ⓐ drückt, Ⓑ oder Back schließt */
function panelNav(p,gp,hit,dt){
  const el=p.skPanel; if(!el) return;
  const btns=Array.from(el.querySelectorAll('button')).filter(b=>!b.disabled&&b.offsetParent!==null);
  const v=pdz(gp.axes[1]||0); p.navT=(p.navT||0)-dt; if(Math.abs(v)<0.3) p.navT=0;
  const up=hit(12)||(v<-0.6&&p.navT<=0), down=hit(13)||(v>0.6&&p.navT<=0);
  if(p.skF==null||p.skF>=btns.length) p.skF=-1;
  if((up||down)&&btns.length){ p.skF=p.skF<0?0:(p.skF+(down?1:-1)+btns.length)%btns.length; if(Math.abs(v)>0.6) p.navT=0.22; try{ btns[p.skF].scrollIntoView({block:'nearest'}); }catch(e){} }
  btns.forEach((b,i)=>b.classList.toggle('padf',i===p.skF));
  if(hit(0)){ if(p.skF>=0) btns[p.skF].click(); else if(btns.length) p.skF=0; }
  if(hit(1)||hit(8)) toggleSkills(p);
}
/** Ist Controller i schon einem Mitspieler zugeordnet? */
const padTaken=i=>players.some(p=>p!==P&&p.pad===i);

/* ---------- Am Boden und Wiederbeleben ---------- */
/** Spieler p geht zu Boden, solange noch ein anderer steht. Mitspieler können ihn wiederbeleben. */
function downPlayer(p,a){
  p.dead=true; p.hp=0; p.pounce=0; p.downT=DOWN_TIME; p.revT=0; p.sneak=false;
  p.g.rotation.z=Math.PI/2; p.g.position.y=p.y+0.25*pScale(p.L);
  snd.death(); hEl(p,'hurt').style.opacity='0.55';
  toast(nameOf(p)+' ist am Boden! Daneben X (bzw. F) halten zum Wiederbeleben.','#ff8a70');
}
/** Pro Bild: Wiederbeleben durch einen Mitspieler in der Nähe, sonst nach Ablauf im Bau erwachen. */
function updateCoop(dt){
  if(players.length<2) return;
  sleepVotes();
  // Wer steht nah bei einem Mitspieler am Boden? (für den Hinweis mit Fortschritt in seiner Anzeige)
  for(const o of players){ o.reviveNear=null; if(o.dead) continue; let bd=REVIVE_DIST*2.5;
    for(const p of players){ if(p===o||!p.dead||p.downT==null) continue; const d=Math.hypot(o.x-p.x,o.z-p.z); if(d<bd){ bd=d; o.reviveNear=p; } } }
  for(const p of players){
    if(!p.dead||p.downT==null) continue;
    const helper=players.find(o=>o!==p&&!o.dead&&o.ctl.act&&Math.hypot(o.x-p.x,o.z-p.z)<REVIVE_DIST);
    if(helper){ p.revT+=dt; if(p.revT>=REVIVE_TIME){ wakeUp(p,p.x,p.z,0.35); toast(nameOf(helper)+' hat '+nameOf(p)+' wiederbelebt.','#9be07f'); continue; } }
    else p.revT=Math.max(0,p.revT-dt*0.5);
    p.downT-=dt; if(p.downT<=0){ wakeUp(p,2,2,1); toast(nameOf(p)+' erwacht im Bau.','#f2b84b'); }
  }
}
function wakeUp(p,x,z,hpF){
  p.dead=false; p.downT=null; p.revT=0; p.x=x; p.z=z; p.tree=null; p.safe=false; p.upNow=0; p.dropY=0;
  p.hp=maxHp(p.L)*hpF; p.st=maxSt(p.L)*0.5; p.combatT=3; p.g.rotation.z=0; hEl(p,'hurt').style.opacity='0'; if(p===P){ $('crossMsg').style.opacity='0'; P.lastS=null; }
  snd.click();
}
// Wenn Spieler 1 nach dem Ende aller Spieler neu erwacht, wachen die Mitspieler neben ihm auf
on('respawn',()=>{ for(const p of players) if(p!==P){ const ang=P.rot+Math.PI/2*(p.num%2?1:-1); wakeUp(p,P.x+Math.sin(ang)*2.5,P.z+Math.cos(ang)*2.5,1); } });
/** Stehen außer p noch andere Spieler? */
const othersAlive=p=>players.some(o=>o!==p&&!o.dead);
const nameOf=p=>p===P?NAMES[0]:NAMES[(p.num||2)-1];

/* ---------- Anzeige je Mitspieler: vollständige Kopie der Anzeige von Spieler 1 ---------- */
/** @returns {HTMLElement} */
const q=(el,sel)=>el.querySelector(sel);
let hudTick=0;
/** Übernimmt alle Stilregeln, die Elemente über ihre id ansprechen, auch für Kopien mit der Klasse <prefix><id>. */
const cssDone={};
function cloneIdCss(ids,prefix){
  if(cssDone[prefix]) return; cssDone[prefix]=true;
  const re=new RegExp('#('+ids.join('|')+')(?![\\w-])','g'), out=[];
  const walk=(rules,media)=>{ for(const r of Array.from(rules)){
    const sel=/** @type {any} */(r).selectorText, rr=/** @type {any} */(r);
    if(sel&&sel.match(re)){ out.push((media?'@media '+media+'{':'')+sel.replace(re,'.'+prefix+'$1')+'{'+rr.style.cssText+'}'+(media?'}':'')); }
    else if(rr.media&&rr.cssRules) walk(rr.cssRules,rr.media.mediaText); } };
  for(const sh of Array.from(document.styleSheets||[])){ try{ walk(sh.cssRules,null); }catch(e){} }
  const st=document.createElement('style'); st.textContent=out.join('\n'); document.head.appendChild(st);
}
/** Kopie eines Elements, bei der jede id zur Klasse <prefix><id> wird (für mehrere gleiche Fenster/Anzeigen) */
function cloneWithClasses(src,prefix){
  cloneIdCss([src.id,...Array.from(src.querySelectorAll('[id]')).map(e=>e.id)].filter(Boolean),prefix);
  const el=/** @type {HTMLElement} */(src.cloneNode(true)); if(el.id){ el.classList.add(prefix+el.id); el.removeAttribute('id'); }
  el.querySelectorAll('[id]').forEach(e=>{ e.classList.add(prefix+e.id); e.removeAttribute('id'); });
  return el;
}
/** Baut die Anzeige eines Mitspielers als Kopie von #ph0: ids werden zu Klassen h-<id>. */
function makeHud(p){
  const el=cloneWithClasses($('ph0'),'h-'); el.classList.remove('h-ph0');
  el.querySelectorAll('.skp,.mk,.float').forEach(e=>e.remove());   // nur die Anzeige selbst, nicht Fenster und Markierungen von Spieler 1
  q(el,'.h-menuBtn').style.display='none'; q(el,'.h-famArrow').style.display='none';   // Mitspieler: Start öffnet die Pause
  q(el,'.h-cds').style.display=''; el.querySelectorAll('.h-cds .kh').forEach((k,i)=>{ k.textContent=['RT','LB','Ⓨ'][i]; });
  q(el,'.h-toast').style.opacity='0'; q(el,'.h-hurt').style.opacity='0'; q(el,'.h-crossMsg').style.opacity='0';
  q(el,'.h-hudTog').onclick=null;
  el.insertAdjacentHTML('beforeend','<div class="pvDown"><b>Am Boden</b><span></span><div class="pvBar"><i class="rev"></i></div></div>');
  document.body.appendChild(el); p.hc={};
  return el;
}
/** Element id der Anzeige von Spieler p (Spieler 1: die Originale, Mitspieler: ihre Kopie). */
function hEl(p,id){ if(p===P||!p.hud) return $(id); const c=p.hc||(p.hc={}); return c[id]||(c[id]=q(p.hud,'.h-'+id)); }
/** Hinweis an Spieler p in der Mitte seines Ausschnitts. Spieler 1: die übliche Meldung (nur bei ihm). */
function tell(p,txt,col){ if(p===P||!p.hud){ toast(txt,col,true); return; } mateToast(p,txt.replace('(Tab)','(Back)'),col); }
function mateToast(p,txt,col){ const el=hEl(p,'toast'); el.textContent=txt; el.style.color=col||'#fff'; el.style.opacity='1'; p.toastT=Math.max(3,Math.min(10,1.2+txt.length/14)); }
// Allgemeine Meldungen (Wetter, Familie, Überfälle …) erscheinen in jedem Ausschnitt
on('toast',(t,c)=>{ for(const p of players) if(p!==P&&p.hud) mateToast(p,t,c); });
/** Anzeige der Mitspieler auffrischen: dieselbe Anzeige wie bei Spieler 1, mit ihren eigenen Werten. */
function updateCoopHud(dt){
  hudTick++;
  for(const v of players) updateMarks(v,dt);
  for(const p of players){
    if(!p.hud) continue; const h=p.hud;
    if((hudTick+(p.num||0))%6===0) updateUI(p);
    updateCross(p); updateWarn(dt,p);
    if((hudTick+(p.num||0))%2===0){ const cv=/** @type {HTMLCanvasElement} */(hEl(p,'rc')); drawRadar(p,cv,cv.getContext('2d')); }
    const dn=q(h,'.pvDown'); dn.style.display=p.dead?'flex':'none';
    if(p.dead){ q(dn,'span').textContent='Ein Mitspieler hält X neben dir – oder du erwachst in '+Math.ceil(p.downT||0)+' s im Bau.'; q(dn,'.rev').style.width=(p.revT/REVIVE_TIME*100)+'%'; }
    if(p.toastT>0){ p.toastT-=dt; if(p.toastT<=0) hEl(p,'toast').style.opacity='0'; }
    if(p.noStT>0){ p.noStT-=dt; if(p.noStT<=0) hEl(p,'crossMsg').style.opacity='0'; }
  }
  // Spieler 1 am Boden (nur im Koop): Hinweis in der großen Anzeige
  if(players.length>1&&P.dead&&P.downT!=null){ const s=Math.ceil(P.downT); if(s!==P.lastS){ P.lastS=s; $('crossMsg').textContent='Am Boden – Mitspieler: X halten · Bau in '+s+' s'; $('crossMsg').style.opacity='1'; } }
  else if(P.lastS!=null){ P.lastS=null; $('crossMsg').style.opacity='0'; }   // wieder auf den Beinen (auch nach dem gemeinsamen Tod)
}

/* ---------- Mitspieler markieren ---------- */
/** Spieler p will die anderen sehen: für einige Sekunden Markierungen mit Name und Entfernung */
function pingMates(p){ if(players.length<2) return; p.pingT=6; snd.click(); }
const _mv=new THREE.Vector3();
/**
 * Markierungen in der Anzeige von Spieler v: über dem Kopf eines Mitspielers, wenn er im Bild ist, sonst Pfeil am Rand.
 * Gezeigt werden alle nach Q/Steuerkreuz links und immer die, die am Boden liegen.
 */
function updateMarks(v,dt){
  if(v.pingT>0) v.pingT-=dt;
  const frame=v===P?$('ph0'):v.hud; if(!frame) return;
  const pool=v.marks||(v.marks=[]); let n=0;
  if(players.length>1&&!v.dead) for(const q of players){
    if(q===v||!(v.pingT>0||(q.dead&&q.downT!=null))) continue;
    let el=pool[n]; if(!el){ el=document.createElement('div'); el.className='mk'; frame.appendChild(el); pool.push(el); } n++;
    const W=frame.clientWidth, Hh=frame.clientHeight, d=Math.round(Math.hypot(q.x-v.x,q.z-v.z)), col=PCOL[(q.num||1)-1];
    _mv.set(q.x,q.y+1.4*pScale(q.L)+0.6,q.z).project(v.camera);
    const label=(q.dead?'⚠ ':'')+nameOf(q)+' · '+d+' m';
    el.style.display='block'; el.style.color=col;
    if(_mv.z<1&&Math.abs(_mv.x)<0.95&&Math.abs(_mv.y)<0.95){   // im Bild: über dem Kopf
      el.className='mk'; el.innerHTML=esc(label)+'<br>▼';
      el.style.left=((_mv.x*0.5+0.5)*W)+'px'; el.style.top=((-_mv.y*0.5+0.5)*Hh)+'px'; el.style.transform='translate(-50%,-100%)';
    } else {   // außerhalb: Pfeil am Rand in seine Richtung
      const dx=q.x-v.x, dz=q.z-v.z, s=Math.sin(v.cam.yaw), c=Math.cos(v.cam.yaw), ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c)), R=Math.min(W,Hh)*0.36;
      el.className='mk edge'; el.innerHTML='<i style="border-bottom-color:'+col+';transform:rotate('+ang+'rad)"></i><span>'+esc(label)+'</span>';
      el.style.left=(W/2+Math.sin(ang)*R)+'px'; el.style.top=(Hh/2-Math.cos(ang)*R)+'px'; el.style.transform='translate(-50%,-50%)';
    }
  }
  for(let i=n;i<pool.length;i++) pool[i].style.display='none';
}
/** Hinweis zum Wiederbeleben für Spieler o (oder null): wen, wie weit, Fortschritt 0…1 */
function reviveHint(o){ const p=o.reviveNear; if(!p) return null; const d=Math.hypot(o.x-p.x,o.z-p.z); return {name:nameOf(p),close:d<REVIVE_DIST,progress:p.revT/REVIVE_TIME,left:Math.max(0,REVIVE_TIME-p.revT)}; }
export { resetMates, panelNav, cloneWithClasses, pingMates, updateMarks, reviveHint, hEl, mateToast, viewMin, tell, MAX_PLAYERS, joinPlayer, leavePlayer, renderAll, pollCoop, padTaken, downPlayer, updateCoop, updateCoopHud, othersAlive, nameOf };
