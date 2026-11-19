// LeopardLife – Partikel-Wolken (Staub, Blut, Blasen).
import { scene } from './engine.js';
import { rnd } from './util.js';

/* Partikel */
const puffs=[]; const puffGeo=new THREE.BoxGeometry(0.25,0.25,0.25);
function puff(x,y,z,c,n,s){ for(let i=0;i<n;i++){ const m=new THREE.Mesh(puffGeo,new THREE.MeshBasicMaterial({color:c,transparent:true})); m.position.set(x,y,z); m.scale.setScalar(s*rnd(0.6,1.4)); scene.add(m); puffs.push({m,vx:rnd(-3,3),vy:rnd(2,6),vz:rnd(-3,3),t:0.7}); } }

export { puff, puffs };
