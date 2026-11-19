// LeopardLife – Der Leopard des Spielers: Zustand, Startposition und Modell.
import { QUAL } from './data.js';
import { camera, scene } from './engine.js';
import { buildQuad } from './models.js';
import { blobs, quality } from './quality.js';
import { S, maxHp, maxSt } from './save.js';

/* Spieler */
// Blick beim Start und beim Aufwachen im Bau: seitlich an den Felsen vorbei ins offene Gelände
const START_YAW=-1.9, START_ROT=1.24;
// cam: eigene Kamera je Spieler (Blickrichtung, Neigung, Zoom, Jagd-Ansicht, Wackeln)
// ctl: Steuerwunsch dieses Bildes, gefüllt von controls.js
const P={ctl:{source:'local',fw:0,rt:0,sprint:false},cam:{yaw:START_YAW,pitch:0.42,zoom:1,huntF:0,shake:0},tree:null,climbT:0,safe:false,dropY:0,dropRate:20,upNow:0,camY:0,leap:false,x:2,z:2,y:0,rot:START_ROT,hp:1,st:1,pounce:0,pcd:0,rcd:0,sneak:false,hurtT:0,combatT:0,hidden:1,g:null,moving:0,walkT:0};
const JAG={col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.44,ears:0.15,tail:1.1,tailTip:0x2a1c10,spots:1};
function dropModel(g){ if(!g) return; scene.remove(g); const i=blobs.indexOf(g.userData.blob); if(i>=0) blobs.splice(i,1); }
function rebuildPlayer(){ dropModel(P.g); P.g=buildQuad(JAG,S.fur||null); P.g.userData.blob.visible=!QUAL[quality].sh; scene.add(P.g); }
rebuildPlayer();
scene.add(P.g);
P.camera=camera;   // Kamera, mit der dieser Spieler gezeigt wird
// Alle Spieler auf diesem Gerät. Noch einer; beim Splitscreen kommen weitere dazu.
const players=[P]; P.hp=maxHp(); P.st=maxSt();

export { P, players, START_ROT, START_YAW, dropModel, rebuildPlayer };
