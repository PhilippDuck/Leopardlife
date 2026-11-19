// LeopardLife – einfache Ereignisse zwischen Modulen, damit sich niedrige Schichten (Grafik, Welt)
// nicht an höhere (Tageszeit, Anzeige) binden müssen. on('name', fn) meldet an, emit('name', …) löst aus.
const handlers={};
export function on(name,fn){ (handlers[name]=handlers[name]||[]).push(fn); }
export function emit(name,...args){ const list=handlers[name]; if(list) for(const fn of list) fn(...args); }
