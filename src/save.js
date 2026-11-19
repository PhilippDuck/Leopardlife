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
const has=t=>S.traits.indexOf(t)>=0;
// Eigenschaften wirken höchstens bis Rang Stufe + 2: Geerbtes ruht, bis der Körper mitgewachsen ist
const attrCap=()=>S.lvl+2;
const at=k=>Math.min(S.a[k],attrCap());
// Alter zählt ab Stufe 8 in Sekunden; ab OLD_AT lassen Tempo und Kraft nach, bei DIE_AT endet das Leben
const OLD_AT=18*60, DIE_AT=()=>25*60+(has('lang')?300:0);
const oldF=()=>S.lvl>=8?Math.max(0,Math.min(1,(S.age-OLD_AT)/(DIE_AT()-OLD_AT))):0;
/* ---------- Gebiete: jede zweite Generation öffnet ein neues. Jedes Gebiet ist eine eigene Karte; beim Wandern wird sie neu aufgebaut. ---------- */
const REG_ID=(S.region&&REGIONS[S.region]&&!REGIONS[S.region].soon)?S.region:'savanne', REG=REGIONS[REG_ID];
const beaten=id=>id==='savanne'?!!(S.won||(S.beat||{}).savanne):!!(S.beat||{})[id];
// Ahnenkraft: jede erreichte Generation macht die Linie etwas stärker (höchstens +20 %)
const ancF=()=>1+Math.min(0.2,0.02*((S.gen||1)-1));
const maxHp=()=>Math.round((30+8*(S.lvl-1)+15*at('vit'))*(has('zaeh')?1.2:1)*ancF());
const maxSt=()=>Math.round((100+15*at('sta'))*(has('lunge')?1.25:1)*ancF());
const dmg=()=>(6+1.5*(S.lvl-1)+3*at('str'))*(has('kiefer')?1.15:1)*(1-0.3*oldF())*ancF();
const baseSpeed=()=>(7+0.12*(S.lvl-1)+0.45*at('spd'))*(has('flink')?1.1:1)*(1-0.25*oldF())*(1+(ancF()-1)*0.5);
const pScale=()=>Math.min(2.0,0.5+0.075*(S.lvl-1));

export { D, DIE_AT, OLD_AT, REG, REG_ID, S, ancF, at, attrCap, baseSpeed, beaten, dmg, fresh, has, maxHp, maxSt, oldF, pScale, resetState, save, xpNeed };
