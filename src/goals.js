// LeopardLife – Tagesziele.
import { gainXp } from './actions.js';
import { animals } from './animals.js';
import { snd } from './audio.js';
import { ART, SPECIES } from './data.js';
import { S, save, xpNeed } from './save.js';
import { toast } from './ui.js';
import { $ } from './util.js';

/* ---------- Tagesziele ---------- */
// Zu jedem Sonnenaufgang drei neue Aufgaben; jede bringt einen Teil der nächsten Stufe als Bonus-Erfahrung.
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
  if(S.cub&&S.cub.grow<1) pool.push({id:'feed',text:'Bring deinem Jungen 6 Portionen Futter',need:6});
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)), t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
  S.goals={day:S.day||0,list:pool.slice(0,3).map(g=>Object.assign(g,{have:0,done:false}))};
  goalHtml=''; save();
}
function goalEvent(type,n,extra){
  if(!S.goals) return;
  for(const g of S.goals.list){
    if(g.done) continue;
    let add=0;
    if(type==='kill'){ if(g.id==='kill') add=1; else if(g.id==='sp:'+extra.sp) add=1; else if(g.id==='night'&&extra.night) add=1; else if(g.id==='herd'&&extra.herd) add=1; }
    else if(type===g.id) add=n||1;
    if(!add) continue;
    g.have=Math.min(g.need,g.have+add);
    if(g.have>=g.need){ g.done=true; const xp=Math.round(xpNeed(S.lvl)*0.3); snd.level();
      toast('Tagesziel erfüllt: '+g.text+' · +'+xp+' EP','#9be07f'); gainXp(xp); }
    goalHtml=''; save();
  }
}
let goalHtml='';
function renderGoals(){
  const el=$('goalBox'); if(!S.goals) newGoals();
  const L=S.goals.list, dn=L.filter(g=>g.done).length;
  const h='<div class="gh">Tagesziele '+dn+'/'+L.length+'</div>'+L.map(g=>'<div class="gl'+(g.done?' done':'')+'"><span>'+(g.done?'✔':'○')+'</span><span>'+g.text+(g.done||g.need<2?'':' ('+Math.floor(g.have)+'/'+g.need+')')+'</span></div>').join('');
  if(h!==goalHtml){ goalHtml=h; el.innerHTML=h; } el.style.display='block';
}

export { goalEvent, newGoals, renderGoals };
