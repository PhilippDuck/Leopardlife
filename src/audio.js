// LeopardLife – Ton: Geräusche, Umgebung (Tag, Nacht, Regen, Wind, Vögel) und laufend erzeugte Musik. Aufnahmen aus audio/, sonst synthetisch über WebAudio.
import { $, rnd } from './util.js';
import { G } from './state.js';

/* ---------- Ton (WebAudio, alles synthetisch) ---------- */
let AC=null, master=null, nbuf=null, muted=false, windG=null; G.birdT=4;
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
    const g=AC.createGain(); g.gain.value=0.07; windG=g;
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
const SAMPLES={roar:'audio/roar.mp3',dayA:'audio/amb-day-1.mp3',dayB:'audio/amb-day-2.mp3',windA:'audio/amb-wind-1.mp3',windB:'audio/amb-wind-2.mp3',
  fly:'audio/fly.mp3',birdA:'audio/bird-1.mp3',birdB:'audio/bird-2.mp3',doveA:'audio/dove-1.mp3',doveB:'audio/dove-2.mp3',gust:'audio/gust.mp3',owlA:'audio/owl-1.mp3',owlB:'audio/owl-2.mp3',owlC:'audio/owl-3.mp3',owlD:'audio/owl-4.mp3',
  music1:'audio/music-1.mp3',music2:'audio/music-2.mp3',music3:'audio/music-3.mp3',music4:'audio/music-4.mp3',night:'audio/amb-night.mp3',rain:'audio/rain.mp3',hyenaA:'audio/hyena-1.mp3',hyenaB:'audio/hyena-2.mp3',lion:'audio/lion.mp3',jackalA:'audio/jackal-1.mp3',jackalB:'audio/jackal-2.mp3',alarm:'audio/alarm.mp3',
  growlA:'audio/growl-1.mp3',growlB:'audio/growl-2.mp3',mew:'audio/mew.mp3',eat:'audio/eat.mp3',paws:'audio/paws.mp3',claws:'audio/claws.mp3',hurtA:'audio/hurt-1.mp3',hurtB:'audio/hurt-2.mp3',
  thunder:'audio/thunder.mp3',thunderMid:'audio/thunder-mid.mp3',thunderMid2:'audio/thunder-mid-2.mp3',thunderFar:'audio/thunder-far.mp3'};
/** @type {Record<string, AudioBuffer>} */ const bufs={};
/** Für Schleifen: Stille am Anfang und Ende überspringen (MP3 hat dort Polster), damit es nahtlos weiterläuft */
const loopPts={};
function findLoop(k,b){ const d=b.getChannelData(0), n=d.length, th=0.0005; let a=0, e=n-1;
  while(a<Math.min(n,4000)&&Math.abs(d[a])<th) a++; while(e>n-4000&&Math.abs(d[e])<th) e--;
  loopPts[k]=[a/b.sampleRate,(e+1)/b.sampleRate]; }
function loadSamples(){
  for(const k in SAMPLES) fetch(SAMPLES[k]).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
    .then(b=>new Promise((res,rej)=>AC.decodeAudioData(b,res,rej))).then(d=>{ bufs[k]=/** @type {AudioBuffer} */(d); findLoop(k,bufs[k]); }).catch(()=>{});
}
/** Spielt ein geladenes Geräusch mit leicht zufälliger Tonhöhe; gibt {s,g} zurück (zum Abbrechen), false, wenn es (noch) nicht da ist. */
function sample(k,vol,rate){
  const b=bufs[k]; if(!AC||!b) return false;
  const s=AC.createBufferSource(); s.buffer=b; s.playbackRate.value=rate||1;
  const g=AC.createGain(); g.gain.value=vol; s.connect(g); g.connect(master); s.start(); return {s,g};
}
/* Räumlicher Ton: Tiere klingen aus ihrer Richtung (links/rechts) und werden mit der Entfernung leiser und dumpfer.
   Gehört wird vom nächsten Spieler aus; main.js meldet jedes Bild die Position und Blickrichtung der Spieler. */
let LIS=[];
function setListeners(l){ LIS=l; }
/** Aufnahme (eine von ks) am Ort x,z abspielen; vol in nächster Nähe, ab maxD Metern unhörbar. false, wenn zu weit oder nicht geladen. */
function snd3d(ks,x,z,vol,maxD,rate){
  if(!AC||!LIS.length) return false; ks=(Array.isArray(ks)?ks:[ks]).filter(k=>bufs[k]); if(!ks.length) return false;
  let L=LIS[0], d=1e9; for(const l of LIS){ const e=Math.hypot(x-l.x,z-l.z); if(e<d){ d=e; L=l; } }
  if(d>maxD) return false;
  const k=ks[Math.floor(Math.random()*ks.length)], t=AC.currentTime+0.02, near=Math.pow(1-d/maxD,1.6);
  const fx=-Math.sin(L.yaw), fz=-Math.cos(L.yaw), dx=(x-L.x)/(d||1), dz=(z-L.z)/(d||1), side=dx*(-fz)+dz*fx;
  const s=AC.createBufferSource(); s.buffer=bufs[k]; s.playbackRate.value=rate||rnd(0.93,1.07);
  const g=AC.createGain(); g.gain.value=vol*near; const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1200+16000*near;
  s.connect(lp); lp.connect(g); let out=g; if(AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=Math.max(-0.9,Math.min(0.9,side*Math.min(1,d/6))); g.connect(p); out=p; }
  out.connect(master); s.start(t); return true;
}
/** Gewehrschuss bei (x,z): scharfer Knall, dumpfer Nachhall und Echo – weit zu hören, aus seiner Richtung */
function gunshot(x,z){
  if(!AC||!LIS.length) return; let L=LIS[0], d=1e9; for(const l of LIS){ const e=Math.hypot(x-l.x,z-l.z); if(e<d){ d=e; L=l; } }
  if(d>600) return; const near=Math.pow(1-d/600,1.3), t=AC.currentTime+Math.min(0.6,d/340);   // Schall braucht etwas
  const fx=-Math.sin(L.yaw), fz=-Math.cos(L.yaw), side=((x-L.x)*(-fz)+(z-L.z)*fx)/(d||1);
  const pan=AC.createStereoPanner?AC.createStereoPanner():null; const out=AC.createGain(); out.gain.value=1; if(pan){ pan.pan.value=Math.max(-0.85,Math.min(0.85,side*Math.min(1,d/8))); out.connect(pan); pan.connect(master); } else out.connect(master);
  const burst=(dur,vol,type,f,q,delay)=>{ const s=AC.createBufferSource(); s.buffer=nbuf; const fl=AC.createBiquadFilter(); fl.type=type; fl.frequency.value=f; if(q) fl.Q.value=q;
    const g=AC.createGain(), t0=t+(delay||0); g.gain.setValueAtTime(vol,t0); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t0,Math.random()); s.stop(t0+dur+0.05); };
  burst(0.07,1.6*near*near,'highpass',1800+4000*near);          // Knall (nah scharf)
  burst(0.55,1.4*near,'lowpass',260+500*near);                    // Wumms
  burst(1.3,0.35*near+0.05,'lowpass',380,0,0.25+d/900);           // Echo über die Ebene
}
/** Ist die Aufnahme k geladen? */
const hasSample=k=>!!bufs[k];

/* ---------- Umgebung ----------
   Grund ist ruhiger Wind im Gras (tags) bzw. Grillen (nachts), gespielt als Folge zufälliger Ausschnitte: zufällige Stelle,
   5–11 s, leicht verstimmt, links/rechts verschoben, weich überblendet, zwei bis drei überlappen sich.
   Darüber kommen einzelne Ereignisse zu zufälligen Zeiten: Vögel, Tauben, eine Fliege, Windböen und selten ein Stück der
   vollen Savannen-Aufnahme mit Insekten. Regen bleibt eine Schleife. */
/** @type {Record<string, GainNode>} */ const amb={};
const BEDS={day:['windA','windB'],night:['night'],bugs:['dayA','dayB']}, bedNext={day:0,night:0,bugs:0}, BED_GAP={day:[0.35,0.6],night:[0.35,0.6],bugs:[1.5,4]};
// Ereignisse tagsüber: Aufnahmen, Abstand in s, Lautstärke
// Tageszeiten (h = Stunde): Vögel vor allem morgens und abends, in der Mittagshitze mehr Insekten, nachts Eulen
const ramp=(h,a,b,c,d)=>h<a||h>d?0:h<b?(h-a)/(b-a):h<=c?1:(d-h)/(d-c);
const birdTime=h=>Math.max(ramp(h,4.5,6,8.5,10.5),ramp(h,16,17.5,19.5,20.5),0.12);
const heat=h=>ramp(h,10,12,15,17);
// Ereignisse: Aufnahmen, Abstand in s, Lautstärke, wie oft je Tageszeit (0 = nie, 1 = normal; seltener teilt den Abstand)
const EVENTS=[
  {ks:['birdA','birdB'],gap:[25,60],vol:[0.05,0.14],f:(h,day)=>day>0.3?birdTime(h):0},
  {ks:['doveA','doveB'],gap:[30,70],vol:[0.15,0.35],f:(h,day)=>day>0.3?Math.max(birdTime(h),0.3):0},
  {ks:['fly'],gap:[30,80],vol:[0.2,0.5],f:(h,day)=>day>0.3?0.4+1.6*heat(h):0},
  {ks:['gust'],gap:[40,100],vol:[0.2,0.4],f:(h,day)=>day>0.3?1:0.5},
  {ks:['owlA','owlB','owlC','owlD'],gap:[25,70],vol:[0.25,0.5],f:(h,day)=>day<0.35?1:0}];
const evNext=EVENTS.map(()=>0);
function bus(k){ if(!amb[k]){ amb[k]=AC.createGain(); amb[k].gain.value=0; amb[k].connect(master); } return amb[k]; }
function oneShot(k,vol,pan,rate){
  const b=bufs[k]; if(!b) return; const t=AC.currentTime+0.02;
  const s=AC.createBufferSource(); s.buffer=b; s.playbackRate.value=rate; const g=AC.createGain(); g.gain.value=vol;
  let out=g; if(AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=pan; g.connect(p); out=p; }
  s.connect(g); out.connect(bus('ev')); s.start(t);
}
function grain(bed){
  const ks=BEDS[bed].filter(k=>bufs[k]); if(!ks.length) return 0;
  const k=ks[Math.floor(Math.random()*ks.length)], b=bufs[k], lp=loopPts[k]||[0,b.duration];
  const t=AC.currentTime+0.05, dur=rnd(5,11), fade=rnd(1.4,2.6), rate=rnd(0.93,1.07);
  const s=AC.createBufferSource(); s.buffer=b; s.loop=true; s.loopStart=lp[0]; s.loopEnd=lp[1]; s.playbackRate.value=rate;
  const pk=rnd(0.6,1), g=AC.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(pk,t+fade); g.gain.setValueAtTime(pk,t+dur-fade); g.gain.linearRampToValueAtTime(0.0001,t+dur);
  let out=g; if(AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=rnd(-0.7,0.7); g.connect(p); out=p; }
  s.connect(g); out.connect(bus(bed)); s.start(t,lp[0]+Math.random()*(lp[1]-lp[0])); s.stop(t+dur+0.1);
  return dur;
}
function ambLoop(k){
  if(amb[k]||!bufs[k]) return amb[k]||null;
  const s=AC.createBufferSource(); s.buffer=bufs[k]; s.loop=true; const lp=loopPts[k]; if(lp){ s.loopStart=lp[0]; s.loopEnd=lp[1]; }
  const g=AC.createGain(); g.gain.value=0; s.connect(g); g.connect(master); s.start(0,(lp?lp[0]:0)+Math.random()*5); amb[k]=g; return g;
}
/** Lautstärken der Umgebung nachführen und neue Ausschnitte starten: day 0…1 (Tageslicht), rain 0…1 */
/** storm: Gewitter – dann schweigen Vögel, Fliege, Insekten und Grillen, nur Wind, Regen und Donner bleiben */
function ambTick(day,rain,storm,hour,tense){
  if(!AC||AC.state!=='running') return;
  const t=AC.currentTime, dry=1-0.6*rain, calm=storm?Math.max(0,1-2*rain):1, hot=heat(hour||12), lv={day:0.22*day*dry,night:0.3*(1-day)*dry*calm,bugs:(0.08+0.27*hot)*day*dry*calm};
  if(!bufs.windA&&!bufs.windB){ BEDS.day=['dayA','dayB']; lv.bugs=0; lv.day=0.28*day*dry; } else BEDS.day=['windA','windB'];   // ohne Wind-Aufnahmen wie bisher
  for(const bed in BEDS){
    bus(bed).gain.setTargetAtTime(lv[bed],t,0.8);
    if(lv[bed]>0.01&&t>=bedNext[bed]){ const d=grain(bed), g=BED_GAP[bed]; bedNext[bed]=t+(d?d*rnd(g[0],g[1]):2); }
  }
  bus('ev').gain.setTargetAtTime(dry*calm,t,0.8);
  // Insekten-Ausschnitte kommen in der Mittagshitze dichter
  BED_GAP.bugs=hot>0.5?[0.5,1.2]:[1.5,4];
  if(calm>0.2) EVENTS.forEach((e,i)=>{ if(t<evNext[i]) return; const fq=e.f(hour||12,day);
    if(evNext[i]>0&&fq>0.05){ const ks=e.ks.filter(k=>bufs[k]); if(ks.length) oneShot(ks[Math.floor(Math.random()*ks.length)],rnd(e.vol[0],e.vol[1]),rnd(-0.85,0.85),rnd(0.9,1.1)); }
    evNext[i]=t+rnd(e.gap[0],e.gap[1])/Math.max(0.15,fq); });
  musicFiles(t,storm&&rain>0.4||tense,rain);
  const rg=ambLoop('rain'); if(rg) rg.gain.setTargetAtTime(0.7*rain,t,0.8);
  if(windG&&(bufs.dayA||bufs.windA||bufs.night)) windG.gain.value=0.02;   // Synth-Wind nur noch leise darunter
}
let climbSnd=null;   // Krallen an der Rinde: verstummt, sobald der Leopard oben ist
/** Klettergeräusch weich beenden */
function climbStop(){ if(!climbSnd||!AC) return; const t=AC.currentTime; try{ climbSnd.g.gain.setTargetAtTime(0,t,0.08); climbSnd.s.stop(t+0.4); }catch(e){} climbSnd=null; }
let eatUntil=0;   // Fressen: die Aufnahme ausklingen lassen, statt sie bei jedem Bissen neu zu starten
const snd={
  pounce(){ if(sample('paws',0.22,rnd(0.92,1.08))) return; noise(0.3,0.35,500,2600); tone(180,0.25,'sawtooth',0.06,90); },
  hit(){ tone(130,0.16,'square',0.22,45); noise(0.12,0.3,900,300,'lowpass'); },
  ambush(){ tone(660,0.18,'triangle',0.18,990); },
  /** Festbeißen: guter Biss = Knacken + aufsteigender Klang (höher mit jeder Serie), Fehlbiss = dumpfer Ton */
  bite(acc,combo){
    noise(0.07,0.32,2200,900,'bandpass'); tone(110,0.1,'sine',0.2,70);
    if(acc>0.65){ const f=[523,587,659,784,880,1047][Math.min(5,combo)]; tone(f,0.22,'triangle',0.16,0,0.03); if(acc>0.9){ tone(f*1.5,0.3,'sine',0.12,0,0.09); tone(f*2,0.25,'sine',0.06,0,0.15); } }
    else if(acc>0.3) tone(330,0.15,'triangle',0.1,0,0.03);
    else tone(160,0.22,'sine',0.14,110,0.02);
  },
  kill(){ noise(0.09,0.3,1800,900,'bandpass',0.12); noise(0.09,0.3,1500,700,'bandpass',0.26); tone(392,0.14,'triangle',0.16,0,0.4); tone(523,0.2,'triangle',0.16,0,0.5); },
  hurt(){ if(sample(Math.random()<0.5?'hurtA':'hurtB',0.35,rnd(0.92,1.1))) return; tone(220,0.28,'sawtooth',0.22,70); noise(0.15,0.25,400,150,'lowpass'); },
  level(){ [523,659,784,1047].forEach((f,i)=>tone(f,0.3,'triangle',0.2,0,i*0.11)); },
  roar(){ if(sample('roar',1.1,rnd(0.93,1.06))) return; tone(150,1.1,'sawtooth',0.3,55); tone(101,1.1,'square',0.14,48); noise(1.1,0.4,700,180,'lowpass'); },
  alert(){ tone(880,0.09,'square',0.1); tone(880,0.09,'square',0.1,0,0.14); },
  notice(){ tone(300,0.12,'sine',0.13,240); },
  beat(v){ tone(62,0.12,'sine',0.25+0.25*v,45); tone(58,0.1,'sine',0.18+0.2*v,42,0.14); },
  climb(){ const c=sample('claws',1.6,rnd(0.95,1.1)); if(c){ climbSnd=c; return; } for(let i=0;i<4;i++) noise(0.07,0.22,1400,700,'bandpass',i*0.12); },
  purr(){ for(let i=0;i<7;i++) tone(58,0.11,'sawtooth',0.13,50,i*0.13); },
  mew(){ if(sample('mew',1.0,rnd(0.92,1.15))) return; tone(950,0.22,'sine',0.11,620); tone(1200,0.1,'sine',0.05,900); },
  eat(){ if(bufs.eat){ if(AC.currentTime>eatUntil){ eatUntil=AC.currentTime+bufs.eat.duration*0.85; sample('eat',1.4,rnd(0.92,1.08)); } return; } for(let i=0;i<3;i++) noise(0.08,0.25,1600,800,'bandpass',i*0.13); },
  rustle(){ for(let i=0;i<3;i++) noise(0.09,0.14,3200,1500,'bandpass',i*0.07); },
  croc(){ noise(0.55,0.5,2200,300,'bandpass'); noise(0.4,0.4,900,250,'lowpass',0.05); tone(70,0.6,'sawtooth',0.2,40); },
  snap(){ noise(0.05,0.55,2600,900,'bandpass'); tone(95,0.14,'square',0.22,45); },
  lap(){ noise(0.06,0.07,1500,700,'bandpass'); noise(0.05,0.05,1900,900,'bandpass',0.11); },
  lost(){ tone(500,0.18,'sine',0.1,330); },
  death(){ [392,330,262,196].forEach((f,i)=>tone(f,0.5,'sawtooth',0.14,f*0.9,i*0.28)); },
  win(){ [523,659,784,659,784,1047].forEach((f,i)=>tone(f,0.4,'triangle',0.2,0,i*0.16)); },
  click(){ tone(700,0.07,'triangle',0.12,1000); },
  thunder(){ { const ks=['thunder','thunderMid','thunderMid2','thunderFar','thunderFar'].filter(hasSample); if(ks.length){ const k=ks[Math.floor(Math.random()*ks.length)]; sample(k,k==='thunderFar'?rnd(0.6,1):rnd(0.5,0.95),rnd(0.82,1.08)); return; } } noise(0.25,0.35,2600,900,'bandpass'); noise(2.8,0.5,220,60,'lowpass',0.05); tone(48,2.2,'sine',0.22,30,0.05); },
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
/* Aufgenommene Musik: leise im Hintergrund, ein Stück nach dem anderen in zufälliger Reihenfolge,
   drei bis sechs Stücke am Stück (übergeblendet), dann meist 10–30 s, manchmal 1–2½ min Pause; bei Regen still und danach noch eine Weile; bei Gewitter oder Gefahr tritt sie zurück. Solange keine Aufnahme geladen ist, spielt die Synth-Musik. */
const MUSIC=['music1','music2','music3','music4'], MUSIC_VOL=0.11;
let mFileNext=8, mFileGain=null, mLast='', mRun=0, mRain=false;
const musicFilesReady=()=>MUSIC.some(k=>bufs[k]);
/** Musik bald starten (Startbildschirm, sobald Ton erlaubt ist) */
function musicSoon(){ if(AC){ mFileNext=Math.min(mFileNext,AC.currentTime+0.3); mRun=0; } }
function musicFiles(t,duck,rain){
  if(!musicFilesReady()) return;
  // Regen: Musik schweigt; hört er auf, bleibt es noch eine Weile still
  if(rain>0.35) mRain=true; else if(mRain&&rain<0.1){ mRain=false; mRun=0; mFileNext=Math.max(mFileNext,t+rnd(30,90)); }
  duck=duck||mRain;
  if(!mFileGain){ mFileGain=AC.createGain(); mFileGain.gain.value=0; mFileGain.connect(master); }
  mFileGain.gain.setTargetAtTime(musicOn&&!duck?1:0,t,duck?0.6:2.5);
  if(t<mFileNext||!musicOn||duck) return;
  const ks=MUSIC.filter(k=>bufs[k]&&k!==mLast), k=ks.length?ks[Math.floor(Math.random()*ks.length)]:mLast; if(!bufs[k]) return; mLast=k;
  const b=bufs[k], s=AC.createBufferSource(); s.buffer=b; const g=AC.createGain(), d=b.duration;
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(MUSIC_VOL,t+3); g.gain.setValueAtTime(MUSIC_VOL,t+d-4); g.gain.linearRampToValueAtTime(0.0001,t+d);
  s.connect(g); g.connect(mFileGain); s.start(t);
  // mehrere Stücke am Stück, weich übergeblendet; danach nur eine kurze Pause
  if(mRun<=0) mRun=Math.floor(rnd(3,7)); mRun--;
  // Pausen: meist kurz, manchmal länger
  mFileNext=mRun>0?t+d-3:t+d+(Math.random()<0.6?rnd(10,30):rnd(60,150));
}
function musicTick(){
  if(!AC||!musicOn||AC.state!=='running'||musicFilesReady()) return;
  if(!musicGain){ musicGain=AC.createGain(); musicGain.gain.value=0.5; musicGain.connect(master); }
  const now=AC.currentTime; if(mNext<now) mNext=now+0.06;
  while(mNext<now+0.3){ mSchedule(mStep,mNext); mNext+=M_STEP; mStep++; }
}

export { AC, ambTick, climbStop, musicSoon, setListeners, snd3d, hasSample, master, nbuf, initAudio, tone, snd, musicTick , gunshot };
