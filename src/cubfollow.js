// LeopardLife – Lehrzeit des Jungen: Ab 25 % Größe nimmt jeder Spieler sein eigenes Junges aus dem Wurf mit auf die Jagd.
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
import { S, save } from './save.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { rnd } from './util.js';
import { tell } from './coop.js';
import { CUB_HOME, cub, cubDies } from './family.js';
import { goalEvent } from './goals.js';

const LEARN_AT=0.25, SWITCH_AT=0.5, DEN_CAP=0.35;
/** Was ein Junges lernen kann: so oft zusehen → Bonus beim Wechsel */
const LESSONS=[
  {k:'amb',n:'Hinterhalt',need:3,give:'amb'},
  {k:'bite',n:'Festbeißen',need:2,give:'jmp'},
  {k:'tree',n:'Beute im Baum',need:1,give:'climb'},
  {k:'kill',n:'Beute',need:4,give:'pt'}
];
/** @type {{p:any,c:any,x:number,z:number,rot:number,g:any,ph:number,wait:boolean,hp:number,eatT:number,hitT:number,mewT:number}[]} */
const followers=[];
const numOf=p=>p===P?1:(p.num||2);
const canSwitch=()=>!!S.cub&&S.cub.grow>=SWITCH_AT;
/** Hat Spieler p im aktuellen Wurf noch „sein“ Junges? Jeder Spieler übernimmt höchstens eins – das der anderen bleibt für sie. */
const hasOwnCub=p=>!!S.cub&&(S.cub.n||0)>0&&!(S.cub.took&&S.cub.took[numOf(p)]);
const canSwitchFor=p=>canSwitch()&&hasOwnCub(p);
/** Spieler p hat sein Junges übernommen */
function markTaken(p){ const c=S.cub; if(!c) return; c.took=c.took||{}; c.took[numOf(p)]=true; }
const followerOf=p=>followers.find(f=>f.p===p)||null;
/** Wie viele Junge des Wurfs noch im Bau sind */
const denCount=()=>S.cub?Math.max(0,(S.cub.n||1)-followers.length):0;
/** Gelerntes des Jungen von Spieler p */
function learnOf(p){ const c=S.cub; if(!c) return {}; c.learn=c.learn||{}; return c.learn[numOf(p)]||(c.learn[numOf(p)]={}); }

function addFollower(p){
  const c=S.cub; if(!c||denCount()<=0||followerOf(p)) return;
  const g=buildQuad({col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.5,ears:0.17,tail:1.0,tailTip:0x2a1c10,spots:1},c.fur||null);
  g.userData.blob.visible=!QUAL[quality].sh; scene.add(g);
  followers.push({p,c,x:cub.x,z:cub.z,rot:0,g,ph:0,wait:false,hp:1,eatT:0,hitT:0,mewT:4});
  snd.mew(); tell(p,'Dein Junges kommt mit! Es lernt, was es bei dir sieht. Aktionstaste beim Jungen: „Warte hier“.','#ff9ad0');
}
function dropFollower(f){ dropModel(f.g); const i=followers.indexOf(f); if(i>=0) followers.splice(i,1); }
/** Alle Mitläufer entfernen (neues Spiel, Junges tot oder übernommen) */
function clearFollowers(){ while(followers.length) dropFollower(followers[0]); }

/** Kontextaktion rund ums mitlaufende Junge für Spieler p, sonst null */
function cubFollowContext(p){
  const c=S.cub; if(!c||c.grow>=1||p.dead||p.tree!=null) return null;
  const f=followerOf(p);
  if(f){ if(Math.hypot(f.x-p.x,f.z-p.z)>4.5) return null;
    if(Math.hypot(p.x-CUB_HOME.x,p.z-CUB_HOME.z)<12) return {label:'Junges in den Bau bringen',fn:()=>{ dropFollower(f); tell(p,'Dein Junges bleibt im Bau.','#ff9ad0'); }};
    return f.wait?{label:'Junges: Komm mit',fn:()=>{ f.wait=false; snd.mew(); }}:{label:'Junges: Warte hier',fn:()=>{ f.wait=true; }}; }
  if(c.grow<LEARN_AT||denCount()<=0||!hasOwnCub(p)||Math.hypot(cub.x-p.x,cub.z-p.z)>4.5) return null;
  if(S.food>0&&c.full<60) return null;   // erst füttern
  return {label:'Junges mitnehmen',fn:()=>addFollower(p)};
}

/** Spieler p hat etwas vorgemacht: sieht sein Junges aus der Nähe zu, lernt und wächst es */
function cubLearn(p,k){
  const f=followerOf(p), c=S.cub; if(!f||!c||c.grow>=1||Math.hypot(f.x-p.x,f.z-p.z)>30) return;
  const l=learnOf(p); l[k]=(l[k]||0)+1;
  const L=LESSONS.find(o=>o.k===k);
  c.grow=Math.min(1,c.grow+({amb:0.015,bite:0.02,tree:0.02,kill:0.04}[k]||0));
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
  for(const o of LESSONS){ if((l[o.k]||0)<o.need) continue;
    if(o.give==='pt') L.pts=(L.pts||0)+1; else L.b[o.give]=Math.min(3,(L.b[o.give]||0)+1);
    got.push(bonusName(o)); }
  return got;
}
/** Wo Spieler p als Junges startet: bei seinem mitlaufenden Jungen, sonst am Bau */
function cubSpot(p){ const f=followerOf(p); return f?{x:f.x,z:f.z}:{x:cub.x,z:cub.z}; }
/** Junges eines Spielers ist tot: aus dem Wurf nehmen */
function followerDies(f){
  const p=f.p; puff(f.x,H(f.x,f.z)+0.5,f.z,0xc0392b,10,0.5); dropFollower(f);
  const c=S.cub; if(!c) return; c.n=(c.n||1)-1; if(c.learn) delete c.learn[numOf(p)];
  if(c.n<=0){ cubDies('wurde unterwegs getötet'); return; }
  tell(p,'Dein Junges wurde getötet.','#ff8a70'); save();
}

/** Stufen des Wurfs ansagen: alt genug für die Lehrzeit, halbstark */
function stageCheck(){
  const c=S.cub; if(!c) return; const st=c.grow>=1?3:c.grow>=SWITCH_AT?2:c.grow>=LEARN_AT?1:0;
  if(c.stage==null){ c.stage=st; return; }
  if(st<=c.stage) return; c.stage=st; snd.level();
  if(st===1) toast('Dein Junges ist alt genug für die Lehrzeit: Hol es am Bau ab und nimm es mit auf die Jagd!','#ff9ad0');
  if(st===2) toast('Dein Junges ist halbstark! Du kannst jetzt als Junges weiterspielen (Menü) – mit allem, was es gelernt hat.','#ff9ad0');
  save();
}

/** Jedes Bild: Mitläufer folgen ihrem Spieler, fressen mit, werden angegriffen */
function updateFollowers(dt){
  stageCheck();
  for(const f of followers.slice()){
    const p=f.p, c=S.cub;
    if(!c||f.c!==c||c.grow>=1||players.indexOf(p)<0){ dropFollower(f); continue; }
    let tx=p.x-Math.sin(p.rot)*2.6, tz=p.z-Math.cos(p.rot)*2.6;
    const dp=Math.hypot(p.x-f.x,p.z-f.z);
    if(dp>110||p.dead){ f.x=p.x+rnd(-2,2); f.z=p.z+rnd(-2,2); }   // Spieler weit weg (z. B. neu erwacht): kommt nach
    const crouch=p.sneak||f.wait;
    let sp=0;
    if(!f.wait&&!p.dead){ const d=Math.hypot(tx-f.x,tz-f.z); sp=d>9?9.5:d>2.5?4.2:d>0.8?1.6:0; if(p.sneak) sp*=0.7;
      if(sp>0){ const v=Math.min(d,sp*dt)/d; f.x+=(tx-f.x)*v; f.z+=(tz-f.z)*v; f.rot=Math.atan2(tx-f.x,tz-f.z); } }
    f.ph+=dt*(sp>0?sp*2.2:0.5); animLegs(f.g,f.ph,sp>0?0.45:0.03);
    const sc=0.34+0.66*Math.min(1,c.grow); f.g.scale.set(sc,sc*(crouch?0.75:1),sc);
    f.g.position.set(f.x,H(f.x,f.z),f.z); f.g.rotation.y=f.rot; f.g.visible=true;
    // ruft, wenn es den Anschluss verliert
    f.mewT-=dt; if(f.mewT<=0){ f.mewT=rnd(4,7); if(dp>18||c.full<25) snd3d(['mew'],f.x,f.z,0.9,60,rnd(0.95,1.2)); }
    // frisst an Beute in der Nähe mit
    f.eatT-=dt;
    if(f.eatT<=0&&c.full<97){ const a=animals.find(o=>o.dead&&o.carc&&o.carc.meat>0&&o.carc.tree==null&&Math.hypot(o.x-f.x,o.z-f.z)<3);
      if(a){ f.eatT=2.2; a.carc.meat--; c.full=Math.min(100,c.full+12); c.grow=Math.min(1,c.grow+0.02); snd3d(['eat'],f.x,f.z,0.5,30,1.3); puff(a.x,H(a.x,a.z)+0.5,a.z,0xc0392b,3,0.3); } }
    // Gefahr: Raubtiere in der Nähe schnappen nach dem Jungen; ist sein Spieler weit weg, schleichen sie sich heran
    f.hitT-=dt;
    for(const a of animals){ if(a.dead||!a.sp.pred||a.sp.croc||a.sp.friend) continue;
      const d=Math.hypot(a.x-f.x,a.z-f.z);
      if(d<14&&dp>20&&a.state==='wander'){ a.tx=f.x; a.tz=f.z; a.timer=2; }
      if(d<2.4&&f.hitT<=0&&(a.state==='chase'||a.state==='wander'||a.state==='scav')){ f.hitT=1.2; f.hp-=0.14; snd3d(['mew'],f.x,f.z,1.2,70,1.3); puff(f.x,H(f.x,f.z)+0.5,f.z,0xc0392b,4,0.4);
        if(dp>8) tell(p,'⚠ Dein Junges wird angegriffen!','#ff8a70');
        if(f.hp<=0){ followerDies(f); break; } } }
    if(f.hp<1&&f.hitT<-6) f.hp=Math.min(1,f.hp+dt*0.02);
  }
}

export { canSwitchFor, hasOwnCub, markTaken, numOf, cubSpot, DEN_CAP, LEARN_AT, SWITCH_AT, applyLearned, canSwitch, clearFollowers, cubFollowContext, cubLearn, denCount, dropFollower, followerOf, followers, learnOf, learnText, updateFollowers };
