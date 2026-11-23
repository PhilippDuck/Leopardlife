// LeopardLife – Der Leopard des Spielers: Zustand, Startposition und Modell.
import { QUAL } from './data.js';
import { camera, scene } from './engine.js';
import { buildQuad } from './models.js';
import { blobs, quality } from './quality.js';
import { S, maxHp, maxSt } from './save.js';

/* Spieler */
// Blick beim Start und beim Aufwachen im Bau: seitlich an den Felsen vorbei ins offene Gelände
const START_YAW=-1.9, START_ROT=1.24;
const JAG={col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.44,ears:0.15,tail:1.1,tailTip:0x2a1c10,spots:1};
/**
 * Ein Spieler-Leopard: Position, Zustand, eigene Kamera und Steuerquelle.
 * Stufe, Eigenschaften und Fähigkeiten liegen (noch) gemeinsam im Spielstand S.
 * @typedef {object} Player
 * @property {{source:string, fw:number, rt:number, sprint:boolean, act:boolean}} ctl Steuerwunsch dieses Bildes (controls.js); act: Aktionstaste gehalten (Wiederbeleben)
 * @property {{yaw:number, pitch:number, zoom:number, huntF:number, shake:number}} cam Kamera: Richtung, Neigung, Zoom, Jagd-Ansicht 0…1, Wackeln
 * @property {import('./save.js').Leopard} L Werte dieses Leoparden (Stufe, Erfahrung, Punkte, Eigenschaften, Fähigkeiten, Erbanlagen, Fell, Hunger, Alter). Bei Spieler 1 der Spielstand S
 * @property {any} camera three.js-Kamera, mit der dieser Spieler gezeigt wird
 * @property {any} g Modell (THREE.Group)
 * @property {object|null} fur Fellvariante, wenn nicht aus dem Spielstand
 * @property {boolean} saveFur Fell kommt aus dem Spielstand (Spieler 1)
 * @property {number} x
 * @property {number} y Bodenhöhe
 * @property {number} z
 * @property {number} rot Blickrichtung des Leoparden
 * @property {number} camY Höhe für die Kamera (Boden + Baum)
 * @property {number} hp Leben
 * @property {number} st Ausdauer
 * @property {boolean} dead
 * @property {boolean} sneak
 * @property {number} hidden Tarnung 0 (unsichtbar) … über 1 (auffällig)
 * @property {number} [stealth] Tarnwert dieses Bildes für die Tiere (move.js)
 * @property {boolean} [grass] steht im hohen Gras
 * @property {boolean} [wet] steht im Wasser
 * @property {number} [hideLv] Stufe der Versteck-Anzeige 0/1/2
 * @property {number|null} tree Index des Baums, auf dem er sitzt
 * @property {number} climbT Kletterfortschritt 0…1
 * @property {boolean} safe sicher oben im Baum
 * @property {number} [fromX] Startpunkt des Kletterns
 * @property {number} [fromZ]
 * @property {number} upNow aktuelle Höhe über dem Boden im Baum
 * @property {number} dropY Resthöhe beim Herunterspringen
 * @property {number} dropRate Fallgeschwindigkeit
 * @property {number} pounce Restdauer des Sprungs
 * @property {number} [pT] Gesamtdauer des Sprungs
 * @property {boolean} leap Sprung vom Baum
 * @property {boolean} [hit] dieser Sprung hat schon getroffen
 * @property {number} pcd Abklingzeit Sprung
 * @property {number} rcd Abklingzeit Brüllen
 * @property {any} [eatC] Kadaver, von dem gerade gefressen wird
 * @property {any} [drinking] Wasserloch, aus dem gerade getrunken wird
 * @property {string} [drinkK] Lage des Wasserlochs, aus dem getrunken wird
 * @property {number} [drinkT] Takt der Trinkgeräusche
 * @property {number} [drinkHp] Leben beim letzten Trinkschluck (ein Treffer beendet das Trinken)
 * @property {any} [bite] Festbeißen läuft (bite.js)
 * @property {any} [tut] Einführung dieses Spielers (tutorial.js), null wenn keine läuft
 * @property {number} [noise] wie weit man ihn gerade hört (Meter, move.js)
 * @property {number} [swArm] Bestätigung „als Junges weiterspielen“ läuft noch so lange (cubfollow.js)
 * @property {number} [fireT] Abklingzeit für Feuerschaden (worldevents.js)
 * @property {boolean} [fireWarn] Feuerwarnung schon gezeigt
 * @property {number} [stalk] geschlichene Strecke seit dem letzten vollen Meter (Tagesziel)
 * @property {any} [drag] Kadaver, der gerade gezogen wird
 * @property {{x:number,z:number}|null} [tOff] Versatz auf dem Baum (oben ein Stück herumgehen)
 * @property {boolean} [treeWalk] geht gerade auf dem Baum
 * @property {number} [eatT] Zeit bis zum nächsten Bissen
 * @property {number} [roarT] Brüll-Animation läuft noch (s)
 * @property {boolean} [pounceRun] Sprungangriff in Laufrichtung statt zum Fadenkreuz (Einstellung des Spielers)
 * @property {{a:Record<string,number>, b:Record<string,number>}} [skSnap] Entwicklung beim Öffnen des Fensters (zum Zurücksetzen)
 * @property {number} hurtT Dauer des roten Rands
 * @property {number} combatT Zeit seit dem letzten Kampf (keine Heilung)
 * @property {number} moving
 * @property {number} walkT Laufzyklus der Beine
 * @property {number} [stepT] Zeit bis zum nächsten Schrittgeräusch
 * @property {number} [pad] Controller-Index eines Mitspielers (coop.js)
 * @property {number} [num] Spielernummer 2…4 eines Mitspielers
 * @property {HTMLElement} [hud] Anzeige-Rahmen eines Mitspielers (Kopie von #ph0)
 * @property {boolean[]} [padPrev] Tasten im letzten Bild
 * @property {number} [leaveT] wie lange Back gehalten wird, in Sekunden (Aussteigen)
 * @property {number} [reconnectUntil] Ende der Controller-Wiederverbindungsfrist in Millisekunden
 * @property {number} [leaveAt] Zeitpunkt, an dem Back gedrückt wurde
 * @property {number|null} [downT] Restzeit am Boden bis zum Erwachen im Bau (Koop)
 * @property {number} [revT] Fortschritt beim Wiederbeleben in Sekunden
 * @property {number} [lastS] zuletzt angezeigte Sekunde am Boden
 * @property {HTMLElement[]} [waPool] Warnpfeile in der Anzeige eines Mitspielers
 * @property {Record<string, HTMLElement>} [hc] gefundene Elemente seiner Anzeige (coop.js hEl)
 * @property {number} [toastT] Restzeit seiner Meldung
 * @property {number} [noStT] Restzeit des Hinweises 'Zu wenig Ausdauer'
 * @property {boolean} [skOpen] eigene Entwicklung offen (gemeinsames Spiel; das Spiel läuft weiter)
 * @property {HTMLElement} [skPanel] sein Entwicklungsfenster
 * @property {number} [skF] gewählter Knopf darin (Controller)
 * @property {number} [navT] Wiederholsperre beim Blättern mit dem Stick
 * @property {any} [cubDone] hat aus diesem Wurf schon ein Junges übernommen (Geburtsfenster)
 * @property {boolean} [cubArm] Wechsel ins Junge einmal angetippt
 * @property {boolean} [wantSleep] will im gemeinsamen Spiel schlafen (wartet auf die anderen)
 * @property {number} [pingT] Restzeit der Markierungen der Mitspieler
 * @property {HTMLElement[]} [marks] Markierungen in seiner Anzeige
 * @property {any} [reviveNear] Mitspieler am Boden in der Nähe (Hinweis zum Wiederbeleben)
 */

/**
 * Legt einen Spieler-Leoparden an.
 * @param {object} [o]
 * @param {string} [o.source] Steuerquelle: 'local' (Tastatur, Maus, Touch, Controller) oder später 'pad0' … 'pad3'
 * @param {object} [o.camera] Kamera, mit der dieser Spieler gezeigt wird
 * @param {number} [o.x] Startposition
 * @param {number} [o.z]
 * @param {object|null} [o.fur] Fellvariante (null = normal)
 * @param {import('./save.js').Leopard} [o.L] eigene Werte (Standard: Spielstand S, also Spieler 1)
 */
/** @returns {Player} */
function makePlayer(o={}){
  // ctl: Steuerwunsch dieses Bildes (gefüllt von controls.js) · cam: eigene Kamera (Blickrichtung, Neigung, Zoom, Jagd-Ansicht, Wackeln)
  /** @type {Player} */
  const p={L:null,camera:null,fur:null,saveFur:true,ctl:{source:'local',fw:0,rt:0,sprint:false,act:false},cam:{yaw:START_YAW,pitch:0.42,zoom:1,huntF:0,shake:0},dead:false,tree:null,climbT:0,safe:false,dropY:0,dropRate:20,upNow:0,camY:0,leap:false,x:2,z:2,y:0,rot:START_ROT,hp:1,st:1,pounce:0,pcd:0,rcd:0,sneak:false,hurtT:0,combatT:0,hidden:1,g:null,moving:0,walkT:0};
  p.L=o.L||S; p.ctl.source=o.source||'local'; p.camera=o.camera||camera; p.saveFur=o.fur===undefined; p.fur=o.fur||null;   // saveFur: Fell kommt aus dem Spielstand (Spieler 1)
  if(o.x!==undefined){ p.x=o.x; p.z=o.z; }
  rebuildPlayer(p); p.hp=maxHp(p.L); p.st=maxSt(p.L);
  return p;
}
function dropModel(g){ if(!g) return; scene.remove(g); const i=blobs.indexOf(g.userData.blob); if(i>=0) blobs.splice(i,1); }
/** Baut das Modell von Spieler p neu (nach Fellwechsel, Generationswechsel, Grafikstufe). */
function rebuildPlayer(p=P){ dropModel(p.g); p.g=buildQuad(JAG,p.saveFur?(S.fur||null):p.fur); p.g.userData.blob.visible=!QUAL[quality].sh; scene.add(p.g); }
const P=makePlayer();
// Alle Spieler auf diesem Gerät. Noch einer; beim Splitscreen kommen weitere dazu.
const players=[P];

export { P, players, makePlayer, START_ROT, START_YAW, dropModel, rebuildPlayer };
