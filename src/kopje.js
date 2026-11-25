// LeoLife – Felsplateaus (Kopjes): Inseln aus großen Granitblöcken mitten in der Savanne. Oben ist es flach – der Leopard
// klettert hinauf (Aussicht, sicher vor Löwen und Hyänen, Beute mitnehmen, schlafen). Am Fuß liegt eine Höhle: hinein,
// verstecken, schlafen; im Startgebiet kann sie zum Bau für die Jungen werden. Lage: kopjesites.js.
// Für das Klettern stehen Fläche und Höhle als Einträge ohne Teile in der Baumliste (kopje: Fels, cave: Höhle) –
// so gelten Sicherheit, Schlafen und Beute-Mitnehmen wie auf Bäumen.
import { scene } from './engine.js';
import { seeded } from './noise.js';
import { H, addCol, addSight, registerCull, removeCol, removeSight, unregisterCull } from './terrain.js';
import { releaseTree, treeSlot, trees } from './vegetation.js';
import { homeKopjes, worldKopje } from './kopjesites.js';
import { players } from './player.js';
import { followers } from './cubfollow.js';
import { animals } from './animals.js';

/** Höhe der abgeflachten Oberseite in der Felsform (Einheitskugel) */
const KOP_FLAT=0.62;
/** Verbeulte Kugel mit flacher Oberseite: Granitblock (Versatz hängt nur von der Lage ab, gemeinsame Ecken bleiben zusammen) */
const kopRockGeo=(()=>{
  const g=new THREE.IcosahedronGeometry(1,2), p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i), n=1+0.09*Math.sin(x*5.1+z*3.3)+0.05*Math.sin(y*9.0+x*7.0)+0.04*Math.cos(z*11.0-y*4.0);
    let yy=y*n; if(yy>KOP_FLAT) yy=KOP_FLAT+(yy-KOP_FLAT)*0.2; p.setXYZ(i,x*n,yy,z*n); }
  g.computeVertexNormals(); return g;
})();
const kopRockMat=new THREE.MeshLambertMaterial({color:0xffffff});
/** Höhleneingang: dunkle, flache Halbkuppel vor der Felswand */
const kopCaveGeo=new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2);
const kopCaveMat=new THREE.MeshBasicMaterial({color:0x14100c});

/** Lage des Höhleneingangs am Fuß des Felsens: Punkt auf der Wand und Richtung nach außen */
function caveMouth(k){ const ox=Math.sin(k.cave), oz=Math.cos(k.cave); return {x:k.x+ox*k.R*0.97,z:k.z+oz*k.R*0.97,ox,oz}; }

/** Baut das Felsplateau k auf. Gibt die Baum-Plätze (Fläche, Höhle) und eine Aufräum-Funktion zurück. */
function buildKopje(k){
  const r=seeded(k.seed), rr=(a,b)=>a+r()*(b-a), gy=H(k.x,k.z), blocks=[], cleanup=[];
  const hue=rr(0.04,0.08), sat=rr(0.08,0.16), lit=rr(0.46,0.54);
  const block=(x,z,y,sx,sy,sz,ry,dl)=>blocks.push({x,y,z,sx,sy,sz,ry,l:lit+dl});
  // Hauptfels: oben flach auf Höhe top, unten im Boden
  const sy=k.top*1.25; block(k.x,k.z,gy+k.top-KOP_FLAT*sy,k.R,sy,k.R*0.88,rr(0,6.28),0);
  // Blöcke rundum (nicht vor der Höhle), zwei rahmen den Eingang
  const m=caveMouth(k), n=6+Math.floor(r()*4);
  for(let i=0;i<n;i++){ const a=k.cave+0.6+i/n*(6.283-1.2)+rr(-0.15,0.15), d=k.R*rr(0.85,1.12), s=rr(1.1,2.4), x=k.x+Math.sin(a)*d, z=k.z+Math.cos(a)*d, h=s*rr(0.7,1);
    block(x,z,H(x,z)+h*0.15,s,h,s*rr(0.8,1),rr(0,6.28),rr(-0.05,0.05));
    const c=addCol(x,z,s*0.85,h<1); cleanup.push(()=>removeCol(c)); }
  for(const side of [-1,1]){ const a=k.cave+side*0.36, x=k.x+Math.sin(a)*k.R*0.98, z=k.z+Math.cos(a)*k.R*0.98, s=rr(1.3,1.7);
    block(x,z,H(x,z)+0.3,s,s*1.1,s,rr(0,6.28),-0.04); const c=addCol(x,z,s*0.75,false); cleanup.push(()=>removeCol(c)); }
  { const my=H(m.x,m.z); block(m.x-m.ox*0.3,m.z-m.oz*0.3,my+2.1,1.9,0.8,1.3,k.cave,-0.02); }   // Block über dem Eingang
  // ein, zwei Blöcke oben auf der Fläche, am Rand gegenüber der Höhle (Wackelsteine)
  for(let i=0,t=1+Math.floor(r()*2);i<t;i++){ const a=k.cave+Math.PI+rr(-0.7,0.7), d=k.R*0.6, s=rr(0.9,1.4);
    block(k.x+Math.sin(a)*d,k.z+Math.cos(a)*d,gy+k.top+s*0.45,s,s*0.85,s*0.9,rr(0,6.28),0.03); }
  const mesh=new THREE.InstancedMesh(kopRockGeo,kopRockMat,blocks.length), mt=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), v=new THREE.Vector3(), s=new THREE.Vector3(), c=new THREE.Color();
  blocks.forEach((b,i)=>{ q.setFromEuler(e.set(0,b.ry,0)); mesh.setMatrixAt(i,mt.compose(v.set(b.x,b.y,b.z),q,s.set(b.sx,b.sy,b.sz))); mesh.setColorAt(i,c.setHSL(hue,sat,b.l)); });
  mesh.castShadow=true; mesh.receiveShadow=true;
  const cave=new THREE.Mesh(kopCaveGeo,kopCaveMat); cave.position.set(m.x,H(m.x,m.z)-0.1,m.z); cave.scale.set(1.25,1.55,0.35); cave.rotation.y=k.cave;
  for(const o of [mesh,cave]){ scene.add(o); const cu=registerCull(o,k.x,k.z,k.R+6); cleanup.push(()=>{ unregisterCull(cu); scene.remove(o); }); }
  cleanup.push(()=>mesh.dispose?.());
  { const col=addCol(k.x,k.z,k.R*0.9,false), sg=addSight(k.x,k.z,k.R*0.9,k.top,1); cleanup.push(()=>{ removeCol(col); removeSight(sg); }); }
  // Für das Klettern: Fläche oben und Höhle als Baum-Einträge ohne Teile (cy weit unten: wird nie ausgeblendet)
  const top={x:k.x,z:k.z,y:gy,f:1,parts:[],cx:0,cy:-1e4,cz:0,rx:k.R*0.5,ry:1,perch:[0,k.top+0.08,0],tr:k.R*0.9,kopje:k,reach:k.R*0.9,walkR:k.R*0.42};
  const my=H(m.x,m.z), den={x:m.x,z:m.z,y:my,f:1,parts:[],cx:0,cy:-1e4,cz:0,rx:1,ry:1,perch:[-m.ox*0.7,0.02,-m.oz*0.7],tr:0.3,kopje:k,cave:true,reach:1.3,walkR:0.35,out:[m.ox,m.oz]};
  const slots=[top,den].map(t=>{ const i=treeSlot(); trees[i]=t; return i; });
  cleanup.push(()=>slots.forEach(releaseTree));
  return {slots,drop:()=>{ for(const fn of cleanup) fn(); }};
}
homeKopjes.forEach(buildKopje);

/** Felsplateau in einem nachgeladenen Abschnitt der weiten Welt (wird mit ihm entfernt, solange niemand oben ist) */
function fillKopje(chunk){
  const k=worldKopje(chunk.cx,chunk.cz); if(!k) return;
  const b=buildKopje(k);
  chunk.content.push({
    inUse:()=>players.some(p=>b.slots.includes(p.tree))||followers.some(f=>b.slots.includes(f.tree)||b.slots.includes(f.waitTree))||animals.some(a=>a.carc&&b.slots.includes(a.carc.tree)),
    drop:b.drop });
}

export { fillKopje };
