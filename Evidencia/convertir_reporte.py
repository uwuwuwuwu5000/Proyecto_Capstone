"""Convierte un reporte JUnit (.xml) en un HTML legible y un CSV para Excel.
Uso: python convertir_reporte.py portal-reglas.xml"""
import csv, html, sys, xml.etree.ElementTree as ET
from pathlib import Path

ruta = Path(sys.argv[1])
filas = []
for caso in ET.parse(ruta).getroot().iter('testcase'):
    estado = 'FALLÓ' if caso.find('failure') is not None or caso.find('error') is not None else (
        'OMITIDA' if caso.find('skipped') is not None else 'OK')
    filas.append((caso.get('classname', ''), caso.get('name', ''), estado, caso.get('time', '')))

ok = sum(f[2] == 'OK' for f in filas)
base = ruta.with_suffix('')
with open(f'{base}.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['Archivo de prueba', 'Prueba', 'Resultado', 'Segundos'])
    w.writerows(filas)

color = {'OK': '#d4edda', 'FALLÓ': '#f8d7da', 'OMITIDA': '#fff3cd'}
cuerpo = ''.join(
    f'<tr style="background:{color[e]}"><td>{html.escape(a)}</td><td>{html.escape(n)}</td><td>{e}</td><td>{t}</td></tr>'
    for a, n, e, t in filas)
Path(f'{base}.html').write_text(
    f'<!doctype html><meta charset="utf-8"><title>{ruta.stem}</title>'
    '<style>body{font:14px sans-serif;margin:24px}table{border-collapse:collapse;width:100%}'
    'td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#eee}</style>'
    f'<h2>{ruta.stem}: {ok} de {len(filas)} pruebas OK</h2>'
    f'<table><tr><th>Archivo</th><th>Prueba</th><th>Resultado</th><th>Seg.</th></tr>{cuerpo}</table>',
    encoding='utf-8')
print(f'{ok} OK de {len(filas)}; creados {base}.html y {base}.csv')
