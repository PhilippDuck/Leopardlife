// LeoLife – Tiere aus Meshy-Modellen mit Skelett und Clips (umgewandelt mit tools/meshy-rig.cjs): Leopard (leopard.js) und Huftiere (hoofed.js).
// prepareRig: gemeinsame Geometrie, Textur und Clips je Modell. rigFigure: Figur wie buildQuad (userData.inner, anim für animLegs, pose).
// Bewegung: animLegs(g,t,amp) ruft userData.anim. Kleiner Ausschlag: Stehen (geduckt Kauern), ab 1 Sprung. In Bewegung zählt das
// Tempo über den Boden (aus der Lage der Figur, sonst aus der Schrittphase t): Gehen oder Rennen, je nachdem, welcher Clip von seinem
// eigenen Tempo her besser passt, geduckt Pirschen. Die Clips laufen so schnell, dass Pfoten und Hufe mit dem Boden mitlaufen
// (gemessenes Tempo des Clips × Körpergröße), 0,4- bis 2,5-fach.
// userData.pose ('lie', 'rise' = Aufstehen, 'roar', 'dead', 'pounce') hat Vorrang, wenn das Modell den Clip hat.
// Gibt es einen zweiten Stand-Clip (idle2), wechselt die Figur beim Stehen ab und zu dorthin.
import { camera } from './engine.js';

const rigBytes=b64=>{ const s=atob(b64), a=new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a.buffer; };
/** Textur je Modell (aus dem eingebetteten PNG) */
function rigTexture(D){
  const t=new THREE.Texture(), img=document.createElement('img'); img.onload=()=>{ t.image=img; t.needsUpdate=true; }; img.src=D.tex;
  t.flipY=false; t.anisotropy=2; return t;   // wie die übrigen Farben des Spiels ohne Umrechnung (Renderer ohne sRGB-Ausgabe)
}
/** Gemeinsame Daten je Modell: Geometrie mit glatten Normalen, Textur, Clips */
function prepareRig(D){
  const pos=new Int16Array(rigBytes(D.pos)), J=new Uint8Array(rigBytes(D.joints)), Wt=new Uint8Array(rigBytes(D.weights)), uv=new Uint16Array(rigBytes(D.uv)), nr=new Int8Array(rigBytes(D.normal));
  const nV=pos.length/3, SW=new Float32Array(nV*4);
  for(let v=0;v<nV;v++){ let s=0; for(let c=0;c<4;c++){ SW[v*4+c]=Wt[v*4+c]/255; s+=SW[v*4+c]; } if(s>0) for(let c=0;c<4;c++) SW[v*4+c]/=s; }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(pos,x=>x/D.q),3));
  geo.setAttribute('normal',new THREE.BufferAttribute(Float32Array.from(nr,x=>x/127),3));
  geo.setAttribute('uv',new THREE.BufferAttribute(Float32Array.from(uv,x=>x/65535),2));
  geo.setAttribute('skinIndex',new THREE.BufferAttribute(Uint16Array.from(J),4));
  geo.setAttribute('skinWeight',new THREE.BufferAttribute(SW,4));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(rigBytes(D.index)),1));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),2);
  // Clips: Drehungen und Verschiebungen. Wurzelbewegung nach vorn entfällt (das Spiel bewegt das Tier): je Knoten die Achse,
  // auf der er sich beim Gehen am weitesten verschiebt, wird in allen Clips auf ihren Mittelwert ohne Drift gesetzt.
  const fwd={}, walk=D.clips.walk;
  if(walk) for(const [k,kind,b] of walk.tracks) if(kind==='t'){ const v=new Float32Array(rigBytes(b)), m=walk.n-1, d=[0,1,2].map(c=>Math.abs(v[m*3+c]-v[c])); fwd[k]=d.indexOf(Math.max(...d)); }
  const clips={};
  for(const key in D.clips){ const C=D.clips[key], times=Array.from({length:C.n},(_,i)=>i*C.d/(C.n-1)), tracks=[];
    for(const [k,kind,b] of C.tracks){ const name=D.nodes[k].n;
      if(kind==='r') tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,Array.from(new Int16Array(rigBytes(b)),x=>x/32767)));
      else { const v=Array.from(new Float32Array(rigBytes(b))), m=C.n-1, a=fwd[k];
        if(a!==undefined){ const d=v[m*3+a]-v[a]; for(let i=0;i<C.n;i++) v[i*3+a]-=d*i/m; }
        tracks.push(new THREE.VectorKeyframeTrack(name+'.position',times,v)); } }
    clips[key]=new THREE.AnimationClip(key,C.d,tracks); }
  if(clips.lie){ clips.rise=clips.lie.clone(); clips.rise.name='rise'; }   // Aufstehen: Hinlegen rückwärts
  return {D,geo,tex:rigTexture(D),ibm:new Float32Array(rigBytes(D.ibm)),clips,mats:{}};
}

/** Einmalige Clips bleiben am Ende stehen; Gehen und Rennen: Phasen-Tempo (rad/s), bei dem sie in Originalgeschwindigkeit laufen */
const ONCE={dead:1,lie:1,pounce:1,rise:1}, PACE={walk:12,stalk:9,run:22}, GAITS={walk:1,stalk:1,run:1};
/* Weit entfernte Figuren (über FAR m von der Kamera) rechnen ihre Clips nur jedes dritte Mal neu: spart Zeit bei großen Herden */
const FAR=70, _cp=new THREE.Vector3();
/**
 * Figur als Gruppe wie buildQuad: userData.inner (Hebt, Neigung), anim (für animLegs), pose; Skelett und Clips je Figur.
 * M aus prepareRig, mat Material (mit skinning), lift: Füße so viel tiefer als in der Ruhelage.
 */
function rigFigure(M,mat,lift=0){
  const D=M.D;
  const g=new THREE.Group(), inner=new THREE.Group(), norm=new THREE.Group(); g.add(inner); inner.add(norm);
  norm.scale.setScalar(D.scale); norm.position.y=D.yOff+lift;
  const mesh=new THREE.SkinnedMesh(M.geo,mat); mesh.castShadow=true; mesh.frustumCulled=false;
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
  // Clips mischen: Gewichte gleiten zum gewünschten Clip, Gehen und Rennen laufen mit dem Tempo über den Boden
  const mixer=new THREE.AnimationMixer(rig), acts={}, w={}, vel={};
  for(const key in D.clips) vel[key]=D.clips[key].v||0;
  for(const key in M.clips){ const a=mixer.clipAction(M.clips[key]); a.play(); a.setEffectiveWeight(key==='idle'?1:0); acts[key]=a; w[key]=key==='idle'?1:0; }
  if(acts.idle2) acts.idle.time=Math.random()*acts.idle.getClip().duration;   // Herden stehen nicht im Gleichtakt
  // Gehen oder Rennen: Wechsel beim geometrischen Mittel beider Clip-Tempi (dort wären beide gleich weit von ihrer echten Geschwindigkeit), mit etwas Spielraum
  const GAIT=vel.walk>0&&vel.run>0?Math.sqrt(vel.walk*vel.run):3;
  let last=performance.now(), lastT=0, pace=0, gs=0, lx=null, lz=0, cur='idle', ran=false, idleK='idle', skip=2;
  function anim(t,amp){
    const now=performance.now(), dt=Math.min(0.1,Math.max(0,(now-last)/1000));
    if(D.clips.idle2&&++skip%3&&camera.getWorldPosition(_cp).distanceToSquared(g.position)>FAR*FAR) return;   // fern: nur jedes dritte Mal
    last=now;
    if(dt>0){ const r=Math.abs(t-lastT)/dt; pace+=((r<80?r:pace)-pace)*Math.min(1,dt*6);   // wie schnell die Schrittphase läuft
      // Tempo über den Boden aus der Lage der Figur (Sprünge über 40 m/s: versetzt, nicht gelaufen)
      const px=g.position.x, pz=g.position.z, v=lx==null?0:Math.hypot(px-lx,pz-lz)/dt; lx=px; lz=pz;
      gs+=((v<40?v:gs)-gs)*Math.min(1,dt*8); }
    lastT=t;
    const sneak=inner.position.y<-0.07, pose=g.userData.pose, sc=g.scale.x||1;
    // bewegt sich die Figur kaum (festgebissen, an der Stelle), zählt die Schrittphase (etwa 5 + 1,4 · Tempo je Sekunde)
    const spd=gs>0.3?gs:Math.max(0,(pace-5)/1.4), rel=spd/sc;
    ran=rel>GAIT*(ran?0.85:1.15);
    let want=pose&&acts[pose]?pose:amp>=1?(acts.jump?'jump':'run'):amp<0.1?(sneak&&acts.cower?'cower':idleK):sneak&&acts.stalk?'stalk':ran?'run':'walk';
    if(want!==cur){ if(ONCE[want]) acts[want].time=want==='rise'?acts[want].getClip().duration-0.001:0;
      else if((want==='walk'||want==='run'||want==='stalk')&&w[want]<0.05&&GAITS[cur]) acts[want].time=acts[cur].time/acts[cur].getClip().duration*acts[want].getClip().duration;   // Gangwechsel: im selben Takt weiter
      else if(want==='idle2'&&w.idle2<0.05) acts.idle2.time=0;
      cur=want; }
    let sum=0; for(const k in w){ w[k]+=((k===want?1:0)-w[k])*Math.min(1,dt*9); sum+=w[k]; }
    for(const k in acts){ const a=acts[k], d=a.getClip().duration;
      a.setEffectiveWeight(w[k]/(sum||1));
      // Gehen, Pirschen, Rennen: so schnell abspielen, dass die Pfoten mit dem Boden mitlaufen (Tempo des Clips × Größe, Tempo im Spiel)
      const speed=!PACE[k]?1:vel[k]>0.05?Math.max(0.4,Math.min(2.5,spd/(vel[k]*sc))):Math.max(0.45,Math.min(1.7,pace/PACE[k]));
      if(k==='rise') a.time=Math.max(0,a.time-dt); else if(ONCE[k]) a.time=Math.min(d-0.001,a.time+dt);
      else { const t1=a.time+dt*speed;
        // Stehen: am Ende eines Durchlaufs ab und zu zum anderen Stand-Clip wechseln (idle2 nur einmal, dann zurück)
        if(k===cur&&acts.idle2&&(k==='idle'||k==='idle2')&&t1>=d) idleK=k==='idle2'||Math.random()<0.7?'idle':'idle2';
        a.time=t1%d; } }
    mixer.update(0);
  }
  g.userData={legs:[],tail:null,head:null,inner,anim,pose:null,dispose:()=>{ mixer.stopAllAction(); mixer.uncacheRoot(rig); }};
  anim(0,0);
  return g;
}

export { prepareRig, rigFigure };
