// LeoLife – Erste Schritte: ein geführtes erstes Leben für neue Spieler.
// Rechts unter der Spürkarte steht immer genau eine Aufgabe; ist sie erfüllt, kommt die nächste. Die Texte passen sich an die
// Steuerung an (Tastatur, Touch, Controller). Jeder Spieler hat seine eigene Einführung (Splitscreen: im eigenen Ausschnitt).
// Der Fortschritt wird je Spielernummer gespeichert: nach einem Neustart geht es bei der Aufgabe weiter, an der man war.
// Einmal durchgespielt oder übersprungen, kommt sie nicht wieder (Einstellungen → „Einführung wiederholen“).
// Spieler 1 sieht sie nur am Anfang einer Linie (Stufe ≤ 3, erste Generation); Mitspieler bei ihrem ersten Einstieg.
import { snd } from './audio.js';
import { P, players } from './player.js';
import { S } from './save.js';
import { G } from './state.js';
import { $ } from './util.js';
import { padUI } from './gamepad.js';
import { touchUI } from './input.js';
import { hEl } from './coop.js';

const tutKey=p=>'jaguar-tut'+((p.num||1)>1?'-'+p.num:'');
/** Eingabeart von Spieler p: Mitspieler spielen immer mit Controller */
const tutMode=p=>p!==P||padUI()?'p':touchUI()?'t':'k';
const tutK=(key,touch,pad)=>p=>{ const m=tutMode(p); return m==='p'?pad:m==='t'?touch:key; };
const tutSpent=L=>Object.values(L.a).reduce((x,y)=>x+y,0)+Object.values(L.b).reduce((x,y)=>x+y,0);
/** Aufgaben: Titel, Text je Steuerung, wann erfüllt (st = Zustand dieser Aufgabe), oder auto = nach so vielen Sekunden weiter */
const STEPS=[
  {t:'Laufen und umsehen',x:tutK('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> laufen, mit der <kbd>Maus</kbd> umsehen.',
    'Daumen links aufsetzen und schieben = laufen. Rechts wischen = umsehen.','Linker Stick laufen, rechter Stick umsehen.'),
    done:st=>st.dist>12},
  {t:'Schleichen und verstecken',x:tutK('<kbd>C</kbd> schaltet Schleichen ein – geh so ins <b>hohe Gras</b>. Erscheint oben links „Versteckt“, sieht dich kaum ein Tier.',
    'Tippe <b>Schleichen</b> und geh so ins <b>hohe Gras</b>. Erscheint oben links „Versteckt“, sieht dich kaum ein Tier.','Ⓑ schaltet Schleichen ein – geh so ins <b>hohe Gras</b>. Erscheint oben links „Versteckt“, sieht dich kaum ein Tier.'),
    done:st=>st.hid>1.2},
  {t:'Die Spürkarte',x:()=>'Rechts oben siehst du die Tiere um dich: <b style="color:#9be07f">grün</b> = Beute, <b style="color:#f2b84b">gold</b> = wehrt sich, <b style="color:#ff5a3c">rot</b> = gefährlich für dich. Der <b style="color:#96cdff">blaue Pfeil</b> ist der Wind – pirsch dich gegen den Wind an.',
    auto:10},
  {t:'Die erste Jagd',x:tutK('Schleich dich an eine <b>Maus</b> oder einen <b>Hasen</b>. Wird das Fadenkreuz golden, ist sie in Reichweite: <kbd>Leertaste</kbd> oder <kbd>Klick</kbd> = Sprungangriff.',
    'Schleich dich an eine <b>Maus</b> oder einen <b>Hasen</b>. Wird das Fadenkreuz golden, ist sie in Reichweite: <b>rechts doppeltippen</b> = Sprungangriff.','Schleich dich an eine <b>Maus</b> oder einen <b>Hasen</b>. Wird das Fadenkreuz golden, ist sie in Reichweite: <b>RT</b> = Sprungangriff.'),
    done:st=>st.kills>=1},
  {t:'Wachsen',x:()=>'Gut gemacht! Jede Beute bringt Erfahrung. Erlege noch zwei Tiere – dann steigst du eine Stufe auf.',
    done:(st,p)=>st.kills>=2||p.L.pts>0},
  {t:'Stärker werden',x:tutK('Du hast Punkte! <kbd>Tab</kbd> öffnet <b>Eigenschaften &amp; Fähigkeiten</b> – verteile sie mit <b>+</b>.',
    'Du hast Punkte! <b>☰ Menü → Eigenschaften &amp; Fähigkeiten</b> – verteile sie mit <b>+</b>.','Du hast Punkte! Die <b>Ansicht-Taste ⧉</b> öffnet die Entwicklung – Steuerkreuz wählt, Ⓐ verteilt.'),
    // zählt jeden Punkt, der seit Beginn der Einführung verteilt wurde – auch wenn das schon vor dieser Aufgabe geschah
    done:(st,p)=>tutSpent(p.L)>st.spStart, wait:(st,p)=>p.L.pts>0||tutSpent(p.L)>st.spStart, waitText:p=>'Jage weiter, bis du aufsteigst – dann gibt es Punkte zu verteilen.'},
  {t:'Gefahr erkennen',x:()=>'Pfeile am Bildrand zeigen Raubtiere: <b style="color:#f2d04b">gelb</b> ahnungslos, <b style="color:#ff9a3c">orange</b> misstrauisch, <b style="color:#ff4a30">rot</b> jagt dich. Dann schnell ins hohe Gras schleichen – oder später auf einen Baum.',
    auto:12},
  {t:'Satt bleiben',x:()=>'Oben links sinkt die <b>Sättigung</b> – jage regelmäßig. Darunter stehen die <b>Tagesziele</b> mit Bonus-Erfahrung. Viel Glück, kleiner Leopard!',
    auto:10}
];
/** Einführung je Spieler: Zustand liegt am Spieler (p.tut), Fortschritt im Speicher (Nummer der Aufgabe oder 'done') */
const tutActive=(p=P)=>!!p.tut;
function tutLoad(p){ try{ return localStorage.getItem(tutKey(p)); }catch(e){ return 'done'; } }
function tutStore(p,v){ try{ localStorage.setItem(tutKey(p),String(v)); }catch(e){} }
/** Einführung für Spieler p beginnen bzw. fortsetzen (force: von vorn) */
function startTutorial(p=P,force){
  let v=force?'0':tutLoad(p);
  if(v==null){ if(p===P&&(p.L.lvl>3||(p.L.gen||S.gen||1)>1)){ tutStore(p,'done'); return; } v='0'; }   // erfahrene Spieler 1 brauchen sie nicht
  if(v==='done') return;
  p.tut={i:Math.max(0,Math.min(STEPS.length-1,parseInt(v,10)||0)),spStart:tutSpent(p.L)}; tutEnter(p); hEl(p,'tut').style.display='block';
}
function tutEnter(p){ const st=p.tut; Object.assign(st,{t:0,dist:0,hid:0,k0:p.L.kills||0,kills:0,lx:p.x,lz:p.z}); tutStore(p,st.i); tutRender(p); }
function tutRender(p){
  const st=p.tut, s=STEPS[st.i], waiting=!!(s.wait&&!s.wait(st,p)), m=tutMode(p);
  hEl(p,'tutHead').textContent='Erste Schritte · '+(st.i+1)+'/'+STEPS.length+' · '+s.t;
  hEl(p,'tutText').innerHTML=waiting?s.waitText(p):s.x(p);
  st.mode=m; st.waiting=waiting;
  // Überspringen: am Touch per Knopf; mit Maus (gefangen im Spiel) über das Pause-Menü, Mitspieler im eigenen Entwicklungsfenster
  hEl(p,'tutSkip').style.display=m==='t'?'':'none';
  hEl(p,'tutSkipK').textContent=p!==P?'Überspringen: Ansicht-Taste ⧉ → Einführung beenden':m==='k'?'Überspringen: Esc → Einführung beenden':m==='p'?'Überspringen: Menü-Taste ☰ → Einführung beenden':'';
  if(p===P) $('btnTutEnd').style.display='';
}
function tutNext(p){
  snd.click(); p.tut.i++;
  if(p.tut.i>=STEPS.length){ stopTutorial(p); return; }
  tutEnter(p);
}
function stopTutorial(p=P){ if(!p.tut) return; p.tut=null; tutStore(p,'done'); hEl(p,'tut').style.display='none'; if(p===P) $('btnTutEnd').style.display='none'; }
/** Ereignisse aus dem Spiel (über goalEvent) – Beute zählt jetzt jeder Spieler selbst über seine erlegten Tiere */
function tutEvent(type){}
/** Jedes Bild: Fortschritt der aktuellen Aufgabe jedes Spielers prüfen */
function updateTutorial(dt){ if(G.paused) return; for(const p of players) if(p.tut&&!p.dead) tutStep(p,dt); }
function tutStep(p,dt){
  const st=p.tut, s=STEPS[st.i];
  st.t+=dt; st.dist+=Math.hypot(p.x-st.lx,p.z-st.lz); st.lx=p.x; st.lz=p.z; st.kills=(p.L.kills||0)-st.k0;
  if(p.sneak&&p.hideLv===2) st.hid+=dt; else st.hid=0;   // bewusst schleichen (als Jungtier wäre er im Gras auch so versteckt)
  const waiting=!!(s.wait&&!s.wait(st,p));
  if(tutMode(p)!==st.mode||waiting!==st.waiting) tutRender(p);
  if(waiting) return;
  if(s.auto?st.t>=s.auto:s.done(st,p)) tutNext(p);
}
$('tutSkip').onclick=()=>stopTutorial(P);
$('btnTutEnd').onclick=()=>{ stopTutorial(P); $('btnTutEnd').blur(); };
$('btnTutAgain').onclick=()=>startTutorial(P,true);
/** nur für Tests: Spieler 1 zur Aufgabe i springen */
function tutJump(i,p=P){ if(p.tut){ p.tut.i=i; tutEnter(p); } }

export { startTutorial, tutActive, stopTutorial, tutEvent, tutJump, updateTutorial };
