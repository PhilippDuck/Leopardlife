// LeoLife – Leopard (Spielfigur, Partner, Rivalen, Junge) als Low-Poly-Modell mit Skelett und Clips (Meshy: Modell, Vierbeiner-Rig,
// Leoparden-Animationen; umgewandelt mit tools/meshy-rig.cjs). Erwachsene und Junge haben eigene Modelle.
// Fell: Meshys gemalte Textur; Fellsorten (hell/dunkel, kräftig/blass, Albino, Panther) färbt der Shader um (ein Material je Sorte).
// Bewegung: animLegs(g,t,amp) ruft userData.anim. Kleiner Ausschlag: Stehen (geduckt Kauern), ab 1 Sprung. In Bewegung wählt das Tempo
// (aus der Schrittphase t, je Körpergröße) die Gangart: langsam Gehen, sonst Rennen, geduckt Pirschen. Die Clips laufen in echter Zeit,
// so schnell, dass die Pfoten möglichst mit dem Boden mitlaufen (gemessene Schrittlänge des Clips), höchstens 2,2-fach.
// userData.pose ('lie', 'rise' = Aufstehen, 'roar', 'dead', 'pounce') hat Vorrang.
import { LEO_ADULT } from './leoadultrig.js';
import { LEO_CUB } from './leocubrig.js';

const leoBytes=b64=>{ const s=atob(b64), a=new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a.buffer; };
/** Textur je Modell (aus dem eingebetteten PNG) */
function leoTexture(D){
  const t=new THREE.Texture(), img=document.createElement('img'); img.onload=()=>{ t.image=img; t.needsUpdate=true; }; img.src=D.tex;
  t.flipY=false; t.anisotropy=2; return t;   // wie die übrigen Farben des Spiels ohne Umrechnung (Renderer ohne sRGB-Ausgabe)
}
/** Gemeinsame Daten je Modell: Geometrie mit glatten Normalen, Textur, Clips */
function prepare(D){
  const pos=new Int16Array(leoBytes(D.pos)), J=new Uint8Array(leoBytes(D.joints)), Wt=new Uint8Array(leoBytes(D.weights)), uv=new Uint16Array(leoBytes(D.uv)), nr=new Int8Array(leoBytes(D.normal));
  const nV=pos.length/3, SW=new Float32Array(nV*4);
  for(let v=0;v<nV;v++){ let s=0; for(let c=0;c<4;c++){ SW[v*4+c]=Wt[v*4+c]/255; s+=SW[v*4+c]; } if(s>0) for(let c=0;c<4;c++) SW[v*4+c]/=s; }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(pos,x=>x/D.q),3));
  geo.setAttribute('normal',new THREE.BufferAttribute(Float32Array.from(nr,x=>x/127),3));
  geo.setAttribute('uv',new THREE.BufferAttribute(Float32Array.from(uv,x=>x/65535),2));
  geo.setAttribute('skinIndex',new THREE.BufferAttribute(Uint16Array.from(J),4));
  geo.setAttribute('skinWeight',new THREE.BufferAttribute(SW,4));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(leoBytes(D.index)),1));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),2);
  // Clips: Drehungen und Verschiebungen. Wurzelbewegung nach vorn entfällt (das Spiel bewegt den Leoparden): je Knoten die Achse,
  // auf der er sich beim Gehen am weitesten verschiebt, wird in allen Clips auf ihren Mittelwert ohne Drift gesetzt.
  const fwd={}, walk=D.clips.walk;
  if(walk) for(const [k,kind,b] of walk.tracks) if(kind==='t'){ const v=new Float32Array(leoBytes(b)), m=walk.n-1, d=[0,1,2].map(c=>Math.abs(v[m*3+c]-v[c])); fwd[k]=d.indexOf(Math.max(...d)); }
  const clips={};
  for(const key in D.clips){ const C=D.clips[key], times=Array.from({length:C.n},(_,i)=>i*C.d/(C.n-1)), tracks=[];
    for(const [k,kind,b] of C.tracks){ const name=D.nodes[k].n;
      if(kind==='r') tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,Array.from(new Int16Array(leoBytes(b)),x=>x/32767)));
      else { const v=Array.from(new Float32Array(leoBytes(b))), m=C.n-1, a=fwd[k];
        if(a!==undefined){ const d=v[m*3+a]-v[a]; for(let i=0;i<C.n;i++) v[i*3+a]-=d*i/m; }
        tracks.push(new THREE.VectorKeyframeTrack(name+'.position',times,v)); } }
    clips[key]=new THREE.AnimationClip(key,C.d,tracks); }
  if(clips.lie){ clips.rise=clips.lie.clone(); clips.rise.name='rise'; }   // Aufstehen: Hinlegen rückwärts
  return {D,geo,tex:leoTexture(D),ibm:new Float32Array(leoBytes(D.ibm)),clips,mats:{}};
}
const MODELS={};
const modelOf=kind=>MODELS[kind]||(MODELS[kind]=prepare(kind==='cub'?LEO_CUB:LEO_ADULT));

/* ---------- Fell: Umfärben der Textur ---------- */
/**
 * Material für eine Fellsorte. Alle Sorten teilen ein Shaderprogramm, die Werte kommen als Uniforms.
 * Damit sich Leoparden deutlich unterscheiden, wirken die Werte stärker als beim früheren Blockmodell:
 * l Helligkeit, s Sättigung, ss Grundton (goldrot bis blass-sandfarben), sn Flecken (kräftig dunkel bis verwaschen);
 * Albino (blass, Flecken nur angedeutet), Panther (fast schwarz, Rosetten schimmern durch).
 */
function furMaterial(M,fur){
  const cl=(x,a,b)=>Math.max(a,Math.min(b,x));
  const l=fur?cl(1+(fur.l-1)*1.5,0.5,1.4):1, s=fur?cl(1+(fur.s-1)*2,0.55,1.35):1, alb=fur&&fur.albino?1:0, mel=fur&&fur.melan?1:0;
  const warm=fur&&fur.ss!==undefined?cl((fur.ss-1.1)/0.35,-1,1):0, spot=fur&&fur.sn!==undefined?cl((fur.sn-1.075)/0.525,-1,1):0;
  const key=[l,s,warm,spot].map(x=>x.toFixed(2)).join()+','+alb+mel;
  if(M.mats[key]) return M.mats[key];
  const m=new THREE.MeshLambertMaterial({map:M.tex,skinning:true});
  const uA=new THREE.Vector4(l,s,alb,mel), uB=new THREE.Vector2(warm,spot);
  m.onBeforeCompile=sh=>{
    sh.uniforms.uFurA={value:uA}; sh.uniforms.uFurB={value:uB};
    sh.fragmentShader='uniform vec4 uFurA; uniform vec2 uFurB;\n'+sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n vec4 texelColor=texture2D(map,vUv); texelColor=mapTexelToLinear(texelColor);\n'+
      ' float lum=dot(texelColor.rgb,vec3(0.299,0.587,0.114));\n'+
      ' float spotM=smoothstep(0.40,0.22,lum), cream=smoothstep(0.62,0.80,lum);\n'+   // dunkle Rosetten, helle Bauchseite
      ' vec3 c=texelColor.rgb;\n'+
      // Grundton: warm = tiefes Goldrot, kühl = blasses Sandgelb (Bauch und Flecken weniger betroffen)
      ' vec3 tint=uFurB.x>0.0?vec3(1.07,0.90,0.74):vec3(0.97,1.0,1.10);\n'+
      ' c*=mix(vec3(1.0),tint,abs(uFurB.x)*(1.0-spotM)*(1.0-0.6*cream));\n'+
      ' c=mix(vec3(dot(c,vec3(0.299,0.587,0.114))),c,uFurA.y)*uFurA.x;\n'+
      // Flecken: kräftig (dunkler) oder verwaschen (zum Grundton hin)
      ' vec3 ground=c*(0.56/max(lum,0.05));\n'+
      ' c=uFurB.y>0.0?c*(1.0-0.55*uFurB.y*spotM):mix(c,ground,-uFurB.y*0.6*spotM);\n'+
      ' c=mix(c,vec3(0.86,0.83,0.76)*(0.55+0.9*lum),uFurA.z);\n'+
      ' c=mix(c,texelColor.rgb*0.16+vec3(0.012,0.01,0.008),uFurA.w);\n'+
      ' diffuseColor.rgb*=c;\n#endif');
  };
  m.customProgramCacheKey=()=>'leoFur';
  return M.mats[key]=m;
}

/* ---------- Figur ---------- */
/** Einmalige Clips bleiben am Ende stehen; Gehen und Rennen: Phasen-Tempo (rad/s), bei dem sie in Originalgeschwindigkeit laufen */
const ONCE={dead:1,lie:1,pounce:1,rise:1}, PACE={walk:12,stalk:9,run:22};
/**
 * Leopard als Gruppe wie buildQuad: userData.inner (Hebt, Neigung), anim (für animLegs), pose; Skelett und Clips je Figur.
 * kind 'adult' oder 'cub'; fur: Fellsorte (makeFur) oder null.
 */
function buildLeopard(kind,col,fur){
  const M=modelOf(kind), D=M.D;
  const g=new THREE.Group(), inner=new THREE.Group(), norm=new THREE.Group(); g.add(inner); inner.add(norm);
  norm.scale.setScalar(D.scale); norm.position.y=D.yOff+0.07;   // Pfoten im Stand etwas tiefer als in der Ruhelage
  const mesh=new THREE.SkinnedMesh(M.geo,furMaterial(M,fur)); mesh.castShadow=true; mesh.frustumCulled=false;
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
  const mixer=new THREE.AnimationMixer(rig), acts={}, w={}, strides={};
  for(const key in D.clips) strides[key]=D.clips[key].stride||0;
  for(const key in M.clips){ const a=mixer.clipAction(M.clips[key]); a.play(); a.setEffectiveWeight(key==='idle'?1:0); acts[key]=a; w[key]=key==='idle'?1:0; }
  let last=performance.now(), lastT=0, pace=0, cur='idle';
  function anim(t,amp){
    const now=performance.now(), dt=Math.min(0.1,Math.max(0,(now-last)/1000)); last=now;
    if(dt>0){ const r=Math.abs(t-lastT)/dt; pace+=((r<80?r:pace)-pace)*Math.min(1,dt*6); } lastT=t;   // wie schnell die Schrittphase läuft
    const sneak=inner.position.y<-0.07, pose=g.userData.pose;
    // Gangart nach dem Tempo (Körperlängen je Sekunde): langsam gehen, sonst rennen; geduckt pirschen
    const spd=Math.max(0,(pace-5)/1.4), sc=g.scale.x||1, rel=spd/sc;
    let want=pose&&acts[pose]?pose:amp>=1?(acts.jump?'jump':'run'):amp<0.1?(sneak&&acts.cower?'cower':'idle'):sneak&&acts.stalk?'stalk':rel<3?'walk':'run';
    if(want!==cur){ if(ONCE[want]) acts[want].time=want==='rise'?acts[want].getClip().duration-0.001:0; cur=want; }
    let sum=0; for(const k in w){ w[k]+=((k===want?1:0)-w[k])*Math.min(1,dt*9); sum+=w[k]; }
    for(const k in acts){ const a=acts[k], d=a.getClip().duration;
      a.setEffectiveWeight(w[k]/(sum||1));
      // Gehen, Pirschen, Rennen: so schnell abspielen, dass die Pfoten mit dem Boden mitlaufen (Schrittlänge des Clips, Tempo im Spiel)
      const st=strides[k], speed=!PACE[k]?1:st>0.05?Math.max(0.6,Math.min(2.2,spd*d/(st*sc))):Math.max(0.45,Math.min(1.7,pace/PACE[k]));
      if(k==='rise') a.time=Math.max(0,a.time-dt); else if(ONCE[k]) a.time=Math.min(d-0.001,a.time+dt); else a.time=(a.time+dt*speed)%d; }
    mixer.update(0);
  }
  g.userData={legs:[],tail:null,head:null,inner,anim,pose:null,leopard:kind,dispose:()=>{ mixer.stopAllAction(); mixer.uncacheRoot(rig); }};
  anim(0,0);
  return g;
}

export { buildLeopard };
