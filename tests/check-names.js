// Prüft mit dem TypeScript-Compiler, dass jedes Modul nur Namen benutzt, die es selbst anlegt, importiert
// oder die der Browser bereitstellt (Fehler 2304 „Cannot find name"). THREE kommt als globales Skript.
const path=require('path'), fs=require('fs');
let ts; try{ ts=require('typescript'); }catch(e){ try{ ts=require(path.join(process.env.HOME||'','.npm-global/lib/node_modules/typescript')); }catch(e2){ console.log('Namensprüfung übersprungen (typescript fehlt)'); return; } }
const dir=path.join(__dirname,'..','src');
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.js')).map(f=>path.join(dir,f));
const prog=ts.createProgram(files,{allowJs:true,checkJs:true,noEmit:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,lib:['lib.es2020.d.ts','lib.dom.d.ts']});
const OK=new Set(['THREE']); let bad=0;
for(const sf of prog.getSourceFiles()){ if(!sf.fileName.startsWith(dir)) continue;
  for(const d of prog.getSemanticDiagnostics(sf)){ if(d.code!==2304&&d.code!==2552&&!(d.code>=2580&&d.code<=2593)) continue;
    const name=ts.flattenDiagnosticMessageText(d.messageText,' ').match(/'([^']+)'/)[1]; if(OK.has(name)) continue;
    const {line}=sf.getLineAndCharacterOfPosition(d.start); console.log('UNBEKANNT: '+path.basename(sf.fileName)+':'+(line+1)+' '+name); bad++; } }
console.log(bad?bad+' unbekannte Namen':'Namen OK'); if(bad) process.exit(1);
