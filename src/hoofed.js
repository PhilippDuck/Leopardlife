// LeoLife – Huftiere als Low-Poly-Modelle mit Skelett und Clips (Meshy: Modell, Vierbeiner-Rig, Reh-Animationen Stehen, Stehen 2,
// Gehen, Rennen; umgewandelt mit tools/meshy-rig.cjs, Bewegung in rig.js): Gazelle, Antilope (Impala), Riesenantilope (Elen), Gnu.
// Erlegt kippt das Tier auf die Seite (carcass.js); einen eigenen Sterbe-Clip gibt es nicht.
// Fell: Meshys gemalte Textur, je Tier heller oder dunkler, kräftiger oder blasser; selten fast weiß (Albino) oder dunkel (Melanismus).
import { ANTI } from './impalarig.js';
import { GAZELLE } from './gazellerig.js';
import { ELAND } from './elenrig.js';
import { GNU } from './gnurig.js';
import { prepareRig, rigFigure } from './rig.js';

/* Modell je Art; back: Höhe des Rückens in der Körpermitte (Maßstab 1), für Madenhacker; blob: Schattenfleck (Breite, Länge) */
const HOOFED={
  deer:{D:GAZELLE,back:1.07,blob:[0.5,0.8]},
  anti:{D:ANTI,back:1.23,blob:[0.55,0.9]},
  giant:{D:ELAND,back:1.16,blob:[0.55,1.05]},
  gnu:{D:GNU,back:1.67,blob:[0.7,1.2]},
};
const HOOF_MODELS={};
const hoofModelOf=id=>HOOF_MODELS[id]||(HOOF_MODELS[id]=prepareRig(HOOFED[id].D));

/** Material für eine Fellsorte (Werte als Uniforms, ein Shaderprogramm für alle) */
function hoofMaterial(M,fur){
  const cl=(x,a,b)=>Math.max(a,Math.min(b,x));
  const l=fur?cl(1+(fur.l-1)*1.2,0.6,1.3):1, s=fur?cl(1+(fur.s-1)*1.6,0.6,1.3):1, alb=fur&&fur.albino?1:0, mel=fur&&fur.melan?1:0;
  const key=[l,s].map(x=>x.toFixed(2)).join()+','+alb+mel;
  if(M.mats[key]) return M.mats[key];
  const m=new THREE.MeshLambertMaterial({map:M.tex,skinning:true});
  const uA=new THREE.Vector4(l,s,alb,mel);
  m.onBeforeCompile=sh=>{
    sh.uniforms.uFurA={value:uA};
    sh.fragmentShader='uniform vec4 uFurA;\n'+sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n vec4 texelColor=texture2D(map,vUv); texelColor=mapTexelToLinear(texelColor);\n'+
      ' vec3 c=texelColor.rgb; float lum=dot(c,vec3(0.299,0.587,0.114));\n'+
      ' c=mix(vec3(lum),c,uFurA.y)*uFurA.x;\n'+
      ' c=mix(c,vec3(0.88,0.85,0.79)*(0.6+0.8*lum),uFurA.z);\n'+   // Albino: fast weiß, Zeichnung nur angedeutet
      ' c=mix(c,c*0.35,uFurA.w);\n'+                                // Melanismus: dunkel
      ' diffuseColor.rgb*=c;\n#endif');
  };
  m.customProgramCacheKey=()=>'hoofFur';
  return M.mats[key]=m;
}

/** Huftier der Art id als Gruppe wie buildQuad; fur: Fellsorte (makeFur) oder null. Schattenfleck in userData.blob. */
function buildHoofed(id,fur,blobs,shadowGeo,shadowMat){
  const M=hoofModelOf(id), g=rigFigure(M,hoofMaterial(M,fur)), hf=HOOFED[id];
  const sh=new THREE.Mesh(shadowGeo,shadowMat); sh.scale.set(hf.blob[0],1,hf.blob[1]); sh.position.y=0.03; g.add(sh); blobs.push(sh); g.userData.blob=sh;
  g.userData.hoofed=id;
  return g;
}
const hoofedBack=id=>HOOFED[id]?HOOFED[id].back:null;

export { HOOFED, buildHoofed, hoofedBack };
