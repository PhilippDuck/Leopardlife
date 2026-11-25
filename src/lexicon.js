// LeoLife – Tierlexikon und Erfahrung für Spielweise: Arten entdecken, unbemerkt anpirschen, Beute im Baum,
// eine Nacht ohne Verletzung, ein Junges vor einem Räuber retten.
import { gainXp } from './actions.js';
import { animals } from './animals.js';
import { vultureSpots } from './birds.js';
import { tell } from './coop.js';
import { SPECIES } from './data.js';
import { dayF } from './daynight.js';
import { G } from './state.js';
import { players } from './player.js';
import { S, pScale, save } from './save.js';
import { H } from './terrain.js';
import { floatText } from './ui.js';
import { $ } from './util.js';
import { fowlSpots, oxpeckerSpots } from './wildbirds.js';

/* ---------- Tierlexikon ---------- */
const LEX={
  maus:'Ein schneller Happen für Jungtiere – später kaum der Rede wert.',
  hase:'Schnell und schreckhaft. Aus dem hohen Gras heraus anspringen.',
  capy:'Lebt in Gruppen nahe am Wasser. Ihre Jungen sind leichte Beute, die Eltern wehren sich nicht.',
  wart:'Flieht mit hochgestelltem Schwanz in seinen Bau und schläft dort nachts. Wer geduckt in der Nähe wartet, erwischt es beim Herauskommen.',
  baboon:'Lebt im Trupp mit Jungen und schläft in Bäumen. Bellt bei Gefahr Alarm – dann flieht alles Wild ringsum. Sitzt ein Leopard in ihrem Baum, klettern die Männchen hinauf und greifen an. Junge abseits des Trupps sind leichte Beute.',
  boar:'Wehrt sich mit den Hauern. Bachen verteidigen ihre Frischlinge – halte Abstand zu den Kleinen.',
  deer:'Aufmerksam, mit gutem Gehör. Hirschkühe verteidigen ihre Kälber; Madenhacker auf dem Rücken warnen sie.',
  anti:'Sehr schnell und wachsam. Nur aus dem Hinterhalt zu erwischen.',
  giant:'Riesig und wehrhaft – Beute nur für ausgewachsene Leoparden.',
  jack:'Jagt im Rudel junge Leoparden. Später leichte Beute.',
  hyena:'Kommt zu jedem Kadaver. Bring deine Beute auf einen Baum – dort kommt sie nicht heran.',
  lion:'Der gefährlichste Jäger der Savanne. Lange meiden; Löwinnen verteidigen ihre Jungen.',
  croc:'Lauert abgetaucht im Wasserloch. Luftblasen verraten es – im trüben Tümpel nur Wellen und Geduld.',
  ele:'Zieht in Herden mit Jungen umher und trifft sich an den Wasserlöchern. Keine Beute. Kommst du zu nahe, droht ein Tier mit gespreizten Ohren und Trompeten – weich zurück, sonst trampelt es dich nieder.',
  hippo:'Döst tagsüber in großen Wasserlöchern, nur Rücken, Augen und Ohren schauen heraus. Nachts grast es am Ufer. Keine Beute: Wer zwischen ein Nilpferd und sein Wasser gerät, wird angegriffen – reißt es das Maul auf, sofort zur Seite.',
  bigcroc:'Herrscht über das größte Wasserloch. Ein Kampf für Alpha-Leoparden.',
  snake:'Liegt getarnt im Gras und zischt, bevor sie beißt. Ihr Gift wirkt nach.',
  gnu:'Zieht in großen Herden durch die Savanne. Achtung vor den trampelnden Hufen.',
  rival:'Ein fremder Leopard, der dein Revier will.',
  poacher:'Schießt auf alles, was sich bewegt. Vertreiben, nicht töten – Brüllen hilft.'
};
const LEX_XP=5;
/* Vögel sind keine SPECIES: eigene Einträge, entdeckt, sobald einer sichtbar und nah genug ist (r: Abstand am Boden) */
const LEX_BIRDS=[
  {id:'vulture',n:'Geier',r:35,spots:vultureSpots,tip:'Kreisen über jedem Kadaver, der am Boden liegt – und verraten ihn von Weitem. Wer sich nähert, verscheucht sie.'},
  {id:'fowl',n:'Perlhühner',r:18,spots:fowlSpots,tip:'Picken in kleinen Trupps im Gras und schlagen laut Alarm, wenn ein Jäger kommt. Schleichend kommst du näher heran.'},
  {id:'oxpecker',n:'Madenhacker',r:15,spots:oxpeckerSpots,tip:'Sitzen auf dem Rücken großer Huftiere und warnen sie zischend. Schleich dich langsam an.'}
];
const lexIds=SPECIES.filter(s=>LEX[s.id]).map(s=>s.id).concat(LEX_BIRDS.map(b=>b.id));
const lex=()=>S.lex||(S.lex={});
const lexEntry=id=>{ const b=LEX_BIRDS.find(o=>o.id===id); if(b) return {n:b.n,tip:b.tip}; const sp=SPECIES.find(o=>o.id===id); return {n:sp.n,tip:LEX[id]}; };
/** Spieler p sieht Tier a deutlich genug, um es ins Lexikon aufzunehmen? */
function seesClearly(p,a,d){
  if(a.hidden) return false;
  if(a.sp.croc&&(a.state==='lurk'||a.state==='stalk')&&d>12) return false;
  if(a.sp.snake&&a.state==='lurk'&&d>6) return false;
  return d<Math.max(22,a.sp.size*18);
}
function discoverId(p,id,xp){
  const L=lex(); if(L[id]) return; L[id]=1; save();
  const e=lexEntry(id);
  floatText('Neu im Lexikon: '+e.n+' +'+xp+' EP',p.x,p.y+2.2*pScale(p.L),p.z,'#c9e7a0');
  tell(p,e.n+': '+e.tip,'#c9e7a0');
  gainXp(xp,p); renderLexBtn();
}
const discover=(p,a)=>discoverId(p,a.sp.id,LEX_XP);
/** Vögel: sichtbar und nah genug? */
function birdCheck(p){
  for(const b of LEX_BIRDS){ if(lex()[b.id]) continue;
    if(b.spots().some(o=>Math.hypot(o.x-p.x,o.z-p.z)<b.r)) discoverId(p,b.id,LEX_XP); }
}
function renderLexBtn(){ const b=$('btnLex'); if(b) b.textContent='Tierlexikon ('+lexIds.filter(id=>lex()[id]).length+'/'+lexIds.length+')'; }
function renderLex(){
  const L=lex();
  $('lexList').innerHTML=lexIds.map(id=>{ if(!L[id]) return '<div class="lx off"><b>???</b></div>';
    const e=lexEntry(id); return '<div class="lx"><b>'+e.n+'</b><span>'+e.tip+'</span></div>'; }).join('');
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
    nightCheck(p); stalkCheck(p); birdCheck(p);
    for(const a of animals){ if(a.dead||!a.g.visible||!LEX[a.sp.id]||lex()[a.sp.id]) continue; const d=Math.hypot(a.x-p.x,a.z-p.z); if(seesClearly(p,a,d)) discover(p,a); }
  }
}

export { lexOpen, closeLex, updateLexicon };
