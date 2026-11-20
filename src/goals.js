// LeopardLife – Tagesziele.
import { gainXp } from './actions.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { ART, SPECIES } from './data.js';
import { S, save, xpNeed } from './save.js';
import { toast } from './ui.js';
import { $ } from './util.js';
import { tutActive, tutEvent } from './tutorial.js';
import { players } from './player.js';

/* ---------- Tagesziele ---------- */
// Zu jedem Sonnenaufgang drei neue Aufgaben; jede bringt einen Teil der nächsten Stufe als Bonus-Erfahrung.
// Alle drei an einem Tag: +1 Punkt für Eigenschaften und Fähigkeiten (für jeden Spieler). Wer das mehrere Tage
// hintereinander schafft, baut eine Serie auf; jeder dritte Tag der Serie bringt einen weiteren Punkt.
const PREY_BY_LVL=l=>{ const L=l<3?['hase','maus']:l<6?['capy','hase']:l<9?['boar','deer','capy']:l<12?['deer','anti','boar']:['anti','lion','hyena','croc']; const f=L.filter(id=>animals.some(a=>a.sp.id===id)); return f.length?f:['hase']; };
function spName(id){ const sp=SPECIES.find(x=>x.id===id); return sp?sp.n:id; }
function newGoals(){
  const pool=[];
  const n=3+Math.floor(Math.random()*3); pool.push({id:'kill',text:'Erlege '+n+' Beutetiere',need:n});
  const pr=PREY_BY_LVL(S.lvl), sp=pr[Math.floor(Math.random()*pr.length)]; pool.push({id:'sp:'+sp,text:'Erlege '+(ART[sp]||'ein')+' '+spName(sp),need:1});
  pool.push({id:'night',text:'Erlege nachts ein Tier',need:1});
  pool.push({id:'amb',text:'Lande 2 Treffer aus dem Hinterhalt',need:2});
  pool.push({id:'herd',text:'Erlege ein Tier aus einer Herde',need:1});
  pool.push({id:'meat',text:'Friss an einem Kadaver',need:1});
  if(S.lvl<12) pool.push({id:'hide',text:'Bleib 20 s versteckt, während ein Raubtier in der Nähe ist',need:20});
  if(S.b.climb) pool.push({id:'climb',text:'Klettere auf 3 Bäume',need:3});
  if(S.b.climb) pool.push({id:'treeMeat',text:'Zieh eine Beute auf einen Baum',need:1});
  if(S.b.climb) pool.push({id:'treeEat',text:'Friss oben in einem Baum',need:1});
  if(S.b.roar) pool.push({id:'roar',text:'Verjag ein Raubtier mit Brüllen',need:1});
  pool.push({id:'stalk',text:'Pirsch dich 40 m schleichend an',need:40});
  if(S.cub&&S.cub.grow<1) pool.push({id:'denMeat',text:'Zieh eine Beute zum Bau für dein Junges',need:1});
  if(S.cub&&S.cub.grow<1) pool.push({id:'feed',text:'Bring deinem Jungen 6 Portionen Futter',need:6});
  if(S.cub&&S.cub.grow>=0.25&&S.cub.grow<1) pool.push({id:'cubhunt',text:'Erlege 2 Beuten, während dein Junges zusieht',need:2});
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)), t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
  // Serie: gestern nicht alle geschafft → von vorn
  if(S.goals&&S.goals.list&&!S.goals.list.every(g=>g.done)&&(S.goalStreak||0)>0){ S.goalStreak=0; setTimeout(()=>toast('Serie gerissen – heute neu anfangen!','#b9b7a6'),2200); }
  const xp=goalXp();
  S.goals={day:S.day||0,list:pool.slice(0,3).map(g=>Object.assign(g,{have:0,done:false,xp}))};
  goalHtml=''; save();
}
/** Bonus-Erfahrung für ein Tagesziel: ein knappes Drittel der aktuellen Stufe */
const goalXp=()=>Math.round(xpNeed(S.lvl)*0.3);
function goalEvent(type,n,extra){
  tutEvent(type);
  if(!S.goals) return;
  for(const g of S.goals.list){
    if(g.done) continue;
    let add=0;
    if(type==='kill'){ if(g.id==='kill') add=1; else if(g.id==='sp:'+extra.sp) add=1; else if(g.id==='night'&&extra.night) add=1; else if(g.id==='herd'&&extra.herd) add=1; }
    else if(type===g.id) add=n||1;
    if(!add) continue;
    const before=Math.floor(g.have); g.have=Math.min(g.need,g.have+add);
    if(g.have>=g.need){ g.done=true; const xp=g.xp||goalXp(); snd.level(); bump=g;
      toast('Tagesziel erfüllt: '+g.text+' · +'+xp+' EP','#9be07f'); gainXp(xp);
      if(S.goals.list.every(x=>x.done)) allDone(); }
    else if(Math.floor(g.have)>before) bump=g;   // sichtbarer Fortschritt: Zeile leuchtet kurz auf
    goalHtml=''; save();
  }
}
/** Alle drei geschafft: Punkt für jeden Spieler, Serie zählt hoch, jeder dritte Serientag ein Extrapunkt */
function allDone(){
  S.goalStreak=(S.goalStreak||0)+1; const pts=1+(S.goalStreak%3===0?1:0);
  for(const p of players){ p.L.pts+=pts; }
  setTimeout(()=>{ snd.level(); toast('Alle Tagesziele! +'+pts+' Punkt'+(pts>1?'e':'')+' für Eigenschaften & Fähigkeiten'+(S.goalStreak>1?' · Serie: '+S.goalStreak+' Tage':''),'#f2b84b'); },1600);
  save();
}
let goalHtml='', bump=null, bumpT=0;
function renderGoals(){
  const el=$('goalBox'); if(!S.goals) newGoals();
  if(tutActive()){ el.style.display='none'; return; }   // während der Einführung nur eine Aufgabe auf einmal
  const L=S.goals.list, dn=L.filter(g=>g.done).length, st=S.goalStreak||0, next=1+((st+1)%3===0?1:0);
  if(bump){ bumpT=performance.now(); goalHtml=''; }
  const glow=performance.now()-bumpT<1200;
  const h='<div class="gh">Tagesziele '+dn+'/'+L.length+(st>0?' <span class="gs">🔥 '+st+'</span>':'')+'</div>'
    +L.map(g=>'<div class="gl'+(g.done?' done':'')+(glow&&g===bump?' bump':'')+'"><span>'+(g.done?'✔':'○')+'</span><span>'+g.text+(g.done||g.need<2?'':' ('+Math.floor(g.have)+'/'+g.need+')')
      +' <i class="gx">+'+(g.xp||goalXp())+' EP</i></span></div>').join('')
    +(dn<L.length?'<div class="gb">Alle '+L.length+': <b>+'+next+' Punkt'+(next>1?'e':'')+'</b>'+(st>0?' · Serie hält':'')+'</div>':'<div class="gb ok">Alle geschafft! Morgen geht die Serie weiter.</div>');
  bump=null; if(!glow&&goalHtml.indexOf(' bump')>=0) goalHtml='';
  if(h!==goalHtml){ goalHtml=h; el.innerHTML=h; } el.style.display='block';
}

export { goalEvent, newGoals, renderGoals };
