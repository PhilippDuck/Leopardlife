// LeopardLife – Chunks: die Welt ist in 64×64-m-Felder geteilt. Um jeden Spieler herum sind die Felder bis zur Sichtweite geladen,
// fernere werden entladen. Jedes Feld entsteht aus dem Weltsamen + seinen Koordinaten (kommt man zurück, sieht es gleich aus).
// Schritt 2: mitwandernder Boden, Fernlandschaft und Berge folgen der Kamera – man kann endlos laufen.
// Später hängen hier je Chunk Pflanzen, Wasser, Tiere und besondere Funde dran (chunk.content).
import { scene } from './engine.js';
import { P, players } from './player.js';
import { REG } from './save.js';
import { G } from './state.js';
import { GLSL_H, H, hash2, onView, pondAt, registerCull, unregisterCull, vnoise } from './terrain.js';
import { rnd } from './util.js';

const CHUNK=64, SEG=26;
/** @typedef {{cx:number,cz:number,key:string,mesh:any,cull:any,used:number}} Chunk */
/** @type {Map<string,Chunk>} */
const chunks=new Map();
const pool=[];
const keyOf=(cx,cz)=>cx+','+cz;
const chunkOf=v=>Math.floor(v/CHUNK);

/* ---------- Boden je Chunk ---------- */
const groundMat=new THREE.MeshLambertMaterial({vertexColors:true});
const c1=new THREE.Color(REG.ground[0]), c2=new THREE.Color(REG.ground[1]), dirt=new THREE.Color(0x8f7248), sand=new THREE.Color(0xcbbb8c), mud=new THREE.Color(0x66684a), _c=new THREE.Color();
function newGroundMesh(){
  const g=new THREE.PlaneGeometry(CHUNK,CHUNK,SEG,SEG); g.rotateX(-Math.PI/2);
  const n=g.attributes.position.count;
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3),3)); g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(n*3),3));
  const m=new THREE.Mesh(g,groundMat); m.receiveShadow=true; m.userData.base=Float32Array.from(g.attributes.position.array); return m;
}
/** Boden-Stück für Chunk (cx,cz) füllen: Höhe, Farbe (Gras, Erde, Ufer) und Normalen aus der Höhenformel */
function fillGround(m,cx,cz){
  const g=m.geometry, p=g.attributes.position, base=m.userData.base, col=g.attributes.color.array, nor=g.attributes.normal.array, E=0.5;
  const ox=cx*CHUNK+CHUNK/2, oz=cz*CHUNK+CHUNK/2;
  for(let i=0;i<p.count;i++){
    const x=base[i*3]+ox, z=base[i*3+2]+oz;
    p.setXYZ(i,x,H(x,z),z);
    const t=Math.min(1,Math.max(0,(Math.hypot(x,z)-60)/130));
    _c.copy(c1).lerp(c2,t);
    const n=vnoise(x,z);
    if(n>0.3) _c.lerp(dirt,Math.min(1,(n-0.3)*3)*0.75); else if(n<-0.3) _c.multiplyScalar(1+Math.max(-0.22,(n+0.3)*0.6));
    const po=pondAt(x,z,1.35);
    if(po){ const d=Math.hypot(x-po.x,z-po.z)/po.r; if(d<0.86) _c.copy(mud); else _c.lerp(sand,Math.min(1,(1.35-d)/0.3)); }
    const kk=0.94+hash2(x,z)*0.12;
    col[i*3]=_c.r*kk; col[i*3+1]=_c.g*kk; col[i*3+2]=_c.b*kk;
    const hx=(H(x+E,z)-H(x-E,z))/(2*E), hz=(H(x,z+E)-H(x,z-E))/(2*E), l=Math.hypot(hx,1,hz);
    nor[i*3]=-hx/l; nor[i*3+1]=1/l; nor[i*3+2]=-hz/l;
  }
  p.needsUpdate=true; g.attributes.color.needsUpdate=true; g.attributes.normal.needsUpdate=true; g.computeBoundingSphere();
}

function loadChunk(cx,cz){
  const key=keyOf(cx,cz); if(chunks.has(key)) return;
  const mesh=pool.pop()||newGroundMesh(); fillGround(mesh,cx,cz); mesh.visible=true; scene.add(mesh);
  const x=cx*CHUNK+CHUNK/2, z=cz*CHUNK+CHUNK/2;
  chunks.set(key,{cx,cz,key,mesh,cull:registerCull(mesh,x,z,CHUNK*0.75),used:performance.now()});
}
function unloadChunk(c){ unregisterCull(c.cull); scene.remove(c.mesh); pool.push(c.mesh); chunks.delete(c.key); }

/* ---------- Welche Chunks werden gebraucht? ---------- */
/** Laderadius in Metern: bis knapp hinter die Nebelgrenze, aber begrenzt (dahinter übernimmt die Fernlandschaft) */
const loadR=()=>Math.min(260,Math.max(150,(G.FOG_BASE?G.FOG_BASE[1]:240)*0.9));
const queue=[]; let planT=0;
function plan(){
  const R=loadR(), need=new Set(); queue.length=0;
  for(const p of players){ const pcx=chunkOf(p.x), pcz=chunkOf(p.z), n=Math.ceil(R/CHUNK)+1;
    for(let i=-n;i<=n;i++) for(let j=-n;j<=n;j++){ const cx=pcx+i, cz=pcz+j, x=cx*CHUNK+CHUNK/2, z=cz*CHUNK+CHUNK/2, d=Math.hypot(x-p.x,z-p.z);
      if(d>R+CHUNK*0.7) continue; const k=keyOf(cx,cz); need.add(k);
      if(!chunks.has(k)&&!queue.some(q=>q.k===k)) queue.push({k,cx,cz,d}); } }
  queue.sort((a,b)=>a.d-b.d);
  // weit außerhalb aller Ladebereiche: entladen (mit Spielraum, damit es an der Grenze nicht flackert)
  for(const c of [...chunks.values()]){ if(need.has(c.key)) { c.used=performance.now(); continue; }
    const x=c.cx*CHUNK+CHUNK/2, z=c.cz*CHUNK+CHUNK/2; const d=Math.min(...players.map(p=>Math.hypot(x-p.x,z-p.z)));
    if(d>R+CHUNK*2) unloadChunk(c); }
}
/** Pro Bild: Plan auffrischen und ein paar Chunks aufbauen (nahe sofort, ferne verteilt über mehrere Bilder) */
function updateChunks(dt){
  planT-=dt; if(planT<=0){ planT=0.3; plan(); }
  let budget=2;
  while(queue.length&&(budget>0||queue[0].d<CHUNK*1.2)){ const q=queue.shift(); loadChunk(q.cx,q.cz); budget--; }
}
/** Alles Nötige sofort laden (Start, Neuerwachen, Teleport) */
function loadAllNow(){ plan(); while(queue.length){ const q=queue.shift(); loadChunk(q.cx,q.cz); } }

/* ---------- Fernlandschaft: grobes Gelände bis zum Horizont, folgt der Kamera ---------- */
// Liegt überall knapp unter dem echten Boden; um die Spieler herum (dort ist der Chunk-Boden) wird es weggeklappt.
const FAR_SIZE=1800, FAR_SEG=90, FAR_STEP=FAR_SIZE/FAR_SEG;
const farUni={uPl:{value:[new THREE.Vector2(),new THREE.Vector2(),new THREE.Vector2(),new THREE.Vector2()]},uN:{value:1},uHole:{value:150}};
const farMat=new THREE.MeshLambertMaterial({color:new THREE.Color(REG.ground[1]).multiplyScalar(0.92)});
farMat.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,farUni);
  sh.vertexShader='uniform vec2 uPl[4]; uniform int uN; uniform float uHole;\n'+GLSL_H+sh.vertexShader
    .replace('#include <beginnormal_vertex>',`vec4 fwp=modelMatrix*vec4(position,1.0);
  float fhL=H0(fwp.xz-vec2(4.0,0.0)), fhR=H0(fwp.xz+vec2(4.0,0.0)), fhD=H0(fwp.xz-vec2(0.0,4.0)), fhU=H0(fwp.xz+vec2(0.0,4.0));
  vec3 objectNormal=normalize(vec3(fhL-fhR,8.0,fhD-fhU));`)
    .replace('#include <begin_vertex>',`vec3 transformed=vec3(position);
  float fh=H0(fwp.xz)-0.35; float hole=0.0;
  for(int i=0;i<4;i++){ if(i<uN&&distance(fwp.xz,uPl[i])<uHole) hole=1.0; }
  transformed.y=hole>0.5?-80.0:fh;`);
};
const farGeo=new THREE.PlaneGeometry(FAR_SIZE,FAR_SIZE,FAR_SEG,FAR_SEG); farGeo.rotateX(-Math.PI/2);
const far=new THREE.Mesh(farGeo,farMat); far.frustumCulled=false; far.receiveShadow=false; scene.add(far);

/* Berge am Horizont: ein Kranz, der mit der Kamera mitwandert (unerreichbar weit weg) */
const mount=(()=>{
  const M2=46, m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), cc=new THREE.Color();
  const mt=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),new THREE.MeshBasicMaterial({color:0xffffff,fog:false}),M2);
  for(let i=0;i<M2;i++){
    const a=i/M2*6.283+rnd(-0.05,0.05), r=rnd(880,960), h=rnd(110,260), w=rnd(150,280);
    m.compose(v.set(Math.cos(a)*r,h/2-25,Math.sin(a)*r),q,s.set(w,h,w)); mt.setMatrixAt(i,m);
    mt.setColorAt(i,cc.setHSL(rnd(0.5,0.55),rnd(0.14,0.2),rnd(0.68,0.74)));
  }
  mt.frustumCulled=false; scene.add(mt); G.farMount=mt; return mt;
})();

/** Vor jeder Ansicht: Fernlandschaft (auf ein grobes Raster eingerastet, damit nichts „schwimmt“) und Berge zur Kamera */
onView(cam=>{
  const x=cam.position.x, z=cam.position.z;
  far.position.set(Math.round(x/FAR_STEP)*FAR_STEP,0,Math.round(z/FAR_STEP)*FAR_STEP); far.updateMatrixWorld();
  mount.position.set(x,0,z); mount.updateMatrixWorld(); G.farMount=mount;
  const pl=farUni.uPl.value; farUni.uN.value=Math.min(4,players.length);
  for(let i=0;i<4;i++){ const p=players[i]||P; pl[i].set(p.x,p.z); }
  farUni.uHole.value=loadR()-CHUNK*0.8;
});

loadAllNow();

export { CHUNK, chunkOf, chunks, loadAllNow, updateChunks };
