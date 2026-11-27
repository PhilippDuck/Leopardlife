// LeoLife – Felsplateaus (Kopjes): wo sie liegen und wie groß sie sind. Nur die Lage, ohne Grafik,
// damit Bäume, Büsche und hohes Gras ihnen schon beim Anlegen ausweichen können (Aufbau: kopje.js).
import { seeded } from './noise.js';
import { REG, WORLD_SEED } from './save.js';
import { PONDS, WORLD, dryness, pondAt, riverEdge } from './terrain.js';

/** Feldgröße der weiten Welt (wie CHUNK in chunks.js; chunks.js lädt Pflanzen und darf hier nicht importiert werden) */
const KOP_CELL=64;
/** Anteil der 64-m-Felder mit einem seltenen Höhlenplateau */
const KOP_CHANCE=0.04;
/** Anteil der übrigen Felder mit einer kleinen Felsgruppe (ohne Höhle, auch ohne Klettern-Fähigkeit zu erklimmen) */
const KOP_SMALL_CHANCE=0.16;
/** Kleine Felsgruppen im Startgebiet (Plateaus: REG.kopjes) */
const KOP_SMALL_HOME=7;
/** Abstand zum Bau im Startgebiet */
const KOP_DEN_GAP=45;
/** Abstand der Felsmitte zum Rand von Fluss oder See */
const KOP_RIVER_GAP=40;

/**
 * Ein Felsplateau: Mitte, Radius R am Boden, Höhe top der Fläche oben, Richtung des Höhleneingangs (Bogenmaß),
 * Samen für die Felsbrocken; home = im Startgebiet (nur dort kann die Höhle zum Bau werden);
 * small = kleine Felsgruppe: niedriger, ohne Höhle, auch ohne Klettern-Fähigkeit zu erklimmen;
 * den = der Bau im Startgebiet (seine Höhle öffnet sich zum alten Bauplatz).
 * @typedef {{x:number,z:number,R:number,top:number,cave:number,seed:number,home:boolean,small?:boolean,den?:boolean}} KopjeSite
 */
/** @returns {KopjeSite} */
function kopjeSite(x,z,r,home,small=false){
  const R=small?2.3+r()*1.3:5+r()*2.5, top=small?1.5+r()*1.0:3.2+r()*1.4, cave=r()*6.283, seed=1+Math.floor(r()*2147483000);
  return {x,z,R,top,cave,seed,home,small};
}
/** Felsplateaus im Startgebiet: fest je Weltsamen, mit Abstand zum Bau, zu den Wasserlöchern und zueinander */
const homeKopjes=(()=>{
  const r=seeded((WORLD_SEED^0x6b6f706a)>>>0), out=[], n=REG.kopjes??4;
  for(let t=0;t<600&&out.length<n;t++){
    const a=r()*6.283, d=70+r()*(WORLD-100), x=Math.cos(a)*d, z=Math.sin(a)*d;
    if(Math.hypot(x-7,z-5)<KOP_DEN_GAP||PONDS.some(p=>Math.hypot(x-p.x,z-p.z)<p.r*1.5+14)||out.some(k=>Math.hypot(x-k.x,z-k.z)<80)||riverEdge(x,z)<KOP_RIVER_GAP) continue;
    out.push(kopjeSite(x,z,r,true));
  }
  // kleine Felsgruppen dazwischen (Plateaus stehen vorn in der Liste)
  const big=out.length;
  for(let t=0;t<600&&out.length<big+KOP_SMALL_HOME;t++){
    const a=r()*6.283, d=30+r()*(WORLD-45), x=Math.cos(a)*d, z=Math.sin(a)*d;
    if(Math.hypot(x-7,z-5)<25||PONDS.some(p=>Math.hypot(x-p.x,z-p.z)<p.r*1.3+8)||out.some(k=>Math.hypot(x-k.x,z-k.z)<k.R+40)||riverEdge(x,z)<20) continue;
    out.push(kopjeSite(x,z,r,true,true));
  }
  // Der Bau: ein Felsplateau, dessen Höhle sich zum Bauplatz (7,5) und zum Startplatz hin öffnet (Richtung, die frei ist)
  { const dx=7, dz=5, R=5.6, back=R*0.97+2.2;
    let best=null;
    for(let i=0;i<12;i++){ const a=Math.atan2(2-dx,2-dz)+(i%2?1:-1)*Math.ceil(i/2)*0.5236, ox=Math.sin(a), oz=Math.cos(a), x=dx-ox*back, z=dz-oz*back;   // 0°, ±30°, ±60° …
      const bad=PONDS.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+R+3)||riverEdge(x,z)<R+8||out.some(k=>Math.hypot(x-k.x,z-k.z)<k.R+R+10);
      if(!bad){ best={x,z,a}; break; } }
    if(!best){ const a=Math.atan2(2-dx,2-dz); best={x:dx-Math.sin(a)*back,z:dz-Math.cos(a)*back,a}; }
    out.push({x:best.x,z:best.z,R,top:3.6,cave:best.a,seed:1+Math.floor(r()*2147483000),home:true,den:true}); }
  return out;
})();
/** @type {Map<string,KopjeSite|null>} */
const worldKopjes=new Map();
/** Felsplateau im Feld (cx,cz) der Welt oder null (fest aus Weltsamen und Lage) */
function worldKopje(cx,cz){
  const key=cx+','+cz; if(worldKopjes.has(key)) return worldKopjes.get(key)??null;
  const r=seeded((WORLD_SEED^Math.imul(cx,0x1f3a5c7)^Math.imul(cz,0x6e2b9d1)^0x4b4f504a)>>>0);
  let site=null;
  const roll=r();
  if(roll<KOP_CHANCE){
    const x=cx*KOP_CELL+18+r()*(KOP_CELL-36), z=cz*KOP_CELL+18+r()*(KOP_CELL-36), d=dryness(x,z);
    const nearStart=homeKopjes.some(k=>Math.hypot(x-k.x,z-k.z)<k.R+18);
    if(Math.hypot(x,z)>60&&!nearStart&&(d>0.3||r()<0.35)&&!pondAt(x,z,2)&&riverEdge(x,z)>=KOP_RIVER_GAP) site=kopjeSite(x,z,r,false);
  } else if(roll<KOP_CHANCE+KOP_SMALL_CHANCE){
    const x=cx*KOP_CELL+12+r()*(KOP_CELL-24), z=cz*KOP_CELL+12+r()*(KOP_CELL-24), d=dryness(x,z);
    if(Math.hypot(x,z)>WORLD+20&&(d>0.25||r()<0.4)&&!pondAt(x,z,2)&&riverEdge(x,z)>=20) site=kopjeSite(x,z,r,false,true);
  }
  worldKopjes.set(key,site); return site;
}
/** Felsplateau, dessen Fuß (plus Rand m) die Stelle x,z berührt, sonst null */
function kopjeNear(x,z,m=0){
  for(const k of homeKopjes) if(Math.hypot(x-k.x,z-k.z)<k.R+m) return k;
  const cx=Math.floor(x/KOP_CELL), cz=Math.floor(z/KOP_CELL);
  for(let i=cx-1;i<=cx+1;i++) for(let j=cz-1;j<=cz+1;j++){ const k=worldKopje(i,j); if(k&&Math.hypot(x-k.x,z-k.z)<k.R+m) return k; }
  return null;
}

export { homeKopjes, kopjeNear, worldKopje };
