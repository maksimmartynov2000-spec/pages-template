#!/usr/bin/env python3
"""Ставит метку версии в index.html: <meta name="app-build" content="ДАТА·ХЭШ">.

ДАТА — сегодняшняя дата по Бали (UTC+8), ХЭШ — первые 8 знаков SHA-1 содержимого файла
(сама метка при подсчёте не учитывается). Если содержимое не менялось, метка остаётся прежней,
поэтому повторный запуск ничего не трогает и приложения у пользователей зря не перезагружаются.

Запуск:  python3 tools/stamp.py            — поставить метку в index.html
         python3 tools/stamp.py --check    — только проверить, что метка свежая (код выхода 1, если нет)
         python3 tools/stamp.py путь.html  — другой файл
"""
import hashlib
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

META = re.compile(r'<meta name="app-build" content="([^"]*)">')
HEAD_LIMIT = 2048  # метка должна быть в начале файла: приложение скачивает только первые 4 КБ


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    path = Path(args[0]) if args else Path(__file__).resolve().parent.parent / 'index.html'
    text = path.read_text(encoding='utf-8')

    found = list(META.finditer(text))
    if len(found) != 1:
        print(f'{path}: нужна ровно одна метка <meta name="app-build" content="…">, найдено {len(found)}')
        return 2
    m = found[0]
    if m.start() > HEAD_LIMIT:
        print(f'{path}: метка должна стоять в начале файла (сразу после <meta charset>), сейчас она на {m.start()}-м символе')
        return 2

    old = m.group(1)
    body = text[:m.start(1)] + text[m.end(1):]  # содержимое без значения метки
    digest = hashlib.sha1(body.encode('utf-8')).hexdigest()[:8]

    if old.endswith('·' + digest):
        print(f'{path.name}: метка свежая — {old}')
        return 0
    if check:
        print(f'{path.name}: метка устарела ({old}), запустите python3 tools/stamp.py')
        return 1

    today = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d')
    new = f'{today}·{digest}'
    path.write_text(text[:m.start(1)] + new + text[m.end(1):], encoding='utf-8')
    print(f'{path.name}: метка {old} → {new}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
