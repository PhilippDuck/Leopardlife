// LeoLife – Nilpferde: leben in großen Wasserlöchern. Tagsüber dösen sie im Wasser (nur Rücken, Augen und Ohren schauen
// heraus), nachts steigen sie ans Ufer und grasen. Sie jagen nicht, sind aber sehr wehrhaft: Wer an Land zwischen ein
// Nilpferd und sein Wasser gerät, ihm zu nahe kommt oder im Wasser zu ihm schwimmt, wird angegriffen – erst reißt es
// drohend das Maul auf, dann stürmt es los.
import { hurtPlayer } from './actions.js';
import { moveAnimal } from './ai.js';
import { snd } from './audio.js';
import { tell } from './coop.js';
import { puff } from './effects.js';
import { HIPPO_EYE, animLegs } from './models.js';
import { S, pScale } from './save.js';
import { H, WATER_D } from './terrain.js';
import { floatText } from './ui.js';
import { rnd } from './util.js';

const GRAZE_R=[3,26];         // nachts grasen sie so weit vom Ufer entfernt (von–bis)
const CLOSE_R=5, CLOSE_SNEAK_R=3.2;   // so nah darf niemand kommen
const BETWEEN_R=16, BETWEEN_W=5;      // zwischen Nilpferd und Wasser: bis zu dieser Entfernung und Breite des Weges
const WATER_R=8;              // im Wasser: wer so nah heranschwimmt, wird angegriffen
const CHARGE_T=3.2;           // so lange stürmt es höchstens hinterher
const CALM_T=7;               // danach droht es so lange nicht erneut
/** Nacht nach der Uhrzeit (nicht nach der Helligkeit), damit es nicht auf die Darstellung ankommt */
const hippoNight=()=>S.tod>0.8||S.tod<0.21;

const inPond=(x,z,p,k)=>Math.hypot(x-p.x,z-p.z)<p.r*k;

/** Bedroht Spieler T das Nilpferd a an Wasserloch p? Gibt einen Grund zurück oder null. */
function hippoThreat(a,T,p,d){
  if(!T||T.dead||T.safe||T.tree!=null) return null;
  if(d<(T.sneak?CLOSE_SNEAK_R:CLOSE_R)+a.rad) return 'nah';
  const kid=a.kids&&a.kids.find(k=>!k.dead&&Math.hypot(T.x-k.x,T.z-k.z)<6);
  if(kid) return 'junges';
  const aw=inPond(a.x,a.z,p,0.85), tw=inPond(T.x,T.z,p,0.95);
  if(aw) return tw&&d<WATER_R+a.rad?'wasser':null;
  // an Land: steht der Spieler auf dem Weg zum Wasser?
  if(d>BETWEEN_R) return null;
  const hx=p.x-a.x, hz=p.z-a.z, hd=Math.hypot(hx,hz)||1, ux=hx/hd, uz=hz/hd;
  const rx=T.x-a.x, rz=T.z-a.z, along=rx*ux+rz*uz, side=Math.abs(rx*uz-rz*ux);
  return along>0&&along<hd&&side<BETWEEN_W?'weg':null;
}
function warnOnce(T,why){
  const now=performance.now(); if(now-(T.hippoMsgAt||-1e9)<60000) return; T.hippoMsgAt=now;
  tell(T,why==='weg'?'Nilpferd! Du stehst zwischen ihm und dem Wasser – geh zur Seite!':why==='junges'?'Vorsicht – die Nilpferdmutter verteidigt ihr Junges!':'Nilpferd! Es reißt drohend das Maul auf – zurück!','#ff8a70');
}

/** Neues Ziel: tagsüber im Wasser, nachts grasend am Ufer */
function newSpot(a,p,night){
  const an=Math.random()*6.283, r=night?p.r+rnd(GRAZE_R[0],GRAZE_R[1]):Math.random()*p.r*0.6;
  a.tx=p.x+Math.cos(an)*r; a.tz=p.z+Math.sin(an)*r; a.timer=night?rnd(25,40):rnd(15,25); a.idle=night?rnd(2,6):rnd(3,9);
}

/** Ein Bild Nilpferdverhalten (aus updateAnimal). T: Spieler, auf den es reagiert; d, dx, dz: Abstand zu ihm. */
function hippoStep(a,dt,T,d,dx,dz){
  const mom=a.juv&&a.mom&&!a.mom.dead?a.mom:null;
  if(mom&&mom.pond) a.pond=mom.pond;
  const p=a.pond; if(!p) return;
  const night=hippoNight(), u=a.g.userData;
  if(a.calmT>0) a.calmT-=dt;
  let open=0, spd=0;
  if(a.state==='chase'&&!a.juv){ a.state='charge'; a.lt=CHARGE_T+1; a.tgt=T; a.hitT=false; }   // angegriffen: wehrt sich sofort
  else if(a.state==='chase'){ a.state='retreat'; }
  if(a.state==='gape'){
    open=1; a.lt-=dt; let df=Math.atan2(dx,dz)-a.g.rotation.y; while(df>Math.PI) df-=6.283; while(df<-Math.PI) df+=6.283;
    a.g.rotation.y+=df*Math.min(1,dt*4); animLegs(a.g,a.ph,0.04);   // dreht sich zum Störenfried
    if(a.lt<=0){ if(hippoThreat(a,T,p,d)||d<a.rad+7){ a.state='charge'; a.lt=CHARGE_T; a.tgt=T; a.hitT=false; snd.hippo(1); }
      else { a.state='retreat'; a.calmT=CALM_T*0.5; } }
  } else if(a.state==='charge'){
    a.lt-=dt; open=0.7;
    if(T.dead||T.safe||T.tree!=null||a.lt<=0||Math.hypot(T.x-p.x,T.z-p.z)>p.r+GRAZE_R[1]+14){ a.state='retreat'; a.calmT=CALM_T; }
    else {
      spd=a.sp.spd*1.6; moveAnimal(a,dx,dz,spd,dt);
      const reach=a.rad+0.6+pScale(T.L)*0.7;
      if(d<reach&&a.cd<=0){ a.cd=1.4; a.hitT=true; open=1; hurtPlayer(a.sp.dmg,a,false,T); u.inner.position.z=0.35;
        puff(T.x,H(T.x,T.z)+0.5,T.z,0xc0392b,6,0.45);
        if(!T.dead){ const k=2.2/(d||1); T.x+=dx*k; T.z+=dz*k; }   // wirft den Leoparden zurück
        a.state='retreat'; a.calmT=CALM_T; }
    }
  } else if(a.state==='retreat'){
    // zurück ins Wasser (nachts nur ein Stück, dann grast es weiter)
    if(inPond(a.x,a.z,p,night?1.05:0.55)){ a.state=night?'graze':'wade'; newSpot(a,p,night); }
    else { spd=a.sp.spd*(night?0.6:0.9); moveAnimal(a,p.x-a.x,p.z-a.z,spd,dt); }
  } else {
    // ruhig: tagsüber im Wasser dösen, nachts am Ufer grasen
    if(a.state!=='wade'&&a.state!=='graze'){ a.state=night?'graze':'wade'; newSpot(a,p,night); }
    if((a.state==='wade')===night){ a.state=night?'graze':'wade'; newSpot(a,p,night); a.idle=0; }
    if(mom){ const off=a.uid%2?1.6:-1.6; a.tx=mom.x+off; a.tz=mom.z-1.2; a.idle=0; }
    else { a.timer-=dt; if(a.timer<=0||Math.hypot(a.tx-a.x,a.tz-a.z)<1) newSpot(a,p,a.state==='graze'); }
    const far=Math.hypot(a.tx-a.x,a.tz-a.z);
    if(a.idle>0&&!mom){ a.idle-=dt; animLegs(a.g,a.ph,0.02); }
    else if(far>0.8){ const wet=inPond(a.x,a.z,p,0.9); spd=mom?Math.min(a.sp.spd*0.5,far):a.state==='graze'?(wet?2:1.1):(wet?0.7:2.2); moveAnimal(a,a.tx-a.x,a.tz-a.z,spd,dt); }
    else animLegs(a.g,a.ph,0.02);
    const why=!a.juv&&!(a.calmT>0)?hippoThreat(a,T,p,d):null;
    if(why){ a.state='gape'; a.lt=inPond(a.x,a.z,p,0.85)?1.3:0.8; a.tgt=T; snd.hippo(0.8); warnOnce(T,why);
      floatText('!',a.x,(a.sy||H(a.x,a.z))+a.sp.size*1.6,a.z,'#ff5a3c'); }
  }
  // Höhe: im Wasser tief abgetaucht (Augen knapp über der Wasserlinie), beim Drohen hebt es den Kopf, an Land auf dem Boden
  const wl=p.L-WATER_D, gy=H(a.x,a.z), dp=Math.hypot(a.x-p.x,a.z-p.z), s=(a.rad-0.25)/0.8;   // Modellgröße (Junge kleiner), wie beim Anlegen aus rad
  const deep=Math.max(0,Math.min(1,(p.r*0.92-dp)/(p.r*0.3)));
  const sub=wl-(HIPPO_EYE-0.1-(a.state==='gape'?0.3:0))*s;
  const ty=sub<gy?gy+(sub-gy)*deep:gy;
  a.sy=a.sy==null?ty:a.sy+(ty-a.sy)*Math.min(1,dt*3);
  a.g.position.set(a.x,a.sy,a.z);
  if(deep>0.3&&spd>0.5&&Math.random()<dt*3) puff(a.x+rnd(-0.8,0.8),wl+0.05,a.z+rnd(-0.8,0.8),0xe0f0f4,2,0.2);   // Bugwelle
  a.near=a.state==='gape'||a.state==='charge';
  if(u.jaw){ u.jaw.rotation.x+=(open*1.05-u.jaw.rotation.x)*Math.min(1,dt*8); u.head.rotation.x+=(-open*0.35-u.head.rotation.x)*Math.min(1,dt*6); }
  if(a.state==='graze'&&a.idle>0&&u.head) u.head.rotation.x=0.35;   // Kopf im Gras
  u.inner.position.z*=0.85;
}

export { hippoStep, hippoThreat };
