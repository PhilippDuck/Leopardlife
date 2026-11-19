// LeopardLife – Spielstand: Laden/Speichern, Gebiet, Schwierigkeit und daraus abgeleitete Werte (Leben, Ausdauer, Schaden, Tempo …).
import { DIFF, REGIONS } from './data.js';
import { $ } from './util.js';

/* ---------- Spielstand ---------- */
const fresh=()=>({region:'savanne',beat:{},day:0,goals:null,kills:0,anc:[],diff:'normal',tod:0.3,lvl:1,xp:0,pts:0,won:false,gen:1,fur:null,cub:null,food:0,preg:0,partner:false,p1:false,p2:false,hunger:100,age:0,traits:[],a:{str:0,spd:0,sta:0,vit:0,cam:0},b:{amb:0,jmp:0,roar:0,nose:0,climb:0,night:0}});
// Schwierigkeit: Schaden, Hunger, Wachsamkeit der Tiere, Erfahrungsverlust beim Tod, Abstand der Überfälle, endgültiger Tod ohne Nachwuchs
const D=()=>DIFF[S.diff]||DIFF.normal;
// Spielstand: wird nie ersetzt, sondern an Ort und Stelle neu befüllt, damit alle Teile des Spiels dasselbe Objekt behalten
const S=fresh();
function resetState(o){ for(const k of Object.keys(S)) delete S[k]; Object.assign(S,o||fresh()); }
try{ const raw=localStorage.getItem('jaguar-save-v1'); if(raw){ const o=JSON.parse(raw); if(o&&o.lvl){ resetState(Object.assign(fresh(),o)); S.a=Object.assign(fresh().a,o.a); S.b=Object.assign(fresh().b,o.b); $('btnReset').style.display=''; $('btnPlay').textContent='Weiterspielen (Stufe '+S.lvl+')'; } } }catch(e){}
function save(){ try{ localStorage.setItem('jaguar-save-v1',JSON.stringify(S)); }catch(e){} }

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
 * @property {any} fur Fellvariante oder null
 * @property {number} hunger Sättigung 0…100
 * @property {number} age Alter in Sekunden ab Stufe 8
 */
/* Abgeleitete Werte eines Leoparden. L: dessen Werte (lvl, xp, pts, a, b, traits, fur, hunger, age); Standard ist Spieler 1 = Spielstand S */
/** @type {(t:string, L?:Leopard)=>boolean} */
const has=(t,L=S)=>L.traits.indexOf(t)>=0;
// Eigenschaften wirken höchstens bis Rang Stufe + 2: Geerbtes ruht, bis der Körper mitgewachsen ist
/** @type {(L?:Leopard)=>number} */
const attrCap=(L=S)=>L.lvl+2;
/** @type {(k:string, L?:Leopard)=>number} */
const at=(k,L=S)=>Math.min(L.a[k],attrCap(L));
// Alter zählt ab Stufe 8 in Sekunden; ab OLD_AT lassen Tempo und Kraft nach, bei DIE_AT endet das Leben
const OLD_AT=18*60, DIE_AT=/** @type {(L?:Leopard)=>number} */((L=S)=>25*60+(has('lang',L)?300:0));
/** @type {(L?:Leopard)=>number} */
const oldF=(L=S)=>L.lvl>=8?Math.max(0,Math.min(1,(L.age-OLD_AT)/(DIE_AT(L)-OLD_AT))):0;
/* ---------- Gebiete: jede zweite Generation öffnet ein neues. Jedes Gebiet ist eine eigene Karte; beim Wandern wird sie neu aufgebaut. ---------- */
const REG_ID=(S.region&&REGIONS[S.region]&&!REGIONS[S.region].soon)?S.region:'savanne', REG=REGIONS[REG_ID];
const beaten=id=>id==='savanne'?!!(S.won||(S.beat||{}).savanne):!!(S.beat||{})[id];
// Ahnenkraft: jede erreichte Generation macht die Linie etwas stärker (höchstens +20 %)
const ancF=()=>1+Math.min(0.2,0.02*((S.gen||1)-1));
/** @type {(L?:Leopard)=>number} */
const maxHp=(L=S)=>Math.round((30+8*(L.lvl-1)+15*at('vit',L))*(has('zaeh',L)?1.2:1)*ancF());
/** @type {(L?:Leopard)=>number} */
const maxSt=(L=S)=>Math.round((100+15*at('sta',L))*(has('lunge',L)?1.25:1)*ancF());
/** @type {(L?:Leopard)=>number} */
const dmg=(L=S)=>(6+1.5*(L.lvl-1)+3*at('str',L))*(has('kiefer',L)?1.15:1)*(1-0.3*oldF(L))*ancF();
/** @type {(L?:Leopard)=>number} */
const baseSpeed=(L=S)=>(7+0.12*(L.lvl-1)+0.45*at('spd',L))*(has('flink',L)?1.1:1)*(1-0.25*oldF(L))*(1+(ancF()-1)*0.5);
/** @type {(L?:Leopard)=>number} */
const pScale=(L=S)=>Math.min(2.0,0.5+0.075*(L.lvl-1));
/** Die Werte, die je Leopard gelten (der Rest des Spielstands gehört der ganzen Familie). */
const LEOPARD_KEYS=['lvl','xp','pts','a','b','traits','fur','hunger','age'];
/** Eigene Werte für einen Mitspieler: tiefe Kopie der Werte von L (Standard: Spieler 1). */
/** @type {(L?:Leopard)=>Leopard} */
const copyLeopard=(L=S)=>{ const o=/** @type {any} */({}); for(const k of LEOPARD_KEYS) o[k]=JSON.parse(JSON.stringify(L[k]===undefined?null:L[k])); return o; };

export { LEOPARD_KEYS, copyLeopard, D, DIE_AT, OLD_AT, REG, REG_ID, S, ancF, at, attrCap, baseSpeed, beaten, dmg, fresh, has, maxHp, maxSt, oldF, pScale, resetState, save, xpNeed };
