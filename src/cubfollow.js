// LeoLife – Lehrzeit des Jungen: Ab 25 % Größe nimmt jeder Spieler sein eigenes Junges aus dem Wurf mit auf die Jagd.
// Es folgt ihm, duckt sich beim Schleichen, frisst an seiner Beute mit (wächst dabei) und lernt, was es aus der Nähe sieht.
// Ab 50 % („halbstark“) kann man als Junges weiterspielen – mit Boni aus dem Gelernten. Raubtiere können es unterwegs angreifen.
import { animals } from './animals.js';
import { snd, snd3d } from './audio.js';
import { ABIL, QUAL } from './data.js';
import { puff } from './effects.js';
import { scene } from './engine.js';
import { animLegs, buildQuad } from './models.js';
import { P, dropModel, players } from './player.js';
import { quality } from './quality.js';
import { D, S, save } from './save.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { rnd } from './util.js';
import { tell } from './coop.js';
import { CUB_HOME, cub, cubDies } from './family.js';
import { goalEvent } from './goals.js';
import { G } from './state.js';
import { mateBecomeCub } from './kinship.js';
import { playAsCub } from './kin.js';
import { dayF } from './daynight.js';
import { trees } from './vegetation.js';

const LEARN_AT=0.25, SWITCH_AT=0.5, DEN_CAP=0.35;
/** Was ein Junges lernen kann: so oft zusehen → Bonus beim Wechsel */
const LESSONS=[
  {k:'amb',n:'Hinterhalt',need:3,give:'amb'},
  {k:'bite',n:'Festbeißen',need:2,give:'jmp'},
  {k:'tree',n:'Klettern',need:1,give:'climb'},
  {k:'kill',n:'Beute',need:4,give:'pt'}
];
/** @type {{p:any,c:any,x:number,z:number,rot:number,g:any,ph:number,wait:boolean,eatT:number,hitT:number,mewT:number,up:number,tree:number|null,waitTree:number|null}[]} */
const followers=[];
const numOf=p=>p===P?1:(p.num||2);
const canSwitch=()=>!!S.cub&&Object.values(kidsOf()).some(k=>k.grow>=SWITCH_AT);
/**
 * Jedes Junge des Wurfs hat eigenen Hunger und eigenes Leben: S.cub.kids = { Spielernummer: {full,hp} }.
 * Junges Nr. 1 gehört Spieler 1, Nr. 2 Mitspieler 2 usw. (Wachstum und Gelerntes laufen wie bisher).
 */
function kidsOf(c=S.cub){
  if(!c) return {};
  if(!c.kids){ c.kids={}; const nums=[1,...players.filter(q=>q!==P).map(q=>q.num),2,3,4].filter((v,i,a)=>a.indexOf(v)===i);
    for(const k of nums.slice(0,c.n||1)) c.kids[k]={full:c.full!=null?c.full:70,hp:c.hp!=null?c.hp:1}; }
  for(const k of Object.values(c.kids)) if(k.grow==null) k.grow=c.grow||0;   // jedes Junge wächst für sich
  return c.kids;
}
/** Eigenes Junges von Spieler p (oder null, wenn übernommen/tot/keins) */
const kidOf=p=>{ const c=S.cub; if(!c||(c.took&&c.took[numOf(p)])) return null; return kidsOf(c)[numOf(p)]||null; };
/** Größe des eigenen Jungen von Spieler p (0, wenn keins) */
const growOf=p=>{ const k=kidOf(p); return k?k.grow:0; };
/** Herkunft des Jungen von Spieler p: eigene Angaben (späterer Wurf) oder die des Wurfs */
function kidInfo(p){ const c=S.cub, k=kidOf(p)||{}; return {trait:k.trait||c.trait,gen:k.gen||c.gen,parents:k.parents||c.parents,fur:k.fur||c.fur}; }
/** Wurf-Werte nachführen: c.grow = kleinstes Junges (braucht noch jemand Futter?), c.n = Anzahl */
function syncLitter(){ const c=S.cub; if(!c) return; const ks=Object.values(kidsOf(c)); c.n=ks.length; if(ks.length) c.grow=Math.min(...ks.map(k=>k.grow)); }
/** Junge, die gerade im Bau sind (nicht mit ihrem Spieler unterwegs): [Nummer, Junges] */
function denKids(){ const c=S.cub; if(!c) return []; return Object.entries(kidsOf(c)).filter(([k])=>!followers.some(f=>numOf(f.p)===+k)); }
/** Satt-Wert des hungrigsten Jungen im Bau (100, wenn keins dort ist) */
const denFull=()=>{ const d=denKids(); return d.length?Math.min(...d.map(([,k])=>k.full)):100; };
/** Spieler mit dieser Nummer (oder null, wenn er gerade nicht mitspielt) */
const playerNum=k=>players.find(q=>numOf(q)===+k)||null;
/** Junges Nr. k stirbt: aus dem Wurf nehmen; das letzte beendet den Wurf */
function kidDies(k,how){
  const c=S.cub; if(!c) return; const f=followers.find(o=>numOf(o.p)===+k); if(f){ puff(f.x,H(f.x,f.z)+0.5,f.z,0xc0392b,10,0.5); dropFollower(f); }
  delete kidsOf(c)[k]; if(c.learn) delete c.learn[k]; c.n=Math.max(0,(c.n||1)-1);
  if(!Object.keys(c.kids).length){ cubDies(how); return; }
  const q=playerNum(k), msg=(q?'Dein Junges ':'Das Junge von '+(k==1?'Spieler 1':'Spieler '+k)+' ')+how+'.';
  if(q) tell(q,msg,'#ff8a70'); else toast(msg,'#ff8a70'); snd.death(); save();
}
/** Hunger je Junges: warnt seinen Spieler, verhungert einzeln */
function tickKids(dt){
  const c=S.cub; if(!c||c.grow>=1) return;
  for(const [k,kid] of Object.entries(kidsOf(c))){
    if(kid.grow>=1) continue;   // ausgewachsen: versorgt sich selbst
    const f0=kid.full; kid.full=Math.max(0,kid.full-dt*0.28*D().hunger); const q=playerNum(k);
    const say=(m,col)=>{ if(q) tell(q,m,col); else toast(m,col); };
    if(f0>=30&&kid.full<30) say('Dein Junges hat Hunger – lass es an Beute fressen.','#ffb070');
    if(kid.full<=0){ kid.hp-=dt*0.012; kid.warnT=(kid.warnT||0)-dt;
      if(kid.warnT<=0){ kid.warnT=15; say('Dein Junges verhungert! Noch '+Math.max(1,Math.round(kid.hp/0.012))+' s – bring ihm Beute!','#ff5a3a'); }
      if(kid.hp<=0){ kidDies(k,'ist verhungert'); return; } }
    else if(kid.hp<1&&!G.raider) kid.hp=Math.min(1,kid.hp+dt*0.01);
  }
}
/** Hat Spieler p im aktuellen Wurf noch „sein“ Junges? Jeder Spieler übernimmt höchstens eins – das der anderen bleibt für sie. */
const hasOwnCub=p=>!!kidOf(p);
const canSwitchFor=p=>hasOwnCub(p)&&growOf(p)>=SWITCH_AT;
/** Spieler p hat sein Junges übernommen */
function markTaken(p){ const c=S.cub; if(!c) return; c.took=c.took||{}; c.took[numOf(p)]=true; }
const followerOf=p=>followers.find(f=>f.p===p)||null;
/** Wie viele Junge des Wurfs noch im Bau sind */
const denCount=()=>denKids().length;
/** Gelerntes des Jungen von Spieler p */
function learnOf(p){ const c=S.cub; if(!c) return {}; c.learn=c.learn||{}; return c.learn[numOf(p)]||(c.learn[numOf(p)]={}); }

function addFollower(p){
  const c=S.cub; if(!c||denCount()<=0||followerOf(p)) return;
  const g=buildQuad({col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.5,ears:0.17,tail:1.0,tailTip:0x2a1c10,spots:1},c.fur||null);
  g.userData.blob.visible=!QUAL[quality].sh; scene.add(g);
  followers.push({p,c,x:cub.x,z:cub.z,rot:0,g,ph:0,wait:false,eatT:0,hitT:0,mewT:4,up:0,tree:null,waitTree:null});
  snd.mew(); tell(p,'Dein Junges kommt mit! Es lernt, was es bei dir sieht. Aktionstaste beim Jungen: „Warte hier“.','#ff9ad0');
}
function dropFollower(f){ dropModel(f.g); const i=followers.indexOf(f); if(i>=0) followers.splice(i,1); }
/** Alle Mitläufer entfernen (neues Spiel, Junges tot oder übernommen) */
function clearFollowers(){ while(followers.length) dropFollower(followers[0]); }

/** Kontextaktion rund ums mitlaufende Junge für Spieler p, sonst null */
function cubFollowContext(p){
  const c=S.cub; if(!c||p.dead||p.tree!=null) return null;
  const kid=kidOf(p); if(!kid) return null;
  // Ausgewachsenes Junges kann am Bau oder unterwegs bei seinem Mitspieler übernommen werden.
  if(kid.grow>=1){ const f=followerOf(p), spot=f||cub; if(Math.hypot(spot.x-p.x,spot.z-p.z)>4.5) return null;
    return {label:p.swArm>0?'Wirklich? Nochmal: als Junges weiterspielen':'Als dein Junges weiterspielen (Stufe '+heirLevel(p)+')',fn:()=>{ if(!(p.swArm>0)){ p.swArm=4; return; } p.swArm=0; if(p===P) playAsCub(); else mateBecomeCub(p); }}; }
  const f=followerOf(p);
  if(f){ if(Math.hypot(f.x-p.x,f.z-p.z)>4.5) return null;
    if(Math.hypot(p.x-CUB_HOME.x,p.z-CUB_HOME.z)<12) return {label:'Junges in den Bau bringen',fn:()=>{ dropFollower(f); tell(p,'Dein Junges bleibt im Bau.','#ff9ad0'); }};
    return f.wait?{label:'Junges: Komm mit',fn:()=>{ f.wait=false; snd.mew(); }}:{label:'Junges: Warte hier',fn:()=>{ f.wait=true; }}; }
  if(kid.grow<LEARN_AT||denCount()<=0||Math.hypot(cub.x-p.x,cub.z-p.z)>4.5) return null;
  if(S.food>0&&(kidOf(p)||{full:100}).full<60) return null;   // erst füttern (alter Vorrat)
  return {label:'Junges mitnehmen',fn:()=>addFollower(p)};
}

/** Spieler p hat etwas vorgemacht: sieht sein Junges aus der Nähe zu, lernt und wächst es */
function cubLearn(p,k){
  const f=followerOf(p), c=S.cub, kid=kidOf(p); if(!f||!c||!kid||kid.grow>=1||Math.hypot(f.x-p.x,f.z-p.z)>30) return;
  const l=learnOf(p); l[k]=(l[k]||0)+1;
  const L=LESSONS.find(o=>o.k===k);
  kid.grow=Math.min(1,kid.grow+({amb:0.015,bite:0.02,tree:0.02,kill:0.04}[k]||0));
  if(k==='kill') goalEvent('cubhunt',1);
  if(L&&l[k]===L.need) tell(p,'Dein Junges hat gelernt: '+L.n+' ('+bonusName(L)+' beim Wechsel)','#ff9ad0');
  else if(L) floatText('Junges lernt: '+L.n+' '+Math.min(l[k],L.need)+'/'+L.need,f.x,H(f.x,f.z)+1.4,f.z,'#ff9ad0');
  save();
}
const bonusName=L=>L.give==='pt'?'+1 Punkt':'+1 '+((ABIL.find(a=>a.k===L.give)||{n:L.give}).n);
/** Kurzer Stand fürs HUD: „Hinterhalt 2/3 · Festbeißen 0/2 …“ */
function learnText(p){ const l=learnOf(p); return LESSONS.map(L=>L.n+' '+Math.min(l[L.k]||0,L.need)+'/'+L.need).join(' · '); }
/** Beim Wechsel ins Junge: Boni aus dem Gelernten auf die Werte L anwenden; liefert die Namen für die Meldung */
function applyLearned(p,L){
  const l=learnOf(p), got=[];
  const levelBudget=Math.max(0,(L.lvl-1)*2);
  const carried=Math.floor((p.L?.pts||0)*0.1);
  let inheritedCost=0;
  for(const o of LESSONS){ if((l[o.k]||0)<o.need) continue;
    if(o.give==='pt') L.pts=(L.pts||0)+1;
    else {
      const before=L.b[o.give]||0;
      L.b[o.give]=Math.min(3,before+1);
      inheritedCost+=(L.b[o.give]-before)*2;
    }
    got.push(bonusName(o)); }
  L.pts=Math.max(0,levelBudget+carried-inheritedCost+(L.pts||0));
  return got;
}
/** Wo Spieler p als Junges startet: bei seinem mitlaufenden Jungen, sonst am Bau */
function cubSpot(p){ const f=followerOf(p); return f?{x:f.x,z:f.z}:{x:cub.x,z:cub.z}; }
/** Junges eines Spielers ist tot: aus dem Wurf nehmen */
function followerDies(f){ kidDies(numOf(f.p),'wurde unterwegs von einem Raubtier getötet'); }

/** Stufen des Wurfs ansagen: alt genug für die Lehrzeit, halbstark */
function stageCheck(){
  const c=S.cub; if(!c) return; syncLitter();
  for(const [k,kid] of Object.entries(kidsOf(c))){
    const st=kid.grow>=1?3:kid.grow>=SWITCH_AT?2:kid.grow>=LEARN_AT?1:0;
    if(kid.stage==null){ kid.stage=c.stage!=null?Math.min(c.stage,st):st; continue; }
    if(st<=kid.stage) continue; kid.stage=st; snd.level();
    const q=playerNum(k), say=m=>{ if(q) tell(q,m,'#ff9ad0'); else toast(m,'#ff9ad0'); };
    if(st===1) say('Dein Junges ist alt genug für die Lehrzeit: Hol es am Bau ab und nimm es mit auf die Jagd!');
    if(st===2) say('Dein Junges ist halbstark! Du kannst jetzt als Junges weiterspielen (Menü) – mit allem, was es gelernt hat.');
    if(st===3) say(followerOf(q)?'Dein Junges ist ausgewachsen! Wenn es bei dir ist: Aktionstaste beim Jungen = als dein Junges weiterspielen. Oder behalte es als Erben.':'Dein Junges ist ausgewachsen! Es wartet am Bau: Aktionstaste dort = als dein Junges weiterspielen. Oder behalte es als Erben.');
    save(); }
}
/** Stufe, mit der Spieler p als sein Junges startet */
const heirLevel=(p=P)=>1+Math.floor(Math.min(1,growOf(p))*7);

/** Jedes Bild: Mitläufer folgen ihrem Spieler, fressen mit, werden angegriffen */
function updateFollowers(dt){
  for(const p of players) if(p.swArm>0) p.swArm-=dt;
  stageCheck();
  for(const f of followers.slice()){
    const p=f.p, c=S.cub;
    if(!c||f.c!==c||players.indexOf(p)<0||!kidOf(p)){ dropFollower(f); continue; }
    let tx=p.x-Math.sin(p.rot)*2.6, tz=p.z-Math.cos(p.rot)*2.6;
    const dp=Math.hypot(p.x-f.x,p.z-f.z);
    if((dp>110&&f.up<=0)||p.dead){ f.x=p.x+rnd(-2,2); f.z=p.z+rnd(-2,2); f.up=0; f.tree=null; }   // Spieler weit weg (z. B. neu erwacht): kommt nach
    // Baum: klettert mit, wenn sein Spieler oben ist; wartend nachts oder bei Gefahr sucht es sich selbst einen Baum
    const danger=animals.some(a=>!a.dead&&a.sp.pred&&!a.sp.croc&&!a.sp.friend&&Math.hypot(a.x-f.x,a.z-f.z)<18);
    let want=null;
    if(p.tree!=null&&!p.dead) want=p.tree;
    else if(f.wait&&(dayF<0.35||danger)){ if(f.waitTree==null){ let bi=-1, bd=30; trees.forEach((t,i)=>{ const d=Math.hypot(t.x-f.x,t.z-f.z); if(d<bd){ bd=d; bi=i; } }); f.waitTree=bi>=0?bi:null; } want=f.waitTree; }
    if(!f.wait) f.waitTree=null;
    if(f.up>0&&f.tree!=null&&want!==f.tree) want=null;   // erst herunter, dann woanders hin
    const crouch=(p.sneak||f.wait)&&f.up<=0;
    let sp=0;
    if(want!=null||f.up>0){
      const ti=want!=null?want:f.tree, t=trees[ti], o=t.baobab?(t.tr+0.4)*0.71:0.5, bx=t.x+t.perch[0]*0.35+o, bz=t.z+t.perch[2]*0.35+o;   // am dicken Affenbrotbaum außen am Stamm
      if(f.up<=0&&want!=null&&Math.hypot(bx-f.x,bz-f.z)>0.8){ const d=Math.hypot(bx-f.x,bz-f.z); sp=d>6?9:4.5; const v=Math.min(d,sp*dt)/d; f.x+=(bx-f.x)*v; f.z+=(bz-f.z)*v; f.rot=Math.atan2(bx-f.x,bz-f.z); }
      else { f.tree=ti; const was=f.up; f.up=want!=null?Math.min(1,f.up+dt/1.5):Math.max(0,f.up-dt/0.9); if(was<=0&&f.up>0) snd3d(['claws'],f.x,f.z,0.6,30,1.3);
        f.x=bx; f.z=bz; f.rot=Math.atan2(t.x-bx,t.z-bz);
        if(t.baobab){ const e=f.up*f.up*(3-2*f.up), px=t.x+t.perch[0]+0.6, pz=t.z+t.perch[2]+0.6; f.x=bx+(px-bx)*e; f.z=bz+(pz-bz)*e; }   // oben auf den Stamm
        if(f.up<=0) f.tree=null; }
    }
    else if(!f.wait&&!p.dead){ const d=Math.hypot(tx-f.x,tz-f.z); sp=d>9?9.5:d>2.5?4.2:d>0.8?1.6:0; if(p.sneak) sp*=0.7;
      if(sp>0){ const v=Math.min(d,sp*dt)/d; f.x+=(tx-f.x)*v; f.z+=(tz-f.z)*v; f.rot=Math.atan2(tx-f.x,tz-f.z); } }
    const climbing=f.up>0&&f.up<1;
    f.ph+=dt*(sp>0?sp*2.2:climbing?12:0.5); animLegs(f.g,f.ph,sp>0||climbing?0.45:0.03);
    f.g.userData.inner.rotation.x=climbing?-1.1:0;
    const sc=0.34+0.66*Math.min(1,kidOf(p).grow); f.g.scale.set(sc,sc*(crouch?0.75:1),sc);
    let gy=H(f.x,f.z); if(f.tree!=null){ const t=trees[f.tree], e=f.up*f.up*(3-2*f.up); gy+=Math.max(0,t.y+t.perch[1]*(t.baobab?1:0.8)-gy)*e; }
    f.g.position.set(f.x,gy,f.z); f.g.rotation.y=f.rot; f.g.visible=true;
    const safe=f.up>=1;
    // ruft, wenn es den Anschluss verliert
    const kid=kidOf(p); if(!kid){ dropFollower(f); continue; }
    f.mewT-=dt; if(f.mewT<=0){ const lost=dp>18||kid.full<25; f.mewT=lost?rnd(4,7):rnd(14,28); snd3d(['mew'],f.x,f.z,lost?1.2:0.7,lost?70:35,rnd(1.05,1.3)); }   // ab und zu ein leises Miauen, laut wenn es den Anschluss verliert oder hungert
    // frisst an Beute in der Nähe mit
    f.eatT-=dt;
    if(f.eatT<=0&&kid.full<97&&f.up<=0){ const a=animals.find(o=>o.dead&&o.carc&&o.carc.meat>0&&o.carc.tree==null&&Math.hypot(o.x-f.x,o.z-f.z)<3);
      if(a){ f.eatT=2.2; a.carc.meat--; kid.full=Math.min(100,kid.full+12); kid.hp=Math.min(1,kid.hp+0.05); kid.grow=Math.min(1,kid.grow+0.02); snd3d(['eat'],f.x,f.z,0.5,30,1.3); puff(a.x,H(a.x,a.z)+0.5,a.z,0xc0392b,3,0.3); } }
    // Gefahr: Raubtiere in der Nähe schnappen nach dem Jungen; ist sein Spieler weit weg, schleichen sie sich heran
    f.hitT-=dt;
    for(const a of animals){ if(safe||a.dead||!a.sp.pred||a.sp.croc||a.sp.friend) continue;   // oben im Baum ist es sicher
      const d=Math.hypot(a.x-f.x,a.z-f.z);
      if(d<14&&dp>20&&a.state==='wander'){ a.tx=f.x; a.tz=f.z; a.timer=2; }
      if(d<2.4&&f.hitT<=0&&(a.state==='chase'||a.state==='wander'||a.state==='scav')){ f.hitT=1.2; kid.hp-=0.14; snd3d(['mew'],f.x,f.z,1.2,70,1.3); puff(f.x,H(f.x,f.z)+0.5,f.z,0xc0392b,4,0.4);
        tell(p,'Dein Junges wird angegriffen! (Leben '+Math.max(0,Math.round(kid.hp*100))+' %)','#ff8a70');
        if(kid.hp<=0){ followerDies(f); break; } } }
  }
}

export { growOf, heirLevel, kidInfo, syncLitter, denFull, denKids, kidDies, kidOf, kidsOf, tickKids, canSwitchFor, hasOwnCub, markTaken, numOf, cubSpot, DEN_CAP, LEARN_AT, SWITCH_AT, applyLearned, canSwitch, clearFollowers, cubFollowContext, cubLearn, denCount, dropFollower, followerOf, followers, learnOf, learnText, updateFollowers };
