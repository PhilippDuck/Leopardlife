// LeoLife – Krokodile: lauern abgetaucht im Wasser, schleichen sich an Trinkende heran und schnellen hervor.
import { gainXp, hurtPlayer } from './actions.js';
import { tell } from './coop.js';
import { moveAnimal } from './ai.js';
import { snd } from './audio.js';
import { puff } from './effects.js';
import { CROC_EYE, animCroc } from './models.js';
import { P } from './player.js';
import { pScale } from './save.js';
import { H, WATER_D } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';

/* ---------- Krokodile ----------
   lurk:  treibt abgetaucht durchs Wasserloch, nur Augen und Luftblasen verraten es
   stalk: jemand ist am Ufer – es gleitet langsam und unter Wasser heran (eine Spur aus Blasen)
   rise:  kurzes Aufschäumen als Warnung, dann
   lunge: schnellt mit offenem Maul vor, beißt und zerrt die Beute Richtung Wasser
   return / chase / flee: zurück ins Wasser, am Ufer verteidigen, fliehen
   Am eigenen Wasserloch greifen Krokodile jeden Leoparden an, egal wie groß – wer trinkt, hat den Kopf unten und merkt es spät. */
/** @param {import('./player.js').Player} [T] Spieler, auf den das Krokodil reagiert */
function crocStep(a,dt,d,dx,dz,stealth,hostile,T=P,prey=null){
  const sp=a.sp, p=a.pond, wl=p.L-WATER_D, s=sp.size;
  // Tiere, die sich an diesem Wasserloch zum Trinken nähern, sind ebenfalls Beute.
  if(prey){
    a.near=false; a.hidden=false;
    const x=prey.x-a.x,z=prey.z-a.z,dist=Math.hypot(x,z),reach=a.rad+prey.rad+0.7;
    a.state='huntWild'; a.g.rotation.y=Math.atan2(x,z);
    if(dist>reach) moveAnimal(a,x,z,sp.spd*1.5,dt);
    else if(a.cd<=0){ a.cd=2.2; prey.hp-=sp.dmg*1.25; puff(prey.x,H(prey.x,prey.z)+0.3,prey.z,0xc0392b,7,0.45);
      if(prey.hp<=0){ prey.dead=true; prey.crocKilled=true; a.state='return'; }
      else { prey.state='flee'; prey.fleeT=0; prey.drinkPond=null; prey.thirst=45; }
      snd.snap(); }
    const inW=Math.hypot(a.x-p.x,a.z-p.z)<p.r*0.8,gy=H(a.x,a.z),ty=inW?Math.max(gy,wl-(CROC_EYE-0.07)*s):gy;
    a.sy=a.sy==null?ty:a.sy+(ty-a.sy)*Math.min(1,dt*5); a.g.position.set(a.x,a.sy,a.z);
    const u=a.g.userData; if(u.croc){ u.inner.rotation.x*=Math.max(0,1-dt*8); animCroc(a.g,a.ph,0.4,inW,dist<=reach?1:0.2); }
    return;
  }
  if(a.state==='huntWild') a.state='return';
  const tp=Math.hypot(T.x-p.x,T.z-p.z);                      // Abstand des Spielers zur Mitte des Wasserlochs
  const atPond=tp<p.r+5&&!T.safe&&!T.dead&&!(a.scared>0);    // steht am Ufer oder im Wasser
  const drink=!!T.drinking;
  let open=0, swim=true, tilt=0;
  if(a.state==='rise'){
    a.lt-=dt; open=1; tilt=-0.25; a.g.rotation.y=Math.atan2(dx,dz);
    if(a.lt<=0){ a.state='lunge'; a.lt=0.8; a.hitT=false; puff(a.x,wl+0.3,a.z,0xd8ecf2,14,0.6); }
  } else if(a.state==='lunge'){
    a.lt-=dt; open=a.cd>0?0.2:1; tilt=-0.12; swim=false; moveAnimal(a,dx,dz,12+2*s,dt);
    if(d<a.rad+0.9+pScale(T.L)*0.6&&a.cd<=0&&!T.safe){ a.cd=1.6; a.hitT=true; snd.snap(); hurtPlayer(sp.dmg,a,false,T); a.lt=Math.min(a.lt,0.25);
      if(!T.dead&&tp>0.1){ const k=Math.min(1.4,tp*0.15); T.x+=(p.x-T.x)/tp*k; T.z+=(p.z-T.z)/tp*k; }   // zerrt Richtung Wasser
      puff(T.x,H(T.x,T.z)+0.4,T.z,0xd8ecf2,10,0.5); }
    if(a.lt<=0){ a.state='return';
      // ausgewichen: Erfahrung, höchstens alle 45 Sekunden
      const now=performance.now(); if(!a.hitT&&!T.dead&&d<10&&now-(T.dodgeAt||-1e9)>45000){ T.dodgeAt=now; floatText('Ausgewichen! +25 EP',T.x,H(T.x,T.z)+2,T.z,'#9be07f'); gainXp(25,T); } }
  } else if(a.state==='lurk'||a.state==='stalk'){
    a.near=atPond&&d<25;
    if(a.state==='lurk'){
      a.timer-=dt;
      if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1){ const an=Math.random()*6.283, r=Math.random()*p.r*0.6; a.tx=p.x+Math.cos(an)*r; a.tz=p.z+Math.sin(an)*r; a.timer=rnd(6,14); }
      moveAnimal(a,a.tx-a.x,a.tz-a.z,0.6,dt);
      if(atPond&&a.cd<=0&&d<p.r*2.2) a.state='stalk';
    } else {
      // Ziel: der Punkt im Wasser vor dem Spieler, knapp unter der Wasserlinie
      const ux=(T.x-p.x)/(tp||1), uz=(T.z-p.z)/(tp||1), rr=Math.min(Math.max(0,tp-1.8),p.r*0.7);
      moveAnimal(a,p.x+ux*rr-a.x,p.z+uz*rr-a.z,drink?2.4:1.4,dt);
      if(!p.murky&&Math.random()<dt*3) puff(a.x+rnd(-0.4,0.4),wl+0.05,a.z+rnd(-0.4,0.4),0xe0f0f4,2,0.18);   // Blasenspur
      else if(p.murky&&Math.random()<dt*0.9) puff(a.x+rnd(-0.6,0.6),wl+0.04,a.z+rnd(-0.6,0.6),0xa59c6c,3,0.25);   // trüb: nur feine Wellen
      if(!atPond||tp>p.r+9) { a.state='lurk'; a.timer=0; }
    }
    const reach=(4.5+2.5*s)*Math.max(0.55,stealth)*(drink?1.5:1);
    if(atPond&&a.cd<=0&&d<reach){ a.state='rise'; a.lt=drink?0.4:0.55; snd.croc(); puff(a.x,wl+0.2,a.z,0xd8ecf2,8,0.4); floatText('!',a.x,wl+s*1.5,a.z,'#ff5a3c'); }
    if(!p.murky&&d<30&&Math.random()<dt*0.6) puff(a.x+rnd(-0.6,0.6),wl+0.05,a.z+rnd(-0.6,0.6),0xe0f0f4,2,0.15);   // Luftblasen
    if(p.murky) murkySigns(a,dt,d,tp,T);
  } else {
    const hx=p.x-a.x, hz=p.z-a.z, hd=Math.hypot(hx,hz);
    if(a.state==='chase'&&hd<p.r+14&&!T.safe&&!T.dead){   // angegriffen: verteidigt sich kurz am Ufer
      swim=false;
      if(d>a.rad+1) moveAnimal(a,dx,dz,sp.spd*1.6,dt); else if(a.cd<=0){ a.cd=1.3; snd.snap(); hurtPlayer(sp.dmg*0.7,a,false,T); }
      open=d<a.rad+3?0.8:0.3; a.aggro-=dt; if(a.aggro<=0) a.state='return';
    } else if(hd>p.r*0.5) moveAnimal(a,hx,hz,sp.spd*(a.state==='flee'?1.6:1),dt);
    else { a.state='lurk'; a.timer=0; }
  }
  // Höhe: abgetaucht schauen nur die Augenhöcker heraus, beim Angriff taucht der Rücken auf, an Land läuft es auf dem Boden
  const inW=Math.hypot(a.x-p.x,a.z-p.z)<p.r*0.8, gy=H(a.x,a.z);
  const sub=a.state==='lurk'||a.state==='stalk';
  a.hidden=p.murky&&sub&&!(a.seenT>0); if(a.seenT>0) a.seenT-=dt;
  const ty=inW?Math.max(gy,sub?wl-(CROC_EYE-0.07+(a.hidden?0.25:0))*s:wl-0.2*s):gy;
  a.sy=a.sy==null?ty:a.sy+(ty-a.sy)*Math.min(1,dt*5);
  a.g.position.set(a.x,a.sy,a.z);
  const u=a.g.userData; if(u.croc){ u.inner.rotation.x+=(tilt-u.inner.rotation.x)*Math.min(1,dt*8); animCroc(a.g,a.ph,0.3,swim&&inW,open); }
}

/* Trüber Tümpel: das Krokodil bleibt unsichtbar. Wer am Ufer geduckt still verharrt (Schleichen), bemerkt es nach kurzer Zeit:
   ein Wellenring, ein kurzes Auftauchen der Augen. Beim ersten Besuch gibt es einen Hinweis. */
function murkySigns(a,dt,d,tp,T){
  const p=a.pond;
  if(tp<p.r+6&&!T.dead){
    (T.murkyTold||(T.murkyTold=new Set()));
    if(!T.murkyTold.has(p)){ T.murkyTold.add(p); tell(T,'Trübes Wasser: Ein Krokodil siehst du hier nicht. Duck dich am Ufer (Schleichen) und warte, ob sich etwas regt, bevor du trinkst.','#c9b77a'); }
    if(T.sneak&&!T.drinking&&d<p.r+10){ a.spotT=(a.spotT||0)+dt;
      if(a.spotT>1.6&&!(a.seenT>0)){ a.seenT=4; a.spotT=0; floatText('?',a.x,p.L-WATER_D+1.2,a.z,'#ffcf5a'); puff(a.x,p.L-WATER_D+0.05,a.z,0xa59c6c,6,0.4); tell(T,'Da bewegt sich etwas im trüben Wasser!','#ffcf5a'); } }
    else a.spotT=Math.max(0,(a.spotT||0)-dt);
  }
}

export { crocStep };
