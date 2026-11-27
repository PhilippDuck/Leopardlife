// LeoLife – Leopard (Spielfigur, Partner, Rivalen, Junge) als Low-Poly-Modell mit Skelett und Clips (Meshy: Modell, Vierbeiner-Rig,
// Leoparden-Animationen; umgewandelt mit tools/meshy-rig.cjs). Erwachsene und Junge haben eigene Modelle.
// Fell: Grundfarbe, heller Bauch und dunkle Nase kommen aus dem Modell (Klasse je Dreieck), die Flecken legt das Spiel selbst:
// jeder Leopard bekommt sein eigenes Muster (Rosetten aus 3D-Rauschen), Dichte und Größe aus den Erbanlagen (makeFur: sn, ss).
// Bewegung: animLegs(g,t,amp) ruft userData.anim. Phase t treibt Gehen und Rennen (eine Schrittfolge je 2π), amp wählt den Clip:
// klein Stehen (geduckt: Kauern), mittel Gehen, groß Rennen, ab 1 Sprung. userData.pose ('lie', 'roar', 'dead', 'pounce') hat Vorrang.
import { LEO_ADULT } from './leoadultrig.js';
import { LEO_CUB } from './leocubrig.js';

const leoBytes=b64=>{ const s=atob(b64), a=new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a.buffer; };
const leoMat=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,skinning:true});

/** Gemeinsame Daten je Modell: Geometrie-Attribute ohne gemeinsame Ecken (flache Flächen), Dreiecksmitten, Klassen, Clips */
function prepare(D){
  const pos=new Int16Array(leoBytes(D.pos)), J=new Uint8Array(leoBytes(D.joints)), Wt=new Uint8Array(leoBytes(D.weights)), idx=new Uint16Array(leoBytes(D.index)), cls=new Uint8Array(leoBytes(D.cls));
  const n=idx.length, P=new Float32Array(n*3), SI=new Uint16Array(n*4), SW=new Float32Array(n*4), mid=new Float32Array(n);
  for(let i=0;i<n;i++){ const v=idx[i];
    for(let c=0;c<3;c++) P[i*3+c]=pos[v*3+c]/D.q;
    let s=0; for(let c=0;c<4;c++){ SI[i*4+c]=J[v*4+c]; SW[i*4+c]=Wt[v*4+c]/255; s+=SW[i*4+c]; }
    if(s>0) for(let c=0;c<4;c++) SW[i*4+c]/=s; }
  const attrs={position:new THREE.BufferAttribute(P,3),skinIndex:new THREE.BufferAttribute(SI,4),skinWeight:new THREE.BufferAttribute(SW,4)};
  const base=new THREE.BufferGeometry(); for(const k in attrs) base.setAttribute(k,attrs[k]); base.computeVertexNormals(); attrs.normal=base.attributes.normal;
  // Dreiecksmitten in Ruhelage (für das Fleckenmuster) und Größe des Modells
  const tri=n/3, cen=new Float32Array(tri*3); let lo=Infinity, hi=-Infinity;
  for(let t=0;t<tri;t++) for(let c=0;c<3;c++){ const v=(P[t*9+c]+P[t*9+3+c]+P[t*9+6+c])/3; cen[t*3+c]=v; if(c===1){ lo=Math.min(lo,v); hi=Math.max(hi,v); } }
  // Clips: Drehungen und Verschiebungen; Verschiebungen ohne Vorwärtsdrift (der Leopard läuft auf der Stelle, das Spiel bewegt ihn)
  const clips={};
  for(const key in D.clips){ const C=D.clips[key], times=Array.from({length:C.n},(_,i)=>i*C.d/(C.n-1)), tracks=[];
    for(const [k,kind,b] of C.tracks){ const name=D.nodes[k].n;
      if(kind==='r') tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,Array.from(new Int16Array(leoBytes(b)),x=>x/32767)));
      else { const v=Array.from(new Float32Array(leoBytes(b))), m=C.n-1, dx=v[m*3]-v[0], dz=v[m*3+2]-v[2];
        for(let i=0;i<C.n;i++){ v[i*3]-=dx*i/m; v[i*3+2]-=dz*i/m; }
        tracks.push(new THREE.VectorKeyframeTrack(name+'.position',times,v)); } }
    clips[key]=new THREE.AnimationClip(key,C.d,tracks); }
  return {D,attrs,cls,cen,size:hi-lo,tri,ibm:new Float32Array(leoBytes(D.ibm)),clips};
}
const MODELS={};
const modelOf=kind=>MODELS[kind]||(MODELS[kind]=prepare(kind==='cub'?LEO_CUB:LEO_ADULT));

/* ---------- Fell ---------- */
const leoHash=(x,y,z)=>{ const v=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453; return v-Math.floor(v); };
/**
 * Farbe je Dreieck: Klasse aus dem Modell (Fell, hell, dunkel), Rosetten aus Zellrauschen in der Ruhelage.
 * col: {fur, light, spot, nose} (Hex), sn: Fleckendichte, ss: Fleckengröße, seed: eigenes Muster je Leopard.
 */
function furColors(M,col,sn,ss,seed){
  const C=new Float32Array(M.tri*9), cf=new THREE.Color(col.fur), cl=new THREE.Color(col.light), cs=new THREE.Color(col.spot), cn=new THREE.Color(col.nose), cm=cf.clone().lerp(cs,0.3), tmp=new THREE.Color();
  const cell=M.size*0.085, ox=seed*17.3, oz=seed*5.1, R=0.42*ss, chance=Math.min(0.95,0.55*sn);
  for(let t=0;t<M.tri;t++){
    const k=M.cls[t]; let c;
    if(k===2) c=cn;
    else {
      // nächster Fleckmittelpunkt in den Nachbarzellen (je Zelle höchstens einer, mit Wahrscheinlichkeit chance)
      const x=M.cen[t*3]/cell+ox, y=M.cen[t*3+1]/cell, z=M.cen[t*3+2]/cell+oz, ix=Math.floor(x), iy=Math.floor(y), iz=Math.floor(z);
      let best=9;
      for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) for(let d=-1;d<=1;d++){
        const cx=ix+a, cy=iy+b, cz=iz+d; if(leoHash(cx,cy,cz)>chance) continue;
        const px=cx+leoHash(cx+3.1,cy,cz), py=cy+leoHash(cx,cy+5.7,cz), pz=cz+leoHash(cx,cy,cz+9.3), q=Math.hypot(x-px,y-py,z-pz);
        if(q<best) best=q; }
      const base=k===1?cl:cf, r=k===1?R*0.7:R;   // auf dem hellen Bauch kleinere Flecken
      if(best<r*0.5&&k===0) c=tmp.copy(cm);            // Rosette: innen etwas dunkleres Fell
      else if(best<r) c=cs; else c=base;
    }
    for(let v=0;v<3;v++){ C[t*9+v*3]=c.r; C[t*9+v*3+1]=c.g; C[t*9+v*3+2]=c.b; }
  }
  return new THREE.BufferAttribute(C,3);
}

/** Muster fest aus den Erbanlagen: dieselbe Figur sieht nach dem Neubau und auf anderen Geräten gleich aus */
const furSeed=f=>f?((f.l*1009+f.s*317+f.sn*53+f.ss*19+(f.albino?7:0)+(f.melan?11:0))%97):42;
/* ---------- Figur ---------- */
const PHASED={walk:1,run:1}, ONCE={dead:1,lie:1,pounce:1};
/**
 * Leopard als Gruppe wie buildQuad: userData.inner (Hebt, Neigung), anim (für animLegs), pose; Skelett und Clips je Figur.
 * kind 'adult' oder 'cub'; col wie bei furColors; fur: Erbanlagen (sn, ss) oder null.
 */
function buildLeopard(kind,col,fur){
  const M=modelOf(kind), D=M.D;
  const g=new THREE.Group(), inner=new THREE.Group(), norm=new THREE.Group(); g.add(inner); inner.add(norm);
  norm.scale.setScalar(D.scale); norm.position.y=D.yOff;
  const geo=new THREE.BufferGeometry(); for(const k in M.attrs) geo.setAttribute(k,M.attrs[k]);
  geo.setAttribute('color',furColors(M,col,fur?fur.sn:1,fur?fur.ss:1,furSeed(fur)));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),2);
  const mesh=new THREE.SkinnedMesh(geo,leoMat); mesh.castShadow=true; mesh.frustumCulled=false;
  // Knotenbaum wie im Modell; Knochen sind THREE.Bone
  const isBone=new Set(D.bones), objs=D.nodes.map((n,k)=>{ const o=k===D.mesh?mesh:isBone.has(k)?new THREE.Bone():new THREE.Object3D();
    o.name=n.n; o.position.fromArray(n.t); o.quaternion.fromArray(n.r); o.scale.fromArray(n.s); return o; });
  D.nodes.forEach((n,k)=>{ (n.p>=0?objs[n.p]:norm).add(objs[k]); });
  const rig=new THREE.Group(); norm.add(rig);   // Wurzel für den Mixer
  D.nodes.forEach((n,k)=>{ if(n.p<0){ norm.remove(objs[k]); rig.add(objs[k]); } });
  rig.updateMatrixWorld(true);
  const inv=D.bones.map((_,i)=>new THREE.Matrix4().fromArray(M.ibm,i*16));
  // glTF: Die Lage des Modellknotens zählt beim Skinning nicht (Ecken = Σ Gewicht · Knochen-Welt · inverse Bindematrix · Ecke)
  mesh.bind(new THREE.Skeleton(D.bones.map(k=>objs[k]),inv),new THREE.Matrix4());
  // Clips mischen: Gewichte gleiten zum gewünschten Clip, Gehen und Rennen folgen der Phase
  const mixer=new THREE.AnimationMixer(rig), acts={}, w={};
  for(const key in M.clips){ const a=mixer.clipAction(M.clips[key]); a.play(); a.setEffectiveWeight(key==='idle'?1:0); acts[key]=a; w[key]=key==='idle'?1:0; }
  let last=performance.now(), cur='idle';
  function anim(t,amp){
    const now=performance.now(), dt=Math.min(0.1,Math.max(0,(now-last)/1000)); last=now;
    const sneak=inner.position.y<-0.07, pose=g.userData.pose;
    let want=pose&&acts[pose]?pose:amp>=1?(acts.jump?'jump':'run'):amp<0.1?(sneak&&acts.cower?'cower':'idle'):amp<0.7?'walk':'run';
    if(want!==cur){ if(ONCE[want]) acts[want].time=0; cur=want; }
    let sum=0; for(const k in w){ w[k]+=((k===want?1:0)-w[k])*Math.min(1,dt*9); sum+=w[k]; }
    const ph=((t/6.2832)%1+1)%1;
    for(const k in acts){ const a=acts[k], d=a.getClip().duration;
      a.setEffectiveWeight(w[k]/(sum||1));
      if(PHASED[k]) a.time=ph*d; else if(ONCE[k]) a.time=Math.min(d-0.001,a.time+dt); else a.time=(a.time+dt)%d; }
    mixer.update(0);
  }
  g.userData={legs:[],tail:null,head:null,inner,anim,pose:null,leopard:kind,dispose:()=>{ geo.dispose(); mixer.stopAllAction(); }};
  anim(0,0);
  return g;
}

export { buildLeopard };
