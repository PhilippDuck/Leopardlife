// LeopardLife – Grafikstufen (niedrig/hoch/ultra) anwenden: Auflösung, Schatten, Gras, Nebel, Sichtweite.
import { QUAL } from './data.js';
import { renderer, resize, sun } from './engine.js';
import { updateDayNight } from './main.js';
import { G } from './state.js';
import { $ } from './util.js';
import { leafGeoHi, leafGeoLo, leafMeshes, tallGeo } from './vegetation.js';

/* Grafikqualität: niedrig / hoch / ultra (weitere Sicht, schärfere und weitere Schatten, mehr Gras) */
let quality='high', VIEW_D=170; G.pxScale=1; let PX_BASE=1;
try{ const q=localStorage.getItem('jaguar-gfx2'); if(q&&QUAL[q]) quality=q; }catch(e){}
const blobs=[];
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

export { PX_BASE, VIEW_D, applyQuality, blobs, quality };
