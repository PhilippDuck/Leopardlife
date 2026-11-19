// LeopardLife – Darstellung: Zeichenfläche, Renderer, Szene, Kamera, Licht (Himmelslicht, Sonne/Mond), Wind und Fenstergröße.
import { REG, S } from './save.js';
import { G } from './state.js';
import { $ } from './util.js';

/* ---------- Szene ---------- */
const canvas=$('game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();
const HORIZON=REG.hor;
scene.background=new THREE.Color(HORIZON);
scene.fog=new THREE.Fog(HORIZON,55,240);
const camera=new THREE.PerspectiveCamera(60,1,0.2,1500);
const hemi=new THREE.HemisphereLight(0xd4ecff,0x6f7a48,0.72); scene.add(hemi);
const SUN_OFF=new THREE.Vector3(48,70,30); G.FOG_BASE=[55,240]; const grassLight={value:new THREE.Color(1,1,1)};
// Wind: Richtung (wx,wz) wandert langsam. Tiere, zu denen der Wind deinen Geruch trägt, bemerken dich früher; gegen den Wind kommst du näher heran.
const windU={value:new THREE.Vector2(0.6,0.8)}; G.windAng=Math.random()*6.283; G.windTarget=G.windAng; G.windT=90;
const SMART=()=>({easy:0,normal:0.5,hard:1})[S.diff]??0.5;      // wie klug die Tiere vorgehen
const WINDK=()=>({easy:0.5,normal:0.8,hard:1})[S.diff]??0.8;     // wie stark der Wind wirkt
function windMulDir(ux,uz){ const dt=ux*windU.value.x+uz*windU.value.y, K=WINDK(); return dt>0?1+0.6*dt*K:1+0.35*dt*K; }
const sun=new THREE.DirectionalLight(0xffe6b8,1.0); sun.position.copy(SUN_OFF); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-0.0005; sun.shadow.normalBias=0.05;
(function(c){ c.left=-55; c.right=55; c.top=55; c.bottom=-55; c.near=5; c.far=220; c.updateProjectionMatrix(); })(sun.shadow.camera);
function resize(){ const w=window.innerWidth,h=window.innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
window.addEventListener('resize',resize); resize();

export { HORIZON, SMART, SUN_OFF, camera, canvas, grassLight, hemi, renderer, resize, scene, sun, windMulDir, windU };
