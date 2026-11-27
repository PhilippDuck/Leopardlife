// LeoLife – Wildwechsel und Salzlecken.
// Ausgetretene Pfade verbinden benachbarte Wasserlöcher (Startgebiet untereinander, in der weiten Welt Tümpel benachbarter Felder).
// Durstige Herden laufen das letzte Stück auf dem Pfad zum Wasser – dort lohnt sich ein Hinterhalt. Auf manchen Pfaden liegt
// eine helle Salzlecke, an der Pflanzenfresser ab und zu stehen bleiben und lecken (weite Sicht, keine Deckung).
import { scene } from './engine.js';
import { H, PONDS, WORLD, registerCull, registerTile, tileOf, unregisterCull, worldPond } from './terrain.js';
import { CHUNK } from './chunks.js';

const TRAIL_W=0.75, STEP=4, CELL=256;
const trailHash=(a,b)=>{ const v=Math.sin(a*12.9898+b*78.233)*43758.5453; return v-Math.floor(v); };
/** Pfad zwischen zwei Wasserlöchern p und q: von Ufer zu Ufer, leicht geschlängelt; Salzlecke bei etwa jedem dritten */
function makeTrail(p,q){
  const dx=q.x-p.x, dz=q.z-p.z, d=Math.hypot(dx,dz), ux=dx/d, uz=dz/d, a0=p.r*1.05, a1=d-q.r*1.05;
  const seed=trailHash(p.x+q.x,p.z+q.z), pts=[];
  const n=Math.max(2,Math.ceil((a1-a0)/STEP));
  for(let i=0;i<=n;i++){
    const t=a0+(a1-a0)*i/n, edge=Math.min(1,Math.min(t-a0,a1-t)/12);   // an den Enden gerade aufs Wasser zu
    const off=edge*(2.6*Math.sin(t*0.045+seed*20)+1.2*Math.sin(t*0.13+seed*7));
    pts.push([p.x+ux*t-uz*off,p.z+uz*t+ux*off]);
  }
  const mid=pts[Math.floor(pts.length/2)], salt=seed<0.34?{x:mid[0]-uz*5,z:mid[1]+ux*5,r:2.6+seed*4}:null;
  return {p,q,pts,salt,ax:pts[0][0],az:pts[0][1],bx:pts[pts.length-1][0],bz:pts[pts.length-1][1]};
}
/** Pfade des Startgebiets: Wasserlöcher mit höchstens 300 m Abstand */
const homeTrails=[];
for(let i=0;i<PONDS.length;i++) for(let j=i+1;j<PONDS.length;j++){ const p=PONDS[i], q=PONDS[j]; if(Math.hypot(p.x-q.x,p.z-q.z)<300) homeTrails.push(makeTrail(p,q)); }
const worldTrailCache=new Map();
/** Pfade, die vom Tümpelfeld gx,gz nach rechts und unten führen (fest aus Lage) */
function cellTrails(gx,gz){
  const key=gx*100003+gz; if(worldTrailCache.has(key)) return worldTrailCache.get(key);
  const out=[], p=worldPond((gx+0.5)*CELL,(gz+0.5)*CELL);
  if(p) for(const [nx,nz] of [[gx+1,gz],[gx,gz+1]]){ const q=worldPond((nx+0.5)*CELL,(nz+0.5)*CELL); if(q&&Math.hypot(p.x-q.x,p.z-q.z)<380) out.push(makeTrail(p,q)); }
  worldTrailCache.set(key,out); return out;
}
/** Alle Pfade, die x,z nahe kommen können */
function trailsNear(x,z){
  const out=Math.hypot(x,z)<WORLD+320?homeTrails.slice():[];
  const gx=Math.floor(x/CELL), gz=Math.floor(z/CELL);
  for(let i=gx-2;i<=gx+1;i++) for(let j=gz-2;j<=gz+1;j++) out.push(...cellTrails(i,j));
  return out;
}

/* ---------- Darstellung: Streifen dicht über dem Boden ---------- */
const trailMat=new THREE.MeshLambertMaterial({color:0x8d7552,transparent:true,opacity:0.5,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
const saltMat=new THREE.MeshLambertMaterial({color:0xe4ddc6,transparent:true,opacity:0.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
/** Streifen-Geometrie für die Punkte pts (nur die, für die keep(x,z) gilt; Lücken trennen den Streifen) */
function stripGeo(pts,keep){
  const pos=[], idx=[]; let prev=-1;
  for(let i=0;i<pts.length;i++){
    const [x,z]=pts[i]; if(!keep(x,z)){ prev=-1; continue; }
    const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)], dx=b[0]-a[0], dz=b[1]-a[1], d=Math.hypot(dx,dz)||1, nx=-dz/d*TRAIL_W, nz=dx/d*TRAIL_W;
    const v=pos.length/3; pos.push(x+nx,H(x+nx,z+nz)+0.05,z+nz, x-nx,H(x-nx,z-nz)+0.05,z-nz);
    if(prev>=0) idx.push(prev,prev+1,v, prev+1,v+1,v);
    prev=v;
  }
  if(!idx.length) return null;
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Helle, unregelmäßige Scheibe der Salzlecke */
function saltGeo(s){
  const pos=[s.x,H(s.x,s.z)+0.06,s.z], idx=[], n=14;
  for(let i=0;i<=n;i++){ const a=i/n*6.283, r=s.r*(0.75+0.35*trailHash(s.x+i,s.z-i)), x=s.x+Math.cos(a)*r, z=s.z+Math.sin(a)*r; pos.push(x,H(x,z)+0.06,z); if(i) idx.push(0,i+1,i); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function trailMesh(g,mat){ const m=new THREE.Mesh(g,mat); m.receiveShadow=true; m.frustumCulled=false; return m; }
// Startgebiet: je Pfad ein Streifen je Kachel-Abschnitt
for(const t of homeTrails){
  const inside=(x,z)=>Math.hypot(x,z)<WORLD;
  const g=stripGeo(t.pts,inside); if(g){ const m=trailMesh(g,trailMat), c=t.pts[Math.floor(t.pts.length/2)]; registerTile(m,tileOf(c[0],c[1]),Math.hypot(t.bx-t.ax,t.bz-t.az)/2+20); scene.add(m); }
  if(t.salt&&inside(t.salt.x,t.salt.z)){ const m=trailMesh(saltGeo(t.salt),saltMat); registerTile(m,tileOf(t.salt.x,t.salt.z),20); scene.add(m); }
}
/** Pfade und Salzlecken in einem nachgeladenen Abschnitt der weiten Welt */
function fillTrails(chunk){
  const x0=chunk.cx*CHUNK, z0=chunk.cz*CHUNK, cx=x0+CHUNK/2, cz=z0+CHUNK/2, meshes=[];
  const inChunk=(x,z)=>x>=x0-STEP&&x<x0+CHUNK+STEP&&z>=z0-STEP&&z<z0+CHUNK+STEP&&Math.hypot(x,z)>=WORLD-STEP;
  for(const t of trailsNear(cx,cz)){
    if(homeTrails.includes(t)) continue;
    const g=stripGeo(t.pts,inChunk); if(g) meshes.push(trailMesh(g,trailMat));
    if(t.salt&&t.salt.x>=x0&&t.salt.x<x0+CHUNK&&t.salt.z>=z0&&t.salt.z<z0+CHUNK) meshes.push(trailMesh(saltGeo(t.salt),saltMat));
  }
  if(!meshes.length) return;
  const culls=meshes.map(m=>{ scene.add(m); return registerCull(m,cx,cz,60); });
  chunk.content.push({inUse:()=>false,drop:()=>{ meshes.forEach((m,i)=>{ unregisterCull(culls[i]); scene.remove(m); m.geometry.dispose(); }); }});
}

/* ---------- Verhalten der Herden ---------- */
/** Pfad zum Wasserloch q, auf den ein Tier bei x,z einschwenken kann (höchstens 35 m daneben), mit dem Ende am Wasser; sonst null */
function trailTo(q,x,z){
  let best=null, bd=35;
  for(const t of trailsNear(x,z)){
    const toQ=Math.hypot(t.q.x-q.x,t.q.z-q.z)<1?1:Math.hypot(t.p.x-q.x,t.p.z-q.z)<1?0:-1; if(toQ<0) continue;
    for(let i=0;i<t.pts.length;i+=2){ const d=Math.hypot(t.pts[i][0]-x,t.pts[i][1]-z); if(d<bd){ bd=d; best={t,toQ}; } }
  }
  return best;
}
/**
 * Nächster Wegpunkt für ein Tier auf dem Weg zum Wasser über den Pfad (a.trail: {t,toQ}); null, wenn es direkt gehen soll.
 * Das Tier läuft zum nächsten Pfadpunkt in Richtung Wasser; die letzten Meter geht es direkt zur Trinkstelle.
 */
function trailStep(a){
  const tr=a.trail; if(!tr) return null;
  const pts=tr.t.pts, n=pts.length; let bi=0, bd=1e9;
  for(let i=0;i<n;i++){ const d=Math.hypot(pts[i][0]-a.x,pts[i][1]-a.z); if(d<bd){ bd=d; bi=i; } }
  const j=tr.toQ?bi+2:bi-2;
  if(j<1||j>n-2) return null;
  return pts[j];
}
/** Trinkstelle am Pfadende (statt der Stelle auf der Geraden zum Wasserloch) */
function trailDrinkSpot(tr,q){ const e=tr.toQ?tr.t.pts[tr.t.pts.length-1]:tr.t.pts[0], an=Math.atan2(e[1]-q.z,e[0]-q.x); return [q.x+Math.cos(an)*q.r*0.93,q.z+Math.sin(an)*q.r*0.93]; }
/** Nächste Salzlecke im Umkreis R um x,z, sonst null */
function saltNear(x,z,R){
  let best=null, bd=R;
  for(const t of trailsNear(x,z)) if(t.salt){ const d=Math.hypot(t.salt.x-x,t.salt.z-z); if(d<bd){ bd=d; best=t.salt; } }
  return best;
}

export { fillTrails, saltNear, trailDrinkSpot, trailStep, trailTo, trailsNear };
