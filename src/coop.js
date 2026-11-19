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
import { S, copyLeopard, maxHp, maxSt, pScale, save } from './save.js';
import { sky, stars } from './sky.js';
import { G } from './state.js';
import { H, cullTiles } from './terrain.js';
import { toast } from './ui.js';
import { $ } from './util.js';
import { tallMat } from './vegetation.js';
import { toggleSkills } from './skills.js';
import { ensureKin, mateContext, newId } from './kinship.js';
import { drawRadar, warnArrows } from './hud.js';

/** Höchstens so viele Spieler teilen sich den Bildschirm */
const MAX_PLAYERS=4;
/** Sekunden am Boden, bevor ein Spieler von selbst im Bau erwacht, und Haltezeit fürs Wiederbeleben */
const DOWN_TIME=20, REVIVE_TIME=3, REVIVE_DIST=3;
const NAMES=['Spieler 1','Spieler 2','Spieler 3','Spieler 4'];
const COLORS=['#f2b84b','#7fc8f2','#9be07f','#e88fd0'];
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
  let L=S.mates[num]; if(!L){ L=copyLeopard(S); L.fur=FURS[num-1]; L.hunger=100; L.age=0; L.kills=0; L.gen=S.gen||1; S.mates[num]=L; }
  // Wer neu einsteigt, ist ein fremder Leopard (nicht verwandt) – erst eure Jungen sind miteinander verwandt
  if(!L.id||L.id===S.id){ L.id=newId(); L.parents=[]; } ensureKin(L); save();
  const p=makePlayer({source:'pad'+i,camera:cam,x:P.x+Math.sin(ang)*r,z:P.z+Math.cos(ang)*r,fur:L.fur||FURS[num-1],L});
  p.pad=i; p.num=num; p.padPrev=gp?gp.buttons.map(b=>!!b.pressed):[];   // der Start-Druck zum Einsteigen zählt nicht als Pause p.rot=P.rot; p.cam.yaw=P.cam.yaw; p.cam.pitch=P.cam.pitch;
  p.hud=makeHud(p);
  players.push(p); layoutChanged();
  toast(NAMES[num-1]+' ist dabei! Back: Entwicklung · Back halten: aussteigen · Start: Pause','#9be07f'); snd.click();
  return p;
}
/** Spieler p steigt aus (Back zweimal oder Controller getrennt). */
function leavePlayer(p){
  if(p===P) return;
  const i=players.indexOf(p); if(i<0) return;
  players.splice(i,1); dropModel(p.g); if(p.hud) p.hud.remove();
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
  document.body.classList.toggle('split',split);
  const r=R[0], st=document.body.style;
  st.setProperty('--cx',((r[0]+r[2]/2)*100)+'%'); st.setProperty('--cy',((r[1]+r[3]/2)*100)+'%');
  st.setProperty('--vw',(r[2]*100)+'%');
  // große Spürkarte von Spieler 1: oben rechts in seinem Ausschnitt
  st.setProperty('--rr',((1-r[0]-r[2])*100)+'%'); st.setProperty('--rt',(r[1]*100)+'%');
  players.forEach((p,i)=>{ if(!p.hud) return; const q=R[i]; Object.assign(p.hud.style,{left:q[0]*100+'%',top:q[1]*100+'%',width:q[2]*100+'%',height:q[3]*100+'%'}); });
  const empty=$('splitEmpty'); if(empty){ empty.style.display=n===3?'flex':'none'; }
  if(!split){ renderer.setScissorTest(false); resize(); }
}
const _sz=new THREE.Vector2();
/** Zeichnet das Bild: bei einem Spieler wie gewohnt, sonst ein Ausschnitt je Spieler mit eigener Kamera. */
function renderAll(){
  if(players.length===1){ cullTiles(P.camera); renderer.render(scene,P.camera); return; }
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
    viewSetup(p,cam); cullTiles(cam); renderer.render(scene,cam);
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
    if(!gp||!gp.connected){ c.fw=c.rt=0; c.sprint=false; c.act=false; continue; }
    const prev=p.padPrev||(p.padPrev=[]), B=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed), hit=i=>B(i)&&!prev[i];
    if(G.paused||!G.started||p.dead){ c.fw=c.rt=0; c.sprint=false; c.act=B(2); }
    else {
      let fw=-pdz(gp.axes[1]||0), rt=pdz(gp.axes[0]||0); const l=Math.hypot(fw,rt); if(l>1){ fw/=l; rt/=l; }
      c.fw=fw; c.rt=rt; c.sprint=B(10)||!!(gp.buttons[7]&&gp.buttons[7].value>0.3); c.act=B(2);
      p.cam.yaw-=pdz(gp.axes[2]||0)*dt*2.8; p.cam.pitch=Math.max(0.08,Math.min(1.25,p.cam.pitch+pdz(gp.axes[3]||0)*dt*1.8));
      if(hit(0)) doPounce(p);
      if(hit(1)) p.sneak=!p.sneak;
      if(hit(3)) doClimb(p);
      if(hit(4)) doRoar(p);
      if(hit(2)) mateContext(p);   // X antippen: paaren, Junges füttern (X halten: wiederbeleben)
      if(hit(11)) p.cam.yaw=p.rot+Math.PI;
      if(hit(12)) p.cam.zoom=Math.max(0.45,p.cam.zoom/1.15);
      if(hit(13)) p.cam.zoom=Math.min(2.6,p.cam.zoom*1.15);
    }
    if(hit(9)&&G.started&&!$('dead').style.display.includes('flex')){ toggleMenu(); if(menuOpen()) claimOverlay(p.pad,gp); }
    // Back kurz: eigene Entwicklung · Back halten: aussteigen
    // Haltezeit in echter Zeit (dt ist pro Bild gedeckelt und liefe bei wenigen Bildern pro Sekunde zu langsam)
    if(B(8)){ const now=performance.now(); if(!prev[8]) p.leaveAt=now; p.leaveT=(now-p.leaveAt)/1000; if(p.leaveT>=1.5){ leavePlayer(p); continue; } if(p.leaveT>0.35) hudMsg(p,'Halten zum Aussteigen …',0.3); }
    else { if(prev[8]&&(p.leaveT||0)<0.35&&G.started&&!G.paused){ toggleSkills(p); if(G.ovPad===p.pad) claimOverlay(p.pad,gp); } p.leaveT=0; }
    for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i);
  }
}
const topOverlayOpen=()=>['skills','menu','settings','regions','book'].some(id=>$(id)&&$(id).style.display==='flex');
/** Ist Controller i schon einem Mitspieler zugeordnet? */
const padTaken=i=>players.some(p=>p!==P&&p.pad===i);

/* ---------- Am Boden und Wiederbeleben ---------- */
/** Spieler p geht zu Boden, solange noch ein anderer steht. Mitspieler können ihn wiederbeleben. */
function downPlayer(p,a){
  p.dead=true; p.hp=0; p.pounce=0; p.downT=DOWN_TIME; p.revT=0; p.sneak=false;
  p.g.rotation.z=Math.PI/2; p.g.position.y=p.y+0.25*pScale(p.L);
  snd.death(); if(p===P) $('hurt').style.opacity=0.55;
  toast(nameOf(p)+' ist am Boden! Daneben X (bzw. F) halten zum Wiederbeleben.','#ff8a70');
}
/** Pro Bild: Wiederbeleben durch einen Mitspieler in der Nähe, sonst nach Ablauf im Bau erwachen. */
function updateCoop(dt){
  if(players.length<2) return;
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
  p.hp=maxHp(p.L)*hpF; p.st=maxSt(p.L)*0.5; p.combatT=3; p.g.rotation.z=0; if(p===P){ $('hurt').style.opacity=0; $('crossMsg').style.opacity='0'; P.lastS=null; }
  snd.click();
}
// Wenn Spieler 1 nach dem Ende aller Spieler neu erwacht, wachen die Mitspieler neben ihm auf
on('respawn',()=>{ for(const p of players) if(p!==P){ const ang=P.rot+Math.PI/2*(p.num%2?1:-1); wakeUp(p,P.x+Math.sin(ang)*2.5,P.z+Math.cos(ang)*2.5,1); } });
/** Stehen außer p noch andere Spieler? */
const othersAlive=p=>players.some(o=>o!==p&&!o.dead);
const nameOf=p=>p===P?NAMES[0]:NAMES[(p.num||2)-1];

/* ---------- Kleine Anzeige je Mitspieler ---------- */
/** @returns {HTMLElement} */
const q=(el,sel)=>el.querySelector(sel);
let hudTick=0;
function makeHud(p){
  const el=document.createElement('div'); el.className='pv';
  el.innerHTML='<div class="pvName" style="color:'+COLORS[p.num-1]+'">'+NAMES[p.num-1]+'</div>'+
    '<div class="pvBar"><i class="hp"></i></div><div class="pvBar"><i class="st"></i></div>'+
    '<canvas class="pvRadar" width="200" height="200"></canvas><div class="pvRing"></div><div class="pvWarn"></div>'+
    '<div class="pvCross"></div><div class="pvMsg"></div><div class="pvDown"><b>Am Boden</b><span></span><div class="pvBar"><i class="rev"></i></div></div>';
  document.body.appendChild(el); return el;
}
/** Hinweis an Spieler p: Spieler 1 bekommt die große Meldung, Mitspieler eine in ihrem Ausschnitt. */
function tell(p,txt,col){ if(p===P||!p.hud){ toast(txt,col); return; } hudMsg(p,txt.replace('(Tab)','(Back)'),3.5); }
function hudMsg(p,txt,t){ if(!p.hud) return; const m=q(p.hud,'.pvMsg'); m.textContent=txt; m.style.opacity='1'; p.msgT=t; }
/** Anzeige der Mitspieler auffrischen (Leben, Ausdauer, Tarnung, am Boden). */
function updateCoopHud(dt){
  hudTick++;
  for(const p of players){
    if(!p.hud) continue; const h=p.hud;
    q(h,'.hp').style.width=Math.max(0,p.hp/maxHp(p.L)*100)+'%';
    q(h,'.st').style.width=Math.max(0,p.st/maxSt(p.L)*100)+'%';
    const cr=q(h,'.pvCross'); cr.style.borderColor=p.hideLv===2?'#8fe07a':p.hideLv===1?'#f2b84b':'#fff';
    const dn=q(h,'.pvDown'); dn.style.display=p.dead?'flex':'none';
    if(p.dead){ q(dn,'span').textContent='Ein Mitspieler hält X neben dir – oder du erwachst in '+Math.ceil(p.downT||0)+' s im Bau.'; q(dn,'.rev').style.width=(p.revT/REVIVE_TIME*100)+'%'; }
    // Warnpfeile und Warnzeile, kleine Spürkarte (jedes zweite Bild, abwechselnd je Spieler)
    const ring=q(h,'.pvRing'), wr=q(h,'.pvWarn'), {top}=warnArrows(p,ring,p.waPool||(p.waPool=[]),viewMin(p)*0.3);
    if(top&&!p.dead){ const v=top._v; wr.style.display='block'; wr.style.color=v>=2?'#ff6a50':v>0?'#ffb04a':'#f2d04b'; wr.textContent=(v>=2?'⚠ '+top.sp.n+' jagt dich!':v>0?'⚠ '+top.sp.n+' wird misstrauisch':top.sp.n+' in der Nähe')+' ('+Math.round(top._d)+' m)'; }
    else wr.style.display='none';
    if((hudTick+(p.num||0))%2===0){ const cv=/** @type {HTMLCanvasElement} */(q(h,'.pvRadar')); drawRadar(p,cv,cv.getContext('2d')); }
    if(p.msgT>0){ p.msgT-=dt; if(p.msgT<=0) q(h,'.pvMsg').style.opacity='0'; }
  }
  // Spieler 1 am Boden (nur im Koop): Hinweis in der großen Anzeige
  if(players.length>1&&P.dead&&P.downT!=null){ const s=Math.ceil(P.downT); if(s!==P.lastS){ P.lastS=s; $('crossMsg').textContent='Am Boden – Mitspieler: X halten · Bau in '+s+' s'; $('crossMsg').style.opacity='1'; } }
}

export { viewMin, tell, MAX_PLAYERS, joinPlayer, leavePlayer, renderAll, pollCoop, padTaken, downPlayer, updateCoop, updateCoopHud, othersAlive, nameOf };
