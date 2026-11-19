// LeopardLife – Tag und Nacht: Sonne, Mond, Himmelsfarben, Nebel, Nachtsicht, Schlafen auf Bäumen.
import { animals } from './animals.js';
import { HORIZON, SUN_OFF, grassLight, hemi, scene, sun } from './engine.js';
import { endRaid } from './family.js';
import { keys, touchUI } from './input.js';
import { menuOpen } from './menu.js';
import { P } from './player.js';
import { D, S, maxHp, maxSt, save } from './save.js';
import { cloudMat, sky, starMat } from './sky.js';
import { G } from './state.js';
import { toast } from './ui.js';
import { $, rnd } from './util.js';
import { on } from './events.js';
import { W } from './weather.js';
import { newGoals } from './goals.js';
import { padUI } from './gamepad.js';
import { updateUI } from './hud.js';

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

// Nach jedem Wechsel der Grafikstufe Nebel und Licht neu setzen
on('quality',()=>updateDayNight(0));

export { clockStr, dayF, updateDayNight };
