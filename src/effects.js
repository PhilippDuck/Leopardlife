// LeopardLife – Partikel-Wolken (Staub, Blut, Blasen) und Brüll-Wellen.
import { scene } from './engine.js';
import { rnd } from './util.js';
import { G } from './state.js';

/* Partikel */
const puffs=[]; const puffGeo=new THREE.BoxGeometry(0.25,0.25,0.25);
function puff(x,y,z,c,n,s){ for(let i=0;i<n;i++){ const m=new THREE.Mesh(puffGeo,new THREE.MeshBasicMaterial({color:c,transparent:true})); m.position.set(x,y,z); m.scale.setScalar(s*rnd(0.6,1.4)); scene.add(m); puffs.push({m,vx:rnd(-3,3),vy:rnd(2,6),vz:rnd(-3,3),t:0.7}); } }

/* Brüllen: Comic-Schallbögen vor dem Maul und eine Druckwelle am Boden, so groß wie die Reichweite */
const waves=[];
const arcGeo=new THREE.RingGeometry(0.8,1,40,1,Math.PI*0.12,Math.PI*0.76);
const floorGeo=new THREE.RingGeometry(0.93,1,64);
/** Zeigt den Brüller: x,y,z Fuß, rot Blickrichtung, sc Körpergröße, R Reichweite. */
function roarFx(x,y,z,rot,sc,R){
  const fx=Math.sin(rot), fz=Math.cos(rot);
  for(let i=0;i<4;i++){
    const m=new THREE.Mesh(arcGeo,new THREE.MeshBasicMaterial({color:0xfff4d6,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
    m.rotation.y=rot; m.position.set(x+fx*1.05*sc,y+1.0*sc,z+fz*1.05*sc); m.scale.setScalar(0.01); m.renderOrder=5; scene.add(m);
    waves.push({m,kind:'arc',t:-i*0.16,life:0.75,fx,fz,sc,ox:m.position.x,oy:m.position.y,oz:m.position.z});
  }
  const f=new THREE.Mesh(floorGeo,new THREE.MeshBasicMaterial({color:0xf2e6c8,transparent:true,opacity:0.55,side:THREE.DoubleSide,depthWrite:false}));
  f.rotation.x=-Math.PI/2; f.position.set(x,y+0.15,z); f.scale.setScalar(0.5); scene.add(f);
  waves.push({m:f,kind:'floor',t:0,life:0.9,R});
}
function updateFx(dt){
  for(let i=waves.length-1;i>=0;i--){ const w=waves[i]; w.t+=dt; const m=w.m;
    if(w.t<0) continue;
    const k=Math.min(1,w.t/w.life);
    if(w.kind==='arc'){ const d=(0.2+2.6*k)*w.sc; m.position.set(w.ox+w.fx*d,w.oy+0.25*k*w.sc,w.oz+w.fz*d); m.scale.setScalar((0.35+1.5*k)*w.sc); m.material.opacity=0.95*(1-k*k); }
    else { m.scale.setScalar(0.5+(w.R-0.5)*(1-(1-k)*(1-k))); m.material.opacity=0.55*(1-k); }
    if(w.t>=w.life){ scene.remove(m); m.material.dispose(); waves.splice(i,1); }
  }
}

/* Fleisch-Kugeln über einem Kadaver: eine Kugel je Bissen, in Reihen zu höchstens 8 */
const orbGeo=new THREE.SphereGeometry(0.16,10,8);
const orbMat=new THREE.MeshBasicMaterial({color:0xe0603a,transparent:true,opacity:0.95,depthWrite:false});
/** Baut die Kugelgruppe für n Bissen über Position x,y,z */
function meatOrbs(n,x,y,z){
  const g=new THREE.Group(); g.position.set(x,y,z);
  for(let i=0;i<n;i++){ const row=Math.floor(i/8), col=i%8, inRow=Math.min(8,n-row*8);
    const m=new THREE.Mesh(orbGeo,orbMat); m.position.set((col-(inRow-1)/2)*0.42,row*0.42,0); m.renderOrder=6; g.add(m); }
  scene.add(g); return g;
}
/** Kugeln an den Rest anpassen: je Bissen eine sichtbar; kurz vor dem Verderben blinken sie; schweben leicht */
function syncOrbs(g,meat,left,now){
  g.children.forEach((m,i)=>{ m.visible=i<meat; });
  g.visible=left>10||Math.sin(now*12)>-0.3;
  g.position.y=g.userData.y0+Math.sin(now*2)*0.08; g.rotation.y=now*0.6;
}
function dropOrbs(g){ if(g) scene.remove(g); }

/* Trefferfeedback */
// slowT: kurze Zeitlupe nach Hinterhalt und Beute
G.slowT=0;

export { dropOrbs, meatOrbs, puff, puffs, roarFx, syncOrbs, updateFx };
