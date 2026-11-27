// LeoLife – Leistung: Schattentakt, automatische Auflösung, Bildratenanzeige.
import { renderer, sun } from './engine.js';
import { PX_BASE } from './quality.js';
import { G } from './state.js';
import { $ } from './util.js';
import { net } from './net.js';

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
      if(showFps) $('fps').textContent=Math.round(fpsVal)+' Bilder/s · Auflösung '+Math.round(G.pxScale*100)+' %'+(net.state==='online'?' · Ping '+(typeof net.ping==='number'?Math.round(net.ping)+' ms':'–'):'');
    }
    fpsT=now; fpsN=0;
  }
}

export { perfTick, setResLabel };
