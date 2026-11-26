import os
import pymysql
import pandas as pd
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

import os
import sys
import argparse
import re
import pymysql
import pandas as pd
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ── PARSEO DE ARGUMENTOS Y AUTODETECCIÓN DE CREDENCIALES ─────────────────────
parser = argparse.ArgumentParser(description="Exportar base de datos de Minutas y Tareas a Excel profesional.")
parser.add_argument("--host", default=None, help="Host MySQL")
parser.add_argument("--user", default=None, help="Usuario MySQL")
parser.add_argument("--password", default=None, help="Contraseña MySQL")
parser.add_argument("--database", default=None, help="Nombre de BD (ej. minutas o diseno)")
parser.add_argument("--port", type=int, default=3306, help="Puerto MySQL (def: 3306)")
parser.add_argument("--env-file", default=None, help="Ruta al .env de backend")
args = parser.parse_args()

db_host = args.host
db_user = args.user
db_pass = args.password
db_name = args.database
db_port = args.port

# Intentar leer desde .env si no se especificaron
env_paths = [
    args.env_file,
    os.path.join(os.path.dirname(__file__), "minutas-backend", ".env"),
    os.path.join(os.path.dirname(__file__), ".env"),
    os.path.join(os.getcwd(), ".env"),
]

for p in env_paths:
    if p and os.path.isfile(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                content = f.read()
            m = re.search(r'DATABASE_URL\s*=\s*["\']?mysql://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?"\'\s]+)', content)
            if m:
                if not db_user: db_user = m.group(1)
                if not db_pass: db_pass = m.group(2)
                if not db_host: db_host = m.group(3)
                if not db_port and m.group(4): db_port = int(m.group(4))
                if not db_name: db_name = m.group(5)
                print(f"📌 Credenciales cargadas desde: {p}")
                break
        except Exception as e:
            pass

# Valores fallback por defecto
if not db_host: db_host = "localhost"
if not db_user: db_user = "root"
if not db_pass: db_pass = ""
if not db_name: db_name = "diseno"

OUTPUT_FILE = f"Control_General_Minutas_y_Tareas_Cuadra_{datetime.now().strftime('%Y%m%d')}.xlsx"

try:
    conn = pymysql.connect(
        host=db_host,
        user=db_user,
        password=db_pass,
        database=db_name,
        port=db_port or 3306,
        charset='utf8mb4'
    )
    print(f"🔌 Conectado exitosamente a MySQL ({db_host}:{db_port or 3306}) - BD: {db_name} con usuario: {db_user}")
except Exception as e:
    print(f"❌ Error conectando a MySQL: {e}")
    print("\n💡 Puedes ejecutarlo pasando las credenciales directamente, por ejemplo:")
    print("   python exportar_minutas_excel.py --user root --password tu_pass --database diseno")
    sys.exit(1)

# ── 1. CONSULTA DE TAREAS Y ACUERDOS (HUMAN-READABLE) ─────────────────────────
query_tareas = """
SELECT 
    DATE_FORMAT(COALESCE(m.fechaProgramada, m.fechaRealizada, m.createdAt), '%d/%m/%Y') AS `Fecha Junta`,
    m.titulo AS `Junta / Minuta`,
    m.departamento AS `Departamento`,
    t.area AS `Área Responsable`,
    COALESCE(t.linea, 'N/A') AS `Línea Producto`,
    t.clasificacion AS `Clasificación`,
    t.tipo AS `Tipo de Registro`,
    t.descripcion AS `Acuerdo o Tarea`,
    t.estado AS `Estatus Actual`,
    COALESCE(t.prioridad, 'MEDIA') AS `Prioridad`,
    DATE_FORMAT(t.fechaVencimiento, '%d/%m/%Y') AS `Fecha Límite`,
    COALESCE((
        SELECT GROUP_CONCAT(ur.nombre SEPARATOR ', ') 
        FROM tareaasignacion ta 
        JOIN usuario ur ON ta.usuarioId = ur.id 
        WHERE ta.tareaId = t.id
    ), 'Sin asignar') AS `Persona(s) Asignada(s)`,
    u.nombre AS `Registrado Por`,
    DATE_FORMAT(t.createdAt, '%d/%m/%Y %H:%i') AS `Fecha de Registro`
FROM tarea t
JOIN minuta m ON t.minutaId = m.id
LEFT JOIN usuario u ON t.creadoPorId = u.id

UNION ALL

SELECT 
    DATE_FORMAT(COALESCE(me.fechaProgramada, me.createdAt), '%d/%m/%Y') AS `Fecha Junta`,
    me.tema AS `Junta / Minuta`,
    'EXTERNO' AS `Departamento`,
    me.area AS `Área Responsable`,
    COALESCE(te.departamento, 'EXTERNO') AS `Línea Producto`,
    'SEGUIMIENTO EXTERNO' AS `Clasificación`,
    'TAREA' AS `Tipo de Registro`,
    te.descripcion AS `Acuerdo o Tarea`,
    te.estado AS `Estatus Actual`,
    COALESCE(te.prioridad, 'MEDIA') AS `Prioridad`,
    DATE_FORMAT(te.fechaVencimiento, '%d/%m/%Y') AS `Fecha Límite`,
    'Área Externa' AS `Persona(s) Asignada(s)`,
    u.nombre AS `Registrado Por`,
    DATE_FORMAT(te.createdAt, '%d/%m/%Y %H:%i') AS `Fecha de Registro`
FROM tareaexterna te
JOIN minutaexterna me ON te.minutaExternaId = me.id
LEFT JOIN usuario u ON te.creadoPorId = u.id

ORDER BY STR_TO_DATE(`Fecha Junta`, '%d/%m/%Y') DESC, `Junta / Minuta` ASC;
"""

# ── 2. CONSULTA DE JUNTAS / MINUTAS CON TOTALES RESUMIDOS ─────────────────────
query_minutas = """
SELECT 
    DATE_FORMAT(COALESCE(m.fechaProgramada, m.createdAt), '%d/%m/%Y') AS `Fecha Junta`,
    m.titulo AS `Título de la Junta`,
    m.departamento AS `Departamento`,
    COALESCE(m.lineaDefault, 'General') AS `Línea Principal`,
    m.estado AS `Estado Junta`,
    u.nombre AS `Líder / Creador`,
    COUNT(t.id) AS `Total Acuerdos`,
    SUM(CASE WHEN t.tipo = 'TAREA' AND t.estado = 'CERRADA' THEN 1 ELSE 0 END) AS `Completadas`,
    SUM(CASE WHEN t.tipo = 'TAREA' AND t.estado = 'PENDIENTE' THEN 1 ELSE 0 END) AS `Pendientes`,
    SUM(CASE WHEN t.tipo = 'TAREA' AND t.estado = 'EN_REVISION' THEN 1 ELSE 0 END) AS `En Revisión`,
    DATE_FORMAT(m.fechaRealizada, '%d/%m/%Y') AS `Fecha Realizada / Cierre`
FROM minuta m
LEFT JOIN usuario u ON m.creadoPorId = u.id
LEFT JOIN tarea t ON t.minutaId = m.id
GROUP BY m.id

UNION ALL

SELECT 
    DATE_FORMAT(COALESCE(me.fechaProgramada, me.createdAt), '%d/%m/%Y') AS `Fecha Junta`,
    me.tema AS `Título de la Junta`,
    'EXTERNO' AS `Departamento`,
    COALESCE(me.departamento, me.area) AS `Línea Principal`,
    me.estado AS `Estado Junta`,
    u.nombre AS `Líder / Creador`,
    COUNT(te.id) AS `Total Acuerdos`,
    SUM(CASE WHEN te.estado = 'CERRADA' THEN 1 ELSE 0 END) AS `Completadas`,
    SUM(CASE WHEN te.estado = 'PENDIENTE' THEN 1 ELSE 0 END) AS `Pendientes`,
    SUM(CASE WHEN te.estado = 'EN_REVISION' THEN 1 ELSE 0 END) AS `En Revisión`,
    DATE_FORMAT(me.cerradoAt, '%d/%m/%Y') AS `Fecha Realizada / Cierre`
FROM minutaexterna me
LEFT JOIN usuario u ON me.creadoPorId = u.id
LEFT JOIN tareaexterna te ON te.minutaExternaId = me.id
GROUP BY me.id

ORDER BY STR_TO_DATE(`Fecha Junta`, '%d/%m/%Y') DESC;
"""

# ── 3. CONSULTA DE NOTAS Y POST-ITS DE LA JUNTA ───────────────────────────────
query_notas = """
SELECT 
    DATE_FORMAT(m.fechaProgramada, '%d/%m/%Y') AS `Fecha Junta`,
    m.titulo AS `Minuta Asociada`,
    ng.contenido AS `Nota o Post-it`,
    u.nombre AS `Autor de la Nota`,
    DATE_FORMAT(ng.createdAt, '%d/%m/%Y %H:%i') AS `Fecha y Hora Captura`
FROM notageneral ng
JOIN minuta m ON ng.minutaId = m.id
LEFT JOIN usuario u ON ng.creadoPorId = u.id
ORDER BY ng.createdAt DESC;
"""

def run_query_to_df(query, connection):
    with connection.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        return pd.DataFrame(rows, columns=cols)

print("⏳ Extrayendo y estructurando los datos...")
df_tareas = run_query_to_df(query_tareas, conn)
df_minutas = run_query_to_df(query_minutas, conn)
df_notas = run_query_to_df(query_notas, conn)
conn.close()

# Añadir columna de porcentaje de avance en Minutas
def calc_porcentaje(row):
    try:
        completadas = float(row.get('Completadas') or 0)
        pendientes = float(row.get('Pendientes') or 0)
        revision = float(row.get('En Revisión') or 0)
        total = completadas + pendientes + revision
        if total == 0:
            return "100%" if str(row.get('Estado Junta')).upper() in ['CERRADA', 'CERRADO'] else "0%"
        pct = round((completadas / total) * 100)
        return f"{pct}%"
    except Exception:
        return "0%"

df_minutas['% Avance'] = df_minutas.apply(calc_porcentaje, axis=1)

# Reordenar columnas para que % Avance quede visible junto a los conteos
cols = list(df_minutas.columns)
cols.insert(10, cols.pop(cols.index('% Avance')))
df_minutas = df_minutas[cols]

# ── 4. ESTILIZADO PROFESIONAL DEL EXCEL CON OPENPYXL ──────────────────────────
print(f"📊 Creando libro de Excel con formato ejecutivo...")
wb = openpyxl.Workbook()
wb.remove(wb.active) # Quitar hoja default vacía

# Estilos ejecutivos Cuadra (Azul marino ejecutivo + gris perla)
color_header = "1F3864"       # Azul corporativo oscuro
color_header_txt = "FFFFFF"   # Blanco
color_zebra = "F8F9FA"        # Gris muy claro para filas alternas
font_header = Font(name="Segoe UI", size=10, bold=True, color=color_header_txt)
font_body = Font(name="Segoe UI", size=9)
font_bold = Font(name="Segoe UI", size=9, bold=True)
fill_header = PatternFill(start_color=color_header, end_color=color_header, fill_type="solid")
fill_zebra = PatternFill(start_color=color_zebra, end_color=color_zebra, fill_type="solid")

thin_border = Border(
    left=Side(style='thin', color='D9D9D9'),
    right=Side(style='thin', color='D9D9D9'),
    top=Side(style='thin', color='D9D9D9'),
    bottom=Side(style='thin', color='D9D9D9')
)

sheets_data = [
    ("TAREAS Y ACUERDOS", df_tareas),
    ("RESUMEN DE JUNTAS", df_minutas),
    ("POST-ITS Y NOTAS", df_notas),
]

for sheet_title, df in sheets_data:
    ws = wb.create_sheet(title=sheet_title)
    ws.views.sheetView[0].showGridLines = True
    
    # Escribir encabezados
    headers = list(df.columns)
    ws.append(headers)
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[1].height = 28

    # Escribir filas de datos
    for row_idx, row_data in enumerate(df.values, start=2):
        ws.append(list(row_data))
        use_zebra = (row_idx % 2 == 0)
        ws.row_dimensions[row_idx].height = 20
        
        for col_num in range(1, len(row_data) + 1):
            cell = ws.cell(row=row_idx, column=col_num)
            cell.font = font_body
            cell.border = thin_border
            if use_zebra:
                cell.fill = fill_zebra

            val = str(cell.value or '')
            
            # Formatos condicionales sutiles según estatus
            if val in ['CERRADA', 'COMPLETADO', 'ACTIVA', '100%']:
                cell.font = font_bold
            elif val in ['PENDIENTE', 'CRITICA']:
                cell.font = font_bold

    # Auto-ajustar ancho de columnas inteligentemente
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        adjusted_width = min(max(max_len + 3, 12), 65) # Mínimo 12, máximo 65
        ws.column_dimensions[col_letter].width = adjusted_width

wb.save(OUTPUT_FILE)
print(f"✅ ¡Archivo generado exitosamente!")
print(f"📁 Ruta: {os.path.abspath(OUTPUT_FILE)}")
print(f"📋 Resumen exportado:")
print(f"   • {len(df_minutas)} Minutas/Juntas analizadas")
print(f"   • {len(df_tareas)} Tareas y acuerdos individuales")
print(f"   • {len(df_notas)} Notas/post-its generales")
