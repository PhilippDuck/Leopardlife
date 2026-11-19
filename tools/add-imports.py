#!/usr/bin/env python3
"""Ergänzt fehlende Importe: liest die Meldungen von tests/check-names.js und sucht jeden unbekannten Namen
in den Exporten der anderen Module. Mehrdeutige oder unauffindbare Namen werden nur gemeldet."""
import re, os, subprocess, collections, sys
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
def exports(f):
    c=open('src/'+f).read(); s=set(re.findall(r'export\s+(?:function\*?|const|let|var|class)\s+([\w$]+)',c))
    for m in re.findall(r'export\s*\{([^}]*)\}',c): s|={n.strip().split(' as ')[-1] for n in m.split(',') if n.strip()}
    return s
EX={f:exports(f) for f in os.listdir('src') if f.endswith('.js')}
out=subprocess.run(['node','tests/check-names.js'],capture_output=True,text=True).stdout
need=collections.defaultdict(set)
for f,n in re.findall(r'UNBEKANNT: (\S+):\d+ (\S+)',out): need[f].add(n)
for f,names in need.items():
    c=open('src/'+f).read(); add=collections.defaultdict(set)
    for n in sorted(names):
        srcs=[m for m,e in EX.items() if n in e and m!=f]
        if len(srcs)==1: add[srcs[0]].add(n)
        else: print('  ?',f,n,srcs)
    for mod,ns in sorted(add.items()):
        pat=r"import \{([^}]*)\} from '\./"+re.escape(mod)+"';"
        if re.search(pat,c): c=re.sub(pat,lambda m:"import { "+', '.join(sorted({x.strip() for x in m[1].split(',') if x.strip()}|ns))+" } from './"+mod+"';",c,count=1)
        else:
            L=c.split('\n'); idx=[i for i,l in enumerate(L) if l.startswith('import ')]
            at=(idx[-1]+1) if idx else next(i for i,l in enumerate(L) if not l.startswith('//'))
            L.insert(at,"import { "+', '.join(sorted(ns))+" } from './"+mod+"';"); c='\n'.join(L)
        print(' ',f,'<-',mod,sorted(ns))
    open('src/'+f,'w').write(c)
