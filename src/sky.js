// LeoLife – Himmel: Farbverlauf mit Sonne, Wolken und Sterne.
import { HORIZON, SUN_OFF, scene } from './engine.js';
import { G } from './state.js';
import { rnd } from './util.js';

/* Himmel mit Verlauf und Sonne, Wolken */
const sky=new THREE.Mesh(new THREE.SphereGeometry(700,24,12),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:new THREE.Color(0x3f8fd6)},hor:{value:new THREE.Color(HORIZON)},sunDir:{value:SUN_OFF.clone().normalize()},sunCol:{value:new THREE.Color(1,0.86,0.6)}},
  vertexShader:'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD; void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.0,1.0); vec3 c=mix(hor,top,pow(h,0.55)); float s=max(dot(d,sunDir),0.0); c+=sunCol*(pow(s,600.0)*2.0+pow(s,10.0)*0.22); gl_FragColor=vec4(c,1.0); }'
}));
sky.frustumCulled=false; sky.renderOrder=-10; scene.add(sky);
const clouds=[]; let cloudMat=null, starMat=null, stars=null; G.farMount=null;
(function(){
  const geo=new THREE.IcosahedronGeometry(1,1), mat=new THREE.MeshBasicMaterial({color:0xffffff,fog:false,transparent:true,opacity:0.9}); cloudMat=mat;
  for(let i=0;i<18;i++){
    const g=new THREE.Group(), n=3+Math.floor(Math.random()*4);
    for(let j=0;j<n;j++){ const m=new THREE.Mesh(geo,mat); m.position.set(rnd(-18,18),rnd(-2,2),rnd(-8,8)); m.scale.set(rnd(10,20),rnd(4,7),rnd(8,14)); g.add(m); }
    g.position.set(rnd(-480,480),rnd(110,170),rnd(-480,480)); g.userData.v=rnd(1.2,3); scene.add(g); clouds.push(g);
  }
  // Sterne (nur nachts sichtbar)
  const n=700, sp=new Float32Array(n*3);
  for(let i=0;i<n;i++){ const u=Math.random()*2-1, a=Math.random()*6.283, y=Math.abs(u)*0.95+0.05, r=Math.sqrt(1-y*y); sp[i*3]=Math.cos(a)*r*640; sp[i*3+1]=y*640; sp[i*3+2]=Math.sin(a)*r*640; }
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
  starMat=new THREE.PointsMaterial({color:0xffffff,size:2,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false});
  stars=new THREE.Points(sg,starMat); stars.frustumCulled=false; stars.renderOrder=-9; scene.add(stars);
})();

export { cloudMat, clouds, sky, starMat, stars };
