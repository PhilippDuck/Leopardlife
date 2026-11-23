// LeoLife – gemeinsamer veränderlicher Zustand, den mehrere Teile des Spiels lesen und schreiben
// (Pause, Kamera, Joystick, Überfälle, Wetter, Anzeigen-Timer …). Module importieren G und ändern seine Felder.
/** @type {Record<string, any>} Gemeinsamer veränderlicher Zustand (Felder werden von den Modulen angelegt) */
export const G={};
