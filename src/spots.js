// LeoLife – belegte Plätze: Kreise am Boden, damit Bäume, Büsche, Steine und Landschaftsobjekte nicht ineinander entstehen.
// Jede Verteilung fragt spotFree() und belegt mit takeSpot(). Ein belegter Platz entfällt; die Zufallszahlen für ihn
// sind dann schon gezogen, damit der Rest der Welt gleich bleibt.
// owner: 0 = Startgebiet (immer geladen), sonst der Schlüssel des Abschnitts. Ein Abschnitt prüft nur gegen das Startgebiet
// und sich selbst, damit das Ergebnis nicht davon abhängt, welche Nachbarn schon geladen sind (gleiche Welt für alle Mitspieler).

const SPOT_CELL=8, spotGrid=new Map(), spotOwners=new Map();
const spotKey=(i,j)=>i*1000003+j;
/** Wie weit sich zwei Kreise überlappen dürfen (Anteil der Summe der Radien): Ränder dürfen sich etwas berühren */
const SPOT_TOUCH=0.9;

/** @param {number} x @param {number} z @param {number} r @param {(i:number,j:number)=>void} fn */
function spotCells(x,z,r,fn){
  const x0=Math.floor((x-r)/SPOT_CELL), x1=Math.floor((x+r)/SPOT_CELL), z0=Math.floor((z-r)/SPOT_CELL), z1=Math.floor((z+r)/SPOT_CELL);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++) fn(i,j);
}
/**
 * Ist der Kreis (x,z,r) frei von Plätzen des Startgebiets und des eigenen Abschnitts?
 * @param {number} x @param {number} z @param {number} r @param {string|number} [owner]
 */
function spotFree(x,z,r,owner=0){
  let free=true;
  spotCells(x,z,r,(i,j)=>{ if(!free) return; const L=spotGrid.get(spotKey(i,j)); if(!L) return;
    for(const s of L){ if(s.o!==0&&s.o!==owner) continue; const m=(s.r+r)*SPOT_TOUCH, dx=s.x-x, dz=s.z-z; if(dx*dx+dz*dz<m*m){ free=false; return; } } });
  return free;
}
/**
 * Kreis belegen (ohne Prüfung).
 * @param {number} x @param {number} z @param {number} r @param {string|number} [owner]
 */
function takeSpot(x,z,r,owner=0){
  const s={x,z,r,o:owner};
  spotCells(x,z,r,(i,j)=>{ const k=spotKey(i,j); let L=spotGrid.get(k); if(!L) spotGrid.set(k,L=[]); L.push(s); });
  let O=spotOwners.get(owner); if(!O) spotOwners.set(owner,O=[]); O.push(s);
}
/**
 * Prüfen und, wenn frei, belegen. Liefert, ob der Platz frei war.
 * @param {number} x @param {number} z @param {number} r @param {string|number} [owner]
 */
function claimSpot(x,z,r,owner=0){
  if(!spotFree(x,z,r,owner)) return false;
  takeSpot(x,z,r,owner); return true;
}
/** Alle Plätze eines Abschnitts freigeben (beim Entladen) @param {string|number} owner */
function releaseSpots(owner){
  const O=spotOwners.get(owner); if(!O) return; spotOwners.delete(owner);
  for(const s of O) spotCells(s.x,s.z,s.r,(i,j)=>{ const k=spotKey(i,j), L=spotGrid.get(k); if(!L) return; const n=L.indexOf(s); if(n>=0) L.splice(n,1); if(!L.length) spotGrid.delete(k); });
}

export { claimSpot, releaseSpots, spotFree, takeSpot };
