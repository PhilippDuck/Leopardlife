// LeopardLife – Startbildschirm in 3D: Die Kamera schwebt langsam um den eigenen Leoparden (groß im Bild, rechts),
// er atmet, schaut sich um und wedelt mit dem Schwanz. Musik läuft, sobald der Browser Ton erlaubt (erster Klick/Tipp/Taste).
// Weitere Controller können hier schon mit Start einsteigen – ihre Leoparden stellen sich daneben.
import { AC, initAudio, musicSoon } from './audio.js';
import { renderer } from './engine.js';
import { players, P } from './player.js';
import { S } from './save.js';
import { G } from './state.js';
import { H, PONDS } from './terrain.js';
import { $ } from './util.js';
import { furName } from './models.js';
import { inGrass, tallMat, trees } from './vegetation.js';
import { CUB_HOME } from './family.js';

/** Läuft gerade der Startbildschirm? */
const titleOn=()=>!G.started&&$('start').style.display!=='none';
let titleT=0, titleWas=false;
const _tSz=new THREE.Vector2();
/** Jedes Bild, solange der Startbildschirm offen ist: Leoparden in Pose, Kamera im langsamen Bogen */
function updateTitle(dt){
  const on=titleOn();
  if(on!==titleWas){ titleWas=on; document.body.classList.toggle('title',on); if(on){ renderPlayers(); toStage(); } }
  if(!on) return;
  titleT+=dt;
  // Leoparden in einer Reihe neben Spieler 1, alle mit Blick zur Kamera hin
  const face=P.rot, rx=Math.cos(face), rz=-Math.sin(face);   // rechts von seiner Blickrichtung
  players.forEach((p,i)=>{
    if(i>0){ const k=(i%2?-1:1)*Math.ceil(i/2)*2.1; p.x=P.x+rx*k-Math.sin(face)*0.6*Math.ceil(i/2); p.z=P.z+rz*k-Math.cos(face)*0.6*Math.ceil(i/2); p.rot=face; }
    const g=p.g, y=H(p.x,p.z), ph=titleT*1.3+i*1.7;
    g.position.set(p.x,y+Math.sin(ph)*0.012,p.z);
    g.rotation.y=p.rot+Math.sin(titleT*0.23+i)*0.18;   // dreht sich ganz leicht hin und her
    const u=g.userData; if(u){ if(u.tail) u.tail.rotation.y=Math.sin(titleT*1.6+i)*0.45; if(u.head){ u.head.rotation.y=Math.sin(titleT*0.37+i*2)*0.5; u.head.rotation.x=Math.sin(titleT*0.29+i)*0.12; }
      if(u.legs) u.legs.forEach(l=>{ l.rotation.x=0; }); if(u.inner) u.inner.scale.y=1+Math.sin(ph)*0.015; }
  });
  // Kamera: vor dem Leoparden, im langsamen Bogen; der Leopard steht rechts der Bildmitte
  const n=players.length, sc=P.g.scale.x, r=1.6+3.4*sc+1.8*(n-1), ang=face+0.5+Math.sin(titleT*0.08)*0.4, y0=H(P.x,P.z);
  const cx=P.x+Math.sin(ang)*r, cz=P.z+Math.cos(ang)*r, cy=y0+0.45+0.9*sc+0.25*(n-1)+Math.sin(titleT*0.11)*0.12;
  const off=document.body.clientWidth>700?0.3:0;   // breit: Leopard rechts der Bildmitte (links steht die Karte)
  const lx=P.x-Math.cos(ang)*r*off, lz=P.z+Math.sin(ang)*r*off;
  renderer.getSize(_tSz); const asp=_tSz.x/_tSz.y; if(Math.abs(P.camera.aspect-asp)>1e-3){ P.camera.aspect=asp; P.camera.updateProjectionMatrix(); }
  if(P.camera.fov!==42){ P.camera.fov=42; P.camera.updateProjectionMatrix(); }
  P.camera.position.set(cx,Math.max(cy,H(cx,cz)+0.4),cz); P.camera.lookAt(lx,y0+0.75*sc,lz);
}
/* Bühne: eine freie Stelle in der Nähe (kein hohes Gras, keine Bäume, kein Wasser, nicht am Bau), damit der Leopard gut zu sehen ist.
   Beim Spielstart kehrt Spieler 1 an seinen Platz zurück. */
let home=null;
function freeSpot(x,z){
  if(inGrass(x,z)) return false;
  for(const t of trees) if(Math.abs(t.x-x)<9&&Math.abs(t.z-z)<9&&Math.hypot(t.x-x,t.z-z)<7) return false;
  for(const q of PONDS) if(Math.hypot(q.x-x,q.z-z)<q.r+4) return false;
  if(Math.hypot(CUB_HOME.x-x,CUB_HOME.z-z)<14) return false;
  const h=H(x,z); return Math.abs(H(x+3,z)-h)<0.6&&Math.abs(H(x,z+3)-h)<0.6&&Math.abs(H(x-3,z)-h)<0.6&&Math.abs(H(x,z-3)-h)<0.6;
}
function toStage(){
  if(!home) home={x:P.x,z:P.z,rot:P.rot};
  for(let r=0;r<160;r+=6){ for(let k=0;k<16;k++){ const a=k/16*6.283+r*0.13, x=home.x+Math.cos(a)*r, z=home.z+Math.sin(a)*r;
    // vor dem Leoparden (Richtung Kamera) muss auch frei sein
    if(freeSpot(x,z)&&freeSpot(x+Math.sin(home.rot)*5,z+Math.cos(home.rot)*5)){ P.x=x; P.z=z; P.rot=home.rot; return; } } }
}
/** Liste der Spieler auf dem Startbildschirm */
function renderPlayers(){
  const el=$('startPlayers'); if(!el) return;
  el.innerHTML=players.map((p,i)=>'<span class="sp"><b>Spieler '+(i+1)+'</b> · '+furName(p.L.fur||p.fur)+'</span>').join('')
    +(players.length<4?'<span class="sp add">＋ Weiterer Controller: <b>Start</b> drücken</span>':'');
}
/** Ton erst nach einer Berührung erlaubt: dann sofort Musik */
function unlock(){ initAudio(); if(AC&&AC.state==='suspended') AC.resume(); if(titleOn()) musicSoon(); $('soundHint').style.display='none'; }
['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,unlock,{once:true,capture:true}));
/** nach dem Start wieder die Spielkamera */
function leaveTitle(){ if(home){ P.x=home.x; P.z=home.z; P.rot=home.rot; players.forEach((p,i)=>{ if(i>0){ p.x=P.x+Math.sin(P.rot+Math.PI/2*(i%2?1:-1))*2.5; p.z=P.z+Math.cos(P.rot+Math.PI/2*(i%2?1:-1))*2.5; } }); home=null; }
  if(P.camera.fov!==60){ P.camera.fov=60; P.camera.updateProjectionMatrix(); } }

export { leaveTitle, renderPlayers, titleOn, updateTitle };
