// LeopardLife – Anzeige: Entdeckungswarnung, Kamera, Fadenkreuz, Statusleisten, Ziel, Spürkarte.
import { nearestTree } from './actions.js';
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
import { P, players } from './player.js';
import { D, DIE_AT, S, baseSpeed, has, maxHp, maxSt, oldF, pScale, xpNeed } from './save.js';
import { G } from './state.js';
import { H, PONDS } from './terrain.js';
import { $ } from './util.js';
import { patches } from './vegetation.js';
import { W } from './weather.js';
import { hEl, nameOf, viewMin } from './coop.js';
import { mateContextInfo } from './kinship.js';

const rc=$('rc').getContext('2d');   // Spürkarte
const waPool=[]; let beatT=0;
/**
 * Warnpfeile rund ums Fadenkreuz von Spieler p: zeigen Raubtiere, die ihn bemerken oder jagen.
 * ring: Element in der Bildmitte des Spielers, pool: wiederverwendete Pfeile, R: Abstand der Pfeile in Pixeln.
 * @param {import('./player.js').Player} p
 * @returns {{top:any, maxSus:number}} das dringendste Tier und der höchste Verdacht
 */
/** Farben der Spieler 1–4 (wie Namen in der Anzeige) */
const PCOL=['#f2b84b','#7fc8f2','#9be07f','#e88fd0'];
/**
 * Warnpfeile rund ums Fadenkreuz von Spieler p: zeigen Raubtiere, die ihn bemerken oder jagen.
 * ring: Element in der Bildmitte des Spielers, pool: wiederverwendete Pfeile, R: Abstand der Pfeile in Pixeln.
 * @param {import('./player.js').Player} p
 * @returns {{top:any, maxSus:number}} das dringendste Tier und der höchste Verdacht
 */
function warnArrows(p,ring,pool,R){
  const s=Math.sin(p.cam.yaw), c=Math.cos(p.cam.yaw);
  let n=0, top=null, topV=-1, maxSus=0;
  if(!p.dead)
  for(const a of animals){
    if(a.dead||!a.sp.fight) continue;
    if(players.length>1&&a.tgt&&a.tgt!==p) continue;   // jedes Tier achtet auf einen Spieler (ai.js targetOf)
    const chase=a.state==='chase'||a.state==='lunge';
    let v; if(chase) v=2; else if(a.state==='wander'&&a.sus>0) v=a.sus; else if(a.state==='wander'&&a.near) v=0; else if(a.state==='scav'&&a.sp.hunt&&p.L.lvl<a.sp.hunt&&Math.hypot(a.x-p.x,a.z-p.z)<90) v=0.3; else if(a.state==='lurk'&&a.near) v=0; else continue;
    const dx=a.x-p.x, dz=a.z-p.z, d=Math.hypot(dx,dz); if(chase&&d>80) continue;
    const ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c));
    let el=pool[n]; if(!el){ el=document.createElement('div'); el.className='wa'; ring.appendChild(el); pool.push(el); } n++;
    el.style.display='block';
    el.style.borderBottomColor=chase?'#ff4a30':'hsl('+(48-34*v)+',92%,'+(60-6*v)+'%)';
    el.classList.toggle('ch',chase);
    el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale('+(chase?1.25:0.75+0.5*v)+')';
    const pr=v+(1-Math.min(d,100)/1000);
    if(pr>topV){ topV=pr; top=a; top._v=v; top._d=d; }
    if(!chase&&v>maxSus) maxSus=v;
  }
  for(let i=n;i<pool.length;i++) pool[i].style.display='none';
  return {top,maxSus};
}
/** Warnung für Spieler p: Pfeile, Hinweiszeile oben, Herzschlag (nur Spieler 1). @param {import('./player.js').Player} [p] */
function updateWarn(dt,p=P){
  const h=id=>hEl(p,id), me=p===P;
  const {top,maxSus}=warnArrows(p,h('warnRing'),me?waPool:(p.waPool||(p.waPool=[])),viewMin(p)*0.33);
  const w=h('warn');
  if(top){
    const v=top._v, nm=top.sp.n, m=Math.round(top._d)+' m';
    w.style.display='block'; h('warnBar').style.display=(v>0&&v<2)?'block':'none';
    if(v>=2){ h('warnTxt').textContent='⚠ '+nm+' jagt dich! ('+m+')'; w.style.color='#ff6a50'; }
    else if(v>0){ h('warnTxt').textContent='⚠ '+nm+' wird misstrauisch – zieh dich zurück! ('+m+')'; w.style.color='#ffb04a'; h('bW').style.width=(v*100)+'%'; }
    else { h('warnTxt').textContent=nm+' in der Nähe – noch unbemerkt ('+m+')'; w.style.color='#f2d04b'; }
  } else w.style.display='none';
  if(!me) return;
  beatT-=dt; if(maxSus>0&&beatT<=0){ beatT=0.95-0.6*maxSus; snd.beat(maxSus); }
}
/** Setzt die Kamera cam hinter Spieler p (Abstand, Neigung, Jagd-Ansicht, Wackeln). Beim Splitscreen hat jeder Spieler seine. */
/** @param {import('./player.js').Player} p */
function updateCamera(p,cam){
  p.cam.huntF+=(((p.sneak&&p.tree==null&&!p.dead&&!G.paused)?1:0)-p.cam.huntF)*0.06;
  const sc=pScale(p.L), dist=(5+sc*6.5)*p.cam.zoom*(1-0.3*p.cam.huntF), ty=p.camY+sc*1.1+dist*0.16;
  const fov=60-8*p.cam.huntF; if(Math.abs(cam.fov-fov)>0.05){ cam.fov=fov; cam.updateProjectionMatrix(); }
  const cp=Math.cos(p.cam.pitch);
  let cx=p.x+Math.sin(p.cam.yaw)*dist*cp, cz=p.z+Math.cos(p.cam.yaw)*dist*cp, cy=ty+Math.sin(p.cam.pitch)*dist;
  cy=Math.max(cy,H(cx,cz)+0.6);
  if(p.cam.shake>0){ cx+=(Math.random()-0.5)*p.cam.shake; cy+=(Math.random()-0.5)*p.cam.shake; cz+=(Math.random()-0.5)*p.cam.shake; p.cam.shake=Math.max(0,p.cam.shake*0.86-0.005); }
  cam.position.set(cx,cy,cz); cam.lookAt(p.x,ty,p.z);
}
/** Fadenkreuz und Ausdauerring von Spieler p @param {import('./player.js').Player} [p] */
function updateCross(p=P){
  const h=id=>hEl(p,id);
  // Fadenkreuz leuchtet, wenn ein Tier in Sprungrichtung und -reichweite ist
  const fx=-Math.sin(p.cam.yaw), fz=-Math.cos(p.cam.yaw), sc=pScale(p.L);
  const range=(19+3*p.L.b.jmp+baseSpeed(p.L)*0.5)*(0.38+0.04*p.L.b.jmp);
  let on=false;
  for(const a of animals){ if(a.dead||a.sp.friend||!a.g.visible) continue; const dx=a.x-p.x, dz=a.z-p.z, along=dx*fx+dz*fz;
    if(along<0||along>range+a.rad) continue; const side=Math.abs(dx*fz-dz*fx);
    if(side<a.rad+0.5+sc*0.8){ on=true; break; } }
  const low=p.st<15, cr=h('cross'), ring=h('stRing'), fr=Math.max(0,Math.min(1,p.st/maxSt(p.L)));
  cr.classList.toggle('on',on&&p.pcd<=0&&!low); cr.classList.toggle('no',low);
  h('stArc').style.strokeDashoffset=169.65*(1-fr);
  ring.classList.toggle('low',low);
  ring.style.opacity=low?1:Math.max(0,Math.min(1,(0.5-fr)/0.2))*0.9;
}
/**
 * Anzeige von Spieler p auffrischen: Stufe, Leisten, Status, Familie, Aufträge, Punkte, Fähigkeitenleiste, Ziel.
 * Mitspieler haben dieselbe Anzeige als Kopie (coop.js hEl).
 * @param {import('./player.js').Player} [p]
 */
function updateUI(p=P){
  const h=id=>hEl(p,id), me=p===P;
  h('lvl').textContent=(me?'':nameOf(p)+' · ')+'Stufe '+p.L.lvl+(S.gen>1?' · Gen. '+S.gen:'');
  if(me) renderGoals(); else h('goalBox').innerHTML=$('goalBox').innerHTML;
  h('size').textContent=(W.rain>0.3?(W.storm?'⛈ ':'☔ '):dayF>0.5?'☀ ':'☾ ')+clockStr()+' · '+(p.L.lvl<4?'Jungtier':p.L.lvl<8?'Halbstark':oldF(p.L)>0?'Alt':p.L.lvl<12?'Ausgewachsen':'Alpha')+(p.L.lvl>=8?' · noch '+Math.max(1,Math.ceil((DIE_AT(p.L)-p.L.age)/60))+' min':'');
  h('bHu').style.width=p.L.hunger+'%'; h('bHu').classList.toggle('low',p.L.hunger<25); h('tHu').textContent=p.L.hunger<=0?'verhungert!':p.L.hunger<25?'hungrig':Math.round(p.L.hunger)+' %';
  const mh=maxHp(p.L), ms=maxSt(p.L), xn=xpNeed(p.L.lvl);
  h('bHp').style.width=Math.max(0,p.hp/mh*100)+'%'; h('tHp').textContent=Math.ceil(p.hp)+' / '+mh;
  h('bSt').style.width=Math.max(0,p.st/ms*100)+'%'; h('tSt').textContent=Math.floor(p.st)+' / '+ms;
  h('bXp').style.width=(p.L.xp/xn*100)+'%'; h('tXp').textContent=p.L.xp+' / '+xn;
  const stEl=h('status');
  const nt=(p.L.b.climb>0&&p.tree==null)?nearestTree(p):-1;
  const sm=(!me||players.length>1||touchUI()||padUI()||window.innerWidth<=820||window.innerHeight<=520)&&!hudExp;
  const setSt=(long,short,col)=>{ stEl.textContent='● '+(sm?short:long); stEl.style.color=col; };
  const ctx=me?context():mateContextInfo(p);
  if(ctx) setSt('F: '+ctx.label,ctx.label+' möglich','#ff9ad0');
  else if(p.tree!=null){ if(p.safe) setSt('Sicher auf dem Baum – E: runter · Leertaste: Sprung von oben','Sicher auf dem Baum','var(--green)'); else setSt('Klettert …','Klettert …','var(--green)'); }
  else if(nt>=0) setSt('Baum in Reichweite – E zum Klettern','Baum: klettern','var(--green)');
  else if(p.grass&&(p.sneak||p.L.lvl<4)) setSt(p.sneak?'Versteckt im hohen Gras':'Versteckt im hohen Gras – als Jungtier auch ohne Schleichen','Versteckt','var(--green)');
  else if(p.grass) setSt('Im Gras – schleiche (C), um dich zu verstecken','Im Gras – schleichen!','var(--mut)');
  else if(p.sneak) setSt('Schleicht','Schleicht','var(--gold)');
  else setSt('Sichtbar','Sichtbar','var(--mut)');
  // Familie
  const cb=h('cubBox'), cu=S.cub;
  const kid=kidMode();
  if(cu||S.preg>0||(canMate()&&seekT<15)||kid){
    cb.style.display='block'; h('cubBars').style.display=cu&&cu.grow<1?'block':'none'; let msg='';
    if(cu&&cu.grow<1){
      h('cubT').textContent='Junges · satt '+Math.round(cu.full)+' % · groß '+Math.round(cu.grow*100)+' %'; h('foodT').textContent='Futter '+S.food+'/'+FOOD_MAX;
      h('bCf').style.width=cu.full+'%'; h('bCg').style.width=(cu.grow*100)+'%';
      msg=G.raider?(G.raider.found?'⚠ Dein Junges wird angegriffen!':'⚠ Räuber sucht dein Junges!'):cu.hp<1?'Leben des Jungen: '+Math.max(0,Math.round(cu.hp*100))+' %':cu.full<25?'Dein Junges hat Hunger':'';
    } else if(cu){ h('cubT').textContent='Nachwuchs ausgewachsen'; h('foodT').textContent='dein Erbe'; }
    else if(S.preg>0){ h('cubT').textContent='Junges kommt bald im Bau zur Welt'; h('foodT').textContent=''; }
    else if(canMate()){ h('cubT').textContent=S.partner?'Dein Partner wartet':'Partner suchen'; h('foodT').textContent='rosa Punkt auf der Spürkarte'; }
    else { h('cubT').textContent='Eltern: '+((S.p1?1:0)+(S.p2?1:0)); h('foodT').textContent='bringen Futter'; }
    h('cubMsg').textContent=msg;
  } else cb.style.display='none';
  if(me&&touchUI()){ const fb=$('tbF'); fb.style.display=ctx?'block':'none'; if(ctx) fb.textContent=ctx.label; }
  const ch=h('ctxHint'); ch.style.display=ctx?'block':'none'; if(ctx) ch.innerHTML=(!me||padUI())?xb('Ⓧ')+' – '+esc(ctx.label):touchUI()?'Rosa Knopf: '+esc(ctx.label):'F – '+esc(ctx.label);
  if(me) $('tapHelp').style.display=(touchUI()&&G.started&&!G.paused&&tapLearned<2)?'block':'none';
  const pe=h('pts'); if(p.L.pts>0){ pe.style.display='block'; pe.textContent=p.L.pts+' Punkt'+(p.L.pts===1?'':'e')+(sm?' ▸':me?' zu vergeben – Tab':' zu vergeben – Back'); } else pe.style.display='none';
  h('cdP').style.width=(1-p.pcd/1.3)*100+'%';
  h('cdRbox').style.opacity=p.L.b.roar?1:0.35; h('cdR').style.width=p.L.b.roar?(1-p.rcd/(22-3*p.L.b.roar))*100+'%':'0%';
  h('cdEbox').style.opacity=p.L.b.climb?1:0.35; h('cdE').style.width=(p.tree!=null?p.climbT*100:nt>=0?100:0)+'%';
  if(me&&touchUI()){ $('tbE').style.opacity=p.L.b.climb?1:0.35; $('tbE').classList.toggle('on',p.tree!=null); $('tbC').classList.toggle('on',p.sneak); $('tbR').style.opacity=p.L.b.roar?1:0.35; }
  // Ziel
  let best=null, bd=28;
  if(G.lastHitT>0&&G.lastHit&&!G.lastHit.dead) best=G.lastHit;
  else for(const a of animals){ if(a.dead||!a.g.visible) continue; const d=Math.hypot(a.x-p.x,a.z-p.z); if(d<bd){ bd=d; best=a; } }
  const te=h('target');
  if(best){ te.style.display='block'; h('tName').textContent=(best.fur&&best.fur.albino?'Albino-':'')+best.sp.n; h('bT').style.width=Math.max(0,best.hp/best.sp.hp*100)+'%';
    const tg=h('tTag'); const hostile=best.sp.hunt&&p.L.lvl<best.sp.hunt;
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
 const RADAR_COL=['#ff7ab8','#ff5a3c','#f2b84b','#9be07f'];
/**
 * Spürkarte von Spieler p auf die Zeichenfläche cv (Kontext ctx): Gelände, Tiere, Kadaver, Junges, Mitspieler, Wahrnehmungskreis, Wind.
 * Ohne Angaben: die große Spürkarte von Spieler 1.
 * @param {import('./player.js').Player} [p]
 */
function drawRadar(p=P,cv=/** @type {HTMLCanvasElement} */(hEl(p,'rc')),ctx=p===P?rc:cv.getContext('2d')){
  const rc=ctx, css=cv.clientWidth||140, want=Math.round(css*Math.min(window.devicePixelRatio||1,2));
  const cvA=/** @type {any} */(cv); if(want>0&&want!==cvA._px){ cvA._px=want; cv.width=cv.height=want; }
  const W=cv.width||280, R=45+22*p.L.b.nose+(has('nase',p.L)?25:0), k=W/2/R, sc=W/280;
  rc.setTransform(1,0,0,1,0,0); rc.clearRect(0,0,W,W); rc.fillStyle='rgba(30,50,25,.55)'; rc.fillRect(0,0,W,W);
  rc.save(); rc.translate(W/2,W/2); rc.rotate(p.cam.yaw);
  rc.save(); rc.scale(k/RB,k/RB); rc.drawImage(radarBg,-(p.x+RW)*RB,-(p.z+RW)*RB); rc.restore();
  if(S.cub){ const dx=cub.x-p.x, dz=cub.z-p.z; if(dx*dx+dz*dz<R*R){ rc.fillStyle='#ff7ab8'; rc.fillRect(dx*k-6*sc,dz*k-6*sc,12*sc,12*sc); } }
  for(let g=0;g<4;g++){
    rc.fillStyle=RADAR_COL[g]; rc.beginPath(); let any=false;
    for(let i=0;i<animals.length;i++){ const a=animals[i]; if(a.dead||(a.sp.friend&&!a.g.visible)) continue; if(a.state==='lurk'&&Math.abs(a.x-p.x)+Math.abs(a.z-p.z)>18) continue;
      const hostile=a.sp.hunt&&p.L.lvl<a.sp.hunt, grp=a.sp.friend?0:hostile?1:a.sp.fight?2:3; if(grp!==g) continue;
      const dx=a.x-p.x, dz=a.z-p.z; if(dx*dx+dz*dz>R*R) continue;
      const r=Math.max(4,a.sp.size*6)*sc; rc.moveTo(dx*k+r,dz*k); rc.arc(dx*k,dz*k,r,0,6.283); any=true; }
    if(any) rc.fill();
  }
  // Mitspieler als Punkte in ihrer Farbe (am Boden: blinkend)
  for(const q of players){ if(q===p) continue; const dx=q.x-p.x, dz=q.z-p.z; if(dx*dx+dz*dz>R*R||(q.dead&&Math.floor(performance.now()/300)%2)) continue;
    rc.fillStyle=PCOL[(q.num||1)-1]; rc.strokeStyle='#000'; rc.lineWidth=2*sc; rc.beginPath(); rc.arc(dx*k,dz*k,7*sc,0,6.283); rc.fill(); rc.stroke(); }
  rc.fillStyle='#b07040'; for(const a of animals){ if(!a.carc) continue; const dx=a.x-p.x, dz=a.z-p.z; if(dx*dx+dz*dz<R*R) rc.fillRect(dx*k-4*sc,dz*k-4*sc,8*sc,8*sc); }
  rc.restore();
  // Wahrnehmungskreis: ab hier bemerken dich Raubtiere (rot) bzw. Beute (grün); schrumpft beim Schleichen und im Gras
  let sense=0; for(const sp of SPECIES){ if(sp.hunt&&p.L.lvl<sp.hunt&&sp.sense>sense) sense=sp.sense; }
  const danger=sense>0; if(!danger) sense=24;
  const base=sense*p.hidden*D().sense;
  rc.save(); rc.translate(W/2,W/2); rc.rotate(p.cam.yaw);
  if(base*k>3){ rc.strokeStyle=danger?'rgba(255,110,80,.9)':'rgba(155,224,127,.9)'; rc.lineWidth=3*sc; rc.setLineDash([9*sc,7*sc]); rc.beginPath();
    for(let i=0;i<=48;i++){ const t=i/48*6.283, ux=Math.cos(t), uz=Math.sin(t), r=Math.min(base*windMulDir(ux,uz),R)*k; if(i) rc.lineTo(ux*r,uz*r); else rc.moveTo(ux*r,uz*r); }
    rc.stroke(); rc.setLineDash([]); }
  // Windpfeil am Rand: zeigt, wohin der Wind weht
  { const wx=windU.value.x, wz=windU.value.y, rr=W*0.4, bx=-wx*rr, bz=-wz*rr, px=-wz, pz=wx, L=14*sc;
    rc.fillStyle='rgba(150,205,255,.95)'; rc.beginPath(); rc.moveTo(bx+wx*L,bz+wz*L); rc.lineTo(bx+px*L*0.55,bz+pz*L*0.55); rc.lineTo(bx-px*L*0.55,bz-pz*L*0.55); rc.fill(); }
  rc.restore();
  rc.fillStyle='#fff'; rc.beginPath(); rc.moveTo(W/2,W/2-11*sc); rc.lineTo(W/2+7*sc,W/2+8*sc); rc.lineTo(W/2-7*sc,W/2+8*sc); rc.fill();
}

export { PCOL, drawRadar, updateCamera, updateCross, updateUI, updateWarn, warnArrows };
