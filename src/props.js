// LeoLife – Landschaftsobjekte aus Low-Poly-Modellen (Meshy): Termitenhügel, Euphorbien, Aloen, Akazienbüsche, Steinhaufen,
// Knochen und Dorngestrüpp. Im Startgebiet beim Laden, in der weiten Welt je Abschnitt (fillProps).
// - Termitenhügel: Hindernis und Deckung; man springt hinauf (wie auf kleine Felsen) und hat Aussicht.
// - Dorngestrüpp: Versteck wie hohes Gras, aber man kommt darin nur langsam voran (thornAt in vegetation.js).
// - Knochen: verstreut im Trockenen und dort, wo ein Kadaver am Boden zu Ende gefressen wurde (leaveBones).
import { scene, windU } from './engine.js';
import { H, WORLD, addCol, addSight, dryness, registerCull, registerTile, removeCol, removeSight, tileOf, unregisterCull } from './terrain.js';
import { patches, releaseTree, treeSlot, trees } from './vegetation.js';
import { homeKopjes, kopjeNear, worldKopje } from './kopjesites.js';
import { shoreDist } from './reeds.js';
import { modelGeometry } from './meshmodel.js';
import { seeded } from './noise.js';
import { WORLD_SEED } from './save.js';
import { CHUNK } from './chunks.js';
import { players } from './player.js';
import { followers } from './cubfollow.js';
import { animals } from './animals.js';
import { quality } from './quality.js';
import { G } from './state.js';
import { TERMITE } from './termitemodel.js';
import { EUPHORBIA } from './euphorbiamodel.js';
import { ACACIABUSH } from './acaciabushmodel.js';
import { ALOE } from './aloemodel.js';
import { ROCKPILE } from './rockpilemodel.js';
import { BONES } from './bonesmodel.js';
import { THORN } from './thornmodel.js';

/* ---------- Modelle und Materialien ---------- */
const propTime={value:0};
const propMat=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
/** Laub des Akazienbuschs wiegt sich im Wind (je höher, desto mehr) */
const propLeafMat=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
propLeafMat.onBeforeCompile=sh=>{
  sh.uniforms.uTime=propTime; sh.uniforms.uWind=windU;
  sh.vertexShader='uniform float uTime; uniform vec2 uWind;\n'+sh.vertexShader.replace('#include <project_vertex>',
    'vec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp=instanceMatrix*wp;\n#endif\n wp=modelMatrix*wp;\n'+
    ' float sw=sin(uTime*1.4+wp.x*0.3+wp.z*0.23)*0.5+sin(uTime*2.9+wp.x*0.8)*0.15;\n wp.xz+=uWind*(sw+0.4)*max(0.0,transformed.y)*0.06;\n'+
    ' vec4 mvPosition=viewMatrix*wp;\n gl_Position=projectionMatrix*mvPosition;');
};
const propTick=()=>{ propTime.value=performance.now()/1000; };
/** Je Sorte: Modell-Teile [Geometrie, Material], Höhe für Schatten/Deckung */
const KINDS={
  termite:{parts:[[TERMITE.wood,propMat]]},
  euphorbia:{parts:[[EUPHORBIA.wood,propMat]]},
  bush:{parts:[[ACACIABUSH.wood,propMat],[ACACIABUSH.leaf,propLeafMat]],shade:true},
  aloe:{parts:[[ALOE.wood,propMat]]},
  rocks:{parts:[[ROCKPILE.wood,propMat]]},
  bones:{parts:[[BONES.wood,propMat]],noShadow:true},
  thorn:{parts:[[THORN.wood,propMat]]},
};
for(const k in KINDS) KINDS[k].geos=KINDS[k].parts.map(([p,m])=>[modelGeometry(p),m]);

/* ---------- Erdfleck am Fuß der Termitenhügel ----------
   Ausgeblichene Erde in der Form des Hügels (Umriss aus den unteren Ecken des Modells), die nach außen hin ausläuft. */
const APRON_N=24, APRON_OUT=2.3;
/** Umriss des Hügels am Boden: größter Abstand der unteren Ecken je Winkelstück (geglättet) */
const moundFoot=(function(){
  const P=KINDS.termite.geos[0][0].attributes.position, f=new Array(APRON_N).fill(0.3);
  for(let i=0;i<P.count;i++){ const y=P.getY(i); if(y>0.35) continue; const x=P.getX(i), z=P.getZ(i), k=Math.floor((Math.atan2(z,x)/6.283+1)*APRON_N)%APRON_N; f[k]=Math.max(f[k],Math.hypot(x,z)); }
  return f.map((_,k)=>(f[(k+APRON_N-1)%APRON_N]+2*f[k]+f[(k+1)%APRON_N])/4);
})();
/** Verlauf: innen fast deckend, außen durchsichtig (über die u-Koordinate) */
const apronTex=(function(){
  const cv=document.createElement('canvas'); cv.width=64; cv.height=1; const ctx=cv.getContext('2d'); if(!ctx||!ctx.createLinearGradient) return null;
  const g=ctx.createLinearGradient(0,0,64,0); g.addColorStop(0,'rgba(255,255,255,0.78)'); g.addColorStop(0.45,'rgba(255,255,255,0.4)'); g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,64,1); const t=new THREE.CanvasTexture(cv); t.wrapS=THREE.ClampToEdgeWrapping; return t;
})();
const apronMat=new THREE.MeshLambertMaterial({map:apronTex,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
/** Eine Geometrie für alle Erdflecken der Hügel in list (folgt dem Gelände), Farbe wie der Hügel, etwas blasser */
function apronMesh(list){
  const pos=[], uv=[], col=[], idx=[], c=new THREE.Color(), base=new THREE.Color(0xa58466);
  for(const p of list){
    c.setHex(p.c??0xffffff).multiply(base);
    const ca=Math.cos(p.a), sa=Math.sin(p.a), o=pos.length/3, ring=(f,u)=>{ for(let k=0;k<APRON_N;k++){
      const an=(k+0.5)/APRON_N*6.283, r=moundFoot[k]*f*p.s, lx=Math.cos(an)*r, lz=Math.sin(an)*r;
      const x=p.x+lx*ca+lz*sa, z=p.z-lx*sa+lz*ca; pos.push(x,H(x,z)+0.05,z); uv.push(u,0.5); col.push(c.r,c.g,c.b); } };
    ring(0.9,0); ring(APRON_OUT,1);
    for(let k=0;k<APRON_N;k++){ const a=o+k, b=o+(k+1)%APRON_N; idx.push(a,b,a+APRON_N, b,b+APRON_N,a+APRON_N); }
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.setIndex(idx); g.computeVertexNormals();
  const m=new THREE.Mesh(g,apronMat); m.receiveShadow=true; m.frustumCulled=false; m.userData.ownGeo=true; return m;
}

/**
 * Instanz-Modelle für Plätze einer Sorte. Plätze: {x,z,y,a (Drehung),s (Größe),sy (Höhe, sonst s),c (Farbe, Hex; sonst weiß)}
 * @returns {any[]}
 */
function propMeshes(kind,list){
  const K=KINDS[kind], m=new THREE.Matrix4(), q=new THREE.Quaternion(), v=new THREE.Vector3(), s=new THREE.Vector3(), c=new THREE.Color(), UP=new THREE.Vector3(0,1,0);
  return K.geos.map(([g,mat])=>{
    const mesh=new THREE.InstancedMesh(g,mat,list.length);
    list.forEach((p,i)=>{ m.compose(v.set(p.x,p.y,p.z),q.setFromAxisAngle(UP,p.a),s.set(p.s,p.sy||p.s,p.s)); mesh.setMatrixAt(i,m); mesh.setColorAt(i,c.setHex(p.c??0xffffff)); });
    mesh.castShadow=!K.noShadow; mesh.receiveShadow=true; mesh.frustumCulled=false;
    if(mat===propLeafMat) mesh.onBeforeRender=propTick;
    return mesh;
  }).concat(kind==='termite'&&apronTex?[apronMesh(list)]:[]);
}

/* ---------- Plätze ---------- */
const propHsl=(h,s,l)=>new THREE.Color().setHSL(h,s,l).getHex();
/**
 * Objekte in einer 64-m-Zelle (x0,z0): nach Trockenheit, fern vom Wasser, nicht auf Felsen; am Rand eines Felsplateaus
 * (kop) Euphorbien und Aloen. skip(x,z): dort nichts. Liefert {sorte:[Plätze]}.
 */
function cellProps(x0,z0,rng,skip,kop){
  const out={termite:[],euphorbia:[],bush:[],aloe:[],rocks:[],bones:[],thorn:[]};
  const free=(x,z,m)=>!skip(x,z)&&!kopjeNear(x,z,m)&&shoreDist(x,z)>5;
  const at=()=>({x:x0+4+rng()*(CHUNK-8),z:z0+4+rng()*(CHUNK-8)});
  const put=(kind,p,s,extra)=>out[kind].push(Object.assign({x:p.x,z:p.z,y:H(p.x,p.z),a:rng()*6.283,s},extra));
  const tries=(n,chance,minDry,fn)=>{ for(let i=0;i<n;i++){ const p=at(), r=rng(); if(r<chance&&dryness(p.x,p.z)>=minDry&&free(p.x,p.z,3)) fn(p); } };
  tries(2,0.2,0.35,p=>put('termite',p,0.75+rng()*0.5,{y:H(p.x,p.z)-0.2,c:propHsl(0.07+rng()*0.04,0.08+rng()*0.1,0.82+rng()*0.16)}));
  tries(1,0.18,0.5,p=>put('euphorbia',p,0.8+rng()*0.4,{y:H(p.x,p.z)-0.1}));
  tries(2,0.4,0.4,p=>put('bush',p,0.8+rng()*0.5,{c:propHsl(0.15+rng()*0.08,0.25+rng()*0.15,0.75+rng()*0.2)}));
  tries(1,0.35,0.3,p=>put('rocks',p,0.7+rng()*0.8,{y:H(p.x,p.z)-0.12,c:propHsl(0.08,0.06,0.8+rng()*0.25)}));
  tries(1,0.14,0.4,p=>put('bones',p,0.9+rng()*0.4,{y:H(p.x,p.z)-0.02}));
  tries(1,0.3,0.3,p=>put('thorn',p,0.85+rng()*0.45,{y:H(p.x,p.z)-0.1}));
  // Aloen in kleinen Gruppen im Trockenen
  tries(1,0.3,0.45,p=>{ const n=2+Math.floor(rng()*3); for(let j=0;j<n;j++){ const q={x:p.x+(rng()-0.5)*4,z:p.z+(rng()-0.5)*4}; if(free(q.x,q.z,1.5)) put('aloe',q,0.7+rng()*0.5); } });
  // Am Felsplateau: Euphorbien und Aloen am Rand
  if(kop&&!kop.small){
    const ne=1+Math.floor(rng()*2), na=3+Math.floor(rng()*3);
    for(let j=0;j<ne+na;j++){ const a=rng()*6.283, d=kop.R+1.5+rng()*3.5, q={x:kop.x+Math.sin(a)*d,z:kop.z+Math.cos(a)*d};
      if(skip(q.x,q.z)||shoreDist(q.x,q.z)<4||kopjeNear(q.x,q.z,0.6)) continue;
      if(j<ne) put('euphorbia',q,0.8+rng()*0.45,{y:H(q.x,q.z)-0.1}); else put('aloe',q,0.7+rng()*0.6); }
  }
  return out;
}

/* ---------- Hindernisse, Verstecke, Klettern ---------- */
/** Alle geladenen Termitenhügel {x,z,r} (Erdferkel und Schuppentiere suchen dort nach Futter, termites.js) */
const MOUNDS=[];
/** Termitenhügel als Klettereintrag wie eine kleine Felsgruppe: hinaufspringen auch ohne Klettern-Fähigkeit, oben Aussicht */
function moundSpot(p){
  const R=0.75*p.s, top=TERMITE.info.height*p.s-0.25;
  return {x:p.x,z:p.z,y:p.y+0.2,f:1,parts:[],cx:0,cy:-1e4,cz:0,rx:R,ry:1,perch:[0,top,0],tr:R,kopje:{small:true,termite:true,x:p.x,z:p.z,R,top},reach:R+0.25,walkR:0.2};
}
/**
 * Hindernisse und Verstecke der Plätze anlegen. add(fn) bekommt Aufräum-Funktionen (weite Welt); slots: belegte Baum-Einträge.
 */
function applyProps(set,cleanup,slots){
  const keep=fn=>{ if(cleanup) cleanup.push(fn); };
  for(const p of set.termite){
    const col=addCol(p.x,p.z,0.75*p.s,false), sg=addSight(p.x,p.z,0.8*p.s,2.6*p.s,1), mo={x:p.x,z:p.z,r:0.75*p.s}; MOUNDS.push(mo);
    keep(()=>{ removeCol(col); removeSight(sg); MOUNDS.splice(MOUNDS.indexOf(mo),1); });
    const i=treeSlot(); trees[i]=moundSpot(p); slots.push(i); keep(()=>releaseTree(i));
  }
  for(const p of set.euphorbia){ const col=addCol(p.x,p.z,0.35*p.s,false), sg=addSight(p.x,p.z,1.6*p.s,4*p.s,0.5); keep(()=>{ removeCol(col); removeSight(sg); }); }
  for(const p of set.rocks){ const col=addCol(p.x,p.z,0.8*p.s,false), sg=addSight(p.x,p.z,0.9*p.s,1.1*p.s,0.7); keep(()=>{ removeCol(col); removeSight(sg); }); }
  for(const p of set.bush){ const sg=addSight(p.x,p.z,1.1*p.s,2*p.s,0.45); keep(()=>removeSight(sg)); }
  for(const p of set.thorn){
    const sg=addSight(p.x,p.z,1.4*p.s,1.5*p.s,0.85), patch={x:p.x,z:p.z,r:1.5*p.s,thorn:true};
    patches.push(patch); keep(()=>{ removeSight(sg); patches.splice(patches.indexOf(patch),1); });
  }
}

/* ---------- Startgebiet ---------- */
(function(){
  const rng=seeded((WORLD_SEED^0x70726f70)>>>0), all={};
  const skip=(x,z)=>Math.hypot(x,z)>WORLD-4||Math.hypot(x-7,z-5)<12;
  for(let x0=-WORLD;x0<WORLD;x0+=CHUNK) for(let z0=-WORLD;z0<WORLD;z0+=CHUNK){
    const kop=homeKopjes.find(k=>k.x>=x0&&k.x<x0+CHUNK&&k.z>=z0&&k.z<z0+CHUNK);
    const set=cellProps(x0,z0,rng,skip,kop);
    for(const k in set) (all[k]=all[k]||[]).push(...set[k]);
  }
  applyProps(all,null,[]);
  for(const kind in all){
    const byT={}; all[kind].forEach(p=>{ const k=tileOf(p.x,p.z); (byT[k]=byT[k]||[]).push(p); });
    for(const k in byT) for(const m of propMeshes(kind,byT[k])){ registerTile(m,+k,84); scene.add(m); }
  }
})();

/* ---------- Weite Welt ---------- */
/** Objekte eines nachgeladenen Abschnitts (fest aus Weltsamen und Lage) */
function fillProps(chunk){
  const x0=chunk.cx*CHUNK, z0=chunk.cz*CHUNK;
  const rng=seeded((WORLD_SEED^Math.imul(chunk.cx,0x3c6ef372)^Math.imul(chunk.cz,0x1b873593)^0x70726f70)>>>0);
  const set=cellProps(x0,z0,rng,(x,z)=>Math.hypot(x,z)<WORLD+4,worldKopje(chunk.cx,chunk.cz));
  const cleanup=[], slots=[];
  applyProps(set,cleanup,slots);
  for(const kind in set){
    let list=set[kind]; if(!list.length) continue;
    if(quality==='low'&&(kind==='aloe'||kind==='bones')) list=list.filter((_,i)=>i%2===0);   // nur Zierde: auf „niedrig“ weniger
    for(const m of propMeshes(kind,list)){
      scene.add(m); const cu=registerCull(m,x0+CHUNK/2,z0+CHUNK/2,55);
      cleanup.push(()=>{ unregisterCull(cu); scene.remove(m); m.dispose?.(); if(m.userData.ownGeo) m.geometry.dispose(); });
    }
  }
  if(cleanup.length) chunk.content.push({
    inUse:()=>slots.length>0&&(players.some(p=>slots.includes(p.tree))||followers.some(f=>slots.includes(f.tree)||slots.includes(f.waitTree))||animals.some(a=>a.carc&&slots.includes(a.carc.tree))),
    drop:()=>{ for(const fn of cleanup) fn(); }
  });
}

/* ---------- Knochen an alten Fressplätzen ---------- */
const BONE_MAX=16, boneSpots=[];
let boneMesh=null;
/** Ein am Boden zu Ende gefressener Kadaver hinterlässt Knochen (die ältesten verschwinden, wenn es zu viele werden) */
function leaveBones(x,z,size){
  if(!boneMesh){ boneMesh=propMeshes('bones',Array.from({length:BONE_MAX},()=>({x:0,y:-500,z:0,a:0,s:0.001})))[0]; boneMesh.count=0; scene.add(boneMesh); }
  boneSpots.push({x,z,y:H(x,z)-0.02,a:Math.random()*6.283,s:Math.max(0.6,Math.min(1.5,size||1))});
  if(boneSpots.length>BONE_MAX) boneSpots.shift();
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), v=new THREE.Vector3(), s=new THREE.Vector3(), UP=new THREE.Vector3(0,1,0);
  boneSpots.forEach((p,i)=>boneMesh.setMatrixAt(i,m.compose(v.set(p.x,p.y,p.z),q.setFromAxisAngle(UP,p.a),s.set(p.s,p.s,p.s))));
  boneMesh.count=boneSpots.length; boneMesh.instanceMatrix.needsUpdate=true;
}

G.onBones=leaveBones;   // ai.js: Kadaver am Boden zu Ende

export { MOUNDS, fillProps, leaveBones };
