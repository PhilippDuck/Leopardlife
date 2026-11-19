"""Trägt alle Module aus src/ und Geräusche aus audio/ in die Cache-Liste des Service Workers ein und zählt die Version hoch.
Nach jeder Änderung am Spiel ausführen: python3 tools/bump-sw.py"""
import re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(root, 'sw.js'); s = open(p).read()
auds = sorted("audio/" + f for f in os.listdir(os.path.join(root, "audio")) if f.endswith(".mp3")) if os.path.isdir(os.path.join(root, "audio")) else []
mods = sorted(f for f in os.listdir(os.path.join(root, 'src')) if f.endswith('.js'))
shell = ["./", "index.html"] + ["src/" + m for m in mods] + auds + ["vendor/three.min.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon-180.png"]
s = re.sub(r"const SHELL = \[.*?\];", "const SHELL = [" + ", ".join("'" + x + "'" for x in shell) + "];", s, flags=re.S)
m = re.search(r"const VERSION = 'leopardlife-v(\d+)';", s)
s = s.replace(m.group(0), "const VERSION = 'leopardlife-v%d';" % (int(m.group(1)) + 1))
open(p, 'w').write(s)
print('Service Worker: v%d, %d Module' % (int(m.group(1)) + 1, len(mods)))
