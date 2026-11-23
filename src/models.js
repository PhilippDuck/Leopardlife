// LeopardLife – Tiermodelle aus Blöcken, Fellvarianten (inkl. Albino und Panther), Zusammenführen starrer Teile, Laufanimation.
import { blobs } from './quality.js';
import { rnd } from './util.js';

/* ---------- Tiermodelle ---------- */
const matCache={}; const M=c=>matCache[c]||(matCache[c]=new THREE.MeshLambertMaterial({color:c}));
/* Fell: jedes Tier bekommt eine eigene Variante – heller/dunkler, kräftiger/blasser, mehr oder weniger Flecken; selten Albino oder schwarz */
const _fc=new THREE.Color(), _fh={h:0,s:0,l:0};
function makeFur(){ const r=Math.random(); return {albino:r<0.02,melan:r>=0.02&&r<0.05,l:rnd(0.84,1.18),s:rnd(0.85,1.12),sn:rnd(0.55,1.6),ss:rnd(0.75,1.45)}; }
function furColor(hex,v){
  _fc.setHex(hex); _fc.getHSL(_fh); let s=_fh.s*v.s, l=_fh.l*v.l;
  if(v.albino){ s*=0.15; l=0.84+_fh.l*0.12; } else if(v.melan){ s*=0.55; l=_fh.l*0.3; }
  return _fc.setHSL(_fh.h,Math.min(1,s),Math.min(0.97,l)).getHex();
}
function furName(v){ if(!v) return 'gewöhnlich'; if(v.albino) return 'Albino (weiß)'; if(v.melan) return 'schwarz (Panther)';
  return (v.l<0.93?'dunkel':v.l>1.09?'hell':'mittel')+(v.sn>1.25?', dicht gefleckt':v.sn<0.8?', wenig Flecken':''); }
const shadowGeo=new THREE.CircleGeometry(1,12); shadowGeo.rotateX(-Math.PI/2);
const shadowMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.22,depthWrite:false});
function box(w,h,d,c,x,y,z,parent){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M(c)); m.position.set(x,y,z); m.castShadow=true; parent.add(m); return m; }
/* Leistung: Alle starren Teile eines Tiers (Rumpf, Kopf, Flecken, Ohren …) werden zu einem einzigen Modell verschmolzen.
   Beweglich bleiben nur Beine und Schwanz. Statt 20–40 Zeichenaufträgen pro Tier sind es so etwa sechs. */
const ANIM_MAT=new THREE.MeshLambertMaterial({vertexColors:true}), _cc=new THREE.Color();
function mergeRigid(root,stops){ try{ mergeRigid0(root,stops); }catch(e){ if(window.console) console.warn('Zusammenführen übersprungen',e); } }
function mergeRigid0(root,stops){
  const pos=[], nor=[], col=[], done=[];
  (function walk(node,mat){
    for(const ch of node.children){
      if(stops.has(ch)) continue;
      ch.updateMatrix(); const m=new THREE.Matrix4().multiplyMatrices(mat,ch.matrix);
      if(ch.isMesh){
        const g=ch.geometry.index?ch.geometry.toNonIndexed():ch.geometry.clone(); g.applyMatrix4(m);
        const p=g.attributes.position, n=g.attributes.normal; _cc.copy(ch.material.color);
        for(let i=0;i<p.count;i++){ pos.push(p.getX(i),p.getY(i),p.getZ(i)); nor.push(n.getX(i),n.getY(i),n.getZ(i)); col.push(_cc.r,_cc.g,_cc.b); }
        g.dispose(); done.push(ch);
      } else walk(ch,m);
    }
  })(root,new THREE.Matrix4());
  if(!pos.length) return;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mesh=new THREE.Mesh(g,ANIM_MAT); mesh.castShadow=true;
  done.forEach(m=>{ m.parent.remove(m); m.geometry.dispose(); });   // erst entfernen, wenn das neue Modell steht
  root.add(mesh);
}
function buildQuad(o,v){
  if(v){ o=Object.assign({},o); ['col','col2','mane','stripe','tailTip'].forEach(k=>{ if(o[k]!==undefined) o[k]=furColor(o[k],v); }); }
  const eyeC=v&&v.albino?0xc8506a:0x111111, noseC=v&&v.albino?0xd9a0a8:0x222222;
  // o: col, col2, len, hgt, wid, leg, head, ears, horns, tail, mane, spots, snout
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const L=o.len||1.4, Hh=o.hgt||0.55, W=o.wid||0.5, leg=o.leg||0.55, hs=o.head||0.42;
  const by=leg+Hh/2;
  box(W,Hh,L,o.col,0,by,0,inner);
  const head=new THREE.Group(); head.position.set(0,by+Hh*0.35+(o.neck||0),L/2+hs*0.3); inner.add(head);
  box(hs,hs,hs,o.col,0,0,0,head);
  box(hs*0.6,hs*0.45,hs*0.5,o.col2||o.col,0,-hs*0.15,hs*0.6,head);
  box(hs*0.2,hs*0.14,hs*0.1,noseC,0,-hs*0.05,hs*0.87,head);
  box(hs*0.12,hs*0.12,0.03,eyeC,hs*0.27,hs*0.12,hs*0.5,head); box(hs*0.12,hs*0.12,0.03,eyeC,-hs*0.27,hs*0.12,hs*0.5,head);
  const eh=o.ears||0.16;
  box(hs*0.25,eh,hs*0.12,o.col2||o.col,hs*0.32,hs*0.5+eh/2,-hs*0.1,head); box(hs*0.25,eh,hs*0.12,o.col2||o.col,-hs*0.32,hs*0.5+eh/2,-hs*0.1,head);
  if(o.neck) box(W*0.55,o.neck+Hh*0.5,hs*0.6,o.col,0,by+Hh*0.25+o.neck/2,L/2-0.05,inner);
  if(o.horns){ const hh=o.horns; [1,-1].forEach(s=>{ const h=box(0.07,hh,0.07,0x3a2e22,s*hs*0.22,hs*0.5+hh/2,-hs*0.25,head); h.rotation.x=-0.35; h.rotation.z=-s*0.12; }); }
  if(o.tusks){ [1,-1].forEach(s=>box(0.05,0.14,0.05,0xf4efe0,s*hs*0.28,-hs*0.2,hs*0.75,head)); }
  if(o.snout){ box(hs*0.62,hs*0.32,hs*1.5,o.col2||o.col,0,-hs*0.22,hs*1.15,head); }
  if(o.mane){ box(hs*1.5,hs*1.5,hs*0.9,o.mane,0,-0.02,-hs*0.35,head); }
  const legs=[];
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(p=>{ const pv=new THREE.Group(); pv.position.set(p[0]*(W/2-0.08),leg,p[1]*(L/2-0.14)); inner.add(pv); box(0.16,leg,0.16,o.col2||o.col,0,-leg/2,0,pv); legs.push(pv); });
  let tail=null;
  if(o.tail){ tail=new THREE.Group(); tail.position.set(0,by+Hh*0.25,-L/2); inner.add(tail); box(0.09,0.09,o.tail,o.col,0,0,-o.tail/2,tail); if(o.tailTip) box(0.11,0.11,0.2,o.tailTip,0,0,-o.tail,tail); tail.rotation.x=0.5; }
  if(o.spots){
    const sn=v?v.sn:1, ss=v?v.ss:1, sc=v&&v.albino?0xd9cbb4:v&&v.melan?0x0b0908:0x2a1c10;
    for(let i=0;i<Math.round(14*sn);i++){ const sd=(i%2?1:-1); box(0.02,0.11*ss,0.13*ss,sc,sd*(W/2+0.005),by+rnd(-Hh*0.3,Hh*0.35),rnd(-L/2+0.1,L/2-0.1),inner); }
    for(let i=0;i<Math.round(6*sn);i++) box(0.12*ss,0.02,0.12*ss,sc,rnd(-W*0.3,W*0.3),by+Hh/2+0.005,rnd(-L/2+0.1,L/2-0.1),inner);
  }
  if(o.stripe) box(W+0.01,Hh*0.3,L*0.9,o.stripe,0,by-Hh*0.36,0,inner);
  mergeRigid(inner,new Set(legs.concat(tail?[tail]:[]))); legs.forEach(l=>mergeRigid(l,new Set())); if(tail) mergeRigid(tail,new Set());
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(W*1.2,1,L*0.75); sh.position.y=0.03; g.add(sh); blobs.push(sh);
  g.userData={legs,tail,head,inner,blob:sh};
  return g;
}
function animLegs(g,t,amp){ if(g.userData.anim){ g.userData.anim(t,amp); return; } const l=g.userData.legs; const a=Math.sin(t)*amp; l[0].rotation.x=a; l[3].rotation.x=a; l[1].rotation.x=-a; l[2].rotation.x=-a; if(g.userData.tail) g.userData.tail.rotation.y=Math.sin(t*0.5)*0.3; }

/* Krokodil: flacher, gepanzerter Körper mit Rückenschuppen, langer Schnauze mit Zähnen und beweglichem Unterkiefer,
   Augenhöckern oben auf dem Kopf (nur sie schauen beim Lauern aus dem Wasser), seitlich abstehenden Beinen und
   einem Schwanz aus Gliedern, der sich beim Schwimmen schlängelt. Vorn ist +z wie bei den anderen Tieren. */
const CROC_EYE=0.5;   // Höhe der Augenhöcker über dem Boden (Modellmaß): so tief taucht das Krokodil beim Lauern
function buildCroc(o,v){
  const f=k=>o[k]===undefined?undefined:(v?furColor(o[k],v):o[k]);
  const col=f('col'), dark=f('tailTip')||col, light=f('col2')||col, belly=f('belly')||light;
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const by=0.3;
  // Rumpf: Brust, Mitte, Hüfte (leicht verjüngt), heller Bauch, zwei Reihen Rückenschuppen
  box(0.6,0.24,0.55,col,0,by,0.5,inner); box(0.68,0.26,0.6,col,0,by+0.01,0,inner); box(0.56,0.23,0.5,col,0,by,-0.52,inner);
  box(0.56,0.06,1.5,belly,0,by-0.13,0,inner);
  box(0.44,0.04,1.55,light,0,by+0.14,0,inner);
  for(let i=0;i<8;i++){ const z=0.68-i*0.19; [1,-1].forEach(s=>box(0.07,0.06,0.11,dark,s*0.12,by+0.16,z,inner)); box(0.06,0.05,0.09,dark,s0(i)*0.27,by+0.14,z,inner); }
  // Kopf: Schädel mit Augenhöckern, lange flache Schnauze mit Zähnen, Unterkiefer als eigenes Gelenk
  const head=new THREE.Group(); head.position.set(0,by+0.02,0.82); inner.add(head);
  box(0.42,0.2,0.36,col,0,0,0.12,head);
  box(0.3,0.12,0.72,light,0,-0.02,0.62,head); box(0.2,0.1,0.2,col,0,-0.02,1.02,head);
  box(0.12,0.05,0.08,dark,0,0.05,1.05,head);                                       // Nasenhöcker
  [1,-1].forEach(s=>{ box(0.12,0.1,0.13,col,s*0.13,0.13,0.08,head);                 // Augenhöcker
    box(0.07,0.05,0.04,0xd9c23a,s*0.15,0.15,0.15,head); box(0.02,0.05,0.045,0x111111,s*0.15,0.15,0.155,head);
    for(let i=0;i<6;i++) box(0.03,0.05,0.03,0xf1ead0,s*0.14,-0.1,0.38+i*0.12,head); });   // Zähne
  const jaw=new THREE.Group(); jaw.position.set(0,-0.08,0.05); head.add(jaw);
  box(0.36,0.07,0.34,belly,0,-0.02,0.08,jaw); box(0.27,0.06,0.82,belly,0,-0.02,0.62,jaw);
  [1,-1].forEach(s=>{ for(let i=0;i<5;i++) box(0.03,0.05,0.03,0xf1ead0,s*0.12,0.03,0.44+i*0.13,jaw); });
  // Beine: seitlich abgespreizt mit breiten Füßen
  const legs=[];
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(p=>{ const pv=new THREE.Group(); pv.position.set(p[0]*0.3,0.24,p[1]*0.52); inner.add(pv);
    const up=box(0.13,0.12,0.15,col,p[0]*0.1,0,0,pv); up.rotation.z=p[0]*0.35;
    box(0.11,0.18,0.12,light,p[0]*0.2,-0.11,0,pv);
    box(0.2,0.05,0.22,dark,p[0]*0.24,-0.2,0.04,pv); legs.push(pv); });
  // Schwanz: fünf Glieder, je dünner, mit doppeltem Kamm, der zur Spitze hin zu einem wird
  const segs=[]; let par=inner, z0=-0.78;
  for(let i=0;i<5;i++){ const t=i/4, w=0.46-0.32*t, h=0.22-0.12*t, len=0.36;
    const sg=new THREE.Group(); sg.position.set(0,i?0:by-0.01,i?-len:z0); par.add(sg);
    box(w,h,len,col,0,0,-len/2,sg); box(w*0.8,0.04,len*0.95,belly,0,-h/2,-len/2,sg);
    if(i<3) [1,-1].forEach(s=>box(0.05,0.08,0.1,dark,s*w*0.3,h/2+0.03,-len*0.4,sg)); else box(0.05,0.1-0.02*i,0.12,dark,0,h/2+0.04,-len*0.4,sg);
    segs.push(sg); par=sg; }
  const stop=new Set(legs.concat([segs[0],head]));
  mergeRigid(inner,stop); mergeRigid(head,new Set([jaw])); mergeRigid(jaw,new Set()); legs.forEach(l=>mergeRigid(l,new Set()));
  segs.forEach((sg,i)=>mergeRigid(sg,new Set(i<4?[segs[i+1]]:[])));
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(0.75,1,2.2); sh.position.y=0.03; g.add(sh); blobs.push(sh);
  g.userData={legs,tail:null,head,inner,blob:sh,jaw,segs,croc:true,anim:(t,amp)=>animCroc(g,t,amp*0.6,false,null)};
  return g;
}
const s0=i=>i%2?1:-1;
/** Krokodil bewegen: Beine paddeln, der Schwanz schlängelt (schwimmend stärker), der Kiefer öffnet sich um open (0…1; null: Kiefer bleibt) */
function animCroc(g,t,amp,swim,open){
  const u=g.userData, l=u.legs, a=Math.sin(t)*amp*(swim?0.3:1);
  l[0].rotation.x=a; l[3].rotation.x=a; l[1].rotation.x=-a; l[2].rotation.x=-a;
  const w=(swim?0.22:0.08)+amp*0.25;
  u.segs.forEach((sg,i)=>{ sg.rotation.y=Math.sin(t*0.6-i*0.9)*w*(0.5+i*0.18); });
  if(open!=null) u.jaw.rotation.x+=(open*0.75-u.jaw.rotation.x)*0.35;
}

/* Schlange (Puffotter): Kopf vorn (+z), Körper aus Gliedern, die beim Kriechen seitlich schlängeln.
   Die Rückenzeichnung aus hellen Winkeln tarnt sie im Gras. head.rotation.x hebt den Kopf zum Zustoßen. */
function buildSnake(o,v){
  const f=k=>o[k]===undefined?undefined:(v?furColor(o[k],v):o[k]);
  const col=f('col'), light=f('col2')||col, dark=f('tailTip')||col, belly=f('belly')||light;
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const y=0.09, N=10, segs=[]; let par=inner;
  for(let i=0;i<N;i++){ const t=i/(N-1), w=0.2-0.05*Math.abs(t-0.35)*2-(t>0.8?0.08*(t-0.8)*5:0), len=0.24;
    const sg=new THREE.Group(); sg.position.set(0,i?0:y,i?-len:0.05); par.add(sg);
    box(w,0.12-0.03*t,len,i%2?col:dark,0,0,-len/2,sg); box(w*0.55,0.02,len*0.5,light,0,0.065,-len/2,sg); box(w*0.9,0.02,len,belly,0,-0.055,-len/2,sg);
    segs.push(sg); par=sg; }
  const head=new THREE.Group(); head.position.set(0,y,0.05); inner.add(head);
  box(0.2,0.1,0.22,col,0,0,0.1,head); box(0.14,0.08,0.1,dark,0,-0.005,0.24,head);
  [1,-1].forEach(s=>{ box(0.03,0.035,0.04,0xd8a23a,s*0.09,0.03,0.14,head); box(0.012,0.036,0.02,0x111111,s*0.1,0.03,0.145,head); });
  const tongue=box(0.02,0.01,0.12,0xb83a4a,0,-0.02,0.33,head); tongue.visible=false;
  mergeRigid(head,new Set([tongue])); segs.forEach((sg,i)=>mergeRigid(sg,new Set(i<N-1?[segs[i+1]]:[])));
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(0.35,1,1.3); sh.position.y=0.02; g.add(sh); blobs.push(sh);
  g.userData={legs:[],tail:null,head,inner,blob:sh,segs,tongue,snake:true,anim:(t,amp)=>animSnake(g,t,amp)};
  return g;
}
/** Schlange bewegen: eine Welle läuft den Körper entlang (amp 0 = ruhig liegen, leicht eingerollt) */
function animSnake(g,t,amp){
  const u=g.userData, w=0.22+Math.min(1,amp)*0.45, cur=amp<0.05?0.5:0;
  u.segs.forEach((sg,i)=>{ sg.rotation.y=i?Math.sin(t*0.9-i*0.8)*w+cur:Math.sin(t*0.9)*w*0.4; });
}

export { CROC_EYE, animCroc, animLegs, animSnake, buildSnake, buildCroc, buildQuad, furColor, furName, makeFur };
