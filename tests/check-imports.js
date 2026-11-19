// Prüft, dass jeder benannte Import auch wirklich vom Zielmodul exportiert wird
// (der Logiktest bündelt alle Module in einen Bereich und würde fehlende Exporte nicht bemerken).
const fs=require('fs'), path=require('path');
const dir=path.join(__dirname,'..','src'); let bad=0;
const exportsOf=f=>{ const c=fs.readFileSync(path.join(dir,f),'utf8'), s=new Set();
  for(const m of c.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) s.add(m[1]);
  for(const m of c.matchAll(/export\s*\{([^}]*)\}/g)) for(const n of m[1].split(',')){ const t=n.trim().split(/\s+as\s+/).pop(); if(t) s.add(t); }
  // export const a=1, b=2
  for(const m of c.matchAll(/export\s+(?:const|let|var)\s+([^;]*)/g)) for(const p of m[1].split(',')){ const k=p.trim().match(/^([\w$]+)\s*=/); if(k) s.add(k[1]); }
  return s; };
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))){
  const c=fs.readFileSync(path.join(dir,f),'utf8');
  for(const m of c.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)'/g)){
    const ex=exportsOf(m[2]);
    for(const n of m[1].split(',')){ const name=n.trim().split(/\s+as\s+/)[0]; if(name&&!ex.has(name)){ console.log('FEHLT: '+f+' importiert '+name+' aus '+m[2]); bad++; } }
  }
}
console.log(bad?bad+' fehlende Exporte':'Importe OK'); if(bad) process.exit(1);
