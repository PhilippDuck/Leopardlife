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
function animLegs(g,t,amp){ const l=g.userData.legs; const a=Math.sin(t)*amp; l[0].rotation.x=a; l[3].rotation.x=a; l[1].rotation.x=-a; l[2].rotation.x=-a; if(g.userData.tail) g.userData.tail.rotation.y=Math.sin(t*0.5)*0.3; }

export { animLegs, buildQuad, furColor, furName, makeFur };
