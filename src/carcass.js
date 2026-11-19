// LeopardLife – Kadaver, Aasfresser, Herden und Ahnenbuch.
import { animals } from './animals.js';
import { snd } from './audio.js';
import { DIFF, ICOL, TRAITS, ico } from './data.js';
import { dropOrbs, meatOrbs, puff } from './effects.js';
import { FOOD_MAX } from './family.js';

import { animLegs, furColor, furName } from './models.js';
import { P, players } from './player.js';
import { LINES_KEY, S, maxHp } from './save.js';
import { G } from './state.js';
import { H } from './terrain.js';
import { floatText, toast } from './ui.js';
import { $ } from './util.js';
import { goalEvent } from './goals.js';
import { related } from './kinship.js';

/* ---------- Kadaver, Aasfresser, Herden, Ahnenbuch ---------- */
// Kadaver: Beute ab der Größe eines Schakals bleibt liegen. Jeder Bissen ist eine Kugel über dem Kadaver – je größer das Tier,
// desto mehr Bissen (FOOD in data.js). Alle Spieler und Aasfresser fressen davon, bis nichts mehr übrig ist oder er verdirbt.
const BITE_T=0.7;
function makeCarcass(a,meat){
  const life=40+8*meat;
  a.carc={t:life,meat,orbs:meatOrbs(meat,a.x,H(a.x,a.z)+a.sp.size*1.4+0.6,a.z)}; a.carc.orbs.userData.y0=a.carc.orbs.position.y;
  a.g.visible=true; a.g.rotation.z=Math.PI/2;
  a.g.position.set(a.x,H(a.x,a.z)+a.sp.size*0.22,a.z); animLegs(a.g,0,0);
  const sc=animals.filter(o=>!o.dead&&(o.sp.id==='hyena'||o.sp.id==='jack')&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<150)
    .sort((p,q)=>(p.sp.id==='hyena'?0:1)-(q.sp.id==='hyena'?0:1)||Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z)).slice(0,2);
  sc.forEach(o=>{ o.state='scav'; o.carc=a; o.eatT=0; o.sus=0; });
  if(sc.length&&Math.hypot(P.x-a.x,P.z-a.z)<80){ const hy=sc[0].sp.id==='hyena';
    setTimeout(()=>toast((hy?'Hyänen':'Schakale')+' haben die Beute gewittert und kommen!'+(sc[0].sp.hunt&&S.lvl<sc[0].sp.hunt?' Nimm dir, was du brauchst, und verschwinde.':''),'#f2b84b'),1200); }
}
/** Kadaver a ist weg (leer, verdorben oder Tier neu gesetzt) */
function endCarcass(a){ if(!a.carc) return; dropOrbs(a.carc.orbs); a.carc=null; }
/** Kadaver mit Fleisch in Reichweite von Spieler p, sonst null */
function nearCarcass(p=P){ for(const a of animals){ if(a.carc&&a.carc.meat>0&&Math.hypot(a.x-p.x,a.z-p.z)<a.rad+2.6) return a; } return null; }
/** Spieler p: Fleisch für das Junge in den Vorrat mitnehmen (store) oder anfangen zu fressen (Bissen für Bissen, bis satt) */
function takeMeat(c,store,p=P){
  if(store){ const n=Math.min(c.carc.meat,FOOD_MAX-S.food); if(n<=0) return; S.food+=n; c.carc.meat-=n; snd.eat();
    puff(c.x,H(c.x,c.z)+0.6,c.z,0xc0392b,5,0.4); floatText('+'+n+' Futter im Vorrat',c.x,H(c.x,c.z)+1.4,c.z,'#ff9ad0'); return; }
  if(p.L.hunger>=100) return;
  p.eatC=c; p.eatT=BITE_T*0.6; goalEvent('meat',1);
}
/** Fressen läuft: alle BITE_T Sekunden ein Bissen (+10 Hunger, etwas Leben). Endet bei Bewegung, satt, leer oder zu weit weg. */
function updateEating(p,dt){
  const c=p.eatC; if(!c) return;
  const L=p.L, moving=Math.hypot(p.ctl.fw,p.ctl.rt)>0.1;
  if(p.dead||moving||p.tree!=null||!c.carc||c.carc.meat<=0||L.hunger>=100||Math.hypot(c.x-p.x,c.z-p.z)>c.rad+3.2){ p.eatC=null; return; }
  p.eatT+=dt; if(p.eatT<BITE_T) return; p.eatT=0;
  c.carc.meat--; L.hunger=Math.min(100,L.hunger+10); p.hp=Math.min(maxHp(L),p.hp+maxHp(L)*0.05);
  snd.eat(); puff(c.x,H(c.x,c.z)+0.6,c.z,0xc0392b,3,0.35);
  if(L.hunger>=100) floatText('satt',p.x,p.y+1.8,p.z,'#e0a060');
}
// Herden: Wasserschweine, Hirsche und Antilopen ziehen in Gruppen. Flieht eines, fliehen die Nachbarn mit.
const herdLead=a=>{ for(const m of a.herd) if(!m.dead) return m; return a; };
function startFlee(a){
  a.state='flee'; a.fleeT=0;
  if(a.herd) for(const m of a.herd) if(m!==a&&!m.dead&&m.state==='wander'&&Math.hypot(m.x-a.x,m.z-a.z)<40){ m.state='flee'; m.fleeT=0; m.sus=0; }
}
// Ahnenbuch: jede Generation der Blutlinie mit Fell, Erbanlagen, Stufe, Beute und Schicksal
/** Trägt einen Leoparden ins Ahnenbuch ein. L: seine Werte (Standard Spieler 1), who: Name eines Mitspielers */
function recordAncestor(cause,L=S,who){ S.anc=(S.anc||[]).concat({g:L.gen||S.gen||1,l:L.lvl,f:L.fur?Object.assign({},L.fur):null,t:(L.traits||[]).slice(),k:L.kills||0,c:cause,w:who||null,i:L.id||'',p:(L.parents||[]).slice()}).slice(-40); }
/** Fremden Partner (wilder Leopard) für den Stammbaum merken */
function recordPartner(id,fur,gen,cause){ S.tree=S.tree||{}; S.tree[id]={g:gen,f:fur?Object.assign({},fur):null,c:cause||'wilder Leopard'};
  const ks=Object.keys(S.tree); if(ks.length>60) ks.sort((a,b)=>S.tree[a].g-S.tree[b].g).slice(0,ks.length-60).forEach(k=>delete S.tree[k]); }
/* Stammbaum: Generationen als Reihen (älteste oben), Linien von den Eltern zum Kind */
function treeNodes(){
  const N={}, add=(id,o)=>{ if(id&&!N[id]) N[id]=Object.assign({id},o); };
  add(S.id,{g:S.gen||1,f:S.fur,n:players.length>1?'Spieler 1':'Du',c:'lebt · Stufe '+S.lvl,me:true,p:S.parents||[]});
  Object.keys(S.mates||{}).sort().forEach(k=>{ const L=S.mates[k]; add(L.id,{g:L.gen||S.gen||1,f:L.fur,n:'Spieler '+k,c:'lebt · Stufe '+L.lvl,me:true,p:L.parents||[]}); });
  (S.anc||[]).slice().reverse().forEach(e=>{ if(e.i) add(e.i,{g:e.g,f:e.f,n:e.w||'Generation '+e.g,c:'Stufe '+e.l+' · '+e.c,p:e.p||[]}); });
  for(const id in (S.tree||{})){ const t=S.tree[id]; add(id,{g:t.g,f:t.f,n:'Partner',c:t.c,p:[]}); }
  if(S.cub&&S.cub.n>0) add('cub',{g:S.cub.gen||(S.gen||1)+1,f:S.cub.fur,n:S.cub.n>1?S.cub.n+' Junge':'Junges',c:'im Bau',p:S.cub.parents||[]});
  // Eltern, die nirgends verzeichnet sind (ältere Spielstände): als unbekannt zeigen
  Object.values(N).forEach(o=>o.p.forEach(pid=>{ if(pid&&!N[pid]) N[pid]={id:pid,g:o.g-1,f:null,n:'unbekannt',c:'',p:[]}; }));
  return Object.values(N);
}
function renderTree(){
  const nodes=treeNodes(), W=118, Hh=58, GX=16, GY=46, rows={};
  nodes.forEach(n=>(rows[n.g]=rows[n.g]||[]).push(n));
  const gens=Object.keys(rows).map(Number).sort((a,b)=>a-b), pos={};
  gens.forEach((g,ri)=>{
    const row=rows[g], key=n=>{ const ps=n.p.filter(x=>pos[x]); return ps.length?ps.reduce((s,x)=>s+pos[x].x,0)/ps.length:null; };
    row.forEach(n=>n.k=key(n));
    // Partner ohne eigene Eltern im Baum: neben den Leoparden, mit dem sie Junge haben
    const base=row.filter(n=>n.k!=null).sort((a,b)=>a.k-b.k), loose=row.filter(n=>n.k==null), out=[];
    const mateOf=n=>{ const kid=nodes.find(c=>c.p.indexOf(n.id)>=0); return kid?row.find(m=>m!==n&&kid.p.indexOf(m.id)>=0):null; };
    base.forEach(n=>{ out.push(n); loose.filter(o=>mateOf(o)===n).forEach(o=>out.push(o)); });
    loose.forEach(o=>{ if(out.indexOf(o)>=0) return; const m=mateOf(o), i=m?out.indexOf(m):-1; if(i>=0) out.splice(i+1,0,o); else out.push(o); });
    // unter die Eltern rücken, ohne sich zu überlappen
    let nx=0; out.forEach(n=>{ const ps=n.p.filter(x=>pos[x]), want=ps.length?ps.reduce((a,x)=>a+pos[x].x,0)/ps.length:nx; const x=Math.max(nx,want); pos[n.id]={x,y:ri*(Hh+GY),n}; nx=x+W+GX; });
  });
  const wid=Math.max(...Object.values(pos).map(q=>q.x))+W, hei=gens.length*(Hh+GY);
  let lines='', boxes='';
  const fams={};
  nodes.forEach(n=>{ const c=pos[n.id], ps=n.p.map(x=>pos[x]).filter(Boolean); if(!ps.length) return;
    const fk=n.p.slice().sort().join('+'); if(fams[fk]==null) fams[fk]=Object.keys(fams).length;
    const mx=ps.reduce((s,q)=>s+q.x,0)/ps.length+W/2, py=ps[0].y+Hh, my=c.y-GY/2+((fams[fk]%3)-1)*6;
    ps.forEach(q=>{ lines+='<path d="M'+(q.x+W/2)+' '+py+' V'+my+' H'+mx+'"/>'; });
    lines+='<path d="M'+mx+' '+my+' H'+(c.x+W/2)+' V'+c.y+'"/>'; });
  nodes.forEach(n=>{ const c=pos[n.id], col=n.f?furColor(0xe0a23c,n.f):0x8a7a5a;
    boxes+='<div class="tn'+(n.me?' me':'')+'" style="left:'+c.x+'px;top:'+c.y+'px;width:'+W+'px;height:'+Hh+'px"><span class="sw" style="background:'+hex6(col)+'"></span><b>'+esc(n.n)+'</b><small>'+esc(furName(n.f))+'</small><small>'+esc(n.c)+'</small></div>'; });
  $('bookTree').innerHTML='<div class="tree" style="width:'+wid+'px;height:'+hei+'px"><svg width="'+wid+'" height="'+hei+'">'+lines+'</svg>'+boxes+'</div>';
}
function archiveLine(){
  let L=[]; try{ L=JSON.parse(localStorage.getItem(LINES_KEY)||'[]'); }catch(e){}
  L.unshift({g:S.gen||1,d:S.diff,at:Date.now()}); try{ localStorage.setItem(LINES_KEY,JSON.stringify(L.slice(0,10))); }catch(e){}
}
const hex6=n=>'#'+n.toString(16).padStart(6,'0');
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderBook(){
  renderTree();
  const row=(e,me)=>{ const col=e.f?furColor(0xe0a23c,e.f):0xe0a23c;
    return '<div class="anc"><span class="sw" style="background:'+hex6(col)+'"></span><div><b>Generation '+e.g+(me?' · du':'')+(e.w?' · '+esc(e.w):'')+'</b>'+
      '<small>Stufe '+e.l+' · Fell: '+esc(furName(e.f))+' · '+e.k+' Beutetier'+(e.k===1?'':'e')+'</small>'+
      '<small>'+(e.t.length?e.t.map(t=>'<span class="tchip">'+ico(t,ICOL.t,13)+(TRAITS[t]?TRAITS[t][0]:t)+'</span>').join(''):'Erbanlagen: keine')+'</small>'+
      '<small style="color:'+(me?'#9be07f':'var(--txt)')+'">'+esc(e.c)+'</small></div></div>'; };
  const cur={g:S.gen||1,l:S.lvl,f:S.fur,t:S.traits,k:S.kills||0,c:'lebt'};
  // Mitspieler im gemeinsamen Spiel: lebende Leoparden der Familie, mit Verwandtschaft zu Spieler 1
  const mates=Object.keys(S.mates||{}).sort().map(n=>{ const L=S.mates[n]; return {g:L.gen||S.gen||1,l:L.lvl,f:L.fur,t:L.traits||[],k:L.kills||0,w:'Spieler '+n,c:'lebt'+(related(S,L)?' · verwandt mit Spieler 1':' · nicht verwandt mit Spieler 1')}; });
  $('bookList').innerHTML=row(cur,true)+mates.map(e=>row(e,false)).join('')+(S.anc||[]).slice().reverse().map(e=>row(e,false)).join('');
  let L=[]; try{ L=JSON.parse(localStorage.getItem(LINES_KEY)||'[]'); }catch(e){}
  $('bookLines').innerHTML=L.length?L.map(l=>'<div style="font-size:12px;color:var(--mut);padding:2px 0">Endete in Generation '+l.g+' · '+(DIFF[l.d]?DIFF[l.d].n:'Normal')+' · '+new Date(l.at).toLocaleDateString('de-DE')+'</div>').join(''):'<div style="font-size:12px;color:var(--mut)">Noch keine.</div>';
}
function openBook(){ renderBook(); $('menu').style.display='none'; $('book').style.display='flex'; }
function closeBook(){ $('book').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const bookOpen=()=>$('book').style.display==='flex';
$('btnBook').onclick=openBook;
$('btnBookBack').onclick=closeBook;

export { esc, herdLead, startFlee };
export { recordPartner, renderTree, treeNodes };
export { archiveLine, bookOpen, closeBook, endCarcass, makeCarcass, nearCarcass, recordAncestor, takeMeat, updateEating };
