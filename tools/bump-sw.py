"""Aktualisiert App-Version und Dateiliste für den Offline-Cache."""

import argparse
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('change', nargs='?', choices=('patch', 'minor', 'sync'), default='patch',
                        help='Patch erhöhen, Minor erhöhen oder die vorhandene Version übernehmen')
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    version_file = root / 'src/version.js'
    version_source = version_file.read_text(encoding='utf-8')
    match = re.fullmatch(r"export const APP_VERSION = '((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))';\n?", version_source)
    if not match:
        parser.error('src/version.js muss eine Version im Format MAJOR.MINOR.PATCH enthalten')
    major, minor, patch = map(int, match[1].split('.'))
    if args.change == 'minor':
        minor, patch = minor + 1, 0
    elif args.change == 'patch':
        patch += 1
    version = f'{major}.{minor}.{patch}'

    modules = sorted(p.relative_to(root).as_posix() for p in (root / 'src').glob('*.js'))
    audio = sorted(p.relative_to(root).as_posix() for p in (root / 'audio').glob('*.mp3'))
    shell = ['./', 'index.html', *modules, *audio, 'vendor/three.min.js', 'manifest.webmanifest',
             'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png']
    worker_file = root / 'sw.js'
    worker = worker_file.read_text(encoding='utf-8')
    worker, version_count = re.subn(r"^const VERSION = '[^']+';$", f"const VERSION = 'leopardlife-v{version}';", worker, flags=re.M)
    shell_literal = ', '.join(repr(path) for path in shell)
    worker, shell_count = re.subn(r'^const SHELL = \[.*?\];$', lambda _: f'const SHELL = [{shell_literal}];', worker, flags=re.M | re.S)
    if version_count != 1 or shell_count != 1:
        parser.error('sw.js muss jeweils eine Definition von VERSION und SHELL enthalten')

    if version != match[1]:
        version_file.write_text(f"export const APP_VERSION = '{version}';\n", encoding='utf-8')
    worker_file.write_text(worker, encoding='utf-8')
    print(f'LeoLife {version}: {len(modules)} Module im Offline-Cache')


if __name__ == '__main__':
    main()
