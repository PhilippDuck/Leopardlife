// LeoLife – Gelände: Höhenformel und Wasserlöcher, Kacheln mit Sichtbarkeitsprüfung, Boden, fernes Umland, Wasser und Hindernisse (Kollision).
import { camera, scene } from './engine.js';
import { REG, S } from './save.js';
import { GLSL_SNOISE, seeded, snoise } from './noise.js';
import { G } from './state.js';
import { rnd } from './util.js';

// Radius der begehbaren Welt in Metern
const WORLD=235;
/* Gelände: Hügel aus Simplex-Rauschen (drei Lagen, verschoben durch den Weltsamen) + flache Wasserlöcher.
   Dieselbe Formel steht als GLSL im Gras-Shader. Um den Bau herum wird das Gelände sanft eingeebnet. */
const _rs=seeded(S.seed), NO=[0,1,2].map(()=>[(_rs()-0.5)*400,(_rs()-0.5)*400]);
const Hn=(x,z)=>6.2*snoise(x*0.0062+NO[0][0],z*0.0062+NO[0][1])+2.0*snoise(x*0.021+NO[1][0],z*0.021+NO[1][1])+0.6*snoise(x*0.065+NO[2][0],z*0.065+NO[2][1]);
const DEN_H=Hn(7,5);
function H0(x,z){ const h=Hn(x,z), d=Math.hypot(x-7,z-5); if(d>=22) return h; let w=Math.min(1,(22-d)/12); w=w*w*(3-2*w); return h+(DEN_H-h)*w*0.85; }
// Jedes zweite Wasserloch ist ein trüber Tümpel: braunes Wasser, in dem man ein abgetauchtes Krokodil nicht sieht.
const PONDS=REG.ponds.map((p,i)=>({x:p[0],z:p[1],r:p[2],L:H0(p[0],p[1]),murky:i%2===1}));
// Feuchte Landschaften kehren außerhalb des Startgebiets in großen zusammenhängenden Flächen wieder.
function moisture(x,z){
  return Math.max(0,Math.min(1,0.5+1.3*snoise(x/420+NO[0][0],z/420+NO[0][1])));
}
function dryness(x,z){
  const distance=Math.hypot(x,z);
  const original=Math.min(1,Math.max(0,(distance-60)/130));
  const blend=Math.min(1,Math.max(0,(distance-WORLD)/160));
  return original*(1-blend)+(1-moisture(x,z))*blend;
}
function worldPond(x,z){
  const px=(Math.floor(x/256)+0.5)*256, pz=(Math.floor(z/256)+0.5)*256;
  if(Math.hypot(px,pz)<WORLD+50||moisture(px,pz)<0.62) return null;
  const h=Math.sin(px*12.9898+pz*78.233)*43758.5453;   // fest je Tümpel: gut die Hälfte ist trüb
  return {x:px,z:pz,r:14+moisture(px,pz)*10,L:H0(px,pz),murky:h-Math.floor(h)<0.45};
}
const streamedPonds=[];
function basin(h,x,z,p){
  const d=Math.hypot(x-p.x,z-p.z);
  if(d>=p.r*1.5) return h;
  let w=Math.min(1,(p.r*1.5-d)/(p.r*0.6)); w=w*w*(3-2*w);
  const q=d/p.r, target=d<p.r?p.L-(1-q*q):p.L;
  return h+(target-h)*w;
}
const WATER_D=0.4;
function H(x,z){
  let h=H0(x,z);
  for(let i=0;i<PONDS.length;i++){
    const p=PONDS[i], d=Math.hypot(x-p.x,z-p.z);
    if(d<p.r*1.5){ let w=(p.r*1.5-d)/(p.r*0.6); if(w>1) w=1; w=w*w*(3-2*w); const q=d/p.r; const t=d<p.r?p.L-(1-q*q):p.L; h+=(t-h)*w; }
  }
  const extra=worldPond(x,z);
  return extra?basin(h,x,z,extra):h;
}
/** Dasselbe Wasserloch? (gestreamte Tümpel werden bei jeder Abfrage neu als Objekt erzeugt) */
const samePond=(a,b)=>!!a&&!!b&&a.x===b.x&&a.z===b.z;
function pondAt(x,z,m){ for(let i=0;i<PONDS.length;i++){ const p=PONDS[i]; if(Math.hypot(x-p.x,z-p.z)<p.r*(m||1)) return p; } const extra=worldPond(x,z); return extra&&Math.hypot(x-extra.x,z-extra.z)<extra.r*(m||1)?extra:null; }
/** Nächstes Wasserloch, auch in der gestreamten weiten Welt. */
function nearestPond(x,z){
  let best=null,bd=Infinity; const check=p=>{ if(!p) return; const d=(x-p.x)*(x-p.x)+(z-p.z)*(z-p.z); if(d<bd){bd=d;best=p;} };
  PONDS.forEach(check);
  const gx=Math.floor(x/256),gz=Math.floor(z/256);
  for(let i=gx-2;i<=gx+2;i++) for(let j=gz-2;j<=gz+2;j++) check(worldPond((i+0.5)*256,(j+0.5)*256));
  return best;
}
function inWater(x,z){ const p=pondAt(x,z,1); return !!p&&H(x,z)<p.L-WATER_D-0.05; }
const f6=v=>v.toFixed(6);
/** Trockenheit wie dryness() als GLSL (braucht GLSL_H wegen snoise): Bodengras färbt sich wie der Boden darunter */
const GLSL_DRY='float dryG(vec2 p){ float d=length(p); float o=clamp((d-60.0)/130.0,0.0,1.0); float b=clamp((d-'+WORLD.toFixed(1)+')/160.0,0.0,1.0);\n'+
  '  float m=clamp(0.5+1.3*snoise(p/420.0+vec2('+f6(NO[0][0])+','+f6(NO[0][1])+')),0.0,1.0); return o*(1.0-b)+(1.0-m)*b; }\n';
const GLSL_H=GLSL_SNOISE+'float H0(vec2 p){ float h=6.2*snoise(p*0.0062+vec2('+f6(NO[0][0])+','+f6(NO[0][1])+'))+2.0*snoise(p*0.021+vec2('+f6(NO[1][0])+','+f6(NO[1][1])+'))+0.6*snoise(p*0.065+vec2('+f6(NO[2][0])+','+f6(NO[2][1])+'));\n'+
  '  float d=distance(p,vec2(7.0,5.0)); float w=clamp((22.0-d)/12.0,0.0,1.0); w=w*w*(3.0-2.0*w); return h+('+f6(DEN_H)+'-h)*w*0.85; }\n'+
  'float moisture(vec2 p){return clamp(0.5+1.3*snoise(p/420.0+vec2('+f6(NO[0][0])+','+f6(NO[0][1])+')),0.0,1.0); }\n'+
  'float worldBasin(vec2 p,float h){vec2 center=(floor(p/256.0)+0.5)*256.0; float wet=moisture(center); if(length(center)<285.0||wet<0.62)return h; float r=14.0+wet*10.0; float d=distance(p,center); if(d>=r*1.5)return h; float w=clamp((r*1.5-d)/(r*0.6),0.0,1.0); w=w*w*(3.0-2.0*w); float q=d/r; float level=H0(center); float target=d<r?level-(1.0-q*q):level; return h+(target-h)*w; }\n'+
  'float Hh(vec2 p){ float h=H0(p); float d; float w; float u; float t;\n'+
  PONDS.map(p=>'  d=distance(p,vec2('+p.x.toFixed(2)+','+p.z.toFixed(2)+')); if(d<'+(p.r*1.5).toFixed(2)+'){ w=clamp(('+(p.r*1.5).toFixed(2)+'-d)/'+(p.r*0.6).toFixed(2)+',0.0,1.0); w=w*w*(3.0-2.0*w); u=d/'+p.r.toFixed(2)+'; t=d<'+p.r.toFixed(2)+'?'+p.L.toFixed(4)+'-(1.0-u*u):'+p.L.toFixed(4)+'; h+=(t-h)*w; }\n').join('')+
  '  return worldBasin(p,h); }\n';
const GLSL_PONDMASK=PONDS.map(p=>'  if(distance(w,vec2('+p.x.toFixed(2)+','+p.z.toFixed(2)+'))<'+(p.r*0.93).toFixed(2)+') fade=0.0;\n').join('')+
  // Tümpel der weiten Welt (wie worldPond): je 256-m-Feld höchstens einer, in der Feldmitte, nur wo es feucht genug ist
  '  { vec2 pc=(floor(w/256.0)+0.5)*256.0; float pm=moisture(pc); if(length(pc)>='+(WORLD+50).toFixed(1)+'&&pm>=0.62&&distance(w,pc)<(14.0+pm*10.0)*0.93) fade=0.0; }\n';
const vnoise=(x,z)=>Math.sin(x*0.11+Math.sin(z*0.07)*2.1)*Math.cos(z*0.13+Math.sin(x*0.05)*1.7)*0.5+Math.sin(x*0.31-z*0.27)*0.25+Math.sin(x*0.53+z*0.61)*0.12;


/* Kacheln: Boden, Bäume, Büsche, Felsen und hohes Gras sind in 100-m-Felder aufgeteilt. Pro Bild wird nur gezeichnet,
   was im Blickfeld und vor der Nebelgrenze liegt (mit Zugabe, damit Schatten von knapp außerhalb nicht fehlen). */
const TILE=100, TN=6, TOFF=300;
const tileOf=(x,z)=>Math.max(0,Math.min(TN-1,Math.floor((x+TOFF)/TILE)))*TN+Math.max(0,Math.min(TN-1,Math.floor((z+TOFF)/TILE)));
const tileCenter=k=>({x:Math.floor(k/TN)*TILE-TOFF+TILE/2,z:(k%TN)*TILE-TOFF+TILE/2});
/** @type {((cam:any)=>void)|null} */
let viewHook=null;
/** Etwas, das jeder Ansicht folgen soll (Fernlandschaft, Berge), vor dem Zeichnen jeder Ansicht aufrufen */
function onView(fn){ viewHook=fn; }
const cullList=[], _fr=new THREE.Frustum(), _pm=new THREE.Matrix4(), _sp=new THREE.Sphere();
function registerTile(mesh,k,r){ const c=tileCenter(k); mesh.frustumCulled=false; cullList.push({mesh,s:new THREE.Sphere(new THREE.Vector3(c.x,H(c.x,c.z)+5,c.z),r)}); }
/** Beliebiges Stück (z. B. Chunk-Boden) in die Sichtprüfung aufnehmen; liefert den Eintrag zum späteren Verschieben/Entfernen */
function registerCull(mesh,x,z,r){ mesh.frustumCulled=false; const e={mesh,s:new THREE.Sphere(new THREE.Vector3(x,H(x,z)+5,z),r)}; cullList.push(e); return e; }
function unregisterCull(e){ const i=cullList.indexOf(e); if(i>=0) cullList.splice(i,1); }
/** Blendet Kacheln außerhalb des Sichtfelds von cam aus (beim Splitscreen vor jedem Ausschnitt). */
function cullTiles(cam=camera){
  if(viewHook) viewHook(cam);
  cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  const far=scene.fog.far+10;
  for(let i=0;i<cullList.length;i++){ const t=cullList[i]; _sp.center.copy(t.s.center); _sp.radius=t.s.radius+35;
    t.mesh.visible=t.s.center.distanceTo(cam.position)-t.s.radius<far&&_fr.intersectsSphere(_sp); }
}
const hash2=(x,z)=>{ const h=Math.sin(x*12.9898+z*78.233)*43758.5453; return h-Math.floor(h); };

/* Boden: siehe chunks.js (mitwandernde Bodenstücke je Chunk) */

/* Fernes Umland und Berge am Horizont: siehe chunks.js (folgen der Kamera) */

/* Wasserlöcher */
const waters=[];
PONDS.forEach(p=>{
  const g=new THREE.CircleGeometry(p.r,48); g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,p.murky?new THREE.MeshPhongMaterial({color:0x6e6a3c,transparent:true,opacity:0.96,shininess:40,specular:0x8a8a70})
    :new THREE.MeshPhongMaterial({color:0x4d9db3,transparent:true,opacity:0.74,shininess:120,specular:0xffffff}));
  m.position.set(p.x,p.L-WATER_D,p.z); m.userData.y=p.L-WATER_D; m.receiveShadow=true; scene.add(m); waters.push(m);
});

/* Hindernisse: Kreis-Kollider in einem Raster ohne Rand (Zellen nach Bedarf). low = niedrig, kann im Sprung überquert werden */
const CG=8, colGrid=new Map();
const cKey=(i,j)=>i*1000003+j;
function addCol(x,z,r,low){
  const c={x,z,r,low:!!low}, m=r+2.5;
  const x0=Math.floor((x-m)/CG), x1=Math.floor((x+m)/CG), z0=Math.floor((z-m)/CG), z1=Math.floor((z+m)/CG);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=cKey(i,j); let L=colGrid.get(k); if(!L) colGrid.set(k,L=[]); L.push(c); }
  return c;
}
/** Kollider wieder entfernen (wenn ein Chunk entladen wird) */
function removeCol(c){ removeFromGrid(colGrid,c,c.r+2.5); }
function removeSight(o){ removeFromGrid(sightGrid,o,o.r); }
function removeFromGrid(grid,c,m){
  const  x0=Math.floor((c.x-m)/CG), x1=Math.floor((c.x+m)/CG), z0=Math.floor((c.z-m)/CG), z1=Math.floor((c.z+m)/CG);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=cKey(i,j), L=grid.get(k); if(!L) continue; const n=L.indexOf(c); if(n>=0) L.splice(n,1); if(!L.length) grid.delete(k); }
}
/* Sichthindernisse (Felsen, Büsche, Baumstämme): Kreis mit Höhe und Deckkraft 0…1, im selben Rasterprinzip */
const sightGrid=new Map();
function addSight(x,z,r,h,op){
  const o={x,z,r,top:H(x,z)+h,op}, x0=Math.floor((x-r)/CG), x1=Math.floor((x+r)/CG), z0=Math.floor((z-r)/CG), z1=Math.floor((z+r)/CG);
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++){ const k=cKey(i,j); let L=sightGrid.get(k); if(!L) sightGrid.set(k,L=[]); L.push(o); }
  return o;
}
/** Hindernisse in der Rasterzelle von (x,z) */
const sightAt=(x,z)=>sightGrid.get(cKey(Math.floor(x/CG),Math.floor(z/CG)));
const _col={x:0,z:0};
function collide(x,z,rad,skipLow){
  const L=colGrid.get(cKey(Math.floor(x/CG),Math.floor(z/CG)));
  if(L){
    for(let k=0;k<L.length;k++){
      const c=L[k]; if(skipLow&&c.low) continue;
      const dx=x-c.x, dz=z-c.z, m=c.r+rad, d2=dx*dx+dz*dz;
      if(d2<m*m){ const d=Math.sqrt(d2); if(d<1e-4){ x=c.x+m; } else { x=c.x+dx/d*m; z=c.z+dz/d*m; } }
    }
  }
  _col.x=x; _col.z=z; return _col;
}

export { samePond, GLSL_DRY, moisture, dryness, worldPond, streamedPonds, removeSight, addSight, sightAt, GLSL_H, GLSL_PONDMASK, H, H0, PONDS, WATER_D, WORLD, addCol, collide, cullTiles, hash2, inWater, nearestPond, onView, pondAt, registerCull, registerTile, removeCol, tileOf, unregisterCull, vnoise, waters };
