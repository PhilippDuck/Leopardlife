#!/usr/bin/env python3
"""Stellt einen Code-Bereich auf die Werte eines bestimmten Spielers um:
S.lvl/xp/pts/a/b/traits/fur/hunger/age -> v.L.…  und  maxHp()/at('x')/has('x')/… -> mit v.L.
Aufruf: per-player.py <datei> <startText> <endText> <v>   (Bereich: ab startText bis vor endText)"""
import re, sys
f, start, end, v = sys.argv[1:5]
s = open(f).read(); a = s.index(start); b = s.index(end, a + len(start)); blk = s[a:b]
blk = re.sub(r'(?<![\w$.])S\.(lvl|xp|pts|a|b|traits|fur|hunger|age)\b', v + r'.L.\1', blk)
blk = re.sub(r'(?<![\w$.])(maxHp|maxSt|dmg|baseSpeed|pScale|oldF|attrCap|DIE_AT)\(\)', r'\1(' + v + '.L)', blk)
blk = re.sub(r"(?<![\w$.])(at|has)\(('[^']*'|\w+)\)", r'\1(\2,' + v + '.L)', blk)
s = s[:a] + blk + s[b:]; open(f, 'w').write(s)
print(f, 'umgestellt:', start[:40].replace('\n', ' '), '→', v)
