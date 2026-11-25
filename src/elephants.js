// LeoLife – Elefanten: Herden mit Jungen ziehen durch die Savanne und treffen sich an den Wasserlöchern (sie trinken wie
// anderes Wild). Sie sind keine Beute. Kommt ein Leopard zu nahe, droht das nächste erwachsene Tier: Ohren gespreizt,
// Rüssel erhoben, Trompeten – die übrige Herde bleibt stehen und schaut. Wer jetzt zurückweicht, hat Ruhe;
// wer näher kommt oder bleibt, wird niedergetrampelt.
import { hurtPlayer } from './actions.js';
import { moveAnimal } from './ai.js';
import { snd } from './audio.js';
import { tell } from './coop.js';
import { puff } from './effects.js';
import { animLegs } from './models.js';
import { pScale } from './save.js';
import { H } from './terrain.js';
import { floatText } from './ui.js';

const ELE_WARN_R=20, ELE_WARN_SNEAK_R=11;   // so nah darf ein Leopard der Herde kommen (normal / schleichend), dann droht sie
const ELE_KID_R=15;                     // bei den Jungen sind sie empfindlicher
const ELE_ATTACK_R=10;                  // wer nach dem Drohen noch so nah ist (oder näher kommt), wird angegriffen
const ELE_THREAT_T=2.8, ELE_THREAT_MIN=1;   // so lange droht es (mindestens so lange, auch wenn man näher kommt)
const ELE_CHARGE_T=4.5, ELE_CALM_T=10;      // Angriff höchstens so lange; danach so lange keine neue Drohung

function eleFace(a,dx,dz,dt){
  let df=Math.atan2(dx,dz)-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
  a.g.rotation.y+=df*Math.min(1,dt*3);
}
function eleAlarm(a,v,dt){ const u=a.g.userData; u.alarm=(u.alarm||0)+(v-(u.alarm||0))*Math.min(1,dt*4); }

/** Ist Spieler T der Herde von a zu nahe gekommen? */
function eleThreat(a,T,d){
  if(!T||T.dead||T.safe||T.tree!=null) return false;
  const r=(T.sneak?ELE_WARN_SNEAK_R:ELE_WARN_R)*(T.stealth==null?1:Math.max(0.6,T.stealth));
  if(d<r+a.rad) return true;
  for(const m of a.herd||[a]) for(const j of m.kids||[]) if(!j.dead&&Math.hypot(T.x-j.x,T.z-j.z)<ELE_KID_R) return true;
  return false;
}
function eleStartThreat(a,T,d){
  a.state='threat'; a.lt=ELE_THREAT_T; a.tgt=T; a.threatD=d;
  snd.trumpet(1); floatText('!',a.x,H(a.x,a.z)+a.sp.size*2,a.z,'#ff5a3c');
  for(const o of a.herd||[]){ if(o===a||o.dead||o.juv) continue; if(o.state==='wander'||o.state==='drink'){ o.state='alert'; o.lt=ELE_THREAT_T+1; o.tgt=T; } }
  for(const o of a.herd||[]) for(const k of o.kids||[]) if(!k.dead){ k.tx=o.x; k.tz=o.z; }   // Junge drängen sich an die Mütter
  const now=performance.now(); if(now-(T.eleMsgAt||-1e9)>60000){ T.eleMsgAt=now; tell(T,'Elefanten! Sie spreizen die Ohren und trompeten – geh langsam zurück, sonst greifen sie an.','#ff8a70'); }
}
function eleCalm(a,t){ a.state='wander'; a.timer=0; a.calmT=t; a.tgt=null; }

/** Ein Bild Elefantenverhalten (aus updateAnimal). true: erledigt; false: das übliche Herdenverhalten (Ziehen, Trinken) läuft weiter. */
function elephantStep(a,dt,T,d,dx,dz){
  if(a.calmT>0) a.calmT-=dt;
  if(a.state==='chase'){ if(a.juv){ a.state='wander'; return false; } a.state='charge'; a.lt=ELE_CHARGE_T; a.tgt=T; }   // gebissen: greift sofort an
  if(a.state==='threat'){
    eleAlarm(a,1,dt); eleFace(a,dx,dz,dt); a.ph+=dt*2; animLegs(a.g,a.ph,0.03);
    a.lt-=dt;
    const closer=d<a.threatD-2||d<ELE_ATTACK_R*0.6;
    if(T.dead||T.safe||T.tree!=null) eleCalm(a,ELE_CALM_T*0.5);
    else if((closer&&a.lt<ELE_THREAT_T-ELE_THREAT_MIN)||(a.lt<=0&&d<ELE_ATTACK_R+a.rad)){ a.state='charge'; a.lt=ELE_CHARGE_T; snd.trumpet(1); }
    else if(a.lt<=0){ eleCalm(a,ELE_CALM_T*0.6); }
  } else if(a.state==='charge'){
    eleAlarm(a,0.6,dt); a.lt-=dt;
    if(T.dead||T.safe||T.tree!=null||a.lt<=0||d>40) eleCalm(a,ELE_CALM_T);
    else {
      moveAnimal(a,dx,dz,a.sp.spd*1.5,dt);
      if(Math.random()<dt*6) puff(a.x,H(a.x,a.z)+0.2,a.z,0xb9a37a,3,0.5);   // Staub
      const reach=a.rad+0.4+pScale(T.L)*0.7;
      if(d<reach&&a.cd<=0){ a.cd=1.5; hurtPlayer(a.sp.dmg,a,false,T); a.g.userData.inner.position.z=0.4;
        if(!T.dead&&d>0.01){ const k=3/d; T.x+=dx*k; T.z+=dz*k; }   // schleudert den Leoparden weg
        eleCalm(a,ELE_CALM_T); }
    }
  } else if(a.state==='alert'){
    eleAlarm(a,0.5,dt); eleFace(a,dx,dz,dt); animLegs(a.g,a.ph,0.02); a.lt-=dt;
    if(a.lt<=0) eleCalm(a,ELE_CALM_T*0.5);
  } else {
    eleAlarm(a,0,dt);
    if(!a.juv&&!(a.calmT>0)&&(a.state==='wander'||a.state==='drink')&&eleThreat(a,T,d)){
      // nur ein Tier je Herde droht: das, dem der Leopard am nächsten ist
      const other=(a.herd||[]).some(o=>o!==a&&!o.dead&&(o.state==='threat'||o.state==='charge'));
      if(!other) eleStartThreat(a,T,d);
    }
    if(a.state!=='threat') return false;
  }
  a.cd-=dt;
  const inn=a.g.userData.inner; inn.position.z*=0.85;
  a.g.position.set(a.x,H(a.x,a.z),a.z);
  return true;
}

export { eleThreat, elephantStep };
