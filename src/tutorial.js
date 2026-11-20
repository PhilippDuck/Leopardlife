// LeopardLife – Erste Schritte: ein geführtes erstes Leben für neue Spieler.
// Oben in der Mitte steht immer genau eine Aufgabe; ist sie erfüllt, kommt die nächste. Die Texte passen sich an die
// Steuerung an (Tastatur, Touch, Controller). Einmal durchgespielt oder übersprungen, kommt die Einführung nicht wieder
// (Einstellungen → „Einführung wiederholen“). Wer schon weiter ist (Stufe > 3 oder spätere Generation), sieht sie nicht.
import { snd } from './audio.js';
import { P } from './player.js';
import { S } from './save.js';
import { G } from './state.js';
import { $ } from './util.js';
import { padUI } from './gamepad.js';
import { touchUI } from './input.js';

const KEY='jaguar-tut';
const K=(key,touch,pad)=>()=>padUI()?pad:touchUI()?touch:key;
const spent=()=>Object.values(S.a).reduce((x,y)=>x+y,0)+Object.values(S.b).reduce((x,y)=>x+y,0);
/** Aufgaben: Titel, Text je Steuerung, wann erfüllt (st = Zustand dieser Aufgabe), oder auto = nach so vielen Sekunden weiter */
const STEPS=[
  {t:'Laufen und umsehen',x:K('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> laufen, mit der <kbd>Maus</kbd> umsehen.',
    'Daumen links aufsetzen und schieben = laufen. Rechts wischen = umsehen.','Linker Stick laufen, rechter Stick umsehen.'),
    done:st=>st.dist>12},
  {t:'Schleichen und verstecken',x:K('<kbd>C</kbd> schaltet Schleichen ein – geh so ins <b>hohe Gras</b>. Erscheint oben links „Versteckt“, sieht dich kaum ein Tier.',
    'Tippe <b>Schleichen</b> und geh so ins <b>hohe Gras</b>. Erscheint oben links „Versteckt“, sieht dich kaum ein Tier.','Ⓑ schaltet Schleichen ein – geh so ins <b>hohe Gras</b>. Erscheint oben links „Versteckt“, sieht dich kaum ein Tier.'),
    done:st=>st.hid>1.2},
  {t:'Die Spürkarte',x:()=>'Rechts oben siehst du die Tiere um dich: <b style="color:#9be07f">grün</b> = Beute, <b style="color:#f2b84b">gold</b> = wehrt sich, <b style="color:#ff5a3c">rot</b> = gefährlich für dich. Der <b style="color:#96cdff">blaue Pfeil</b> ist der Wind – pirsch dich gegen den Wind an.',
    auto:10},
  {t:'Die erste Jagd',x:K('Schleich dich an eine <b>Maus</b> oder einen <b>Hasen</b>. Wird das Fadenkreuz golden, ist sie in Reichweite: <kbd>Leertaste</kbd> oder <kbd>Klick</kbd> = Sprungangriff.',
    'Schleich dich an eine <b>Maus</b> oder einen <b>Hasen</b>. Wird das Fadenkreuz golden, ist sie in Reichweite: <b>rechts doppeltippen</b> = Sprungangriff.','Schleich dich an eine <b>Maus</b> oder einen <b>Hasen</b>. Wird das Fadenkreuz golden, ist sie in Reichweite: <b>RT</b> = Sprungangriff.'),
    done:st=>st.kills>=1},
  {t:'Wachsen',x:()=>'Gut gemacht! Jede Beute bringt Erfahrung. Erlege noch zwei Tiere – dann steigst du eine Stufe auf.',
    done:st=>st.kills>=2||S.pts>0},
  {t:'Stärker werden',x:K('Du hast Punkte! <kbd>Tab</kbd> öffnet <b>Eigenschaften &amp; Fähigkeiten</b> – verteile sie mit <b>+</b>.',
    'Du hast Punkte! <b>☰ Menü → Eigenschaften &amp; Fähigkeiten</b> – verteile sie mit <b>+</b>.','Du hast Punkte! Die <b>Ansicht-Taste ⧉</b> öffnet die Entwicklung – Steuerkreuz wählt, Ⓐ verteilt.'),
    done:st=>spent()>st.sp0, wait:()=>S.pts>0, waitText:()=>'Jage weiter, bis du aufsteigst – dann gibt es Punkte zu verteilen.'},
  {t:'Gefahr erkennen',x:()=>'Pfeile am Bildrand zeigen Raubtiere: <b style="color:#f2d04b">gelb</b> ahnungslos, <b style="color:#ff9a3c">orange</b> misstrauisch, <b style="color:#ff4a30">rot</b> jagt dich. Dann schnell ins hohe Gras schleichen – oder später auf einen Baum.',
    auto:12},
  {t:'Satt bleiben',x:()=>'Oben links sinkt die <b>Sättigung</b> – jage regelmäßig. Darunter stehen die <b>Tagesziele</b> mit Bonus-Erfahrung. Viel Glück, kleiner Leopard!',
    auto:10}
];
let st=null;
function tutDone(){ try{ return localStorage.getItem(KEY)==='done'; }catch(e){ return true; } }
function setDone(){ try{ localStorage.setItem(KEY,'done'); }catch(e){} }
/** Beim Spielstart: Einführung beginnen, wenn sie noch nicht gemacht ist und das Leben noch jung ist */
function startTutorial(force){
  if(!force&&(tutDone()||S.lvl>3||(S.gen||1)>1)){ if(!tutDone()&&(S.lvl>3||(S.gen||1)>1)) setDone(); return; }
  st={i:0}; enter(); $('tut').style.display='block';
}
function enter(){ const s=STEPS[st.i]; Object.assign(st,{t:0,dist:0,hid:0,kills:0,sp0:spent(),lx:P.x,lz:P.z}); render(); }
function render(){
  const s=STEPS[st.i], waiting=s.wait&&!s.wait();
  $('tutHead').textContent='Erste Schritte · '+(st.i+1)+'/'+STEPS.length+' · '+s.t;
  $('tutText').innerHTML=waiting?s.waitText():s.x();
  st.mode=padUI()?'p':touchUI()?'t':'k'; st.waiting=waiting;
  // Überspringen: am Touch per Knopf; mit Maus (gefangen im Spiel) und Controller über das Pause-Menü
  $('tutSkip').style.display=st.mode==='t'?'':'none';
  $('tutSkipK').textContent=st.mode==='k'?'Überspringen: Esc → Einführung beenden':st.mode==='p'?'Überspringen: Menü-Taste ☰ → Einführung beenden':'';
  $('btnTutEnd').style.display='';
}
function next(){
  snd.click(); st.i++;
  if(st.i>=STEPS.length){ stopTutorial(); return; }
  enter();
}
function stopTutorial(){ st=null; setDone(); $('tut').style.display='none'; $('btnTutEnd').style.display='none'; }
/** Ereignisse aus dem Spiel (über goalEvent): Beute erlegt */
function tutEvent(type){ if(!st) return; if(type==='kill') st.kills++; }
/** Jedes Bild: Fortschritt der aktuellen Aufgabe prüfen */
function updateTutorial(dt){
  if(!st||G.paused||P.dead) return;
  const s=STEPS[st.i];
  st.t+=dt; st.dist+=Math.hypot(P.x-st.lx,P.z-st.lz); st.lx=P.x; st.lz=P.z;
  if(P.sneak&&P.hideLv===2) st.hid+=dt; else st.hid=0;   // bewusst schleichen (als Jungtier wäre er im Gras auch so versteckt)
  const mode=padUI()?'p':touchUI()?'t':'k', waiting=!!(s.wait&&!s.wait());
  if(mode!==st.mode||waiting!==st.waiting){ if(st.waiting&&!waiting) st.sp0=spent(); render(); }
  if(waiting) return;
  if(s.auto?st.t>=s.auto:s.done(st)) next();
}
$('tutSkip').onclick=()=>stopTutorial();
$('btnTutEnd').onclick=()=>{ stopTutorial(); $('btnTutEnd').blur(); };
/** nur für Tests: zur Aufgabe i springen */
function tutJump(i){ if(st){ st.i=i; enter(); } }
$('btnTutAgain').onclick=()=>{ try{ localStorage.removeItem(KEY); }catch(e){} startTutorial(true); };

export { startTutorial, stopTutorial, tutEvent, tutJump, updateTutorial };
