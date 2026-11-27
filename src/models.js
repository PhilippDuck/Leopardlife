// LeoLife – Tiermodelle aus Blöcken, Fellvarianten (inkl. Albino und Panther), Zusammenführen starrer Teile, Laufanimation.
import { blobs } from './quality.js';
import { rnd } from './util.js';
import { buildLeopard } from './leopard.js';

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
/** Leopard aus dem Low-Poly-Modell mit Skelett (leopard.js): o.leo 'adult' oder 'cub', v Fellvariante (makeFur) */
function leopardQuad(o,v){
  const f=k=>v?furColor(o[k],v):o[k];
  const g=buildLeopard(o.leo,{fur:f('col'),light:f('col2'),spot:v&&v.albino?0xd9cbb4:v&&v.melan?0x0b0908:0x2a1c10,nose:v&&v.albino?0xc8506a:0x1c1612},v);
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(0.6,1,1.15); sh.position.y=0.03; g.add(sh); blobs.push(sh); g.userData.blob=sh;
  return g;
}
function buildQuad(o,v){
  if(o.leo) return leopardQuad(o,v);
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

/* Pavian: kräftige Schultern, lange Hundeschnauze, langer, gebogener Schwanz. Steht er still, setzt er sich aufrecht hin
   (Rumpf kippt um die Hüfte nach oben, Hinterbeine nach vorn, Arme hängen herab). Männchen tragen einen hellen Mantel
   (userData.mane, erst sichtbar, wenn der Trupp sie als Männchen festlegt). Vorn ist +z. */
function buildBaboon(o,v){
  const f=k=>o[k]===undefined?undefined:(v?furColor(o[k],v):o[k]);
  const col=f('col'), dark=f('col2')||col, mane=f('mane')||col, face=v&&v.albino?0xd9b0a8:0x3a2c28, rump=0xb07868;
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const L=1.1, Hh=0.46, W=0.42, leg=0.5;
  // Rumpf als eigenes Gelenk an der Hüfte: so kann er sich zum Sitzen aufrichten
  const body=new THREE.Group(); body.position.set(0,leg,-L/2+0.1); inner.add(body);
  box(W,Hh,L,col,0,Hh/2-0.08,L/2-0.1,body);
  box(W*0.8,Hh*0.5,0.06,rump,0,Hh*0.15,-0.12,body);                                   // nackte Sitzschwielen
  const head=new THREE.Group(); head.position.set(0,Hh*0.55,L-0.05); body.add(head);
  box(0.34,0.32,0.3,col,0,0,0,head);
  box(0.2,0.18,0.36,face,0,-0.06,0.3,head);                                           // lange Schnauze
  box(0.12,0.06,0.06,0x1c1412,0,-0.03,0.49,head);
  box(0.36,0.06,0.06,dark,0,0.1,0.15,head);                                            // Brauenwulst
  [1,-1].forEach(s=>{ box(0.05,0.04,0.03,v&&v.albino?0xc8506a:0x111111,s*0.09,0.05,0.165,head); box(0.07,0.1,0.06,dark,s*0.17,0.12,-0.04,head); });
  const maneG=new THREE.Group(); body.add(maneG);
  box(W+0.12,Hh+0.14,0.5,mane,0,Hh/2-0.06,L-0.32,maneG); box(0.42,0.38,0.2,mane,0,Hh*0.6,L-0.12,maneG);
  maneG.visible=false;
  const legs=[];
  // Vorderbeine (Arme) hängen am Rumpf, Hinterbeine an der Hüfte
  [[1,1],[-1,1]].forEach(p=>{ const pv=new THREE.Group(); pv.position.set(p[0]*(W/2-0.06),0,L-0.32); body.add(pv); box(0.13,leg+0.04,0.13,dark,0,-(leg+0.04)/2,0,pv); legs.push(pv); });
  [[1,-1],[-1,-1]].forEach(p=>{ const pv=new THREE.Group(); pv.position.set(p[0]*(W/2-0.06),leg,-L/2+0.14); inner.add(pv); box(0.15,leg,0.17,dark,0,-leg/2,0,pv); legs.push(pv); });
  // Schwanz: steigt zuerst schräg nach oben und fällt dann in einem Bogen herab
  const tail=new THREE.Group(); tail.position.set(0,Hh*0.3,-0.12); body.add(tail); tail.rotation.x=0.9;
  box(0.08,0.08,0.4,col,0,0,-0.2,tail);
  const tail2=new THREE.Group(); tail2.position.set(0,0,-0.4); tail.add(tail2); tail2.rotation.x=-1.9;
  box(0.07,0.07,0.55,col,0,0,-0.27,tail2); box(0.09,0.09,0.12,dark,0,0,-0.56,tail2);
  mergeRigid(body,new Set(legs.concat([tail,head,maneG]))); mergeRigid(head,new Set()); mergeRigid(maneG,new Set());
  legs.forEach(l=>mergeRigid(l,new Set())); mergeRigid(tail,new Set([tail2])); mergeRigid(tail2,new Set());
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(W*1.3,1,L*0.7); sh.position.y=0.03; g.add(sh); blobs.push(sh);
  g.userData={legs,tail,head,inner,body,blob:sh,mane:maneG,sit:0,anim:(t,amp)=>animBaboon(g,t,amp)};
  return g;
}
/** Pavian bewegen: laufen auf allen vieren; bei (fast) keiner Bewegung setzt er sich langsam aufrecht hin */
function animBaboon(g,t,amp){
  const u=g.userData, l=u.legs, s=u.sit+=((amp<0.06?1:0)-u.sit)*0.12, a=Math.sin(t)*amp*(1-s);
  u.body.rotation.x=-1.05*s; u.body.position.y=0.5-0.32*s;
  l[0].rotation.x=a+0.95*s; l[1].rotation.x=-a+0.95*s; l[2].rotation.x=-a-1.35*s; l[3].rotation.x=a-1.35*s;
  l[2].position.y=l[3].position.y=0.5-0.32*s;
  u.head.rotation.x=0.9*s; u.tail.rotation.y=Math.sin(t*0.5)*0.25*(1-s); u.tail.rotation.x=0.9+0.8*s;
}

/* Elefant: mächtiger Rumpf auf Säulenbeinen, großer Kopf mit Stoßzähnen, Ohren und einem Rüssel aus Gliedern.
   userData.alarm (0…1) spreizt die Ohren und hebt den Rüssel zum Trompeten; sonst fächeln die Ohren und der Rüssel pendelt.
   Vorn ist +z. */
function buildElephant(o,v){
  const f=k=>o[k]===undefined?undefined:(v?furColor(o[k],v):o[k]);
  const col=f('col'), dark=f('col2')||col, eyeC=v&&v.albino?0xc8506a:0x111111, ivory=0xeee6cf;
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const L=1.5, Hh=0.75, W=0.85, leg=0.7, by=leg+Hh/2;
  // Rumpf: hoher Rücken über den Schultern, zur Hüfte abfallend, Bauch etwas dunkler
  box(W,Hh,L,col,0,by,0,inner); box(W*0.9,0.16,L*0.55,col,0,by+Hh/2+0.06,0.22,inner); box(W*0.85,0.12,L*0.4,col,0,by+Hh/2+0.02,-0.4,inner);
  box(W*0.92,0.12,L*0.85,dark,0,by-Hh/2+0.02,0,inner);
  // Kopf: Schädel mit Stirnwulst, Augen, Stoßzähne
  const head=new THREE.Group(); head.position.set(0,by+0.22,L/2+0.08); inner.add(head);
  box(0.62,0.66,0.5,col,0,0,0.14,head); box(0.5,0.18,0.3,col,0,0.36,0.1,head);
  box(0.4,0.3,0.22,col,0,-0.28,0.32,head);                                                     // Ansatz des Rüssels
  [1,-1].forEach(s=>{ box(0.04,0.06,0.06,eyeC,s*0.31,0.06,0.3,head);
    const t=box(0.07,0.07,0.5,ivory,s*0.15,-0.42,0.52,head); t.rotation.x=-0.45; });            // Stoßzähne, nach vorn geschwungen
  // Ohren: große Lappen, die am Kopf hängen und sich zum Drohen abspreizen
  const ears=[1,-1].map(s=>{ const e=new THREE.Group(); e.position.set(s*0.31,0.08,0.06); head.add(e);
    box(0.05,0.72,0.56,dark,s*0.03,-0.08,-0.28,e); box(0.04,0.5,0.4,0x9a7f7a,s*0.06,-0.08,-0.24,e); return e; });
  // Rüssel: sechs Glieder, von oben nach unten dünner
  const trunk=[]; let par=head;
  for(let i=0;i<6;i++){ const w=0.24-0.025*i, len=0.14; const sg=new THREE.Group(); sg.position.set(0,i?-len:-0.4,i?0:0.38); par.add(sg);
    box(w,len,w,col,0,-len/2,0,sg); if(i===5) box(w*1.1,0.05,w*1.1,dark,0,-len,0,sg); trunk.push(sg); par=sg; }
  const legs=[];
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(p=>{ const pv=new THREE.Group(); pv.position.set(p[0]*(W/2-0.16),leg,p[1]*(L/2-0.2)); inner.add(pv);
    box(0.28,leg,0.3,col,0,-leg/2,0,pv); box(0.32,0.06,0.34,dark,0,-leg+0.03,0.01,pv); legs.push(pv); });
  const tail=new THREE.Group(); tail.position.set(0,by+Hh*0.3,-L/2); inner.add(tail); box(0.05,0.05,0.5,dark,0,0,-0.25,tail); box(0.08,0.08,0.1,0x2a2420,0,0,-0.52,tail); tail.rotation.x=1.15;
  mergeRigid(inner,new Set(legs.concat([tail,head]))); mergeRigid(head,new Set(ears.concat([trunk[0]])));
  ears.forEach(e=>mergeRigid(e,new Set())); trunk.forEach((sg,i)=>mergeRigid(sg,new Set(i<5?[trunk[i+1]]:[])));
  legs.forEach(l=>mergeRigid(l,new Set())); mergeRigid(tail,new Set());
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(W*1.2,1,L*0.75); sh.position.y=0.03; g.add(sh); blobs.push(sh);
  g.userData={legs,tail,head,inner,blob:sh,ears,trunk,alarm:0,elephant:true,anim:(t,amp)=>animElephant(g,t,amp)};
  return g;
}
/** Elefant bewegen: Beine, Schwanz, Ohren fächeln, Rüssel pendelt; mit userData.alarm Ohren gespreizt und Rüssel erhoben */
function animElephant(g,t,amp){
  const u=g.userData, l=u.legs, a=Math.sin(t)*amp*0.8, al=u.alarm||0;
  l[0].rotation.x=a; l[3].rotation.x=a; l[1].rotation.x=-a; l[2].rotation.x=-a;
  u.tail.rotation.y=Math.sin(t*0.5)*0.3;
  const fan=(1-al)*(0.12+0.1*Math.sin(t*0.35))+al*1.15;
  u.ears[0].rotation.y=-fan; u.ears[1].rotation.y=fan;
  u.trunk.forEach((sg,i)=>{ sg.rotation.x=-al*(i?0.5:0.9); sg.rotation.z=(1-al)*Math.sin(t*0.3-i*0.6)*0.08; });
  u.head.rotation.x=-al*0.25;
}

/* Nilpferd: massiger, tonnenförmiger Rumpf auf kurzen Beinen, breites Maul mit Hauern und weit aufklappbarem Unterkiefer
   (userData.jaw). Augen, Ohren und Nasenlöcher sitzen oben auf dem Kopf – im Wasser schauen nur sie und der Rücken heraus.
   Vorn ist +z. HIPPO_EYE: Höhe der Augen über dem Boden (Modellmaß). */
const HIPPO_EYE=1.0;
function buildHippo(o,v){
  const f=k=>o[k]===undefined?undefined:(v?furColor(o[k],v):o[k]);
  const col=f('col'), dark=f('col2')||col, pink=f('belly')||col, eyeC=v&&v.albino?0xc8506a:0x111111;
  const g=new THREE.Group(), inner=new THREE.Group(); g.add(inner);
  const L=1.65, Hh=0.62, W=0.8, leg=0.3, by=leg+Hh/2;
  // Rumpf: Tonne aus drei Lagen (Bauch, Mitte, Rücken), Schultern etwas höher als die Hüfte
  box(W,Hh,L,col,0,by,0,inner); box(W*0.86,Hh*0.3,L*0.92,col,0,by+Hh*0.5,0.02,inner); box(W*0.9,0.14,L*0.85,pink,0,by-Hh*0.5,0,inner);
  box(W*1.04,Hh*0.75,L*0.5,col,0,by+0.02,0.25,inner);
  box(W*0.6,0.06,L*0.7,dark,0,by+Hh*0.66,0,inner);
  // Kopf: Schädel, breites Maul, Augen, Ohren und Nasenlöcher oben
  const head=new THREE.Group(); head.position.set(0,by+0.16,L/2+0.02); inner.add(head);
  box(0.5,0.36,0.42,col,0,0.02,0.12,head);
  box(0.64,0.3,0.42,col,0,0,0.5,head);
  box(0.6,0.08,0.38,pink,0,-0.14,0.52,head);                                                   // Oberlippe
  [1,-1].forEach(s=>{ box(0.12,0.1,0.12,col,s*0.17,0.24,0.08,head);                            // Augenhöcker
    box(0.05,0.05,0.03,eyeC,s*0.19,0.26,0.145,head);
    box(0.07,0.09,0.04,dark,s*0.2,0.3,-0.06,head);                                              // kleine Ohren
    box(0.08,0.04,0.06,0x2a2022,s*0.12,0.15,0.66,head); });                                     // Nasenlöcher
  // Unterkiefer mit Hauern: klappt beim Drohen weit auf
  const jaw=new THREE.Group(); jaw.position.set(0,-0.15,0.2); head.add(jaw);
  box(0.58,0.12,0.58,col,0,-0.05,0.28,jaw); box(0.5,0.03,0.52,0xb85a64,0,0.02,0.28,jaw);
  [1,-1].forEach(s=>{ box(0.06,0.18,0.06,0xf1ead0,s*0.22,0.08,0.5,jaw); box(0.04,0.08,0.04,0xf1ead0,s*0.1,0.05,0.53,jaw); });
  const legs=[];
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(p=>{ const pv=new THREE.Group(); pv.position.set(p[0]*(W/2-0.12),leg+0.05,p[1]*(L/2-0.28)); inner.add(pv);
    box(0.24,leg+0.05,0.26,col,0,-(leg+0.05)/2,0,pv); box(0.26,0.05,0.28,dark,0,-leg-0.02,0.01,pv); legs.push(pv); });
  const tail=new THREE.Group(); tail.position.set(0,by+0.12,-L/2); inner.add(tail); box(0.08,0.06,0.22,dark,0,0,-0.11,tail); tail.rotation.x=0.9;
  mergeRigid(inner,new Set(legs.concat([tail,head]))); mergeRigid(head,new Set([jaw])); mergeRigid(jaw,new Set());
  legs.forEach(l=>mergeRigid(l,new Set())); mergeRigid(tail,new Set());
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(W*1.1,1,L*0.7); sh.position.y=0.03; g.add(sh); blobs.push(sh);
  g.userData={legs,tail,head,inner,blob:sh,jaw,hippo:true};
  return g;
}

export { CROC_EYE, HIPPO_EYE, buildHippo, buildBaboon, buildElephant, animCroc, animLegs, animSnake, buildSnake, buildCroc, buildQuad, furColor, furName, makeFur };
