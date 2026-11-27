// Seerosen auf ruhigen Wasserflächen. Der feste Positionshash hält sie auf allen Geräten und nach Chunk-Wechseln gleich.
import { scene } from './engine.js';
import { WATER_D, registerCull, unregisterCull } from './terrain.js';

const leafShape=new THREE.Shape();
leafShape.moveTo(0,0); leafShape.quadraticCurveTo(-0.62,0.1,-0.34,0.78); leafShape.quadraticCurveTo(0,1.02,0.34,0.78); leafShape.quadraticCurveTo(0.62,0.1,0,0);
const leafGeo=new THREE.ShapeGeometry(leafShape,8); leafGeo.rotateX(-Math.PI/2);
const flowerGeo=new THREE.CircleGeometry(0.16,8); flowerGeo.rotateX(-Math.PI/2);
const leafMat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
const flowerMat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
const hash=(x,z,i)=>{ const v=Math.sin(x*12.9898+z*78.233+i*37.719)*43758.5453; return v-Math.floor(v); };

/** Fügt ein festes Seerosenfeld hinzu; drop() gibt Chunks und Geometrien wieder frei. */
function addWaterPlants(pond){
  if(!pond||pond.river||pond.r<5) return null;
  const count=Math.max(4,Math.min(28,Math.round(pond.r*0.48))), leaves=new THREE.InstancedMesh(leafGeo,leafMat,count), flowers=new THREE.InstancedMesh(flowerGeo,flowerMat,Math.max(1,Math.floor(count*0.22)));
  const mat=new THREE.Matrix4(), pos=new THREE.Vector3(), scale=new THREE.Vector3(), quat=new THREE.Quaternion(), color=new THREE.Color();
  for(let i=0;i<count;i++){
    const a=hash(pond.x,pond.z,i)*Math.PI*2, d=pond.r*(0.28+0.54*hash(pond.z,pond.x,i+81)), x=pond.x+Math.cos(a)*d, z=pond.z+Math.sin(a)*d;
    quat.setFromAxisAngle(new THREE.Vector3(0,1,0),hash(x,z,i)*Math.PI*2);
    const size=0.48+hash(z,x,i+20)*0.32; mat.compose(pos.set(x,pond.L-WATER_D+0.035+i*0.0002,z),quat,scale.set(size,1,size)); leaves.setMatrixAt(i,mat);
    leaves.setColorAt(i,color.setHSL(0.27+hash(x,z,i+3)*0.035,0.48+hash(z,x,i+4)*0.18,0.29+hash(x,z,i+5)*0.1));
    if(i<flowers.count){ const visible=hash(x,z,i+7)<0.82, fs=visible?0.75:0.001; mat.compose(pos.set(x,pond.L-WATER_D+0.09+i*0.0002,z),quat,scale.set(fs,1,fs)); flowers.setMatrixAt(i,mat); flowers.setColorAt(i,color.setHSL(hash(x,z,i+8)<0.5?0.59:0.12,0.72,0.76)); }
  }
  leaves.instanceMatrix.needsUpdate=true; flowers.instanceMatrix.needsUpdate=true; leaves.castShadow=false; flowers.castShadow=false; scene.add(leaves,flowers);
  const lc=registerCull(leaves,pond.x,pond.z,pond.r+2), fc=registerCull(flowers,pond.x,pond.z,pond.r+2);
  return {drop(){ unregisterCull(lc); unregisterCull(fc); scene.remove(leaves,flowers); }};
}

export { addWaterPlants };
