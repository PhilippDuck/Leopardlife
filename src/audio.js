// LeopardLife – Ton: Geräusche, Umgebung (Wind, Vögel) und laufend erzeugte Musik, alles synthetisch über WebAudio.
import { $, rnd } from './util.js';
import { G } from './state.js';

/* ---------- Ton (WebAudio, alles synthetisch) ---------- */
let AC=null, master=null, nbuf=null, muted=false; G.birdT=4;
try{ muted=localStorage.getItem('jaguar-mute')==='1'; }catch(e){}
function setMuteLabel(){ $('mute').textContent='Ton: '+(muted?'aus':'an'); }
setMuteLabel();
function initAudio(){
  if(AC){ if(AC.state==='suspended') AC.resume().catch(()=>{}); return; }
  try{
    AC=new (window.AudioContext||/** @type {any} */(window).webkitAudioContext)();
    master=AC.createGain(); master.gain.value=muted?0:0.55; master.connect(AC.destination);
    loadSamples();
    nbuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate); const d=nbuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    // Umgebung: leiser Wind
    const src=AC.createBufferSource(); src.buffer=nbuf; src.loop=true;
    const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420;
    const g=AC.createGain(); g.gain.value=0.07;
    const lfo=AC.createOscillator(); lfo.frequency.value=0.13; const lg=AC.createGain(); lg.gain.value=0.035; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }catch(e){ AC=null; }
}
$('mute').onclick=()=>{ muted=!muted; setMuteLabel(); try{ localStorage.setItem('jaguar-mute',muted?'1':'0'); }catch(e){} initAudio(); if(master) master.gain.value=muted?0:0.55; };
function tone(f,dur,type,vol,f2,delay){
  if(!AC) return; const t=AC.currentTime+(delay||0);
  const o=AC.createOscillator(), g=AC.createGain(); o.type=type||'sine'; o.frequency.setValueAtTime(f,t);
  if(f2) o.frequency.exponentialRampToValueAtTime(f2,t+dur);
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+0.015); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
}
function noise(dur,vol,f1,f2,type,delay){
  if(!AC) return; const t=AC.currentTime+(delay||0);
  const s=AC.createBufferSource(); s.buffer=nbuf; s.loop=true;
  const f=AC.createBiquadFilter(); f.type=type||'bandpass'; f.frequency.setValueAtTime(f1,t); if(f2) f.frequency.exponentialRampToValueAtTime(f2,t+dur);
  const g=AC.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t,Math.random()); s.stop(t+dur+0.05);
}
/* Aufgenommene Geräusche (ElevenLabs); bis sie geladen sind oder offline fehlen, klingt der Synth-Ersatz */
const SAMPLES={roar:'audio/roar.mp3'}; /** @type {Record<string, AudioBuffer>} */ const bufs={};
function loadSamples(){
  for(const k in SAMPLES) fetch(SAMPLES[k]).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
    .then(b=>new Promise((res,rej)=>AC.decodeAudioData(b,res,rej))).then(d=>{ bufs[k]=/** @type {AudioBuffer} */(d); }).catch(()=>{});
}
/** Spielt ein geladenes Geräusch mit leicht zufälliger Tonhöhe; false, wenn es (noch) nicht da ist. */
function sample(k,vol,rate){
  const b=bufs[k]; if(!AC||!b) return false;
  const s=AC.createBufferSource(); s.buffer=b; s.playbackRate.value=rate||1;
  const g=AC.createGain(); g.gain.value=vol; s.connect(g); g.connect(master); s.start(); return true;
}
const snd={
  pounce(){ noise(0.3,0.35,500,2600); tone(180,0.25,'sawtooth',0.06,90); },
  hit(){ tone(130,0.16,'square',0.22,45); noise(0.12,0.3,900,300,'lowpass'); },
  ambush(){ tone(660,0.18,'triangle',0.18,990); },
  kill(){ noise(0.09,0.3,1800,900,'bandpass',0.12); noise(0.09,0.3,1500,700,'bandpass',0.26); tone(392,0.14,'triangle',0.16,0,0.4); tone(523,0.2,'triangle',0.16,0,0.5); },
  hurt(){ tone(220,0.28,'sawtooth',0.22,70); noise(0.15,0.25,400,150,'lowpass'); },
  level(){ [523,659,784,1047].forEach((f,i)=>tone(f,0.3,'triangle',0.2,0,i*0.11)); },
  roar(){ if(sample('roar',1.1,rnd(0.93,1.06))) return; tone(150,1.1,'sawtooth',0.3,55); tone(101,1.1,'square',0.14,48); noise(1.1,0.4,700,180,'lowpass'); },
  alert(){ tone(880,0.09,'square',0.1); tone(880,0.09,'square',0.1,0,0.14); },
  notice(){ tone(300,0.12,'sine',0.13,240); },
  beat(v){ tone(62,0.12,'sine',0.25+0.25*v,45); tone(58,0.1,'sine',0.18+0.2*v,42,0.14); },
  climb(){ for(let i=0;i<4;i++) noise(0.07,0.22,1400,700,'bandpass',i*0.12); },
  purr(){ for(let i=0;i<7;i++) tone(58,0.11,'sawtooth',0.13,50,i*0.13); },
  mew(){ tone(950,0.22,'sine',0.11,620); tone(1200,0.1,'sine',0.05,900); },
  eat(){ for(let i=0;i<3;i++) noise(0.08,0.25,1600,800,'bandpass',i*0.13); },
  rustle(){ for(let i=0;i<3;i++) noise(0.09,0.14,3200,1500,'bandpass',i*0.07); },
  croc(){ noise(0.4,0.4,900,250,'lowpass'); tone(70,0.6,'sawtooth',0.2,40); },
  lost(){ tone(500,0.18,'sine',0.1,330); },
  death(){ [392,330,262,196].forEach((f,i)=>tone(f,0.5,'sawtooth',0.14,f*0.9,i*0.28)); },
  win(){ [523,659,784,659,784,1047].forEach((f,i)=>tone(f,0.4,'triangle',0.2,0,i*0.16)); },
  click(){ tone(700,0.07,'triangle',0.12,1000); },
  thunder(){ noise(0.25,0.35,2600,900,'bandpass'); noise(2.8,0.5,220,60,'lowpass',0.05); tone(48,2.2,'sine',0.22,30,0.05); },
  splash(){ noise(0.16,0.16,1800,700,'bandpass'); },
  step(v){ noise(0.06,v,260,120,'lowpass'); },
  bird(){ const b=rnd(1800,3200); for(let i=0;i<3;i++) tone(b*rnd(0.9,1.15),0.09,'sine',0.035,b*rnd(1.1,1.4),i*0.13); }
};

/* ---------- Musik: ruhige, laufend neu erzeugte Savannen-Musik (Daumenklavier, Bass, Handtrommel, Flächen) ---------- */
let musicOn=true, musicGain=null, mNext=0, mStep=0, mMotif=null, mIdx=4;
try{ musicOn=localStorage.getItem('jaguar-music')!=='0'; }catch(e){}
const M_STEP=0.34;   // Achtelnote bei etwa 88 Schlägen pro Minute
const M_SCALE=[220,246.94,277.18,329.63,369.99,440,493.88,554.37,659.25,739.99];   // A-Dur-Pentatonik
const M_CHORDS=[{b:110,p:[220,277.18,329.63]},{b:92.5,p:[185,220,277.18]},{b:146.83,p:[220,293.66,369.99]},{b:164.81,p:[246.94,329.63,415.3]}];
function setMusicLabel(){ $('btnMusic').textContent='Musik: '+(musicOn?'an':'aus'); }
setMusicLabel();
$('btnMusic').onclick=()=>{ musicOn=!musicOn; setMusicLabel(); try{ localStorage.setItem('jaguar-music',musicOn?'1':'0'); }catch(e){} initAudio(); if(musicGain) musicGain.gain.setTargetAtTime(musicOn?0.5:0,AC.currentTime,0.25); };
function mTone(f,t,dur,type,vol,att,f2){
  const o=AC.createOscillator(), g=AC.createGain(); o.type=type; o.frequency.setValueAtTime(f,t); if(f2) o.frequency.exponentialRampToValueAtTime(f2,t+dur);
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t+dur+0.05);
}
function mNoise(t,dur,vol,freq){
  const s=AC.createBufferSource(); s.buffer=nbuf; s.loop=true; const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=freq; const g=AC.createGain();
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); s.connect(f); f.connect(g); g.connect(musicGain); s.start(t,Math.random()); s.stop(t+dur+0.05);
}
function mNewMotif(){
  const old=mMotif; mMotif=[];
  for(let i=0;i<16;i++){
    if(old&&Math.random()<0.5){ mMotif.push(old[i]); continue; }
    if(Math.random()<(i%2===0?0.62:0.3)){ mIdx=Math.max(0,Math.min(M_SCALE.length-1,mIdx+[-2,-1,-1,0,1,1,2][Math.floor(Math.random()*7)])); mMotif.push(mIdx); } else mMotif.push(-1);
  }
}
function mSchedule(i,t){
  const s=i%16, bar=Math.floor(i/16), ch=M_CHORDS[bar%4];
  if(s===0){
    if(bar%2===0) mNewMotif();
    ch.p.forEach((f,k)=>mTone(f/2,t,16*M_STEP+1.5,'sine',0.045,1.6));          // weiche Fläche
    mTone(ch.p[0]*2,t,16*M_STEP+1.5,'sine',0.012,2.5);
  }
  if(s===0||s===6||s===8||s===13) mTone(ch.b,t,0.55,'triangle',0.16,0.012);      // Bass
  const n=mMotif[s];
  if(n>=0){ const f=M_SCALE[n], v=0.11+Math.random()*0.05, tt=t+Math.random()*0.012; mTone(f,tt,1.1,'sine',v,0.004); mTone(f*2,tt,0.35,'sine',v*0.3,0.003); mTone(f*3.01,tt,0.12,'sine',v*0.12,0.002); }   // Daumenklavier
  if(s===0||s===3||s===6||s===10||s===12) mTone(150,t,0.16,'sine',0.13,0.004,85);  // tiefe Handtrommel
  if(s===4||s===14) mTone(270,t,0.11,'sine',0.07,0.003,200);                      // hohe Handtrommel
  mNoise(t,0.05,s%2?0.028:0.014,6500);                                            // Rassel
}
function musicTick(){
  if(!AC||!musicOn||AC.state!=='running') return;
  if(!musicGain){ musicGain=AC.createGain(); musicGain.gain.value=0.5; musicGain.connect(master); }
  const now=AC.currentTime; if(mNext<now) mNext=now+0.06;
  while(mNext<now+0.3){ mSchedule(mStep,mNext); mNext+=M_STEP; mStep++; }
}

export { AC, master, nbuf, initAudio, tone, snd, musicTick };
