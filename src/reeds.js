// LeoLife – Schilf: Büschel aus schmalen Blättern und Rohrkolben, nur am Ufer von Wasserlöchern, Fluss und See (auch flach im Wasser).
// In feuchten Gegenden (swampFactor) steht es dichter. Gruppen von Büscheln sind Verstecke wie hohes Gras.
import { windU } from './engine.js';
import { seeded, snoise } from './noise.js';
import { H, LAKE_D, PONDS, WATER_D, dryness, riverNear, swampFactor, worldPond } from './terrain.js';
import { kopjeNear } from './kopjesites.js';

/* ---------- Ein Büschel (Low-Poly, flache Flächen, Farbe je Fläche); mit oder ohne Halme mit Rohrkolben ---------- */
function reedGeometry(heads){
  const r=seeded(0x5c41f), rr=(a,b)=>a+r()*(b-a), pos=[], col=[], c=new THREE.Color();
  const tri=(a,b,d,color)=>{ pos.push(...a,...b,...d); for(let i=0;i<3;i++) col.push(color.r,color.g,color.b); };
  const quad=(a,b,d,e,color)=>{ tri(a,b,d,color); tri(a,d,e,color); };
  // Blätter: schmale, nach außen gebogene Streifen, unten dunkler
  for(let i=0;i<9;i++){
    const a=i/9*6.283+rr(-0.3,0.3), ca=Math.cos(a), sa=Math.sin(a), bx=ca*rr(0,0.22), bz=sa*rr(0,0.22);
    const h=rr(1.05,1.85), lean=rr(0.25,0.6), w=rr(0.05,0.075), tw=a+rr(-0.4,0.4), px=-Math.sin(tw), pz=Math.cos(tw);
    const at=t=>{ const out=lean*h*t*t; return [bx+ca*out,h*t,bz+sa*out]; };
    const hue=rr(0.2,0.27), sat=rr(0.35,0.5), lit=rr(0.3,0.4);
    let L=at(0), wl=w;
    for(let s=1;s<=3;s++){
      const t=s/3, P=at(t), wn=w*(1-t)*1.1, k=0.75+0.25*t;
      c.setHSL(hue,sat,lit*k);
      const A=[L[0]-px*wl,L[1],L[2]-pz*wl], B=[L[0]+px*wl,L[1],L[2]+pz*wl];
      if(s<3) quad(A,B,[P[0]+px*wn,P[1],P[2]+pz*wn],[P[0]-px*wn,P[1],P[2]-pz*wn],c); else tri(A,B,P,c);
      L=P; wl=wn;
    }
  }
  // Halme mit Rohrkolben (braun) und dünner Spitze
  for(let i=0;i<(heads?3:0);i++){
    const a=i/3*6.283+rr(-0.5,0.5), x=Math.cos(a)*rr(0.04,0.16), z=Math.sin(a)*rr(0.04,0.16), h=rr(1.6,2.25), lx=rr(-0.12,0.12), lz=rr(-0.12,0.12);
    const top=[x+lx,h,z+lz], hb=h*0.8;
    c.setHSL(0.18,0.32,0.36);
    for(const d of [[0.018,0],[0,0.018]]) quad([x-d[0],0,z-d[1]],[x+d[0],0,z+d[1]],[top[0]+d[0],hb,top[2]+d[1]],[top[0]-d[0],hb,top[2]-d[1]],c);
    // Kolben: sechsseitige Säule
    const rk=0.05, y0=hb, y1=hb+0.32; c.setHSL(0.07,rr(0.45,0.55),rr(0.2,0.26));
    for(let k=0;k<6;k++){
      const a0=k/6*6.283, a1=(k+1)/6*6.283, p0=[top[0]+Math.cos(a0)*rk,0,top[2]+Math.sin(a0)*rk], p1=[top[0]+Math.cos(a1)*rk,0,top[2]+Math.sin(a1)*rk];
      quad([p0[0],y0,p0[2]],[p1[0],y0,p1[2]],[p1[0],y1,p1[2]],[p0[0],y1,p0[2]],c);
      tri([p0[0],y1,p0[2]],[p1[0],y1,p1[2]],[top[0],y1+0.04,top[2]],c);
    }
    c.setHSL(0.18,0.3,0.4);
    quad([top[0]-0.01,y1,top[2]],[top[0]+0.01,y1,top[2]],[top[0]+0.004,y1+0.16,top[2]],[top[0]-0.004,y1+0.16,top[2]],c);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
/** Büschel nur aus Blättern und Büschel mit Rohrkolben */
const reedGeos=[reedGeometry(false),reedGeometry(true)];

/** Zeit für das Wiegen im Wind (wird vor dem Zeichnen gesetzt) */
const reedTime={value:0};
const reedMaterial=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide});
reedMaterial.onBeforeCompile=sh=>{   // je höher, desto stärker wiegt sich das Schilf
  sh.uniforms.uTime=reedTime; sh.uniforms.uWind=windU;
  sh.vertexShader='uniform float uTime; uniform vec2 uWind;\n'+sh.vertexShader.replace('#include <project_vertex>',
    'vec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp=instanceMatrix*wp;\n#endif\n wp=modelMatrix*wp;\n'+
    ' float hk=max(0.0,transformed.y); float sw=sin(uTime*1.6+wp.x*0.35+wp.z*0.29)*0.6+sin(uTime*3.3+wp.x*0.9+wp.z*0.4)*0.25;\n'+
    ' wp.xz+=uWind*(sw+0.6)*hk*hk*0.05;\n vec4 mvPosition=viewMatrix*wp;\n gl_Position=projectionMatrix*mvPosition;');
};
const reedTick=()=>{ reedTime.value=performance.now()/1000; };

/** Abstand zur Wasserlinie (negativ im Wasser): Wasserlöcher des Startgebiets, Tümpel der weiten Welt, Fluss (nur wo er Wasser führt) und See.
    Die Becken sind zur Mitte hin gewölbt (Tiefe D unter dem Pegel): Das Wasser (WATER_D unter dem Pegel) reicht bis r·√(1−WATER_D/D). */
const edge=D=>Math.sqrt(Math.max(0,1-WATER_D/D));
function shoreDist(x,z){
  const r=riverNear(x,z); let e=r.ld-r.lr*edge(LAKE_D);   // sofort auslesen: riverNear liefert ein geteiltes Objekt
  if(r.w>1.2&&r.cd<1e8) e=Math.min(e,r.cd-r.w*edge(r.D));
  for(let i=0;i<PONDS.length;i++){ const p=PONDS[i]; e=Math.min(e,Math.hypot(x-p.x,z-p.z)-p.r*edge(1)); }
  const w=worldPond(x,z); if(w) e=Math.min(e,Math.hypot(x-w.x,z-w.z)-w.r*edge(1));
  return e;
}

/**
 * Sucht Schilfplätze im Rechteck x0…x1, z0…z1: ein Raster mit Versatz, nur im Uferstreifen und dort in Gruppen (Rauschen).
 * @param {(x:number,z:number)=>boolean} [skip] Stellen, an denen nichts wachsen soll
 * @returns {{x:number,z:number,y:number,a:number,s:number,h:number,dry:number}[]}
 */
function reedSpots(x0,z0,x1,z1,rng,skip){
  const out=[], step=1.3, cell=step*6;
  for(let cx=x0;cx<x1;cx+=cell) for(let cz=z0;cz<z1;cz+=cell){
    if(shoreDist(cx+cell/2,cz+cell/2)>1.7+cell*0.75) continue;   // ganzes Feld weit weg vom Wasser: überspringen
    for(let x=cx+step/2;x<Math.min(cx+cell,x1);x+=step) for(let z=cz+step/2;z<Math.min(cz+cell,z1);z+=step){
    const px=x+(rng()-0.5)*step, pz=z+(rng()-0.5)*step, e=shoreDist(px,pz);
    if(e<-0.9||e>1.7) continue;
    const wet=swampFactor(px,pz), n=snoise(px/11+3.1,pz/11-7.4);
    if(n<-0.1-0.55*wet) continue;   // in Gruppen, in feuchten Gegenden fast durchgehend
    if(kopjeNear(px,pz,1)||(skip&&skip(px,pz))) continue;
    // Rohrkolben in Gruppen mit Freiraum dazwischen: etwa jeder zweite Büschel, nach grobem Rauschen
    const heads=snoise(px/7-11.3,pz/7+5.9)>0.12;
    out.push({x:px,z:pz,y:H(px,pz),a:rng()*6.283,s:0.95+rng()*0.5,h:0.85+rng()*0.4,dry:dryness(px,pz),heads});
  } }
  return out;
}

/** Instanz-Modelle aus Schilfplätzen (Gruppe: Büschel ohne und mit Rohrkolben; gefärbt: im Trockenen gelblicher) */
function reedMesh(spots,rng){
  const group=new THREE.Group(), m=new THREE.Matrix4(), q=new THREE.Quaternion(), v=new THREE.Vector3(), s=new THREE.Vector3(), c=new THREE.Color(), UP=new THREE.Vector3(0,1,0);
  [false,true].forEach((heads,gi)=>{
    const list=spots.filter(p=>!!p.heads===heads); if(!list.length) return;
    const mesh=new THREE.InstancedMesh(reedGeos[gi],reedMaterial,list.length);
    list.forEach((p,i)=>{
      m.compose(v.set(p.x,p.y-0.05,p.z),q.setFromAxisAngle(UP,p.a),s.set(p.s,p.s*p.h,p.s)); mesh.setMatrixAt(i,m);
      const f=0.88+rng()*0.22, d=Math.min(1,p.dry);
      mesh.setColorAt(i,c.setRGB(f*(1+0.12*d),f,f*(1-0.3*d)));
    });
    mesh.castShadow=true; mesh.receiveShadow=true; mesh.frustumCulled=false;
    mesh.onBeforeRender=reedTick;
    group.add(mesh);
  });
  group.dispose=()=>group.children.forEach(ch=>/** @type {any} */(ch).dispose?.());
  return group;
}

/** Verstecke: je 8-m-Feld mit mindestens drei Büscheln ein Kreis um die Büschel */
function reedPatches(spots){
  const cells=new Map(), out=[];
  for(const p of spots){ const k=Math.floor(p.x/8)+','+Math.floor(p.z/8); (cells.get(k)||cells.set(k,[]).get(k)).push(p); }
  for(const list of cells.values()){
    if(list.length<3) continue;
    const x=list.reduce((a,p)=>a+p.x,0)/list.length, z=list.reduce((a,p)=>a+p.z,0)/list.length;
    const r=Math.max(...list.map(p=>Math.hypot(p.x-x,p.z-z)))+0.9;
    out.push({x,z,r,reed:true});
  }
  return out;
}

export { reedMesh, reedPatches, reedSpots, shoreDist };
