// LeoLife – Haltung der Termitenfresser (termites.js): graben, schlafen, Panzerkugel. Ohne Abhängigkeiten, damit animals.js es laden kann.

/** Haltung: null (normal), 'dig' (vorn tief, Vorderbeine scharren), 'sleep' (flach am Boden, Beine eingezogen) */
function setPose(a,kind){
  if((a.tpose||null)===kind) return;
  a.tpose=kind; const u=a.g.userData, leg=(a.sp.m&&a.sp.m.leg)||0.55;
  u.inner.position.y=kind==='sleep'?-leg*0.75:0;
  u.inner.rotation.x=kind==='dig'?0.14:0;
  for(const l of u.legs){ l.scale.y=kind==='sleep'?0.25:1; l.rotation.x=0; }
}
/** Panzerkugel an oder aus */
function setBall(a,on){
  a.rolled=on; const u=a.g.userData;
  if(u.ball){ u.ball.visible=on; u.inner.visible=!on; }
}
/** Neu platziert oder wiederbelebt: alles zurück */
function termiteReset(a){ setPose(a,null); setBall(a,false); a.tM=null; a.tDone=null; a.tWait=0; a.tGo=0; }

export { setBall, setPose, termiteReset };
