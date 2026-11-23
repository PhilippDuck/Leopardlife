// LeoLife – Sehen und Hören der Tiere.
// Ein Tier bemerkt einen Leoparden nicht mehr in einem Kreis, sondern so, wie es ihn wirklich wahrnehmen kann:
//   Sichtfeld   – Beutetiere (Augen seitlich) sehen fast rundum, Raubtiere vor allem nach vorn; von hinten sieht keiner gut.
//   Kopf unten  – grasende Tiere sehen schlecht; der Wächter einer Herde schaut sich ständig um und sieht weiter.
//   Sichtlinie  – Hügelkämme verdecken ganz, Felsen und Büsche fast ganz, Baumstämme teilweise (hohes Gras: Tarnung wie bisher).
//   Hören       – Rennen hört man rundum (auch hinter Felsen), normales Gehen etwas, Schleichen kaum.
import { animals } from './animals.js';
import { players } from './player.js';
import { D, pScale } from './save.js';
import { H, sightAt } from './terrain.js';
import { scene } from './engine.js';

/** Sichtfeld-Faktor je Winkel zur Blickrichtung (0 = genau voraus, π = genau hinten) */
function coneF(sp,ang){
  const a=Math.abs(ang);
  if(sp.pred||sp.human){ if(a<1.0) return 1; if(a<1.9) return 1-(a-1.0)/0.9*0.6; return Math.max(0.15,0.4-(a-1.9)/1.25*0.25); }
  if(a<1.2) return 1; if(a<2.2) return 1-(a-1.2)/1.0*0.3; return Math.max(0.2,0.7-(a-2.2)/0.94*0.5);
}
/** Ist die Linie vom Auge (ax,ay,az) zum Ziel (bx,by,bz) frei? 1 = frei, 0 = verdeckt (Gelände, Felsen, Büsche, Stämme) */
function lineOfSight(ax,ay,az,bx,by,bz){
  const dx=bx-ax, dz=bz-az, len=Math.hypot(dx,dz); if(len<1.5) return 1;
  // Gelände: einige Punkte entlang der Linie (Hügelkämme)
  const n=Math.min(14,Math.ceil(len/5));
  for(let i=1;i<n;i++){ const t=i/n, x=ax+dx*t, z=az+dz*t, y=ay+(by-ay)*t; if(H(x,z)>y-0.05) return 0; }
  // Hindernisse: Rasterzellen entlang der Linie, jedes Hindernis höchstens einmal
  let vis=1; const seen=new Set(), steps=Math.ceil(len/4);
  for(let i=0;i<=steps;i++){ const t=i/steps, L=sightAt(ax+dx*t,az+dz*t); if(!L) continue;
    for(const o of L){ if(seen.has(o)) continue; seen.add(o);
      // Abstand des Hindernismittelpunkts zur Linie (nur zwischen Auge und Ziel, nicht dahinter)
      const u=((o.x-ax)*dx+(o.z-az)*dz)/(len*len); if(u<=0.02||u>=0.98) continue;
      const px=ax+dx*u-o.x, pz=az+dz*u-o.z; if(px*px+pz*pz>o.r*o.r) continue;
      const ly=ay+(by-ay)*u; if(ly>o.top) continue;   // Linie führt drüber hinweg
      vis*=1-o.op; if(vis<0.05) return 0; } }
  return vis;
}
/** Wie gut sieht Tier a den Spieler p gerade? 0…~1.3 (Blickrichtung, Kopf unten/Wächter, Sichtlinie); alle 0,25 s neu berechnet */
function visibility(a,p,dt){
  a.visT=(a.visT||0)-dt; a.vis=a.vis||new Map();
  if(a.visT>0&&a.vis.has(p)) return a.vis.get(p);
  a.visT=0.2+Math.random()*0.1;
  const sp=a.sp, gy=H(a.x,a.z), eye=gy+Math.max(0.5,sp.size*(sp.human?1.8:1.15)), sc=pScale(p.L);
  const ty=(p.tree!=null?p.y+p.upNow:H(p.x,p.z))+(p.sneak?0.32:0.55)*sc;
  const look=a.g.rotation.y+(a.watch&&a.idle>0?Math.sin(performance.now()/900+a.uid)*1.2:0);
  let ang=Math.atan2(p.x-a.x,p.z-a.z)-look; while(ang>Math.PI) ang-=6.283; while(ang<-Math.PI) ang+=6.283;
  let v=coneF(sp,ang);
  if(a.state==='wander'&&a.idle>0&&!a.watch&&!sp.pred) v*=0.55;          // grast: Kopf unten
  if(a.watch) v*=1.25;                                                     // Wächter: Kopf oben, schaut sich um
  if(v>0.02) v*=lineOfSight(a.x,eye,a.z,p.x,ty,p.z);
  a.vis.set(p,v); return v;
}
/** Wie weit hört man Spieler p gerade? (Meter, schon mit Schwierigkeit) */
const hearR=p=>(p.noise||0)*D().sense;

/* ---------- Wächter in Herden ---------- */
// In jeder Herde hält eins Wache (stirbt es, übernimmt ein anderes); über ihm schwebt ein kleines Auge, wenn ein Spieler nah ist.
function eyeSprite(){
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  if(x){
    x.strokeStyle='rgba(255,255,255,0.92)';
    x.lineWidth=4;
    x.lineJoin='round';
    x.beginPath();
    x.moveTo(8,32); x.quadraticCurveTo(32,6,56,32);
    x.quadraticCurveTo(32,58,8,32); x.closePath(); x.stroke();
    x.fillStyle=x.strokeStyle; x.beginPath(); x.arc(32,32,7,0,Math.PI*2); x.fill();
  }
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false})); s.scale.set(0.9,0.9,1); s.visible=false; scene.add(s); return s;
}
let eyes=null;
function updateWatchers(){
  try{ if(!eyes) eyes=[]; }catch(e){ return; }
  const herds=new Set(); for(const a of animals) if(a.herd&&!a.dead) herds.add(a.herd);
  let i=0;
  for(const h of herds){
    let w=h.find(m=>m.watch&&!m.dead); if(!w){ w=h.find(m=>!m.dead); if(!w) continue; h.forEach(m=>{ m.watch=false; }); w.watch=true; }
    const near=players.some(p=>Math.hypot(p.x-w.x,p.z-w.z)<70)&&w.g.visible&&w.state==='wander';
    if(!eyes[i]) eyes[i]=eyeSprite();
    const e=eyes[i++]; e.visible=near; if(near) e.position.set(w.x,H(w.x,w.z)+w.sp.size*2.3+Math.sin(performance.now()/400)*0.08,w.z);
  }
  for(;i<eyes.length;i++) eyes[i].visible=false;
}

export { hearR, lineOfSight, updateWatchers, visibility };
