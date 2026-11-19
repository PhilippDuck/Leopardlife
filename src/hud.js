// LeopardLife – Anzeige: Entdeckungswarnung, Kamera, Fadenkreuz, Statusleisten, Ziel, Spürkarte.
import { dead, nearestTree } from './actions.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { esc } from './carcass.js';
import { SPECIES } from './data.js';
import { clockStr, dayF } from './daynight.js';
import { camera, windMulDir, windU } from './engine.js';
import { FOOD_MAX, context, cub, seekT } from './family.js';
import { padUI } from './gamepad.js';
import { renderGoals } from './goals.js';
import { tapLearned, touchUI } from './input.js';
import { canMate, fam, kidMode } from './kin.js';
import { hudExp, xb } from './menu.js';
import { P } from './player.js';
import { D, DIE_AT, S, baseSpeed, has, maxHp, maxSt, oldF, pScale, xpNeed } from './save.js';
import { G } from './state.js';
import { H, PONDS } from './terrain.js';
import { $ } from './util.js';
import { patches } from './vegetation.js';
import { W } from './weather.js';

const rc=$('rc').getContext('2d');   // Spürkarte
const waPool=[]; let beatT=0;
function updateWarn(dt){
  const ring=$('warnRing'), R=Math.min(window.innerWidth,window.innerHeight)*0.33, s=Math.sin(P.cam.yaw), c=Math.cos(P.cam.yaw);
  let n=0, top=null, topV=-1, maxSus=0;
  for(const a of animals){
    if(a.dead||!a.sp.fight) continue;
    const chase=a.state==='chase'||a.state==='lunge';
    let v; if(chase) v=2; else if(a.state==='wander'&&a.sus>0) v=a.sus; else if(a.state==='wander'&&a.near) v=0; else if(a.state==='scav'&&a.sp.hunt&&S.lvl<a.sp.hunt&&Math.hypot(a.x-P.x,a.z-P.z)<90) v=0.3; else if(a.state==='lurk'&&a.near) v=0; else continue;
    const dx=a.x-P.x, dz=a.z-P.z, d=Math.hypot(dx,dz); if(chase&&d>80) continue;
    const ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c));
    let el=waPool[n]; if(!el){ el=document.createElement('div'); el.className='wa'; ring.appendChild(el); waPool.push(el); } n++;
    el.style.display='block';
    el.style.borderBottomColor=chase?'#ff4a30':'hsl('+(48-34*v)+',92%,'+(60-6*v)+'%)';
    el.classList.toggle('ch',chase);
    el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale('+(chase?1.25:0.75+0.5*v)+')';
    const pr=v+(1-Math.min(d,100)/1000);
    if(pr>topV){ topV=pr; top=a; top._v=v; top._d=d; }
    if(!chase&&v>maxSus) maxSus=v;
  }
  for(let i=n;i<waPool.length;i++) waPool[i].style.display='none';
  const w=$('warn');
  if(top){
    const v=top._v, nm=top.sp.n, m=Math.round(top._d)+' m';
    w.style.display='block'; $('warnBar').style.display=(v>0&&v<2)?'block':'none';
    if(v>=2){ $('warnTxt').textContent='⚠ '+nm+' jagt dich! ('+m+')'; w.style.color='#ff6a50'; }
    else if(v>0){ $('warnTxt').textContent='⚠ '+nm+' wird misstrauisch – zieh dich zurück! ('+m+')'; w.style.color='#ffb04a'; $('bW').style.width=(v*100)+'%'; }
    else { $('warnTxt').textContent=nm+' in der Nähe – noch unbemerkt ('+m+')'; w.style.color='#f2d04b'; }
  } else w.style.display='none';
  beatT-=dt; if(maxSus>0&&beatT<=0){ beatT=0.95-0.6*maxSus; snd.beat(maxSus); }
}
/** Setzt die Kamera cam hinter Spieler p (Abstand, Neigung, Jagd-Ansicht, Wackeln). Beim Splitscreen hat jeder Spieler seine. */
function updateCamera(p,cam){
  p.cam.huntF+=(((p.sneak&&p.tree==null&&!dead&&!G.paused)?1:0)-p.cam.huntF)*0.06;
  const sc=pScale(), dist=(5+sc*6.5)*p.cam.zoom*(1-0.3*p.cam.huntF), ty=p.camY+sc*1.1+dist*0.16;
  const fov=60-8*p.cam.huntF; if(Math.abs(cam.fov-fov)>0.05){ cam.fov=fov; cam.updateProjectionMatrix(); }
  const cp=Math.cos(p.cam.pitch);
  let cx=p.x+Math.sin(p.cam.yaw)*dist*cp, cz=p.z+Math.cos(p.cam.yaw)*dist*cp, cy=ty+Math.sin(p.cam.pitch)*dist;
  cy=Math.max(cy,H(cx,cz)+0.6);
  if(p.cam.shake>0){ cx+=(Math.random()-0.5)*p.cam.shake; cy+=(Math.random()-0.5)*p.cam.shake; cz+=(Math.random()-0.5)*p.cam.shake; p.cam.shake=Math.max(0,p.cam.shake*0.86-0.005); }
  cam.position.set(cx,cy,cz); cam.lookAt(p.x,ty,p.z);
}
function updateCross(){
  // Fadenkreuz leuchtet, wenn ein Tier in Sprungrichtung und -reichweite ist
  const fx=-Math.sin(P.cam.yaw), fz=-Math.cos(P.cam.yaw), sc=pScale();
  const range=(19+3*S.b.jmp+baseSpeed()*0.5)*(0.38+0.04*S.b.jmp);
  let on=false;
  for(const a of animals){ if(a.dead||a.sp.friend||!a.g.visible) continue; const dx=a.x-P.x, dz=a.z-P.z, along=dx*fx+dz*fz;
    if(along<0||along>range+a.rad) continue; const side=Math.abs(dx*fz-dz*fx);
    if(side<a.rad+0.5+sc*0.8){ on=true; break; } }
  const low=P.st<15, cr=$('cross'), ring=$('stRing'), fr=Math.max(0,Math.min(1,P.st/maxSt()));
  cr.classList.toggle('on',on&&P.pcd<=0&&!low); cr.classList.toggle('no',low);
  $('stArc').style.strokeDashoffset=169.65*(1-fr);
  ring.classList.toggle('low',low);
  ring.style.opacity=low?1:Math.max(0,Math.min(1,(0.5-fr)/0.2))*0.9;
}
function updateUI(){
  $('lvl').textContent='Stufe '+S.lvl+(S.gen>1?' · Gen. '+S.gen:'');
  renderGoals();
  $('size').textContent=(W.rain>0.3?(W.storm?'⛈ ':'☔ '):dayF>0.5?'☀ ':'☾ ')+clockStr()+' · '+(S.lvl<4?'Jungtier':S.lvl<8?'Halbstark':oldF()>0?'Alt':S.lvl<12?'Ausgewachsen':'Alpha')+(S.lvl>=8?' · noch '+Math.max(1,Math.ceil((DIE_AT()-S.age)/60))+' min':'');
  $('bHu').style.width=S.hunger+'%'; $('bHu').classList.toggle('low',S.hunger<25); $('tHu').textContent=S.hunger<=0?'verhungert!':S.hunger<25?'hungrig':Math.round(S.hunger)+' %';
  const mh=maxHp(), ms=maxSt(), xn=xpNeed(S.lvl);
  $('bHp').style.width=Math.max(0,P.hp/mh*100)+'%'; $('tHp').textContent=Math.ceil(P.hp)+' / '+mh;
  $('bSt').style.width=Math.max(0,P.st/ms*100)+'%'; $('tSt').textContent=Math.floor(P.st)+' / '+ms;
  $('bXp').style.width=(S.xp/xn*100)+'%'; $('tXp').textContent=S.xp+' / '+xn;
  const stEl=$('status');
  const nt=(S.b.climb>0&&P.tree==null)?nearestTree():-1;
  const sm=(touchUI()||padUI()||window.innerWidth<=820||window.innerHeight<=520)&&!hudExp;
  const setSt=(long,short,col)=>{ stEl.textContent='● '+(sm?short:long); stEl.style.color=col; };
  const ctx=context();
  if(ctx) setSt('F: '+ctx.label,ctx.label+' möglich','#ff9ad0');
  else if(P.tree!=null){ if(P.safe) setSt('Sicher auf dem Baum – E: runter · Leertaste: Sprung von oben','Sicher auf dem Baum','var(--green)'); else setSt('Klettert …','Klettert …','var(--green)'); }
  else if(nt>=0) setSt('Baum in Reichweite – E zum Klettern','Baum: klettern','var(--green)');
  else if(P.grass&&(P.sneak||S.lvl<4)) setSt(P.sneak?'Versteckt im hohen Gras':'Versteckt im hohen Gras – als Jungtier auch ohne Schleichen','Versteckt','var(--green)');
  else if(P.grass) setSt('Im Gras – schleiche (C), um dich zu verstecken','Im Gras – schleichen!','var(--mut)');
  else if(P.sneak) setSt('Schleicht','Schleicht','var(--gold)');
  else setSt('Sichtbar','Sichtbar','var(--mut)');
  // Familie
  const cb=$('cubBox'), cu=S.cub;
  const kid=kidMode();
  if(cu||S.preg>0||(canMate()&&seekT<15)||kid){
    cb.style.display='block'; $('cubBars').style.display=cu&&cu.grow<1?'block':'none'; let msg='';
    if(cu&&cu.grow<1){
      $('cubT').textContent='Junges · satt '+Math.round(cu.full)+' % · groß '+Math.round(cu.grow*100)+' %'; $('foodT').textContent='Futter '+S.food+'/'+FOOD_MAX;
      $('bCf').style.width=cu.full+'%'; $('bCg').style.width=(cu.grow*100)+'%';
      msg=G.raider?(G.raider.found?'⚠ Dein Junges wird angegriffen!':'⚠ Räuber sucht dein Junges!'):cu.hp<1?'Leben des Jungen: '+Math.max(0,Math.round(cu.hp*100))+' %':cu.full<25?'Dein Junges hat Hunger':'';
    } else if(cu){ $('cubT').textContent='Nachwuchs ausgewachsen'; $('foodT').textContent='dein Erbe'; }
    else if(S.preg>0){ $('cubT').textContent='Junges kommt bald im Bau zur Welt'; $('foodT').textContent=''; }
    else if(canMate()){ $('cubT').textContent=S.partner?'Dein Partner wartet':'Partner suchen'; $('foodT').textContent='rosa Punkt auf der Spürkarte'; }
    else { $('cubT').textContent='Eltern: '+((S.p1?1:0)+(S.p2?1:0)); $('foodT').textContent='bringen Futter'; }
    $('cubMsg').textContent=msg;
  } else cb.style.display='none';
  if(touchUI()){ const fb=$('tbF'); fb.style.display=ctx?'block':'none'; if(ctx) fb.textContent=ctx.label; }
  const ch=$('ctxHint'); ch.style.display=ctx?'block':'none'; if(ctx) ch.innerHTML=padUI()?xb('Ⓧ')+' – '+esc(ctx.label):touchUI()?'Rosa Knopf: '+esc(ctx.label):'F – '+esc(ctx.label);
  $('tapHelp').style.display=(touchUI()&&G.started&&!G.paused&&tapLearned<2)?'block':'none';
  const pe=$('pts'); if(S.pts>0){ pe.style.display='block'; pe.textContent=S.pts+' Punkt'+(S.pts===1?'':'e')+(sm?' ▸':' zu vergeben – Tab'); } else pe.style.display='none';
  $('cdP').style.width=(1-P.pcd/1.3)*100+'%';
  $('cdRbox').style.opacity=S.b.roar?1:0.35; $('cdR').style.width=S.b.roar?(1-P.rcd/(22-3*S.b.roar))*100+'%':'0%';
  $('cdEbox').style.opacity=S.b.climb?1:0.35; $('cdE').style.width=(P.tree!=null?P.climbT*100:nt>=0?100:0)+'%';
  if(touchUI()){ $('tbE').style.opacity=S.b.climb?1:0.35; $('tbE').classList.toggle('on',P.tree!=null); $('tbC').classList.toggle('on',P.sneak); $('tbR').style.opacity=S.b.roar?1:0.35; }
  // Ziel
  let best=null, bd=28;
  if(G.lastHitT>0&&G.lastHit&&!G.lastHit.dead) best=G.lastHit;
  else for(const a of animals){ if(a.dead||!a.g.visible) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; best=a; } }
  const te=$('target');
  if(best){ te.style.display='block'; $('tName').textContent=(best.fur&&best.fur.albino?'Albino-':'')+best.sp.n; $('bT').style.width=Math.max(0,best.hp/best.sp.hp*100)+'%';
    const tg=$('tTag'); const hostile=best.sp.hunt&&S.lvl<best.sp.hunt;
    if(best.sp.friend){ const fi=fam.indexOf(best); tg.textContent=fi===0?'· dein Partner':fi<3?'· dein Elterntier':'· Artgenosse'; tg.style.color='#ff9ad0'; }
    else if(hostile){ tg.textContent='· Gefahr – jagt dich!'; tg.style.color='var(--red)'; }
    else if(best.sp.fight){ tg.textContent='· wehrt sich'; tg.style.color='var(--gold)'; }
    else { tg.textContent='· Beute'; tg.style.color='var(--green)'; }
  } else te.style.display='none';
}
/* Spürkarte: Gras, Wasser und Bau sind einmal in ein großes Hintergrundbild gezeichnet; pro Bild wird nur noch dieses
   verschoben und gedreht und die Tiere in vier Farbgruppen darübergelegt. Wird jedes Bild neu gezeichnet statt 10-mal pro Sekunde. */
const radarBg=document.createElement('canvas'), RB=2, RW=256;   // 2 Pixel pro Meter, Welt von -256 bis 256
radarBg.width=radarBg.height=RW*2*RB;
(function(){ const c=radarBg.getContext('2d'); c.scale(RB,RB); c.translate(RW,RW);
  c.fillStyle='rgba(120,190,90,.35)'; c.beginPath(); for(const p of patches){ c.moveTo(p.x+p.r,p.z); c.arc(p.x,p.z,p.r,0,6.283); } c.fill();
  c.fillStyle='rgba(90,160,200,.55)'; c.beginPath(); for(const p of PONDS){ c.moveTo(p.x+p.r,p.z); c.arc(p.x,p.z,p.r,0,6.283); } c.fill();
  c.fillStyle='#ddd'; c.fillRect(-5,-5,10,10);
})();
let radarPx=0; const RADAR_COL=['#ff7ab8','#ff5a3c','#f2b84b','#9be07f'];
function drawRadar(){
  const cv=$('rc'), css=cv.clientWidth||140, want=Math.round(css*Math.min(window.devicePixelRatio||1,2));
  if(want>0&&want!==radarPx){ radarPx=want; cv.width=cv.height=want; }
  const W=cv.width||280, R=45+22*S.b.nose+(has('nase')?25:0), k=W/2/R, sc=W/280;
  rc.setTransform(1,0,0,1,0,0); rc.clearRect(0,0,W,W); rc.fillStyle='rgba(30,50,25,.55)'; rc.fillRect(0,0,W,W);
  rc.save(); rc.translate(W/2,W/2); rc.rotate(P.cam.yaw);
  rc.save(); rc.scale(k/RB,k/RB); rc.drawImage(radarBg,-(P.x+RW)*RB,-(P.z+RW)*RB); rc.restore();
  if(S.cub){ const dx=cub.x-P.x, dz=cub.z-P.z; if(dx*dx+dz*dz<R*R){ rc.fillStyle='#ff7ab8'; rc.fillRect(dx*k-6*sc,dz*k-6*sc,12*sc,12*sc); } }
  for(let g=0;g<4;g++){
    rc.fillStyle=RADAR_COL[g]; rc.beginPath(); let any=false;
    for(let i=0;i<animals.length;i++){ const a=animals[i]; if(a.dead||(a.sp.friend&&!a.g.visible)) continue; if(a.state==='lurk'&&Math.abs(a.x-P.x)+Math.abs(a.z-P.z)>18) continue;
      const hostile=a.sp.hunt&&S.lvl<a.sp.hunt, grp=a.sp.friend?0:hostile?1:a.sp.fight?2:3; if(grp!==g) continue;
      const dx=a.x-P.x, dz=a.z-P.z; if(dx*dx+dz*dz>R*R) continue;
      const r=Math.max(4,a.sp.size*6)*sc; rc.moveTo(dx*k+r,dz*k); rc.arc(dx*k,dz*k,r,0,6.283); any=true; }
    if(any) rc.fill();
  }
  rc.fillStyle='#b07040'; for(const a of animals){ if(!a.carc) continue; const dx=a.x-P.x, dz=a.z-P.z; if(dx*dx+dz*dz<R*R) rc.fillRect(dx*k-4*sc,dz*k-4*sc,8*sc,8*sc); }
  rc.restore();
  // Wahrnehmungskreis: ab hier bemerken dich Raubtiere (rot) bzw. Beute (grün); schrumpft beim Schleichen und im Gras
  let sense=0; for(const sp of SPECIES){ if(sp.hunt&&S.lvl<sp.hunt&&sp.sense>sense) sense=sp.sense; }
  const danger=sense>0; if(!danger) sense=24;
  const base=sense*P.hidden*D().sense;
  rc.save(); rc.translate(W/2,W/2); rc.rotate(P.cam.yaw);
  if(base*k>3){ rc.strokeStyle=danger?'rgba(255,110,80,.9)':'rgba(155,224,127,.9)'; rc.lineWidth=3*sc; rc.setLineDash([9*sc,7*sc]); rc.beginPath();
    for(let i=0;i<=48;i++){ const t=i/48*6.283, ux=Math.cos(t), uz=Math.sin(t), r=Math.min(base*windMulDir(ux,uz),R)*k; if(i) rc.lineTo(ux*r,uz*r); else rc.moveTo(ux*r,uz*r); }
    rc.stroke(); rc.setLineDash([]); }
  // Windpfeil am Rand: zeigt, wohin der Wind weht
  { const wx=windU.value.x, wz=windU.value.y, rr=W*0.4, bx=-wx*rr, bz=-wz*rr, px=-wz, pz=wx, L=14*sc;
    rc.fillStyle='rgba(150,205,255,.95)'; rc.beginPath(); rc.moveTo(bx+wx*L,bz+wz*L); rc.lineTo(bx+px*L*0.55,bz+pz*L*0.55); rc.lineTo(bx-px*L*0.55,bz-pz*L*0.55); rc.fill(); }
  rc.restore();
  rc.fillStyle='#fff'; rc.beginPath(); rc.moveTo(W/2,W/2-11*sc); rc.lineTo(W/2+7*sc,W/2+8*sc); rc.lineTo(W/2-7*sc,W/2+8*sc); rc.fill();
}

export { drawRadar, updateCamera, updateCross, updateUI, updateWarn };
