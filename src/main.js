// LeopardLife – Spiellogik (Einstiegsmodul).
// Wird Schritt für Schritt in Module nach Zuständigkeit aufgeteilt.
import { ATTR, ABIL, TRAITS, DIFF, REGIONS, QUAL, SPECIES, FOOD, DAT, ART, ICONS, ICOL, ico } from './data.js';
import { $, rnd } from './util.js';
import { G } from './state.js';
import { AC, master, nbuf, initAudio, tone, snd, musicTick } from './audio.js';
import { D, DIE_AT, OLD_AT, REG, REG_ID, S, ancF, at, attrCap, baseSpeed, beaten, dmg, fresh, has, maxHp, maxSt, oldF, pScale, resetState, save, xpNeed } from './save.js';
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }
if(!window.THREE){ $('err').textContent='Three.js konnte nicht geladen werden. Bitte Seite neu laden.'; $('btnPlay').disabled=true; throw new Error('three.js fehlt'); }


/* ---------- Szene ---------- */
const canvas=$('game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();
const HORIZON=REG.hor;
scene.background=new THREE.Color(HORIZON);
scene.fog=new THREE.Fog(HORIZON,55,240);
const camera=new THREE.PerspectiveCamera(60,1,0.2,1500);
const hemi=new THREE.HemisphereLight(0xd4ecff,0x6f7a48,0.72); scene.add(hemi);
const SUN_OFF=new THREE.Vector3(48,70,30); G.FOG_BASE=[55,240]; const grassLight={value:new THREE.Color(1,1,1)};
// Wind: Richtung (wx,wz) wandert langsam. Tiere, zu denen der Wind deinen Geruch trägt, bemerken dich früher; gegen den Wind kommst du näher heran.
const windU={value:new THREE.Vector2(0.6,0.8)}; G.windAng=Math.random()*6.283; G.windTarget=G.windAng; G.windT=90;
const SMART=()=>({easy:0,normal:0.5,hard:1})[S.diff]??0.5;      // wie klug die Tiere vorgehen
const WINDK=()=>({easy:0.5,normal:0.8,hard:1})[S.diff]??0.8;     // wie stark der Wind wirkt
function windMulDir(ux,uz){ const dt=ux*windU.value.x+uz*windU.value.y, K=WINDK(); return dt>0?1+0.6*dt*K:1+0.35*dt*K; }
const sun=new THREE.DirectionalLight(0xffe6b8,1.0); sun.position.copy(SUN_OFF); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-0.0005; sun.shadow.normalBias=0.05;
(function(c){ c.left=-55; c.right=55; c.top=55; c.bottom=-55; c.near=5; c.far=220; c.updateProjectionMatrix(); })(sun.shadow.camera);
function resize(){ const w=window.innerWidth,h=window.innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
window.addEventListener('resize',resize); resize();

/* Grafikqualität: niedrig / hoch / ultra (weitere Sicht, schärfere und weitere Schatten, mehr Gras) */
let quality='high', VIEW_D=170; G.pxScale=1; let PX_BASE=1;
try{ const q=localStorage.getItem('jaguar-gfx2'); if(q&&QUAL[q]) quality=q; }catch(e){}
const blobs=[]; G.grassGeo=null; G.grassMat=null; const GRASS_N=30000;
function applyQuality(){
  const q=QUAL[quality];
  PX_BASE=Math.min(window.devicePixelRatio||1,q.px); renderer.setPixelRatio(PX_BASE*G.pxScale);
  if(q.sh>0) renderer.shadowMap.needsUpdate=true;
  sun.castShadow=q.sh>0;
  if(q.sh>0){
    const c=sun.shadow.camera; c.left=-q.shR; c.right=q.shR; c.top=q.shR; c.bottom=-q.shR; c.updateProjectionMatrix();
    if(sun.shadow.mapSize.x!==q.sh){ sun.shadow.mapSize.set(q.sh,q.sh); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } }
  }
  blobs.forEach(b=>{ b.visible=!q.sh; });
  if(G.grassGeo){ G.grassGeo.instanceCount=q.grass; G.grassMat.uniforms.uS.value=q.gS; }
  if(tallGeo) tallGeo.forEach(t=>{ t.g.instanceCount=Math.floor(t.n*q.tall); });
  leafMeshes.forEach(m=>{ m.geometry=quality==='low'?leafGeoLo:leafGeoHi; });
  G.FOG_BASE=q.fog; VIEW_D=q.view; if(typeof updateDayNight==='function') updateDayNight(0);
  resize();
  $('gfx').textContent='Grafik: '+q.n;
}
$('gfx').onclick=()=>{ quality=quality==='low'?'high':quality==='high'?'ultra':'low'; try{ localStorage.setItem('jaguar-gfx2',quality); }catch(e){} applyQuality(); };

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

/* Bäume: aus mehreren Teilen (Stamm, Äste, Wurzeln, Laubballen). Arten: Urwaldbaum, Urwaldriese, Schirmakazie, toter Baum, Palme am Wasser.
   Werden ausgeblendet, wenn ihre Krone zwischen Kamera und Leopard steht. */
const trees=[]; let woodMeshes=[], leafMeshes=[], leafGeoHi=null, leafGeoLo=null; const dirtyTree=new Set(); const leafTime={value:0};
const _tm=new THREE.Matrix4(), _tb=new THREE.Matrix4(), _tq=new THREE.Quaternion(), _tv=new THREE.Vector3(), _UP=new THREE.Vector3(0,1,0);
function setTree(i){
  const t=trees[i], f=t.f;
  _tb.makeScale(f,f,f); _tb.setPosition(t.x,t.y,t.z);
  for(let j=0;j<t.parts.length;j++){ const p=t.parts[j]; _tm.multiplyMatrices(_tb,p.m); p.mesh.setMatrixAt(p.i,_tm); dirtyTree.add(p.mesh); }
}
function blobGeo(detail){
  // Leicht verbeulte Kugel; der Versatz hängt nur von der Position ab, damit gemeinsame Ecken zusammenbleiben
  const g=new THREE.IcosahedronGeometry(1,detail), p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i), n=1+0.14*Math.sin(x*12.9+y*7.3)*Math.cos(z*9.1-x*3.7)+0.07*Math.sin(y*21.0+z*13.0); p.setXYZ(i,x*n,y*n,z*n); }
  g.computeVertexNormals(); return g;
}
(function(){
  const hsl=(h,s,l)=>new THREE.Color().setHSL(h,s,l).getHex();
  function make(o){
    const t={x:o.x,z:o.z,y:H(o.x,o.z),f:1,parts:[],cx:0,cz:0};
    const wood=(a,b,r,c)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2], len=Math.hypot(dx,dy,dz)||0.01;
      _tq.setFromUnitVectors(_UP,_tv.set(dx/len,dy/len,dz/len));
      t.parts.push({leaf:false,c,m:new THREE.Matrix4().compose(new THREE.Vector3(a[0],a[1],a[2]),_tq.clone(),new THREE.Vector3(r,len,r))}); };
    const leaf=(p,sx,sy,sz,c,q)=>t.parts.push({leaf:true,c,m:new THREE.Matrix4().compose(new THREE.Vector3(p[0],p[1],p[2]),
      q||new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.25,0.25),Math.random()*6.28,rnd(-0.25,0.25))),new THREE.Vector3(sx,sy,sz))});
    if(o.palm){
      // Palme: gebogener Stamm aus Segmenten, Wedel hängen nach unten
      const k=rnd(0.85,1.2), a=Math.random()*6.283, bark=hsl(0.09,0.28,rnd(0.38,0.46)); let p=[0,-0.2,0];
      for(let s=0;s<6;s++){ const th=0.06+0.075*s, L=1.25*k, q=[p[0]+Math.cos(a)*Math.sin(th)*L,p[1]+Math.cos(th)*L,p[2]+Math.sin(a)*Math.sin(th)*L]; wood(p,q,(0.26-0.012*s)*k,bark); p=q; }
      const hue=rnd(0.24,0.3);
      for(let j=0;j<8;j++){ const yaw=j/8*6.283+rnd(-0.25,0.25), pit=rnd(0.22,0.55), d=1.55*k;
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(pit,yaw,0,'YXZ'));
        leaf([p[0]+Math.sin(yaw)*Math.cos(pit)*d,p[1]-Math.sin(pit)*d+0.15*k,p[2]+Math.cos(yaw)*Math.cos(pit)*d],0.5*k,0.09*k,2.0*k,hsl(hue+rnd(-0.02,0.02),rnd(0.45,0.58),rnd(0.3,0.38)),q); }
      leaf([p[0],p[1]-0.15*k,p[2]],0.45*k,0.35*k,0.45*k,hsl(0.08,0.45,0.28));
      t.cx=p[0]; t.cz=p[2]; t.cy=p[1]; t.rx=2.6*k; t.ry=1.1*k; t.perch=[p[0],p[1]+0.25*k,p[2]]; t.tr=0.28*k;
    } else if(o.sav&&Math.random()<0.1){
      // Toter Baum: kahle, graue Äste
      const k=rnd(0.8,1.25), h=rnd(4,6)*k, bark=hsl(0.08,0.07,rnd(0.46,0.56)), top=[rnd(-0.4,0.4)*k,h,rnd(-0.4,0.4)*k];
      wood([0,-0.2,0],top,0.28*k,bark);
      const nb=3+Math.floor(Math.random()*2);
      for(let j=0;j<nb;j++){ const a=j/nb*6.283+rnd(-0.4,0.4), u=rnd(0.5,0.9), s=[top[0]*u,h*u,top[2]*u], L=rnd(1.4,2.4)*k, e=[s[0]+Math.cos(a)*L,s[1]+rnd(0.9,1.9)*k,s[2]+Math.sin(a)*L];
        wood(s,e,0.13*k,bark); const b=a+rnd(-0.9,0.9); wood(e,[e[0]+Math.cos(b)*0.9*k,e[1]+0.7*k,e[2]+Math.sin(b)*0.9*k],0.07*k,bark); }
      t.cx=top[0]*0.7; t.cz=top[2]*0.7; t.cy=h*0.75; t.rx=1.5*k; t.ry=h*0.3; t.perch=[top[0],h,top[2]]; t.tr=0.28*k;
    } else if(o.sav){
      // Schirmakazie: kurzer Stamm, gabelt sich, flache breite Laubschirme
      const k=rnd(0.85,1.3), h1=rnd(1.8,2.8)*k, bark=hsl(0.06,0.25,rnd(0.17,0.24)), ln=[rnd(-0.3,0.3)*k,h1,rnd(-0.3,0.3)*k], hue=rnd(0.19,0.25);
      wood([0,-0.2,0],ln,0.3*k,bark);
      const nf=2+Math.floor(Math.random()*2); let top=0;
      for(let j=0;j<nf;j++){ const a=j/nf*6.283+rnd(-0.5,0.5), L=rnd(1.6,2.6)*k, e=[ln[0]+Math.cos(a)*L,h1+rnd(1.8,2.8)*k,ln[2]+Math.sin(a)*L]; top=Math.max(top,e[1]);
        wood(ln,e,0.17*k,bark);
        leaf([e[0],e[1]+0.3*k,e[2]],rnd(2,2.8)*k,rnd(0.42,0.6)*k,rnd(2,2.8)*k,hsl(hue+rnd(-0.015,0.015),rnd(0.34,0.44),rnd(0.31,0.4)),new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.08,0.08),Math.random()*6.28,rnd(-0.08,0.08)))); }
      leaf([ln[0],top+0.35*k,ln[2]],rnd(2.6,3.3)*k,0.55*k,rnd(2.6,3.3)*k,hsl(hue,rnd(0.36,0.44),rnd(0.36,0.43)),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.random()*6.28,0)));
      t.cx=ln[0]; t.cz=ln[2]; t.cy=top+0.2*k; t.rx=4*k; t.ry=1.2*k; t.perch=[ln[0],top+0.35*k+0.47*k,ln[2]]; t.tr=0.3*k;
    } else {
      // Urwaldbaum (selten ein Riese): Brettwurzeln, Äste mit eigenen Laubballen, oben hellere Blätter
      const big=Math.random()<0.1, k=rnd(0.8,1.4), kb=k*(big?1.45:1), h=(big?rnd(10,12.5):rnd(5.5,8))*k, r=(big?0.62:0.42)*k;
      const bark=hsl(rnd(0.06,0.09),rnd(0.25,0.35),rnd(0.2,0.29)), top=[rnd(-0.5,0.5)*k,h,rnd(-0.5,0.5)*k], hue=rnd(0.27,0.36), sat=rnd(0.42,0.56), lit=rnd(0.19,0.27);
      wood([0,-0.3,0],top,r,bark);
      const nr=3+Math.floor(Math.random()*2);
      for(let j=0;j<nr;j++){ const a=j/nr*6.283+rnd(-0.3,0.3); wood([Math.cos(a)*1.3*k*(big?1.4:1),-0.25,Math.sin(a)*1.3*k*(big?1.4:1)],[Math.cos(a)*0.15*k,(big?2.2:1.4)*k,Math.sin(a)*0.15*k],0.2*k,bark); }
      const nb=3+Math.floor(Math.random()*2);
      for(let j=0;j<nb;j++){ const a=j/nb*6.283+rnd(-0.4,0.4), u=rnd(0.62,0.86), s=[top[0]*u,h*u,top[2]*u], L=rnd(2,3.2)*k*(big?1.4:1), e=[s[0]+Math.cos(a)*L,s[1]+rnd(1,2.2)*k,s[2]+Math.sin(a)*L];
        wood(s,e,0.17*k*(big?1.3:1),bark);
        leaf([e[0],e[1]+0.4*k,e[2]],rnd(1.7,2.3)*kb,rnd(1.1,1.5)*kb,rnd(1.7,2.3)*kb,hsl(hue+rnd(-0.02,0.02),sat,lit+rnd(0,0.03))); }
      leaf([top[0],h+0.7*k,top[2]],2.6*kb,1.7*kb,2.6*kb,hsl(hue,sat,lit+0.04));
      const nx=1+Math.floor(Math.random()*2);
      for(let j=0;j<nx;j++){ const a=Math.random()*6.283; leaf([top[0]+Math.cos(a)*1.4*kb,h+rnd(1,1.8)*k,top[2]+Math.sin(a)*1.4*kb],rnd(1.2,1.7)*kb,rnd(0.9,1.2)*kb,rnd(1.2,1.7)*kb,hsl(hue+rnd(-0.02,0.02),sat,lit+0.06)); }
      t.cx=top[0]; t.cz=top[2]; t.cy=h+0.6*k; t.rx=(big?6:4.5)*k; t.ry=2.4*kb; t.perch=[top[0],h+0.7*k+1.7*kb*0.85,top[2]]; t.tr=r+0.05;
    }
    return t;
  }
  for(let i=0;i<REG.trees;i++){
    let x,z,r; do{ r=Math.sqrt(Math.random())*WORLD; const a=Math.random()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }while(r<10||(r>110&&Math.random()<0.7)||pondAt(x,z,1.3));
    trees.push(make({x,z,sav:r>REG.savFrom}));
  }
  PONDS.forEach(p=>{ const n=REG.palms[0]+Math.floor(Math.random()*(REG.palms[1]-REG.palms[0]+1)); for(let j=0;j<n;j++){ const a=Math.random()*6.283, d=p.r*rnd(1.12,1.45); trees.push(make({x:p.x+Math.cos(a)*d,z:p.z+Math.sin(a)*d,palm:true})); } });
  const nW={}, nL={}; trees.forEach(t=>{ const k=tileOf(t.x,t.z); t.parts.forEach(p=>{ const N=p.leaf?nL:nW; p.k=k; p.i=N[k]=(N[k]||0); N[k]++; }); });
  const wg=new THREE.CylinderGeometry(0.7,1,1,7,1); wg.translate(0,0.5,0);
  const wm=new THREE.MeshLambertMaterial({color:0xffffff});
  leafGeoHi=blobGeo(1); leafGeoLo=blobGeo(0);
  const lm=new THREE.MeshLambertMaterial({color:0xffffff});
  lm.onBeforeCompile=sh=>{   // Laub wiegt sich im Wind
    sh.uniforms.uTime=leafTime;
    sh.uniforms.uWind=windU;
    sh.vertexShader='uniform float uTime; uniform vec2 uWind;\n'+sh.vertexShader.replace('#include <project_vertex>',
      'vec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp=instanceMatrix*wp;\n#endif\n wp=modelMatrix*wp;\n'+
      ' float sw=sin(uTime*1.3+wp.x*0.21+wp.z*0.17)*0.16+sin(uTime*2.7+wp.x*0.7+wp.y*0.5)*0.05;\n wp.xz+=uWind*(sw+0.05);\n'+
      ' vec4 mvPosition=viewMatrix*wp;\n gl_Position=projectionMatrix*mvPosition;');
  };
  const WM={}, LM={};
  for(const k in nW){ const m=WM[k]=new THREE.InstancedMesh(wg,wm,nW[k]); woodMeshes.push(m); registerTile(m,+k,84); }
  for(const k in nL){ const m=LM[k]=new THREE.InstancedMesh(leafGeoHi,lm,nL[k]); leafMeshes.push(m); registerTile(m,+k,84); }
  const c=new THREE.Color();
  trees.forEach((t,i)=>{ t.parts.forEach(p=>{ p.mesh=(p.leaf?LM:WM)[p.k]; p.mesh.setColorAt(p.i,c.setHex(p.c)); }); setTree(i); addCol(t.x,t.z,t.tr+0.1); });
  woodMeshes.concat(leafMeshes).forEach(m=>{ m.castShadow=true; m.receiveShadow=true; scene.add(m); });
})();
function updateTrees(dt){
  // Nur Bäume ausblenden, deren Krone wirklich auf der Sichtlinie Kamera -> Leopard liegt (3D-Test)
  const cx=camera.position.x, cy=camera.position.y, cz=camera.position.z;
  const sx=P.x-cx, sy=(P.camY+pScale()*0.6)-cy, sz=P.z-cz, len2=sx*sx+sy*sy+sz*sz||1; let ch=false;
  for(let i=0;i<trees.length;i++){
    const t=trees[i], kx=t.x+t.cx, ky=t.y+t.cy, kz=t.z+t.cz;
    let u=((kx-cx)*sx+(ky-cy)*sy+(kz-cz)*sz)/len2; u=Math.max(0,Math.min(1,u));
    const dx=(kx-(cx+sx*u))/t.rx, dy=(ky-(cy+sy*u))/t.ry, dz=(kz-(cz+sz*u))/t.rx;
    const target=(i!==P.tree&&dx*dx+dy*dy+dz*dz<1)?0.001:1;
    if(t.f!==target){ const d=target-t.f, stp=dt*5; t.f=Math.abs(d)<=stp?target:t.f+Math.sign(d)*stp; setTree(i); ch=true; }
  }
  if(dirtyTree.size){ dirtyTree.forEach(m=>{ m.instanceMatrix.needsUpdate=true; }); dirtyTree.clear(); }
}

/* Büsche, Felsen, Stämme, Blumen */
(function(){
  const mat=new THREE.MeshLambertMaterial({color:0xffffff});
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), e=new THREE.Euler(), c=new THREE.Color();
  function scatter(n,geo,fn,shadow){
    const by={};
    for(let i=0;i<n;i++){ const o=fn(i), k=tileOf(o.x,o.z); (by[k]=by[k]||[]).push(o); }
    for(const k in by){ const L=by[k], mesh=new THREE.InstancedMesh(geo,mat,L.length);
      L.forEach((o,i)=>{ e.set(o.rx||0,o.ry||0,o.rz||0); q.setFromEuler(e); m.compose(v.set(o.x,o.y,o.z),q,s.set(o.sx,o.sy,o.sz)); mesh.setMatrixAt(i,m); mesh.setColorAt(i,c.setHSL(o.h,o.s,o.l)); });
      mesh.castShadow=!!shadow; mesh.receiveShadow=true; scene.add(mesh); registerTile(mesh,+k,78); }
  }
  function spot(rmin,rmax){ let x,z,t=0; do{ const r=Math.sqrt(rnd(rmin*rmin,rmax*rmax)), a=Math.random()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }while(pondAt(x,z,1.05)&&++t<20); return {x,z,r:Math.hypot(x,z)}; }
  scatter(320,new THREE.IcosahedronGeometry(1,0),()=>{ const p=spot(9,WORLD), sy=rnd(0.5,0.95), sav=p.r>115;
    return {x:p.x,z:p.z,y:H(p.x,p.z)+sy*0.45,sx:rnd(0.8,1.7),sy,sz:rnd(0.8,1.7),ry:Math.random()*6,h:sav?rnd(0.17,0.24):rnd(0.28,0.36),s:rnd(0.35,0.5),l:sav?rnd(0.33,0.42):rnd(0.24,0.34)}; },true);
  scatter(170,new THREE.DodecahedronGeometry(1,0),()=>{ const p=spot(12,WORLD), sy=rnd(0.3,1.2), sx=rnd(0.4,1.8), sz=rnd(0.4,1.8);
    if(sy>0.45&&sx+sz>1.4) addCol(p.x,p.z,(sx+sz)*0.4,true);   // kleine Steine bleiben begehbar
    return {x:p.x,z:p.z,y:H(p.x,p.z)+sy*0.25,sx,sy,sz,ry:Math.random()*6,h:rnd(0.07,0.12),s:rnd(0.04,0.12),l:rnd(0.42,0.6)}; },true);
  scatter(34,new THREE.CylinderGeometry(0.34,0.4,1,7),()=>{ const p=spot(15,170), len=rnd(2.5,5.5), ry=Math.random()*6, n=Math.ceil(len/0.7);
    for(let j=0;j<=n;j++){ const u=(j/n-0.5)*len; addCol(p.x+Math.cos(ry)*u,p.z-Math.sin(ry)*u,0.42,true); }
    return {x:p.x,z:p.z,y:H(p.x,p.z)+0.28,sx:rnd(0.8,1.3),sy:len,sz:rnd(0.8,1.3),rz:Math.PI/2,ry,h:rnd(0.06,0.09),s:rnd(0.3,0.45),l:rnd(0.2,0.3)}; },true);
  // Blumen in kleinen Gruppen, vor allem im grünen Zentrum
  const fl=[[0.14,0.9,0.6],[0.92,0.7,0.68],[0.0,0.0,0.95],[0.06,0.9,0.58],[0.75,0.5,0.7]]; let cl=null, cc=null;
  scatter(1100,new THREE.OctahedronGeometry(0.13,0),i=>{ if(i%14===0){ cl=spot(8,150); cc=fl[Math.floor(Math.random()*fl.length)]; }
    const x=cl.x+rnd(-2.5,2.5), z=cl.z+rnd(-2.5,2.5), k=rnd(0.7,1.4);
    return {x,z,y:H(x,z)+rnd(0.22,0.4),sx:k,sy:k*0.7,sz:k,ry:Math.random()*6,h:cc[0],s:cc[1],l:cc[2]}; },false);
})();

/* Bodengras: Büschel folgen dem Spieler (Kachel-Wiederholung im Shader), wiegen sich im Wind */
(function(){
  const S=80, B=5, pos=new Float32Array(B*9);
  for(let b=0;b<B;b++){ const bx=rnd(-0.28,0.28), bz=rnd(-0.28,0.28), a=Math.random()*3.14, w=0.05, h=rnd(0.35,0.72), o=b*9;
    pos[o]=bx-Math.cos(a)*w; pos[o+1]=0; pos[o+2]=bz-Math.sin(a)*w;
    pos[o+3]=bx+Math.cos(a)*w; pos[o+4]=0; pos[o+5]=bz+Math.sin(a)*w;
    pos[o+6]=bx+rnd(-0.14,0.14); pos[o+7]=h; pos[o+8]=bz+rnd(-0.14,0.14); }
  const off=new Float32Array(GRASS_N*3), sc=new Float32Array(GRASS_N);
  for(let i=0;i<GRASS_N;i++){ off[i*3]=Math.random(); off[i*3+1]=Math.random(); off[i*3+2]=Math.random(); sc[i]=rnd(0.7,1.5); }
  G.grassGeo=new THREE.InstancedBufferGeometry();
  G.grassGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  G.grassGeo.setAttribute('offset',new THREE.InstancedBufferAttribute(off,3));
  G.grassGeo.setAttribute('aScale',new THREE.InstancedBufferAttribute(sc,1));
  G.grassGeo.instanceCount=GRASS_N;
  G.grassMat=new THREE.ShaderMaterial({
    side:THREE.DoubleSide, fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uP:{value:new THREE.Vector2()},uTime:{value:0},uS:{value:S}}]),
    vertexShader:'uniform vec2 uWind; attribute vec3 offset; attribute float aScale; uniform vec2 uP; uniform float uTime; uniform float uS; varying float vH; varying vec3 vCol;\n#include <fog_pars_vertex>\n'+GLSL_H+
      'void main(){\n  vec2 o=offset.xz*uS; vec2 w=o+uS*floor((uP-o)/uS+0.5);\n  float fade=1.0-smoothstep(uS*0.34,uS*0.47,distance(w,uP));\n  fade*=1.0-smoothstep(236.0,243.0,length(w));\n'+GLSL_PONDMASK+
      '  float a=offset.y*6.2832; float c=cos(a); float s=sin(a);\n  vec3 p=position; p.xz=vec2(c*p.x-s*p.z,s*p.x+c*p.z); p*=aScale*fade;\n'+
      '  float sway=sin(uTime*1.7+w.x*0.35+w.y*0.27)*0.14+sin(uTime*3.1+w.x*0.9-w.y*0.6)*0.05;\n  p.xz+=uWind*(sway+0.08)*p.y*1.3;\n'+
      '  float zone=clamp((length(w)-60.0)/130.0,0.0,1.0);\n  vCol=mix(vec3(0.31,0.56,0.23),vec3(0.80,0.71,0.40),zone)*(0.82+0.36*offset.y);\n  vH=position.y/0.7;\n'+
      '  vec4 mvPosition=viewMatrix*vec4(w.x+p.x,Hh(w)+p.y,w.y+p.z,1.0);\n  gl_Position=projectionMatrix*mvPosition;\n  #include <fog_vertex>\n}',
    fragmentShader:'uniform vec3 uLight; varying float vH; varying vec3 vCol;\n#include <fog_pars_fragment>\nvoid main(){\n  gl_FragColor=vec4(mix(vCol*0.5,vCol*1.08,vH)*uLight,1.0);\n  #include <fog_fragment>\n}'
  });
  G.grassMat.uniforms.uLight=grassLight; G.grassMat.uniforms.uWind=windU;
  const mesh=new THREE.Mesh(G.grassGeo,G.grassMat); mesh.frustumCulled=false; scene.add(mesh);
})();

/* Hohes Gras (Verstecke), auch als Schilf an den Wasserlöchern */
const patches=[]; let tallGeo=null, tallMat=null, TALL_N=0;
(function(){
  for(let i=0;i<REG.patches;i++){
    let x,z,t=0; do{ const r=(i<45?rnd(8,90):rnd(60,WORLD-10)), a=Math.random()*6.283; x=Math.cos(a)*r; z=Math.sin(a)*r; }while(pondAt(x,z,1.5)&&++t<20);
    patches.push({x,z,r:rnd(4,8.5)});
  }
  patches.push({x:7,z:5,r:6});
  PONDS.forEach(p=>{ for(let i=0;i<3;i++){ const a=Math.random()*6.283, d=p.r*1.2; patches.push({x:p.x+Math.cos(a)*d,z:p.z+Math.sin(a)*d,r:rnd(3.5,5)}); } });
  // Flache Halme statt Kegel: Büschel aus 5 Halmen, im Shader mit Wind und Ausweichen vor dem Leoparden
  const B=5, pos=new Float32Array(B*27);
  for(let b=0;b<B;b++){
    const bx=rnd(-0.32,0.32), bz=rnd(-0.32,0.32), a=Math.random()*3.14, ca=Math.cos(a), sa=Math.sin(a), h=rnd(1.15,1.9), lx=rnd(-0.3,0.3), lz=rnd(-0.3,0.3), w0=0.075, w1=0.05, hm=h*0.55;
    const L0=[bx-ca*w0,0,bz-sa*w0], R0=[bx+ca*w0,0,bz+sa*w0], L1=[bx+lx*0.3-ca*w1,hm,bz+lz*0.3-sa*w1], R1=[bx+lx*0.3+ca*w1,hm,bz+lz*0.3+sa*w1], T=[bx+lx,h,bz+lz];
    [L0,R0,R1, L0,R1,L1, L1,R1,T].forEach((v,i)=>pos.set(v,b*27+i*3));
  }
  const list=[];
  patches.forEach(p=>{ const n=Math.floor(p.r*p.r*4.2); for(let i=0;i<n;i++){
    const rr=Math.sqrt(Math.random())*p.r, a=Math.random()*6.283, x=p.x+Math.cos(a)*rr, z=p.z+Math.sin(a)*rr;
    if(pondAt(x,z,0.8)) continue;
    list.push([x,H(x,z),z,Math.random()*6.283,rnd(0.75,1.2),Math.random()]);
  }});
  for(let i=list.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)), t=list[i]; list[i]=list[j]; list[j]=t; }   // gemischt, damit "niedrig" gleichmäßig ausdünnt
  TALL_N=list.length; tallGeo=[];
  const posAttr=new THREE.BufferAttribute(pos,3), byT={};
  list.forEach(o=>{ const k=tileOf(o[0],o[2]); (byT[k]=byT[k]||[]).push(o); });
  for(const k in byT){ const L=byT[k], n=L.length, iPos=new Float32Array(n*3), iRS=new Float32Array(n*2), iHue=new Float32Array(n);
    L.forEach((o,i)=>{ iPos[i*3]=o[0]; iPos[i*3+1]=o[1]; iPos[i*3+2]=o[2]; iRS[i*2]=o[3]; iRS[i*2+1]=o[4]; iHue[i]=o[5]; });
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',posAttr); g.setAttribute('iPos',new THREE.InstancedBufferAttribute(iPos,3));
    g.setAttribute('iRS',new THREE.InstancedBufferAttribute(iRS,2)); g.setAttribute('iHue',new THREE.InstancedBufferAttribute(iHue,1));
    g.instanceCount=n; tallGeo.push({g,n,k:+k}); }
  tallMat=new THREE.ShaderMaterial({
    side:THREE.DoubleSide, fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uP:{value:new THREE.Vector2()},uR:{value:1.5},uTime:{value:0}}]),
    vertexShader:'uniform vec2 uWind; attribute vec3 iPos; attribute vec2 iRS; attribute float iHue; uniform vec2 uP; uniform float uR; uniform float uTime; varying float vH; varying vec3 vCol;\n#include <fog_pars_vertex>\n'+
      'void main(){\n  float c=cos(iRS.x); float s=sin(iRS.x);\n  vec3 p=position; p.xz=vec2(c*p.x-s*p.z,s*p.x+c*p.z); p.y*=iRS.y;\n'+
      '  float hh=clamp(position.y/1.9,0.0,1.0); float k=hh*hh;\n  vec2 w=iPos.xz;\n'+
      '  float sway=sin(uTime*1.5+w.x*0.4+w.y*0.3)*0.26+sin(uTime*2.7+w.x*1.1-w.y*0.8)*0.08;\n  p.xz+=uWind*(sway+0.15)*k;\n'+
      '  vec2 d=w-uP; float dist=length(d); float push=1.0-smoothstep(0.2,uR,dist);\n  p.xz+=(d/max(dist,0.001))*push*k*1.3; p.y-=push*k*0.55;\n'+
      '  vCol=mix(vec3(0.27,0.50,0.16),vec3(0.50,0.62,0.22),iHue);\n  vH=hh;\n'+
      '  vec4 mvPosition=viewMatrix*vec4(w.x+p.x,iPos.y+p.y,w.y+p.z,1.0);\n  gl_Position=projectionMatrix*mvPosition;\n  #include <fog_vertex>\n}',
    fragmentShader:'uniform vec3 uLight; varying float vH; varying vec3 vCol;\n#include <fog_pars_fragment>\nvoid main(){\n  vec3 col=mix(vCol*0.42,vCol,smoothstep(0.0,0.6,vH));\n  col=mix(col,vec3(0.86,0.82,0.46),smoothstep(0.7,1.0,vH)*0.55);\n  gl_FragColor=vec4(col*uLight,1.0);\n  #include <fog_fragment>\n}'
  });
  tallMat.uniforms.uLight=grassLight; tallMat.uniforms.uWind=windU;
  tallGeo.forEach(t=>{ const mesh=new THREE.Mesh(t.g,tallMat); scene.add(mesh); registerTile(mesh,t.k,76); });
})();
function updateEnv(dt,now){
  sun.position.set(P.x+SUN_OFF.x,P.y+SUN_OFF.y,P.z+SUN_OFF.z); sun.target.position.set(P.x,P.y,P.z);
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  const t=now/1000; leafTime.value=t;
  G.windT-=dt; if(G.windT<=0){ G.windTarget=G.windAng+rnd(-1.3,1.3); G.windT=rnd(60,150); }
  G.windAng+=(G.windTarget-G.windAng)*Math.min(1,dt*0.05); windU.value.set(Math.sin(G.windAng),Math.cos(G.windAng));
  G.grassMat.uniforms.uP.value.set(P.x,P.z); G.grassMat.uniforms.uTime.value=t;
  tallMat.uniforms.uP.value.set(P.x,P.z); tallMat.uniforms.uTime.value=t; tallMat.uniforms.uR.value=P.tree!=null?0.01:1.1+pScale()*1.1;
  for(let i=0;i<clouds.length;i++){ const c=clouds[i]; c.position.x+=windU.value.x*c.userData.v*dt; c.position.z+=windU.value.y*c.userData.v*dt; if(c.position.x>500) c.position.x=-500; if(c.position.x<-500) c.position.x=500; if(c.position.z>500) c.position.z=-500; if(c.position.z<-500) c.position.z=500; }
  for(let i=0;i<waters.length;i++){ const w=waters[i]; w.position.y=w.userData.y+Math.sin(t*0.8+i)*0.03; }
}
function inGrass(x,z){ for(let i=0;i<patches.length;i++){ const p=patches[i], dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<p.r*p.r) return true; } return false; }

/* Bau (Startpunkt) */
(function(){
  const mat=new THREE.MeshLambertMaterial({color:0x8a8a80});
  [[-3,0,-3,2.2],[-0.5,0,-4.2,2.8],[2.2,0,-3.2,2]].forEach(r=>{ const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r[3],0),mat); m.position.set(r[0],H(r[0],r[2])+r[3]*0.5,r[2]); m.rotation.set(Math.random(),Math.random(),0); m.castShadow=true; m.receiveShadow=true; scene.add(m); addCol(r[0],r[2],r[3]*0.9); });
})();

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

/* ---------- Tierarten ---------- */
// ring: Abstand vom Zentrum. hunt: jagt Spieler unter dieser Stufe. fight: wehrt sich.
const animals=[];
function placeAnimal(a){
  const sp=a.sp; let x,z,tries=0;
  do{ const r=rnd(sp.ring[0],sp.ring[1]), an=Math.random()*6.283; x=Math.cos(an)*r; z=Math.sin(an)*r; tries++; }
  while(tries<20 && Math.hypot(x-P.x,z-P.z)<45);
  if(a.herd){ for(const m of a.herd){ if(m!==a&&!m.dead&&Math.hypot(m.x-P.x,m.z-P.z)>45){ x=m.x+rnd(-6,6); z=m.z+rnd(-6,6); break; } } }
  if(sp.croc&&PONDS.length){ a.pond=sp.boss?PONDS.reduce((m,q)=>q.r>m.r?q:m):PONDS[Math.floor(Math.random()*PONDS.length)]; const an=Math.random()*6.283, rr=Math.random()*a.pond.r*0.5; x=a.pond.x+Math.cos(an)*rr; z=a.pond.z+Math.sin(an)*rr; }
  a.carc=null; a.g.rotation.z=0;
  a.x=x; a.z=z; a.hp=sp.hp; a.state='wander'; a.tx=x; a.tz=z; a.timer=0; a.aggro=0; a.lost=0; a.fleeT=0; a.cd=0; a.stun=0; a.sus=0; a.near=false; a.dead=false; a.ph=Math.random()*6; if(sp.croc) a.state='lurk';
  a.g.visible=true;
}
// Blick beim Start und beim Aufwachen im Bau: seitlich an den Felsen vorbei ins offene Gelände
const START_YAW=-1.9, START_ROT=1.24;
const P={tree:null,climbT:0,safe:false,dropY:0,dropRate:20,upNow:0,camY:0,leap:false,x:2,z:2,y:0,rot:START_ROT,hp:1,st:1,pounce:0,pcd:0,rcd:0,sneak:false,hurtT:0,combatT:0,hidden:1,g:null,moving:0,walkT:0};
SPECIES.forEach(sp=>{ const cnt=(REG.counts&&REG.counts[sp.id]!==undefined)?REG.counts[sp.id]:sp.count; for(let i=0;i<cnt;i++){ const fur=makeFur(), g=buildQuad(sp.m,fur); g.scale.setScalar(sp.size); scene.add(g); const a={sp,g,fur,rad:sp.size*0.8+0.25,uid:animals.length}; placeAnimal(a); animals.push(a); } });
['capy','deer','anti'].forEach(id=>{ const L=animals.filter(a=>a.sp.id===id);
  for(let i=0;i<L.length;){ const n=Math.min(L.length-i,3+Math.floor(Math.random()*2)), grp=L.slice(i,i+n);
    grp.forEach((a,j)=>{ a.herd=grp; if(j>0){ a.x=grp[0].x+rnd(-6,6); a.z=grp[0].z+rnd(-6,6); a.tx=a.x; a.tz=a.z; } }); i+=n; } });

/* Spieler */
const JAG={col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.44,ears:0.15,tail:1.1,tailTip:0x2a1c10,spots:1};
function dropModel(g){ if(!g) return; scene.remove(g); const i=blobs.indexOf(g.userData.blob); if(i>=0) blobs.splice(i,1); }
function rebuildPlayer(){ dropModel(P.g); P.g=buildQuad(JAG,S.fur||null); P.g.userData.blob.visible=!QUAL[quality].sh; scene.add(P.g); }
rebuildPlayer();
scene.add(P.g); P.hp=maxHp(); P.st=maxSt();

/* Partikel */
const puffs=[]; const puffGeo=new THREE.BoxGeometry(0.25,0.25,0.25);
function puff(x,y,z,c,n,s){ for(let i=0;i<n;i++){ const m=new THREE.Mesh(puffGeo,new THREE.MeshBasicMaterial({color:c,transparent:true})); m.position.set(x,y,z); m.scale.setScalar(s*rnd(0.6,1.4)); scene.add(m); puffs.push({m,vx:rnd(-3,3),vy:rnd(2,6),vz:rnd(-3,3),t:0.7}); } }

/* ---------- Eingabe ---------- */
const keys={}; G.camYaw=START_YAW; G.camPitch=0.42; G.camZoom=1; G.paused=true; G.started=false;
G.joyX=0; G.joyY=0; G.tSprint=false;
window.addEventListener('keydown',e=>{
  if(e.code==='Tab'){ e.preventDefault(); if(G.started) toggleSkills(); return; }
  if(e.code==='Escape'){ if(!G.started) return; if(bookOpen()){ closeBook(); return; } if(settingsOpen()){ closeSettings(); return; } if(regionsOpen()){ closeRegions(); return; } if($('skills').style.display!=='none'){ toggleSkills(); return; } if(menuOpen()&&performance.now()-G.menuT<350) return; toggleMenu(); return; }
  if(!G.started) return;
  if(e.code==='KeyK'){ toggleSkills(); return; }
  if(G.paused) return;
  keys[e.code]=true;
  if(e.code==='Space'){ e.preventDefault(); doPounce(); }
  if(e.code==='KeyC'){ P.sneak=!P.sneak; }
  if(e.code==='KeyR'){ doRoar(); }
  if(e.code==='KeyE'){ doClimb(); }
  if(e.code==='KeyF'){ doContext(); }
});
window.addEventListener('keyup',e=>{ keys[e.code]=false; });
window.addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; });
G.drag=false; let dragMoved=0, lx=0, ly=0;
canvas.addEventListener('mousedown',e=>{ if(G.paused||touchUI()) return; G.drag=true; dragMoved=0; lx=e.clientX; ly=e.clientY;
  if(document.pointerLockElement===canvas){ if(e.button===0) doPounce(); }
  else { try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(err){} } });
window.addEventListener('mouseup',e=>{ if(G.drag&&!touchUI()&&dragMoved<6&&e.button===0&&!G.paused&&document.pointerLockElement!==canvas&&e.target===canvas) doPounce(); G.drag=false; });
window.addEventListener('mousemove',e=>{
  if(G.paused) return;
  if(document.pointerLockElement===canvas){ G.camYaw-=e.movementX*0.0028; G.camPitch=Math.max(0.08,Math.min(1.25,G.camPitch+e.movementY*0.0022)); }
  else if(G.drag){ const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY; dragMoved+=Math.abs(dx)+Math.abs(dy); G.camYaw-=dx*0.005; G.camPitch=Math.max(0.08,Math.min(1.25,G.camPitch+dy*0.004)); }
});
window.addEventListener('wheel',e=>{ if(G.paused) return; e.preventDefault(); G.camZoom=Math.max(0.45,Math.min(2.6,G.camZoom*(e.deltaY>0?1.12:1/1.12))); },{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

/* Touch */
const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
// Ein Gerät mit Maus (PC, Laptop mit Touchscreen) startet mit Tastatur-Anzeige; danach zählt die zuletzt benutzte Eingabe
const finePointer=!!(window.matchMedia&&window.matchMedia('(hover: hover) and (pointer: fine)').matches);
let inputMode=(isTouch&&!finePointer)?'touch':'kb', tapLearned=0;
try{ tapLearned=+localStorage.getItem('jaguar-taps')||0; }catch(e){}
const touchUI=()=>inputMode==='touch';
function setInputMode(m){
  inputMode=m; const t=m==='touch';
  $('touch').style.display=t?'block':'none'; $('cds').style.display=t?'none':'';
  document.querySelectorAll('#cds .kh').forEach((el,i)=>{ el.textContent=(m==='pad'?['Ⓐ','LB','Ⓨ']:['Leertaste','R','E'])[i]; });
  renderKeys(); if(typeof updateUI==='function'&&S) updateUI();
}
window.addEventListener('keydown',()=>{ if(!padSynth&&inputMode!=='kb') setInputMode('kb'); },true);
window.addEventListener('pointerdown',e=>{ const m=e.pointerType==='touch'?'touch':e.pointerType==='mouse'?'kb':null; if(m&&m!==inputMode) setInputMode(m); },true);
window.addEventListener('touchstart',()=>{ if(inputMode!=='touch') setInputMode('touch'); },{capture:true,passive:true});
if(isTouch){
  // Linke Bildschirmhälfte = Bewegung: der Joystick entsteht dort, wo der Daumen aufsetzt. Rechte Hälfte = Kamera.
  let joyId=null, camId=null, cx=0, cy=0, jx0=0, jy0=0, jr=50, tapT=0, tapX=0, tapY=0;
  const joy=$('joy'), knob=$('knob');
  canvas.addEventListener('touchstart',e=>{ e.preventDefault(); for(const t of e.changedTouches){
    if(t.clientX<window.innerWidth/2&&joyId===null){
      joyId=t.identifier; jx0=t.clientX; jy0=t.clientY; const w=joy.offsetWidth; jr=w*0.42;
      joy.style.left=(jx0-w/2)+'px'; joy.style.top=(jy0-w/2)+'px'; joy.style.bottom='auto'; joy.classList.add('act');
    } else if(camId===null){
      camId=t.identifier; cx=t.clientX; cy=t.clientY;
      // Doppeltippen rechts = Sprungangriff
      const now=performance.now();
      if(now-tapT<330&&Math.hypot(cx-tapX,cy-tapY)<70){ tapT=0;
        if(!G.paused){ const rp=document.createElement('div'); rp.className='ripple'; rp.style.left=cx+'px'; rp.style.top=cy+'px'; document.body.appendChild(rp); setTimeout(()=>rp.remove(),500);
          doPounce(); tapLearned++; try{ localStorage.setItem('jaguar-taps',String(tapLearned)); }catch(e){} } }
      else { tapT=now; tapX=cx; tapY=cy; }
    }
  } },{passive:false});
  window.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){
    if(t.identifier===joyId){ let dx=(t.clientX-jx0)/jr, dy=(t.clientY-jy0)/jr; const l=Math.hypot(dx,dy); if(l>1){dx/=l;dy/=l;} G.joyX=dx; G.joyY=dy; knob.style.transform='translate('+dx*jr*0.8+'px,'+dy*jr*0.8+'px)'; }
    else if(t.identifier===camId){ G.camYaw-=(t.clientX-cx)*0.006; G.camPitch=Math.max(0.08,Math.min(1.25,G.camPitch+(t.clientY-cy)*0.005)); cx=t.clientX; cy=t.clientY; }
  } },{passive:false});
  const end=e=>{ for(const t of e.changedTouches){
    if(t.identifier===joyId){ joyId=null; G.joyX=G.joyY=0; knob.style.transform=''; joy.style.left=''; joy.style.top=''; joy.style.bottom=''; joy.classList.remove('act'); }
    if(t.identifier===camId) camId=null; } };
  window.addEventListener('touchend',end); window.addEventListener('touchcancel',end);
  const tap=(id,fn)=>$(id).addEventListener('touchstart',e=>{ e.preventDefault(); e.stopPropagation(); if(!G.paused) fn(); },{passive:false});
  tap('tbE',()=>doClimb()); tap('tbF',()=>doContext()); tap('tbR',()=>doRoar());
  tap('tbS',()=>{ G.tSprint=!G.tSprint; $('tbS').classList.toggle('on',G.tSprint); });
  tap('tbC',()=>{ P.sneak=!P.sneak; });
}

/* ---------- UI ---------- */
G.toastT=0;
// Meldungen bleiben je nach Länge 3 bis 10 Sekunden stehen (etwa Lesetempo). Kommt eine neue, wird die alte nach kurzer Zeit abgelöst statt sofort überschrieben.
const toastQ=[]; G.toastShown=0;
function showToast(t,c){ const el=$('toast'); el.textContent=t; el.style.color=c||'#fff'; el.style.opacity=1; G.toastT=Math.max(3,Math.min(10,1.2+t.length/14)); G.toastShown=0; }
function toast(t,c){
  if(G.toastT>0){ if($('toast').textContent===t) return; if(!toastQ.some(q=>q[0]===t)) toastQ.push([t,c]); if(toastQ.length>4) toastQ.shift(); G.toastT=Math.min(G.toastT,Math.max(0.4,2.2-G.toastShown)); return; }
  showToast(t,c);
}
const v3=new THREE.Vector3();
function floatText(txt,x,y,z,c){
  v3.set(x,y,z).project(camera); if(v3.z>1) return;
  const el=document.createElement('div'); el.className='float'; el.textContent=txt; el.style.color=c||'#fff';
  el.style.left=((v3.x*0.5+0.5)*window.innerWidth-20)+'px'; el.style.top=((-v3.y*0.5+0.5)*window.innerHeight-20)+'px';
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.transform='translateY(-60px)'; el.style.opacity=0; });
  setTimeout(()=>el.remove(),1050);
}
/* Icons für Eigenschaften, Fähigkeiten und Erbanlagen: 24er-Raster, Strichzeichnung in der jeweiligen Farbe */
function renderSkills(){
  $('skPts').textContent=S.pts+' Punkt'+(S.pts===1?'':'e');
  const row=(it,val,max,cost,grp,cap)=>{ const act=Math.min(val,cap), rest=val-act;
    return '<div class="skill wi">'+ico(it.k,ICOL[grp])+'<div><b>'+it.n+'</b><small>'+it.d+'</small></div><span class="pips">'+'●'.repeat(act)+'<span style="color:#7fb4d8">'+'●'.repeat(rest)+'</span><span style="opacity:.25">'+'●'.repeat(max-val)+'</span></span><button data-g="'+grp+'" data-k="'+it.k+'" '+((S.pts<cost||val>=max||val>=cap)?'disabled':'')+'>+</button></div>'; };
  const cap=Math.min(10,attrCap());
  $('skA').innerHTML=ATTR.map(a=>row(a,S.a[a.k],10,1,'a',cap)).join('')+'<div style="font-size:11.5px;color:var(--mut);padding-top:6px">Wirksam sind höchstens '+cap+' Ränge je Eigenschaft (Stufe + 2).</div>';
  $('skB').innerHTML=ABIL.map(a=>row(a,S.b[a.k],3,2,'b',3)).join('');
  $('skT').innerHTML=S.traits.length?S.traits.map(t=>'<div class="skill wt">'+ico(t,ICOL.t)+'<div><b>'+TRAITS[t][0]+'</b><small>'+TRAITS[t][1]+'</small></div></div>').join(''):'<div style="font-size:12px;color:var(--mut);padding:6px 0">Noch keine. Jedes Junge bekommt bei der Geburt eine Erbanlage und gibt sie an die nächste Generation weiter.</div>';
  if((S.gen||1)>1) $('skT').insertAdjacentHTML('afterbegin','<div class="skill wt">'+ico('anc',ICOL.anc)+'<div><b>Ahnenkraft · Generation '+S.gen+'</b><small>+'+Math.round((ancF()-1)*100)+' % Leben, Ausdauer und Schaden, +'+Math.round((ancF()-1)*50)+' % Tempo</small></div></div>');
}
$('skills').addEventListener('click',e=>{ const b=e.target.closest('button[data-k]'); if(!b) return; const g=b.dataset.g,k=b.dataset.k,cost=g==='a'?1:2,max=g==='a'?10:3;
  if(S.pts>=cost&&S[g][k]<max&&(g!=='a'||S.a[k]<attrCap())){ S[g][k]++; S.pts-=cost; snd.click(); if(k==='vit') P.hp+=15; save(); renderSkills(); } });
function toggleSkills(){ if(sleeping||dead||$('win').style.display==='flex'||$('birth').style.display==='flex'||menuOpen()) return; const el=$('skills'); const open=el.style.display==='none'; if(open){ renderSkills(); el.style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); for(const k in keys) keys[k]=false; } else { el.style.display='none'; G.paused=false; } }
$('btnClose').onclick=toggleSkills;
/* Pausenmenü (Esc oder Menü-Knopf) */
G.menuT=0; let hadLock=false, restartArm=false;
function menuOpen(){ return $('menu').style.display==='flex'; }
function toggleMenu(){
  if(bookOpen()||settingsOpen()||regionsOpen()||sleeping||!G.started||dead||$('win').style.display==='flex'||$('birth').style.display==='flex'||$('skills').style.display!=='none') return;
  const el=$('menu');
  if(!menuOpen()){
    $('menuInfo').textContent='Gebiet: '+REG.n+' · Schwierigkeit: '+D().n+' · Uhrzeit '+clockStr()+(D().perma?' · ohne Nachwuchs endgültig':'');
    G.cubArm=false; $('btnMenuCub').style.display=S.cub?'block':'none'; $('btnMenuCub').textContent='Als Junges weiterspielen';
    el.style.display='flex'; G.paused=true; G.menuT=performance.now(); restartArm=false; $('btnRestart').textContent='Neustart (Fortschritt löschen)';
    for(const k in keys) keys[k]=false; G.drag=false; G.joyX=G.joyY=0; if(document.exitPointerLock) document.exitPointerLock();
  } else {
    el.style.display='none'; G.paused=false;
    if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
  }
}
let hudExp=false;
$('hud').addEventListener('click',e=>{ if(e.target.closest('#pts')) return; hudExp=!hudExp; $('hud').classList.toggle('exp',hudExp); $('hudTog').textContent=hudExp?'▴':'▾'; updateUI(); });
const XB={'Ⓐ':'#5fbf4a','Ⓑ':'#e0533d','Ⓧ':'#3f8fe0','Ⓨ':'#f2c230'};
const xb=t=>t.replace(/[ⒶⒷⓍⓎ]/g,c=>'<b style="color:'+XB[c]+';font-size:1.15em">'+c+'</b>');
function renderKeys(){ $('keysMode').textContent=padUI()?'Xbox-Controller':touchUI()?'Touch':'Tastatur und Maus';
  $('keysBox').innerHTML=(padUI()?[
  ['Linker Stick','Laufen'],['Rechter Stick','Kamera und Fadenkreuz drehen'],['RT oder linken Stick drücken','Sprinten (kostet Ausdauer)'],
  ['Ⓐ','Sprungangriff in Richtung Fadenkreuz'],['Ⓑ','Schleichen an/aus'],['Ⓧ','Aktion: paaren, füttern, fressen, schlafen'],['Ⓨ','Auf einen Baum klettern / herunter'],
  ['LB','Brüllen'],['Rechten Stick drücken','Kamera hinter den Leoparden'],['Steuerkreuz ↑ ↓','Zoomen'],['Menü-Taste ☰','Pause-Menü'],['Ansicht-Taste ⧉','Eigenschaften & Fähigkeiten'],
  ['In Menüs','Steuerkreuz wählt, Ⓐ bestätigt, Ⓑ zurück']
]:touchUI()?[
  ['Linke Bildschirmhälfte','Laufen – der Joystick entsteht, wo der Daumen aufsetzt'],
  ['Rechte Hälfte ziehen','Kamera und Fadenkreuz drehen'],
  ['Rechts doppeltippen','Sprungangriff in Richtung Fadenkreuz'],
  ['Sprint','Sprinten an/aus (kostet Ausdauer)'],['Schleichen','Schleichen an/aus'],
  ['Brüllen','Raubtiere verjagen (Fähigkeit)'],['Klettern','Auf einen Baum / herunter (Fähigkeit)'],
  ['Rosa Knopf','Paaren, füttern, fressen oder schlafen – erscheint nur, wenn es gerade möglich ist'],
  ['Goldene Punkte-Anzeige','Eigenschaften & Fähigkeiten'],['☰ Menü','Pause-Menü']
]:[
  ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>','Laufen'],['<kbd>Maus</kbd> / <kbd>←</kbd><kbd>→</kbd>','Kamera und Fadenkreuz drehen'],['<kbd>Mausrad</kbd>','Zoomen'],
  ['<kbd>Shift</kbd>','Sprinten (kostet Ausdauer)'],['<kbd>C</kbd>','Schleichen an/aus'],['<kbd>Leertaste</kbd> / <kbd>Klick</kbd>','Sprungangriff in Richtung Fadenkreuz'],
  ['<kbd>R</kbd>','Brüllen (Fähigkeit)'],['<kbd>E</kbd>','Auf einen Baum klettern / herunter (Fähigkeit)'],['<kbd>F</kbd>','Paaren / Junges füttern / fressen / Fleisch mitnehmen / schlafen'],
  ['<kbd>Tab</kbd> / <kbd>K</kbd>','Eigenschaften & Fähigkeiten'],['<kbd>Esc</kbd>','Pause-Menü']
]).map(r=>'<span>'+xb(r[0])+'</span><span>'+r[1]+'</span>').join(''); }
renderKeys();
$('keysMode').textContent='';
$('menuBtn').onclick=toggleMenu; $('btnResume').onclick=toggleMenu;
$('btnMenuSkills').onclick=()=>{ $('menu').style.display='none'; toggleSkills(); };
$('btnRestart').onclick=()=>{
  if(!restartArm){ restartArm=true; $('btnRestart').textContent='Wirklich? Stufe und Fähigkeiten gehen verloren'; return; }
  resetState(); save(); if(REG_ID!=='savanne'){ reloadWorld(true); return; }
  rebuildPlayer(); rebuildCub(); $('menu').style.display='none'; respawn(); animals.forEach(placeAnimal); G.raider=null; G.lastHit=null; G.lastHitT=0; updateUI();
  // zurück zum Startbildschirm, um die Schwierigkeit zu wählen
  G.started=false; G.paused=true; if(document.exitPointerLock) document.exitPointerLock();
  $('btnPlay').textContent='Spielen'; $('btnReset').style.display='none'; showDiff(); $('start').style.display='flex';
};
// Esc beendet im Browser zuerst die Mausfixierung; dann öffnet sich das Menü darüber
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas){ hadLock=true; return; }
  if(hadLock&&G.started&&!G.paused&&!menuOpen()){ hadLock=false; toggleMenu(); }
  hadLock=false;
}); $('pts').onclick=toggleSkills;
$('btnPlay').onclick=()=>{ try{ if(!localStorage.getItem('jaguar-windtip')){ localStorage.setItem('jaguar-windtip','1'); setTimeout(()=>toast('Achte auf den Wind (blauer Pfeil an der Spürkarte): Weht er von dir zu einem Tier, wittert es dich früher.','#96cdff'),8000); } }catch(e){} initAudio(); $('start').style.display='none'; $('diffRow').style.display='none'; save(); G.paused=false; G.started=true; if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } };
let resetArm=false;
function showDiff(){ $('diffRow').style.display='block'; document.querySelectorAll('.diffb').forEach(b=>b.classList.toggle('on',b.dataset.d===S.diff)); $('diffTxt').textContent=D().d; }
document.querySelectorAll('.diffb').forEach(b=>b.addEventListener('click',()=>{ S.diff=b.dataset.d; showDiff(); }));
$('btnReset').onclick=()=>{ if(!resetArm){ resetArm=true; $('btnReset').textContent='Wirklich? Fortschritt löschen'; return; } resetState(); save(); if(REG_ID!=='savanne'){ reloadWorld(true); return; } rebuildPlayer(); rebuildCub(); P.hp=maxHp(); P.st=maxSt(); $('btnReset').style.display='none'; $('btnPlay').textContent='Spielen'; showDiff(); };
if($('btnReset').style.display==='none') showDiff();
/* Gebiete wechseln (lädt die Seite mit der neuen Karte neu) */
function reloadWorld(showDiffAfter){
  save(); try{ if(showDiffAfter) sessionStorage.setItem('jaguar-showdiff','1'); }catch(e){}
  try{ location.reload(); }catch(e){ toast('Bitte lade die Seite neu, um das Gebiet zu wechseln.','#f2b84b'); }
}
let travelArm=null;
function renderRegions(){
  $('regList').innerHTML=Object.keys(REGIONS).map(id=>{ const r=REGIONS[id], open=!r.soon&&(S.gen||1)>=r.gen, here=id===REG_ID;
    const st=here?'<span style="color:#9be07f">Hier bist du</span>':r.soon?'<span style="color:var(--mut)">kommt bald · ab Generation '+r.gen+'</span>':open?'<span style="color:var(--gold)">offen</span>':'<span style="color:var(--mut)">ab Generation '+r.gen+'</span>';
    return '<div class="skill"><div><b>'+r.n+(beaten(id)?' ✔':'')+'</b><small>'+r.d+(r.boss?' Endgegner: '+r.boss+'.':'')+'</small><small>'+st+'</small></div><span></span>'+
      (open&&!here?'<button data-r="'+id+'">'+(travelArm===id?'Wirklich wandern?':'Hinwandern')+'</button>':'<span></span>')+'</div>'; }).join('');
}
$('regList').addEventListener('click',e=>{ const b=e.target.closest('button[data-r]'); if(!b) return; const id=b.dataset.r;
  if(travelArm!==id){ travelArm=id; renderRegions(); return; }
  S.region=id; reloadWorld(false); });
function openRegions(){ travelArm=null; renderRegions(); $('menu').style.display='none'; $('regions').style.display='flex'; }
function closeRegions(){ $('regions').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const regionsOpen=()=>$('regions').style.display==='flex';
$('btnRegions').onclick=openRegions; $('btnRegBack').onclick=closeRegions;
try{ if(sessionStorage.getItem('jaguar-showdiff')){ sessionStorage.removeItem('jaguar-showdiff'); $('btnPlay').textContent='Spielen'; $('btnReset').style.display='none'; showDiff(); } }catch(e){}


$('btnWin').onclick=()=>{ $('win').style.display='none'; G.paused=false; };

/* ---------- Aktionen ---------- */
function nearestTree(){
  let bi=-1, bd=1e9; for(let i=0;i<trees.length;i++){ const t=trees[i], d=Math.hypot(t.x-P.x,t.z-P.z); if(d<bd){ bd=d; bi=i; } }
  return bd<3.4+pScale()*0.8?bi:-1;
}
function leaveTree(rate){ P.dropY=P.upNow; P.dropRate=rate; P.tree=null; P.safe=false; P.upNow=0; }
function doClimb(){
  if(G.paused||P.pounce>0) return;
  if(P.tree!=null){ leaveTree(24); P.x+=Math.sin(P.rot)*1.6; P.z+=Math.cos(P.rot)*1.6; snd.step(0.25); return; }
  if(S.b.climb<1){ toast('Klettern ist noch nicht gelernt (Tab)','#b9b7a6'); return; }
  const i=nearestTree(); if(i<0){ toast('Kein Baum in Reichweite','#b9b7a6'); return; }
  const cost=45-5*(S.b.climb-1); if(P.st<cost){ noStamina(); return; } P.st-=cost;
  goalEvent('climb',1); P.tree=i; P.climbT=0; P.fromX=P.x; P.fromZ=P.z; P.sneak=false; P.dropY=0; snd.climb();
}
G.noStT=0;
function noStamina(){
  const r=$('stRing'); r.classList.remove('flash'); void r.getBoundingClientRect(); r.classList.add('flash');
  $('crossMsg').style.opacity=1; G.noStT=1.1; tone(140,0.12,'square',0.1,100);
}
function doPounce(){
  if(G.paused||P.pounce>0||P.pcd>0) return;
  if(P.tree!=null&&P.climbT<1) return;
  if(P.st<15){ noStamina(); return; }
  P.leap=false;
  if(P.tree!=null){ if(P.climbT<1) return; const h=P.upNow; P.leap=true; leaveTree(1); P.dropRate=h/(0.55+0.04*S.b.jmp); }
  P.st-=15; P.pounce=(P.leap?0.55:0.38)+0.04*S.b.jmp; P.pT=P.pounce; P.pcd=1.3-0.2*S.b.jmp; P.hit=false; snd.pounce();
  P.rot=Math.atan2(-Math.sin(G.camYaw),-Math.cos(G.camYaw));
}
function doRoar(){
  if(G.paused) return;
  if(S.b.roar<1){ toast('Brüllen ist noch nicht gelernt (Tab)','#b9b7a6'); return; }
  if(P.rcd>0) return;
  P.rcd=22-3*S.b.roar; const R=16+7*S.b.roar;
  puff(P.x,P.y+1,P.z,0xffffff,10,0.6); toast('ROAAAR!','#f2b84b'); snd.roar();
  animals.forEach(a=>{ if(a.dead) return; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d>R) return;
    if(a.sp.pred){ if(!a.sp.hunt||S.lvl+2*S.b.roar>=a.sp.hunt-3){ a.state='flee'; a.fleeT=0; a.aggro=0; a.scared=5; } }
    else if(!a.sp.boss&&!a.sp.friend){ a.stun=1.2+0.5*S.b.roar; } });
}
function gainXp(n){
  const lv0=S.lvl; S.xp+=n; let up=false;
  while(S.xp>=xpNeed(S.lvl)){ S.xp-=xpNeed(S.lvl); S.lvl++; S.pts+=2; up=true; }
  if(up){ P.hp=maxHp(); toast('Stufe '+S.lvl+'! Du wächst. +2 Punkte (Tab)','#f2b84b'); puff(P.x,P.y+1,P.z,0xf2b84b,14,0.7); snd.level();
    if(lv0<8&&S.lvl>=8&&!S.cub) setTimeout(()=>toast('Du bist ausgewachsen. Andere Leoparden streifen jetzt umher – du findest sie als rosa Punkte auf der Spürkarte.','#ff9ad0'),3200); }
  save();
}
let dead=false;
function hurtPlayer(d,a,force){
  if(dead||(P.safe&&!force)) return;
  if(!force) d*=D().dmg;
  snd.hurt();
  P.hp-=d; P.combatT=5; G.shakeA=Math.max(G.shakeA,Math.min(0.6,0.15+d/maxHp())); if(padUI()) rumble(Math.min(1,0.35+d/maxHp()),0.5,220); $('hurt').style.opacity=0.8; P.hurtT=0.25;
  floatText('-'+Math.round(d),P.x,P.camY+1.5*pScale(),P.z,'#ff7a5c');
  if(P.hp<=0){
    P.hp=0; G.heirPending=!!S.cub; G.lineageEnd=!S.cub&&(a.sp.id==='age'||D().perma); let lost=0; if(!G.heirPending&&!G.lineageEnd){ lost=Math.floor(S.xp*D().xpLoss); S.xp-=lost; } save();
    dead=true; G.paused=true; P.pounce=0; for(const k in keys) keys[k]=false; G.drag=false;
    if(document.exitPointerLock) document.exitPointerLock();
    P.g.rotation.z=Math.PI/2; P.g.position.y=P.y+0.25*pScale();
    snd.death();
    const fem=(a.sp.id==='hyena'||a.sp.id==='giant');
    G.lastCause=a.sp.id==='hunger'?'verhungert':a.sp.id==='age'?'an Altersschwäche gestorben':'von '+(DAT[a.sp.id]||'einem '+a.sp.n)+' getötet';
    const cause=a.sp.id==='hunger'?'Du bist verhungert.':a.sp.id==='age'?'Du bist an Altersschwäche gestorben.':'Ein'+(fem?'e ':' ')+a.sp.n+' hat dich erwischt.';
    $('deadTxt').textContent=cause+(lost>0?' Du verlierst '+lost+' Erfahrung.':'')+' Stufe, Eigenschaften und Fähigkeiten bleiben dir erhalten.';
    $('deadTip').textContent=a.sp.hunt&&S.lvl<a.sp.hunt
      ? 'Tipp: '+(a.sp.id==='jack'?'Schakale':a.sp.id==='hyena'?'Hyänen':'Löwen')+' jagen dich bis Stufe '+a.sp.hunt+'. Schleiche (C) ins hohe Gras, bis sie dich verlieren.'
      : 'Tipp: Dieses Tier wehrt sich. Greife aus dem Hinterhalt an und zieh dich zurück, wenn dein Leben knapp wird.';
    if(G.heirPending){
      $('deadTxt').textContent=cause+' Aber dein Junges lebt: Du spielst als dein Junges weiter (Stufe '+heirLevel()+'). Es erbt die Erbanlagen deiner Linie und 10 % deiner Punkte.';
      $('deadTip').textContent='Je mehr du es gefüttert hast, desto größer startet es.';
      $('btnRespawn').textContent='Als Junges weiterleben';
    } else $('btnRespawn').textContent='Im Bau neu erwachen';
    if(a.sp.id==='hunger'&&!G.heirPending) $('deadTip').textContent='Tipp: Erlegte Beute macht satt. Hast du ein Junges, wandert sie in den Vorrat – friss mit F daraus, wenn du hungrig bist.';
    if(G.lineageEnd){
      $('deadTxt').textContent=(a.sp.id==='age'?'Du bist an Altersschwäche gestorben und hast keinen Nachwuchs.':cause+' Auf „Schwer" gibt es ohne Nachwuchs kein Zurück.')+' Deine Blutlinie endet in Generation '+(S.gen||1)+'.';
      $('deadTip').textContent='Beim nächsten Mal: Ab Stufe 8 einen Partner suchen und rechtzeitig ein Junges großziehen.';
      $('btnRespawn').textContent='Neue Blutlinie beginnen';
    }
    $('hurt').style.opacity=0.55; $('dead').style.display='flex'; updateUI();
  }
}
function respawn(){
  let sx=2, sz=2;
  if(G.heirPending&&S.cub){
    sx=cub.x; sz=cub.z; becomeCub(false);
    toast('Generation '+S.gen+': Du bist jetzt dein Junges – mit den Erbanlagen deiner Linie und 10 % der Punkte.'+(S.p2?' Dein anderes Elterntier sorgt weiter für dich.':''),'#ff9ad0');
  }
  else if(G.lineageEnd){ recordAncestor(G.lastCause); archiveLine(); const df=S.diff; resetState(); S.diff=df; save(); if(REG_ID!=='savanne'){ reloadWorld(false); return; } rebuildPlayer(); rebuildCub(); animals.forEach(placeAnimal); G.raider=null; toast('Eine neue Blutlinie beginnt.','#f2b84b'); }
  else S.hunger=Math.max(S.hunger,70);
  G.heirPending=false; G.lineageEnd=false;
  P.tree=null; P.safe=false; P.dropY=0; P.upNow=0; P.x=sx; P.z=sz; P.rot=START_ROT; G.camYaw=START_YAW; P.hp=maxHp(); P.st=maxSt(); P.pounce=0; P.pcd=0; P.sneak=false; P.combatT=0; P.g.rotation.z=0;
  animals.forEach(o=>{ o.aggro=0; o.sus=0; o.near=false; if(o.state==='chase'){ o.state='wander'; o.timer=0; } });
  updateWarn(0); $('hurt').style.opacity=0; $('dead').style.display='none'; dead=false; G.paused=false; initAudio(); snd.click();
  if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
}
$('btnRespawn').onclick=respawn;
function hitAnimal(a){
  let d=dmg(), amb=false;
  if(a.state==='wander'||a.state==='lurk'||a.stun>0){ d*=2+0.6*S.b.amb; amb=true; }
  if(P.leap){ d*=1.25+0.25*S.b.climb; P.leap=false; floatText('Sprung vom Baum!',P.x,P.camY+2*pScale(),P.z,'#9be07f'); }
  d=Math.round(d*rnd(0.9,1.1));
  a.hp-=d; P.combatT=5;
  floatText((amb?'Hinterhalt! ':'')+'-'+d,a.x,H(a.x,a.z)+a.sp.size*1.8,a.z,amb?'#f2b84b':'#fff');
  puff(a.x,H(a.x,a.z)+a.sp.size,a.z,0xc0392b,4,0.5);
  G.lastHit=a; G.lastHitT=6; snd.hit(); if(amb){ snd.ambush(); goalEvent('amb',1); if(padUI()) rumble(0.25,0.6,120); G.slowT=Math.max(G.slowT,0.16); G.shakeA=Math.max(G.shakeA,0.3*pScale()); }
  if(a.hp<=0){ snd.kill(); if(padUI()) rumble(0.5,0.8,180); G.slowT=Math.max(G.slowT,0.22); G.shakeA=Math.max(G.shakeA,0.4*pScale()); }
  if(a.hp<=0){
    a.dead=true; a.respawn=rnd(18,30); S.kills=(S.kills||0)+1; goalEvent('kill',1,{sp:a.sp.id,night:dayF<0.5,herd:!!a.herd});
    { const n=FOOD[a.sp.id]||1, now=n>=4?Math.ceil(n/2):n; let rest=now;
      if(S.cub&&S.cub.grow<1){ const k=Math.min(FOOD_MAX-S.food,now); S.food+=k; rest=n-k; if(k>0) floatText('+'+k+' Futter im Vorrat',a.x,H(a.x,a.z)+a.sp.size*1.2,a.z,'#ff9ad0'); }
      if(rest>0) S.hunger=Math.min(100,S.hunger+rest*10);
      if(n>=4) makeCarcass(a,n-now); else a.g.visible=false; }
    puff(a.x,H(a.x,a.z)+a.sp.size*0.7,a.z,a.sp.m.col,10,0.5+a.sp.size*0.5);
    P.hp=Math.min(maxHp(),P.hp+maxHp()*0.25+a.sp.xp*0.1);
    const xpv=a.sp.xp*(a.fur&&a.fur.albino?2:1); if(a.fur&&a.fur.albino) toast('Seltene Beute: ein Albino! Doppelte Erfahrung.','#f2b84b');
    floatText('+'+xpv+' EP',P.x,P.y+2*pScale(),P.z,'#8ad4ef');
    gainXp(xpv);
    if(a.sp.boss&&!beaten(REG_ID)){ S.beat=Object.assign({},S.beat,{[REG_ID]:true}); if(REG_ID==='savanne') S.won=true; save(); $('winTitle').textContent=REG.winT; $('winText').textContent=REG.winX; setTimeout(()=>{ snd.win(); $('win').style.display='flex'; G.paused=true; if(document.exitPointerLock) document.exitPointerLock(); },900); }
  } else if(a.sp.fight){ a.state='chase'; a.aggro=10; a.scared=0; }
  else startFlee(a);
}
G.lastHit=null; G.lastHitT=0;

/* ---------- Familie: Partner, Junges, Futter, Überfälle ---------- */
const FOOD_MAX=20, CUB_HOME={x:7,z:5};
const cub={x:7,z:5,tx:7,tz:5,t:0,ph:0,mewT:6,saveT:10};
let cubG=null;
const CUBSPEC={col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.5,ears:0.17,tail:1.0,tailTip:0x2a1c10,spots:1};
function rebuildCub(){ dropModel(cubG); cubG=buildQuad(CUBSPEC,(S.cub&&S.cub.fur)||null); cubG.userData.blob.visible=!QUAL[quality].sh; cubG.visible=false; scene.add(cubG); }
rebuildCub();
G.raider=null; G.raidT=rnd(90,130)*D().raid; G.heirPending=false;
const cubGrown=()=>!!S.cub&&S.cub.grow>=1;
const seeking=()=>canMate()&&!S.partner;
const heirLevel=()=>1+Math.floor(Math.min(1,S.cub.grow)*7);
function nearestMate(){ let b=null, bd=1e9; for(const a of (S.partner?[fam[0]]:fam.slice(3))){ if(S.partner&&!a.famOn) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; b=a; } } return b?{a:b,d:bd}:null; }
function context(){
  if(dead||G.paused) return null;
  if(P.tree!=null) return (P.safe&&P.climbT>=1&&canSleepNow())?{label:'Schlafen',fn:sleepOnTree}:null;
  if(S.cub&&!cubGrown()&&S.food>0&&S.cub.full<97&&Math.hypot(cub.x-P.x,cub.z-P.z)<4.5) return {label:'Füttern',fn:feedCub};
  { const cc=nearCarcass(); if(cc){ if(S.cub&&S.cub.grow<1&&S.food<FOOD_MAX) return {label:'Fleisch mitnehmen',fn:()=>takeMeat(cc,true)}; if(S.hunger<90) return {label:'Fressen',fn:()=>takeMeat(cc,false)}; } }
  if(S.food>0&&S.hunger<50) return {label:'Fressen',fn:eatFood};
  if(canMate()){ const m=nearestMate(); if(m&&m.d<4.5) return {label:'Paaren',fn:()=>mateWith(m.a)}; }
  return null;
}
function doContext(){ const c=context(); if(c) c.fn(); }
function mateWith(a){
  if(!S.partner){ S.partner=true; famPlace(fam[0],a.x,a.z); }   // der gewählte Leopard bleibt als Partner
  S.preg=25; save(); snd.purr();
  puff(P.x,P.y+1.2,P.z,0xff7ab8,8,0.45); puff(a.x,H(a.x,a.z)+1.2,a.z,0xff7ab8,8,0.45);
  toast('Ihr habt euch gepaart. Dein Partner bleibt bei dir; im Bau kommt bald euer Junges zur Welt.','#ff9ad0');
}
function feedCub(){
  const c=S.cub, n=Math.min(S.food,Math.ceil((100-c.full)/12)); if(n<=0) return;
  const was=c.grow;
  goalEvent('feed',n); S.food-=n; c.full=Math.min(100,c.full+n*12); c.hp=Math.min(1,c.hp+n*0.08); c.grow=Math.min(1,c.grow+n*0.025);
  puff(cub.x,H(cub.x,cub.z)+0.8,cub.z,0xff7ab8,8,0.4); snd.eat();
  floatText('+'+n+' Futter',cub.x,H(cub.x,cub.z)+1.2,cub.z,'#ff9ad0');
  if(was<1&&c.grow>=1){ toast('Dein Junges ist ausgewachsen! Es braucht kein Futter mehr und ist dein Erbe.','#ff9ad0'); snd.level(); if(G.raider) endRaid(G.raider); }
  save();
}
function cubDies(how){
  S.cub=null; S.food=0; if(G.raider) endRaid(G.raider); save(); snd.death();
  toast('Dein Junges '+how+'. Du kannst dir wieder einen Partner suchen.','#ff8a70');
}
function endRaid(a){ a.state='wander'; a.timer=0; a.sus=0; a.scared=8; if(G.raider===a) G.raider=null; }
function startRaid(){
  G.raidT=rnd(120,200)*D().raid;
  const cand=animals.filter(a=>!a.dead&&(a.sp.id==='jack'||a.sp.id==='hyena')&&a.state==='wander'&&Math.hypot(a.x-P.x,a.z-P.z)>80);
  if(!cand.length){ G.raidT=20; return; }
  const a=cand[Math.floor(Math.random()*cand.length)];
  let an=Math.random()*6.283;
  if(Math.hypot(P.x-CUB_HOME.x,P.z-CUB_HOME.z)<110) an=Math.atan2(CUB_HOME.z-P.z,CUB_HOME.x-P.x)+rnd(-0.7,0.7);   // kommt von der dem Spieler abgewandten Seite
  a.x=CUB_HOME.x+Math.cos(an)*75; a.z=CUB_HOME.z+Math.sin(an)*75;
  a.state='raid'; a.found=false; a.raidS=0; a.roll=0; a.timer=0; a.sus=0; a.stun=0; a.aggro=0; a.hp=a.sp.hp;
  // Familienmitglieder am Bau sind nicht immer da: bei jedem zweiten Überfall sind sie auf der Jagd
  const guards=fam.slice(0,3).some(f=>f.famOn); a.pAway=!guards||Math.random()<0.5;
  G.raider=a; snd.alert();
  toast('Achtung: Ein'+(a.sp.id==='hyena'?'e ':' ')+a.sp.n+' schleicht sich an dein Junges heran!'+(guards?(a.pAway?' Deine Familie ist auf der Jagd – du musst selbst eingreifen.':' Deine Familie am Bau stellt sich ihm entgegen.'):''),'#ff8a70');
}
function raidStep(a,dt){
  const sp=a.sp, c=S.cub;
  if(!c||c.grow>=1){ endRaid(a); return; }
  const cx=cub.x-a.x, cz=cub.z-a.z, cd=Math.hypot(cx,cz);
  if(!a.found){
    if(cd>10) moveAnimal(a,cx,cz,sp.spd*0.65,dt);
    else {
      a.raidS+=dt; a.timer-=dt;
      if(a.timer<=0){ const an=Math.random()*6.283, r=rnd(3,9); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(1.5,3); }
      moveAnimal(a,a.tx-a.x,a.tz-a.z,sp.spd*0.3,dt);
      // Ein sattes Junges bleibt still und wird selten gefunden, ein hungriges ruft und verrät sich
      a.roll+=dt; if(a.roll>=1){ a.roll=0; if(Math.random()<0.02+0.12*(1-c.full/100)){ a.found=true; snd.alert(); toast('Dein Junges wurde entdeckt – vertreib den Räuber!','#ff8a70'); } }
      if(!a.found&&a.raidS>22){ endRaid(a); toast('Der Räuber hat dein Junges nicht gefunden und zieht ab.','#9be07f'); }
    }
  } else if(cd>a.rad+0.7) moveAnimal(a,cx,cz,sp.spd*0.85,dt);
  else {
    animLegs(a.g,a.ph,0.05);
    if(a.cd<=0){ a.cd=1.2; c.hp-=0.07; puff(cub.x,H(cub.x,cub.z)+0.5,cub.z,0xc0392b,4,0.4); if(Math.hypot(P.x-cub.x,P.z-cub.z)<70) snd.mew(); if(c.hp<=0) cubDies('wurde getötet'); }
  }
}
function updateCub(dt){
  if(G.raider&&(G.raider.dead||G.raider.state!=='raid')) G.raider=null;
  if(S.preg>0){ S.preg-=dt; if(S.preg<=0){ S.preg=0; { const ks=Object.keys(TRAITS).filter(t=>!has(t)); S.cub={full:70,grow:0,hp:1,trait:ks[Math.floor(Math.random()*ks.length)]}; S.cub.fur=makeFur(); if(S.cub.trait==='dunkel'&&!S.cub.fur.albino) S.cub.fur.l=Math.min(S.cub.fur.l,0.66); rebuildCub();
      $('birthTrait').innerHTML=ico(S.cub.trait,ICOL.t,16)+' Erbanlage: '+TRAITS[S.cub.trait][0]+' ('+TRAITS[S.cub.trait][1]+') · Fell: '+furName(S.cub.fur); } cub.x=CUB_HOME.x; cub.z=CUB_HOME.z; cub.t=0; G.raidT=rnd(90,130)*D().raid; save(); snd.mew();
    $('birth').style.display='flex'; G.paused=true; for(const k in keys) keys[k]=false; G.joyX=G.joyY=0; if(document.exitPointerLock) document.exitPointerLock(); } }
  const c=S.cub; if(!c){ cubG.visible=false; return; }
  cubG.visible=true;
  if(c.grow<1){
    c.full=Math.max(0,c.full-dt*0.28*D().hunger);
    if(c.full<=0){ c.hp-=dt*0.012; if(c.hp<=0){ cubDies('ist verhungert'); return; } }
    else if(c.hp<1&&!G.raider) c.hp=Math.min(1,c.hp+dt*0.01);
    if(c.full<25){ cub.mewT-=dt; if(cub.mewT<=0){ cub.mewT=rnd(6,11); if(Math.hypot(P.x-cub.x,P.z-cub.z)<60) snd.mew(); } }
    G.raidT-=dt; if(G.raidT<=0&&!G.raider) startRaid();
  }
  cub.t-=dt; if(cub.t<=0){ const an=Math.random()*6.283, r=rnd(0,4); cub.tx=CUB_HOME.x+Math.cos(an)*r; cub.tz=CUB_HOME.z+Math.sin(an)*r; cub.t=rnd(3,9); }
  const dx=cub.tx-cub.x, dz=cub.tz-cub.z, d=Math.hypot(dx,dz);
  if(d>0.3){ const v=1.3*dt/d; cub.x+=dx*v; cub.z+=dz*v; cubG.rotation.y=Math.atan2(dx,dz); cub.ph+=dt*9; animLegs(cubG,cub.ph,0.45); } else animLegs(cubG,cub.ph,0.03);
  cubG.scale.setScalar(0.26+0.74*Math.min(1,c.grow)); cubG.position.set(cub.x,H(cub.x,cub.z),cub.z);
  cub.saveT-=dt; if(cub.saveT<=0){ cub.saveT=10; save(); }
}
// Partnersuche: Pfeil und Hinweis nur in den ersten 15 s, danach nur noch der rosa Punkt auf der Spürkarte
let seekT=0;
function updateFamArrow(dt){
  if(canMate()) seekT+=dt||0; else seekT=0;
  const el=$('famArrow'); let tx=null, tz=null;
  if(S.cub&&!cubGrown()&&(G.raider||S.cub.full<20)){ tx=cub.x; tz=cub.z; }
  else if(canMate()&&seekT<15){ const m=nearestMate(); if(m){ tx=m.a.x; tz=m.a.z; } }
  if(tx===null||Math.hypot(tx-P.x,tz-P.z)<9){ el.style.display='none'; return; }
  const dx=tx-P.x, dz=tz-P.z, s=Math.sin(G.camYaw), c=Math.cos(G.camYaw), ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c)), R=Math.min(window.innerWidth,window.innerHeight)*0.27;
  el.style.display='block'; el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale(0.8)';
}

/* Familienmitglieder: Partner (Platz 0) und Elterntiere (Plätze 1, 2) leben am Bau, verteidigen das Junge
   und versorgen und beschützen den Spieler, solange er selbst noch nicht ausgewachsen ist. Sie können endgültig sterben. */
const fam=animals.filter(a=>a.sp.friend), FAM_HP=220;
let feedT=rnd(40,70);
const famRole=i=>i===0?(S.partner?'partner':null):i===1?(S.p1?'p1':null):i===2?(S.p2?'p2':null):null;
const canMate=()=>S.lvl>=8&&!S.cub&&!(S.preg>0);
const kidMode=()=>S.lvl<8&&(S.p1||S.p2);
function famHome(a){ const an=Math.random()*6.283, r=rnd(5,20); a.tx=CUB_HOME.x+Math.cos(an)*r; a.tz=CUB_HOME.z+Math.sin(an)*r; a.timer=rnd(4,10); }
function famPlace(a,x,z){ a.x=x; a.z=z; a.fhp=FAM_HP; a.feeding=false; a.famOn=true; a.cd=0; a.fcombat=0; a.idle=0; famHome(a); }
function famDie(a){
  const i=fam.indexOf(a); if(i===0) S.partner=false; else if(i===1) S.p1=false; else S.p2=false;
  a.famOn=false; a.g.visible=false; save(); snd.death(); puff(a.x,H(a.x,a.z)+1,a.z,0xe0a23c,10,0.8);
  toast(i===0?'Dein Partner ist im Kampf gestorben.':'Eines deiner Elterntiere ist im Kampf gestorben.','#ff8a70');
}
function famHurt(a,d){ if(!a.famOn) return; a.fhp-=d; a.fcombat=4; puff(a.x,H(a.x,a.z)+1,a.z,0xc0392b,3,0.4); if(a.fhp<=0) famDie(a); }
function famKill(t){ t.dead=true; t.g.visible=false; t.respawn=rnd(18,30); t.foe=null; if(G.raider===t) G.raider=null; puff(t.x,H(t.x,t.z)+t.sp.size*0.7,t.z,t.sp.m.col,10,0.5+t.sp.size*0.5); }
function famTarget(a,role){
  let best=null, bd=1e9;
  for(const o of animals){ if(o.dead||o.state!=='fightFam') continue; const d=Math.hypot(o.x-a.x,o.z-a.z); if((o.foe===a||d<60)&&d<bd){ bd=d; best=o; } }
  if(best) return best;
  if(G.raider&&!G.raider.pAway&&S.cub&&Math.hypot(G.raider.x-cub.x,G.raider.z-cub.z)<16) return G.raider;
  if(role!=='partner'&&S.lvl<8&&!dead){
    bd=130;
    for(const o of animals){
      if(o.dead||o.state!=='chase') continue;
      const dp=Math.hypot(o.x-P.x,o.z-P.z); if(!(P.hp<maxHp()*0.6||dp<25)) continue;   // nur bei großer Gefahr: Verfolger ist nah oder das Leben niedrig
      const d=Math.hypot(o.x-a.x,o.z-a.z); if(d<bd){ bd=d; best=o; }
    }
  }
  return best;
}
function deliverFood(a){
  P.hp=Math.min(maxHp(),P.hp+maxHp()*0.5); S.hunger=Math.min(100,S.hunger+60); snd.eat(); puff(P.x,P.y+1,P.z,0xff7ab8,8,0.4);
  toast('Ein Elterntier bringt dir Beute: Leben aufgefüllt, Erfahrung erhalten.','#ff9ad0');
  gainXp(Math.round(xpNeed(S.lvl)*0.35));
}
function famStep(a,dt,role){
  a.g.visible=true; a.cd-=dt;
  if(a.fcombat>0) a.fcombat-=dt; else if(a.fhp<FAM_HP) a.fhp=Math.min(FAM_HP,a.fhp+dt*3);
  const t=famTarget(a,role);
  if(t){
    const dx=t.x-a.x, dz=t.z-a.z, d=Math.hypot(dx,dz);
    if(d>t.rad+1.4) moveAnimal(a,dx,dz,14,dt);
    else {
      a.g.rotation.y=Math.atan2(dx,dz); animLegs(a.g,a.ph,0.05);
      if(a.cd<=0){
        a.cd=1.0; a.fcombat=4; t.hp-=18; puff(t.x,H(t.x,t.z)+t.sp.size,t.z,0xc0392b,4,0.5); if(Math.hypot(P.x-a.x,P.z-a.z)<70) snd.hit();
        if(t.hp<=0) famKill(t);
        else if(t.hp<t.sp.hp*0.35){ t.state='flee'; t.fleeT=0; t.scared=15; t.aggro=0; t.foe=null; if(G.raider===t) G.raider=null; }
        else if(t.state!=='fightFam'){ t.state='fightFam'; t.foe=a; t.aggro=0; if(G.raider===t) G.raider=null; }
      }
    }
  } else if(a.feeding){
    const dx=P.x-a.x, dz=P.z-a.z, d=Math.hypot(dx,dz);
    if(dead||P.tree!=null&&d<4){ animLegs(a.g,a.ph,0.03); }
    else if(d>3) moveAnimal(a,dx,dz,9.5,dt); else { a.feeding=false; deliverFood(a); famHome(a); }
  } else {
    a.timer-=dt; if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ famHome(a); a.idle=rnd(1,5); }
    if(a.idle>0){ a.idle-=dt; animLegs(a.g,a.ph,0.03); }
    else moveAnimal(a,a.tx-a.x,a.tz-a.z,Math.hypot(a.x-CUB_HOME.x,a.z-CUB_HOME.z)>32?8:2,dt);
  }
  a.g.position.set(a.x,H(a.x,a.z),a.z);
}
function updateFamily(dt){
  for(let i=0;i<3;i++){ const a=fam[i], r=famRole(i); if(r&&!a.famOn) famPlace(a,CUB_HOME.x+rnd(-9,9),CUB_HOME.z+rnd(-9,9)); if(!r) a.famOn=false; }
  if(kidMode()&&!dead){
    feedT-=dt;
    if(feedT<=0){ feedT=rnd(70,110); let b=null, bd=1e9; for(let i=1;i<3;i++){ const a=fam[i]; if(!a.famOn||a.feeding) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; b=a; } } if(b) b.feeding=true; }
  }
}
// Wechsel ins Junge: freiwillig (das alte Ich bleibt als Elterntier) oder nach dem Tod
function becomeCub(vol){
  recordAncestor(vol?'zog sein Junges groß und lebt als Elterntier weiter':G.lastCause);
  const hl=heirLevel(), ox=P.x, oz=P.z, hadPartner=S.partner&&fam[0].famOn;
  S.p1=!!vol; S.p2=!!hadPartner; S.partner=false;
  if(S.p2) famPlace(fam[2],fam[0].x,fam[0].z); else fam[2].famOn=false;
  if(S.p1) famPlace(fam[1],ox,oz); else fam[1].famOn=false;
  fam[0].famOn=false;
  if(S.cub.trait&&TRAITS[S.cub.trait]&&!has(S.cub.trait)) S.traits=S.traits.concat(S.cub.trait).slice(-3);
  { const sum=o=>Object.keys(o).reduce((x,k)=>x+o[k],0), total=sum(S.a)+2*sum(S.b)+S.pts;   // Eigenschaften und Fähigkeiten werden nicht vererbt, nur 10 % der Punkte
    S.a=fresh().a; S.b=fresh().b; S.pts=Math.round(total*0.1); }
  S.fur=S.cub.fur||null;
  { const ng=(S.gen||1)+1, nr=Object.values(REGIONS).find(r=>r.gen===ng&&!r.soon); if(nr) setTimeout(()=>toast('Deine Linie ist stark genug: '+nr.n+' ist jetzt erreichbar (Menü → Gebiete).','#9be07f'),2600); }
  S.lvl=hl; S.xp=0; S.gen=(S.gen||1)+1; S.cub=null; S.food=0; S.preg=0; S.hunger=80; S.age=0; S.kills=0; if(G.raider) endRaid(G.raider);
  feedT=rnd(30,50); save(); rebuildPlayer();
}
function playAsCub(){
  const cx=cub.x, cz=cub.z; becomeCub(true);
  P.tree=null; P.safe=false; P.dropY=0; P.upNow=0; P.pounce=0; P.x=cx; P.z=cz; P.hp=maxHp(); P.st=maxSt(); P.sneak=false;
  toast('Generation '+S.gen+': Du spielst jetzt als dein Junges. Deine Eltern bringen dir Futter und beschützen dich bei großer Gefahr.','#ff9ad0');
  updateUI();
}
function unpause(){ G.paused=false; if(!touchUI()){ try{ const r=canvas.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } }
$('btnStayAdult').onclick=()=>{ $('birth').style.display='none'; unpause(); };
$('btnBeCub').onclick=()=>{ $('birth').style.display='none'; playAsCub(); unpause(); };
G.cubArm=false;
$('btnMenuCub').onclick=()=>{
  if(!S.cub) return;
  if(!G.cubArm){ G.cubArm=true; $('btnMenuCub').textContent='Wirklich? Du startest als Junges auf Stufe '+heirLevel(); return; }
  G.cubArm=false; $('menu').style.display='none'; playAsCub(); unpause();
};

/* ---------- Lebenslauf: eigener Hunger, Altern, Fressen aus dem Vorrat ---------- */
G.lineageEnd=false; G.lastCause='';
function eatFood(){ if(S.food<=0) return; S.food--; S.hunger=Math.min(100,S.hunger+12); P.hp=Math.min(maxHp(),P.hp+maxHp()*0.05); snd.eat(); floatText('gefressen',P.x,P.camY+1.6*pScale(),P.z,'#e0a060'); }
function updateLife(dt){
  if(dead) return;
  S.hunger=Math.max(0,S.hunger-dt*(100/420)*(has('genug')?0.75:1)*D().hunger);
  if(S.hunger<20&&S.food>0){ S.food--; S.hunger=Math.min(100,S.hunger+12); }   // Notration aus dem Vorrat
  if(S.hunger<=0){ P.hp-=maxHp()*0.015*dt; if(P.hp<=0){ hurtPlayer(1e9,{sp:{id:'hunger',n:'Hunger'}},true); return; } }
  if(S.lvl>=8){
    const a0=S.age, D=DIE_AT(); S.age+=dt;
    if(a0<OLD_AT&&S.age>=OLD_AT) toast('Du wirst alt: Tempo und Kraft lassen nach. Sorge für Nachwuchs, damit deine Linie weiterlebt.','#f2b84b');
    if(a0<D-90&&S.age>=D-90) toast('Deine Kräfte schwinden. Dir bleibt nicht mehr viel Zeit.','#ff8a70');
    if(S.age>=D) hurtPlayer(1e9,{sp:{id:'age',n:'Alter'}},true);
  }
}

/* ---------- Tag und Nacht ---------- */
// S.tod: 0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 = Mittag, 0.75 = Sonnenuntergang. Ein ganzer Tag dauert DAY_LEN Sekunden.
const DAY_LEN=480;
let dayF=1, nightToastDone=false, sleeping=false, sleepCount=0;
try{ sleepCount=+localStorage.getItem('jaguar-sleeps')||0; }catch(e){}
const C_DAY_TOP=new THREE.Color(0x3f8fd6), C_DAY_HOR=new THREE.Color(HORIZON), C_NIGHT_TOP=new THREE.Color(0x040814), C_NIGHT_HOR=new THREE.Color(0x101a2e), C_DUSK=new THREE.Color(0xf08a4a);
const C_SUN=new THREE.Color(0xffe6b8), C_SUNLOW=new THREE.Color(0xff9a55), C_MOON=new THREE.Color(0x9fb4ff);
const C_HEMI_D=new THREE.Color(0xd4ecff), C_HEMI_N=new THREE.Color(0x46588a), C_HEMI_NV=new THREE.Color(0x5f9a78), C_GND_D=new THREE.Color(0x6f7a48), C_GND_N=new THREE.Color(0x1a2018);
const _c1=new THREE.Color(), _c2=new THREE.Color();
const clockStr=()=>{ const m=Math.floor(S.tod*1440); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
const canSleepNow=()=>S.tod>0.72||S.tod<0.22;
function updateDayNight(dt){
  if(dt>0){ const t0=S.tod; S.tod=(S.tod+dt/DAY_LEN)%1; if(t0<0.25&&S.tod>=0.25){ S.day=(S.day||0)+1; newGoals(); setTimeout(()=>toast('Ein neuer Tag – neue Tagesziele.','#9be07f'),400); } }
  const a=(S.tod-0.25)*2*Math.PI, el=Math.sin(a), NV=S.b.night||0;
  let d=Math.max(0,Math.min(1,(el+0.1)/0.35)); dayF=d*d*(3-2*d);
  const duskF=Math.max(0,1-Math.abs(el)/0.3);
  const nl=0.2+0.15*NV, L=nl+(1-nl)*dayF;
  // Licht kommt am Tag von der Sonne, nachts vom Mond (gegenüber); flach stehendes Licht wird begrenzt, damit Schatten nicht ausufern
  const s=el>=0?1:-1; SUN_OFF.set(Math.cos(a)*s,Math.max(Math.abs(el),0.35),0.45).normalize().multiplyScalar(90);
  sun.intensity=dayF*1.0+(1-dayF)*(0.22+0.07*NV);
  _c1.copy(C_SUN).lerp(C_SUNLOW,duskF*0.8); sun.color.copy(C_MOON).lerp(_c1,dayF);
  hemi.intensity=0.72*L;
  _c2.copy(C_HEMI_N).lerp(C_HEMI_NV,NV/3); hemi.color.copy(_c2).lerp(C_HEMI_D,dayF); hemi.groundColor.copy(C_GND_N).lerp(C_GND_D,dayF);
  const u=sky.material.uniforms, nb=1+0.6*NV;
  _c1.copy(C_NIGHT_TOP).multiplyScalar(nb); u.top.value.copy(_c1).lerp(C_DAY_TOP,dayF);
  _c2.copy(C_NIGHT_HOR).multiplyScalar(nb); u.hor.value.copy(_c2).lerp(C_DAY_HOR,dayF).lerp(C_DUSK,duskF*0.5);
  u.sunDir.value.copy(SUN_OFF).normalize();
  u.sunCol.value.setRGB(0.45,0.55,0.75).lerp(_c1.setRGB(1,0.86,0.6),dayF);
  scene.background.copy(u.hor.value); scene.fog.color.copy(u.hor.value);
  const fn=0.45+0.17*NV, fm=fn+(1-fn)*dayF; scene.fog.near=G.FOG_BASE[0]*fm; scene.fog.far=G.FOG_BASE[1]*fm;
  starMat.opacity=(1-dayF)*0.9;
  cloudMat.color.setRGB(0.18,0.22,0.32).lerp(_c1.setRGB(1,1,1),dayF).lerp(C_DUSK,duskF*0.35);
  if(G.farMount) G.farMount.material.color.setRGB(0.25+0.75*dayF,0.28+0.72*dayF,0.36+0.64*dayF);
  const gl=grassLight.value; gl.set(0.62,0.72,1.0).multiplyScalar(L*1.15).lerp(_c1.setRGB(1,1,1),dayF);
  // Regen dunkelt ab und verkürzt die Sicht, Blitze hellen kurz auf
  if(W.rain>0||W.flash>0){ const r=W.rain, f=W.flash;
    sun.intensity*=1-0.75*r; hemi.intensity=hemi.intensity*(1-0.35*r)+f*1.6;
    _c1.setRGB(0.36,0.4,0.46).multiplyScalar(0.3+0.7*Math.max(dayF,0.15)); u.top.value.lerp(_c1,r*0.75); u.hor.value.lerp(_c1,r*0.6);
    _c2.setRGB(0.85,0.88,1); u.top.value.lerp(_c2,f*0.7); u.hor.value.lerp(_c2,f*0.6);
    scene.background.copy(u.hor.value); scene.fog.color.copy(u.hor.value);
    scene.fog.near*=1-0.5*r; scene.fog.far*=1-0.45*r;
    cloudMat.color.multiplyScalar(1-0.55*r); grassLight.value.multiplyScalar(1-0.3*r+f*0.8); }
  if(!dayF&&!nightToastDone&&G.started&&!G.paused){ nightToastDone=true;
    toast('Die Nacht bricht herein: Du bist schwerer zu sehen, aber Raubtiere sind wachsamer.'+(S.b.climb&&sleepCount<2?(padUI()?' Auf einem Baum kannst du mit Ⓧ bis zum Morgen schlafen.':touchUI()?' Auf einem Baum kannst du mit dem rosa Knopf bis zum Morgen schlafen.':' Auf einem Baum kannst du mit F bis zum Morgen schlafen.'):''),'#9fb4ff'); }
  if(dayF>0.9) nightToastDone=false;
}
function sleepOnTree(){
  if(sleeping) return;
  sleeping=true; G.paused=true; for(const k in keys) keys[k]=false; G.joyX=G.joyY=0;
  const fx=$('sleepFx'); fx.style.display='flex'; requestAnimationFrame(()=>{ fx.style.opacity=1; });
  setTimeout(()=>{
    const skip=((0.27-S.tod)+1)%1, secs=skip*DAY_LEN;
    S.tod=0.27; S.day=(S.day||0)+1; newGoals(); P.hp=maxHp(); P.st=maxSt(); sleepCount++; try{ localStorage.setItem('jaguar-sleeps',String(sleepCount)); }catch(e){}
    S.hunger=Math.max(5,Math.min(S.hunger-45,30));   // man wacht hungrig auf
    if(S.lvl>=8) S.age+=secs;
    if(S.cub&&S.cub.grow<1) S.cub.full=Math.max(8,S.cub.full-secs*0.28*D().hunger);
    if(S.preg>0) S.preg=Math.max(0.1,S.preg-secs);
    G.raidT=rnd(90,130)*D().raid; if(G.raider) endRaid(G.raider);
    animals.forEach(o=>{ o.aggro=0; o.sus=0; if(o.state==='chase'){ o.state='wander'; o.timer=0; } });
    updateDayNight(0); save(); updateUI();
    fx.style.opacity=0;
    setTimeout(()=>{ fx.style.display='none'; sleeping=false; if(G.started&&!menuOpen()&&$('skills').style.display==='none') G.paused=false;
      toast('Du wachst bei Sonnenaufgang auf – ausgeruht, aber hungrig.','#f2b84b'); },900);
  },1700);
}

/* ---------- Kadaver, Aasfresser, Herden, Ahnenbuch ---------- */
// Größere Beute bleibt als Kadaver liegen: Du frisst gleich die Hälfte, der Rest bleibt für später – und lockt Hyänen und Schakale an.
function makeCarcass(a,meat){
  a.carc={t:55,meat}; a.g.visible=true; a.g.rotation.z=Math.PI/2;
  a.g.position.set(a.x,H(a.x,a.z)+a.sp.size*0.22,a.z); animLegs(a.g,0,0);
  const sc=animals.filter(o=>!o.dead&&(o.sp.id==='hyena'||o.sp.id==='jack')&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<150)
    .sort((p,q)=>(p.sp.id==='hyena'?0:1)-(q.sp.id==='hyena'?0:1)||Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z)).slice(0,2);
  sc.forEach(o=>{ o.state='scav'; o.carc=a; o.eatT=0; o.sus=0; });
  if(sc.length&&Math.hypot(P.x-a.x,P.z-a.z)<80){ const hy=sc[0].sp.id==='hyena';
    setTimeout(()=>toast((hy?'Hyänen':'Schakale')+' haben die Beute gewittert und kommen!'+(sc[0].sp.hunt&&S.lvl<sc[0].sp.hunt?' Nimm dir, was du brauchst, und verschwinde.':''),'#f2b84b'),1200); }
}
function nearCarcass(){ for(const a of animals){ if(a.carc&&a.carc.meat>0&&Math.hypot(a.x-P.x,a.z-P.z)<a.rad+2.6) return a; } return null; }
function takeMeat(c,store){
  const n=store?Math.min(c.carc.meat,FOOD_MAX-S.food):Math.min(c.carc.meat,Math.max(1,Math.ceil((100-S.hunger)/10)));
  if(n<=0) return;
  if(store) S.food+=n; else { S.hunger=Math.min(100,S.hunger+n*10); P.hp=Math.min(maxHp(),P.hp+maxHp()*0.05*n); }
  c.carc.meat-=n; snd.eat(); if(!store) goalEvent('meat',1); puff(c.x,H(c.x,c.z)+0.6,c.z,0xc0392b,5,0.4);
  floatText(store?'+'+n+' Futter im Vorrat':'gefressen',c.x,H(c.x,c.z)+1.4,c.z,store?'#ff9ad0':'#e0a060');
}
// Herden: Wasserschweine, Hirsche und Antilopen ziehen in Gruppen. Flieht eines, fliehen die Nachbarn mit.
const herdLead=a=>{ for(const m of a.herd) if(!m.dead) return m; return a; };
function startFlee(a){
  a.state='flee'; a.fleeT=0;
  if(a.herd) for(const m of a.herd) if(m!==a&&!m.dead&&m.state==='wander'&&Math.hypot(m.x-a.x,m.z-a.z)<40){ m.state='flee'; m.fleeT=0; m.sus=0; }
}
// Ahnenbuch: jede Generation der Blutlinie mit Fell, Erbanlagen, Stufe, Beute und Schicksal
function recordAncestor(cause){ S.anc=(S.anc||[]).concat({g:S.gen||1,l:S.lvl,f:S.fur?Object.assign({},S.fur):null,t:S.traits.slice(),k:S.kills||0,c:cause}).slice(-40); }
function archiveLine(){
  let L=[]; try{ L=JSON.parse(localStorage.getItem('jaguar-lines')||'[]'); }catch(e){}
  L.unshift({g:S.gen||1,d:S.diff,at:Date.now()}); try{ localStorage.setItem('jaguar-lines',JSON.stringify(L.slice(0,10))); }catch(e){}
}
const hex6=n=>'#'+n.toString(16).padStart(6,'0');
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderBook(){
  const row=(e,me)=>{ const col=e.f?furColor(0xe0a23c,e.f):0xe0a23c;
    return '<div class="anc"><span class="sw" style="background:'+hex6(col)+'"></span><div><b>Generation '+e.g+(me?' · du':'')+'</b>'+
      '<small>Stufe '+e.l+' · Fell: '+esc(furName(e.f))+' · '+e.k+' Beutetier'+(e.k===1?'':'e')+'</small>'+
      '<small>'+(e.t.length?e.t.map(t=>'<span class="tchip">'+ico(t,ICOL.t,13)+(TRAITS[t]?TRAITS[t][0]:t)+'</span>').join(''):'Erbanlagen: keine')+'</small>'+
      '<small style="color:'+(me?'#9be07f':'var(--txt)')+'">'+esc(e.c)+'</small></div></div>'; };
  const cur={g:S.gen||1,l:S.lvl,f:S.fur,t:S.traits,k:S.kills||0,c:'lebt'};
  $('bookList').innerHTML=row(cur,true)+(S.anc||[]).slice().reverse().map(e=>row(e,false)).join('');
  let L=[]; try{ L=JSON.parse(localStorage.getItem('jaguar-lines')||'[]'); }catch(e){}
  $('bookLines').innerHTML=L.length?L.map(l=>'<div style="font-size:12px;color:var(--mut);padding:2px 0">Endete in Generation '+l.g+' · '+(DIFF[l.d]?DIFF[l.d].n:'Normal')+' · '+new Date(l.at).toLocaleDateString('de-DE')+'</div>').join(''):'<div style="font-size:12px;color:var(--mut)">Noch keine.</div>';
}
function openBook(){ renderBook(); $('menu').style.display='none'; $('book').style.display='flex'; }
function closeBook(){ $('book').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const bookOpen=()=>$('book').style.display==='flex';
$('btnBook').onclick=openBook;
function openSettings(){ renderKeys(); $('menu').style.display='none'; $('settings').style.display='flex'; }
function closeSettings(){ $('settings').style.display='none'; $('menu').style.display='flex'; G.menuT=performance.now(); }
const settingsOpen=()=>$('settings').style.display==='flex';
$('btnSettings').onclick=openSettings; $('btnSetBack').onclick=closeSettings; $('btnBookBack').onclick=closeBook;

/* ---------- Wetter: Regen und Gewitter ---------- */
// W.rain: 0 = trocken, 1 = Starkregen. Regen dunkelt ab, verkürzt die Sicht und übertönt deine Schritte (schwerer zu entdecken).
const W={rain:0,target:0,storm:false,t:rnd(90,180),flash:0,lightT:6};
let rainGain=null;
const rainMat=new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, fog:false,
  uniforms:{uCam:{value:new THREE.Vector3()},uTime:{value:0},uOp:{value:0},uWind:windU},
  vertexShader:'attribute float aEnd; uniform vec2 uWind; uniform vec3 uCam; uniform float uTime; varying float vA;\nvoid main(){ vec3 o=position; float S=70.0; float Hh=38.0; vec3 p;\n'+
    ' p.x=uCam.x-S*0.5+mod(o.x*S-(uCam.x-S*0.5),S); p.z=uCam.z-S*0.5+mod(o.z*S-(uCam.z-S*0.5),S);\n'+
    ' p.y=uCam.y-Hh*0.45+mod(o.y*Hh-uTime*24.0,Hh)+aEnd*1.1; p.xz+=uWind*aEnd*0.4; vA=aEnd;\n'+
    ' gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0); }',
  fragmentShader:'uniform float uOp; varying float vA; void main(){ gl_FragColor=vec4(0.78,0.83,0.92,uOp*(0.25+0.45*vA)); }'
});
(function(){
  const N=3200, pos=new Float32Array(N*6), end=new Float32Array(N*2);
  for(let i=0;i<N;i++){ const x=Math.random(), y=Math.random(), z=Math.random(); pos.set([x,y,z,x,y,z],i*6); end[i*2]=1; end[i*2+1]=0; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('aEnd',new THREE.BufferAttribute(end,1));
  const m=new THREE.LineSegments(g,rainMat); m.frustumCulled=false; m.renderOrder=5; scene.add(m);
})();
function updateWeather(dt){
  W.t-=dt;
  if(W.t<=0){
    if(W.target>0){ W.target=0; W.storm=false; W.t=rnd(150,300); }
    else if(Math.random()<0.45){ W.target=rnd(0.6,1); W.storm=Math.random()<0.45; W.t=rnd(60,140); W.lightT=rnd(4,9);
      toast(W.storm?'Ein Gewitter zieht auf! Donner und Regen übertönen deine Schritte.':'Es beginnt zu regnen – der Regen übertönt deine Schritte.','#9fc0e0'); }
    else W.t=rnd(60,140);
  }
  W.rain+=Math.max(-dt*0.06,Math.min(dt*0.06,W.target-W.rain));
  if(W.flash>0) W.flash=Math.max(0,W.flash-dt*4);
  if(W.storm&&W.rain>0.5){ W.lightT-=dt;
    if(W.lightT<=0){ W.lightT=rnd(5,14); W.flash=1; setTimeout(()=>snd.thunder(),rnd(500,2400));
      // Donner schreckt Beute in der Nähe auf
      for(const a of animals){ if(!a.dead&&!a.sp.fight&&a.state==='wander'&&Math.hypot(a.x-P.x,a.z-P.z)<60&&Math.random()<0.5) startFlee(a); } } }
  rainMat.uniforms.uOp.value=W.rain*0.85; rainMat.uniforms.uCam.value.copy(camera.position); rainMat.uniforms.uTime.value+=dt;
  if(AC&&master&&!rainGain){ try{ const s=AC.createBufferSource(); s.buffer=nbuf; s.loop=true; const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1700; f.Q.value=0.5;
    rainGain=AC.createGain(); rainGain.gain.value=0; s.connect(f); f.connect(rainGain); rainGain.connect(master); s.start(); }catch(e){} }
  if(rainGain) rainGain.gain.setTargetAtTime(W.rain*0.16,AC.currentTime,0.4);
}

/* ---------- Tagesziele ---------- */
// Zu jedem Sonnenaufgang drei neue Aufgaben; jede bringt einen Teil der nächsten Stufe als Bonus-Erfahrung.
const PREY_BY_LVL=l=>{ const L=l<3?['hase','maus']:l<6?['capy','hase']:l<9?['boar','deer','capy']:l<12?['deer','anti','boar']:['anti','lion','hyena','croc']; const f=L.filter(id=>animals.some(a=>a.sp.id===id)); return f.length?f:['hase']; };
function spName(id){ const sp=SPECIES.find(x=>x.id===id); return sp?sp.n:id; }
function newGoals(){
  const pool=[];
  const n=3+Math.floor(Math.random()*3); pool.push({id:'kill',text:'Erlege '+n+' Beutetiere',need:n});
  const pr=PREY_BY_LVL(S.lvl), sp=pr[Math.floor(Math.random()*pr.length)]; pool.push({id:'sp:'+sp,text:'Erlege '+(ART[sp]||'ein')+' '+spName(sp),need:1});
  pool.push({id:'night',text:'Erlege nachts ein Tier',need:1});
  pool.push({id:'amb',text:'Lande 2 Treffer aus dem Hinterhalt',need:2});
  pool.push({id:'herd',text:'Erlege ein Tier aus einer Herde',need:1});
  pool.push({id:'meat',text:'Friss an einem Kadaver',need:1});
  if(S.lvl<12) pool.push({id:'hide',text:'Bleib 20 s versteckt, während ein Raubtier in der Nähe ist',need:20});
  if(S.b.climb) pool.push({id:'climb',text:'Klettere auf 3 Bäume',need:3});
  if(S.cub&&S.cub.grow<1) pool.push({id:'feed',text:'Bring deinem Jungen 6 Portionen Futter',need:6});
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)), t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
  S.goals={day:S.day||0,list:pool.slice(0,3).map(g=>Object.assign(g,{have:0,done:false}))};
  goalHtml=''; save();
}
function goalEvent(type,n,extra){
  if(!S.goals) return;
  for(const g of S.goals.list){
    if(g.done) continue;
    let add=0;
    if(type==='kill'){ if(g.id==='kill') add=1; else if(g.id==='sp:'+extra.sp) add=1; else if(g.id==='night'&&extra.night) add=1; else if(g.id==='herd'&&extra.herd) add=1; }
    else if(type===g.id) add=n||1;
    if(!add) continue;
    g.have=Math.min(g.need,g.have+add);
    if(g.have>=g.need){ g.done=true; const xp=Math.round(xpNeed(S.lvl)*0.3); snd.level();
      toast('Tagesziel erfüllt: '+g.text+' · +'+xp+' EP','#9be07f'); gainXp(xp); }
    goalHtml=''; save();
  }
}
let goalHtml='';
function renderGoals(){
  const el=$('goalBox'); if(!S.goals) newGoals();
  const L=S.goals.list, dn=L.filter(g=>g.done).length;
  const h='<div class="gh">Tagesziele '+dn+'/'+L.length+'</div>'+L.map(g=>'<div class="gl'+(g.done?' done':'')+'"><span>'+(g.done?'✔':'○')+'</span><span>'+g.text+(g.done||g.need<2?'':' ('+Math.floor(g.have)+'/'+g.need+')')+'</span></div>').join('');
  if(h!==goalHtml){ goalHtml=h; el.innerHTML=h; } el.style.display='block';
}

/* ---------- Spuren: Tiere hinterlassen Fährten; mit Witterung bleiben sie länger sichtbar. Raubtier-Fährten sind rötlich. ---------- */
const TRACK_N=500, _c3=new THREE.Color(), _tz=new THREE.Matrix4().makeScale(0,0,0), _tq2=new THREE.Quaternion(), _tY=new THREE.Vector3(0,1,0);
const trackMesh=(()=>{ const g=new THREE.CircleGeometry(1,7); g.rotateX(-Math.PI/2);
  const m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),TRACK_N);
  for(let i=0;i<TRACK_N;i++){ m.setMatrixAt(i,_tz); m.setColorAt(i,_c3.setHex(0x3a2a18)); }
  m.frustumCulled=false; m.renderOrder=1; scene.add(m); return m; })();
const tracks=new Array(TRACK_N).fill(null); let trackI=0, trackUpd=0;
const trackLife=()=>25+20*S.b.nose+(has('nase')?15:0);
function addTrack(a,side){
  const ang=a.g.rotation.y, s=a.sp.size, off=0.2*s*side, x=a.x+Math.cos(ang)*off, z=a.z-Math.sin(ang)*off;
  const pred=!!(a.sp.hunt&&S.lvl<a.sp.hunt);
  tracks[trackI]={x,z,y:H(x,z)+0.05,s:0.08+0.12*s,rot:ang,t:0};
  trackMesh.setColorAt(trackI,_c3.setHex(pred?0x6a1c10:0x3a2a18)); trackMesh.instanceColor.needsUpdate=true;
  trackI=(trackI+1)%TRACK_N;
}
function updateTracks(dt){
  trackUpd+=dt; if(trackUpd<0.2) return; const el=trackUpd; trackUpd=0;
  const life=trackLife(); let ch=false;
  for(let i=0;i<TRACK_N;i++){ const t=tracks[i]; if(!t) continue; t.t+=el; ch=true;
    if(t.t>=life){ tracks[i]=null; trackMesh.setMatrixAt(i,_tz); continue; }
    const f=Math.min(1,(life-t.t)/6)*t.s; _tq2.setFromAxisAngle(_tY,t.rot);
    _tm.compose(_tv.set(t.x,t.y,t.z),_tq2,_ts2.set(f*0.7,1,f)); trackMesh.setMatrixAt(i,_tm); }
  if(ch) trackMesh.instanceMatrix.needsUpdate=true;
}
const _ts2=new THREE.Vector3();

/* ---------- Trefferfeedback und Jagd-Ansicht ---------- */
// slowT: kurze Zeitlupe nach Hinterhalt und Beute; shakeA: Kamerawackeln; huntF: Kamera rückt beim Schleichen näher
G.slowT=0; G.shakeA=0; G.huntF=0;

/* ---------- Krokodile: lauern abgetaucht im Wasser, schnellen hervor, wenn du zu nah kommst, und ziehen sich danach zurück ---------- */
function crocStep(a,dt,d,dx,dz,stealth,hostile){
  const sp=a.sp, p=a.pond, wl=p.L-WATER_D;
  if(a.state==='lunge'){
    a.lt-=dt; moveAnimal(a,dx,dz,12+2*sp.size,dt);
    if(d<a.rad+0.9+pScale()*0.6&&a.cd<=0&&!P.safe){ a.cd=1.6; hurtPlayer(sp.dmg,a); a.lt=Math.min(a.lt,0.25); }
    if(a.lt<=0) a.state='return';
  } else if(a.state==='lurk'){
    a.timer-=dt;
    if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=Math.random()*p.r*0.65; a.tx=p.x+Math.cos(an)*r; a.tz=p.z+Math.sin(an)*r; a.timer=rnd(6,14); }
    moveAnimal(a,a.tx-a.x,a.tz-a.z,0.6,dt);
    a.near=hostile&&d<20;
    const reach=(4.5+2.5*sp.size)*Math.max(0.55,stealth);
    if(hostile&&!P.safe&&!dead&&a.cd<=0&&d<reach){ a.state='lunge'; a.lt=0.9; snd.croc(); puff(a.x,wl+0.3,a.z,0xd8ecf2,10,0.5); floatText('!',a.x,wl+sp.size*1.5,a.z,'#ff5a3c'); }
    if(d<30&&Math.random()<dt*0.6) puff(a.x+rnd(-0.6,0.6),wl+0.05,a.z+rnd(-0.6,0.6),0xe0f0f4,2,0.15);   // Luftblasen
  } else {
    const hx=p.x-a.x, hz=p.z-a.z, hd=Math.hypot(hx,hz);
    if(a.state==='chase'&&hd<p.r+14&&!P.safe&&!dead){   // angegriffen: verteidigt sich kurz am Ufer
      if(d>a.rad+1) moveAnimal(a,dx,dz,sp.spd*1.6,dt); else if(a.cd<=0){ a.cd=1.3; hurtPlayer(sp.dmg*0.7,a); }
      a.aggro-=dt; if(a.aggro<=0) a.state='return';
    } else if(hd>p.r*0.5) moveAnimal(a,hx,hz,sp.spd*(a.state==='flee'?1.6:1),dt);
    else { a.state='lurk'; a.timer=0; }
  }
  const inW=Math.hypot(a.x-p.x,a.z-p.z)<p.r*0.95, gy=H(a.x,a.z);
  a.g.position.set(a.x,inW&&a.state==='lurk'?Math.max(gy,wl-0.22*sp.size):gy,a.z);
}

/* Rudel: Hyänen und Schakale rufen ihre Artgenossen zur Jagd (je nach Schwierigkeit) */
const PACK={hyena:1,jack:1};
function recruitPack(a){ if(!PACK[a.sp.id]) return; const sm=SMART(); if(!sm) return;
  for(const o of animals){ if(o!==a&&!o.dead&&o.sp===a.sp&&o.state==='wander'&&Math.hypot(o.x-a.x,o.z-a.z)<45&&Math.random()<sm){ o.state='chase'; o.lost=0; o.sus=0; o.aggro=2; } } }

/* ---------- KI ---------- */
function moveAnimal(a,dx,dz,spd,dt){
  const l=Math.hypot(dx,dz)||1; dx/=l; dz/=l;
  a.x+=dx*spd*dt; a.z+=dz*spd*dt;
  const r=Math.hypot(a.x,a.z); if(r>WORLD){ a.x*=WORLD/r; a.z*=WORLD/r; }
  const cc=collide(a.x,a.z,a.rad*0.55,false); a.x=cc.x; a.z=cc.z;
  if(!a.sp.friend){ a.trk=(a.trk||0)+spd*dt; if(a.trk>0.9+a.sp.size*1.2){ a.trk=0; if(Math.abs(a.x-P.x)<70&&Math.abs(a.z-P.z)<70){ a.tside=-(a.tside||1); addTrack(a,a.tside); } } }
  let tr=Math.atan2(dx,dz), df=tr-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  a.g.rotation.y+=df*Math.min(1,dt*8);
  a.ph+=dt*(6+spd*1.3); animLegs(a.g,a.ph,Math.min(0.9,0.25+spd*0.05));
}
function updateAnimal(a,dt,stealth){
  if(a.dead){
    if(a.carc){ a.carc.t-=dt; if(a.carc.t<=0||a.carc.meat<=0){ a.carc=null; a.g.visible=false; a.g.rotation.z=0; } return; }
    a.respawn-=dt; if(a.respawn<=0) placeAnimal(a); return; }
  const sp=a.sp, dx=P.x-a.x, dz=P.z-a.z, d=Math.hypot(dx,dz);
  if(sp.friend){
    const fi=fam.indexOf(a);
    if(fi<3){ const r=famRole(fi); if(!r||!a.famOn){ a.g.visible=false; return; } famStep(a,dt,r); return; }
    if(!seeking()){ a.g.visible=false; return; }
  }
  if(d>VIEW_D&&a!==G.raider){ a.g.visible=false; return; } a.g.visible=d<=VIEW_D;
  a.cd-=dt; if(a.scared>0) a.scared-=dt;
  const hostile=sp.hunt&&S.lvl<sp.hunt&&!(a.scared>0);
  const detect=sp.sense*stealth*D().sense*(sp.pred?1+0.25*(1-dayF):1)*(d>0.1?windMulDir(-dx/d,-dz/d):1);
  if(sp.croc){ if(a.stun>0) a.stun-=dt; else crocStep(a,dt,d,dx,dz,stealth*D().sense,hostile);
    if(P.pounce>0&&!P.hit&&d<a.rad+0.5+pScale()*0.8){ P.hit=true; P.pounce=Math.min(P.pounce,0.08); hitAnimal(a); }
    return; }
  if(a.stun>0){ a.stun-=dt; animLegs(a.g,a.ph,0.05); }
  else if(a.state==='wander'){
    a.timer-=dt;
    if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=rnd(4,16); a.tx=a.x+Math.cos(an)*r; a.tz=a.z+Math.sin(an)*r;
      const cr=Math.hypot(a.tx,a.tz); if(cr<sp.ring[0]||cr>sp.ring[1]){ const k=(sp.ring[0]+sp.ring[1])/2/(cr||1); a.tx=a.x+(a.tx*k-a.x)*0.3; a.tz=a.z+(a.tz*k-a.z)*0.3; }
      a.timer=rnd(3,8); a.idle=Math.random()<0.4?rnd(1,3):0;
      if(a.herd){ const L=herdLead(a); if(L!==a){ a.tx=L.x+rnd(-7,7); a.tz=L.z+rnd(-7,7); a.timer=rnd(2,5); } } }
    const farH=a.herd&&Math.hypot(herdLead(a).x-a.x,herdLead(a).z-a.z)>16;
    if(a.idle>0&&!farH){ a.idle-=dt; animLegs(a.g,a.ph,0.03); } else moveAnimal(a,a.tx-a.x,a.tz-a.z,sp.spd*(farH?0.6:0.28),dt);
    a.near=false;
    if(hostile){
      a.near=d<detect*1.6+8;
      if(d<detect){
        if(a.sus<=0) snd.notice();
        a.sus+=dt*(0.3+0.85*(1-d/detect));
        if(a.sus>=1){ a.sus=0; a.near=false; a.state='chase'; a.lost=0; snd.alert(); recruitPack(a); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
      } else a.sus=Math.max(0,a.sus-dt*0.35);
    } else {
      a.sus=0;
      if(d<detect&&(!sp.fight||(sp.pred&&S.lvl>=sp.hunt+2&&d<detect*0.5))) startFlee(a);
    }
  }
  else if(a.state==='raid'){ raidStep(a,dt); }
  else if(a.state==='scav'){
    const c=a.carc;
    if(!c||!c.carc){ a.state='wander'; a.timer=0; a.carc=null; }
    else { const cx=c.x-a.x, cz=c.z-a.z, cd=Math.hypot(cx,cz), pd=Math.hypot(P.x-c.x,P.z-c.z);
      if(hostile&&!P.safe&&cd<25&&(pd<10||d<detect)){ a.state='chase'; a.lost=0; a.aggro=4; a.carc=null; snd.alert(); floatText('!',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ff5a3c'); }
      else if(!hostile&&d<9){ a.carc=null; startFlee(a); }          // vor einem starken Jäger weichen Aasfresser zurück
      else if(cd>c.rad+1.3) moveAnimal(a,cx,cz,sp.spd*0.75,dt);
      else { a.g.rotation.y=Math.atan2(cx,cz); animLegs(a.g,a.ph,0.04); a.eatT+=dt; if(a.eatT>3){ a.eatT=0; c.carc.meat--; } } }
  }
  else if(a.state==='fightFam'){
    const f=a.foe;
    if(!f||!f.famOn){ a.state='wander'; a.timer=0; a.foe=null; }
    else { const fx=f.x-a.x, fz=f.z-a.z, fd=Math.hypot(fx,fz);
      if(fd>a.rad+1.6) moveAnimal(a,fx,fz,sp.spd,dt); else { animLegs(a.g,a.ph,0.05); if(a.cd<=0){ a.cd=1.1; famHurt(f,sp.dmg||6); } } }
  }
  else if(a.state==='flee'){
    a.sus=0; a.near=false;
    a.fleeT+=dt; const tired=a.fleeT>6?0.72:1;
    let fx=-dx, fz=-dz; const r=Math.hypot(a.x,a.z);
    if(!sp.fight&&SMART()>0&&d>0.1){   // Haken schlagen: abrupt die Seite wechseln und ein Stück schräg weglaufen
      a.zzT=(a.zzT||0)-dt;
      if(a.zzT<=0){ a.zzT=rnd(1.4,4)*(0.8+sp.size*0.4);   // selten und zufällig: oft geradeaus, ab und zu ein Haken zu einer beliebigen Seite
        if(Math.random()<0.55*SMART()){ a.zzSide=Math.random()<0.5?1:-1; a.zzA=rnd(0.6,1.1); a.zzT=rnd(0.5,1.1); } else { a.zzSide=1; a.zzA=0; } }
      const th=a.zzSide*a.zzA, c=Math.cos(th), sn=Math.sin(th), ux=fx/d, uz=fz/d; fx=ux*c-uz*sn; fz=ux*sn+uz*c; }
    if(r>WORLD-25){ fx+=-a.z*1.5*(a.side||(a.side=Math.random()<.5?1:-1))-a.x*0.5; fz+=a.x*1.5*a.side-a.z*0.5; }
    moveAnimal(a,fx,fz,sp.spd*tired,dt);
    if(d>Math.max(detect,sp.sense*0.6)*2+18||a.fleeT>22){ a.state='wander'; a.timer=0; }
  }
  else if(a.state==='chase'){
    if(P.safe){
      a.aggro=0; a.lost+=dt;
      if(d>a.rad+3.5) moveAnimal(a,dx,dz,sp.spd*0.6,dt); else animLegs(a.g,a.ph,0.05);
      if(a.lost>({easy:2.5,normal:6,hard:12})[S.diff]){ a.state='wander'; a.timer=0; a.sus=0; a.scared=6; snd.lost(); floatText('?',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ddd'); }
      a.g.position.set(a.x,H(a.x,a.z),a.z); return;
    }
    if(a.aggro>0) a.aggro-=dt;
    const reach=a.rad+0.5+pScale()*0.7;
    let tx=dx, tz=dz;
    if(PACK[sp.id]&&SMART()>0&&d>6){   // Rudel kreist dich ein: jedes Tier nähert sich von einer anderen Seite
      const all=animals.filter(o=>!o.dead&&o.sp===sp&&o.state==='chase'&&Math.hypot(o.x-P.x,o.z-P.z)<40);
      if(all.length>1){ all.sort((p,q)=>p.uid-q.uid); const off=(all.indexOf(a)-(all.length-1)/2)*1.25*SMART();
        const ang=Math.atan2(a.x-P.x,a.z-P.z)+off*Math.min(1,(d-6)/10); tx=P.x+Math.sin(ang)*4-a.x; tz=P.z+Math.cos(ang)*4-a.z; } }
    if(d>reach*0.8) moveAnimal(a,tx,tz,sp.spd,dt); else animLegs(a.g,a.ph,0.05);
    if(d<reach&&a.cd<=0){ a.cd=1.1; hurtPlayer(sp.dmg,a); a.g.userData.inner.position.z=0.3; }
    if(a.aggro<=0){
      if(!hostile){ a.state='wander'; a.timer=0; }
      else { if(d>detect) a.lost+=dt; else a.lost=0; if(a.lost>3.5||d>75){ a.state='wander'; a.timer=0; if(d<50) snd.lost(); if(d<50) floatText('?',a.x,H(a.x,a.z)+sp.size*2.2,a.z,'#ddd'); } }
    }
  }
  const inn=a.g.userData.inner; inn.position.z*=0.85;
  a.g.position.set(a.x,H(a.x,a.z),a.z);
  // Sprungtreffer
  if(P.pounce>0&&!P.hit&&!sp.friend&&d<a.rad+0.5+pScale()*0.8){ P.hit=true; P.pounce=Math.min(P.pounce,0.08); hitAnimal(a); }
}

/* Versteck-Anzeige: Auge am Fadenkreuz + dunkler Bildrand. 0 = sichtbar, 1 = schwerer zu sehen, 2 = versteckt */
const EYES=[
  '<svg viewBox="0 0 24 24"><path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 12 H22 Q12 21 2 12 Z"/><path d="M8.8 12 A3.2 3.2 0 0 0 15.2 12 Z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M2 11 Q12 19 22 11"/><path d="M6 15.5 L4.5 18 M12 17 V20 M18 15.5 L19.5 18"/></svg>'
];
function setHide(lv){
  const e=$('eye'); e.innerHTML=EYES[lv]; e.style.color=lv===2?'#8fe07a':lv===1?'#f2b84b':'#fff'; e.style.opacity=lv===0?0:1;
  $('hideV').style.opacity=lv===2?1:lv===1?0.4:0;
  if(lv===2&&P.hideLv!==2) snd.rustle();
  P.hideLv=lv;
}
setHide(0);

/* ---------- Hauptschleife ---------- */
const rc=$('rc').getContext('2d');
G.last=performance.now(); G.uiT=0;
/* Leistung: Schattenkarte nur jedes zweite Bild, Auflösung passt sich der Bildrate an, Bildrate auf Wunsch anzeigen */
let autoRes=true, showFps=false, fpsN=0, fpsT=0, fpsVal=0, shadowTick=0;
try{ autoRes=localStorage.getItem('jaguar-autores')!=='0'; showFps=localStorage.getItem('jaguar-fps')==='1'; }catch(e){}
function setResLabel(){ $('btnAutoRes').textContent='Auflösung automatisch: '+(autoRes?'an':'aus'); $('btnFps').textContent='Bildrate anzeigen: '+(showFps?'an':'aus'); $('fps').style.display=showFps?'block':'none'; }
$('btnAutoRes').onclick=()=>{ autoRes=!autoRes; if(!autoRes){ G.pxScale=1; renderer.setPixelRatio(PX_BASE); } try{ localStorage.setItem('jaguar-autores',autoRes?'1':'0'); }catch(e){} setResLabel(); };
$('btnFps').onclick=()=>{ showFps=!showFps; try{ localStorage.setItem('jaguar-fps',showFps?'1':'0'); }catch(e){} setResLabel(); };
function perfTick(now){
  if(renderer.shadowMap.enabled&&sun.castShadow){ shadowTick++; if(shadowTick%2===0) renderer.shadowMap.needsUpdate=true; }
  if(!fpsT){ fpsT=now; fpsN=0; return; }
  fpsN++; const el=now-fpsT;
  if(el>=2000){
    if(el<4000){   // nach langer Pause (Tab im Hintergrund) nicht messen
      fpsVal=fpsN*1000/el;
      if(autoRes&&!G.paused){
        if(fpsVal<48&&G.pxScale>0.55){ G.pxScale=Math.max(0.55,G.pxScale-0.1); renderer.setPixelRatio(PX_BASE*G.pxScale); }
        else if(fpsVal>57&&G.pxScale<1){ G.pxScale=Math.min(1,G.pxScale+0.05); renderer.setPixelRatio(PX_BASE*G.pxScale); }
      }
      if(showFps) $('fps').textContent=Math.round(fpsVal)+' Bilder/s · Auflösung '+Math.round(G.pxScale*100)+' %';
    }
    fpsT=now; fpsN=0;
  }
}
/* ---------- Controller-Steuerung (Gamepad, Standardbelegung wie Xbox/PlayStation) ----------
   Linker Stick laufen · rechter Stick Kamera · A Sprung · B Schleichen · X Aktion · Y Klettern · LB Brüllen · RT/L3 Sprinten
   R3 Kamera hinter den Leoparden · Steuerkreuz hoch/runter Zoom · Start Menü · Back/Select Entwicklung.
   In Menüs: Steuerkreuz oder Stick wählt, A bestätigt, B geht zurück. Später steuert Controller N den Spieler N. */
let padX=0, padY=0, padSprint=false, padIdx=-1, padSynth=false, padNavT=0, padFocusEl=null;
const padPrev=[];
function padUI(){ return inputMode==='pad'; }   // als Funktion, weil die Anzeige sie schon vor diesem Abschnitt braucht
const PADDZ=0.2, pdz=v=>Math.abs(v)<PADDZ?0:(v-Math.sign(v)*PADDZ)/(1-PADDZ);
function rumble(strong,weak,ms){ try{ const gp=padIdx>=0&&navigator.getGamepads()[padIdx]; if(gp&&gp.vibrationActuator){ const r=gp.vibrationActuator.playEffect('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak}); if(r&&r.catch) r.catch(()=>{}); } }catch(e){} }
function pressKey(code){ padSynth=true; try{ window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code})); }catch(e){} padSynth=false; }
function topOverlay(){ for(const id of ['birth','dead','win','settings','regions','book','skills','menu','start']){ const el=$(id); if(el&&getComputedStyle(el).display!=='none') return el; } return null; }
function padButtons(ov){ return Array.from(ov.querySelectorAll('button,summary')).filter(b=>!b.disabled&&b.offsetParent!==null); }
function setPadFocus(el){ if(padFocusEl) padFocusEl.classList.remove('padf'); padFocusEl=el; if(el){ el.classList.add('padf'); try{ el.scrollIntoView({block:'nearest'}); }catch(e){} } }
function pollPads(dt){
  let gps; try{ gps=navigator.getGamepads?Array.from(navigator.getGamepads()):[]; }catch(e){ return; }
  for(const g of gps){ if(g&&g.connected&&g.index!==padIdx&&(g.buttons.some(b=>b.pressed)||g.axes.some(a=>Math.abs(a)>0.35))) padIdx=g.index; }
  const gp=padIdx>=0?gps[padIdx]:null;
  if(!gp){ padX=padY=0; padSprint=false; return; }
  const prev=padPrev[gp.index]||(padPrev[gp.index]=[]), B=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed), hit=i=>B(i)&&!prev[i];
  if(inputMode!=='pad'&&(gp.buttons.some(b=>b.pressed)||gp.axes.some(a=>Math.abs(a)>0.35))) setInputMode('pad');
  const ov=topOverlay();
  if(ov){
    padX=padY=0; padSprint=false;
    const btns=padButtons(ov); if(padFocusEl&&btns.indexOf(padFocusEl)<0) setPadFocus(null);
    const v=pdz(gp.axes[1]||0); padNavT-=dt; if(Math.abs(v)<0.3) padNavT=0;
    const up=hit(12)||(v<-0.6&&padNavT<=0), down=hit(13)||(v>0.6&&padNavT<=0);
    if((up||down)&&btns.length){ let i=btns.indexOf(padFocusEl); i=i<0?0:(i+(down?1:-1)+btns.length)%btns.length; setPadFocus(btns[i]); if(Math.abs(v)>0.6) padNavT=0.22; }
    if(hit(0)){ if(padFocusEl) padFocusEl.click(); else if(btns.length) setPadFocus(btns[0]); }
    if(hit(1)){ if(ov.id==='menu') toggleMenu(); else pressKey('Escape'); }
    if(hit(9)&&ov.id==='menu') toggleMenu();
    if(hit(8)&&ov.id==='skills') toggleSkills();
  } else {
    setPadFocus(null);
    padX=pdz(gp.axes[0]||0); padY=pdz(gp.axes[1]||0);
    padSprint=B(10)||!!(gp.buttons[7]&&gp.buttons[7].value>0.3);
    if(!G.paused){
      G.camYaw-=pdz(gp.axes[2]||0)*dt*2.8; G.camPitch=Math.max(0.08,Math.min(1.25,G.camPitch+pdz(gp.axes[3]||0)*dt*1.8));
      if(hit(0)) doPounce();
      if(hit(1)) P.sneak=!P.sneak;
      if(hit(2)) doContext();
      if(hit(3)) doClimb();
      if(hit(4)) doRoar();
      if(hit(11)) G.camYaw=P.rot+Math.PI;
      if(hit(12)) G.camZoom=Math.max(0.45,G.camZoom/1.15);
      if(hit(13)) G.camZoom=Math.min(2.6,G.camZoom*1.15);
    }
    if(hit(9)&&G.started) toggleMenu();
    if(hit(8)&&G.started) toggleSkills();
  }
  for(let i=0;i<gp.buttons.length;i++) prev[i]=B(i);
}
window.addEventListener('gamepadconnected',e=>{ toast('Controller verbunden: '+String(e.gamepad.id||'').split('(')[0].trim().slice(0,40),'#9be07f'); });
window.addEventListener('gamepaddisconnected',e=>{ if(e.gamepad.index===padIdx){ padIdx=-1; padX=padY=0; toast('Controller getrennt','#f2b84b'); } });

function frame(now){
  requestAnimationFrame(frame); perfTick(now);
  let dt=Math.min(0.05,(now-G.last)/1000); G.last=now;
  pollPads(dt);
  if(G.slowT>0){ G.slowT-=dt; dt*=0.25; }
  if(!G.paused) step(dt);
  updateCamera(); updateTrees(dt); updateEnv(dt,now); musicTick(); cullTiles();
  renderer.render(scene,camera);
}
function step(dt){
  // Kameratasten
  if(keys.ArrowLeft) G.camYaw+=dt*2; if(keys.ArrowRight) G.camYaw-=dt*2;
  if(keys.ArrowUp) G.camPitch=Math.max(0.08,G.camPitch-dt); if(keys.ArrowDown) G.camPitch=Math.min(1.25,G.camPitch+dt);
  // Bewegung
  let fw=(keys.KeyW?1:0)-(keys.KeyS?1:0)-G.joyY-padY, rt=(keys.KeyD?1:0)-(keys.KeyA?1:0)+G.joyX+padX;
  const il=Math.hypot(fw,rt); if(il>1){ fw/=il; rt/=il; }
  const s=Math.sin(G.camYaw), c=Math.cos(G.camYaw);
  let mx=-s*fw+c*rt, mz=-c*fw-s*rt;
  const moving=il>0.1&&P.tree==null;
  const wantSprint=(keys.ShiftLeft||keys.ShiftRight||G.tSprint||padSprint)&&moving&&!P.sneak;
  let sprint=wantSprint&&P.st>1;
  let spd=baseSpeed()*(sprint?1.6:P.sneak?0.45:1); if(P.wet) spd*=0.65;
  if(sprint) P.st-=20*dt; else P.st=Math.min(maxSt(),P.st+(12+2*at('sta'))*(S.hunger<25?0.5:1)*(moving?0.7:1.3)*dt);
  if(P.st<=1&&G.tSprint){ G.tSprint=false; $('tbS').classList.remove('on'); }
  const sc=pScale();
  if(P.tree!=null){
    const t=trees[P.tree]; P.climbT=Math.min(1,P.climbT+dt/(1.3-0.3*S.b.climb));
    const e=P.climbT*P.climbT*(3-2*P.climbT);
    const tx=t.x+t.perch[0], tz=t.z+t.perch[2]; P.x=P.fromX+(tx-P.fromX)*e; P.z=P.fromZ+(tz-P.fromZ)*e;
    if(P.climbT<1){ P.rot=Math.atan2(tx-P.fromX,tz-P.fromZ); P.walkT+=dt*14; }
    P.safe=P.climbT>0.5;
  } else if(P.pounce>0){
    P.pounce-=dt; if(P.pounce<=0) P.leap=false; const ps=19+3*S.b.jmp+baseSpeed()*0.5;
    P.x+=Math.sin(P.rot)*ps*dt; P.z+=Math.cos(P.rot)*ps*dt;
  } else if(moving){
    P.x+=mx*spd*dt; P.z+=mz*spd*dt;
    let tr=Math.atan2(mx,mz), df=tr-P.rot; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283; P.rot+=df*Math.min(1,dt*12);
  }
  const pr=Math.hypot(P.x,P.z); if(pr>WORLD){ P.x*=WORLD/pr; P.z*=WORLD/pr; }
  if(P.tree==null){ const c=collide(P.x,P.z,0.3+0.4*sc,P.pounce>0); P.x=c.x; P.z=c.z; }
  P.pcd=Math.max(0,P.pcd-dt); P.rcd=Math.max(0,P.rcd-dt); P.combatT=Math.max(0,P.combatT-dt);
  if(P.combatT<=0&&S.hunger>25) P.hp=Math.min(maxHp(),P.hp+maxHp()*0.015*dt);
  if(P.hurtT>0){ P.hurtT-=dt; if(P.hurtT<=0) $('hurt').style.opacity=0; }
  const jump=P.pounce>0?Math.sin(Math.PI*(1-P.pounce/P.pT))*1.1*sc:0;
  P.y=H(P.x,P.z);
  let up=0;
  if(P.tree!=null){ const t=trees[P.tree], e=P.climbT*P.climbT*(3-2*P.climbT); up=(t.y+t.perch[1]-P.y)*e; P.upNow=up; }
  else if(P.dropY>0){ P.dropY=Math.max(0,P.dropY-P.dropRate*dt); up=P.dropY; }
  P.camY=P.y+up;
  const climbing=P.tree!=null&&P.climbT<1;
  const g=P.g; g.scale.setScalar(sc); g.position.set(P.x,P.y+jump+up,P.z); g.rotation.y=P.rot;
  g.userData.inner.position.y+=(((P.sneak&&P.pounce<=0)?-0.16:0)-g.userData.inner.position.y)*Math.min(1,dt*10);
  g.userData.inner.rotation.x=climbing?-1.1:P.pounce>0?(P.leap?0.35:-0.3):0;
  if(climbing) animLegs(g,P.walkT,0.7); else if(moving||P.pounce>0){ P.walkT+=dt*(5+spd*1.4); animLegs(g,P.walkT,P.pounce>0?1.1:sprint?0.85:P.sneak?0.3:0.55); } else animLegs(g,P.walkT,0.02);
  if(moving&&P.pounce<=0){ P.stepT=(P.stepT||0)-dt*(sprint?1.7:P.sneak?0.55:1); if(P.stepT<=0){ P.stepT=0.3; if(P.wet) snd.splash(); else snd.step(P.sneak?0.04:sprint?0.2:0.12); } }
  G.birdT-=dt; if(G.birdT<=0){ G.birdT=rnd(4,11); snd.bird(); }
  // Tarnung
  const grass=inGrass(P.x,P.z); P.wet=P.tree==null&&inWater(P.x,P.z);
  let st=1; if(P.sneak) st*=0.5; if(sprint) st*=1.3; if(grass) st*=P.sneak?0.3:(0.32+0.38*Math.min(1,(S.lvl-1)/7)); st*=(1-0.05*at('cam'))*(has('dunkel')?0.8:1)*(S.fur&&S.fur.albino?1.15:S.fur&&S.fur.melan?0.9:1); st*=0.8+0.025*S.lvl; st*=0.7+0.3*dayF; st*=1-0.25*W.rain; if(P.safe) st=0;
  P.hidden=st; P.grass=grass;
  { const lv=(P.safe||(grass&&(P.sneak||S.lvl<4)))?2:(grass||P.sneak)?1:0; if(lv!==P.hideLv) setHide(lv);
    if(lv===2&&S.goals&&S.goals.list.some(g=>g.id==='hide'&&!g.done)&&animals.some(a=>!a.dead&&a.sp.hunt&&S.lvl<a.sp.hunt&&Math.hypot(a.x-P.x,a.z-P.z)<25)) goalEvent('hide',dt); }
  updateWeather(dt);
  for(let i=0;i<animals.length;i++) updateAnimal(animals[i],dt,st);
  for(let i=puffs.length-1;i>=0;i--){ const p=puffs[i]; p.t-=dt; p.vy-=12*dt; p.m.position.x+=p.vx*dt; p.m.position.y+=p.vy*dt; p.m.position.z+=p.vz*dt; p.m.material.opacity=Math.max(0,p.t/0.7); if(p.t<=0){ scene.remove(p.m); p.m.material.dispose(); puffs.splice(i,1); } }
  if(G.toastT>0){ G.toastT-=dt; G.toastShown+=dt; if(G.toastT<=0){ if(toastQ.length){ const q=toastQ.shift(); showToast(q[0],q[1]); } else $('toast').style.opacity=0; } }
  if(G.lastHitT>0) G.lastHitT-=dt;
  updateWarn(dt); updateCross(); updateTracks(dt); updateFamily(dt); updateCub(dt); updateFamArrow(dt); updateLife(dt); updateDayNight(dt);
  if(G.noStT>0){ G.noStT-=dt; if(G.noStT<=0) $('crossMsg').style.opacity=0; }
  G.uiT-=dt; if(G.uiT<=0){ G.uiT=0.1; updateUI(); }
  drawRadar();
}
const waPool=[]; let beatT=0;
function updateWarn(dt){
  const ring=$('warnRing'), R=Math.min(window.innerWidth,window.innerHeight)*0.33, s=Math.sin(G.camYaw), c=Math.cos(G.camYaw);
  let n=0, top=null, topV=-1, maxSus=0;
  for(const a of animals){
    if(a.dead||!a.sp.fight) continue;
    const chase=a.state==='chase'||a.state==='lunge';
    let v; if(chase) v=2; else if(a.state==='wander'&&a.sus>0) v=a.sus; else if(a.state==='wander'&&a.near) v=0; else if(a.state==='scav'&&a.sp.hunt&&S.lvl<a.sp.hunt&&Math.hypot(a.x-P.x,a.z-P.z)<90) v=0.3; else if(a.state==='lurk'&&a.near) v=0; else continue;
    const dx=a.x-P.x, dz=a.z-P.z, d=Math.hypot(dx,dz); if(chase&&d>80) continue;
    const ang=Math.atan2(dx*c-dz*s,-(dx*s+dz*c));
    let el=waPool[n]; if(!el){ el=document.createElement('div'); el.className='wa'; ring.appendChild(el); waPool.push(el); } n++;
    el.style.display='block';
    el.style.borderBottomColor=chase?'#ff4a30':'hsl('+(48-34*v)+',92%,'+(60-6*v)+'%)';
    el.classList.toggle('ch',chase);
    el.style.transform='rotate('+ang+'rad) translateY('+(-R)+'px) scale('+(chase?1.25:0.75+0.5*v)+')';
    const pr=v+(1-Math.min(d,100)/1000);
    if(pr>topV){ topV=pr; top=a; top._v=v; top._d=d; }
    if(!chase&&v>maxSus) maxSus=v;
  }
  for(let i=n;i<waPool.length;i++) waPool[i].style.display='none';
  const w=$('warn');
  if(top){
    const v=top._v, nm=top.sp.n, m=Math.round(top._d)+' m';
    w.style.display='block'; $('warnBar').style.display=(v>0&&v<2)?'block':'none';
    if(v>=2){ $('warnTxt').textContent='⚠ '+nm+' jagt dich! ('+m+')'; w.style.color='#ff6a50'; }
    else if(v>0){ $('warnTxt').textContent='⚠ '+nm+' wird misstrauisch – zieh dich zurück! ('+m+')'; w.style.color='#ffb04a'; $('bW').style.width=(v*100)+'%'; }
    else { $('warnTxt').textContent=nm+' in der Nähe – noch unbemerkt ('+m+')'; w.style.color='#f2d04b'; }
  } else w.style.display='none';
  beatT-=dt; if(maxSus>0&&beatT<=0){ beatT=0.95-0.6*maxSus; snd.beat(maxSus); }
}
function updateCamera(){
  G.huntF+=(((P.sneak&&P.tree==null&&!dead&&!G.paused)?1:0)-G.huntF)*0.06;
  const sc=pScale(), dist=(5+sc*6.5)*G.camZoom*(1-0.3*G.huntF), ty=P.camY+sc*1.1+dist*0.16;
  const fov=60-8*G.huntF; if(Math.abs(camera.fov-fov)>0.05){ camera.fov=fov; camera.updateProjectionMatrix(); }
  const cp=Math.cos(G.camPitch);
  let cx=P.x+Math.sin(G.camYaw)*dist*cp, cz=P.z+Math.cos(G.camYaw)*dist*cp, cy=ty+Math.sin(G.camPitch)*dist;
  cy=Math.max(cy,H(cx,cz)+0.6);
  if(G.shakeA>0){ cx+=(Math.random()-0.5)*G.shakeA; cy+=(Math.random()-0.5)*G.shakeA; cz+=(Math.random()-0.5)*G.shakeA; G.shakeA=Math.max(0,G.shakeA*0.86-0.005); }
  camera.position.set(cx,cy,cz); camera.lookAt(P.x,ty,P.z);
}
function updateCross(){
  // Fadenkreuz leuchtet, wenn ein Tier in Sprungrichtung und -reichweite ist
  const fx=-Math.sin(G.camYaw), fz=-Math.cos(G.camYaw), sc=pScale();
  const range=(19+3*S.b.jmp+baseSpeed()*0.5)*(0.38+0.04*S.b.jmp);
  let on=false;
  for(const a of animals){ if(a.dead||a.sp.friend||!a.g.visible) continue; const dx=a.x-P.x, dz=a.z-P.z, along=dx*fx+dz*fz;
    if(along<0||along>range+a.rad) continue; const side=Math.abs(dx*fz-dz*fx);
    if(side<a.rad+0.5+sc*0.8){ on=true; break; } }
  const low=P.st<15, cr=$('cross'), ring=$('stRing'), fr=Math.max(0,Math.min(1,P.st/maxSt()));
  cr.classList.toggle('on',on&&P.pcd<=0&&!low); cr.classList.toggle('no',low);
  $('stArc').style.strokeDashoffset=169.65*(1-fr);
  ring.classList.toggle('low',low);
  ring.style.opacity=low?1:Math.max(0,Math.min(1,(0.5-fr)/0.2))*0.9;
}
function updateUI(){
  $('lvl').textContent='Stufe '+S.lvl+(S.gen>1?' · Gen. '+S.gen:'');
  renderGoals();
  $('size').textContent=(W.rain>0.3?(W.storm?'⛈ ':'☔ '):dayF>0.5?'☀ ':'☾ ')+clockStr()+' · '+(S.lvl<4?'Jungtier':S.lvl<8?'Halbstark':oldF()>0?'Alt':S.lvl<12?'Ausgewachsen':'Alpha')+(S.lvl>=8?' · noch '+Math.max(1,Math.ceil((DIE_AT()-S.age)/60))+' min':'');
  $('bHu').style.width=S.hunger+'%'; $('bHu').classList.toggle('low',S.hunger<25); $('tHu').textContent=S.hunger<=0?'verhungert!':S.hunger<25?'hungrig':Math.round(S.hunger)+' %';
  const mh=maxHp(), ms=maxSt(), xn=xpNeed(S.lvl);
  $('bHp').style.width=Math.max(0,P.hp/mh*100)+'%'; $('tHp').textContent=Math.ceil(P.hp)+' / '+mh;
  $('bSt').style.width=Math.max(0,P.st/ms*100)+'%'; $('tSt').textContent=Math.floor(P.st)+' / '+ms;
  $('bXp').style.width=(S.xp/xn*100)+'%'; $('tXp').textContent=S.xp+' / '+xn;
  const stEl=$('status');
  const nt=(S.b.climb>0&&P.tree==null)?nearestTree():-1;
  const sm=(touchUI()||padUI()||window.innerWidth<=820||window.innerHeight<=520)&&!hudExp;
  const setSt=(long,short,col)=>{ stEl.textContent='● '+(sm?short:long); stEl.style.color=col; };
  const ctx=context();
  if(ctx) setSt('F: '+ctx.label,ctx.label+' möglich','#ff9ad0');
  else if(P.tree!=null){ if(P.safe) setSt('Sicher auf dem Baum – E: runter · Leertaste: Sprung von oben','Sicher auf dem Baum','var(--green)'); else setSt('Klettert …','Klettert …','var(--green)'); }
  else if(nt>=0) setSt('Baum in Reichweite – E zum Klettern','Baum: klettern','var(--green)');
  else if(P.grass&&(P.sneak||S.lvl<4)) setSt(P.sneak?'Versteckt im hohen Gras':'Versteckt im hohen Gras – als Jungtier auch ohne Schleichen','Versteckt','var(--green)');
  else if(P.grass) setSt('Im Gras – schleiche (C), um dich zu verstecken','Im Gras – schleichen!','var(--mut)');
  else if(P.sneak) setSt('Schleicht','Schleicht','var(--gold)');
  else setSt('Sichtbar','Sichtbar','var(--mut)');
  // Familie
  const cb=$('cubBox'), cu=S.cub;
  const kid=kidMode();
  if(cu||S.preg>0||(canMate()&&seekT<15)||kid){
    cb.style.display='block'; $('cubBars').style.display=cu&&cu.grow<1?'block':'none'; let msg='';
    if(cu&&cu.grow<1){
      $('cubT').textContent='Junges · satt '+Math.round(cu.full)+' % · groß '+Math.round(cu.grow*100)+' %'; $('foodT').textContent='Futter '+S.food+'/'+FOOD_MAX;
      $('bCf').style.width=cu.full+'%'; $('bCg').style.width=(cu.grow*100)+'%';
      msg=G.raider?(G.raider.found?'⚠ Dein Junges wird angegriffen!':'⚠ Räuber sucht dein Junges!'):cu.hp<1?'Leben des Jungen: '+Math.max(0,Math.round(cu.hp*100))+' %':cu.full<25?'Dein Junges hat Hunger':'';
    } else if(cu){ $('cubT').textContent='Nachwuchs ausgewachsen'; $('foodT').textContent='dein Erbe'; }
    else if(S.preg>0){ $('cubT').textContent='Junges kommt bald im Bau zur Welt'; $('foodT').textContent=''; }
    else if(canMate()){ $('cubT').textContent=S.partner?'Dein Partner wartet':'Partner suchen'; $('foodT').textContent='rosa Punkt auf der Spürkarte'; }
    else { $('cubT').textContent='Eltern: '+((S.p1?1:0)+(S.p2?1:0)); $('foodT').textContent='bringen Futter'; }
    $('cubMsg').textContent=msg;
  } else cb.style.display='none';
  if(touchUI()){ const fb=$('tbF'); fb.style.display=ctx?'block':'none'; if(ctx) fb.textContent=ctx.label; }
  const ch=$('ctxHint'); ch.style.display=ctx?'block':'none'; if(ctx) ch.innerHTML=padUI()?xb('Ⓧ')+' – '+esc(ctx.label):touchUI()?'Rosa Knopf: '+esc(ctx.label):'F – '+esc(ctx.label);
  $('tapHelp').style.display=(touchUI()&&G.started&&!G.paused&&tapLearned<2)?'block':'none';
  const pe=$('pts'); if(S.pts>0){ pe.style.display='block'; pe.textContent=S.pts+' Punkt'+(S.pts===1?'':'e')+(sm?' ▸':' zu vergeben – Tab'); } else pe.style.display='none';
  $('cdP').style.width=(1-P.pcd/1.3)*100+'%';
  $('cdRbox').style.opacity=S.b.roar?1:0.35; $('cdR').style.width=S.b.roar?(1-P.rcd/(22-3*S.b.roar))*100+'%':'0%';
  $('cdEbox').style.opacity=S.b.climb?1:0.35; $('cdE').style.width=(P.tree!=null?P.climbT*100:nt>=0?100:0)+'%';
  if(touchUI()){ $('tbE').style.opacity=S.b.climb?1:0.35; $('tbE').classList.toggle('on',P.tree!=null); $('tbC').classList.toggle('on',P.sneak); $('tbR').style.opacity=S.b.roar?1:0.35; }
  // Ziel
  let best=null, bd=28;
  if(G.lastHitT>0&&G.lastHit&&!G.lastHit.dead) best=G.lastHit;
  else for(const a of animals){ if(a.dead||!a.g.visible) continue; const d=Math.hypot(a.x-P.x,a.z-P.z); if(d<bd){ bd=d; best=a; } }
  const te=$('target');
  if(best){ te.style.display='block'; $('tName').textContent=(best.fur&&best.fur.albino?'Albino-':'')+best.sp.n; $('bT').style.width=Math.max(0,best.hp/best.sp.hp*100)+'%';
    const tg=$('tTag'); const hostile=best.sp.hunt&&S.lvl<best.sp.hunt;
    if(best.sp.friend){ const fi=fam.indexOf(best); tg.textContent=fi===0?'· dein Partner':fi<3?'· dein Elterntier':'· Artgenosse'; tg.style.color='#ff9ad0'; }
    else if(hostile){ tg.textContent='· Gefahr – jagt dich!'; tg.style.color='var(--red)'; }
    else if(best.sp.fight){ tg.textContent='· wehrt sich'; tg.style.color='var(--gold)'; }
    else { tg.textContent='· Beute'; tg.style.color='var(--green)'; }
  } else te.style.display='none';
}
/* Spürkarte: Gras, Wasser und Bau sind einmal in ein großes Hintergrundbild gezeichnet; pro Bild wird nur noch dieses
   verschoben und gedreht und die Tiere in vier Farbgruppen darübergelegt. Wird jedes Bild neu gezeichnet statt 10-mal pro Sekunde. */
const radarBg=document.createElement('canvas'), RB=2, RW=256;   // 2 Pixel pro Meter, Welt von -256 bis 256
radarBg.width=radarBg.height=RW*2*RB;
(function(){ const c=radarBg.getContext('2d'); c.scale(RB,RB); c.translate(RW,RW);
  c.fillStyle='rgba(120,190,90,.35)'; c.beginPath(); for(const p of patches){ c.moveTo(p.x+p.r,p.z); c.arc(p.x,p.z,p.r,0,6.283); } c.fill();
  c.fillStyle='rgba(90,160,200,.55)'; c.beginPath(); for(const p of PONDS){ c.moveTo(p.x+p.r,p.z); c.arc(p.x,p.z,p.r,0,6.283); } c.fill();
  c.fillStyle='#ddd'; c.fillRect(-5,-5,10,10);
})();
let radarPx=0; const RADAR_COL=['#ff7ab8','#ff5a3c','#f2b84b','#9be07f'];
function drawRadar(){
  const cv=$('rc'), css=cv.clientWidth||140, want=Math.round(css*Math.min(window.devicePixelRatio||1,2));
  if(want>0&&want!==radarPx){ radarPx=want; cv.width=cv.height=want; }
  const W=cv.width||280, R=45+22*S.b.nose+(has('nase')?25:0), k=W/2/R, sc=W/280;
  rc.setTransform(1,0,0,1,0,0); rc.clearRect(0,0,W,W); rc.fillStyle='rgba(30,50,25,.55)'; rc.fillRect(0,0,W,W);
  rc.save(); rc.translate(W/2,W/2); rc.rotate(G.camYaw);
  rc.save(); rc.scale(k/RB,k/RB); rc.drawImage(radarBg,-(P.x+RW)*RB,-(P.z+RW)*RB); rc.restore();
  if(S.cub){ const dx=cub.x-P.x, dz=cub.z-P.z; if(dx*dx+dz*dz<R*R){ rc.fillStyle='#ff7ab8'; rc.fillRect(dx*k-6*sc,dz*k-6*sc,12*sc,12*sc); } }
  for(let g=0;g<4;g++){
    rc.fillStyle=RADAR_COL[g]; rc.beginPath(); let any=false;
    for(let i=0;i<animals.length;i++){ const a=animals[i]; if(a.dead||(a.sp.friend&&!a.g.visible)) continue; if(a.state==='lurk'&&Math.abs(a.x-P.x)+Math.abs(a.z-P.z)>18) continue;
      const hostile=a.sp.hunt&&S.lvl<a.sp.hunt, grp=a.sp.friend?0:hostile?1:a.sp.fight?2:3; if(grp!==g) continue;
      const dx=a.x-P.x, dz=a.z-P.z; if(dx*dx+dz*dz>R*R) continue;
      const r=Math.max(4,a.sp.size*6)*sc; rc.moveTo(dx*k+r,dz*k); rc.arc(dx*k,dz*k,r,0,6.283); any=true; }
    if(any) rc.fill();
  }
  rc.fillStyle='#b07040'; for(const a of animals){ if(!a.carc) continue; const dx=a.x-P.x, dz=a.z-P.z; if(dx*dx+dz*dz<R*R) rc.fillRect(dx*k-4*sc,dz*k-4*sc,8*sc,8*sc); }
  rc.restore();
  // Wahrnehmungskreis: ab hier bemerken dich Raubtiere (rot) bzw. Beute (grün); schrumpft beim Schleichen und im Gras
  let sense=0; for(const sp of SPECIES){ if(sp.hunt&&S.lvl<sp.hunt&&sp.sense>sense) sense=sp.sense; }
  const danger=sense>0; if(!danger) sense=24;
  const base=sense*P.hidden*D().sense;
  rc.save(); rc.translate(W/2,W/2); rc.rotate(G.camYaw);
  if(base*k>3){ rc.strokeStyle=danger?'rgba(255,110,80,.9)':'rgba(155,224,127,.9)'; rc.lineWidth=3*sc; rc.setLineDash([9*sc,7*sc]); rc.beginPath();
    for(let i=0;i<=48;i++){ const t=i/48*6.283, ux=Math.cos(t), uz=Math.sin(t), r=Math.min(base*windMulDir(ux,uz),R)*k; if(i) rc.lineTo(ux*r,uz*r); else rc.moveTo(ux*r,uz*r); }
    rc.stroke(); rc.setLineDash([]); }
  // Windpfeil am Rand: zeigt, wohin der Wind weht
  { const wx=windU.value.x, wz=windU.value.y, rr=W*0.4, bx=-wx*rr, bz=-wz*rr, px=-wz, pz=wx, L=14*sc;
    rc.fillStyle='rgba(150,205,255,.95)'; rc.beginPath(); rc.moveTo(bx+wx*L,bz+wz*L); rc.lineTo(bx+px*L*0.55,bz+pz*L*0.55); rc.lineTo(bx-px*L*0.55,bz-pz*L*0.55); rc.fill(); }
  rc.restore();
  rc.fillStyle='#fff'; rc.beginPath(); rc.moveTo(W/2,W/2-11*sc); rc.lineTo(W/2+7*sc,W/2+8*sc); rc.lineTo(W/2-7*sc,W/2+8*sc); rc.fill();
}
applyQuality();
setInputMode(inputMode); setResLabel(); if(!S.goals) newGoals();
updateUI();
drawRadar();
requestAnimationFrame(frame);
