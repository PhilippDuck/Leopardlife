// LeoLife – kleine Hilfsfunktionen ohne Spielzustand.
// Element per id holen (jedes Element wird nur einmal nachgeschlagen)
export const $=id=>EL[id]||(EL[id]=document.getElementById(id));
const EL={};
// Zufallszahl zwischen a und b
export const rnd=(a,b)=>a+Math.random()*(b-a);
