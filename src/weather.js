// LeopardLife – Wetter: Regen und Gewitter.
import { animals } from './animals.js';
import { AC, master, nbuf, snd } from './audio.js';
import { startFlee } from './carcass.js';
import { camera, scene, windU } from './engine.js';
import { P } from './player.js';
import { toast } from './ui.js';
import { rnd } from './util.js';

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

export { W, updateWeather };
