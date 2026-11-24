// LeoLife – Tierlexikon und Erfahrung für Spielweise: Arten entdecken, unbemerkt anpirschen, Beute im Baum,
// eine Nacht ohne Verletzung, ein Junges vor einem Räuber retten.
import { gainXp } from './actions.js';
import { animals } from './animals.js';
import { tell } from './coop.js';
import { SPECIES } from './data.js';
import { dayF } from './daynight.js';
import { G } from './state.js';
import { players } from './player.js';
import { S, pScale, save } from './save.js';
import { H } from './terrain.js';
import { floatText } from './ui.js';
import { $ } from './util.js';

/* ---------- Tierlexikon ---------- */
const LEX={
  maus:'Ein schneller Happen für Jungtiere – später kaum der Rede wert.',
  hase:'Schnell und schreckhaft. Aus dem hohen Gras heraus anspringen.',
  capy:'Lebt in Gruppen nahe am Wasser. Ihre Jungen sind leichte Beute, die Eltern wehren sich nicht.',
  wart:'Flieht mit hochgestelltem Schwanz in seinen Bau und schläft dort nachts. Wer geduckt in der Nähe wartet, erwischt es beim Herauskommen.',
  boar:'Wehrt sich mit den Hauern. Bachen verteidigen ihre Frischlinge – halte Abstand zu den Kleinen.',
  deer:'Aufmerksam, mit gutem Gehör. Hirschkühe verteidigen ihre Kälber; Madenhacker auf dem Rücken warnen sie.',
  anti:'Sehr schnell und wachsam. Nur aus dem Hinterhalt zu erwischen.',
  giant:'Riesig und wehrhaft – Beute nur für ausgewachsene Leoparden.',
  jack:'Jagt im Rudel junge Leoparden. Später leichte Beute.',
  hyena:'Kommt zu jedem Kadaver. Bring deine Beute auf einen Baum – dort kommt sie nicht heran.',
  lion:'Der gefährlichste Jäger der Savanne. Lange meiden; Löwinnen verteidigen ihre Jungen.',
  croc:'Lauert abgetaucht im Wasserloch. Luftblasen verraten es – im trüben Tümpel nur Wellen und Geduld.',
  bigcroc:'Herrscht über das größte Wasserloch. Ein Kampf für Alpha-Leoparden.',
  snake:'Liegt getarnt im Gras und zischt, bevor sie beißt. Ihr Gift wirkt nach.',
  gnu:'Zieht in großen Herden durch die Savanne. Achtung vor den trampelnden Hufen.',
  rival:'Ein fremder Leopard, der dein Revier will.',
  poacher:'Schießt auf alles, was sich bewegt. Vertreiben, nicht töten – Brüllen hilft.'
};
const LEX_XP=10, LEX_BOSS_XP=40;
const lexIds=SPECIES.filter(s=>LEX[s.id]).map(s=>s.id);
const lex=()=>S.lex||(S.lex={});
/** Spieler p sieht Tier a deutlich genug, um es ins Lexikon aufzunehmen? */
function seesClearly(p,a,d){
  if(a.hidden) return false;
  if(a.sp.croc&&(a.state==='lurk'||a.state==='stalk')&&d>12) return false;
  if(a.sp.snake&&a.state==='lurk'&&d>6) return false;
  return d<Math.max(22,a.sp.size*18);
}
function discover(p,a){
  const id=a.sp.id, L=lex(); if(L[id]) return; L[id]=1; save();
  const xp=a.sp.boss?LEX_BOSS_XP:LEX_XP;
  floatText('Neu im Lexikon: '+a.sp.n+' +'+xp+' EP',p.x,p.y+2.2*pScale(p.L),p.z,'#c9e7a0');
  tell(p,a.sp.n+': '+LEX[id],'#c9e7a0');
  gainXp(xp,p); renderLexBtn();
}
function renderLexBtn(){ const b=$('btnLex'); if(b) b.textContent='Tierlexikon ('+lexIds.filter(id=>lex()[id]).length+'/'+lexIds.length+')'; }
function renderLex(){
  const L=lex();
  $('lexList').innerHTML=lexIds.map(id=>{ const sp=SPECIES.find(s=>s.id===id);
    return L[id]?'<div class="lx"><b>'+sp.n+'</b><span>'+LEX[id]+'</span></div>':'<div class="lx off"><b>???</b></div>'; }).join('');
}
function openLex(){ renderLex(); $('menu').style.display='none'; $('lex').style.display='flex'; }
function closeLex(){ $('lex').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const lexOpen=()=>$('lex').style.display==='flex';
$('btnLex').onclick=openLex; $('btnLexBack').onclick=closeLex;
renderLexBtn();

/* ---------- Erfahrung für Spielweise ---------- */
const STALK_XP=15, NIGHT_XP=40;
/** Unbemerkt angepirscht: schleichend bis auf wenige Meter an Wild, das nichts bemerkt hat */
function stalkCheck(p){
  if(!p.sneak||p.tree!=null||p.dead) return;
  const now=performance.now(); if(now-(p.stalkAt||-1e9)<30000) return;
  for(const a of animals){
    if(a.dead||a.sp.pred||a.sp.friend||a.sp.human||a.sp.croc||a.sp.snake||a.sp.size<0.5||a.state!=='wander'||a.held) continue;
    const d=Math.hypot(a.x-p.x,a.z-p.z); if(d>a.rad+3.2) continue;
    if(now-(a.stalkAt||-1e9)<90000) continue;
    a.stalkAt=now; p.stalkAt=now;
    floatText('Unbemerkt angepirscht! +'+STALK_XP+' EP',p.x,p.y+2*pScale(p.L),p.z,'#9be07f'); gainXp(STALK_XP,p); return;
  }
}
/** Eine ganze Nacht ohne Verletzung überstanden */
function nightCheck(p){
  if(dayF<0.25&&!p.inNight){ p.inNight=true; p.nightHurt=false; }
  if(dayF>0.6&&p.inNight){ p.inNight=false;
    if(!p.dead&&!p.nightHurt){ floatText('Nacht überstanden! +'+NIGHT_XP+' EP',p.x,p.y+2*pScale(p.L),p.z,'#f2d48a'); tell(p,'Du hast die Nacht ohne Verletzung überstanden.','#f2d48a'); gainXp(NIGHT_XP,p); } }
}
let lexTick=0;
function updateLexicon(dt){
  lexTick-=dt; if(lexTick>0) return; lexTick=0.4;
  for(const p of players){
    if(p.dead) continue;
    nightCheck(p); stalkCheck(p);
    for(const a of animals){ if(a.dead||!a.g.visible||!LEX[a.sp.id]||lex()[a.sp.id]) continue; const d=Math.hypot(a.x-p.x,a.z-p.z); if(seesClearly(p,a,d)) discover(p,a); }
  }
}

export { lexOpen, closeLex, updateLexicon };
