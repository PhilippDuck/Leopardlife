// LeopardLife – Pflanzen: Bäume (mit Ausblenden vor der Kamera), Büsche, Felsen, Stämme, Blumen, Bodengras, hohes Gras als Versteck und die Felsen am Bau.
import { camera, grassLight, scene, windU } from './engine.js';
import { REG, pScale } from './save.js';
import { G } from './state.js';
import { GLSL_H, GLSL_PONDMASK, H, PONDS, WORLD, addCol, pondAt, registerTile, tileOf } from './terrain.js';
import { rnd } from './util.js';
import { P } from './player.js';

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

G.grassGeo=null; G.grassMat=null;   // werden unten beim Anlegen des Bodengrases gesetzt
// Größte Zahl an Bodengras-Büscheln (Stufe „ultra“); niedrigere Stufen zeichnen weniger
const GRASS_N=30000;
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
function inGrass(x,z){ for(let i=0;i<patches.length;i++){ const p=patches[i], dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<p.r*p.r) return true; } return false; }

/* Bau (Startpunkt) */
(function(){
  const mat=new THREE.MeshLambertMaterial({color:0x8a8a80});
  [[-3,0,-3,2.2],[-0.5,0,-4.2,2.8],[2.2,0,-3.2,2]].forEach(r=>{ const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r[3],0),mat); m.position.set(r[0],H(r[0],r[2])+r[3]*0.5,r[2]); m.rotation.set(Math.random(),Math.random(),0); m.castShadow=true; m.receiveShadow=true; scene.add(m); addCol(r[0],r[2],r[3]*0.9); });
})();

export { _tm, _tv, inGrass, leafGeoHi, leafGeoLo, leafMeshes, leafTime, patches, tallGeo, tallMat, trees, updateTrees };
