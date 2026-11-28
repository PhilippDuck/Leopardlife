// LeoLife – Leopard (Spielfigur, Partner, Rivalen, Junge) als Low-Poly-Modell mit Skelett und Clips (Meshy: Modell, Vierbeiner-Rig,
// Leoparden-Animationen; umgewandelt mit tools/meshy-rig.cjs). Erwachsene und Junge haben eigene Modelle.
// Fell: Meshys gemalte Textur; Fellsorten (hell/dunkel, kräftig/blass, Albino, Panther) färbt der Shader um (ein Material je Sorte).
// Figur, Skelett und Bewegung: rig.js.
import { LEO_ADULT } from './leoadultrig.js';
import { LEO_CUB } from './leocubrig.js';
import { prepareRig, rigFigure } from './rig.js';

const MODELS={};
const modelOf=kind=>MODELS[kind]||(MODELS[kind]=prepareRig(kind==='cub'?LEO_CUB:LEO_ADULT));

/* ---------- Fell: Umfärben der Textur ---------- */
/**
 * Material für eine Fellsorte. Alle Sorten teilen ein Shaderprogramm, die Werte kommen als Uniforms.
 * Damit sich Leoparden deutlich unterscheiden, wirken die Werte stärker als beim früheren Blockmodell:
 * l Helligkeit, s Sättigung, ss Grundton (goldrot bis blass-sandfarben), sn Flecken (kräftig dunkel bis verwaschen);
 * Albino (blass, Flecken nur angedeutet), Panther (fast schwarz, Rosetten schimmern durch).
 */
function furMaterial(M,fur){
  const cl=(x,a,b)=>Math.max(a,Math.min(b,x));
  const l=fur?cl(1+(fur.l-1)*1.5,0.5,1.4):1, s=fur?cl(1+(fur.s-1)*2,0.55,1.35):1, alb=fur&&fur.albino?1:0, mel=fur&&fur.melan?1:0;
  const warm=fur&&fur.ss!==undefined?cl((fur.ss-1.1)/0.35,-1,1):0, spot=fur&&fur.sn!==undefined?cl((fur.sn-1.075)/0.525,-1,1):0;
  const key=[l,s,warm,spot].map(x=>x.toFixed(2)).join()+','+alb+mel;
  if(M.mats[key]) return M.mats[key];
  const m=new THREE.MeshLambertMaterial({map:M.tex,skinning:true});
  const uA=new THREE.Vector4(l,s,alb,mel), uB=new THREE.Vector2(warm,spot);
  m.onBeforeCompile=sh=>{
    sh.uniforms.uFurA={value:uA}; sh.uniforms.uFurB={value:uB};
    sh.fragmentShader='uniform vec4 uFurA; uniform vec2 uFurB;\n'+sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n vec4 texelColor=texture2D(map,vUv); texelColor=mapTexelToLinear(texelColor);\n'+
      ' float lum=dot(texelColor.rgb,vec3(0.299,0.587,0.114));\n'+
      ' float spotM=smoothstep(0.40,0.22,lum), cream=smoothstep(0.62,0.80,lum);\n'+   // dunkle Rosetten, helle Bauchseite
      ' vec3 c=texelColor.rgb;\n'+
      // Grundton: warm = tiefes Goldrot, kühl = blasses Sandgelb (Bauch und Flecken weniger betroffen)
      ' vec3 tint=uFurB.x>0.0?vec3(1.07,0.90,0.74):vec3(0.97,1.0,1.10);\n'+
      ' c*=mix(vec3(1.0),tint,abs(uFurB.x)*(1.0-spotM)*(1.0-0.6*cream));\n'+
      ' c=mix(vec3(dot(c,vec3(0.299,0.587,0.114))),c,uFurA.y)*uFurA.x;\n'+
      // Flecken: kräftig (dunkler) oder verwaschen (zum Grundton hin)
      ' vec3 ground=c*(0.56/max(lum,0.05));\n'+
      ' c=uFurB.y>0.0?c*(1.0-0.55*uFurB.y*spotM):mix(c,ground,-uFurB.y*0.6*spotM);\n'+
      ' c=mix(c,vec3(0.86,0.83,0.76)*(0.55+0.9*lum),uFurA.z);\n'+
      ' c=mix(c,texelColor.rgb*0.16+vec3(0.012,0.01,0.008),uFurA.w);\n'+
      ' diffuseColor.rgb*=c;\n#endif');
  };
  m.customProgramCacheKey=()=>'leoFur';
  return M.mats[key]=m;
}

/* ---------- Figur ---------- */
/** Leopard als Gruppe wie buildQuad (rig.js); kind 'adult' oder 'cub'; fur: Fellsorte (makeFur) oder null */
function buildLeopard(kind,col,fur){
  const M=modelOf(kind), g=rigFigure(M,furMaterial(M,fur),0.07);   // Pfoten im Stand etwas tiefer als in der Ruhelage
  g.userData.leopard=kind;
  return g;
}

export { buildLeopard };
