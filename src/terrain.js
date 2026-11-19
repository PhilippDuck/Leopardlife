// LeopardLife – Gelände: Höhenformel und Wasserlöcher, Kacheln mit Sichtbarkeitsprüfung, Boden, fernes Umland, Wasser und Hindernisse (Kollision).
import { camera, scene } from './engine.js';
import { REG } from './save.js';
import { G } from './state.js';
import { rnd } from './util.js';

// Radius der begehbaren Welt in Metern
const WORLD=235;
/* Gelände: Hügel + flache Wasserlöcher. Dieselbe Formel steht als GLSL im Gras-Shader. */
const H0=(x,z)=>Math.sin(x*0.021)*Math.cos(z*0.024)*4.6+Math.sin(x*0.07+z*0.05)*1.0+Math.cos(z*0.09-x*0.03)*0.7;
const PONDS=REG.ponds.map(p=>({x:p[0],z:p[1],r:p[2],L:H0(p[0],p[1])}));
const WATER_D=0.4;
function H(x,z){
  let h=H0(x,z);
  for(let i=0;i<PONDS.length;i++){
    const p=PONDS[i], d=Math.hypot(x-p.x,z-p.z);
    if(d<p.r*1.5){ let w=(p.r*1.5-d)/(p.r*0.6); if(w>1) w=1; w=w*w*(3-2*w); const q=d/p.r; const t=d<p.r?p.L-(1-q*q):p.L; h+=(t-h)*w; }
  }
  return h;
}
function pondAt(x,z,m){ for(let i=0;i<PONDS.length;i++){ const p=PONDS[i]; if(Math.hypot(x-p.x,z-p.z)<p.r*(m||1)) return p; } return null; }
function inWater(x,z){ const p=pondAt(x,z,1); return !!p&&H(x,z)<p.L-WATER_D-0.05; }
const GLSL_H='float H0(vec2 p){ return sin(p.x*0.021)*cos(p.y*0.024)*4.6+sin(p.x*0.07+p.y*0.05)*1.0+cos(p.y*0.09-p.x*0.03)*0.7; }\n'+
  'float Hh(vec2 p){ float h=H0(p); float d; float w; float u; float t;\n'+
  PONDS.map(p=>'  d=distance(p,vec2('+p.x.toFixed(2)+','+p.z.toFixed(2)+')); if(d<'+(p.r*1.5).toFixed(2)+'){ w=clamp(('+(p.r*1.5).toFixed(2)+'-d)/'+(p.r*0.6).toFixed(2)+',0.0,1.0); w=w*w*(3.0-2.0*w); u=d/'+p.r.toFixed(2)+'; t=d<'+p.r.toFixed(2)+'?'+p.L.toFixed(4)+'-(1.0-u*u):'+p.L.toFixed(4)+'; h+=(t-h)*w; }\n').join('')+
  '  return h; }\n';
const GLSL_PONDMASK=PONDS.map(p=>'  if(distance(w,vec2('+p.x.toFixed(2)+','+p.z.toFixed(2)+'))<'+(p.r*0.93).toFixed(2)+') fade=0.0;\n').join('');
const vnoise=(x,z)=>Math.sin(x*0.11+Math.sin(z*0.07)*2.1)*Math.cos(z*0.13+Math.sin(x*0.05)*1.7)*0.5+Math.sin(x*0.31-z*0.27)*0.25+Math.sin(x*0.53+z*0.61)*0.12;


/* Kacheln: Boden, Bäume, Büsche, Felsen und hohes Gras sind in 100-m-Felder aufgeteilt. Pro Bild wird nur gezeichnet,
   was im Blickfeld und vor der Nebelgrenze liegt (mit Zugabe, damit Schatten von knapp außerhalb nicht fehlen). */
const TILE=100, TN=6, TOFF=300;
const tileOf=(x,z)=>Math.max(0,Math.min(TN-1,Math.floor((x+TOFF)/TILE)))*TN+Math.max(0,Math.min(TN-1,Math.floor((z+TOFF)/TILE)));
const tileCenter=k=>({x:Math.floor(k/TN)*TILE-TOFF+TILE/2,z:(k%TN)*TILE-TOFF+TILE/2});
const cullList=[], _fr=new THREE.Frustum(), _pm=new THREE.Matrix4(), _sp=new THREE.Sphere();
function registerTile(mesh,k,r){ const c=tileCenter(k); mesh.frustumCulled=false; cullList.push({mesh,s:new THREE.Sphere(new THREE.Vector3(c.x,H(c.x,c.z)+5,c.z),r)}); }
function cullTiles(){
  camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  const far=scene.fog.far+10;
  for(let i=0;i<cullList.length;i++){ const t=cullList[i]; _sp.center.copy(t.s.center); _sp.radius=t.s.radius+35;
    t.mesh.visible=t.s.center.distanceTo(camera.position)-t.s.radius<far&&_fr.intersectsSphere(_sp); }
}
const hash2=(x,z)=>{ const h=Math.sin(x*12.9898+z*78.233)*43758.5453; return h-Math.floor(h); };

/* Boden (in Kacheln, Normalen aus der Höhenformel, damit an den Kachelrändern keine Kanten sichtbar sind) */
(function(){
  const mat=new THREE.MeshLambertMaterial({vertexColors:true}), SEG=40, E=0.5;
  const c1=new THREE.Color(REG.ground[0]), c2=new THREE.Color(REG.ground[1]), dirt=new THREE.Color(0x8f7248), sand=new THREE.Color(0xcbbb8c), mud=new THREE.Color(0x66684a), c=new THREE.Color();
  for(let k=0;k<TN*TN;k++){
    const tc=tileCenter(k), g=new THREE.PlaneGeometry(TILE,TILE,SEG,SEG); g.rotateX(-Math.PI/2); g.translate(tc.x,0,tc.z);
    const p=g.attributes.position, col=new Float32Array(p.count*3), nor=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), z=p.getZ(i); p.setY(i,H(x,z));
      const t=Math.min(1,Math.max(0,(Math.hypot(x,z)-60)/130));
      c.copy(c1).lerp(c2,t);
      const n=vnoise(x,z);
      if(n>0.3) c.lerp(dirt,Math.min(1,(n-0.3)*3)*0.75); else if(n<-0.3) c.multiplyScalar(1+Math.max(-0.22,(n+0.3)*0.6));
      const po=pondAt(x,z,1.35);
      if(po){ const d=Math.hypot(x-po.x,z-po.z)/po.r; if(d<0.86) c.copy(mud); else c.lerp(sand,Math.min(1,(1.35-d)/0.3)); }
      const kk=0.94+hash2(x,z)*0.12;
      col[i*3]=c.r*kk; col[i*3+1]=c.g*kk; col[i*3+2]=c.b*kk;
      const hx=(H(x+E,z)-H(x-E,z))/(2*E), hz=(H(x,z+E)-H(x,z-E))/(2*E), l=Math.hypot(hx,1,hz);
      nor[i*3]=-hx/l; nor[i*3+1]=1/l; nor[i*3+2]=-hz/l;
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    const m=new THREE.Mesh(g,mat); m.receiveShadow=true; scene.add(m); registerTile(m,k,76);
  }
})();

/* Fernes Umland (nicht begehbar) und Bergkette am Horizont, damit die Welt bei weiter Sicht nicht abbricht */
(function(){
  const CS=30, g=new THREE.PlaneGeometry(3000,3000,100,100); g.rotateX(-Math.PI/2);
  const p=g.attributes.position, col=new Float32Array(p.count*3), c=new THREE.Color(), c2=new THREE.Color(0xbfa95c), dirt=new THREE.Color(0x8f7248);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i); p.setY(i,Math.max(Math.abs(x),Math.abs(z))<290?-25:H0(x,z)-0.15);
    c.copy(c2); const n=vnoise(x,z); if(n>0.3) c.lerp(dirt,Math.min(1,(n-0.3)*3)*0.75);
    const k=0.94+Math.random()*0.12; col[i*3]=c.r*k; col[i*3+1]=c.g*k; col[i*3+2]=c.b*k;
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true})));
  // Höhe auf dem groben Raster (bilinear), damit ferne Bäume auf dem Boden stehen
  const Hc=(x,z)=>{ const x0=Math.floor(x/CS)*CS, z0=Math.floor(z/CS)*CS, u=(x-x0)/CS, v=(z-z0)/CS;
    return (H0(x0,z0)*(1-u)+H0(x0+CS,z0)*u)*(1-v)+(H0(x0,z0+CS)*(1-u)+H0(x0+CS,z0+CS)*u)*v-0.15; };
  const N=280, m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), cc=new THREE.Color();
  const tr=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3,0.45,5,5),new THREE.MeshLambertMaterial({color:0x6b4a2b}),N);
  const tp=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3,0),new THREE.MeshLambertMaterial({color:0xffffff}),N);
  for(let i=0;i<N;i++){
    let x,z; do{ const r=rnd(320,820), a=Math.random()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }while(Math.max(Math.abs(x),Math.abs(z))<325);
    const k=rnd(0.8,1.5), y=Hc(x,z), w=rnd(1.5,2.1);
    m.compose(v.set(x,y+2.5*k,z),q,s.set(k*0.7,k,k*0.7)); tr.setMatrixAt(i,m);
    m.compose(v.set(x,y+6*k,z),q,s.set(k*w,k*rnd(0.28,0.4),k*w)); tp.setMatrixAt(i,m);
    tp.setColorAt(i,cc.setHSL(rnd(0.19,0.25),rnd(0.35,0.45),rnd(0.34,0.42)));
  }
  tr.frustumCulled=false; tp.frustumCulled=false; scene.add(tr,tp);
  const M2=46, mt=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),new THREE.MeshBasicMaterial({color:0xffffff,fog:false}),M2);
  for(let i=0;i<M2;i++){
    const a=i/M2*6.283+rnd(-0.05,0.05), r=rnd(880,960), h=rnd(110,260), w=rnd(150,280);
    m.compose(v.set(Math.cos(a)*r,h/2-25,Math.sin(a)*r),q,s.set(w,h,w)); mt.setMatrixAt(i,m);
    mt.setColorAt(i,cc.setHSL(rnd(0.5,0.55),rnd(0.14,0.2),rnd(0.68,0.74)));
  }
  mt.frustumCulled=false; scene.add(mt); G.farMount=mt;
})();

/* Wasserlöcher */
const waters=[];
PONDS.forEach(p=>{
  const g=new THREE.CircleGeometry(p.r,48); g.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(g,new THREE.MeshPhongMaterial({color:0x4d9db3,transparent:true,opacity:0.74,shininess:120,specular:0xffffff}));
  m.position.set(p.x,p.L-WATER_D,p.z); m.userData.y=p.L-WATER_D; m.receiveShadow=true; scene.add(m); waters.push(m);
});

/* Hindernisse: Kreis-Kollider in einem Raster. low = niedrig, kann im Sprung überquert werden */
const CG=8, CN=64, colGrid=[]; for(let i=0;i<CN*CN;i++) colGrid.push([]);
function addCol(x,z,r,low){
  const c={x,z,r,low:!!low}, m=r+2.5;
  const x0=Math.max(0,Math.floor((x-m+256)/CG)), x1=Math.min(CN-1,Math.floor((x+m+256)/CG));
  const z0=Math.max(0,Math.floor((z-m+256)/CG)), z1=Math.min(CN-1,Math.floor((z+m+256)/CG));
  for(let i=x0;i<=x1;i++) for(let j=z0;j<=z1;j++) colGrid[i*CN+j].push(c);
}
const _col={x:0,z:0};
function collide(x,z,rad,skipLow){
  const i=Math.floor((x+256)/CG), j=Math.floor((z+256)/CG);
  if(i>=0&&j>=0&&i<CN&&j<CN){
    const L=colGrid[i*CN+j];
    for(let k=0;k<L.length;k++){
      const c=L[k]; if(skipLow&&c.low) continue;
      const dx=x-c.x, dz=z-c.z, m=c.r+rad, d2=dx*dx+dz*dz;
      if(d2<m*m){ const d=Math.sqrt(d2); if(d<1e-4){ x=c.x+m; } else { x=c.x+dx/d*m; z=c.z+dz/d*m; } }
    }
  }
  _col.x=x; _col.z=z; return _col;
}

export { GLSL_H, GLSL_PONDMASK, H, PONDS, WATER_D, WORLD, addCol, collide, cullTiles, inWater, pondAt, registerTile, tileOf, waters };
