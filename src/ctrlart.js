// LeopardLife – Steuerungsbilder: Tastatur & Maus, Controller und Touch als gezeichnete Grafik (SVG) mit Beschriftungen.
// Die Beschriftungen stehen direkt an der Taste bzw. an der Stelle des Bildschirms, wo sie im Spiel liegt.
const GOLD='#f2b84b', TXT='#f1eee2', MUT='#9a9a88', KEY='#232b20', LINE='rgba(242,184,75,.55)';
const caEsc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* ---------- Bausteine ---------- */
const caRect=(x,y,w,h,r,fill,stroke,sw)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke||'none'}" stroke-width="${sw||1}"/>`;
const caText=(x,y,s,o={})=>`<text x="${x}" y="${y}" fill="${o.c||TXT}" font-size="${o.fs||13}" font-weight="${o.b?700:400}" text-anchor="${o.a||'start'}" dominant-baseline="middle">${caEsc(s)}</text>`;
/** SVG-Rahmen, skaliert mit der Breite des Fensters */
const caSvg=(w,h,body)=>`<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;max-width:${w}px;margin:0 auto" font-family="inherit" role="img">${body}</svg>`;

/** kleines Schildchen mit Text (für Beschriftungen direkt am Element) */
function caTag(x,y,t,a='middle',fs=12){
  const w=t.length*fs*0.56+14, x0=a==='middle'?x-w/2:a==='end'?x-w:x;
  return caRect(x0,y-fs*0.8,w,fs*1.6,fs*0.8,'rgba(12,15,11,.88)',LINE,1)+caText(a==='middle'?x:a==='end'?x-7:x+7,y+1,t,{a,fs});
}
/** Taste mit Beschriftung darin: oben die Taste, unten klein die Funktion */
function caKey(x,y,w,h,k,f){
  if(!f) return caRect(x,y,w,h,7,'rgba(255,255,255,.035)','rgba(255,255,255,.1)');
  return caRect(x,y,w,h,7,KEY,GOLD,1.6)+caText(x+w/2,y+h*0.36,k,{a:'middle',b:1,fs:k.length>3?13:16})+caText(x+w/2,y+h*0.74,f,{a:'middle',fs:10,c:GOLD});
}

/* ---------- Tastatur und Maus ---------- */
function keyboardSvg(){
  const K=58, H=52, g=6, X=24, Y=20;
  const kx=c=>X+c*(K+g);
  let b=caRect(X-12,Y-12,kx(9.05)-X+24,5*H+4*g+24,14,'rgba(255,255,255,.03)','rgba(255,255,255,.08)');
  const r=[0,1,2,3,4].map(i=>Y+i*(H+g));
  b+=caKey(X,r[0],K,H,'Esc','Pause'); for(let i=1;i<8.5;i++) b+=caKey(kx(i)+18,r[0],K,H,'','');
  b+=caKey(X,r[1],K*1.45,H,'Tab','Entwicklung');
  [['Q','markieren'],['W','vor'],['E','Klettern'],['R','Brüllen']].forEach(([k,f],i)=>{ b+=caKey(kx(1.45+i)+g*0.45,r[1],K,H,k,f); });
  for(let i=5.45;i<8.5;i++) b+=caKey(kx(i)+g*0.45,r[1],K,H,'','');
  b+=caKey(X,r[2],K*1.75,H,'','');
  [['A','links'],['S','zurück'],['D','rechts'],['F','Aktion']].forEach(([k,f],i)=>{ b+=caKey(kx(1.75+i)+g*0.75,r[2],K,H,k,f); });
  for(let i=5.75;i<8.5;i++) b+=caKey(kx(i)+g*0.75,r[2],K,H,'','');
  b+=caKey(X,r[3],K*2.25,H,'Shift','Sprinten'); for(let i=2.25;i<8.5;i++) b+=i===4.25?caKey(kx(i)+g*1.25,r[3],K,H,'C','Schleichen'):caKey(kx(i)+g*1.25,r[3],K,H,'','');
  b+=caKey(kx(2.5),r[4],K*4.6+g*3,H,'Leertaste','Sprungangriff');
  // Maus mit drei Beschriftungen
  const mx=640, my=70;
  b+=`<path d="M${mx} ${my} q0 -50 46 -50 q46 0 46 50 v66 q0 50 -46 50 q-46 0 -46 -50 z" fill="${KEY}" stroke="${GOLD}" stroke-width="1.6"/>`
    +`<path d="M${mx+1} ${my-1} q0 -48 44 -48 v48 z" fill="rgba(242,184,75,.35)"/><path d="M${mx} ${my} h92 M${mx+46} ${my-50} v50" stroke="${GOLD}" stroke-width="1.2"/>`+caRect(mx+42,my-36,8,20,4,GOLD);
  b+=caTag(mx+44,my+140,'Bewegen: umsehen',undefined,11)+caTag(mx+44,my+166,'Linksklick: Sprung',undefined,11)+caTag(mx+44,my+192,'Rad: Zoom',undefined,11);
  b+=caText(kx(2.5)+K*2.3+g*1.5,r[4]+H+22,'Aktion (F): fressen · Beute ziehen · paaren · schlafen   ·   Q: Mitspieler markieren',{a:'middle',fs:11.5,c:MUT});
  return caSvg(760,r[4]+H+34,b);
}

/* ---------- Controller ---------- */
function padSvg(){
  const cx=380, cy=170;
  let b='';
  // Schultertasten mit Funktion
  b+=caRect(cx-230,cy-136,130,26,12,KEY,GOLD,1.5)+caText(cx-165,cy-123,'LT',{a:'middle',b:1})+caTag(cx-240,cy-123,'Sprinten','end');
  b+=caRect(cx-226,cy-104,122,22,11,KEY,GOLD,1.5)+caText(cx-165,cy-93,'LB',{a:'middle',b:1,fs:12})+caTag(cx-236,cy-93,'Brüllen','end');
  b+=caRect(cx+100,cy-136,130,26,12,KEY,GOLD,1.5)+caText(cx+165,cy-123,'RT',{a:'middle',b:1})+caTag(cx+240,cy-123,'Sprungangriff','start');
  b+=caRect(cx+104,cy-104,122,22,11,'rgba(255,255,255,.04)','rgba(255,255,255,.15)')+caText(cx+165,cy-93,'RB',{a:'middle',c:MUT,fs:12});
  // Körper
  b+=`<path d="M${cx-170} ${cy-76} h340 q80 0 102 90 q24 104 -16 138 q-40 32 -88 -20 l-46 -50 h-244 l-46 50 q-48 52 -88 20 q-40 -34 -16 -138 q22 -90 102 -90 z" fill="${KEY}" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>`;
  const stick=(x,y)=>`<circle cx="${x}" cy="${y}" r="34" fill="#1a2018" stroke="${GOLD}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="19" fill="#2c3529" stroke="rgba(255,255,255,.2)"/>`;
  const lsx=cx-170, lsy=cy-8, rsx=cx+80, rsy=cy+66, dx=cx-80, dy=cy+66, bx=cx+170, by=cy-8;
  b+=stick(lsx,lsy)+stick(rsx,rsy);
  b+=`<path d="M${dx-12} ${dy-34} h24 v22 h22 v24 h-22 v22 h-24 v-22 h-22 v-24 h22 z" fill="#1a2018" stroke="${GOLD}" stroke-width="1.4"/>`;
  const face=(x,y,l,c)=>`<circle cx="${x}" cy="${y}" r="17" fill="${c}" stroke="rgba(0,0,0,.4)"/>`+caText(x,y+1,l,{a:'middle',b:1,c:'#111',fs:14});
  b+=face(bx,by+34,'A','#6fcf5a')+face(bx+34,by,'B','#e0574a')+face(bx-34,by,'X','#4f8fe0')+face(bx,by-34,'Y','#f2c94b');
  b+=caRect(cx-46,cy-34,26,16,8,'#1a2018',GOLD,1.2)+caText(cx-33,cy-26,'⧉',{a:'middle',fs:10})+caRect(cx+20,cy-34,26,16,8,'#1a2018',GOLD,1.2)+caText(cx+33,cy-26,'☰',{a:'middle',fs:10});
  // Beschriftungen direkt am Element
  b+=caTag(lsx-48,lsy,'Laufen','end');
  b+=caTag(rsx,rsy+52,'Umsehen');
  b+=caTag(dx,dy+52,'↑↓ Zoom · ← markieren');
  b+=caTag(bx,by-62,'Y: Klettern')+caTag(bx+60,by,'B: Schleichen','start')+caTag(bx,by+62,'A: Sprungangriff')+caTag(bx-58,by,'X: Aktion','end');
  b+=caTag(cx-40,cy-56,'Entwicklung')+caTag(cx+40,cy-56,'Pause');
  b+=caText(cx,cy+190,'X halten: Mitspieler wiederbeleben  ·  weiterer Controller: ☰ drücken = mitspielen',{a:'middle',fs:11.5,c:MUT});
  return caSvg(760,cy+204,b);
}

/* ---------- Touch ---------- */
function touchSvg(){
  const PX=40, PY=16, PW=680, PH=372;   // Handy im Querformat
  let b=caRect(PX-14,PY-14,PW+28,PH+28,30,'#0c0f0b','rgba(255,255,255,.25)',2);
  b+=`<defs><linearGradient id="ctSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#425f3f"/><stop offset="1" stop-color="#1f321c"/></linearGradient></defs>`+caRect(PX,PY,PW,PH,12,'url(#ctSky)');
  for(let i=0;i<52;i++){ const gx=PX+6+i*13, gh=30+(i*37%26); b+=`<path d="M${gx} ${PY+PH} l4 -${gh} l4 ${gh} z" fill="#2c4724" opacity=".85"/>`; }
  b+=`<ellipse cx="${PX+PW/2}" cy="${PY+PH-86}" rx="24" ry="14" fill="#d9a441"/><circle cx="${PX+PW/2}" cy="${PY+PH-104}" r="11" fill="#d9a441"/>`;
  b+=`<path d="M${PX+PW/2-10} ${PY+PH/2-26} h20 M${PX+PW/2} ${PY+PH/2-36} v20" stroke="#fff" stroke-width="1.6"/>`;
  // oben links: Infofeld mit Punkte-Knopf
  b+=caRect(PX+10,PY+10,150,82,8,'rgba(20,26,18,.9)','rgba(255,255,255,.15)')+caRect(PX+20,PY+24,120,6,3,'#d9534f')+caRect(PX+20,PY+38,120,6,3,'#f2c94b')+caRect(PX+20,PY+52,120,6,3,'#e0a060')+caRect(PX+20,PY+66,86,18,5,GOLD)+caText(PX+63,PY+76,'2 Punkte',{a:'middle',fs:10,b:1,c:'#2a1d00'});
  b+=caTag(PX+176,PY+75,'← antippen: Entwicklung','start',11);
  // oben rechts: Spürkarte + Menü
  b+=`<circle cx="${PX+PW-50}" cy="${PY+48}" r="36" fill="rgba(20,26,18,.92)" stroke="rgba(255,255,255,.2)"/>`+caRect(PX+PW-84,PY+92,68,20,6,'rgba(20,26,18,.92)','rgba(255,255,255,.25)')+caText(PX+PW-50,PY+102,'☰ Menü',{a:'middle',fs:10});
  b+=caTag(PX+PW-98,PY+48,'Spürkarte','end',11)+caTag(PX+PW-98,PY+102,'Pause','end',11);
  // links unten: Joystick
  const jx=PX+92, jy=PY+PH-86;
  b+=`<circle cx="${jx}" cy="${jy}" r="52" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.4)"/><circle cx="${jx+12}" cy="${jy-8}" r="20" fill="rgba(255,255,255,.42)"/>`;
  b+=caTag(jx,jy-74,'Linke Hälfte: Daumen aufsetzen = laufen',undefined,11).replace('text-anchor="middle"','text-anchor="middle"');
  // rechts unten: zwei Spalten Knöpfe
  const R=27, c1=PX+PW-46, c2=c1-66, rA=PY+PH-44, rB=rA-66, rC=rB-66;
  const btn=(x,y,l,f,tc)=>`<circle cx="${x}" cy="${y}" r="${R}" fill="${f||'rgba(20,26,18,.94)'}" stroke="rgba(255,255,255,.35)"/>`+caText(x,y+1,l,{a:'middle',fs:10,b:1,c:tc||TXT});
  b+=btn(c1,rA,'Sprint')+btn(c1,rB,'Schleichen')+btn(c2,rA,'Brüllen')+`<circle cx="${c2}" cy="${rA}" r="${R+4}" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="110 200"/>`+btn(c2,rB,'Klettern')+btn(c2,rC,'Aktion','#f4f1e8','#111');
  b+=caTag(c2,rC-R-16,'Aktion: erscheint, wenn möglich',undefined,11)+caTag(c2-R-10,rA,'goldener Ring: lädt','end',11);
  // Mitte rechts: wischen und doppeltippen
  const wx=PX+PW/2+70, wy=PY+PH/2-50;
  b+=`<path d="M${wx-40} ${wy} h80 M${wx-40} ${wy} l10 -7 M${wx-40} ${wy} l10 7 M${wx+40} ${wy} l-10 -7 M${wx+40} ${wy} l-10 7" stroke="#fff" stroke-width="2.2" opacity=".85"/>`+caTag(wx,wy-24,'Rechte Hälfte wischen: umsehen',undefined,11);
  b+=`<circle cx="${wx}" cy="${wy+44}" r="8" fill="none" stroke="#fff" stroke-width="1.8" opacity=".85"/><circle cx="${wx}" cy="${wy+44}" r="15" fill="none" stroke="#fff" stroke-width="1.3" opacity=".55"/>`+caTag(wx,wy+76,'doppeltippen: Sprungangriff',undefined,11);
  return caSvg(760,PH+PY+18,b);
}

/** Steuerungsbild für die Eingabeart m ('k' Tastatur, 'p' Controller, 't' Touch) */
function ctrlArt(m){ return m==='p'?padSvg():m==='t'?touchSvg():keyboardSvg(); }

export { ctrlArt };
