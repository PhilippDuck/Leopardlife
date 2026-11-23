// LeopardLife – Menschenfigur (Wilderer): gegliederter Körper mit Knien und Ellbogen, Buschhut, Weste, Rucksack
// und Zielfernrohrgewehr. Beide Hände liegen per Zwei-Knochen-IK immer am Gewehr; Haltung blendet zwischen
// „Tragen" (schräg vor der Brust) und „Anlegen" (Kolben in der Schulter, Oberkörper seitlich gedreht) über.
import { blobs } from './quality.js';
import { rnd } from './util.js';

const huSCALE=1.4;    // Mensch etwa 2,6 Einheiten groß – passt zu Gnu, Löwe und einem ausgewachsenen Leoparden
const huMatCache={}; const huM=c=>huMatCache[c]||(huMatCache[c]=new THREE.MeshLambertMaterial({color:c}));
const huSKIN=[0x6b4329,0x7a4e33,0x8a5c3c,0x5a3822,0x9a6a48];
const huSHIRT=[0x5b6340,0x6e6a4a,0x4f5a3c,0x7a6f52];
const huVEST=[0x7a6a45,0x5e5236,0x6d6040];
const huPANTS=[0x6b6142,0x4f4a36,0x5d5844];
const huHAT=[0x6e5a3a,0x5a4c33,0x7d6a48];
const huWOOD=0x6a4226, huMETAL=0x26282a, huBOOT=0x2e2620, huBAND=0x3a2f22, huBRASS=0xc9a44a;
const huPick=a=>a[Math.floor(Math.random()*a.length)];

const huShGeo=new THREE.CircleGeometry(1,12); huShGeo.rotateX(-Math.PI/2);
const huShMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.22,depthWrite:false});

function huMesh(geo,c,x,y,z,parent){ const m=new THREE.Mesh(geo,huM(c)); m.position.set(x,y,z); m.castShadow=true; parent.add(m); return m; }
const huBox=(w,h,d,c,x,y,z,p)=>huMesh(new THREE.BoxGeometry(w,h,d),c,x,y,z,p);
/** Kegelstumpf entlang -Y ab dem Gelenk (für Gliedmaßen) */
const huSeg=(rt,rb,len,c,p)=>huMesh(new THREE.CylinderGeometry(rt,rb,len,8),c,0,-len/2,0,p);
const huCylZ=(r,len,c,x,y,z,p)=>{ const m=huMesh(new THREE.CylinderGeometry(r,r,len,8),c,x,y,z,p); m.rotation.x=Math.PI/2; return m; };

/* Maße (Meter, vor huSCALE) */
const huSHIN=0.44, huTHIGH=0.44, huHIP=0.08+huSHIN+huTHIGH, huUPPER=0.3, huFORE=0.31, huTORSO_Y=0.08;
const huSHOULDER_R=new THREE.Vector3(0.235,0.47,0), huSHOULDER_L=new THREE.Vector3(-0.235,0.47,0);
/* Griffpunkte am Gewehr (Gewehr zeigt mit der Mündung nach +Z) */
const huGRIP=new THREE.Vector3(0,-0.07,-0.05), huFOREND=new THREE.Vector3(0,-0.045,0.24);
/* Anlegen: Oberkörper um huAIM_TWIST gedreht (linke Schulter vorn); Lage in Hüft-Koordinaten, dann in Rumpf-Koordinaten umgerechnet */
const huAIM_TWIST=0.7;
const huAIM_POS=new THREE.Vector3(0.045,0.69,0.42).sub(new THREE.Vector3(0,huTORSO_Y,0)).applyAxisAngle(new THREE.Vector3(0,1,0),-huAIM_TWIST);
const huAIM_Q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-huAIM_TWIST);
/* Tragen: schräg vor der Brust, Mündung nach links oben, Kolben an der rechten Hüfte */
const huCARRY_POS=new THREE.Vector3(0.03,0.36,0.21);
const huCARRY_Q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(-0.5,0.76,0.4).normalize(),new THREE.Vector3(),new THREE.Vector3(0.15,0.2,1)));

function buildRifle(){
  const r=new THREE.Group();
  huBox(0.05,0.1,0.34,huWOOD,0,-0.035,-0.26,r);           // Schaft
  huBox(0.05,0.06,0.12,huWOOD,0,0.015,-0.2,r);            // Schaftrücken (Wange)
  huBox(0.056,0.125,0.03,huBAND,0,-0.035,-0.44,r);        // Kolbenkappe
  const pg=huBox(0.04,0.1,0.05,huWOOD,0,-0.08,-0.06,r); pg.rotation.x=0.35;   // Pistolengriff
  huBox(0.052,0.075,0.24,huMETAL,0,0,0.04,r);             // System
  huBox(0.012,0.04,0.07,huMETAL,0,-0.055,0.0,r);          // Abzugsbügel
  huBox(0.046,0.06,0.3,huWOOD,0,-0.012,0.3,r);            // Vorderschaft
  huCylZ(0.013,0.4,huMETAL,0,0.01,0.6,r);                 // Lauf
  huCylZ(0.018,0.03,huMETAL,0,0.01,0.8,r);                // Mündung
  huCylZ(0.021,0.24,huMETAL,0,0.08,0.05,r);               // Zielfernrohr
  huCylZ(0.029,0.05,huMETAL,0,0.08,0.18,r); huCylZ(0.026,0.04,huMETAL,0,0.08,-0.07,r);
  huBox(0.02,0.04,0.02,huMETAL,0,0.05,-0.02,r); huBox(0.02,0.04,0.02,huMETAL,0,0.05,0.12,r);
  huBox(0.01,0.012,0.012,0xcfe3ff,0,0.08,0.206,r);      // Glas
  const bolt=huBox(0.016,0.016,0.07,huMETAL,0.045,0.01,-0.02,r); bolt.rotation.y=-0.9;
  return r;
}

/** Arm aus Schultergelenk, Ellbogengelenk und Hand */
function buildArm(torso,at,shirt,skin){
  const sh=new THREE.Group(); sh.position.copy(at); torso.add(sh);
  huSeg(0.058,0.048,huUPPER,shirt,sh);
  const el=new THREE.Group(); el.position.y=-huUPPER; sh.add(el);
  huMesh(new THREE.CylinderGeometry(0.05,0.05,0.05,8),shirt,0,-0.02,0,el);   // hochgekrempelter Ärmel
  huSeg(0.042,0.034,huFORE-0.05,skin,el);
  huBox(0.055,0.085,0.07,skin,0,-huFORE,0.01,el);                              // Hand
  return {sh,el};
}
function buildLeg(hips,x,pants){
  const th=new THREE.Group(); th.position.set(x,0,0); hips.add(th);
  huSeg(0.082,0.064,huTHIGH,pants,th);
  const kn=new THREE.Group(); kn.position.y=-huTHIGH; th.add(kn);
  huSeg(0.062,0.05,huSHIN,pants,kn);
  huBox(0.12,0.1,0.13,huBOOT,0,-huSHIN+0.02,0,kn);           // Stiefelschaft
  huBox(0.12,0.08,0.27,huBOOT,0,-huSHIN-0.035,0.06,kn);      // Fuß
  huBox(0.13,0.02,0.29,0x1c1712,0,-huSHIN-0.075,0.06,kn);  // Sohle
  return {th,kn};
}

/** Wilderer bauen. Schnittstelle wie die Tiermodelle: userData.anim(phase,amp) wird von animLegs aufgerufen, userData.aim (0/1) wählt die Haltung. */
function buildHuman(){
  const g=new THREE.Group(), inner=new THREE.Group(); inner.scale.setScalar(huSCALE); g.add(inner);
  const skin=huPick(huSKIN), shirt=huPick(huSHIRT), vest=huPick(huVEST), pants=huPick(huPANTS), hatC=huPick(huHAT), beard=Math.random()<0.6;
  const hips=new THREE.Group(); hips.position.y=huHIP; inner.add(hips);
  huBox(0.33,0.2,0.2,pants,0,-0.02,0,hips);                                   // Becken
  huBox(0.35,0.055,0.215,huBAND,0,0.07,0,hips);                                 // Gürtel
  huBox(0.05,0.04,0.01,huBRASS,0,0.07,0.11,hips);
  huBox(0.09,0.1,0.07,vest,-0.17,0.0,0.03,hips); huBox(0.08,0.11,0.08,huBAND,0.18,-0.01,-0.04,hips);   // Taschen am Gürtel
  const legL=buildLeg(hips,-0.1,pants), legR=buildLeg(hips,0.1,pants);

  const torso=new THREE.Group(); torso.position.y=huTORSO_Y; hips.add(torso);
  huBox(0.32,0.24,0.2,shirt,0,0.1,0,torso);                                   // Bauch
  huBox(0.42,0.3,0.23,shirt,0,0.36,0,torso);                                  // Brust
  huBox(0.43,0.33,0.245,vest,0,0.27,0.005,torso);                             // Weste
  huBox(0.15,0.36,0.02,shirt,0,0.3,0.12,torso);                               // Hemd im Westenausschnitt
  [-0.12,0.12].forEach(x=>{ huBox(0.1,0.09,0.03,vest,x,0.2,0.13,torso); huBox(0.1,0.025,0.035,huBAND,x,0.25,0.135,torso); });
  huBox(0.4,0.09,0.2,shirt,0,0.49,0,torso);                                   // Schultern
  // Patronengurt quer über die Brust
  const bd=new THREE.Group(); bd.position.set(0,0.3,0.135); bd.rotation.z=0.72; torso.add(bd);
  huBox(0.05,0.56,0.02,huBAND,0,0,0,bd); for(let i=0;i<6;i++) huBox(0.022,0.035,0.025,huBRASS,0,-0.2+i*0.08,0.008,bd);
  // Rucksack mit Schlafrolle
  huBox(0.3,0.34,0.15,0x4a4a30,0,0.29,-0.19,torso); huBox(0.22,0.12,0.04,0x3f3f28,0,0.2,-0.28,torso);
  const roll=huMesh(new THREE.CylinderGeometry(0.065,0.065,0.34,8),0x5c5a44,0,0.5,-0.2,torso); roll.rotation.z=Math.PI/2;
  [-0.1,0.1].forEach(x=>huBox(0.04,0.03,0.25,huBAND,x,0.5,-0.06,torso));        // Träger über den Schultern
  huMesh(new THREE.CylinderGeometry(0.055,0.06,0.1,8),skin,0,0.56,0,torso);   // Hals

  const head=new THREE.Group(); head.position.set(0,0.62,0); torso.add(head);
  const skull=huMesh(new THREE.SphereGeometry(1,12,10),skin,0,0.1,0.01,head); skull.scale.set(0.102,0.125,0.112);
  huBox(0.118,0.06,0.09,skin,0,0.035,0.035,head);                             // Kiefer
  huBox(0.028,0.045,0.04,skin,0,0.095,0.115,head);                            // Nase
  [-1,1].forEach(s=>{ huBox(0.026,0.018,0.01,0x1a1410,s*0.042,0.125,0.105,head); huBox(0.045,0.012,0.012,0x2a2018,s*0.042,0.148,0.106,head); huBox(0.025,0.055,0.04,skin,s*0.104,0.1,0,head); });
  if(beard){ huBox(0.124,0.045,0.05,0x241a12,0,0.025,0.06,head); huBox(0.07,0.014,0.012,0x241a12,0,0.073,0.111,head); }
  huBox(0.06,0.012,0.012,0x3a2218,0,0.055,0.117,head);                        // Mund
  huMesh(new THREE.CylinderGeometry(0.235,0.24,0.018,16),hatC,0,0.205,0,head).rotation.x=-0.05;   // Hutkrempe
  huMesh(new THREE.CylinderGeometry(0.105,0.125,0.11,12),hatC,0,0.26,0,head);                     // Hutkrone
  huMesh(new THREE.CylinderGeometry(0.127,0.127,0.03,12),huBAND,0,0.23,0,head);                     // Hutband

  const armR=buildArm(torso,huSHOULDER_R,shirt,skin), armL=buildArm(torso,huSHOULDER_L,shirt,skin);
  const gun=buildRifle(); torso.add(gun);
  const sh=new THREE.Mesh(huShGeo,huShMat); sh.scale.set(0.45,1,0.4); sh.position.y=0.03; g.add(sh); blobs.push(sh);

  const st={aim:0,walk:0,t0:rnd(0,10)};
  g.userData={inner,gun,head,blob:sh,aim:0,legs:[],anim:(ph,amp)=>poseHuman(g.userData,st,ph,amp)};
  Object.assign(g.userData,{hips,torso,legL,legR,armL,armR});
  poseHuman(g.userData,st,0,0);
  return g;
}

/* ---------- Haltung und Bewegung ---------- */
const huDOWN=new THREE.Vector3(0,-1,0), _huv=new THREE.Vector3(), _hue=new THREE.Vector3(), _huf=new THREE.Vector3(), _hup=new THREE.Vector3(), _huh=new THREE.Vector3(), _huq=new THREE.Quaternion();
const huAXIS_Y=new THREE.Vector3(0,1,0), _hutw=new THREE.Quaternion(), _hupos=new THREE.Vector3();
/** Zwei-Knochen-IK: Schulter- und Ellbogengelenk so drehen, dass die Hand bei target (Rumpf-Koordinaten) liegt; hint zeigt, wohin der Ellbogen ausweicht */
function huReach(arm,target,hx,hy,hz){
  _huv.copy(target).sub(arm.sh.position); const len=_huv.length(), d=Math.min(Math.max(len,0.08),(huUPPER+huFORE)*0.998); _huv.divideScalar(len||1);
  const a=(huUPPER*huUPPER-huFORE*huFORE+d*d)/(2*d), h=Math.sqrt(Math.max(0,huUPPER*huUPPER-a*a));
  _huh.set(hx,hy,hz); _hup.copy(_huv).multiplyScalar(_huh.dot(_huv)); _huh.sub(_hup).normalize();
  _hue.copy(_huv).multiplyScalar(a).addScaledVector(_huh,h);
  arm.sh.quaternion.setFromUnitVectors(huDOWN,_huf.copy(_hue).normalize());
  _huf.copy(_huv).multiplyScalar(d).sub(_hue).normalize().applyQuaternion(_huq.copy(arm.sh.quaternion).invert());
  arm.el.quaternion.setFromUnitVectors(huDOWN,_huf);
}
const _hugp=new THREE.Vector3();
function poseHuman(u,st,ph,amp){
  st.aim+=((u.aim?1:0)-st.aim)*0.12; const aim=st.aim;
  st.walk+=(Math.min(1,amp/0.3)-st.walk)*0.2; const w=st.walk*(1-aim*0.85);
  const run=Math.max(0,Math.min(1,(amp-0.42)/0.15)), s=Math.sin(ph), c=Math.cos(ph), t=performance.now()/1000+st.t0;
  // Beine: Oberschenkel pendeln, das Knie beugt sich in der Schwungphase, Stand leicht gebeugt; beim Anlegen Ausfallschritt
  const A=(0.38+run*0.3)*w, K=(0.75+run*0.55)*w;
  u.legL.th.rotation.x=-s*A-aim*0.22-run*0.1; u.legL.kn.rotation.x=0.06+Math.max(0,c)*K+aim*0.12;
  u.legR.th.rotation.x=s*A+aim*0.18-run*0.1;  u.legR.kn.rotation.x=0.06+Math.max(0,-c)*K+aim*0.04;
  u.legL.th.rotation.z=-aim*0.06; u.legR.th.rotation.z=aim*0.08;
  // Becken federt, Rumpf dreht gegen die Beine, beim Laufen nach vorn geneigt, im Stand leichtes Atmen
  u.hips.position.y=huHIP-Math.abs(s)*0.035*w-aim*0.05;
  u.hips.rotation.y=s*0.07*w;
  u.torso.rotation.y=-s*0.13*w+aim*huAIM_TWIST;
  u.torso.rotation.x=run*0.22+w*0.04+aim*0.06+Math.sin(t*1.7)*0.012*(1-w);
  // Kopf schaut trotz gedrehtem Rumpf nach vorn, beim Anlegen an den Schaft geneigt
  u.head.rotation.y=-u.torso.rotation.y*0.95-u.hips.rotation.y;
  u.head.rotation.x=-u.torso.rotation.x*0.7+aim*0.16+Math.sin(ph*2)*0.02*w;
  u.head.rotation.z=-aim*0.14;
  // Gewehr zwischen Tragen und Anlegen überblenden, beim Gehen wippt es leicht
  u.gun.position.lerpVectors(huCARRY_POS,huAIM_POS,aim); u.gun.position.y+=Math.sin(ph*2)*0.012*w*(1-aim);
  u.gun.quaternion.slerpQuaternions(huCARRY_Q,huAIM_Q,aim);
  _hutw.setFromAxisAngle(huAXIS_Y,s*0.05*w); u.gun.quaternion.premultiply(_hutw);
  u.gun.updateMatrix();
  // Hände an Griff und Vorderschaft
  huReach(u.armR,_hugp.copy(huGRIP).applyMatrix4(u.gun.matrix),1,-1.1+aim*0.7,-0.3);
  huReach(u.armL,_hupos.copy(huFOREND).applyMatrix4(u.gun.matrix),-0.6+aim*0.3,-1,0.1);
}

export { buildHuman };
