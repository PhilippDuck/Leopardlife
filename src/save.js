// LeopardLife – Spielstand: Laden/Speichern, Gebiet, Schwierigkeit und daraus abgeleitete Werte (Leben, Ausdauer, Schaden, Tempo …).
import { DIFF, REGIONS, TRAITS } from './data.js';
import { $ } from './util.js';

/* ---------- Spielstand ---------- */
// Ein Spielstand für alles: Mitspieler steigen jederzeit ein (coop.js). Früher gab es einen eigenen Stand fürs gemeinsame Spiel;
// wer zuletzt damit gespielt hat ('jaguar-mode' = 'coop'), spielt mit diesem Stand weiter.
const MODE=(()=>{ try{ return localStorage.getItem('jaguar-mode')==='coop'?'coop':'solo'; }catch(e){ return 'solo'; } })();
const SAVE_KEY=MODE==='coop'?'jaguar-coop-v1':'jaguar-save-v1', LINES_KEY=MODE==='coop'?'jaguar-coop-lines':'jaguar-lines';
const fresh=()=>({region:'savanne',beat:{},day:0,goals:null,kills:0,anc:[],diff:'normal',tod:0.3,lvl:1,xp:0,pts:0,won:false,gen:1,fur:null,cub:null,food:0,preg:0,partner:false,p1:false,p2:false,hunger:100,thirst:100,age:0,traits:[],tlv:{},a:{str:0,spd:0,sta:0,vit:0,cam:0,sat:0},b:{amb:0,jmp:0,roar:0,nose:0,climb:0,night:0},mates:{},tree:{},goalStreak:0,id:'',parents:[],litterParents:null,partnerPlayer:false,partnerId:'',partnerTrait:'',litterTrait:''});
// mates: im gemeinsamen Spiel die Werte der Mitspieler nach Platz (2, 3, 4), siehe coop.js
// id/parents: Verwandtschaft (kinship.js) · litterParents: Eltern des kommenden Wurfs · partnerPlayer: Partner ist ein Mitspieler
// Schwierigkeit: Schaden, Hunger, Wachsamkeit der Tiere, Erfahrungsverlust beim Tod, Abstand der Überfälle, endgültiger Tod ohne Nachwuchs
const D=()=>DIFF[S.diff]||DIFF.normal;
// Spielstand: wird nie ersetzt, sondern an Ort und Stelle neu befüllt, damit alle Teile des Spiels dasselbe Objekt behalten
const S=fresh();
function resetState(o){ const seed=S.seed; for(const k of Object.keys(S)) delete S[k]; Object.assign(S,o||fresh()); if(!S.seed&&seed) S.seed=seed; }   // der Weltsamen bleibt (die Landschaft wird beim Laden gebaut)
/** Lädt den Spielstand des aktuellen Modus (oder beginnt neu) und stellt die Startknöpfe passend ein. */
function loadSave(){
  resetState(); $('btnReset').style.display='none'; $('btnPlay').textContent='Spielen';
  try{ const raw=localStorage.getItem(SAVE_KEY); if(raw){ const o=JSON.parse(raw); if(o&&o.lvl){ resetState(Object.assign(fresh(),o)); S.a=Object.assign(fresh().a,o.a); S.b=Object.assign(fresh().b,o.b); $('btnReset').style.display=''; $('btnPlay').textContent='Weiterspielen (Stufe '+S.lvl+')'; } } }catch(e){}
}
loadSave();
function save(){ try{ localStorage.setItem(SAVE_KEY,JSON.stringify(S)); }catch(e){} }
// Weltsamen: bestimmt die Landschaft (Hügel, später auch Pflanzen und Wasser je Chunk). Alte Spielstände bekommen hier ihren.
if(!S.seed){ S.seed=1+Math.floor(Math.random()*2147483000); save(); }

const xpNeed=l=>Math.round(20*Math.pow(l,1.4));
// Erbanlagen: jedes Junge bekommt eine; bis zu drei werden über die Generationen weitergegeben
/**
 * Werte eines einzelnen Leoparden. Spieler 1 nutzt dafür den Spielstand S selbst, Mitspieler eine eigene Kopie.
 * @typedef {object} Leopard
 * @property {number} lvl Stufe
 * @property {number} xp Erfahrung in der aktuellen Stufe
 * @property {number} pts unverteilte Punkte
 * @property {Record<string, number>} a Eigenschaften (str, spd, sta, vit, cam)
 * @property {Record<string, number>} b Fähigkeiten (amb, jmp, roar, nose, climb, night)
 * @property {string[]} traits Erbanlagen
 * @property {Record<string,number>} [tlv] Stufe je Erbanlage (2 = verstärkt, 3 = stark verstärkt); fehlt = 1
 * @property {any} fur Fellvariante oder null
 * @property {number} hunger Sättigung 0…100
 * @property {number} [thirst] Wasser 0…100 (fehlt bei alten Spielständen = 100)
 * @property {number} age Alter in Sekunden ab Stufe 8
 * @property {string} [id] Kennung für die Verwandtschaft
 * @property {string[]} [parents] Kennungen der Eltern
 * @property {number} [gen] Generation dieses Leoparden
 * @property {number} [kills] erlegte Beutetiere (Ahnenbuch)
 */
/* Abgeleitete Werte eines Leoparden. L: dessen Werte (lvl, xp, pts, a, b, traits, fur, hunger, age); Standard ist Spieler 1 = Spielstand S */
/** @type {(t:string, L?:Leopard)=>boolean} */
const has=(t,L=S)=>L.traits.indexOf(t)>=0;
/** Stufe einer Erbanlage: 0 = fehlt, 1 = normal, 2/3 = verstärkt (beide Eltern hatten sie) */
/** @type {(t:string, L?:Leopard)=>number} */
const tlvOf=(t,L=S)=>has(t,L)?Math.min(3,(L.tlv&&L.tlv[t])||1):0;
/** Stärke einer Erbanlage als Faktor auf ihre Wirkung: 0, 1, 1,6 oder 2 */
/** @type {(t:string, L?:Leopard)=>number} */
const tf=(t,L=S)=>[0,1,1.6,2][tlvOf(t,L)];
/** Name mit Stufe, z. B. „Flinke Läufe II“ */
/** @type {(t:string, L?:Leopard)=>string} */
const traitName=(t,L=S)=>TRAITS[t][0]+(tlvOf(t,L)>1?' '+['','','II','III'][tlvOf(t,L)]:'');
/** Erbanlage t an Leopard L weitergeben: neu dazu (höchstens drei, die älteste fällt weg) oder, wenn schon da, eine Stufe stärker */
/** @param {{traits:string[], tlv?:Record<string,number>}} L @param {string} t */
function inheritTrait(L,t){
  if(!t||!TRAITS[t]) return; L.tlv=L.tlv||{};
  if(L.traits.indexOf(t)>=0){ L.tlv[t]=Math.min(3,(L.tlv[t]||1)+1); return; }
  L.traits=L.traits.concat(t); while(L.traits.length>3){ const gone=L.traits.shift(); delete L.tlv[gone]; }
}
// Eigenschaften wirken höchstens bis Rang Stufe + 2: Geerbtes ruht, bis der Körper mitgewachsen ist
/** @type {(L?:Leopard)=>number} */
const attrCap=(L=S)=>L.lvl+2;
/** @type {(k:string, L?:Leopard)=>number} */
const at=(k,L=S)=>Math.min(L.a[k],attrCap(L));
// Alter zählt ab Stufe 8 in Sekunden; ab OLD_AT lassen Tempo und Kraft nach, bei DIE_AT endet das Leben
const OLD_AT=18*60, DIE_AT=/** @type {(L?:Leopard)=>number} */((L=S)=>25*60+300*tf('lang',L));
/** @type {(L?:Leopard)=>number} */
const oldF=(L=S)=>L.lvl>=8?Math.max(0,Math.min(1,(L.age-OLD_AT)/(DIE_AT(L)-OLD_AT))):0;
/* ---------- Gebiete: jede zweite Generation öffnet ein neues. Jedes Gebiet ist eine eigene Karte; beim Wandern wird sie neu aufgebaut. ---------- */
const REG_ID=(S.region&&REGIONS[S.region]&&!REGIONS[S.region].soon)?S.region:'savanne', REG=REGIONS[REG_ID];
const beaten=id=>id==='savanne'?!!(S.won||(S.beat||{}).savanne):!!(S.beat||{})[id];
// Ahnenkraft: jede erreichte Generation macht die Linie etwas stärker (höchstens +20 %)
const ancF=()=>1+Math.min(0.2,0.02*((S.gen||1)-1));
/** @type {(L?:Leopard)=>number} */
const maxHp=(L=S)=>Math.round((30+8*(L.lvl-1)+15*at('vit',L))*(1+0.2*tf('zaeh',L))*ancF());
/** @type {(L?:Leopard)=>number} */
const maxSt=(L=S)=>Math.round((100+15*at('sta',L))*(1+0.25*tf('lunge',L))*ancF());
/** @type {(L?:Leopard)=>number} */
const dmg=(L=S)=>(6+1.5*(L.lvl-1)+3*at('str',L))*(1+0.15*tf('kiefer',L))*(1-0.3*oldF(L))*ancF();
/** @type {(L?:Leopard)=>number} */
const baseSpeed=(L=S)=>(7+0.12*(L.lvl-1)+0.45*at('spd',L))*(1+0.1*tf('flink',L))*(1-0.25*oldF(L))*(1+(ancF()-1)*0.5);
/** @type {(L?:Leopard)=>number} */
const pScale=(L=S)=>Math.min(2.0,0.5+0.075*(L.lvl-1));
/** Hunger je Sekunde (Sättigung sinkt von 100 in rund 7 Minuten): Erbanlage „Genügsam“, Eigenschaft „Genügsamer Magen“, Schwierigkeit */
/** @type {(L?:Leopard)=>number} */
const hungerRate=(L=S)=>(100/420)*(1-0.25*tf('genug',L))*(1-0.05*at('sat',L))*D().hunger;
/** Durst je Sekunde (Wasser sinkt von 100 in rund 5 Minuten, bei Regen langsamer) */
/** @type {(L?:Leopard, rain?:number)=>number} */
const thirstRate=(L=S,rain=0)=>(100/300)*(1-0.25*tf('genug',L))*(1-0.4*rain)*D().hunger;
/** Die Werte, die je Leopard gelten (der Rest des Spielstands gehört der ganzen Familie). */
const LEOPARD_KEYS=['lvl','xp','pts','a','b','traits','tlv','fur','hunger','thirst','age','id','parents','gen','kills'];
/** Eigene Werte für einen Mitspieler: tiefe Kopie der Werte von L (Standard: Spieler 1). */
/** @type {(L?:Leopard)=>Leopard} */
const copyLeopard=(L=S)=>{ const o=/** @type {any} */({}); for(const k of LEOPARD_KEYS) o[k]=JSON.parse(JSON.stringify(L[k]===undefined?null:L[k])); return o; };

export { inheritTrait, tf, tlvOf, traitName, hungerRate, thirstRate };
export { LINES_KEY, LEOPARD_KEYS, copyLeopard, D, DIE_AT, OLD_AT, REG, REG_ID, S, ancF, at, attrCap, baseSpeed, beaten, dmg, fresh, has, maxHp, maxSt, oldF, pScale, resetState, save, xpNeed };
