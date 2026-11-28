// LeoLife – Detailtextur für den Boden: eine gemalte, nahtlos kachelbare Graustufen-Textur (Flecken, Grasbüschel, Steinchen),
// die nur die Helligkeit der Vertexfarben des Bodens verändert. Sie wird beim Start per Canvas erzeugt (keine Datei im Offline-Cache),
// in zwei Maßstäben gemischt (gegen sichtbare Kacheln) und mit der Entfernung ausgeblendet. Bei niedriger Grafik aus.
import { on } from './events.js';
import { seeded } from './noise.js';
import { quality } from './quality.js';

const N=256;
/** Graustufen-Textur (Mittelwert ~128), an allen Rändern nahtlos */
const detailTex=(function(){
  const cv=document.createElement('canvas'); cv.width=cv.height=N;
  const ctx=cv.getContext('2d'); if(!ctx||!ctx.createImageData) return null;
  const r=seeded(0x626f64), v=new Float32Array(N*N);
  // weiche Flecken: kachelbares Wertrauschen in drei Oktaven
  for(const [cells,amp] of [[4,0.5],[8,0.3],[16,0.2]]){
    const g=Array.from({length:cells*cells},()=>r()*2-1), at=(i,j)=>g[((j%cells+cells)%cells)*cells+((i%cells+cells)%cells)];
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      const fx=x/N*cells, fy=y/N*cells, i=Math.floor(fx), j=Math.floor(fy), u=fx-i, w=fy-j, su=u*u*(3-2*u), sw=w*w*(3-2*w);
      const a=at(i,j)+(at(i+1,j)-at(i,j))*su, b=at(i,j+1)+(at(i+1,j+1)-at(i,j+1))*su;
      v[y*N+x]+=(a+(b-a)*sw)*amp;
    }
  }
  // kleine Tupfer: dunkle Grasbüschel und helle Steinchen (über die Ränder hinweg gezeichnet)
  const dab=(cx,cy,rad,d)=>{ for(let y=-rad;y<=rad;y++) for(let x=-rad;x<=rad;x++){ const q=1-Math.hypot(x,y)/rad; if(q<=0) continue;
    const px=((Math.round(cx)+x)%N+N)%N, py=((Math.round(cy)+y)%N+N)%N; v[py*N+px]+=d*q; } };
  for(let i=0;i<420;i++) dab(r()*N,r()*N,1+Math.floor(r()*3),-0.35-r()*0.3);
  for(let i=0;i<160;i++) dab(r()*N,r()*N,1+Math.floor(r()*2),0.4+r()*0.3);
  const img=ctx.createImageData(N,N);
  for(let k=0;k<N*N;k++){ const c=Math.max(0,Math.min(255,128+v[k]*95)); img.data[k*4]=img.data[k*4+1]=img.data[k*4+2]=c; img.data[k*4+3]=255; }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
})();

const uDetOn={value:1};
const setOn=()=>{ uDetOn.value=quality==='low'?0:1; };
setOn(); on('quality',setOn);

/** Detailtextur in ein Boden-Material (MeshLambertMaterial mit Vertexfarben) einmischen; UV aus Weltkoordinaten */
function applyGroundDetail(mat){
  if(!detailTex) return;
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uDet={value:detailTex}; sh.uniforms.uDetOn=uDetOn;
    sh.vertexShader='varying vec3 vGw;\n'+sh.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n vGw=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader='uniform sampler2D uDet; uniform float uDetOn; varying vec3 vGw;\n'+sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n if(uDetOn>0.5){ float fade=1.0-smoothstep(25.0,85.0,distance(vGw,cameraPosition));\n'+
      '  float t1=texture2D(uDet,vGw.xz/7.0).r, t2=texture2D(uDet,vGw.xz/31.0+vec2(0.37,0.61)).r;\n'+
      '  diffuseColor.rgb*=1.0+((t1-0.5)*0.42+(t2-0.5)*0.22)*fade; }');
  };
}

export { applyGroundDetail };
