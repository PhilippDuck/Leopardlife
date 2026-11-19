// Typprüfung aller Module mit dem TypeScript-Compiler (Einstellungen aus jsconfig.json, auch für den Editor).
// Prüft u. a. falsche Feldnamen, falsche Argumente und Zuweisungen mit falschem Typ. Ohne typescript wird übersprungen.
const path=require('path');
let ts; try{ ts=require('typescript'); }catch(e){ console.log('Typprüfung übersprungen (typescript fehlt)'); return; }
const root=path.join(__dirname,'..');
const cfg=ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root,'jsconfig.json'),ts.sys.readFile).config,ts.sys,root);
const prog=ts.createProgram(cfg.fileNames,cfg.options);
const diags=ts.getPreEmitDiagnostics(prog);
for(const d of diags){ const at=d.file?path.relative(root,d.file.fileName)+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):'';
  console.log('TYP: '+at+' '+ts.flattenDiagnosticMessageText(d.messageText,' ')); }
console.log(diags.length?diags.length+' Typfehler':'Typen OK'); if(diags.length) process.exit(1);
