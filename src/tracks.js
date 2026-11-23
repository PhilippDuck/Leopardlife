// LeoLife – Spuren und Fährten der Tiere.
import { scene } from './engine.js';
import { S, has, tf } from './save.js';
import { H } from './terrain.js';
import { _tm, _tv } from './vegetation.js';

/* ---------- Spuren: Tiere hinterlassen Fährten; mit Witterung bleiben sie länger sichtbar. Raubtier-Fährten sind rötlich. ---------- */
const TRACK_N=500, _c3=new THREE.Color(), _tz=new THREE.Matrix4().makeScale(0,0,0), _tq2=new THREE.Quaternion(), _tY=new THREE.Vector3(0,1,0);
const trackMesh=(()=>{ const g=new THREE.CircleGeometry(1,7); g.rotateX(-Math.PI/2);
  const m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),TRACK_N);
  for(let i=0;i<TRACK_N;i++){ m.setMatrixAt(i,_tz); m.setColorAt(i,_c3.setHex(0x3a2a18)); }
  m.frustumCulled=false; m.renderOrder=1; scene.add(m); return m; })();
const tracks=new Array(TRACK_N).fill(null); let trackI=0, trackUpd=0;
const trackLife=()=>25+20*S.b.nose+15*tf('nase');
function addTrack(a,side){
  const ang=a.g.rotation.y, s=a.sp.size, off=0.2*s*side, x=a.x+Math.cos(ang)*off, z=a.z-Math.sin(ang)*off;
  const pred=!!(a.sp.hunt&&S.lvl<a.sp.hunt);
  tracks[trackI]={x,z,y:H(x,z)+0.05,s:0.08+0.12*s,rot:ang,t:0};
  trackMesh.setColorAt(trackI,_c3.setHex(pred?0x6a1c10:0x3a2a18)); trackMesh.instanceColor.needsUpdate=true;
  trackI=(trackI+1)%TRACK_N;
}
function updateTracks(dt){
  trackUpd+=dt; if(trackUpd<0.2) return; const el=trackUpd; trackUpd=0;
  const life=trackLife(); let ch=false;
  for(let i=0;i<TRACK_N;i++){ const t=tracks[i]; if(!t) continue; t.t+=el; ch=true;
    if(t.t>=life){ tracks[i]=null; trackMesh.setMatrixAt(i,_tz); continue; }
    const f=Math.min(1,(life-t.t)/6)*t.s; _tq2.setFromAxisAngle(_tY,t.rot);
    _tm.compose(_tv.set(t.x,t.y,t.z),_tq2,_ts2.set(f*0.7,1,f)); trackMesh.setMatrixAt(i,_tm); }
  if(ch) trackMesh.instanceMatrix.needsUpdate=true;
}
const _ts2=new THREE.Vector3();

export { addTrack, updateTracks };
