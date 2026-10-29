"""Une un reporte JUnit con los IDs del plan de pruebas a los que sirve de evidencia.
Uso: python asignar_ids.py portal-reglas.xml   (o comun.xml)
Crea <reporte>_ids.csv y <reporte>_ids.html. Varias IDs se separan con coma."""
import csv, html, re, sys, xml.etree.ElementTree as ET
from pathlib import Path

# (archivo de prueba, expresión sobre el nombre completo) -> IDs del plan
REGLAS = [
    # ---- comun ----
    ('confianza.test.ts', r'nivel para 0 a 800|11 niveles', 'CT1,PA2'),
    ('confianza.test.ts', r'peso y límite diario', 'CT2,CT6'),
    ('confianza.test.ts', r'número de día', 'CT19'),
    ('confianza.test.ts', r'sin correo verificado o con cuenta nueva|cuenta es antigua', 'CT5'),
    ('confianza.test.ts', r'diez votos|nunca valida|una vez validado|peso 0 no cuenta', 'CT4'),
    ('confianza.test.ts', r'porcentaje para la barra', 'CT3,CT4'),
    ('confianza.test.ts', r'real suma 10', 'CT10,CT11,CT12,PA1'),
    ('confianza.test.ts', r'progreso hacia el siguiente', 'CT16'),
    ('geo.test.ts', r'cajas', 'RI12'),
    ('geo.test.ts', r'distancias', 'VC1'),
    ('gestion.test.ts', r'permisoDeGestion', 'AD6,AD8,MS4'),
    ('gestion.test.ts', r'al resolver envía|tiempo negativo|sin fecha de creación', 'WT1'),
    ('gestion.test.ts', r'al cerrar sin haber resuelto', 'WT2'),
    ('gestion.test.ts', r'cerrar un reporte ya resuelto', 'WT3'),
    ('gestion.test.ts', r'tolerancia', 'WT4'),
    ('privacidad.test.ts', r'.', 'RI11,DW1'),
    ('reportes.test.ts', r'estados > (cada estado|reconoce|resuelto se ve)', 'CM1'),
    ('reportes.test.ts', r'estados > (sigue el flujo|ningún estado|todo estado)', 'CM1,MS5,WG10'),
    ('reportes.test.ts', r'categorías', 'RI7,MB3'),
    ('reportes.test.ts', r'descripción', 'RI3,MB1'),
    ('territorio.test.ts', r'nombres y códigos', 'RI12,MB2'),
    ('territorio.test.ts', r'mapa de calor', 'WM1,WM2'),
    # ---- tiempos (comun y portal) ----
    ('tiempos.test.ts', r'tiempos de atención', 'CM2,WM2,WR5'),
    ('tiempos.test.ts', r'estadísticas y formato', 'WR5,WE1'),
    ('tiempos.test.ts', r'resolucionDeReporte|textoResolucion|calcularTiempos', 'WT5,CM2'),
    # ---- portal (rules-tests) ----
    ('base.test.ts', r'un ciudadano crea su reporte', 'RI8'),
    ('base.test.ts', r'a nombre de otro', 'RI2'),
    ('base.test.ts', r'ciudadano no cambia el estado', 'MS4'),
    ('base.test.ts', r'operador asignado cambia el estado', 'MS4,AD8'),
    ('base.test.ts', r'administrador cambia el estado', 'MS4'),
    ('base.test.ts', r'transición inválida', 'MS5,WG10'),
    ('base.test.ts', r'otro vecino confirma', 'VC3,VC6'),
    ('base.test.ts', r'nadie confirma su propio', 'VC7,SG7,CT9'),
    ('base.test.ts', r'no se confirma dos veces', 'VC4,VC7,CT9'),
    ('base.test.ts', r'operador no confirma', 'VC7,SG7,CT9'),
    ('base.test.ts', r'lee su perfil y no el de otro', 'PF4'),
    ('base.test.ts', r'no se sube el nivel|no se hace administrador', 'SG1'),
    ('base.test.ts', r'qué avisos ya vio', 'AV5'),
    ('base.test.ts', r'registra el historial en un lote', 'AD8,MS4,MS6'),
    ('confianza.test.ts', r'confirmar con peso', 'CT3,CT2,VC3,VC7'),
    ('confianza.test.ts', r'peso 0 por correo', 'CT5'),
    ('confianza.test.ts', r'(^|> )niveles', 'CT2'),
    ('confianza.test.ts', r'sexta|quinta|saltar de a más|reinicia su contador', 'CT6'),
    ('confianza.test.ts', r'pausa', 'CT7'),
    ('confianza.test.ts', r'suspendidas', 'CT8'),
    ('confianza.test.ts', r'validación del reporte', 'CT4'),
    ('confianza.test.ts', r'reporte antiguo sin el mapa', 'CT14'),
    ('confianza.test.ts', r'formato antiguo', 'CT21'),
    ('confianza.test.ts', r'veredicto del operador.*(real|falso|tope|piso|comentario|bajar)', 'CT10,CT11,CT12'),
    ('confianza.test.ts', r'veredicto del operador.*(se cambia|segundo|propio|ciudadano|otro organismo|no es ciudadano)', 'CT13'),
    ('confianza.test.ts', r'veredicto del operador.*(espejo|sin escribir|administrador también)', 'CT10'),
    ('confianza.test.ts', r'no la lee|dueño|operador la lee|no la modifica', 'SG9'),
    ('confianza.test.ts', r'administrador (suspende|no puede cambiar)', 'CT17,SG11'),
    ('confianza.test.ts', r'createdAt', 'SG10'),
    ('confianza.test.ts', r'nuevo no puede nacer|no modifica la validación', 'SG1'),
    ('confirmar.test.ts', r'un voto de nivel 0 suma|votante de nivel 4', 'CT3,VC3'),
    ('confirmar.test.ts', r'95 puntos y 3 personas', 'CT4'),
    ('confirmar.test.ts', r'reporte antiguo', 'CT14'),
    ('confirmar.test.ts', r'dos votantes a la vez', 'CT20'),
    ('confirmar.test.ts', r'voto con peso 0', 'CT5'),
    ('confirmar.test.ts', r'propio reporte|dos veces|operador no confirma|no existe', 'CT9'),
    ('confirmar.test.ts', r'suspendidas', 'CT8'),
    ('confirmar.test.ts', r'límite diario', 'CT6'),
    ('confirmar.test.ts', r'pausa', 'CT7'),
    ('veredicto.test.ts', r'veredicto real', 'CT10,PA1,PA3'),
    ('veredicto.test.ts', r'veredicto falso', 'CT11,CT12'),
    ('veredicto.test.ts', r'casos que se rechazan', 'CT13'),
    ('veredicto.test.ts', r'otro organismo', 'AD6'),
    ('moderacion.test.ts', r'suspender y rehabilitar', 'CT8,CT17'),
    ('moderacion.test.ts', r'operador no puede suspender|no puede rehabilitarse|no puede suspender a otro', 'SG11'),
    ('moderacion.test.ts', r'quiénes confirmaron', 'CT17'),
    ('paridad.test.ts', r'niveles >', 'CT1,PA2'),
    ('paridad.test.ts', r'peso y límites', 'CT2,CT6,CT5'),
    ('paridad.test.ts', r'el día cambia', 'CT19'),
    ('paridad.test.ts', r'validación y veredicto', 'CT4,CT10,CT12'),
    ('paridad.test.ts', r'lectura de datos con ceros', 'CT14'),
    ('paridad.test.ts', r'las reglas aceptan', 'CT1,CT2,CT6,CT12,CM3'),
    ('comun.test.ts', r'estados', 'CM1'),
    ('comun.test.ts', r'largo de la descripción', 'RI3,MB1'),
    ('comun.test.ts', r'sistema de confianza', 'CM3,CT1,CT2'),
    ('comun.test.ts', r'tiempos', 'CM2'),
    ('comun.test.ts', r'mapa de calor', 'WM1'),
    ('avisos.test.ts', r'validación y veredicto', 'AV2,AV3'),
    ('avisos.test.ts', r'nivel', 'AV4,PA3'),
    ('correcciones.test.ts', r'filtro de veredicto', 'WG11'),
    ('correcciones.test.ts', r'el estado no cambia sin veredicto', 'CT15,WG5'),
    ('correcciones.test.ts', r'avisos de soporte', 'AV6'),
    ('filtros.test.ts', r'.', 'WG11'),
    ('mapa.test.ts', r'regiones', 'WB1'),
    ('mapa.test.ts', r'lectura por región', 'WB5,WB6'),
    ('mapa.test.ts', r'agrupación de reportes cercanos', 'WB3,WB4'),
]


def ids_de(archivo, nombre):
    # Pruebas de pantalla (Playwright): el nombre empieza con los IDs del plan, antes de « · ».
    if archivo.endswith('.spec.ts'):
        cabecera = nombre.split(' · ')[0].split(' › ')[-1]
        return ','.join(dict.fromkeys(re.findall(r'\b[A-Z]{2,3}\d{1,2}\b', cabecera)))
    encontrados = []
    for arch, patron, ids in REGLAS:
        if arch == archivo and re.search(patron, nombre):
            for i in ids.split(','):
                if i not in encontrados:
                    encontrados.append(i)
    return ','.join(encontrados)


ruta = Path(sys.argv[1])
filas = []
for caso in ET.parse(ruta).getroot().iter('testcase'):
    archivo = caso.get('classname', '').split('/')[-1]
    nombre = caso.get('name', '')
    estado = 'FALLÓ' if caso.find('failure') is not None or caso.find('error') is not None else (
        'OMITIDA' if caso.find('skipped') is not None else 'OK')
    filas.append((ids_de(archivo, nombre), archivo, nombre, estado, caso.get('time', '')))

base = ruta.with_suffix('')
with open(f'{base}_ids.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['IDs del plan', 'Archivo de prueba', 'Prueba', 'Resultado', 'Segundos'])
    w.writerows(filas)

color = {'OK': '#d4edda', 'FALLÓ': '#f8d7da', 'OMITIDA': '#fff3cd'}
cuerpo = ''.join(
    f'<tr style="background:{color[e]}"><td>{html.escape(i)}</td><td>{html.escape(a)}</td>'
    f'<td>{html.escape(n)}</td><td>{e}</td><td>{t}</td></tr>' for i, a, n, e, t in filas)
sin = sum(1 for f in filas if not f[0])
ok = sum(f[3] == 'OK' for f in filas)
Path(f'{base}_ids.html').write_text(
    f'<!doctype html><meta charset="utf-8"><title>{ruta.stem}</title>'
    '<style>body{font:14px sans-serif;margin:24px}table{border-collapse:collapse;width:100%}'
    'td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#eee}</style>'
    f'<h2>{ruta.stem}: {ok} de {len(filas)} pruebas OK</h2>'
    '<table><tr><th>IDs del plan</th><th>Archivo</th><th>Prueba</th><th>Resultado</th><th>Seg.</th></tr>'
    f'{cuerpo}</table>', encoding='utf-8')
print(f'{ok} OK de {len(filas)}; {sin} sin ID asignado; creados {base}_ids.csv y {base}_ids.html')
for i, a, n, e, t in filas:
    if not i:
        print('  sin ID:', a, '|', n[:100])
