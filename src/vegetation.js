// LeoLife – Pflanzen: Bäume (mit Ausblenden vor der Kamera), Büsche, Felsen, Stämme, Blumen, Bodengras, hohes Gras als Versteck. (Der Bau ist ein Felsplateau mit Höhle, kopje.js.)
import { camera, grassLight, scene, windU } from './engine.js';
import { REG, WORLD_SEED, pScale } from './save.js';
import { seeded } from './noise.js';
import { G } from './state.js';
import { GLSL_DRY, GLSL_H, GLSL_PONDMASK, H, PONDS, WORLD, addCol, addSight, dryness, pondAt, registerTile, tileOf } from './terrain.js';
import { rnd } from './util.js';
import { P } from './player.js';
import { kopjeNear } from './kopjesites.js';
import { ACACIA } from './acaciamodel.js';
import { BAOBAB } from './baobabmodel.js';
import { DEADTREE } from './deadtreemodel.js';
import { JUNGLE } from './junglemodel.js';
import { JUNGLE_WIDE } from './junglewidemodel.js';
import { JUNGLE_TWIN } from './jungletwinmodel.js';
import { JUNGLE_GIANT } from './junglegiantmodel.js';
import { ACACIA_TALL } from './acaciatallmodel.js';
import { ACACIA_WIDE } from './acaciawidemodel.js';
import { ACACIA_LEAN } from './acacialeanmodel.js';
import { modelGeometry } from './meshmodel.js';
import { BUSH } from './bushmodel.js';
import { DRYBUSH } from './drybushmodel.js';
import { ROCK } from './rockmodel.js';
import { reedMesh, reedPatches, reedSpots } from './reeds.js';
import { addWaterPlants } from './waterplants.js';
import { claimSpot, spotFree, takeSpot } from './spots.js';

/* Bäume: aus mehreren Teilen (Stamm, Äste, Wurzeln, Laubballen). Arten: Urwaldbaum, Urwaldriese, Schirmakazie, toter Baum, Palme am Wasser.
   Werden ausgeblendet, wenn ihre Krone zwischen Kamera und Leopard steht.
   Jedes Teil hat eine Sorte (kind): 'wood' und 'leaf' sind Zylinder und Laubballen (nur noch die Palme). Urwaldbaum, Schirmakazie,
   Affenbrotbaum und toter Baum sind fertige Low-Poly-Modelle (TREE_MODELS, Sorten <name>Wood und <name>Leaf). Je Sorte gibt es eigene Instanz-Modelle (treeKinds). */
/** Low-Poly-Baummodelle aus tools/meshy-model.cjs; der tote Baum hat kein Laub */
const TREE_MODELS={jungle:JUNGLE,jungleWide:JUNGLE_WIDE,jungleTwin:JUNGLE_TWIN,jungleGiant:JUNGLE_GIANT,acacia:ACACIA,acaciaTall:ACACIA_TALL,acaciaWide:ACACIA_WIDE,acaciaLean:ACACIA_LEAN,baobab:BAOBAB,dead:DEADTREE};
/** Schirmakazien-Sorten mit Anteil: klassisch, hoch und schlank, breit mit zwei Stämmen, schief vom Wind */
const ACACIA_KINDS=[['acacia',0.4],['acaciaTall',0.2],['acaciaWide',0.25],['acaciaLean',0.15]];
/** Urwaldbaum-Formen mit Anteil (der Riese wird extra ausgewählt): rund und voll, breite Wildfeige, Zwilling mit Lianen */
const JUNGLE_KINDS=[['jungle',0.45],['jungleWide',0.25],['jungleTwin',0.3]];
/** Sorte aus der Lage (fester Zufall ohne Zug aus random(), damit die übrige Bepflanzung gleich bleibt) */
function pickKind(kinds,x,z){
  let u=Math.sin(x*12.9898+z*78.233)*43758.5453; u-=Math.floor(u);
  for(const [name,share] of kinds){ if(u<share) return name; u-=share; }
  return kinds[0][0];
}
/** Mindestabstand zwischen zwei Baumstämmen (m) */
const TREE_GAP=7;
/** Steht schon ein Baum näher als d an x/z? */
function treeNear(x,z,d){ return trees.some(t=>Math.hypot(t.x-x,t.z-z)<d); }
const trees=[]; let woodMeshes=[], leafMeshes=[], leafGeoHi=null, leafGeoLo=null; const dirtyTree=new Set(); const leafTime={value:0};
const _tm=new THREE.Matrix4(), _tb=new THREE.Matrix4(), _tq=new THREE.Quaternion(), _tv=new THREE.Vector3(), _UP=new THREE.Vector3(0,1,0);
function setTree(i){
  const t=trees[i], f=t.f;
  _tb.makeScale(f,f,f); _tb.setPosition(t.x,t.y,t.z);
  for(let j=0;j<t.parts.length;j++){ const p=t.parts[j]; _tm.multiplyMatrices(_tb,p.m); p.mesh.setMatrixAt(p.i,_tm); dirtyTree.add(p.mesh); }
}
function blobGeo(detail){
  // Leicht verbeulte Kugel; der Versatz hängt nur von der Position ab, damit gemeinsame Ecken zusammenbleiben
  const g=new THREE.IcosahedronGeometry(1,detail), p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i), n=1+0.14*Math.sin(x*12.9+y*7.3)*Math.cos(z*9.1-x*3.7)+0.07*Math.sin(y*21.0+z*13.0); p.setXYZ(i,x*n,y*n,z*n); }
  g.computeVertexNormals(); return g;
}
/** Zufall aus dem Weltsamen für die Landschaft des Startgebiets: Alle Geräte im Online-Spiel bekommen dieselben Bäume, Büsche und Verstecke.
    Je Teil ein eigener Strom, damit eine Änderung an einem Teil die anderen nicht verschiebt. */
function vegRng(k){ const r=seeded((WORLD_SEED^k)>>>0); return {r,rr:(a,b)=>a+r()*(b-a)}; }
const hsl=(h,s,l)=>new THREE.Color().setHSL(h,s,l).getHex();
/** Laub wiegt sich im Wind: verschiebt die Ecken im Vertex-Shader nach Zeit, Ort und Windrichtung */
function windy(mat){
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uTime=leafTime;
    sh.uniforms.uWind=windU;
    sh.vertexShader='uniform float uTime; uniform vec2 uWind;\n'+sh.vertexShader.replace('#include <project_vertex>',
      'vec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp=instanceMatrix*wp;\n#endif\n wp=modelMatrix*wp;\n'+
      ' float sw=sin(uTime*1.3+wp.x*0.21+wp.z*0.17)*0.16+sin(uTime*2.7+wp.x*0.7+wp.y*0.5)*0.05;\n wp.xz+=uWind*(sw+0.05);\n'+
      ' vec4 mvPosition=viewMatrix*wp;\n gl_Position=projectionMatrix*mvPosition;');
  };
  return mat;
}
/** Geometrie, Material und Liste der Instanz-Modelle je Teil-Sorte (wird beim Anlegen des Startgebiets gefüllt) */
const treeKinds={}; const modelMeshes=[];
/**
 * Baum aus einem Low-Poly-Modell: je Baum gedreht, k-fach skaliert, leicht gestreckt; Holz- und Laubfarbe (Farbton × Helligkeit im Modell).
 * Setzt Krone (cx/cy/cz, rx/ry), Liegeplatz (perch) und Stammradius (tr) aus den Eckdaten des Modells.
 */
function modelTree(t,name,k,woodColor,leafColor,random){
  const M=TREE_MODELS[name], I=M.info, sx=k*(0.9+random()*0.22), sz=k*(0.9+random()*0.22);
  const ang=random()*6.283, ca=Math.cos(ang), sa=Math.sin(ang), q=new THREE.Quaternion().setFromAxisAngle(_UP,ang);
  const m=new THREE.Matrix4().compose(new THREE.Vector3(0,-0.15,0),q,new THREE.Vector3(sx,k,sz));   // Fuß etwas eingesenkt, damit er am Hang nicht schwebt
  const at=v=>{ const x=v[0]*sx, z=v[2]*sz; return {x:x*ca+z*sa,y:v[1]*k-0.15,z:-x*sa+z*ca}; };   // wie m, als Zahlen
  t.parts.push({kind:name+'Wood',leaf:false,c:woodColor,m});
  if(M.leaf) t.parts.push({kind:name+'Leaf',leaf:true,c:leafColor,m:m.clone()});
  const cr=at(I.crown), pe=at(I.perch), sxz=(sx+sz)/2;
  t.cx=cr.x; t.cz=cr.z; t.cy=cr.y; t.rx=I.rx*sxz; t.ry=I.ry*k; t.perch=[pe.x,pe.y,pe.z]; t.tr=I.trunkR*sxz;
}
function makeTree(o,random=Math.random){
    const rnd=(min,max)=>min+random()*(max-min);
    const t={x:o.x,z:o.z,y:H(o.x,o.z),f:1,parts:[],cx:0,cz:0};
    const wood=(a,b,r,c)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2], len=Math.hypot(dx,dy,dz)||0.01;
      _tq.setFromUnitVectors(_UP,_tv.set(dx/len,dy/len,dz/len));
      t.parts.push({kind:'wood',leaf:false,c,m:new THREE.Matrix4().compose(new THREE.Vector3(a[0],a[1],a[2]),_tq.clone(),new THREE.Vector3(r,len,r))}); };
    const leaf=(p,sx,sy,sz,c,q)=>t.parts.push({kind:'leaf',leaf:true,c,m:new THREE.Matrix4().compose(new THREE.Vector3(p[0],p[1],p[2]),
      q||new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.25,0.25),random()*6.28,rnd(-0.25,0.25))),new THREE.Vector3(sx,sy,sz))});
    if(o.palm){
      // Palme: gebogener Stamm aus Segmenten, Wedel hängen nach unten
      const k=rnd(0.85,1.2), a=random()*6.283, bark=hsl(0.09,0.28,rnd(0.38,0.46)); let p=[0,-0.2,0];
      for(let s=0;s<6;s++){ const th=0.06+0.075*s, L=1.25*k, q=[p[0]+Math.cos(a)*Math.sin(th)*L,p[1]+Math.cos(th)*L,p[2]+Math.sin(a)*Math.sin(th)*L]; wood(p,q,(0.26-0.012*s)*k,bark); p=q; }
      const hue=rnd(0.24,0.3);
      for(let j=0;j<8;j++){ const yaw=j/8*6.283+rnd(-0.25,0.25), pit=rnd(0.22,0.55), d=1.55*k;
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(pit,yaw,0,'YXZ'));
        leaf([p[0]+Math.sin(yaw)*Math.cos(pit)*d,p[1]-Math.sin(pit)*d+0.15*k,p[2]+Math.cos(yaw)*Math.cos(pit)*d],0.5*k,0.09*k,2.0*k,hsl(hue+rnd(-0.02,0.02),rnd(0.45,0.58),rnd(0.3,0.38)),q); }
      leaf([p[0],p[1]-0.15*k,p[2]],0.45*k,0.35*k,0.45*k,hsl(0.08,0.45,0.28));
      t.cx=p[0]; t.cz=p[2]; t.cy=p[1]; t.rx=2.6*k; t.ry=1.1*k; t.perch=[p[0],p[1]+0.25*k,p[2]]; t.tr=0.28*k;
    } else if(o.baobab){
      // Affenbrotbaum: riesiger flaschenförmiger Stamm, kurze dicke Äste, nur kleine Laubbüschel an den Enden; Liegeplatz oben auf dem Stamm
      modelTree(t,'baobab',rnd(0.9,1.15),hsl(rnd(0.05,0.08),rnd(0.08,0.13),rnd(0.36,0.43)),hsl(rnd(0.21,0.26),rnd(0.35,0.45),rnd(0.3,0.38)),random);
      t.baobab=true;
    } else if(o.sav&&random()<0.1){
      // Toter Baum: kahle, graue Äste; Liegeplatz in der Astgabel
      modelTree(t,'dead',rnd(0.8,1.25),hsl(0.08,0.07,rnd(0.46,0.56)),0,random);
    } else if(o.sav){
      // Schirmakazie (vier Sorten): flache, breite Laubschirme; Liegeplatz oben auf der Krone
      modelTree(t,pickKind(ACACIA_KINDS,o.x,o.z),rnd(0.85,1.3),hsl(rnd(0.06,0.09),rnd(0.14,0.22),rnd(0.3,0.38)),hsl(rnd(0.19,0.25),rnd(0.3,0.4),rnd(0.3,0.37)),random);
    } else {
      // Urwaldbaum (vier Formen, selten ein Riese mit Brettwurzeln); Liegeplatz oben auf der Krone
      // Modelle sind 7,5–9 m hoch (Riese 14 m): etwa 10–13 m, der Riese 17–21 m, so groß wie die alten Urwaldbäume
      const name=random()<0.1?'jungleGiant':pickKind(JUNGLE_KINDS,o.x,o.z);
      modelTree(t,name,name==='jungleGiant'?rnd(1.2,1.5):rnd(1.1,1.5),hsl(rnd(0.06,0.09),rnd(0.22,0.32),rnd(0.24,0.32)),hsl(rnd(0.27,0.34),rnd(0.4,0.52),rnd(0.26,0.33)),random);
    }
    return t;
  }
(function(){
  const {r:wr,rr:wrnd}=vegRng(0x74726565);
  for(let i=0;i<REG.trees;i++){
    let x,z,r,n=0; do{ r=Math.sqrt(wr())*WORLD; const a=wr()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }
    while(r<10||(r>110&&wr()<0.7)||pondAt(x,z,1.3)||kopjeNear(x,z,3)||(n++<40&&treeNear(x,z,TREE_GAP)));   // Abstand, damit Stämme nicht ineinander stehen
    trees.push(makeTree({x,z,sav:r>REG.savFrom},wr));
  }
  // Affenbrotbäume: wenige Riesen in der Savanne, weit auseinander; andere Bäume machen ihnen Platz
  const bao=[];
  for(let i=0,t=0;i<(REG.baobabs||0)&&t<200;t++){ const r=wrnd(Math.max(60,REG.savFrom),WORLD-14), a=wr()*6.283, x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(pondAt(x,z,1.6)||kopjeNear(x,z,8)||bao.some(b=>Math.hypot(b.x-x,b.z-z)<70)) continue; bao.push({x,z}); i++; }
  for(let i=trees.length-1;i>=0;i--) if(bao.some(b=>Math.hypot(b.x-trees[i].x,b.z-trees[i].z)<8)) trees.splice(i,1);
  bao.forEach(b=>trees.push(makeTree({x:b.x,z:b.z,baobab:true},wr)));
  PONDS.forEach(p=>{ const n=REG.palms[0]+Math.floor(wr()*(REG.palms[1]-REG.palms[0]+1)); for(let j=0;j<n;j++){ const a=wr()*6.283, d=p.r*wrnd(1.12,1.45); trees.push(makeTree({x:p.x+Math.cos(a)*d,z:p.z+Math.sin(a)*d,palm:true},wr)); } });
  PONDS.forEach(addWaterPlants);
  const N={}; trees.forEach(t=>{ const k=tileOf(t.x,t.z); t.parts.forEach(p=>{ const n=N[p.kind]||(N[p.kind]={}); p.k=k; p.i=n[p.k]=(n[p.k]||0); n[p.k]++; }); });
  const wg=new THREE.CylinderGeometry(0.7,1,1,7,1); wg.translate(0,0.5,0);
  const wm=new THREE.MeshLambertMaterial({color:0xffffff});
  leafGeoHi=blobGeo(1); leafGeoLo=blobGeo(0);
  const lm=windy(new THREE.MeshLambertMaterial({color:0xffffff}));
  treeKinds.wood={geo:wg,mat:wm,list:woodMeshes};
  treeKinds.leaf={geo:leafGeoHi,mat:lm,list:leafMeshes};
  const mwm=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}), mlm=windy(new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}));
  for(const name in TREE_MODELS){ const M=TREE_MODELS[name];
    treeKinds[name+'Wood']={geo:modelGeometry(M.wood),mat:mwm,list:modelMeshes};
    if(M.leaf) treeKinds[name+'Leaf']={geo:modelGeometry(M.leaf),mat:mlm,list:modelMeshes}; }
  const MS={};
  for(const kind in N){ const K=treeKinds[kind], ms=MS[kind]={}; for(const k in N[kind]){ const m=ms[k]=new THREE.InstancedMesh(K.geo,K.mat,N[kind][k]); K.list.push(m); registerTile(m,+k,84); } }
  const c=new THREE.Color();
  trees.forEach((t,i)=>{ t.parts.forEach(p=>{ p.mesh=MS[p.kind][p.k]; p.mesh.setColorAt(p.i,c.setHex(p.c)); }); setTree(i); takeSpot(t.x,t.z,t.tr+0.8); addCol(t.x,t.z,t.tr+0.1); addSight(t.x,t.z,t.tr+0.15,t.baobab?8:6,t.baobab?1:0.55); });   // Stamm verdeckt teilweise, der dicke Affenbrotbaum ganz
  woodMeshes.concat(leafMeshes,modelMeshes).forEach(m=>{ m.castShadow=true; m.receiveShadow=true; scene.add(m); });
})();
/** Bäume, die gerade in mindestens einer Ansicht ausgeblendet sind oder es waren (nur diese müssen je Ansicht umgestellt werden) */
const fadedTrees=new Set();
/** Freie Plätze in der Baumliste (Bäume und Felsplateaus der weiten Welt kommen und gehen mit den Abschnitten) */
const freeTreeSlots=[];
/** Platz für einen neuen Baum-Eintrag */
const treeSlot=()=>freeTreeSlots.pop()??trees.length;
/** Baum-Eintrag i entfernen und den Platz freigeben */
function releaseTree(i){ fadedTrees.delete(i); delete trees[i]; freeTreeSlots.push(i); }
/**
 * Merkt sich je Ansicht, welche Baumkronen auf der Sichtlinie Kamera → Leopard liegen, und blendet sie dort sanft aus.
 * views: [{camera, p}] je Spieler. Gezeichnet wird mit applyTreeView(j) vor dem Ausschnitt j.
 */
function updateTrees(dt,views){
  const L=views.map(({camera:c,p})=>{ const cx=c.position.x, cy=c.position.y, cz=c.position.z, sx=p.x-cx, sy=(p.camY+pScale(p.L)*0.6)-cy, sz=p.z-cz; return [cx,cy,cz,sx,sy,sz,sx*sx+sy*sy+sz*sz||1,p.tree]; });
  const stp=dt*5;
  for(let i=0;i<trees.length;i++){
    const t=trees[i]; if(!t) continue; const kx=t.x+t.cx, ky=t.y+t.cy, kz=t.z+t.cz; const fv=t.fv||(t.fv=[]);
    for(let j=0;j<L.length;j++){ const [cx,cy,cz,sx,sy,sz,len2,own]=L[j]; let target=1;
      if(i!==own){ let u=((kx-cx)*sx+(ky-cy)*sy+(kz-cz)*sz)/len2; u=Math.max(0,Math.min(1,u));
        const dx=(kx-(cx+sx*u))/t.rx, dy=(ky-(cy+sy*u))/t.ry, dz=(kz-(cz+sz*u))/t.rx; if(dx*dx+dy*dy+dz*dz<1) target=0.001; }
      const f=fv[j]===undefined?1:fv[j];
      if(f!==target){ const d=target-f; fv[j]=Math.abs(d)<=stp?target:f+Math.sign(d)*stp; }
      if(fv[j]!==undefined&&fv[j]<1) fadedTrees.add(i); }
    fv.length=L.length;
  }
}
/** Stellt die Bäume so, wie Ansicht j sie sehen soll (vor dem Zeichnen ihres Ausschnitts). */
function applyTreeView(j){
  for(const i of fadedTrees){ const t=trees[i], want=t.fv&&t.fv[j]!==undefined?t.fv[j]:1;
    if(t.f!==want){ t.f=want; setTree(i); }
    if(want>=1&&!(t.fv||[]).some(x=>x<1)) fadedTrees.delete(i); }
  if(dirtyTree.size){ dirtyTree.forEach(m=>{ m.instanceMatrix.needsUpdate=true; }); dirtyTree.clear(); }
}

/* Büsche, Felsen, Stämme, Blumen */
/**
 * Low-Poly-Modell (Meshy, Helligkeit je Dreieck) auf die Maße der früheren einfachen Form bringen: halbe Breite halfW,
 * Höhe h, Unterkante bei y0, in x/z mittig. Den Farbton gibt die Instanzfarbe.
 */
function fitGeometry(part,halfW,h,y0){
  const g=modelGeometry(part); g.computeBoundingBox(); const b=g.boundingBox;
  const sxz=2*halfW/Math.max(b.max.x-b.min.x,b.max.z-b.min.z), sy=h/(b.max.y-b.min.y);
  g.translate(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2); g.scale(sxz,sy,sxz); g.translate(0,y0,0); g.computeBoundingSphere(); return g;
}
/** Grüner Busch: wie früher eine Kugel mit Radius 1 um den Platzierungspunkt (der 0,45 · Höhe über dem Boden liegt) */
const bushGeometry=fitGeometry(BUSH.wood,1,1.6,-0.45);
const bushMaterial=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
function bushColor(sav,random=Math.random){
  const range=(a,b)=>a+random()*(b-a);
  return {h:sav?range(0.17,0.24):range(0.28,0.36),s:range(0.35,0.5),l:sav?range(0.33,0.42):range(0.24,0.34)};
}
/* Vertrockneter Busch: ein Gewirr kahler Zweige vom Boden aus (Ursprung am Boden).
   Man sieht teilweise hindurch – er versteckt weniger als ein grüner Busch. */
const dryBushGeometry=fitGeometry(DRYBUSH.wood,0.9,1.3,0);
/** Stein: wie früher etwa Radius 1 um den Platzierungspunkt, Unterkante etwas im Boden */
const rockGeometry=fitGeometry(ROCK.wood,1,1.4,-0.4);
const dryBushColor=(random=Math.random)=>({h:0.06+random()*0.04,s:0.18+random()*0.16,l:0.26+random()*0.12});
/** Was an einem Buschplatz wächst – nach der Trockenheit d: im Grünen Büsche, im Trockenen kaum noch grüne,
    dafür vertrocknete Büsche und Steine (oder gar nichts). */
function shrubKind(d,random=Math.random){
  if(d<0.4||random()<Math.max(0.08,1-(d-0.4)*2.2)) return 'green';
  const r=random(); return r<0.5?'dry':r<0.8?'rock':null;
}
(function(){
  const {r:wr,rr:wrnd}=vegRng(0x62757368);
  const mat=new THREE.MeshLambertMaterial({color:0xffffff});
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), e=new THREE.Euler(), c=new THREE.Color();
  function scatter(n,geo,fn,shadow,material=mat){
    const by={};
    for(let i=0;i<n;i++){ const o=fn(i); if(!o) continue; const k=tileOf(o.x,o.z); (by[k]=by[k]||[]).push(o); }
    for(const k in by){ const L=by[k], mesh=new THREE.InstancedMesh(geo,material,L.length);
      L.forEach((o,i)=>{ e.set(o.rx||0,o.ry||0,o.rz||0); q.setFromEuler(e); m.compose(v.set(o.x,o.y,o.z),q,s.set(o.sx,o.sy,o.sz)); mesh.setMatrixAt(i,m); mesh.setColorAt(i,c.setHSL(o.h,o.s,o.l)); });
      mesh.castShadow=!!shadow; mesh.receiveShadow=true; scene.add(mesh); registerTile(mesh,+k,78); }
  }
  function spot(rmin,rmax){ let x,z,t=0; do{ const r=Math.sqrt(wrnd(rmin*rmin,rmax*rmax)), a=wr()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }while((pondAt(x,z,1.05)||kopjeNear(x,z,1))&&++t<20); return {x,z,r:Math.hypot(x,z)}; }
  // Buschplätze: im Grünen grüne Büsche, im Trockenen vertrocknete Büsche und Steine (shrubKind)
  const shrubs={green:[],dry:[],rock:[]};
  for(let i=0;i<320;i++){ const p=spot(9,WORLD), k=shrubKind(dryness(p.x,p.z),wr); if(k) shrubs[k].push(p); }
  let si=0;
  scatter(shrubs.green.length,bushGeometry,()=>{ const p=shrubs.green[si++], sy=wrnd(0.5,0.95), sav=p.r>115;
    const bsx=wrnd(0.8,1.7), bsz=wrnd(0.8,1.7), o={x:p.x,z:p.z,y:H(p.x,p.z)+sy*0.45,sx:bsx,sy,sz:bsz,ry:wr()*6,...bushColor(sav,wr)};
    if(!claimSpot(p.x,p.z,(bsx+bsz)*0.4)) return null;   // nicht in anderen Objekten
    addSight(p.x,p.z,(bsx+bsz)*0.42,sy*0.9,0.8);   // Busch: verdeckt fast ganz
    return o; },true,bushMaterial);
  si=0; scatter(shrubs.dry.length,dryBushGeometry,()=>{ const p=shrubs.dry[si++], k=wrnd(0.6,1.05), sy=wrnd(0.6,1.0), o={x:p.x,z:p.z,y:H(p.x,p.z)-0.05,sx:k,sy,sz:k,ry:wr()*6,...dryBushColor(wr)};
    if(!claimSpot(p.x,p.z,k*0.7)) return null;
    addSight(p.x,p.z,k*0.8,sy*0.9,0.35);   // vertrocknet: man sieht teilweise hindurch
    return o; },true,bushMaterial);
  // Steine: erst alle Zufallszahlen ziehen, dann prüfen, ob der Platz frei ist (sonst entfällt der Stein)
  const rock=(p,o)=>{ const {sx,sy,sz}=o;
    if(!claimSpot(p.x,p.z,(sx+sz)*0.4)) return null;
    if(sy>0.45&&sx+sz>1.4) addCol(p.x,p.z,(sx+sz)*0.4,true);   // kleine Steine bleiben begehbar
    if(sy>0.4) addSight(p.x,p.z,(sx+sz)*0.42,sy*0.95,1);   // Felsen verdecken ganz
    return o; };
  si=0; scatter(shrubs.rock.length,rockGeometry,()=>{ const p=shrubs.rock[si++], sy=wrnd(0.25,0.7), sx=wrnd(0.4,1.2), sz=wrnd(0.4,1.2);
    return rock(p,{x:p.x,z:p.z,y:H(p.x,p.z)+sy*0.25,sx,sy,sz,ry:wr()*6,h:wrnd(0.07,0.11),s:wrnd(0.06,0.14),l:wrnd(0.45,0.6)}); },true,bushMaterial);
  scatter(170,rockGeometry,()=>{ const p=spot(12,WORLD), sy=wrnd(0.3,1.2), sx=wrnd(0.4,1.8), sz=wrnd(0.4,1.8);
    return rock(p,{x:p.x,z:p.z,y:H(p.x,p.z)+sy*0.25,sx,sy,sz,ry:wr()*6,h:wrnd(0.07,0.12),s:wrnd(0.04,0.12),l:wrnd(0.42,0.6)}); },true,bushMaterial);
  // Liegende Stämme: Kreise entlang des Stamms
  scatter(34,new THREE.CylinderGeometry(0.34,0.4,1,7),()=>{ const p=spot(15,170), len=wrnd(2.5,5.5), ry=wr()*6, n=Math.ceil(len/0.7);
    const o={x:p.x,z:p.z,y:H(p.x,p.z)+0.28,sx:wrnd(0.8,1.3),sy:len,sz:wrnd(0.8,1.3),rz:Math.PI/2,ry,h:wrnd(0.06,0.09),s:wrnd(0.3,0.45),l:wrnd(0.2,0.3)};
    const along=Array.from({length:n+1},(_,j)=>{ const u=(j/n-0.5)*len; return [p.x+Math.cos(ry)*u,p.z-Math.sin(ry)*u]; });
    if(!along.every(([x,z])=>spotFree(x,z,0.45))) return null;
    for(const [x,z] of along){ takeSpot(x,z,0.45); addCol(x,z,0.42,true); addSight(x,z,0.4,0.62,0.7); }
    return o; },true);
  // Blumen in kleinen Gruppen, vor allem im grünen Zentrum
  const fl=[[0.14,0.9,0.6],[0.92,0.7,0.68],[0.0,0.0,0.95],[0.06,0.9,0.58],[0.75,0.5,0.7]]; let cl=null, cc=null;
  scatter(1100,new THREE.OctahedronGeometry(0.13,0),i=>{ if(i%14===0){ cl=spot(8,150); cc=fl[Math.floor(wr()*fl.length)]; }
    const x=cl.x+wrnd(-2.5,2.5), z=cl.z+wrnd(-2.5,2.5), k=wrnd(0.7,1.4);
    return {x,z,y:H(x,z)+wrnd(0.22,0.4),sx:k,sy:k*0.7,sz:k,ry:wr()*6,h:cc[0],s:cc[1],l:cc[2]}; },false);
})();

G.grassGeo=null; G.grassMat=null;   // werden unten beim Anlegen des Bodengrases gesetzt
// Größte Zahl an Bodengras-Büscheln (Stufe „ultra“); niedrigere Stufen zeichnen weniger
const GRASS_N=30000;
/* Bodengras: Büschel folgen dem Spieler (Kachel-Wiederholung im Shader), wiegen sich im Wind */
(function(){
  const S=80, B=5, pos=new Float32Array(B*9);
  for(let b=0;b<B;b++){ const bx=rnd(-0.28,0.28), bz=rnd(-0.28,0.28), a=Math.random()*3.14, w=0.05, h=rnd(0.35,0.72), o=b*9;
    pos[o]=bx-Math.cos(a)*w; pos[o+1]=0; pos[o+2]=bz-Math.sin(a)*w;
    pos[o+3]=bx+Math.cos(a)*w; pos[o+4]=0; pos[o+5]=bz+Math.sin(a)*w;
    pos[o+6]=bx+rnd(-0.14,0.14); pos[o+7]=h; pos[o+8]=bz+rnd(-0.14,0.14); }
  const off=new Float32Array(GRASS_N*3), sc=new Float32Array(GRASS_N);
  for(let i=0;i<GRASS_N;i++){ off[i*3]=Math.random(); off[i*3+1]=Math.random(); off[i*3+2]=Math.random(); sc[i]=rnd(0.7,1.5); }
  G.grassGeo=new THREE.InstancedBufferGeometry();
  G.grassGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  G.grassGeo.setAttribute('offset',new THREE.InstancedBufferAttribute(off,3));
  G.grassGeo.setAttribute('aScale',new THREE.InstancedBufferAttribute(sc,1));
  G.grassGeo.instanceCount=GRASS_N;
  G.grassMat=new THREE.ShaderMaterial({
    side:THREE.DoubleSide, fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uP:{value:new THREE.Vector2()},uTime:{value:0},uS:{value:S}}]),
    vertexShader:'uniform vec2 uWind; attribute vec3 offset; attribute float aScale; uniform vec2 uP; uniform float uTime; uniform float uS; varying float vH; varying vec3 vCol;\n#include <fog_pars_vertex>\n'+GLSL_H+GLSL_DRY+
      'void main(){\n  vec2 o=offset.xz*uS; vec2 w=o+uS*floor((uP-o)/uS+0.5);\n  float fade=1.0-smoothstep(uS*0.34,uS*0.47,distance(w,uP));\n'+GLSL_PONDMASK+
      '  float a=offset.y*6.2832; float c=cos(a); float s=sin(a);\n  vec3 p=position; p.xz=vec2(c*p.x-s*p.z,s*p.x+c*p.z); p*=aScale*fade;\n'+
      '  float sway=sin(uTime*1.7+w.x*0.35+w.y*0.27)*0.14+sin(uTime*3.1+w.x*0.9-w.y*0.6)*0.05;\n  p.xz+=uWind*(sway+0.08)*p.y*1.3;\n'+
      '  float zone=dryG(w);\n  vCol=mix(vec3(0.31,0.56,0.23),vec3(0.80,0.71,0.40),zone)*(0.82+0.36*offset.y);\n  vH=position.y/0.7;\n'+
      '  vec4 mvPosition=viewMatrix*vec4(w.x+p.x,Hh(w)+p.y,w.y+p.z,1.0);\n  gl_Position=projectionMatrix*mvPosition;\n  #include <fog_vertex>\n}',
    fragmentShader:'uniform vec3 uLight; varying float vH; varying vec3 vCol;\n#include <fog_pars_fragment>\nvoid main(){\n  gl_FragColor=vec4(mix(vCol*0.5,vCol*1.08,vH)*uLight,1.0);\n  #include <fog_fragment>\n}'
  });
  G.grassMat.uniforms.uLight=grassLight; G.grassMat.uniforms.uWind=windU;
  const mesh=new THREE.Mesh(G.grassGeo,G.grassMat); mesh.frustumCulled=false; scene.add(mesh);
})();

/* Hohes Gras (Verstecke), auch als Schilf an den Wasserlöchern */
const patches=[]; let tallGeo=null, tallMat=null, TALL_N=0;
(function(){
  const {r:wr,rr:wrnd}=vegRng(0x67726173);
  for(let i=0;i<REG.patches;i++){
    let x,z,t=0; do{ const r=(i<45?wrnd(8,90):wrnd(60,WORLD-10)), a=wr()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }while((pondAt(x,z,1.5)||kopjeNear(x,z,8))&&++t<20);
    patches.push({x,z,r:wrnd(4,8.5)});
  }
  patches.push({x:7,z:5,r:6});
  PONDS.forEach(p=>{ for(let i=0;i<3;i++){ const a=wr()*6.283, d=p.r*1.2; patches.push({x:p.x+Math.cos(a)*d,z:p.z+Math.sin(a)*d,r:wrnd(3.5,5)}); } });
  // Flache Halme statt Kegel: Büschel aus 5 Halmen, im Shader mit Wind und Ausweichen vor dem Leoparden
  const B=5, pos=new Float32Array(B*27);
  for(let b=0;b<B;b++){
    const bx=wrnd(-0.32,0.32), bz=wrnd(-0.32,0.32), a=wr()*3.14, ca=Math.cos(a), sa=Math.sin(a), h=wrnd(1.15,1.9), lx=wrnd(-0.3,0.3), lz=wrnd(-0.3,0.3), w0=0.075, w1=0.05, hm=h*0.55;
    const L0=[bx-ca*w0,0,bz-sa*w0], R0=[bx+ca*w0,0,bz+sa*w0], L1=[bx+lx*0.3-ca*w1,hm,bz+lz*0.3-sa*w1], R1=[bx+lx*0.3+ca*w1,hm,bz+lz*0.3+sa*w1], T=[bx+lx,h,bz+lz];
    [L0,R0,R1, L0,R1,L1, L1,R1,T].forEach((v,i)=>pos.set(v,b*27+i*3));
  }
  const list=[];
  patches.forEach(p=>{ const n=Math.floor(p.r*p.r*4.2); for(let i=0;i<n;i++){
    const rr=Math.sqrt(wr())*p.r, a=wr()*6.283, x=p.x+Math.cos(a)*rr, z=p.z+Math.sin(a)*rr;
    if(pondAt(x,z,0.8)) continue;
    if(Math.hypot(x-7,z-5)<2.8) continue;   // Nest am Bau frei lassen, damit man die Jungen sieht
    list.push([x,H(x,z),z,wr()*6.283,wrnd(0.75,1.2),wr(),dryness(x,z)]);
  }});
  for(let i=list.length-1;i>0;i--){ const j=Math.floor(wr()*(i+1)), t=list[i]; list[i]=list[j]; list[j]=t; }   // gemischt, damit "niedrig" gleichmäßig ausdünnt
  TALL_N=list.length; tallGeo=[];
  const posAttr=new THREE.BufferAttribute(pos,3), byT={};
  list.forEach(o=>{ const k=tileOf(o[0],o[2]); (byT[k]=byT[k]||[]).push(o); });
  for(const k in byT){ const L=byT[k], n=L.length, iPos=new Float32Array(n*3), iRS=new Float32Array(n*2), iHue=new Float32Array(n), iDry=new Float32Array(n);
    L.forEach((o,i)=>{ iPos[i*3]=o[0]; iPos[i*3+1]=o[1]; iPos[i*3+2]=o[2]; iRS[i*2]=o[3]; iRS[i*2+1]=o[4]; iHue[i]=o[5]; iDry[i]=o[6]; });
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',posAttr); g.setAttribute('iPos',new THREE.InstancedBufferAttribute(iPos,3));
    g.setAttribute('iRS',new THREE.InstancedBufferAttribute(iRS,2)); g.setAttribute('iHue',new THREE.InstancedBufferAttribute(iHue,1)); g.setAttribute('iDry',new THREE.InstancedBufferAttribute(iDry,1));
    g.instanceCount=n; tallGeo.push({g,n,k:+k}); }
  tallMat=new THREE.ShaderMaterial({
    side:THREE.DoubleSide, fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uP:{value:new THREE.Vector2()},uR:{value:1.5},uTime:{value:0}}]),
    vertexShader:'uniform vec2 uWind; attribute vec3 iPos; attribute vec2 iRS; attribute float iHue; attribute float iDry; uniform vec2 uP; uniform float uR; uniform float uTime; varying float vH; varying float vDry; varying vec3 vCol;\n#include <fog_pars_vertex>\n'+
      'void main(){\n  float c=cos(iRS.x); float s=sin(iRS.x);\n  vec3 p=position; p.xz=vec2(c*p.x-s*p.z,s*p.x+c*p.z); p.y*=iRS.y;\n'+
      '  float hh=clamp(position.y/1.9,0.0,1.0); float k=hh*hh;\n  vec2 w=iPos.xz;\n'+
      '  float sway=sin(uTime*1.5+w.x*0.4+w.y*0.3)*0.26+sin(uTime*2.7+w.x*1.1-w.y*0.8)*0.08;\n  p.xz+=uWind*(sway+0.15)*k;\n'+
      '  vec2 d=w-uP; float dist=length(d); float push=1.0-smoothstep(0.2,uR,dist);\n  p.xz+=(d/max(dist,0.001))*push*k*1.3; p.y-=push*k*0.55;\n'+
      '  vCol=mix(vec3(0.27,0.50,0.16),vec3(0.50,0.62,0.22),iHue);\n  vDry=iDry; vH=hh;\n'+
      '  vec4 mvPosition=viewMatrix*vec4(w.x+p.x,iPos.y+p.y,w.y+p.z,1.0);\n  gl_Position=projectionMatrix*mvPosition;\n  #include <fog_vertex>\n}',
    fragmentShader:'uniform vec3 uLight; varying float vH; varying float vDry; varying vec3 vCol;\n#include <fog_pars_fragment>\nvoid main(){\n  vec3 base=mix(vCol,vec3(0.74,0.64,0.33)+0.10*(vCol-vec3(0.38,0.56,0.19)),smoothstep(0.15,0.75,vDry));\n  vec3 col=mix(base*0.42,base,smoothstep(0.0,0.6,vH));\n  vec3 tip=mix(vec3(0.38,0.64,0.25),vec3(0.86,0.82,0.46),vDry);\n  col=mix(col,tip,smoothstep(0.7,1.0,vH)*0.55);\n  gl_FragColor=vec4(col*uLight,1.0);\n  #include <fog_fragment>\n}'
  });
  tallMat.uniforms.uLight=grassLight; tallMat.uniforms.uWind=windU;
  tallGeo.forEach(t=>{ const mesh=new THREE.Mesh(t.g,tallMat); scene.add(mesh); registerTile(mesh,t.k,76); });
})();
/* Schilf am Ufer im Startgebiet (reeds.js): je Kachel ein Instanz-Modell; die Gruppen sind Verstecke (nach dem hohen Gras, das sonst darin wüchse) */
(function(){
  const {r}=vegRng(0x72656564);
  const spots=reedSpots(-WORLD,-WORLD,WORLD,WORLD,r,(x,z)=>Math.hypot(x,z)>WORLD||Math.hypot(x-7,z-5)<10);
  const byT={}; spots.forEach(p=>{ const k=tileOf(p.x,p.z); (byT[k]=byT[k]||[]).push(p); });
  for(const k in byT){ const m=reedMesh(byT[k],r); registerTile(m,+k,84); scene.add(m); }
  patches.push(...reedPatches(spots));
})();
/** Steht x,z in einem Dorngestrüpp? (dort kommt man nur langsam voran) */
function thornAt(x,z){ for(let i=0;i<patches.length;i++){ const p=patches[i]; if(!p.thorn) continue; const dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<p.r*p.r) return true; } return false; }
function inGrass(x,z){ for(let i=0;i<patches.length;i++){ const p=patches[i]; if(p.burnt) continue; const dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<p.r*p.r) return true; } return false; }


export { TREE_GAP, rockGeometry, thornAt, treeKinds, modelMeshes, releaseTree, treeSlot, dryBushGeometry, dryBushColor, shrubKind, bushGeometry, bushMaterial, bushColor, makeTree, woodMeshes, setTree, fadedTrees, applyTreeView, _tm, _tv, inGrass, leafGeoHi, leafGeoLo, leafMeshes, leafTime, patches, tallGeo, tallMat, trees, updateTrees };
